/**
 * Audio player core shared by the three sites; each site builds its own UI on top of it.
 * Wraps one HTMLAudioElement: a queue of tracks with start/end bounds (story spans inside radio
 * episodes, trimmed blank tape: the audio file is never edited, playback is bounded instead),
 * Media Session (lock screen / headphone controls), resume positions in localStorage, and a sleep
 * timer. Framework-free; pass an element and a store.
 *
 * Persistence across page loads: kids/library use Astro's <ClientRouter /> and keep the element
 * hosting the player in a `transition:persist` island, so one Player instance lives for the visit.
 *
 * AI-improved sound (docs/design/ai-audio.md §2.5): a track may carry `clean_url`, an AI-cleaned
 * copy of the same length. With `preferClean` on, the player plays it instead of `url`; a toggle
 * swaps live at the same position, and a load error on the clean copy falls back to the original
 * silently (the error event is stopped before site handlers see it).
 */
import type { Store } from "./storage.ts";

export interface Track {
  /** Recording id (resume positions are per id + start). */
  id: string;
  title: string;
  /** The original audio. Stays the track's identity (setQueue compares it); never the clean copy. */
  url: string;
  /**
   * AI-cleaned copy of `url` (same duration, so start_sec/end_sec and resume positions apply
   * unchanged; keep any `#t=` media fragment that `url` has). Played only when preferClean is on.
   */
  clean_url?: string;
  /** Play this range of the file (seconds). Defaults: 0 and the end of the file. */
  start_sec?: number;
  end_sec?: number;
  artist?: string;
  album?: string;
  artwork?: string;
}

export interface PlayerState {
  queue: readonly Track[];
  index: number;
  playing: boolean;
  /** Position inside the current track's range (seconds from start_sec). */
  position: number;
  duration: number;
  sleepAt: number | null;
  /** Pause when the current track ends instead of advancing ("end of this story" sleep timer). */
  stopAtEnd: boolean;
  /** Which copy is actually loaded: "clean" only while the AI-cleaned copy plays; null with no track. */
  source: "original" | "clean" | null;
}

/** Minimal surface of HTMLAudioElement the player needs (a fake in tests). */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, fn: (e: Event) => void): void;
}

export interface PlayerOptions {
  audio: AudioLike;
  store?: Store;
  /** Save the position every N seconds of playback (default 5). */
  saveEverySec?: number;
  /** Positions this close to the end count as finished (default 15 s). */
  finishedWithinSec?: number;
  /** Resume this many seconds before the saved position (default 0). */
  resumeBackSec?: number;
  /**
   * Remember and restore a position per track (default true). A site that resumes from its own
   * snapshot (bedtime) passes false: every track then starts at its start_sec and no `pos:` keys
   * are written.
   */
  resumePositions?: boolean;
  mediaSession?: MediaSession | null;
  /**
   * Play each track's `clean_url` when it has one (default false). Sites pass the stored
   * preference: `preferClean: getAiAudio(store)`; later changes go through setPreferClean().
   */
  preferClean?: boolean;
}

/** Give up waiting for the swapped-in source after this long and clear isSwapping anyway. */
const SWAP_TIMEOUT_MS = 5000;

type Listener = (s: PlayerState) => void;

export class Player {
  private queue: Track[] = [];
  private index = -1;
  private listeners = new Set<Listener>();
  private lastSaved = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepAt: number | null = null;
  private stopAtEnd = false;
  private readonly audio: AudioLike;
  private readonly store: Store | undefined;
  private readonly saveEvery: number;
  private readonly finishedWithin: number;
  private readonly resumeBack: number;
  private readonly resumePositions: boolean;
  /** Index of the track just marked finished: its position must not be saved again. */
  private finishedIndex = -1;
  private readonly session: MediaSession | null;
  private preferClean: boolean;
  /** Ids whose clean copy failed to load this visit (not persisted). */
  private readonly failedClean = new Set<string>();
  /** The copy currently assigned to audio.src. */
  private loaded: "original" | "clean" | null = null;
  private swapping = false;
  private swapTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last known playback time (survives a failed load, where currentTime may be reset). */
  private lastTime = 0;
  /** We asked the element to play and no user pause has happened since. */
  private wantPlay = false;

  constructor(opts: PlayerOptions) {
    this.audio = opts.audio;
    this.store = opts.store;
    this.saveEvery = opts.saveEverySec ?? 5;
    this.finishedWithin = opts.finishedWithinSec ?? 15;
    this.resumeBack = opts.resumeBackSec ?? 0;
    this.resumePositions = opts.resumePositions ?? true;
    this.preferClean = opts.preferClean ?? false;
    this.session =
      opts.mediaSession ??
      (typeof navigator !== "undefined" && "mediaSession" in navigator
        ? navigator.mediaSession
        : null);
    this.audio.preload = "metadata";
    // Registered first, before any site listener, so a clean-copy failure can be stopped here.
    this.audio.addEventListener("error", (e) => this.onError(e));
    this.audio.addEventListener("timeupdate", () => this.onTime());
    this.audio.addEventListener("ended", () => void this.trackEnded());
    this.audio.addEventListener("play", () => this.emit());
    this.audio.addEventListener("pause", () => {
      if (this.swapping) return;
      this.wantPlay = false;
      this.savePosition();
      this.emit();
    });
    this.audio.addEventListener("playing", () => {
      if (this.swapping) this.endSwap();
    });
    this.audio.addEventListener("loadedmetadata", () => {
      if (this.swapping && !this.wantPlay) this.endSwap();
    });
    this.bindMediaSession();
  }

  get current(): Track | null {
    return this.queue[this.index] ?? null;
  }

  /** Which copy is playing: "clean" (AI-improved), "original", or null with no track. */
  get source(): "original" | "clean" | null {
    return this.current ? this.loaded : null;
  }

  /**
   * True while the source is being swapped (toggle or clean-copy fallback). Sites must ignore
   * pause/play/waiting events while it is true: no sleep-timer freeze, no "paused" UI, no watchdog.
   */
  get isSwapping(): boolean {
    return this.swapping;
  }

  /** Whether clean copies are preferred (the value passed to setPreferClean / preferClean). */
  get prefersClean(): boolean {
    return this.preferClean;
  }

  /**
   * Turn AI-improved sound on or off. If that changes the current track's source, it swaps live at
   * the same position and keeps the play/pause state. Does not store the preference: sites call
   * setAiAudio(store, on) as well.
   */
  setPreferClean(on: boolean): void {
    this.preferClean = on;
    const t = this.current;
    if (!t || this.loaded === null) {
      this.emit();
      return;
    }
    const want = this.kindFor(t);
    if (want === this.loaded) {
      this.emit();
      return;
    }
    this.swapTo(want === "clean" ? (t.clean_url as string) : t.url, want);
  }

  state(): PlayerState {
    const t = this.current;
    const start = t?.start_sec ?? 0;
    const end = t?.end_sec ?? (Number.isFinite(this.audio.duration) ? this.audio.duration : 0);
    return {
      queue: this.queue,
      index: this.index,
      playing: !this.audio.paused,
      position: Math.max(0, this.audio.currentTime - start),
      duration: Math.max(0, end - start),
      sleepAt: this.sleepAt,
      stopAtEnd: this.stopAtEnd,
      source: this.source,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  /** Replace the queue and start playing at `index` (resuming where the listener left off). */
  async load(queue: Track[], index = 0, autoplay = true): Promise<void> {
    this.queue = [...queue];
    await this.goTo(index, autoplay);
  }

  /**
   * Replace the queue without interrupting playback when `queue[index]` is the current track (same
   * id and range): for "play next", reordering and removing. Otherwise behaves like load().
   */
  async setQueue(queue: Track[], index: number): Promise<void> {
    const cur = this.current;
    const t = queue[index];
    if (
      cur &&
      t &&
      t.id === cur.id &&
      (t.start_sec ?? 0) === (cur.start_sec ?? 0) &&
      t.url === cur.url
    ) {
      this.queue = [...queue];
      this.index = index;
      this.emit();
      return;
    }
    await this.load(queue, index, !this.audio.paused);
  }

  /** "End of this story": pause when the current track ends instead of advancing (false cancels). */
  stopAfterCurrent(on: boolean): void {
    this.stopAtEnd = on;
    if (on) this.sleepIn(null);
    this.emit();
  }

  /** Add tracks to the end of the queue without interrupting the current one. */
  append(tracks: readonly Track[]): void {
    this.queue.push(...tracks);
    this.emit();
  }

  /** Remove the track at `index` from the queue (not the current one: use load/next for that). */
  removeAt(index: number): void {
    if (index === this.index || index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.index) this.index--;
    this.emit();
  }

  async goTo(index: number, autoplay = true): Promise<void> {
    const t = this.queue[index];
    if (!t) return;
    this.savePosition();
    this.index = index;
    this.finishedIndex = -1;
    this.endSwap();
    const kind = this.kindFor(t);
    const src = kind === "clean" ? (t.clean_url as string) : t.url;
    if (this.audio.src !== src) this.audio.src = src;
    this.loaded = kind;
    this.audio.currentTime = this.lastTime = this.resumePoint(t);
    this.updateMetadata();
    if (autoplay) {
      this.wantPlay = true;
      await this.audio.play().catch(() => undefined);
    }
    this.emit();
  }

  play(): Promise<void> {
    this.wantPlay = true;
    return this.audio.play().catch(() => undefined);
  }
  pause(): void {
    this.wantPlay = false;
    this.audio.pause();
  }
  toggle(): Promise<void> | void {
    return this.audio.paused ? this.play() : this.pause();
  }
  async next(): Promise<void> {
    this.markFinished();
    if (this.index + 1 < this.queue.length) await this.goTo(this.index + 1);
    else {
      this.audio.pause();
      this.emit();
    }
  }
  async previous(): Promise<void> {
    if (this.state().position > 5 || this.index === 0) this.seek(0);
    else await this.goTo(this.index - 1);
  }
  /** Seek inside the current track's range. */
  seek(positionSec: number): void {
    const t = this.current;
    if (!t) return;
    const start = t.start_sec ?? 0;
    const end = t.end_sec ?? Infinity;
    this.audio.currentTime = this.lastTime = Math.min(Math.max(start, start + positionSec), end);
    this.emit();
  }

  /** Pause after `minutes` (null cancels). Bedtime's "sleep timer". */
  sleepIn(minutes: number | null, now = Date.now()): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepAt = null;
    if (minutes !== null) {
      this.sleepAt = now + minutes * 60_000;
      this.stopAtEnd = false;
      this.sleepTimer = setTimeout(() => {
        this.pause();
        this.sleepAt = null;
        this.emit();
      }, minutes * 60_000);
    }
    this.emit();
  }

  private kindFor(t: Track): "original" | "clean" {
    return this.preferClean && t.clean_url && !this.failedClean.has(t.id) ? "clean" : "original";
  }

  /** Load another copy of the current track at the same position, keeping the play state. */
  private swapTo(src: string, kind: "original" | "clean", at = this.audio.currentTime): void {
    const wasPlaying = !this.audio.paused || this.wantPlay;
    this.savePosition();
    this.swapping = true;
    if (this.swapTimer) clearTimeout(this.swapTimer);
    this.swapTimer = setTimeout(() => this.endSwap(), SWAP_TIMEOUT_MS);
    this.audio.src = src;
    this.loaded = kind;
    this.audio.currentTime = this.lastTime = at;
    this.wantPlay = wasPlaying;
    if (wasPlaying) void this.audio.play().catch(() => undefined);
    this.emit();
  }

  private endSwap(): void {
    if (this.swapTimer) clearTimeout(this.swapTimer);
    this.swapTimer = null;
    if (!this.swapping) return;
    this.swapping = false;
    this.emit();
  }

  /** A clean copy that fails to load falls back to the original, silently (D7). */
  private onError(e: Event): void {
    const t = this.current;
    if (!t || this.loaded !== "clean") return;
    e.stopImmediatePropagation();
    this.failedClean.add(t.id);
    // After a failed load currentTime may read 0; lastTime is the position we were at or seeking to.
    const at = Math.max(this.audio.currentTime, this.lastTime);
    this.swapTo(t.url, "original", at);
  }

  private async trackEnded(): Promise<void> {
    if (this.stopAtEnd) {
      this.stopAtEnd = false;
      this.markFinished();
      this.audio.pause();
      this.emit();
      return;
    }
    await this.next();
  }

  private key(t: Track) {
    return `pos:${t.id}@${t.start_sec ?? 0}`;
  }

  private resumePoint(t: Track): number {
    const start = t.start_sec ?? 0;
    if (!this.resumePositions) return start;
    const saved = this.store?.get<number | null>(this.key(t), null);
    if (saved === null || saved === undefined) return start;
    const end = t.end_sec ?? Infinity;
    return saved > start && saved < end - this.finishedWithin
      ? Math.max(start, saved - this.resumeBack)
      : start;
  }

  /** Save the current position now (sites call this on pagehide so a reload resumes close by). */
  savePosition(): void {
    const t = this.current;
    if (!t || !this.store || !this.resumePositions || this.index === this.finishedIndex) return;
    if (this.swapping) return; // mid-swap currentTime may not be settled yet; the swap saved first
    this.store.set(this.key(t), this.audio.currentTime);
  }

  private markFinished() {
    const t = this.current;
    this.finishedIndex = this.index;
    if (t && this.store) this.store.remove(this.key(t));
  }

  private onTime() {
    const t = this.current;
    if (!t) return;
    if (this.swapping) return;
    this.lastTime = this.audio.currentTime;
    if (t.end_sec !== undefined && this.audio.currentTime >= t.end_sec) {
      // A paused player at its end never advances by itself: after "end of this story" pauses,
      // browsers fire one more timeupdate (and another on any seek), which must not start the next
      // track. Advancing again needs a user action (play, next).
      if (this.audio.paused) {
        this.emit();
        return;
      }
      void this.trackEnded();
      return;
    }
    if (Math.abs(this.audio.currentTime - this.lastSaved) >= this.saveEvery) {
      this.lastSaved = this.audio.currentTime;
      this.savePosition();
    }
    this.emit();
  }

  private updateMetadata() {
    const t = this.current;
    if (!this.session || !t || typeof MediaMetadata === "undefined") return;
    this.session.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist ?? "",
      album: t.album ?? "",
      artwork: t.artwork ? [{ src: t.artwork }] : [],
    });
  }

  private bindMediaSession() {
    const s = this.session;
    if (!s) return;
    const on = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
      try {
        s.setActionHandler(a, h);
      } catch {
        /* unsupported action */
      }
    };
    on("play", () => void this.play());
    on("pause", () => this.pause());
    on("nexttrack", () => void this.next());
    on("previoustrack", () => void this.previous());
    on("seekbackward", (d) => this.seek(this.state().position - (d.seekOffset ?? 15)));
    on("seekforward", (d) => this.seek(this.state().position + (d.seekOffset ?? 15)));
    on(
      "seekto",
      (d) => d.seekTime !== undefined && this.seek(d.seekTime - (this.current?.start_sec ?? 0)),
    );
  }

  private emit() {
    const s = this.state();
    for (const l of this.listeners) l(s);
  }
}

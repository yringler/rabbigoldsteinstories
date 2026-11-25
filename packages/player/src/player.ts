/**
 * Audio player core shared by the three sites; each site builds its own UI on top of it.
 * Wraps one HTMLAudioElement: a queue of tracks with start/end bounds (story spans inside radio
 * episodes, trimmed blank tape: the audio file is never edited, playback is bounded instead),
 * Media Session (lock screen / headphone controls), resume positions in localStorage, and a sleep
 * timer. Framework-free; pass an element and a store.
 *
 * Persistence across page loads: kids/library use Astro's <ClientRouter /> and keep the element
 * hosting the player in a `transition:persist` island, so one Player instance lives for the visit.
 */
import type { Store } from "./storage.ts";

export interface Track {
  /** Recording id (resume positions are per id + start). */
  id: string;
  title: string;
  url: string;
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
  addEventListener(type: string, fn: () => void): void;
}

export interface PlayerOptions {
  audio: AudioLike;
  store?: Store;
  /** Save the position every N seconds of playback (default 5). */
  saveEverySec?: number;
  /** Positions this close to the end count as finished (default 15 s). */
  finishedWithinSec?: number;
  mediaSession?: MediaSession | null;
}

type Listener = (s: PlayerState) => void;

export class Player {
  private queue: Track[] = [];
  private index = -1;
  private listeners = new Set<Listener>();
  private lastSaved = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepAt: number | null = null;
  private readonly audio: AudioLike;
  private readonly store: Store | undefined;
  private readonly saveEvery: number;
  private readonly finishedWithin: number;
  private readonly session: MediaSession | null;

  constructor(opts: PlayerOptions) {
    this.audio = opts.audio;
    this.store = opts.store;
    this.saveEvery = opts.saveEverySec ?? 5;
    this.finishedWithin = opts.finishedWithinSec ?? 15;
    this.session =
      opts.mediaSession ??
      (typeof navigator !== "undefined" && "mediaSession" in navigator
        ? navigator.mediaSession
        : null);
    this.audio.preload = "metadata";
    this.audio.addEventListener("timeupdate", () => this.onTime());
    this.audio.addEventListener("ended", () => this.next());
    this.audio.addEventListener("play", () => this.emit());
    this.audio.addEventListener("pause", () => {
      this.savePosition();
      this.emit();
    });
    this.bindMediaSession();
  }

  get current(): Track | null {
    return this.queue[this.index] ?? null;
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

  async goTo(index: number, autoplay = true): Promise<void> {
    const t = this.queue[index];
    if (!t) return;
    this.savePosition();
    this.index = index;
    if (this.audio.src !== t.url) this.audio.src = t.url;
    this.audio.currentTime = this.resumePoint(t);
    this.updateMetadata();
    if (autoplay) await this.audio.play().catch(() => undefined);
    this.emit();
  }

  play(): Promise<void> {
    return this.audio.play().catch(() => undefined);
  }
  pause(): void {
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
    this.audio.currentTime = Math.min(Math.max(start, start + positionSec), end);
    this.emit();
  }

  /** Pause after `minutes` (null cancels). Bedtime's "sleep timer". */
  sleepIn(minutes: number | null, now = Date.now()): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepAt = null;
    if (minutes !== null) {
      this.sleepAt = now + minutes * 60_000;
      this.sleepTimer = setTimeout(() => {
        this.pause();
        this.sleepAt = null;
        this.emit();
      }, minutes * 60_000);
    }
    this.emit();
  }

  private key(t: Track) {
    return `pos:${t.id}@${t.start_sec ?? 0}`;
  }

  private resumePoint(t: Track): number {
    const start = t.start_sec ?? 0;
    const saved = this.store?.get<number | null>(this.key(t), null);
    if (saved === null || saved === undefined) return start;
    const end = t.end_sec ?? Infinity;
    return saved > start && saved < end - this.finishedWithin ? saved : start;
  }

  private savePosition() {
    const t = this.current;
    if (!t || !this.store) return;
    this.store.set(this.key(t), this.audio.currentTime);
  }

  private markFinished() {
    const t = this.current;
    if (t && this.store) this.store.remove(this.key(t));
  }

  private onTime() {
    const t = this.current;
    if (!t) return;
    if (t.end_sec !== undefined && this.audio.currentTime >= t.end_sec) {
      void this.next();
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

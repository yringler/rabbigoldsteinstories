/**
 * The bedtime player: @goldstein/player's Player (queue of bounded tracks, per-track resume,
 * Media Session) plus the bedtime rules of docs/sites/bedtime.md §1:
 *   - one tap to audio: start() calls play() inside the tap;
 *   - autoplay next inside the playlist only; after the last track nothing else plays;
 *   - sleep timer: finish a story that ends within 4 min, else a 30 s fade where volume is
 *     writable, else (iOS) the next story boundary or 4 more minutes, with a hard pause;
 *   - a track that fails to load is skipped after 8 s; three failures in a row pause with a note;
 *   - a pinned snapshot of the playlist, written every 10 s and on pause/pagehide (resume);
 *   - Media Session: artwork, album "Quiet Night · tonight", ±15/30 s, position in the track;
 *   - one continuous HLS stream per playlist where the browser can play one (docs/design/hls.md):
 *     each story is a range of the stream, so a locked phone never has to start a new file. If
 *     the stream fails (no HLS support, no frame table, network), it falls back to story by
 *     story for the rest of the visit, at the same story and position.
 */
import {
  getAiAudio,
  loadHlsJs,
  pickStreamEngine,
  Player,
  StreamAudio,
  type StreamEngine,
  type Track,
} from "@goldstein/player";
import { hlsChapters, hlsUrl, type HlsItem, type Playlist } from "@goldstein/playlists";
import {
  FADE_SEC,
  parseTimer,
  SAVE_EVERY_MS,
  SESSION_KEY,
  sleepAction,
  TIMER_KEY,
  type Session,
  type TimerSetting,
} from "../lib/session.ts";
import { narratorLabel } from "../lib/ui.ts";
import { store } from "./store.ts";

export type Phase = "idle" | "loading" | "playing" | "paused" | "asleep" | "ended" | "error";

export interface BedtimeState {
  phase: Phase;
  playlist: Playlist | null;
  when: string;
  index: number;
  position: number;
  duration: number;
  timer: TimerSetting;
  /** When the timer fires (ms), or null (no timer, or it has fired). */
  sleepAt: number | null;
  /** Length of the running timer in ms (for the arc on the night screen). */
  sleepTotalMs: number | null;
  /** The timer has fired and playback stops at the end of this story. */
  stoppingAtBoundary: boolean;
  fading: boolean;
  message: string | null;
}

const SKIP_AFTER_MS = 8_000;
const MAX_FAILURES = 3;

function volumeIsWritable(): boolean {
  try {
    const a = new Audio();
    a.volume = 0.5;
    return Math.abs(a.volume - 0.5) < 0.01;
  } catch {
    return false;
  }
}

/** Remove per-track positions an earlier version stored (`goldstein:bedtime:pos:*`). */
function clearTrackPositions(): void {
  try {
    const ls = globalThis.localStorage;
    const stale: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k?.startsWith("goldstein:bedtime:pos:")) stale.push(k);
    }
    for (const k of stale) ls.removeItem(k);
  } catch {
    /* storage blocked */
  }
}

export class BedtimePlayer extends Player {
  readonly el: HTMLAudioElement;
  private playlist: Playlist | null = null;
  private when = "tonight";
  private phase: Phase = "idle";
  private message: string | null = null;
  private timer: TimerSetting = parseTimer(store.get<unknown>(TIMER_KEY, null));
  private sleepDeadline: number | null = null;
  /** Time left on the sleep timer while the listener has paused (the timer is frozen). */
  private pausedRemaining: number | null = null;
  /** The next pause is ours or the listener's, not the media fragment reaching end_sec. */
  private intentionalPause = false;
  /** The current track has started playing at least once (the 8 s load rule no longer applies). */
  private startedPlaying = false;
  private sleepTotal: number | null = null;
  private holdAtBoundary = false;
  private hardStopAt: number | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private trackStartedAt = 0;
  private failures = 0;
  private lastSave = 0;
  private lastPositionState = 0;
  private readonly volumeWritable = volumeIsWritable();
  private readonly watchers = new Set<(s: BedtimeState) => void>();
  private readonly stream: StreamAudio;
  private readonly engine: StreamEngine;
  /** The queue playing now is the HLS stream (else one file per story). */
  private streaming = false;
  /** A stream failed this visit: play story by story from now on. */
  private streamBroken = false;

  constructor(el: HTMLAudioElement) {
    const stream = new StreamAudio(el);
    // Bedtime resumes only from its session snapshot; per-track positions would make a story
    // start mid-way when a later playlist reaches it.
    super({
      audio: stream,
      store,
      saveEverySec: 5,
      resumePositions: false,
      // AI-improved sound (docs/design/ai-audio.md §3.1): off unless the listener turned it on.
      preferClean: getAiAudio(store),
    });
    this.el = el;
    this.stream = stream;
    this.engine = pickStreamEngine(el);
    if (this.engine === "hlsjs") void loadHlsJs().then((H) => stream.setHls(H));
    el.preload = "auto";
    clearTrackPositions();
    el.addEventListener("playing", () => {
      this.startedPlaying = true;
      this.failures = 0;
      this.clearWatchdog();
      this.setPhase("playing");
    });
    el.addEventListener("pause", () => {
      // A live source swap (AI-improved sound toggle or its fallback) pauses the element briefly:
      // not a real pause, so no "paused" phase and no sleep-timer freeze.
      if (this.isSwapping) return;
      const intentional = this.intentionalPause;
      this.intentionalPause = false;
      const t = this.current;
      // The #t=start,end media fragment pauses the element at end_sec: that is the track's end.
      // (A stream never pauses between stories.)
      if (
        !intentional &&
        !this.streaming &&
        t?.end_sec !== undefined &&
        el.currentTime >= t.end_sec - 0.6 &&
        (this.phase === "playing" || this.phase === "loading")
      ) {
        void this.next();
        return;
      }
      if (this.phase === "playing" || this.phase === "loading") this.setPhase("paused");
      this.save();
    });
    el.addEventListener("error", () => this.onTrackError());
    el.addEventListener("timeupdate", () => this.tick());
    el.addEventListener("waiting", () => {
      if (this.isSwapping) return;
      // Only a track that never started is skipped; a stall mid-story just waits.
      if (!el.paused && !this.startedPlaying) this.armWatchdog();
    });
    this.subscribe(() => this.notify());
    const ms =
      typeof navigator !== "undefined" && "mediaSession" in navigator
        ? navigator.mediaSession
        : null;
    if (ms) {
      const on = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
        try {
          ms.setActionHandler(a, h);
        } catch {
          /* unsupported action */
        }
      };
      on("play", () => void this.resume());
      on("pause", () => this.pauseNow());
      on("nexttrack", () => void this.skip(1));
      on("previoustrack", () => void this.skip(-1));
      on("seekbackward", (d) => this.nudge(-(d.seekOffset ?? 15)));
      on("seekforward", (d) => this.nudge(d.seekOffset ?? 30));
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => this.save());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.save();
      });
    }
  }

  // ---- public API used by the UI ----

  onChange(fn: (s: BedtimeState) => void): () => void {
    this.watchers.add(fn);
    fn(this.snapshot());
    return () => this.watchers.delete(fn);
  }

  snapshot(): BedtimeState {
    const s = this.state();
    return {
      phase: this.phase,
      playlist: this.playlist,
      when: this.when,
      index: s.index,
      position: s.position,
      duration: s.duration,
      timer: this.timer,
      sleepAt: this.sleepDeadline,
      sleepTotalMs: this.sleepTotal,
      stoppingAtBoundary: this.holdAtBoundary,
      fading: this.fadeTimer !== null,
      message: this.message,
    };
  }

  /**
   * Start a playlist (call inside the tap). `position` is seconds into the track at `index`.
   * The playlist object is the pinned snapshot: it is played as is until it ends or another
   * playlist is started.
   */
  async start(playlist: Playlist, when: string, index = 0, position = 0): Promise<void> {
    this.cancelFade();
    this.playlist = playlist;
    this.when = when;
    this.failures = 0;
    this.message = null;
    this.holdAtBoundary = false;
    this.hardStopAt = null;
    this.el.volume = 1;
    this.setPhase("loading");
    this.armTimer();
    this.startedPlaying = false;
    this.armWatchdog();
    this.trackStartedAt = Date.now();
    this.streaming = this.canStream();
    const p = this.load(this.toTracks(playlist), index, true);
    this.seek(position);
    this.startTicking();
    await p;
    this.save(true);
  }

  async resume(): Promise<void> {
    if (!this.playlist) return;
    this.cancelFade();
    this.el.volume = 1;
    this.message = null;
    if (this.phase === "ended") {
      await this.start(this.playlist, this.when, 0, 0);
      return;
    }
    if (this.pausedRemaining !== null && this.phase !== "asleep") {
      // Resume the frozen timer where it stopped.
      this.sleepDeadline = Date.now() + this.pausedRemaining;
      this.pausedRemaining = null;
    } else if (this.phase === "asleep" || this.sleepDeadline === null) this.armTimer();
    this.setPhase("loading");
    this.armWatchdog();
    this.startTicking();
    await this.play();
  }

  /** The listener pauses: the sleep timer freezes until play. */
  pauseNow(): void {
    this.cancelFade();
    this.el.volume = 1;
    this.holdAtBoundary = false;
    this.hardStopAt = null;
    if (this.sleepDeadline !== null) {
      this.pausedRemaining = Math.max(0, this.sleepDeadline - Date.now());
      this.sleepDeadline = null;
    }
    this.stopAudio();
  }

  async togglePlay(): Promise<void> {
    if (this.el.paused) await this.resume();
    else this.pauseNow();
  }

  /** User skip: next (+1) or previous (-1) story; clears a pending stop at the boundary. */
  async skip(dir: 1 | -1): Promise<void> {
    this.holdAtBoundary = false;
    this.hardStopAt = null;
    this.cancelFade();
    this.el.volume = 1;
    if (dir === -1) await this.previous();
    else await super.next();
    this.afterTrackChange();
  }

  async jumpTo(index: number): Promise<void> {
    this.holdAtBoundary = false;
    this.cancelFade();
    this.el.volume = 1;
    if (this.phase === "ended" || this.phase === "asleep") this.armTimer();
    this.setPhase("loading");
    await this.goTo(index, true);
    this.seek(0);
    this.afterTrackChange();
  }

  /** Seek relative to the current position (seconds). */
  nudge(deltaSec: number): void {
    this.seek(this.state().position + deltaSec);
  }

  setTimer(t: TimerSetting): void {
    this.timer = t;
    store.set(TIMER_KEY, t);
    this.holdAtBoundary = false;
    this.hardStopAt = null;
    this.cancelFade();
    this.el.volume = 1;
    this.armTimer();
    if (this.el.paused && this.sleepDeadline !== null) {
      // Chosen while paused: the timer starts when playback does.
      this.pausedRemaining = this.sleepDeadline - Date.now();
      this.sleepDeadline = null;
    }
    this.notify();
  }

  // ---- Player overrides ----

  /** Automatic advance (end of a track): honours the sleep timer and the end of the playlist. */
  override async next(): Promise<void> {
    const s = this.state();
    // A stream keeps playing: the playhead may be in any later story by now (a locked phone can
    // go minutes without a timeupdate). Follow it rather than seek back to the next story.
    const at = this.streaming ? this.trackAt(this.el.currentTime) : s.index + 1;
    if (this.streaming && at > s.index && !this.holdAtBoundary) {
      this.follow(at);
      this.afterTrackChange();
      return;
    }
    if (s.index + 1 >= s.queue.length || (this.streaming && at === -1)) {
      // The last story ended (with or without a pending timer stop): the playlist is over.
      if (this.streaming) this.follow(s.queue.length - 1);
      this.holdAtBoundary = false;
      this.hardStopAt = null;
      this.intentionalPause = true;
      await super.next();
      this.sleepDeadline = null;
      this.pausedRemaining = null;
      this.setPhase("ended");
      this.save(true, true);
      return;
    }
    if (this.holdAtBoundary) {
      this.holdAtBoundary = false;
      this.hardStopAt = null;
      await this.goTo(s.index + 1, false);
      this.stopAudio();
      this.seek(0); // a stream has already played a moment of the next story
      this.sleepDeadline = null;
      this.pausedRemaining = null;
      this.setPhase("asleep");
      this.save(true);
      return;
    }
    await super.next();
    this.afterTrackChange();
  }

  // ---- internals ----

  /** Whether the next start() should play one HLS stream (hls.js must have loaded, if needed). */
  private canStream(): boolean {
    if (this.streamBroken || typeof location === "undefined") return false;
    return this.engine === "native" || (this.engine === "hlsjs" && this.stream.hasHls);
  }

  private toTracks(p: Playlist): Track[] {
    // One stream for the whole playlist; each story is its range on the stream. The clean stream
    // has the same story times (within 13 ms), so the AI-sound toggle swaps at the same position.
    // The API mixes copies per story (the original where there is no clean copy), so the clean
    // stream is worth offering as soon as one story has a clean copy.
    const items: HlsItem[] = p.items.map((i) => ({
      id: i.id,
      start_sec: i.start_sec,
      end_sec: i.end_sec,
    }));
    const chapters = this.streaming ? hlsChapters(items) : [];
    const url = this.streaming ? hlsUrl(location.origin, items, "original") : "";
    const cleanUrl =
      this.streaming && p.items.some((i) => i.clean_audio_url)
        ? hlsUrl(location.origin, items, "clean")
        : null;
    return p.items.map((i, n) => {
      const artist = narratorLabel(i.narrator);
      const c = chapters[n];
      const range = c
        ? { url, ...(cleanUrl ? { clean_url: cleanUrl } : {}), start_sec: c.start, end_sec: c.end }
        : {
            // Media fragment (bedtime.md §1): the browser fetches from start_sec and stops at end_sec.
            url: `${i.audio_url}#t=${i.start_sec},${i.end_sec}`,
            // The AI-improved copy has the same duration, so the same fragment applies.
            ...(i.clean_audio_url
              ? { clean_url: `${i.clean_audio_url}#t=${i.start_sec},${i.end_sec}` }
              : {}),
            start_sec: i.start_sec,
            end_sec: i.end_sec,
          };
      return {
        id: i.id,
        title: i.title,
        ...range,
        ...(artist ? { artist } : {}),
        album: `${p.title} · ${this.when}`,
        artwork: `/icons/${p.type}-512.png`,
      };
    });
  }

  private afterTrackChange(): void {
    this.trackStartedAt = Date.now();
    // Within a stream that is already playing, a new story is no new load: no 'playing' event
    // follows, and a later stall must just wait rather than count as a failed load.
    if (this.streaming && this.startedPlaying && !this.el.paused) {
      this.save(true);
      this.notify();
      return;
    }
    this.startedPlaying = false;
    if (!this.el.paused || this.phase === "loading") this.armWatchdog();
    this.save(true);
    this.notify();
  }

  private armTimer(): void {
    this.pausedRemaining = null;
    if (this.timer === "end") {
      this.sleepDeadline = null;
      this.sleepTotal = null;
      return;
    }
    this.sleepTotal = this.timer * 60_000;
    this.sleepDeadline = Date.now() + this.sleepTotal;
  }

  private startTicking(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  /** Runs on timeupdate and once a second: sleep timer, hard stop, snapshot. */
  private tick(): void {
    const now = Date.now();
    if (this.el.paused && this.tickTimer && this.phase !== "loading") {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.sleepDeadline !== null && now >= this.sleepDeadline && !this.el.paused) {
      this.sleepDeadline = null;
      const s = this.state();
      const action = sleepAction(s.duration - s.position, this.volumeWritable);
      if (action.kind === "fade") this.fadeOut();
      else {
        this.holdAtBoundary = true;
        this.hardStopAt =
          action.hardStopAfterSec === null ? null : now + action.hardStopAfterSec * 1000;
      }
      this.notify();
    }
    if (this.hardStopAt !== null && now >= this.hardStopAt && !this.el.paused) {
      this.hardStopAt = null;
      this.holdAtBoundary = false;
      this.stopAudio();
      this.setPhase("asleep");
    }
    if (!this.el.paused && now - this.lastSave >= SAVE_EVERY_MS) this.save();
    if (!this.el.paused) this.positionState();
  }

  private fadeOut(): void {
    this.cancelFade();
    const start = Date.now();
    const v0 = this.el.volume || 1;
    this.fadeTimer = setInterval(() => {
      const f = Math.min(1, (Date.now() - start) / (FADE_SEC * 1000));
      this.el.volume = Math.max(0, v0 * (1 - f));
      if (f >= 1) {
        this.cancelFade();
        this.stopAudio();
        this.el.volume = 1;
        this.setPhase("asleep");
        this.save(true);
      }
    }, 200);
    this.notify();
  }

  private cancelFade(): void {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    if (this.isSwapping) return;
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      if (this.isSwapping) return;
      if (this.el.paused && this.phase !== "loading") return;
      if (this.el.readyState >= 3 && !this.el.paused) return;
      this.onTrackError();
    }, SKIP_AFTER_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  /**
   * The stream failed: same story and position, one file per story from now on. The story is the
   * one under the playhead, not the current index: on a locked phone the index can lag by several
   * stories (no timeupdate). After hls.js gives up, the element's time reads 0; the stream adapter
   * kept the real one.
   */
  private fallbackToFiles(): void {
    if (!this.playlist) return;
    const s = this.state();
    const t = this.stream.lastStreamTime ?? this.el.currentTime;
    let index = this.trackAt(t);
    if (index < 0)
      index = t >= (s.queue.at(-1)?.end_sec ?? Infinity) ? s.queue.length - 1 : s.index;
    index = Math.max(0, index);
    const track = s.queue[index];
    const start = track?.start_sec ?? 0;
    const position = Math.min(Math.max(0, t - start), (track?.end_sec ?? Infinity) - start);
    const wasPlaying = !this.el.paused || this.phase === "loading" || this.phase === "playing";
    this.streamBroken = true;
    this.streaming = false;
    this.clearWatchdog();
    this.trackStartedAt = Date.now();
    this.startedPlaying = false;
    if (wasPlaying) {
      this.setPhase("loading");
      this.armWatchdog();
    }
    // A source change pauses the element without a 'pause' event, so nothing else may consume
    // intentionalPause: it covers only a pause fired during the load, and is cleared after it.
    // Left set, it would make the file's end-of-fragment pause look intentional (no advance).
    this.intentionalPause = true;
    void this.load(this.toTracks(this.playlist), index, wasPlaying).then(() => {
      this.intentionalPause = false;
      this.seek(position);
      this.save(true);
    });
    this.seek(position);
  }

  private onTrackError(): void {
    if (!this.playlist || this.phase === "error") return;
    if (this.streaming) {
      this.fallbackToFiles();
      return;
    }
    const wait = Math.max(0, this.trackStartedAt + SKIP_AFTER_MS - Date.now());
    const index = this.state().index;
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      if (this.state().index !== index) return;
      this.failures++;
      if (this.failures >= MAX_FAILURES) {
        this.stopAudio();
        this.message = "Can't reach the stories right now.";
        this.setPhase("error");
        return;
      }
      // A pending "stop after this story" still applies: the failed story counts as ended.
      if (this.holdAtBoundary || index + 1 >= this.state().queue.length) void this.next();
      else if (index + 1 < this.state().queue.length) void this.skip(1);
      else {
        this.stopAudio();
        this.setPhase("ended");
        this.save(true, true);
      }
    }, wait);
  }

  /** Pause without it counting as the end of a track. */
  private stopAudio(): void {
    if (!this.el.paused) this.intentionalPause = true;
    this.pause();
  }

  private positionState(): void {
    const now = Date.now();
    if (now - this.lastPositionState < 1000) return;
    this.lastPositionState = now;
    const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
    const s = this.state();
    if (!ms?.setPositionState || !(s.duration > 0)) return;
    try {
      ms.setPositionState({
        duration: s.duration,
        position: Math.min(s.duration, Math.max(0, s.position)),
        playbackRate: 1,
      });
    } catch {
      /* ignore */
    }
  }

  private save(force = false, finished = false): void {
    if (!this.playlist) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 1000) return;
    this.lastSave = now;
    const s = this.state();
    const session: Session = {
      v: 1,
      playlist: this.playlist,
      when: this.when,
      index: Math.max(0, s.index),
      position: s.position,
      updated_at: now,
      finished: finished || this.phase === "ended",
    };
    store.set(SESSION_KEY, session);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    if (p !== "error") this.message = p === "playing" ? null : this.message;
    this.notify();
  }

  private notify(): void {
    if (!this.watchers) return; // called from the base constructor before fields exist
    const s = this.snapshot();
    for (const l of this.watchers) l(s);
  }
}

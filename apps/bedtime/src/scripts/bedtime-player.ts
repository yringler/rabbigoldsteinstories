/**
 * The bedtime player: @goldstein/player's Player (queue of bounded tracks, per-track resume,
 * Media Session) plus the bedtime rules of docs/sites/bedtime.md §1:
 *   - one tap to audio: start() calls play() inside the tap;
 *   - autoplay next inside the playlist only; after the last track nothing else plays;
 *   - sleep timer: finish a story that ends within 4 min, else a 30 s fade where volume is
 *     writable, else (iOS) the next story boundary or 4 more minutes, with a hard pause;
 *   - a track that fails to load is skipped after 8 s; three failures in a row pause with a note;
 *   - a pinned snapshot of the playlist, written every 10 s and on pause/pagehide (resume);
 *   - Media Session: artwork, album "Quiet Night · tonight", ±15/30 s, position in the track.
 */
import { getAiAudio, Player, type Track } from "@goldstein/player";
import type { Playlist } from "@goldstein/playlists";
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

  constructor(el: HTMLAudioElement) {
    // Bedtime resumes only from its session snapshot; per-track positions would make a story
    // start mid-way when a later playlist reaches it.
    super({
      audio: el,
      store,
      saveEverySec: 5,
      resumePositions: false,
      // AI-improved sound (docs/design/ai-audio.md §3.1): off unless the listener turned it on.
      preferClean: getAiAudio(store),
    });
    this.el = el;
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
      if (
        !intentional &&
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
    if (s.index + 1 >= s.queue.length) {
      // The last story ended (with or without a pending timer stop): the playlist is over.
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

  private toTracks(p: Playlist): Track[] {
    return p.items.map((i) => {
      const artist = narratorLabel(i.narrator);
      return {
        id: i.id,
        title: i.title,
        // Media fragment (bedtime.md §1): the browser fetches from start_sec and stops at end_sec.
        url: `${i.audio_url}#t=${i.start_sec},${i.end_sec}`,
        // The AI-improved copy has the same duration, so the same fragment applies.
        ...(i.clean_audio_url
          ? { clean_url: `${i.clean_audio_url}#t=${i.start_sec},${i.end_sec}` }
          : {}),
        start_sec: i.start_sec,
        end_sec: i.end_sec,
        ...(artist ? { artist } : {}),
        album: `${p.title} · ${this.when}`,
        artwork: `/icons/${p.type}-512.png`,
      };
    });
  }

  private afterTrackChange(): void {
    this.trackStartedAt = Date.now();
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

  private onTrackError(): void {
    if (!this.playlist || this.phase === "error") return;
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

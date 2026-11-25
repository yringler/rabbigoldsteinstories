/**
 * Resume snapshot and sleep-timer rules (docs/sites/bedtime.md §1 "Behaviour decisions"). Pure
 * functions; the player and pages call them. Stored through createStore("bedtime") as
 * `goldstein:bedtime:session.v1` (the spec's `bedtime.session.v1`, namespaced per ARCHITECTURE §8).
 */
import type { Playlist } from "@goldstein/playlists";

export const SESSION_KEY = "session.v1";
export const TIMER_KEY = "timer.v1";
export const WAKE_KEY = "wake.v1";
export const EDITION_CACHE_KEY = "edition.v1";

/** "Continue" is offered for this long after the last write. */
export const CONTINUE_MS = 18 * 3_600_000;
/** Resuming rewinds this much. */
export const RESUME_REWIND_SEC = 10;
/** Snapshot write interval while playing. */
export const SAVE_EVERY_MS = 10_000;

export interface Session {
  v: 1;
  /** Full snapshot of the playlist being played: a rotation cannot change it mid-listen. */
  playlist: Playlist;
  /** "tonight" or the night label for an earlier playlist (Media Session album, Continue row). */
  when: string;
  index: number;
  /** Seconds into the current track (relative to its start_sec). */
  position: number;
  updated_at: number;
  /** The playlist played to its end. */
  finished: boolean;
}

export function isSession(x: unknown): x is Session {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<Session>;
  return (
    s.v === 1 &&
    typeof s.index === "number" &&
    typeof s.position === "number" &&
    typeof s.updated_at === "number" &&
    !!s.playlist &&
    Array.isArray(s.playlist.items)
  );
}

/** The session to offer as "Continue", or null (none, finished, stale or broken). */
export function continuable(x: unknown, now: number): Session | null {
  if (!isSession(x) || x.finished) return null;
  if (now - x.updated_at > CONTINUE_MS || now < x.updated_at - 60_000) return null;
  if (!x.playlist.items[x.index]) return null;
  return x;
}

/** Whether the last session ended less than 18 hours ago ("That was the end. Good night."). */
export function endedRecently(x: unknown, now: number): boolean {
  return isSession(x) && x.finished && now - x.updated_at <= CONTINUE_MS;
}

export type TimerSetting = 15 | 30 | 45 | 60 | "end";
export const TIMER_CHOICES: readonly TimerSetting[] = [15, 30, 45, 60, "end"];
export const DEFAULT_TIMER: TimerSetting = 45;

export function parseTimer(x: unknown): TimerSetting {
  return TIMER_CHOICES.includes(x as TimerSetting) ? (x as TimerSetting) : DEFAULT_TIMER;
}

/** Let the story finish if it ends within this long of the timer. */
export const FINISH_WITHIN_SEC = 4 * 60;
/** Volume ramp length where audio.volume is writable. */
export const FADE_SEC = 30;

export type SleepAction =
  /** Pause at the end of the current track (story boundary). */
  | { kind: "boundary"; hardStopAfterSec: number | null }
  /** Fade out over FADE_SEC, then pause. */
  | { kind: "fade" };

/**
 * What to do when the timer fires (§1): if the story ends within 4 minutes, let it finish; else
 * fade over 30 s and pause. Where volume is read-only (iOS), stop at the next boundary or after
 * 4 more minutes, whichever is first; never a fake fade.
 */
export function sleepAction(remainingInTrackSec: number, volumeWritable: boolean): SleepAction {
  if (remainingInTrackSec <= FINISH_WITHIN_SEC) return { kind: "boundary", hardStopAfterSec: null };
  if (volumeWritable) return { kind: "fade" };
  return { kind: "boundary", hardStopAfterSec: FINISH_WITHIN_SEC };
}

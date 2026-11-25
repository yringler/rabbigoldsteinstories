/**
 * BedtimePlayer rules with a fake audio element and fake timers (no browser): per-track resume
 * off, the sleep timer freezing while paused, the 8 s load rule, stop-after-this-story, the end.
 */
import type { Playlist, PlaylistItem } from "@goldstein/playlists";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BedtimePlayer } from "../src/scripts/bedtime-player.ts";
import { SESSION_KEY, type Session } from "../src/lib/session.ts";
import { store } from "../src/scripts/store.ts";

class FakeAudio {
  src = "";
  currentTime = 0;
  duration = 1800;
  paused = true;
  preload = "";
  volume = 1;
  readyState = 4;
  private handlers = new Map<string, (() => void)[]>();
  play(): Promise<void> {
    this.paused = false;
    this.fire("play");
    return Promise.resolve();
  }
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.fire("pause");
  }
  addEventListener(type: string, fn: () => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  fire(type: string): void {
    for (const h of this.handlers.get(type) ?? []) h();
  }
  /** The browser starts playing (first `playing` event). */
  started(): void {
    this.fire("playing");
  }
  /** Play time passes. */
  at(t: number): void {
    this.currentTime = t;
    this.fire("timeupdate");
  }
}

const item = (id: string, start: number, end: number): PlaylistItem => ({
  id,
  unit: `${id}@${start}`,
  title: `Story ${id}`,
  narrator: "Uncle Yossi",
  audio_url: `https://media.example/${id}.mp3`,
  mime_type: "audio/mpeg",
  start_sec: start,
  end_sec: end,
  duration_sec: end - start,
  age_min: 4,
  band: "calm",
  advisories: [],
  block: null,
});
const playlist = (...items: PlaylistItem[]): Playlist => ({
  id: `2026-11-25/${items.map((i) => i.id).join("")}`,
  type: "calm",
  title: "Quiet Night",
  subtitle: "Soft, slow stories for drifting off.",
  total_min: 30,
  age_min: 4,
  items,
});
const A = item("aaaaaaaaaa", 100, 700);
const B = item("bbbbbbbbbb", 50, 650);
const C = item("cccccccccc", 0, 600);

let audio: FakeAudio;
let player: BedtimePlayer;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-25T23:00:00Z") });
  store.remove(SESSION_KEY);
  audio = new FakeAudio();
  player = new BedtimePlayer(audio as unknown as HTMLAudioElement);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("BedtimePlayer", () => {
  it("starts every story at its start, even one paused mid-way earlier (finding 1)", async () => {
    await player.start(playlist(A, B), "tonight");
    audio.started();
    await player.skip(1); // at B
    audio.started();
    audio.at(B.start_sec + 240); // listen 4 min into B, pause there…
    player.pauseNow(); // (the next night another playlist is started)
    // A later playlist reaches B by auto-advance: B must start at its start, not at 4:00.
    await player.start(playlist(C, B), "tonight");
    audio.started();
    audio.at(C.end_sec);
    await flush();
    expect(player.snapshot().index).toBe(1);
    expect(audio.currentTime).toBe(B.start_sec);
  });

  it("plays each track through a #t=start,end media fragment and advances when it pauses at the end", async () => {
    await player.start(playlist(A, B), "tonight");
    audio.started();
    expect(audio.src).toBe(`${A.audio_url}#t=${A.start_sec},${A.end_sec}`);
    audio.currentTime = A.end_sec - 0.2;
    audio.pause(); // the browser stops at the fragment's end
    await flush();
    expect(player.snapshot().index).toBe(1);
  });

  it("freezes the sleep timer while paused and resumes it where it stopped (finding 2)", async () => {
    await player.start(playlist(A, B), "tonight");
    audio.started();
    player.setTimer(15);
    vi.advanceTimersByTime(5 * 60_000);
    player.pauseNow();
    vi.advanceTimersByTime(20 * 60_000); // the parent comforts the child
    await player.resume();
    audio.started();
    vi.advanceTimersByTime(2000);
    const s = player.snapshot();
    expect(s.fading).toBe(false);
    expect(s.stoppingAtBoundary).toBe(false);
    expect(Math.round((s.sleepAt! - Date.now()) / 60_000)).toBe(10);
  });

  it("does not skip a story that stalls after it started; skips one that never starts (finding 7)", async () => {
    await player.start(playlist(A, B, C), "tonight");
    audio.started();
    audio.fire("waiting"); // mid-story buffering
    vi.advanceTimersByTime(10_000);
    expect(player.snapshot().index).toBe(0);

    audio.readyState = 0; // B never loads…
    await player.skip(1); // …and never fires `playing`
    vi.advanceTimersByTime(8_100);
    await flush();
    expect(player.snapshot().index).toBe(2);
  });

  it("keeps 'stop after this story' when the story fails to load (finding 7)", async () => {
    await player.start(playlist(A, B, C), "tonight");
    audio.started();
    player.setTimer(15);
    audio.at(A.end_sec - 120);
    vi.advanceTimersByTime(15 * 60_000 + 1000); // timer fires with 2 min left: finish this story
    expect(player.snapshot().stoppingAtBoundary).toBe(true);
    audio.fire("error");
    vi.advanceTimersByTime(8_100);
    await flush();
    expect(audio.paused).toBe(true);
    expect(player.snapshot().phase).toBe("asleep");
  });

  it("a timer stop on the last story ends the playlist (finding 8)", async () => {
    await player.start(playlist(A, B), "tonight", 1);
    audio.started();
    player.setTimer(15);
    audio.at(B.end_sec - 60);
    vi.advanceTimersByTime(15 * 60_000 + 1000);
    expect(player.snapshot().stoppingAtBoundary).toBe(true);
    audio.at(B.end_sec);
    await flush();
    expect(player.snapshot().phase).toBe("ended");
    expect(store.get<Session | null>(SESSION_KEY, null)?.finished).toBe(true);
  });
});

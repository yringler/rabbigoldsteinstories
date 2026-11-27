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

/** An element that can play HLS natively (Safari): the player streams the whole playlist. */
class FakeHlsAudio extends FakeAudio {
  canPlayType(type: string): string {
    return type === "application/vnd.apple.mpegurl" ? "maybe" : "";
  }
  removeAttribute(): void {
    this.src = "";
  }
  dispatchEvent(e: Event): boolean {
    this.fire(e.type);
    return true;
  }
}

describe("BedtimePlayer as one HLS stream (docs/design/hls.md)", () => {
  const origin = "https://bedtime.example";
  let el: FakeHlsAudio;
  beforeEach(() => {
    vi.stubGlobal("location", { origin });
    el = new FakeHlsAudio();
    player = new BedtimePlayer(el as unknown as HTMLAudioElement);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays the playlist from one stream; a story change is no change of source and no seek", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    expect(el.src).toBe(
      `${origin}/playlists/hls.m3u8?v=o&i=aaaaaaaaaa~100~700_bbbbbbbbbb~50~650_cccccccccc~0~600`,
    );
    expect(el.currentTime).toBe(0);
    const src = el.src;
    el.at(600.1); // A is 600 s long: B starts at 600 on the stream
    await flush();
    expect(player.snapshot().index).toBe(1);
    expect(el.src).toBe(src);
    expect(el.currentTime).toBe(600.1); // kept playing, not seeked back to 600
    expect(player.snapshot().position).toBeCloseTo(0.1);
  });

  it("follows the playhead across several stories at once (a locked phone skipped timeupdates)", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(1250); // A and B both finished while the page was asleep
    await flush();
    expect(player.snapshot().index).toBe(2);
    expect(el.currentTime).toBe(1250);
    expect(player.snapshot().phase).toBe("playing");
  });

  it("next and previous are seeks on the stream", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    const src = el.src;
    await player.skip(1);
    expect(el.src).toBe(src);
    expect(el.currentTime).toBe(600);
    await player.skip(1);
    expect(el.currentTime).toBe(1200);
    await player.skip(-1);
    expect(el.currentTime).toBe(600);
  });

  it("a pause near a story's end is a pause, not the end of the story", async () => {
    await player.start(playlist(A, B), "tonight");
    el.started();
    el.at(599.8);
    player.pauseNow();
    await flush();
    expect(player.snapshot().index).toBe(0);
    expect(player.snapshot().phase).toBe("paused");
  });

  it("ends after the last story", async () => {
    await player.start(playlist(A, B), "tonight");
    el.started();
    el.at(1200.05);
    await flush();
    expect(player.snapshot().phase).toBe("ended");
  });

  it("falls back to one file per story, at the same story and position, when the stream fails", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(600 + 42); // 42 s into B
    el.fire("error");
    await flush();
    expect(el.src).toBe(`${B.audio_url}#t=${B.start_sec},${B.end_sec}`);
    expect(el.currentTime).toBe(B.start_sec + 42);
    expect(player.snapshot().index).toBe(1);
    // For the rest of the visit, a new start plays files too.
    await player.start(playlist(C), "tonight");
    expect(el.src).toBe(`${C.audio_url}#t=${C.start_sec},${C.end_sec}`);
  });

  it("swaps to the AI-improved stream at the same position", async () => {
    const withClean = (i: PlaylistItem): PlaylistItem => ({
      ...i,
      clean_audio_url: i.audio_url.replace("/media.example/", "/media.example/clean/"),
    });
    await player.start(playlist(withClean(A), withClean(B)), "tonight");
    el.started();
    el.at(700);
    player.setPreferClean(true);
    expect(el.src).toContain("/playlists/hls.m3u8?v=c&");
    expect(el.currentTime).toBe(700);
  });
});

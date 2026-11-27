/**
 * BedtimePlayer rules with a fake audio element and fake timers (no browser): per-track resume
 * off, the sleep timer freezing while paused, the 8 s load rule, stop-after-this-story, the end.
 */
import type { StreamAudio } from "@goldstein/player";
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
  ended = false;
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

/**
 * Just enough of hls.js for StreamAudio: events, and destroy() detaching the media the way the real
 * one does (the element's time drops to 0).
 */
class FakeHls {
  static Events = { MANIFEST_PARSED: "hlsManifestParsed", ERROR: "hlsError" };
  static ErrorTypes = { MEDIA_ERROR: "mediaError", NETWORK_ERROR: "networkError" };
  static ErrorDetails = {
    MANIFEST_LOAD_ERROR: "manifestLoadError",
    MANIFEST_LOAD_TIMEOUT: "manifestLoadTimeOut",
    MANIFEST_PARSING_ERROR: "manifestParsingError",
    LEVEL_LOAD_ERROR: "levelLoadError",
    LEVEL_LOAD_TIMEOUT: "levelLoadTimeOut",
    FRAG_LOAD_ERROR: "fragLoadError",
    BUFFER_APPEND_ERROR: "bufferAppendError",
  };
  static last: FakeHls | null = null;
  private handlers = new Map<string, ((e: string, d: unknown) => void)[]>();
  private media: FakeHlsAudio | null = null;
  constructor() {
    FakeHls.last = this;
  }
  on(e: string, fn: (e: string, d: unknown) => void): void {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), fn]);
  }
  emit(e: string, d: unknown = {}): void {
    for (const h of this.handlers.get(e) ?? []) h(e, d);
  }
  attachMedia(el: FakeHlsAudio): void {
    this.media = el;
  }
  loadSource(): void {
    this.emit(FakeHls.Events.MANIFEST_PARSED);
  }
  startLoad(): void {}
  /** Detaches and reattaches the media, like the real one: the element's time reads 0. */
  recoverMediaError(): void {
    if (this.media) this.media.currentTime = 0;
  }
  destroy(): void {
    if (this.media) this.media.currentTime = 0;
    this.media = null;
  }
  /** A network failure hls.js can't recover from (StreamAudio retries once). */
  failForGood(): void {
    for (let i = 0; i < 2; i++) this.fatal("networkError", FakeHls.ErrorDetails.FRAG_LOAD_ERROR);
  }
  fatal(type: "mediaError" | "networkError", details: string): void {
    this.emit(FakeHls.Events.ERROR, { fatal: true, type, details });
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

  it("names each item's unit in the stream URL when it isn't the story's own", async () => {
    await player.start(playlist(A, { ...B, unit: "set:two-tellings" }), "tonight");
    expect(el.src).toBe(
      `${origin}/playlists/hls.m3u8?v=o&i=aaaaaaaaaa~100~700_bbbbbbbbbb~50~650~set:two-tellings`,
    );
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

  it("after a fallback, a file's end-of-fragment pause advances to the next story", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(600 + 42);
    el.fire("error"); // the element errors without pausing
    await flush();
    el.started();
    el.currentTime = B.end_sec - 0.2;
    el.pause(); // the #t= fragment ends
    await flush();
    expect(player.snapshot().index).toBe(2);
    expect(el.src).toBe(`${C.audio_url}#t=${C.start_sec},${C.end_sec}`);
  });

  it("falls back at the stream's real position when hls.js gives up (it resets currentTime)", async () => {
    const stream = (player as unknown as { stream: StreamAudio }).stream;
    stream.setHls(FakeHls as unknown as Parameters<StreamAudio["setHls"]>[0]);
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(600 + 42);
    FakeHls.last!.failForGood();
    await flush();
    expect(el.src).toBe(`${B.audio_url}#t=${B.start_sec},${B.end_sec}`);
    expect(el.currentTime).toBe(B.start_sec + 42);
    expect(player.snapshot().index).toBe(1);
  });

  it("falls back to the story under the playhead, not a lagging index", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.currentTime = 1250; // locked phone: no timeupdate since story A
    expect(player.snapshot().index).toBe(0);
    el.fire("error");
    await flush();
    expect(el.src).toBe(`${C.audio_url}#t=${C.start_sec},${C.end_sec}`);
    expect(el.currentTime).toBe(C.start_sec + 50);
    expect(player.snapshot().index).toBe(2);
  });

  it("a stall after the stream moved into the next story just waits", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    const src = el.src;
    el.at(600.1); // into B: no new 'playing' event on the same stream
    await flush();
    expect(player.snapshot().index).toBe(1);
    el.readyState = 0;
    el.fire("waiting"); // buffering mid-stream
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(el.src).toBe(src);
    expect(player.snapshot().index).toBe(1);
  });

  it("offers the AI-improved stream when only some stories have a clean copy", async () => {
    const a = {
      ...A,
      clean_audio_url: A.audio_url.replace("/media.example/", "/media.example/clean/"),
    };
    await player.start(playlist(a, B), "tonight");
    el.started();
    player.setPreferClean(true);
    expect(el.src).toContain("/playlists/hls.m3u8?v=c&");
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
  it("ends the playlist when the stream ends while the story index lags (no timeupdates)", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    // Locked phone: no timeupdate since A. The stream (chapters rounded to frames) ends just short
    // of C's chapter end, so trackAt still finds C there.
    el.duration = 1799.98;
    el.currentTime = 1799.98;
    el.paused = true;
    el.ended = true;
    el.fire("pause");
    el.fire("ended");
    await flush();
    const s = player.snapshot();
    expect(s.phase).toBe("ended");
    expect(s.index).toBe(2);
    expect(store.get<Session | null>(SESSION_KEY, null)?.finished).toBe(true);
  });

  it("jumping to a story within a playing stream shows it playing (no 'playing' event follows)", async () => {
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(100);
    await player.jumpTo(2);
    expect(el.currentTime).toBe(1200);
    expect(player.snapshot().phase).toBe("playing");
    await player.resume(); // the lock screen's play, while playing
    expect(player.snapshot().phase).toBe("playing");
  });

  const withFakeHls = () => {
    const stream = (player as unknown as { stream: StreamAudio }).stream;
    stream.setHls(FakeHls as unknown as Parameters<StreamAudio["setHls"]>[0]);
  };

  it("after a media recovery reset the time, a second failure falls back at the real position", async () => {
    withFakeHls();
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(600 + 42);
    FakeHls.last!.fatal("mediaError", FakeHls.ErrorDetails.BUFFER_APPEND_ERROR); // time reads 0
    FakeHls.last!.fatal("mediaError", FakeHls.ErrorDetails.BUFFER_APPEND_ERROR);
    await flush();
    expect(el.src).toBe(`${B.audio_url}#t=${B.start_sec},${B.end_sec}`);
    expect(el.currentTime).toBe(B.start_sec + 42);
    expect(player.snapshot().index).toBe(1);
  });

  it("a stream whose playlist fails to load (404) falls back at once, without the 8 s wait", async () => {
    withFakeHls();
    await player.start(playlist(A, B, C), "tonight");
    FakeHls.last!.fatal("networkError", FakeHls.ErrorDetails.MANIFEST_LOAD_ERROR);
    await flush();
    expect(el.src).toBe(`${A.audio_url}#t=${A.start_sec},${A.end_sec}`);
    expect(player.snapshot().phase).toBe("loading");
  });

  it("an element error while hls.js is attached is left to hls.js to recover", async () => {
    withFakeHls();
    await player.start(playlist(A, B, C), "tonight");
    el.started();
    el.at(600 + 42);
    const src = el.src;
    el.fire("error"); // an MSE decode error: StreamAudio recovers the media
    await flush();
    expect(el.src).toBe(src);
    expect(player.snapshot().phase).toBe("playing");
  });
});

/**
 * On a throttled locked phone the stream plays on while the page gets no timeupdate: the story
 * index can lag the playhead by several stories. Every user action and bookkeeping step must use
 * the story under the playhead.
 */
describe("BedtimePlayer: a story index that lags the stream's playhead", () => {
  const handlers = new Map<string, MediaSessionActionHandler>();
  const stories = [1, 2, 3, 4, 5, 6, 7].map((n) => item(String(n).repeat(10), 0, 600));
  let el: FakeHlsAudio;
  beforeEach(async () => {
    handlers.clear();
    vi.stubGlobal("location", { origin: "https://bedtime.example" });
    vi.stubGlobal("navigator", {
      mediaSession: {
        metadata: null,
        setActionHandler: (a: MediaSessionAction, h: MediaSessionActionHandler) =>
          void handlers.set(a, h),
      },
    });
    el = new FakeHlsAudio();
    player = new BedtimePlayer(el as unknown as HTMLAudioElement);
    await player.start(playlist(...stories), "tonight");
    el.started();
    el.at(2 * 600 + 10); // story 2 (each story is 600 s on the stream)
    await flush();
    expect(player.snapshot().index).toBe(2);
    el.currentTime = 5 * 600 + 100; // locked: story 5 plays, no timeupdate since story 2
  });
  afterEach(() => vi.unstubAllGlobals());

  it("the lock screen's next goes to the story after the playhead's, not after the index", async () => {
    handlers.get("nexttrack")!({ action: "nexttrack" });
    await flush();
    expect(player.snapshot().index).toBe(6);
    expect(el.currentTime).toBe(6 * 600);
  });

  it("the lock screen's previous restarts the playhead's story", async () => {
    handlers.get("previoustrack")!({ action: "previoustrack" });
    await flush();
    expect(player.snapshot().index).toBe(5);
    expect(el.currentTime).toBe(5 * 600);
  });

  it("seekforward and seekto are relative to the playhead's story", () => {
    handlers.get("seekforward")!({ action: "seekforward", seekOffset: 30 });
    expect(player.snapshot().index).toBe(5);
    expect(el.currentTime).toBe(5 * 600 + 130);
    handlers.get("seekto")!({ action: "seekto", seekTime: 0 }); // (index now in sync)
    expect(el.currentTime).toBe(5 * 600);
    el.currentTime = 6 * 600 + 50; // lags again
    handlers.get("seekto")!({ action: "seekto", seekTime: 200 });
    expect(player.snapshot().index).toBe(6);
    expect(el.currentTime).toBe(6 * 600 + 200);
  });

  it("saves the playhead's story and the position inside it", () => {
    // As on pagehide or the page being hidden (a locked phone's save).
    (player as unknown as { save(force: boolean): void }).save(true);
    const s = store.get<Session | null>(SESSION_KEY, null);
    expect(s?.index).toBe(5);
    expect(s?.position).toBe(100);
  });

  it("the sleep timer decides from the playhead's story", () => {
    player.setTimer(15);
    vi.advanceTimersByTime(15 * 60_000 + 1000);
    // 500 s left in story 5 (not "past the end" of story 2): stop at its end, or after 4 min.
    expect(player.snapshot().stoppingAtBoundary).toBe(true);
    expect(player.snapshot().index).toBe(5);
    vi.advanceTimersByTime(4 * 60_000 + 1000);
    expect(el.paused).toBe(true);
    expect(player.snapshot().phase).toBe("asleep");
  });

  it("a timer stop past its boundary stops at the playhead's story, not the one after the index", async () => {
    el.currentTime = 2 * 600 + 500;
    player.setTimer(15);
    vi.advanceTimersByTime(15 * 60_000 + 1000); // 100 s left in story 2: stop at its end
    expect(player.snapshot().stoppingAtBoundary).toBe(true);
    el.at(5 * 600 + 100); // locked: the stream played on into story 5
    await flush();
    expect(player.snapshot().phase).toBe("asleep");
    expect(player.snapshot().index).toBe(5);
    expect(el.currentTime).toBe(5 * 600);
  });
});

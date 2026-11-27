import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_AUDIO_KEY,
  Player,
  createStore,
  getAiAudio,
  setAiAudio,
  type AudioLike,
  type Track,
} from "../src/index.ts";

class FakeAudio implements AudioLike {
  currentTime = 0;
  duration = 1800;
  paused = true;
  preload = "";
  /** Every src assignment (a real element reloads on each). */
  loads: string[] = [];
  private _src = "";
  private handlers = new Map<string, ((e: Event) => void)[]>();
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    this.loads.push(v);
    this.paused = true; // the load algorithm pauses without firing "pause"
  }
  async play() {
    this.paused = false;
    this.fire("play");
  }
  pause() {
    this.paused = true;
    this.fire("pause");
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  /** Dispatch like an EventTarget: stopImmediatePropagation() skips the remaining listeners. */
  fire(type: string): { stopped: boolean } {
    let stopped = false;
    const e = { type, stopImmediatePropagation: () => void (stopped = true) } as unknown as Event;
    for (const h of this.handlers.get(type) ?? []) {
      h(e);
      if (stopped) break;
    }
    return { stopped };
  }
}

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
};

const tracks = [
  { id: "aaaaaaaaaa", title: "Span", url: "https://m/a.mp3", start_sec: 100, end_sec: 400 },
  { id: "bbbbbbbbbb", title: "Whole", url: "https://m/b.mp3" },
];

describe("Player", () => {
  afterEach(() => void vi.useRealTimers());
  it("plays a track's range and advances at end_sec", async () => {
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: null });
    await p.load(tracks);
    expect(audio.currentTime).toBe(100);
    expect(p.state().duration).toBe(300);
    audio.currentTime = 400;
    audio.fire("timeupdate");
    await Promise.resolve();
    expect(p.current?.id).toBe("bbbbbbbbbb");
  });

  it("resumes where the listener stopped, per track", async () => {
    const store = createStore("test", memoryStorage());
    const a = new FakeAudio();
    const p = new Player({ audio: a, store, mediaSession: null });
    await p.load(tracks);
    a.currentTime = 250;
    a.pause();
    const b = new FakeAudio();
    await new Player({ audio: b, store, mediaSession: null }).load(tracks);
    expect(b.currentTime).toBe(250);
  });

  it("appends to and removes from the queue without interrupting the current track", async () => {
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: null });
    await p.load([tracks[1]!]);
    p.append([tracks[0]!, tracks[1]!]);
    expect(p.state().queue.length).toBe(3);
    expect(p.current?.id).toBe("bbbbbbbbbb");
    p.removeAt(0); // the current track: ignored
    p.removeAt(1);
    expect(p.state().queue.map((t) => t.id)).toEqual(["bbbbbbbbbb", "bbbbbbbbbb"]);
    expect(p.state().index).toBe(0);
  });

  it("does not re-save a finished track's position when advancing", async () => {
    const storage = memoryStorage();
    const store = createStore("test", storage);
    const a = new FakeAudio();
    const p = new Player({ audio: a, store, mediaSession: null });
    await p.load(tracks);
    a.currentTime = 250;
    await p.next(); // user skip mid-track
    expect(storage.getItem("goldstein:test:pos:aaaaaaaaaa@100")).toBeNull();
    await p.goTo(0);
    expect(a.currentTime).toBe(100);
  });

  it("resumePositions: false never stores or restores per-track positions", async () => {
    const storage = memoryStorage();
    const store = createStore("test", storage);
    const a = new FakeAudio();
    const p = new Player({ audio: a, store, mediaSession: null, resumePositions: false });
    await p.load(tracks);
    a.currentTime = 250;
    a.pause();
    expect(storage.length).toBe(0);
    await p.goTo(1);
    await p.goTo(0);
    expect(a.currentTime).toBe(100);
  });

  it("lock-screen seekto is a position inside the track, like the position state sites report", async () => {
    const handlers = new Map<string, MediaSessionActionHandler>();
    const session = {
      metadata: null,
      setActionHandler: (a: MediaSessionAction, h: MediaSessionActionHandler) =>
        void handlers.set(a, h),
    } as unknown as MediaSession;
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: session });
    await p.load(tracks); // a span: 100..400 of its file
    handlers.get("seekto")!({ action: "seekto", seekTime: 60 });
    expect(audio.currentTime).toBe(160);
    expect(p.state().position).toBe(60);
  });

  it("reports a track-relative position state itself, so seekto lands right with no site code (library)", async () => {
    const handlers = new Map<string, MediaSessionActionHandler>();
    const reported: MediaPositionState[] = [];
    const session = {
      metadata: null,
      setActionHandler: (a: MediaSessionAction, h: MediaSessionActionHandler) =>
        void handlers.set(a, h),
      setPositionState: (s: MediaPositionState) => void reported.push(s),
    } as unknown as MediaSession;
    vi.useFakeTimers();
    const audio = new FakeAudio();
    // Like apps/library: the element itself, no position state of the site's own.
    const p = new Player({ audio, mediaSession: session });
    await p.load([
      { id: "aaaaaaaaaa", title: "Span", url: "https://m/a.mp3", start_sec: 1200, end_sec: 1800 },
    ]);
    audio.currentTime = 1500;
    vi.setSystemTime(Date.now() + 5000); // 5 s later: past the throttle
    audio.fire("timeupdate");
    // Without a position state the browser reports the element's own time (1500).
    const last = reported.at(-1);
    expect(last).toMatchObject({ duration: 600, position: 300 });
    handlers.get("seekto")!({ action: "seekto", seekTime: last?.position ?? audio.currentTime });
    expect(audio.currentTime).toBe(1500);
    expect(p.state().position).toBe(300);
  });

  it("position state: throttled while playing, at once on a seek or track change; missing API is fine", async () => {
    const reported: MediaPositionState[] = [];
    const session = {
      metadata: null,
      setActionHandler: () => undefined,
      setPositionState: (s: MediaPositionState) => void reported.push(s),
    } as unknown as MediaSession;
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: session });
    await p.load(tracks);
    const n = reported.length;
    expect(n).toBeGreaterThan(0);
    audio.currentTime = 101;
    audio.fire("timeupdate");
    audio.currentTime = 102;
    audio.fire("timeupdate");
    expect(reported.length).toBe(n); // within a second of the last report
    p.seek(200);
    expect(reported.at(-1)).toMatchObject({ duration: 300, position: 200, playbackRate: 1 });
    // A session without setPositionState (older browsers): no throw.
    const bare = new Player({
      audio: new FakeAudio(),
      mediaSession: {
        metadata: null,
        setActionHandler: () => undefined,
      } as unknown as MediaSession,
    });
    await bare.load(tracks);
    bare.seek(10);
  });

  it("sleep timer pauses playback", async () => {
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: null });
    await p.load(tracks);
    p.sleepIn(0);
    await new Promise((r) => setTimeout(r, 5));
    expect(audio.paused).toBe(true);
  });
});

describe("Player additions (kids site)", () => {
  it("stopAfterCurrent pauses at end_sec instead of advancing", async () => {
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: null });
    await p.load(tracks);
    p.stopAfterCurrent(true);
    expect(p.state().stopAtEnd).toBe(true);
    audio.currentTime = 400;
    audio.fire("timeupdate");
    await Promise.resolve();
    expect(p.current?.id).toBe("aaaaaaaaaa");
    expect(audio.paused).toBe(true);
    expect(p.state().stopAtEnd).toBe(false);
  });

  it("stopAfterCurrent: later timeupdates at the end never advance (Chromium fires another)", async () => {
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: null });
    await p.load(tracks);
    p.stopAfterCurrent(true);
    audio.currentTime = 400;
    audio.fire("timeupdate");
    await Promise.resolve();
    audio.fire("timeupdate");
    audio.currentTime = 401;
    audio.fire("timeupdate");
    await Promise.resolve();
    expect(p.current?.id).toBe("aaaaaaaaaa");
    expect(audio.paused).toBe(true);
    // Playing on from the end is a user action: it advances.
    await audio.play();
    audio.fire("timeupdate");
    await Promise.resolve();
    expect(p.current?.id).toBe("bbbbbbbbbb");
  });

  it("setQueue keeps the current track playing", async () => {
    const audio = new FakeAudio();
    const p = new Player({ audio, mediaSession: null });
    await p.load([tracks[0]!]);
    audio.currentTime = 200;
    await p.setQueue([tracks[0]!, tracks[1]!], 0);
    expect(audio.currentTime).toBe(200);
    expect(p.state().queue).toHaveLength(2);
  });

  it("resumes resumeBackSec before the saved position", async () => {
    const store = createStore("test", memoryStorage());
    const a = new FakeAudio();
    await new Player({ audio: a, store, mediaSession: null }).load(tracks);
    a.currentTime = 250;
    a.pause();
    const b = new FakeAudio();
    await new Player({ audio: b, store, mediaSession: null, resumeBackSec: 3 }).load(tracks);
    expect(b.currentTime).toBe(247);
  });
});

describe("AI-improved sound (docs/design/ai-audio.md §2.5)", () => {
  const clean: Track[] = [
    {
      id: "aaaaaaaaaa",
      title: "Span",
      url: "https://m/goldstein/audio/a.mp3#t=100,400",
      clean_url: "https://m/goldstein/audio_clean/a.mp3#t=100,400",
      start_sec: 100,
      end_sec: 400,
    },
    { id: "bbbbbbbbbb", title: "No clean copy", url: "https://m/goldstein/audio/b.mp3" },
  ];

  it("goTo plays the clean copy only when preferred and present", async () => {
    const off = new FakeAudio();
    const p0 = new Player({ audio: off, mediaSession: null });
    await p0.load(clean);
    expect(off.src).toBe(clean[0]!.url);
    expect(p0.source).toBe("original");

    const on = new FakeAudio();
    const p1 = new Player({ audio: on, mediaSession: null, preferClean: true });
    expect(p1.source).toBeNull();
    await p1.load(clean);
    expect(on.src).toBe(clean[0]!.clean_url);
    expect(p1.source).toBe("clean");
    expect(p1.state().source).toBe("clean");
    await p1.goTo(1);
    expect(on.src).toBe(clean[1]!.url);
    expect(p1.source).toBe("original");
  });

  it("setPreferClean swaps live at the same position, keeps play state, writes no pos: key", async () => {
    const storage = memoryStorage();
    const store = createStore("test", storage);
    const a = new FakeAudio();
    const p = new Player({ audio: a, store, mediaSession: null, resumePositions: false });
    await p.load(clean);
    a.currentTime = 250;
    const states: (string | null)[] = [];
    p.subscribe((s) => states.push(s.source));
    p.setPreferClean(true);
    expect(a.src).toBe(clean[0]!.clean_url);
    expect(a.currentTime).toBe(250);
    expect(a.paused).toBe(false);
    expect(p.isSwapping).toBe(true);
    a.fire("playing");
    expect(p.isSwapping).toBe(false);
    expect(states.at(-1)).toBe("clean");

    a.pause();
    a.currentTime = 260;
    p.setPreferClean(false);
    expect(a.src).toBe(clean[0]!.url);
    expect(a.currentTime).toBe(260);
    expect(a.paused).toBe(true);
    a.fire("loadedmetadata");
    expect(p.isSwapping).toBe(false);
    expect(storage.length).toBe(0);
  });

  it("a swap keeps the resume position key (pos:<id>@<start>) on the same value", async () => {
    const storage = memoryStorage();
    const store = createStore("test", storage);
    const a = new FakeAudio();
    const p = new Player({ audio: a, store, mediaSession: null });
    await p.load(clean);
    a.currentTime = 250;
    p.setPreferClean(true);
    a.fire("pause"); // transient events during the swap must not save a stale position
    a.currentTime = 0;
    a.fire("timeupdate");
    expect(store.get("pos:aaaaaaaaaa@100", null)).toBe(250);
    expect([...Array(storage.length).keys()].map((i) => storage.key(i))).toEqual([
      "goldstein:test:pos:aaaaaaaaaa@100",
    ]);
  });

  it("setPreferClean on a track without a clean copy does not reload", async () => {
    const a = new FakeAudio();
    const p = new Player({ audio: a, mediaSession: null });
    await p.load([clean[1]!]);
    const n = a.loads.length;
    p.setPreferClean(true);
    expect(a.loads.length).toBe(n);
    expect(p.source).toBe("original");
    expect(p.isSwapping).toBe(false);
  });

  it("an error on the clean copy falls back once, silently, at the same position", async () => {
    const a = new FakeAudio();
    const p = new Player({ audio: a, mediaSession: null, preferClean: true });
    let siteSaw = 0;
    a.addEventListener("error", () => siteSaw++);
    await p.load(clean);
    a.currentTime = 300;
    a.fire("timeupdate");
    a.currentTime = 0; // a failed load may reset currentTime
    const r = a.fire("error");
    expect(r.stopped).toBe(true);
    expect(siteSaw).toBe(0);
    expect(a.src).toBe(clean[0]!.url);
    expect(a.currentTime).toBe(300);
    expect(a.paused).toBe(false);
    expect(p.source).toBe("original");
    // The id stays on the original for the visit, even when toggled again or revisited.
    p.setPreferClean(false);
    p.setPreferClean(true);
    expect(a.src).toBe(clean[0]!.url);
    await p.goTo(1);
    await p.goTo(0);
    expect(a.src).toBe(clean[0]!.url);
  });

  it("ignores element errors while the source handles them (hls.js recovering)", async () => {
    const a = new (class extends FakeAudio {
      handlesErrors = true;
    })();
    const p = new Player({ audio: a, mediaSession: null, preferClean: true });
    let siteSaw = 0;
    a.addEventListener("error", () => siteSaw++);
    await p.load(clean);
    const r = a.fire("error");
    expect(r.stopped).toBe(false);
    expect(a.src).toBe(clean[0]!.clean_url);
    expect(p.source).toBe("clean");
    // It gives up: the error that reports it is handled as usual (fall back to the original).
    a.handlesErrors = false;
    expect(a.fire("error").stopped).toBe(true);
    expect(a.src).toBe(clean[0]!.url);
    expect(siteSaw).toBe(1); // the site sees the first and must ignore it by handlesErrors itself
  });

  it("a failed clean stream is not loaded again by the next track sharing its clean_url", async () => {
    // A stream: every track is a range of the same source and the same clean source.
    const stream = (id: string, start: number, end: number): Track => ({
      id,
      title: id,
      url: "https://s/hls.m3u8?v=o",
      clean_url: "https://s/hls.m3u8?v=c",
      start_sec: start,
      end_sec: end,
    });
    const a = new FakeAudio();
    const p = new Player({ audio: a, mediaSession: null, preferClean: true });
    await p.load([stream("aaaaaaaaaa", 0, 600), stream("bbbbbbbbbb", 600, 1200)]);
    expect(a.src).toBe("https://s/hls.m3u8?v=c");
    a.fire("error");
    expect(a.src).toBe("https://s/hls.m3u8?v=o");
    const n = a.loads.length;
    await p.goTo(1);
    expect(a.src).toBe("https://s/hls.m3u8?v=o");
    expect(a.loads.length).toBe(n); // same source: no reload
    expect(p.source).toBe("original");
  });

  it("a failed clean stream doesn't block a story's own clean file after a fallback to files", async () => {
    const stream = (id: string, start: number, end: number): Track => ({
      id,
      title: id,
      url: "https://s/hls.m3u8?v=o",
      clean_url: "https://s/hls.m3u8?v=c",
      start_sec: start,
      end_sec: end,
    });
    const a = new FakeAudio();
    const p = new Player({ audio: a, mediaSession: null, preferClean: true });
    // One story is enough: a stream is shared by nature, even when the playlist has one story.
    await p.load([stream("aaaaaaaaaa", 0, 600)]);
    a.fire("error"); // the clean stream fails
    expect(a.src).toBe("https://s/hls.m3u8?v=o");
    // The site falls back to one file per story: the story's own clean file still plays.
    await p.load([
      {
        id: "aaaaaaaaaa",
        title: "a",
        url: "https://m/a.mp3#t=0,600",
        clean_url: "https://m/clean/a.mp3#t=0,600",
        start_sec: 0,
        end_sec: 600,
      },
    ]);
    expect(a.src).toBe("https://m/clean/a.mp3#t=0,600");
    expect(p.source).toBe("clean");
  });

  it("an error on the original reaches the site handlers", async () => {
    const a = new FakeAudio();
    const p = new Player({ audio: a, mediaSession: null, preferClean: true });
    let siteSaw = 0;
    a.addEventListener("error", () => siteSaw++);
    await p.load([clean[1]!]);
    expect(a.fire("error").stopped).toBe(false);
    expect(siteSaw).toBe(1);
  });

  it("setQueue with the same tracks does not reload after a swap", async () => {
    const a = new FakeAudio();
    const p = new Player({ audio: a, mediaSession: null });
    await p.load(clean);
    a.currentTime = 200;
    p.setPreferClean(true);
    a.fire("playing");
    const n = a.loads.length;
    await p.setQueue([...clean], 0);
    expect(a.loads.length).toBe(n);
    expect(a.src).toBe(clean[0]!.clean_url);
    expect(a.currentTime).toBe(200);
  });

  it("the preference helpers use one key per site store, default off", () => {
    const mem = memoryStorage();
    const bedtime = createStore("bedtime", mem);
    expect(getAiAudio(bedtime)).toBe(false);
    setAiAudio(bedtime, true);
    expect(getAiAudio(bedtime)).toBe(true);
    expect(mem.getItem(`goldstein:bedtime:${AI_AUDIO_KEY}`)).toBe('{"v":true}');
    expect(getAiAudio(createStore("kids", mem))).toBe(false);
    expect(getAiAudio(createStore("library", null))).toBe(false);
  });
});

describe("createStore", () => {
  it("namespaces keys and survives a missing backend", () => {
    const s = createStore("kids", null);
    s.set("favourites", ["a"]);
    expect(s.get("favourites", [])).toEqual(["a"]);
    const mem = memoryStorage();
    createStore("library", mem).set("playlists", [1]);
    expect(mem.getItem("goldstein:library:playlists")).toBe('{"v":[1]}');
  });
});

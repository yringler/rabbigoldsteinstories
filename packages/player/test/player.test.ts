import { describe, expect, it } from "vitest";
import { Player, createStore, type AudioLike } from "../src/index.ts";

class FakeAudio implements AudioLike {
  src = "";
  currentTime = 0;
  duration = 1800;
  paused = true;
  preload = "";
  private handlers = new Map<string, (() => void)[]>();
  async play() {
    this.paused = false;
    this.fire("play");
  }
  pause() {
    this.paused = true;
    this.fire("pause");
  }
  addEventListener(type: string, fn: () => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  fire(type: string) {
    for (const h of this.handlers.get(type) ?? []) h();
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

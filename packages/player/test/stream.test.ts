/**
 * StreamAudio's error handling with a fake hls.js (no browser): what counts as recoverable, the
 * time it reports after giving up, and that element errors are left to hls.js while it is attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamAudio } from "../src/index.ts";

/** An <audio> element: real events (EventTarget), a settable time, no media. */
class FakeElement extends EventTarget {
  src = "";
  currentTime = 0;
  duration = NaN;
  paused = true;
  preload = "";
  removeAttribute(): void {
    this.src = "";
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  /** Play time passes. */
  at(t: number): void {
    this.currentTime = t;
    this.dispatchEvent(new Event("timeupdate"));
  }
}

/** Just enough of hls.js: events, and the media resets real hls.js does to the element's time. */
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
  static last: FakeHls;
  media: FakeElement | null = null;
  startLoads: number[] = [];
  mediaRecoveries = 0;
  private handlers = new Map<string, ((e: string, d: unknown) => void)[]>();
  constructor() {
    FakeHls.last = this;
  }
  on(e: string, fn: (e: string, d: unknown) => void): void {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), fn]);
  }
  emit(e: string, d: unknown = {}): void {
    for (const h of this.handlers.get(e) ?? []) h(e, d);
  }
  attachMedia(el: FakeElement): void {
    this.media = el;
  }
  loadSource(): void {
    this.emit(FakeHls.Events.MANIFEST_PARSED);
  }
  startLoad(at: number): void {
    this.startLoads.push(at);
  }
  /** Real hls.js detaches and reattaches the media: the element's time reads 0 for a while. */
  recoverMediaError(): void {
    this.mediaRecoveries++;
    if (this.media) this.media.currentTime = 0;
  }
  destroy(): void {
    if (this.media) this.media.currentTime = 0;
    this.media = null;
  }
  fatal(type: "mediaError" | "networkError", details: string): void {
    this.emit(FakeHls.Events.ERROR, { fatal: true, type, details });
  }
}

const STREAM = "https://bedtime.example/playlists/hls.m3u8?v=o&i=aaaaaaaaaa~0~600";
let el: FakeElement;
let audio: StreamAudio;
let errors: number;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-25T23:00:00Z") });
  el = new FakeElement();
  audio = new StreamAudio(
    el as unknown as HTMLAudioElement,
    FakeHls as unknown as ConstructorParameters<typeof StreamAudio>[1],
  );
  errors = 0;
  // A site listener, added after the StreamAudio (as the Player and bedtime do).
  el.addEventListener("error", () => {
    if (!audio.handlesErrors) errors++;
  });
  audio.src = STREAM;
  audio.currentTime = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("StreamAudio", () => {
  it("after a media recovery reset the time, a second failure reports the last good time", () => {
    el.at(642);
    FakeHls.last.fatal("mediaError", FakeHls.ErrorDetails.BUFFER_APPEND_ERROR);
    expect(FakeHls.last.mediaRecoveries).toBe(1);
    expect(el.currentTime).toBe(0); // reattached, not yet restored
    FakeHls.last.fatal("mediaError", FakeHls.ErrorDetails.BUFFER_APPEND_ERROR);
    expect(errors).toBe(1);
    expect(audio.streamFailed).toBe(true);
    expect(audio.lastStreamTime).toBe(642);
  });

  it("a seek is a good time too, even to 0", () => {
    el.at(300);
    audio.currentTime = 0;
    FakeHls.last.fatal("mediaError", FakeHls.ErrorDetails.BUFFER_APPEND_ERROR);
    FakeHls.last.fatal("mediaError", FakeHls.ErrorDetails.BUFFER_APPEND_ERROR);
    expect(audio.lastStreamTime).toBe(0);
  });

  it("a playlist that fails to load fails at once, with no recovery", () => {
    for (const details of [
      FakeHls.ErrorDetails.MANIFEST_LOAD_ERROR,
      FakeHls.ErrorDetails.MANIFEST_LOAD_TIMEOUT,
      FakeHls.ErrorDetails.MANIFEST_PARSING_ERROR,
      FakeHls.ErrorDetails.LEVEL_LOAD_ERROR,
      FakeHls.ErrorDetails.LEVEL_LOAD_TIMEOUT,
    ]) {
      audio.src = STREAM;
      const h = FakeHls.last;
      const before = errors;
      h.fatal("networkError", details);
      expect(errors).toBe(before + 1);
      expect(h.startLoads).toEqual([-1]); // only the first load after the manifest
      expect(audio.streamFailed).toBe(true);
    }
  });

  it("a fragment network error recovers once by reloading at the playhead", () => {
    el.at(120);
    FakeHls.last.fatal("networkError", FakeHls.ErrorDetails.FRAG_LOAD_ERROR);
    expect(errors).toBe(0);
    expect(FakeHls.last.startLoads.at(-1)).toBe(120);
    FakeHls.last.fatal("networkError", FakeHls.ErrorDetails.FRAG_LOAD_ERROR);
    expect(errors).toBe(1);
  });

  it("recovers again from a later failure once playback has continued after a recovery", () => {
    const h = FakeHls.last;
    el.at(120);
    h.fatal("networkError", FakeHls.ErrorDetails.FRAG_LOAD_ERROR);
    for (let t = 120; t <= 160; t += 0.25) el.at(t); // it plays on
    h.fatal("networkError", FakeHls.ErrorDetails.FRAG_LOAD_ERROR); // hours later, another blip
    expect(errors).toBe(0);
    expect(h.startLoads.at(-1)).toBe(160);
    expect(audio.streamFailed).toBe(false);
    // A seek is not playback: it doesn't earn another recovery.
    audio.currentTime = 500;
    el.at(500);
    h.fatal("networkError", FakeHls.ErrorDetails.FRAG_LOAD_ERROR);
    expect(errors).toBe(1);
  });

  it("leaves the element's own errors to hls.js while attached; lets one through when it gives up", () => {
    el.at(200);
    el.dispatchEvent(new Event("error")); // an MSE decode error
    expect(FakeHls.last.mediaRecoveries).toBe(1);
    expect(errors).toBe(0);
    el.dispatchEvent(new Event("error")); // the same fault, reported twice
    expect(errors).toBe(0);
    vi.advanceTimersByTime(2000);
    el.dispatchEvent(new Event("error")); // again, with no playback since: give up
    expect(errors).toBe(1); // this very event, once
    expect(audio.streamFailed).toBe(true);
    expect(audio.lastStreamTime).toBe(200);
  });

  it("an error on a plain file is the listeners' to handle", () => {
    audio.src = "https://media.example/a.mp3";
    expect(audio.handlesErrors).toBe(false);
    el.dispatchEvent(new Event("error"));
    expect(errors).toBe(1);
  });
});

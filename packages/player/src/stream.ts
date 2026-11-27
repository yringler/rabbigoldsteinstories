/// <reference path="./hls-light.d.ts" />
/**
 * Playing a playlist as one HLS stream (docs/design/hls.md §4). On a locked phone, iOS may
 * suspend a page once its audio stops and then refuse to start the next file; one continuous
 * stream never stops between stories. The Player itself is unchanged: each story is a Track whose
 * `url` is the stream and whose start_sec/end_sec are the story's times on the stream, so
 * "next" is a seek and a natural story change is no change of source at all.
 *
 * Engines:
 *   native  Safari (macOS, iOS, iPadOS, and every iOS browser): `audio.src = <m3u8>`. Also the
 *           best choice there because the media stack, not page JavaScript, fetches the segments.
 *   hlsjs   other browsers with Media Source Extensions (Chrome, Firefox, Edge, Android): hls.js
 *           feeds the element. Needs a CORS rule on the media host (segments are fetched).
 *   none    no HLS: the site plays story by story, as before.
 */
import type Hls from "hls.js";
import type { AudioLike } from "./player.ts";

export type StreamEngine = "native" | "hlsjs" | "none";
type HlsClass = typeof Hls;
type HlsInstance = InstanceType<HlsClass>;

const HLS_MIME = "application/vnd.apple.mpegurl";

/** Which engine this browser should use. */
export function pickStreamEngine(el: Partial<Pick<HTMLMediaElement, "canPlayType">>): StreamEngine {
  const native = typeof el.canPlayType === "function" && el.canPlayType(HLS_MIME) !== "";
  const apple = typeof navigator !== "undefined" && /Apple/.test(navigator.vendor);
  if (native && apple) return "native";
  // ManagedMediaSource (iOS 17.1+) would also run hls.js, but native is better there; any other
  // browser with MSE gets hls.js (Chrome's own HLS is newer and less proven with MP3 segments).
  if (typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function")
    return MediaSource.isTypeSupported("audio/mpeg") ||
      MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')
      ? "hlsjs"
      : native
        ? "native"
        : "none";
  return native ? "native" : "none";
}

/** Load hls.js (a separate chunk, fetched only by browsers that need it); null if it fails. */
export async function loadHlsJs(): Promise<HlsClass | null> {
  try {
    const mod = await import("hls.js/light");
    return mod.default.isSupported() ? mod.default : null;
  } catch {
    return null;
  }
}

function isStreamUrl(url: string): boolean {
  try {
    return new URL(url, "https://x.invalid").pathname.endsWith(".m3u8");
  } catch {
    return false;
  }
}

/** Playback this long after a recovery means it worked: a later failure may recover again. */
const RECOVERY_RESET_SEC = 30;
/** An element error this soon after a recovery is the same fault (hls.js reported it too). */
const SAME_FAULT_MS = 1000;

/**
 * An AudioLike over a real <audio> element that plays .m3u8 sources through hls.js (when given
 * one) and anything else directly. Pass it to the Player as `audio`; keep using the element itself
 * for events, volume and reads.
 *
 * Errors (docs/design/hls.md §4): while hls.js is attached, `handlesErrors` is true and the
 * element's own "error" events are hls.js's to recover from, so listeners must ignore them (the
 * Player does). Create the StreamAudio before adding other "error" listeners to the element: its
 * own listener has to run first. A manifest or playlist that fails to load fails at once (a 404
 * won't heal). Any other fatal error gets one recovery; once playback has run for a while after
 * it, a later error gets another. A stream that fails for good fires "error" on the element (or
 * lets the element's own error through), with `streamFailed` set and `handlesErrors` false.
 */
export class StreamAudio implements AudioLike {
  private hls: HlsInstance | null = null;
  private current = "";
  private parsed = false;
  private pendingTime: number | null = null;
  private recovered = false;
  private recoveredAt = 0;
  /** Seconds played since the last recovery. */
  private playedSinceRecovery = 0;
  /** The last good playhead on the stream: a seek target, or a time that played. */
  private lastGoodTime: number | null = null;
  /** The playhead at the previous timeupdate (to measure playback after a recovery). */
  private prevTime = 0;
  /** The last error came from a stream that could not be recovered. */
  streamFailed = false;
  /**
   * Where the playhead was on the stream when it failed (set with streamFailed). Destroying hls.js
   * detaches the element and resets its currentTime to 0, so read this instead after a failure.
   */
  lastStreamTime: number | null = null;

  constructor(
    readonly el: HTMLAudioElement,
    private Hls: HlsClass | null = null,
  ) {
    el.addEventListener("timeupdate", () => this.onTime());
    el.addEventListener("error", () => this.onElementError());
  }

  /** Provide hls.js once loaded (loadHlsJs). Until then .m3u8 sources go to the element as is. */
  setHls(H: HlsClass | null): void {
    this.Hls = H;
  }

  get hasHls(): boolean {
    return this.Hls !== null;
  }

  /** hls.js is attached and handles media errors itself: ignore the element's "error" events. */
  get handlesErrors(): boolean {
    return this.hls !== null;
  }

  get src(): string {
    return this.hls ? this.current : this.el.src;
  }
  set src(url: string) {
    this.destroy();
    this.streamFailed = false;
    this.lastStreamTime = null;
    this.lastGoodTime = null;
    this.prevTime = 0;
    const H = this.Hls;
    if (!H || !isStreamUrl(url)) {
      this.el.src = url;
      return;
    }
    this.current = url;
    this.parsed = false;
    this.recovered = false;
    this.el.removeAttribute("src");
    const h = new H({
      autoStartLoad: false,
      // Buffer far ahead: a phone that throttles the page while locked still has minutes queued.
      maxBufferLength: 600,
      maxMaxBufferLength: 900,
      backBufferLength: 90,
    });
    // A missing or broken playlist won't heal: hls.js has already retried it.
    const D = H.ErrorDetails;
    const permanent = new Set<string>([
      D.MANIFEST_LOAD_ERROR,
      D.MANIFEST_LOAD_TIMEOUT,
      D.MANIFEST_PARSING_ERROR,
      D.LEVEL_LOAD_ERROR,
      D.LEVEL_LOAD_TIMEOUT,
    ]);
    h.on(H.Events.MANIFEST_PARSED, () => {
      this.parsed = true;
      const at = this.pendingTime;
      this.pendingTime = null;
      h.startLoad(at ?? -1);
    });
    h.on(H.Events.ERROR, (_e, d) => {
      if (!d.fatal || this.hls !== h) return;
      const media = d.type === H.ErrorTypes.MEDIA_ERROR;
      if (
        !(d.type === H.ErrorTypes.NETWORK_ERROR && permanent.has(d.details)) &&
        this.recover(media)
      )
        return;
      this.fail();
      this.el.dispatchEvent(new Event("error"));
    });
    this.hls = h;
    h.attachMedia(this.el);
    h.loadSource(url);
  }

  get currentTime(): number {
    return this.el.currentTime;
  }
  set currentTime(t: number) {
    if (this.hls) {
      this.lastGoodTime = this.prevTime = t;
      if (!this.parsed) this.pendingTime = t;
    }
    try {
      this.el.currentTime = t;
    } catch {
      /* not seekable yet: pendingTime applies when the manifest is in */
    }
  }

  get duration(): number {
    return this.el.duration;
  }
  get paused(): boolean {
    return this.el.paused;
  }
  get preload(): string {
    return this.el.preload;
  }
  set preload(v: string) {
    this.el.preload = v as HTMLMediaElement["preload"];
  }
  play(): Promise<void> {
    return this.el.play();
  }
  pause(): void {
    this.el.pause();
  }
  addEventListener(type: string, fn: (e: Event) => void): void {
    this.el.addEventListener(type, fn);
  }

  /** Record the playhead; forget a recovery once playback has run well past it. */
  private onTime(): void {
    if (!this.hls) return;
    const t = this.el.currentTime;
    // 0 is what a media recovery or a detach reads, not a place the stream played to.
    if (!(t > 0)) return;
    if (this.recovered) {
      const d = t - this.prevTime;
      if (d > 0 && d < 2) this.playedSinceRecovery += d; // playing, not a seek
      if (this.playedSinceRecovery >= RECOVERY_RESET_SEC) this.recovered = false;
    }
    this.prevTime = this.lastGoodTime = t;
  }

  /** The element's own error (an MSE decode error) while hls.js is attached: recover like hls.js's. */
  private onElementError(): void {
    if (!this.hls) return; // a file, or the native engine: the listeners handle it
    if (this.recovered && Date.now() - this.recoveredAt < SAME_FAULT_MS) return;
    if (this.recover(true)) return;
    // Failed for good: this very event now reaches the other listeners, with handlesErrors false.
    this.fail();
  }

  /** One recovery per fault; false when the last one has not been followed by real playback. */
  private recover(media: boolean): boolean {
    const h = this.hls;
    if (!h || this.recovered) return false;
    this.recovered = true;
    this.recoveredAt = Date.now();
    this.playedSinceRecovery = 0;
    if (media) h.recoverMediaError();
    else h.startLoad(this.resumeTime() ?? this.pendingTime ?? -1);
    return true;
  }

  private resumeTime(): number | null {
    const now = this.el.currentTime;
    return now > 0 ? now : this.lastGoodTime;
  }

  private fail(): void {
    // Before destroy(): detaching the media resets el.currentTime. After a media recovery it
    // reads 0 too, so fall back on the last good time.
    this.lastStreamTime = this.resumeTime() ?? this.pendingTime ?? 0;
    this.destroy();
    this.streamFailed = true;
  }

  private destroy(): void {
    const h = this.hls;
    this.hls = null;
    h?.destroy();
    this.pendingTime = null;
    this.current = "";
  }
}

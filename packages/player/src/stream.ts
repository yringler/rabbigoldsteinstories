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

/**
 * An AudioLike over a real <audio> element that plays .m3u8 sources through hls.js (when given
 * one) and anything else directly. Pass it to the Player as `audio`; keep using the element itself
 * for events, volume and reads. A stream that fails for good (after one recovery attempt) fires
 * "error" on the element, like a failed file; `streamFailed` tells the two apart.
 */
export class StreamAudio implements AudioLike {
  private hls: HlsInstance | null = null;
  private current = "";
  private parsed = false;
  private pendingTime: number | null = null;
  private recovered = false;
  /** The last error came from a stream that could not be recovered. */
  streamFailed = false;

  constructor(
    readonly el: HTMLAudioElement,
    private Hls: HlsClass | null = null,
  ) {}

  /** Provide hls.js once loaded (loadHlsJs). Until then .m3u8 sources go to the element as is. */
  setHls(H: HlsClass | null): void {
    this.Hls = H;
  }

  get hasHls(): boolean {
    return this.Hls !== null;
  }

  get src(): string {
    return this.hls ? this.current : this.el.src;
  }
  set src(url: string) {
    this.destroy();
    this.streamFailed = false;
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
    h.on(H.Events.MANIFEST_PARSED, () => {
      this.parsed = true;
      h.startLoad(this.pendingTime ?? -1);
    });
    h.on(H.Events.ERROR, (_e, d) => {
      if (!d.fatal) return;
      if (!this.recovered) {
        this.recovered = true;
        if (d.type === H.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
        else h.startLoad(this.el.currentTime || (this.pendingTime ?? -1));
        return;
      }
      this.destroy();
      this.streamFailed = true;
      this.el.dispatchEvent(new Event("error"));
    });
    h.attachMedia(this.el);
    h.loadSource(url);
    this.hls = h;
  }

  get currentTime(): number {
    return this.el.currentTime;
  }
  set currentTime(t: number) {
    if (this.hls && !this.parsed) this.pendingTime = t;
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

  private destroy(): void {
    this.hls?.destroy();
    this.hls = null;
    this.pendingTime = null;
    this.current = "";
  }
}

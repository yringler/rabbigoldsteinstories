/**
 * A playlist as one HLS stream (docs/design/hls.md). Browser-safe and pure.
 *
 * Why: on a locked phone, iOS may suspend a page once its audio stops, and then refuse to start
 * the next file. One continuous stream has no gap between stories, so nothing has to start.
 *
 * The stream is a VOD playlist whose segments are byte ranges of the original MP3 files on the
 * media host (RFC 8216 §3.4 packed audio, EXT-X-BYTERANGE), so no audio is re-encoded or copied.
 * Every file is constant bitrate (data/catalog/audio_frames.csv), so a frame's byte offset is
 * computed from the file's first frame offset.
 *
 * The URL carries the items themselves (`?v=o&i=<id>~<start>~<end>_<id>~…`), so the stream always
 * matches the playlist the client holds (a pinned snapshot, a tombstoned edition) and the API needs
 * no state. The server cuts each story on frame boundaries so that story i ends within half a
 * frame (≤ 13 ms) of the sum of (end_sec − start_sec) of stories 0..i; the client computes the
 * story times on the stream with hlsChapters() from the same numbers, with no frame tables.
 */
import type { Mp3Frames } from "@goldstein/data";

export const HLS_PATH = "/playlists/hls.m3u8";
export const HLS_MIME = "application/vnd.apple.mpegurl";
/** Target segment length. Shorter seeks faster; longer means fewer requests. */
export const SEGMENT_SEC = 30;
/** A story's last segment shorter than this is merged into the one before. */
const MIN_TAIL_SEC = 8;
const MAX_ITEMS = 200;
/** MPEG-1 Layer III. */
const SAMPLES_PER_FRAME = 1152;

/**
 * Padding phase per profile `bitrate_kbps/sample_rate`, measured on every frame of sample files and
 * confirmed on 3 random frames of every file by tools/4-r2/scan_audio_frames.py. A profile missing
 * here gets no HLS (the sites play story by story).
 */
const PHASE: Readonly<Record<string, number>> = { "96/44100": 1800, "128/48000": 0 };

export type HlsVariant = "original" | "clean";

/** One story as played: recording id and bounds in its file (seconds). */
export interface HlsItem {
  id: string;
  start_sec: number;
  end_sec: number;
}

export interface Chapter {
  /** Seconds on the stream. */
  start: number;
  end: number;
}

/** Seconds as they go in the URL (2 decimals). Chapters are computed from these exact values. */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function frameSec(f: Pick<Mp3Frames, "sample_rate">): number {
  return SAMPLES_PER_FRAME / f.sample_rate;
}

/** Byte offset of frame k in the file, or null for an unknown profile. */
export function mp3FrameOffset(f: Mp3Frames, k: number): number | null {
  const phase = PHASE[`${f.bitrate_kbps}/${f.sample_rate}`];
  if (phase === undefined) return null;
  return f.first_byte + Math.floor((k * 144_000 * f.bitrate_kbps + phase) / f.sample_rate);
}

/** Query string (no "?") for a stream of these items. */
export function hlsQuery(items: readonly HlsItem[], variant: HlsVariant): string {
  const i = items.map((x) => `${x.id}~${r2(x.start_sec)}~${r2(x.end_sec)}`).join("_");
  return `v=${variant === "clean" ? "c" : "o"}&i=${i}`;
}

/** Absolute stream URL (absolute so it compares equal to HTMLMediaElement.src). */
export function hlsUrl(origin: string, items: readonly HlsItem[], variant: HlsVariant): string {
  return `${origin}${HLS_PATH}?${hlsQuery(items, variant)}`;
}

/** Parse a stream query; null when malformed. */
export function parseHlsQuery(
  q: URLSearchParams,
): { variant: HlsVariant; items: HlsItem[] } | null {
  const v = q.get("v");
  const raw = q.get("i");
  if ((v !== "o" && v !== "c") || !raw) return null;
  const parts = raw.split("_");
  if (parts.length > MAX_ITEMS) return null;
  const items: HlsItem[] = [];
  for (const p of parts) {
    const m = /^([0-9a-f]{10})~(\d{1,6}(?:\.\d{1,2})?)~(\d{1,6}(?:\.\d{1,2})?)$/.exec(p);
    if (!m) return null;
    const start_sec = Number(m[2]);
    const end_sec = Number(m[3]);
    if (!(end_sec > start_sec)) return null;
    items.push({ id: m[1]!, start_sec, end_sec });
  }
  return { variant: v === "c" ? "clean" : "original", items };
}

/** Story times on the stream, for either variant (each within 13 ms of the real cut). */
export function hlsChapters(items: readonly HlsItem[]): Chapter[] {
  const out: Chapter[] = [];
  let t = 0;
  for (const x of items) {
    const end = t + (r2(x.end_sec) - r2(x.start_sec));
    out.push({ start: Math.round(t * 1000) / 1000, end: Math.round(end * 1000) / 1000 });
    t = end;
  }
  return out;
}

/** Where one item's audio is: the file URL (no fragment) and its frame table. */
export interface HlsSource {
  url: string;
  frames: Mp3Frames;
}

interface Segment {
  url: string;
  offset: number;
  length: number;
  duration: number;
}

/**
 * The m3u8 text, or null when an item has no source, an unknown profile, or a range outside its
 * file. `source` is called once per item with the requested variant; it may answer with another
 * copy (the API's clean stream uses the original for an item without a clean copy). Each story is
 * cut on its own file's frame grid, so mixing copies keeps every boundary within half a frame.
 */
export function buildHlsPlaylist(
  items: readonly HlsItem[],
  variant: HlsVariant,
  source: (item: HlsItem, variant: HlsVariant) => HlsSource | null,
): string | null {
  if (!items.length) return null;
  const chapters = hlsChapters(items);
  const stories: Segment[][] = [];
  let t = 0;
  let prevEnd = null as { url: string; frame: number } | null;
  for (const [n, item] of items.entries()) {
    const src = source(item, variant);
    if (!src) return null;
    const f = src.frames;
    const dur = frameSec(f);
    // Frame k ≥ 1 holds audio from (k − 1)·dur; frame 0 is the Info frame.
    let k0 = Math.max(1, 1 + Math.round(r2(item.start_sec) / dur));
    // The next span of the same file: continue from the frame the last one stopped at (seamless).
    if (prevEnd?.url === src.url && Math.abs(prevEnd.frame - k0) <= 2) k0 = prevEnd.frame;
    const want = Math.round((chapters[n]!.end - t) / dur);
    const count = Math.min(want, f.frame_count - k0);
    // A range past the file's end: no stream. One frame short is rounding; more would shift every
    // later story (they would make up the difference) and break the half-frame rule.
    if (count < 1 || want - count > 1) return null;
    t += count * dur;
    prevEnd = { url: src.url, frame: k0 + count };
    const perSeg = Math.round(SEGMENT_SEC / dur);
    const minTail = Math.round(MIN_TAIL_SEC / dur);
    const cuts: number[] = [];
    for (let c = 0; c < count; c += perSeg) cuts.push(c);
    if (cuts.length > 1 && count - cuts[cuts.length - 1]! < minTail) cuts.pop();
    const segs: Segment[] = [];
    for (const [j, c] of cuts.entries()) {
      const a = k0 + c;
      const b = k0 + (cuts[j + 1] ?? count);
      const oa = mp3FrameOffset(f, a);
      const ob = mp3FrameOffset(f, b);
      if (oa === null || ob === null) return null;
      segs.push({ url: src.url, offset: oa, length: ob - oa, duration: (b - a) * dur });
    }
    stories.push(segs);
  }
  const target = Math.ceil(Math.max(...stories.flat().map((s) => s.duration)));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:4",
    `#EXT-X-TARGETDURATION:${target}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];
  let prev: Segment | null = null;
  for (const segs of stories) {
    const first = segs[0]!;
    // Contiguous bytes of the same file (consecutive spans) need no discontinuity.
    if (prev && !(prev.url === first.url && prev.offset + prev.length === first.offset))
      lines.push("#EXT-X-DISCONTINUITY");
    for (const s of segs) {
      lines.push(
        `#EXTINF:${s.duration.toFixed(5)},`,
        `#EXT-X-BYTERANGE:${s.length}@${s.offset}`,
        s.url,
      );
      prev = s;
    }
  }
  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

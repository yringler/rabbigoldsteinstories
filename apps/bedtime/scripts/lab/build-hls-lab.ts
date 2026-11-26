/**
 * Lab only (not part of the site build): writes the HLS test playlists for /lab/hls/.
 *   npx tsx apps/bedtime/scripts/lab/build-hls-lab.ts
 *
 * It downloads the picked recordings, walks their MP3 frame headers (no decoding) and writes:
 *   public/lab/hls/plain.m3u8   byte-range segments straight from the media host (no ID3 timestamps)
 *   public/lab/hls/id3.m3u8     the same segments via the site Worker (/lab/seg), which puts an
 *                               ID3 PRIV transportStreamTimestamp in front of each (RFC 8216 §3.4)
 *   public/lab/hls/chapters.json  story start/end on the playlist timeline + the per-file tracks
 *                               for the "swap" control mode (one element, src + #t fragment)
 * Segments are cut on frame boundaries, so story edges snap to the nearest frame (~26 ms).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadUnitPool } from "@goldstein/data/load";

const MEDIA_ORIGIN = "https://storiesmedia.torahlearningtools.com";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/lab/hls");
/** Target segment length. Short enough to seek well, long enough to keep the playlist small. */
const SEGMENT_SEC = 20;

/** Ordered so the first story boundary comes about a minute after pressing play. */
const PICKS: readonly { id: string; start: number }[] = [
  { id: "0b394738aa", start: 1602 }, // Selling chametz… (76 s, cut from a 30-min episode)
  { id: "3b5aee7f24", start: 0 }, // The King in the Field (whole file, ~3:46)
  { id: "070e12f2ca", start: 28 }, // Lag BaOmer (157 s, cut from an episode)
  { id: "b98423e1d3", start: 0 }, // Yahrzeit of Rabbi Moshe Sofer (whole file, ~3:44)
];

interface Frame {
  offset: number;
  length: number;
  /** Seconds from the start of the file. */
  time: number;
  duration: number;
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

function id3v2Size(b: Uint8Array): number {
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0; // "ID3"
  const size =
    ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  const footer = (b[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

function header(
  b: Uint8Array,
  i: number,
): { length: number; samples: number; rate: number } | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1]! >> 3) & 3;
  const layer = (b[i + 1]! >> 1) & 3;
  if (version === 1 || layer !== 1) return null; // reserved version, or not Layer III
  const brIndex = b[i + 2]! >> 4;
  const srIndex = (b[i + 2]! >> 2) & 3;
  if (brIndex === 0 || brIndex === 15 || srIndex === 3) return null;
  const pad = (b[i + 2]! >> 1) & 1;
  const v1 = version === 3;
  const bitrate = (v1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[brIndex]! * 1000;
  const rate = RATES[version]![srIndex]!;
  const samples = v1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrate) / rate) + pad;
  return { length, samples, rate };
}

function isInfoFrame(b: Uint8Array, f: Frame): boolean {
  const s = Buffer.from(b.subarray(f.offset, Math.min(f.offset + 64, b.length))).toString("latin1");
  return s.includes("Xing") || s.includes("Info") || s.includes("VBRI");
}

function scan(b: Uint8Array): { frames: Frame[]; rate: number } {
  const frames: Frame[] = [];
  let i = id3v2Size(b);
  let time = 0;
  let rate = 0;
  while (i < b.length) {
    const h = header(b, i);
    // Accept a header only when the next frame (or the end of the file) follows it.
    if (h && (i + h.length >= b.length || header(b, i + h.length) || b[i + h.length] === 0x54)) {
      const duration = h.samples / h.rate;
      frames.push({ offset: i, length: h.length, time, duration });
      time += duration;
      rate = h.rate;
      i += h.length;
      if (b[i] === 0x54 && b[i + 1] === 0x41 && b[i + 2] === 0x47) break; // ID3v1 "TAG"
    } else {
      i++; // resync
    }
  }
  if (frames.length && isInfoFrame(b, frames[0]!)) {
    const drop = frames.shift()!;
    for (const f of frames) f.time -= drop.duration;
  }
  return { frames, rate };
}

interface Segment {
  key: string;
  url: string;
  offset: number;
  length: number;
  duration: number;
}

interface Chapter {
  id: string;
  title: string;
  /** Seconds on the HLS playlist timeline. */
  start: number;
  end: number;
  /** The original track, for the swap control mode. */
  audio_url: string;
  start_sec: number;
  end_sec: number;
}

async function download(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

const pool = loadUnitPool();
const tracks = pool.units.flatMap((u) => u.tracks);
const segmentsByStory: Segment[][] = [];
const chapters: Chapter[] = [];
let timeline = 0;

for (const pick of PICKS) {
  const t = tracks.find((x) => x.id === pick.id && Math.round(x.start_sec) === pick.start);
  if (!t) throw new Error(`no track ${pick.id}@${pick.start}`);
  const fileUrl = t.audio_url.split("#")[0]!;
  const key = decodeURIComponent(new URL(fileUrl).pathname.slice(1));
  process.stdout.write(`${t.id} ${t.title}: downloading… `);
  const bytes = await download(fileUrl);
  const { frames, rate } = scan(bytes);
  const inRange = frames.filter(
    (f) => f.time + f.duration / 2 >= t.start_sec && f.time < t.end_sec,
  );
  if (!inRange.length) throw new Error(`no frames in range for ${t.id}`);
  const segs: Segment[] = [];
  let cur: Frame[] = [];
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0]!;
    const last = cur[cur.length - 1]!;
    segs.push({
      key,
      url: fileUrl,
      offset: first.offset,
      length: last.offset + last.length - first.offset,
      duration: cur.reduce((s, f) => s + f.duration, 0),
    });
    cur = [];
  };
  for (const f of inRange) {
    cur.push(f);
    if (cur.reduce((s, x) => s + x.duration, 0) >= SEGMENT_SEC) flush();
  }
  flush();
  const duration = segs.reduce((s, x) => s + x.duration, 0);
  chapters.push({
    id: t.id,
    title: t.title,
    start: timeline,
    end: timeline + duration,
    audio_url: fileUrl,
    start_sec: inRange[0]!.time,
    end_sec: inRange[inRange.length - 1]!.time + inRange[inRange.length - 1]!.duration,
  });
  timeline += duration;
  segmentsByStory.push(segs);
  console.log(
    `${frames.length} frames @ ${rate} Hz, ${segs.length} segments, ${duration.toFixed(2)} s`,
  );
}

function playlist(segUrl: (s: Segment, pts: number) => string, byteRange: boolean): string {
  const target = Math.ceil(Math.max(...segmentsByStory.flat().map((s) => s.duration)));
  const lines = [
    "#EXTM3U",
    `#EXT-X-VERSION:${byteRange ? 4 : 3}`,
    `#EXT-X-TARGETDURATION:${target}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  let t = 0;
  segmentsByStory.forEach((segs, i) => {
    if (i > 0) lines.push("#EXT-X-DISCONTINUITY");
    lines.push(`## ${chapters[i]!.title}`);
    for (const s of segs) {
      lines.push(`#EXTINF:${s.duration.toFixed(5)},`);
      if (byteRange) lines.push(`#EXT-X-BYTERANGE:${s.length}@${s.offset}`);
      lines.push(segUrl(s, Math.round(t * 90_000)));
      t += s.duration;
    }
  });
  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "plain.m3u8"),
  playlist((s) => s.url, true),
);
writeFileSync(
  join(OUT, "id3.m3u8"),
  playlist((s, pts) => {
    const q = new URLSearchParams({
      k: s.key,
      o: String(s.offset),
      l: String(s.length),
      t: String(pts),
    });
    return `/lab/seg?${q.toString()}`;
  }, false),
);
writeFileSync(
  join(OUT, "chapters.json"),
  JSON.stringify({ media_origin: MEDIA_ORIGIN, total: timeline, chapters }, null, 2) + "\n",
);
console.log(`wrote ${OUT} (${timeline.toFixed(1)} s total)`);

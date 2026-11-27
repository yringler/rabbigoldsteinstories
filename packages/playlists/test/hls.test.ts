import { describe, expect, it } from "vitest";
import type { Mp3Frames } from "@goldstein/data";
import {
  buildHlsPlaylist,
  frameSec,
  hlsChapters,
  hlsQuery,
  mp3FrameOffset,
  parseHlsQuery,
  type HlsItem,
  type HlsSource,
} from "../src/hls.ts";

// The two profiles of the archive (tools/4-r2/scan_audio_frames.py).
const ORIGINAL: Mp3Frames = {
  first_byte: 149,
  frame_count: 70_000,
  bitrate_kbps: 96,
  sample_rate: 44_100,
};
const CLEAN: Mp3Frames = {
  first_byte: 45,
  frame_count: 76_000,
  bitrate_kbps: 128,
  sample_rate: 48_000,
};

const items: HlsItem[] = [
  { id: "aaaaaaaaaa", start_sec: 0, end_sec: 409.9 },
  { id: "bbbbbbbbbb", start_sec: 718, end_sec: 767 },
  { id: "cccccccccc", start_sec: 0, end_sec: 72.37 },
  { id: "cccccccccc", start_sec: 72.37, end_sec: 140 }, // the next span of the same file
  { id: "dddddddddd", start_sec: 1694.5, end_sec: 1712 },
];

const source =
  (fail?: string) =>
  ({ id }: HlsItem, v: "original" | "clean"): HlsSource | null =>
    id === fail
      ? null
      : { url: `https://media.example/${id}.mp3`, frames: v === "clean" ? CLEAN : ORIGINAL };

/** Story end times on the stream, from the EXTINF sums, split at each new file range. */
function storyEnds(m3u8: string, starts: number[]): number[] {
  const durations = [...m3u8.matchAll(/#EXTINF:([\d.]+),/g)].map((m) => Number(m[1]));
  const ends: number[] = [];
  let t = 0;
  let si = 1;
  for (const d of durations) {
    if (si < starts.length && t >= starts[si]! - 0.05) {
      ends.push(t);
      si++;
    }
    t += d;
  }
  ends.push(t);
  return ends;
}

describe("HLS stream", () => {
  it("computes frame offsets: 313/314-byte frames for 96 kbps, 384 for 128 kbps", () => {
    // Matches the real padding pattern (checked on every frame of sample files).
    const o = [0, 1, 2, 3, 4].map((k) => mp3FrameOffset(ORIGINAL, k)! - ORIGINAL.first_byte);
    expect(o).toEqual([0, 313, 626, 940, 1253]);
    expect(mp3FrameOffset(CLEAN, 10)).toBe(45 + 3840);
    expect(mp3FrameOffset({ ...ORIGINAL, bitrate_kbps: 64 }, 1)).toBeNull();
  });

  it("round-trips the query and rejects malformed ones", () => {
    const q = new URLSearchParams(hlsQuery(items, "clean"));
    expect(parseHlsQuery(q)).toEqual({ variant: "clean", items });
    for (const bad of [
      "v=o",
      "v=x&i=aaaaaaaaaa~0~1",
      "v=o&i=AAAA~0~1",
      "v=o&i=aaaaaaaaaa~5~5",
      "v=o&i=aaaaaaaaaa~0~1.234",
    ])
      expect(parseHlsQuery(new URLSearchParams(bad))).toBeNull();
  });

  it("story boundaries land within half a frame of hlsChapters, for both variants", () => {
    const chapters = hlsChapters(items);
    expect(chapters.map((c) => c.end)).toEqual([409.9, 458.9, 531.27, 598.9, 616.4]);
    for (const v of ["original", "clean"] as const) {
      const text = buildHlsPlaylist(items, v, source())!;
      const half = frameSec(v === "clean" ? CLEAN : ORIGINAL) / 2;
      const ends = storyEnds(
        text,
        chapters.map((c) => c.start),
      );
      expect(ends).toHaveLength(items.length);
      ends.forEach((e, i) =>
        expect(Math.abs(e - chapters[i]!.end)).toBeLessThanOrEqual(half + 1e-6),
      );
    }
  });

  it("a clean stream that mixes copies per item still cuts every story within half a frame", () => {
    // The API's clean stream plays the original for items without a clean copy.
    const noClean = new Set(["bbbbbbbbbb", "dddddddddd"]);
    const mixed = ({ id }: HlsItem, v: "original" | "clean"): HlsSource => {
      const clean = v === "clean" && !noClean.has(id);
      return {
        url: `https://media.example/${clean ? "clean/" : ""}${id}.mp3`,
        frames: clean ? CLEAN : ORIGINAL,
      };
    };
    const text = buildHlsPlaylist(items, "clean", mixed)!;
    expect(text).toContain("https://media.example/clean/aaaaaaaaaa.mp3");
    expect(text).toContain("https://media.example/bbbbbbbbbb.mp3");
    const chapters = hlsChapters(items);
    const ends = storyEnds(
      text,
      chapters.map((c) => c.start),
    );
    expect(ends).toHaveLength(items.length);
    ends.forEach((e, i) => {
      const half = frameSec(noClean.has(items[i]!.id) ? ORIGINAL : CLEAN) / 2;
      expect(Math.abs(e - chapters[i]!.end)).toBeLessThanOrEqual(half + 1e-6);
    });
  });

  it("writes a VOD playlist of byte ranges, with a discontinuity only between non-contiguous ranges", () => {
    const text = buildHlsPlaylist(items, "original", source())!;
    expect(text.startsWith("#EXTM3U\n#EXT-X-VERSION:4\n")).toBe(true);
    expect(text.trimEnd().endsWith("#EXT-X-ENDLIST")).toBe(true);
    // 5 stories, the 3rd and 4th contiguous in the same file: 3 discontinuities.
    expect(text.match(/#EXT-X-DISCONTINUITY/g)).toHaveLength(3);
    const target = Number(/#EXT-X-TARGETDURATION:(\d+)/.exec(text)![1]);
    const durations = [...text.matchAll(/#EXTINF:([\d.]+),/g)].map((m) => Number(m[1]));
    expect(Math.max(...durations)).toBeLessThanOrEqual(target);
    expect(Math.min(...durations)).toBeGreaterThan(8 - 0.1); // short tails are merged
    // Consecutive segments of one story are back to back in the file.
    const ranges = [...text.matchAll(/#EXT-X-BYTERANGE:(\d+)@(\d+)\n(\S+)/g)].map((m) => ({
      len: Number(m[1]),
      at: Number(m[2]),
      url: m[3]!,
    }));
    const a = ranges.filter((r) => r.url.endsWith("aaaaaaaaaa.mp3"));
    for (let i = 1; i < a.length; i++) expect(a[i]!.at).toBe(a[i - 1]!.at + a[i - 1]!.len);
    expect(a[0]!.at).toBe(mp3FrameOffset(ORIGINAL, 1)); // the Info frame is skipped
  });

  it("gives no stream when an item can't be streamed or runs past its file", () => {
    expect(buildHlsPlaylist(items, "original", source("bbbbbbbbbb"))).toBeNull();
    const short = (): HlsSource => ({ url: "x", frames: { ...ORIGINAL, frame_count: 1000 } });
    expect(
      buildHlsPlaylist([{ id: "aaaaaaaaaa", start_sec: 0, end_sec: 60 }], "original", short),
    ).toBeNull();
    expect(buildHlsPlaylist([], "original", source())).toBeNull();
  });

  it("refuses a story more than one frame past its file's end; one frame short is rounding", () => {
    const want = Math.round(60 / frameSec(ORIGINAL)); // frames for 0..60 s, from frame 1
    const ending = (extra: number) => (): HlsSource => ({
      url: "x",
      frames: { ...ORIGINAL, frame_count: 1 + want + extra },
    });
    const one = [{ id: "aaaaaaaaaa", start_sec: 0, end_sec: 60 }];
    expect(buildHlsPlaylist(one, "original", ending(0))).not.toBeNull();
    expect(buildHlsPlaylist(one, "original", ending(-1))).not.toBeNull();
    expect(buildHlsPlaylist(one, "original", ending(-2))).toBeNull();
    expect(buildHlsPlaylist(one, "original", ending(-20))).toBeNull(); // about 0.5 s short
  });
});

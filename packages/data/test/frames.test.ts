import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CleanCopy } from "../src/build/clean.ts";
import { loadFrameRows, resolveFrames } from "../src/build/frames.ts";
import type { RawMeta } from "../src/raw.ts";

let root = "";
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function rows(...lines: string[]) {
  root = mkdtempSync(join(tmpdir(), "frames-"));
  mkdirSync(join(root, "catalog"));
  writeFileSync(
    join(root, "catalog", "audio_frames.csv"),
    ["id,variant,first_byte,frame_count,bitrate_kbps,sample_rate,size_bytes", ...lines].join("\n"),
  );
  return loadFrameRows(root);
}

describe("loadFrameRows", () => {
  it("keeps complete rows and drops blank, zero or malformed numbers", () => {
    const r = rows(
      "aaaaaaaaaa,original,0,158435,96,44100,49664671",
      "bbbbbbbbbb,original,,158435,96,44100,49664671",
      "cccccccccc,original,149,0,96,44100,49664671",
      "dddddddddd,original,149,158435,96,44100,",
      "eeeeeeeeee,original,149,158435,96,0,49664671",
      "ffffffffff,clean,-1,158435,128,48000,49664671",
      "0000000000,clean,45,1.5,128,48000,49664671",
    );
    expect([...r.keys()]).toEqual(["aaaaaaaaaa:original"]);
    expect(r.get("aaaaaaaaaa:original")).toEqual({
      first_byte: 0,
      frame_count: 158435,
      bitrate_kbps: 96,
      sample_rate: 44100,
      size_bytes: 49664671,
    });
  });
});

describe("resolveFrames", () => {
  const meta = (id: string, size_bytes?: number) =>
    ({ id, media: size_bytes === undefined ? {} : { size_bytes } }) as unknown as RawMeta;
  const table = { first_byte: 0, frame_count: 158435, bitrate_kbps: 96, sample_rate: 44100 };

  it("uses a row only when the current file's size is known and matches", () => {
    const rows = new Map([
      ["aaaaaaaaaa:original", { ...table, size_bytes: 100 }],
      ["aaaaaaaaaa:clean", { ...table, size_bytes: 200 }],
      ["bbbbbbbbbb:original", { ...table, size_bytes: 100 }],
      ["cccccccccc:original", { ...table, size_bytes: 100 }],
      ["cccccccccc:clean", { ...table, size_bytes: 200 }],
      ["dddddddddd:original", { ...table, size_bytes: 100 }],
      ["dddddddddd:clean", { ...table, size_bytes: 200 }],
    ]);
    const metas = [meta("aaaaaaaaaa", 100), meta("bbbbbbbbbb"), meta("cccccccccc", 100), meta("dddddddddd", 100)];
    const clean = new Map<string, CleanCopy>([
      ["aaaaaaaaaa", { url: "https://m/a.mp3", size_bytes: 200 }],
      ["cccccccccc", { url: "https://m/c.mp3" }], // manifest row without a size
      ["dddddddddd", { url: "https://m/d.mp3", size_bytes: 201 }], // re-encoded
    ]);
    const ids = new Set(metas.map((m) => m.id));
    const r = resolveFrames(metas, ids, clean, rows);
    expect(r.frames).toEqual({
      aaaaaaaaaa: { original: table, clean: table },
      cccccccccc: { original: table },
      dddddddddd: { original: table },
    });
    expect(r.stale).toEqual(["dddddddddd:clean"]);
    expect(r.unknownSize).toEqual(["bbbbbbbbbb:original", "cccccccccc:clean"]);
  });
});

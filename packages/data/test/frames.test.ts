import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadFrameRows } from "../src/build/frames.ts";

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

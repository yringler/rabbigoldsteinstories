/**
 * MP3 frame tables (docs/design/hls.md §2). Input: data/catalog/audio_frames.csv
 * (`id,variant,first_byte,frame_count,bitrate_kbps,sample_rate,size_bytes`), written by
 * tools/4-r2/scan_audio_frames.py from the public media host. A row is used only when its
 * size_bytes matches the file the item points at now (media.size_bytes for the original, the clean
 * manifest size for the clean copy), so a re-encoded file never gets a stale table. A missing file
 * means no HLS; the sites then play story by story.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawMeta } from "../raw.ts";
import type { AudioFrames, ItemId, Mp3Frames } from "../types.ts";
import { parseCsv, type CleanCopy } from "./clean.ts";

type Variant = "original" | "clean";

export function framesPath(root: string): string {
  return join(root, "catalog", "audio_frames.csv");
}

export function loadFrameRows(root: string): Map<string, Mp3Frames & { size_bytes: number }> {
  const out = new Map<string, Mp3Frames & { size_bytes: number }>();
  const p = framesPath(root);
  if (!existsSync(p)) return out;
  const [header, ...rows] = parseCsv(readFileSync(p, "utf8"));
  if (!header) return out;
  const names = ["id", "variant", "first_byte", "frame_count", "bitrate_kbps", "sample_rate", "size_bytes"];
  const idx = names.map((n) => header.indexOf(n));
  if (idx.some((i) => i < 0)) throw new Error(`${p}: expected columns ${names.join(",")}`);
  for (const r of rows) {
    const [id, variant, ...nums] = idx.map((i) => r[i]?.trim() ?? "");
    const [first_byte, frame_count, bitrate_kbps, sample_rate, size_bytes] = nums.map(Number) as [
      number,
      number,
      number,
      number,
      number,
    ];
    if (!id || (variant !== "original" && variant !== "clean")) continue;
    if (![first_byte, frame_count, bitrate_kbps, sample_rate, size_bytes].every(Number.isInteger)) continue;
    out.set(`${id}:${variant}`, { first_byte, frame_count, bitrate_kbps, sample_rate, size_bytes });
  }
  return out;
}

/** Frame tables for the given ids; a row whose size does not match the current file is skipped. */
export function resolveFrames(
  metas: readonly RawMeta[],
  ids: ReadonlySet<ItemId>,
  clean: ReadonlyMap<ItemId, CleanCopy>,
  rows: ReadonlyMap<string, Mp3Frames & { size_bytes: number }>,
): { frames: Record<ItemId, AudioFrames>; stale: string[] } {
  const frames: Record<ItemId, AudioFrames> = {};
  const stale: string[] = [];
  const pick = (id: ItemId, v: Variant, size: number | undefined): Mp3Frames | null => {
    const r = rows.get(`${id}:${v}`);
    if (!r) return null;
    if (size !== undefined && r.size_bytes !== size) {
      stale.push(`${id}:${v}`);
      return null;
    }
    const { size_bytes: _size, ...f } = r;
    return f;
  };
  for (const m of [...metas].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!ids.has(m.id)) continue;
    const original = pick(m.id, "original", m.media.size_bytes);
    if (!original) continue;
    const c = clean.get(m.id);
    const cf = c ? pick(m.id, "clean", c.size_bytes) : null;
    frames[m.id] = cf ? { original, clean: cf } : { original };
  }
  return { frames, stale };
}

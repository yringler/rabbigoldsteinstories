/**
 * AI-cleaned audio copies (docs/design/ai-audio.md §2). Input: data/catalog/r2_clean_manifest.csv
 * (`id,key,size,etag`, UTF-8 with BOM), written by _sidon/publish_clean.py and copied in by
 * tools/export_repo.py. It grows while the cleaning job runs; a missing file means no clean copies.
 * Nothing about clean copies is stored in .meta.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_PREFIX, CLEAN_AUDIO_PREFIX, cleanUrlOf } from "../paths.ts";
import type { RawMeta } from "../raw.ts";
import type { ItemId } from "../types.ts";

export interface CleanManifestRow {
  key: string;
  size?: number;
}

export interface CleanCopy {
  url: string;
  size_bytes?: number;
}

export function cleanManifestPath(root: string): string {
  return join(root, "catalog", "r2_clean_manifest.csv");
}

/** Minimal RFC 4180 parser (quoted fields with commas, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

/** id → manifest row. Empty map when the file is missing. */
export function loadCleanManifest(root: string): Map<ItemId, CleanManifestRow> {
  const out = new Map<ItemId, CleanManifestRow>();
  const p = cleanManifestPath(root);
  if (!existsSync(p)) return out;
  const [header, ...rows] = parseCsv(readFileSync(p, "utf8"));
  if (!header) return out;
  const col = (name: string) => header.indexOf(name);
  const [iId, iKey, iSize] = [col("id"), col("key"), col("size")];
  if (iId < 0 || iKey < 0) throw new Error(`${p}: expected columns id,key[,size]`);
  for (const r of rows) {
    const id = r[iId]?.trim();
    const key = r[iKey];
    if (!id || !key) continue;
    const size = iSize >= 0 ? Number(r[iSize]) : NaN;
    out.set(id, { key, ...(Number.isFinite(size) && size > 0 ? { size } : {}) });
  }
  return out;
}

/**
 * Clean copies for the given items: an item gets one only if the manifest lists its id AND the
 * manifest key is its media.r2_key with goldstein/audio/ replaced by goldstein/audio_clean/.
 * The URL is cleanUrlOf(media.url), so it is percent-encoded exactly like the original.
 * Mismatches are returned (ids only) for the build log; they never fail the build.
 */
export function resolveCleanCopies(
  metas: readonly RawMeta[],
  manifest: ReadonlyMap<ItemId, CleanManifestRow>,
): { copies: Map<ItemId, CleanCopy>; mismatched: ItemId[] } {
  const copies = new Map<ItemId, CleanCopy>();
  const mismatched: ItemId[] = [];
  if (manifest.size === 0) return { copies, mismatched };
  for (const m of metas) {
    const row = manifest.get(m.id);
    if (!row) continue;
    const key = m.media.r2_key;
    const expected = key.startsWith(AUDIO_PREFIX) ? CLEAN_AUDIO_PREFIX + key.slice(AUDIO_PREFIX.length) : null;
    const url = cleanUrlOf(m.media.url);
    if (expected === null || row.key !== expected || url === m.media.url) {
      mismatched.push(m.id);
      continue;
    }
    copies.set(m.id, { url, ...(row.size !== undefined ? { size_bytes: row.size } : {}) });
  }
  return { copies, mismatched };
}

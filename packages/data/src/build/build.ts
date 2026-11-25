/**
 * Build the public dataset: data/ → packages/data/generated/.
 *   npm run build -w @goldstein/data      always rebuild
 *   npm run ensure -w @goldstein/data     rebuild only when an input changed
 * Then it runs the privacy gate on the output and exits non-zero on any finding.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FORBIDDEN_KEYS } from "../privacy.ts";
import { buildTerms } from "./terms.ts";
import type { RawMeta } from "../raw.ts";
import {
  PUBLIC_DATA_VERSION,
  type CatalogEntry,
  type ItemId,
  type Manifest,
  type PublicItem,
} from "../types.ts";
import { runGate } from "./gate.ts";
import { buildUnitPool } from "./units.ts";
import {
  dataDir,
  inputFingerprint,
  loadIndex,
  loadRecordings,
  loadTranscript,
  loadVocab,
  outDir,
  vocabLists,
} from "./io.ts";
import {
  maskTranscript,
  PUBLISHED,
  toCatalogEntry,
  toPublicItem,
  toPublicVocab,
  toSearchDoc,
  toTranscript,
  type Context,
} from "./transform.ts";

const HEX_ID = /^[0-9a-f]{10}$/;
const file = (n: "serials" | "story_groups") => (n === "serials" ? "serials_index" : "story_groups");

function writeJson(path: string, value: unknown, pretty = false): number {
  const text = pretty ? `${JSON.stringify(value, null, 1)}\n` : JSON.stringify(value);
  writeFileSync(path, text, "utf8");
  return Buffer.byteLength(text);
}

/** Keep only public item references in an index file; drop internal keys; redact terms. */
function publicIndex(value: unknown, publicIds: ReadonlySet<ItemId>, ctx: Context): unknown {
  const isDroppedRef = (v: unknown) => typeof v === "string" && HEX_ID.test(v) && !publicIds.has(v);
  const walk = (v: unknown, path: string): unknown => {
    if (Array.isArray(v)) {
      return v
        .filter((x) => !isDroppedRef(x))
        .filter((x) => {
          if (!x || typeof x !== "object" || Array.isArray(x)) return true;
          const o = x as Record<string, unknown>;
          return !isDroppedRef(o["id"]) && !isDroppedRef(o["item"]);
        })
        .map((x, i) => walk(x, `${path}[${i}]`));
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        if ((FORBIDDEN_KEYS as readonly string[]).includes(k) || k === "publish") continue;
        out[k] = walk(x, `${path}.${k}`);
      }
      return out;
    }
    return v;
  };
  return walk(value, "");
}

export interface BuildResult {
  manifest: Manifest;
  bytes: Record<string, number>;
  redactions: Context["redactions"];
}

export function build(): BuildResult {
  const root = dataDir();
  const out = outDir();
  const started = Date.now();
  const recs = loadRecordings(root);
  const vocabFile = loadVocab(root);
  const lists = vocabLists(vocabFile);
  const terms = buildTerms(root);

  const excluded: Record<string, number> = {};
  const isPublic = (m: RawMeta) => PUBLISHED.has(m.quality.publish_recommendation);
  const publicRecs = recs.filter((r) => {
    if (isPublic(r.meta)) return true;
    const k = r.meta.quality.publish_recommendation;
    excluded[k] = (excluded[k] ?? 0) + 1;
    return false;
  });
  const publicIds = new Set(publicRecs.map((r) => r.meta.id));
  const unconfirmed = new Set(
    Object.values(lists)
      .flat()
      .filter((e) => e.unconfirmed)
      .map((e) => e.id),
  );
  const ctx: Context = { publicIds, unconfirmed, terms, redactions: [] };

  rmSync(out, { recursive: true, force: true });
  for (const d of ["items", "transcripts", "search", "indexes"]) mkdirSync(join(out, d), { recursive: true });

  const bytes: Record<string, number> = { items: 0, transcripts: 0, search: 0 };
  const catalog: CatalogEntry[] = [];
  let transcripts = 0;
  let searchDocs = 0;
  let maskedTotal = 0;
  let hours = 0;

  for (const rec of publicRecs.sort((a, b) => a.meta.id.localeCompare(b.meta.id))) {
    const m = rec.meta;
    const raw = m.display.transcript_display === "none" ? null : loadTranscript(rec);
    const mt = raw ? maskTranscript(m, raw, terms) : { lines: [], masked: 0 };
    maskedTotal += mt.masked;
    const item: PublicItem = toPublicItem(m, ctx, mt.masked);
    bytes["items"]! += writeJson(join(out, "items", `${m.id}.json`), item);
    catalog.push(toCatalogEntry(item));
    hours += item.duration_sec / 3600;
    if (raw) {
      if (item.transcript.display === "show_with_label") {
        bytes["transcripts"]! += writeJson(join(out, "transcripts", `${m.id}.json`), toTranscript(m.id, mt));
        transcripts++;
      }
      bytes["search"]! += writeJson(join(out, "search", `${m.id}.json`), toSearchDoc(item, mt));
      searchDocs++;
    }
  }

  bytes["catalog.json"] = writeJson(join(out, "catalog.json"), catalog);
  const glossary = vocabFile.asr_glossary ?? [];
  bytes["vocab.json"] = writeJson(join(out, "vocab.json"), toPublicVocab(lists, glossary));

  for (const [name, fileName] of [
    ["serials", "serials_index"],
    ["story_groups", "story_groups"],
    ["series", "series_summaries"],
    ["lost_episodes", "lost_episodes"],
  ] as const) {
    const idx = loadIndex<unknown>(fileName, root);
    if (idx !== null) bytes[`indexes/${name}.json`] = writeJson(join(out, "indexes", `${name}.json`), publicIndex(idx, publicIds, ctx));
  }

  const generatedAt = new Date().toISOString();
  const pool = buildUnitPool({
    metas: recs.map((r) => r.meta),
    vocab: lists,
    serials: loadIndex(file("serials"), root),
    storyGroups: loadIndex(file("story_groups"), root),
  });
  bytes["units.json"] = writeJson(join(out, "units.json"), pool);

  const manifest: Manifest = {
    version: PUBLIC_DATA_VERSION,
    generated_at: generatedAt,
    input_fingerprint: inputFingerprint(root),
    counts: {
      source_items: recs.length,
      public_items: publicRecs.length,
      excluded,
      transcripts,
      search_docs: searchDocs,
      masked_lines: maskedTotal,
      units: pool.units.length,
    },
    hours: Math.round(hours * 10) / 10,
  };
  writeJson(join(out, "manifest.json"), manifest, true);
  console.log(
    `public data: ${publicRecs.length}/${recs.length} items, ${transcripts} transcripts, ${searchDocs} search docs, ` +
      `${maskedTotal} lines withheld, ${pool.units.length} playlist units, ` +
      `${ctx.redactions.length} metadata redactions, ${terms.terms.length} sensitive terms ` +
      `(${terms.skipped.length} hidden name variants left to span masking) in ${((Date.now() - started) / 1000).toFixed(1)} s → ${out}`,
  );
  if (ctx.redactions.length) {
    console.log("metadata fields redacted (fix at the source; see docs/ARCHITECTURE.md §Privacy):");
    for (const r of ctx.redactions) console.log(`  ${r.id} ${r.field}`);
  }
  return { manifest, bytes, redactions: ctx.redactions };
}

function upToDate(): boolean {
  const p = join(outDir(), "manifest.json");
  if (!existsSync(p)) return false;
  try {
    const m = JSON.parse(readFileSync(p, "utf8")) as Manifest;
    return m.version === PUBLIC_DATA_VERSION && m.input_fingerprint === inputFingerprint();
  } catch {
    return false;
  }
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("build/build.ts");
if (isMain) {
  const ensure = process.argv.includes("--ensure");
  if (ensure && upToDate()) {
    console.log(`public data up to date → ${outDir()}`);
  } else {
    const r = build();
    const kb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
    console.log(Object.entries(r.bytes).map(([k, v]) => `  ${k}: ${kb(v)}`).join("\n"));
    const findings = runGate([outDir()], buildTerms());
    if (findings.length) {
      console.error(`PRIVACY GATE FAILED: ${findings.length} finding(s)`);
      for (const f of findings.slice(0, 50)) console.error(`  ${f.file}: ${f.problem}`);
      process.exit(1);
    }
    console.log("privacy gate: OK");
  }
}

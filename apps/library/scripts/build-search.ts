/**
 * Builds the transcript search index (docs/sites/library.md §5.3) with the Pagefind Node API.
 *
 *   tsx scripts/build-search.ts <outDir> [--if-missing]     (writes <outDir>/pagefind/{en,yi}/)
 *
 * Input is ONLY the public, already-masked search text (`@goldstein/data/load` → loadSearchDoc):
 * withheld lines are not in it. One synthetic HTML document per recording, url /r/<id>/, one
 * <p id="t<sec>"> per ~30-second passage. No titles or metadata, so ranking is transcript-only.
 * Known ASR misspellings get the correct form appended to that passage (search text only, never
 * displayed). English and Yiddish go to separate bundles; Yiddish text is searchable but the site
 * never displays it (DECISIONS 8; the owner accepted it inside a downloadable index).
 *
 * Also writes <bundle>/map.json: Pagefind result id → recording id, so the search page can join
 * transcript hits to facets without loading fragments.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import * as pagefind from "pagefind";
import { loadCatalog, loadSearchDoc, loadVocab } from "@goldstein/data/load";
import { type GlossaryRule, glossaryRules, searchPassages } from "../src/lib/passages.ts";

const PASSAGE_SEC = 30;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function documentHtml(lang: "en" | "yi", passages: { t: number; text: string }[]): string {
  const body = passages.map((p) => `<p id="t${p.t}">${esc(p.text)}</p>`).join("");
  return `<!doctype html><html lang="${lang}"><body><main data-pagefind-body>${body}</main></body></html>`;
}

/** Decode a .pf_fragment (gzip, "pagefind_dcd" signature, JSON). */
export function readFragment(buf: Buffer): { url: string; content: string } {
  const raw = gunzipSync(buf).toString("utf8");
  return JSON.parse(raw.slice(raw.indexOf("{"))) as { url: string; content: string };
}

async function buildBundle(
  lang: "en" | "yi",
  ids: readonly string[],
  out: string,
  rules: GlossaryRule[],
): Promise<number> {
  const { index, errors } = await pagefind.createIndex({
    forceLanguage: lang,
    writePlayground: false,
  });
  if (!index) throw new Error(`pagefind: ${errors.join("; ")}`);
  let n = 0;
  for (const id of ids) {
    const doc = loadSearchDoc(id);
    if (!doc || doc.language !== lang || doc.lines.length === 0) continue;
    const passages = searchPassages(doc.lines, PASSAGE_SEC, lang === "en" ? rules : []);
    const r = await index.addHTMLFile({ url: `/r/${id}/`, content: documentHtml(lang, passages) });
    if (r.errors.length) throw new Error(`pagefind ${id}: ${r.errors.join("; ")}`);
    n++;
  }
  const dir = join(out, lang);
  if (n === 0) {
    await index.deleteIndex();
    return 0;
  }
  const w = await index.writeFiles({ outputPath: dir });
  if (w.errors.length) throw new Error(`pagefind write: ${w.errors.join("; ")}`);
  await index.deleteIndex();
  const map: Record<string, string> = {};
  const fragDir = join(dir, "fragment");
  for (const f of readdirSync(fragDir)) {
    const id = /\/r\/([0-9a-f]{10})\//.exec(readFragment(readFileSync(join(fragDir, f))).url)?.[1];
    if (id) map[f.replace(/\.pf_fragment$/, "")] = id;
  }
  writeFileSync(join(dir, "map.json"), JSON.stringify(map));
  // Only the search API is used; drop Pagefind's bundled UI files.
  for (const f of readdirSync(dir))
    if (/^pagefind-(component-ui|modular-ui|ui|highlight)\./.test(f)) rmSync(join(dir, f));
  return n;
}

/** Build both bundles under `<target>/pagefind/`. `ids` defaults to every public recording. */
export async function buildSearchIndex(
  target: string,
  ids?: readonly string[],
): Promise<{ en: number; yi: number; out: string }> {
  const out = join(resolve(target), "pagefind");
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const list = ids ?? loadCatalog().map((c) => c.id);
  const rules = glossaryRules(loadVocab().asr_glossary);
  const en = await buildBundle("en", list, out, rules);
  const yi = await buildBundle("yi", list, out, rules);
  await pagefind.close();
  return { en, yi, out };
}

async function main() {
  const args = process.argv.slice(2);
  const target = resolve(args.find((a) => !a.startsWith("--")) ?? "dist");
  if (args.includes("--if-missing") && existsSync(join(target, "pagefind", "en", "pagefind.js"))) {
    console.log(`search index: kept ${join(target, "pagefind")} (delete it to rebuild)`);
    return;
  }
  const t0 = Date.now();
  const { en, yi, out } = await buildSearchIndex(target);
  console.log(
    `search index: ${en} English + ${yi} Yiddish documents in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${out}`,
  );
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/build-search.ts");
if (isMain) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}

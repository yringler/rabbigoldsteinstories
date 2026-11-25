/**
 * Privacy: no withheld (masked) transcript text reaches the library's search index or pages.
 *
 * 1. Builds a Pagefind index (the same code as the real build) for the recordings with the most
 *    withheld lines, decodes every fragment, and checks that no withheld line's text is in it, and
 *    that the privacy gate (which now also decodes .pf_fragment files) finds nothing.
 * 2. When apps/library/dist exists (after `npm run build`), checks the same for the built recording
 *    pages, the /t/ transcript files and the real Pagefind fragments of those recordings.
 * Withheld lines are taken from the raw data (hidden spans), independently of the public build.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runGate } from "@goldstein/data/build/gate.ts";
import { loadRecordings, loadTranscript } from "@goldstein/data/build/io.ts";
import { buildTerms } from "@goldstein/data/build/terms.ts";
import { loadCatalog, loadItem } from "@goldstein/data/load";
import { hiddenSpans, overlapsAny } from "@goldstein/data/privacy";
import { buildSearchIndex, readFragment } from "../scripts/build-search.ts";

const DIST = resolve(__dirname, "..", "dist");
const norm = (s: string) =>
  s
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

interface Sample {
  id: string;
  lang: string;
  withheld: string[];
}

let samples: Sample[] = [];
let tmp = "";
let fragments = new Map<string, string>();

beforeAll(async () => {
  const pub = new Set(loadCatalog().map((c) => c.id));
  const recs = loadRecordings().filter((r) => pub.has(r.meta.id));
  const scored = recs
    .map((r) => ({ r, masked: loadItem(r.meta.id).transcript.masked_lines }))
    .filter((x) => x.masked > 0)
    .sort((a, b) => b.masked - a.masked);
  const pick = [
    ...scored
      .filter((x) => loadItem(x.r.meta.id).language.transcript_language === "en")
      .slice(0, 30),
    ...scored
      .filter((x) => loadItem(x.r.meta.id).language.transcript_language === "yi")
      .slice(0, 5),
  ];
  samples = pick.map(({ r }) => {
    const spans = hiddenSpans(r.meta.hidden, undefined, r.meta.segments ?? []);
    const segs = loadTranscript(r)?.segments ?? [];
    const open = new Set(
      segs.filter((s) => !overlapsAny(s.start, s.end, spans)).map((s) => norm(s.text).trim()),
    );
    const withheld = segs
      .filter((s) => overlapsAny(s.start, s.end, spans))
      .map((s) => norm(s.text).trim())
      .filter((t) => t.length >= 30 && !open.has(t));
    return {
      id: r.meta.id,
      lang: loadItem(r.meta.id).language.transcript_language,
      withheld: [...new Set(withheld)],
    };
  });
  tmp = mkdtempSync(join(tmpdir(), "library-pf-"));
  await buildSearchIndex(
    tmp,
    samples.map((s) => s.id),
  );
  fragments = readFragments(join(tmp, "pagefind"));
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function readFragments(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const lang of ["en", "yi"]) {
    const dir = join(root, lang, "fragment");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const frag = readFragment(readFileSync(join(dir, f)));
      const id = /\/r\/([0-9a-f]{10})\//.exec(frag.url)?.[1];
      if (id) out.set(id, norm(frag.content));
    }
  }
  return out;
}

function leaks(text: string, s: Sample): string[] {
  return s.withheld.filter((w) => text.includes(w));
}

describe("withheld transcript text stays out of the search index", () => {
  it("has a meaningful sample", () => {
    expect(samples.length).toBeGreaterThanOrEqual(30);
    expect(samples.reduce((a, s) => a + s.withheld.length, 0)).toBeGreaterThan(200);
    expect(fragments.size).toBeGreaterThanOrEqual(30);
  });

  it("no withheld line appears in any Pagefind fragment built from the public search text", () => {
    for (const s of samples) {
      const content = fragments.get(s.id);
      if (!content) continue;
      expect(leaks(content, s), s.id).toEqual([]);
      // and the unmasked text is really there (the check is not vacuous)
      expect(content.length, s.id).toBeGreaterThan(100);
    }
  });

  it("the privacy gate, which decodes .pf_fragment files, finds nothing in the index", () => {
    expect(runGate([join(tmp, "pagefind")], buildTerms())).toEqual([]);
  });
});

describe.runIf(existsSync(join(DIST, "r")))(
  "withheld transcript text stays out of the built site (dist/)",
  () => {
    it("recording pages, /t/ files and the real search index carry no withheld line", () => {
      const real = existsSync(join(DIST, "pagefind"))
        ? readFragments(join(DIST, "pagefind"))
        : new Map<string, string>();
      for (const s of samples) {
        const page = join(DIST, "r", s.id, "index.html");
        expect(existsSync(page), page).toBe(true);
        expect(leaks(norm(readFileSync(page, "utf8")), s), `page ${s.id}`).toEqual([]);
        const t = join(DIST, "t", `${s.id}.json`);
        if (existsSync(t)) {
          const rows = (
            JSON.parse(readFileSync(t, "utf8")) as {
              rows: ([number, number, string] | { gap: true; start: number; end: number })[];
            }
          ).rows;
          expect(
            leaks(norm(rows.map((r) => (Array.isArray(r) ? r[2] : "")).join(" ")), s),
            `/t/${s.id}.json`,
          ).toEqual([]);
        }
        const frag = real.get(s.id);
        if (frag) expect(leaks(frag, s), `pagefind ${s.id}`).toEqual([]);
        if (s.lang === "yi")
          expect(existsSync(t), `no display transcript for Yiddish ${s.id}`).toBe(false);
      }
    });

    it("the privacy gate passes on the built search index", () => {
      expect(runGate([join(DIST, "pagefind")], buildTerms())).toEqual([]);
    });
  },
);

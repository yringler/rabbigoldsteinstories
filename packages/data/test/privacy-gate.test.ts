/**
 * THE PRIVACY GATE (runs in CI on every PR and before every deploy).
 * Builds the public dataset from the real data/ if it is missing or stale, then checks the
 * output end to end against the internal metadata. A failure here means personal details could
 * be published: fix the build or the data, never weaken the test.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build/build.ts";
import { runGate } from "../src/build/gate.ts";
import { inputFingerprint, listFiles, loadRecordings, loadTranscript, outDir } from "../src/build/io.ts";
import { buildTerms } from "../src/build/terms.ts";
import { PRIVATE_SEGMENT_TYPES, PUBLISHED } from "../src/build/transform.ts";
import { hiddenSpans, overlapsAny, type TermSet } from "../src/privacy.ts";
import type { RawRecording } from "../src/raw.ts";
import type { Manifest, PublicItem, PublicTranscript, SearchDoc } from "../src/types.ts";

let out: string;
let terms: TermSet;
let recs: RawRecording[];

beforeAll(() => {
  out = outDir();
  const manifestPath = join(out, "manifest.json");
  const fresh =
    existsSync(manifestPath) &&
    (JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest).input_fingerprint === inputFingerprint();
  if (!fresh) build();
  terms = buildTerms();
  recs = loadRecordings();
});

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

describe("privacy gate on the generated public dataset", () => {
  it("has a meaningful term list (the gate is not vacuous)", () => {
    expect(recs.length).toBeGreaterThan(1000);
    expect(terms.terms.length).toBeGreaterThan(500);
  });

  it("no hidden name, address or phone number appears in any output file, and no internal key", () => {
    const findings = runGate([out], terms);
    expect(findings).toEqual([]);
  });

  it("the gate catches a planted leak (self-test)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-selftest-"));
    try {
      const term = terms.terms.find((t) => /^[a-z ]+$/.test(t) && t.includes(" ")) as string;
      // Written in title case with different spacing, as a page would show it.
      const shown = term.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ /g, "  ");
      writeFileSync(join(dir, "page.html"), `<p>Thanks to ${shown} for calling!</p>`);
      writeFileSync(join(dir, "data.json"), JSON.stringify({ title: "x", hidden: { on_air_people: [] } }));
      // A site's Pagefind fragment (gzip-compressed JSON) is decoded and scanned too.
      writeFileSync(join(dir, "en_1.pf_fragment"), gzipSync(`pagefind_dcd${JSON.stringify({ url: "/r/x/", content: `Hello ${shown}` })}`));
      const findings = runGate([dir], terms);
      expect(findings.some((f) => f.file.endsWith("en_1.pf_fragment"))).toBe(true);
      expect(findings.some((f) => f.file.endsWith("page.html"))).toBe(true);
      expect(findings.some((f) => f.file.endsWith("data.json") && f.problem.includes("internal key"))).toBe(true);
      // Findings never print the term itself.
      expect(findings.map((f) => f.problem).join(" ")).not.toContain(term);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("publishes exactly the items whose publish_recommendation is allowed", () => {
    const published = new Set(recs.filter((r) => PUBLISHED.has(r.meta.quality.publish_recommendation)).map((r) => r.meta.id));
    const files = readdirSync(join(out, "items")).map((f) => f.replace(/\.json$/, ""));
    expect(new Set(files)).toEqual(published);
    expect(recs.some((r) => r.meta.quality.publish_recommendation === "hide")).toBe(true);
  });

  it("excluded item ids appear nowhere in the output", () => {
    const excluded = recs.filter((r) => !PUBLISHED.has(r.meta.quality.publish_recommendation)).map((r) => r.meta.id);
    const all = listFiles(out).map((f) => readFileSync(f, "utf8"));
    for (const id of excluded) {
      expect(all.some((t) => t.includes(id)), `excluded item ${id} is referenced`).toBe(false);
    }
  });

  it("transcript lines inside an item's hidden spans are withheld (display and search)", () => {
    let checked = 0;
    for (const r of recs) {
      if (!PUBLISHED.has(r.meta.quality.publish_recommendation)) continue;
      const spans = hiddenSpans(r.meta.hidden, undefined, r.meta.segments ?? []);
      const tp = join(out, "transcripts", `${r.meta.id}.json`);
      if (existsSync(tp)) {
        for (const l of readJson<PublicTranscript>(tp).lines) {
          if (overlapsAny(l.s, l.e, spans)) {
            expect(l.t, `${r.meta.id} @${l.s}`).toBeNull();
            checked++;
          }
        }
      }
      const sp = join(out, "search", `${r.meta.id}.json`);
      if (existsSync(sp)) {
        const raw = loadTranscript(r);
        const ends = new Map(raw?.segments.map((s) => [Math.round(s.start * 100) / 100, s.end]) ?? []);
        for (const [s] of readJson<SearchDoc>(sp).lines) {
          expect(overlapsAny(s, ends.get(s) ?? s, spans), `${r.meta.id} search @${s}`).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("only English items marked show_with_label get a display transcript; Yiddish is search-only", () => {
    for (const f of readdirSync(join(out, "transcripts"))) {
      const item = readJson<PublicItem>(join(out, "items", f));
      expect(item.transcript.display, item.id).toBe("show_with_label");
      expect(item.language.transcript_language, item.id).toBe("en");
    }
  });

  it("unconfirmed placeholders keep their placeholder labels and carry no aliases or descriptions", () => {
    const vocab = readJson<{ lists: Record<string, { id: string; label: string; unconfirmed?: boolean; aliases?: string[]; description?: string }[]> }>(
      join(out, "vocab.json"),
    );
    const placeholders = Object.values(vocab.lists).flat().filter((e) => e.unconfirmed);
    expect(placeholders.length).toBeGreaterThan(0);
    for (const p of placeholders) {
      expect(p.label.toLowerCase()).toMatch(/unconfirmed|working title/);
      expect(p.aliases).toBeUndefined();
      expect(p.description).toBeUndefined();
    }
  });

  it("private segment types (Shema guest, mailbox, announcements, sponsors) carry only type, times and a generic title", () => {
    let n = 0;
    for (const f of readdirSync(join(out, "items"))) {
      const item = readJson<PublicItem>(join(out, "items", f));
      for (const s of item.segments) {
        const generic = PRIVATE_SEGMENT_TYPES[s.type];
        if (!generic) continue;
        n++;
        expect(s.title).toBe(generic);
        expect(Object.keys(s).sort()).toEqual(["end_sec", "start_sec", "title", "type"].filter((k) => k in s).sort());
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it("relations carry no pipeline notes or evidence", () => {
    let n = 0;
    for (const f of readdirSync(join(out, "items"))) {
      const item = readJson<PublicItem>(join(out, "items", f));
      for (const r of item.relations) {
        n++;
        for (const k of Object.keys(r)) expect(["type", "target_id", "confidence", "offset_sec"], `${item.id} relation key ${k}`).toContain(k);
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it("recordings with a privacy flag but no timed hidden entry have no transcript and no search text (library.md §5.4 rule 6)", () => {
    let n = 0;
    for (const r of recs) {
      if (!PUBLISHED.has(r.meta.quality.publish_recommendation)) continue;
      const h = r.meta.hidden;
      if (!r.meta.audience.privacy.length || h.on_air_people.length + h.addresses.length + h.other_personal.length) continue;
      n++;
      expect(existsSync(join(out, "transcripts", `${r.meta.id}.json`)), r.meta.id).toBe(false);
      expect(existsSync(join(out, "search", `${r.meta.id}.json`)), r.meta.id).toBe(false);
      expect(readJson<PublicItem>(join(out, "items", `${r.meta.id}.json`)).transcript.display).toBe("none");
    }
    expect(n).toBeGreaterThan(0);
  });

  it("publishes the lost-episodes index", () => {
    const lost = readJson<{ episodes: unknown[] }>(join(out, "indexes", "lost_episodes.json"));
    expect(lost.episodes.length).toBeGreaterThan(100);
  });
});

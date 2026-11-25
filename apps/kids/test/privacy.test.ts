/**
 * Privacy of what the kids' build emits (criteria 2, 3, 5): chapter labels of private segment types,
 * forbidden keys in every JSON the site ships, no transcript text, and the shared gate catching a
 * seeded hidden name in a kids page.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublicSegment } from "@goldstein/data";
import { loadTranscript } from "@goldstein/data/load";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/lib/build/model.ts";
import { buildSearchIndex } from "../src/lib/build/search-docs.ts";
import { GENERIC_LABEL, PRIVATE_TYPES, kidChapters } from "../src/lib/chapters.ts";
// The gate and its term list live in packages/data (not exported to apps); the test reuses them.
import { runGate } from "../../../packages/data/src/build/gate.ts";
import { buildTerms } from "../../../packages/data/src/build/terms.ts";

const m = getModel();
const FORBIDDEN = [
  "hidden",
  "source",
  "quality",
  "provenance",
  "proposed_new_terms",
  "identity_guesses",
  "privacy",
];

function keysDeep(v: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  return out;
}

describe("chapter labels (criterion 5)", () => {
  it("private segment types never carry their own title or summary", () => {
    const segs: PublicSegment[] = [
      {
        start_sec: 0,
        type: "shema_guest",
        title: "Shema with Moshe Cohen",
        summary: "Moshe from Brooklyn",
      },
      { start_sec: 10, type: "mailbox", title: "Letters from Sarah Levi", summary: "secret" },
      { start_sec: 20, type: "announcement", title: "Birthday: Dovid Katz" },
      { start_sec: 30, type: "sponsor", title: "Sponsored by the Katz family" },
      { start_sec: 40, type: "opening", title: "Hello to Chaya" },
      { start_sec: 50, type: "closing", title: "Bye Mendel" },
      { start_sec: 60, type: "other", title: "Misc" },
      { start_sec: 70, type: "silence", title: "Blank" },
      { start_sec: 80, type: "story", title: "The Story", summary: "A story." },
    ];
    const ch = kidChapters(segs);
    expect(ch.map((c) => c.label)).toEqual([
      "Shema time",
      "The mailbox",
      "Announcements",
      "A word from our sponsor",
      "Hello!",
      "Goodbye!",
      "More",
      "The Story",
    ]);
    for (const c of ch.filter((x) => PRIVATE_TYPES.has(x.type))) expect(c.summary).toBeUndefined();
  });

  it("on every page, private rows show only the generic labels", () => {
    let n = 0;
    for (const k of m.items.values()) {
      for (const c of k.chapters) {
        if (!PRIVATE_TYPES.has(c.type)) continue;
        n++;
        expect(c.label).toBe(GENERIC_LABEL[c.type]);
        expect(c.summary).toBeUndefined();
      }
    }
    expect(n).toBeGreaterThan(1000);
  });
});

describe("shipped JSON (criterion 2)", () => {
  it("index, item extras and the search index contain none of the internal keys", () => {
    const keys = keysDeep(m.index, new Set());
    for (const k of m.items.values()) keysDeep({ c: k.chapters, z: k.silence }, keys);
    keysDeep(JSON.parse(buildSearchIndex()) as unknown, keys);
    for (const f of FORBIDDEN) expect(keys.has(f), f).toBe(false);
  });

  it("the search index has exactly the §6.5 fields and no transcript text", () => {
    const ix = JSON.parse(buildSearchIndex()) as { fieldIds: Record<string, number> };
    expect(Object.keys(ix.fieldIds).sort()).toEqual(
      [
        "characters",
        "heroes",
        "keywords",
        "lesson",
        "segs",
        "serial",
        "summary",
        "tags",
        "title",
      ].sort(),
    );
    // Long transcript lines from a sample of items never appear in the index.
    const text = buildSearchIndex();
    let checked = 0;
    for (const k of m.pool.slice(0, 120)) {
      const t = loadTranscript(k.id);
      for (const line of t?.lines ?? []) {
        if (!line.t || line.t.length < 80) continue;
        expect(text.includes(line.t)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("hidden-name check (criterion 3)", () => {
  it("the gate fails on a kids page with a seeded hidden name and passes without it", () => {
    const terms = buildTerms();
    const name = terms.terms.find((t) => t.includes(" ") && /^[a-z ]+$/i.test(t));
    expect(name).toBeTruthy();
    const dir = mkdtempSync(join(tmpdir(), "kids-gate-"));
    try {
      const summary = m.pool[0]?.item.summary_short ?? "A story.";
      writeFileSync(join(dir, "index.html"), `<p>${summary}</p>`);
      expect(runGate([dir], terms)).toEqual([]);
      writeFileSync(join(dir, "index.html"), `<p>${summary} Thanks to ${name ?? ""}!</p>`);
      expect(runGate([dir], terms).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

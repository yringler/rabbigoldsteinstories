/** Regression tests for the independent review of the library (one block per finding). */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog, loadItem, loadSearchDoc } from "@goldstein/data/load";
import { sanitizeEdition } from "../src/lib/editions.ts";
import { ICONS } from "../src/lib/icons.ts";
import { ownsSpaceAndArrows } from "../src/lib/keys.ts";
import { nestClips } from "../src/lib/nest.ts";
import { parseImport } from "../src/lib/playlists.ts";
import { collapseLostRuns, episodes, libCatalog } from "../src/lib/site-data.ts";
import { parseQuery, TextIndex } from "../src/lib/text.ts";
import { clampTime } from "../src/lib/time.ts";
import { transcriptRows } from "../src/lib/transcript-rows.ts";
import { snapToRow } from "../src/lib/words.ts";
import { readFragment } from "../scripts/build-search.ts";

const DIST = resolve(__dirname, "..", "dist");

describe("3. recordings without a readable or searchable transcript are not in the search index", () => {
  it("no search doc for transcript.display = none (incl. privacy-flagged family recordings)", () => {
    const none = loadCatalog().filter((c) => loadItem(c.id).transcript.display === "none");
    expect(none.length).toBeGreaterThanOrEqual(6);
    for (const c of none) expect(loadSearchDoc(c.id), c.id).toBeNull();
  });
  it.runIf(existsSync(join(DIST, "pagefind", "yi", "fragment")))(
    "…and not in the built Yiddish bundle",
    () => {
      const none = new Set(
        loadCatalog()
          .filter((c) => loadItem(c.id).transcript.display === "none")
          .map((c) => c.id),
      );
      for (const lang of ["en", "yi"]) {
        const dir = join(DIST, "pagefind", lang, "fragment");
        for (const f of readdirSync(dir)) {
          const id = /\/r\/([0-9a-f]{10})\//.exec(
            readFragment(readFileSync(join(dir, f))).url,
          )?.[1];
          expect(none.has(id ?? ""), `${lang} ${id}`).toBe(false);
        }
      }
    },
  );
});

describe("4. deep links land on the transcript row", () => {
  it("a whole-second ?t= snaps to the row starting within that second", () => {
    expect(snapToRow(29, [0, 29.4, 41.9])).toBe(29.4);
    expect(snapToRow(30, [0, 29.4, 41.9])).toBe(30);
    expect(snapToRow(null, [1])).toBeNull();
  });
});

describe("5. shortcuts leave Space and arrows to the focused control", () => {
  const el = (tagName: string, role: string | null = null) => ({
    tagName,
    closest: (sel: string) => (role && sel.includes(`[role="${role}"]`) ? {} : null),
  });
  it("checkboxes, radios, selects, options, buttons and summaries own them", () => {
    for (const t of [
      el("INPUT"),
      el("SELECT"),
      el("BUTTON"),
      el("A"),
      el("SUMMARY"),
      el("LI", "option"),
      el("DIV", "listbox"),
    ])
      expect(ownsSpaceAndArrows(t), t.tagName).toBe(true);
  });
  it("plain page elements and transcript rows do not", () => {
    expect(ownsSpaceAndArrows(el("BODY"))).toBe(false);
    expect(ownsSpaceAndArrows(el("P"))).toBe(false);
    expect(ownsSpaceAndArrows(null)).toBe(false);
  });
});

describe("6. clips of clips stay in the results", () => {
  type R = { id: string; clipOf: string[] };
  const mk = (id: string, clipOf: string[] = []) => ({
    row: { id, clipOf } as R,
    nested: [] as R[],
    meta: 0,
    tr: 0,
  });
  it("nests a clip of a clip under the top-level episode", () => {
    const out = nestClips([mk("ep"), mk("clip", ["ep"]), mk("sub", ["clip"]), mk("alone")]);
    expect(out.map((r) => r.row.id)).toEqual(["ep", "alone"]);
    expect(out[0]?.nested.map((r) => r.id).sort()).toEqual(["clip", "sub"]);
  });
  it("survives cycles", () => {
    const out = nestClips([mk("a", ["b"]), mk("b", ["a"])]);
    expect(out.length + out.reduce((n, r) => n + r.nested.length, 0)).toBe(2);
  });
  it("q=bear in titles and summaries keeps every match, top-level or nested", () => {
    const cat = libCatalog();
    const hits = new TextIndex(cat.rows).search(parseQuery("bear"));
    const results = [...hits.keys()]
      .map((i) => ({ row: cat.rows[i]!, nested: [] as typeof cat.rows, meta: 1, tr: 0 }))
      .filter((r) => r.row.preferred);
    const ids = results.map((r) => r.row.id);
    const out = nestClips(results);
    const shown = out.flatMap((r) => [r.row.id, ...r.nested.map((n) => n.id)]);
    expect(shown.sort()).toEqual(ids.sort());
  });
});

describe("7. tonight's files are read defensively", () => {
  it("drops playlists with items: null and malformed items, never throws", () => {
    const e = sanitizeEdition({
      date: "2026-11-25",
      playlists: [
        { type: "mix", title: "Mix", items: null },
        {
          type: "calm",
          title: "Calm",
          subtitle: "x",
          age_min: 4,
          items: [{ id: "585fe67e3e", start_sec: 0, end_sec: 10, title: "t" }, { id: 3 }, null],
        },
      ],
    });
    expect(e?.playlists.map((p) => p.type)).toEqual(["calm"]);
    expect(e?.playlists[0]?.items).toHaveLength(1);
    expect(sanitizeEdition(null)).toBeNull();
    expect(sanitizeEdition({ date: "x", playlists: "nope" })).toBeNull();
  });
});

describe("8. input limits", () => {
  it("?t= is clamped to the playable range", () => {
    expect(clampTime(99999, 0, 1782)).toBe(1781);
    expect(clampTime(-5, 10, 100)).toBe(10);
    expect(clampTime(50, 0, 100)).toBe(50);
  });
  it("a playlist item whose end is not after its start is rejected", () => {
    const r = parseImport(
      JSON.stringify({
        format: "goldstein-playlists",
        version: 1,
        playlists: [
          { id: "abcdefabcdef", name: "x", items: [{ rec: "0123456789", start: 50, end: 20 }] },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/must be after "start"/);
  });
});

describe("9. structure", () => {
  it("consecutive withheld lines become one gap row in /t/ files", () => {
    expect(
      transcriptRows([
        { s: 0, e: 5, t: "a" },
        { s: 5, e: 9, t: null },
        { s: 9, e: 14, t: null },
        { s: 14, e: 20, t: "b" },
        { s: 20, e: 25, t: null },
      ]),
    ).toEqual([
      [0, 5, "a"],
      { gap: true, start: 5, end: 14 },
      [14, 20, "b"],
      { gap: true, start: 20, end: 25 },
    ]);
  });
  it("lost episodes 42–112 are one run in one Hebrew year", () => {
    const run = episodes().filter((e) => e.n >= 42 && e.n <= 112);
    expect(run.every((e) => e.status === "lost")).toBe(true);
    expect(new Set(run.map((e) => e.year)).size).toBe(1);
    const cells = [
      { n: 1, status: "found" as const, year: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({
        n: 2 + i,
        status: "lost" as const,
        year: i < 3 ? 1 : 2,
      })),
    ];
    collapseLostRuns(cells);
    expect(new Set(cells.slice(1).map((c) => c.year))).toEqual(new Set([2]));
  });
  it.runIf(existsSync(join(DIST, "r")))("/r/<id>/<slug>/ exists as a redirect to /r/<id>/", () => {
    const c = loadCatalog().find((x) => x.id === "585fe67e3e");
    const slug = c?.slug.replace(/-585fe67e3e$/, "") ?? "";
    const html = readFileSync(join(DIST, "r", "585fe67e3e", slug, "index.html"), "utf8");
    expect(html).toContain("url=/r/585fe67e3e/");
  });
});

describe("10. no cross-like shapes in the icon set", () => {
  /** Absolute "M x y h/v n" segments: does any horizontal one cross through a vertical one? */
  function crossings(d: string): number {
    const hs: [number, number, number][] = [];
    const vs: [number, number, number][] = [];
    for (const m of d.matchAll(/M\s*([\d.]+)[\s,]+([\d.]+)\s*([hv])\s*(-?[\d.]+)/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      const n = Number(m[4]);
      if (m[3] === "h") hs.push([y, Math.min(x, x + n), Math.max(x, x + n)]);
      else vs.push([x, Math.min(y, y + n), Math.max(y, y + n)]);
    }
    let c = 0;
    for (const [y, x1, x2] of hs)
      for (const [x, y1, y2] of vs)
        if (x > x1 + 0.5 && x < x2 - 0.5 && y > y1 + 0.5 && y < y2 - 0.5) c++;
    return c;
  }
  it("no icon draws a plus, an X or crossing strokes", () => {
    for (const [name, d] of Object.entries(ICONS)) {
      expect(crossings(d), name).toBe(0);
      expect(/M6 6l12 12|M18 6 6 18/.test(d), name).toBe(false);
    }
    expect("moonStars" in ICONS).toBe(false);
  });
});

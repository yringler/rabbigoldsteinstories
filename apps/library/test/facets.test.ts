import { describe, expect, it } from "vitest";
import * as B from "../src/lib/bits.ts";
import {
  applyFacets,
  defaultState,
  type FacetDef,
  FacetIndex,
  facetCounts,
  LIBRARY_FACETS,
  lengthBucket,
  parseState,
  rangeConstraints,
  type SearchState,
  toggleValue,
  toQuery,
} from "../src/lib/facets.ts";
import { libCatalog } from "../src/lib/site-data.ts";

interface R {
  id: string;
  color: string[];
  shape: string[];
  warn: string[];
}
const rows: R[] = [
  { id: "a", color: ["red"], shape: ["circle"], warn: [] },
  { id: "b", color: ["red", "blue"], shape: ["square"], warn: ["death"] },
  { id: "c", color: ["blue"], shape: ["circle"], warn: ["peril"] },
  { id: "d", color: ["green"], shape: ["square"], warn: ["death", "peril"] },
  { id: "e", color: ["red", "green"], shape: ["circle"], warn: [] },
];
const defs: FacetDef<R>[] = [
  { key: "color", label: "Color", values: (r) => r.color, kind: "multi", allowAll: true },
  { key: "shape", label: "Shape", values: (r) => r.shape, kind: "multi" },
  { key: "warn", label: "Leave out", values: (r) => r.warn, kind: "exclude" },
];
const idx = new FacetIndex(rows, defs);
const ids = (b: B.Bits) => B.indices(b).map((i) => rows[i]?.id);
const st = (sel: SearchState["sel"]): SearchState => ({ ...defaultState(), sel });

describe("bitsets", () => {
  it("counts, intersects and lists across word boundaries", () => {
    const n = 70;
    const a = B.fromPredicate(n, (i) => i % 2 === 0);
    const b = B.fromPredicate(n, (i) => i % 3 === 0);
    expect(B.count(B.full(n))).toBe(70);
    expect(B.count(a)).toBe(35);
    expect(B.indices(B.and(a, b))).toEqual(Array.from({ length: 12 }, (_, k) => k * 6));
    expect(B.countAnd(a, b)).toBe(12);
    expect(B.count(B.andNot(B.full(n), a))).toBe(35);
  });
});

describe("facet semantics", () => {
  it("ORs values within a facet and ANDs across facets", () => {
    expect(
      ids(applyFacets(idx, st({ color: { any: ["red", "blue"], not: [], all: false } }))),
    ).toEqual(["a", "b", "c", "e"]);
    expect(
      ids(
        applyFacets(
          idx,
          st({
            color: { any: ["red", "blue"], not: [], all: false },
            shape: { any: ["circle"], not: [], all: false },
          }),
        ),
      ),
    ).toEqual(["a", "c", "e"]);
  });

  it("'all' mode requires every ticked value", () => {
    expect(
      ids(applyFacets(idx, st({ color: { any: ["red", "blue"], not: [], all: true } }))),
    ).toEqual(["b"]);
  });

  it("excludes values (per facet .not, and the exclude-only advisories facet)", () => {
    expect(ids(applyFacets(idx, st({ color: { any: [], not: ["red"], all: false } })))).toEqual([
      "c",
      "d",
    ]);
    expect(ids(applyFacets(idx, st({ warn: { any: ["death"], not: [], all: false } })))).toEqual([
      "a",
      "c",
      "e",
    ]);
    expect(
      ids(applyFacets(idx, st({ warn: { any: ["death", "peril"], not: [], all: false } }))),
    ).toEqual(["a", "e"]);
  });

  it("counts are disjunctive: a facet's own 'any' selection is ignored, everything else applies", () => {
    const s = st({
      color: { any: ["red"], not: [], all: false },
      shape: { any: ["circle"], not: [], all: false },
    });
    // color counts: shape=circle applied, color ignored → a(red) c(blue) e(red,green)
    expect(Object.fromEntries(facetCounts(idx, s, "color"))).toEqual({ red: 2, blue: 1, green: 1 });
    // shape counts: color=red applied → a,b,e → circle 2, square 1
    expect(Object.fromEntries(facetCounts(idx, s, "shape"))).toEqual({ circle: 2, square: 1 });
    // ticking a count's value gives exactly that many results
    const tick = toggleValue(s, "color", "blue", "any");
    expect(B.count(applyFacets(idx, tick))).toBe(3);
  });

  it("in 'all' mode, counts apply the current selection (ticking adds an AND)", () => {
    const s = st({ color: { any: ["red"], not: [], all: true } });
    expect(Object.fromEntries(facetCounts(idx, s, "color"))).toEqual({ red: 3, blue: 1, green: 1 });
  });

  it("exclude-facet counts say how many current results carry the value", () => {
    const s = st({
      shape: { any: ["square"], not: [], all: false },
      warn: { any: ["death"], not: [], all: false },
    });
    expect(Object.fromEntries(facetCounts(idx, s, "warn"))).toEqual({ death: 2, peril: 1 });
  });

  it("zero counts are reported, not dropped", () => {
    const s = st({ shape: { any: ["square"], not: [], all: false } });
    expect(facetCounts(idx, s, "color").get("blue")).toBe(1);
    const s2 = st({
      color: { any: ["green"], not: [], all: false },
      shape: { any: ["square"], not: [], all: false },
    });
    expect(facetCounts(idx, s2, "warn").get("peril")).toBe(1);
    expect(
      facetCounts(idx, st({ shape: { any: ["circle"], not: [], all: false } }), "warn").get(
        "death",
      ),
    ).toBe(0);
  });
});

describe("URL state", () => {
  const keys = LIBRARY_FACETS.map((d) => d.key);
  it("round-trips through the query string", () => {
    const q =
      "q=ad+mosai&midos=emunah,bitachon&midos.mode=all&advisories=death,persecution&people=baal_shem_tov&people.not=noach&people.role=central&age=6-9&year=5745-5750&scope=full&sort=date&view=table&page=3";
    const s = parseState(new URLSearchParams(q), keys);
    expect(s.q).toBe("ad mosai");
    expect(s.sel["midos"]).toEqual({ any: ["emunah", "bitachon"], not: [], all: true });
    expect(s.sel["advisories"]?.any).toEqual(["death", "persecution"]);
    expect(s.sel["people"]).toEqual({ any: ["baal_shem_tov"], not: ["noach"], all: false });
    expect(s.role).toBe("central");
    expect(s.age).toEqual([6, 9]);
    expect(s.year).toEqual([5745, 5750]);
    expect(s.scope).toBe("full");
    expect(s.view).toBe("table");
    expect(s.page).toBe(3);
    expect(parseState(new URLSearchParams(toQuery(s, keys)), keys)).toEqual(s);
  });

  it("omits defaults and ignores junk", () => {
    expect(toQuery(defaultState(), keys)).toBe("");
    const s = parseState(new URLSearchParams("sort=nope&age=3-16&page=-2&scope=x"), keys);
    expect(s).toEqual(defaultState());
  });

  it("lang=any means 'no language filter, on purpose' and survives a round trip", () => {
    const s = parseState(new URLSearchParams("lang=any&midos=emunah"), keys);
    expect(s.langAny).toBe(true);
    expect(s.sel["lang"]).toBeUndefined();
    expect(parseState(new URLSearchParams(toQuery(s, keys)), keys)).toEqual(s);
    // A real language filter wins over lang=any in the same state.
    const t = toggleValue(s, "lang", "yi", "any");
    expect(toQuery(t, keys)).toContain("lang=yi");
    expect(toQuery(t, keys)).not.toContain("lang=any");
    expect(parseState(new URLSearchParams("lang=yi"), keys).langAny).toBe(false);
    // `any` mixed with a real value: the real value is kept, not dropped.
    const mixed = parseState(new URLSearchParams("lang=any,yi"), keys);
    expect(mixed.langAny).toBe(false);
    expect(mixed.sel["lang"]?.any).toEqual(["yi"]);
  });

  it("toggling moves a value between include and exclude and resets the page", () => {
    let s = { ...defaultState(), page: 4 };
    s = toggleValue(s, "midos", "emunah", "any");
    expect(s.sel["midos"]?.any).toEqual(["emunah"]);
    expect(s.page).toBe(1);
    s = toggleValue(s, "midos", "emunah", "not");
    expect(s.sel["midos"]).toEqual({ any: [], not: ["emunah"], all: false });
    s = toggleValue(s, "midos", "emunah", "not");
    expect(s.sel["midos"]).toBeUndefined();
  });
});

describe("on the real catalogue", () => {
  const cat = libCatalog();
  const index = new FacetIndex(cat.rows, LIBRARY_FACETS);

  it("midos=hakaras_hatov + age 6+ + under 15 min matches a direct reference query, counts included", () => {
    const s = parseState(
      new URLSearchParams("midos=hakaras_hatov&age=6-16&length=lt5,5-15"),
      LIBRARY_FACETS.map((d) => d.key),
    );
    const got = ids2(applyFacets(index, s, rangeConstraints(cat.rows, s)));
    const ref = cat.rows
      .filter(
        (r) => r.preferred && r.midos.includes("hakaras_hatov") && r.age >= 6 && r.dur < 15 * 60,
      )
      .map((r) => r.id)
      .sort();
    expect(got.sort()).toEqual(ref);
    expect(ref.length).toBeGreaterThan(0);
    // Every count beside a value equals the size of the result after ticking it.
    for (const key of ["midos", "length", "type", "advisories"]) {
      const counts = facetCounts(index, s, key, rangeConstraints(cat.rows, s));
      for (const [v, n] of [...counts].slice(0, 12)) {
        const def = LIBRARY_FACETS.find((d) => d.key === key);
        const cur = s.sel[key]?.any ?? [];
        if (def?.kind === "exclude") {
          const base = B.count(applyFacets(index, s, rangeConstraints(cat.rows, s)));
          const without = cur.includes(v)
            ? base
            : B.count(
                applyFacets(index, toggleValue(s, key, v, "any"), rangeConstraints(cat.rows, s)),
              );
          expect(cur.includes(v) ? 0 : base - without, `${key}=${v}`).toBe(cur.includes(v) ? 0 : n);
        } else if (!cur.includes(v)) {
          const ticked = toggleValue(
            { ...s, sel: { ...s.sel, [key]: { any: [], not: [], all: false } } },
            key,
            v,
            "any",
          );
          expect(
            B.count(applyFacets(index, ticked, rangeConstraints(cat.rows, s))),
            `${key}=${v}`,
          ).toBe(n);
        }
      }
    }
    function ids2(b: B.Bits) {
      return B.indices(b).map((i) => cat.rows[i]?.id ?? "");
    }
  });

  it("superseded copies never appear as results", () => {
    const s = defaultState();
    const res = B.indices(applyFacets(index, s, rangeConstraints(cat.rows, s)));
    expect(res.every((i) => cat.rows[i]?.preferred)).toBe(true);
    expect(cat.rows.some((r) => !r.preferred)).toBe(true);
  });

  it("length buckets", () => {
    expect([59, 300, 899, 900, 1799, 3600, 4000].map(lengthBucket)).toEqual([
      "lt5",
      "5-15",
      "5-15",
      "15-30",
      "15-30",
      "gt60",
      "gt60",
    ]);
  });
});

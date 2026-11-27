/**
 * The language setting against the generated public dataset (docs/design/language-library.md §1,
 * §4): the numbers the design rests on, and that the narrowing never empties a list.
 */
import { describe, expect, it } from "vitest";
import * as B from "../src/lib/bits.ts";
import {
  applyFacets,
  FacetIndex,
  facetCounts,
  LIBRARY_FACETS,
  parseState,
  rangeConstraints,
} from "../src/lib/facets.ts";
import { otherLangCount, scopeInfo, withPrefParam } from "../src/lib/lang.ts";
import { libCatalog, rows, usageLangs, vocab } from "../src/lib/site-data.ts";

const pub = rows().filter((r) => r.preferred);
const keys = LIBRARY_FACETS.map((d) => d.key);

describe("the material", () => {
  it("public rows are mostly English, with a real Yiddish shelf and one Hebrew fragment", () => {
    const by = (l: string) => pub.filter((r) => r.lang === l).length;
    expect(by("en")).toBeGreaterThan(1000);
    expect(by("yi")).toBeGreaterThanOrEqual(60);
    expect(by("he")).toBeLessThanOrEqual(1);
    expect(by("en") + by("yi") + by("he")).toBe(pub.length);
    // One class in the series is in English; the home card counts the Yiddish ones only.
    const tanya = pub.filter((r) => r.series === "tanya_yiddish_goldstein" && r.lang === "yi");
    expect(tanya.length).toBeGreaterThan(30);
  });
  it("no Yiddish recording shows a readable transcript", () => {
    expect(pub.filter((r) => r.lang === "yi" && r.has.includes("transcript"))).toEqual([]);
  });
});

describe("/search under a one-language setting", () => {
  const cat = libCatalog();
  const index = new FacetIndex(cat.rows, LIBRARY_FACETS);
  it("the setting fills the facet, and 'Also N' equals the other language's results", () => {
    const qs = withPrefParam("", "en");
    expect(qs).toBe("lang=en");
    const s = parseState(new URLSearchParams(qs ?? ""), keys);
    const extra = rangeConstraints(cat.rows, s);
    const en = B.count(applyFacets(index, s, extra));
    expect(en).toBe(pub.filter((r) => r.lang === "en").length);
    const also = otherLangCount(s.sel["lang"], facetCounts(index, s, "lang", extra));
    expect(also?.n).toBe(pub.length - en);
    const bothState = parseState(new URLSearchParams("lang=any"), keys);
    expect(B.count(applyFacets(index, bothState, rangeConstraints(cat.rows, bothState)))).toBe(
      pub.length,
    );
  });
});

describe("topical lists", () => {
  it("people: some are Yiddish-only, and their own pages are never emptied", () => {
    const langs = usageLangs("people");
    const people = (vocab().lists["people"] ?? []).filter((p) => langs.has(p.id));
    const info = scopeInfo(people.map((p) => langs.get(p.id) ?? []));
    expect(info.hidden.en).toBeGreaterThan(0);
    expect(info.empty).toEqual([]);
    const yiOnly = people.filter((p) => (langs.get(p.id) ?? []).join() === "yi");
    for (const p of yiOnly) {
      const mine = pub.filter((r) => r.people.some(([id]) => id === p.id));
      expect(scopeInfo(mine.map((r) => [r.lang])).empty, p.id).toContain("en");
    }
  });
  it("every term-list language set matches the rows", () => {
    for (const list of ["midos", "works", "calendar", "parshiyos", "places"] as const) {
      for (const [term, langs] of usageLangs(list)) {
        const ref = [
          ...new Set(
            pub
              .filter((r) =>
                (list === "places" ? r.places : list === "works" ? r.works : r[list]).includes(
                  term,
                ),
              )
              .map((r) => r.lang),
          ),
        ].sort();
        expect(langs, `${list}:${term}`).toEqual(ref);
      }
    }
  });
});

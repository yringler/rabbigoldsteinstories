/** Kid search with Yiddish items (docs/design/language-kids.md §4.7). */
import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/lib/build/model.ts";
import { buildSearchIndex } from "../src/lib/build/search-docs.ts";
import { inVariant, type Variant } from "../src/lib/kinds.ts";
import { recLang } from "../src/lib/records.ts";
import {
  MINISEARCH_OPTIONS,
  SEARCH_OPTIONS,
  SUGGESTIONS,
  SUGGESTIONS_YI,
  type SearchDocument,
} from "../src/lib/search.ts";

const m = getModel();
const ms = MiniSearch.loadJSON<SearchDocument>(buildSearchIndex(), MINISEARCH_OPTIONS);
const byId = new Map(m.index.items.map((r) => [r.id, r]));
const yiIds = new Set(m.poolYi.map((k) => k.id));

/** What the client shows: hits filtered by the variant (search.ts, recIn). */
function results(q: string, v: Variant): string[] {
  let hits = ms.search(q, SEARCH_OPTIONS);
  if (hits.length === 0) hits = ms.search(q, { ...SEARCH_OPTIONS, combineWith: "OR" });
  return hits
    .map((h) => byId.get(String(h.id)))
    .filter((r) => r !== undefined && inVariant(r.a, r.v, v, recLang(r)))
    .map((r) => r?.id ?? "");
}

describe("search and languages", () => {
  it("'yiddish' and 'אידיש' find every Yiddish item", () => {
    for (const q of ["yiddish", "אידיש"]) {
      const ids = new Set(results(q, "b-a"));
      for (const id of yiIds) expect(ids.has(id), `${q}: ${id}`).toBe(true);
    }
  });

  it("each Yiddish suggestion chip returns a Yiddish result at Kids band", () => {
    for (const s of SUGGESTIONS_YI) expect(results(s, "k-y").length, s).toBeGreaterThan(0);
  });

  it("English mode never returns a Yiddish id", () => {
    for (const q of [...SUGGESTIONS, ...SUGGESTIONS_YI, "yiddish", "bubby"])
      for (const id of results(q, "b")) expect(yiIds.has(id), `${q}: ${id}`).toBe(false);
  });

  it("Bubby Chaya Malka's name finds her stories", () => {
    const ids = results("Bubby Chaya Malka", "b-y");
    expect(ids.filter((id) => m.items.get(id)?.byline === "Bubby Chaya Malka")).toHaveLength(8);
  });
});

import { describe, expect, it } from "vitest";
import { excerpt, idFromUrl, passagesFromData } from "../src/lib/engine.ts";
import { glossaryRules, searchPassages } from "../src/lib/passages.ts";
import { suggest } from "../src/lib/suggest.ts";
import { normalize, parseQuery, queryVariants, TextIndex, variants } from "../src/lib/text.ts";
import { lastAtOrBefore, timeWords } from "../src/lib/words.ts";
import { libCatalog } from "../src/lib/site-data.ts";
import { FacetIndex, LIBRARY_FACETS } from "../src/lib/facets.ts";
import * as B from "../src/lib/bits.ts";

describe("metadata text search", () => {
  const cat = libCatalog();
  const text = new TextIndex(cat.rows);

  it("normalizes apostrophes, diacritics and punctuation", () => {
    expect(normalize("B'nei  Yisroel — Dayéinu!")).toBe("bnei yisroel dayeinu");
  });

  it("parses phrases and a trailing prefix", () => {
    expect(parseQuery('"ad mosai" king')).toEqual({
      terms: ["king"],
      phrases: ["ad mosai"],
      prefixLast: true,
    });
    expect(parseQuery("king ")).toEqual({ terms: ["king"], phrases: [], prefixLast: false });
  });

  it("ranks a title match above a summary-only match and ANDs words", () => {
    const res = text.search(parseQuery("mystery dayeinu"));
    const ep = cat.rows.findIndex((r) => r.id === "585fe67e3e");
    expect(res.get(ep)).toBe(1);
    for (const [i] of res) {
      const r = cat.rows[i];
      const blob = normalize(
        `${r?.title} ${r?.summary} ${r?.lesson} ${r?.keywords.join(" ")} ${r?.characters.join(" ")} ${r?.places.join(" ")} ${r?.he ?? ""}`,
      );
      expect(blob.includes("mystery") && blob.includes("dayeinu")).toBe(true);
    }
  });

  it("transliteration variants", () => {
    expect(variants("dayeinu")).toContain("dayenu");
    expect(variants("tzedaka")).toContain("tzedakah");
    expect(variants("chanukah")).toContain("khanukah");
    expect(queryVariants('"exact"')).toEqual([]);
    expect(queryVariants("dayeinu song").length).toBeLessThanOrEqual(5);
  });
});

describe("vocabulary-first suggestions", () => {
  const cat = libCatalog();
  const index = new FacetIndex(cat.rows, LIBRARY_FACETS);
  const src = {
    vocab: cat.vocab,
    counts: (f: string, v: string) => B.count(index.bits(f, v)),
    places: index.values("places"),
    serials: cat.serials,
    episodes: new Set(cat.rows.filter((r) => r.ep !== undefined).map((r) => r.ep as number)),
  };

  it("'tzedaka' offers the Mitzvah Tzedakah first (acceptance 11)", () => {
    const s = suggest("tzedaka", src);
    expect(s[0]).toMatchObject({
      kind: "facet",
      facet: "mitzvos",
      value: "tzedakah",
      group: "Mitzvah",
    });
  });

  it("episode numbers link to the episode", () => {
    expect(suggest("ep 271", src)[0]).toMatchObject({ kind: "link", href: "/radio/ep/271/" });
  });

  it("never offers placeholder aliases", () => {
    const placeholders = Object.values(cat.vocab)
      .flat()
      .filter((v) => v[2] === 1);
    expect(placeholders.every((v) => v[3].length === 0)).toBe(true);
  });
});

describe("transcript passages and excerpts", () => {
  it("groups masked search lines into ~30 s passages keyed by start second, with glossary forms appended", () => {
    const rules = glossaryRules([{ correct: "Im Yirtzeh Hashem", heard: ["Amir Tzah Hashem"] }]);
    const p = searchPassages(
      [
        [2.4, "Shalom children."],
        [20, "Amir Tzah Hashem we will."],
        [31, "Next part."],
        [70, "Later."],
      ],
      30,
      rules,
    );
    expect(p).toEqual([
      { t: 2, text: "Shalom children. Amir Tzah Hashem we will. Next part. (Im Yirtzeh Hashem)" },
      { t: 70, text: "Later." },
    ]);
  });

  it("maps Pagefind match locations to passage start times via the <p id='t…'> anchors", () => {
    const content = "one two three four five six seven eight nine ten";
    const data = {
      content,
      locations: [1, 7, 8],
      anchors: [
        { element: "p", id: "t5", location: 0 },
        { element: "p", id: "t40", location: 5 },
      ],
    };
    const en = passagesFromData(data, true, 3);
    expect(en.passages.map((p) => p.t)).toEqual([5, 40]);
    expect(en.passages[0]?.excerpt).toContain("<mark>two</mark>");
    expect(en.more).toBe(0);
    const yi = passagesFromData(data, false, 1);
    expect(yi.passages).toEqual([{ t: 5, excerpt: null }]);
    expect(yi.more).toBe(1);
    expect(idFromUrl("/r/585fe67e3e/")).toBe("585fe67e3e");
  });

  it("escapes excerpt text", () => {
    expect(excerpt(["<b>", "x"], [1])).toBe("&lt;b&gt; <mark>x</mark>");
  });
});

describe("word timings", () => {
  it("interpolates across the line in proportion to word length", () => {
    const w = timeWords("Hi there everyone", 10, 20);
    expect(w.map((x) => x.text)).toEqual(["Hi", "there", "everyone"]);
    expect(w[0]?.t).toBe(10);
    expect(w[1]?.t).toBeGreaterThan(10);
    expect(w[2]?.t).toBeLessThan(20);
    expect(w.map((x) => x.space).join("|")).toBe("| | ");
  });
  it("binary search", () => {
    expect(lastAtOrBefore([0, 5, 10], 7)).toBe(1);
    expect(lastAtOrBefore([0, 5, 10], -1)).toBe(-1);
    expect(lastAtOrBefore([0, 5, 10], 10)).toBe(2);
  });
});

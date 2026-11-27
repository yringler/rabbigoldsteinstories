/** Language setting helpers (docs/design/language-library.md), pure. */
import { describe, expect, it } from "vitest";
import { defaultState, parseState, type SearchState, toQuery } from "../src/lib/facets.ts";
import {
  DEFAULT_LANG,
  followPref,
  LANG_KEY,
  LANG_LABELS,
  langChipIsPref,
  langFromSearch,
  langHas,
  langParamSetsPref,
  normalizeLangAny,
  noteText,
  otherLangCount,
  parseLang,
  prefFacet,
  scopeInfo,
  searchLangPref,
  searchWithoutLang,
  transcriptLangs,
  withPrefParam,
} from "../src/lib/lang.ts";

const sel = (any: string[], not: string[] = []) => ({ any, not, all: false });
const withLang = (any: string[], not: string[] = []): SearchState => ({
  ...defaultState(),
  sel: { lang: sel(any, not) },
});

describe("the shared contract", () => {
  it("values, key, labels and the library default", () => {
    expect(LANG_KEY).toBe("lang");
    expect(DEFAULT_LANG).toBe("any");
    expect(LANG_LABELS).toEqual({ en: "English", yi: "Yiddish / אידיש", any: "Both" });
    expect(parseLang("yi")).toBe("yi");
    expect(parseLang("fr")).toBe("any");
    expect(parseLang(undefined)).toBe("any");
  });
  it("?lang= is read case-insensitively and removed cleanly", () => {
    expect(langFromSearch("?lang=YI ")).toBe("yi");
    expect(langFromSearch("?lang=any")).toBe("any");
    expect(langFromSearch("?lang=fr")).toBeNull();
    expect(langFromSearch("?q=x")).toBeNull();
    expect(searchWithoutLang("?lang=en")).toBe("");
    expect(searchWithoutLang("?a=1&lang=en&b=x,y")).toBe("?a=1&b=x,y");
  });
  it("?lang= sets the setting everywhere but /search/", () => {
    expect(langParamSetsPref("/")).toBe(true);
    expect(langParamSetsPref("/people/")).toBe(true);
    expect(langParamSetsPref("/search/")).toBe(false);
    expect(langParamSetsPref("/search")).toBe(false);
    expect(langParamSetsPref("/searching/")).toBe(true);
  });
});

describe("/search and the setting", () => {
  it("fills an absent lang from a one-language setting only", () => {
    expect(withPrefParam("?q=bear", "yi")).toBe("q=bear&lang=yi");
    expect(withPrefParam("", "en")).toBe("lang=en");
    expect(withPrefParam("?q=bear", "any")).toBeNull();
    expect(withPrefParam("?lang=any", "yi")).toBeNull();
    expect(withPrefParam("?lang.not=yi", "yi")).toBeNull();
    expect(withPrefParam("?lang=en", "yi")).toBeNull();
  });
  it("lang=any round-trips through the URL state", () => {
    const s = parseState(new URLSearchParams("lang=any&q=x"), ["lang"]);
    expect(s.langAny).toBe(true);
    expect(s.sel["lang"]).toBeUndefined();
    expect(toQuery(s, ["lang"])).toBe("q=x&lang=any");
    expect(toQuery(withLang(["yi"]), ["lang"])).toBe("lang=yi");
  });
  it("prefFacet and searchLangPref", () => {
    expect(prefFacet("any")).toBeNull();
    expect(prefFacet("yi")).toEqual(["yi"]);
    expect(searchLangPref(undefined)).toBe("any");
    expect(searchLangPref(sel(["en"]))).toBe("en");
    expect(searchLangPref(sel(["he"]))).toBeNull();
    expect(searchLangPref(sel(["en", "yi"]))).toBeNull();
    expect(searchLangPref(sel([], ["yi"]))).toBeNull();
  });
  it("the chip is 'your setting' only when it matches", () => {
    expect(langChipIsPref(sel(["en"]), "en")).toBe(true);
    expect(langChipIsPref(sel(["en"]), "yi")).toBe(false);
    expect(langChipIsPref(undefined, "any")).toBe(false);
  });
  it("removing the language filter under a one-language setting writes lang=any", () => {
    expect(normalizeLangAny(defaultState(), "en").langAny).toBe(true);
    expect(normalizeLangAny(defaultState(), "any").langAny).toBe(false);
    expect(normalizeLangAny({ ...withLang(["yi"]), langAny: true }, "en").langAny).toBe(false);
  });
  it("a filter that came from the old setting follows the new one", () => {
    expect(followPref(withLang(["en"]), "en", "yi")?.sel["lang"]?.any).toEqual(["yi"]);
    expect(followPref(withLang(["en"]), "en", "any")?.sel["lang"]).toBeUndefined();
    expect(followPref(defaultState(), "any", "en")?.sel["lang"]?.any).toEqual(["en"]);
    // A filter the visitor chose, or lang=any, stays.
    expect(followPref(withLang(["yi"]), "en", "any")).toBeNull();
    expect(followPref({ ...defaultState(), langAny: true }, "any", "en")).toBeNull();
  });
  it("'Also N in …' from the disjunctive counts", () => {
    const counts = new Map([
      ["en", 40],
      ["yi", 12],
      ["he", 0],
    ]);
    expect(otherLangCount(sel(["en"]), counts)).toEqual({ n: 12, label: "in Yiddish" });
    expect(otherLangCount(sel(["yi"]), counts)).toEqual({ n: 40, label: "in English" });
    expect(otherLangCount(sel(["yi"]), new Map([...counts, ["he", 1]]))).toEqual({
      n: 41,
      label: "in other languages",
    });
    expect(otherLangCount(undefined, counts)).toBeNull();
    expect(otherLangCount(sel(["en", "yi"]), counts)).toBeNull();
    expect(otherLangCount(sel(["en"]), new Map([["en", 3]]))).toBeNull();
  });
});

describe("transcript search follows script and filter", () => {
  it("Latin → English index, Hebrew letters → Yiddish index", () => {
    expect(transcriptLangs("emunah", undefined)).toEqual({
      langs: ["en"],
      script: "en",
      blocked: null,
    });
    expect(transcriptLangs("אמונה", undefined).langs).toEqual(["yi"]);
    expect(transcriptLangs("אמונה", sel(["yi"])).langs).toEqual(["yi"]);
    expect(transcriptLangs("emunah", sel(["en", "yi"])).langs).toEqual(["en"]);
  });
  it("a filter that rules out the script's index downloads nothing", () => {
    expect(transcriptLangs("אמונה", sel(["en"]))).toEqual({
      langs: [],
      script: "yi",
      blocked: "hebrew-under-en",
    });
    expect(transcriptLangs("emunah", sel(["yi"])).blocked).toBe("latin-under-yi");
    expect(transcriptLangs("emunah", sel([], ["en"])).langs).toEqual([]);
    expect(transcriptLangs("emunah", sel(["he"])).langs).toEqual([]);
  });
});

describe("build-time narrowing of lists", () => {
  it("langHas is sorted and distinct", () => {
    expect(langHas(["yi", "en", "yi"])).toBe("en yi");
    expect(langHas([])).toBe("");
  });
  it("scopeInfo counts hidden rows and never lets a list go empty", () => {
    const i = scopeInfo([["en"], ["en", "yi"], ["yi"], ["he"]]);
    expect(i.hidden).toEqual({ en: 2, yi: 2 });
    expect(i.empty).toEqual([]);
    const onlyYi = scopeInfo([["yi"], ["yi"]]);
    expect(onlyYi.empty).toEqual(["en"]);
    expect(onlyYi.emptyAttr).toBe("en");
    expect(scopeInfo([]).empty).toEqual([]);
  });
  it("note texts", () => {
    const i = scopeInfo([["en"], ["yi"], ["yi"]]);
    expect(noteText(i, "en", { one: "recording", many: "recordings" })).toBe(
      "2 recordings not in English are hidden by your language setting (English).",
    );
    expect(noteText(i, "yi", { one: "person", many: "people", terms: true })).toBe(
      "1 person with no Yiddish recording is hidden by your language setting (Yiddish).",
    );
    expect(noteText(scopeInfo([["en"]]), "en", { one: "x", many: "xs" })).toBeNull();
    expect(noteText(scopeInfo([["yi"]]), "en", { one: "x", many: "xs" })).toBe(
      "Nothing here is in English; showing all languages.",
    );
  });
});

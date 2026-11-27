import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANG,
  effectiveLang,
  LANG_KEY,
  LANG_LABELS,
  LANGS,
  langFromSearch,
  layoutFor,
  parseLang,
  searchWithoutLang,
  statusLine,
  type LangPref,
} from "../src/lib/lang.ts";

describe("language preference (docs/design/language-bedtime.md §2)", () => {
  it("uses the shared contract's key, values, labels and the bedtime default", () => {
    expect(LANG_KEY).toBe("lang");
    expect(LANGS).toEqual(["en", "yi", "any"]);
    expect(DEFAULT_LANG).toBe("en");
    expect(LANG_LABELS).toEqual({ en: "English", yi: "Yiddish / אידיש", any: "Both" });
  });

  it("parseLang: invalid or missing stored values count as English", () => {
    expect(parseLang("yi")).toBe("yi");
    expect(parseLang("any")).toBe("any");
    expect(parseLang("en")).toBe("en");
    for (const bad of [null, undefined, "", "YI", "fr", 1, {}, ["yi"], "constructor"])
      expect(parseLang(bad)).toBe("en");
  });

  it("langFromSearch: valid values, case-insensitive; anything else is ignored", () => {
    expect(langFromSearch("?lang=yi")).toBe("yi");
    expect(langFromSearch("?lang=YI")).toBe("yi");
    expect(langFromSearch("?lang=%20any%20")).toBe("any");
    expect(langFromSearch("?play=mix&lang=en")).toBe("en");
    expect(langFromSearch("?lang=fr")).toBeNull();
    expect(langFromSearch("?lang=")).toBeNull();
    expect(langFromSearch("")).toBeNull();
    expect(langFromSearch("?language=yi")).toBeNull();
  });

  it("searchWithoutLang keeps the other parameters", () => {
    expect(searchWithoutLang("?lang=yi")).toBe("");
    expect(searchWithoutLang("?play=mix&lang=yi")).toBe("?play=mix");
    expect(searchWithoutLang("?a=1&lang=any&b=2")).toBe("?a=1&b=2");
  });

  it("layoutFor: every preference × shelf size", () => {
    const want: Record<LangPref, ReturnType<typeof layoutFor>> = {
      en: { yiddish: "none", englishCollapsed: false },
      any: { yiddish: "last", englishCollapsed: false },
      yi: { yiddish: "first", englishCollapsed: true },
    };
    for (const lang of LANGS) {
      expect(layoutFor(lang, 0)).toEqual({ yiddish: "none", englishCollapsed: false });
      expect(effectiveLang(lang, 0)).toBe("en");
      for (const size of [3, 11]) {
        expect(layoutFor(lang, size)).toEqual(want[lang]);
        expect(effectiveLang(lang, size)).toBe(lang);
      }
    }
  });

  it("status lines", () => {
    expect(statusLine("en")).toBe("Showing English stories.");
    expect(statusLine("yi")).toBe("Showing Yiddish stories first.");
    expect(statusLine("any")).toBe("Showing English and Yiddish stories.");
  });
});

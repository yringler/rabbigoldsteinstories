/**
 * Language preference (docs/design/language-bedtime.md §2): the shared contract's values
 * `en | yi | any`, stored per site as `goldstein:bedtime:lang` ({"v":"yi"}) through
 * createStore("bedtime"). The bedtime default is English: with `en` the site is exactly what it
 * was before the setting existed. Pure, so it is unit-tested in Node.
 */

export type LangPref = "en" | "yi" | "any";

/** Store key (createStore("bedtime") → localStorage "goldstein:bedtime:lang"). */
export const LANG_KEY = "lang";

export const DEFAULT_LANG: LangPref = "en";

/** In the order the control shows them. */
export const LANGS: readonly LangPref[] = ["en", "yi", "any"];

/** UI labels (shared contract). The Hebrew-script run is marked up with lang="yi" dir="rtl" where rendered. */
export const LANG_LABELS: Readonly<Record<LangPref, string>> = {
  en: "English",
  yi: "Yiddish / אידיש",
  any: "Both",
};

/** The Hebrew-script part of the Yiddish label (rendered in its own lang="yi" dir="rtl" span). */
export const YIDDISH_WORD = "אידיש";

export const isLang = (x: unknown): x is LangPref => x === "en" || x === "yi" || x === "any";

/** A stored value: anything missing or invalid counts as the default, `en`. */
export function parseLang(x: unknown): LangPref {
  return isLang(x) ? x : DEFAULT_LANG;
}

/**
 * `?lang=en|yi|any` from a query string. Case-insensitive and trimmed (`?lang=YI` → "yi"), so a
 * hand-typed shared link still works; anything else (`?lang=fr`, empty, absent) → null, ignored.
 */
export function langFromSearch(search: string): LangPref | null {
  const raw = new URLSearchParams(search).get("lang");
  if (raw === null) return null;
  const v = raw.trim().toLowerCase();
  return isLang(v) ? v : null;
}

/** The query string without `lang` ("" or "?a=b"), for history.replaceState after reading it. */
export function searchWithoutLang(search: string): string {
  const q = new URLSearchParams(search);
  q.delete("lang");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** With no Yiddish shelf (every listed id unpublished), any stored preference acts as `en`. */
export function effectiveLang(lang: LangPref, shelfSize: number): LangPref {
  return shelfSize > 0 ? lang : "en";
}

export interface HomeLayout {
  /** Where the Yiddish card goes: not at all, after Radio Night, or above everything. */
  yiddish: "none" | "last" | "first";
  /** Tonight's English playlists folded under a "Tonight in English" button. */
  englishCollapsed: boolean;
}

/** The home page arrangement for a preference (design §3.1). */
export function layoutFor(lang: LangPref, shelfSize: number): HomeLayout {
  switch (effectiveLang(lang, shelfSize)) {
    case "yi":
      return { yiddish: "first", englishCollapsed: true };
    case "any":
      return { yiddish: "last", englishCollapsed: false };
    default:
      return { yiddish: "none", englishCollapsed: false };
  }
}

/** Polite status line after the visitor changes the setting. */
export function statusLine(lang: LangPref): string {
  if (lang === "yi") return "Showing Yiddish stories first.";
  if (lang === "any") return "Showing English and Yiddish stories.";
  return "Showing English stories.";
}

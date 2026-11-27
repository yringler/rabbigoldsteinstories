/**
 * Language preference (docs/design/language-library.md). The shared contract's values `en | yi |
 * any`, stored per site as `goldstein:library:lang` ({"v":"yi"}) through createStore("library").
 * The library default is `any` ("Both"): with it the site is exactly what it was before the
 * setting existed. Pure (no DOM), so it is unit-tested in Node and shared by build and browser.
 */
import type { TranscriptLang } from "./engine.ts";
import type { FacetSel, SearchState } from "./facets.ts";
import { hasHebrewScript } from "./text.ts";

export type LangPref = "en" | "yi" | "any";

/** Store key (createStore("library") → localStorage "goldstein:library:lang"). */
export const LANG_KEY = "lang";

export const DEFAULT_LANG: LangPref = "any";

/** In the order the control shows them. */
export const LANGS: readonly LangPref[] = ["en", "yi", "any"];

/** UI labels (shared contract). The Hebrew-script run is marked up lang="yi" dir="rtl" where rendered. */
export const LANG_LABELS: Readonly<Record<LangPref, string>> = {
  en: "English",
  yi: "Yiddish / אידיש",
  any: "Both",
};

/** The Hebrew-script part of the Yiddish label (rendered in its own lang="yi" dir="rtl" span). */
export const YIDDISH_WORD = "אידיש";

/** Plain names of a recording's primary language (never the Hebrew-script label). */
export const LANG_NAMES: Readonly<Record<string, string>> = {
  en: "English",
  yi: "Yiddish",
  he: "Hebrew",
};

export const isLang = (x: unknown): x is LangPref => x === "en" || x === "yi" || x === "any";

/** A stored value: anything missing or invalid counts as the default, `any`. */
export function parseLang(x: unknown): LangPref {
  return isLang(x) ? x : DEFAULT_LANG;
}

/**
 * `?lang=en|yi|any` from a query string. Case-insensitive and trimmed (`?lang=YI` → "yi"), so a
 * hand-typed link still works; anything else (`?lang=fr`, empty, absent) → null, ignored.
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
  const s = q.toString().replace(/%2C/g, ",");
  return s ? `?${s}` : "";
}

/** Whether `?lang=` on this path sets the preference (everywhere except /search/, where it is the facet). */
export const langParamSetsPref = (path: string): boolean => !/^\/search(\/|$)/.test(path);

/** Polite status line after the visitor changes the setting. */
export function statusLine(lang: LangPref): string {
  if (lang === "any") return "Language setting: Both. Lists show English and Yiddish.";
  return `Language setting: ${LANG_NAMES[lang]}. Search and lists show ${LANG_NAMES[lang]} recordings, with a note about the rest; recording pages always show everything.`;
}

// ---------------------------------------------------------------------------------------------
// /search (design §3)

/** The facet values a preference stands for (`any` → no filter). */
export function prefFacet(pref: LangPref): string[] | null {
  return pref === "any" ? null : [pref];
}

/**
 * When the URL has no `lang`, a one-language preference fills the facet. Returns the new query
 * string, or null when nothing changes (preference `any`, or the URL already says something,
 * including `lang=any`).
 */
export function withPrefParam(search: string, pref: LangPref): string | null {
  const p = new URLSearchParams(search);
  if (p.has("lang") || p.has("lang.not") || pref === "any") return null;
  p.set("lang", pref);
  return p.toString().replace(/%2C/g, ",");
}

/** The language a search stands for, if it is one a preference can express (else null). */
export function searchLangPref(sel: FacetSel | undefined): LangPref | null {
  if (!sel || (!sel.any.length && !sel.not.length)) return "any";
  if (sel.not.length) return null;
  if (sel.any.length === 1 && (sel.any[0] === "en" || sel.any[0] === "yi")) return sel.any[0];
  return null;
}

/** The language chip is the visitor's own setting (shown as "(your setting)"). */
export function langChipIsPref(sel: FacetSel | undefined, pref: LangPref): boolean {
  return pref !== "any" && searchLangPref(sel) === pref;
}

/**
 * After a change to the facets: with no language filter left and a one-language preference, the
 * URL carries `lang=any`, so a reload doesn't bring the preference back. A language filter clears it.
 */
export function normalizeLangAny(s: SearchState, pref: LangPref): SearchState {
  const has = !!s.sel["lang"];
  const langAny = !has && pref !== "any";
  return s.langAny === langAny ? s : { ...s, langAny };
}

/** Swap the facet to a new preference when the current one came from the old preference. */
export function followPref(s: SearchState, from: LangPref, to: LangPref): SearchState | null {
  const cur = searchLangPref(s.sel["lang"]);
  const fromPref = from === "any" ? cur === "any" && !s.langAny : cur === from;
  if (!fromPref || from === to) return null;
  const sel = { ...s.sel };
  const f = prefFacet(to);
  if (f) sel["lang"] = { any: f, not: [], all: false };
  else delete sel["lang"];
  return { ...s, sel, langAny: false, page: 1 };
}

/**
 * The "Also N in Yiddish · Show" line: with exactly one language selected, how many results the
 * other languages would add (from the disjunctive facet counts) and how to name them.
 */
export function otherLangCount(
  sel: FacetSel | undefined,
  counts: ReadonlyMap<string, number>,
): { n: number; label: string } | null {
  if (!sel || sel.any.length !== 1 || sel.not.length) return null;
  const chosen = sel.any[0];
  const others = [...counts.entries()].filter(([v, n]) => v !== chosen && n > 0);
  const n = others.reduce((a, [, x]) => a + x, 0);
  if (!n) return null;
  const only = others.length === 1 ? others[0]?.[0] : undefined;
  const label = only ? `in ${LANG_NAMES[only] ?? only}` : "in other languages";
  return { n, label };
}

// ---------------------------------------------------------------------------------------------
// Transcript search (design §3.1)

export type ScriptBlock = "hebrew-under-en" | "latin-under-yi" | null;

/**
 * Which transcript indexes a query searches: the query's script picks the index (Hebrew letters
 * → Yiddish, else English), and the language filter can rule it out. An empty list downloads no
 * index; `blocked` says why, for the status line.
 */
export function transcriptLangs(
  q: string,
  sel: FacetSel | undefined,
): { langs: TranscriptLang[]; script: TranscriptLang; blocked: ScriptBlock } {
  const script: TranscriptLang = hasHebrewScript(q) ? "yi" : "en";
  const any = sel?.any ?? [];
  const not = sel?.not ?? [];
  const ok = (any.length === 0 || any.includes(script)) && !not.includes(script);
  if (ok) return { langs: [script], script, blocked: null };
  return { langs: [], script, blocked: script === "yi" ? "hebrew-under-en" : "latin-under-yi" };
}

export function blockedMessage(b: Exclude<ScriptBlock, null>, filterLabel: string): string {
  return b === "hebrew-under-en"
    ? `Words in Hebrew letters search the Yiddish recordings, but the language filter is ${filterLabel}, so no transcripts were searched. Titles and summaries were.`
    : `Words in English letters search the English transcripts, but the language filter is ${filterLabel}, so no transcripts were searched. Type Yiddish words in Hebrew letters (for example אמונה).`;
}

// ---------------------------------------------------------------------------------------------
// Build time: CSS-only narrowing of topical lists (design §4)

/** `data-lang-has` value: the distinct languages, sorted, space-separated. */
export function langHas(langs: Iterable<string>): string {
  return [...new Set(langs)].sort().join(" ");
}

export interface ScopeInfo {
  /** Rows hidden under each one-language setting. */
  hidden: { en: number; yi: number };
  /** Settings under which every row would be hidden: the scope is then left unfiltered. */
  empty: ("en" | "yi")[];
  /** `data-lang-empty` attribute value ("" → omit). */
  emptyAttr: string;
  total: number;
}

/** Counts for a scope from each row's languages. */
export function scopeInfo(rows: readonly (readonly string[])[]): ScopeInfo {
  const hidden = { en: 0, yi: 0 };
  for (const langs of rows) {
    if (!langs.includes("en")) hidden.en++;
    if (!langs.includes("yi")) hidden.yi++;
  }
  const total = rows.length;
  const empty = (["en", "yi"] as const).filter((p) => total > 0 && hidden[p] === total);
  return { hidden, empty, emptyAttr: empty.join(" "), total };
}

/**
 * Text of the note for one setting (null → nothing to say). `noun` names the rows: recordings
 * ("3 recordings not in English…") or terms ("13 people with no English recording…").
 */
export function noteText(
  info: ScopeInfo,
  pref: "en" | "yi",
  noun: { one: string; many: string; terms?: boolean },
): string | null {
  const name = LANG_NAMES[pref] ?? pref;
  if (info.empty.includes(pref)) return `Nothing here is in ${name}; showing all languages.`;
  const n = info.hidden[pref];
  if (!n) return null;
  const what = n === 1 ? noun.one : noun.many;
  const why = noun.terms ? `with no ${name} recording` : `not in ${name}`;
  return `${n.toLocaleString("en")} ${what} ${why} ${n === 1 ? "is" : "are"} hidden by your language setting (${name}).`;
}

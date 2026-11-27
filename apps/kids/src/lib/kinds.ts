/**
 * Kinds, age bands and view variants (docs/sites/kids.md §2, §8.1, §8.2). Browser-safe: used by the
 * build and by the client scripts, so the two can never disagree about who sees what.
 */

/** The site's main type of recording. */
export type Kind = "show" | "story" | "short" | "event" | "song";

export const KIND_LABEL: Readonly<Record<Kind, string>> = {
  show: "Radio show",
  story: "Story",
  short: "Quick listen",
  event: "Event",
  song: "Song",
};

export function kindOf(contentType: string, storyType: readonly string[]): Kind | null {
  switch (contentType) {
    case "radio_episode":
      return "show";
    case "story":
    case "story_chapter":
    case "lesson_with_story":
    case "story_collection":
      return "story";
    case "radio_segment":
      return storyType.length > 0 ? "story" : "short";
    case "talk":
      return "short";
    case "live_event":
      return "event";
    case "song":
      return "song";
    default:
      return null;
  }
}

export type Band = "little" | "kids" | "big";
export const BANDS: readonly Band[] = ["little", "kids", "big"];
export const DEFAULT_BAND: Band = "kids";

export const BAND_INFO: Readonly<Record<Band, { label: string; ages: string; blurb: string }>> = {
  little: { label: "Little", ages: "3–5", blurb: "Short and gentle" },
  kids: { label: "Kids", ages: "6–8", blurb: "Most stories" },
  big: { label: "Big Kids", ages: "9+", blurb: "Everything here" },
};

/** Highest advisory severity, coded small: 0 none, 1 mild, 2 moderate (strong never reaches the pool). */
export type Adv = 0 | 1 | 2;

export function advCode(maxAdvisory: string): Adv {
  return maxAdvisory === "none" ? 0 : maxAdvisory === "mild" ? 1 : 2;
}

/**
 * Band rule (§8.1 plus DECISIONS "Website decisions": Little also admits age_min 5 with no advisories).
 */
export function inBand(ageMin: number, adv: Adv, band: Band): boolean {
  if (band === "big") return true;
  if (adv >= 2) return false;
  if (band === "kids") return ageMin <= 6;
  return ageMin <= 4 || (ageMin === 5 && adv === 0);
}

/** Language preference (docs/design/language-kids.md §2): English only, Yiddish only, or both. */
export type Lang = "en" | "yi" | "any";
export const LANGS: readonly Lang[] = ["en", "yi", "any"];
/** English by default: today's behaviour, and most child listeners don't understand Yiddish. */
export const DEFAULT_LANG: Lang = "en";
/** The language of an item on this site: Yiddish or English (the pool holds nothing else). */
export type ItemLang = "en" | "yi";

export const isLang = (x: unknown): x is Lang => x === "en" || x === "yi" || x === "any";

/** Labels of the shared cross-site contract; `he` is the Hebrew-script run (lang="yi" dir="rtl"). */
export const LANG_INFO: Readonly<Record<Lang, { label: string; he?: string; blurb: string }>> = {
  en: { label: "English", blurb: "Most stories" },
  yi: { label: "Yiddish", he: "אידיש", blurb: "so far" },
  any: { label: "Both", blurb: "English and Yiddish" },
};

/** Toast after a language change (§7.1). */
export const LANG_TOAST: Readonly<Record<Lang, string>> = {
  en: "Showing English stories",
  yi: "Showing Yiddish stories",
  any: "Showing English and Yiddish stories",
};

type BandCode = "l" | "k" | "b";
type LangSuffix = "" | "-y" | "-a";
/**
 * A view variant = band + the Gentle switch + the language preference. CSS hides anything whose
 * data-vis lacks the active one. English keeps the six tokens it had before languages existed.
 */
export type Variant = `${BandCode}${"" | "g"}${LangSuffix}`;
const BAND_CODES: readonly BandCode[] = ["l", "k", "b"];
const LANG_SUFFIX: Readonly<Record<Lang, LangSuffix>> = { en: "", yi: "-y", any: "-a" };
export const VARIANTS: readonly Variant[] = LANGS.flatMap((l) =>
  [false, true].flatMap((g) =>
    BAND_CODES.map((b) => `${b}${g ? "g" : ""}${LANG_SUFFIX[l]}` as Variant),
  ),
);
/** The variants of one language preference. */
export const variantsOfLang = (l: Lang): Variant[] => VARIANTS.filter((v) => variantLang(v) === l);

export function variantOf(band: Band, gentle: boolean, lang: Lang = DEFAULT_LANG): Variant {
  const b = band === "little" ? "l" : band === "kids" ? "k" : "b";
  return `${b}${gentle ? "g" : ""}${LANG_SUFFIX[lang]}` as Variant;
}

const baseOf = (v: Variant): string => v.split("-")[0] ?? v;

export function variantBand(v: Variant): Band {
  const b = baseOf(v);
  return b.startsWith("l") ? "little" : b.startsWith("k") ? "kids" : "big";
}

export const variantGentle = (v: Variant): boolean => baseOf(v).endsWith("g");

export function variantLang(v: Variant): Lang {
  return v.endsWith("-y") ? "yi" : v.endsWith("-a") ? "any" : "en";
}

/** The same band and language with the Gentle switch off. */
export const withoutGentle = (v: Variant): Variant =>
  variantOf(variantBand(v), false, variantLang(v));
/** The same band and Gentle switch with another language preference. */
export const withLang = (v: Variant, l: Lang): Variant =>
  variantOf(variantBand(v), variantGentle(v), l);

export const langAllows = (pref: Lang, itemLang: ItemLang): boolean =>
  pref === "any" || pref === itemLang;

export function inVariant(
  ageMin: number,
  adv: Adv,
  v: Variant,
  itemLang: ItemLang = "en",
): boolean {
  return (
    inBand(ageMin, adv, variantBand(v)) &&
    (!variantGentle(v) || adv === 0) &&
    langAllows(variantLang(v), itemLang)
  );
}

export function variantsOf(ageMin: number, adv: Adv, itemLang: ItemLang = "en"): Variant[] {
  return VARIANTS.filter((v) => inVariant(ageMin, adv, v, itemLang));
}

/** Band and Gentle only (every language): for opt-in lists such as /yiddish/ and direct links. */
export function variantsOfAnyLang(ageMin: number, adv: Adv): Variant[] {
  return VARIANTS.filter(
    (v) => inBand(ageMin, adv, variantBand(v)) && (!variantGentle(v) || adv === 0),
  );
}

/** Byline (§5.7): only the confirmed family storytellers get one (never a placeholder speaker). */
export const BYLINES: Readonly<Record<string, string>> = {
  rabbi_yosef_goldstein: "Uncle Yossi",
  rabbi_chaim_levi_goldstein: "Rabbi Chaim Levi Goldstein",
  bubby_chaya_malka: "Bubby Chaya Malka",
};

export function bylineOf(speakers: readonly string[]): string | null {
  for (const s of speakers) {
    const b = BYLINES[s];
    if (b) return b;
  }
  return null;
}

/** "12 min", "1 h 5 min", "45 sec" for kids (no seconds unless short). */
export function minutes(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} sec`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "3:05" / "1:02:09" clock. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

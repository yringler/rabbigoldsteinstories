/**
 * Kid-safe search (docs/sites/kids.md §6.5): MiniSearch over the kids' export only. The index is built
 * at build time and loaded on /search; the options below are shared so build and client tokenise the
 * same way. Never indexed: transcripts, summary_long, segment summaries, private segment text,
 * places, or anything internal.
 */
import type { Options, SearchOptions } from "minisearch";

/** Exactly the fields of §6.5, with their boosts. */
export const SEARCH_FIELDS = [
  "title",
  "heroes",
  "serial",
  "keywords",
  "characters",
  "tags",
  "lesson",
  "summary",
  "segs",
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export const BOOST: Readonly<Record<SearchField, number>> = {
  title: 5,
  heroes: 4,
  serial: 4,
  keywords: 3,
  characters: 3,
  tags: 2,
  lesson: 2,
  summary: 1,
  segs: 1,
};

export type SearchDocument = { id: string } & Record<SearchField, string>;

/** Common spellings folded to the house transliteration (applied to the index and to queries). */
export const SYNONYMS: Readonly<Record<string, string>> = {
  shabbat: "shabbos",
  shabat: "shabbos",
  shabbes: "shabbos",
  sabbath: "shabbos",
  hanukkah: "chanukah",
  hanukah: "chanukah",
  hannukah: "chanukah",
  chanuka: "chanukah",
  chanukka: "chanukah",
  channukah: "chanukah",
  chanukkah: "chanukah",
  sukkot: "sukkos",
  succot: "sukkos",
  sukkoth: "sukkos",
  succos: "sukkos",
  shavuot: "shavuos",
  passover: "pesach",
  moses: "moshe",
  tzedaka: "tzedakah",
  tzedoka: "tzedakah",
  tsedakah: "tzedakah",
  tsedaka: "tzedakah",
  charity: "tzedakah",
  mitzvot: "mitzvos",
  mitzvoth: "mitzvos",
  middot: "midos",
  middos: "midos",
  midot: "midos",
  tefilin: "tefillin",
  tzitzit: "tzitzis",
  kippah: "yarmulke",
  kipah: "yarmulke",
  kippa: "yarmulke",
  yarmulka: "yarmulke",
  brachot: "brachos",
  berachot: "brachos",
  berachos: "brachos",
  beracha: "bracha",
  brocha: "bracha",
  tehilim: "tehillim",
  psalms: "tehillim",
  kashrut: "kashrus",
  abraham: "avraham",
  isaac: "yitzchak",
  jacob: "yaakov",
  david: "dovid",
  solomon: "shlomo",
  elijah: "eliyahu",
  rebecca: "rivkah",
  rivka: "rivkah",
  aaron: "aharon",
  maimonides: "rambam",
  chasidut: "chassidus",
  hasidut: "chassidus",
  chasidim: "chassidim",
  hasidim: "chassidim",
  hassidim: "chassidim",
  chasidic: "chassidic",
  hasidic: "chassidic",
  hassidic: "chassidic",
  mashiach: "moshiach",
  messiah: "moshiach",
  geula: "geulah",
  jerusalem: "yerushalayim",
  yerushalaim: "yerushalayim",
  yisrael: "yisroel",
  israel: "yisroel",
  torah: "torah",
  purim: "purim",
  matza: "matzah",
  matzo: "matzah",
  rosh: "rosh",
  hashana: "hashanah",
  kipur: "kippur",
  shofor: "shofar",
  mezuza: "mezuzah",
  menora: "menorah",
  dreidle: "dreidel",
  draidel: "dreidel",
};

/** Nicknames that stand for several words (expanded on both sides). */
export const EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  besht: ["baal", "shem", "tov"],
  rashbi: ["shimon", "yochai"],
};

/** Lower-case, drop apostrophes and diacritics, then fold spellings. */
export function processTerm(term: string): string | string[] | null {
  const t = term.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/['’`]/g, "");
  if (!t) return null;
  const many = EXPANSIONS[t];
  if (many) return [...many];
  return SYNONYMS[t] ?? t;
}

/** Split on anything that is not a letter or digit (keeps apostrophes inside words: Ba'al → baal). */
export const tokenize = (text: string): string[] =>
  text.split(/[^\p{L}\p{N}'’`]+/u).filter(Boolean);

export const MINISEARCH_OPTIONS: Options<SearchDocument> = {
  fields: [...SEARCH_FIELDS],
  storeFields: [],
  idField: "id",
  tokenize,
  processTerm,
};

export const SEARCH_OPTIONS: SearchOptions = {
  boost: { ...BOOST },
  prefix: true,
  fuzzy: (term: string) => (term.length >= 5 ? 1 : false),
  combineWith: "AND",
  weights: { fuzzy: 0.15, prefix: 0.4 },
};

/** Suggestion chips (§6.5). */
export const SUGGESTIONS: readonly string[] = [
  "Baal Shem Tov",
  "Chanukah",
  "miracle",
  "king",
  "Shabbos",
  "Rabbi Akiva",
  "tzedakah",
  "Eliyahu HaNavi",
];

/** Suggestion chips in "Yiddish only" mode: each finds Yiddish stories (checked by a test). */
export const SUGGESTIONS_YI: readonly string[] = [
  "Eliyahu HaNavi",
  "Pesach",
  "diamond",
  "lion",
  "Baal Shem Tov",
  "Bubby",
];

/** Extra tags of a Yiddish search document, so "yiddish" or "אידיש" finds every one. */
export const YIDDISH_TAGS: readonly string[] = ["Yiddish", "Yidish", "אידיש"];

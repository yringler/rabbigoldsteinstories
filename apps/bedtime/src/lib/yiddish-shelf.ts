/**
 * The Yiddish shelf (docs/design/language-bedtime.md §3.2–3.3): a fixed, reviewed list of Yiddish
 * stories for young children, played like any other playlist when a parent chooses Yiddish or
 * Both. There is far too little Yiddish story material for a rotating playlist with cooldowns
 * (design §1.1), so the stories stay the same and only the opening story changes from night to
 * night. Pure (no DOM, no Node): the ids and rules here; resolving them against the public
 * dataset is build-time only (./build/yiddish.ts).
 */
import type { Playlist, PlaylistItem } from "@goldstein/playlists";

/**
 * Owner question Q1 (design §8): may Bubby Chaya Malka's eight Yiddish home stories (flagged
 * private_family; bedtime rule B6 keeps family recordings out of generated playlists) be on the
 * shelf? `false` until the owner answers, which leaves the 3-story shelf. Set it to `true` on a
 * yes: nothing else needs to change.
 */
export const INCLUDE_BUBBY_FAMILY_STORIES = false;

/** Bubby Chaya Malka's stories plus the narrator's, in shelf order before the nightly rotation. */
export const FULL_BODY = [
  "a70d104e90", // The Baal Shem Tov and the Bear
  "5e3346ab8e", // Rashi's Father and the Precious Diamond
  "ed960138a4", // Yosef Mokir Shabbos: The Diamond in the Fish
  "db6ee5b364", // Rabbi Meir Baal HaNess and the Lion in the Desert
  "f9f2974567", // Eliyahu HaNavi's Cup
  "6164b3359f", // Dayeinu: The Old Man, the King's Lost Ring and the Pesach Seder
  "aae4e91c38", // The Butcher, the Storekeeper and the Boy Judge
  "407fcad3a4", // Three Din Torahs: The Hidden Tzaddik of Berditchev
  "555e88ce75", // The Wondrous Glasses: How the Brill Family Got Its Name
] as const;
/** Fixed, played last: the two calmest, no advisories, so the night ends on Chana's prayer. */
export const FULL_TAIL = [
  "a690295602", // Eliyahu HaNavi and the Blessed Coin: Seven Good Years
  "65cc733f61", // Chana's Prayer and Shmuel HaNavi
] as const;

/** Without Bubby's stories (Q1 = no): the three by the Yiddish narrator. */
export const NARRATOR_BODY = ["407fcad3a4", "555e88ce75"] as const;
export const NARRATOR_TAIL = ["ed960138a4"] as const;

export const SHELF_BODY: readonly string[] = INCLUDE_BUBBY_FAMILY_STORIES
  ? FULL_BODY
  : NARRATOR_BODY;
export const SHELF_TAIL: readonly string[] = INCLUDE_BUBBY_FAMILY_STORIES
  ? FULL_TAIL
  : NARRATOR_TAIL;
/** Every listed id, body then tail. */
export const SHELF_IDS: readonly string[] = [...SHELF_BODY, ...SHELF_TAIL];

/**
 * Tracks that stop before the recording's end (range playback, as for spans; the audio itself is
 * never edited). In these two home tapes the closing words after the story address the family's
 * grandchildren by name (design §3.2, owner question Q2). 5e3346ab8e: the end of its public
 * `story` segment (381 s). 6164b3359f: 1005 s, just before the first privacy-masked time span of
 * its private metadata (the closing words, ~26 s). yiddish.test.ts checks both against the
 * public data (content bounds, story segment, masked transcript lines).
 */
export const END_OVERRIDES: Readonly<Record<string, number>> = {
  "5e3346ab8e": 381,
  "6164b3359f": 1005,
};

/**
 * Narrator labels the bedtime site may show. Only confirmed vocabulary labels (DECISIONS §3);
 * anything else, the unconfirmed Yiddish narrator included, gets `null`: no narrator line and no
 * lock-screen artist.
 */
export const CONFIRMED_NARRATORS: Readonly<Record<string, string>> = {
  bubby_chaya_malka: "Bubby Chaya Malka",
};

export const SHELF_TYPE = "yiddish";
export const SHELF_TITLE = "Yiddish Stories";
/** The card's second line (Hebrew script; rendered inside lang="yi" dir="rtl"). */
export const SHELF_TITLE_YI = "אידישע מעשׂיות";
/** An opener is at most this long and has no moderate or strong advisory. */
export const OPENER_MAX_SEC = 12 * 60;

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
/** "three", "eleven"; digits above twenty. */
export const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const cap = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;

/** Day count of an edition id or date key ("2026-11-27", "2026-11-27-pm"). */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, (m || 1) - 1, d || 1);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : 0;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const rotate = <T>(xs: readonly T[], k: number): T[] =>
  xs.length === 0 ? [] : [...xs.slice(mod(k, xs.length)), ...xs.slice(0, mod(k, xs.length))];
const calm = (i: PlaylistItem) => i.advisories.every((a) => a.severity === "mild");

/**
 * Tonight's order: the same stories every night, a different one first. The tail (SHELF_TAIL,
 * in its order) always plays last. From the body, the opener rotates by day through the stories
 * fit to open (≤ 12 min, no moderate or strong advisory; if none is, those without such an
 * advisory; if none, any), and the rest of the body rotates by day behind it. Deterministic per
 * date key; never reorders the tail.
 */
export function orderShelf(
  items: readonly PlaylistItem[],
  dateKey: string,
  tailIds: readonly string[] = SHELF_TAIL,
): PlaylistItem[] {
  const tail = tailIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is PlaylistItem => !!i);
  const body = items.filter((i) => !tailIds.includes(i.id));
  if (body.length === 0) return tail;
  const day = dayNumber(dateKey);
  const fit = body.filter((i) => calm(i) && i.duration_sec <= OPENER_MAX_SEC);
  const mildOnly = body.filter(calm);
  const openers = fit.length > 0 ? fit : mildOnly.length > 0 ? mildOnly : body;
  const opener = openers[mod(day, openers.length)]!;
  const rest = body.filter((i) => i !== opener);
  return [opener, ...rotate(rest, day), ...tail];
}

/** The card line: Bubby's stories when they are on the shelf, else a plain count. */
export function shelfLine(items: readonly PlaylistItem[]): string {
  const bubby = items.filter((i) => i.narrator === CONFIRMED_NARRATORS["bubby_chaya_malka"]);
  if (bubby.length > 0 && bubby.length < items.length)
    return "Bubby Chaya Malka's stories, and a few more.";
  if (bubby.length > 0) return "Bubby Chaya Malka's stories.";
  return `${cap(numberWord(items.length))} ${items.length === 1 ? "story" : "stories"} in Yiddish.`;
}

/**
 * The shelf as an ordinary Playlist (the edition's shape), so the player, sheet, Continue row and
 * Media Session need nothing new. `dateKey` is tonight's edition id.
 */
export function shelfPlaylist(
  items: readonly PlaylistItem[],
  dateKey: string,
  tailIds: readonly string[] = SHELF_TAIL,
): Playlist {
  const ordered = orderShelf(items, dateKey, tailIds);
  const ages = ordered.length ? Math.min(...ordered.map((i) => i.age_min)) : 4;
  return {
    id: `${SHELF_TYPE}/${dateKey}`,
    type: SHELF_TYPE,
    title: SHELF_TITLE,
    subtitle: shelfLine(ordered),
    ages: `${ages}+`,
    total_min: Math.round(ordered.reduce((s, i) => s + i.duration_sec, 0) / 60),
    age_min: ordered.length ? Math.max(...ordered.map((i) => i.age_min)) : 0,
    items: ordered,
  };
}

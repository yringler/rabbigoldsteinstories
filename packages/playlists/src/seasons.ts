/**
 * Seasonal weighting (docs/sites/bedtime.md §4.7): the Hebrew date of an edition's night and the
 * calendar tags (ids from vocabularies.json → calendar) whose window is active that night.
 *
 * The night of edition `2026-11-25` is the Hebrew day that begins at nightfall on 25 November,
 * i.e. the Hebrew date of the civil day 26 November (16 Kislev 5787). Pure; uses @hebcal/hdate
 * (date arithmetic only, no locale data) so it runs in Node, Workers and browsers.
 */
import { HDate, months } from "@hebcal/hdate";

/** How a tag relates to tonight: `near` (the day itself, or at most 3 days away) or `window` (its wider season). */
export type TagState = "near" | "window";

export interface Season {
  /** "16 Kislev 5787" (Ashkenazi transliteration, as in vocabularies.json). */
  hebrewDate: string;
  /** Active, non-neutral calendar tags and how close each is. */
  active: ReadonlyMap<string, TagState>;
}

/** Tags that never boost and never penalise (§4.7 "Neutral"). */
export const NEUTRAL_TAGS: ReadonlySet<string> = new Set([
  "rosh_chodesh",
  "shabbos_weekly",
  "shabbos_mevarchim",
  "hakhel_year",
  "winter",
  "shabbos_shuva",
  "shabbos_hagadol",
  "shabbos_zachor",
  "shabbos_chazon",
  "shabbos_nachamu",
  "shabbos_chazak",
  "shabbos_bereishis",
  "shabbos_shirah",
  "shabbos_shekalim",
]);

/** Mourning tags: never boosted in `little` or `calm` (§4.7). */
export const MOURNING_TAGS: ReadonlySet<string> = new Set([
  "three_weeks",
  "nine_days",
  "tisha_bav",
  "shiva_asar_btammuz",
  "asarah_bteves",
  "tzom_gedaliah",
]);

const MONTH_NAMES: Record<number, string> = {
  [months.NISAN]: "Nissan",
  [months.IYYAR]: "Iyar",
  [months.SIVAN]: "Sivan",
  [months.TAMUZ]: "Tammuz",
  [months.AV]: "Av",
  [months.ELUL]: "Elul",
  [months.TISHREI]: "Tishrei",
  [months.CHESHVAN]: "Cheshvan",
  [months.KISLEV]: "Kislev",
  [months.TEVET]: "Teves",
  [months.SHVAT]: "Shevat",
  [months.ADAR_I]: "Adar",
  [months.ADAR_II]: "Adar II",
};

/** Purim's month: Adar, or Adar II in a leap year. */
const ADAR = -1;

type Rule =
  /** A holiday or dated day: `days` long from `month`/`day`; active from `before` days ahead. */
  | { kind: "day"; month: number; day: number; days?: number; before: number }
  /** A period, active only while it lasts (no lead-in, no "near" boost). */
  | { kind: "period"; month: number; day: number; days: number }
  | { kind: "special"; id: "selichos" | "summer_vacation" | "zos_chanukah" | "purim_katan" };

const MAJOR = 10;
const SINGLE = 3;

/** The calendar windows table (§4.7), keyed by vocabulary id. Tags not listed are ignored. */
export const CALENDAR_WINDOWS: Readonly<Record<string, Rule>> = {
  // major Yom Tov: 10 days before through the last day (Pesach 14, Chanukah 7)
  rosh_hashanah: { kind: "day", month: months.TISHREI, day: 1, days: 2, before: MAJOR },
  yom_kippur: { kind: "day", month: months.TISHREI, day: 10, before: MAJOR },
  sukkos: { kind: "day", month: months.TISHREI, day: 15, days: 7, before: MAJOR },
  shemini_atzeres_simchas_torah: {
    kind: "day",
    month: months.TISHREI,
    day: 22,
    days: 2,
    before: MAJOR,
  },
  chanukah: { kind: "day", month: months.KISLEV, day: 25, days: 8, before: 7 },
  purim: { kind: "day", month: ADAR, day: 14, days: 2, before: MAJOR },
  pesach: { kind: "day", month: months.NISAN, day: 15, days: 8, before: 14 },
  shavuos: { kind: "day", month: months.SIVAN, day: 6, days: 2, before: MAJOR },
  // single days: 3 days before through the day
  tzom_gedaliah: { kind: "day", month: months.TISHREI, day: 3, before: SINGLE },
  vav_tishrei: { kind: "day", month: months.TISHREI, day: 6, before: SINGLE },
  yud_gimmel_tishrei: { kind: "day", month: months.TISHREI, day: 13, before: SINGLE },
  simchas_beis_hashoeva: { kind: "day", month: months.TISHREI, day: 16, days: 5, before: SINGLE },
  hoshana_rabbah: { kind: "day", month: months.TISHREI, day: 21, before: SINGLE },
  chof_cheshvan: { kind: "day", month: months.CHESHVAN, day: 20, before: SINGLE },
  yud_kislev: { kind: "day", month: months.KISLEV, day: 10, before: SINGLE },
  yud_daled_kislev: { kind: "day", month: months.KISLEV, day: 14, before: SINGLE },
  yud_tes_kislev: { kind: "day", month: months.KISLEV, day: 19, days: 2, before: SINGLE },
  zos_chanukah: { kind: "special", id: "zos_chanukah" },
  hei_teves: { kind: "day", month: months.TEVET, day: 5, before: SINGLE },
  asarah_bteves: { kind: "day", month: months.TEVET, day: 10, before: SINGLE },
  chof_teves: { kind: "day", month: months.TEVET, day: 20, before: SINGLE },
  chof_daled_teves: { kind: "day", month: months.TEVET, day: 24, before: SINGLE },
  rosh_chodesh_shevat: { kind: "day", month: months.SHVAT, day: 1, before: SINGLE },
  yud_shevat: { kind: "day", month: months.SHVAT, day: 10, before: SINGLE },
  tu_bshvat: { kind: "day", month: months.SHVAT, day: 15, before: SINGLE },
  chof_beis_shevat: { kind: "day", month: months.SHVAT, day: 22, before: SINGLE },
  purim_katan: { kind: "special", id: "purim_katan" },
  zayin_adar: { kind: "day", month: ADAR, day: 7, before: SINGLE },
  taanis_esther: { kind: "day", month: ADAR, day: 13, before: SINGLE },
  chof_zayin_adar: { kind: "day", month: ADAR, day: 27, before: SINGLE },
  yud_aleph_nissan: { kind: "day", month: months.NISAN, day: 11, before: SINGLE },
  yud_gimmel_nissan: { kind: "day", month: months.NISAN, day: 13, before: SINGLE },
  erev_pesach: { kind: "day", month: months.NISAN, day: 14, before: SINGLE },
  acharon_shel_pesach: { kind: "day", month: months.NISAN, day: 22, before: SINGLE },
  pesach_sheni: { kind: "day", month: months.IYYAR, day: 14, before: SINGLE },
  lag_baomer: { kind: "day", month: months.IYYAR, day: 18, before: SINGLE },
  gimmel_tammuz: { kind: "day", month: months.TAMUZ, day: 3, before: SINGLE },
  yud_beis_tammuz: { kind: "day", month: months.TAMUZ, day: 12, days: 2, before: SINGLE },
  shiva_asar_btammuz: { kind: "day", month: months.TAMUZ, day: 17, before: SINGLE },
  tisha_bav: { kind: "day", month: months.AV, day: 9, before: SINGLE },
  tu_bav: { kind: "day", month: months.AV, day: 15, before: SINGLE },
  chof_av: { kind: "day", month: months.AV, day: 20, before: SINGLE },
  chai_elul: { kind: "day", month: months.ELUL, day: 18, before: SINGLE },
  chof_hei_elul: { kind: "day", month: months.ELUL, day: 25, before: SINGLE },
  // months and periods: the period itself
  aseres_yemei_teshuvah: { kind: "period", month: months.TISHREI, day: 1, days: 10 },
  cheshvan: { kind: "period", month: months.CHESHVAN, day: 1, days: 30 },
  kislev: { kind: "period", month: months.KISLEV, day: 1, days: 30 },
  adar: { kind: "period", month: ADAR, day: 1, days: 29 },
  nissan: { kind: "period", month: months.NISAN, day: 1, days: 30 },
  sefiras_haomer: { kind: "period", month: months.NISAN, day: 16, days: 49 },
  three_weeks: { kind: "period", month: months.TAMUZ, day: 17, days: 22 },
  nine_days: { kind: "period", month: months.AV, day: 1, days: 9 },
  elul: { kind: "period", month: months.ELUL, day: 1, days: 29 },
  selichos: { kind: "special", id: "selichos" },
  summer_vacation: { kind: "special", id: "summer_vacation" },
};

/** Absolute day number (R.D.) of a Hebrew date; ADAR resolves to Adar II in a leap year. */
function abs(year: number, month: number, day: number): number {
  const m = month === ADAR ? (HDate.isLeapYear(year) ? months.ADAR_II : months.ADAR_I) : month;
  // Clamp days that do not exist in short months (e.g. 30 Kislev in a short year).
  const d = Math.min(day, HDate.daysInMonth(m, year));
  return new HDate(d, m, year).abs();
}

function civilToHDate(date: string): HDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new HDate(new Date(y, m - 1, d, 12));
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** [first day, last day, lead-in days] of a rule in a Hebrew year, or null. */
function range(rule: Rule, year: number): [number, number, number] | null {
  switch (rule.kind) {
    case "day": {
      const start = abs(year, rule.month, rule.day);
      return [start, start + (rule.days ?? 1) - 1, rule.before];
    }
    case "period": {
      const start = abs(year, rule.month, rule.day);
      return [start, start + rule.days - 1, 0];
    }
    case "special":
      if (rule.id === "zos_chanukah") {
        const d = abs(year, months.KISLEV, 25) + 7;
        return [d, d, SINGLE];
      }
      if (rule.id === "purim_katan") {
        if (!HDate.isLeapYear(year)) return null;
        const d = new HDate(14, months.ADAR_I, year).abs();
        return [d, d, SINGLE];
      }
      if (rule.id === "selichos") {
        // From the Saturday night (Hebrew Sunday) at least four days before Rosh Hashanah, to Yom Kippur.
        const rh = new HDate(1, months.TISHREI, year + 1).abs();
        const latest = rh - 4;
        const sunday = latest - (((latest % 7) + 7) % 7); // R.D. day 0 mod 7 is a Sunday
        return [sunday, new HDate(10, months.TISHREI, year + 1).abs(), 0];
      }
      return null; // summer_vacation is Gregorian; handled by the caller
  }
}

/** Hebrew date and active calendar tags for the night of an edition (`YYYY-MM-DD`, its civil date). */
export function seasonFor(editionDate: string): Season {
  const nightCivil = addDays(editionDate.slice(0, 10), 1);
  const night = civilToHDate(nightCivil);
  const n = night.abs();
  const active = new Map<string, TagState>();
  for (const [id, rule] of Object.entries(CALENDAR_WINDOWS)) {
    if (rule.kind === "special" && rule.id === "summer_vacation") {
      const md = nightCivil.slice(5);
      if (md >= "06-20" && md <= "09-01") active.set(id, "window");
      continue;
    }
    // Check this year's and the neighbouring years' occurrences (windows can cross a year end).
    for (const y of [night.getFullYear() - 1, night.getFullYear(), night.getFullYear() + 1]) {
      const r = range(rule, y);
      if (!r) continue;
      const [first, last, before] = r;
      if (n < first - before || n > last) continue;
      const near = rule.kind !== "period" && n >= first - SINGLE;
      if (near || !active.has(id)) active.set(id, near ? "near" : "window");
    }
  }
  const month = MONTH_NAMES[night.getMonth()] ?? night.getMonthName();
  const name =
    night.getMonth() === months.ADAR_I && !HDate.isLeapYear(night.getFullYear())
      ? "Adar"
      : night.getMonth() === months.ADAR_I
        ? "Adar I"
        : month;
  return { hebrewDate: `${night.getDate()} ${name} ${night.getFullYear()}`, active };
}

export type SeasonalStatus = "near" | "window" | "out" | "none";

/**
 * How a unit's calendar tags relate to tonight: `none` (no non-neutral tags), `near` / `window`
 * (at least one tag active), or `out` (tagged, none active). With `noMourning`, mourning tags
 * never count as active (they are not boosted in little/calm) but still count as tags.
 */
export function seasonalStatus(
  calendar: readonly string[],
  season: Season,
  noMourning = false,
): SeasonalStatus {
  const tags = calendar.filter((t) => !NEUTRAL_TAGS.has(t) && t in CALENDAR_WINDOWS);
  if (tags.length === 0) return "none";
  let best: SeasonalStatus = "out";
  for (const t of tags) {
    const s = season.active.get(t);
    if (!s) continue;
    if (noMourning && MOURNING_TAGS.has(t)) {
      if (best === "out") best = "none"; // active mourning tag in little/calm: weight ×1
      continue;
    }
    if (s === "near") return "near";
    best = "window";
  }
  return best;
}

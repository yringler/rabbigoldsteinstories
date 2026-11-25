/**
 * kids/calendar.json (docs/sites/kids.md §5.2, §5.5, §9): for each civil day from the build date,
 * the Hebrew date, this week's parsha (diaspora), active holiday groups and single dates, and the
 * greeting's occasion line. Build-time only (@hebcal/core never ships to the browser).
 */
import { HDate, getSedra } from "@hebcal/core";
import { HOLIDAY_TILES, type HDay, type HMonth } from "../tiles.ts";

export interface CalendarDay {
  /** Civil date YYYY-MM-DD. */
  d: string;
  /** "15 Kislev 5787". */
  h: string;
  /** Parsha ids of the coming Shabbos (diaspora); [] when Shabbos is a Yom Tov. */
  p: string[];
  /** Active holiday groups (slugs), soonest first. Chassidishe dates are listed in `s`. */
  g: string[];
  /** Active single chassidishe date ids (7 days before through the date), soonest first. */
  s: string[];
  /** "Chanukah is in 10 days" / "Today is Purim", or null. */
  o: string | null;
}

const MONTH_NUM: Readonly<Record<Exclude<HMonth, "adar">, number>> = {
  nisan: 1,
  iyar: 2,
  sivan: 3,
  tammuz: 4,
  av: 5,
  elul: 6,
  tishrei: 7,
  cheshvan: 8,
  kislev: 9,
  teves: 10,
  shevat: 11,
};

/** House transliteration of the Hebrew months (hebcal month number → name). */
const MONTH_NAME: Readonly<Record<number, string>> = {
  1: "Nissan",
  2: "Iyar",
  3: "Sivan",
  4: "Tammuz",
  5: "Av",
  6: "Elul",
  7: "Tishrei",
  8: "Cheshvan",
  9: "Kislev",
  10: "Teves",
  11: "Shevat",
  12: "Adar",
  13: "Adar II",
};

/** hebcal parsha names (diaspora schedule) → vocabulary ids. */
const PARSHA: Readonly<Record<string, string>> = {
  Bereshit: "bereishis",
  Noach: "noach",
  "Lech-Lecha": "lech_lecha",
  Vayera: "vayeira",
  "Chayei Sara": "chayei_sarah",
  Toldot: "toldos",
  Vayetzei: "vayeitzei",
  Vayishlach: "vayishlach",
  Vayeshev: "vayeishev",
  Miketz: "mikeitz",
  Vayigash: "vayigash",
  Vayechi: "vayechi",
  Shemot: "shemos",
  Vaera: "vaeira",
  Bo: "bo",
  Beshalach: "beshalach",
  Yitro: "yisro",
  Mishpatim: "mishpatim",
  Terumah: "terumah",
  Tetzaveh: "tetzaveh",
  "Ki Tisa": "ki_sisa",
  Vayakhel: "vayakhel",
  Pekudei: "pekudei",
  Vayikra: "vayikra",
  Tzav: "tzav",
  Shmini: "shemini",
  Tazria: "tazria",
  Metzora: "metzora",
  "Achrei Mot": "acharei",
  Kedoshim: "kedoshim",
  Emor: "emor",
  Behar: "behar",
  Bechukotai: "bechukosai",
  Bamidbar: "bamidbar",
  Nasso: "naso",
  "Beha'alotcha": "behaaloscha",
  "Sh'lach": "shelach",
  Korach: "korach",
  Chukat: "chukas",
  Balak: "balak",
  Pinchas: "pinchas",
  Matot: "matos",
  Masei: "masei",
  Devarim: "devarim",
  Vaetchanan: "vaeschanan",
  Eikev: "eikev",
  "Re'eh": "reeh",
  Shoftim: "shoftim",
  "Ki Teitzei": "ki_seitzei",
  "Ki Tavo": "ki_savo",
  Nitzavim: "nitzavim",
  Vayeilech: "vayeilech",
  "Ha'azinu": "haazinu",
  "Vezot Haberakhah": "vezos_haberachah",
};

export function parshaIds(names: readonly string[]): string[] {
  return names.map((n) => PARSHA[n]).filter((x): x is string => Boolean(x));
}

/** Absolute day number of a Hebrew day in Hebrew year `y` ("adar" = Adar II in a leap year). */
function abs([m, d]: HDay, y: number): number {
  const month = m === "adar" ? (HDate.isLeapYear(y) ? 13 : 12) : MONTH_NUM[m];
  const day = Math.min(d, HDate.daysInMonth(month, y));
  return new HDate(day, month, y).abs();
}

/** Is absolute day `t` inside [from, to] for some Hebrew year near `y` (windows may cross Tishrei)? */
function inWindow(t: number, y: number, from: HDay, to: HDay): boolean {
  for (const yy of [y - 1, y, y + 1]) {
    const a = abs(from, yy);
    let b = abs(to, yy);
    if (b < a) b = abs(to, yy + 1);
    if (t >= a && t <= b) return true;
  }
  return false;
}

/** Days from `t` to the next occurrence of a Hebrew day (0 = today). */
function daysUntil(t: number, y: number, day: HDay): number {
  for (const yy of [y - 1, y, y + 1]) {
    const a = abs(day, yy);
    if (a >= t) return a - t;
  }
  return Infinity;
}

const shortLabel = (s: string) => s.replace(/\s*\(.*\)\s*$/, "");

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Labels for the chassidishe dates (from the vocabulary). */
export type LabelOf = (calendarId: string) => string;

export function calendarDay(date: Date, labelOf: LabelOf): CalendarDay {
  const hd = new HDate(date);
  const t = hd.abs();
  const y = hd.getFullYear();
  const h = `${hd.getDate()} ${MONTH_NAME[hd.getMonth()] ?? hd.getMonthName()} ${y}`;
  const sedra = getSedra(y, false).lookup(hd);
  const p = sedra.chag ? [] : parshaIds(sedra.parsha);

  const groups: { slug: string; until: number }[] = [];
  const singles: { id: string; until: number }[] = [];
  let occasion: { label: string; until: number } | null = null;
  for (const tile of HOLIDAY_TILES) {
    if (tile.dates) {
      for (const [id, day] of Object.entries(tile.dates)) {
        const u = daysUntil(t, y, day);
        if (u <= 7) singles.push({ id, until: u });
      }
      continue;
    }
    if (tile.windows.some(([a, b]) => inWindow(t, y, a, b))) {
      const until = tile.main ? daysUntil(t, y, tile.main) : 999;
      groups.push({ slug: tile.slug, until });
    }
    if (tile.main) {
      const u = daysUntil(t, y, tile.main);
      if (u <= 30 && (!occasion || u < occasion.until)) {
        occasion = {
          label: tile.slug === "rosh-hashanah-yom-kippur" ? "Rosh Hashanah" : tile.label,
          until: u,
        };
      }
    }
  }
  if (!occasion) {
    const s = [...singles].sort((a, b) => a.until - b.until)[0];
    if (s) occasion = { label: shortLabel(labelOf(s.id)), until: s.until };
  }
  groups.sort((a, b) => a.until - b.until);
  singles.sort((a, b) => a.until - b.until);
  const o = occasion
    ? occasion.until === 0
      ? `Today is ${occasion.label}`
      : occasion.until === 1
        ? `${occasion.label} is tomorrow`
        : `${occasion.label} is in ${occasion.until} days`
    : null;
  return {
    d: ymd(date),
    h,
    p,
    g: groups.map((g) => g.slug),
    s: singles.map((s) => s.id),
    o,
  };
}

/** `days` consecutive civil days starting at `start` (local date at noon, so DST never skips a day). */
export function buildCalendar(start: Date, days: number, labelOf: LabelOf): CalendarDay[] {
  const out: CalendarDay[] = [];
  const base = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    out.push(calendarDay(d, labelOf));
  }
  return out;
}

/** Order for /holidays: starting from the next upcoming holiday. */
export function holidayOrder(date: Date): string[] {
  const hd = new HDate(date);
  const t = hd.abs();
  const y = hd.getFullYear();
  const scored = HOLIDAY_TILES.map((tile) => {
    const days = tile.main
      ? daysUntil(t, y, tile.main)
      : tile.dates
        ? Math.min(...Object.values(tile.dates).map((d) => daysUntil(t, y, d)))
        : Infinity;
    return { slug: tile.slug, days };
  });
  return scored.sort((a, b) => a.days - b.days).map((s) => s.slug);
}

/**
 * For ordering /holidays on the client: the civil dates (within the calendar's span) on which each
 * holiday is "on": its main day, else each chassidishe date, else the first day of each window.
 */
export function holidayMains(start: Date, days: number): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of HOLIDAY_TILES) out[t.slug] = [];
  const base = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    const hd = new HDate(d);
    const t0 = hd.abs();
    const y = hd.getFullYear();
    for (const tile of HOLIDAY_TILES) {
      const anchors: HDay[] = tile.main
        ? [tile.main]
        : tile.dates
          ? Object.values(tile.dates)
          : tile.windows.map(([a]) => a);
      if (anchors.some((a) => daysUntil(t0, y, a) === 0)) out[tile.slug]?.push(ymd(d));
    }
  }
  return out;
}

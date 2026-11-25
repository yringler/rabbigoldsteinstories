/**
 * Date wording for the library: Hebrew date first, then Gregorian, worded by precision
 * (docs/sites/library.md §6.2). Hebrew dates for estimated air dates come from the platform's
 * Hebrew calendar (Intl, no library), spelled the way the archive spells months.
 */
import type { PublicDate } from "@goldstein/data";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** ICU month names → archive spelling. */
const HEBREW_MONTH: Record<string, string> = {
  Tishri: "Tishrei",
  Heshvan: "Cheshvan",
  Kislev: "Kislev",
  Tevet: "Teves",
  Shevat: "Shevat",
  "Adar I": "Adar I",
  "Adar II": "Adar II",
  Adar: "Adar",
  Nisan: "Nissan",
  Iyar: "Iyar",
  Sivan: "Sivan",
  Tamuz: "Tammuz",
  Av: "Av",
  Elul: "Elul",
};

/** Hebrew months in year order (Tishrei first), for grouping. */
export const HEBREW_MONTH_ORDER = [
  "Tishrei",
  "Cheshvan",
  "Kislev",
  "Teves",
  "Shevat",
  "Adar",
  "Adar I",
  "Adar II",
  "Nissan",
  "Iyar",
  "Sivan",
  "Tammuz",
  "Av",
  "Elul",
] as const;

export interface ParsedGregorian {
  y: number;
  m?: number;
  d?: number;
}

export function parseGregorian(s: string | null | undefined): ParsedGregorian | null {
  if (!s) return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const out: ParsedGregorian = { y: Number(m[1]) };
  if (m[2]) out.m = Number(m[2]);
  if (m[3]) out.d = Number(m[3]);
  return out;
}

function utc(p: ParsedGregorian): Date {
  return new Date(Date.UTC(p.y, (p.m ?? 1) - 1, p.d ?? 1, 12));
}

/** "31 March 1987" (day), "March 1987" (month), "1987" (year). */
export function formatGregorian(
  s: string,
  opts: { weekday?: boolean; short?: boolean } = {},
): string {
  const p = parseGregorian(s);
  if (!p) return s;
  const month = (i: number) =>
    opts.short ? (MONTHS[i - 1] ?? "").slice(0, 3) : (MONTHS[i - 1] ?? "");
  if (p.d && p.m) {
    const wd = opts.weekday ? `${WEEKDAYS[utc(p).getUTCDay()] ?? ""} ` : "";
    return `${wd}${p.d} ${month(p.m)} ${p.y}`;
  }
  if (p.m) return `${month(p.m)} ${p.y}`;
  return String(p.y);
}

export interface HebrewParts {
  day: number;
  month: string;
  year: number;
}

/** Hebrew date of a Gregorian day (civil day; no sunset adjustment). */
export function hebrewParts(iso: string): HebrewParts | null {
  const p = parseGregorian(iso);
  if (!p?.m || !p.d) return null;
  const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(utc(p));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const month = get("month");
  return {
    day: Number(get("day")),
    month: HEBREW_MONTH[month] ?? month,
    year: Number(get("year")),
  };
}

export function hebrewDate(iso: string): string | null {
  const h = hebrewParts(iso);
  return h ? `${h.day} ${h.month} ${h.year}` : null;
}

/** Hebrew year for any Gregorian date precise to the day. */
export function hebrewYearOf(iso: string): number | null {
  return hebrewParts(iso)?.year ?? null;
}

/** Gregorian span of a Hebrew year, e.g. 5747 → "1986–87". */
export function hebrewYearSpan(year: number): string {
  const g = year - 3761;
  return `${g}–${String(g + 1).slice(2)}`;
}

/** Sortable key YYYYMMDD (missing parts as 00), 0 when unknown. */
export function sortKey(s: string | null | undefined): number {
  const p = parseGregorian(s);
  return p ? p.y * 10000 + (p.m ?? 0) * 100 + (p.d ?? 0) : 0;
}

const BASIS: Record<string, string> = {
  stated_in_audio: "The date is stated in the recording.",
  calendar_cues:
    "Worked out from calendar references in the recording (Yom Tov, parsha, Rosh Chodesh).",
  filename: "Taken from the original file name.",
  folder_or_sibling: "Taken from the folder or the neighbouring recordings.",
  sequence_interpolation: "Worked out from the weekly broadcast sequence.",
};

export function basisText(basis: string): string {
  return BASIS[basis] ?? "Estimated by the archive.";
}

/** Is `hebrew` a clean "D Month YYYY" / "Month YYYY" / "YYYY" (not free text)? */
function cleanHebrew(h: string | null | undefined): string | null {
  if (!h) return null;
  return /^(\d{1,2} )?[A-Z][a-z]+( (I|II|1|2))? \d{4}$|^\d{4}$/.test(h.trim()) ? h.trim() : null;
}

export interface DateDisplay {
  /** Hebrew part ("1 Nissan 5747", "Shevat 5748", "5748", or the archive's own wording). */
  hebrew: string | null;
  /** Gregorian part ("Tuesday 31 March 1987", "week of 12 January 1988", "1980s"). */
  gregorian: string | null;
  /** Compact one-line form for cards and tables. */
  short: string;
  /** Used in citations: precision-aware, Hebrew first. */
  cite: string | null;
  /** Gregorian in parentheses for full citations (day precision only). */
  citeGregorian: string | null;
}

export function displayDate(d: PublicDate | undefined): DateDisplay {
  const none: DateDisplay = {
    hebrew: null,
    gregorian: null,
    short: "Date unknown",
    cite: null,
    citeGregorian: null,
  };
  if (!d || d.precision === "unknown") {
    if (d?.hebrew) return { ...none, hebrew: d.hebrew, short: d.hebrew };
    return none;
  }
  const g = d.gregorian ?? null;
  const h = d.hebrew ?? null;
  switch (d.precision) {
    case "day": {
      const hebrew = h ?? (g ? hebrewDate(g) : null);
      const gregorian = g ? formatGregorian(g, { weekday: true }) : null;
      const short = [hebrew, g ? `(${formatGregorian(g, { short: true })})` : null]
        .filter(Boolean)
        .join(" ");
      return {
        hebrew,
        gregorian,
        short: short || "Date unknown",
        cite: cleanHebrew(hebrew) ?? (g ? formatGregorian(g) : null),
        citeGregorian: g ? formatGregorian(g) : null,
      };
    }
    case "week": {
      const gregorian = g ? `week of ${formatGregorian(g)}` : null;
      return {
        hebrew: h,
        gregorian,
        short: gregorian ?? h ?? "Date unknown",
        cite: gregorian ?? h,
        citeGregorian: null,
      };
    }
    case "month": {
      const gregorian = g ? formatGregorian(g) : null;
      return {
        hebrew: h,
        gregorian,
        short: h ?? gregorian ?? "Date unknown",
        cite: cleanHebrew(h) ?? gregorian,
        citeGregorian: null,
      };
    }
    case "year": {
      const hy = d.hebrew_year ?? null;
      const gregorian = g ? (parseGregorian(g)?.y.toString() ?? null) : null;
      const cite = hy ? `c. ${hy}` : gregorian ? `c. ${gregorian}` : null;
      return {
        hebrew: h ?? (hy ? String(hy) : null),
        gregorian,
        short: hy ? String(hy) : (gregorian ?? "Date unknown"),
        cite,
        citeGregorian: null,
      };
    }
    case "decade": {
      const y = parseGregorian(g)?.y;
      const gregorian = y ? `${Math.floor(y / 10) * 10}s` : null;
      return {
        hebrew: h,
        gregorian,
        short: gregorian ?? h ?? "Date unknown",
        cite: gregorian,
        citeGregorian: null,
      };
    }
  }
}

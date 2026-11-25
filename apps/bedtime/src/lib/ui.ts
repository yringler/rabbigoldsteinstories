/**
 * Bedtime UI vocabulary shared by the Astro pages (build time) and the client scripts: the five
 * playlist types in their fixed order, colours and icons (docs/sites/bedtime.md §2.1, §3), and
 * small pure formatting helpers. No DOM access here, so it is unit-tested in Node.
 */
import type { Edition, Playlist, PlaylistItem } from "@goldstein/playlists";

export type CoreType = "little" | "big" | "calm" | "adventure" | "mix";

export interface TypeUi {
  type: CoreType;
  name: string;
  /** Card line (also in the edition; this is the fallback before the edition loads). */
  line: string;
  color: string;
  /** SVG inner markup on a 48×48 grid, 2 px round strokes in currentColor. */
  icon: string;
}

/** A four-point sparkle centred at (x, y) with radius r. */
const sparkle = (x: number, y: number, r: number) =>
  `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z"/>`;

export const TYPES: readonly TypeUi[] = [
  {
    type: "little",
    name: "Little Ones",
    line: "Short, gentle stories. Ages 3–6.",
    color: "#F5B7A6",
    // a small sleeping moon
    icon: '<path d="M29 7.5a16.5 16.5 0 1 0 11.5 26A14 14 0 0 1 29 7.5Z"/><path d="M15.5 25.5q2.5 2.5 5 0"/><path d="M33 10.5h5l-5 5h5"/>',
  },
  {
    type: "big",
    name: "Big Kids",
    line: "Longer stories with more to think about. Ages 6–10.",
    color: "#93BBF5",
    // an open book with a star
    icon: `<path d="M24 19c-4.5-3-10.5-4-16-3v22c5.5-1 11.5 0 16 3 4.5-3 10.5-4 16-3V16c-5.5-1-11.5 0-16 3Z"/><path d="M24 19v22"/>${sparkle(24, 8, 4.5)}`,
  },
  {
    type: "calm",
    name: "Quiet Night",
    line: "Soft, slow stories for drifting off.",
    color: "#A5D0BE",
    // a candle flame
    icon: '<path d="M24 5.5c4.5 5.5 6.5 9 6.5 12a6.5 6.5 0 0 1-13 0c0-3 2-6.5 6.5-12Z"/><path d="M24 14c1.6 2.2 2.6 3.8 2.6 5.2a2.6 2.6 0 0 1-5.2 0c0-1.4 1-3 2.6-5.2Z"/><path d="M24 24v3"/><rect x="18.5" y="27" width="11" height="15" rx="2"/>',
  },
  {
    type: "adventure",
    name: "Adventure Night",
    line: "Kings, journeys and narrow escapes, settling down by the end. Ages 6+.",
    color: "#F2A45C",
    // a little ship on a wave
    icon: '<path d="M9 30h30l-4.5 7h-21Z"/><path d="M24 7v23"/><path d="M24 10l10 15H24Z"/><path d="M24 7l-6 2.5 6 2.5"/><path d="M5 42c3-2 6-2 9.5 0s6.5 2 9.5 0 6.5-2 9.5 0 6 2 9.5 0"/>',
  },
  {
    type: "mix",
    name: "Tonight's Mix",
    line: "A bit of everything.",
    color: "#C8B5F3",
    // three stars of different sizes
    icon: `${sparkle(18, 27, 11)}${sparkle(35, 12, 6.5)}${sparkle(36, 36, 4)}`,
  },
];

export const TYPE_BY_ID: Readonly<Record<string, TypeUi>> = Object.fromEntries(
  TYPES.map((t) => [t.type, t]),
);

export function iconSvg(t: TypeUi, size = 48, extra = ""): string {
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${t.icon}</svg>`;
}

/** The moon used for the wordmark, the player and the night screen. */
export const MOON_PATH = "M30 6a18 18 0 1 0 12.5 28.5A15.5 15.5 0 0 1 30 6Z";

/** "about 1½ hours", "about 2 hours", "about 50 minutes". */
export function aboutLength(totalMin: number): string {
  if (totalMin < 75) return `about ${Math.max(5, Math.round(totalMin / 5) * 5)} minutes`;
  const halves = Math.round(totalMin / 30);
  const whole = Math.floor(halves / 2);
  return `about ${whole}${halves % 2 ? "½" : ""} hours`;
}

/** m:ss or h:mm:ss. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** Track length for lists: "9 min", "1 h 12 min". */
export function minutes(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function cardMeta(p: Pick<Playlist, "total_min" | "age_min">): string {
  return `${aboutLength(p.total_min)} · ages ${Math.max(3, p.age_min)}+`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(date: string, addDays = 0): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d + addDays)).getUTCDay()]!;
}

/** "Tuesday night · 14 Kislev" (bedtime.md §2.3): weekday of the edition, Hebrew date of the night. */
export function nightLabel(e: Pick<Edition, "date" | "hebrew_date">): string {
  const heb = e.hebrew_date?.replace(/\s+\d{4}$/, "");
  return heb ? `${weekdayOf(e.date)} night · ${heb}` : `${weekdayOf(e.date)} night`;
}

interface HolidayStart {
  tag: string;
  name: string;
  month: string;
  day: number;
  /** Number of nights, for "the third night of Chanukah". */
  nights?: number;
}

const HOLIDAYS: readonly HolidayStart[] = [
  { tag: "rosh_hashanah", name: "Rosh Hashanah", month: "Tishrei", day: 1 },
  { tag: "yom_kippur", name: "Yom Kippur", month: "Tishrei", day: 10 },
  { tag: "sukkos", name: "Sukkos", month: "Tishrei", day: 15 },
  { tag: "yud_tes_kislev", name: "Yud-Tes Kislev", month: "Kislev", day: 19 },
  { tag: "chanukah", name: "Chanukah", month: "Kislev", day: 25, nights: 8 },
  { tag: "yud_shevat", name: "Yud Shevat", month: "Shevat", day: 10 },
  { tag: "purim", name: "Purim", month: "Adar", day: 14 },
  { tag: "pesach", name: "Pesach", month: "Nissan", day: 15 },
  { tag: "lag_baomer", name: "Lag BaOmer", month: "Iyar", day: 18 },
  { tag: "shavuos", name: "Shavuos", month: "Sivan", day: 6 },
];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/**
 * "Good night." plus one seasonal line when a holiday is close (bedtime.md §2.1), e.g. "Good
 * night. Chanukah starts Friday night." Uses the edition's night Hebrew date and active seasons.
 */
export function greeting(e: Pick<Edition, "date" | "hebrew_date" | "season"> | null): string {
  if (!e?.hebrew_date) return "Good night.";
  const m = /^(\d+) (.+) \d{4}$/.exec(e.hebrew_date);
  if (!m) return "Good night.";
  const day = Number(m[1]);
  const month = m[2]!.replace(/ I+$/, "");
  for (const h of HOLIDAYS) {
    if (!e.season.includes(h.tag) || h.month !== month) continue;
    const ahead = h.day - day;
    if (ahead === 0)
      return h.nights
        ? `Good night. Tonight is the first night of ${h.name}.`
        : `Good night. ${h.name} starts tonight.`;
    if (ahead === 1) return `Good night. ${h.name} starts tomorrow night.`;
    if (ahead > 1 && ahead <= 6)
      return `Good night. ${h.name} starts ${weekdayOf(e.date, ahead)} night.`;
    if (ahead < 0 && h.nights && -ahead < h.nights)
      return `Good night. Tonight is the ${ORDINALS[-ahead]} night of ${h.name}.`;
  }
  return "Good night.";
}

/** A playlist's tracks, grouping consecutive parts of one block (for the track list). */
export type ListEntry =
  | { kind: "track"; index: number; item: PlaylistItem }
  | { kind: "block"; title: string; of: number; parts: { index: number; item: PlaylistItem }[] };

export function listEntries(items: readonly PlaylistItem[]): ListEntry[] {
  const out: ListEntry[] = [];
  items.forEach((item, index) => {
    const last = out[out.length - 1];
    if (item.block && last?.kind === "block" && last.title === item.block.title) {
      last.parts.push({ index, item });
    } else if (item.block) {
      out.push({
        kind: "block",
        title: item.block.title,
        of: item.block.of,
        parts: [{ index, item }],
      });
    } else out.push({ kind: "track", index, item });
  });
  return out;
}

/** "Rabbi Chaim Levi Goldstein" style label for display; null stays null (never a placeholder). */
export function narratorLabel(n: string | null): string | null {
  if (n === "R' Chaim Levi Goldstein") return "Rabbi Chaim Levi Goldstein";
  return n;
}

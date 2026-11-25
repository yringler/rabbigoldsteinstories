/**
 * Citations (docs/sites/library.md §6.5). Built at build time into each recording page so the
 * strings are identical everywhere; the time part is appended in the browser.
 *
 *   Short: Uncle Yossi, Tzivos Hashem on the Air, ep. 271, 1 Nissan 5747, 12:34
 *   Full:  Rabbi Yosef Goldstein (Uncle Yossi), "The Mystery of Dayeinu (Rosh Chodesh Nissan)," Tzivos
 *          Hashem on the Air, episode 271, broadcast 1 Nissan 5747 (31 March 1987), at 12:34.
 *          The Goldstein Story Archive, https://<host>/r/585fe67e3e/?t=754
 *
 * No speaker is named when the speaker is unknown or an unconfirmed placeholder; the citation then
 * starts with the title. Unconfirmed series names are never asserted either.
 */
import { formatDuration, type PublicDate } from "@goldstein/data";
import { displayDate } from "./dates.ts";

export const RADIO_SERIES = "uy_tzivos_hashem_on_the_air";
const UNCLE_YOSSI = "rabbi_yosef_goldstein";
/** Speakers that never head a citation. */
const NOT_A_CITED_SPEAKER = new Set(["unknown", "guest_children"]);

export interface CiteSpeaker {
  id: string;
  label: string;
  unconfirmed: boolean;
}

export interface CiteInput {
  id: string;
  title: string;
  speakers: readonly CiteSpeaker[];
  series: { id: string; label: string; unconfirmed: boolean } | null;
  episode?: number | undefined;
  date?: PublicDate | undefined;
  /** "https://host" without a trailing slash. */
  origin: string;
  siteName: string;
}

export interface Citation {
  short: string;
  full: string;
  link: string;
}

function citedSpeaker(inp: CiteInput): CiteSpeaker | null {
  return inp.speakers.find((s) => !s.unconfirmed && !NOT_A_CITED_SPEAKER.has(s.id)) ?? null;
}

function shortSpeaker(s: CiteSpeaker, inp: CiteInput): string {
  if (s.id === UNCLE_YOSSI) {
    return inp.series?.id === RADIO_SERIES || inp.series?.id === "shema_beni"
      ? "Uncle Yossi"
      : "Rabbi Yosef Goldstein";
  }
  return s.label;
}

function seriesName(inp: CiteInput): string | null {
  if (!inp.series || inp.series.unconfirmed) return null;
  return inp.series.label.replace(/^Uncle Yossi\s*-\s*/, "");
}

/** Title without the "Episode 271: " prefix the series and number already carry. */
function citeTitle(inp: CiteInput): string {
  return inp.episode !== undefined
    ? inp.title.replace(/^Episode\s+\d+\s*[:.-]\s*/i, "")
    : inp.title;
}

export function linkAt(origin: string, id: string, t?: number | null): string {
  return `${origin}/r/${id}/${t !== undefined && t !== null ? `?t=${Math.floor(t)}` : ""}`;
}

/**
 * Build the three citation forms. `t` (seconds) adds the time part; pass it only when the player is
 * past 0:05 or the page was opened with ?t=.
 */
export function cite(inp: CiteInput, t?: number | null): Citation {
  const time = t !== undefined && t !== null ? formatDuration(t) : null;
  const speaker = citedSpeaker(inp);
  const series = seriesName(inp);
  const date = displayDate(inp.date);
  const isRadio = inp.series?.id === RADIO_SERIES;
  const link = linkAt(inp.origin, inp.id, t);

  // Short
  const shortParts: string[] = [];
  if (speaker) shortParts.push(shortSpeaker(speaker, inp));
  if (isRadio && series && inp.episode !== undefined && /^Episode\s+\d+/i.test(inp.title)) {
    shortParts.push(series, `ep. ${inp.episode}`);
  } else {
    shortParts.push(`"${citeTitle(inp)}"`);
    if (isRadio && series) shortParts.push(series);
    if (inp.episode !== undefined) shortParts.push(`ep. ${inp.episode}`);
  }
  if (date.cite) shortParts.push(date.cite);
  if (time) shortParts.push(time);
  const short = shortParts.join(", ");

  // Full
  const after: string[] = [];
  if (series) after.push(series);
  if (inp.episode !== undefined) after.push(`episode ${inp.episode}`);
  if (date.cite) {
    const g =
      date.citeGregorian && date.citeGregorian !== date.cite ? ` (${date.citeGregorian})` : "";
    after.push(`${isRadio ? "broadcast " : ""}${date.cite}${g}`);
  }
  if (time) after.push(`at ${time}`);
  const head = speaker ? `${speaker.label}, ` : "";
  const titled = `"${citeTitle(inp)}${after.length ? "," : "."}"`;
  const body = after.length ? `${head}${titled} ${after.join(", ")}.` : `${head}${titled}`;
  const full = `${body} ${inp.siteName}, ${link}`;

  return { short, full, link };
}

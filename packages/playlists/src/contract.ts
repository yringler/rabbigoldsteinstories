/**
 * The published playlist files (docs/sites/bedtime.md §4.6), served by every site under
 * /playlists/. Field names are the contract the three apps code against.
 *
 *   /playlists/index.json              the clock: past 7 + current edition (future ones are not public)
 *   /playlists/editions/<id>.json      one edition, self-contained
 *   /playlists/tonight.json            copy of the current edition at publish time (fallback)
 *   /playlists/history.json            the 7 editions before the current one, newest first
 *
 * Clients should read index.json and pick the edition whose window contains "now" (pickEdition),
 * because a site may not be redeployed exactly at the flip.
 */
import type { ItemId } from "@goldstein/data";

export const RECIPE_VERSION = 4;

export interface PlaylistTrackAdvisory {
  flag: string;
  label: string;
  severity: "mild" | "moderate" | "strong";
}

export interface PlaylistItem {
  /** Recording id (link to the item page; same id on every site). */
  id: ItemId;
  /** Unit id: `<id>` whole file, `<id>@<start>` span, `set:<key>` / `serial:<key>` block. */
  unit: string;
  title: string;
  narrator: string | null;
  audio_url: string;
  mime_type: "audio/mpeg";
  /** Always present; play exactly this range (audio is never edited; trim is applied here). */
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  age_min: number;
  band: "calm" | "middle" | "exciting" | null;
  advisories: PlaylistTrackAdvisory[];
  block: { key: string; title: string; part: number; of: number } | null;
}

export interface Playlist {
  /** `<edition id>/<type>` */
  id: string;
  type: string;
  title: string;
  subtitle: string;
  /** Kid-facing line (kids site). */
  kid_line?: string;
  /** The type's age range for display, e.g. "3–6" or "6+" (one label per type; set by the recipe). */
  ages?: string;
  total_min: number;
  /** Highest age_min among the items. */
  age_min: number;
  items: PlaylistItem[];
}

export interface Edition {
  /** Edition id: civil date of the flip in the flip time zone, e.g. "2026-11-25" (12-hour rotation adds "-pm"). */
  date: string;
  starts_at: string;
  ends_at: string;
  /** Hebrew date of the night, e.g. "16 Kislev 5787" (filled once the generator has a calendar library). */
  hebrew_date: string | null;
  /** Active calendar tag ids (seasonal weighting); [] until seasons are implemented. */
  season: string[];
  recipe_version: number;
  /** UnitPool.pool_hash the edition was generated from. */
  pool_hash: string;
  /** When the job generated it: the only field not reproducible from pool + history + edition id. */
  generated_at: string;
  playlists: Playlist[];
}

export interface IndexEntry {
  date: string;
  starts_at: string;
  ends_at: string;
  hebrew_date: string | null;
  file: string; // "editions/<date>.json", relative to /playlists/
}

export interface IndexFile {
  recipe_version: number;
  rotation_hours: number;
  flip_tz: string;
  flip_local: string;
  published_at: string;
  editions: IndexEntry[];
}

export interface HistoryFile {
  nights: Edition[];
}

/** The edition whose window contains `now`; else the newest that has started; else null. */
export function pickEdition<T extends { starts_at: string; ends_at: string }>(
  editions: readonly T[],
  now: Date | number = Date.now(),
): T | null {
  const t = typeof now === "number" ? now : now.getTime();
  const started = editions
    .filter((e) => Date.parse(e.starts_at) <= t)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return started.find((e) => t < Date.parse(e.ends_at)) ?? started[0] ?? null;
}

/** Browser helper: fetch the current edition from a site's own /playlists/ (null when unavailable; never throws). */
export async function fetchCurrentEdition(
  base = "/playlists/",
  now: Date | number = Date.now(),
): Promise<Edition | null> {
  try {
    const index = (await (await fetch(`${base}index.json`)).json()) as IndexFile;
    const entry = pickEdition(index.editions, now);
    if (entry) return (await (await fetch(`${base}${entry.file}`)).json()) as Edition;
  } catch {
    /* fall through to tonight.json */
  }
  try {
    const r = await fetch(`${base}tonight.json`);
    return r.ok ? ((await r.json()) as Edition) : null;
  } catch {
    return null;
  }
}

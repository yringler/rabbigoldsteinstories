/** Player tracks and playlist entries from catalog rows (shared by pages and browser code). */
import type { Track } from "@goldstein/player";
import type { PlaylistEntry } from "./playlists.ts";
import type { LibRow } from "./types.ts";

export interface Range {
  start?: number | undefined;
  end?: number | undefined;
  label?: string | undefined;
}

type RowLike = Pick<LibRow, "id" | "title" | "url" | "start" | "end" | "dur">;

export function trackOf(r: RowLike, range: Range = {}, artist = ""): Track {
  const t: Track = {
    id: r.id,
    title: range.label ? `${range.label} · ${r.title}` : r.title,
    url: r.url,
    start_sec: range.start ?? r.start,
    end_sec: range.end ?? r.end,
  };
  if (artist) t.artist = artist;
  return t;
}

export function entryOf(r: RowLike, range: Range = {}): PlaylistEntry {
  const e: PlaylistEntry = { rec: r.id, title: r.title.slice(0, 300) };
  if (range.start !== undefined) e.start = Math.round(range.start * 10) / 10;
  if (range.end !== undefined) e.end = Math.round(range.end * 10) / 10;
  if (range.label) e.label = range.label.slice(0, 200);
  const dur = (range.end ?? r.end) - (range.start ?? r.start);
  e.dur = Math.round((Number.isFinite(dur) && dur > 0 ? dur : r.dur) * 10) / 10;
  return e;
}

const SKIP_ARTIST = new Set(["unknown", "guest_children"]);

/** First speaker worth naming on a lock screen. */
export function artistOf(
  speakers: readonly string[],
  label: (id: string) => string,
  unconfirmed: (id: string) => boolean,
): string {
  const s = speakers.find((x) => !SKIP_ARTIST.has(x) && !unconfirmed(x));
  return s ? label(s) : "";
}

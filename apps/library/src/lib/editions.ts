/**
 * Defensive reading of the shared /playlists/ files: anything malformed is dropped rather than
 * crashing the page (library.md §9: a missing or broken file means the section is just omitted).
 */
import type { Edition, Playlist, PlaylistItem } from "@goldstein/playlists";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function item(v: unknown): PlaylistItem | null {
  if (!isObj(v)) return null;
  const ok =
    typeof v["id"] === "string" &&
    typeof v["start_sec"] === "number" &&
    typeof v["end_sec"] === "number" &&
    Number.isFinite(v["start_sec"]) &&
    Number.isFinite(v["end_sec"]) &&
    (v["end_sec"] as number) > (v["start_sec"] as number);
  if (!ok) return null;
  const it = v as unknown as PlaylistItem;
  return {
    ...it,
    title: typeof it.title === "string" ? it.title : "",
    advisories: Array.isArray(it.advisories) ? it.advisories : [],
    block: isObj(it.block) ? it.block : null,
  };
}

function playlist(v: unknown): Playlist | null {
  if (
    !isObj(v) ||
    typeof v["title"] !== "string" ||
    typeof v["type"] !== "string" ||
    !Array.isArray(v["items"])
  )
    return null;
  const items = (v["items"] as unknown[]).map(item).filter((i): i is PlaylistItem => i !== null);
  const p = v as unknown as Playlist;
  return {
    ...p,
    subtitle: typeof p.subtitle === "string" ? p.subtitle : "",
    age_min: typeof p.age_min === "number" ? p.age_min : 0,
    items,
  };
}

/** A usable edition, or null. Playlists and items that do not match the contract are dropped. */
export function sanitizeEdition(v: unknown): Edition | null {
  if (!isObj(v) || typeof v["date"] !== "string" || !Array.isArray(v["playlists"])) return null;
  const playlists = (v["playlists"] as unknown[])
    .map(playlist)
    .filter((p): p is Playlist => p !== null);
  const e = v as unknown as Edition;
  return { ...e, hebrew_date: typeof e.hebrew_date === "string" ? e.hebrew_date : null, playlists };
}

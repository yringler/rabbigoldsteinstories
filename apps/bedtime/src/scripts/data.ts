/**
 * Tonight's edition and the last 7 nights, from the site's own /playlists/ (bedtime.md §5).
 * index.json → the edition whose window contains now; else tonight.json; else the last edition
 * this browser saw (offline). Never throws, never logs.
 */
import { pickEdition, type Edition, type HistoryFile, type IndexFile } from "@goldstein/playlists";
import { EDITION_CACHE_KEY } from "../lib/session.ts";
import { store } from "./store.ts";

export interface Loaded<T> {
  data: T | null;
  /** True when the network failed and the data came from this browser's cache. */
  offline: boolean;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const isEdition = (x: unknown): x is Edition =>
  !!x && typeof x === "object" && Array.isArray((x as Edition).playlists);

let current: Promise<Loaded<Edition>> | null = null;

export function loadTonight(now = Date.now()): Promise<Loaded<Edition>> {
  current ??= (async () => {
    let edition: Edition | null = null;
    const index = await getJson<IndexFile>("/playlists/index.json");
    const entry = index && Array.isArray(index.editions) ? pickEdition(index.editions, now) : null;
    if (entry) edition = await getJson<Edition>(`/playlists/${entry.file}`);
    if (!isEdition(edition)) edition = await getJson<Edition>("/playlists/tonight.json");
    if (isEdition(edition)) {
      store.set(EDITION_CACHE_KEY, edition);
      return { data: edition, offline: false };
    }
    const cached = store.get<unknown>(EDITION_CACHE_KEY, null);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return isEdition(cached) ? { data: cached, offline: true } : { data: null, offline };
  })();
  const p = current;
  // Let a later visit (e.g. the next morning, same tab) refetch.
  void p.then(() => setTimeout(() => (current = null), 5 * 60_000));
  return p;
}

export async function loadHistory(): Promise<Edition[] | null> {
  const h = await getJson<HistoryFile>("/playlists/history.json");
  return h && Array.isArray(h.nights) ? h.nights.filter(isEdition) : null;
}

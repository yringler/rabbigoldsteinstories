/**
 * User playlists in this browser (localStorage key goldstein:library:playlists, via createStore).
 * Every change is read-modify-write on the freshest stored copy, so two open tabs do not overwrite
 * each other; a `storage` event from another tab re-renders listeners.
 */
import {
  MAX_ITEMS,
  MAX_PLAYLISTS,
  newId,
  type PlaylistEntry,
  type UserPlaylist,
} from "../lib/playlists.ts";
import { store } from "./core.ts";

const KEY = "playlists";
const META = "playlists-meta";
export const CHANGED = "gsl:playlists-changed";

interface Meta {
  /** Items added per playlist since its last export (for the backup prompt). */
  sinceExport: Record<string, number>;
  lastUsed: string | null;
  persistAsked: boolean;
}

export function all(): UserPlaylist[] {
  const v = store.get<UserPlaylist[] | null>(KEY, null);
  return Array.isArray(v) ? v : [];
}

export function get(id: string): UserPlaylist | undefined {
  return all().find((p) => p.id === id);
}

export function meta(): Meta {
  return {
    sinceExport: {},
    lastUsed: null,
    persistAsked: false,
    ...store.get<Partial<Meta>>(META, {}),
  };
}

function setMeta(fn: (m: Meta) => void): void {
  const m = meta();
  fn(m);
  store.set(META, m);
}

function emit(): void {
  document.dispatchEvent(new CustomEvent(CHANGED));
}

export function mutate(fn: (list: UserPlaylist[]) => UserPlaylist[]): UserPlaylist[] {
  const next = fn(all().map((p) => ({ ...p, items: [...p.items] })));
  store.set(KEY, next);
  emit();
  return next;
}

const now = () => new Date().toISOString();

export function create(
  name: string,
  items: PlaylistEntry[] = [],
  origin?: string,
): UserPlaylist | null {
  if (all().length >= MAX_PLAYLISTS) return null;
  const p: UserPlaylist = {
    id: newId(),
    name: name.slice(0, 120) || "Untitled playlist",
    created: now(),
    updated: now(),
    items: items.slice(0, MAX_ITEMS),
  };
  if (origin) p.origin = origin.slice(0, 200);
  mutate((l) => [...l, p]);
  setMeta((m) => {
    m.lastUsed = p.id;
    m.sinceExport[p.id] = items.length;
  });
  requestPersistence();
  return p;
}

/** Append entries; returns the number actually added (500-item limit). */
export function add(id: string, entries: PlaylistEntry[]): number {
  let added = 0;
  mutate((l) =>
    l.map((p) => {
      if (p.id !== id) return p;
      const room = Math.max(0, MAX_ITEMS - p.items.length);
      const take = entries.slice(0, room);
      added = take.length;
      return { ...p, items: [...p.items, ...take], updated: now() };
    }),
  );
  setMeta((m) => {
    m.lastUsed = id;
    m.sinceExport[id] = (m.sinceExport[id] ?? 0) + added;
  });
  return added;
}

export function update(id: string, fn: (p: UserPlaylist) => UserPlaylist): void {
  mutate((l) => l.map((p) => (p.id === id ? { ...fn(p), updated: now() } : p)));
}

export function remove(id: string): UserPlaylist | undefined {
  const gone = get(id);
  mutate((l) => l.filter((p) => p.id !== id));
  return gone;
}

export function restore(p: UserPlaylist, index: number): void {
  mutate((l) => {
    const copy = l.filter((x) => x.id !== p.id);
    copy.splice(Math.min(index, copy.length), 0, p);
    return copy;
  });
}

export function replaceAll(list: UserPlaylist[]): void {
  mutate(() => list);
}

export function markExported(ids: string[]): void {
  setMeta((m) => {
    for (const id of ids) m.sinceExport[id] = 0;
  });
}

function requestPersistence(): void {
  if (meta().persistAsked) return;
  setMeta((m) => (m.persistAsked = true));
  void navigator.storage?.persist?.().catch(() => false);
}

let listening = false;
export function listenAcrossTabs(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key === `goldstein:library:${KEY}`) emit();
  });
}

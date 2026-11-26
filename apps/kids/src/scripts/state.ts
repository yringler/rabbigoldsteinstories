/**
 * Per-device state in localStorage (docs/sites/kids.md §7): band, gentle, favourites, progress,
 * queue, speed, AI-improved sound (docs/design/ai-audio.md §3.2). Keys go through createStore("kids") → goldstein:kids:<key>; the store never throws
 * and falls back to memory, so the site works fully without storage.
 */
import {
  createStore,
  getAiAudio as getAiAudioIn,
  setAiAudio as setAiAudioIn,
  type Track,
} from "@goldstein/player";
import { type Band, DEFAULT_BAND, type Variant, variantOf } from "../lib/kinds.ts";

export const store = createStore("kids");

export const FAV_MAX = 200;
export const PROGRESS_MAX = 300;
export const FINISHED_SHOWN = 50;

export interface Fav {
  id: string;
  at: number;
}
export interface Progress {
  /** Seconds into the played range. */
  pos: number;
  /** Length of the played range. */
  dur: number;
  at: number;
  done: boolean;
}
export interface SavedQueue {
  tracks: Track[];
  index: number;
  source: string;
}

type Topic = "band" | "favs" | "progress";
const bus = new EventTarget();
export function on(topic: Topic, fn: () => void): () => void {
  bus.addEventListener(topic, fn);
  return () => bus.removeEventListener(topic, fn);
}
const emit = (topic: Topic) => bus.dispatchEvent(new Event(topic));

// ── Band and Gentle ─────────────────────────────────────────────────────
export function getBand(): Band {
  const b = store.get<string>("band", DEFAULT_BAND);
  return b === "little" || b === "kids" || b === "big" ? b : DEFAULT_BAND;
}
export const hasChosenBand = (): boolean => store.get<string | null>("band", null) !== null;
export const getGentle = (): boolean => store.get<boolean>("gentle", false) === true;
export const getVariant = (): Variant => variantOf(getBand(), getGentle());

export function setBand(b: Band): void {
  store.set("band", b);
  applyVariant();
  emit("band");
}
export function setGentle(g: boolean): void {
  store.set("gentle", g);
  applyVariant();
  emit("band");
}
/** Put the active variant on <html> (CSS hides everything outside it). */
export function applyVariant(): void {
  const h = document.documentElement;
  h.dataset["band"] = getBand();
  h.dataset["v"] = getVariant();
}

// ── Favourites ──────────────────────────────────────────────────────────
export function getFavs(): Fav[] {
  const v = store.get<Fav[]>("favs", []);
  return Array.isArray(v) ? v.filter((f) => typeof f?.id === "string") : [];
}
export const isFav = (id: string): boolean => getFavs().some((f) => f.id === id);
/** Toggle a heart; newest first, capped at FAV_MAX. Returns the new state. */
export function toggleFav(id: string, now = Date.now()): boolean {
  const list = getFavs();
  const had = list.some((f) => f.id === id);
  const next = had ? list.filter((f) => f.id !== id) : [{ id, at: now }, ...list].slice(0, FAV_MAX);
  store.set("favs", next);
  emit("favs");
  return !had;
}
export function clearShelf(): void {
  store.remove("favs");
  store.remove("progress");
  emit("favs");
  emit("progress");
}

// ── Progress ────────────────────────────────────────────────────────────
export function getProgress(): Record<string, Progress> {
  const v = store.get<Record<string, Progress>>("progress", {});
  return v && typeof v === "object" ? v : {};
}
/** Finished at 95% or within 20 s of the end (§7). */
export const isDone = (pos: number, dur: number): boolean =>
  dur > 0 && (pos >= dur * 0.95 || dur - pos <= 20);

export function saveProgress(id: string, pos: number, dur: number, now = Date.now()): void {
  if (!(dur > 0)) return;
  const all = getProgress();
  const prev = all[id];
  const done = isDone(pos, dur) || (prev?.done === true && pos < 30);
  all[id] = { pos: Math.round(pos), dur: Math.round(dur), at: now, done };
  const ids = Object.keys(all);
  if (ids.length > PROGRESS_MAX) {
    ids
      .sort((a, b) => (all[a]?.at ?? 0) - (all[b]?.at ?? 0))
      .slice(0, ids.length - PROGRESS_MAX)
      .forEach((x) => delete all[x]);
  }
  store.set("progress", all);
  emit("progress");
}
export function markDone(id: string, dur: number, now = Date.now()): void {
  saveProgress(id, dur, dur, now);
}

/** Keep Listening: progress between 30 s and 95%, most recent first (§4.1). */
export function keepListening(limit = 6): string[] {
  const all = getProgress();
  return Object.entries(all)
    .filter(([, p]) => !p.done && p.pos >= 30 && p.pos < p.dur * 0.95)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .map(([id]) => id);
}
export function finished(limit = FINISHED_SHOWN): string[] {
  return Object.entries(getProgress())
    .filter(([, p]) => p.done)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .map(([id]) => id);
}

// ── Queue and speed ─────────────────────────────────────────────────────
export function getSavedQueue(): SavedQueue | null {
  const q = store.get<SavedQueue | null>("queue", null);
  return q && Array.isArray(q.tracks) && q.tracks.length > 0 ? q : null;
}
export function saveQueue(q: SavedQueue | null): void {
  if (!q || q.tracks.length === 0) store.remove("queue");
  else store.set("queue", q);
}
export const SPEEDS = [0.8, 1, 1.25] as const;
export function getSpeed(): number {
  const s = store.get<number>("speed", 1);
  return (SPEEDS as readonly number[]).includes(s) ? s : 1;
}
export const setSpeed = (s: number): void => store.set("speed", s);

// ── AI-improved sound (grown-ups setting, off by default) ───────────────
export const getAiAudio = (): boolean => getAiAudioIn(store);
export const setAiAudio = (on: boolean): void => setAiAudioIn(store, on);

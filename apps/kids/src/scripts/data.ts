/** Same-origin JSON the client loads lazily (never the media host). Each fetch is cached per visit. */
import type { KidChapter } from "../lib/chapters.ts";
import type { CalendarDay } from "../lib/build/calendar.ts";
import { type Variant, inVariant } from "../lib/kinds.ts";
import { type KidsIndex, type Rec, recLang } from "../lib/records.ts";

const cache = new Map<string, Promise<unknown>>();

function getJson<T>(url: string): Promise<T | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    cache.set(url, p);
  }
  return p as Promise<T | null>;
}

export interface IndexData {
  list: Rec[];
  byId: Map<string, Rec>;
  serials: KidsIndex["serials"];
}
let indexData: Promise<IndexData> | null = null;
export function loadIndex(): Promise<IndexData> {
  indexData ??= getJson<KidsIndex>("/kids/index.json").then((ix) => {
    const list = ix?.items ?? [];
    return { list, byId: new Map(list.map((r) => [r.id, r])), serials: ix?.serials ?? {} };
  });
  return indexData;
}

export interface CalendarFile {
  days: CalendarDay[];
  /** Holiday slug → civil dates of its main day (for ordering /holidays). */
  mains: Record<string, string[]>;
  /** Labels for chassidishe date ids and parsha ids. */
  labels: Record<string, string>;
}
export const loadCalendar = (): Promise<CalendarFile | null> =>
  getJson<CalendarFile>("/kids/calendar.json");

/** Chapters (generic labels for private segments), silence ranges, next chapter and related ids. */
export interface ItemExtra {
  c: KidChapter[];
  z: [number, number][];
  n: string | null;
  r: string[];
  /** "More like this" for "Both" / "Yiddish only" (absent = same as `r`). */
  ra?: string[];
  ry?: string[];
  /** summary_short (Story of the Day card). */
  sum: string;
}
export const loadExtra = (id: string): Promise<ItemExtra | null> =>
  getJson<ItemExtra>(`/kids/item/${id}.json`);

/** Local civil date YYYY-MM-DD, rolling over at 04:00 (§6.4). */
export function localDay(now = new Date()): string {
  const d = new Date(now.getTime() - 4 * 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Days since 2026-01-01 (local, 04:00 rollover). */
export function dayNumber(now = new Date()): number {
  const [y, m, d] = localDay(now).split("-").map(Number);
  const a = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  return Math.floor((a - Date.UTC(2026, 0, 1)) / 86_400_000);
}

/** In the variant: band, Gentle and language preference. */
export const recIn = (r: Rec, v: Variant): boolean => inVariant(r.a, r.v, v, recLang(r));

/** Deterministic daily shuffle (stable per day and seed). */
export function dailyPick<T>(list: readonly T[], n: number, seed: number): T[] {
  const a = [...list];
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a.slice(0, n);
}

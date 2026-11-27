/** Story of the Day (docs/sites/kids.md §6.4) and Surprise Me. Pure; browser-safe. */
import { type Variant, inVariant } from "./kinds.ts";
import { type Rec, recLang } from "./records.ts";
import { HOLIDAY_TILES } from "./tiles.ts";

/** The banded pool in sha256(id) order. */
export function sotdPool(recs: readonly Rec[], v: Variant): Rec[] {
  return recs
    .filter((r) => r.sd === 1 && inVariant(r.a, r.v, v, recLang(r)))
    .sort((a, b) => a.r - b.r);
}

/**
 * pool[d mod len]; on even d, an active holiday group with at least 5 pool items wins:
 * seasonal[(d/2) mod len]. `activeGroups` are holiday slugs (soonest first), `activeDates` single
 * chassidishe date ids.
 */
export function storyOfTheDay(
  recs: readonly Rec[],
  v: Variant,
  d: number,
  activeGroups: readonly string[] = [],
  activeDates: readonly string[] = [],
): Rec | null {
  const pool = sotdPool(recs, v);
  if (pool.length === 0) return null;
  if (d % 2 === 0) {
    const idSets: string[][] = [
      ...activeGroups.map((g) => [...(HOLIDAY_TILES.find((t) => t.slug === g)?.ids ?? [])]),
      ...activeDates.map((id) => [id]),
    ];
    for (const ids of idSets) {
      const seasonal = pool.filter((r) => r.c?.some((c) => ids.includes(c)));
      if (seasonal.length >= 5) return seasonal[Math.floor(d / 2) % seasonal.length] ?? null;
    }
  }
  return pool[((d % pool.length) + pool.length) % pool.length] ?? null;
}

/** Surprise Me: a random standalone story from the Story-of-the-Day pool (stories only). */
export function surprise(
  recs: readonly Rec[],
  v: Variant,
  rnd: () => number = Math.random,
): Rec | null {
  const pool = sotdPool(recs, v).filter((r) => r.k === "story");
  return pool[Math.floor(rnd() * pool.length)] ?? null;
}

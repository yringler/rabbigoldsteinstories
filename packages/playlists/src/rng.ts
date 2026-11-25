/** Deterministic PRNG seeded from SHA-256 (bedtime.md §4.5). */
import { sha256 } from "./sha256.ts";

export type Rng = () => number;

/** mulberry32 seeded with the first 4 bytes of sha256(seed): uniform floats in [0, 1). */
export function seededRng(seed: string): Rng {
  const d = sha256(seed);
  let a = ((d[0]! << 24) | (d[1]! << 16) | (d[2]! << 8) | d[3]!) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted draw of one element (weights > 0). */
export function weightedPick<T>(
  items: readonly T[],
  weight: (t: T) => number,
  rng: Rng,
): T | undefined {
  let sum = 0;
  for (const it of items) sum += Math.max(0, weight(it));
  if (sum <= 0) return undefined;
  let r = rng() * sum;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

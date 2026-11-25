/**
 * "More like this" (docs/sites/kids.md §6.3): weighted-IDF cosine over tags, computed at build time
 * over the kid pool. Pure; the build feeds it the pool and the exclusion facts.
 */
import type { Kind } from "./kinds.ts";

export interface SimInput {
  id: string;
  kind: Kind;
  /** [featureKey, baseWeight]; the same key twice keeps the larger weight. */
  features: readonly (readonly [string, number])[];
  storyKey?: string | undefined;
  setKey?: string | undefined;
  /** Part number within a part set (only part 1 of a multi-part set is eligible as a candidate). */
  partNumber?: number | undefined;
  storyGroup?: string | undefined;
  /** Directly related ids (either direction is checked). */
  related: readonly string[];
  /** Playable seconds: a near-duplicate must also be within DUPLICATE_DURATION of the other's length. */
  dur?: number | undefined;
  /** Title: a likely duplicate also has a near-identical title. */
  title?: string | undefined;
}

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? []);
/** Jaccard overlap of title words. */
export function titleOverlap(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  const union = wa.size + wb.size - both;
  return union === 0 ? 0 : both / union;
}
export const DUPLICATE_TITLE = 0.6;

export const NEAR_DUPLICATE = 0.85;
/**
 * Many short radio clips carry two or three identical tags, so a high score alone is common between
 * different talks. A pair is reported as a likely duplicate recording only when the lengths also
 * agree within 5%, the titles mostly match, and neither is a whole radio show (all shows run about 30 minutes; re-airs are
 * already linked). The known case, "The Plot That Boomeranged", differs by 1.7%. Every pair at or
 * above NEAR_DUPLICATE is still kept out of "More like this".
 */
export const DUPLICATE_DURATION = 0.05;
export const KEEP = 12;
export const MAX_SAME_SERIES = 3;

export function kindFactor(a: Kind, b: Kind): number {
  if (a === b) return 1;
  if ((a === "story" && b === "show") || (a === "show" && b === "story")) return 0.8;
  return 0.5;
}

/** Feature list with base weights (§6.3). */
export function featuresOf(x: {
  people: readonly { id: string; role: string }[];
  midos: readonly string[];
  characters: readonly string[];
  topics: readonly string[];
  mitzvos: readonly string[];
  parshiyos: readonly string[];
  story_type: readonly string[];
  calendar: readonly string[];
}): [string, number][] {
  const out: [string, number][] = [];
  for (const p of x.people)
    out.push([`p:${p.id}`, p.role === "central" || p.role === "appears" ? 3 : 0.5]);
  for (const m of x.midos) out.push([`m:${m}`, 1.5]);
  for (const c of x.characters) {
    const k = c.trim().toLowerCase();
    if (k) out.push([`c:${k}`, 1.5]);
  }
  for (const t of x.topics) out.push([`t:${t}`, 1]);
  for (const t of x.mitzvos) out.push([`z:${t}`, 1]);
  for (const t of x.parshiyos) out.push([`r:${t}`, 1]);
  for (const t of x.story_type) out.push([`s:${t}`, 1]);
  for (const t of x.calendar) out.push([`d:${t}`, 0.75]);
  return out;
}

export interface SimResult {
  related: Map<string, string[]>;
  /** Unlinked pairs scoring >= NEAR_DUPLICATE with matching length (report for the owner; treated as "Other versions"). */
  nearDuplicates: { a: string; b: string; score: number }[];
  /** Score lookup for tests. */
  score(a: string, b: string): number;
}

export function computeSimilar(pool: readonly SimInput[]): SimResult {
  const N = pool.length;
  // Merge duplicate feature keys (keep max weight).
  const feats = pool.map((x) => {
    const m = new Map<string, number>();
    for (const [k, w] of x.features) m.set(k, Math.max(m.get(k) ?? 0, w));
    return m;
  });
  const df = new Map<string, number>();
  for (const m of feats) for (const k of m.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  // Weighted vectors, dropping features that occur in only one item.
  const vec = feats.map((m) => {
    const v = new Map<string, number>();
    for (const [k, w] of m) {
      const d = df.get(k) ?? 0;
      if (d < 2) continue;
      const wt = w * Math.log(N / d);
      if (wt > 0) v.set(k, wt);
    }
    return v;
  });
  const total = vec.map((v) => {
    let s = 0;
    for (const w of v.values()) s += w;
    return s;
  });
  const posting = new Map<string, number[]>();
  vec.forEach((v, i) => {
    for (const k of v.keys()) {
      const l = posting.get(k);
      if (l) l.push(i);
      else posting.set(k, [i]);
    }
  });
  const index = new Map(pool.map((x, i) => [x.id, i]));
  const relatedSet = pool.map((x) => new Set(x.related));

  const scoreIdx = (i: number, j: number): number => {
    const a = vec[i];
    const b = vec[j];
    const ta = total[i] ?? 0;
    const tb = total[j] ?? 0;
    if (!a || !b || ta === 0 || tb === 0) return 0;
    let overlap = 0;
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    for (const [k, w] of small) {
      const w2 = big.get(k);
      if (w2 !== undefined) overlap += Math.min(w, w2);
    }
    const pa = pool[i];
    const pb = pool[j];
    if (!pa || !pb) return 0;
    return (overlap / Math.sqrt(ta * tb)) * kindFactor(pa.kind, pb.kind);
  };

  const directlyRelated = (i: number, j: number): boolean => {
    const a = pool[i];
    const b = pool[j];
    if (!a || !b) return false;
    return relatedSet[i]?.has(b.id) === true || relatedSet[j]?.has(a.id) === true;
  };

  const nearDuplicates: SimResult["nearDuplicates"] = [];
  const related = new Map<string, string[]>();

  for (let i = 0; i < N; i++) {
    const src = pool[i];
    const v = vec[i];
    if (!src || !v) continue;
    const cands = new Set<number>();
    for (const k of v.keys()) for (const j of posting.get(k) ?? []) if (j !== i) cands.add(j);
    const scored: { j: number; s: number }[] = [];
    for (const j of cands) {
      const c = pool[j];
      if (!c) continue;
      const s = scoreIdx(i, j);
      if (s <= 0) continue;
      const linked =
        directlyRelated(i, j) ||
        Boolean(src.storyGroup && src.storyGroup === c.storyGroup) ||
        Boolean(src.storyKey && src.storyKey === c.storyKey) ||
        Boolean(src.setKey && src.setKey === c.setKey);
      if (s >= NEAR_DUPLICATE) {
        const da = src.dur ?? 0;
        const db = c.dur ?? 0;
        const sameLength =
          src.kind !== "show" &&
          c.kind !== "show" &&
          da > 0 &&
          db > 0 &&
          Math.abs(da - db) / Math.max(da, db) <= DUPLICATE_DURATION &&
          titleOverlap(src.title ?? "", c.title ?? "") >= DUPLICATE_TITLE;
        if (!linked && sameLength && i < j)
          nearDuplicates.push({ a: src.id, b: c.id, score: round(s) });
        continue;
      }
      if (linked) continue;
      if (c.setKey && (c.partNumber ?? 1) !== 1) continue;
      scored.push({ j, s });
    }
    scored.sort((x, y) => y.s - x.s || ((pool[x.j]?.id ?? "") < (pool[y.j]?.id ?? "") ? -1 : 1));
    const out: string[] = [];
    const perSeries = new Map<string, number>();
    for (const { j } of scored) {
      const c = pool[j];
      if (!c) continue;
      const keys = [c.storyKey && `s:${c.storyKey}`, c.setKey && `p:${c.setKey}`].filter(
        (k): k is string => Boolean(k),
      );
      if (keys.some((k) => (perSeries.get(k) ?? 0) >= MAX_SAME_SERIES)) continue;
      for (const k of keys) perSeries.set(k, (perSeries.get(k) ?? 0) + 1);
      out.push(c.id);
      if (out.length >= KEEP) break;
    }
    related.set(src.id, out);
  }

  return {
    related,
    nearDuplicates,
    score(a: string, b: string) {
      const i = index.get(a);
      const j = index.get(b);
      return i === undefined || j === undefined ? 0 : scoreIdx(i, j);
    },
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

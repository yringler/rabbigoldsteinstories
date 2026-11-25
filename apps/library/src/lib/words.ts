/**
 * Word timings for transcript highlighting. The public transcript carries line start/end times
 * only (word timings are not in the public dataset), so word times are interpolated across the
 * line in proportion to word length. Good to within a fraction of a second on normal speech.
 */
export interface TimedWord {
  text: string;
  /** Leading whitespace kept so the line re-renders exactly. */
  space: string;
  t: number;
}

export function timeWords(text: string, start: number, end: number): TimedWord[] {
  const parts = text.match(/\s*\S+/g) ?? [];
  const weights = parts.map((p) => p.trim().length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0, end - start);
  let acc = 0;
  return parts.map((p, i) => {
    const t = start + (acc / total) * span;
    acc += weights[i] ?? 0;
    const m = /^(\s*)(.*)$/s.exec(p);
    return { space: m?.[1] ?? "", text: m?.[2] ?? p, t: Math.round(t * 100) / 100 };
  });
}

/** Index of the last element whose start is ≤ t (binary search over sorted starts); -1 if none. */
export function lastAtOrBefore(starts: readonly number[], t: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((starts[mid] ?? Infinity) <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

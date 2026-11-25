/**
 * Clips nest under their episode when both are in the results (library.md §4.2). A clip of a clip
 * nests under its top-level ancestor among the results, so nothing disappears.
 */
export interface Nestable<R extends { id: string; clipOf: readonly string[] }> {
  row: R;
  nested: R[];
  meta: number;
  tr: number;
}

export function nestClips<
  R extends { id: string; clipOf: readonly string[] },
  T extends Nestable<R>,
>(results: readonly T[]): T[] {
  const byId = new Map(results.map((r) => [r.row.id, r]));
  const parentOf = (r: T): T | undefined =>
    r.row.clipOf.map((p) => byId.get(p)).find((p) => p !== undefined && p !== r);
  /** Top-level ancestor; inside a cycle, the member with the smallest id is the root. */
  const top = (r: T): T => {
    const path: T[] = [r];
    let cur = r;
    for (;;) {
      const p = parentOf(cur);
      if (!p) return cur;
      const at = path.indexOf(p);
      if (at >= 0) return path.slice(at).reduce((m, x) => (x.row.id < m.row.id ? x : m));
      path.push(p);
      cur = p;
    }
  };
  const out: T[] = [];
  for (const r of results) {
    const t = top(r);
    if (t === r) out.push(r);
    else {
      t.nested.push(r.row, ...r.nested.splice(0));
      t.meta = Math.max(t.meta, r.meta);
      t.tr = Math.max(t.tr, r.tr);
    }
  }
  return out;
}

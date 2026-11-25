/**
 * Rows of the /t/<id>.json transcript files (library.md §6.4): consecutive withheld lines collapse
 * into one gap row that carries no reason, role or kind (§5.4 rule 5).
 */
export type TRow = [number, number, string] | { gap: true; start: number; end: number };

export function transcriptRows(
  lines: readonly { s: number; e: number; t: string | null }[],
): TRow[] {
  const out: TRow[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (l.t === null) {
      if (last && !Array.isArray(last)) last.end = Math.max(last.end, l.e);
      else out.push({ gap: true, start: l.s, end: l.e });
    } else out.push([l.s, l.e, l.t]);
  }
  return out;
}

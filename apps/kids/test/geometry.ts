/** Geometry helpers for the no-cross-shapes check (test/icons.test.ts). */
type Pt = [number, number];

/** Straight-line subpaths of a path's d (subpaths with any curve command are skipped). */
export function polylines(d: string): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let pts: Pt[] = [];
  let curved = false;
  const flush = (closed: boolean) => {
    if (!curved && pts.length > 1) out.push({ pts, closed });
    pts = [];
    curved = false;
  };
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i] ?? "";
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        flush(true);
        cur = start;
        continue;
      }
    }
    switch (cmd) {
      case "M":
      case "m": {
        flush(false);
        const x = num();
        const y = num();
        cur = cmd === "m" ? [cur[0] + x, cur[1] + y] : [x, y];
        start = cur;
        pts = [cur];
        cmd = cmd === "m" ? "l" : "L";
        break;
      }
      case "L":
      case "l": {
        const x = num();
        const y = num();
        cur = cmd === "l" ? [cur[0] + x, cur[1] + y] : [x, y];
        pts.push(cur);
        break;
      }
      case "H":
      case "h": {
        const x = num();
        cur = [cmd === "h" ? cur[0] + x : x, cur[1]];
        pts.push(cur);
        break;
      }
      case "V":
      case "v": {
        const y = num();
        cur = [cur[0], cmd === "v" ? cur[1] + y : y];
        pts.push(cur);
        break;
      }
      default: {
        // Curve: consume its numbers and mark the subpath as curved.
        curved = true;
        const n = { C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, T: 2, t: 2, A: 7, a: 7 }[cmd] ?? 2;
        const vals = Array.from({ length: n }, num);
        const rel = cmd === cmd.toLowerCase();
        const x = vals[n - 2] ?? 0;
        const y = vals[n - 1] ?? 0;
        cur = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      }
    }
  }
  flush(false);
  return out;
}

export function segments(svg: string): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  for (const m of svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*>/g)) {
    const tag = m[0];
    if (/transform=/.test(tag)) continue;
    for (const p of polylines(m[1] ?? "")) {
      for (let k = 1; k < p.pts.length; k++) segs.push([p.pts[k - 1] as Pt, p.pts[k] as Pt]);
    }
  }
  return segs;
}

/** Do two segments cross with at least `margin` of each stroke on both sides of the crossing? */
export function crosses([a, b]: [Pt, Pt], [c, d]: [Pt, Pt], margin = 1.5): boolean {
  const r: Pt = [b[0] - a[0], b[1] - a[1]];
  const s: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  const lr = Math.hypot(...r);
  const ls = Math.hypot(...s);
  if (Math.abs(den) < 1e-9 || lr === 0 || ls === 0) return false;
  if (Math.abs(den) / (lr * ls) < Math.sin(Math.PI / 6)) return false; // nearly parallel
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t * lr > margin && (1 - t) * lr > margin && u * ls > margin && (1 - u) * ls > margin;
}

export function fourPointStars(svg: string): number {
  let n = 0;
  for (const m of svg.matchAll(/\sd="([^"]+)"/g)) {
    for (const p of polylines(m[1] ?? "")) {
      const pts =
        p.closed && p.pts.length > 1 && p.pts[0]?.join() === p.pts[p.pts.length - 1]?.join()
          ? p.pts.slice(0, -1)
          : p.pts;
      if (!p.closed || pts.length !== 8) continue;
      const cx = pts.reduce((s, q) => s + q[0], 0) / 8;
      const cy = pts.reduce((s, q) => s + q[1], 0) / 8;
      const r = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
      const even = Math.min(...r.filter((_, i) => i % 2 === 0));
      const odd = Math.max(...r.filter((_, i) => i % 2 === 1));
      const even2 = Math.min(...r.filter((_, i) => i % 2 === 1));
      const odd2 = Math.max(...r.filter((_, i) => i % 2 === 0));
      if (odd < even * 0.7 || odd2 < even2 * 0.7) n++;
    }
  }
  return n;
}

export const crossingPairs = (svg: string, log = false): number => {
  const segs = segments(svg);
  let n = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++)
      if (crosses(segs[i] as [Pt, Pt], segs[j] as [Pt, Pt])) {
        n++;
        if (log) console.log(JSON.stringify([segs[i], segs[j]]));
      }
  return n;
};

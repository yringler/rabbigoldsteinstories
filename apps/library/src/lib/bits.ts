/** Fixed-size bitsets over catalog rows (one bit per row). Pure and allocation-light. */
export type Bits = Uint32Array;

export const words = (n: number): number => Math.ceil(n / 32);

export function empty(n: number): Bits {
  return new Uint32Array(words(n));
}

export function full(n: number): Bits {
  const b = new Uint32Array(words(n)).fill(0xffffffff);
  const rest = n % 32;
  if (rest && b.length) b[b.length - 1] = (2 ** rest - 1) >>> 0;
  return b;
}

export function set(b: Bits, i: number): void {
  const w = i >>> 5;
  b[w] = ((b[w] ?? 0) | (1 << (i & 31))) >>> 0;
}

export function has(b: Bits, i: number): boolean {
  return (((b[i >>> 5] ?? 0) >>> (i & 31)) & 1) === 1;
}

export function and(a: Bits, b: Bits): Bits {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = ((a[i] ?? 0) & (b[i] ?? 0)) >>> 0;
  return out;
}

export function or(a: Bits, b: Bits): Bits {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = ((a[i] ?? 0) | (b[i] ?? 0)) >>> 0;
  return out;
}

export function andNot(a: Bits, b: Bits): Bits {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = ((a[i] ?? 0) & ~(b[i] ?? 0)) >>> 0;
  return out;
}

function popcount32(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function count(b: Bits): number {
  let c = 0;
  for (let i = 0; i < b.length; i++) c += popcount32(b[i] ?? 0);
  return c;
}

/** Count of a ∧ b without allocating. */
export function countAnd(a: Bits, b: Bits): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) c += popcount32(((a[i] ?? 0) & (b[i] ?? 0)) >>> 0);
  return c;
}

export function indices(b: Bits): number[] {
  const out: number[] = [];
  for (let w = 0; w < b.length; w++) {
    let x = b[w] ?? 0;
    while (x) {
      const t = x & -x;
      out.push(w * 32 + (31 - Math.clz32(t)));
      x = (x ^ t) >>> 0;
    }
  }
  return out;
}

export function fromPredicate(n: number, pred: (i: number) => boolean): Bits {
  const b = empty(n);
  for (let i = 0; i < n; i++) if (pred(i)) set(b, i);
  return b;
}

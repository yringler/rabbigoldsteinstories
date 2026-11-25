/**
 * Metadata text search (docs/sites/library.md §5.3): a small hand-written scorer over title,
 * keywords, characters, places, lesson and summary. Words are ANDed, "quoted phrases" must occur
 * as written, and the last word matches as a prefix. Ranking: title > keywords/characters/places >
 * lesson > summary. Plus query-time transliteration variants (§5.3 item 3).
 */
import type { LibRow } from "./types.ts";

/** Lowercase, strip diacritics and apostrophes, punctuation to spaces, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-֑ͯ-ׇ]/g, "")
    .toLowerCase()
    .replace(/['’`ʼ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface ParsedQuery {
  /** Single words (normalized). */
  terms: string[];
  /** Quoted phrases (normalized). */
  phrases: string[];
  /** True when the query ended mid-word (prefix match on the last term). */
  prefixLast: boolean;
}

export function parseQuery(q: string): ParsedQuery {
  const phrases: string[] = [];
  const rest = q.replace(/"([^"]*)"?/g, (_m, p: string) => {
    const n = normalize(p);
    if (n) phrases.push(n);
    return " ";
  });
  const terms = normalize(rest).split(" ").filter(Boolean);
  const prefixLast = terms.length > 0 && !/["\s]$/.test(q);
  return { terms, phrases, prefixLast };
}

export const hasHebrewScript = (s: string): boolean => /[֐-׿]/.test(s);

interface Field {
  text: string;
  weight: number;
}

/** Per-row normalized fields (built once per catalog). */
export class TextIndex {
  private readonly fields: Field[][];
  constructor(rows: readonly LibRow[]) {
    this.fields = rows.map((r) => {
      const f = (s: string | undefined, weight: number): Field => ({
        text: ` ${normalize(s ?? "")} `,
        weight,
      });
      return [
        f(`${r.title} ${r.he ?? ""}`, 10),
        f([...r.keywords, ...r.characters, ...r.places].join(" | "), 5),
        f(r.lesson, 3),
        f(r.summary, 2),
      ];
    });
  }

  /** Scores in 0..1 for every row that matches all terms and phrases. */
  search(q: ParsedQuery): Map<number, number> {
    const out = new Map<number, number>();
    if (!q.terms.length && !q.phrases.length) return out;
    const tests: { needle: string; maxWeight: number }[] = [];
    q.terms.forEach((t, i) => {
      const prefix = q.prefixLast && i === q.terms.length - 1;
      tests.push({ needle: prefix ? ` ${t}` : ` ${t} `, maxWeight: 10 });
    });
    for (const p of q.phrases) tests.push({ needle: ` ${p} `, maxWeight: 10 });
    const max = tests.length * 10;
    this.fields.forEach((fields, i) => {
      let score = 0;
      for (const t of tests) {
        let best = 0;
        for (const f of fields) if (f.weight > best && f.text.includes(t.needle)) best = f.weight;
        if (!best) return;
        score += best;
      }
      out.set(i, score / max);
    });
    return out;
  }
}

/**
 * Transliteration variants of one word (at most `limit`), e.g. dayeinu → dayenu, dayinu.
 * Rules: -a/-ah, ch/kh, tz/ts, ei/e/ey/ai, s/t (sav), o/a (kamatz), doubled consonants.
 */
export function variants(word: string, limit = 5): string[] {
  const w = normalize(word);
  if (w.length < 3 || hasHebrewScript(w) || /\d/.test(w)) return [];
  const out = new Set<string>();
  const add = (v: string) => {
    if (v !== w && v.length >= 3) out.add(v);
  };
  if (w.endsWith("ah")) add(w.slice(0, -1));
  else if (w.endsWith("a")) add(`${w}h`);
  if (w.includes("ch")) add(w.replace(/ch/g, "kh"));
  if (w.includes("kh")) add(w.replace(/kh/g, "ch"));
  if (w.includes("tz")) add(w.replace(/tz/g, "ts"));
  if (w.includes("ts")) add(w.replace(/ts/g, "tz"));
  if (w.includes("ei")) {
    add(w.replace(/ei/g, "e"));
    add(w.replace(/ei/g, "ey"));
    add(w.replace(/ei/g, "ai"));
  } else if (w.includes("ey")) add(w.replace(/ey/g, "ei"));
  if (/s$/.test(w)) add(w.replace(/s$/, "t"));
  else if (/t$/.test(w)) add(w.replace(/t$/, "s"));
  if (/o/.test(w)) add(w.replace(/o/, "a"));
  const undoubled = w.replace(/([bcdfgklmnprstvz])\1/g, "$1");
  if (undoubled !== w) add(undoubled);
  else {
    const m = /^(.*?[aeiou])([bdfgklmnprstvz])([aeiou].*)$/.exec(w);
    if (m) add(`${m[1]}${m[2]}${m[2]}${m[3]}`);
  }
  return [...out].slice(0, limit);
}

/** Whole-query variants: each word replaced by one of its variants, at most `limit` queries. */
export function queryVariants(q: string, limit = 5): string[] {
  if (q.includes('"')) return [];
  const words = normalize(q).split(" ").filter(Boolean);
  const out: string[] = [];
  words.forEach((w, i) => {
    for (const v of variants(w)) {
      if (out.length >= limit) return;
      const copy = [...words];
      copy[i] = v;
      out.push(copy.join(" "));
    }
  });
  return out;
}

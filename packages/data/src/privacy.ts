/**
 * Privacy rules shared by the build (which masks) and the gate (which checks). docs/DECISIONS.md 1:
 * personal details heard on air live in each item's `hidden` block and must never be published,
 * and transcript lines that overlap a hidden time span are masked.
 *
 * Two layers:
 *  1. Time spans: every hidden.* entry has start_sec (and usually end_sec). Transcript lines that
 *     overlap [start - PAD, (end ?? start + DEFAULT_SPAN) + PAD] are withheld in that item.
 *  2. Sensitive terms: names (two or more words), addresses and phone numbers from EVERY item's
 *     hidden block. The build withholds any transcript line, in any item, that contains one, and
 *     redacts them from public metadata text; the gate fails if one still appears anywhere in the
 *     output. Single first names ("Moshe") are too common to scan for globally; layer 1 covers them.
 */
import type { RawHidden, RawVocabEntry } from "./raw.ts";

/** Seconds added on both sides of a hidden span (ASR and metadata timings differ slightly). */
export const SPAN_PAD_SEC = 2;
/** Span length assumed when a hidden entry has no end_sec. */
export const DEFAULT_SPAN_SEC = 60;
/** Fields that must never appear as keys anywhere in the public output. */
export const FORBIDDEN_KEYS = [
  "hidden",
  "source",
  "quality",
  "provenance",
  "proposed_new_terms",
  "identity_guesses",
  "privacy",
  "on_air_people",
  "other_personal",
  "addresses",
] as const;

export interface Span {
  start: number;
  end: number;
}

/**
 * Hidden time spans of one item, padded by SPAN_PAD_SEC by default. Transcript masking and the
 * playlist track bounds (bedtime.md B9, units.ts) both use the padded spans; units.ts trims a
 * track whose edge touches one rather than dropping it.
 */
export function hiddenSpans(hidden: RawHidden, pad = SPAN_PAD_SEC): Span[] {
  const all = [...hidden.on_air_people, ...hidden.addresses, ...hidden.other_personal];
  return all.map((h) => ({
    start: Math.max(0, h.start_sec - pad),
    end: (h.end_sec ?? h.start_sec + DEFAULT_SPAN_SEC) + pad,
  }));
}

export function overlapsAny(start: number, end: number, spans: readonly Span[]): boolean {
  for (const s of spans) if (start < s.end && end > s.start) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Sensitive terms

/** Lowercase word tokens (letters and digits in any script). */
export function tokenize(text: string): string[] {
  // Apostrophes join ("Be'er" = "Beer"), so names with them match however they are written.
  return text.toLowerCase().normalize("NFKC").replace(/['’`]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
}

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "rabbi", "reb", "r", "morah", "mrs", "rebbetzin", "the"]);

/** Split one hidden name entry ("Schneur Zalman, Yechiel Alter and Shmuel Goldstein (as heard)") into names. */
export function nameVariants(raw: string): string[] {
  const noParens = raw.replace(/\([^)]*\)/g, " ");
  const parenInner = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? "");
  // Lists: "A, B and C Gross"; "Rabbi Bergstein Rabbi Stein"; "Morah Eidi Morah Luba".
  const SEP = /,|;|\/|\band\b|&|\s(?=(?:Rabbi|Rebbetzin|Morah|Mrs?\.?|Dr\.?)\s)/;
  const parts = [noParens, ...noParens.split(SEP), ...parenInner.flatMap((p) => [p, ...p.split(SEP)])].filter(
    (p): p is string => typeof p === "string",
  );
  const clean = (p: string) =>
    p
      // annotations in the data: "also heard as X", "as heard", "ASR spelling"
      .replace(/\b(also\s+)?(heard\s+as|as\s+heard|as\s+transcribed|heard|asr\s+(also|spelling))\b[:,]?/g, " ")
      // lowercase framing words: "the Wolfson family", "the Friedland children"
      .replace(/\b(the|family|families|children|girl|boy|also)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return [...new Set(parts.map(clean).filter(Boolean))];
}

export interface TermSet {
  /** first token → list of token sequences starting with it */
  byFirst: Map<string, string[][]>;
  terms: string[];
  /** Hidden name variants not scanned globally (single word, or matching public vocabulary). */
  skipped: { term: string; reason: string }[];
}

export interface TermSources {
  hiddenBlocks: RawHidden[];
  /** Public vocabulary (people, speakers, characters...) whose labels/aliases are public names. */
  publicNames: string[];
  /** Extra phrases allowed despite matching a hidden name (packages/data/privacy-allowlist.json). */
  allowlist: string[];
}

function isMeaningful(tokens: string[]): boolean {
  const content = tokens.filter((t) => !HONORIFICS.has(t));
  // "Mr. Rose" (honorific + surname) counts: it identifies a family on air.
  return tokens.length >= 2 && content.length >= 1 && content.every((t) => t.length >= 2 || /\d/.test(t));
}

/** Every word capitalized (Latin script) or in another script: "Mr. Rose" yes, "his children" no. */
function looksLikeName(v: string): boolean {
  const words = v.normalize("NFKC").replace(/['’`]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.every((w) => !/^\p{Script=Latin}/u.test(w) || /^\p{Lu}/u.test(w) || HONORIFICS.has(w.toLowerCase()) || /^(bas|ben|bat|bar|de|van|von)$/i.test(w));
}

export function buildTermSet(src: TermSources): TermSet {
  const publicSeqs = src.publicNames.map((n) => tokenize(n).join(" ")).filter(Boolean);
  const allow = new Set(src.allowlist.map((a) => tokenize(a).join(" ")));
  const terms = new Set<string>();
  const skipped = new Map<string, string>();

  const consider = (raw: string, kind: "name" | "text") => {
    const variants = kind === "name" ? nameVariants(raw) : [raw];
    for (const v of variants) {
      const toks = tokenize(v);
      const key = toks.join(" ");
      if (!key) continue;
      if (kind === "name" && !isMeaningful(toks)) {
        skipped.set(key, "single word or honorific only: covered by time-span masking");
        continue;
      }
      if (kind === "name" && !looksLikeName(v)) {
        skipped.set(key, "not a proper name (lowercase words, e.g. 'his children')");
        continue;
      }
      if (kind === "text" && toks.length < 2) continue;
      if (allow.has(key)) {
        skipped.set(key, "allowlisted");
        continue;
      }
      // A hidden name that is (part of) a public figure's name, e.g. "Menachem Mendel".
      if (kind === "name" && publicSeqs.some((p) => ` ${p} `.includes(` ${key} `))) {
        skipped.set(key, "part of a public vocabulary name");
        continue;
      }
      terms.add(key);
    }
  };

  for (const h of src.hiddenBlocks) {
    for (const p of h.on_air_people) consider(p.name, "name");
    for (const a of h.addresses) consider(a.text, "text");
    for (const o of h.other_personal) {
      // Descriptions are not the data itself; phone numbers inside them are.
      for (const m of o.text.matchAll(/\d[\d\s().-]{5,}\d/g)) {
        const digits = m[0].replace(/\D/g, "");
        if (digits.length >= 7) terms.add(digits);
      }
    }
  }

  const byFirst = new Map<string, string[][]>();
  for (const t of terms) {
    const toks = t.split(" ");
    const first = toks[0] as string;
    const list = byFirst.get(first) ?? [];
    list.push(toks);
    byFirst.set(first, list);
  }
  return {
    byFirst,
    terms: [...terms].sort(),
    skipped: [...skipped].map(([term, reason]) => ({ term, reason })).sort((a, b) => a.term.localeCompare(b.term)),
  };
}

/**
 * Find sensitive terms in text. Digits are also matched with separators removed, so
 * "555-1234" and "5551234" both hit a phone-number term.
 */
export function findTerms(text: string, set: TermSet): string[] {
  const toks = tokenize(text);
  const hits = new Set<string>();
  const scan = (arr: string[]) => {
    for (let i = 0; i < arr.length; i++) {
      const cands = set.byFirst.get(arr[i] as string);
      if (!cands) continue;
      for (const c of cands) {
        let ok = true;
        for (let j = 1; j < c.length; j++) {
          if (arr[i + j] !== c[j]) {
            ok = false;
            break;
          }
        }
        if (ok) hits.add(c.join(" "));
      }
    }
  };
  scan(toks);
  if (/\d/.test(text)) {
    const digits = text.replace(/[\s().-]/g, "").match(/\d+/g) ?? [];
    for (const d of digits) for (const t of set.terms) if (/^\d+$/.test(t) && d.includes(t)) hits.add(t);
  }
  return [...hits];
}

/** Replace sensitive terms in display text with a neutral marker. */
export const REDACTED = "[name withheld]";
export function redactTerms(text: string, hits: string[]): string {
  let out = text;
  for (const h of hits) {
    const pattern = h
      .split(" ")
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^\\p{L}\\p{N}]+");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu"), REDACTED);
  }
  return out;
}

/** Every label and alias in the vocabulary lists that name people or characters. */
export function publicNamesFromVocab(lists: Record<string, RawVocabEntry[]>): string[] {
  const out: string[] = [];
  for (const name of ["people", "speakers", "series"]) {
    for (const e of lists[name] ?? []) {
      if (e.unconfirmed) continue;
      out.push(e.label, ...(e.aliases ?? []));
      // "Rabbi Yitzchak (father of Rashi)" → also "Rabbi Yitzchak"
      out.push(...nameVariants(e.label));
    }
  }
  return out;
}

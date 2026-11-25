/**
 * Search passages: masked search lines grouped into ~30-second passages, each keyed by the start
 * second of its first line. Known ASR misspellings ("heard" forms in the vocabulary glossary) get
 * the correct form appended, in the search text only.
 */
import { normalize } from "./text.ts";

export interface GlossaryRule {
  heard: string;
  correct: string;
}

export function glossaryRules(
  glossary: readonly { correct: string; heard: string[] }[],
): GlossaryRule[] {
  return glossary.flatMap((g) =>
    g.heard.map((h) => ({
      heard: ` ${normalize(h)} `,
      correct: g.correct.replace(/\s*\([^)]*\)/g, ""),
    })),
  );
}

export function searchPassages(
  lines: readonly (readonly [number, string])[],
  seconds: number,
  rules: readonly GlossaryRule[] = [],
): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  let cur: { t: number; parts: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    let text = cur.parts.join(" ");
    const norm = ` ${normalize(text)} `;
    const extra = [...new Set(rules.filter((r) => norm.includes(r.heard)).map((r) => r.correct))];
    if (extra.length) text += ` (${extra.join("; ")})`;
    out.push({ t: cur.t, text });
  };
  for (const [s, text] of lines) {
    if (!cur || s - cur.t >= seconds) {
      flush();
      cur = { t: Math.floor(s), parts: [] };
    }
    cur.parts.push(text);
  }
  flush();
  return out;
}

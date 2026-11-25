/**
 * Vocabulary-first suggestions for the query box (docs/sites/library.md §4.3): as the user types,
 * offer vocabulary terms (labels and aliases), places, serial titles and episode numbers. Choosing
 * a term sets a facet instead of a text query, which is the main defence against transliteration
 * variants ("tzedaka" → Mitzvah "Tzedakah").
 */
import { normalize, variants } from "./text.ts";
import type { VocabTuple } from "./types.ts";

export type Suggestion =
  | { kind: "facet"; facet: string; value: string; label: string; group: string; count: number }
  | { kind: "link"; href: string; label: string; group: string; count: number };

/** Vocabulary list → facet key and group label. */
export const SUGGEST_LISTS: readonly { list: string; facet: string; group: string }[] = [
  { list: "mitzvos", facet: "mitzvos", group: "Mitzvah" },
  { list: "midos", facet: "midos", group: "Midah" },
  { list: "calendar", facet: "calendar", group: "Jewish calendar" },
  { list: "parshiyos", facet: "parsha", group: "Parsha" },
  { list: "people", facet: "people", group: "Person" },
  { list: "topics", facet: "topics", group: "Topic" },
  { list: "works", facet: "works", group: "Source cited" },
  { list: "series", facet: "series", group: "Series" },
  { list: "speakers", facet: "speaker", group: "Speaker" },
  { list: "story_type", facet: "story", group: "Story kind" },
  { list: "content_type", facet: "type", group: "Type" },
];

export interface SuggestSource {
  vocab: Record<string, VocabTuple[]>;
  /** Count of results per facet value (facet → value → count). Values with 0 are not offered. */
  counts: (facet: string, value: string) => number;
  places: readonly string[];
  serials: readonly [string, string][];
  episodes: ReadonlySet<number>;
}

/** 3 = label starts with the query, 2 = a label word starts with it, 1 = alias/variant match. */
function matchRank(
  needle: string,
  label: string,
  aliases: readonly string[],
  alts: readonly string[],
): number {
  const l = normalize(label);
  if (l.startsWith(needle)) return 3;
  if (l.includes(` ${needle}`)) return 2;
  for (const a of aliases) {
    const n = normalize(a);
    if (n.startsWith(needle) || n.includes(` ${needle}`)) return 1;
  }
  for (const v of alts) if (l.startsWith(v) || l.includes(` ${v}`)) return 1;
  return 0;
}

export function suggest(query: string, src: SuggestSource, limit = 8): Suggestion[] {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  const out: (Suggestion & { rank: number })[] = [];

  const ep = /^(?:ep|episode|e)\s*(\d{1,3})$/.exec(needle) ?? /^(\d{1,3})$/.exec(needle);
  if (ep) {
    const n = Number(ep[1]);
    if (src.episodes.has(n))
      out.push({
        kind: "link",
        href: `/radio/ep/${n}/`,
        label: `Episode ${n}`,
        group: "Radio show",
        count: 1,
        rank: 4,
      });
  }

  const alts = needle.includes(" ") ? [] : variants(needle);
  for (const { list, facet, group } of SUGGEST_LISTS) {
    for (const [id, label, unconfirmed, aliases] of src.vocab[list] ?? []) {
      const rank = matchRank(needle, label, unconfirmed ? [] : aliases, alts);
      if (!rank) continue;
      const count = src.counts(facet, id);
      if (count > 0) out.push({ kind: "facet", facet, value: id, label, group, count, rank });
    }
  }
  for (const p of src.places) {
    const rank = matchRank(needle, p, [], alts);
    const count = rank ? src.counts("places", p) : 0;
    if (count > 0)
      out.push({ kind: "facet", facet: "places", value: p, label: p, group: "Place", count, rank });
  }
  for (const [key, title] of src.serials) {
    const rank = matchRank(needle, title, [], alts);
    if (rank)
      out.push({
        kind: "link",
        href: `/serials/${key}/`,
        label: title,
        group: "Serial",
        count: 0,
        rank,
      });
  }
  out.sort((a, b) => b.rank - a.rank || b.count - a.count || a.label.localeCompare(b.label));
  return out.slice(0, limit).map(({ rank: _rank, ...s }) => s);
}

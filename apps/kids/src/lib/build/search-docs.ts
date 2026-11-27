/** Search documents for the kid pool (fields of §6.5 only) and the serialised MiniSearch index. */
import MiniSearch from "minisearch";
import { MINISEARCH_OPTIONS, type SearchDocument, YIDDISH_TAGS } from "../search.ts";
import { HOLIDAY_TILES, MIDOS_TILES, MITZVOS_TILES, TOPIC_TILES, type Tile } from "../tiles.ts";
import { type KItem, type Model, getModel } from "./model.ts";

const SEARCHABLE_SEGMENTS = new Set(["story", "story_chapter", "talk", "song"]);

function tileLabels(tiles: readonly Tile[], ids: readonly string[]): string[] {
  return tiles.filter((t) => t.ids.some((i) => ids.includes(i))).map((t) => t.label);
}

export function searchDoc(k: KItem, m: Model): SearchDocument {
  const it = k.item;
  const s = it.subjects;
  const vocabText = (list: string, ids: readonly string[]) =>
    ids.flatMap((id) => {
      const v = m.vocab(list, id);
      if (!v) return [];
      return v.unconfirmed ? [] : [v.label, ...(v.aliases ?? [])];
    });
  const heroes = k.heroes.flatMap((id) => {
    const v = m.vocab("people", id);
    const hero = m.tiles.heroes.find((h) => h.slug === id);
    return [hero?.label ?? "", v?.label ?? "", ...(v?.aliases ?? [])].filter(Boolean);
  });
  const tags = [
    ...tileLabels(TOPIC_TILES, s.topics),
    ...tileLabels(MIDOS_TILES, s.midos),
    ...tileLabels(MITZVOS_TILES, s.mitzvos),
    ...tileLabels(HOLIDAY_TILES, s.calendar),
    ...MIDOS_TILES.filter((t) => t.ids.some((i) => s.midos.includes(i))).map((t) => t.he ?? ""),
    ...vocabText("topics", s.topics),
    ...vocabText("midos", s.midos),
    ...vocabText("mitzvos", s.mitzvos),
    ...vocabText("calendar", s.calendar),
    // Language (docs/design/language-kids.md §4.7): English metadata only, never a transcript.
    ...(k.lang === "yi" ? YIDDISH_TAGS : []),
    // A confirmed storyteller's byline (Bubby Chaya Malka; the radio bylines are not tags today).
    ...(k.byline === "Bubby Chaya Malka" ? [k.byline] : []),
  ];
  return {
    id: k.id,
    title: it.title,
    heroes: heroes.join(" · "),
    serial: it.classification.serial?.story_title ?? "",
    keywords: it.keywords.join(" · "),
    characters: s.characters.join(" · "),
    tags: [...new Set(tags.filter(Boolean))].join(" · "),
    lesson: it.lesson ?? "",
    summary: it.summary_short,
    segs: it.segments
      .filter((g) => SEARCHABLE_SEGMENTS.has(g.type))
      .map((g) => g.title)
      .join(" · "),
  };
}

export function buildSearchIndex(): string {
  const m = getModel();
  const ms = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS);
  ms.addAll(m.pool.map((k) => searchDoc(k, m)));
  return JSON.stringify(ms);
}

/**
 * Build-time access to the public dataset for pages (Node only; never imported by browser code).
 * Reads exclusively through @goldstein/data/load, i.e. the already-filtered and masked dataset.
 */
import { SITES } from "@goldstein/config/sites";
import type { CatalogEntry, PublicItem, VocabEntry } from "@goldstein/data";
import {
  loadCatalog,
  loadIndex,
  loadItem,
  loadLostEpisodes,
  loadManifest,
  loadVocab,
} from "@goldstein/data/load";
import type { CiteInput } from "./citation.ts";
import { displayDate, formatGregorian, hebrewParts, hebrewYearOf, sortKey } from "./dates.ts";
import type { SerialsFile, SeriesFile, StoryGroupsFile } from "./indexes.ts";
import type { HasFlag, LibCatalog, LibRow, VocabTuple } from "./types.ts";

export const SITE = SITES.library;
export const ORIGIN = `https://${SITE.host}`;
export const itemPath = (id: string): string => `/r/${id}/`;

const memo = new Map<string, unknown>();
function once<T>(key: string, f: () => T): T {
  if (!memo.has(key)) memo.set(key, f());
  return memo.get(key) as T;
}

export const catalog = (): CatalogEntry[] => loadCatalog();
export const manifest = () => loadManifest();
export const vocab = () => loadVocab();

export function vocabEntry(list: string, id: string): VocabEntry | undefined {
  return once(`v:${list}`, () => new Map((vocab().lists[list] ?? []).map((e) => [e.id, e]))).get(
    id,
  );
}

/** Label for a vocabulary id; unconfirmed entries keep their label verbatim ("(name unconfirmed)"). */
export function label(list: string, id: string): string {
  return vocabEntry(list, id)?.label ?? id.replace(/_/g, " ");
}

export const unconfirmed = (list: string, id: string): boolean =>
  vocabEntry(list, id)?.unconfirmed === true;

export function speakerLabel(id: string): string {
  return id === "unknown" ? "Speaker not identified" : label("speakers", id);
}

export function item(id: string): PublicItem {
  return loadItem(id);
}

export const allItems = (): PublicItem[] =>
  once("items", () => catalog().map((c) => loadItem(c.id)));

export const serials = (): SerialsFile =>
  (loadIndex("serials") as SerialsFile | null) ?? { serials: [] };
export const storyGroups = (): StoryGroupsFile =>
  (loadIndex("story_groups") as StoryGroupsFile | null) ?? { groups: [] };
export const seriesIndex = (): SeriesFile =>
  (loadIndex("series") as SeriesFile | null) ?? { series: [] };
export const lostEpisodes = () => loadLostEpisodes();

/** item id → story group ids it belongs to. */
export const groupsByItem = (): Map<string, string[]> =>
  once("groupsByItem", () => {
    const m = new Map<string, string[]>();
    for (const g of storyGroups().groups)
      for (const id of g.item_ids) m.set(id, [...(m.get(id) ?? []), g.group_id]);
    return m;
  });

/** Number of public items per vocabulary id, per list. */
export function usage(
  list: "people" | "midos" | "mitzvos" | "topics" | "calendar" | "parshiyos" | "works",
): Map<string, number> {
  return once(`usage:${list}`, () => {
    const m = new Map<string, number>();
    for (const r of rows()) {
      if (!r.preferred) continue;
      const vals =
        list === "people"
          ? [...new Set(r.people.map(([p]) => p))]
          : list === "works"
            ? r.works
            : r[list];
      for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  });
}

function hasFlags(it: PublicItem): HasFlag[] {
  const out: HasFlag[] = [];
  if (it.segments.length) out.push("chapters");
  if (it.transcript.display === "show_with_label") out.push("transcript");
  if (it.classification.serial) out.push("serial");
  if (groupsByItem().has(it.id) || it.relations.some((r) => r.type.startsWith("same_story")))
    out.push("tellings");
  return out;
}

export function toRow(it: PublicItem): LibRow {
  const c = it.classification;
  const d = displayDate(c.date);
  const g = c.date?.gregorian ?? undefined;
  const hy =
    c.date?.hebrew_year ??
    (g && c.date?.precision === "day" ? (hebrewYearOf(g) ?? undefined) : undefined);
  const row: LibRow = {
    id: it.id,
    title: it.title,
    summary: it.summary_short,
    keywords: it.keywords,
    characters: it.subjects.characters,
    places: it.subjects.places,
    type: c.content_type,
    series: c.series,
    speakers: c.speakers,
    storyType: c.story_type,
    standalone: c.standalone,
    clip: c.episode?.is_clip === true || it.derived.clip_of.length > 0,
    clipOf: it.derived.clip_of,
    sortKey: sortKey(g),
    dur: Math.round((it.content_end_sec - it.content_start_sec) * 10) / 10,
    start: it.content_start_sec,
    end: it.content_end_sec,
    url: it.media.url,
    level: it.audience.level,
    age: it.audience.age_min,
    adv: [...new Set(it.audience.advisories.map((a) => a.flag))],
    lang: it.language.primary,
    topics: it.subjects.topics,
    midos: it.subjects.midos,
    mitzvos: it.subjects.mitzvos,
    calendar: it.subjects.calendar,
    parshiyos: it.subjects.parshiyos,
    people: it.subjects.people.map((p) => [p.id, p.role]),
    works: [...new Set(it.subjects.sources_cited.map((s) => s.work))],
    has: hasFlags(it),
    preferred: it.derived.preferred_copy,
    versions: 0,
  };
  if (it.title_he) row.he = it.title_he;
  if (it.lesson) row.lesson = it.lesson;
  if (c.episode) row.ep = c.episode.number;
  if (g) row.date = g;
  if (d.short !== "Date unknown")
    row.dateLabel = d.hebrew && c.date?.precision === "day" ? d.hebrew : d.short;
  if (g && c.date?.precision === "day") row.dateGreg = formatGregorian(g, { short: true });
  if (hy) row.hy = hy;
  if (c.serial) {
    row.serial = { title: c.serial.story_title };
    if (c.serial.story_key) row.serial.key = c.serial.story_key;
    if (c.serial.chapter !== undefined) row.serial.ch = c.serial.chapter;
  }
  return row;
}

export const rows = (): LibRow[] =>
  once("rows", () => {
    const out = allItems().map(toRow);
    const byId = new Map(out.map((r) => [r.id, r]));
    for (const it of allItems())
      for (const p of it.derived.preferred_ids) {
        const r = byId.get(p);
        if (r) r.versions++;
      }
    return out;
  });

export const rowById = (): Map<string, LibRow> =>
  once("rowById", () => new Map(rows().map((r) => [r.id, r])));

const VOCAB_LISTS = [
  "content_type",
  "series",
  "speakers",
  "story_type",
  "midos",
  "mitzvos",
  "topics",
  "calendar",
  "parshiyos",
  "people",
  "works",
  "content_advisory",
] as const;

export function libCatalog(): LibCatalog {
  const v = vocab();
  const lists: Record<string, VocabTuple[]> = {};
  for (const l of VOCAB_LISTS) {
    lists[l] = (v.lists[l] ?? []).map((e) => [
      e.id,
      e.id === "unknown" && l === "speakers" ? "Speaker not identified" : e.label,
      e.unconfirmed ? 1 : 0,
      e.unconfirmed ? [] : (e.aliases ?? []),
    ]);
  }
  return {
    v: 1,
    built: manifest().generated_at,
    rows: rows(),
    vocab: lists,
    serials: serials().serials.map((s) => [s.story_key, s.title]),
  };
}

/** Citation input for an item. */
export function citeInput(it: PublicItem): CiteInput {
  const c = it.classification;
  const inp: CiteInput = {
    id: it.id,
    title: it.title,
    speakers: c.speakers.map((s) => ({
      id: s,
      label: label("speakers", s),
      unconfirmed: unconfirmed("speakers", s),
    })),
    series: c.series
      ? {
          id: c.series,
          label: label("series", c.series),
          unconfirmed: unconfirmed("series", c.series),
        }
      : null,
    origin: ORIGIN,
    siteName: SITE.name,
  };
  if (c.episode) inp.episode = c.episode.number;
  if (c.date) inp.date = c.date;
  return inp;
}

// ---------------------------------------------------------------------------------------------
// Radio timeline

export interface EpisodeCell {
  n: number;
  status: "found" | "lost";
  id?: string;
  title?: string;
  /** Air date (found) or estimated date (lost), ISO. */
  date?: string;
  hebrew?: string;
  hebrewMonth?: string;
  year: number | null;
  serial?: { key: string; title: string; ch: number | null };
  catalog?: string;
  defective?: boolean;
}

export const RADIO_SERIES = "uy_tzivos_hashem_on_the_air";

export const episodes = (): EpisodeCell[] =>
  once("episodes", () => {
    const byEp = new Map<number, PublicItem[]>();
    for (const it of allItems()) {
      const e = it.classification.episode;
      if (it.classification.content_type === "radio_episode" && e && !e.is_clip)
        byEp.set(e.number, [...(byEp.get(e.number) ?? []), it]);
    }
    const lost = new Map(lostEpisodes().episodes.map((e) => [e.episode, e]));
    const out: EpisodeCell[] = [];
    for (let n = 1; n <= 555; n++) {
      const list = byEp.get(n);
      const it = list?.find((x) => x.derived.preferred_copy) ?? list?.[0];
      if (it && !lost.has(n)) {
        const d = it.classification.date;
        const g = d?.gregorian ?? undefined;
        const hp = g && d?.precision === "day" ? hebrewParts2(g) : null;
        const cell: EpisodeCell = {
          n,
          status: "found",
          id: it.id,
          title: it.title.replace(/^Episode\s+\d+\s*[:.-]\s*/i, ""),
          year: d?.hebrew_year ?? hp?.year ?? null,
        };
        if (g) cell.date = g;
        const heb = d?.precision === "day" ? (d.hebrew ?? hp?.text) : (d?.hebrew ?? undefined);
        if (heb) cell.hebrew = heb;
        if (hp) cell.hebrewMonth = hp.month;
        const s = it.classification.serial;
        if (s?.story_key)
          cell.serial = { key: s.story_key, title: s.story_title, ch: s.chapter ?? null };
        out.push(cell);
      } else {
        const l = lost.get(n);
        const est = l?.estimated_date ?? undefined;
        const hp = est ? hebrewParts2(est) : null;
        const cell: EpisodeCell = { n, status: "lost", year: hp?.year ?? null };
        if (est) cell.date = est;
        if (hp) {
          cell.hebrew = hp.text;
          cell.hebrewMonth = hp.month;
        }
        const cat = [l?.catalog_story, l?.catalog_topic].filter(Boolean).join(" · ");
        if (cat) cell.catalog = cat;
        if (l?.status === "defective_copy") cell.defective = true;
        out.push(cell);
      }
    }
    // Fill missing years from neighbours (keeps the grid in broadcast order).
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (c && c.year === null) {
        const prev = out
          .slice(0, i)
          .reverse()
          .find((x) => x.year !== null);
        c.year = prev?.year ?? out.slice(i).find((x) => x.year !== null)?.year ?? null;
      }
    }
    collapseLostRuns(out);
    return out;
  });

/**
 * Long runs of lost episodes (10 or more in a row, e.g. 42–112) are shown as one collapsed block,
 * so the whole run is filed under the Hebrew year that holds most of it (dates are estimates anyway).
 */
export function collapseLostRuns(cells: EpisodeCell[], min = 10): void {
  let i = 0;
  while (i < cells.length) {
    if (cells[i]?.status !== "lost") {
      i++;
      continue;
    }
    let j = i;
    while (j < cells.length && cells[j]?.status === "lost") j++;
    const run = cells.slice(i, j);
    if (run.length >= min) {
      const votes = new Map<number | null, number>();
      for (const c of run) votes.set(c.year, (votes.get(c.year) ?? 0) + 1);
      const year = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      for (const c of run) c.year = year;
    }
    i = j;
  }
}

function hebrewParts2(iso: string): { year: number; month: string; text: string } | null {
  const h = hebrewParts(iso);
  return h ? { year: h.year, month: h.month, text: `${h.day} ${h.month} ${h.year}` } : null;
}

// ---------------------------------------------------------------------------------------------
// Cross references for the recording page

export interface InverseRelation {
  type: string;
  from: string;
  confidence: number;
  offset_sec?: number;
}

/** Relations pointing AT an item (inverse view): target id → relations. */
export const inverseRelations = (): Map<string, InverseRelation[]> =>
  once("inverse", () => {
    const m = new Map<string, InverseRelation[]>();
    for (const it of allItems())
      for (const r of it.relations) {
        const inv: InverseRelation = { type: r.type, from: it.id, confidence: r.confidence };
        if (r.offset_sec !== undefined) inv.offset_sec = r.offset_sec;
        m.set(r.target_id, [...(m.get(r.target_id) ?? []), inv]);
      }
    return m;
  });

export interface SerialPosition {
  key: string;
  title: string;
  runLabel: string;
  chapter: number;
  of: number;
  prev?: { id: string; start: number | null; chapter: number };
  next?: { id: string; start: number | null; chapter: number };
  start: number | null;
  end: number | null;
}

/** Where an item sits in a serial airing (first match). */
export function serialPosition(id: string): SerialPosition | null {
  for (const s of serials().serials)
    for (const run of s.runs) {
      const chs = [...run.chapters].sort((a, b) => a.chapter - b.chapter);
      const i = chs.findIndex((c) => c.items.some((x) => x.id === id));
      if (i < 0) continue;
      const ch = chs[i];
      const it = ch?.items.find((x) => x.id === id);
      if (!ch || !it) continue;
      const at = (j: number) => {
        const c = chs[j];
        const first = c?.items[0];
        return c && first
          ? { id: first.id, start: first.segment_start_sec, chapter: c.chapter }
          : undefined;
      };
      const pos: SerialPosition = {
        key: s.story_key,
        title: s.title,
        runLabel: run.label,
        chapter: ch.chapter,
        of: s.chapters_in_full_telling,
        start: it.segment_start_sec,
        end: it.segment_end_sec,
      };
      const prev = at(i - 1);
      const next = at(i + 1);
      if (prev) pos.prev = prev;
      if (next) pos.next = next;
      return pos;
    }
  return null;
}

/** Catalog rows of the same multi-part set, in part order. */
export function setSiblings(setKey: string): CatalogEntry[] {
  const bySet = once("sets", () => {
    const m = new Map<string, CatalogEntry[]>();
    for (const c of catalog())
      if (c.part?.set_key && c.preferred_copy)
        m.set(c.part.set_key, [...(m.get(c.part.set_key) ?? []), c]);
    for (const l of m.values())
      l.sort((a, b) => (a.part?.part_number ?? 0) - (b.part?.part_number ?? 0));
    return m;
  });
  return bySet.get(setKey) ?? [];
}

/** Lock-screen artist: the first speaker worth naming (never a placeholder). */
export function artist(speakers: readonly string[]): string {
  const s = speakers.find(
    (x) => x !== "unknown" && x !== "guest_children" && !unconfirmed("speakers", x),
  );
  return s ? label("speakers", s) : "";
}

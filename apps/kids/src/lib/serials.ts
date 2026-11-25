/**
 * Chapter stories (docs/sites/kids.md §4.4): radio serials from indexes/serials.json and multi-part
 * sets from classification.part. Pure functions over the index shape; the build supplies the pool.
 */

export interface SerialIndexPart {
  start_sec: number;
  end_sec: number;
  title?: string;
}
export interface SerialIndexItem {
  id: string;
  title?: string;
  segment_start_sec?: number | null;
  segment_end_sec?: number | null;
  parts?: SerialIndexPart[];
  intro_start_sec?: number | null;
}
export interface SerialIndexChapter {
  chapter: number;
  episode?: number | null;
  catalog_title?: string | null;
  items: SerialIndexItem[];
}
export interface SerialIndexRun {
  label: string;
  in_archive?: boolean;
  first_episode?: number | null;
  last_episode?: number | null;
  date_from?: string | null;
  chapters_in_archive?: number;
  missing_chapters?: number[];
  complete?: boolean;
  chapters: SerialIndexChapter[];
}
export interface SerialIndexEntry {
  story_key: string;
  title: string;
  chapters_in_full_telling?: number | null;
  runs: SerialIndexRun[];
}
export interface SerialsIndex {
  serials: SerialIndexEntry[];
}

/** One playable piece of a chapter (story-only mode). */
export interface Range {
  start_sec: number;
  end_sec: number;
}

export interface Chapter {
  n: number;
  /** null = we're still looking for this one. */
  id: string | null;
  title: string;
  /** Story-only ranges, in order (start at the intro when there is one). Empty for set parts (whole item). */
  story: Range[];
}

export interface Serial {
  key: string;
  title: string;
  type: "radio" | "set";
  chapters: Chapter[];
  /** Other runs (radio serials): label and the item ids of their chapters. */
  otherRuns: { label: string; chapters: { n: number; id: string }[] }[];
}

/**
 * Ranges for one chapter item in story-only mode (§4.4). One recording can hold two chapters (The
 * Storyteller, 1989-90, chapters 6 and 7): `others` are the ranges of the other chapters in the same
 * recording, and the shared intro is applied only when no other chapter lies between it and this
 * chapter's story (else chapter 7 would replay chapter 6).
 */
export function storyRanges(it: SerialIndexItem, others: readonly Range[] = []): Range[] {
  const parts: Range[] =
    it.parts && it.parts.length > 0
      ? it.parts.map((p) => ({ start_sec: p.start_sec, end_sec: p.end_sec }))
      : it.segment_start_sec !== undefined &&
          it.segment_start_sec !== null &&
          it.segment_end_sec !== undefined &&
          it.segment_end_sec !== null
        ? [{ start_sec: it.segment_start_sec, end_sec: it.segment_end_sec }]
        : [];
  const first = parts[0];
  const intro = it.intro_start_sec;
  if (
    first &&
    typeof intro === "number" &&
    intro < first.start_sec &&
    !others.some((o) => o.end_sec > intro && o.start_sec < first.start_sec)
  ) {
    parts[0] = { start_sec: intro, end_sec: first.end_sec };
  }
  return parts;
}

const pickItem = (ch: SerialIndexChapter, inPool: (id: string) => boolean) =>
  ch.items.find((i) => inPool(i.id));

/**
 * Which run to show: the earliest run with complete=true whose items are all in the pool; else the
 * run with the most chapters in the pool (earliest on ties). Null when no chapter is in the pool.
 */
export function chooseRun(
  s: SerialIndexEntry,
  inPool: (id: string) => boolean,
): SerialIndexRun | null {
  const runs = s.runs.filter((r) => r.in_archive !== false);
  const complete = runs.find(
    (r) =>
      r.complete === true && r.chapters.length > 0 && r.chapters.every((c) => pickItem(c, inPool)),
  );
  if (complete) return complete;
  let best: SerialIndexRun | null = null;
  let bestN = 0;
  for (const r of runs) {
    const n = r.chapters.filter((c) => pickItem(c, inPool)).length;
    if (n > bestN) {
      best = r;
      bestN = n;
    }
  }
  return best;
}

export function buildRadioSerial(
  s: SerialIndexEntry,
  inPool: (id: string) => boolean,
): Serial | null {
  const run = chooseRun(s, inPool);
  if (!run) return null;
  const present = new Map<number, Chapter>();
  const picked = run.chapters.map((c) => ({ c, it: pickItem(c, inPool) }));
  const bare = (it: SerialIndexItem) => storyRanges({ ...it, intro_start_sec: null });
  for (const { c, it } of picked) {
    if (!it) continue;
    const others = picked
      .filter((x) => x.c !== c && x.it?.id === it.id)
      .flatMap((x) => (x.it ? bare(x.it) : []));
    present.set(c.chapter, {
      n: c.chapter,
      id: it.id,
      title: `Chapter ${c.chapter}`,
      story: storyRanges(it, others),
    });
  }
  const nums = [...present.keys(), ...(run.missing_chapters ?? [])];
  for (const c of run.chapters) if (!present.has(c.chapter)) nums.push(c.chapter);
  const max = Math.max(...nums, s.chapters_in_full_telling ?? 0);
  const min = Math.min(...nums);
  const chapters: Chapter[] = [];
  for (let n = min; n <= max; n++) {
    chapters.push(present.get(n) ?? { n, id: null, title: `Chapter ${n}`, story: [] });
  }
  const otherRuns = s.runs
    .filter((r) => r !== run && r.in_archive !== false)
    .map((r) => ({
      label: r.label,
      chapters: r.chapters
        .map((c) => ({ n: c.chapter, id: pickItem(c, inPool)?.id ?? "" }))
        .filter((c) => c.id),
    }))
    .filter((r) => r.chapters.length > 0);
  return { key: s.story_key, title: s.title, type: "radio", chapters, otherRuns };
}

export interface SetMember {
  id: string;
  title: string;
  set_key: string;
  part_number: number;
  of?: number | null | undefined;
}

/** "The Four Chochmos, Part 1 (Chanukah)" → "The Four Chochmos". */
export function setTitle(firstTitle: string): string {
  const m = /^(.*?)[,:]?\s*\bPart\s+\d+\b/i.exec(firstTitle);
  const t = (m?.[1] ?? firstTitle).trim().replace(/[,:]$/, "");
  return t || firstTitle;
}

/** Multi-part sets with at least two parts in the pool. One item per part number (first by id). */
export function buildSets(members: readonly SetMember[], reserved: ReadonlySet<string>): Serial[] {
  const by = new Map<string, SetMember[]>();
  for (const m of members) {
    const l = by.get(m.set_key);
    if (l) l.push(m);
    else by.set(m.set_key, [m]);
  }
  const out: Serial[] = [];
  for (const [key, list] of by) {
    const parts = new Map<number, SetMember>();
    for (const m of [...list].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (!parts.has(m.part_number)) parts.set(m.part_number, m);
    }
    if (parts.size < 2) continue;
    const of = Math.max(...list.map((m) => m.of ?? 0), ...parts.keys());
    const chapters: Chapter[] = [];
    for (let n = 1; n <= of; n++) {
      const m = parts.get(n);
      chapters.push(
        m
          ? { n, id: m.id, title: m.title, story: [] }
          : { n, id: null, title: `Part ${n}`, story: [] },
      );
    }
    const first = parts.get(Math.min(...parts.keys()));
    const slug = reserved.has(key) ? `set-${key}` : key;
    out.push({
      key: slug,
      title: setTitle(first?.title ?? key),
      type: "set",
      chapters,
      otherRuns: [],
    });
  }
  return out;
}

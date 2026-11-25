/**
 * The kids site's build-time model: everything the pages need, derived once per build process from
 * the public dataset (@goldstein/data/load). Never reads data/ directly.
 */
import { createHash } from "node:crypto";
import type { PublicItem, VocabEntry } from "@goldstein/data";
import { loadCatalog, loadIndex, loadItem, loadVocab } from "@goldstein/data/load";
import { type CoverSpec, type CoverFamily, patternFor } from "../covers.ts";
import {
  type KidChapter,
  kidChapters,
  silences,
  storyStart,
  storyStartNoRecap,
} from "../chapters.ts";
import {
  type Adv,
  type Kind,
  type Variant,
  VARIANTS,
  advCode,
  bylineOf,
  inVariant,
  kindOf,
} from "../kinds.ts";
import { hasKidPage, inKidPool } from "../pool.ts";
import type { KidsIndex, Rec } from "../records.ts";
import {
  type Serial,
  type SerialsIndex,
  type SetMember,
  buildRadioSerial,
  buildSets,
} from "../serials.ts";
import { type SimResult, computeSimilar, featuresOf } from "../similar.ts";
import {
  HEROES,
  HERO_GROUPS,
  HOLIDAY_TILES,
  KIND_ICON,
  MIDOS_TILES,
  MITZVOS_TILES,
  TOPIC_TILES,
  type Tile,
  type HolidayTile,
} from "../tiles.ts";

export interface KItem {
  item: PublicItem;
  id: string;
  title: string;
  kind: Kind;
  inPool: boolean;
  age: number;
  adv: Adv;
  vis: Variant[];
  byline: string | null;
  /** Hero ids (central/appears, confirmed vocabulary entries only). */
  heroes: string[];
  dur: number;
  chapters: KidChapter[];
  silence: [number, number][];
  /** "Jump to the story" target for shows (serial chapters skip the recap). */
  jump: number | null;
  /** story_start_sec (§9): first story_intro/story/story_chapter. */
  storyStart: number | null;
  cover: CoverSpec;
  rank: number;
}

export interface ChapterLink {
  serialKey: string;
  serialTitle: string;
  /** First chapter number in this recording. */
  n: number;
  /** Every chapter number this recording holds (usually one; The Storyteller 1989-90 has 6 and 7 in one). */
  ns: number[];
  of: number;
  prev: string | null;
  next: string | null;
  /** True when the serial page shows this item's run (else the strip still links the serial page). */
  type: "radio" | "set";
}

export interface HeroTile extends Tile {
  category: string;
  group: string;
}

export interface Model {
  items: Map<string, KItem>;
  pool: KItem[];
  poolIds: Set<string>;
  sim: SimResult;
  serials: Serial[];
  serialByKey: Map<string, Serial>;
  chapterOf: Map<string, ChapterLink>;
  storyGroupOf: Map<string, { groupId: string; others: string[]; yiddish: boolean }>;
  otherVersions: Map<string, string[]>;
  tiles: {
    topics: Tile[];
    midos: Tile[];
    mitzvos: Tile[];
    holidays: HolidayTile[];
    heroes: HeroTile[];
  };
  tileItems: Map<string, KItem[]>;
  vocab: (list: string, id: string) => VocabEntry | undefined;
  records: Rec[];
  index: KidsIndex;
  counts: Record<Kind, number> & { pool: number; pages: number };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Items whose facet ids intersect a tile's ids. */
function facetIds(k: KItem, facet: Tile["facet"]): readonly string[] {
  const s = k.item.subjects;
  switch (facet) {
    case "topics":
      return s.topics;
    case "midos":
      return s.midos;
    case "mitzvos":
      return s.mitzvos;
    case "calendar":
      return s.calendar;
    case "people":
      return k.heroes;
  }
}

export const tileKey = (t: Pick<Tile, "facet" | "slug">) => `${t.facet}:${t.slug}`;

let cached: Model | null = null;

export function getModel(): Model {
  if (cached) return cached;
  cached = buildModel();
  return cached;
}

function buildModel(): Model {
  const vocab = loadVocab();
  const vmap = new Map<string, Map<string, VocabEntry>>();
  for (const [list, entries] of Object.entries(vocab.lists))
    vmap.set(list, new Map(entries.map((e) => [e.id, e])));
  const vget = (list: string, id: string) => vmap.get(list)?.get(id);

  const raw = loadCatalog().map((c) => loadItem(c.id));
  const pageItems = raw.filter(hasKidPage);
  const poolRaw = pageItems.filter(inKidPool);
  const poolIdSet = new Set(poolRaw.map((i) => i.id));

  // Story-of-the-Day order: sha256(id).
  const rankOf = new Map(
    [...poolRaw]
      .map((i) => ({ id: i.id, h: sha(i.id) }))
      .sort((a, b) => (a.h < b.h ? -1 : 1))
      .map((x, i) => [x.id, i]),
  );

  // Serials and sets.
  const serialsIndex = loadIndex("serials") as SerialsIndex | null;
  const radio = (serialsIndex?.serials ?? [])
    .map((s) => buildRadioSerial(s, (id) => poolIdSet.has(id)))
    .filter((s): s is Serial => s !== null);
  const setMembers: SetMember[] = poolRaw
    .filter((i) => i.classification.part?.set_key)
    .map((i) => ({
      id: i.id,
      title: i.title,
      set_key: i.classification.part?.set_key ?? "",
      part_number: i.classification.part?.part_number ?? 1,
      of: i.classification.part?.of,
    }));
  const sets = buildSets(setMembers, new Set(radio.map((r) => r.key)));
  const serials = [...radio, ...sets];
  const serialByKey = new Map(serials.map((s) => [s.key, s]));

  // Chapter strips: every run of every radio serial, plus sets.
  const chapterOf = new Map<string, ChapterLink>();
  const byId = new Map(raw.map((i) => [i.id, i]));
  for (const s of serialsIndex?.serials ?? []) {
    const shown = serialByKey.get(s.story_key);
    if (!shown) continue;
    for (const run of s.runs) {
      const ids = run.chapters
        .map((c) => ({ n: c.chapter, id: c.items.find((i) => poolIdSet.has(i.id))?.id }))
        .filter((c): c is { n: number; id: string } => Boolean(c.id))
        .sort((a, b) => a.n - b.n);
      const of = Math.max(s.chapters_in_full_telling ?? 0, ...shown.chapters.map((c) => c.n));
      ids.forEach((c, i) => {
        if (chapterOf.has(c.id)) return;
        // Neighbours are the nearest chapters held by a different recording (never a self-link).
        const before = ids.slice(0, i).filter((x) => x.id !== c.id);
        const after = ids.slice(i + 1).filter((x) => x.id !== c.id);
        chapterOf.set(c.id, {
          serialKey: s.story_key,
          serialTitle: s.title,
          n: c.n,
          ns: ids.filter((x) => x.id === c.id).map((x) => x.n),
          of,
          prev: before[before.length - 1]?.id ?? null,
          next: after[0]?.id ?? null,
          type: "radio",
        });
      });
    }
  }
  for (const s of sets) {
    const present = s.chapters.filter((c): c is typeof c & { id: string } => c.id !== null);
    present.forEach((c, i) => {
      if (chapterOf.has(c.id)) return;
      chapterOf.set(c.id, {
        serialKey: s.key,
        serialTitle: s.title,
        n: c.n,
        ns: [c.n],
        of: s.chapters.length,
        prev: present[i - 1]?.id ?? null,
        next: present[i + 1]?.id ?? null,
        type: "set",
      });
    });
  }
  // Better chapter titles for radio serials: the story segment's title.
  for (const s of radio) {
    for (const c of s.chapters) {
      if (!c.id) continue;
      const it = byId.get(c.id);
      const segs = (it?.segments ?? []).filter(
        (g) => (g.type === "story_chapter" || g.type === "story") && g.story_key === s.key,
      );
      // A recording holding two chapters has one segment per chapter: match the number, then the time.
      const start = c.story[c.story.length - 1]?.start_sec;
      const seg =
        segs.find((g) => g.chapter === c.n) ??
        segs.find((g) => start !== undefined && g.start_sec === start) ??
        segs[0];
      if (seg?.title) c.title = seg.title;
    }
  }

  // Serial-wide cover seed: the first chapter in the pool.
  const serialSeed = new Map<string, { key: string; first: string }>();
  for (const s of serials) {
    const first = s.chapters.find((c) => c.id)?.id;
    if (!first) continue;
    for (const c of s.chapters) if (c.id) serialSeed.set(c.id, { key: s.key, first });
  }

  const tileByFacetId = (tiles: readonly Tile[]) => {
    const m = new Map<string, Tile>();
    for (const t of tiles) for (const id of t.ids) if (!m.has(id)) m.set(id, t);
    return m;
  };
  const midahTile = tileByFacetId(MIDOS_TILES);
  const topicTile = tileByFacetId(TOPIC_TILES);
  const holidayTile = tileByFacetId(HOLIDAY_TILES);

  const heroesOf = (it: PublicItem) =>
    it.subjects.people
      .filter(
        (p) => (p.role === "central" || p.role === "appears") && !vget("people", p.id)?.unconfirmed,
      )
      .map((p) => p.id);

  const emblemOf = (it: PublicItem, kind: Kind): string => {
    const central = it.subjects.people.find((p) => p.role === "central" && HEROES[p.id]);
    if (central) return HEROES[central.id]?.icon ?? "dot";
    for (const c of it.subjects.calendar) {
      const t = holidayTile.get(c);
      if (t) return t.icon;
    }
    for (const m of it.subjects.midos) {
      const t = midahTile.get(m);
      if (t) return t.icon;
    }
    for (const m of it.subjects.topics) {
      const t = topicTile.get(m);
      if (t) return t.icon;
    }
    return KIND_ICON[kind];
  };

  const familyOf = (it: PublicItem, kind: Kind): CoverFamily => {
    if (kind === "show") return "blue";
    if (kind === "short") return "sky";
    if (kind === "event" || kind === "song") return "leaf";
    return it.classification.speakers.includes("rabbi_chaim_levi_goldstein") ? "coral" : "grape";
  };

  const items = new Map<string, KItem>();
  for (const it of pageItems) {
    const kind = kindOf(it.classification.content_type, it.classification.story_type);
    if (!kind) continue;
    const adv = advCode(
      it.audience.advisories.reduce<string>(
        (m, a) =>
          a.severity === "moderate" || m === "moderate"
            ? "moderate"
            : a.severity === "mild"
              ? "mild"
              : m,
        "none",
      ),
    );
    const seed = serialSeed.get(it.id);
    const seedItem = seed ? (byId.get(seed.first) ?? it) : it;
    const seedKind =
      kindOf(seedItem.classification.content_type, seedItem.classification.story_type) ?? kind;
    const chapterNum =
      it.classification.serial?.chapter ??
      (seed ? chapterOf.get(it.id)?.n : undefined) ??
      undefined;
    const cover: CoverSpec = {
      family: familyOf(seedItem, seedKind),
      step: parseInt(sha(seed ? seed.key : it.id).slice(0, 2), 16) % 3,
      pattern: patternFor(seedItem.classification.story_type),
      emblem: emblemOf(seedItem, seedKind),
      episode: kind === "show" ? it.classification.episode?.number : undefined,
      chapter: chapterNum ?? undefined,
    };
    const isSerialChapter = Boolean(it.classification.serial?.chapter);
    const age = it.audience.age_min;
    items.set(it.id, {
      item: it,
      id: it.id,
      title: it.title,
      kind,
      inPool: poolIdSet.has(it.id),
      age,
      adv,
      vis: VARIANTS.filter((v) => inVariant(age, adv, v)),
      byline: bylineOf(it.classification.speakers),
      heroes: heroesOf(it),
      dur: it.content_end_sec - it.content_start_sec,
      chapters: kidChapters(it.segments),
      silence: silences(it.segments),
      jump: isSerialChapter ? storyStartNoRecap(it.segments) : storyStart(it.segments),
      storyStart: storyStart(it.segments),
      cover,
      rank: rankOf.get(it.id) ?? -1,
    });
  }
  const pool = [...items.values()].filter((k) => k.inPool);

  // Story groups: "Hear this story told another way".
  interface GroupIdx {
    groups: { group_id: string; tellings: { items: { id: string; language?: string }[] }[] }[];
  }
  const groups = (loadIndex("story_groups") as GroupIdx | null)?.groups ?? [];
  const storyGroupOf = new Map<string, { groupId: string; others: string[]; yiddish: boolean }>();
  for (const g of groups) {
    const yiddish = g.tellings.some((t) => t.items.some((i) => i.language === "yi"));
    for (const t of g.tellings) {
      for (const i of t.items) {
        if (!items.has(i.id)) continue;
        const others = g.tellings
          .filter((o) => o !== t && !o.items.some((x) => x.id === i.id))
          .map((o) => o.items.find((x) => poolIdSet.has(x.id))?.id)
          .filter((x): x is string => Boolean(x) && x !== i.id);
        const prev = storyGroupOf.get(i.id);
        if (!prev)
          storyGroupOf.set(i.id, { groupId: g.group_id, others: [...new Set(others)], yiddish });
      }
    }
  }

  // Similarity over the pool.
  const sim = computeSimilar(
    pool.map((k) => {
      const it = k.item;
      return {
        id: k.id,
        kind: k.kind,
        features: featuresOf({
          people: it.subjects.people,
          midos: it.subjects.midos,
          characters: it.subjects.characters,
          topics: it.subjects.topics,
          mitzvos: it.subjects.mitzvos,
          parshiyos: it.subjects.parshiyos,
          story_type: it.classification.story_type,
          calendar: it.subjects.calendar,
        }),
        storyKey: it.classification.serial?.story_key,
        setKey: it.classification.part?.set_key,
        partNumber: it.classification.part?.part_number,
        storyGroup: storyGroupOf.get(k.id)?.groupId,
        related: it.relations.map((r) => r.target_id),
        dur: k.dur,
        title: k.title,
      };
    }),
  );

  // Other versions: same-audio relations, items superseded by this one, near-duplicates.
  const otherVersions = new Map<string, string[]>();
  const addOV = (a: string, b: string) => {
    if (a === b || !items.has(a) || !items.has(b)) return;
    const l = otherVersions.get(a) ?? [];
    if (!l.includes(b)) l.push(b);
    otherVersions.set(a, l);
  };
  for (const k of items.values()) {
    for (const r of k.item.relations) {
      if (
        ["alternate_take", "same_recording", "aired_again_in", "superseded_by"].includes(r.type)
      ) {
        addOV(k.id, r.target_id);
        addOV(r.target_id, k.id);
      }
    }
  }
  for (const d of sim.nearDuplicates) {
    addOV(d.a, d.b);
    addOV(d.b, d.a);
  }

  // Tiles.
  const tileItems = new Map<string, KItem[]>();
  const fill = (t: Tile) => {
    const ids = new Set(t.ids);
    tileItems.set(
      tileKey(t),
      pool.filter((k) => facetIds(k, t.facet).some((x) => ids.has(x))),
    );
  };
  [...TOPIC_TILES, ...MIDOS_TILES, ...MITZVOS_TILES, ...HOLIDAY_TILES].forEach(fill);
  // Chassidishe single dates as their own (hidden) tiles for the coming-up shelves.
  const heroCount = new Map<string, number>();
  for (const k of pool) for (const h of k.heroes) heroCount.set(h, (heroCount.get(h) ?? 0) + 1);
  const heroes: HeroTile[] = [];
  for (const [id, n] of heroCount) {
    const def = HEROES[id];
    const v = vget("people", id);
    if (!def || !v || v.unconfirmed || n < 5) continue;
    const cat = v.category ?? "";
    const group = HERO_GROUPS.find((g) => g.categories.includes(cat))?.label ?? "Heroes";
    const t: HeroTile = {
      slug: id,
      label: def.label,
      facet: "people",
      ids: [id],
      icon: def.icon,
      color: "#7A4FC2",
      description: def.description,
      category: cat,
      group,
    };
    heroes.push(t);
    fill(t);
  }
  heroes.sort(
    (a, b) =>
      (heroCount.get(b.slug) ?? 0) - (heroCount.get(a.slug) ?? 0) || (a.slug < b.slug ? -1 : 1),
  );

  // Client index.
  const records: Rec[] = pool.map((k) => toRec(k, chapterOf.get(k.id)));
  const index: KidsIndex = {
    version: 1,
    items: records,
    serials: Object.fromEntries(
      serials.map((s) => [s.key, { t: s.title, ids: s.chapters.map((c) => c.id) }]),
    ),
  };

  const counts = {
    pool: pool.length,
    pages: items.size,
    show: 0,
    story: 0,
    short: 0,
    event: 0,
    song: 0,
  };
  for (const k of pool) counts[k.kind]++;

  if (sim.nearDuplicates.length > 0) {
    console.warn(
      `[kids] near-duplicate pairs (score >= 0.85, no relation; shown as "Other versions" until resolved): ${sim.nearDuplicates
        .map((d) => `${d.a}~${d.b} (${d.score})`)
        .join(", ")}`,
    );
  }

  return {
    items,
    pool,
    poolIds: poolIdSet,
    sim,
    serials,
    serialByKey,
    chapterOf,
    storyGroupOf,
    otherVersions,
    tiles: {
      topics: [...TOPIC_TILES],
      midos: [...MIDOS_TILES],
      mitzvos: [...MITZVOS_TILES],
      holidays: [...HOLIDAY_TILES],
      heroes,
    },
    tileItems,
    vocab: vget,
    records,
    index,
    counts,
  };
}

/** Story of the Day pool rule before banding (§6.4). */
export function sotdEligible(k: KItem): boolean {
  return (
    (k.kind === "story" || k.kind === "show") &&
    k.item.classification.standalone === "standalone" &&
    k.item.classification.story_type.length > 0 &&
    k.adv < 2
  );
}

function toRec(k: KItem, ch: ChapterLink | undefined): Rec {
  const it = k.item;
  const r: Rec = {
    id: k.id,
    t: k.title,
    k: k.kind,
    d: Math.round(k.dur),
    a: k.age,
    v: k.adv,
    u: it.media.url,
    r: k.rank,
  };
  if (it.content_start_sec > 0) r.s = it.content_start_sec;
  if (it.content_end_sec < it.duration_sec) r.e = it.content_end_sec;
  if (k.byline === "Uncle Yossi") r.b = 0;
  else if (k.byline) r.b = 1;
  if (k.kind === "show" && it.classification.episode) r.ep = it.classification.episode.number;
  const chapter = it.classification.serial?.chapter ?? ch?.n;
  if (chapter && ch) r.ch = chapter;
  if (ch) r.sk = ch.serialKey;
  if (sotdEligible(k)) r.sd = 1;
  if (it.subjects.calendar.length) r.c = [...it.subjects.calendar];
  if (it.subjects.parshiyos.length) r.p = [...it.subjects.parshiyos];
  if (k.kind === "show" && k.jump !== null) r.js = k.jump;
  return r;
}

/** Cards of a section sorted by title (the client re-sorts unplayed-first). */
export const byTitle = (a: KItem, b: KItem) => a.title.localeCompare(b.title);

/** Variants in which a list has at least `min` items. */
export function visibleIn(list: readonly { vis: readonly Variant[] }[], min: number): Variant[] {
  return VARIANTS.filter((v) => list.filter((k) => k.vis.includes(v)).length >= min);
}

/** For a capped shelf: each item's variants = those where it is among the first `cap` in-variant items. */
export function capPerVariant<T extends { vis: readonly Variant[] }>(
  list: readonly T[],
  cap: number,
): { k: T; vis: Variant[] }[] {
  const used = new Map<Variant, number>();
  const out: { k: T; vis: Variant[] }[] = [];
  for (const k of list) {
    const vis: Variant[] = [];
    for (const v of k.vis) {
      const n = used.get(v) ?? 0;
      if (n < cap) {
        vis.push(v);
        used.set(v, n + 1);
      }
    }
    if (vis.length) out.push({ k, vis });
  }
  return out;
}

/** Count per variant (for "47 stories" labels that change with the band). */
export function countsByVariant(
  list: readonly { vis: readonly Variant[] }[],
): Record<Variant, number> {
  const out = { l: 0, k: 0, b: 0, lg: 0, kg: 0, bg: 0 } as Record<Variant, number>;
  for (const k of list) for (const v of k.vis) out[v]++;
  return out;
}

export function recOf(k: KItem): Rec {
  return toRec(k, getModel().chapterOf.get(k.id));
}

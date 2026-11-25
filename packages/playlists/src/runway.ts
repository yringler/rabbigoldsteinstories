/**
 * Storage and serving of editions (generate ahead, store, freeze; bedtime.md §4.6), independent of
 * where they are stored: the API Worker uses KV, tests and the CLI use memory or files.
 */
import type { UnitPool } from "@goldstein/data";
import { CLOCK, editionsAround, type ClockConfig } from "./clock.ts";
import {
  RECIPE_VERSION,
  type Edition,
  type HistoryFile,
  type IndexFile,
  type IndexEntry,
} from "./contract.ts";
import { EditionError, generateEdition } from "./engine.ts";
import type { Overrides, Recipe } from "./recipe.ts";

export interface EditionStore {
  get(id: string): Promise<Edition | null>;
  put(edition: Edition): Promise<void>;
}

export const RUNWAY_DAYS = 14;
export const HISTORY_NIGHTS = 7;
/** More than the longest cooldown in the recipes (mix head: 50 days): how much history generation reads. */
export const LOOKBACK_DAYS = 60;
/** Editions starting within this many hours are frozen: never rewritten. */
export const FREEZE_HOURS = 24;

export interface RunwayInput {
  store: EditionStore;
  pool: UnitPool;
  recipes: readonly Recipe[];
  overrides?: Overrides;
  now: Date;
  clock?: ClockConfig;
  log?: (msg: string) => void;
}

export interface RunwayResult {
  generated: string[];
  kept: string[];
  failed: string[];
}

/**
 * Make sure editions exist from the current one through RUNWAY_DAYS ahead. Frozen editions
 * (starting within FREEZE_HOURS, or in the past) are never rewritten; later ones are regenerated
 * when the pool or recipe version changed. A failed generation keeps whatever was stored.
 */
export async function ensureRunway(input: RunwayInput): Promise<RunwayResult> {
  const clock = input.clock ?? CLOCK;
  const perDay = 24 / clock.rotationHours;
  const log = input.log ?? (() => {});
  const windows = editionsAround(input.now, LOOKBACK_DAYS * perDay, RUNWAY_DAYS * perDay, clock);
  const currentIdx = windows.findIndex(
    (w) =>
      Date.parse(w.starts_at) <= input.now.getTime() && input.now.getTime() < Date.parse(w.ends_at),
  );
  const history: Edition[] = [];
  for (const w of windows.slice(0, currentIdx)) {
    const e = await input.store.get(w.id);
    if (e) history.push(e);
  }
  const res: RunwayResult = { generated: [], kept: [], failed: [] };
  const freezeAt = input.now.getTime() + FREEZE_HOURS * 3_600_000;
  for (const w of windows.slice(currentIdx)) {
    const existing = await input.store.get(w.id);
    const frozen = existing && Date.parse(w.starts_at) <= freezeAt;
    const current =
      existing &&
      existing.pool_hash === input.pool.pool_hash &&
      existing.recipe_version === RECIPE_VERSION;
    if (existing && (frozen || current)) {
      history.push(existing);
      res.kept.push(w.id);
      continue;
    }
    try {
      const e = generateEdition({
        pool: input.pool,
        recipes: input.recipes,
        window: w,
        history,
        clock,
        now: input.now,
        log,
        ...(input.overrides ? { overrides: input.overrides } : {}),
      });
      await input.store.put(e);
      history.push(e);
      res.generated.push(w.id);
    } catch (err) {
      if (!(err instanceof EditionError)) throw err;
      log(`edition ${w.id} not generated: ${err.message}`);
      res.failed.push(w.id);
      if (existing) history.push(existing);
    }
  }
  return res;
}

/**
 * Tombstone pass at read time (privacy and owner removals beat immutability): drop tracks whose
 * unit is no longer in the pool (unpublished, now overlapping a hidden span, excluded...). A
 * block loses all its tracks. Nothing is substituted.
 */
export function tombstone(e: Edition, pool: UnitPool, overrides: Overrides = {}): Edition {
  const live = new Map(
    pool.units.filter((u) => !overrides[u.unit]?.exclude).map((u) => [u.unit, u] as const),
  );
  // An item survives only if its unit is still in the pool AND it plays exactly one of that
  // unit's current tracks (start_sec, or the opening-song intro_start_sec, to end_sec). A data
  // fix that moves or shrinks a track (e.g. a new hidden span) drops the stored item; a block
  // with any such part loses all its parts.
  const matches = (i: Edition["playlists"][number]["items"][number]) =>
    live
      .get(i.unit)
      ?.tracks.some(
        (t) =>
          t.id === i.id &&
          t.end_sec === i.end_sec &&
          (t.start_sec === i.start_sec || t.intro_start_sec === i.start_sec),
      ) ?? false;
  return {
    ...e,
    playlists: e.playlists
      .map((p) => {
        const bad = new Set(p.items.filter((i) => !matches(i)).map((i) => i.unit));
        const items = p.items.filter((i) => !bad.has(i.unit));
        return {
          ...p,
          items,
          total_min: Math.round(items.reduce((s, i) => s + i.duration_sec, 0) / 60),
          age_min: Math.max(0, ...items.map((i) => i.age_min)),
        };
      })
      .filter((p) => p.items.length > 0),
  };
}

export interface Views {
  index: IndexFile;
  current: Edition | null;
  history: HistoryFile;
}

/** The published views (bedtime.md §4.6) from whatever is stored. */
export async function buildViews(
  store: EditionStore,
  pool: UnitPool,
  now: Date,
  overrides: Overrides = {},
  clock: ClockConfig = CLOCK,
): Promise<Views> {
  const perDay = 24 / clock.rotationHours;
  // Only what has started is public: the 7 previous nights and the current one. Future editions
  // stay private (they may still change, and nobody should browse ahead).
  const windows = editionsAround(now, HISTORY_NIGHTS * perDay, 0, clock);
  const t = now.getTime();
  const entries: IndexEntry[] = [];
  const editions = new Map<string, Edition>();
  for (const w of windows) {
    const e = await store.get(w.id);
    if (!e) continue;
    editions.set(w.id, e);
    entries.push({
      date: e.date,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      hebrew_date: e.hebrew_date,
      file: `editions/${e.date}.json`,
    });
  }
  const cur = windows.find((w) => Date.parse(w.starts_at) <= t && t < Date.parse(w.ends_at));
  const past = windows.filter((w) => Date.parse(w.ends_at) <= t).reverse();
  return {
    index: {
      recipe_version: RECIPE_VERSION,
      rotation_hours: clock.rotationHours,
      flip_tz: clock.flipTz,
      flip_local: clock.flipLocal,
      published_at: now.toISOString(),
      editions: entries,
    },
    current: cur && editions.get(cur.id) ? tombstone(editions.get(cur.id)!, pool, overrides) : null,
    history: {
      nights: past
        .map((w) => editions.get(w.id))
        .filter((e): e is Edition => !!e)
        .slice(0, HISTORY_NIGHTS)
        .map((e) => tombstone(e, pool, overrides)),
    },
  };
}

/** In-memory store (tests, previews). */
export function memoryStore(initial: Edition[] = []): EditionStore & { all(): Edition[] } {
  const m = new Map(initial.map((e) => [e.date, e]));
  return {
    get: async (id) => m.get(id) ?? null,
    put: async (e) => void m.set(e.date, e),
    all: () => [...m.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
  };
}

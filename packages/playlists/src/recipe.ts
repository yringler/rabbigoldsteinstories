import type { Unit } from "@goldstein/data";
import type { EditionWindow } from "./clock.ts";
import type { Rng } from "./rng.ts";
import type { Season } from "./seasons.ts";

/** Context a recipe sees while one playlist is assembled. */
export interface RecipeContext {
  edition: EditionWindow;
  rng: Rng;
  /** All units in the pool (for wind-down swaps etc.). */
  pool: readonly Unit[];
  /** Hebrew date of the night and the active calendar tags (bedtime.md §4.7). */
  season: Season;
  /** Set when ordering: whether a unit may play inside the head (first 40 min) of this playlist. */
  headOk?: (u: Unit) => boolean;
}

/** The playlist being filled, as the weight and admit hooks see it. */
export interface FillState {
  /** Units drawn so far (body first, then wind-down tail), in draw order. */
  picked: readonly Unit[];
  /** Seconds drawn so far. */
  total: number;
  /** True while the playlist is inside its head (first 40 minutes). */
  inHead: boolean;
  /** True while the wind-down tail is being drawn. */
  inTail: boolean;
}

/**
 * The wind-down (bedtime.md §4.5 step 6): the playlist ends with at least `minSec` seconds of
 * units drawn from `eligible` (calm units), with the same cooldowns. The engine reserves this
 * tail while filling and plays it last, calmest last.
 */
export interface WindDown {
  minSec: number;
  eligible(u: Unit): boolean;
}

/**
 * One playlist type (bedtime.md §4.4). The engine does the shared work (cooldowns, dedupe keys,
 * head rules, fill to length, at most one block, relaxation, validation); the recipe says what
 * fits, what is preferred and in what order it plays.
 */
export interface Recipe {
  /** Playlist `type` in the published files: little, big, calm, adventure, mix... */
  type: string;
  title: string;
  /** Parent-facing card line. */
  subtitle: string;
  /** Kid-facing line (kids site). */
  kidLine?: string;
  targetMin: number;
  toleranceMin: number;
  /** No repeat (shared key) in the same type within this many days. */
  cooldownDays: number;
  /** No repeat in the head (first 40 min) of the same type within this many days. */
  headCooldownDays: number;
  /** Longest opener in minutes (default 15). */
  openerMaxMin?: number;
  /** Hard filter on the pool. */
  eligible(u: Unit): boolean;
  /** Calm tail the playlist must end with (optional). */
  windDown?: WindDown;
  /** Relative weight (default 1). Seasonal weighting goes here. */
  weight?(u: Unit, ctx: RecipeContext, state?: FillState): number;
  /** Extra per-draw filter that depends on the fill so far (e.g. seasonal share, head rules). */
  admit?(u: Unit, ctx: RecipeContext, state: FillState): boolean;
  /**
   * Running order (default: opener, then descending energy, block second; see engine.ts). Gets
   * the body and the wind-down tail separately and returns the whole playlist; the tail must stay
   * at the end.
   */
  order?(chosen: Unit[], ctx: RecipeContext, tail?: Unit[]): Unit[];
  /** Extra validation (e.g. the wind-down rule); return an error message or null. */
  validate?(ordered: Unit[], ctx: RecipeContext): string | null;
}

/** Owner/reviewer corrections without touching metadata: packages/playlists/overrides.json. */
export interface Overrides {
  [unitId: string]: { energy?: number; exclude?: boolean; note: string };
}

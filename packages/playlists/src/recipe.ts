import type { Unit } from "@goldstein/data";
import type { EditionWindow } from "./clock.ts";
import type { Rng } from "./rng.ts";

/** Context a recipe sees while one playlist is assembled. */
export interface RecipeContext {
  edition: EditionWindow;
  rng: Rng;
  /** All units in the pool (for wind-down swaps etc.). */
  pool: readonly Unit[];
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
  /** Relative weight (default 1). Seasonal weighting goes here. */
  weight?(u: Unit, ctx: RecipeContext): number;
  /** Running order (default: opener, then descending energy, block second; see engine.ts). */
  order?(chosen: Unit[], ctx: RecipeContext): Unit[];
  /** Extra validation (e.g. the wind-down rule); return an error message or null. */
  validate?(ordered: Unit[], ctx: RecipeContext): string | null;
}

/** Owner/reviewer corrections without touching metadata: packages/playlists/overrides.json. */
export interface Overrides {
  [unitId: string]: { energy?: number; exclude?: boolean; note: string };
}

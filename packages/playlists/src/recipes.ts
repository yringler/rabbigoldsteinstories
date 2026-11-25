/**
 * The five core playlist types (docs/sites/bedtime.md §4.4–4.7). OWNED BY THE BEDTIME TEAM.
 *
 * Each recipe gives its eligibility (§4.4), cooldowns (§4.6), the reserved calm wind-down at the
 * end (§4.5 step 6), seasonal weighting (§4.7: ×6 near, ×4 in season, ×0.1 and never in the
 * head out of season, at most 40% seasonal minutes, mourning tags never boosted in little/calm)
 * and the running order: opener (the shortest seasonal story if there is one, else the
 * liveliest short one), body by descending energy, the calm tail last; the voices rule (no more
 * than three tracks in a row by one narrator when a swap of same-band neighbours fixes it); the
 * opening-song rule (the first track keeps its "I Believe in Hashem" intro, later ones skip it).
 *
 * Cooldowns are lower than the first table in bedtime.md §4.6 (noted per recipe below): with the
 * binding rule that a unit sharing any dedupe key counts as a use, the pools hold far fewer
 * distinct stories than units (Little Ones: 216 units, 91 key clusters, about 14.5 h of distinct
 * material), and the original numbers made almost every edition relax. These values come from a
 * 365-night simulation on the real pool (relaxation in under 5% of playlists); bedtime.md §4.6
 * has the table and the measurements.
 *
 * Changing a recipe changes future editions only (stored editions are frozen); bump
 * RECIPE_VERSION in contract.ts when selection changes.
 */
import type { Unit } from "@goldstein/data";
import { orderTail } from "./engine.ts";
import type { FillState, Recipe, RecipeContext, WindDown } from "./recipe.ts";
import { seasonalStatus, type SeasonalStatus } from "./seasons.ts";

const LITTLE_FLAGS = new Set([
  "kidnapping_captivity",
  "forced_conversion",
  "national_tragedy",
  "afterlife_judgment",
  "sad_ending",
]);
const CALM_FLAGS = new Set([
  "peril_violence",
  "kidnapping_captivity",
  "forced_conversion",
  "national_tragedy",
  "sad_ending",
]);
const MIN = 60;
const energy = (u: Unit) => u.energy ?? 0;
const single = (u: Unit) => u.block === null;
const noModerate = (u: Unit) =>
  !u.advisories.some((a) => a.severity === "moderate" || a.severity === "strong");
/** A unit that may play in the wind-down: energy ≤ 0 and no moderate advisory (§4.5). */
export const windsDown = (u: Unit) => single(u) && energy(u) <= 0 && noModerate(u);

/** Quiet Night's pool (§4.4); also the "calm pool" that other types draw their wind-down from. */
export const calmEligible = (u: Unit) =>
  single(u) &&
  u.band === "calm" &&
  energy(u) <= 0 &&
  u.age_min <= 8 &&
  noModerate(u) &&
  !u.advisories.some((a) => CALM_FLAGS.has(a.flag));

const littleEligible = (u: Unit) =>
  single(u) &&
  u.age_min <= 5 &&
  noModerate(u) &&
  !u.advisories.some((a) => LITTLE_FLAGS.has(a.flag)) &&
  energy(u) <= 3 &&
  u.duration_sec <= 20 * MIN;

/** Seasonal units fill at most this share of a playlist's minimum length (§4.7). */
const SEASONAL_SHARE = 0.4;
/** Short calm units for a wind-down tail (§4.4: "units ≤ 15 min"). */
const calmTail = (minMin: number): WindDown => ({
  minSec: minMin * MIN,
  eligible: (u) => calmEligible(u) && u.duration_sec <= 15 * MIN,
});

interface Spec extends Omit<Recipe, "weight" | "admit" | "order" | "validate"> {
  /** Mourning tags are never boosted in this type (little, calm). */
  noMourningBoost?: boolean;
}

function status(u: Unit, ctx: RecipeContext, spec: Spec): SeasonalStatus {
  return seasonalStatus(u.calendar, ctx.season, spec.noMourningBoost ?? false);
}
const inSeason = (s: SeasonalStatus) => s === "near" || s === "window";

/** Weight (§4.7), plus a strong pull towards one "near" seasonal story when none is drawn yet. */
function seasonalWeight(u: Unit, ctx: RecipeContext, spec: Spec, state?: FillState): number {
  const s = status(u, ctx, spec);
  if (s === "none") return 1;
  if (s === "out") return 0.1;
  const base = s === "near" ? 6 : 4;
  const haveOne = state?.picked.some((p) => inSeason(status(p, ctx, spec))) ?? true;
  return s === "near" && !haveOne && !state?.inTail ? base * 200 : base;
}

/** Out-of-season units never in the head; seasonal minutes capped at 40% (§4.7). */
function seasonalAdmit(u: Unit, ctx: RecipeContext, spec: Spec, state: FillState): boolean {
  const s = status(u, ctx, spec);
  if (s === "out") return !state.inHead && !u.block; // a block plays second, in the head
  if (!inSeason(s)) return true;
  const used = state.picked
    .filter((p) => inSeason(status(p, ctx, spec)))
    .reduce((t, p) => t + p.duration_sec, 0);
  return used + u.duration_sec <= SEASONAL_SHARE * (spec.targetMin - spec.toleranceMin) * MIN;
}

/**
 * Voices (§4.5): no more than three single tracks in a row by one narrator, when swapping the
 * fourth with a later unit of the same band and another narrator fixes it. Never moves the
 * opener, a block, or anything across the start of the wind-down tail.
 */
export function applyVoices(units: Unit[], tailStart: number): Unit[] {
  const out = [...units];
  const narrators = new Set(out.map((u) => u.narrator).filter((n) => n !== null));
  if (narrators.size < 2) return out;
  for (let i = 3; i < out.length; i++) {
    const n = out[i]!.narrator;
    if (n === null || out[i]!.block) continue;
    if (![1, 2, 3].every((k) => out[i - k]!.narrator === n && !out[i - k]!.block)) continue;
    const end = i < tailStart ? tailStart : out.length;
    for (let j = i + 1; j < end; j++) {
      const c = out[j]!;
      if (!c.block && c.band === out[i]!.band && c.narrator !== null && c.narrator !== n) {
        out[j] = out[i]!;
        out[i] = c;
        break;
      }
    }
  }
  return out;
}

/** The first track keeps its opening song (§4.2) when the playlist still fits its length. */
function withOpeningSong(units: Unit[], spec: Spec): Unit[] {
  const first = units[0];
  const t = first?.tracks[0];
  if (!first || !t || first.tracks.length !== 1 || t.intro_start_sec === undefined) return units;
  const extra = t.start_sec - t.intro_start_sec;
  const total = units.reduce((s, u) => s + u.duration_sec, 0);
  if (extra <= 0 || total + extra > (spec.targetMin + spec.toleranceMin) * MIN) return units;
  const withSong: Unit = {
    ...first,
    duration_sec: first.duration_sec + extra,
    tracks: [{ ...t, start_sec: t.intro_start_sec, duration_sec: t.duration_sec + extra }],
  };
  return [withSong, ...units.slice(1)];
}

/**
 * Opener: the shortest seasonal story if one was drawn, else the liveliest story up to
 * openerMaxMin, else the shortest; only units allowed in the head qualify. Then the body by
 * descending energy with the block (if any) second (the engine moves it after the head, where
 * blocks are allowed), then the tail, calmest last.
 */
function order(spec: Spec, body: Unit[], ctx: RecipeContext, tail: Unit[] = []): Unit[] {
  const headOk = ctx.headOk ?? (() => true);
  const byUnit = (a: Unit, b: Unit) => a.unit.localeCompare(b.unit);
  const candidates = body.filter((u) => single(u) && headOk(u));
  const maxOpener = (spec.openerMaxMin ?? 15) * MIN;
  const opener =
    candidates
      .filter((u) => u.duration_sec <= maxOpener && inSeason(status(u, ctx, spec)))
      .sort((a, b) => a.duration_sec - b.duration_sec || byUnit(a, b))[0] ??
    candidates
      .filter((u) => u.duration_sec <= maxOpener)
      .sort((a, b) => energy(b) - energy(a) || byUnit(a, b))[0] ??
    [...candidates].sort((a, b) => a.duration_sec - b.duration_sec || byUnit(a, b))[0];
  const rest = body
    .filter((u) => u !== opener)
    .sort((a, b) => energy(b) - energy(a) || byUnit(a, b));
  const block = rest.find((u) => !single(u));
  const ordered = [
    ...(opener ? [opener] : []),
    ...(block ? [block] : []),
    ...rest.filter((u) => u !== block),
  ];
  const all = [...ordered, ...orderTail(tail)];
  return withOpeningSong(applyVoices(all, ordered.length), spec);
}

/** The playlist ends with at least `minSec` of wind-down units (§4.5 step 6, §7 criterion 8). */
export function windDownSeconds(units: readonly Unit[]): number {
  let t = 0;
  for (let i = units.length - 1; i >= 0 && windsDown(units[i]!); i--) t += units[i]!.duration_sec;
  return t;
}

function make(spec: Spec): Recipe {
  const windDown = spec.windDown;
  return {
    ...spec,
    weight: (u, ctx, state) => seasonalWeight(u, ctx, spec, state),
    admit: (u, ctx, state) => seasonalAdmit(u, ctx, spec, state),
    order: (body, ctx, tail) => order(spec, body, ctx, tail),
    validate: (ordered) => {
      if (!windDown) return null;
      const t = windDownSeconds(ordered);
      return t >= windDown.minSec
        ? null
        : `wind-down ${Math.round(t / MIN)} min < ${windDown.minSec / MIN}`;
    },
  };
}

export const RECIPES: readonly Recipe[] = [
  make({
    type: "little",
    title: "Little Ones",
    subtitle: "Short, gentle stories. Ages 3–6.",
    kidLine: "Cozy little stories",
    targetMin: 90,
    toleranceMin: 10,
    cooldownDays: 5, // first spec table: 6
    headCooldownDays: 10, // first spec table: 18
    openerMaxMin: 12,
    noMourningBoost: true,
    eligible: littleEligible,
    windDown: { minSec: 20 * MIN, eligible: (u) => littleEligible(u) && windsDown(u) },
  }),
  make({
    type: "big",
    title: "Big Kids",
    subtitle: "Longer stories with more to think about. Ages 6–10.",
    kidLine: "Big stories for big kids",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 12, // first spec table: 16
    headCooldownDays: 24, // first spec table: 40
    eligible: (u) => u.age_min >= 6 || (u.age_min === 5 && energy(u) >= 1),
    windDown: calmTail(20),
  }),
  make({
    type: "calm",
    title: "Quiet Night",
    subtitle: "Soft, slow stories for drifting off.",
    kidLine: "Stories for sleepy heads",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 6, // first spec table: 7
    headCooldownDays: 12, // first spec table: 21
    noMourningBoost: true,
    eligible: calmEligible,
    windDown: { minSec: 20 * MIN, eligible: calmEligible },
  }),
  make({
    type: "adventure",
    title: "Adventure Night",
    subtitle: "Kings, journeys and narrow escapes, settling down by the end. Ages 6+.",
    kidLine: "Hold on tight",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 6, // first spec table: 12
    headCooldownDays: 10, // first spec table: 24
    eligible: (u) => energy(u) >= 3 && u.age_min <= 9,
    windDown: calmTail(25),
  }),
  make({
    type: "mix",
    title: "Tonight's Mix",
    subtitle: "A bit of everything.",
    kidLine: "A surprise mix",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 16, // first spec table: 24
    headCooldownDays: 28, // first spec table: 45
    eligible: () => true,
    windDown: calmTail(20),
  }),
];

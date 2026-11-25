/**
 * The playlist types (docs/sites/bedtime.md §4.4). OWNED BY THE BEDTIME TEAM: this is a first cut
 * of the spec's eligibility table and cooldowns, without seasonal weighting (§4.7), the adventure
 * wind-down swap, or the voices rule. Changing a recipe changes future editions only (stored
 * editions are frozen); bump RECIPE_VERSION in contract.ts when selection changes.
 */
import type { Unit } from "@goldstein/data";
import type { Recipe } from "./recipe.ts";

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
const energy = (u: Unit) => u.energy ?? 0;
const single = (u: Unit) => u.block === null;
const noModerate = (u: Unit) =>
  !u.advisories.some((a) => a.severity === "moderate" || a.severity === "strong");

export const RECIPES: readonly Recipe[] = [
  {
    type: "little",
    title: "Little Ones",
    subtitle: "Short, gentle stories. Ages 3–6.",
    kidLine: "Cozy little stories",
    targetMin: 90,
    toleranceMin: 10,
    cooldownDays: 6,
    headCooldownDays: 18,
    openerMaxMin: 12,
    eligible: (u) =>
      single(u) &&
      u.age_min <= 5 &&
      noModerate(u) &&
      !u.advisories.some((a) => LITTLE_FLAGS.has(a.flag)) &&
      energy(u) <= 3 &&
      u.duration_sec <= 20 * 60,
  },
  {
    type: "big",
    title: "Big Kids",
    subtitle: "Longer stories with more to think about. Ages 6–10.",
    kidLine: "Big stories for big kids",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 16,
    headCooldownDays: 40,
    eligible: (u) => u.age_min >= 6 || (u.age_min === 5 && energy(u) >= 1),
  },
  {
    type: "calm",
    title: "Quiet Night",
    subtitle: "Soft, slow stories for drifting off.",
    kidLine: "Stories for sleepy heads",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 7,
    headCooldownDays: 21,
    eligible: (u) =>
      single(u) &&
      u.band === "calm" &&
      u.age_min <= 8 &&
      noModerate(u) &&
      !u.advisories.some((a) => CALM_FLAGS.has(a.flag)),
  },
  {
    type: "adventure",
    title: "Adventure Night",
    subtitle: "Kings, journeys and narrow escapes, settling down by the end. Ages 6+.",
    kidLine: "Hold on tight",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 12,
    headCooldownDays: 24,
    eligible: (u) => energy(u) >= 3 && u.age_min <= 9,
  },
  {
    type: "mix",
    title: "Tonight's Mix",
    subtitle: "A bit of everything.",
    kidLine: "A surprise mix",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 24,
    headCooldownDays: 45,
    eligible: () => true,
  },
];

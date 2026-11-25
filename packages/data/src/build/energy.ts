/**
 * Calm/exciting score for a unit (docs/sites/bedtime.md §4.3). Owned by the bedtime team: tune
 * here, and keep the spec in step. Overrides from packages/playlists/overrides.json are applied by
 * the playlist generator, not here, so the data build stays independent of the playlists package.
 */
import type { Unit } from "../types.ts";

const ADVISORY: Record<string, [mild: number, moderate: number]> = {
  peril_violence: [2, 4],
  kidnapping_captivity: [2, 4],
  forced_conversion: [3, 4],
  national_tragedy: [2, 3],
  persecution: [1, 3],
  death: [1, 3],
  afterlife_judgment: [1, 2],
  illness: [1, 2],
  sad_ending: [1, 2],
  family_hardship: [0, 1],
  alcohol: [0, 1],
};
const TOPIC: Record<string, number> = {
  mesiras_nefesh_kiddush_hashem: 2,
  miracles: 1,
  jewish_history: 1,
  hashem_in_nature: -1,
  morning_routine: -1,
  kindness_and_community: -1,
  family_and_home: -1,
  character: -1,
  prayer_and_brachos: -1,
  mitzvos_in_daily_life: -1,
};
const STORY_TYPE: Record<string, number> = { historical: 1, mashal_parable: -1, moral_fiction: -1 };

const EXCITING = [
  "robber", "thie[fv]", "bandit", "pirate", "soldier", "army", "\\bwar\\b", "battle", "sword", "\\bgun",
  "escape", "chase", "prison", "jail", "dungeon", "kidnap", "captur", "captive", "danger", "wol[fv]",
  "\\bbear\\b", "lion", "\\bfire\\b", "storm", "blizzard", "shipwreck", "drown", "attack", "rescue", "\\bspy",
  "cossack", "frighten", "terrif", "cruel", "wicked", "decree", "siege", "poritz", "accus", "trial",
  "execut", "death sentence", "ransom", "smuggl", "haunted", "spooky", "flood", "flames", "sinking",
].map((p) => new RegExp(p, "i"));
const CALM = [
  "bedtime", "sleep", "lullab", "gentle", "quiet", "peaceful", "kindness", "smile", "\\bsong\\b", "sings",
  "garden", "flower", "bird", "stars", "moon", "modeh ani", "shabbos candles", "thank", "share", "sharing",
  "honest", "patien", "guest", "hospitality", "tzedakah", "brachah", "bracha", "blessing", "helping", "friend",
].map((p) => new RegExp(p, "i"));

export function scoreEnergy(u: Unit, text: string, cliffhanger = false): Pick<Unit, "energy" | "band"> {
  let e = 0;
  for (const a of u.advisories) {
    const w = ADVISORY[a.flag];
    if (w) e += a.severity === "mild" ? w[0] : w[1];
  }
  for (const t of u.topics) e += TOPIC[t] ?? 0;
  for (const s of u.story_type) e += STORY_TYPE[s] ?? 0;
  e += Math.min(3, EXCITING.filter((r) => r.test(text)).length);
  e -= Math.min(2, CALM.filter((r) => r.test(text)).length);
  if (cliffhanger) e += 1;
  return { energy: e, band: e <= 0 ? "calm" : e <= 3 ? "middle" : "exciting" };
}

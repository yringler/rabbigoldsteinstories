/**
 * The kid pool (docs/sites/kids.md §9, with DECISIONS "Website decisions": `review` items are
 * publishable, so rule 1 is "in the public export"; `hide` items never reach it).
 */
import type { AudienceLevel, ContentType, PublicItem } from "@goldstein/data";
import type { ItemLang } from "./kinds.ts";

export const KID_LEVELS: readonly AudienceLevel[] = [
  "young_children",
  "children",
  "older_children",
  "family",
];
export const EXCLUDED_TYPES: readonly ContentType[] = [
  "shiur",
  "fragment",
  "promo",
  "family_recording",
];

export type PoolReason =
  "language" | "level" | "content_type" | "superseded" | "strong_advisory" | null;

/** Why an item is outside the kid pool (null = in the pool). Rules 2–6; rule 1 is the export itself. */
export function poolReason(it: PublicItem): PoolReason {
  // Rule 2 (docs/design/language-kids.md §1): English or Yiddish. Anything else stays out, so a
  // future Hebrew item can't slip in labelled as Yiddish.
  if (it.language.primary !== "en" && it.language.primary !== "yi") return "language";
  if (!KID_LEVELS.includes(it.audience.level)) return "level";
  if (EXCLUDED_TYPES.includes(it.classification.content_type)) return "content_type";
  if (it.audience.advisories.some((a) => a.severity === "strong")) return "strong_advisory";
  if (!it.derived.preferred_copy) return "superseded";
  return null;
}

export const inKidPool = (it: PublicItem): boolean => poolReason(it) === null;

/** Items that get a page: the pool plus superseded copies that would otherwise qualify ("Other versions"). */
export const hasKidPage = (it: PublicItem): boolean => {
  const r = poolReason(it);
  return r === null || r === "superseded";
};

/** The language of an item on this site: "yi" when its primary language is Yiddish, else "en". */
export const kidLang = (it: Pick<PublicItem, "language">): ItemLang =>
  it.language.primary === "yi" ? "yi" : "en";

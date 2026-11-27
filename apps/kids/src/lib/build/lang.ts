/** Build-time helpers for the language preference (docs/design/language-kids.md). */
import { type Lang, type Variant, VARIANTS, variantLang, variantsOfLang } from "../kinds.ts";
import { type KItem, type Model, getModel, visAnyLang } from "./model.ts";

/** Per variant: how many Yiddish items the band and Gentle setting admit (whatever the language). */
export function yiddishCounts(m: Model = getModel()): Record<Variant, number> {
  const out = Object.fromEntries(VARIANTS.map((v) => [v, 0])) as Record<Variant, number>;
  for (const k of m.poolYi) for (const v of visAnyLang(k)) out[v]++;
  return out;
}

/** Variants of the given preferences, e.g. a block shown only in "Yiddish only" mode. */
export const visOf = (...langs: Lang[]): Variant[] => langs.flatMap((l) => variantsOfLang(l));
/** Variants that are not "Yiddish only" (English-only content). */
export const notYi = (): Variant[] => VARIANTS.filter((v) => variantLang(v) !== "yi");

/** The Yiddish shelves (Home in "Yiddish only", and /yiddish/), in display order. */
export interface YiGroup {
  key: string;
  title: string;
  sub?: string;
  items: KItem[];
}

export function yiddishGroups(m: Model = getModel()): YiGroup[] {
  const isBubby = (k: KItem) => k.item.classification.speakers.includes("bubby_chaya_malka");
  const byTitle = (a: KItem, b: KItem) => a.title.localeCompare(b.title);
  const yi = m.poolYi;
  return [
    {
      key: "bubby",
      title: "Bubby's stories",
      sub: "Told by Bubby Chaya Malka",
      items: yi.filter((k) => k.kind === "story" && isBubby(k)).sort(byTitle),
    },
    {
      key: "stories",
      title: "More stories",
      items: yi.filter((k) => k.kind === "story" && !isBubby(k)).sort(byTitle),
    },
    {
      key: "pesach",
      title: "Getting ready for Pesach",
      items: yi.filter((k) => k.kind === "short").sort(byTitle),
    },
    {
      key: "more",
      title: "Also in Yiddish",
      items: yi.filter((k) => k.kind !== "story" && k.kind !== "short").sort(byTitle),
    },
  ];
}

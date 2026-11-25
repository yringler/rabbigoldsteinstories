/**
 * The archive's numbers for the landing page, computed at build time from the public dataset
 * (packages/data/generated via @goldstein/data/load). Nothing here is hardcoded: a data rebuild
 * changes the page.
 */
import type { CatalogEntry, LostEpisodes, Manifest, PublicVocab } from "@goldstein/data";

export const RADIO_SERIES = "uy_tzivos_hashem_on_the_air";
export const YOSSI = "rabbi_yosef_goldstein";
export const CHAIM_LEVI = "rabbi_chaim_levi_goldstein";

export interface ArchiveStats {
  /** Published recordings (every public item, other versions included). */
  recordings: number;
  /** Published hours, rounded. */
  hours: number;
  /** Radio episodes in the archive (distinct episode numbers). */
  radioEpisodes: number;
  /** Radio episodes not found yet (status "lost" in the lost-episodes index). */
  lostEpisodes: number;
  /** Recordings (preferred copies) in which each confirmed storyteller speaks. */
  yossiRecordings: number;
  chaimLeviRecordings: number;
  /** Earliest year with a dated recording. */
  firstYear: number | null;
}

export function computeStats(
  manifest: Manifest,
  catalog: readonly CatalogEntry[],
  lost: LostEpisodes,
): ArchiveStats {
  const preferred = catalog.filter((e) => e.preferred_copy);
  const episodes = new Set(
    catalog
      .filter((e) => e.content_type === "radio_episode" && e.series === RADIO_SERIES)
      .map((e) => e.episode)
      .filter((n): n is number => typeof n === "number"),
  );
  const years = catalog
    .map((e) => (e.date ? Number.parseInt(e.date.slice(0, 4), 10) : NaN))
    .filter((y) => Number.isFinite(y) && y > 1900);
  return {
    recordings: manifest.counts.public_items,
    hours: Math.round(manifest.hours),
    radioEpisodes: episodes.size,
    lostEpisodes: lost.episodes.filter((e) => e.status === "lost").length,
    yossiRecordings: preferred.filter((e) => e.speakers.includes(YOSSI)).length,
    chaimLeviRecordings: preferred.filter((e) => e.speakers.includes(CHAIM_LEVI)).length,
    firstYear: years.length ? Math.min(...years) : null,
  };
}

export const fmt = (n: number): string => n.toLocaleString("en-US");

/**
 * The page names people and series in prose. Only confirmed vocabulary entries may be presented as
 * fact (root CLAUDE.md; DECISIONS 3), so the build fails if any id the page names is missing or
 * marked unconfirmed in the public vocabulary.
 */
export const NAMED_IN_PROSE: Readonly<Record<string, readonly string[]>> = {
  speakers: [YOSSI, CHAIM_LEVI, "bubby_chaya_malka"],
  series: [RADIO_SERIES, "tanya_yiddish_goldstein"],
};

export function assertConfirmed(vocab: PublicVocab, named = NAMED_IN_PROSE): void {
  for (const [list, ids] of Object.entries(named)) {
    for (const id of ids) {
      const entry = vocab.lists[list]?.find((e) => e.id === id);
      if (!entry) throw new Error(`home: vocabulary ${list}.${id} is not in the public dataset`);
      if (entry.unconfirmed)
        throw new Error(`home: ${list}.${id} is unconfirmed; don't name it as fact`);
    }
  }
}

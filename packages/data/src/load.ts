/**
 * Build-time (Node) access to the generated public dataset, for Astro pages and scripts:
 *   import { loadCatalog, loadItem } from "@goldstein/data/load";
 * Reads packages/data/generated/ (or GOLDSTEIN_PUBLIC_DATA_DIR). Run `npm run data:ensure` first;
 * every app's build script does. Results are cached per process.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type {
  CatalogEntry,
  ItemId,
  LostEpisodes,
  Manifest,
  PublicItem,
  PublicTranscript,
  PublicVocab,
  SearchDoc,
  UnitPool,
} from "./types.ts";

const cache = new Map<string, unknown>();

/**
 * The generated folder. Resolved through the package (not import.meta.url), because Astro bundles
 * this module into each app's build output, where a relative path would point into dist/.
 */
function outDir(): string {
  const env = process.env["GOLDSTEIN_PUBLIC_DATA_DIR"];
  if (env) return resolve(env);
  const pkg = createRequire(join(process.cwd(), "noop.js")).resolve("@goldstein/data/package.json");
  return join(dirname(pkg), "generated");
}

function read<T>(rel: string): T {
  const hit = cache.get(rel);
  if (hit !== undefined) return hit as T;
  const p = join(outDir(), rel);
  if (!existsSync(p)) {
    throw new Error(`public data file missing: ${p}. Run \`npm run data:ensure\` at the repo root.`);
  }
  const v = JSON.parse(readFileSync(p, "utf8")) as T;
  cache.set(rel, v);
  return v;
}

function readOptional<T>(rel: string): T | null {
  return existsSync(join(outDir(), rel)) ? read<T>(rel) : null;
}

export const publicDataDir = (): string => outDir();
export const loadManifest = (): Manifest => read<Manifest>("manifest.json");
export const loadCatalog = (): CatalogEntry[] => read<CatalogEntry[]>("catalog.json");
export const loadVocab = (): PublicVocab => read<PublicVocab>("vocab.json");
/** Playlist unit pool (input to packages/playlists). */
export const loadUnitPool = (): UnitPool => read<UnitPool>("units.json");
export const loadItem = (id: ItemId): PublicItem => read<PublicItem>(`items/${id}.json`);
/** English display transcript, or null when the item has none to show. */
export const loadTranscript = (id: ItemId): PublicTranscript | null =>
  readOptional<PublicTranscript>(`transcripts/${id}.json`);
/** Search text (English or Yiddish), never for display. */
export const loadSearchDoc = (id: ItemId): SearchDoc | null => readOptional<SearchDoc>(`search/${id}.json`);
/** Public versions of data/indexes: serials, story_groups, series. Shapes as in data/indexes (excluded items removed). */
export const loadIndex = (name: "serials" | "story_groups" | "series"): unknown =>
  readOptional<unknown>(`indexes/${name}.json`);
/** Lost radio episodes (catalog titles and estimated dates; no visitor names). */
export const loadLostEpisodes = (): LostEpisodes => read<LostEpisodes>("indexes/lost_episodes.json");

/** Label lookup for any vocabulary id: label("topics", "emunah"). Unknown ids return the id. */
export function vocabLabel(list: string, id: string): string {
  const v = loadVocab();
  return v.lists[list]?.find((e) => e.id === id)?.label ?? id;
}

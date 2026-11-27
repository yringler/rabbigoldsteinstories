/**
 * Build time only (Node; imported from .astro frontmatter and tests, never from client scripts):
 * resolves the Yiddish shelf's reviewed ids (../yiddish-shelf.ts) against the public dataset via
 * @goldstein/data/load. The result is written into the home page as JSON (public titles, URLs,
 * times and advisory labels only). Never reads transcripts or search text.
 *
 * The build fails if a listed id resolves to something unfit for bedtime (design §3.2). An id that
 * is missing from the public catalog (unpublished since) is dropped with a warning: that is how a
 * `hide` decision takes a story off the shelf at the next site build.
 */
import type { CatalogEntry, ContentType, AudienceLevel } from "@goldstein/data";
import { loadCatalog, loadItem, loadVocab } from "@goldstein/data/load";
import type { PlaylistItem } from "@goldstein/playlists";
import { CONFIRMED_NARRATORS, END_OVERRIDES, SHELF_IDS } from "../yiddish-shelf.ts";

const CONTENT_TYPES: ReadonlySet<ContentType> = new Set(["story", "lesson_with_story"]);
const KID_LEVELS: ReadonlySet<AudienceLevel> = new Set([
  "young_children",
  "children",
  "older_children",
]);
const MIN_SEC = 3 * 60;
const MAX_SEC = 45 * 60;
const MAX_AGE = 8;

/** Why an entry may not be on the shelf, or null when it may. */
export function unfitReason(e: CatalogEntry, startSec: number, endSec: number): string | null {
  if (e.language !== "yi") return `language is ${e.language}`;
  if (!CONTENT_TYPES.has(e.content_type)) return `content_type is ${e.content_type}`;
  if (!KID_LEVELS.has(e.level)) return `level is ${e.level}`;
  if (e.age_min > MAX_AGE) return `age_min is ${e.age_min}`;
  if (e.max_advisory === "strong") return "has a strong advisory";
  if (!e.preferred_copy) return "is not the preferred copy";
  const len = endSec - startSec;
  if (len < MIN_SEC || len > MAX_SEC) return `plays ${Math.round(len / 60)} min (3–45 allowed)`;
  return null;
}

let cached: PlaylistItem[] | null = null;

/** The shelf's items in listed order (body, then tail). Memoized per build. */
export function resolveShelf(ids: readonly string[] = SHELF_IDS): PlaylistItem[] {
  if (cached && ids === SHELF_IDS) return cached;
  const byId = new Map(loadCatalog().map((e) => [e.id, e]));
  const advisoryLabel = new Map(
    (loadVocab().lists["content_advisory"] ?? []).map((v) => [v.id, v.label]),
  );
  const out: PlaylistItem[] = [];
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) {
      console.warn(`[bedtime] Yiddish shelf: ${id} is not in the public catalog; dropped.`);
      continue;
    }
    const item = loadItem(id);
    const start = item.content_start_sec;
    const override = END_OVERRIDES[id];
    if (override !== undefined && (override <= start || override > item.content_end_sec))
      throw new Error(`Yiddish shelf: END_OVERRIDES[${id}] = ${override} is outside the content`);
    const end = override ?? item.content_end_sec;
    const why = unfitReason(e, start, end);
    if (why) throw new Error(`Yiddish shelf: ${id} (${e.title}) ${why}; fix SHELF ids.`);
    out.push({
      id,
      unit: id,
      title: e.title,
      narrator: CONFIRMED_NARRATORS[e.speakers[0] ?? ""] ?? null,
      audio_url: e.url,
      ...(e.clean_url ? { clean_audio_url: e.clean_url } : {}),
      mime_type: "audio/mpeg",
      start_sec: start,
      end_sec: end,
      duration_sec: Math.round((end - start) * 1000) / 1000,
      age_min: e.age_min,
      band: null,
      advisories: item.audience.advisories.map((a) => ({
        flag: a.flag,
        label: advisoryLabel.get(a.flag) ?? a.flag,
        severity: a.severity,
      })),
      block: null,
    });
  }
  if (ids === SHELF_IDS) cached = out;
  return out;
}

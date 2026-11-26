/**
 * Small shared helpers. Each site chooses its own item URLs (the paths are in
 * packages/config/src/sites.ts so cross-site links work); `slug` is offered for sites that want
 * readable URLs, and always ends with the stable id (idFromSlug), so old links can be resolved.
 */
import type { ItemId } from "./types.ts";

export function slugify(text: string, maxLen = 60): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  return cut.slice(0, Math.max(cut.lastIndexOf("-"), 20)).replace(/-+$/, "");
}

export function itemSlug(title: string, id: ItemId): string {
  const base = slugify(title);
  return base ? `${base}-${id}` : id;
}

export function idFromSlug(slug: string): ItemId | null {
  const m = /(?:^|-)([0-9a-f]{10})\/?$/.exec(slug);
  return m ? (m[1] as string) : null;
}

/** 1:02:03 / 4:05 */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** R2 key prefixes of the original audio and of the AI-cleaned copies (docs/design/ai-audio.md). */
export const AUDIO_PREFIX = "goldstein/audio/";
export const CLEAN_AUDIO_PREFIX = "goldstein/audio_clean/";

/**
 * Cleaned-copy URL for an original audio URL (same host, goldstein/audio/ → goldstein/audio_clean/).
 * Replaces the first "/goldstein/audio/" path segment only, so the rest of the path keeps the
 * original's percent-encoding (and any `#t=` media fragment). Returns the input unchanged when it has
 * no such segment. Only use it for items the dataset marks as having a clean copy
 * (`media.clean_url`, `CatalogEntry.clean_url`), otherwise the URL may 404.
 */
export function cleanUrlOf(url: string): string {
  return url.replace(`/${AUDIO_PREFIX}`, `/${CLEAN_AUDIO_PREFIX}`);
}

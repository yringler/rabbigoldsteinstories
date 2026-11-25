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

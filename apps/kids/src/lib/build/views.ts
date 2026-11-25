/** View helpers shared by the Astro pages (build time). */
import type { Track } from "@goldstein/player";
import { type Kind, type Variant, VARIANTS, minutes } from "../kinds.ts";
import { cardHtml, escapeHtml as esc, type CardOpts } from "../records.ts";
import type { Serial } from "../serials.ts";
import { itemTrack, type PlayRequest } from "../tracks.ts";
import { ui } from "../ui-icons.ts";
import { type KItem, type Model, capPerVariant, getModel, recOf } from "./model.ts";

export const card = (k: KItem, o: CardOpts = {}): string => cardHtml(recOf(k), o);

export function cards(list: readonly KItem[]): string {
  return list.map((k) => card(k)).join("");
}

/** A capped shelf: at most `cap` cards per variant. */
export function shelfCards(list: readonly KItem[], cap = 12): string {
  return capPerVariant(list, cap)
    .map(({ k, vis }) => card(k, { vis }))
    .join("");
}

export function trackOf(k: KItem, range?: { start_sec: number; end_sec: number }): Track {
  const it = k.item;
  return itemTrack(
    {
      id: k.id,
      title: k.title,
      url: it.media.url,
      start: it.content_start_sec,
      end: it.content_end_sec < it.duration_sec ? it.content_end_sec : undefined,
      byline: k.byline,
    },
    range,
  );
}

export const playAttr = (req: PlayRequest): string => JSON.stringify(req);

/** A serial is in a variant only if every present chapter is (§4.4). */
export function serialVis(s: Serial, m: Model = getModel()): Variant[] {
  const ks = s.chapters
    .map((c) => (c.id ? m.items.get(c.id) : undefined))
    .filter((k): k is KItem => Boolean(k));
  if (ks.length === 0) return [];
  return VARIANTS.filter((v) => ks.every((k) => k.vis.includes(v)));
}

/** Story-only tracks of a serial (radio: the story ranges; sets: whole items). */
export function serialTracks(s: Serial, storyOnly: boolean, m: Model = getModel()): Track[] {
  const out: Track[] = [];
  for (const c of s.chapters) {
    const k = c.id ? m.items.get(c.id) : undefined;
    if (!k) continue;
    if (storyOnly && c.story.length > 0)
      for (const r of c.story) out.push({ ...trackOf(k, r), title: c.title });
    else out.push(trackOf(k));
  }
  return out;
}

export function serialSeconds(s: Serial, m: Model = getModel()): number {
  let sec = 0;
  for (const c of s.chapters) {
    const k = c.id ? m.items.get(c.id) : undefined;
    if (!k) continue;
    sec += c.story.length > 0 ? c.story.reduce((a, r) => a + (r.end_sec - r.start_sec), 0) : k.dur;
  }
  return sec;
}

export function serialCard(s: Serial, vis: readonly Variant[]): string {
  const present = s.chapters.filter((c) => c.id).length;
  const word = s.type === "set" ? "parts" : "chapters";
  return (
    `<a class="card serial-card" href="/serial/${s.key}/" data-serial="${esc(s.key)}" data-vis="${vis.join(" ")}">` +
    `<span class="cv stack"><img src="/covers/serial/${esc(s.key)}.svg" alt="" width="180" height="180" loading="lazy" decoding="async"><span class="bdg"></span></span>` +
    `<span class="ct" title="${esc(s.title)}">${esc(s.title)}</span>` +
    `<span class="cm">${ui("serial", "km", 18)}${s.chapters.length} ${word}${present < s.chapters.length ? "" : ""} · ${minutes(serialSeconds(s))}</span></a>`
  );
}

/** Serials sorted by chapter count (desc), then title. */
export function sortedSerials(m: Model = getModel()): Serial[] {
  return [...m.serials]
    .filter((s) => s.chapters.some((c) => c.id))
    .sort((a, b) => b.chapters.length - a.chapters.length || a.title.localeCompare(b.title));
}

export const SECTION_KINDS: readonly { kind: Kind; title: string }[] = [
  { kind: "story", title: "Stories" },
  { kind: "short", title: "Quick Listens" },
  { kind: "show", title: "Radio Shows" },
];

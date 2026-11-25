/**
 * kids/index.json: one compact record per kid-pool item (docs/sites/kids.md §9), and the card markup
 * shared by the static pages and the client (so a card looks the same wherever it is drawn).
 * Browser-safe.
 */
import { type Adv, type Kind, KIND_LABEL, minutes, variantsOf } from "./kinds.ts";
import { ui } from "./ui-icons.ts";

export interface Rec {
  id: string;
  /** Title. */
  t: string;
  k: Kind;
  /** Playable seconds (content end − content start). */
  d: number;
  /** age_min. */
  a: number;
  /** Highest advisory: 0 none, 1 mild, 2 moderate. */
  v: Adv;
  /** Audio URL (media.url). */
  u: string;
  /** Content start / end (only when not 0 / the file end). */
  s?: number;
  e?: number;
  /** Byline: 0 Uncle Yossi, 1 Rabbi Chaim Levi Goldstein. */
  b?: 0 | 1;
  /** Episode number (shows). */
  ep?: number;
  /** Chapter or part numeral. */
  ch?: number;
  /** Serial / set key (chapter stories). */
  sk?: string;
  /** Story-of-the-Day eligible (§6.4, before banding). */
  sd?: 1;
  /** Story-of-the-Day rank: position in the pool ordered by sha256(id). */
  r: number;
  /** Calendar ids (coming-up shelves, seasonal Story of the Day). */
  c?: string[];
  /** Parsha ids. */
  p?: string[];
  /** Story start (shows: "Jump to the story"). */
  js?: number;
  /** Has an AI-cleaned copy (URL derived with cleanUrlOf(u)); `c` is taken by the calendar ids. */
  cl?: 1;
}

export interface KidsIndex {
  version: 1;
  items: Rec[];
  /** Serials for "Next: Chapter 3" on Home: key → title, chapter ids in order (null = missing). */
  serials: Record<string, { t: string; ids: (string | null)[] }>;
}

export const BYLINE_NAMES = ["Uncle Yossi", "Rabbi Chaim Levi Goldstein"] as const;

export const KIND_UI_ICON: Readonly<Record<Kind, string>> = {
  show: "radio",
  story: "stories",
  short: "quick",
  event: "mic",
  song: "note",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export { esc as escapeHtml };

export const itemPath = (id: string) => `/listen/${id}/`;
export const coverPath = (id: string) => `/covers/${id}.svg`;

export interface CardOpts {
  /** Override the variants this card is shown in (shelves cap per variant). */
  vis?: readonly string[];
  /** Extra classes. */
  cls?: string;
  /** Lazy-load the cover (default true). */
  lazy?: boolean;
  /** Small label above the title, e.g. "Next: Chapter 3". */
  kicker?: string;
  /** Filter keys (single-select chips on grid pages). */
  f?: readonly string[];
}

/** The card (§6.2): cover, 2-line title, duration plus kind icon; badges are added on the client. */
export function cardHtml(r: Rec, o: CardOpts = {}): string {
  const vis = (o.vis ?? variantsOf(r.a, r.v)).join(" ");
  const lazy = o.lazy === false ? "" : ` loading="lazy" decoding="async"`;
  const adv = r.v === 2 ? `<span class="adv-i" title="Has a note for grown-ups">i</span>` : "";
  const kicker = o.kicker ? `<span class="kicker">${esc(o.kicker)}</span>` : "";
  const f = o.f && o.f.length ? ` data-f="${esc(o.f.join(" "))}"` : "";
  return (
    `<a class="card${o.cls ? ` ${o.cls}` : ""}" href="${itemPath(r.id)}" data-id="${r.id}" data-vis="${vis}" data-d="${Math.round(r.d)}" data-t="${esc(r.t.toLowerCase())}"${f}>` +
    `<span class="cv"><img src="${coverPath(r.id)}" alt="" width="180" height="180"${lazy}>${adv}<span class="bdg"></span><span class="pbar"><i></i></span></span>` +
    `${kicker}<span class="ct" title="${esc(r.t)}">${esc(r.t)}</span>` +
    `<span class="cm">${ui(KIND_UI_ICON[r.k], "km", 18)}<span class="sr">${KIND_LABEL[r.k]}, </span>${minutes(r.d)}</span></a>`
  );
}

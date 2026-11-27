/** Small HTML builders shared by pages (browser-safe). */
import { iconSvg } from "./icons.ts";
import { type Variant, VARIANTS } from "./kinds.ts";
import { escapeHtml as esc } from "./records.ts";
import { tilePath, type Tile } from "./tiles.ts";

const lum = (hex: string): number => {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};
const darken = (hex: string, f: number): string => {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
export const INK = "#22304A";
/**
 * Tile colours with readable text (WCAG 4.5:1): ink text on bright colours, white on dark ones, and
 * a colour darkened step by step until white text passes when neither does.
 */
export function readableTile(color: string): { bg: string; fg: string } {
  if (contrast(color, "#FFFFFF") >= 4.5) return { bg: color, fg: "#FFFFFF" };
  if (contrast(color, INK) >= 4.5) return { bg: color, fg: INK };
  let c = color;
  for (let i = 0; i < 20 && contrast(c, "#FFFFFF") < 4.5; i++) c = darken(c, 0.94);
  return { bg: c, fg: "#FFFFFF" };
}

/**
 * One span per distinct count, listing the variants that share it; CSS shows only the active one
 * ("47 stories" changes with the band and the language).
 */
export function vcount(
  counts: Readonly<Record<Variant, number>>,
  word: (n: number) => string,
): string {
  const by = new Map<number, Variant[]>();
  for (const v of VARIANTS) {
    const n = counts[v] ?? 0;
    const l = by.get(n);
    if (l) l.push(v);
    else by.set(n, [v]);
  }
  return [...by]
    .map(([n, vs]) => `<span data-vis="${vs.join(" ")}">${esc(word(n))}</span>`)
    .join("");
}

export interface TileOpts {
  vis?: readonly Variant[];
  counts?: Readonly<Record<Variant, number>>;
  /** Override the link (heroes use /hero/<id>/). */
  href?: string;
  cls?: string;
}

/** A large square tile: icon disk, kid label, Hebrew term (midos), item count for the band. */
export function tileHtml(
  t: Pick<Tile, "slug" | "label" | "facet" | "icon" | "color" | "he">,
  o: TileOpts = {},
): string {
  const vis = o.vis ? ` data-vis="${o.vis.join(" ")}"` : "";
  const count = o.counts ? `<span class="tc">${vcount(o.counts, (n) => String(n))}</span>` : "";
  const { bg, fg } = readableTile(t.color);
  return (
    `<a class="tile${o.cls ? ` ${o.cls}` : ""}" href="${o.href ?? tilePath(t)}" style="--c:${bg};--fg:${fg}"${vis}>` +
    `<span class="ti">${iconSvg(t.icon, { accent: "#FFC83D" }, 44)}</span>` +
    `<span class="tl">${esc(t.label)}${t.he ? `<span class="th">${esc(t.he)}</span>` : ""}</span>${count}</a>`
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Renders the PWA icons and the Media Session artwork tiles (bedtime.md §3 "The same tiles are
// exported as 512 px PNGs") from the SVG icon family in src/lib/ui.ts. Run by hand after changing
// an icon, then commit public/icons/*.png:
//   npx tsx apps/bedtime/scripts/make-icons.mjs      (needs Playwright + Chromium installed)
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { moonSvg, TYPES, YIDDISH_UI } from "../src/lib/ui.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "icons");
mkdirSync(out, { recursive: true });

const BG = "#0B1026";
const SURFACE = "#151B3D";
const GOLD = "#F4C56A";

const stars = (n, seed) => {
  let s = seed;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: n }, () => {
    const x = (r() * 100).toFixed(1);
    const y = (r() * 100).toFixed(1);
    const z = (0.4 + r() * 0.7).toFixed(2);
    const o = (0.25 + r() * 0.45).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${z}" fill="#F3ECDD" opacity="${o}"/>`;
  }).join("");
};

/** A playlist tile: the type's icon glowing in its colour on the night sky. */
function tile(t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${SURFACE}"/><stop offset="1" stop-color="${BG}"/></radialGradient>
    <radialGradient id="h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${t.color}" stop-opacity=".22"/><stop offset="1" stop-color="${t.color}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#g)"/>${stars(18, t.type.length * 31)}
    <circle cx="50" cy="50" r="34" fill="url(#h)"/>
    <g transform="translate(22 22) scale(1.1667)" fill="none" stroke="${t.color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${t.icon}</g>
  </svg>`;
}

/** The app icon: a gold moon among stars. `pad` shrinks the art for maskable icons. */
function app(pad = 0) {
  const s = 1 - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs><radialGradient id="g" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#1D2557"/><stop offset="1" stop-color="${BG}"/></radialGradient>
    <radialGradient id="m" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${GOLD}" stop-opacity=".28"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#g)"/>${stars(22, 11)}
    <g transform="translate(${50 - 50 * s} ${50 - 50 * s}) scale(${s})">
      <circle cx="50" cy="50" r="38" fill="url(#m)"/>
      <g transform="translate(19 19) scale(1.3)">${moonSvg(GOLD, 0.25)}</g>
    </g>
  </svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${BG}">${svg}</body></html>`);
  writeFileSync(join(out, file), await page.screenshot({ type: "png" }));
}
for (const t of [...TYPES, YIDDISH_UI]) await render(tile(t), 512, `${t.type}-512.png`);
await render(app(), 512, "app-512.png");
await render(app(), 192, "app-192.png");
await render(app(), 180, "app-180.png");
await render(app(0.1), 512, "maskable-512.png");
await browser.close();
writeFileSync(
  join(here, "..", "public", "favicon.svg"),
  app().replace('width="100%" height="100%"', 'width="64" height="64"'),
);
console.log(`icons written to ${out}`);

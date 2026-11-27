/**
 * The language setting in the built site (docs/design/language-library.md, criteria 29–33).
 * Runs only when apps/library/dist exists (after `npm run build`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { rows, usageLangs, vocab } from "../src/lib/site-data.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");
const page = (p: string) => readFileSync(join(DIST, p, "index.html"), "utf8");

/** Every run of Hebrew-script letters outside tags must sit in an element with lang + dir="rtl". */
function unmarkedHebrew(html: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  const VOID = new Set(["input", "br", "img", "meta", "link", "hr", "source", "path", "circle"]);
  for (const m of html.matchAll(re)) {
    if (m[2]) {
      const tag = m[2].toLowerCase();
      if (m[1]) stack.pop();
      else if (!VOID.has(tag) && !(m[3] ?? "").endsWith("/")) stack.push(m[3] ?? "");
    } else if (m[4] && /[֐-׿]/.test(m[4])) {
      const marked = stack.some((a) => /\blang="(yi|he)"/.test(a) && /\bdir="rtl"/.test(a));
      if (!marked) out.push(m[4].trim().slice(0, 40));
    }
  }
  return out;
}

describe.runIf(existsSync(join(DIST, "r")))("language setting in dist/", () => {
  it("29. every page sets html[data-lang-pref] before first paint and has the control", () => {
    for (const p of ["", "search", "people", "help", "about", "series"]) {
      const html = page(p);
      expect(html, p).toContain("goldstein:library:lang");
      expect(html, p).toContain("dataset.langPref");
      expect(html.indexOf("dataset.langPref"), p).toBeLessThan(html.indexOf("<body"));
      expect(html, p).toContain('name="lang-pref-header"');
    }
    for (const p of ["help", "about"]) expect(page(p)).toContain(`name="lang-pref-${p}"`);
  });

  it("33. the control's Hebrew-script run carries lang=yi dir=rtl", () => {
    const html = page("");
    const ctl = html.slice(html.indexOf('<details class="lang-ctl"'));
    const block = ctl.slice(0, ctl.indexOf("</details>"));
    expect(block).toContain('<span lang="yi" dir="rtl">אידיש</span>');
    expect(unmarkedHebrew(block)).toEqual([]);
    for (const p of ["help", "about"]) {
      const h = page(p);
      const at = h.indexOf('class="lang-inline"');
      expect(unmarkedHebrew(h.slice(at, h.indexOf("</fieldset>", at)))).toEqual([]);
    }
    // The home card's Yiddish word too.
    const home = page("");
    const card = home.slice(home.indexOf('href="/search/?lang=yi"'));
    expect(unmarkedHebrew(card.slice(0, card.indexOf("</a>")))).toEqual([]);
  });

  it("32. /people/ marks every person and notes the hidden ones per setting", () => {
    const html = page("people");
    expect(html).toContain("data-lang-scope");
    const langs = usageLangs("people");
    const yiOnly = [...langs.values()].filter((l) => !l.includes("en")).length;
    expect(html).toContain(
      `${yiOnly} people with no English recording are hidden by your language setting (English).`,
    );
    expect(html).toContain('data-action="lang-reveal"');
    // A Yiddish-only person's page is never emptied under English.
    const one = (vocab().lists["people"] ?? []).find(
      (p) => !p.unconfirmed && (langs.get(p.id) ?? []).join() === "yi",
    );
    if (one) expect(page(`people/${one.id}`)).toMatch(/data-lang-empty="en"/);
  });

  it("32. collection and recording pages are never narrowed", () => {
    const tanya = rows().find((r) => r.series === "tanya_yiddish_goldstein" && r.preferred);
    const pages = ["series", "study", "serials", "radio", "my-playlists"];
    if (tanya) pages.push(`r/${tanya.id}`, `series/${tanya.series}`);
    for (const p of pages) expect(page(p), p).not.toContain("data-lang-scope");
    const groups = readdirSync(join(DIST, "stories")).filter((d) => !d.endsWith(".html"));
    for (const g of groups.slice(0, 10))
      expect(page(`stories/${g}`), g).not.toContain("data-lang-scope");
  });

  it("33. Yiddish recordings show no transcript; the unconfirmed narrator is never linked", () => {
    const yi = rows().filter((r) => r.lang === "yi" && r.preferred);
    for (const r of yi.slice(0, 20)) {
      const html = page(`r/${r.id}`);
      expect(html, r.id).toContain("This recording is in Yiddish");
      expect(existsSync(join(DIST, "t", `${r.id}.json`)), r.id).toBe(false);
    }
    expect(existsSync(join(DIST, "people", "yiddish_narrator_unconfirmed"))).toBe(false);
    const html = page(
      `r/${yi.find((r) => r.speakers.includes("yiddish_narrator_unconfirmed"))?.id}`,
    );
    expect(html).not.toMatch(/href="[^"]*yiddish_narrator_unconfirmed/);
  });

  it("the home page has the static 'In Yiddish' card", () => {
    expect(page("")).toMatch(/href="\/search\/\?lang=yi"/);
  });
});

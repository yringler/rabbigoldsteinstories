/**
 * Checks on the built site (bedtime.md criteria 28–31, docs/design/language-bedtime.md §7). Runs
 * only when apps/bedtime/dist exists, i.e. after `npm run build` (in CI: after the build step).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSearchDoc } from "@goldstein/data/load";
import { describe, expect, it } from "vitest";
import { resolveShelf } from "../src/lib/build/yiddish.ts";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const built = existsSync(join(dist, "index.html"));
if (!built) console.warn("dist.test: apps/bedtime/dist not built; skipping.");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const TEXT = /\.(html|js|mjs|css|json|webmanifest|svg|txt|xml)$/;
const HEBREW = /[֐-׿]/;

describe.skipIf(!built)("the built site", () => {
  const all = built ? files(dist).filter((f) => TEXT.test(f)) : [];
  const read = (f: string) => readFileSync(f, "utf8");
  const pages = all.filter((f) => f.endsWith(".html"));

  it("never renders an unconfirmed label", () => {
    for (const f of all) expect(read(f), f).not.toMatch(/name unconfirmed|_unconfirmed/i);
  });

  it('has Hebrew-script text only inside lang="yi" elements', () => {
    for (const f of pages) {
      const outside = read(f).replace(/<(\w+)\b[^>]*\blang="yi"[^>]*>[^<]*<\/\1>/g, "");
      expect(HEBREW.test(outside), `${f} has Hebrew-script text outside lang="yi"`).toBe(false);
    }
  });

  it("carries the shelf the build resolved, on the home page only", () => {
    const shelf = resolveShelf();
    const home = read(join(dist, "index.html"));
    const m = /<script type="application\/json" id="yiddish-shelf">([\s\S]*?)<\/script>/.exec(home);
    if (shelf.length === 0) {
      expect(m).toBeNull();
      return;
    }
    expect(JSON.parse(m![1]!)).toEqual(shelf);
    for (const f of pages.filter((p) => p !== join(dist, "index.html")))
      expect(read(f)).not.toContain('id="yiddish-shelf"');
  });

  it("contains no Yiddish transcript or search text", () => {
    const text = all.map(read).join("\n");
    for (const i of resolveShelf()) {
      const lines = (loadSearchDoc(i.id)?.lines ?? [])
        .map((l) => l[1])
        .filter((t) => t.length > 24);
      for (const t of lines) expect(text.includes(t), `search text of ${i.id} in dist`).toBe(false);
    }
  });

  it("puts the Yiddish slots first and after Radio Night, in DOM order", () => {
    if (resolveShelf().length === 0) return;
    const home = read(join(dist, "index.html"));
    const first = home.indexOf('data-yiddish-slot="first"');
    const last = home.indexOf('data-yiddish-slot="last"');
    const radio = home.indexOf('data-card="radio"');
    const mix = home.indexOf('data-card="mix"');
    expect(first).toBeGreaterThan(-1);
    expect(radio).toBeGreaterThan(-1);
    expect(first).toBeLessThan(mix);
    expect(last).toBeGreaterThan(radio);
  });

  it("keeps the English-only page as the default (no data-lang in the static HTML)", () => {
    const home = read(join(dist, "index.html"));
    expect(home).not.toMatch(/<html[^>]*data-lang=/);
    expect(home).toMatch(/<input type="radio" name="lang" value="en" checked/);
  });
});

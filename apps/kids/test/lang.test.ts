/**
 * Language preference (docs/design/language-kids.md §5, §6.1): the 18 variants, the visibility
 * truth table, the CSS hide rules, the pre-paint script, Home's Yiddish shelves, "Hear it in…" and
 * the three "More like this" lists.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_YI_IN_ANY, MORE_LIKE, getModel, visibleIn } from "../src/lib/build/model.ts";
import { yiddishGroups } from "../src/lib/build/lang.ts";
import {
  BANDS,
  LANGS,
  VARIANTS,
  inVariant,
  variantBand,
  variantGentle,
  variantLang,
  variantOf,
  variantsOfLang,
  withoutGentle,
} from "../src/lib/kinds.ts";
import {
  YI_SHELF_MIN,
  YI_TILE_MIN,
  shelfMin,
  tileMin,
  SHELF_MIN,
  TILE_MIN,
} from "../src/lib/tiles.ts";
import * as S from "../src/scripts/state.ts";

const m = getModel();
const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

describe("variants (§5.1)", () => {
  it("18 variants round-trip through variantOf / variantBand / variantGentle / variantLang", () => {
    expect(VARIANTS).toHaveLength(18);
    expect(new Set(VARIANTS).size).toBe(18);
    for (const b of BANDS)
      for (const g of [false, true])
        for (const l of LANGS) {
          const v = variantOf(b, g, l);
          expect(VARIANTS).toContain(v);
          expect([variantBand(v), variantGentle(v), variantLang(v)]).toEqual([b, g, l]);
          expect(withoutGentle(v)).toBe(variantOf(b, false, l));
        }
  });

  it("English keeps exactly the six tokens it had before languages existed", () => {
    expect(variantsOfLang("en")).toEqual(["l", "k", "b", "lg", "kg", "bg"]);
    expect(VARIANTS.slice(0, 6)).toEqual(["l", "k", "b", "lg", "kg", "bg"]);
    expect(variantOf("kids", false)).toBe("k");
  });

  it("inVariant truth table: band × gentle × preference × item language", () => {
    for (const v of VARIANTS) {
      for (const age of [3, 5, 6, 9])
        for (const adv of [0, 1, 2] as const)
          for (const il of ["en", "yi"] as const) {
            const pref = variantLang(v);
            const langOk = pref === "any" || pref === il;
            const bandOk = inVariant(age, adv, variantOf(variantBand(v), variantGentle(v), il), il);
            expect(inVariant(age, adv, v, il)).toBe(langOk && bandOk);
          }
    }
    expect(inVariant(4, 0, "k-y", "yi")).toBe(true);
    expect(inVariant(4, 0, "k", "yi")).toBe(false);
    expect(inVariant(4, 0, "k-y", "en")).toBe(false);
    expect(inVariant(4, 0, "k-a", "en")).toBe(true);
    expect(inVariant(4, 1, "kg-a", "yi")).toBe(false);
  });

  it("global.css has exactly one hide rule per variant", () => {
    const css = read("src/styles/global.css");
    const rules = [
      ...css.matchAll(/html\[data-v="([^"]+)"\] \[data-vis\]:not\(\[data-vis~="([^"]+)"\]\)/g),
    ];
    expect(rules.map((r) => r[1])).toEqual([...VARIANTS]);
    for (const r of rules) expect(r[1]).toBe(r[2]);
  });

  it("minimums: Yiddish tiles need 3, Yiddish shelves 1; other modes as before", () => {
    expect(tileMin("k")).toBe(TILE_MIN);
    expect(tileMin("k-a")).toBe(TILE_MIN);
    expect(tileMin("k-y")).toBe(YI_TILE_MIN);
    expect(shelfMin("bg-y")).toBe(YI_SHELF_MIN);
    expect(shelfMin("b")).toBe(SHELF_MIN);
  });
});

describe("pre-paint script in Base.astro (§3.3)", () => {
  const src = read("src/layouts/Base.astro");
  const code = /<script is:inline data-prepaint>([\s\S]*?)<\/script>/.exec(src)?.[1] ?? "";

  function run(stored: Record<string, unknown>, search = "", throws = false) {
    const ds: Record<string, string> = {};
    const documentElement = { dataset: ds, classList: { add: () => undefined } };
    const localStorage = {
      getItem: (k: string) => {
        if (throws) throw new Error("blocked");
        const v = stored[k.replace("goldstein:kids:", "")];
        return v === undefined ? null : JSON.stringify({ v });
      },
    };
    new Function("localStorage", "location", "document", "URLSearchParams", code)(
      localStorage,
      { search },
      { documentElement },
      URLSearchParams,
    );
    return ds;
  }

  it("exists", () => expect(code.length).toBeGreaterThan(100));

  it("agrees with variantOf for all 18 stored combinations", () => {
    for (const b of BANDS)
      for (const g of [false, true])
        for (const l of LANGS) {
          const ds = run({ band: b, gentle: g, lang: l });
          expect(ds["v"]).toBe(variantOf(b, g, l));
          expect(ds["lang"]).toBe(l);
          expect(ds["band"]).toBe(b);
        }
  });

  it("?lang wins over the stored value; invalid values and blocked storage fall back", () => {
    expect(run({ band: "big", lang: "en" }, "?tab=x&lang=yi")["v"]).toBe("b-y");
    expect(run({ lang: "any" }, "?lang=fr")["v"]).toBe("k-a");
    expect(run({ lang: "klingon" })["v"]).toBe("k");
    expect(run({}, "", true)["v"]).toBe("k");
    expect(run({}, "?lang=any", true)["v"]).toBe("k-a");
  });
});

describe("state (§5.5)", () => {
  it("defaults to English, validates, and composes the variant", () => {
    expect(S.getLang()).toBe("en");
    S.store.set("lang", "fr");
    expect(S.getLang()).toBe("en");
    S.store.set("lang", "yi");
    expect(S.getLang()).toBe("yi");
    expect(S.getVariant()).toBe(variantOf(S.getBand(), S.getGentle(), "yi"));
    S.store.remove("lang");
    expect(S.getLang()).toBe("en");
  });
});

describe("Home and /yiddish/ shelves (§4.1, §4.5)", () => {
  const groups = yiddishGroups(m);
  it("groups cover all 18 Yiddish items exactly once", () => {
    const ids = groups.flatMap((g) => g.items.map((k) => k.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(m.poolYi.map((k) => k.id)));
    const n = Object.fromEntries(groups.map((g) => [g.key, g.items.length]));
    expect(n).toEqual({ bubby: 8, stories: 4, pesach: 5, more: 1 });
  });

  it("Yiddish shelves meet YI_SHELF_MIN in every Yiddish variant they show in", () => {
    for (const g of groups)
      for (const v of visibleIn(g.items, YI_SHELF_MIN).filter((x) => variantLang(x) === "yi"))
        expect(g.items.filter((k) => k.vis.includes(v)).length).toBeGreaterThanOrEqual(1);
  });

  it("the built Home page: note card only in -y, Quick Listens and playlists hidden in -y, link card only in English", () => {
    let html: string;
    try {
      html = read("dist/index.html");
    } catch {
      return; // not built yet (npm test runs before the build)
    }
    const vis = (cls: string) =>
      new RegExp(`class="[^"]*${cls}[^"]*"[^>]*data-vis="([^"]+)"`).exec(html)?.[1]?.split(" ") ??
      new RegExp(`data-vis="([^"]+)"[^>]*class="[^"]*${cls}`).exec(html)?.[1]?.split(" ") ??
      null;
    expect(vis("home-yi-note")).toEqual(variantsOfLang("yi"));
    expect(vis("lang-link-card")).toEqual(variantsOfLang("en"));
    for (const cls of ["playlists-shelf", "home-quick"]) {
      const v = vis(cls);
      expect(v, cls).not.toBeNull();
      expect(v?.some((x) => x.endsWith("-y"))).toBe(false);
    }
  });
});

describe("Hear it in… and More like this (§4.6, §5.3)", () => {
  const yi = new Set(m.poolYi.map((k) => k.id));
  it("7 Yiddish items have an English telling in the pool; twins are the other language", () => {
    expect(m.poolYi.filter((k) => (m.twinsOf.get(k.id) ?? []).length > 0)).toHaveLength(7);
    for (const [id, l] of m.twinsOf) {
      const k = m.items.get(id);
      for (const x of l) {
        expect(m.poolIds.has(x)).toBe(true);
        expect(m.items.get(x)?.lang).not.toBe(k?.lang);
      }
    }
  });

  it("'Hear this story told another way' stays in the item's own language", () => {
    for (const [id, g] of m.storyGroupOf)
      for (const x of g.others) expect(m.items.get(x)?.lang).toBe(m.items.get(id)?.lang);
  });

  it("English lists are exactly the English-only run; Yiddish lists hold only Yiddish ids", () => {
    for (const k of m.pool) {
      const r = m.relatedByLang.get(k.id);
      expect(r).toBeDefined();
      if (!r) continue;
      expect(r.en).toEqual(m.sim.related.get(k.id) ?? []);
      for (const x of r.en) expect(yi.has(x)).toBe(false);
      for (const x of r.yi) expect(yi.has(x)).toBe(true);
      expect(r.yi.length).toBeLessThanOrEqual(MORE_LIKE);
      if (k.lang === "en")
        expect(r.any.slice(0, MORE_LIKE).filter((x) => yi.has(x)).length).toBeLessThanOrEqual(
          MAX_YI_IN_ANY,
        );
    }
  });

  it("no list contains the source, its twin or a member of its story group", () => {
    for (const k of m.pool) {
      const r = m.relatedByLang.get(k.id);
      const twins = new Set(m.twinsOf.get(k.id) ?? []);
      const group = m.storyGroupOf.get(k.id)?.groupId;
      for (const x of [...(r?.en ?? []), ...(r?.any ?? []), ...(r?.yi ?? [])]) {
        expect(x).not.toBe(k.id);
        expect(twins.has(x), `${k.id} -> ${x}`).toBe(false);
        if (group) expect(m.storyGroupOf.get(x)?.groupId).not.toBe(group);
      }
    }
  });
});

describe("no hard-coded English-only variant lists", () => {
  it("source files build variant lists from VARIANTS, never the six pre-language codes", () => {
    // A literal ["l", "k", "b", "lg", "kg", "bg"] silently drops the "Both" variants (the serial
    // page's "for bigger kids" banner never showed in Both mode).
    const files = ["src/pages/serial/[key]/index.astro", "src/scripts/pages/home.ts"];
    for (const f of files) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/"lg",\s*"kg",\s*"bg"/);
    }
  });
});

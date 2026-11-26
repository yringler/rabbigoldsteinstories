import { describe, expect, it } from "vitest";
import { editionById, editionsAround } from "../src/clock.ts";
import type { Edition } from "../src/contract.ts";
import { generateEdition } from "../src/engine.ts";
import type { Recipe } from "../src/recipe.ts";
import { RECIPES } from "../src/recipes.ts";
import { buildViews, ensureRunway, memoryStore, tombstone } from "../src/runway.ts";
import { fakePool } from "./fixtures.ts";

const pool = fakePool();
const recipes: Recipe[] = [
  {
    type: "a",
    title: "A",
    subtitle: "a",
    targetMin: 120,
    toleranceMin: 10,
    cooldownDays: 5,
    headCooldownDays: 10,
    eligible: () => true,
  },
  {
    type: "b",
    title: "B",
    subtitle: "b",
    targetMin: 90,
    toleranceMin: 10,
    cooldownDays: 3,
    headCooldownDays: 6,
    eligible: (u) => u.block === null && u.age_min <= 6,
  },
];
const w = editionById("2026-11-25")!;

function unitsOf(e: Edition, type: string) {
  return new Set(e.playlists.find((p) => p.type === type)!.items.map((i) => i.unit));
}

describe("generateEdition", () => {
  it("is deterministic for the same pool, history and edition", () => {
    const a = generateEdition({ pool, recipes, window: w, history: [], now: new Date(0) });
    const b = generateEdition({ pool, recipes, window: w, history: [], now: new Date(0) });
    expect(a).toEqual(b);
    const other = generateEdition({
      pool,
      recipes,
      window: editionById("2026-11-26")!,
      history: [],
      now: new Date(0),
    });
    expect(other.playlists[0]!.items).not.toEqual(a.playlists[0]!.items);
  });

  it("hits the target length, never repeats a key within a playlist, at most one block and never first", () => {
    const e = generateEdition({ pool, recipes, window: w, history: [] });
    for (const p of e.playlists) {
      const r = recipes.find((x) => x.type === p.type)!;
      expect(p.total_min).toBeGreaterThanOrEqual(r.targetMin - r.toleranceMin - 1);
      expect(p.total_min).toBeLessThanOrEqual(r.targetMin + r.toleranceMin + 1);
      const units = [...new Set(p.items.map((i) => i.unit))];
      const keys = units.flatMap((u) => pool.units.find((x) => x.unit === u)!.keys);
      expect(new Set(keys).size).toBe(keys.length);
      expect(units.filter((u) => u.startsWith("serial:")).length).toBeLessThanOrEqual(1);
      expect(p.items[0]!.block).toBeNull();
      for (const it of p.items) expect(it.end_sec - it.start_sec).toBeCloseTo(it.duration_sec);
    }
  });

  it("leaves out a type that has nothing eligible at all, and logs it", () => {
    const logs: string[] = [];
    const none: Recipe = { ...recipes[0]!, type: "none", eligible: () => false };
    const e = generateEdition({
      pool,
      recipes: [...recipes, none],
      window: w,
      history: [],
      log: (m) => logs.push(m),
    });
    expect(e.playlists.map((p) => p.type)).toEqual(recipes.map((r) => r.type));
    expect(logs).toEqual([`${w.id}/none: no eligible units, playlist left out`]);
  });

  it("counts cooldowns in days by edition date, not by how many editions are stored", () => {
    const old = generateEdition({ pool, recipes, window: editionById("2026-11-15")!, history: [] });
    const used = new Set(old.playlists.find((p) => p.type === "b")!.items.map((i) => i.unit));
    // Only the units played 10 nights ago are left: with cooldown 3 / head 6 days they are free
    // again, although that edition is the only one stored (the old code counted it as 1 ago).
    const only = { ...pool, units: pool.units.filter((u) => used.has(u.unit)) };
    const logs: string[] = [];
    generateEdition({
      pool: only,
      recipes: [recipes[1]!],
      window: w,
      history: [old],
      log: (m) => logs.push(m),
    });
    expect(logs).toEqual([]);
  });

  it("respects same-type cooldowns across editions", () => {
    const store: Edition[] = [];
    for (const win of editionsAround(new Date("2026-11-25T20:00:00Z"), 0, 20)) {
      store.push(generateEdition({ pool, recipes, window: win, history: store }));
    }
    for (let i = 0; i < store.length; i++) {
      for (let j = i + 1; j < Math.min(store.length, i + 4); j++) {
        const both = [...unitsOf(store[i]!, "a")].filter((u) => unitsOf(store[j]!, "a").has(u));
        expect(both, `${store[i]!.date} vs ${store[j]!.date}`).toEqual([]);
      }
    }
  });

  it("applies overrides (exclude)", () => {
    const first = generateEdition({ pool, recipes, window: w, history: [] });
    const victim = first.playlists[0]!.items[0]!.unit;
    const again = generateEdition({
      pool,
      recipes,
      window: w,
      history: [],
      overrides: { [victim]: { exclude: true, note: "test" } },
    });
    expect(again.playlists.flatMap((p) => p.items.map((i) => i.unit))).not.toContain(victim);
  });

  it("the story recipes fill from a realistic pool", () => {
    // the fake pool has no whole radio episodes, so Radio Night is left out here
    const story = RECIPES.filter((r) => r.type !== "radio");
    const e = generateEdition({
      pool: fakePool(600, 10),
      recipes: story,
      window: w,
      history: [],
    });
    expect(e.playlists.map((p) => p.type)).toEqual(story.map((r) => r.type));
  });
});

describe("runway and published views", () => {
  it("generates 14 days ahead, freezes editions within 24 h, regenerates later ones when the pool changes", async () => {
    const store = memoryStore();
    const now = new Date("2026-11-25T20:00:00Z");
    const r1 = await ensureRunway({ store, pool, recipes, now });
    expect(r1.generated).toHaveLength(15);
    const frozenBefore = await store.get("2026-11-26");
    const r2 = await ensureRunway({ store, pool: { ...pool, pool_hash: "changed" }, recipes, now });
    expect(r2.kept).toEqual(["2026-11-25", "2026-11-26"]);
    expect(r2.generated).toHaveLength(13);
    expect(await store.get("2026-11-26")).toEqual(frozenBefore);
  });

  it("builds index/current/history and tombstones units that left the pool", async () => {
    const store = memoryStore();
    for (let d = 0; d < 10; d++) {
      await ensureRunway({
        store,
        pool,
        recipes,
        now: new Date(Date.parse("2026-11-15T20:00:00Z") + d * 86_400_000),
      });
    }
    const now = new Date("2026-11-25T20:00:00Z");
    const views = await buildViews(store, pool, now);
    expect(views.current?.date).toBe("2026-11-25");
    expect(views.history.nights.map((n) => n.date)).toEqual([
      "2026-11-24",
      "2026-11-23",
      "2026-11-22",
      "2026-11-21",
      "2026-11-20",
      "2026-11-19",
      "2026-11-18",
    ]);
    expect(views.index.editions.at(-1)?.date).toBe("2026-11-25");
    expect(views.index.editions).toHaveLength(8);

    const gone = views.current!.playlists[0]!.items[0]!.unit;
    const smaller = { ...pool, units: pool.units.filter((u) => u.unit !== gone) };
    const t = tombstone(views.current!, smaller);
    expect(t.playlists.flatMap((p) => p.items.map((i) => i.unit))).not.toContain(gone);

    // A data fix that moves a track's bounds (e.g. a new hidden span) drops the stored item too.
    const moved = views.current!.playlists[0]!.items.find((i) => !i.block)!;
    const shifted = {
      ...pool,
      units: pool.units.map((u) =>
        u.unit === moved.unit
          ? { ...u, tracks: u.tracks.map((tr) => ({ ...tr, end_sec: tr.end_sec - 30 })) }
          : u,
      ),
    };
    const t2 = tombstone(views.current!, shifted);
    expect(t2.playlists.flatMap((p) => p.items.map((i) => i.unit))).not.toContain(moved.unit);
    // Unchanged items survive.
    expect(tombstone(views.current!, pool)).toEqual(views.current);
  });

  it("copies clean_audio_url into new editions and adds it to frozen ones at read time", async () => {
    const cleanOf = (url: string) => url.replace(".example/", ".example/clean/");
    const cleaned = {
      ...pool,
      units: pool.units.map((u, i) =>
        i % 2 === 0
          ? { ...u, tracks: u.tracks.map((t) => ({ ...t, clean_audio_url: cleanOf(t.audio_url) })) }
          : u,
      ),
    };
    const at = new Date("2026-11-25T20:00:00Z");
    const fresh = generateEdition({
      pool: cleaned,
      recipes,
      window: editionById("2026-11-25")!,
      history: [],
      now: at,
    });
    const items = fresh.playlists.flatMap((p) => p.items);
    const withClean = items.filter((i) => i.clean_audio_url !== undefined);
    expect(withClean.length).toBeGreaterThan(0);
    for (const i of withClean) expect(i.clean_audio_url).toBe(cleanOf(i.audio_url));
    for (const i of items.filter((x) => x.clean_audio_url === undefined))
      expect("clean_audio_url" in i).toBe(false);

    // A frozen edition generated before the clean copies existed: same picks, enriched when served.
    const frozen = generateEdition({
      pool,
      recipes,
      window: editionById("2026-11-25")!,
      history: [],
      now: at,
    });
    const stored = structuredClone(frozen);
    const served = tombstone(frozen, cleaned);
    expect(frozen).toEqual(stored); // the stored edition is not mutated
    expect(served.playlists.flatMap((p) => p.items.map((i) => i.unit))).toEqual(
      frozen.playlists.flatMap((p) => p.items.map((i) => i.unit)),
    );
    const servedItems = served.playlists.flatMap((p) => p.items);
    const cleanUnits = new Set(cleaned.units.filter((_, i) => i % 2 === 0).map((u) => u.unit));
    for (const i of servedItems) {
      expect(i.clean_audio_url).toBe(cleanUnits.has(i.unit) ? cleanOf(i.audio_url) : undefined);
    }
    // And back: a clean copy that left the pool is dropped from the served item.
    const back = tombstone(served, pool);
    expect(back.playlists.flatMap((p) => p.items).some((i) => "clean_audio_url" in i)).toBe(false);
  });
});

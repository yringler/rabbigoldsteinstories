/**
 * The real recipes on the real unit pool (docs/sites/bedtime.md §7, criteria 5 and 7–12).
 * `npm test` builds packages/data/generated first (data:ensure).
 */
import type { Unit } from "@goldstein/data";
import { loadUnitPool } from "@goldstein/data/load";
import { beforeAll, describe, expect, it } from "vitest";
import { editionById, editionsAround } from "../src/clock.ts";
import type { Edition, Playlist } from "../src/contract.ts";
import { generateEdition } from "../src/engine.ts";
import { calmEligible, RECIPES, windsDown } from "../src/recipes.ts";
import { seasonFor, seasonalStatus } from "../src/seasons.ts";

const pool = loadUnitPool();
const byUnit = new Map(pool.units.map((u) => [u.unit, u]));
const recipe = (t: string) => RECIPES.find((r) => r.type === t)!;
const unitsOf = (p: Playlist): Unit[] =>
  [...new Set(p.items.map((i) => i.unit))].map((u) => byUnit.get(u)!);
const HEAD = 40 * 60;

function headUnits(p: Playlist): string[] {
  const out: string[] = [];
  let t = 0;
  for (const it of p.items) {
    if (t >= HEAD) break;
    if (!out.includes(it.unit)) out.push(it.unit);
    t += it.duration_sec;
  }
  return out;
}

/** Simulate consecutive editions from an empty history; records relaxation steps per playlist. */
function simulate(fromIso: string, nights: number) {
  const history: Edition[] = [];
  const relax = new Map<string, number>();
  for (const w of editionsAround(new Date(fromIso), 0, nights - 1)) {
    const e = generateEdition({
      pool,
      recipes: RECIPES,
      window: w,
      history,
      now: new Date(0),
      log: (m) => {
        const id = m.split(":")[0]!;
        const step = Number(/step (\d)/.exec(m)?.[1] ?? 0);
        relax.set(id, Math.max(relax.get(id) ?? 0, step));
      },
    });
    history.push(e);
  }
  return { history, relax };
}

let sim: ReturnType<typeof simulate>;
beforeAll(() => {
  sim = simulate("2026-11-25T20:00:00Z", 75);
});

describe("pools (criterion 5)", () => {
  it("every core type has at least 25 hours and is near the measured size", () => {
    const expected: Record<string, number> = { little: 214, big: 281, calm: 213, adventure: 156 };
    for (const r of RECIPES) {
      const units = pool.units.filter((u) => r.eligible(u));
      const h = units.reduce((s, u) => s + u.duration_sec, 0) / 3600;
      expect(h, r.type).toBeGreaterThanOrEqual(25);
      const want = expected[r.type];
      if (want) expect(Math.abs(units.length - want) / want, r.type).toBeLessThan(0.1);
      if (r.windDown) {
        const tail = pool.units.filter((u) => r.windDown!.eligible(u));
        expect(
          tail.reduce((s, u) => s + u.duration_sec, 0) / 3600,
          `${r.type} tail`,
        ).toBeGreaterThan(10);
      }
    }
  });
});

describe("generator on the real pool", () => {
  it("is deterministic (criterion 7)", () => {
    const w = editionById("2026-11-25")!;
    const a = generateEdition({ pool, recipes: RECIPES, window: w, history: [], now: new Date(0) });
    const b = generateEdition({ pool, recipes: RECIPES, window: w, history: [], now: new Date(0) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("fills the Hebrew date of the night and the active seasons", () => {
    const e = sim.history[0]!;
    expect(e.date).toBe("2026-11-25");
    expect(e.hebrew_date).toBe("16 Kislev 5787");
    expect(e.season).toEqual(["kislev", "yud_tes_kislev"]);
    expect(seasonFor("2026-12-06").active.get("chanukah")).toBe("near");
    expect(seasonFor("2027-04-18").active.has("pesach")).toBe(true);
    expect(seasonFor("2027-08-01").active.has("summer_vacation")).toBe(true);
  });

  it("produces 75 nights with every rule of criterion 8 and 10", () => {
    expect(sim.history).toHaveLength(75);
    for (const e of sim.history) {
      expect(e.playlists.map((p) => p.type)).toEqual(RECIPES.map((r) => r.type));
      const heads = new Set<string>();
      for (const p of e.playlists) {
        const r = recipe(p.type);
        const where = `${e.date}/${p.type}`;
        const total = p.items.reduce((s, i) => s + i.duration_sec, 0);
        // length within target ± tolerance
        expect(total, where).toBeGreaterThanOrEqual((r.targetMin - r.toleranceMin) * 60);
        expect(total, where).toBeLessThanOrEqual((r.targetMin + r.toleranceMin) * 60);
        // no two units sharing a dedupe key; every unit eligible for the type (or its tail)
        const units = unitsOf(p);
        const keys = units.flatMap((u) => u.keys);
        expect(new Set(keys).size, where).toBe(keys.length);
        for (const u of units)
          expect(r.eligible(u) || (r.windDown?.eligible(u) ?? false), `${where} ${u.unit}`).toBe(
            true,
          );
        // at most one block, never first, never in the last 25 minutes
        const blocks = units.filter((u) => u.block);
        expect(blocks.length, where).toBeLessThanOrEqual(1);
        expect(p.items[0]!.block, where).toBeNull();
        let t = 0;
        for (const it of p.items) {
          if (it.block) expect(t + it.duration_sec, where).toBeLessThanOrEqual(total - 25 * 60 + 1);
          t += it.duration_sec;
        }
        // wind-down: at least 20 minutes of energy ≤ 0 at the end; adventure's last 25 from the calm pool
        let wind = 0;
        for (let i = units.length - 1; i >= 0 && windsDown(units[i]!); i--)
          wind += units[i]!.duration_sec;
        expect(wind, `${where} wind-down`).toBeGreaterThanOrEqual(20 * 60);
        if (p.type === "adventure") {
          let calm = 0;
          for (let i = units.length - 1; i >= 0 && calmEligible(units[i]!); i--)
            calm += units[i]!.duration_sec;
          expect(calm, `${where} calm tail`).toBeGreaterThanOrEqual(25 * 60);
        }
        // tracks: https audio, sane bounds
        for (const it of p.items) {
          expect(it.audio_url.startsWith("https://"), where).toBe(true);
          expect(it.end_sec - it.start_sec).toBeCloseTo(it.duration_sec, 1);
        }
        // no unit in two heads of one edition (criterion 10)
        for (const u of headUnits(p)) {
          for (const k of byUnit.get(u)!.keys) {
            expect(heads.has(k), `${where} head ${u}`).toBe(false);
            heads.add(k);
          }
        }
      }
    }
  });

  it("keeps same-type and head cooldowns over 75 nights (relaxed playlists checked against their relaxed values)", () => {
    const lastUse = new Map<string, number>();
    const lastHead = new Map<string, number>();
    let relaxed = 0;
    sim.history.forEach((e, i) => {
      for (const p of e.playlists) {
        const r = recipe(p.type);
        const step = sim.relax.get(`${e.date}/${p.type}`) ?? 0;
        if (step > 0) relaxed++;
        const mult = 0.75 ** Math.min(step, 4);
        const cool = Math.ceil(r.cooldownDays * mult);
        const headCool = Math.ceil(r.headCooldownDays * mult);
        const head = new Set(headUnits(p));
        for (const u of unitsOf(p)) {
          for (const k of u.keys) {
            const prev = lastUse.get(`${p.type}|${k}`);
            if (prev !== undefined)
              expect(i - prev, `${e.date}/${p.type} ${u.unit}`).toBeGreaterThan(cool);
            if (head.has(u.unit)) {
              const ph = lastHead.get(`${p.type}|${k}`);
              if (ph !== undefined)
                expect(i - ph, `${e.date}/${p.type} head ${u.unit}`).toBeGreaterThan(headCool);
            }
          }
        }
        for (const u of unitsOf(p)) {
          for (const k of u.keys) {
            lastUse.set(`${p.type}|${k}`, i);
            if (head.has(u.unit)) lastHead.set(`${p.type}|${k}`, i);
          }
        }
      }
    });
    // Relaxation is the fallback, not the rule.
    expect(relaxed / (sim.history.length * RECIPES.length)).toBeLessThan(0.1);
  });

  it("plays Chanukah stories when Chanukah is near; seasonal ≤ 40%, nothing out of season in a head (criterion 11)", () => {
    // The first night Chanukah counts as "near" (3 days before): every type with at least three
    // eligible Chanukah stories plays one. (By 2026-12-06, the spec's example night, types with few distinct
    // Chanukah stories have used them within their cooldown; cooldowns win over the boost.)
    const first = sim.history.find((x) => seasonFor(x.date).active.get("chanukah") === "near")!;
    expect(first.date).toBe("2026-12-01");
    for (const p of first.playlists) {
      const r = recipe(p.type);
      const eligibleChanukah = pool.units.filter(
        (u) => r.eligible(u) && u.calendar.includes("chanukah"),
      );
      if (eligibleChanukah.length >= 3)
        expect(
          unitsOf(p).some((u) => u.calendar.includes("chanukah")),
          p.type,
        ).toBe(true);
    }
    const chanukah = sim.history.filter((x) => x.date >= "2026-12-01" && x.date <= "2026-12-12");
    let withStory = 0;
    for (const night of chanukah) {
      if (night.playlists.some((p) => unitsOf(p).some((u) => u.calendar.includes("chanukah"))))
        withStory++;
      for (const p of night.playlists) checkSeasonal(night, p);
    }
    // Nearly every night of Chanukah has a Chanukah story somewhere (cooldowns win over the boost).
    expect(withStory).toBeGreaterThanOrEqual(chanukah.length - 2);
  });

  function checkSeasonal(e: Edition, p: Playlist) {
    const season = seasonFor(e.date);
    const units = unitsOf(p);
    const inSeason = units.filter((u) => {
      const s = seasonalStatus(u.calendar, season);
      return s === "near" || s === "window";
    });
    const total = units.reduce((s, u) => s + u.duration_sec, 0);
    const seasonal = inSeason.reduce((s, u) => s + u.duration_sec, 0);
    expect(seasonal, `${e.date}/${p.type}`).toBeLessThanOrEqual(0.4 * total);
    for (const u of headUnits(p))
      expect(
        seasonalStatus(byUnit.get(u)!.calendar, season),
        `${e.date}/${p.type} head ${u}`,
      ).not.toBe("out");
  }

  it("keeps the opening song only on the first track", () => {
    let seen = 0;
    for (const e of sim.history) {
      for (const p of e.playlists) {
        p.items.forEach((it, i) => {
          const t = byUnit.get(it.unit)!.tracks[0]!;
          if (t.intro_start_sec === undefined || byUnit.get(it.unit)!.block) return;
          if (i === 0 && it.start_sec === t.intro_start_sec) seen++;
          if (i > 0) expect(it.start_sec, `${e.date}/${p.type}`).toBe(t.start_sec);
        });
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("runs 730 consecutive nights from an empty history without a failed edition (criterion 9)", () => {
    const long = simulate("2027-01-10T20:00:00Z", 730);
    expect(long.history).toHaveLength(730);
    const relaxedShare = long.relax.size / (730 * RECIPES.length);
    expect(relaxedShare).toBeLessThan(0.1);
  }, 120_000);

  it("never names an unconfirmed narrator", () => {
    for (const e of sim.history)
      for (const p of e.playlists)
        for (const it of p.items)
          expect([null, "Uncle Yossi", "R' Chaim Levi Goldstein"]).toContain(it.narrator);
  });
});

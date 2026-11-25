/** Serials, shelves, Story of the Day, calendar, search and per-device state. */
import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import { buildCalendar, calendarDay, parshaIds } from "../src/lib/build/calendar.ts";
import { capPerVariant, countsByVariant, getModel, visibleIn } from "../src/lib/build/model.ts";
import { buildSearchIndex } from "../src/lib/build/search-docs.ts";
import { serialTracks, serialVis } from "../src/lib/build/views.ts";
import type { Variant } from "../src/lib/kinds.ts";
import {
  MINISEARCH_OPTIONS,
  SEARCH_OPTIONS,
  type SearchDocument,
  processTerm,
} from "../src/lib/search.ts";
import { chooseRun, setTitle, storyRanges, type SerialIndexEntry } from "../src/lib/serials.ts";
import { storyOfTheDay } from "../src/lib/sotd.ts";
import * as S from "../src/scripts/state.ts";

const m = getModel();

describe("serials (§4.4)", () => {
  it("story-only ranges start at the intro and cover every part", () => {
    expect(
      storyRanges({
        id: "x",
        intro_start_sec: 400,
        parts: [
          { start_sec: 500, end_sec: 700 },
          { start_sec: 800, end_sec: 900 },
        ],
      }),
    ).toEqual([
      { start_sec: 400, end_sec: 700 },
      { start_sec: 800, end_sec: 900 },
    ]);
  });

  it("chooses the earliest complete run in the pool, else the one with most chapters", () => {
    const s: SerialIndexEntry = {
      story_key: "k",
      title: "K",
      runs: [
        { label: "a", complete: true, chapters: [{ chapter: 1, items: [{ id: "out" }] }] },
        {
          label: "b",
          complete: false,
          chapters: [
            { chapter: 1, items: [{ id: "x1" }] },
            { chapter: 2, items: [{ id: "x2" }] },
          ],
        },
        { label: "c", complete: true, chapters: [{ chapter: 1, items: [{ id: "y1" }] }] },
      ],
    };
    expect(chooseRun(s, (id) => id !== "out")?.label).toBe("c");
    expect(chooseRun({ ...s, runs: s.runs.slice(0, 2) }, (id) => id !== "out")?.label).toBe("b");
  });

  it("The Ten Wedding Gifts: 4 chapters, story-only tracks with the index ranges", () => {
    const s = m.serialByKey.get("the-ten-wedding-gifts");
    expect(s?.chapters.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    const t = s ? serialTracks(s, true, m) : [];
    expect(t[0]).toMatchObject({ id: "94d2197a4f", start_sec: 476, end_sec: 1365 });
    expect(t.map((x) => x.id)).toEqual(s?.chapters.map((c) => c.id));
  });

  it("missing chapters are listed, and a serial is in band only if every chapter is", () => {
    const withGap = m.serials.find((s) => s.chapters.some((c) => c.id === null));
    expect(withGap).toBeTruthy();
    for (const s of m.serials) {
      for (const v of serialVis(s, m))
        for (const c of s.chapters) if (c.id) expect(m.items.get(c.id)?.vis).toContain(v);
    }
  });

  it("set titles drop the part suffix", () => {
    expect(setTitle("The Four Chochmos, Part 1 (Chanukah)")).toBe("The Four Chochmos");
    expect(setTitle("Kesser Tefillah, Part 1: Meir's Dream of Hashem's Crown")).toBe(
      "Kesser Tefillah",
    );
  });
});

describe("shelves (§4.1)", () => {
  it("capPerVariant caps each variant independently", () => {
    const list = [
      { id: "1", vis: ["b"] as Variant[] },
      { id: "2", vis: ["l", "b"] as Variant[] },
      { id: "3", vis: ["l", "b"] as Variant[] },
      { id: "4", vis: ["l"] as Variant[] },
    ];
    const out = capPerVariant(list, 2);
    expect(out.map((x) => [x.k.id, x.vis.join("")])).toEqual([
      ["1", "b"],
      ["2", "lb"],
      ["3", "l"],
    ]);
    expect(visibleIn(list, 3)).toEqual(
      ["l", "b"].filter((v) => list.filter((x) => x.vis.includes(v as Variant)).length >= 3),
    );
    expect(countsByVariant(list).l).toBe(3);
  });

  it("band counts (recomputed for §8.1 with the owner's Little rule)", () => {
    const c = countsByVariant(m.pool);
    expect(c.b).toBe(1033);
    expect(c).toEqual({ l: 512, k: 828, b: 1033, lg: 445, kg: 500, bg: 516 });
  });
});

describe("Story of the Day (§6.4)", () => {
  const recs = m.index.items;
  it("is deterministic and in band", () => {
    const a = storyOfTheDay(recs, "k", 331);
    expect(storyOfTheDay(recs, "k", 331)?.id).toBe(a?.id);
    expect(a?.sd).toBe(1);
    expect(a && a.v < 2 && a.a <= 6).toBe(true);
  });
  it("on even days an active holiday with 5+ items wins", () => {
    const r = storyOfTheDay(recs, "b", 330, ["chanukah"]);
    expect(r?.c?.some((c) => c === "chanukah" || c === "zos_chanukah")).toBe(true);
    const odd = storyOfTheDay(recs, "b", 331, ["chanukah"]);
    expect(odd?.id).toBe(storyOfTheDay(recs, "b", 331)?.id);
  });
});

describe("calendar (§5.2, criterion 9)", () => {
  const label = (id: string) => m.vocab("calendar", id)?.label ?? id;
  it("15 Kislev 5787 (2026-11-25): Chanukah and Yud-Tes Kislev are coming up", () => {
    const d = calendarDay(new Date(2026, 10, 25, 12), label);
    expect(d.h).toBe("15 Kislev 5787");
    expect(d.g).toContain("chanukah");
    expect(d.s).toContain("yud_tes_kislev");
    expect(d.o).toBe("Chanukah is in 10 days");
    expect(d.p).toEqual(["vayishlach"]);
  });
  it("this week's parsha shelf needs 2 items in band", () => {
    const n = m.pool.filter((k) => k.item.subjects.parshiyos.includes("vayishlach")).length;
    expect(typeof n).toBe("number");
    expect(parshaIds(["Lech-Lecha", "Achrei Mot", "Nope"])).toEqual(["lech_lecha", "acharei"]);
  });
  it("covers 400 consecutive days", () => {
    const days = buildCalendar(new Date(2026, 10, 25), 400, label);
    expect(days).toHaveLength(400);
    expect(new Set(days.map((d) => d.d)).size).toBe(400);
    expect(days.some((d) => d.g.includes("purim"))).toBe(true);
  });
});

describe("search (§6.5, criteria 22, 23)", () => {
  const ms = MiniSearch.loadJSON<SearchDocument>(buildSearchIndex(), MINISEARCH_OPTIONS);
  const title = (id: string | number) => m.items.get(String(id))?.title ?? "";
  it.each([
    ["besht", /baal shem/i],
    ["Baal Shem", /baal shem/i],
    ["chanuka", /chanukah/i],
    ["Hanukkah", /chanukah/i],
    ["lion", /lion/i],
  ])("%s finds relevant results within 100 ms", (q, re) => {
    const t = performance.now();
    const r = ms.search(q, SEARCH_OPTIONS);
    expect(performance.now() - t).toBeLessThan(100);
    expect(r.length).toBeGreaterThan(0);
    expect(r.slice(0, 3).some((x) => re.test(title(x.id)))).toBe(true);
  });
  it("folds spellings", () => {
    expect(processTerm("Shabbat")).toBe("shabbos");
    expect(processTerm("Ba'al")).toBe("baal");
    expect(processTerm("besht")).toEqual(["baal", "shem", "tov"]);
  });
  it("indexes only pool items (band filtering happens on the client from index.json)", () => {
    expect(ms.documentCount).toBe(1033);
  });
});

describe("per-device state (§7, criteria 24, 25)", () => {
  it("hearts cap at 200, newest first, and work without localStorage", () => {
    for (let i = 0; i < 210; i++) S.toggleFav(`id${i}`, i);
    const favs = S.getFavs();
    expect(favs).toHaveLength(200);
    expect(favs[0]?.id).toBe("id209");
    expect(S.toggleFav("id209")).toBe(false);
    expect(S.isFav("id209")).toBe(false);
  });
  it("progress: finished at 95% or within 20 s; Keep Listening between 30 s and 95%", () => {
    S.saveProgress("a", 10, 600, 1);
    S.saveProgress("b", 300, 600, 2);
    S.saveProgress("c", 585, 600, 3);
    expect(S.keepListening()).toEqual(["b"]);
    expect(S.finished()).toEqual(["c"]);
    expect(S.isDone(570, 600)).toBe(true);
    expect(S.isDone(500, 600)).toBe(false);
  });
});

/**
 * The Yiddish shelf (docs/design/language-bedtime.md §3, §7). The pure ordering tests always run;
 * the dataset tests run on the generated public dataset (`npm run data:ensure`, which `npm test`
 * runs first) and are skipped with a message when it is not built.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadCatalog, loadItem, loadSearchDoc, publicDataDir } from "@goldstein/data/load";
import { FORBIDDEN_KEYS } from "@goldstein/data/privacy";
import type { PlaylistItem } from "@goldstein/playlists";
import { describe, expect, it } from "vitest";
import { resolveShelf } from "../src/lib/build/yiddish.ts";
import { aboutLength, cardMeta } from "../src/lib/ui.ts";
import {
  dayNumber,
  END_OVERRIDES,
  FULL_BODY,
  FULL_TAIL,
  INCLUDE_BUBBY_FAMILY_STORIES,
  NARRATOR_BODY,
  NARRATOR_TAIL,
  numberWord,
  OPENER_MAX_SEC,
  orderShelf,
  SHELF_IDS,
  shelfLine,
  shelfPlaylist,
} from "../src/lib/yiddish-shelf.ts";

const item = (id: string, min: number, over: Partial<PlaylistItem> = {}): PlaylistItem => ({
  id,
  unit: id,
  title: `Story ${id}`,
  narrator: null,
  audio_url: `https://storiesmedia.torahlearningtools.com/${id}.mp3`,
  mime_type: "audio/mpeg",
  start_sec: 0,
  end_sec: min * 60,
  duration_sec: min * 60,
  age_min: 4,
  band: null,
  advisories: [],
  block: null,
  ...over,
});
const moderate = [{ flag: "persecution", label: "Persecution", severity: "moderate" as const }];

const dates = (n: number, from = "2026-11-27") =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
  );

describe("orderShelf (pure)", () => {
  // Same shape as the 11-story shelf: 9 body stories (3 fit to open), a fixed 2-story tail.
  const body = [
    item("b1", 7.6),
    item("b2", 6.4),
    item("b3", 4.5),
    item("b4", 15.7),
    item("b5", 16),
    item("b6", 16.8),
    item("b7", 11.6, { advisories: moderate }),
    item("b8", 18),
    item("b9", 25.7),
  ];
  const tail = [item("t1", 5.1), item("t2", 7)];
  const all = [...body, ...tail];
  const tailIds = ["t1", "t2"];

  it("is deterministic, keeps every story once and the tail last in its order", () => {
    for (const d of dates(30)) {
      const a = orderShelf(all, d, tailIds);
      expect(orderShelf(all, d, tailIds)).toEqual(a);
      expect(a.map((i) => i.id).sort()).toEqual(all.map((i) => i.id).sort());
      expect(a.slice(-2).map((i) => i.id)).toEqual(tailIds);
    }
  });

  it("never opens with a long story or a moderate advisory; the opener changes every night", () => {
    const openers = dates(30).map((d) => orderShelf(all, d, tailIds)[0]!);
    for (const o of openers) {
      expect(o.duration_sec).toBeLessThanOrEqual(OPENER_MAX_SEC);
      expect(o.advisories.some((a) => a.severity !== "mild")).toBe(false);
    }
    for (let i = 1; i < openers.length; i++) expect(openers[i]!.id).not.toBe(openers[i - 1]!.id);
    // every story fit to open takes its turn
    expect(new Set(openers.map((o) => o.id))).toEqual(new Set(["b1", "b2", "b3"]));
  });

  it("the rest of the body is reordered too, so a night is not the same as the last", () => {
    const [d1, d2] = dates(2);
    const n1 = orderShelf(all, d1!, tailIds).map((i) => i.id);
    const n2 = orderShelf(all, d2!, tailIds).map((i) => i.id);
    expect(n1).not.toEqual(n2);
  });

  it("3-story shelf: no story is short enough to open, so the two body stories alternate", () => {
    const small = [item("n1", 18), item("n2", 25.7), item("t", 4.5)];
    const openers = dates(10).map((d) => orderShelf(small, d, ["t"])[0]!.id);
    expect(new Set(openers)).toEqual(new Set(["n1", "n2"]));
    for (let i = 1; i < openers.length; i++) expect(openers[i]).not.toBe(openers[i - 1]);
    for (const d of dates(10)) expect(orderShelf(small, d, ["t"]).at(-1)!.id).toBe("t");
  });

  it("dayNumber reads edition ids too", () => {
    expect(dayNumber("2026-11-28") - dayNumber("2026-11-27")).toBe(1);
    expect(dayNumber("2026-11-27-pm")).toBe(dayNumber("2026-11-27"));
  });

  it("shelfPlaylist has the edition Playlist shape", () => {
    const p = shelfPlaylist(all, "2026-11-27", tailIds);
    expect(p.id).toBe("yiddish/2026-11-27");
    expect(p.type).toBe("yiddish");
    expect(p.title).toBe("Yiddish Stories");
    expect(p.ages).toBe("4+");
    expect(p.items).toHaveLength(11);
    expect(p.total_min).toBe(Math.round(all.reduce((s, i) => s + i.duration_sec, 0) / 60));
    expect(shelfLine(all)).toBe("Eleven stories in Yiddish.");
    expect(shelfLine([item("x", 5, { narrator: "Bubby Chaya Malka" }), item("y", 5)])).toBe(
      "Bubby Chaya Malka's stories, and a few more.",
    );
    expect(numberWord(3)).toBe("three");
  });
});

const hasData = existsSync(join(publicDataDir(), "catalog.json"));
if (!hasData)
  console.warn("yiddish.test: public dataset not built (run `npm run data:ensure`); skipping.");

describe.skipIf(!hasData)("the Yiddish shelf against the public dataset", () => {
  const catalog = new Map(hasData ? loadCatalog().map((e) => [e.id, e]) : []);
  const shelves = {
    active: { ids: SHELF_IDS, tail: INCLUDE_BUBBY_FAMILY_STORIES ? FULL_TAIL : NARRATOR_TAIL },
    full: { ids: [...FULL_BODY, ...FULL_TAIL], tail: FULL_TAIL },
    narrator: { ids: [...NARRATOR_BODY, ...NARRATOR_TAIL], tail: NARRATOR_TAIL },
  };

  it("lists 11 distinct ids in all, and the active list follows the owner's Q1 flag", () => {
    expect(new Set([...FULL_BODY, ...FULL_TAIL]).size).toBe(11);
    for (const id of [...NARRATOR_BODY, ...NARRATOR_TAIL])
      expect([...FULL_BODY, ...FULL_TAIL]).toContain(id);
    expect(SHELF_IDS).toEqual(shelves[INCLUDE_BUBBY_FAMILY_STORIES ? "full" : "narrator"].ids);
  });

  it("every listed id is public and fit for bedtime (both lists, so flipping Q1 is safe)", () => {
    for (const id of shelves.full.ids) {
      const e = catalog.get(id);
      expect(e, `${id} public`).toBeDefined();
      expect(e!.language).toBe("yi");
      expect(["story", "lesson_with_story"]).toContain(e!.content_type);
      expect(["young_children", "children", "older_children"]).toContain(e!.level);
      expect(e!.age_min).toBeLessThanOrEqual(8);
      expect(e!.max_advisory).not.toBe("strong");
      expect(e!.preferred_copy).toBe(true);
      expect(e!.transcript_display).not.toBe("show_with_label"); // Yiddish text is never shown
    }
    for (const s of Object.values(shelves)) {
      const items = resolveShelf(s.ids);
      expect(items.map((i) => i.id)).toEqual([...s.ids]);
      for (const i of items) {
        expect(i.duration_sec).toBeGreaterThanOrEqual(180);
        expect(i.duration_sec).toBeLessThanOrEqual(45 * 60);
      }
    }
  });

  it("narrators are only confirmed labels or null, never the unconfirmed placeholder", () => {
    const items = resolveShelf(shelves.full.ids);
    for (const i of items) expect([null, "Bubby Chaya Malka"]).toContain(i.narrator);
    expect(
      items
        .filter((i) => i.narrator === null)
        .map((i) => i.id)
        .sort(),
    ).toEqual([...NARRATOR_BODY, ...NARRATOR_TAIL].sort());
    expect(JSON.stringify(items)).not.toMatch(/unconfirmed/i);
  });

  it("END_OVERRIDES lie inside the content and end the story before the closing words", () => {
    for (const [id, end] of Object.entries(END_OVERRIDES)) {
      const it = loadItem(id);
      expect(end).toBeGreaterThan(it.content_start_sec);
      expect(end).toBeLessThan(it.content_end_sec);
      // the masked (withheld) lines come after the override: nothing searchable is past it
      expect(it.transcript.masked_lines).toBeGreaterThan(0);
      const last = Math.max(...(loadSearchDoc(id)?.lines ?? [[0, ""]]).map((l) => l[0]));
      expect(last).toBeLessThan(end);
    }
    const story = loadItem("5e3346ab8e").segments.find((s) => s.type === "story");
    expect(story?.end_sec).toBe(END_OVERRIDES["5e3346ab8e"]);
    const full = resolveShelf(shelves.full.ids);
    for (const [id, end] of Object.entries(END_OVERRIDES))
      expect(full.find((i) => i.id === id)!.end_sec).toBe(end);
  });

  it("measured sizes: 11 stories ≈ 134 min (8 fit Little Ones), 3 without Bubby ≈ 48 min", () => {
    const mins = (ids: readonly string[]) =>
      resolveShelf(ids).reduce((s, i) => s + i.duration_sec, 0) / 60;
    expect(mins(shelves.full.ids)).toBeCloseTo(134.2, 0);
    expect(mins(shelves.narrator.ids)).toBeCloseTo(48.2, 0);
    // Printed so the point where a real rotating Yiddish playlist becomes possible (~8 h) is visible.
    console.info(
      `Yiddish shelf: ${resolveShelf().length} stories, ${mins(SHELF_IDS).toFixed(1)} min`,
    );
  });

  it("orders the real shelves as designed", () => {
    for (const s of [shelves.full, shelves.narrator]) {
      const items = resolveShelf(s.ids);
      const openers = new Set<string>();
      for (const d of dates(9)) {
        const p = shelfPlaylist(items, d, s.tail);
        expect(p.items.slice(-s.tail.length).map((i) => i.id)).toEqual([...s.tail]);
        expect(p.items[0]!.advisories.some((a) => a.severity !== "mild")).toBe(false);
        if (s === shelves.full)
          expect(p.items[0]!.duration_sec).toBeLessThanOrEqual(OPENER_MAX_SEC);
        openers.add(p.items[0]!.id);
      }
      expect(openers.size).toBe(s === shelves.full ? 3 : 2);
    }
  });

  it("card meta matches the total", () => {
    const p = shelfPlaylist(resolveShelf(), "2026-11-27");
    expect(cardMeta(p)).toBe(`${aboutLength(p.total_min)} · ages 4+`);
    if (!INCLUDE_BUBBY_FAMILY_STORIES) expect(cardMeta(p)).toBe("about 50 minutes · ages 4+");
  });

  it("the shelf JSON has no internal keys and no transcript text", () => {
    const json = JSON.stringify(resolveShelf(shelves.full.ids));
    for (const k of FORBIDDEN_KEYS) expect(json).not.toContain(`"${k}"`);
    expect(json).not.toMatch(/[֐-׿]/);
  });
});

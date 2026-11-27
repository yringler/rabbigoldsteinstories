/**
 * Story of the Day with Yiddish in the index (docs/design/language-kids.md §5.4): every English
 * variant picks exactly what it picked before Yiddish records existed, on every day.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/lib/build/model.ts";
import { variantsOfLang } from "../src/lib/kinds.ts";
import type { Rec } from "../src/lib/records.ts";
import { sotdPool, storyOfTheDay, surprise } from "../src/lib/sotd.ts";

const m = getModel();
const recs = m.index.items;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// The pre-change index: English records only, ranked by sha256(id) within the English pool.
const enRecs = recs.filter((r) => r.l !== 1);
const oldRank = new Map(
  [...enRecs]
    .map((r) => ({ id: r.id, h: sha(r.id) }))
    .sort((a, b) => (a.h < b.h ? -1 : 1))
    .map((x, i) => [x.id, i]),
);
const oldRecs: Rec[] = enRecs.map((r) => ({ ...r, r: oldRank.get(r.id) ?? -1 }));
// 2026-11-27 as a day number since 2026-01-01.
const START = Math.floor((Date.UTC(2026, 10, 27) - Date.UTC(2026, 0, 1)) / 86_400_000);

describe("Story of the Day and languages", () => {
  it("every English variant picks the same story as before, for 400 days", () => {
    for (const v of variantsOfLang("en"))
      for (let d = START; d < START + 400; d++) {
        expect(storyOfTheDay(recs, v, d)?.id, `${v} ${d}`).toBe(storyOfTheDay(oldRecs, v, d)?.id);
        expect(storyOfTheDay(recs, v, d, ["pesach", "chanukah"])?.id).toBe(
          storyOfTheDay(oldRecs, v, d, ["pesach", "chanukah"])?.id,
        );
      }
  });

  it("Yiddish only picks Yiddish stories (7/9/10 by band, 4 with Gentle)", () => {
    const n = (v: "l-y" | "k-y" | "b-y" | "kg-y") => sotdPool(recs, v).length;
    expect([n("l-y"), n("k-y"), n("b-y"), n("kg-y")]).toEqual([7, 9, 10, 4]);
    for (let d = START; d < START + 60; d++) expect(storyOfTheDay(recs, "k-y", d)?.l).toBe(1);
    expect(surprise(recs, "b-y", () => 0.5)?.l).toBe(1);
  });

  it("Both mixes the two pools", () => {
    expect(sotdPool(recs, "b-a").length).toBe(
      sotdPool(recs, "b").length + sotdPool(recs, "b-y").length,
    );
  });
});

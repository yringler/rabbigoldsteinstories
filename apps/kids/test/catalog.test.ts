/**
 * Catalog, pool and browse acceptance criteria (kids.md §14, 1, 4, 6, 7, 8) on the reference data
 * (public export of 2026-11-25, with `review` items publishable: DECISIONS "Website decisions").
 */
import { loadCatalog, loadItem, loadVocab } from "@goldstein/data/load";
import { describe, expect, it } from "vitest";
import { getModel, tileKey, visibleIn } from "../src/lib/build/model.ts";
import { poolReason } from "../src/lib/pool.ts";
import {
  HOLIDAY_TILES,
  MIDOS_TILES,
  MITZVOS_TILES,
  TILE_MIN,
  TOPIC_TILES,
  type Tile,
} from "../src/lib/tiles.ts";

const m = getModel();

describe("kid pool (§9)", () => {
  it("has the expected size and kinds (criterion 1, recomputed)", () => {
    expect(m.counts).toMatchObject({
      pool: 1033,
      show: 411,
      story: 310,
      short: 298,
      event: 11,
      song: 3,
    });
  });

  it("excludes Yiddish, adult levels, shiurim, family recordings, superseded copies (criterion 4)", () => {
    for (const k of m.pool) {
      const it = k.item;
      expect(it.language.primary).toBe("en");
      expect(["young_children", "children", "older_children", "family"]).toContain(
        it.audience.level,
      );
      expect(["shiur", "fragment", "promo", "family_recording"]).not.toContain(
        it.classification.content_type,
      );
      expect(it.derived.preferred_copy).toBe(true);
      expect(it.audience.advisories.some((a) => a.severity === "strong")).toBe(false);
    }
  });

  it("matches poolReason over the whole export; the 'hide' item is not in the export", () => {
    const ids = new Set(loadCatalog().map((c) => c.id));
    expect(ids.size).toBe(1183);
    const inPool = [...ids].filter((id) => poolReason(loadItem(id)) === null);
    expect(new Set(inPool)).toEqual(m.poolIds);
  });

  it("the index record of every pool item carries only kid-safe fields", () => {
    const allowed = new Set([
      "id",
      "t",
      "k",
      "d",
      "a",
      "v",
      "u",
      "s",
      "e",
      "b",
      "ep",
      "ch",
      "sk",
      "sd",
      "r",
      "c",
      "p",
      "js",
      "cl", // 1 when an AI-improved copy exists (docs/design/ai-audio.md)
    ]);
    for (const r of m.index.items)
      for (const key of Object.keys(r)) expect(allowed.has(key)).toBe(true);
    expect(m.index.items).toHaveLength(1033);
  });
});

describe("tiles (§5, criterion 7)", () => {
  const vocab = loadVocab();
  const has = (list: string, id: string) => (vocab.lists[list] ?? []).some((e) => e.id === id);
  const lists: [readonly Tile[], string][] = [
    [TOPIC_TILES, "topics"],
    [MIDOS_TILES, "midos"],
    [MITZVOS_TILES, "mitzvos"],
    [HOLIDAY_TILES, "calendar"],
  ];

  it("every mapped id exists in the vocabulary", () => {
    for (const [tiles, list] of lists)
      for (const t of tiles)
        for (const id of t.ids) expect(has(list, id), `${list}:${id}`).toBe(true);
  });

  it("each tile resolves to exactly the items carrying one of its ids", () => {
    for (const [tiles, list] of lists) {
      for (const t of tiles) {
        const want = m.pool
          .filter((k) =>
            (k.item.subjects[list as "topics"] as readonly string[]).some((x) => t.ids.includes(x)),
          )
          .map((k) => k.id)
          .sort();
        expect((m.tileItems.get(tileKey(t)) ?? []).map((k) => k.id).sort()).toEqual(want);
      }
    }
  });

  it("Big Kids counts match the reference table (items, stories)", () => {
    const counts = Object.fromEntries(
      [...TOPIC_TILES, ...MIDOS_TILES, ...MITZVOS_TILES, ...HOLIDAY_TILES].map((t) => {
        const l = m.tileItems.get(tileKey(t)) ?? [];
        return [`${t.facet}:${t.slug}`, [l.length, l.filter((k) => k.kind === "story").length]];
      }),
    );
    expect(counts).toEqual(EXPECTED);
  });

  it("dense ids are never tiles", () => {
    expect(TOPIC_TILES.flatMap((t) => t.ids)).not.toContain("calendar");
    expect(MITZVOS_TILES.flatMap((t) => t.ids)).not.toContain("shema");
    expect(MITZVOS_TILES.flatMap((t) => t.ids)).not.toContain("torah_study");
  });

  it("38 heroes qualify (central/appears in 5+ pool items), none unconfirmed", () => {
    expect(m.tiles.heroes).toHaveLength(38);
    for (const h of m.tiles.heroes) expect(m.vocab("people", h.slug)?.unconfirmed).toBeUndefined();
  });

  it("a tile is visible in a variant only with TILE_MIN items there (criterion 8)", () => {
    for (const t of [...TOPIC_TILES, ...m.tiles.heroes]) {
      const items = m.tileItems.get(tileKey(t)) ?? [];
      for (const v of visibleIn(items, TILE_MIN))
        expect(items.filter((k) => k.vis.includes(v)).length).toBeGreaterThanOrEqual(TILE_MIN);
    }
    // Hillel qualifies as a hero (6 items) but never has 8 in any band, so his tile is never shown.
    expect(visibleIn(m.tileItems.get("people:hillel") ?? [], TILE_MIN)).toEqual([]);
  });
});

describe("labels (criterion 6)", () => {
  it("no placeholder speaker or working-title series label is used as a byline", () => {
    for (const k of m.items.values()) {
      expect(
        k.byline === null || ["Uncle Yossi", "Rabbi Chaim Levi Goldstein"].includes(k.byline),
      ).toBe(true);
    }
  });
});

// Reference counts (Big Kids = whole pool) on the 2026-11-25 data: [items, stories].
const EXPECTED: Record<string, [number, number]> = {
  "topics:baal-shem-tov": [116, 42],
  "topics:rebbeim": [220, 120],
  "topics:tzaddikim": [78, 47],
  "topics:torah-heroes": [147, 41],
  "topics:hashem-is-watching": [233, 96],
  "topics:miracles": [142, 70],
  "topics:kindness": [249, 63],
  "topics:being-my-best": [265, 87],
  "topics:davening-and-brachos": [216, 60],
  "topics:learning-torah": [221, 44],
  "topics:shabbos-and-mitzvos": [188, 42],
  "topics:moshiach": [279, 48],
  "topics:brave-jews": [95, 45],
  "topics:family-and-home": [61, 15],
  "topics:hashems-world": [36, 3],
  "topics:tzivos-hashem": [294, 12],
  "midos:trusting-hashem": [477, 164],
  "midos:loving-every-jew": [288, 68],
  "midos:kindness-and-giving": [261, 85],
  "midos:being-happy": [287, 72],
  "midos:saying-thank-you": [143, 39],
  "midos:respect": [123, 23],
  "midos:telling-the-truth": [91, 37],
  "midos:being-brave": [182, 80],
  "midos:listening-to-hashem": [229, 91],
  "midos:trying-my-hardest": [206, 61],
  "midos:being-humble": [91, 38],
  "midos:staying-calm": [133, 44],
  "midos:kind-words-and-peace": [89, 38],
  "mitzvos:tzedakah": [346, 65],
  "mitzvos:davening-and-tehillim": [343, 97],
  "mitzvos:brachos": [143, 42],
  "mitzvos:welcoming-guests": [111, 40],
  "mitzvos:shabbos": [177, 34],
  "mitzvos:honouring-parents": [93, 25],
  "mitzvos:helping-others": [248, 82],
  "mitzvos:teshuvah": [143, 47],
  "mitzvos:twelve-pesukim": [85, 6],
  "mitzvos:good-morning-mitzvos": [65, 30],
  "mitzvos:mezuzah": [44, 11],
  "mitzvos:tefillin-tzitzis-yarmulke": [41, 27],
  "mitzvos:kosher": [24, 12],
  "mitzvos:shul-and-seforim": [52, 7],
  "mitzvos:sharing-yiddishkeit": [126, 30],
  "calendar:rosh-hashanah-yom-kippur": [130, 28],
  "calendar:sukkos": [34, 6],
  "calendar:chanukah": [47, 9],
  "calendar:tu-bishvat": [18, 4],
  "calendar:purim": [87, 13],
  "calendar:pesach": [75, 12],
  "calendar:sefirah-lag-baomer": [76, 10],
  "calendar:shavuos": [55, 8],
  "calendar:three-weeks": [78, 7],
  "calendar:chassidishe-yomim-tovim": [76, 42],
  "calendar:summer": [50, 2],
  "calendar:shabbos-rosh-chodesh": [134, 16],
};

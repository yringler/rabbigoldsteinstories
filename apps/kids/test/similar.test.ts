import { describe, expect, it } from "vitest";
import { getModel } from "../src/lib/build/model.ts";
import { capPerVariant } from "../src/lib/build/model.ts";
import {
  type SimInput,
  computeSimilar,
  featuresOf,
  kindFactor,
  titleOverlap,
} from "../src/lib/similar.ts";

const base = (
  id: string,
  features: [string, number][],
  extra: Partial<SimInput> = {},
): SimInput => ({
  id,
  kind: "story",
  features,
  related: [],
  ...extra,
});
// Filler items so the IDF of the shared features is positive and every feature has df >= 2.
const filler = Array.from({ length: 20 }, (_, i) =>
  base(`f${String(i).padStart(2, "0")}`, [
    [`t:x${i % 5}`, 1],
    [`m:y${i % 4}`, 1.5],
  ]),
);

describe("similarity formula (§6.3)", () => {
  it("weights people by role and characters case-insensitively", () => {
    const f = featuresOf({
      people: [
        { id: "a", role: "central" },
        { id: "b", role: "mentioned" },
      ],
      midos: ["emes"],
      characters: [" The King "],
      topics: ["t"],
      mitzvos: [],
      parshiyos: [],
      story_type: ["chassidic"],
      calendar: ["purim"],
    });
    expect(f).toEqual([
      ["p:a", 3],
      ["p:b", 0.5],
      ["m:emes", 1.5],
      ["c:the king", 1.5],
      ["t:t", 1],
      ["s:chassidic", 1],
      ["d:purim", 0.75],
    ]);
  });

  it("kind factor", () => {
    expect(kindFactor("story", "story")).toBe(1);
    expect(kindFactor("story", "show")).toBe(0.8);
    expect(kindFactor("show", "short")).toBe(0.5);
  });

  it("excludes story groups, serials, sets, direct relations, near duplicates; part 1 only", () => {
    const shared: [string, number][] = [
      ["p:hero", 3],
      ["m:kind", 1.5],
      ["t:x0", 1],
    ];
    const pool: SimInput[] = [
      ...filler,
      base("src", shared, { storyGroup: "g1", storyKey: "s1", setKey: "set1" }),
      base("sameGroup", [...shared, ["t:x1", 1]], { storyGroup: "g1" }),
      base("sameSerial", [...shared, ["t:x2", 1]], { storyKey: "s1" }),
      base("sameSet", [...shared, ["t:x3", 1]], { setKey: "set1", partNumber: 2 }),
      base("related", [...shared, ["t:x4", 1]], { related: ["src"] }),
      base("part2", [...shared, ["m:y1", 1.5], ["t:x3", 1]], { setKey: "other", partNumber: 2 }),
      base("part1", [...shared, ["m:y1", 1.5], ["t:x3", 1]], { setKey: "other", partNumber: 1 }),
      base("dup", shared, { dur: 100, title: "Same Story" }),
      base("ok", [...shared, ["m:y2", 1.5], ["t:x2", 1]]),
    ];
    const r = computeSimilar(pool);
    const got = r.related.get("src") ?? [];
    for (const bad of ["sameGroup", "sameSerial", "sameSet", "related", "part2", "dup"])
      expect(got).not.toContain(bad);
    expect(got).toContain("part1");
    expect(got).toContain("ok");
    expect(r.score("src", "dup")).toBeGreaterThanOrEqual(0.85);
  });

  it("reports a near-duplicate only when length and title also match", () => {
    const shared: [string, number][] = [
      ["p:hero", 3],
      ["m:kind", 1.5],
    ];
    const r = computeSimilar([
      ...filler,
      base("a", shared, { dur: 600, title: "The Plot That Boomeranged" }),
      base("b", shared, { dur: 590, title: "The Plot That Boomeranged (2)" }),
      base("c", shared, { dur: 300, title: "Something else" }),
    ]);
    expect(r.nearDuplicates.map((d) => `${d.a}~${d.b}`)).toEqual(["a~b"]);
    expect(
      titleOverlap("The Plot That Boomeranged", "The Plot That Boomeranged (2)"),
    ).toBeGreaterThan(0.6);
  });

  it("keeps at most 3 of 12 from one serial", () => {
    const shared: [string, number][] = [
      ["p:hero", 3],
      ["t:x0", 1],
    ];
    const pool = [
      ...filler,
      base("src", shared),
      ...Array.from({ length: 6 }, (_, i) =>
        base(`ser${i}`, [...shared, [`m:y${i % 4}`, 1.5]], { storyKey: "big" }),
      ),
    ];
    const got = computeSimilar(pool).related.get("src") ?? [];
    expect(got.filter((x) => x.startsWith("ser"))).toHaveLength(3);
  });
});

describe("More like this on the real pool (criterion 15)", () => {
  const m = getModel();
  it("every pool item gets 12 candidates and 6 cards in Big Kids", () => {
    for (const k of m.pool) {
      const rel = m.sim.related.get(k.id) ?? [];
      expect(rel.length, k.id).toBe(12);
      const shown = capPerVariant(
        rel.map((x) => m.items.get(x)).filter((x): x is NonNullable<typeof x> => Boolean(x)),
        6,
      ).filter((x) => x.vis.includes("b"));
      expect(shown).toHaveLength(6);
    }
  });

  it("never includes the same story group, serial, part set or a direct relation", () => {
    for (const k of m.pool) {
      const it = k.item;
      const group = m.storyGroupOf.get(k.id)?.groupId;
      const direct = new Set(it.relations.map((r) => r.target_id));
      for (const id of m.sim.related.get(k.id) ?? []) {
        const o = m.items.get(id);
        expect(o?.inPool).toBe(true);
        if (!o) continue;
        expect(direct.has(id) || o.item.relations.some((r) => r.target_id === k.id)).toBe(false);
        if (group) expect(m.storyGroupOf.get(id)?.groupId).not.toBe(group);
        const sk = it.classification.serial?.story_key;
        if (sk) expect(o.item.classification.serial?.story_key).not.toBe(sk);
        const set = it.classification.part?.set_key;
        if (set) expect(o.item.classification.part?.set_key).not.toBe(set);
      }
    }
  });

  it("capPerVariant drops out-of-band items and keeps the build order", () => {
    const k = m.pool.find((x) => x.vis.includes("l"));
    if (!k) throw new Error("no little item");
    const rel = (m.sim.related.get(k.id) ?? [])
      .map((x) => m.items.get(x))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const little = capPerVariant(rel, 6)
      .filter((x) => x.vis.includes("l"))
      .map((x) => x.k.id);
    expect(little).toEqual(
      rel
        .filter((x) => x.vis.includes("l"))
        .slice(0, 6)
        .map((x) => x.id),
    );
  });
});

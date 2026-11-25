/**
 * Owner rule (kids.md §8.4): no four-pointed stars, plus signs, X marks or other cross-like shapes in
 * icons, cover patterns or emblems. A geometric check over every straight-line path: no two strokes
 * may cross each other in their middles, and no closed polygon may be a four-pointed star.
 */
import { describe, expect, it } from "vitest";
import { ICON_NAMES, iconBody } from "../src/lib/icons.ts";
import { coverSvg, type Pattern } from "../src/lib/covers.ts";
import { UI_NAMES, ui } from "../src/lib/ui-icons.ts";
import { SUGGESTIONS } from "../src/lib/search.ts";
import {
  HEROES,
  HOLIDAY_TILES,
  MIDOS_TILES,
  MITZVOS_TILES,
  TOPIC_TILES,
} from "../src/lib/tiles.ts";

import { crossingPairs, fourPointStars } from "./geometry.ts";

describe("no cross-like shapes (owner rule, kids.md §8.4)", () => {
  it("the checks catch a plus, an X and a four-pointed sparkle", () => {
    expect(crossingPairs('<path d="M24 10v28M10 24h28"/>')).toBe(1);
    expect(crossingPairs('<path d="M6 6l12 12M18 6 6 18"/>')).toBe(1);
    expect(fourPointStars('<path d="M38 4l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z"/>')).toBe(1);
    expect(
      fourPointStars(
        '<path d="M24 5l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L24 33.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8Z"/>',
      ),
    ).toBe(0);
  });

  // Skip the crossing check (the four-pointed check still applies):
  // - a Magen David is two overlapping triangles: allowed (owner);
  // - sun/smile-sun rays, crossed bonfire logs and the globe's grid were restored by the owner's
  //   review of 2026-11-25 ("old sun was better"): plain drawings, not decorative crosses.
  const MAGEN_DAVID = new Set(["siddur", "shield", "sun", "smile-sun", "bonfire", "globe"]);
  it.each(ICON_NAMES)("icon %s", (name) => {
    const svg = iconBody(name, { accent: "#FFC83D" });
    expect(fourPointStars(svg)).toBe(0);
    if (!MAGEN_DAVID.has(name)) expect(crossingPairs(svg)).toBe(0);
  });

  // Owner: an X (close/remove) or + is a universal control, not decoration; only artwork is checked.
  const UI_CONTROL_GLYPHS = new Set(["close"]);
  it.each(UI_NAMES)("interface icon %s", (name) => {
    const svg = ui(name);
    expect(fourPointStars(svg)).toBe(0);
    if (!UI_CONTROL_GLYPHS.has(name)) expect(crossingPairs(svg)).toBe(0);
  });

  it("the luchos are square: straight edges only, no arched tops (Bava Basra 14a)", () => {
    const svg = iconBody("luchos", { accent: "#FFC83D" });
    for (const m of svg.matchAll(/\sd="([^"]+)"/g)) expect(m[1]).not.toMatch(/[aAcCqQsStT]/);
    expect(svg).not.toMatch(/<(circle|ellipse)/);
    expect(svg).not.toMatch(/\srx=/);
  });

  it("the menorah has straight diagonal branches, level lights and a raised shamash (the Rambam's drawing)", () => {
    const svg = iconBody("menorah", { accent: "#FFC83D" });
    for (const m of svg.matchAll(/\sd="([^"]+)"/g)) expect(m[1]).not.toMatch(/[aAcCqQsStT]/);
    expect(svg).not.toMatch(/<(circle|ellipse)/);
  });

  const patterns: Pattern[] = [
    "forest",
    "hills",
    "scroll",
    "rooftops",
    "crowns",
    "dots",
    "city",
    "waves",
  ];
  it.each(patterns)("cover pattern %s", (pattern) => {
    // The emblem sits on an opaque disk above the pattern; check the pattern and corner marks alone.
    const svg = coverSvg({
      family: "blue",
      step: 1,
      pattern,
      emblem: "dot",
      episode: 123,
      chapter: 4,
    });
    expect(fourPointStars(svg)).toBe(0);
    expect(crossingPairs(svg)).toBe(0);
  });
});

/** Owner rule: only kosher animals anywhere (kids.md §8.4). */
const NON_KOSHER = [
  "lion",
  "bear",
  "eagle",
  "horse",
  "wolf",
  "fox",
  "pig",
  "dog",
  "cat",
  "rabbit",
  "hare",
  "camel",
  "donkey",
  "mouse",
  "snake",
  "frog",
  "owl",
  "raven",
  "monkey",
  "elephant",
  "tiger",
  "leopard",
];
/** Explicit, owner-approved exceptions: icon name -> animal words it may mention. */
const ALLOWED: Record<string, readonly string[]> = {
  // The Baal Shem Tov's wagon may have a horse (owner, 2026-11-25).
  "forest-wagon": ["horse"],
};

describe("only kosher animals (owner rule, kids.md §8.4)", () => {
  const words = (s: string) => s.toLowerCase().split(/[^a-z]+/);
  it("no icon name names a non-kosher animal (except the listed exceptions)", () => {
    for (const name of ICON_NAMES) {
      const bad = words(name).filter(
        (w) => NON_KOSHER.includes(w) && !(ALLOWED[name] ?? []).includes(w),
      );
      expect(bad, name).toEqual([]);
    }
  });
  it("no tile label, description or icon names one", () => {
    const tiles = [...TOPIC_TILES, ...MIDOS_TILES, ...MITZVOS_TILES, ...HOLIDAY_TILES];
    for (const t of tiles) {
      for (const w of words(`${t.label} ${t.description} ${t.icon}`))
        expect(NON_KOSHER, t.slug).not.toContain(w);
    }
    for (const [id, h] of Object.entries(HEROES)) {
      const bad = words(`${h.label} ${h.description} ${h.icon}`).filter(
        (w) => NON_KOSHER.includes(w) && !(ALLOWED[h.icon] ?? []).includes(w),
      );
      expect(bad, id).toEqual([]);
    }
  });
  it("search suggestions name none", () => {
    for (const s of SUGGESTIONS) for (const w of words(s)) expect(NON_KOSHER).not.toContain(w);
  });
});

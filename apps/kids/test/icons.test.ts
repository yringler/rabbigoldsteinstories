/**
 * Owner rule (kids.md §8.4): no four-pointed stars, plus signs, X marks or other cross-like shapes in
 * icons, cover patterns or emblems. A geometric check over every straight-line path: no two strokes
 * may cross each other in their middles, and no closed polygon may be a four-pointed star.
 */
import { describe, expect, it } from "vitest";
import { ICON_NAMES, iconBody } from "../src/lib/icons.ts";
import { coverSvg, type Pattern } from "../src/lib/covers.ts";
import { UI_NAMES, ui } from "../src/lib/ui-icons.ts";

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

  // A Magen David is two overlapping triangles: allowed (owner), so these two skip the crossing check.
  const MAGEN_DAVID = new Set(["siddur", "shield"]);
  it.each(ICON_NAMES)("icon %s", (name) => {
    const svg = iconBody(name, { accent: "#FFC83D" });
    expect(fourPointStars(svg)).toBe(0);
    if (!MAGEN_DAVID.has(name)) expect(crossingPairs(svg)).toBe(0);
  });

  it.each(UI_NAMES)("interface icon %s", (name) => {
    const svg = ui(name);
    expect(fourPointStars(svg)).toBe(0);
    expect(crossingPairs(svg)).toBe(0);
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

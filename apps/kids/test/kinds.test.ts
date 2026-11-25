import { describe, expect, it } from "vitest";
import { inBand, inVariant, kindOf, variantOf, variantsOf } from "../src/lib/kinds.ts";

describe("kindOf (kids.md §2)", () => {
  it("maps content types to the five kinds", () => {
    expect(kindOf("radio_episode", [])).toBe("show");
    for (const ct of ["story", "story_chapter", "lesson_with_story", "story_collection"])
      expect(kindOf(ct, [])).toBe("story");
    expect(kindOf("radio_segment", ["chassidic"])).toBe("story");
    expect(kindOf("radio_segment", [])).toBe("short");
    expect(kindOf("talk", [])).toBe("short");
    expect(kindOf("live_event", [])).toBe("event");
    expect(kindOf("song", [])).toBe("song");
    for (const ct of ["shiur", "fragment", "promo", "family_recording"])
      expect(kindOf(ct, [])).toBeNull();
  });
});

describe("age bands (§8.1 + DECISIONS: Little admits age 5 with no advisories)", () => {
  it("Little: age <= 4 without moderate, or age 5 with no advisories", () => {
    expect(inBand(3, 0, "little")).toBe(true);
    expect(inBand(4, 1, "little")).toBe(true);
    expect(inBand(4, 2, "little")).toBe(false);
    expect(inBand(5, 0, "little")).toBe(true);
    expect(inBand(5, 1, "little")).toBe(false);
    expect(inBand(6, 0, "little")).toBe(false);
  });
  it("Kids: age <= 6 without moderate", () => {
    expect(inBand(6, 1, "kids")).toBe(true);
    expect(inBand(6, 2, "kids")).toBe(false);
    expect(inBand(7, 0, "kids")).toBe(false);
  });
  it("Big Kids: the whole pool", () => {
    expect(inBand(9, 2, "big")).toBe(true);
  });
  it("Gentle restricts every band to items with no advisories", () => {
    expect(inVariant(4, 1, "lg")).toBe(false);
    expect(inVariant(9, 0, "bg")).toBe(true);
    expect(inVariant(9, 1, "bg")).toBe(false);
    expect(variantOf("kids", true)).toBe("kg");
    expect(variantsOf(5, 0)).toEqual(["l", "k", "b", "lg", "kg", "bg"]);
    expect(variantsOf(8, 2)).toEqual(["b"]);
  });
});

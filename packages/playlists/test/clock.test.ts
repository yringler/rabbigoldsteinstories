import { describe, expect, it } from "vitest";
import { editionAt, editionById, editionsAround, pickEdition, zonedToUtc } from "../src/index.ts";

describe("edition clock (09:00 America/New_York, daily)", () => {
  it("flips at 09:00 New York, DST-aware", () => {
    expect(new Date(zonedToUtc("2026-11-25", "09:00", "America/New_York")).toISOString()).toBe(
      "2026-11-25T14:00:00.000Z",
    );
    expect(new Date(zonedToUtc("2026-07-01", "09:00", "America/New_York")).toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
  });

  it("names the edition by the civil date of its flip", () => {
    expect(editionAt(new Date("2026-11-25T13:59:00Z")).id).toBe("2026-11-24");
    const e = editionAt(new Date("2026-11-25T14:00:00Z"));
    expect(e).toEqual({
      id: "2026-11-25",
      starts_at: "2026-11-25T14:00:00.000Z",
      ends_at: "2026-11-26T14:00:00.000Z",
    });
  });

  it("handles the DST change (23- and 25-hour editions)", () => {
    expect(editionById("2027-03-13")).toEqual({
      id: "2027-03-13",
      starts_at: "2027-03-13T14:00:00.000Z",
      ends_at: "2027-03-14T13:00:00.000Z",
    });
    expect(editionById("2026-10-31")?.ends_at).toBe("2026-11-01T14:00:00.000Z");
  });

  it("lists editions around now without gaps", () => {
    const w = editionsAround(new Date("2026-11-25T20:00:00Z"), 7, 14);
    expect(w).toHaveLength(22);
    expect(w[7]!.id).toBe("2026-11-25");
    for (let i = 1; i < w.length; i++) expect(w[i]!.starts_at).toBe(w[i - 1]!.ends_at);
  });

  it("supports a 12-hour rotation as a config change", () => {
    const cfg = { rotationHours: 12 as const, flipTz: "America/New_York", flipLocal: "09:00" };
    expect(editionAt(new Date("2026-11-26T03:00:00Z"), cfg).id).toBe("2026-11-25-pm");
  });

  it("pickEdition prefers the window containing now, else the newest started", () => {
    const eds = editionsAround(new Date("2026-11-25T20:00:00Z"), 2, 2);
    expect(pickEdition(eds, new Date("2026-11-25T20:00:00Z"))?.id).toBe("2026-11-25");
    expect(pickEdition(eds.slice(0, 2), new Date("2026-11-25T20:00:00Z"))?.id).toBe("2026-11-24");
    expect(pickEdition([], Date.now())).toBeNull();
  });
});

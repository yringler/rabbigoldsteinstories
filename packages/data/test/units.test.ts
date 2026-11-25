/**
 * The playlist unit pool against the real metadata (docs/sites/bedtime.md §7, criteria 1–6).
 * Owned by the bedtime team, next to units.ts / energy.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build/build.ts";
import { inputFingerprint, loadRecordings, outDir } from "../src/build/io.ts";
import { hiddenSpans, overlapsAny } from "../src/privacy.ts";
import type { RawMeta } from "../src/raw.ts";
import type { Manifest, Unit, UnitPool } from "../src/types.ts";

let units: Unit[];
let byId: Map<string, RawMeta>;

beforeAll(() => {
  const out = outDir();
  const manifestPath = join(out, "manifest.json");
  const fresh =
    existsSync(manifestPath) &&
    (JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest).input_fingerprint ===
      inputFingerprint();
  if (!fresh) build();
  units = (JSON.parse(readFileSync(join(out, "units.json"), "utf8")) as UnitPool).units;
  byId = new Map(loadRecordings().map((r) => [r.meta.id, r.meta]));
});

const hours = (us: Unit[]) => us.reduce((s, u) => s + u.duration_sec, 0) / 3600;

describe("unit pool (bedtime.md §4.2)", () => {
  it("has the expected size (within 10% of the measured 487 units)", () => {
    const kinds: Record<string, number> = {};
    for (const u of units) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    console.log("unit pool:", units.length, "units,", hours(units).toFixed(1), "h", kinds);
    expect(units.length).toBeGreaterThan(487 * 0.9);
    expect(units.length).toBeLessThan(487 * 1.1);
    expect(hours(units)).toBeGreaterThan(100);
  });

  it("only uses publishable, preferred, English, children's recordings (criterion 1)", () => {
    for (const u of units) {
      for (const t of u.tracks) {
        const m = byId.get(t.id)!;
        expect(m, t.id).toBeDefined();
        expect(m.quality.publish_recommendation).not.toBe("hide");
        expect(m.relations.some((r) => r.type === "superseded_by")).toBe(false);
        expect(m.language.primary).toBe("en");
        expect(m.audience.age_min).toBeLessThanOrEqual(10);
        expect(m.audience.advisories.some((a) => a.severity === "strong")).toBe(false);
        expect(m.audience.privacy.some((p) => p.flag === "private_family")).toBe(false);
      }
    }
  });

  it("never overlaps a hidden span, including the opening-song lead-in (criterion 2)", () => {
    for (const u of units) {
      for (const t of u.tracks) {
        const spans = hiddenSpans(byId.get(t.id)!.hidden, 0);
        expect(overlapsAny(t.start_sec, t.end_sec, spans), `${u.unit} ${t.id}`).toBe(false);
        if (t.intro_start_sec !== undefined)
          expect(overlapsAny(t.intro_start_sec, t.end_sec, spans), `${u.unit} intro`).toBe(false);
      }
    }
  });

  it("has no excluded content types and no whole radio episodes (criterion 3)", () => {
    const banned = new Set([
      "shiur",
      "talk",
      "live_event",
      "family_recording",
      "fragment",
      "song",
      "promo",
    ]);
    for (const u of units) {
      for (const t of u.tracks) {
        const m = byId.get(t.id)!;
        expect(banned.has(m.classification.content_type), `${u.unit}`).toBe(false);
        if (m.classification.content_type === "radio_episode")
          expect(u.kind === "span" || u.kind === "serial", u.unit).toBe(true);
      }
    }
  });

  it("plays story chapters and serial chapters only inside complete blocks, in order (criterion 4)", () => {
    for (const u of units) {
      for (const t of u.tracks) {
        const m = byId.get(t.id)!;
        if (m.classification.content_type === "story_chapter") expect(u.kind).toBe("set");
      }
      if (u.kind === "set") {
        expect(u.tracks.length).toBeGreaterThanOrEqual(2);
        expect(u.block?.of).toBe(u.tracks.length);
        u.tracks.forEach((t, i) =>
          expect(byId.get(t.id)!.classification.part?.part_number).toBe(i + 1),
        );
      }
      if (u.kind === "serial") expect(u.tracks.length).toBeGreaterThanOrEqual(2);
      if (u.kind === "span") {
        const m = byId.get(u.tracks[0]!.id)!;
        expect(m.classification.standalone).not.toBe("cliffhanger");
      }
    }
  });

  it("applies the opening-song rule: the story starts after a short opening song", () => {
    const withIntro = units.filter((u) => u.tracks[0]?.intro_start_sec !== undefined);
    expect(withIntro.length).toBeGreaterThan(50);
    for (const u of withIntro) {
      const t = u.tracks[0]!;
      const m = byId.get(t.id)!;
      const first = [...(m.segments ?? [])].sort((a, b) => a.start_sec - b.start_sec)[0]!;
      expect(first.type).toBe("song");
      expect(t.start_sec).toBeCloseTo(first.end_sec ?? -1, 1);
      expect(t.start_sec).toBeLessThan(180);
      expect(t.intro_start_sec!).toBeLessThan(t.start_sec);
    }
  });

  it("reproduces the energy spot checks (criterion 6)", () => {
    const score = (title: string) =>
      units.filter((u) => u.title === title).map((u) => u.energy ?? NaN);
    expect(score("Little Avraham Searches for Hashem").every((e) => e <= -3)).toBe(true);
    expect(score("Reb Yosef Mokir Shabbos").every((e) => e === -2)).toBe(true);
    expect(score("Reb Gavriel and the Pirates")).toEqual([5]);
    expect(Math.max(...score("The Tall Chanukah Candles"))).toBe(8);
    for (const u of units) {
      const e = u.energy!;
      expect(u.band).toBe(e <= 0 ? "calm" : e <= 3 ? "middle" : "exciting");
    }
  });

  it("gives every unit dedupe keys that include its own recordings", () => {
    for (const u of units) for (const t of u.tracks) expect(u.keys).toContain(t.id);
  });
});

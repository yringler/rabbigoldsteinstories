/**
 * The playlist unit pool against the real metadata (docs/sites/bedtime.md §7, criteria 1–6).
 * Owned by the bedtime team, next to units.ts / energy.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build/build.ts";
import { inputFingerprint, loadRecordings, outDir } from "../src/build/io.ts";
import { runGate } from "../src/build/gate.ts";
import { buildTerms } from "../src/build/terms.ts";
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
  it("has the expected size (within 10% of the measured 514 story units and 258 radio units)", () => {
    const kinds: Record<string, number> = {};
    for (const u of units) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    console.log("unit pool:", units.length, "units,", hours(units).toFixed(1), "h", kinds);
    const radio = units.filter((u) => u.kind === "episode" || u.kind === "episodes");
    const story = units.filter((u) => !radio.includes(u) && u.kind !== "segment");
    expect(story.length).toBeGreaterThan(514 * 0.9);
    expect(story.length).toBeLessThan(514 * 1.1);
    expect(radio.length).toBeGreaterThan(258 * 0.9);
    expect(radio.length).toBeLessThan(258 * 1.1);
    expect(hours(story)).toBeGreaterThan(100);
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

  it("carries no hidden text: the privacy gate finds nothing in units.json (criterion 2)", () => {
    // Since the owner's decision of 2026-11-25 a track MAY overlap a hidden span (names read on
    // air may be heard), so overlap is not checked. What must never happen is hidden TEXT in the
    // published pool: no internal keys, no name, address or phone number from any hidden block.
    const findings = runGate([outDir()], buildTerms()).filter((f) => f.file.endsWith("units.json"));
    expect(findings).toEqual([]);
    const raw = readFileSync(join(outDir(), "units.json"), "utf8");
    for (const key of ['"hidden"', '"on_air_people"', '"privacy"', '"identity_guesses"'])
      expect(raw).not.toContain(key);
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
        // A whole radio episode plays only on Radio Night; the story playlists use spans of it.
        if (m.classification.content_type === "radio_episode")
          expect(["span", "serial", "episode", "episodes", "segment"], u.unit).toContain(u.kind);
        if (u.kind === "episode" || u.kind === "episodes")
          expect(m.classification.content_type).toBe("radio_episode");
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
        // A span is one story segment (plus its intro): never a serial chapter, never a
        // name-heavy segment (Shema guests, mailbox, announcements).
        const m = byId.get(u.tracks[0]!.id)!;
        const t = u.tracks[0]!;
        const inside = (m.segments ?? []).filter(
          (x) => x.start_sec >= t.start_sec - 0.01 && x.start_sec < t.end_sec - 1,
        );
        const stories = inside.filter((x) => x.type === "story");
        expect(stories, u.unit).toHaveLength(1);
        const story = stories[0]!;
        // anything else must be the story's intro, or nested inside the story (a song in it)
        for (const x of inside)
          if (x.type !== "story" && x.type !== "story_intro")
            expect(
              x.start_sec >= story.start_sec &&
                (x.end_sec ?? Infinity) <= (story.end_sec ?? Infinity),
              `${u.unit} ${x.type}`,
            ).toBe(true);
      }
      if (u.kind === "episodes") {
        // a serial on Radio Night: its complete airing, consecutive episodes, at most four
        expect(u.tracks.length).toBeGreaterThanOrEqual(2);
        expect(u.tracks.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it("makes radio segments tracks only for talks, songs and the occasional extras (owner, 2026-11-25)", () => {
    const segs = units.filter((u) => u.kind === "segment");
    expect(segs.length).toBeGreaterThan(1000);
    const allowed = new Set([
      "talk",
      "halachah",
      "sichah",
      "song",
      "opening",
      "closing",
      "quiz",
      "tzedakah",
      "shema_guest",
    ]);
    for (const u of segs) {
      expect(allowed.has(u.segment ?? ""), u.unit).toBe(true);
      // never mailbox, announcements, sponsors on their own
      expect(["mailbox", "announcement", "sponsor"]).not.toContain(u.segment);
    }
    // Shema guests keep the dataset's generic title (the real one can name a child or school).
    for (const u of segs.filter((x) => x.segment === "shema_guest")) {
      expect(u.title).toBe("Shema with a guest");
      expect(u.tracks[0]!.title).toBe("Shema with a guest");
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
    // Spans of an episode with several stories carry story-scoped keys (`<id>~<story>`), so two
    // stories of one episode are not "the same thing".
    for (const u of units)
      for (const t of u.tracks)
        expect(
          u.keys.some((k) => k === t.id || k.startsWith(`${t.id}~`) || k.startsWith(`${t.id}@`)),
          u.unit,
        ).toBe(true);
  });
});

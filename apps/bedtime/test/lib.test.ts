import type { Playlist, PlaylistItem } from "@goldstein/playlists";
import { describe, expect, it } from "vitest";
import { isDeepLink } from "../src/lib/deeplink.ts";
import {
  CONTINUE_MS,
  continuable,
  endedRecently,
  parseTimer,
  sleepAction,
  type Session,
} from "../src/lib/session.ts";
import {
  aboutLength,
  cardMeta,
  clock,
  greeting,
  listEntries,
  nightLabel,
  TYPES,
} from "../src/lib/ui.ts";

const item = (over: Partial<PlaylistItem> = {}): PlaylistItem => ({
  id: "0123456789",
  unit: "0123456789",
  title: "A story",
  narrator: "Uncle Yossi",
  audio_url: "https://storiesmedia.torahlearningtools.com/a.mp3",
  mime_type: "audio/mpeg",
  start_sec: 0,
  end_sec: 600,
  duration_sec: 600,
  age_min: 4,
  band: "calm",
  advisories: [],
  block: null,
  ...over,
});
const playlist: Playlist = {
  id: "2026-11-25/calm",
  type: "calm",
  title: "Quiet Night",
  subtitle: "Soft, slow stories for drifting off.",
  total_min: 116,
  age_min: 6,
  items: [item(), item({ id: "1111111111", unit: "1111111111" })],
};
const session = (over: Partial<Session> = {}): Session => ({
  v: 1,
  playlist,
  when: "tonight",
  index: 1,
  position: 372,
  updated_at: 1_000_000,
  finished: false,
  ...over,
});

describe("playlist types", () => {
  it("are the five core types in the fixed order with the spec colours", () => {
    expect(TYPES.map((t) => t.type)).toEqual(["little", "big", "calm", "adventure", "mix"]);
    expect(TYPES.map((t) => t.color)).toEqual([
      "#F5B7A6",
      "#93BBF5",
      "#A5D0BE",
      "#F2A45C",
      "#C8B5F3",
    ]);
  });
});

describe("formatting", () => {
  it("says lengths the way the cards do", () => {
    expect(aboutLength(92)).toBe("about 1½ hours");
    expect(aboutLength(118)).toBe("about 2 hours");
    expect(aboutLength(48)).toBe("about 50 minutes");
    expect(cardMeta({ total_min: 121, age_min: 7 })).toBe("about 2 hours · ages 7+");
    expect(cardMeta({ total_min: 88, age_min: 0 })).toBe("about 1½ hours · ages 3+");
    expect(clock(372)).toBe("6:12");
    expect(clock(3725)).toBe("1:02:05");
  });

  it("labels nights by weekday and the night's Hebrew date", () => {
    expect(nightLabel({ date: "2026-11-24", hebrew_date: "15 Kislev 5787" })).toBe(
      "Tuesday night · 15 Kislev",
    );
    expect(nightLabel({ date: "2026-11-24", hebrew_date: null })).toBe("Tuesday night");
  });

  it("adds one seasonal line to the greeting", () => {
    const e = (date: string, heb: string, season: string[]) => ({ date, hebrew_date: heb, season });
    expect(greeting(null)).toBe("Good night.");
    expect(greeting(e("2026-11-25", "16 Kislev 5787", ["kislev", "yud_tes_kislev"]))).toBe(
      "Good night. Yud-Tes Kislev starts Saturday night.",
    );
    expect(greeting(e("2026-11-30", "21 Kislev 5787", ["chanukah", "kislev"]))).toBe(
      "Good night. Chanukah starts Friday night.",
    );
    expect(greeting(e("2026-12-04", "25 Kislev 5787", ["chanukah"]))).toBe(
      "Good night. Tonight is the first night of Chanukah.",
    );
    expect(greeting(e("2026-12-06", "27 Kislev 5787", ["chanukah"]))).toBe(
      "Good night. Tonight is the third night of Chanukah.",
    );
    expect(greeting(e("2026-11-20", "11 Kislev 5787", ["kislev"]))).toBe("Good night.");
  });

  it("groups the parts of a block in the track list", () => {
    const block = (part: number) =>
      item({
        title: `The Ten Wedding Gifts, Chapter ${part}`,
        block: { key: "g", title: "The Ten Wedding Gifts", part, of: 2 },
      });
    const entries = listEntries([item(), block(1), block(2), item()]);
    expect(entries.map((e) => e.kind)).toEqual(["track", "block", "track"]);
    const b = entries[1]!;
    expect(b.kind === "block" && b.parts.map((p) => p.index)).toEqual([1, 2]);
  });
});

describe("resume", () => {
  it("offers Continue for 18 hours, not after the end, not when broken", () => {
    const s = session();
    expect(continuable(s, s.updated_at + 1000)).toEqual(s);
    expect(continuable(s, s.updated_at + CONTINUE_MS + 1)).toBeNull();
    expect(continuable(session({ finished: true }), s.updated_at + 1000)).toBeNull();
    expect(continuable(session({ index: 9 }), s.updated_at + 1000)).toBeNull();
    expect(continuable({ v: 2 }, 0)).toBeNull();
    expect(continuable(null, 0)).toBeNull();
    expect(endedRecently(session({ finished: true }), s.updated_at + 1000)).toBe(true);
    expect(endedRecently(session({ finished: true }), s.updated_at + CONTINUE_MS + 1)).toBe(false);
  });
});

describe("sleep timer", () => {
  it("defaults to 45 and remembers only valid choices", () => {
    expect(parseTimer(null)).toBe(45);
    expect(parseTimer(30)).toBe(30);
    expect(parseTimer("end")).toBe("end");
    expect(parseTimer(20)).toBe(45);
  });

  it("finishes a story that ends within 4 minutes, else fades, else (iOS) stops at the boundary within 4 minutes", () => {
    expect(sleepAction(200, true)).toEqual({ kind: "boundary", hardStopAfterSec: null });
    expect(sleepAction(200, false)).toEqual({ kind: "boundary", hardStopAfterSec: null });
    expect(sleepAction(600, true)).toEqual({ kind: "fade" });
    expect(sleepAction(600, false)).toEqual({ kind: "boundary", hardStopAfterSec: 240 });
  });
});

describe("site worker", () => {
  it("treats /p/<edition>/<type> as a deep link to the home page", () => {
    expect(isDeepLink("/p/2026-11-25/calm")).toBe(true);
    expect(isDeepLink("/p/2026-11-25/calm/")).toBe(true);
    expect(isDeepLink("/p/2026-11-25-pm/little/")).toBe(true);
    expect(isDeepLink("/p/../secret")).toBe(false);
    expect(isDeepLink("/p/2026-11-25/")).toBe(false);
  });
});

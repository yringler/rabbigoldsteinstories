import { describe, expect, it } from "vitest";
import type { Rec } from "../src/lib/records.ts";
import { itemTrack, recTrack } from "../src/lib/tracks.ts";

// AI-improved sound (docs/design/ai-audio.md §3.2): tracks carry clean_url only when flagged.
const url =
  "https://storiesmedia.torahlearningtools.com/goldstein/audio/Yiddish/Tanya%20Shiurim%20-%20R%27%20Yosef%20Goldstein/Shiur%2022%2C%20x.mp3";
const clean =
  "https://storiesmedia.torahlearningtools.com/goldstein/audio_clean/Yiddish/Tanya%20Shiurim%20-%20R%27%20Yosef%20Goldstein/Shiur%2022%2C%20x.mp3";

describe("clean_url on kids tracks", () => {
  it("itemTrack derives clean_url only when the item is flagged", () => {
    const base = { id: "abcdef0123", title: "T", url, start: 0 };
    expect(itemTrack(base).clean_url).toBeUndefined();
    expect("clean_url" in itemTrack({ ...base, clean: false })).toBe(false);
    const t = itemTrack({ ...base, clean: true });
    expect(t.url).toBe(url);
    expect(t.clean_url).toBe(clean);
  });

  it("recTrack reads the compact cl flag", () => {
    const r: Rec = { id: "abcdef0123", t: "T", k: "story", d: 60, a: 4, v: 0, u: url, r: 0 };
    expect("clean_url" in recTrack(r)).toBe(false);
    expect(recTrack({ ...r, cl: 1 }).clean_url).toBe(clean);
  });
});

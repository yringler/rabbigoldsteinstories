import { describe, expect, it } from "vitest";
import { cite, type CiteInput } from "../src/lib/citation.ts";
import { displayDate, hebrewDate, hebrewYearSpan } from "../src/lib/dates.ts";
import { citeInput, item } from "../src/lib/site-data.ts";
import { parseTime } from "../src/lib/time.ts";

const ORIGIN = "https://storylibrary.torahlearningtools.com";

describe("citations", () => {
  it("Episode 271 at 12:34 (acceptance 14)", () => {
    const c = cite(citeInput(item("585fe67e3e")), 754);
    expect(c.short).toBe("Uncle Yossi, Tzivos Hashem on the Air, ep. 271, 1 Nissan 5747, 12:34");
    expect(c.full).toBe(
      `Rabbi Yosef Goldstein (Uncle Yossi), "The Mystery of Dayeinu (Rosh Chodesh Nissan)," Tzivos Hashem on the Air, episode 271, broadcast 1 Nissan 5747 (31 March 1987), at 12:34. The Goldstein Story Archive, ${ORIGIN}/r/585fe67e3e/?t=754`,
    );
    expect(c.link).toBe(`${ORIGIN}/r/585fe67e3e/?t=754`);
  });

  it("omits the time part when no time is given", () => {
    const c = cite(citeInput(item("585fe67e3e")));
    expect(c.short).toBe("Uncle Yossi, Tzivos Hashem on the Air, ep. 271, 1 Nissan 5747");
    expect(c.link).toBe(`${ORIGIN}/r/585fe67e3e/`);
    expect(c.full).toContain("(31 March 1987). The Goldstein");
  });

  const base: CiteInput = {
    id: "0123456789",
    title: "Melave Malka: The Special Guest",
    speakers: [
      { id: "rabbi_chaim_levi_goldstein", label: "Rabbi Chaim Levi Goldstein", unconfirmed: false },
    ],
    series: {
      id: "weekly_story_i_believe",
      label: "Weekly Story (working title)",
      unconfirmed: true,
    },
    origin: ORIGIN,
    siteName: "The Goldstein Story Archive",
  };

  it("non-radio: speaker and title; an unconfirmed series name is never asserted", () => {
    const c = cite(base, 250);
    expect(c.full).toBe(
      `Rabbi Chaim Levi Goldstein, "Melave Malka: The Special Guest," at 4:10. The Goldstein Story Archive, ${ORIGIN}/r/0123456789/?t=250`,
    );
    expect(c.short).toBe('Rabbi Chaim Levi Goldstein, "Melave Malka: The Special Guest", 4:10');
    expect(c.full).not.toContain("working title");
  });

  it("no speaker is named when unknown or an unconfirmed placeholder; the citation starts with the title", () => {
    for (const s of [
      { id: "unknown", label: "Unknown speaker", unconfirmed: false },
      {
        id: "yiddish_narrator_unconfirmed",
        label: "Yiddish storyteller (name unconfirmed)",
        unconfirmed: true,
      },
    ]) {
      const c = cite({ ...base, speakers: [s] });
      expect(c.full.startsWith('"Melave Malka: The Special Guest."')).toBe(true);
      expect(c.short.startsWith('"Melave Malka')).toBe(true);
      expect(c.full).not.toMatch(/unconfirmed|Unknown/);
    }
  });

  it("date wording follows precision", () => {
    const week = cite({
      ...base,
      date: { gregorian: "1988-01-12", precision: "week", basis: "x" },
    });
    expect(week.short).toContain("week of 12 January 1988");
    const year = cite({ ...base, date: { hebrew_year: 5748, precision: "year", basis: "x" } });
    expect(year.short).toContain("c. 5748");
    const unknown = cite({ ...base, date: { precision: "unknown", basis: "x" } });
    expect(unknown.short).toBe('Rabbi Chaim Levi Goldstein, "Melave Malka: The Special Guest"');
  });
});

describe("dates and times", () => {
  it("Hebrew dates from the platform calendar, in the archive's spelling", () => {
    expect(hebrewDate("1987-03-31")).toBe("1 Nissan 5747");
    expect(hebrewDate("1987-01-10")).toBe("9 Teves 5747");
    expect(hebrewYearSpan(5747)).toBe("1986–87");
    expect(
      displayDate({
        gregorian: "1987-03-31",
        hebrew: "1 Nissan 5747",
        precision: "day",
        basis: "filename",
      }).gregorian,
    ).toBe("Tuesday 31 March 1987");
  });

  it("?t= accepts seconds, 12m34s and 12:34", () => {
    expect(parseTime("754")).toBe(754);
    expect(parseTime("12m34s")).toBe(754);
    expect(parseTime("12:34")).toBe(754);
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime("1h2m3s")).toBe(3723);
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
});

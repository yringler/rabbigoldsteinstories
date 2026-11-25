import { describe, expect, it } from "vitest";
import { buildTermSet, findTerms, hiddenSpans, nameVariants, overlapsAny, redactTerms, REDACTED } from "../src/privacy.ts";
import type { RawHidden } from "../src/raw.ts";
import { redactPhones } from "../src/build/transform.ts";

const hidden = (h: Partial<RawHidden>): RawHidden => ({ on_air_people: [], addresses: [], other_personal: [], ...h });

describe("hidden spans", () => {
  it("pads spans and assumes a default length when end_sec is missing", () => {
    const spans = hiddenSpans(hidden({ on_air_people: [{ name: "A B", role: "birthday", start_sec: 100 }] }));
    expect(spans).toEqual([{ start: 98, end: 162 }]);
    expect(overlapsAny(150, 155, spans)).toBe(true);
    expect(overlapsAny(10, 97, spans)).toBe(false);
  });
});

describe("name variants", () => {
  it("splits lists, drops annotations and keeps surnames with the last name", () => {
    const v = nameVariants("Chani, Henny and Machli Farber (also heard as Farbor)");
    expect(v).toContain("Machli Farber");
    expect(v).toContain("Farbor");
    expect(nameVariants("Rabbi Bergstein Rabbi Stein")).toContain("Rabbi Stein");
  });
});

describe("term set", () => {
  const set = buildTermSet({
    hiddenBlocks: [
      hidden({
        on_air_people: [
          { name: "Estee Pressman", role: "shema_guest", start_sec: 1 },
          { name: "Moshe", role: "birthday", start_sec: 1 },
          { name: "Menachem Mendel", role: "shema_guest", start_sec: 1 },
          { name: "his children", role: "other", start_sec: 1 },
          { name: "Shmuel Kahan", role: "visitor", start_sec: 1 },
        ],
        addresses: [{ text: "1452 41st Street, Brooklyn", start_sec: 5 }],
        other_personal: [{ kind: "phone_number", text: "Called from 718-555-0123 on air", start_sec: 9 }],
      }),
    ],
    publicNames: ["The Rebbe (Rabbi Menachem Mendel Schneerson)"],
    allowlist: ["Shmuel Kahan"],
  });

  it("scans full names, addresses and phone numbers; skips single words, public names, allowlist and non-names", () => {
    expect(set.terms).toContain("estee pressman");
    expect(set.terms).toContain("1452 41st street brooklyn");
    expect(set.terms).toContain("7185550123");
    expect(set.terms).not.toContain("moshe");
    expect(set.terms).not.toContain("menachem mendel");
    expect(set.terms).not.toContain("his children");
    expect(set.terms).not.toContain("shmuel kahan");
  });

  it("finds terms regardless of case, punctuation and phone formatting", () => {
    expect(findTerms("Happy birthday, ESTEE  pressman!", set)).toEqual(["estee pressman"]);
    expect(findTerms("call (718) 555-0123", set)).toEqual(["7185550123"]);
    expect(findTerms("Esteem Pressman", set)).toEqual([]);
  });

  it("redacts display text", () => {
    expect(redactTerms("Thanks, Estee Pressman.", ["estee pressman"])).toBe(`Thanks, ${REDACTED}.`);
  });
});


describe("phone numbers in transcripts", () => {
  it("replaces every common spoken-number format", () => {
    for (const n of ["718-763-8200", "(718) 763-8200", "718 763 8200", "1-800-467-7800", "467-7800", "212.778.6666"]) {
      expect(redactPhones(`Call ${n} today`)).toBe("Call [phone number] today");
    }
  });
  it("leaves years, times and episode numbers alone", () => {
    for (const s of ["In 1987 we said", "at 7:30 tonight", "episode 271", "5747-5748"]) {
      expect(redactPhones(s)).toBe(s);
    }
  });
});

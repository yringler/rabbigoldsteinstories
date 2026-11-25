/** Jewish-calendar occasions in year order (Tishrei first), from the vocabulary's `when` text. */
import type { VocabEntry } from "@goldstein/data";

export const MONTHS = [
  "Tishrei",
  "Cheshvan",
  "Kislev",
  "Teves",
  "Shevat",
  "Adar",
  "Nissan",
  "Iyar",
  "Sivan",
  "Tammuz",
  "Av",
  "Elul",
] as const;
export type Month = (typeof MONTHS)[number];

/** Entries whose `when` does not name a month. */
const FALLBACK: Record<string, Month | "year"> = {
  shabbos_shuva: "Tishrei",
  simchas_beis_hashoeva: "Tishrei",
  shabbos_bereishis: "Tishrei",
  shabbos_hagadol: "Nissan",
  shabbos_zachor: "Adar",
  shabbos_shekalim: "Shevat",
  shabbos_shirah: "Shevat",
  shabbos_chazon: "Av",
  shabbos_nachamu: "Av",
  zos_chanukah: "Teves",
  summer_vacation: "Tammuz",
  winter: "Teves",
  shabbos_chazak: "year",
  rosh_chodesh: "year",
  shabbos_weekly: "year",
  shabbos_mevarchim: "year",
  hakhel_year: "year",
};

export function monthOf(e: Pick<VocabEntry, "id" | "when">): Month | "year" {
  const f = FALLBACK[e.id];
  if (f) return f;
  const w = e.when ?? "";
  // "25 Kislev - 2/3 Teves" → the first month named; "Sukkos nights" → fallback
  let best: { m: Month; at: number } | null = null;
  for (const m of MONTHS) {
    const at = w.indexOf(m);
    if (at >= 0 && (!best || at < best.at)) best = { m, at };
  }
  return best?.m ?? "year";
}

function dayOf(e: Pick<VocabEntry, "when">): number {
  return Number(/^(\d{1,2})/.exec(e.when ?? "")?.[1] ?? 0);
}

export function calendarGroups<T extends Pick<VocabEntry, "id" | "when">>(
  entries: readonly T[],
): { month: Month | "year"; entries: T[] }[] {
  const order: (Month | "year")[] = [...MONTHS, "year"];
  return order
    .map((month) => ({
      month,
      entries: entries.filter((e) => monthOf(e) === month).sort((a, b) => dayOf(a) - dayOf(b)),
    }))
    .filter((g) => g.entries.length > 0);
}

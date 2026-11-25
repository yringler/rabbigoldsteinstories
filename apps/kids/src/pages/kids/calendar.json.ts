// kids/calendar.json (§5.2, §5.5): 400 days from the build date (a few days back, for time zones).
import type { APIRoute } from "astro";
import { getModel } from "../../lib/build/model.ts";
import { buildCalendar, holidayMains } from "../../lib/build/calendar.ts";
import { HOLIDAY_TILES } from "../../lib/tiles.ts";
import { loadVocab } from "@goldstein/data/load";

const shortLabel = (s: string) => s.replace(/\s*\(.*\)\s*$/, "");
import type { CalendarFile } from "../../scripts/data.ts";

export const GET: APIRoute = () => {
  const m = getModel();
  const start = new Date();
  start.setDate(start.getDate() - 3);
  const labelOf = (id: string) => m.vocab("calendar", id)?.label ?? id;
  const labels: Record<string, string> = {};
  for (const t of HOLIDAY_TILES)
    for (const id of Object.keys(t.dates ?? {})) labels[id] = shortLabel(labelOf(id));
  for (const e of loadVocab().lists["parshiyos"] ?? []) labels[e.id] = e.label;
  const body: CalendarFile = {
    days: buildCalendar(start, 400, labelOf),
    mains: holidayMains(start, 400),
    labels,
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};

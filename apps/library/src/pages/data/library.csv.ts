/** Flat table of the public records (one row per recording). */
import type { APIRoute } from "astro";
import { toCsv } from "../../lib/export.ts";
import { allItems, ORIGIN } from "../../lib/site-data.ts";

export const GET: APIRoute = () =>
  new Response(toCsv(allItems(), ORIGIN), { headers: { "content-type": "text/csv; charset=utf-8" } });

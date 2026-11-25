/**
 * Display transcript of one English recording, for the side-by-side comparison on story-group
 * pages. Straight from the public, already-masked transcript (`t: null` = withheld line). Yiddish
 * recordings have no display transcript, so no file is written for them (DECISIONS 8).
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { loadTranscript } from "@goldstein/data/load";
import { catalog } from "../../lib/site-data.ts";

export const getStaticPaths = (() =>
  catalog()
    .filter((c) => c.transcript_display === "show_with_label" && c.language === "en")
    .map((c) => ({ params: { id: c.id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const t = loadTranscript(String(params["id"]));
  const body = t
    ? { v: 1, id: t.id, lang: "en", label: t.label, rows: t.lines.map((l) => [l.s, l.e, l.t]) }
    : null;
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};

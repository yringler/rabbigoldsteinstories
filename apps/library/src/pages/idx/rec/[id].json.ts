/** Player metadata for one recording: title, artist and chapter marks (for scrubber ticks). */
import type { APIRoute, GetStaticPaths } from "astro";
import { artist, catalog, item } from "../../../lib/site-data.ts";
import type { RecInfo } from "../../../lib/types.ts";

export const getStaticPaths = (() =>
  catalog().map((c) => ({ params: { id: c.id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const it = item(String(params["id"]));
  const info: RecInfo = {
    id: it.id,
    title: it.title,
    artist: artist(it.classification.speakers),
    chapters: it.segments.map((s, i) => [
      s.start_sec,
      s.end_sec ?? it.segments[i + 1]?.start_sec ?? it.content_end_sec,
      s.title,
    ]),
  };
  return new Response(JSON.stringify(info), { headers: { "content-type": "application/json" } });
};

/** JSON Schema of the playlists file (version 1). */
import type { APIRoute } from "astro";
import { playlistSchema } from "../../lib/playlists.ts";
import { ORIGIN } from "../../lib/site-data.ts";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(playlistSchema(ORIGIN), null, 2), {
    headers: { "content-type": "application/schema+json" },
  });

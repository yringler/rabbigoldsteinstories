/** JSON Schema of one record in /data/library.json. */
import type { APIRoute } from "astro";
import { recordSchema } from "../../lib/export.ts";
import { ORIGIN } from "../../lib/site-data.ts";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(recordSchema(ORIGIN), null, 2), {
    headers: { "content-type": "application/schema+json" },
  });

/** Every public recording record, exactly as the site uses it. */
import type { APIRoute } from "astro";
import { allItems } from "../../lib/site-data.ts";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(allItems()), { headers: { "content-type": "application/json" } });

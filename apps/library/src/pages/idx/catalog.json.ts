/** Client catalog for /search, playlists and tonight's pages (public fields only). */
import type { APIRoute } from "astro";
import { libCatalog } from "../../lib/site-data.ts";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(libCatalog()), { headers: { "content-type": "application/json" } });

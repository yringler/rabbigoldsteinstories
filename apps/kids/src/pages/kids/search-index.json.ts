// The MiniSearch index (fields of §6.5 only), loaded on the first visit to /search.
import type { APIRoute } from "astro";
import { buildSearchIndex } from "../../lib/build/search-docs.ts";

export const GET: APIRoute = () =>
  new Response(buildSearchIndex(), { headers: { "Content-Type": "application/json" } });

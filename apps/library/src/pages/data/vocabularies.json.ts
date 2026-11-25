/** Public labels for every vocabulary id (no review-history descriptions, no ASR glossary). */
import type { APIRoute } from "astro";
import { publicLabels } from "../../lib/export.ts";
import { vocab } from "../../lib/site-data.ts";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(publicLabels(vocab())), { headers: { "content-type": "application/json" } });

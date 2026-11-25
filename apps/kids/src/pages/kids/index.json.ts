// kids/index.json: one compact record per kid-pool item (§9), loaded by the client.
import type { APIRoute } from "astro";
import { getModel } from "../../lib/build/model.ts";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(getModel().index), {
    headers: { "Content-Type": "application/json" },
  });

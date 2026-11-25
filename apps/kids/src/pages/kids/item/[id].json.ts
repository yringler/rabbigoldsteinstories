// Per-item extras for the player (loaded on demand): chapter marks with kid-safe labels (private
// segment types carry only generic labels), silence ranges to skip, next chapter, related ids.
import type { APIRoute, GetStaticPaths } from "astro";
import { getModel } from "../../../lib/build/model.ts";
import type { ItemExtra } from "../../../scripts/data.ts";

export const getStaticPaths = (() =>
  [...getModel().items.keys()].map((id) => ({ params: { id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const m = getModel();
  const id = String(params["id"]);
  const k = m.items.get(id);
  if (!k) return new Response("{}", { status: 404 });
  const next = m.chapterOf.get(id)?.next ?? null;
  const body: ItemExtra = {
    c: k.chapters,
    z: k.silence,
    n: next && m.poolIds.has(next) ? next : null,
    r: m.sim.related.get(id) ?? [],
    sum: k.item.summary_short,
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};

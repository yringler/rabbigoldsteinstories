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
  const rel = m.relatedByLang.get(id);
  const r = rel?.en ?? [];
  const same = (a: readonly string[]) => a.length === r.length && a.every((x, i) => x === r[i]);
  const body: ItemExtra = {
    c: k.chapters,
    z: k.silence,
    n: next && m.poolIds.has(next) ? next : null,
    r,
    sum: k.item.summary_short,
  };
  // "Both" and "Yiddish only" lists, only when they differ from the English one.
  if (rel && !same(rel.any)) body.ra = rel.any;
  if (rel && !same(rel.yi)) body.ry = rel.yi;
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};

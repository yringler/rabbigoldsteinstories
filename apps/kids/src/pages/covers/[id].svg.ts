// Generated cover for every item with a page (docs/sites/kids.md §8.4).
import type { APIRoute, GetStaticPaths } from "astro";
import { getModel } from "../../lib/build/model.ts";
import { coverSvg } from "../../lib/covers.ts";

export const getStaticPaths = (() =>
  [...getModel().items.keys()].map((id) => ({ params: { id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const k = getModel().items.get(String(params["id"]));
  if (!k) return new Response("not found", { status: 404 });
  return new Response(coverSvg(k.cover), { headers: { "Content-Type": "image/svg+xml" } });
};

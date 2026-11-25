// Serial and part-set covers: the chapters' shared emblem and background, with the chapter count.
import type { APIRoute, GetStaticPaths } from "astro";
import { getModel } from "../../../lib/build/model.ts";
import { coverSvg } from "../../../lib/covers.ts";

export const getStaticPaths = (() =>
  getModel().serials.map((s) => ({ params: { key: s.key } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const m = getModel();
  const s = m.serialByKey.get(String(params["key"]));
  const first = s?.chapters.find((c) => c.id)?.id;
  const k = first ? m.items.get(first) : undefined;
  if (!s || !k) return new Response("not found", { status: 404 });
  const { episode: _episode, ...rest } = k.cover;
  return new Response(coverSvg({ ...rest, chapter: s.chapters.length }), {
    headers: { "Content-Type": "image/svg+xml" },
  });
};

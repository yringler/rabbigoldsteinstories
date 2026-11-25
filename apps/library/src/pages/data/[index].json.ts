/** The public indexes: serials, story groups, series and lost episodes. */
import type { APIRoute, GetStaticPaths } from "astro";
import { lostEpisodes, serials, seriesIndex, storyGroups } from "../../lib/site-data.ts";

const FILES = {
  serials: () => serials(),
  "story-groups": () => storyGroups(),
  series: () => seriesIndex(),
  "lost-episodes": () => lostEpisodes(),
} as const;

export const getStaticPaths = (() => Object.keys(FILES).map((index) => ({ params: { index } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const f = FILES[String(params["index"]) as keyof typeof FILES];
  return new Response(JSON.stringify(f()), { headers: { "content-type": "application/json" } });
};

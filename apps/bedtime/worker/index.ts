// The bedtime site Worker. Static assets are served directly; wrangler.jsonc run_worker_first sends
// /playlists/*, /api/* (to goldstein-api over the service binding, via the shared siteWorker) and
// /p/* here. /p/<edition>/<type> is a deep link to one playlist (bedtime.md §2): it serves the
// home page, whose script opens that playlist's track list, but only for a published night
// (listed in /playlists/index.json: the 7 previous nights and tonight). Anything else is a 404.
import { siteWorker, type SiteEnv } from "@goldstein/api/proxy";
import type { IndexFile } from "@goldstein/playlists";
import { parseDeepLink } from "../src/lib/deeplink.ts";

async function published(env: SiteEnv, url: URL, edition: string): Promise<boolean> {
  try {
    const r = await env.API.fetch(new Request(new URL("/playlists/index.json", url)));
    if (!r.ok) return false;
    const index = (await r.json()) as IndexFile;
    return index.editions.some((e) => e.date === edition);
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/p/")) {
      // Not an asset: the assets binding answers with the 404 page and status.
      const link = parseDeepLink(url.pathname);
      if (!link || !(await published(env, url, link.edition))) return env.ASSETS.fetch(request);
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    }
    return siteWorker.fetch(request, env);
  },
} satisfies ExportedHandler<SiteEnv>;

// The bedtime site Worker. Static assets are served directly; wrangler.jsonc run_worker_first sends
// /playlists/*, /api/* (to goldstein-api over the service binding, via the shared siteWorker) and
// /p/* here. /p/<edition>/<type> is a deep link to one playlist (bedtime.md §2): it serves the
// home page, whose script opens that playlist's track list.
import { siteWorker, type SiteEnv } from "@goldstein/api/proxy";
import { isDeepLink } from "../src/lib/deeplink.ts";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/p/")) {
      // Anything else under /p/ is not an asset, so the assets binding answers with the 404 page.
      if (!isDeepLink(url.pathname)) return env.ASSETS.fetch(request);
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    }
    return siteWorker.fetch(request, env);
  },
} satisfies ExportedHandler<SiteEnv>;

/// <reference types="@cloudflare/workers-types" />
/**
 * The Worker every site uses (apps/<site>/worker/index.ts re-exports it). Static assets are served
 * by the assets binding before this code runs; wrangler.jsonc `run_worker_first` sends only
 * /playlists/* and /api/* here, which go to goldstein-api over the service binding `API`.
 */
export interface SiteEnv {
  ASSETS: Fetcher;
  API: Fetcher;
}

export const API_PATHS = ["/playlists/*", "/api/*"] as const;

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/playlists/") || pathname.startsWith("/api/");
}

export const siteWorker = {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    return isApiPath(pathname) ? env.API.fetch(request) : env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<SiteEnv>;

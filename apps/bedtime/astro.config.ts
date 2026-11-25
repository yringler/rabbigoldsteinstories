import { defineConfig } from "astro/config";
import type { Plugin } from "vite";
import { DEV_API_ORIGIN, SITES } from "@goldstein/config/sites";

// bedtime: static Astro site on Workers static assets. /playlists/* and /api/* are served by
// goldstein-api through the site Worker (worker/index.ts); in `astro dev` they are proxied to
// `npm run dev:api` (http://localhost:8787). /p/<edition>/<type> deep links are served the home
// page (by the Worker in production, by this plugin in dev).
const deepLinks: Plugin = {
  name: "bedtime-deep-links",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/p\/\d{4}-\d{2}-\d{2}(-pm)?\/[a-z]+\/?(\?.*)?$/.test(req.url))
        req.url = "/";
      next();
    });
  },
};

export default defineConfig({
  site: `https://${SITES.bedtime.host}`,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  server: { port: 4321 },
  vite: {
    plugins: [deepLinks],
    server: {
      proxy: {
        "/playlists": DEV_API_ORIGIN,
        "/api": DEV_API_ORIGIN,
      },
    },
  },
  devToolbar: { enabled: false },
});

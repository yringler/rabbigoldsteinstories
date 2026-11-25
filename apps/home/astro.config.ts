import { defineConfig } from "astro/config";
import { DEV_API_ORIGIN, SITES } from "@goldstein/config/sites";

// home: the landing page. Static Astro site on Workers static assets. /playlists/* and /api/* are
// served by goldstein-api through the site Worker (worker/index.ts); in `astro dev` they are
// proxied to `npm run dev:api` (http://localhost:8787).
export default defineConfig({
  site: `https://${SITES.home.host}`,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "always" },
  server: { port: 4324 },
  vite: {
    server: {
      proxy: {
        "/playlists": DEV_API_ORIGIN,
        "/api": DEV_API_ORIGIN,
      },
    },
  },
  devToolbar: { enabled: false },
});

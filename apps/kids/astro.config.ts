import { defineConfig } from "astro/config";
import { DEV_API_ORIGIN, SITES } from "@goldstein/config/sites";

// kids: static Astro site on Workers static assets. /playlists/* and /api/* are served by
// goldstein-api through the site Worker (worker/index.ts); in `astro dev` they are proxied to
// `npm run dev:api` (http://localhost:8787).
export default defineConfig({
  site: `https://${SITES.kids.host}`,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  server: { port: 4322 },
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

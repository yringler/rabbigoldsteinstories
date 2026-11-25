// The site Worker: static assets are served directly; only /playlists/* and /api/* run this code
// (wrangler.jsonc run_worker_first) and go to goldstein-api over the service binding.
export { siteWorker as default } from "@goldstein/api/proxy";

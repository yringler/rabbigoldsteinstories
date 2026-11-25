/// <reference types="@cloudflare/workers-types" />
/**
 * goldstein-api Worker entry. The unit pool and overrides are bundled at deploy time (wrangler
 * `alias` maps the virtual modules to packages/data/generated/units.json and
 * packages/playlists/overrides.json), so a data change ships by redeploying this Worker.
 */
import pool from "virtual:units";
import overrides from "virtual:overrides";
import { handle, runCron, type Deps } from "./app.ts";

export interface Env {
  EDITIONS: KVNamespace;
}

const deps = (env: Env): Deps => ({
  kv: env.EDITIONS,
  pool,
  overrides,
  log: (m) => console.warn(m),
});

export default {
  fetch: (request, env) => handle(request, deps(env)),
  scheduled: async (_event, env, ctx) => {
    ctx.waitUntil(
      runCron(deps(env)).then((r) =>
        console.log(
          `runway: generated ${r.generated.length}, kept ${r.kept.length}, failed ${r.failed.length}`,
        ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * goldstein-api request and cron handlers, independent of bindings (tests pass a fake KV).
 *
 * Routes (reached on every site through its Worker's service binding, same origin, no CORS):
 *   GET /playlists/index.json            clock: 7 past + current + up to 14 future editions
 *   GET /playlists/editions/<id>.json    one edition (tombstoned against the current pool)
 *   GET /playlists/tonight.json          the current edition
 *   GET /playlists/history.json          the 7 editions before it, newest first
 *   GET /api/health                      pool hash, edition counts
 * Cron (hourly): ensureRunway — generate missing/stale editions up to 14 days ahead, never
 * touching editions that start within 24 hours.
 */
import type { UnitPool } from "@goldstein/data";
import { editionById, type Edition } from "@goldstein/playlists";
import {
  buildViews,
  ensureRunway,
  RECIPES,
  tombstone,
  type EditionStore,
  type Overrides,
} from "@goldstein/playlists/engine";

export interface KVLike {
  get(key: string, options: { type: "json"; cacheTtl?: number }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Deps {
  kv: KVLike;
  pool: UnitPool;
  overrides: Overrides;
  log?: (msg: string) => void;
}

/** Editions are kept a year (cooldowns read 45 days back). */
const EDITION_TTL_SEC = 400 * 86_400;

/** cacheTtl: seconds KV may serve a cached read (KV minimum 30); omit it for reads that follow writes (cron). */
export function kvStore(kv: KVLike, cacheTtl?: number): EditionStore {
  const opts =
    cacheTtl === undefined
      ? { type: "json" as const }
      : { type: "json" as const, cacheTtl: Math.max(30, cacheTtl) };
  return {
    get: async (id) => ((await kv.get(`edition:${id}`, opts)) as Edition | null) ?? null,
    put: async (e) =>
      kv.put(`edition:${e.date}`, JSON.stringify(e), { expirationTtl: EDITION_TTL_SEC }),
  };
}

const SHORT = "public, max-age=300, stale-while-revalidate=3600";
const LONG = "public, max-age=3600, stale-while-revalidate=86400";

function json(body: unknown, cache: string, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function runCron(deps: Deps, now = new Date()) {
  // Writes must not use a cached read, or a just-written edition could be regenerated.
  const store = kvStore(deps.kv);
  return ensureRunway({
    store,
    pool: deps.pool,
    recipes: RECIPES,
    overrides: deps.overrides,
    now,
    ...(deps.log ? { log: deps.log } : {}),
  });
}

export async function handle(request: Request, deps: Deps, now = new Date()): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD")
    return json({ error: "method not allowed" }, "no-store", 405);
  const store = kvStore(deps.kv, 60);
  const path = url.pathname;

  if (path === "/api/health") {
    const views = await buildViews(store, deps.pool, now, deps.overrides);
    return json(
      {
        ok: true,
        pool_hash: deps.pool.pool_hash,
        units: deps.pool.units.length,
        editions: views.index.editions.length,
        current: views.current?.date ?? null,
      },
      "no-store",
    );
  }
  if (!path.startsWith("/playlists/")) return json({ error: "not found" }, "no-store", 404);

  let views = await buildViews(store, deps.pool, now, deps.overrides);
  if (!views.current) {
    // First request after a fresh deploy, before the cron has run: fill the runway now.
    await runCron(deps, now);
    views = await buildViews(kvStore(deps.kv), deps.pool, now, deps.overrides);
  }
  const file = path.slice("/playlists/".length);
  if (file === "index.json") return json(views.index, SHORT);
  if (file === "tonight.json")
    return views.current
      ? json(views.current, SHORT)
      : json({ error: "no edition" }, "no-store", 404);
  if (file === "history.json") return json(views.history, SHORT);
  const m = /^editions\/([0-9]{4}-[0-9]{2}-[0-9]{2}(?:-pm)?)\.json$/.exec(file);
  if (m && editionById(m[1]!)) {
    const e = await store.get(m[1]!);
    if (e) return json(tombstone(e, deps.pool, deps.overrides), LONG);
  }
  return json({ error: "not found" }, "public, max-age=60", 404);
}

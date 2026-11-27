/**
 * goldstein-api request and cron handlers, independent of bindings (tests pass a fake KV).
 *
 * Routes (reached on every site through its Worker's service binding, same origin, no CORS):
 *   GET /playlists/index.json            clock: 7 past + current edition (future ones are private)
 *   GET /playlists/editions/<id>.json    one edition (tombstoned against the current pool); only
 *                                        ids listed in index.json (past 7 + current), else 404
 *   GET /playlists/tonight.json          the current edition
 *   GET /playlists/history.json          the 7 editions before it, newest first
 *   GET /playlists/hls.m3u8?v=o|c&i=…    a playlist as one HLS stream (docs/design/hls.md), built
 *                                        from the items in the URL; only current tracks of
 *                                        the pool whose unit is not excluded
 *   GET /api/health                      pool hash, edition counts
 * Cron (hourly): ensureRunway — generate missing/stale editions up to 14 days ahead, never
 * touching editions that start within 24 hours.
 */
import type { UnitPool } from "@goldstein/data";
import {
  buildHlsPlaylist,
  editionById,
  HLS_MIME,
  HLS_PATH,
  parseHlsQuery,
  type Edition,
  type HlsItem,
  type HlsSource,
  type HlsVariant,
} from "@goldstein/playlists";
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
/** Editions are tombstoned at read time, so a removal must reach visitors within minutes. */
const LONG = "public, max-age=300, stale-while-revalidate=600";
/** Cold start: one request fills the runway; the others get 503 for this long. */
const FILL_LOCK_KEY = "lock:fill";
const FILL_LOCK_TTL_SEC = 60;

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

interface SourceEntry {
  original: string;
  clean?: string;
  /** `start~end` of each current track of this recording, in units not excluded. */
  ranges: Set<string>;
}

const rangeKey = (start: number, end: number) =>
  `${Math.round(start * 100) / 100}~${Math.round(end * 100) / 100}`;

/** id → file URLs (no media fragment) and track ranges, per pool and overrides (built once). */
const sourceIndex = new WeakMap<UnitPool, WeakMap<Overrides, Map<string, SourceEntry>>>();

function sourcesOf(pool: UnitPool, overrides: Overrides): Map<string, SourceEntry> {
  let perPool = sourceIndex.get(pool);
  if (!perPool) sourceIndex.set(pool, (perPool = new WeakMap()));
  const cached = perPool.get(overrides);
  if (cached) return cached;
  const index = new Map<string, SourceEntry>();
  // The rule of tombstone(): an item plays a current track (start_sec, or the opening-song
  // intro_start_sec, to end_sec) of a unit that overrides.json does not exclude.
  for (const u of pool.units) {
    if (overrides[u.unit]?.exclude) continue;
    for (const t of u.tracks) {
      let e = index.get(t.id);
      if (!e) {
        e = {
          original: t.audio_url.split("#")[0]!,
          ...(t.clean_audio_url ? { clean: t.clean_audio_url.split("#")[0]! } : {}),
          ranges: new Set(),
        };
        index.set(t.id, e);
      }
      e.ranges.add(rangeKey(t.start_sec, t.end_sec));
      if (t.intro_start_sec !== undefined) e.ranges.add(rangeKey(t.intro_start_sec, t.end_sec));
    }
  }
  perPool.set(overrides, index);
  return index;
}

/**
 * Where one item's audio is. The clean variant mixes per item: the AI-cleaned copy (and its frame
 * table) where the recording has one, else the original, so one story without a clean copy does
 * not take AI-improved sound away from the whole playlist.
 */
function hlsSource(
  sources: ReadonlyMap<string, SourceEntry>,
  pool: UnitPool,
  item: HlsItem,
  variant: HlsVariant,
): HlsSource | null {
  const e = sources.get(item.id);
  const frames = pool.frames?.[item.id];
  if (!e || !frames || !e.ranges.has(rangeKey(item.start_sec, item.end_sec))) return null;
  if (variant === "clean" && e.clean && frames.clean) return { url: e.clean, frames: frames.clean };
  return { url: e.original, frames: frames.original };
}

/**
 * The HLS stream for the items in the URL; 404 when any of them can't be streamed (no frame table,
 * not a current track of the pool, or its unit excluded in overrides.json).
 */
export function hlsResponse(url: URL, pool: UnitPool, overrides: Overrides = {}): Response {
  const q = parseHlsQuery(url.searchParams);
  if (!q) return json({ error: "bad stream request" }, "public, max-age=60", 400);
  const sources = sourcesOf(pool, overrides);
  const text = buildHlsPlaylist(q.items, q.variant, (item, v) => hlsSource(sources, pool, item, v));
  if (text === null)
    return json({ error: "no stream for these items" }, "public, max-age=300", 404);
  return new Response(text, {
    headers: {
      "content-type": HLS_MIME,
      "cache-control": "public, max-age=3600",
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
  if (path === HLS_PATH) return hlsResponse(url, deps.pool, deps.overrides);

  let views = await buildViews(store, deps.pool, now, deps.overrides);
  if (!views.current) {
    // First request after a fresh deploy, before the cron has run. One request fills the
    // runway; while its lock is set, the others get a short 503 (clients fall back to their
    // cached copy, or retry), instead of every concurrent request generating 15 editions.
    const locked = await deps.kv.get(FILL_LOCK_KEY, { type: "json" });
    if (locked && Number(locked) > now.getTime() - FILL_LOCK_TTL_SEC * 1000) {
      return new Response(JSON.stringify({ error: "playlists are being prepared" }), {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "10",
        },
      });
    }
    await deps.kv.put(FILL_LOCK_KEY, JSON.stringify(now.getTime()), {
      expirationTtl: FILL_LOCK_TTL_SEC,
    });
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
  // Only published nights (past 7 + current): no browsing ahead, nothing older than history.
  if (m && editionById(m[1]!) && views.index.editions.some((e) => e.date === m[1])) {
    const e = await store.get(m[1]!);
    if (e) return json(tombstone(e, deps.pool, deps.overrides), LONG);
  }
  return json({ error: "not found" }, "public, max-age=60", 404);
}

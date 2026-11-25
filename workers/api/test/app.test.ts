import { describe, expect, it } from "vitest";
import type { Edition, HistoryFile, IndexFile } from "@goldstein/playlists";
import { handle, runCron, type KVLike } from "../src/app.ts";
import { fakePool } from "@goldstein/playlists/testing";

function fakeKv(): KVLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k, opts) => {
      // Same rule as Cloudflare KV: a cacheTtl below 30 s is rejected.
      if (opts.cacheTtl !== undefined && opts.cacheTtl < 30)
        throw new Error("KV GET failed: Invalid cache_ttl");
      return data.has(k) ? JSON.parse(data.get(k)!) : null;
    },
    put: async (k, v) => void data.set(k, v),
  };
}

const pool = fakePool(600, 10);
const now = new Date("2026-11-25T20:00:00Z");
const get = (path: string, deps: Parameters<typeof handle>[1], at = now) =>
  handle(new Request(`https://kids.example${path}`), deps, at);

describe("goldstein-api", () => {
  it("cron fills the runway; endpoints serve the published contract with cache headers", async () => {
    const kv = fakeKv();
    const deps = { kv, pool, overrides: {} };
    const r = await runCron(deps, now);
    expect(r.generated).toHaveLength(15);

    const idx = await get("/playlists/index.json", deps);
    expect(idx.status).toBe(200);
    expect(idx.headers.get("cache-control")).toContain("max-age=300");
    const index = (await idx.json()) as IndexFile;
    expect(index.flip_tz).toBe("America/New_York");
    expect(index.editions[0]?.file).toBe("editions/2026-11-25.json");

    const tonight = (await (await get("/playlists/tonight.json", deps)).json()) as Edition;
    expect(tonight.date).toBe("2026-11-25");
    expect(tonight.playlists.length).toBe(5);

    const ed = await get("/playlists/editions/2026-11-25.json", deps);
    expect(ed.status).toBe(200);
    expect(ed.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=600");
    // Future editions exist in KV but are not public; neither is anything outside the index.
    expect(index.editions.map((e) => e.date)).toEqual(["2026-11-25"]);
    expect((await get("/playlists/editions/2026-11-30.json", deps)).status).toBe(404);
    expect((await get("/playlists/editions/2026-11-01.json", deps)).status).toBe(404);
    expect((await get("/playlists/editions/nope.json", deps)).status).toBe(404);
    expect((await get("/other", deps)).status).toBe(404);
  });

  it("history lists earlier nights, newest first, and stays stable when the pool changes", async () => {
    const kv = fakeKv();
    for (let d = 0; d < 9; d++)
      await runCron(
        { kv, pool, overrides: {} },
        new Date(Date.parse("2026-11-16T20:00:00Z") + d * 86_400_000),
      );
    const before = (await (
      await get("/playlists/history.json", { kv, pool, overrides: {} })
    ).json()) as HistoryFile;
    expect(before.nights.map((n) => n.date)).toEqual([
      "2026-11-24",
      "2026-11-23",
      "2026-11-22",
      "2026-11-21",
      "2026-11-20",
      "2026-11-19",
      "2026-11-18",
    ]);
    const changed = { ...pool, pool_hash: "edited-catalog" };
    await runCron({ kv, pool: changed, overrides: {} }, now);
    const after = (await (
      await get("/playlists/history.json", { kv, pool: changed, overrides: {} })
    ).json()) as HistoryFile;
    expect(after.nights).toEqual(before.nights);
  });

  it("generates on demand when the cron has not run yet", async () => {
    const tonight = await get("/playlists/tonight.json", { kv: fakeKv(), pool, overrides: {} });
    expect(tonight.status).toBe(200);
  });

  it("on a cold start, requests while another one is filling get a short 503 (best-effort lock)", async () => {
    const kv = fakeKv();
    const deps = { kv, pool, overrides: {} };
    // Another request started filling 5 s ago (KV has no atomic lock, so this is best-effort).
    kv.data.set("lock:fill", JSON.stringify(now.getTime() - 5000));
    const busy = await get("/playlists/tonight.json", deps);
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("10");
    expect(busy.headers.get("cache-control")).toBe("no-store");
    expect([...kv.data.keys()].filter((k) => k.startsWith("edition:"))).toEqual([]);
    // A stale lock (the filler died) does not block for longer than its TTL.
    kv.data.set("lock:fill", JSON.stringify(now.getTime() - 120_000));
    expect((await get("/playlists/tonight.json", deps)).status).toBe(200);
  });
});

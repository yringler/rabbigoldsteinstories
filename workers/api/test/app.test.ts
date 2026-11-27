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

  it("adds clean_audio_url to frozen editions at serve time; the KV copy stays unchanged", async () => {
    const kv = fakeKv();
    await runCron({ kv, pool, overrides: {} }, now);
    const storedBefore = kv.data.get("edition:2026-11-25");
    // The cleaned copies arrive after the edition was frozen (the pool changes, the edition does not).
    const cleanOf = (url: string) => url.replace(".example/", ".example/clean/");
    const cleaned = {
      ...pool,
      units: pool.units.map((u) => ({
        ...u,
        tracks: u.tracks.map((t) => ({ ...t, clean_audio_url: cleanOf(t.audio_url) })),
      })),
    };
    const deps = { kv, pool: cleaned, overrides: {} };
    for (const path of ["/playlists/tonight.json", "/playlists/editions/2026-11-25.json"]) {
      const e = (await (await get(path, deps)).json()) as Edition;
      const items = e.playlists.flatMap((p) => p.items);
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(i.clean_audio_url).toBe(cleanOf(i.audio_url));
    }
    expect(kv.data.get("edition:2026-11-25")).toBe(storedBefore);
    expect(storedBefore).not.toContain("clean_audio_url");
  });
});

describe("goldstein-api: HLS stream", () => {
  const t = pool.units[0]!.tracks[0]!;
  const frames = {
    original: { first_byte: 100, frame_count: 400_000, bitrate_kbps: 96, sample_rate: 44_100 },
  };
  const deps = { kv: fakeKv(), pool: { ...pool, frames: { [t.id]: frames } }, overrides: {} };
  const q = `i=${t.id}~${t.start_sec}~${t.end_sec}`;

  it("serves the stream for pool recordings, without touching KV", async () => {
    const r = await get(`/playlists/hls.m3u8?v=o&${q}`, deps);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    // As short as an edition's: an exclusion must stop the stream within minutes.
    expect(r.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=600");
    const text = await r.text();
    expect(text).toContain("#EXT-X-BYTERANGE:");
    expect(text).toContain(t.audio_url.split("#")[0]);
    expect(deps.kv.data.size).toBe(0);
  });

  it("404s a recording without a frame table or a range that is not a track, 400s a malformed query", async () => {
    expect((await get(`/playlists/hls.m3u8?v=o&i=fedcba9876~0~10`, deps)).status).toBe(404);
    expect((await get(`/playlists/hls.m3u8?v=o&i=${t.id}~1~10`, deps)).status).toBe(404);
    expect((await get(`/playlists/hls.m3u8?v=o&i=nope`, deps)).status).toBe(400);
  });

  it("v=c mixes per item: the clean copy where there is one, the original elsewhere", async () => {
    const u = pool.units[1]!.tracks[0]!;
    const clean = {
      ...frames,
      clean: { first_byte: 45, frame_count: 400_000, bitrate_kbps: 128, sample_rate: 48_000 },
    };
    const cleanUrl = t.audio_url.replace(".example/", ".example/clean/");
    const mixed = {
      kv: fakeKv(),
      pool: {
        ...pool,
        units: pool.units.map((x, n) =>
          n === 0
            ? { ...x, tracks: x.tracks.map((y) => ({ ...y, clean_audio_url: cleanUrl })) }
            : x,
        ),
        frames: { [t.id]: clean, [u.id]: frames },
      },
      overrides: {},
    };
    const r = await get(`/playlists/hls.m3u8?v=c&${q}_${u.id}~${u.start_sec}~${u.end_sec}`, mixed);
    expect(r.status).toBe(200);
    const urls = new Set((await r.text()).split("\n").filter((l) => l.startsWith("https://")));
    expect([...urls]).toEqual([cleanUrl, u.audio_url]);
    // A recording without a clean copy streams its original in a clean stream too.
    expect((await get(`/playlists/hls.m3u8?v=c&${q}`, deps)).status).toBe(200);
  });

  it("refuses a unit excluded in overrides.json, like tombstone()", async () => {
    const excluded = {
      ...deps,
      overrides: { [pool.units[0]!.unit]: { exclude: true, note: "x" } },
    };
    expect((await get(`/playlists/hls.m3u8?v=o&${q}`, excluded)).status).toBe(404);
    expect((await get(`/playlists/hls.m3u8?v=o&${q}`, deps)).status).toBe(200);
  });
});

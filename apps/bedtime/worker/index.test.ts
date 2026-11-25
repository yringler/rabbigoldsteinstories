import { describe, expect, it } from "vitest";
import type { SiteEnv } from "@goldstein/api/proxy";
import worker from "./index.ts";

const fetcher = (fn: (r: Request) => Response): Fetcher =>
  ({ fetch: async (r: Request) => fn(r) }) as unknown as Fetcher;

const env: SiteEnv = {
  // The assets binding: "/" is the home page; anything under /p/ is not an asset → 404 page.
  ASSETS: fetcher((r) => {
    const path = new URL(r.url).pathname;
    return path === "/" ? new Response("home") : new Response("not found", { status: 404 });
  }),
  API: fetcher(
    (r) =>
      new Response(
        new URL(r.url).pathname === "/playlists/index.json"
          ? JSON.stringify({ editions: [{ date: "2026-11-24" }, { date: "2026-11-25" }] })
          : "{}",
      ),
  ),
};

const get = (path: string) =>
  worker.fetch(
    new Request(`https://bedtime.example${path}`) as Parameters<typeof worker.fetch>[0],
    env,
  );

describe("bedtime site worker", () => {
  it("serves the home page for deep links to published nights only", async () => {
    expect(await (await get("/p/2026-11-25/calm/")).text()).toBe("home");
    expect((await get("/p/2026-11-24/little")).status).toBe(200);
    // future or long-gone editions are not public
    expect((await get("/p/2026-12-01/calm/")).status).toBe(404);
    expect((await get("/p/2025-01-01/calm/")).status).toBe(404);
    expect((await get("/p/../secret")).status).toBe(404);
  });
});

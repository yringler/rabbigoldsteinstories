/**
 * Preview / simulate tonight's playlists from the generated unit pool (Node only):
 *   npm run preview -w @goldstein/playlists                 # runway from today, print tonight
 *   npm run preview -w @goldstein/playlists -- --days 120   # simulate 120 nights, report repeats
 * Uses an in-memory store; nothing is written anywhere.
 */
import { readFileSync } from "node:fs";
import { loadUnitPool } from "@goldstein/data/load";
import { editionAt } from "./clock.ts";
import type { Edition } from "./contract.ts";
import type { Overrides } from "./recipe.ts";
import { RECIPES } from "./recipes.ts";
import { buildViews, ensureRunway, memoryStore } from "./runway.ts";

const pool = loadUnitPool();
const overrides = JSON.parse(
  readFileSync(new URL("../overrides.json", import.meta.url), "utf8"),
) as Overrides;
const daysArg = process.argv.indexOf("--days");
const days = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 0;
const store = memoryStore();
const start = new Date();
const failed: string[] = [];
for (let d = 0; d <= days; d++) {
  const now = new Date(start.getTime() + d * 86_400_000);
  const r = await ensureRunway({
    store,
    pool,
    recipes: RECIPES,
    overrides,
    now,
    log: (m) => console.warn(m),
  });
  failed.push(...r.failed);
}
const views = await buildViews(
  store,
  pool,
  new Date(start.getTime() + days * 86_400_000),
  overrides,
);
const show = (e: Edition) => {
  console.log(`edition ${e.date} (${e.starts_at} → ${e.ends_at}), pool ${e.pool_hash}`);
  for (const p of e.playlists)
    console.log(
      `  ${p.type.padEnd(10)} ${String(p.total_min).padStart(4)} min  ${p.items.length} tracks  ages ${p.age_min}+  first: ${p.items[0]?.title}`,
    );
};
if (views.current) show(views.current);
console.log(
  `current window: ${editionAt(new Date()).id}; ${store.all().length} editions in store; ${failed.length} failed`,
);
if (days > 0) {
  // Median gap between repeats of the same unit in the same type.
  const last = new Map<string, number>();
  const gaps: Record<string, number[]> = {};
  store.all().forEach((e, i) => {
    for (const p of e.playlists) {
      for (const u of new Set(p.items.map((x) => x.unit))) {
        const k = `${p.type}|${u}`;
        const prev = last.get(k);
        if (prev !== undefined) (gaps[p.type] ??= []).push(i - prev);
        last.set(k, i);
      }
    }
  });
  for (const [t, g] of Object.entries(gaps)) {
    g.sort((a, b) => a - b);
    console.log(
      `  ${t.padEnd(10)} repeats ${g.length}, min gap ${g[0]} editions, median ${g[Math.floor(g.length / 2)]}`,
    );
  }
}

/**
 * Dev only: fill the LOCAL goldstein-api KV with the last 8 nights plus the runway, generated in
 * order (so cooldowns read real history), so /earlier has something to show in `npm run dev`.
 *   npx tsx apps/bedtime/scripts/seed-history.ts            (writes workers/api/.seed-editions.json)
 *   cd workers/api && npx wrangler kv bulk put --local --binding EDITIONS .seed-editions.json
 * Never run against a remote namespace.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadUnitPool } from "@goldstein/data/load";
import { ensureRunway, memoryStore, RECIPES, type Overrides } from "@goldstein/playlists/engine";
import overrides from "@goldstein/playlists/overrides.json" with { type: "json" };

const pool = loadUnitPool();
const store = memoryStore();
const now = Date.now();
for (let d = 8; d >= 0; d--) {
  await ensureRunway({
    store,
    pool,
    recipes: RECIPES,
    overrides: overrides as Overrides,
    now: new Date(now - d * 86_400_000),
  });
}
const out = join(import.meta.dirname, "..", "..", "..", "workers", "api", ".seed-editions.json");
writeFileSync(
  out,
  JSON.stringify(store.all().map((e) => ({ key: `edition:${e.date}`, value: JSON.stringify(e) }))),
);
console.log(`${store.all().length} editions → ${out}`);

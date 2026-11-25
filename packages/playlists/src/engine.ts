/**
 * generateEdition: one night's playlists from the unit pool and the stored history
 * (docs/sites/bedtime.md §4.5–4.6). Pure and deterministic: the same pool, history and edition id
 * give the same edition. Runs in the API Worker's cron and in Node (tests, simulation, CLI).
 *
 * Implemented here (shared by every recipe): weighted seeded fill to target ± tolerance, dedupe
 * keys within a playlist, same-type cooldowns and head cooldowns, cross-type head rule (2
 * editions) and no unit in two heads of one edition, at most one block (never first, never in the
 * last 25 minutes), relaxation (cooldowns ×0.75 up to four times, then the cross-type head rule
 * lapses), default running order, validation. Recipe-specific rules (wind-down swaps, voices,
 * seasons) belong in the recipe's order/validate/weight hooks.
 */
import type { Unit, UnitPool } from "@goldstein/data";
import { CLOCK, type ClockConfig, type EditionWindow } from "./clock.ts";
import { RECIPE_VERSION, type Edition, type Playlist, type PlaylistItem } from "./contract.ts";
import type { Overrides, Recipe, RecipeContext } from "./recipe.ts";
import { seededRng, weightedPick } from "./rng.ts";

const HEAD_SEC = 40 * 60;
const BLOCK_TAIL_SEC = 25 * 60;
const CROSS_TYPE_HEAD_EDITIONS = 2;
const RELAX_STEPS = 4;

export class EditionError extends Error {}

export interface GenerateInput {
  pool: UnitPool;
  recipes: readonly Recipe[];
  window: EditionWindow;
  /** Stored editions (any order; only those that start before `window` are used). */
  history: readonly Edition[];
  overrides?: Overrides;
  clock?: ClockConfig;
  now?: Date;
}

interface Usage {
  /** key → editions ago, per type */
  byType: Map<string, Map<string, number>>;
  headByType: Map<string, Map<string, number>>;
  anyHead: Map<string, number>;
}

function setMin(m: Map<string, number>, k: string, v: number) {
  const cur = m.get(k);
  if (cur === undefined || v < cur) m.set(k, v);
}

function headItems(p: Playlist): PlaylistItem[] {
  const out: PlaylistItem[] = [];
  let t = 0;
  for (const it of p.items) {
    if (t >= HEAD_SEC) break;
    out.push(it);
    t += it.duration_sec;
  }
  return out;
}

function usageFrom(
  history: readonly Edition[],
  window: EditionWindow,
  keysOf: (unit: string, itemId: string) => string[],
): Usage {
  const before = history
    .filter((e) => Date.parse(e.starts_at) < Date.parse(window.starts_at))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const u: Usage = { byType: new Map(), headByType: new Map(), anyHead: new Map() };
  before.forEach((e, i) => {
    const ago = i + 1;
    for (const p of e.playlists) {
      const byType = u.byType.get(p.type) ?? new Map<string, number>();
      const head = u.headByType.get(p.type) ?? new Map<string, number>();
      for (const it of p.items) for (const k of keysOf(it.unit, it.id)) setMin(byType, k, ago);
      for (const it of headItems(p)) {
        for (const k of keysOf(it.unit, it.id)) {
          setMin(head, k, ago);
          setMin(u.anyHead, k, ago);
        }
      }
      u.byType.set(p.type, byType);
      u.headByType.set(p.type, head);
    }
  });
  return u;
}

/** Default running order: opener (highest energy among short units), then descending energy, block second. */
export function defaultOrder(chosen: Unit[], recipe: Recipe): Unit[] {
  const energy = (u: Unit) => u.energy ?? 0;
  const maxOpener = (recipe.openerMaxMin ?? 15) * 60;
  const singles = chosen.filter((u) => !u.block);
  const opener =
    [...singles]
      .filter((u) => u.duration_sec <= maxOpener)
      .sort((a, b) => energy(b) - energy(a) || a.unit.localeCompare(b.unit))[0] ??
    [...singles].sort((a, b) => a.duration_sec - b.duration_sec)[0];
  const rest = chosen
    .filter((u) => u !== opener)
    .sort((a, b) => energy(b) - energy(a) || a.unit.localeCompare(b.unit));
  const block = rest.find((u) => u.block);
  const body = rest.filter((u) => u !== block);
  if (!opener) return rest;
  return block ? [opener, block, ...body] : [opener, ...body];
}

function toItems(u: Unit): PlaylistItem[] {
  return u.tracks.map((t, i) => ({
    id: t.id,
    unit: u.unit,
    title: t.title,
    narrator: u.narrator,
    audio_url: t.audio_url,
    mime_type: t.mime_type,
    start_sec: t.start_sec,
    end_sec: t.end_sec,
    duration_sec: t.duration_sec,
    age_min: u.age_min,
    band: u.band,
    advisories: u.advisories.map((a) => ({ flag: a.flag, label: a.label, severity: a.severity })),
    block: u.block
      ? { key: u.block.key, title: u.block.title, part: i + 1, of: u.tracks.length }
      : null,
  }));
}

export function generateEdition(input: GenerateInput): Edition {
  const clock = input.clock ?? CLOCK;
  const perDay = 24 / clock.rotationHours;
  const overrides = input.overrides ?? {};
  const pool = input.pool.units
    .filter((u) => !overrides[u.unit]?.exclude)
    .map((u) => {
      const e = overrides[u.unit]?.energy;
      return e === undefined
        ? u
        : {
            ...u,
            energy: e,
            band: e <= 0 ? ("calm" as const) : e <= 3 ? ("middle" as const) : ("exciting" as const),
          };
    });
  const byUnit = new Map(pool.map((u) => [u.unit, u]));
  const keysOf = (unit: string, itemId: string) => byUnit.get(unit)?.keys ?? [unit, itemId];
  const usage = usageFrom(input.history, input.window, keysOf);
  const editionHeads = new Set<string>();

  // Generation order rotates by edition so no type always picks last.
  const dayIndex = Math.floor(Date.parse(input.window.starts_at) / (86_400_000 / perDay));
  const n = input.recipes.length;
  const order = input.recipes.map((_, i) => input.recipes[(i + dayIndex) % n]!);
  const results = new Map<string, Playlist>();

  for (const recipe of order) {
    const rng = seededRng(`${RECIPE_VERSION}|${input.window.id}|${recipe.type}`);
    const ctx: RecipeContext = { edition: input.window, rng, pool };
    const eligible = pool.filter((u) => recipe.eligible(u));
    const target = recipe.targetMin * 60;
    const tol = recipe.toleranceMin * 60;
    let chosen: Unit[] | null = null;

    for (let relax = 0; relax <= RELAX_STEPS + 1 && !chosen; relax++) {
      const mult = 0.75 ** Math.min(relax, RELAX_STEPS);
      const crossHeads = relax <= RELAX_STEPS;
      const cooldown = Math.ceil(recipe.cooldownDays * perDay * mult);
      const headCooldown = Math.ceil(recipe.headCooldownDays * perDay * mult);
      const used = usage.byType.get(recipe.type) ?? new Map<string, number>();
      const usedHead = usage.headByType.get(recipe.type) ?? new Map<string, number>();
      const blockedBy = (m: Map<string, number>, u: Unit, within: number) =>
        u.keys.some((k) => (m.get(k) ?? Infinity) <= within);

      const pick: Unit[] = [];
      const keys = new Set<string>();
      let total = 0;
      let blocks = 0;
      const rngTry = seededRng(`${RECIPE_VERSION}|${input.window.id}|${recipe.type}|${relax}`);
      while (total < target - tol) {
        const inHead = total < HEAD_SEC;
        const options = eligible.filter((u) => {
          if (pick.includes(u) || u.keys.some((k) => keys.has(k))) return false;
          if (total + u.duration_sec > target + tol) return false;
          if (blockedBy(used, u, cooldown)) return false;
          if (
            u.block &&
            (blocks > 0 ||
              pick.length === 0 ||
              total + u.duration_sec > target + tol - BLOCK_TAIL_SEC)
          )
            return false;
          if (inHead) {
            if (u.block) return false;
            if (blockedBy(usedHead, u, headCooldown)) return false;
            if (
              crossHeads &&
              (blockedBy(usage.anyHead, u, CROSS_TYPE_HEAD_EDITIONS) ||
                u.keys.some((k) => editionHeads.has(k)))
            )
              return false;
          }
          return true;
        });
        const next = weightedPick(
          options,
          (u) => recipe.weight?.(u, { ...ctx, rng: rngTry }) ?? 1,
          rngTry,
        );
        if (!next) break;
        pick.push(next);
        for (const k of next.keys) keys.add(k);
        total += next.duration_sec;
        if (next.block) blocks++;
      }
      if (total >= target - tol) chosen = pick;
    }
    if (!chosen)
      throw new EditionError(
        `${input.window.id}/${recipe.type}: pool cannot fill ${recipe.targetMin} min even after relaxing`,
      );

    const ordered = recipe.order?.(chosen, ctx) ?? defaultOrder(chosen, recipe);
    const problem = validate(ordered, recipe) ?? recipe.validate?.(ordered, ctx) ?? null;
    if (problem) throw new EditionError(`${input.window.id}/${recipe.type}: ${problem}`);
    const items = ordered.flatMap(toItems);
    const playlist: Playlist = {
      id: `${input.window.id}/${recipe.type}`,
      type: recipe.type,
      title: recipe.title,
      subtitle: recipe.subtitle,
      ...(recipe.kidLine ? { kid_line: recipe.kidLine } : {}),
      total_min: Math.round(items.reduce((s, i) => s + i.duration_sec, 0) / 60),
      age_min: Math.max(0, ...items.map((i) => i.age_min)),
      items,
    };
    for (const it of headItems(playlist))
      for (const k of keysOf(it.unit, it.id)) editionHeads.add(k);
    results.set(recipe.type, playlist);
  }

  return {
    date: input.window.id,
    starts_at: input.window.starts_at,
    ends_at: input.window.ends_at,
    hebrew_date: null,
    season: [],
    recipe_version: RECIPE_VERSION,
    pool_hash: input.pool.pool_hash,
    generated_at: (input.now ?? new Date()).toISOString(),
    playlists: input.recipes.map((r) => results.get(r.type)!),
  };
}

function validate(units: Unit[], recipe: Recipe): string | null {
  const total = units.reduce((s, u) => s + u.duration_sec, 0);
  if (
    total < (recipe.targetMin - recipe.toleranceMin) * 60 ||
    total > (recipe.targetMin + recipe.toleranceMin) * 60
  )
    return `length ${Math.round(total / 60)} min out of range`;
  const seen = new Set<string>();
  for (const u of units) {
    for (const k of u.keys) {
      if (seen.has(k)) return `shared key ${k}`;
    }
    for (const k of u.keys) seen.add(k);
    if (u.tracks.some((t) => !t.audio_url.startsWith("https://")))
      return `unit ${u.unit} has no audio URL`;
  }
  if (units.filter((u) => u.block).length > 1) return "more than one block";
  if (units[0]?.block) return "block first";
  return null;
}

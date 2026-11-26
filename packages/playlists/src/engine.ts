/**
 * generateEdition: one night's playlists from the unit pool and the stored history
 * (docs/sites/bedtime.md §4.5–4.6). Pure and deterministic: the same pool, history and edition id
 * give the same edition. Runs in the API Worker's cron and in Node (tests, simulation, CLI).
 *
 * Implemented here (shared by every recipe): weighted seeded fill to target ± tolerance, dedupe
 * keys within a playlist, same-type cooldowns and head cooldowns, cross-type head rule (2
 * editions) and no unit in two heads of one edition, at most one block (never first, never in the
 * last 25 minutes), relaxation (cooldowns ×0.75 up to four times, then the cross-type head rule
 * lapses), default running order, validation, the reserved wind-down tail (Recipe.windDown), the
 * edition's Hebrew date and active seasons (seasons.ts). Recipe-specific rules (seasonal weights,
 * opener, voices, opening song) live in the recipe's weight/admit/order/validate hooks.
 */
import type { Unit, UnitPool } from "@goldstein/data";
import { CLOCK, type ClockConfig, type EditionWindow } from "./clock.ts";
import { RECIPE_VERSION, type Edition, type Playlist, type PlaylistItem } from "./contract.ts";
import type { FillState, Overrides, Recipe, RecipeContext } from "./recipe.ts";
import { seededRng, weightedPick } from "./rng.ts";
import { seasonFor } from "./seasons.ts";

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
  /** Receives one line per relaxation step taken (bedtime.md §4.6: "logging each step"). */
  log?: (msg: string) => void;
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
  periodMs: number,
): Usage {
  const before = history
    .filter((e) => Date.parse(e.starts_at) < Date.parse(window.starts_at))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const u: Usage = { byType: new Map(), headByType: new Map(), anyHead: new Map() };
  before.forEach((e) => {
    // Editions ago by date (rotation periods), not by how many editions happen to be stored:
    // after a gap in the store (a missed or failed night) old editions must not count as recent.
    const ago = Math.max(
      1,
      Math.round((Date.parse(window.starts_at) - Date.parse(e.starts_at)) / periodMs),
    );
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

/**
 * Keep the running order, but make sure every unit that starts inside the head passes the head
 * rules: the fill checks head rules in draw order, and sorting by energy could otherwise move a
 * later draw into the first 40 minutes. Units drawn while in the head pass, and they add up to at
 * least 40 minutes, so the head can always be filled from them.
 */
export function enforceHead(
  ordered: Unit[],
  headOk: (u: Unit) => boolean,
  blockMayOpen = false,
): Unit[] {
  const rest = [...ordered];
  const out: Unit[] = [];
  let t = 0;
  while (t < HEAD_SEC && rest.length > 0) {
    const i = rest.findIndex((u) => headOk(u) && (out.length > 0 || !u.block || blockMayOpen));
    if (i < 0) break;
    const [u] = rest.splice(i, 1) as [Unit];
    out.push(u);
    t += u.duration_sec;
  }
  return [...out, ...rest];
}

/** Wind-down tail order: descending energy, so the calmest story plays last. */
export function orderTail(tail: Unit[]): Unit[] {
  return [...tail].sort(
    (a, b) => (b.energy ?? 0) - (a.energy ?? 0) || a.unit.localeCompare(b.unit),
  );
}

function toItems(u: Unit): PlaylistItem[] {
  return u.tracks.map((t, i) => ({
    id: t.id,
    unit: u.unit,
    title: t.title,
    narrator: u.narrator,
    audio_url: t.audio_url,
    ...(t.clean_audio_url !== undefined ? { clean_audio_url: t.clean_audio_url } : {}),
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
  const usage = usageFrom(input.history, input.window, keysOf, 86_400_000 / perDay);
  const editionHeads = new Set<string>();

  // Generation order rotates by edition so no type always picks last.
  const dayIndex = Math.floor(Date.parse(input.window.starts_at) / (86_400_000 / perDay));
  const n = input.recipes.length;
  const order = input.recipes.map((_, i) => input.recipes[(i + dayIndex) % n]!);
  const results = new Map<string, Playlist>();

  const season = seasonFor(input.window.id);

  for (const recipe of order) {
    const rng = seededRng(`${RECIPE_VERSION}|${input.window.id}|${recipe.type}`);
    const ctx: RecipeContext = { edition: input.window, rng, pool, season };
    const eligible = pool.filter((u) => recipe.eligible(u));
    if (eligible.length === 0) {
      // A type with nothing to play at all (e.g. no radio episodes in a test pool) is left out of
      // the edition; any other shortfall still fails the edition.
      input.log?.(`${input.window.id}/${recipe.type}: no eligible units, playlist left out`);
      continue;
    }
    const tailPool = recipe.windDown ? pool.filter((u) => recipe.windDown!.eligible(u)) : [];
    const tailMin = recipe.windDown?.minSec ?? 0;
    const target = recipe.targetMin * 60;
    const tol = recipe.toleranceMin * 60;
    const openerMax = (recipe.openerMaxMin ?? 15) * 60;
    const blockTail = recipe.blockTailMin === undefined ? BLOCK_TAIL_SEC : recipe.blockTailMin * 60;
    let chosen: { body: Unit[]; tail: Unit[]; headOk: (u: Unit) => boolean } | null = null;
    let ordered: Unit[] = [];
    let lastProblem: string | null = null;

    for (let relax = 0; relax <= RELAX_STEPS + 1 && !chosen; relax++) {
      if (relax > 0)
        input.log?.(
          `${input.window.id}/${recipe.type}: relaxing, step ${relax}` +
            (relax > RELAX_STEPS
              ? " (cross-type head rule lapses)"
              : ` (cooldowns ×0.75^${relax})`),
        );
      const mult = 0.75 ** Math.min(relax, RELAX_STEPS);
      const crossHeads = relax <= RELAX_STEPS;
      const cooldown = Math.ceil(recipe.cooldownDays * perDay * mult);
      const headCooldown = Math.ceil(recipe.headCooldownDays * perDay * mult);
      const used = usage.byType.get(recipe.type) ?? new Map<string, number>();
      const usedHead = usage.headByType.get(recipe.type) ?? new Map<string, number>();
      const blockedBy = (m: Map<string, number>, u: Unit, within: number) =>
        u.keys.some((k) => (m.get(k) ?? Infinity) <= within);

      const body: Unit[] = [];
      const tail: Unit[] = [];
      const keys = new Set<string>();
      let total = 0;
      let tailTotal = 0;
      let blocks = 0;
      const rngTry = seededRng(`${RECIPE_VERSION}|${input.window.id}|${recipe.type}|${relax}`);
      // Body: fill to the minimum less the reserved wind-down; tail: calm units to the end.
      const bodyGoal = target - tol - tailMin;
      const bodyMax = target + tol - tailMin;
      for (;;) {
        const inTail = total >= bodyGoal;
        if (inTail && tailTotal >= tailMin && total >= target - tol) break;
        const cap = inTail ? target + tol : bodyMax;
        const inHead = total < HEAD_SEC;
        const state: FillState = { picked: [...body, ...tail], total, inHead, inTail };
        const options = (inTail ? tailPool : eligible).filter((u) => {
          if (u.keys.some((k) => keys.has(k))) return false;
          if (total + u.duration_sec > cap) return false;
          if (blockedBy(used, u, cooldown)) return false;
          if (u.block) {
            // A block plays second, right after an opener of at most openerMaxMin (or first, when
            // the recipe allows it), so it must end before the protected tail of the shortest
            // allowed playlist; it is in the head.
            if (inTail || blocks > 0 || (body.length === 0 && !recipe.blockMayOpen)) return false;
            const room = blockTail > 0 ? target - tol - blockTail : target + tol;
            if (u.duration_sec > room - (recipe.blockMayOpen ? 0 : openerMax)) return false;
          }
          if (inHead || u.block) {
            if (blockedBy(usedHead, u, headCooldown)) return false;
            if (
              crossHeads &&
              (blockedBy(usage.anyHead, u, CROSS_TYPE_HEAD_EDITIONS) ||
                u.keys.some((k) => editionHeads.has(k)))
            )
              return false;
          }
          return recipe.admit?.(u, ctx, state) ?? true;
        });
        const next = weightedPick(
          options,
          (u) => recipe.weight?.(u, { ...ctx, rng: rngTry }, state) ?? 1,
          rngTry,
        );
        if (!next) break;
        (inTail ? tail : body).push(next);
        for (const k of next.keys) keys.add(k);
        total += next.duration_sec;
        if (inTail) tailTotal += next.duration_sec;
        if (next.block) blocks++;
      }
      const headOk = (u: Unit) =>
        !blockedBy(usedHead, u, headCooldown) &&
        !(
          crossHeads &&
          (blockedBy(usage.anyHead, u, CROSS_TYPE_HEAD_EDITIONS) ||
            u.keys.some((k) => editionHeads.has(k)))
        ) &&
        (recipe.admit?.(u, ctx, { picked: [], total: 0, inHead: true, inTail: false }) ?? true);
      if (total < target - tol || total > target + tol || tailTotal < tailMin) continue;
      // Order and validate; a draw that cannot be ordered validly counts as a failed attempt.
      const orderCtx: RecipeContext = { ...ctx, headOk };
      const attempt = enforceHead(
        recipe.order?.(body, orderCtx, tail) ?? [...defaultOrder(body, recipe), ...orderTail(tail)],
        headOk,
        recipe.blockMayOpen ?? false,
      );
      lastProblem = validate(attempt, recipe) ?? recipe.validate?.(attempt, ctx) ?? null;
      if (lastProblem) continue;
      chosen = { body, tail, headOk };
      ordered = attempt;
    }
    if (!chosen)
      throw new EditionError(
        `${input.window.id}/${recipe.type}: ` +
          (lastProblem ?? `pool cannot fill ${recipe.targetMin} min`) +
          " even after relaxing",
      );

    const items = ordered.flatMap(toItems);
    const playlist: Playlist = {
      id: `${input.window.id}/${recipe.type}`,
      type: recipe.type,
      title: recipe.title,
      subtitle: recipe.subtitle,
      ...(recipe.kidLine ? { kid_line: recipe.kidLine } : {}),
      ...(recipe.ages ? { ages: recipe.ages } : {}),
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
    hebrew_date: season.hebrewDate,
    season: [...season.active.keys()].sort(),
    recipe_version: RECIPE_VERSION,
    pool_hash: input.pool.pool_hash,
    generated_at: (input.now ?? new Date()).toISOString(),
    playlists: input.recipes.flatMap((r) => results.get(r.type) ?? []),
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
  if (units[0]?.block && !recipe.blockMayOpen) return "block first";
  const blockTail = recipe.blockTailMin === undefined ? BLOCK_TAIL_SEC : recipe.blockTailMin * 60;
  let t = 0;
  for (const u of units) {
    t += u.duration_sec;
    if (u.block && t > total - blockTail) return "block in the protected tail";
  }
  return null;
}

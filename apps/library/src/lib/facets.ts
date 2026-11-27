/**
 * Faceted filtering for /search (docs/sites/library.md §4.2).
 *
 * Semantics (fixed by the spec):
 *  - across facets: AND; within a facet: OR ("any") by default, or AND ("all") where the facet allows it;
 *  - every value can also be excluded (`<facet>.not=`); the advisories facet only excludes;
 *  - counts are disjunctive: the count beside a value is the size of the result if that value were
 *    toggled, computed with the facet's own "any" selection ignored and everything else applied.
 *
 * One bitset per facet value over the catalog rows; everything recomputes in well under 1 ms.
 */
import * as B from "./bits.ts";
import type { HasFlag, LibRow, PersonRole } from "./types.ts";

export type FacetKind = "multi" | "exclude" | "all-only";

export interface FacetDef<R> {
  key: string;
  label: string;
  values: (r: R) => readonly string[];
  kind: FacetKind;
  /** Offers the any/all toggle. */
  allowAll?: boolean;
  /** Long list: show the top 8 and a type-to-filter box. */
  long?: boolean;
  /** Vocabulary list for labels (else `labels`, else the value itself). */
  vocab?: string;
  labels?: Readonly<Record<string, string>>;
  /** Fixed display order of values (else by count). */
  order?: readonly string[];
  /** Values carry an optional `@role` variant (people). */
  roleAware?: boolean;
  /** Short help shown under the heading. */
  hint?: string;
}

export interface FacetSel {
  any: string[];
  not: string[];
  all: boolean;
}

export type Scope = "both" | "full" | "clips";
export type SortKey = "relevance" | "date" | "date-desc" | "title" | "length" | "episode";
export type SearchIn = "all" | "meta" | "transcript";

export interface SearchState {
  q: string;
  in: SearchIn;
  sel: Record<string, FacetSel>;
  /** Inclusive range over audience.age_min. */
  age: [number, number] | null;
  /** Inclusive range over the Hebrew year. */
  year: [number, number] | null;
  role: PersonRole | null;
  scope: Scope;
  sort: SortKey;
  view: "list" | "table";
  page: number;
  cols: string[] | null;
  /**
   * `lang=any`: no language filter, on purpose, so the visitor's language setting is not applied
   * (docs/design/language-library.md §3).
   */
  langAny: boolean;
}

export const AGE_MIN = 3;
export const AGE_MAX = 16;
export const PAGE_SIZE = 50;

export const LENGTH_LABELS: Readonly<Record<string, string>> = {
  lt5: "Under 5 min",
  "5-15": "5–15 min",
  "15-30": "15–30 min",
  "30-60": "30–60 min",
  gt60: "Over 60 min",
};

export function lengthBucket(sec: number): string {
  const m = sec / 60;
  if (m < 5) return "lt5";
  if (m < 15) return "5-15";
  if (m < 30) return "15-30";
  if (m < 60) return "30-60";
  return "gt60";
}

const STANDALONE_LABELS = {
  standalone: "Stands alone",
  cliffhanger: "Ends on a cliffhanger",
  needs_context: "Needs earlier parts",
  fragment: "Fragment",
  teaser: "Teaser",
} as const;

const HAS_LABELS: Record<HasFlag, string> = {
  chapters: "Chapter marks",
  transcript: "Transcript shown",
  serial: "Part of a serial",
  tellings: "Other tellings",
};

export const ROLE_LABELS: Record<PersonRole, string> = {
  central: "Central",
  appears: "Appears",
  teaching_cited: "Teaching cited",
  mentioned: "Mentioned",
};

/** The facets of the library, in panel order. */
export const LIBRARY_FACETS: readonly FacetDef<LibRow>[] = [
  { key: "type", label: "Type", values: (r) => [r.type], kind: "multi", vocab: "content_type" },
  {
    key: "series",
    label: "Series",
    values: (r) => (r.series ? [r.series] : []),
    kind: "multi",
    vocab: "series",
  },
  { key: "speaker", label: "Speaker", values: (r) => r.speakers, kind: "multi", vocab: "speakers" },
  {
    key: "story",
    label: "Story kind",
    values: (r) => r.storyType,
    kind: "multi",
    vocab: "story_type",
  },
  {
    key: "midos",
    label: "Midah",
    values: (r) => r.midos,
    kind: "multi",
    allowAll: true,
    vocab: "midos",
  },
  {
    key: "mitzvos",
    label: "Mitzvah",
    values: (r) => r.mitzvos,
    kind: "multi",
    allowAll: true,
    long: true,
    vocab: "mitzvos",
  },
  {
    key: "topics",
    label: "Topic",
    values: (r) => r.topics,
    kind: "multi",
    allowAll: true,
    long: true,
    vocab: "topics",
  },
  {
    key: "calendar",
    label: "Jewish calendar",
    values: (r) => r.calendar,
    kind: "multi",
    allowAll: true,
    long: true,
    vocab: "calendar",
  },
  {
    key: "parsha",
    label: "Parsha",
    values: (r) => r.parshiyos,
    kind: "multi",
    long: true,
    vocab: "parshiyos",
  },
  {
    key: "people",
    label: "Person",
    values: (r) => r.people.flatMap(([id, role]) => [id, `${id}@${role}`]),
    kind: "multi",
    allowAll: true,
    long: true,
    vocab: "people",
    roleAware: true,
  },
  {
    key: "works",
    label: "Source cited",
    values: (r) => r.works,
    kind: "multi",
    allowAll: true,
    long: true,
    vocab: "works",
  },
  { key: "places", label: "Place", values: (r) => r.places, kind: "multi", long: true },
  {
    key: "advisories",
    label: "Leave out stories with…",
    values: (r) => r.adv,
    kind: "exclude",
    vocab: "content_advisory",
    hint: "Parents' notes. Ticked themes are left out.",
  },
  {
    key: "lang",
    label: "Language",
    values: (r) => [r.lang],
    kind: "multi",
    labels: { en: "English", yi: "Yiddish", he: "Hebrew" },
  },
  {
    key: "length",
    label: "Length",
    values: (r) => [lengthBucket(r.dur)],
    kind: "multi",
    labels: LENGTH_LABELS,
    order: Object.keys(LENGTH_LABELS),
  },
  {
    key: "standalone",
    label: "Stands alone",
    values: (r) => [r.standalone],
    kind: "multi",
    labels: STANDALONE_LABELS,
    order: Object.keys(STANDALONE_LABELS),
  },
  {
    key: "has",
    label: "Has",
    values: (r) => r.has,
    kind: "all-only",
    labels: HAS_LABELS,
    order: Object.keys(HAS_LABELS),
  },
];

// ---------------------------------------------------------------------------------------------
// Index

export class FacetIndex<R> {
  readonly n: number;
  readonly all: B.Bits;
  private readonly byFacet = new Map<string, Map<string, B.Bits>>();

  constructor(
    readonly rows: readonly R[],
    readonly defs: readonly FacetDef<R>[],
  ) {
    this.n = rows.length;
    this.all = B.full(this.n);
    for (const d of defs) {
      const m = new Map<string, B.Bits>();
      rows.forEach((r, i) => {
        for (const v of d.values(r)) {
          let b = m.get(v);
          if (!b) m.set(v, (b = B.empty(this.n)));
          B.set(b, i);
        }
      });
      this.byFacet.set(d.key, m);
    }
  }

  def(key: string): FacetDef<R> | undefined {
    return this.defs.find((d) => d.key === key);
  }

  bits(key: string, value: string): B.Bits {
    return this.byFacet.get(key)?.get(value) ?? B.empty(this.n);
  }

  /** Values of a facet (role variants excluded). */
  values(key: string): string[] {
    return [...(this.byFacet.get(key)?.keys() ?? [])].filter((v) => !v.includes("@"));
  }
}

export function emptySel(): FacetSel {
  return { any: [], not: [], all: false };
}

export function defaultState(): SearchState {
  return {
    q: "",
    in: "all",
    sel: {},
    age: null,
    year: null,
    role: null,
    scope: "both",
    sort: "relevance",
    view: "list",
    page: 1,
    cols: null,
    langAny: false,
  };
}

function valueKey<R>(def: FacetDef<R>, v: string, state: SearchState): string {
  return def.roleAware && state.role ? `${v}@${state.role}` : v;
}

/** Bits satisfying one facet's selection, optionally ignoring its "any" part (for disjunctive counts). */
export function facetConstraint<R>(
  index: FacetIndex<R>,
  def: FacetDef<R>,
  state: SearchState,
  ignoreAny = false,
): B.Bits | null {
  const sel = state.sel[def.key];
  if (!sel) return null;
  let out: B.Bits | null = null;
  const anyVals = def.kind === "exclude" ? [] : sel.any;
  if (anyVals.length && !ignoreAny) {
    const all = def.kind === "all-only" || (def.allowAll === true && sel.all);
    for (const v of anyVals) {
      const b = index.bits(def.key, valueKey(def, v, state));
      out = out ? (all ? B.and(out, b) : B.or(out, b)) : b;
    }
  }
  const notVals = def.kind === "exclude" ? [...sel.any, ...sel.not] : sel.not;
  for (const v of notVals) {
    out = B.andNot(out ?? index.all, index.bits(def.key, valueKey(def, v, state)));
  }
  return out;
}

/** Rows that pass every facet and the extra constraints (text match, ranges, scope). */
export function applyFacets<R>(
  index: FacetIndex<R>,
  state: SearchState,
  extra: readonly B.Bits[] = [],
  skip?: { key: string; ignoreAny: boolean; ignoreNot?: boolean },
): B.Bits {
  let out = index.all;
  for (const c of extra) out = B.and(out, c);
  for (const def of index.defs) {
    let c: B.Bits | null;
    if (skip && skip.key === def.key) {
      if (skip.ignoreNot) continue;
      c = facetConstraint(index, def, state, skip.ignoreAny);
    } else c = facetConstraint(index, def, state);
    if (c) out = B.and(out, c);
  }
  return out;
}

/**
 * Count beside each value of facet `key`: the number of results if that value were ticked.
 *  - "any" facets: all other facets applied, this facet's own "any" selection ignored, its excludes kept;
 *  - "all" mode and "has": everything applied (ticking adds a further AND);
 *  - exclude-only facets (advisories): how many of the current results carry the value.
 */
export function facetCounts<R>(
  index: FacetIndex<R>,
  state: SearchState,
  key: string,
  extra: readonly B.Bits[] = [],
): Map<string, number> {
  const def = index.def(key);
  const out = new Map<string, number>();
  if (!def) return out;
  const sel = state.sel[key] ?? emptySel();
  let base: B.Bits;
  if (def.kind === "exclude")
    base = applyFacets(index, state, extra, { key, ignoreAny: true, ignoreNot: true });
  else if (def.kind === "all-only" || (def.allowAll && sel.all))
    base = applyFacets(index, state, extra);
  else base = applyFacets(index, state, extra, { key, ignoreAny: true });
  for (const v of index.values(key)) {
    out.set(v, B.countAnd(base, index.bits(key, valueKey(def, v, state))));
  }
  return out;
}

/** Range and scope constraints as bitsets. */
export function rangeConstraints(rows: readonly LibRow[], state: SearchState): B.Bits[] {
  const n = rows.length;
  const out: B.Bits[] = [B.fromPredicate(n, (i) => rows[i]?.preferred === true)];
  if (state.age) {
    const [lo, hi] = state.age;
    out.push(
      B.fromPredicate(n, (i) => {
        const a = rows[i]?.age ?? 0;
        return a >= lo && a <= hi;
      }),
    );
  }
  if (state.year) {
    const [lo, hi] = state.year;
    out.push(
      B.fromPredicate(n, (i) => {
        const y = rows[i]?.hy;
        return y !== undefined && y >= lo && y <= hi;
      }),
    );
  }
  if (state.scope === "full") out.push(B.fromPredicate(n, (i) => rows[i]?.clip === false));
  if (state.scope === "clips")
    out.push(B.fromPredicate(n, (i) => rows[i]?.type !== "radio_episode"));
  return out;
}

// ---------------------------------------------------------------------------------------------
// URL state: `midos=emunah,bitachon&midos.mode=all&advisories.not=death`

const SORTS: readonly SortKey[] = ["relevance", "date", "date-desc", "title", "length", "episode"];
const ROLES: readonly PersonRole[] = ["central", "appears", "teaching_cited", "mentioned"];

function list(v: string | null): string[] {
  return v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function range(v: string | null, lo: number, hi: number): [number, number] | null {
  if (!v) return null;
  const m = /^(\d+)?-(\d+)?$/.exec(v) ?? /^(\d+)$/.exec(v);
  if (!m) return null;
  const a = m[1] ? Number(m[1]) : lo;
  const b = m[2] !== undefined ? Number(m[2]) : v.includes("-") ? hi : a;
  const x = Math.max(lo, Math.min(a, b));
  const y = Math.min(hi, Math.max(a, b));
  return x === lo && y === hi ? null : [x, y];
}

export function parseState(params: URLSearchParams, facetKeys: readonly string[]): SearchState {
  const s = defaultState();
  s.q = (params.get("q") ?? "").trim();
  const inn = params.get("in");
  if (inn === "meta" || inn === "transcript") s.in = inn;
  for (const k of facetKeys) {
    let any = list(params.get(k));
    if (k === "lang" && any.includes("any")) {
      // `lang=any` alone: no filter, on purpose. Mixed with real values (`lang=any,yi`), the real
      // values win, as they would after a toggle.
      any = any.filter((v) => v !== "any");
      s.langAny = any.length === 0;
    }
    const not = list(params.get(`${k}.not`));
    const all = params.get(`${k}.mode`) === "all";
    if (any.length || not.length || all) s.sel[k] = { any, not, all };
  }
  s.age = range(params.get("age"), AGE_MIN, AGE_MAX);
  s.year = range(params.get("year"), 5700, 5900);
  const role = params.get("people.role");
  s.role = ROLES.includes(role as PersonRole) ? (role as PersonRole) : null;
  const scope = params.get("scope");
  if (scope === "full" || scope === "clips") s.scope = scope;
  const sort = params.get("sort");
  if (SORTS.includes(sort as SortKey)) s.sort = sort as SortKey;
  if (params.get("view") === "table") s.view = "table";
  const page = Number(params.get("page"));
  if (Number.isInteger(page) && page > 1) s.page = page;
  const cols = list(params.get("cols"));
  if (cols.length) s.cols = cols;
  return s;
}

/** Canonical query string (defaults omitted, facet order stable). */
export function toQuery(s: SearchState, facetKeys: readonly string[]): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.in !== "all") p.set("in", s.in);
  for (const k of facetKeys) {
    const sel = s.sel[k];
    if (!sel) continue;
    if (sel.any.length) p.set(k, sel.any.join(","));
    if (sel.all && sel.any.length) p.set(`${k}.mode`, "all");
    if (sel.not.length) p.set(`${k}.not`, sel.not.join(","));
  }
  if (s.langAny && !s.sel["lang"]) p.set("lang", "any");
  if (s.role) p.set("people.role", s.role);
  if (s.age) p.set("age", `${s.age[0]}-${s.age[1]}`);
  if (s.year) p.set("year", `${s.year[0]}-${s.year[1]}`);
  if (s.scope !== "both") p.set("scope", s.scope);
  if (s.sort !== "relevance") p.set("sort", s.sort);
  if (s.view !== "list") p.set("view", s.view);
  if (s.cols) p.set("cols", s.cols.join(","));
  if (s.page > 1) p.set("page", String(s.page));
  return p.toString().replace(/%2C/g, ",");
}

/** Toggle helpers (immutably return a new state; page resets to 1). */
export function toggleValue(
  s: SearchState,
  key: string,
  value: string,
  how: "any" | "not",
): SearchState {
  const cur = s.sel[key] ?? emptySel();
  const any = new Set(cur.any);
  const not = new Set(cur.not);
  if (how === "any") {
    if (any.has(value)) any.delete(value);
    else {
      any.add(value);
      not.delete(value);
    }
  } else if (not.has(value)) not.delete(value);
  else {
    not.add(value);
    any.delete(value);
  }
  const next: FacetSel = { any: [...any], not: [...not], all: cur.all };
  const sel = { ...s.sel };
  if (next.any.length || next.not.length || next.all) sel[key] = next;
  else delete sel[key];
  return { ...s, sel, page: 1 };
}

export function activeCount(s: SearchState): number {
  let n = 0;
  for (const sel of Object.values(s.sel)) n += sel.any.length + sel.not.length;
  return n + (s.age ? 1 : 0) + (s.year ? 1 : 0) + (s.scope !== "both" ? 1 : 0) + (s.role ? 1 : 0);
}

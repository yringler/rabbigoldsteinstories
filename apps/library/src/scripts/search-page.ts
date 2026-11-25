/**
 * /search: facets, metadata text search and transcript search (Pagefind), URL state, list and
 * table views, CSV export, vocabulary-first suggestions and keyboard navigation.
 */
import {
  type Hit,
  PagefindEngine,
  type TranscriptEngine,
  type TranscriptLang,
} from "../lib/engine.ts";
import * as B from "../lib/bits.ts";
import {
  AGE_MAX,
  AGE_MIN,
  activeCount,
  applyFacets,
  emptySel,
  type FacetDef,
  FacetIndex,
  facetCounts,
  LIBRARY_FACETS,
  PAGE_SIZE,
  parseState,
  rangeConstraints,
  ROLE_LABELS,
  type SearchState,
  toggleValue,
  toQuery,
} from "../lib/facets.ts";
import { iconSvg } from "../lib/icons.ts";
import type { Suggestion } from "../lib/suggest.ts";
import { suggest } from "../lib/suggest.ts";
import { hasHebrewScript, parseQuery, queryVariants, TextIndex } from "../lib/text.ts";
import { formatDuration, humanLength, totalLength } from "../lib/time.ts";
import { entryOf, trackOf } from "../lib/tracks.ts";
import type { LibCatalog, LibRow, PersonRole } from "../lib/types.ts";
import { $, $$, announce, h, loadCatalog } from "./core.ts";

const KEYS = LIBRARY_FACETS.map((d) => d.key);
const engine: TranscriptEngine = new PagefindEngine();

interface Ctx {
  cat: LibCatalog;
  rows: LibRow[];
  index: FacetIndex<LibRow>;
  text: TextIndex;
  labels: Map<string, Map<string, { label: string; unconfirmed: boolean }>>;
  byId: Map<string, number>;
  years: number[];
}

let ctx: Ctx | null = null;
let state: SearchState = parseState(new URLSearchParams(), KEYS);
let seq = 0;
let focusIdx = -1;
const expanded = new Set<string>();
const facetFilter = new Map<string, string>();
const transcriptCache = new Map<string, { hits: Hit[]; also: string[] }>();
let abortKeys: (() => void) | null = null;
/** Constraints of the last paint (ranges + text), reused when only the facet panel re-renders. */
let lastExtra: B.Bits[] = [];

const COLS: Record<string, string> = {
  title: "Title",
  type: "Type",
  speaker: "Speaker",
  hdate: "Date (Hebrew)",
  gdate: "Date (Gregorian)",
  length: "Length",
  age: "Age",
  midos: "Midos",
  series: "Series",
  episode: "Episode",
  language: "Language",
  mitzvos: "Mitzvos",
  topics: "Topics",
};
const DEFAULT_COLS = ["title", "type", "speaker", "hdate", "gdate", "length", "age", "midos"];

// ---------------------------------------------------------------------------------------------

export async function init(): Promise<void> {
  const app = $("[data-search-app]");
  if (!app) return;
  state = parseState(new URLSearchParams(location.search), KEYS);
  focusIdx = -1;
  bindForm(app);
  const cat = await loadCatalog();
  if (!cat) {
    const c = $("[data-count]");
    if (c) c.textContent = "The catalogue could not be loaded. Please reload the page.";
    return;
  }
  ctx ??= buildCtx(cat);
  await render();
}

function buildCtx(cat: LibCatalog): Ctx {
  const labels = new Map<string, Map<string, { label: string; unconfirmed: boolean }>>();
  for (const [list, entries] of Object.entries(cat.vocab))
    labels.set(
      list,
      new Map(entries.map(([id, label, u]) => [id, { label, unconfirmed: u === 1 }])),
    );
  const years = [
    ...new Set(cat.rows.map((r) => r.hy).filter((y): y is number => y !== undefined)),
  ].sort((a, b) => a - b);
  return {
    cat,
    rows: cat.rows,
    index: new FacetIndex(cat.rows, LIBRARY_FACETS),
    text: new TextIndex(cat.rows),
    labels,
    byId: new Map(cat.rows.map((r, i) => [r.id, i])),
    years,
  };
}

function valueLabel(def: FacetDef<LibRow>, v: string): { label: string; unconfirmed: boolean } {
  if (def.vocab)
    return (
      ctx?.labels.get(def.vocab)?.get(v) ?? { label: v.replace(/_/g, " "), unconfirmed: false }
    );
  return { label: def.labels?.[v] ?? v, unconfirmed: false };
}
const vl = (list: string, id: string) => ctx?.labels.get(list)?.get(id)?.label ?? id;

// ---------------------------------------------------------------------------------------------
// URL and state changes

function commit(next: SearchState, push = true): void {
  state = next;
  const qs = toQuery(state, KEYS);
  const url = `${location.pathname}${qs ? `?${qs}` : ""}`;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  void render();
}

window.addEventListener("popstate", () => {
  if (!$("[data-search-app]")) return;
  state = parseState(new URLSearchParams(location.search), KEYS);
  void render();
});

function bindForm(app: HTMLElement): void {
  const form = $<HTMLFormElement>("[data-search-form]", app);
  const input = $<HTMLInputElement>("[data-search-input]", app);
  if (!form || !input || form.dataset["bound"]) return;
  form.dataset["bound"] = "1";
  input.value = state.q;
  for (const r of $$<HTMLInputElement>('input[name="in"]', form)) r.checked = r.value === state.in;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideSuggest();
    commit({ ...state, q: input.value.trim(), page: 1 });
  });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.name === "in")
      commit({ ...state, in: t.value as SearchState["in"], page: 1 });
  });
  let timer = 0;
  input.addEventListener("input", () => {
    showSuggest(input);
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => commit({ ...state, q: input.value.trim(), page: 1 }, false),
      350,
    );
  });
  input.addEventListener("keydown", (e) => suggestKeys(e, input));
  input.addEventListener("blur", () => window.setTimeout(hideSuggest, 150));

  $("[data-sort]", app)?.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value as SearchState["sort"];
    commit({ ...state, sort: v, page: 1 });
  });
  for (const b of $$<HTMLButtonElement>("[data-view]", app))
    b.addEventListener("click", () =>
      commit({ ...state, view: b.dataset["view"] === "table" ? "table" : "list" }),
    );
  const facets = $("[data-facets]", app);
  const open = $<HTMLButtonElement>("[data-facets-open]", app);
  open?.addEventListener("click", () => {
    facets?.classList.add("open");
    open.setAttribute("aria-expanded", "true");
    $<HTMLElement>("input,button", facets ?? document)?.focus();
  });
  $("[data-facets-close]", app)?.addEventListener("click", () => {
    facets?.classList.remove("open");
    open?.setAttribute("aria-expanded", "false");
    open?.focus();
  });

  abortKeys?.();
  const onKey = (ev: Event) => resultKeys((ev as CustomEvent<KeyboardEvent>).detail);
  document.addEventListener("gsl:key", onKey);
  abortKeys = () => document.removeEventListener("gsl:key", onKey);
  document.addEventListener("astro:before-swap", () => abortKeys?.(), { once: true });
}

// ---------------------------------------------------------------------------------------------
// Suggestions

let suggestions: Suggestion[] = [];
let suggestAt = -1;

function showSuggest(input: HTMLInputElement): void {
  const list = $("[data-suggest]");
  if (!list || !ctx) return;
  const c = ctx;
  const preferred =
    rangeConstraints(c.rows, { ...state, age: null, year: null, scope: "both" })[0] ?? c.index.all;
  const counts = (facet: string, value: string) =>
    B.countAnd(c.index.bits(facet, value), preferred);
  const places = c.index.values("places");
  const episodes = new Set(
    c.rows
      .filter((r) => r.type === "radio_episode" && r.ep !== undefined)
      .map((r) => r.ep as number),
  );
  suggestions = suggest(input.value, {
    vocab: c.cat.vocab,
    counts,
    places,
    serials: c.cat.serials,
    episodes,
  });
  suggestAt = -1;
  if (!suggestions.length) return hideSuggest();
  list.replaceChildren(
    ...suggestions.map((s, i) => {
      const li = h(
        "li",
        { role: "option", id: `sg-${i}`, "aria-selected": "false" },
        h("span", {}, s.label),
        h("span", { class: "grp" }, `${s.group}${s.count ? ` · ${s.count}` : ""}`),
      );
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        choose(s, input);
      });
      return li;
    }),
  );
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function hideSuggest(): void {
  const list = $("[data-suggest]");
  if (list) list.hidden = true;
  $("[data-search-input]")?.setAttribute("aria-expanded", "false");
  $("[data-search-input]")?.removeAttribute("aria-activedescendant");
}

function choose(s: Suggestion, input: HTMLInputElement): void {
  hideSuggest();
  if (s.kind === "link") {
    location.assign(s.href);
    return;
  }
  input.value = "";
  const cur = state.sel[s.facet] ?? emptySel();
  const sel = { ...state.sel, [s.facet]: { ...cur, any: [...new Set([...cur.any, s.value])] } };
  commit({ ...state, q: "", sel, page: 1 });
  announce(`Filter added: ${s.group} ${s.label}`);
}

function suggestKeys(e: KeyboardEvent, input: HTMLInputElement): void {
  const list = $("[data-suggest]");
  if (!list || list.hidden || !suggestions.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    suggestAt =
      (suggestAt + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
    $$("li", list).forEach((li, i) => li.setAttribute("aria-selected", String(i === suggestAt)));
    input.setAttribute("aria-activedescendant", `sg-${suggestAt}`);
  } else if (e.key === "Enter" && suggestAt >= 0) {
    e.preventDefault();
    const s = suggestions[suggestAt];
    if (s) choose(s, input);
  } else if (e.key === "Escape") hideSuggest();
}

// ---------------------------------------------------------------------------------------------
// Search pipeline

interface Result {
  i: number;
  row: LibRow;
  meta: number;
  tr: number;
  hit?: Hit;
  nested: LibRow[];
}

async function transcriptSearch(q: string): Promise<{ hits: Hit[]; also: string[] }> {
  const key = q.toLowerCase();
  const cached = transcriptCache.get(key);
  if (cached) return cached;
  const langs: TranscriptLang[] = hasHebrewScript(q) ? ["yi"] : ["en"];
  let hits = await engine.search(q, langs);
  const also: string[] = [];
  if (hits.length < 20 && !hasHebrewScript(q)) {
    const vars = queryVariants(q);
    const more = await Promise.all(vars.map((v) => engine.search(v, langs)));
    const best = new Map(hits.map((h) => [h.id, h]));
    more.forEach((list, i) => {
      if (list.length) also.push(vars[i] ?? "");
      for (const hit of list) {
        const cur = best.get(hit.id);
        if (!cur || hit.score > cur.score) best.set(hit.id, hit);
      }
    });
    hits = [...best.values()];
  }
  const out = { hits, also };
  transcriptCache.set(key, out);
  return out;
}

async function render(): Promise<void> {
  if (!ctx) return;
  const c = ctx;
  const my = ++seq;
  syncControls();
  const status = $("[data-status]");
  const extra = rangeConstraints(c.rows, state);
  let meta = new Map<number, number>();
  const tr = new Map<number, { score: number; hit: Hit }>();
  let also: string[] = [];
  let transcriptAvailable = true;
  if (state.q) {
    if (state.in !== "transcript") meta = c.text.search(parseQuery(state.q));
    if (state.in !== "meta") {
      if (status) status.textContent = "Searching transcripts…";
      paint(c, extra, meta, tr, also, true);
      try {
        transcriptAvailable = await (engine as PagefindEngine).available(
          hasHebrewScript(state.q) ? "yi" : "en",
        );
        const res = await transcriptSearch(state.q);
        if (my !== seq) return;
        also = res.also;
        for (const hit of res.hits) {
          const i = c.byId.get(hit.id);
          if (i === undefined) continue;
          const cur = tr.get(i);
          if (!cur || hit.score > cur.score) tr.set(i, { score: hit.score, hit });
        }
      } catch {
        transcriptAvailable = false;
      }
    }
  }
  if (my !== seq) return;
  paint(c, extra, meta, tr, also, false, transcriptAvailable);
}

function paint(
  c: Ctx,
  extra: B.Bits[],
  meta: Map<number, number>,
  tr: Map<number, { score: number; hit: Hit }>,
  also: string[],
  pending: boolean,
  transcriptAvailable = true,
): void {
  const all = [...extra];
  if (state.q) {
    const text = B.empty(c.rows.length);
    for (const i of meta.keys()) B.set(text, i);
    for (const i of tr.keys()) B.set(text, i);
    all.push(text);
  }
  lastExtra = all;
  const bits = applyFacets(c.index, state, all);
  let results: Result[] = B.indices(bits).map((i) => {
    const r: Result = {
      i,
      row: c.rows[i] as LibRow,
      meta: meta.get(i) ?? 0,
      tr: tr.get(i)?.score ?? 0,
      nested: [],
    };
    const hit = tr.get(i)?.hit;
    if (hit) r.hit = hit;
    return r;
  });
  // Clips nest under their episode when both match (scope "both").
  if (state.scope === "both") {
    const byId = new Map(results.map((r) => [r.row.id, r]));
    results = results.filter((r) => {
      const parent = r.row.clipOf.map((p) => byId.get(p)).find((p) => p !== undefined);
      if (!parent || parent === r) return true;
      parent.nested.push(r.row);
      parent.meta = Math.max(parent.meta, r.meta);
      parent.tr = Math.max(parent.tr, r.tr);
      return false;
    });
  }
  sortResults(results);
  const total = results.length;
  const secs = results.reduce((a, r) => a + r.row.dur, 0);
  const count = $("[data-count]");
  const nested = results.reduce((a, r) => a + r.nested.length, 0);
  if (count) {
    count.textContent = `${total.toLocaleString("en")} recording${total === 1 ? "" : "s"} · ${totalLength(secs)}`;
    if (nested)
      count.append(
        h(
          "span",
          { class: "nested-note" },
          ` + ${nested} clip${nested === 1 ? "" : "s"} shown under their episodes`,
        ),
      );
  }
  if (!pending) announce(`${total} recordings`);
  const status = $("[data-status]");
  if (status && !pending) {
    const parts: string[] = [];
    if (state.q && state.in !== "meta" && !transcriptAvailable)
      parts.push(
        "Transcript search is not available right now; titles and summaries were searched.",
      );
    if (also.length) parts.push(`Also searched: ${also.join(", ")}`);
    status.textContent = parts.join(" ");
  }
  renderActive(c);
  renderFacets(c, all);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  const slice =
    state.view === "table" ? results : results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (state.view === "table") renderTable(results);
  else renderList(slice);
  renderPager(state.view === "table" ? 1 : pages, page);
  focusIdx = -1;
}

/** With no query, minor material (fragments, promos, songs) goes after the rest. */
const MINOR: Partial<Record<LibRow["type"], number>> = { fragment: 2, promo: 2, song: 1 };

function sortResults(rs: Result[]): void {
  const date = (r: Result) => r.row.sortKey || 99999999;
  const minor = (r: Result) => MINOR[r.row.type] ?? 0;
  const by: Record<SearchState["sort"], (a: Result, b: Result) => number> = {
    relevance: state.q
      ? (a, b) => 3 * b.meta + b.tr - (3 * a.meta + a.tr) || date(a) - date(b)
      : (a, b) =>
          minor(a) - minor(b) || date(a) - date(b) || a.row.title.localeCompare(b.row.title),
    date: (a, b) => date(a) - date(b) || a.row.title.localeCompare(b.row.title),
    "date-desc": (a, b) =>
      (b.row.sortKey || 0) - (a.row.sortKey || 0) || a.row.title.localeCompare(b.row.title),
    title: (a, b) => a.row.title.localeCompare(b.row.title, "en", { numeric: true }),
    length: (a, b) => a.row.dur - b.row.dur,
    episode: (a, b) => (a.row.ep ?? 9999) - (b.row.ep ?? 9999) || date(a) - date(b),
  };
  rs.sort(by[state.sort]);
}

// ---------------------------------------------------------------------------------------------
// Controls

function syncControls(): void {
  const input = $<HTMLInputElement>("[data-search-input]");
  if (input && document.activeElement !== input) input.value = state.q;
  for (const r of $$<HTMLInputElement>('[data-search-in] input[name="in"]'))
    r.checked = r.value === state.in;
  const sort = $<HTMLSelectElement>("[data-sort]");
  if (sort) sort.value = state.sort;
  for (const b of $$<HTMLButtonElement>("[data-view]"))
    b.setAttribute("aria-pressed", String(b.dataset["view"] === state.view));
  const n = activeCount(state);
  const fl = $("[data-filters-label]");
  if (fl) fl.textContent = n ? `Filters (${n})` : "Filters";
}

function renderActive(c: Ctx): void {
  const bar = $("[data-active-bar]");
  if (!bar) return;
  const chips: HTMLElement[] = [];
  const chip = (text: string, remove: () => void, not = false) => {
    const b = h("button", {
      type: "button",
      "aria-label": `Remove filter ${text}`,
      html: iconSvg("close", 12),
    });
    b.addEventListener("click", remove);
    chips.push(h("span", { class: `chip${not ? " not" : ""}` }, text, b));
  };
  for (const def of c.index.defs) {
    const sel = state.sel[def.key];
    if (!sel) continue;
    const mode = sel.all && sel.any.length > 1 ? " (all)" : "";
    for (const v of sel.any)
      chip(
        `${def.kind === "exclude" ? "Leave out" : def.label}: ${valueLabel(def, v).label}${mode}`,
        () => commit(toggleValue(state, def.key, v, "any")),
        def.kind === "exclude",
      );
    for (const v of sel.not)
      chip(
        `${def.label}: ${valueLabel(def, v).label}`,
        () => commit(toggleValue(state, def.key, v, "not")),
        true,
      );
  }
  if (state.role)
    chip(`Person role: ${ROLE_LABELS[state.role]}`, () => commit({ ...state, role: null }));
  if (state.age)
    chip(`Ages ${state.age[0]}–${state.age[1]}`, () => commit({ ...state, age: null, page: 1 }));
  if (state.year)
    chip(`Years ${state.year[0]}–${state.year[1]}`, () =>
      commit({ ...state, year: null, page: 1 }),
    );
  if (state.scope !== "both")
    chip(state.scope === "full" ? "Full episodes only (no clips)" : "Clips and stories only", () =>
      commit({ ...state, scope: "both", page: 1 }),
    );
  if (!chips.length) {
    bar.hidden = true;
    return;
  }
  const clear = h("button", { type: "button", class: "btn btn-quiet" }, "Clear all");
  clear.addEventListener("click", () =>
    commit({ ...state, sel: {}, age: null, year: null, role: null, scope: "both", page: 1 }),
  );
  const copy = h("button", {
    type: "button",
    class: "btn btn-quiet",
    html: `${iconSvg("link", 16)} Copy link`,
  });
  copy.addEventListener(
    "click",
    () => void navigator.clipboard?.writeText(location.href).then(() => announce("Link copied")),
  );
  bar.replaceChildren(h("span", { class: "small muted" }, "Active:"), ...chips, clear, copy);
  bar.hidden = false;
}

function renderFacets(c: Ctx, extra: B.Bits[]): void {
  const body = $("[data-facets-body]");
  if (!body) return;
  const focused =
    document.activeElement instanceof HTMLElement && body.contains(document.activeElement)
      ? focusKey(document.activeElement)
      : null;
  const out: HTMLElement[] = [];
  out.push(
    scopeBlock(),
    rangeBlock("age", "Suitable from age", AGE_MIN, AGE_MAX, state.age, (v) => `${v}`),
  );
  if (c.years.length)
    out.push(
      rangeBlock(
        "year",
        "Hebrew year",
        c.years[0] ?? 5742,
        c.years[c.years.length - 1] ?? 5790,
        state.year,
        (v) => `${v}`,
        c.years,
      ),
    );
  for (const def of c.index.defs) out.push(facetBlock(c, def, extra));
  body.replaceChildren(...out);
  if (focused) restoreFocus(body, focused);
}

function focusKey(el: HTMLElement): string | null {
  return el.dataset["fk"] ?? null;
}
function restoreFocus(root: HTMLElement, key: string): void {
  root.querySelector<HTMLElement>(`[data-fk="${CSS.escape(key)}"]`)?.focus();
}

function scopeBlock(): HTMLElement {
  const opts: [SearchState["scope"], string][] = [
    ["both", "Both"],
    ["full", "Full episodes only"],
    ["clips", "Clips and stories only"],
  ];
  const fs = h(
    "fieldset",
    { class: "facet" },
    h("legend", { class: "facet-head" }, h("h3", {}, "Clips and full episodes")),
  );
  for (const [v, l] of opts) {
    const input = h("input", { type: "radio", name: "scope", value: v, "data-fk": `scope:${v}` });
    input.checked = state.scope === v;
    input.addEventListener("change", () => commit({ ...state, scope: v, page: 1 }));
    fs.append(h("div", { class: "fv" }, h("label", {}, input, h("span", { class: "l" }, l))));
  }
  return fs;
}

function rangeBlock(
  key: "age" | "year",
  title: string,
  lo: number,
  hi: number,
  cur: [number, number] | null,
  fmt: (v: number) => string,
  values?: number[],
): HTMLElement {
  const vals = values ?? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const mk = (which: 0 | 1) => {
    const sel = h("select", {
      "aria-label": `${title}, ${which === 0 ? "from" : "to"}`,
      "data-fk": `${key}:${which}`,
    });
    for (const v of vals) sel.append(h("option", { value: v }, fmt(v)));
    sel.value = String(cur ? cur[which] : which === 0 ? lo : hi);
    sel.addEventListener("change", () => {
      const a = Number(from.value);
      const b = Number(to.value);
      const range: [number, number] = [Math.min(a, b), Math.max(a, b)];
      const isAll = range[0] === lo && range[1] === hi;
      commit({ ...state, [key]: isAll ? null : range, page: 1 });
    });
    return sel;
  };
  const from = mk(0);
  const to = mk(1);
  const hint =
    key === "age"
      ? h("p", { class: "facet-hint" }, "The youngest age each recording suits.")
      : null;
  return h(
    "div",
    { class: "facet" },
    h("div", { class: "facet-head" }, h("h3", {}, title)),
    hint,
    h("div", { class: "range-row" }, from, "to", to),
  );
}

function facetBlock(c: Ctx, def: FacetDef<LibRow>, extra: B.Bits[]): HTMLElement {
  const sel = state.sel[def.key] ?? emptySel();
  const counts = facetCounts(c.index, state, def.key, extra);
  let values = def.order ? def.order.filter((v) => counts.has(v)) : [...counts.keys()];
  if (!def.order)
    values.sort(
      (a, b) =>
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
        valueLabel(def, a).label.localeCompare(valueLabel(def, b).label),
    );
  // Zero counts go to the bottom (greyed), selected ones stay visible.
  const isSel = (v: string) => sel.any.includes(v) || sel.not.includes(v);
  values = [
    ...values.filter((v) => (counts.get(v) ?? 0) > 0 || isSel(v)),
    ...values.filter((v) => (counts.get(v) ?? 0) === 0 && !isSel(v)),
  ];
  const filter = (facetFilter.get(def.key) ?? "").toLowerCase();
  if (filter)
    values = values.filter((v) => valueLabel(def, v).label.toLowerCase().includes(filter));
  const open = expanded.has(def.key) || filter !== "";
  const limit = def.long && !open ? 8 : def.key === "places" && !open ? 8 : open ? Infinity : 12;
  const shown = values.filter((v, i) => i < limit || isSel(v));
  const fs = h("fieldset", { class: "facet", "data-facet": def.key });
  const head = h("legend", { class: "facet-head" }, h("h3", {}, def.label));
  if (def.allowAll) {
    const grp = h("span", {
      class: "anyall",
      role: "group",
      "aria-label": `${def.label}: match any or all`,
    });
    for (const mode of ["any", "all"] as const) {
      const b = h(
        "button",
        {
          type: "button",
          "aria-pressed": String(sel.all === (mode === "all")),
          "data-fk": `${def.key}:mode:${mode}`,
        },
        mode,
      );
      b.addEventListener("click", () => {
        const cur = state.sel[def.key] ?? emptySel();
        const next = { ...state.sel, [def.key]: { ...cur, all: mode === "all" } };
        if (!next[def.key]?.any.length && !next[def.key]?.not.length && mode === "any")
          delete next[def.key];
        commit({ ...state, sel: next, page: 1 });
      });
      grp.append(b);
    }
    head.append(grp);
  }
  fs.append(head);
  if (def.hint) fs.append(h("p", { class: "facet-hint" }, def.hint));
  if (def.roleAware) {
    const roleSel = h("select", {
      "aria-label": "Person's role",
      class: "facet-filter",
      "data-fk": "people:role",
    });
    roleSel.append(h("option", { value: "" }, "Any role"));
    for (const [k, l] of Object.entries(ROLE_LABELS)) roleSel.append(h("option", { value: k }, l));
    roleSel.value = state.role ?? "";
    roleSel.addEventListener("change", () =>
      commit({ ...state, role: (roleSel.value || null) as PersonRole | null, page: 1 }),
    );
    fs.append(roleSel);
  }
  if (def.long && values.length + (filter ? 1 : 0) > 8) {
    const f = h("input", {
      type: "search",
      class: "facet-filter",
      placeholder: `Filter ${def.label.toLowerCase()}…`,
      "aria-label": `Filter ${def.label} values`,
      "data-fk": `${def.key}:filter`,
      "data-facet-filter": "",
    });
    f.value = facetFilter.get(def.key) ?? "";
    f.addEventListener("input", () => {
      facetFilter.set(def.key, f.value);
      if (ctx) renderFacets(ctx, lastExtra);
    });
    fs.append(f);
  }
  for (const v of shown) {
    const n = counts.get(v) ?? 0;
    const { label, unconfirmed } = valueLabel(def, v);
    const excluded = def.kind === "exclude" ? sel.any.includes(v) : sel.not.includes(v);
    const checked = def.kind !== "exclude" && sel.any.includes(v);
    const box = h("input", {
      type: "checkbox",
      "data-fk": `${def.key}:${v}`,
      "data-value": v,
      "data-facet-key": def.key,
    });
    box.checked = checked || (def.kind === "exclude" && excluded);
    box.addEventListener("change", () => commit(toggleValue(state, def.key, v, "any")));
    const row = h("div", {
      class: `fv${n === 0 && !checked && !excluded ? " zero" : ""}${excluded ? " excluded" : ""}`,
    });
    const lab = h(
      "label",
      {},
      box,
      h("span", { class: `l${unconfirmed ? " unconfirmed" : ""}`, title: label }, label),
    );
    row.append(lab);
    if (def.kind !== "exclude") {
      const not = h(
        "button",
        {
          type: "button",
          class: "not",
          "aria-pressed": String(excluded),
          "aria-label": `Exclude ${label}`,
          "data-fk": `${def.key}:${v}:not`,
        },
        "not",
      );
      not.addEventListener("click", () => commit(toggleValue(state, def.key, v, "not")));
      row.append(not);
    } else row.append(h("span"));
    row.append(h("span", { class: "n" }, n.toLocaleString("en")));
    fs.append(row);
  }
  if (values.length > shown.length || (open && values.length > 8 && !filter)) {
    const more = h(
      "button",
      { type: "button", class: "more", "data-fk": `${def.key}:more` },
      open ? "Show fewer" : `Show all ${values.length}`,
    );
    more.addEventListener("click", () => {
      if (open) expanded.delete(def.key);
      else expanded.add(def.key);
      if (ctx) void render();
    });
    fs.append(more);
  }
  return fs;
}

// ---------------------------------------------------------------------------------------------
// Results

function resultActions(row: LibRow, hitT?: number): HTMLElement {
  const track = JSON.stringify(trackOf(row));
  const entry = JSON.stringify(entryOf(row));
  return h(
    "div",
    { class: "rec-actions" },
    h("button", {
      type: "button",
      class: "btn btn-primary",
      "data-action": "play",
      "data-track": track,
      ...(hitT !== undefined ? { "data-at": hitT } : {}),
      html: `${iconSvg("play", 14)} Play`,
    }),
    h("button", {
      type: "button",
      class: "btn",
      "data-action": "queue",
      "data-track": track,
      html: `${iconSvg("queue", 16)} Queue`,
    }),
    h("button", {
      type: "button",
      class: "btn",
      "data-action": "add",
      "data-entry": entry,
      "data-what": row.title,
      html: `${iconSvg("plus", 16)} Playlist`,
    }),
    h("a", {
      class: "btn btn-quiet",
      href: `/r/${row.id}/#cite`,
      html: `${iconSvg("quote", 16)} Cite`,
    }),
  );
}

function metaLine(row: LibRow): HTMLElement {
  const sp = row.speakers.filter((s) => s !== "guest_children").map((s) => vl("speakers", s));
  return h(
    "div",
    { class: "rec-meta" },
    h("span", {}, vl("content_type", row.type)),
    sp.length ? h("span", {}, sp.join(", ")) : null,
    row.dateLabel ? h("span", { class: "hdate" }, row.dateLabel) : null,
    row.dateGreg ? h("span", {}, row.dateGreg) : null,
    h("span", { class: "num" }, humanLength(row.dur)),
    h("span", {}, `ages ${row.age}+`),
    row.lang !== "en" ? h("span", {}, row.lang === "yi" ? "Yiddish" : "Hebrew") : null,
    row.midos.length
      ? h(
          "span",
          {},
          row.midos
            .slice(0, 3)
            .map((m) => vl("midos", m))
            .join(", "),
        )
      : null,
  );
}

function renderList(slice: Result[]): void {
  const host = $("[data-results]");
  if (!host) return;
  if (!slice.length) {
    host.replaceChildren(emptyState());
    return;
  }
  const q = state.q;
  const ol = h("ol", { class: "rec-list", "data-result-list": "" });
  for (const r of slice) {
    const row = r.row;
    const href = `/r/${row.id}/${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    const li = h(
      "li",
      { class: "rec", "data-id": row.id },
      h(
        "div",
        {},
        h("h3", { class: "rec-title" }, h("a", { href }, row.title)),
        metaLine(row),
        h("p", { class: "rec-sum" }, row.summary),
        r.tr > 0 && r.meta === 0 ? h("span", { class: "found-in" }, "Found in transcript") : null,
      ),
      h(
        "div",
        { class: "rec-side" },
        row.ep !== undefined ? `Ep. ${row.ep}` : "",
        row.versions ? h("div", {}, `${row.versions + 1} versions`) : null,
      ),
    );
    if (r.hit) {
      const hits = h("ul", { class: "rec-hits", "aria-label": "Matches in the transcript" });
      li.append(hits);
      void fillHits(hits, r.hit, row, q);
    }
    if (r.nested.length) {
      li.append(
        h(
          "div",
          { class: "rec-nested" },
          ...r.nested.map((n) =>
            h(
              "div",
              {},
              "Also as a ",
              h("a", { href: `/r/${n.id}/` }, `${humanLength(n.dur)} clip: ${n.title}`),
            ),
          ),
        ),
      );
    }
    li.append(resultActions(row));
    ol.append(li);
  }
  host.replaceChildren(ol);
}

async function fillHits(ul: HTMLElement, hit: Hit, row: LibRow, q: string): Promise<void> {
  const { passages, more } = await hit.passages(3);
  ul.replaceChildren(
    ...passages.map((p) => {
      const href = `/r/${row.id}/?t=${Math.floor(p.t)}&q=${encodeURIComponent(q)}`;
      if (p.excerpt === null)
        return h(
          "li",
          {},
          h("a", { class: "t", href }, formatDuration(p.t)),
          h("span", { class: "muted" }, `Match in the Yiddish recording at ${formatDuration(p.t)}`),
        );
      return h(
        "li",
        {},
        h("a", { class: "t", href }, formatDuration(p.t)),
        h("span", { html: `“${p.excerpt}”` }),
      );
    }),
    ...(more
      ? [h("li", { class: "small muted" }, `+${more} more match${more === 1 ? "" : "es"}`)]
      : []),
  );
}

function emptyState(): HTMLElement {
  return h(
    "div",
    { class: "empty-state" },
    h("h3", {}, "No recordings match"),
    h(
      "p",
      { class: "muted" },
      state.q
        ? `Nothing matches “${state.q}” with these filters. Try fewer words, another spelling, or remove a filter.`
        : "Remove a filter to see more.",
    ),
  );
}

function cell(row: LibRow, col: string): string {
  switch (col) {
    case "title":
      return row.title;
    case "type":
      return vl("content_type", row.type);
    case "speaker":
      return row.speakers
        .filter((s) => s !== "guest_children")
        .map((s) => vl("speakers", s))
        .join(", ");
    case "hdate":
      return row.dateLabel ?? "";
    case "gdate":
      return row.date ?? "";
    case "length":
      return formatDuration(row.dur);
    case "age":
      return `${row.age}+`;
    case "midos":
      return row.midos.map((m) => vl("midos", m)).join(", ");
    case "series":
      return row.series ? vl("series", row.series) : "";
    case "episode":
      return row.ep !== undefined ? String(row.ep) : "";
    case "language":
      return { en: "English", yi: "Yiddish", he: "Hebrew" }[row.lang];
    case "mitzvos":
      return row.mitzvos.map((m) => vl("mitzvos", m)).join(", ");
    case "topics":
      return row.topics.map((m) => vl("topics", m)).join(", ");
  }
  return "";
}

const SORT_FOR_COL: Record<string, SearchState["sort"]> = {
  title: "title",
  hdate: "date",
  gdate: "date",
  length: "length",
  episode: "episode",
};

function renderTable(results: Result[]): void {
  const host = $("[data-results]");
  if (!host) return;
  if (!results.length) {
    host.replaceChildren(emptyState());
    return;
  }
  const cols = state.cols?.filter((c) => c in COLS) ?? DEFAULT_COLS;
  const chooser = h("details", { class: "cols-menu" }, h("summary", { class: "btn" }, "Columns"));
  const box = h("div", {});
  for (const [k, l] of Object.entries(COLS)) {
    const cb = h("input", { type: "checkbox", value: k });
    cb.checked = cols.includes(k);
    cb.disabled = k === "title";
    cb.addEventListener("change", () => {
      const next = Object.keys(COLS).filter((c) => (c === k ? cb.checked : cols.includes(c)));
      commit({ ...state, cols: next.join(",") === DEFAULT_COLS.join(",") ? null : next }, false);
    });
    box.append(h("label", {}, cb, l));
  }
  chooser.append(box);
  const csv = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("download", 16)} Download these results as CSV`,
  });
  csv.addEventListener("click", () =>
    downloadCsv(
      results.map((r) => r.row),
      cols,
    ),
  );
  const table = h("table", { class: "data results-table" });
  const thead = h("tr", {});
  for (const col of cols) {
    const s = SORT_FOR_COL[col];
    if (s) {
      const b = h(
        "button",
        { type: "button", class: "sort" },
        COLS[col] ?? col,
        state.sort === s ? " ▲" : "",
      );
      b.addEventListener("click", () => commit({ ...state, sort: s, page: 1 }));
      thead.append(
        h("th", { scope: "col", "aria-sort": state.sort === s ? "ascending" : null }, b),
      );
    } else thead.append(h("th", { scope: "col" }, COLS[col] ?? col));
  }
  thead.append(h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Actions")));
  table.append(h("thead", {}, thead));
  const tbody = h("tbody", { "data-result-list": "" });
  for (const r of results.slice(0, 1000)) {
    const tr = h("tr", { class: "rec-tr", "data-id": r.row.id });
    for (const col of cols) {
      if (col === "title")
        tr.append(
          h("td", { class: "title-cell" }, h("a", { href: `/r/${r.row.id}/` }, r.row.title)),
        );
      else
        tr.append(
          h("td", { class: col === "length" || col === "episode" ? "num" : "" }, cell(r.row, col)),
        );
    }
    tr.append(
      h(
        "td",
        {},
        h("button", {
          type: "button",
          class: "icon-btn",
          "data-action": "play",
          "data-track": JSON.stringify(trackOf(r.row)),
          "aria-label": `Play ${r.row.title}`,
          html: iconSvg("play", 16),
        }),
        h("button", {
          type: "button",
          class: "icon-btn",
          "data-action": "add",
          "data-entry": JSON.stringify(entryOf(r.row)),
          "data-what": r.row.title,
          "aria-label": `Add ${r.row.title} to a playlist`,
          html: iconSvg("plus", 16),
        }),
      ),
    );
    tbody.append(tr);
  }
  table.append(tbody);
  const note =
    results.length > 1000
      ? h(
          "p",
          { class: "small muted" },
          `Showing the first 1,000 of ${results.length}; the CSV has them all.`,
        )
      : null;
  host.replaceChildren(
    h("div", { class: "table-tools" }, chooser, csv),
    h("div", { class: "table-wrap" }, table),
    note ?? "",
  );
}

function downloadCsv(rows: LibRow[], cols: string[]): void {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = ["id", "url", ...cols.map((c) => COLS[c] ?? c)];
  const lines = [header.map(q).join(",")];
  for (const r of rows)
    lines.push(
      [r.id, `${location.origin}/r/${r.id}/`, ...cols.map((c) => cell(r, c))].map(q).join(","),
    );
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv" });
  const a = h("a", {
    href: URL.createObjectURL(blob),
    download: `goldstein-search-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function renderPager(pages: number, page: number): void {
  const nav = $("[data-pager]");
  if (!nav) return;
  if (pages <= 1) {
    nav.replaceChildren();
    return;
  }
  const btn = (p: number, text: string, current = false) => {
    const qs = toQuery({ ...state, page: p }, KEYS);
    const a = h(
      "a",
      { class: "btn", href: `?${qs}`, "aria-current": current ? "page" : null },
      text,
    );
    a.addEventListener("click", (e) => {
      e.preventDefault();
      commit({ ...state, page: p });
      $("[data-count]")?.scrollIntoView({ block: "start" });
    });
    return a;
  };
  const items: HTMLElement[] = [];
  if (page > 1) items.push(btn(page - 1, "‹ Previous"));
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2)
      items.push(btn(p, String(p), p === page));
    else if (Math.abs(p - page) === 3) items.push(h("span", { class: "muted" }, "…"));
  }
  if (page < pages) items.push(btn(page + 1, "Next ›"));
  nav.replaceChildren(...items);
}

// ---------------------------------------------------------------------------------------------
// Keyboard: j/k move, Enter opens, p plays, a adds, x excludes the focused facet value, f focuses filters

function resultKeys(e: KeyboardEvent): void {
  const items = $$<HTMLElement>("[data-result-list] > [data-id]");
  const key = e.key;
  if (key === "f") {
    const target =
      $<HTMLElement>("[data-facet-filter]") ?? $<HTMLElement>("[data-facets-body] input");
    if (window.matchMedia("(max-width: 899px)").matches)
      $<HTMLButtonElement>("[data-facets-open]")?.click();
    target?.focus();
    e.preventDefault();
    return;
  }
  if (key === "x") {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.dataset["facetKey"] && el.dataset["value"]) {
      const def = LIBRARY_FACETS.find((d) => d.key === el.dataset["facetKey"]);
      if (def)
        commit(
          toggleValue(state, def.key, el.dataset["value"], def.kind === "exclude" ? "any" : "not"),
        );
      e.preventDefault();
    }
    return;
  }
  if (!items.length) return;
  if (key === "j" || key === "k") {
    focusIdx = Math.max(0, Math.min(items.length - 1, focusIdx + (key === "j" ? 1 : -1)));
    items.forEach((el, i) => el.classList.toggle("focused", i === focusIdx));
    const el = items[focusIdx];
    el?.scrollIntoView({ block: "nearest" });
    el?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    e.preventDefault();
    return;
  }
  const el = items[focusIdx];
  if (!el) return;
  if (key === "Enter") el.querySelector<HTMLAnchorElement>("a")?.click();
  else if (key === "p") el.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
  else if (key === "a") el.querySelector<HTMLButtonElement>('[data-action="add"]')?.click();
  else return;
  e.preventDefault();
}

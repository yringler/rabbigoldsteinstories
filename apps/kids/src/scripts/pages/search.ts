/**
 * /search (§6.5): client-side MiniSearch over the kids' export, loaded on the first visit. The query
 * never leaves the device (no request, no URL parameter, no logging). Results respect the band and
 * the Gentle switch.
 */
import type MiniSearchType from "minisearch";
import { cardHtml, type Rec } from "../../lib/records.ts";
import { type Kind, withLang } from "../../lib/kinds.ts";
import {
  MINISEARCH_OPTIONS,
  SEARCH_OPTIONS,
  processTerm,
  tokenize,
  type SearchDocument,
} from "../../lib/search.ts";
import { loadIndex, recIn } from "../data.ts";
import { decorateCards } from "../cards.ts";
import * as S from "../state.ts";

let engine: Promise<MiniSearchType<SearchDocument> | null> | null = null;
function loadEngine(): Promise<MiniSearchType<SearchDocument> | null> {
  engine ??= Promise.all([
    import("minisearch"),
    fetch("/kids/search-index.json").then((r) => (r.ok ? r.text() : null)),
  ])
    .then(([mod, json]) =>
      json ? mod.default.loadJSON<SearchDocument>(json, MINISEARCH_OPTIONS) : null,
    )
    .catch(() => null);
  return engine;
}

interface TileHit {
  /** Lower-cased label and aliases. */
  t: string;
  /** Label (for de-duplication). */
  l: string;
  h: string;
}

const GROUPS: { title: string; kinds: Kind[] }[] = [
  { title: "Stories", kinds: ["story"] },
  { title: "Quick Listens", kinds: ["short"] },
  { title: "Radio Shows", kinds: ["show"] },
  { title: "Songs and events", kinds: ["song", "event"] },
];
const PER_GROUP = 12;

function norm(s: string): string[] {
  return tokenize(s)
    .flatMap((w) => {
      const p = processTerm(w);
      return p === null ? [] : Array.isArray(p) ? p : [p];
    })
    .filter(Boolean);
}

export async function initSearch(root: HTMLElement, rerender: boolean): Promise<void> {
  const input = root.querySelector<HTMLInputElement>("[data-q]");
  const out = root.querySelector<HTMLElement>("[data-results]");
  const sugg = root.querySelector<HTMLElement>("[data-suggest]");
  const none = root.querySelector<HTMLElement>("[data-none]");
  const status = root.querySelector<HTMLElement>("[data-status]");
  const hint = root.querySelector<HTMLElement>("[data-lang-hint]");
  if (!input || !out) return;
  let tiles: TileHit[] = [];
  try {
    tiles = JSON.parse(root.querySelector("script[data-tiles]")?.textContent ?? "[]") as TileHit[];
  } catch {
    tiles = [];
  }
  const tileTerms = tiles.map((t) => ({ ...t, words: new Set(norm(t.t)) }));

  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      out.innerHTML = "";
      if (sugg) sugg.hidden = false;
      if (none) none.hidden = true;
      if (status) status.textContent = "";
      if (hint) hint.hidden = true;
      return;
    }
    const [ms, ix] = await Promise.all([loadEngine(), loadIndex()]);
    if (!ms || input.value.trim() !== q) return;
    const v = S.getVariant();
    let hits = ms.search(q, SEARCH_OPTIONS);
    if (hits.length === 0) hits = ms.search(q, { ...SEARCH_OPTIONS, combineWith: "OR" });
    const all = hits.map((h) => ix.byId.get(String(h.id))).filter((r): r is Rec => Boolean(r));
    const recs = all.filter((r) => recIn(r, v));
    // Matches left out only because of the language preference (§4.7).
    const vAny = withLang(v, "any");
    const otherLang = all.filter((r) => !recIn(r, v) && recIn(r, vAny)).length;

    const qWords = norm(q);
    const seen = new Set<string>();
    const tileHits = tileTerms.filter((t) => {
      if (!qWords.every((w) => [...t.words].some((x) => x.startsWith(w)))) return false;
      // Heroes come first; a topic with the same label (e.g. The Baal Shem Tov) is not repeated.
      if (seen.has(t.l)) return false;
      seen.add(t.l);
      return true;
    });

    let html = "";
    if (tileHits.length) {
      html += `<section class="section"><h2 class="res-h">Heroes and topics</h2><div class="tiles">${tileHits
        .slice(0, 8)
        .map((t) => t.h)
        .join("")}</div></section>`;
    }
    for (const g of GROUPS) {
      const list = recs.filter((r) => g.kinds.includes(r.k));
      if (!list.length) continue;
      html +=
        `<section class="section res-group"><h2 class="res-h">${g.title} <span class="count">${list.length}</span></h2>` +
        `<div class="grid">${list.map((r, i) => cardHtml(r, { cls: i >= PER_GROUP ? "more-hide" : "" })).join("")}</div>` +
        (list.length > PER_GROUP
          ? `<div class="more-wrap"><button type="button" class="btn" data-show-more>Show more</button></div>`
          : "") +
        `</section>`;
    }
    out.innerHTML = html;
    decorateCards(out);
    const found = recs.length + tileHits.length;
    if (hint) {
      const lang = S.getLang();
      const text = hint.querySelector("[data-lang-hint-text]");
      const btn = hint.querySelector<HTMLElement>("[data-set-lang]");
      const show = otherLang > 0 && (lang === "en" || (lang === "yi" && recs.length === 0));
      hint.hidden = !show;
      if (show && text && btn) {
        text.textContent =
          lang === "yi"
            ? `No Yiddish stories for that. We found ${otherLang} in English.`
            : `${otherLang} more in Yiddish.`;
        btn.textContent = lang === "yi" ? "Show English too" : "Show Yiddish too";
      }
    }
    if (none) none.hidden = found > 0;
    if (sugg) sugg.hidden = found > 0;
    if (status) status.textContent = found ? `${recs.length} found` : "Nothing found";
  };

  if (rerender) {
    void run();
    return;
  }
  if (root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  let timer: ReturnType<typeof setTimeout> | null = null;
  input.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 60);
  });
  input.addEventListener("focus", () => void loadEngine(), { once: true });
  root.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const chip = t?.closest<HTMLElement>("[data-suggestion]");
    if (chip) {
      input.value = chip.dataset["suggestion"] ?? "";
      void run();
      input.focus();
      return;
    }
    const more = t?.closest<HTMLElement>("[data-show-more]");
    if (more) {
      more
        .closest("section")
        ?.querySelectorAll(".more-hide")
        .forEach((c) => c.classList.remove("more-hide"));
      more.closest(".more-wrap")?.remove();
    }
  });
  void loadEngine();
  if (input.value.trim().length >= 2) void run();
}

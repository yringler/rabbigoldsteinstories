/**
 * Grid pages (/stories, /quick, tag, holiday and parsha pages): single-select sort and filter chips,
 * unplayed-first ordering, 24-at-a-time paging and "Play all stories". Cards stay in the static DOM;
 * band filtering is CSS, ordering is CSS `order`.
 */
import type { Track } from "@goldstein/player";
import { recTrack } from "../../lib/tracks.ts";
import { loadIndex } from "../data.ts";
import { orderCards, playedSet } from "../cards.ts";
import * as S from "../state.ts";

const PAGE = 24;

type SortKey = "new" | "short" | "long" | "az";

const inVariant = (el: HTMLElement, v: string) => (el.dataset["vis"] ?? "").split(" ").includes(v);

function applyGrid(
  grid: HTMLElement,
  sort: SortKey,
  filter: string | null,
  limit: number | null,
): number {
  const played = playedSet();
  orderCards(grid, (c) => {
    const d = Number(c.dataset["d"] ?? 0);
    const t = c.dataset["t"] ?? "";
    switch (sort) {
      case "short":
        return [d, t];
      case "long":
        return [-d, t];
      case "az":
        return [t];
      default:
        return [played.has(c.dataset["id"] ?? "") ? 1 : 0, t];
    }
  });
  const v = S.getVariant();
  const cards = [...grid.querySelectorAll<HTMLElement>(":scope > .card")].sort(
    (a, b) => Number(a.style.order) - Number(b.style.order),
  );
  let shown = 0;
  let matching = 0;
  for (const c of cards) {
    const okFilter = !filter || (c.dataset["f"] ?? "").split(" ").includes(filter);
    const ok = okFilter && inVariant(c, v);
    if (ok) matching++;
    const over = ok && limit !== null && shown >= limit;
    c.classList.toggle("f-hide", !okFilter || over);
    if (ok && !over) shown++;
  }
  return matching;
}

export function initGrid(root: HTMLElement, rerender: boolean): void {
  const state = root as HTMLElement & { _limit?: number };
  if (!rerender || state._limit === undefined) state._limit = PAGE;
  const sortChips = [...root.querySelectorAll<HTMLButtonElement>("[data-sort]")];
  const filterChips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter]")];
  const more = root.querySelector<HTMLButtonElement>("[data-more]");
  const paged = root.dataset["paged"] !== undefined;

  // Pre-select a filter from ?d=<id> (holiday pages link single dates that way).
  const want = new URLSearchParams(location.search).get("d");
  if (want && !rerender) {
    const chip = filterChips.find((c) => c.dataset["filter"] === want);
    if (chip) {
      filterChips.forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
    }
  }

  const render = () => {
    const sort = (sortChips.find((c) => c.getAttribute("aria-pressed") === "true")?.dataset[
      "sort"
    ] ?? "new") as SortKey;
    const f =
      filterChips.find((c) => c.getAttribute("aria-pressed") === "true")?.dataset["filter"] ?? "";
    let total = 0;
    let anyVisible = false;
    for (const grid of root.querySelectorAll<HTMLElement>("[data-grid]")) {
      const n = applyGrid(grid, sort, f || null, paged ? (state._limit ?? PAGE) : null);
      total += n;
      const section = grid.closest<HTMLElement>("[data-grid-section]");
      if (section) section.hidden = n === 0;
      if (n > 0) anyVisible = true;
    }
    if (more) more.hidden = !paged || total <= (state._limit ?? PAGE);
    const empty = root.querySelector<HTMLElement>("[data-grid-empty]");
    if (empty) empty.hidden = anyVisible;
  };

  if (!root.dataset["bound"]) {
    root.dataset["bound"] = "1";
    const pick = (list: HTMLButtonElement[], btn: HTMLButtonElement, toggle: boolean) => {
      const was = btn.getAttribute("aria-pressed") === "true";
      list.forEach((c) => c.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", String(toggle ? !was : true));
      state._limit = PAGE;
      render();
    };
    sortChips.forEach((c) => c.addEventListener("click", () => pick(sortChips, c, false)));
    filterChips.forEach((c) =>
      c.addEventListener("click", () => pick(filterChips, c, c.dataset["filter"] !== "")),
    );
    more?.addEventListener("click", () => {
      state._limit = (state._limit ?? PAGE) + PAGE;
      render();
    });
    root
      .querySelectorAll<HTMLButtonElement>("[data-play-all]")
      .forEach((btn) => btn.addEventListener("click", () => void playAll(root, btn)));
  }
  render();
}

/** "Play all stories": the visible cards of the Stories section, in their current order (max 50). */
async function playAll(root: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const grid = root.querySelector<HTMLElement>(btn.dataset["playAll"] || "[data-grid]");
  if (!grid) return;
  const v = S.getVariant();
  const ids = [...grid.querySelectorAll<HTMLElement>(":scope > .card")]
    .filter((c) => inVariant(c, v))
    .sort((a, b) => Number(a.style.order) - Number(b.style.order))
    .map((c) => c.dataset["id"] ?? "");
  const ix = await loadIndex();
  const tracks: Track[] = ids
    .map((id) => ix.byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, 50)
    .map(recTrack);
  if (tracks.length === 0) return;
  await window.kidsPlayer?.play({
    tracks,
    mode: "replace",
    source: btn.dataset["source"] ?? "Play all",
  });
  window.kidsPlayer?.toast(`Playing ${tracks.length} stories`);
}

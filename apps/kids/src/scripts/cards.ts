/** Card badges from localStorage (§6.2): heart, finished tick, progress bar. */
import { getFavs, getProgress } from "./state.ts";

const heart = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20C5 15.5 2.5 11.5 4 8c1.3-3 5.3-3.6 8-.6 2.7-3 6.7-2.4 8 .6 1.5 3.5-1 7.5-8 12Z" fill="currentColor"/></svg>`;
const tick = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

export function decorateCards(root: ParentNode = document): void {
  const favs = new Set(getFavs().map((f) => f.id));
  const prog = getProgress();
  for (const card of root.querySelectorAll<HTMLElement>(".card[data-id]")) {
    const id = card.dataset["id"] ?? "";
    const p = prog[id];
    const fav = favs.has(id);
    const done = p?.done === true;
    const partial = !done && p !== undefined && p.pos >= 30 && p.dur > 0;
    card.classList.toggle("is-fav", fav);
    card.classList.toggle("is-done", done);
    card.classList.toggle("in-progress", partial);
    if (partial && p)
      card.style.setProperty("--p", `${Math.min(100, (p.pos / p.dur) * 100).toFixed(1)}%`);
    const bdg = card.querySelector(".bdg");
    if (bdg) {
      const html =
        (done ? `<i class="b-done">${tick}<span class="sr">Finished.</span></i>` : "") +
        (fav ? `<i class="b-fav">${heart}<span class="sr">On My Shelf.</span></i>` : "");
      if (bdg.innerHTML !== html) bdg.innerHTML = html;
    }
  }
}

/** Has this item been started or finished? ("New to me" sorts unplayed first.) */
export function playedSet(): Set<string> {
  return new Set(Object.keys(getProgress()));
}

/**
 * Re-order the cards of a grid with CSS `order` (keeps the static DOM, so band filtering by CSS still
 * works). `key` returns a sort tuple; ties keep the build order (title).
 */
export function orderCards(
  grid: HTMLElement,
  key: (card: HTMLElement, i: number) => (number | string)[],
): void {
  const cards = [...grid.querySelectorAll<HTMLElement>(":scope > .card")];
  const keyed = cards.map((c, i) => ({ c, k: key(c, i), i }));
  keyed.sort((a, b) => {
    for (let j = 0; j < a.k.length; j++) {
      const x = a.k[j] ?? 0;
      const y = b.k[j] ?? 0;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return a.i - b.i;
  });
  keyed.forEach((x, n) => (x.c.style.order = String(n)));
}

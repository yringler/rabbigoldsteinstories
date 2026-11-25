/** /favourites "My Shelf" (§4.8): Hearts, Keep Listening, Finished, all from localStorage. */
import { cardHtml, type Rec } from "../../lib/records.ts";
import { VARIANTS } from "../../lib/kinds.ts";
import { loadIndex } from "../data.ts";
import { decorateCards } from "../cards.ts";
import * as S from "../state.ts";

const ALL = VARIANTS;

export async function initShelf(root: HTMLElement): Promise<void> {
  const ix = await loadIndex();
  const recs = (ids: string[]) =>
    ids.map((id) => ix.byId.get(id)).filter((r): r is Rec => Boolean(r));
  const fill = (sel: string, list: Rec[], kicker?: string) => {
    const sec = root.querySelector<HTMLElement>(sel);
    const grid = sec?.querySelector<HTMLElement>("[data-shelf-grid]");
    if (!sec || !grid) return 0;
    sec.hidden = list.length === 0;
    grid.innerHTML = list
      .map((r) => cardHtml(r, { vis: ALL, ...(kicker ? { kicker } : {}) }))
      .join("");
    return list.length;
  };
  const n =
    fill("[data-hearts]", recs(S.getFavs().map((f) => f.id))) +
    fill("[data-keep]", recs(S.keepListening(50))) +
    fill("[data-finished]", recs(S.finished()), "Listen again");
  const empty = root.querySelector<HTMLElement>("[data-shelf-empty]");
  if (empty) empty.hidden = n > 0;
  const clear = root.querySelector<HTMLElement>("[data-clear-wrap]");
  if (clear) clear.hidden = n === 0;
  decorateCards(root);

  if (root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  const dlg = root.querySelector<HTMLDialogElement>("[data-clear-dialog]");
  root.querySelector("[data-clear]")?.addEventListener("click", () => dlg?.showModal());
  dlg?.addEventListener("close", () => {
    if (dlg.returnValue === "yes") {
      S.clearShelf();
      void initShelf(root);
    }
  });
  const refresh = () => {
    if (document.body.contains(root)) void initShelf(root);
  };
  S.on("favs", refresh);
}

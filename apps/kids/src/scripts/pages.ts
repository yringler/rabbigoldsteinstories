/** Per-page client behaviour, chosen by the `data-init` attribute on the page's root element. */
import { initHome } from "./pages/home.ts";
import { initExplore, initGrownups, initHolidays, initListen } from "./pages/misc.ts";
import { initGrid } from "./pages/lists.ts";
import { initRadio } from "./pages/radio.ts";
import { initSerial } from "./pages/serial.ts";
import { initShelf } from "./pages/shelf.ts";
import { initPlaylists } from "./pages/playlists.ts";
import { initSearch } from "./pages/search.ts";

/** `rerender` is true when only the band changed (no navigation). */
export async function initPage(rerender: boolean): Promise<void> {
  const roots = document.querySelectorAll<HTMLElement>("main [data-init]");
  for (const root of roots) {
    try {
      switch (root.dataset["init"]) {
        case "home":
          await initHome(root, rerender);
          break;
        case "grid":
          initGrid(root, rerender);
          break;
        case "radio":
          initRadio(root, rerender);
          break;
        case "serial":
          initSerial(root, rerender);
          break;
        case "shelf":
          await initShelf(root);
          break;
        case "playlists":
          await initPlaylists(root, rerender);
          break;
        case "search":
          await initSearch(root, rerender);
          break;
        case "grownups":
          initGrownups(root);
          break;
        case "explore":
          initExplore(root, rerender);
          break;
        case "holidays":
          await initHolidays(root, rerender);
          break;
        case "listen":
          initListen(root);
          break;
      }
    } catch (e) {
      // A broken enhancement must never break the page; the static content is still there.
      if (import.meta.env.DEV) console.warn(e);
    }
  }
}

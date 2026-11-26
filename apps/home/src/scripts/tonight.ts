// Client entry for the tonight strip (the page's only script). The strip is hidden until data arrives.
import { loadTonight, renderTonight } from "../lib/tonight.ts";

const root = document.querySelector<HTMLElement>("[data-tonight]");
if (root) {
  void loadTonight().then((model) => {
    if (model) renderTonight(root, model);
  });
}

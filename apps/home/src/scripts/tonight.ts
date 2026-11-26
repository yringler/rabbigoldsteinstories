// Client entry for the tonight strip and the bedtime card's CTA (the page's only script). The strip
// is hidden and the CTA links to the bedtime site until data arrives.
import { enhanceTonightCta, loadTonight, renderTonight } from "../lib/tonight.ts";

const root = document.querySelector<HTMLElement>("[data-tonight]");
const cta = document.querySelector<HTMLAnchorElement>("a[data-tonight-cta]");
if (root || cta) {
  void loadTonight().then((model) => {
    if (!model) return;
    if (root) renderTonight(root, model);
    if (cta) enhanceTonightCta(cta, model);
  });
}

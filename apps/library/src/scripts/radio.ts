/** /radio/: switch between grid, list and by-month arrangements (?view=), keep one lost-episode panel open. */
import { $, $$ } from "./core.ts";

export function init(): void {
  const root = $("[data-radio]");
  if (!root) return;
  const show = (view: string) => {
    const v = ["grid", "list", "month"].includes(view) ? view : "grid";
    for (const el of $$<HTMLElement>("[data-arr]", root)) el.hidden = el.dataset["arr"] !== v;
    for (const b of $$<HTMLAnchorElement>("[data-arrange]", root))
      b.setAttribute("aria-pressed", String(b.dataset["arrange"] === v));
    for (const a of $$<HTMLAnchorElement>(".year-rail a", root)) {
      const y = a.getAttribute("href")?.replace(/^#y?l?/, "") ?? "";
      a.setAttribute("href", v === "list" ? `#yl${y}` : `#y${y}`);
    }
  };
  show(new URLSearchParams(location.search).get("view") ?? "grid");
  for (const b of $$<HTMLAnchorElement>("[data-arrange]", root)) {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const v = b.dataset["arrange"] ?? "grid";
      history.replaceState(null, "", v === "grid" ? location.pathname : `?view=${v}`);
      show(v);
    });
  }
  root.addEventListener(
    "toggle",
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open || !d.classList.contains("lost")) return;
      for (const other of $$<HTMLDetailsElement>("details.ep.lost[open]", root))
        if (other !== d) other.open = false;
    },
    true,
  );
  if (/^#ep\d+$/.test(location.hash)) {
    const d = document.getElementById(location.hash.slice(1));
    if (d instanceof HTMLDetailsElement) {
      d.closest<HTMLDetailsElement>(".ep-run")?.setAttribute("open", "");
      d.open = true;
      d.scrollIntoView({ block: "center" });
    }
  }
}

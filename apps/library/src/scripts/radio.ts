/** /radio/: switch between grid, list and by-month arrangements (?view=), keep one lost-episode panel open. */
import { HEBREW_MONTH_ORDER, hebrewParts } from "../lib/dates.ts";
import { $, $$, h } from "./core.ts";

type Ep = [number, string, string, string, number, number | null];

/** Position in the year for "this week" matching (Adar I sits just before Adar/Adar II). */
function dayKey(month: string, day: number): number {
  const m = month === "Adar II" ? "Adar" : month;
  const i = HEBREW_MONTH_ORDER.indexOf(m as (typeof HEBREW_MONTH_ORDER)[number]);
  return (i < 0 ? 0 : i) * 30 + day;
}

/** Radio episodes that aired within a few days of today's Hebrew date, in any year. */
function thisWeek(root: HTMLElement): void {
  const box = $("[data-this-week]", root);
  const list = $("[data-tw-list]", root);
  const sub = $("[data-tw-sub]", root);
  if (!box || !list || box.dataset["done"]) return;
  box.dataset["done"] = "1";
  let eps: Ep[] = [];
  try {
    eps = JSON.parse($("#this-week-data")?.textContent ?? "[]") as Ep[];
  } catch {
    return;
  }
  const today = hebrewParts(new Date().toISOString().slice(0, 10));
  if (!today) return;
  const k = dayKey(today.month, today.day);
  const span = HEBREW_MONTH_ORDER.length * 30;
  const near = eps
    .filter(([, , , m, d]) => {
      const diff = Math.abs(dayKey(m, d) - k);
      return Math.min(diff, span - diff) <= 4;
    })
    .sort((a, b) => (a[5] ?? 0) - (b[5] ?? 0));
  if (!near.length) return;
  if (sub)
    sub.textContent = `Episodes broadcast within a few days of today's date, ${today.day} ${today.month}, in earlier years.`;
  list.replaceChildren(
    ...near.map(([n, id, title, m, d, y]) =>
      h(
        "li",
        {},
        h("a", { href: `/r/${id}/` }, `Episode ${n}: ${title}`),
        h("span", { class: "muted small" }, ` · ${d} ${m}${y ? ` ${y}` : ""}`),
      ),
    ),
  );
  box.hidden = false;
}

export function init(): void {
  const root = $("[data-radio]");
  if (!root) return;
  thisWeek(root);
  const show = (view: string) => {
    const v = ["grid", "list", "month"].includes(view) ? view : "grid";
    for (const el of $$<HTMLElement>("[data-arr]", root)) el.hidden = el.dataset["arr"] !== v;
    for (const b of $$<HTMLAnchorElement>("[data-arrange]", root))
      b.dataset["arrange"] === v
        ? b.setAttribute("aria-current", "true")
        : b.removeAttribute("aria-current");
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

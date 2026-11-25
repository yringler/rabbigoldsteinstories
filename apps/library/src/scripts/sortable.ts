/** Click-to-sort for static tables marked data-sortable (numeric-aware, keyboard accessible). */
import { $$, h } from "./core.ts";

export function init(): void {
  for (const table of $$<HTMLTableElement>("table[data-sortable]")) {
    if (table.dataset["bound"]) continue;
    table.dataset["bound"] = "1";
    const ths = $$<HTMLTableCellElement>("thead th", table);
    ths.forEach((th, col) => {
      const label = th.textContent ?? "";
      const b = h(
        "button",
        { type: "button", class: "sort" },
        label,
        h("span", { "aria-hidden": "true", class: "arrow" }, ""),
      );
      th.replaceChildren(b);
      b.addEventListener("click", () => {
        const asc = th.getAttribute("aria-sort") !== "ascending";
        for (const other of ths) other.removeAttribute("aria-sort");
        th.setAttribute("aria-sort", asc ? "ascending" : "descending");
        for (const other of ths) {
          const arrow = other.querySelector(".arrow");
          if (arrow) arrow.textContent = other === th ? (asc ? " ▲" : " ▼") : "";
        }
        const body = table.tBodies[0];
        if (!body) return;
        const key = (tr: HTMLTableRowElement) =>
          (tr.cells[col]?.dataset["sort"] ?? tr.cells[col]?.textContent ?? "").trim();
        const rows = [...body.rows].sort((a, c) => {
          const x = key(a);
          const y = key(c);
          const nx = Number(x.replace(/[^\d.-]/g, ""));
          const ny = Number(y.replace(/[^\d.-]/g, ""));
          const r =
            /^\d/.test(x) && /^\d/.test(y) && !Number.isNaN(nx) && !Number.isNaN(ny)
              ? nx - ny
              : x.localeCompare(y, "en", { numeric: true });
          return asc ? r : -r;
        });
        body.append(...rows);
      });
    });
  }
}

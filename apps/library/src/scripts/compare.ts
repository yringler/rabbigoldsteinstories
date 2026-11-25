/** Story groups: two English transcripts side by side, from /t/<id>.json (already masked). */
import { formatDuration } from "../lib/time.ts";
import { withClean } from "../lib/tracks.ts";
import { $, $$, h, loadCatalog, player } from "./core.ts";

import type { TRow } from "../lib/transcript-rows.ts";

interface TFile {
  id: string;
  rows: TRow[];
}

const cache = new Map<string, Promise<TFile | null>>();
function load(id: string): Promise<TFile | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/t/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<TFile | null>) : null))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

export function init(): void {
  const root = $("[data-compare]");
  const go = $<HTMLButtonElement>("[data-cmp-go]", root ?? document);
  if (!root || !go || go.dataset["bound"]) return;
  go.dataset["bound"] = "1";
  go.addEventListener("click", () => void show(root));
}

async function show(root: HTMLElement): Promise<void> {
  const cols = $("[data-cmp-cols]", root);
  if (!cols) return;
  cols.hidden = false;
  const cat = await loadCatalog();
  const rows = new Map((cat?.rows ?? []).map((r) => [r.id, r]));
  for (const sel of $$<HTMLSelectElement>("[data-cmp-select]", root)) {
    const col = $(`[data-cmp-col="${sel.dataset["cmpSelect"]}"]`, root);
    if (!col) continue;
    const [id = "", s = "0", e = ""] = sel.value.split("|");
    const start = Number(s);
    const end = e ? Number(e) : Infinity;
    col.replaceChildren(h("p", { class: "muted" }, "Loading…"));
    const t = await load(id);
    const r = rows.get(id);
    if (!t || !r) {
      col.replaceChildren(h("p", { class: "muted" }, "No transcript for this telling."));
      continue;
    }
    const out: HTMLElement[] = [
      h("h3", {}, sel.selectedOptions[0]?.textContent?.replace(/^Telling \d+: /, "") ?? r.title),
    ];
    for (const row of t.rows) {
      if (!Array.isArray(row)) {
        if (row.end < start - 1 || row.start > end + 1) continue;
        out.push(
          h(
            "p",
            { class: "cmp-gap" },
            "Part of this recording is not transcribed (personal details read on air).",
          ),
        );
        continue;
      }
      const [ls, le, text] = row;
      if (le < start - 1 || ls > end + 1) continue;
      const line = h(
        "p",
        { class: "cmp-line", tabindex: "0" },
        h("span", { class: "ts" }, formatDuration(ls)),
        h("span", {}, text),
      );
      const play = () =>
        void player()
          .load(
            [
              withClean(
                { id: r.id, title: r.title, url: r.url, start_sec: r.start, end_sec: r.end },
                r,
              ),
            ],
            0,
            false,
          )
          .then(() => {
            player().seek(ls - r.start);
            return player().play();
          });
      line.addEventListener("click", play);
      line.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") play();
      });
      out.push(line);
    }
    col.replaceChildren(...out);
  }
}

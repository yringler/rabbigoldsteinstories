/**
 * /serial/<key>: Play from Chapter 1 / Continue Chapter N, finished ticks, and story-only mode
 * (default on: each chapter plays only its story range, then the next chapter starts by itself).
 */
import type { Track } from "@goldstein/player";
import * as S from "../state.ts";

interface SerialData {
  title: string;
  ids: string[];
  story: { tracks: Track[]; first: number[] };
  whole: { tracks: Track[]; first: number[] };
}

function data(root: HTMLElement): SerialData | null {
  try {
    return JSON.parse(
      root.querySelector("script[data-serial-data]")?.textContent ?? "null",
    ) as SerialData | null;
  } catch {
    return null;
  }
}

export function initSerial(root: HTMLElement, rerender: boolean): void {
  const d = data(root);
  if (!d) return;
  const toggle = root.querySelector<HTMLInputElement>("[data-story-only]");
  const prog = S.getProgress();

  // Ticks on finished chapters.
  root.querySelectorAll<HTMLElement>("[data-ch-id]").forEach((row) => {
    row.classList.toggle("done", prog[row.dataset["chId"] ?? ""]?.done === true);
  });

  // Continue where the listener is.
  const started = d.ids.some((id) => prog[id]);
  const nextPos = d.ids.findIndex((id) => !prog[id]?.done);
  const main = root.querySelector<HTMLButtonElement>("[data-ch-main]");
  const label = root.querySelector<HTMLElement>("[data-ch-main-label]");
  const pos = started && nextPos > 0 ? nextPos : 0;
  if (main) main.dataset["pos"] = String(pos);
  if (label) {
    const n = root.querySelector<HTMLElement>(`[data-ch-pos="${pos}"]`)?.dataset["n"] ?? "1";
    label.textContent = started && nextPos > 0 ? `Continue Chapter ${n}` : `Play from Chapter ${n}`;
  }

  if (rerender || root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  root.addEventListener("click", (e) => {
    const btn =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-ch-pos],[data-ch-main]")
        : null;
    if (!btn) return;
    e.preventDefault();
    const p = Number(btn.dataset["pos"] ?? btn.dataset["chPos"] ?? 0);
    const mode = toggle?.checked === false ? d.whole : d.story;
    void window.kidsPlayer?.play({
      tracks: mode.tracks,
      index: mode.first[p] ?? 0,
      mode: "replace",
      source: `Chapter stories: ${d.title}`,
    });
  });
}

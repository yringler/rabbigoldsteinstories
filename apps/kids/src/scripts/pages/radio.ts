/** /radio: year tabs, the episode number grid, the "still looking" sheet, Play a show (§4.3). */
import { recTrack } from "../../lib/tracks.ts";
import { loadIndex, recIn } from "../data.ts";
import * as S from "../state.ts";

export function initRadio(root: HTMLElement, rerender: boolean): void {
  if (rerender || root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const select = (tab: HTMLButtonElement, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = tabs[(i + d + tabs.length) % tabs.length];
      if (n) select(n, true);
    });
  });

  const sheet = root.querySelector<HTMLDialogElement>("[data-lost-sheet]");
  root.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-lost]") : null;
    if (!t || !sheet) return;
    const set = (sel: string, text: string) => {
      const el = sheet.querySelector<HTMLElement>(sel);
      if (!el) return;
      el.textContent = text;
      el.hidden = text === "";
    };
    set("[data-lost-num]", `Episode ${t.dataset["lost"] ?? ""}`);
    set("[data-lost-title]", t.dataset["title"] ?? "");
    set("[data-lost-date]", t.dataset["est"] ?? "");
    sheet.showModal();
  });
  sheet?.addEventListener("click", (e) => {
    if (
      e.target === sheet ||
      (e.target instanceof Element && e.target.closest("[data-lost-close]"))
    )
      sheet.close();
  });

  root.querySelector<HTMLButtonElement>("[data-play-show]")?.addEventListener("click", () => {
    void loadIndex().then((ix) => {
      const v = S.getVariant();
      const shows = ix.list.filter((r) => r.k === "show" && recIn(r, v));
      const r = shows[Math.floor(Math.random() * shows.length)];
      if (!r) return;
      void window.kidsPlayer?.play({
        tracks: [recTrack(r)],
        mode: "single",
        source: "Uncle Yossi's radio show",
      });
      window.kidsPlayer?.toast(r.t);
    });
  });
}

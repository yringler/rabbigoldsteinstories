/** Grown-ups, Explore tabs, Holidays order, and the item page's device-dependent bits. */
import { BAND_INFO, type Band, inVariant } from "../../lib/kinds.ts";
import { loadCalendar, localDay } from "../data.ts";
import * as S from "../state.ts";

export function initGrownups(root: HTMLElement): void {
  const sync = () => {
    const b = S.getBand();
    root.querySelectorAll<HTMLButtonElement>("[data-set-band]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset["setBand"] === b));
    });
    const g = root.querySelector<HTMLInputElement>("[data-gentle]");
    if (g) g.checked = S.getGentle();
  };
  sync();
  if (root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  root.querySelectorAll<HTMLButtonElement>("[data-set-band]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const b = btn.dataset["setBand"];
      if (b === "little" || b === "kids" || b === "big") {
        S.setBand(b as Band);
        window.kidsPlayer?.toast(`Showing stories for ${BAND_INFO[b as Band].label}`);
      }
      sync();
    }),
  );
  root.querySelector<HTMLInputElement>("[data-gentle]")?.addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    S.setGentle(on);
    window.kidsPlayer?.toast(on ? "Gentle stories only" : "All stories for this age");
  });
}

export function initExplore(root: HTMLElement, rerender: boolean): void {
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
  };
  if (!rerender) {
    const want = new URLSearchParams(location.search).get("tab");
    const t = tabs.find((x) => x.dataset["tab"] === want);
    if (t) select(t);
  }
  if (root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      select(t);
      history.replaceState(history.state, "", `?tab=${t.dataset["tab"] ?? ""}`);
    });
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = tabs[(i + d + tabs.length) % tabs.length];
      if (n) select(n, true);
    });
  });
}

/** /holidays: tiles ordered starting from the next upcoming holiday. */
export async function initHolidays(root: HTMLElement, rerender: boolean): Promise<void> {
  if (rerender) return;
  const cal = await loadCalendar();
  if (!cal) return;
  const today = localDay();
  root.querySelectorAll<HTMLElement>("[data-holiday]").forEach((el) => {
    const dates = cal.mains[el.dataset["holiday"] ?? ""] ?? [];
    const next = dates.find((d) => d >= today);
    const days = next ? Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000) : 9999;
    el.style.order = String(days);
  });
}

/** Item page: the out-of-band banner and the heart's state. */
export function initListen(root: HTMLElement): void {
  const age = Number(root.dataset["age"] ?? 0);
  const adv = Number(root.dataset["adv"] ?? 0) as 0 | 1 | 2;
  const banner = root.querySelector<HTMLElement>("[data-band-banner]");
  if (banner) {
    const v = S.getVariant();
    banner.hidden = !root.dataset["pool"] || inVariant(age, adv, v);
    const text = banner.querySelector("[data-band-text]");
    if (text && !banner.hidden) {
      const bandOk = inVariant(age, adv, v.replace("g", "") as typeof v);
      text.textContent = bandOk
        ? "This one has a note for grown-ups. Ask a grown-up first."
        : `This one is for bigger kids (ages ${adv >= 2 ? 9 : Math.max(age, 6)}+).`;
    }
  }
  const fav = root.querySelector<HTMLElement>("[data-fav]");
  if (fav) fav.setAttribute("aria-pressed", String(S.isFav(fav.dataset["fav"] ?? "")));
  const share = root.querySelector<HTMLElement>("[data-share]");
  if (share) share.hidden = !("share" in navigator);
}

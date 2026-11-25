/**
 * Client entry: runs once per visit (Astro bundles it as a module; <ClientRouter /> keeps it alive).
 * Global behaviour uses event delegation on document, so nothing needs rebinding after navigation;
 * per-page code runs on astro:page-load.
 */
import type { Track } from "@goldstein/player";
import { navigate } from "astro:transitions/client";
import { BAND_INFO, type Band } from "../lib/kinds.ts";
import type { PlayRequest } from "../lib/tracks.ts";
import { decorateCards } from "./cards.ts";
import { initPage } from "./pages.ts";
import { KidsPlayer } from "./player-ui.ts";
import * as S from "./state.ts";

declare global {
  interface Window {
    kidsPlayer?: KidsPlayer;
  }
}

export function kp(): KidsPlayer | null {
  if (window.kidsPlayer) return window.kidsPlayer;
  const root = document.getElementById("kp");
  if (!root) return null;
  window.kidsPlayer = new KidsPlayer(root);
  return window.kidsPlayer;
}

/**
 * How many in-app pages lie behind the current one in this tab's history (client-routed
 * navigations only). The back arrow uses history.back() when > 0, else goes home.
 */
let inAppDepth = 0;
document.addEventListener("astro:before-preparation", (e) => {
  const ev = e as Event & { navigationType?: string; direction?: string };
  if (ev.navigationType === "push") inAppDepth++;
  else if (ev.navigationType === "traverse")
    inAppDepth = Math.max(0, inAppDepth + (ev.direction === "back" ? -1 : 1));
});

function parse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function renderBandChip(): void {
  const band = S.getBand();
  const label = document.querySelector("[data-band-label]");
  const ages = document.querySelector("[data-band-ages]");
  if (label) label.textContent = BAND_INFO[band].label;
  if (ages) ages.textContent = band === "little" ? "3+" : band === "kids" ? "6+" : "9+";
  document.querySelectorAll<HTMLButtonElement>("#band-sheet [data-band]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset["band"] === band));
  });
}

function bandSheet(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>("#band-sheet");
}

function openBandSheet(): void {
  const d = bandSheet();
  if (d && !d.open) {
    renderBandChip();
    d.showModal();
  }
}

document.addEventListener("click", (e) => {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;

  const back = t.closest("[data-back]");
  if (back) {
    // document.referrer is stale under <ClientRouter />; count in-app steps instead, and never
    // reload the page (a full load would stop the audio).
    if (inAppDepth > 0) history.back();
    else void navigate("/");
    return;
  }
  if (t.closest("[data-open-band]")) {
    openBandSheet();
    return;
  }
  const bandBtn = t.closest<HTMLElement>("#band-sheet [data-band]");
  if (bandBtn) {
    const b = bandBtn.dataset["band"];
    if (b === "little" || b === "kids" || b === "big") S.setBand(b as Band);
    bandSheet()?.close();
    return;
  }
  if (t.closest("[data-close-band]")) {
    bandSheet()?.close();
    return;
  }

  const play = t.closest<HTMLElement>("[data-play]");
  if (play) {
    e.preventDefault();
    const req = parse<PlayRequest>(play.dataset["play"]);
    if (req) void kp()?.play(req);
    return;
  }
  const seek = t.closest<HTMLElement>("[data-seek]");
  if (seek) {
    e.preventDefault();
    const req = parse<PlayRequest>(seek.dataset["seekPlay"]);
    const id = seek.dataset["seekId"];
    if (req && id) void kp()?.seekOrPlay(id, Number(seek.dataset["seek"]), req);
    return;
  }
  const next = t.closest<HTMLElement>("[data-play-next]");
  if (next) {
    const track = parse<Track>(next.dataset["playNext"]);
    if (track) void kp()?.playNext(track);
    return;
  }
  const fav = t.closest<HTMLElement>("[data-fav]");
  if (fav) {
    const id = fav.dataset["fav"];
    if (!id) return;
    const on = S.toggleFav(id);
    fav.setAttribute("aria-pressed", String(on));
    fav.classList.remove("wobble");
    void fav.offsetWidth;
    fav.classList.add("wobble");
    kp()?.toast(on ? "Added to My Shelf" : "Taken off My Shelf");
    return;
  }
  const share = t.closest<HTMLElement>("[data-share]");
  if (share && "share" in navigator) {
    void navigator.share({ title: document.title, url: location.href }).catch(() => undefined);
  }
});

// The band sheet closes on backdrop tap; closing it counts as "chosen" so it is shown once.
document.addEventListener(
  "close",
  (e) => {
    if (
      e.target instanceof HTMLDialogElement &&
      e.target.id === "band-sheet" &&
      !S.hasChosenBand()
    ) {
      S.setBand(S.getBand());
    }
  },
  true,
);
document.addEventListener("click", (e) => {
  const d = bandSheet();
  if (d && e.target === d) d.close();
});

// <ClientRouter /> swaps <html> attributes: put the band back before the new page paints.
document.addEventListener("astro:after-swap", () => {
  S.applyVariant();
  document.documentElement.classList.toggle("has-player", (kp()?.currentId() ?? null) !== null);
});

S.on("band", () => {
  renderBandChip();
  decorateCards();
  void initPage(true);
});
S.on("favs", () => decorateCards());
S.on("progress", () => decorateCards());

function onScroll(): void {
  document.querySelector(".top")?.classList.toggle("scrolled", window.scrollY > 4);
}
window.addEventListener("scroll", onScroll, { passive: true });

function pageLoad(): void {
  S.applyVariant();
  renderBandChip();
  kp();
  decorateCards();
  onScroll();
  void initPage(false);
  if (!S.hasChosenBand() && !sessionStorageFlag()) openBandSheet();
}

function sessionStorageFlag(): boolean {
  try {
    if (sessionStorage.getItem("kids-band-asked")) return true;
    sessionStorage.setItem("kids-band-asked", "1");
  } catch {
    /* storage blocked: ask on every page would be annoying, so ask once per page view only */
  }
  return false;
}

document.addEventListener("astro:page-load", pageLoad);

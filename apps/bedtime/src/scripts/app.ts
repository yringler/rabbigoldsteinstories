/**
 * Client entry. One player for the visit (its DOM is persisted across page loads by the
 * ClientRouter), the sheet and night screen, then each page's renderer on every page load.
 */
import type { Playlist } from "@goldstein/playlists";
import { BedtimePlayer } from "./bedtime-player.ts";
import { mountNight } from "./night.ts";
import { renderEarlier, renderHome, renderLanding, type App } from "./pages.ts";
import { mountSheet } from "./sheet.ts";

declare global {
  interface Window {
    bedtime?: App & { player: BedtimePlayer };
  }
}

function boot(): App & { player: BedtimePlayer } {
  if (window.bedtime) return window.bedtime;
  const audio = document.querySelector<HTMLAudioElement>("#audio")!;
  const player = new BedtimePlayer(audio);
  const start = (p: Playlist, when: string, index = 0, position = 0) => {
    void player.start(p, when, index, position);
    sheet.open();
  };
  const sheet = mountSheet(player, (p, when, index) => start(p, when, index));
  mountNight(player, sheet);
  const app = { start, sheet, player, hasPlaylist: () => player.snapshot().playlist !== null };
  window.bedtime = app;
  if (import.meta.env.PROD && "serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  return app;
}

function onPage() {
  const app = boot();
  document.body.classList.toggle("has-player", !!app.player.snapshot().playlist);
  const page = document.body.dataset["page"];
  if (page === "home") void renderHome(app);
  if (page === "earlier") void renderEarlier(app);
  if (page === "landing") renderLanding(app);
}

document.addEventListener("astro:page-load", onPage);

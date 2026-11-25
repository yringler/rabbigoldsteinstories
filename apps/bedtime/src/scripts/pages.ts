/**
 * Page renderers: Tonight (/ and /p/<edition>/<type>) and Earlier (/earlier/). Each page's
 * static markup is server-rendered; these fill in the edition, Continue row and history.
 */
import type { Edition, Playlist } from "@goldstein/playlists";
import { parseDeepLink } from "../lib/deeplink.ts";
import { GLYPHS } from "../lib/glyphs.ts";
import { continuable, EDITION_CACHE_KEY, endedRecently, SESSION_KEY } from "../lib/session.ts";
import { cardMeta, clock, greeting, iconSvg, nightLabel, TYPE_BY_ID, TYPES } from "../lib/ui.ts";
import { loadHistory, loadTonight } from "./data.ts";
import type { SheetApi } from "./sheet.ts";
import { store } from "./store.ts";

export interface App {
  start(p: Playlist, when: string, index?: number, position?: number): void;
  sheet: SheetApi;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);

function html(markup: string): DocumentFragment {
  const t = document.createElement("template");
  t.innerHTML = markup;
  return t.content;
}

function isCurrent(x: unknown, now: number): x is Edition {
  if (!x || typeof x !== "object") return false;
  const e = x as Edition;
  return (
    Array.isArray(e.playlists) && Date.parse(e.starts_at) <= now && now < Date.parse(e.ends_at)
  );
}

/** /p/<edition>/<type>: open that playlist's track list (no autoplay). */
function deepLink(): { edition: string; type: string } | null {
  return parseDeepLink(location.pathname);
}

async function fetchEdition(id: string): Promise<Edition | null> {
  try {
    const r = await fetch(`/playlists/editions/${id}.json`);
    return r.ok ? ((await r.json()) as Edition) : null;
  } catch {
    return null;
  }
}

export async function renderHome(app: App): Promise<void> {
  const root = $("[data-home]");
  if (!root || root.dataset["ready"]) return;
  root.dataset["ready"] = "1";
  const now = Date.now();
  const saved = store.get<unknown>(SESSION_KEY, null);

  // Continue row (only for a session under 18 hours old) or the good-night line after the end.
  const cont = continuable(saved, now);
  const contBtn = $<HTMLButtonElement>("[data-continue]", root)!;
  if (cont) {
    const item = cont.playlist.items[cont.index]!;
    $("[data-continue-text]", contBtn)!.textContent =
      `${cont.playlist.title} · story ${cont.index + 1} · ${clock(cont.position)}`;
    contBtn.setAttribute(
      "aria-label",
      `Continue ${cont.playlist.title}, story ${cont.index + 1}: ${item.title}`,
    );
    contBtn.hidden = false;
    contBtn.addEventListener("click", () => {
      contBtn.hidden = true;
      app.start(cont.playlist, cont.when, cont.index, cont.position);
    });
  }
  const greet = $("[data-greeting]", root)!;
  const sub = $("[data-greeting-sub]", root)!;
  if (endedRecently(saved, now)) greet.textContent = "That was the end. Good night.";

  const cards = [...root.querySelectorAll<HTMLElement>("[data-card]")];
  const notice = $("[data-notice]", root)!;
  const fill = (edition: Edition) => {
    if (!endedRecently(saved, now)) {
      const g = greeting(edition);
      const [first, ...rest] = g.split(". ");
      greet.textContent = rest.length ? `${first}.` : g;
      sub.textContent = rest.join(". ");
    }
    for (const card of cards) {
      const type = card.dataset["card"]!;
      const p = edition.playlists.find((x) => x.type === type);
      card.closest("li")!.hidden = !p || p.items.length === 0;
      if (!p || p.items.length === 0) continue;
      $("[data-line]", card)!.textContent = p.subtitle;
      $("[data-meta]", card)!.textContent = cardMeta(p);
      card.removeAttribute("aria-busy");
      const play = $<HTMLButtonElement>("[data-play]", card)!;
      play.setAttribute("aria-label", `Play ${p.title}. ${p.subtitle} ${cardMeta(p)}.`);
      play.onclick = () => app.start(p, "tonight");
      $<HTMLButtonElement>("[data-more]", card)!.onclick = () => app.sheet.preview(p, "tonight");
    }
  };

  // A revisit renders tonight's cards from this browser's copy at once, then refreshes.
  const cached = store.get<unknown>(EDITION_CACHE_KEY, null);
  if (isCurrent(cached, now)) fill(cached);

  const { data: edition, offline } = await loadTonight();
  if (!edition || edition.playlists.length === 0) {
    $("[data-cards]", root)!.hidden = true;
    notice.textContent = "No stories tonight. Please try again in a little while.";
    notice.hidden = false;
    return;
  }
  if (offline) {
    notice.textContent = "You're offline. These are the last stories saved on this device.";
    notice.hidden = false;
  }
  fill(edition);

  const link = deepLink();
  if (link) {
    const e = link.edition === edition.date ? edition : await fetchEdition(link.edition);
    const p = e?.playlists.find((x) => x.type === link.type);
    if (e && p) app.sheet.preview(p, e.date === edition.date ? "tonight" : nightLabel(e));
  }
}

export async function renderEarlier(app: App): Promise<void> {
  const root = $("[data-earlier]");
  if (!root || root.dataset["ready"]) return;
  root.dataset["ready"] = "1";
  const list = $("[data-nights]", root)!;
  const nights = await loadHistory();
  if (!nights || nights.length === 0) {
    list.replaceChildren();
    $("[data-empty]", root)!.hidden = false;
    return;
  }
  list.replaceChildren(
    ...nights.slice(0, 7).map((e) => {
      const li = document.createElement("li");
      li.className = "night-row";
      const label = nightLabel(e);
      const h = document.createElement("h2");
      h.textContent = label;
      const chips = document.createElement("div");
      chips.className = "chips";
      const order = TYPES.map((t) => t.type as string);
      const playlists = [...e.playlists]
        .filter((p) => p.items.length > 0)
        .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
      for (const p of playlists) {
        const t = TYPE_BY_ID[p.type];
        const pair = document.createElement("span");
        pair.className = "chip-pair";
        if (t) pair.style.setProperty("--c", t.color);
        const play = document.createElement("button");
        play.type = "button";
        play.className = "chip";
        play.setAttribute("aria-label", `Play ${p.title}, ${label}`);
        if (t) play.append(html(iconSvg(t, 24)));
        play.append(p.title);
        play.addEventListener("click", () => app.start(p, label));
        const more = document.createElement("button");
        more.type = "button";
        more.className = "chip-more";
        more.setAttribute("aria-label", `${p.title}, ${label}: the stories`);
        more.append(html(GLYPHS.more(20)));
        more.addEventListener("click", () => app.sheet.preview(p, label));
        pair.append(play, more);
        chips.append(pair);
      }
      li.append(h, chips);
      return li;
    }),
  );
}

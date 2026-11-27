/**
 * Page renderers: Tonight (/ and /p/<edition>/<type>), Earlier (/earlier/) and the /landing
 * pitch. Each page's static markup is server-rendered; these fill in the edition, Continue row
 * and history, and wire the landing page's play button.
 */
import { editionAt, type Edition, type Playlist, type PlaylistItem } from "@goldstein/playlists";
import { navigate } from "astro:transitions/client";
import { parseDeepLink } from "../lib/deeplink.ts";
import { GLYPHS } from "../lib/glyphs.ts";
import {
  continuable,
  EDITION_CACHE_KEY,
  endedRecently,
  resumeAt,
  SESSION_KEY,
} from "../lib/session.ts";
import {
  cardLine,
  cardMeta,
  clock,
  greeting,
  iconSvg,
  nightLabel,
  TYPE_BY_ID,
  TYPES,
} from "../lib/ui.ts";
import { shelfPlaylist } from "../lib/yiddish-shelf.ts";
import { loadHistory, loadTonight } from "./data.ts";
import type { BedtimePlayer } from "./bedtime-player.ts";
import type { SheetApi } from "./sheet.ts";
import { store } from "./store.ts";

export interface App {
  start(p: Playlist, when: string, index?: number, position?: number): void;
  sheet: SheetApi;
  /** A playlist is already loaded in this visit (then there is nothing to "continue"). */
  hasPlaylist(): boolean;
  player: BedtimePlayer;
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

/** Tonight's Mix of an edition, if it has any stories. */
function mixOf(e: Edition | null): Playlist | null {
  return e?.playlists.find((p) => p.type === "mix" && p.items.length > 0) ?? null;
}

/**
 * "Open Tonight's Mix" on arrival at /, asked with history state: by the landing page
 * (`navigate("/", { state: { playMix: true } })`), or by renderHome itself for the landing link's
 * no-script form `/?play=mix`. Read once: the entry is marked done, so Back or a reload does not
 * ask again.
 */
function takePlayMix(): boolean {
  const state = (history.state ?? {}) as { playMix?: boolean };
  if (state.playMix !== true) return false;
  history.replaceState({ ...state, playMix: false }, "");
  return true;
}

/** The Yiddish shelf's items, built into the home page (empty when the site has no shelf). */
function shelfItems(root: ParentNode): PlaylistItem[] {
  const json = $<HTMLScriptElement>("#yiddish-shelf", root)?.textContent;
  if (!json) return [];
  try {
    const items = JSON.parse(json) as unknown;
    return Array.isArray(items) ? (items as PlaylistItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * The Yiddish card(s) and the "Tonight in English" disclosure (docs/design/language-bedtime.md
 * §3.1). They work without the edition: the shelf is part of the page. Returns a setter for the
 * night's date key (tonight's edition id once it is known), which picks the opening story.
 */
function wireYiddish(root: HTMLElement, app: App, now: number): (dateKey: string) => void {
  const items = shelfItems(root);
  let key = editionAt(now).id;
  if (items.length > 0) {
    for (const card of root.querySelectorAll<HTMLElement>("[data-yiddish-card]")) {
      $<HTMLButtonElement>("[data-play]", card)!.onclick = () =>
        app.start(shelfPlaylist(items, key), "tonight");
      $<HTMLButtonElement>("[data-more]", card)!.onclick = () =>
        app.sheet.preview(shelfPlaylist(items, key), "tonight");
    }
  }
  const toggle = $<HTMLButtonElement>("[data-english-toggle]", root);
  const group = $("[data-english-cards]", root);
  if (toggle && group) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      group.toggleAttribute("data-open", open);
    });
  }
  return (dateKey) => {
    key = dateKey;
  };
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
  // `/?play=mix` (a cold load): swap to a clean / through the router (so it knows the URL),
  // carrying the request in history state; that page's renderHome opens the Mix.
  if (new URLSearchParams(location.search).get("play") === "mix") {
    void navigate(`${location.pathname}${location.hash}`, {
      history: "replace",
      state: { playMix: true },
    });
    return;
  }
  const now = Date.now();
  const saved = store.get<unknown>(SESSION_KEY, null);
  const playMix = takePlayMix();
  const setShelfNight = wireYiddish(root, app, now);

  // Continue row (only for a session under 18 hours old) or the good-night line after the end.
  const cont = continuable(saved, now);
  const contBtn = $<HTMLButtonElement>("[data-continue]", root)!;
  if (cont && !app.hasPlaylist()) {
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
      app.start(cont.playlist, cont.when, cont.index, resumeAt(cont));
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
    setShelfNight(edition.date);
    const english = edition.playlists.filter((p) => p.items.length > 0).length;
    const toggleLabel = $("[data-english-toggle-label]", root);
    if (toggleLabel)
      toggleLabel.textContent = `Tonight in English (${english} playlist${english === 1 ? "" : "s"})`;
    for (const card of cards) {
      const type = card.dataset["card"]!;
      const p = edition.playlists.find((x) => x.type === type);
      card.closest("li")!.hidden = !p || p.items.length === 0;
      if (!p || p.items.length === 0) continue;
      $("[data-line]", card)!.textContent = cardLine(p);
      $("[data-meta]", card)!.textContent = cardMeta(p);
      card.removeAttribute("aria-busy");
      const play = $<HTMLButtonElement>("[data-play]", card)!;
      play.setAttribute("aria-label", `Play ${p.title}. ${cardLine(p)} ${cardMeta(p)}.`);
      play.onclick = () => app.start(p, "tonight");
      $<HTMLButtonElement>("[data-more]", card)!.onclick = () => app.sheet.preview(p, "tonight");
    }
  };

  // A revisit renders tonight's cards from this browser's copy at once, then refreshes.
  const cached = store.get<unknown>(EDITION_CACHE_KEY, null);
  if (isCurrent(cached, now)) fill(cached);

  const { data: edition, offline } = await loadTonight();
  if (!root.isConnected) return; // the visitor has moved on to another page meanwhile
  if (!edition || edition.playlists.length === 0) {
    $("[data-cards]", root)!.hidden = true;
    notice.textContent = "No stories tonight. Please try again in a little while.";
    notice.hidden = false;
    // With Yiddish chosen, the shelf still plays; CSS swaps the notice for a quieter line.
    root.dataset["englishEmpty"] = "1";
    const emptyNote = $("[data-english-empty-note]", root);
    if (emptyNote) emptyNote.hidden = false;
    return;
  }
  if (offline) {
    notice.textContent = "You're offline. These are the last stories saved on this device.";
    notice.hidden = false;
  }
  fill(edition);

  // Never autoplay here (no tap to play inside): open the Mix's list, whose Play button is one
  // more tap. If the Mix is already the loaded playlist, just show the player.
  const mix = playMix ? mixOf(edition) : null;
  if (mix && app.player.snapshot().playlist?.id === mix.id) app.sheet.open();
  else if (mix) app.sheet.preview(mix, "tonight");

  const link = deepLink();
  if (link) {
    const e = link.edition === edition.date ? edition : await fetchEdition(link.edition);
    const p = e?.playlists.find((x) => x.type === link.type);
    if (e && p && root.isConnected)
      app.sheet.preview(p, e.date === edition.date ? "tonight" : nightLabel(e));
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

/**
 * /landing: one button, a link to /?play=mix (what it does without script). With script, the tap:
 *   - Tonight's Mix already loaded (not ended or failed): resume it if paused, open the
 *     player, go to /;
 *   - Mix at hand (this browser's copy of tonight, or loaded since): start it inside the tap
 *     (play() needs the tap; the player survives the page change) and go to / with it open;
 *   - Mix not here yet: go to / at once, which opens the Mix's list (one more tap to play).
 *     No waiting and starting late: iOS refuses play() after an await, and the player would
 *     sit "loading" until its watchdog gave up.
 */
export function renderLanding(app: App): void {
  const root = $("[data-landing]");
  if (!root || root.dataset["ready"]) return;
  root.dataset["ready"] = "1";
  const btn = $<HTMLAnchorElement>("[data-hero-play]", root)!;

  const cached = store.get<unknown>(EDITION_CACHE_KEY, null);
  let mix = isCurrent(cached, Date.now()) ? mixOf(cached) : null;
  void loadTonight().then(({ data }) => {
    if (data) mix = mixOf(data);
  });

  btn.addEventListener("click", (e) => {
    // New tab, new window and the like: leave the link alone.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const now = app.player.snapshot();
    const current = now.playlist;
    if (
      current &&
      current.type === "mix" &&
      (!mix || current.id === mix.id) &&
      now.phase !== "ended" &&
      now.phase !== "error"
    ) {
      if (now.phase === "paused" || now.phase === "asleep") void app.player.resume();
      app.sheet.open();
      void navigate("/");
    } else if (mix) {
      app.start(mix, "tonight");
      void navigate("/");
    } else void navigate("/", { state: { playMix: true } });
  });
}

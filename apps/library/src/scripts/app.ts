/**
 * Runs once per visit (Astro bundles it as a module; <ClientRouter /> keeps it alive across page
 * loads). Binds the persistent player bar, theme, menu, delegated actions (play, queue, add to
 * playlist), the keyboard map, and loads page modules on demand after each navigation.
 */
import type { Track } from "@goldstein/player";
import type { PlaylistEntry } from "../lib/playlists.ts";
import { formatDuration } from "../lib/time.ts";
import {
  $,
  $$,
  absoluteTime,
  announce,
  audio,
  copyText,
  h,
  loadRec,
  player,
  shortcutsOff,
  store,
  toast,
  tracksFrom,
} from "./core.ts";
import * as playlists from "./playlist-store.ts";

// ---------------------------------------------------------------------------------------------
// Player bar

let chapters: [number, number, string][] = [];
let chaptersFor = "";

function bindPlayer(): void {
  const root = $("#player");
  if (!root || root.dataset["bound"]) return;
  root.dataset["bound"] = "1";
  const p = player();
  const a = audio();
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
  const title = q<HTMLAnchorElement>("[data-p-title]");
  const chapter = q("[data-p-chapter]");
  const toggle = q<HTMLButtonElement>("[data-p-toggle]");
  const range = q<HTMLInputElement>("[data-p-range]");
  const pos = q("[data-p-pos]");
  const dur = q("[data-p-dur]");
  const ticks = q("[data-p-ticks]");
  const msg = q("[data-p-msg]");
  const rate = q<HTMLSelectElement>("[data-p-rate]");
  const vol = q<HTMLInputElement>("[data-p-vol]");
  const queueBtn = q<HTMLButtonElement>("[data-p-queue]");
  const panel = q("[data-p-queue-panel]");
  const list = q("[data-p-queue-list]");
  let dragging = false;

  toggle?.addEventListener("click", () => void p.toggle());
  q("[data-p-back]")?.addEventListener("click", () => p.seek(p.state().position - 15));
  q("[data-p-fwd]")?.addEventListener("click", () => p.seek(p.state().position + 30));
  q("[data-p-prev]")?.addEventListener("click", () => void p.previous());
  q("[data-p-next]")?.addEventListener("click", () => void p.next());
  range?.addEventListener("input", () => {
    dragging = true;
    if (pos) pos.textContent = formatDuration(Number(range.value));
  });
  range?.addEventListener("change", () => {
    dragging = false;
    p.seek(Number(range.value));
  });
  const savedRate = store.get<number>("rate", 1);
  a.playbackRate = savedRate;
  a.defaultPlaybackRate = savedRate;
  if (rate) rate.value = String(savedRate);
  rate?.addEventListener("change", () => setRate(Number(rate.value)));
  vol?.addEventListener("input", () => (a.volume = Number(vol.value)));
  a.addEventListener("ratechange", () => {
    if (rate) rate.value = String(a.playbackRate);
  });
  a.addEventListener("error", () => {
    const t = p.current;
    if (!msg || !t) return;
    msg.hidden = false;
    msg.replaceChildren(
      "This recording could not be loaded right now. ",
      h("a", { href: t.url, target: "_blank", rel: "noopener" }, "Open the MP3 directly"),
      ".",
    );
  });
  a.addEventListener("playing", () => {
    if (msg) msg.hidden = true;
  });
  queueBtn?.addEventListener("click", () => {
    if (!panel) return;
    panel.hidden = !panel.hidden;
    queueBtn.setAttribute("aria-expanded", String(!panel.hidden));
  });
  q("[data-p-clear]")?.addEventListener("click", () => {
    p.pause();
    void p.load([], 0, false);
    if (panel) panel.hidden = true;
    root.toggleAttribute("data-empty", true);
    document.body.classList.add("no-player");
  });

  p.subscribe((s) => {
    const t = s.queue[s.index];
    root.toggleAttribute("data-empty", !t);
    document.body.classList.toggle("no-player", !t);
    if (!t) return;
    const start = t.start_sec ?? 0;
    if (title) {
      title.textContent = t.title;
      title.href = `/r/${t.id}/${start > 0 ? `?t=${Math.floor(start)}` : ""}`;
    }
    toggle?.setAttribute("aria-label", s.playing ? "Pause" : "Play");
    toggle?.querySelector("[data-p-icon=play]")?.toggleAttribute("hidden", s.playing);
    toggle?.querySelector("[data-p-icon=pause]")?.toggleAttribute("hidden", !s.playing);
    if (range && !dragging) {
      range.max = String(Math.max(1, Math.floor(s.duration)));
      range.value = String(Math.floor(s.position));
      range.setAttribute(
        "aria-valuetext",
        `${formatDuration(s.position)} of ${formatDuration(s.duration)}`,
      );
    }
    if (pos && !dragging) pos.textContent = formatDuration(s.position);
    if (dur) dur.textContent = formatDuration(s.duration);
    const abs = start + s.position;
    if (chaptersFor !== `${t.id}@${start}`) {
      chaptersFor = `${t.id}@${start}`;
      chapters = [];
      if (ticks) ticks.replaceChildren();
      void loadRec(t.id).then((info) => {
        if (!info || chaptersFor !== `${t.id}@${start}`) return;
        const end = t.end_sec ?? (Number.isFinite(a.duration) ? a.duration : 0);
        chapters = info.chapters.filter(([cs, ce]) => ce > start && (!end || cs < end));
        renderTicks(ticks, chapters, start, end || start + s.duration);
      });
    } else if (ticks && !ticks.childElementCount && chapters.length && s.duration) {
      renderTicks(ticks, chapters, start, start + s.duration);
    }
    if (chapter) {
      const c = chapters.findLast(([cs]) => cs <= abs + 0.5);
      chapter.textContent = c
        ? c[2]
        : s.queue.length > 1
          ? `Track ${s.index + 1} of ${s.queue.length}`
          : "";
    }
    if (list && panel && !panel.hidden) renderQueue(list);
  });
}

function renderTicks(
  el: HTMLElement | null,
  ch: [number, number, string][],
  start: number,
  end: number,
): void {
  if (!el || end <= start) return;
  el.replaceChildren(
    ...ch
      .filter(([cs]) => cs > start + 1)
      .map(([cs, , t]) =>
        h("span", {
          style: `left:${(((cs - start) / (end - start)) * 100).toFixed(2)}%`,
          title: t,
        }),
      ),
  );
}

function renderQueue(list: HTMLElement): void {
  const s = player().state();
  list.replaceChildren(
    ...s.queue.map((t, i) => {
      const go = h("button", { type: "button", class: "go" }, `${i + 1}. ${t.title}`);
      go.addEventListener("click", () => void player().goTo(i));
      const rm = h(
        "button",
        { type: "button", class: "icon-btn", "aria-label": `Remove ${t.title}` },
        "×",
      );
      rm.addEventListener("click", () => {
        if (i === s.index) {
          const q = [...s.queue];
          q.splice(i, 1);
          void player().load(q, Math.min(i, q.length - 1), s.playing);
        } else player().removeAt(i);
        renderQueue(list);
      });
      return h("li", { "aria-current": i === s.index ? "true" : "false" }, go, rm);
    }),
  );
}

function setRate(r: number): void {
  const a = audio();
  const v = Math.min(2, Math.max(0.75, Math.round(r * 4) / 4));
  a.playbackRate = v;
  a.defaultPlaybackRate = v;
  store.set("rate", v);
  announce(`Speed ${v}×`);
}

// ---------------------------------------------------------------------------------------------
// Playing and queueing

export async function play(tracks: Track[], at?: number): Promise<void> {
  if (!tracks.length) return;
  await player().load(tracks, 0, at === undefined);
  if (at !== undefined) {
    player().seek(at - (tracks[0]?.start_sec ?? 0));
    await player().play();
  }
  const pos = player().state().position;
  if (at === undefined && pos > 5)
    toast(`Resuming at ${formatDuration(pos)}`, {
      label: "Start over",
      run: () => player().seek(0),
    });
}

export function enqueue(tracks: Track[]): void {
  const s = player().state();
  if (s.index < 0) {
    void player().load(tracks, 0, false);
    toast(`Queued: ${tracks[0]?.title ?? ""}`);
    return;
  }
  player().append(tracks);
  toast(
    tracks.length === 1
      ? `Added to queue: ${tracks[0]?.title ?? ""}`
      : `${tracks.length} added to queue`,
  );
}

// ---------------------------------------------------------------------------------------------
// Add-to-playlist dialog

let pending: { entries: PlaylistEntry[]; what: string } | null = null;

export function openPlaylistDialog(entries: PlaylistEntry[], what: string): void {
  const dlg = $<HTMLDialogElement>("#playlist-dialog");
  if (!dlg || !entries.length) return;
  pending = { entries, what };
  const whatEl = $("[data-pl-what]", dlg);
  if (whatEl) whatEl.textContent = what;
  const choices = $("[data-pl-choices]", dlg);
  const lists = playlists.all();
  const last = playlists.meta().lastUsed;
  lists.sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
  choices?.replaceChildren(
    ...lists.map((p) => {
      const b = h("button", { type: "button", class: "btn" }, "Add");
      b.addEventListener("click", () => {
        const n = playlists.add(p.id, pending?.entries ?? []);
        dlg.close();
        toast(n ? `Added to “${p.name}”` : `“${p.name}” is full (500 items)`, {
          label: "Open",
          run: () => location.assign(`/my-playlists/?id=${p.id}`),
        });
      });
      return h(
        "li",
        {},
        h("span", {}, p.name, h("span", { class: "muted" }, ` · ${p.items.length} items`)),
        b,
      );
    }),
  );
  if (!lists.length)
    choices?.append(h("li", { class: "empty" }, "No playlists yet. Name one below."));
  dlg.showModal();
  (choices?.querySelector("button") ?? $<HTMLInputElement>("#pl-new-name"))?.focus();
}

function bindPlaylistDialog(): void {
  const form = $<HTMLFormElement>("[data-pl-new]");
  if (!form || form.dataset["bound"]) return;
  form.dataset["bound"] = "1";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>("#pl-new-name");
    const name = input?.value.trim() ?? "";
    if (!name || !pending) return;
    const p = playlists.create(name, pending.entries);
    $<HTMLDialogElement>("#playlist-dialog")?.close();
    if (input) input.value = "";
    if (p)
      toast(`Created “${p.name}”`, {
        label: "Open",
        run: () => location.assign(`/my-playlists/?id=${p.id}`),
      });
    else toast("You already have 100 playlists.");
  });
}

/** `data-entry` / `data-entries` attribute → playlist entries. */
function entriesFrom(el: HTMLElement): PlaylistEntry[] {
  const raw = el.dataset["entries"] ?? (el.dataset["entry"] ? `[${el.dataset["entry"]}]` : "[]");
  try {
    return (JSON.parse(raw) as PlaylistEntry[]).filter((e) => /^[0-9a-f]{10}$/.test(e.rec));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Theme and header

function themeLabel(): void {
  const btn = $("[data-theme-toggle]");
  if (!btn) return;
  const dark = isDark();
  btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  btn.querySelector("[data-theme-icon=dark]")?.toggleAttribute("hidden", dark);
  btn.querySelector("[data-theme-icon=light]")?.toggleAttribute("hidden", !dark);
}

function isDark(): boolean {
  const t = document.documentElement.dataset["theme"];
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyStoredTheme(doc: Document): void {
  const t = store.get<string>("theme", "auto");
  if (t === "dark" || t === "light") doc.documentElement.dataset["theme"] = t;
  else delete doc.documentElement.dataset["theme"];
}

// ---------------------------------------------------------------------------------------------
// Delegated clicks (document survives navigation, so bind once)

function bindDocument(): void {
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const el = target?.closest<HTMLElement>(
      "[data-action],[data-theme-toggle],[data-menu-toggle],[data-close]",
    );
    if (!el) {
      const browse = $<HTMLDetailsElement>("[data-browse]");
      if (browse?.open && !target?.closest("[data-browse]")) browse.open = false;
      return;
    }
    if (el.hasAttribute("data-close")) {
      el.closest("dialog")?.close();
      return;
    }
    if (el.hasAttribute("data-theme-toggle")) {
      const next = isDark() ? "light" : "dark";
      document.documentElement.dataset["theme"] = next;
      store.set("theme", next);
      themeLabel();
      return;
    }
    if (el.hasAttribute("data-menu-toggle")) {
      const header = $("[data-site-header]");
      const open = !header?.classList.contains("open");
      header?.classList.toggle("open", open);
      el.setAttribute("aria-expanded", String(open));
      return;
    }
    const action = el.dataset["action"];
    if (action === "play") {
      const at = el.dataset["at"];
      void play(tracksFrom(el), at !== undefined ? Number(at) : undefined);
    } else if (action === "queue") enqueue(tracksFrom(el));
    else if (action === "add") openPlaylistDialog(entriesFrom(el), el.dataset["what"] ?? "");
    else if (action === "shortcuts") $<HTMLDialogElement>("#shortcuts-dialog")?.showModal();
    else return;
    e.preventDefault();
  });
  document.addEventListener("keydown", onKey);
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.matches("[data-shortcuts-off]"))
      store.set("shortcuts-off", t.checked);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeLabel);
  document.addEventListener("astro:before-swap", (e) =>
    applyStoredTheme((e as Event & { newDocument: Document }).newDocument),
  );
}

// ---------------------------------------------------------------------------------------------
// Keyboard map (library.md §12); single keys are off in text fields and can be turned off.

function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement)
    return !["checkbox", "radio", "button", "range", "submit"].includes(t.type);
  return false;
}

function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (typing(e.target) || document.querySelector("dialog[open]")) return;
  if (shortcutsOff() && e.key !== "?") return;
  const p = player();
  const has = p.current !== null;
  const onControl =
    e.target instanceof HTMLButtonElement ||
    e.target instanceof HTMLAnchorElement ||
    (e.target instanceof HTMLInputElement && e.target.type === "range");
  switch (e.key) {
    case "/": {
      const input = $<HTMLInputElement>("[data-search-input]") ?? $<HTMLInputElement>("#header-q");
      input?.focus();
      input?.select();
      break;
    }
    case "?":
      $<HTMLDialogElement>("#shortcuts-dialog")?.showModal();
      {
        const cb = $<HTMLInputElement>("[data-shortcuts-off]");
        if (cb) cb.checked = shortcutsOff();
      }
      break;
    case " ":
      if (!has || onControl) return;
      void p.toggle();
      break;
    case "ArrowLeft":
      if (!has || onControl) return;
      p.seek(p.state().position - 15);
      break;
    case "ArrowRight":
      if (!has || onControl) return;
      p.seek(p.state().position + 30);
      break;
    case "[":
    case "]": {
      if (!has || !chapters.length) return;
      const abs = absoluteTime() ?? 0;
      const start = p.current?.start_sec ?? 0;
      const target =
        e.key === "]"
          ? chapters.find(([cs]) => cs > abs + 1)
          : [...chapters].reverse().find(([cs]) => cs < abs - 3);
      if (target) p.seek(target[0] - start);
      else if (e.key === "[") p.seek(0);
      break;
    }
    case "<":
    case ">":
      if (!has) return;
      setRate(audio().playbackRate + (e.key === ">" ? 0.25 : -0.25));
      break;
    case "c": {
      const id =
        document.querySelector<HTMLElement>("[data-rec-page]")?.dataset["id"] ?? p.current?.id;
      if (!id) return;
      const t = p.current?.id === id ? absoluteTime() : null;
      void copyText(
        `${location.origin}/r/${id}/${t && t > 0 ? `?t=${Math.floor(t)}` : ""}`,
        "Link copied",
      );
      break;
    }
    default:
      document.dispatchEvent(new CustomEvent("gsl:key", { detail: e }));
      return;
  }
  e.preventDefault();
}

// ---------------------------------------------------------------------------------------------
// Page modules

async function initPage(): Promise<void> {
  themeLabel();
  bindPlaylistDialog();
  playlists.listenAcrossTabs();
  $("[data-site-header]")?.classList.remove("open");
  const off = $<HTMLInputElement>("[data-shortcuts-off]");
  if (off) off.checked = shortcutsOff();
  const tasks: Promise<unknown>[] = [];
  if ($("[data-search-app]")) tasks.push(import("./search-page.ts").then((m) => m.init()));
  if ($("[data-rec-page]")) tasks.push(import("./recording.ts").then((m) => m.init()));
  if ($("[data-my-playlists]")) tasks.push(import("./my-playlists.ts").then((m) => m.init()));
  if ($("[data-tonight]")) tasks.push(import("./tonight.ts").then((m) => m.init()));
  if ($("[data-radio]")) tasks.push(import("./radio.ts").then((m) => m.init()));
  if ($("[data-compare]")) tasks.push(import("./compare.ts").then((m) => m.init()));
  if ($("[data-sortable]")) tasks.push(import("./sortable.ts").then((m) => m.init()));
  if ($("[data-home-search]")) tasks.push(import("./home.ts").then((m) => m.init()));
  for (const d of $$<HTMLDialogElement>("dialog")) {
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
  }
  await Promise.all(tasks);
}

bindPlayer();
bindDocument();
applyStoredTheme(document);
document.addEventListener("astro:page-load", () => void initPage());

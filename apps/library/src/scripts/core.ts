/**
 * Browser core shared by every page: the single Player for the visit, the site store, small DOM
 * helpers, toasts and the live region. Pages import what they need; nothing here touches the DOM
 * at import time.
 */
import {
  Player,
  createStore,
  getAiAudio,
  setAiAudio,
  type Store,
  type Track,
} from "@goldstein/player";
import { DEFAULT_LANG, LANG_KEY, type LangPref, parseLang, statusLine } from "../lib/lang.ts";
import type { LibCatalog, RecInfo } from "../lib/types.ts";

declare global {
  interface Window {
    __gsl?: { player: Player; audio: HTMLAudioElement };
  }
}

export const store: Store = createStore("library");

export function audio(): HTMLAudioElement {
  return ensure().audio;
}

export function player(): Player {
  return ensure().player;
}

function ensure(): { player: Player; audio: HTMLAudioElement } {
  if (!window.__gsl) {
    const a = new Audio();
    a.preload = "metadata";
    const p = new Player({ audio: a, store, preferClean: getAiAudio(store) });
    window.__gsl = { player: p, audio: a };
  }
  return window.__gsl;
}

/**
 * AI-improved sound (docs/design/ai-audio.md §3.3): stores the preference, swaps the current track
 * live at the same position, and tells listeners (player bar select, recording page hint).
 */
export function setSound(clean: boolean): void {
  setAiAudio(store, clean);
  player().setPreferClean(clean);
  document.dispatchEvent(new CustomEvent("gsl:sound", { detail: clean }));
}

/** The visitor's language setting (docs/design/language-library.md §2); default "any". */
export function langPref(): LangPref {
  return parseLang(store.get<string>(LANG_KEY, DEFAULT_LANG));
}

/**
 * Store the language setting, mirror it on html[data-lang-pref] (the CSS narrowing of lists keys
 * off it) and tell listeners (`gsl:lang`, detail {from, to}): the controls and /search.
 */
export function setLangPref(to: LangPref, say = true): void {
  const from = langPref();
  store.set(LANG_KEY, to);
  document.documentElement.dataset["langPref"] = to;
  document.dispatchEvent(new CustomEvent("gsl:lang", { detail: { from, to } }));
  if (say) announce(statusLine(to));
}

/** Absolute position in the file (seconds) of the current track, or null. */
export function absoluteTime(): number | null {
  return player().current ? audio().currentTime : null;
}

export function currentId(): string | null {
  return player().current?.id ?? null;
}

// ---------------------------------------------------------------------------------------------
// DOM helpers

export const $ = <T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T | null => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T[] => [...root.querySelectorAll<T>(sel)];

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

/** Tiny element builder: h("a", { href: "/x", class: "chip" }, "text"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "html") el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function announce(text: string): void {
  const live = $("[data-live]");
  if (!live) return;
  live.textContent = "";
  window.setTimeout(() => (live.textContent = text), 30);
}

let toastTimer = 0;
export function toast(text: string, action?: { label: string; run: () => void }, ms = 4000): void {
  $(".toast")?.remove();
  window.clearTimeout(toastTimer);
  const el = h("div", { class: "toast", role: "status" }, text);
  if (action) {
    const b = h("button", { type: "button" }, action.label);
    b.addEventListener("click", () => {
      action.run();
      el.remove();
    });
    el.append(b);
  }
  document.body.append(el);
  toastTimer = window.setTimeout(() => el.remove(), ms);
}

export async function copyText(text: string, done = "Copied"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    window.prompt("Copy this:", text);
  }
}

// ---------------------------------------------------------------------------------------------
// Data

let catalogP: Promise<LibCatalog | null> | null = null;
export function loadCatalog(): Promise<LibCatalog | null> {
  catalogP ??= fetch("/idx/catalog.json")
    .then((r) => (r.ok ? (r.json() as Promise<LibCatalog>) : null))
    .catch(() => null);
  return catalogP;
}

const recCache = new Map<string, Promise<RecInfo | null>>();
export function loadRec(id: string): Promise<RecInfo | null> {
  let p = recCache.get(id);
  if (!p) {
    p = fetch(`/idx/rec/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RecInfo>) : null))
      .catch(() => null);
    recCache.set(id, p);
  }
  return p;
}

/** Parse a `data-track` / `data-tracks` attribute. */
export function tracksFrom(el: HTMLElement): Track[] {
  const raw = el.dataset["tracks"] ?? (el.dataset["track"] ? `[${el.dataset["track"]}]` : "[]");
  try {
    const list = JSON.parse(raw) as Track[];
    return list.filter((t) => typeof t.id === "string" && typeof t.url === "string");
  } catch {
    return [];
  }
}

export const shortcutsOff = (): boolean => store.get<boolean>("shortcuts-off", false);

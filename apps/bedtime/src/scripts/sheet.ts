/**
 * The player's UI: mini bar, sheet (now playing, sleep timer, keep-screen-on, track list) and the
 * sheet's preview mode ("⋯": the track list without playing). One instance for the visit; its
 * DOM lives in the persisted #player-root.
 */
import type { Playlist } from "@goldstein/playlists";
import { GLYPHS } from "../lib/glyphs.ts";
import { parseTimer, WAKE_KEY } from "../lib/session.ts";
import {
  clock,
  cardMeta,
  iconSvg,
  listEntries,
  minutes,
  narratorLabel,
  TYPE_BY_ID,
  TYPES,
  type TypeUi,
} from "../lib/ui.ts";
import type { BedtimePlayer, BedtimeState } from "./bedtime-player.ts";
import { store } from "./store.ts";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);

const typeUi = (p: Playlist | null): TypeUi => TYPE_BY_ID[p?.type ?? ""] ?? TYPES[2]!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

function html(markup: string): DocumentFragment {
  const t = document.createElement("template");
  t.innerHTML = markup;
  return t.content;
}

export interface SheetApi {
  open(): void;
  close(): void;
  /** Show a playlist's tracks without playing it. */
  preview(p: Playlist, when: string): void;
  isOpen(): boolean;
}

export function mountSheet(
  player: BedtimePlayer,
  onStart: (p: Playlist, when: string, index: number) => void,
): SheetApi {
  const root = $("#player-root")!;
  const sheet = $("[data-sheet]", root)!;
  const scrim = $("[data-scrim]", root)!;
  const mini = $("[data-mini]", root)!;
  const list = $("[data-track-list]", root)!;
  const tracks = $<HTMLDetailsElement>("[data-tracks]", root)!;
  const progress = $<HTMLInputElement>("[data-progress]", root)!;
  const wake = $<HTMLInputElement>("[data-wake]", root)!;
  let previewing: { p: Playlist; when: string } | null = null;
  let lastFocus: HTMLElement | null = null;
  let listFor: string | null = null;
  let scrubbing = false;
  let state: BedtimeState = player.snapshot();

  // ---- open / close ----
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function open() {
    if (!sheet.hidden && sheet.classList.contains("open")) return;
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(() => {
      sheet.classList.add("open");
      scrim.classList.add("open");
    });
    document.body.classList.add("sheet-open");
    setTimeout(
      () => $<HTMLButtonElement>("[data-close]", sheet)?.focus({ preventScroll: true }),
      reduce() ? 0 : 60,
    );
  }
  function close() {
    sheet.classList.remove("open");
    scrim.classList.remove("open");
    document.body.classList.remove("sheet-open");
    const done = () => {
      if (!sheet.classList.contains("open")) {
        sheet.hidden = true;
        scrim.hidden = true;
      }
    };
    if (reduce()) done();
    else setTimeout(done, 330);
    if (previewing) {
      previewing = null;
      sheet.removeAttribute("data-mode");
      render(state);
    }
    lastFocus?.focus({ preventScroll: true });
  }
  $("[data-close]", sheet)!.addEventListener("click", close);
  scrim.addEventListener("click", close);
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  $("[data-open]", mini)!.addEventListener("click", open);

  // ---- transport ----
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-toggle]"))
    b.addEventListener("click", () => void player.togglePlay());
  $("[data-prev]", sheet)!.addEventListener("click", () => void player.skip(-1));
  $("[data-next]", sheet)!.addEventListener("click", () => void player.skip(1));
  $("[data-back]", sheet)!.addEventListener("click", () => player.nudge(-15));
  $("[data-fwd]", sheet)!.addEventListener("click", () => player.nudge(30));
  progress.addEventListener("input", () => {
    scrubbing = true;
    $("[data-elapsed]", sheet)!.textContent = clock(Number(progress.value));
    progress.style.setProperty(
      "--p",
      `${(Number(progress.value) / Math.max(1, Number(progress.max))) * 100}%`,
    );
  });
  progress.addEventListener("change", () => {
    scrubbing = false;
    player.seek(Number(progress.value));
  });

  // ---- sleep timer and wake setting ----
  for (const r of root.querySelectorAll<HTMLInputElement>('input[name="sleep-timer"]')) {
    r.addEventListener("change", () => {
      if (r.checked) player.setTimer(parseTimer(r.value === "end" ? "end" : Number(r.value)));
    });
  }
  wake.checked = store.get<boolean>(WAKE_KEY, false);
  wake.addEventListener("change", () => {
    store.set(WAKE_KEY, wake.checked);
    document.dispatchEvent(new CustomEvent("bedtime:wake"));
  });

  // ---- preview ----
  $("[data-preview-play]", sheet)!.addEventListener("click", () => {
    if (!previewing) return;
    const { p, when } = previewing;
    previewing = null;
    sheet.removeAttribute("data-mode");
    onStart(p, when, 0);
  });

  function preview(p: Playlist, when: string) {
    previewing = { p, when };
    sheet.dataset["mode"] = "preview";
    const t = typeUi(p);
    sheet.style.setProperty("--c", t.color);
    $("[data-sheet-playlist]", sheet)!.textContent = when === "tonight" ? "Tonight" : when;
    $("[data-preview-art]", sheet)!.replaceChildren(html(iconSvg(t, 72)));
    $("[data-preview-title]", sheet)!.textContent = p.title;
    const meta = cardMeta(p);
    $("[data-preview-meta]", sheet)!.replaceChildren(
      p.subtitle,
      el("br"),
      `${meta[0]!.toUpperCase()}${meta.slice(1)}, ${p.items.length} stories`,
    );
    $("[data-preview-play-label]", sheet)!.textContent = `Play ${p.title}`;
    renderList(p, -1, true);
    tracks.open = true;
    open();
  }

  // ---- track list ----
  function renderList(p: Playlist, current: number, forPreview: boolean) {
    const key = `${p.id}|${forPreview ? "preview" : "play"}`;
    $("[data-tracks-label]", sheet)!.textContent = forPreview ? "The stories" : "Tonight's stories";
    if (listFor === key) {
      markCurrent(current);
      return;
    }
    listFor = key;
    const row = (index: number, label: string, sub: string, item: Playlist["items"][number]) => {
      const li = el("li");
      const line = el("div", { class: "row-line" });
      const b = el(
        "button",
        { type: "button", class: "row", "data-index": String(index) },
        el("span", { class: "row-num", "aria-hidden": "true" }, String(index + 1)),
        el(
          "span",
          {},
          el("span", { class: "row-title" }, label),
          el("span", { class: "row-sub" }, sub),
        ),
      );
      b.addEventListener("click", () => {
        if (previewing) {
          const { p: pp, when } = previewing;
          previewing = null;
          sheet.removeAttribute("data-mode");
          onStart(pp, when, index);
        } else void player.jumpTo(index);
      });
      line.append(b);
      li.append(line);
      if (item.advisories.length > 0) {
        const id = `note-${p.id.replace(/\W/g, "-")}-${index}`;
        const info = el("button", {
          type: "button",
          class: "info",
          "aria-expanded": "false",
          "aria-controls": id,
          "aria-label": `Note for parents: ${label}`,
        });
        info.append(html(GLYPHS.info(22)));
        const note = el(
          "p",
          { class: "note", id, hidden: "" },
          `For parents: ${item.advisories.map((a) => `${a.label} (${a.severity})`).join(", ")}.`,
        );
        info.addEventListener("click", () => {
          const show = note.hidden;
          note.hidden = !show;
          info.setAttribute("aria-expanded", String(show));
        });
        line.append(info);
        li.append(note);
      }
      return li;
    };
    const sub = (i: Playlist["items"][number]) =>
      [narratorLabel(i.narrator), minutes(i.duration_sec)].filter(Boolean).join(" · ");
    const nodes = listEntries(p.items).map((e) => {
      if (e.kind === "track") return row(e.index, e.item.title, sub(e.item), e.item);
      const li = el("li", { class: "group" });
      const name =
        e.of === 1
          ? e.title
          : `${e.title}, ${e.of} ${/chapter/i.test(e.parts[0]?.item.title ?? "") ? "chapters" : "parts"}`;
      li.append(el("span", { class: "group-head" }, name));
      const ol = el("ol", { class: "part-list" });
      for (const part of e.parts) {
        ol.append(
          row(
            part.index,
            part.item.title.replace(`${e.title}, `, "") || part.item.title,
            sub(part.item),
            part.item,
          ),
        );
      }
      li.append(ol);
      return li;
    });
    list.replaceChildren(...nodes);
    markCurrent(current);
  }

  function markCurrent(i: number) {
    for (const b of list.querySelectorAll<HTMLElement>(".row")) {
      if (Number(b.dataset["index"]) === i) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    }
  }

  // ---- render ----
  let lastPlaylist: string | null = null;
  function render(s: BedtimeState) {
    state = s;
    const p = s.playlist;
    document.body.classList.toggle("has-player", !!p);
    mini.hidden = !p;
    if (!p) return;
    const t = typeUi(p);
    root.style.setProperty("--c", t.color);
    const item = p.items[s.index] ?? p.items[0]!;
    const playing = s.phase === "playing" || s.phase === "loading";
    const label = playing ? "Pause" : "Play";
    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-toggle]")) {
      b.setAttribute("aria-label", label);
      const size = b.classList.contains("main") ? 34 : 24;
      const want = playing ? "pause" : "play";
      if (b.dataset["icon"] !== want) {
        b.dataset["icon"] = want;
        b.replaceChildren(html(GLYPHS[want](size)));
      }
    }
    if (lastPlaylist !== p.id) {
      lastPlaylist = p.id;
      $("[data-mini-icon]", mini)!.replaceChildren(html(iconSvg(t, 36)));
      $("[data-art]", sheet)!.replaceChildren(html(iconSvg(t, 112)));
    }
    $("[data-mini-title]", mini)!.textContent = item.title;
    const n = s.index + 1;
    $("[data-mini-sub]", mini)!.textContent = `${p.title} · story ${n} of ${p.items.length}`;
    const bar = $("[data-mini-bar]", mini)!;
    bar.style.width = `${s.duration > 0 ? Math.min(100, (s.position / s.duration) * 100) : 0}%`;

    if (previewing) return;
    $("[data-sheet-playlist]", sheet)!.textContent = p.title;
    $("[data-track-title]", sheet)!.textContent = item.title;
    const narrator = narratorLabel(item.narrator);
    $("[data-track-sub]", sheet)!.textContent = [narrator, `story ${n} of ${p.items.length}`]
      .filter(Boolean)
      .join(" · ");
    if (!scrubbing) {
      progress.max = String(Math.max(1, Math.round(s.duration || item.duration_sec)));
      progress.value = String(Math.round(s.position));
      progress.setAttribute(
        "aria-valuetext",
        `${clock(s.position)} of ${clock(s.duration || item.duration_sec)}`,
      );
      progress.style.setProperty(
        "--p",
        `${(s.position / Math.max(1, s.duration || item.duration_sec)) * 100}%`,
      );
      $("[data-elapsed]", sheet)!.textContent = clock(s.position);
    }
    $("[data-total]", sheet)!.textContent = clock(s.duration || item.duration_sec);
    const status =
      s.message ??
      (s.phase === "ended"
        ? "That was the end. Good night."
        : s.phase === "asleep"
          ? "Sleeping. Press play to go on."
          : s.fading
            ? "Fading out…"
            : s.stoppingAtBoundary
              ? "Stopping after this story."
              : "");
    const st = $("[data-status]", sheet)!;
    if (st.textContent !== status) st.textContent = status;
    for (const r of root.querySelectorAll<HTMLInputElement>('input[name="sleep-timer"]'))
      r.checked = r.value === String(s.timer);
    renderList(p, s.index, false);
  }

  player.onChange(render);
  return { open, close, preview, isOpen: () => sheet.classList.contains("open") };
}

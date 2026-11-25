/**
 * /my-playlists/: list, open, edit, reorder, play, print, export, import and share the playlists
 * kept in this browser (library.md §8).
 */
import type { Track } from "@goldstein/player";
import { iconSvg } from "../lib/icons.ts";
import {
  type ConflictChoice,
  decodeShare,
  encodeShare,
  exportDoc,
  exportFileName,
  mergeImport,
  parseImport,
  type PlaylistEntry,
  serialize,
  type UserPlaylist,
} from "../lib/playlists.ts";
import { formatDuration, humanLength, totalLength } from "../lib/time.ts";
import { withClean } from "../lib/tracks.ts";
import type { LibCatalog, LibRow } from "../lib/types.ts";
import { $, $$, announce, copyText, h, loadCatalog, toast } from "./core.ts";
import * as store from "./playlist-store.ts";

let rows = new Map<string, LibRow>();
let cat: LibCatalog | null = null;
let off: (() => void) | null = null;

export async function init(): Promise<void> {
  const root = $("[data-pl-root]");
  if (!root) return;
  cat = await loadCatalog();
  rows = new Map((cat?.rows ?? []).map((r) => [r.id, r]));
  off?.();
  const rerender = () => void render();
  document.addEventListener(store.CHANGED, rerender);
  off = () => document.removeEventListener(store.CHANGED, rerender);
  document.addEventListener("astro:before-swap", () => off?.(), { once: true });
  await render();
}

function params(): { id: string | null; share: string | null } {
  const id = new URLSearchParams(location.search).get("id");
  const share = /#p=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1] ?? null;
  return { id, share };
}

async function render(): Promise<void> {
  const root = $("[data-pl-root]");
  if (!root) return;
  const { id, share } = params();
  const crumbs = $("[data-pl-crumbs]");
  if (share) {
    const p = await decodeShare(share);
    if (crumbs) crumbs.hidden = false;
    root.replaceChildren(
      p
        ? sharedView(p)
        : h("p", { class: "notice" }, "This share link could not be read. It may be incomplete."),
    );
    return;
  }
  const p = id ? store.get(id) : undefined;
  if (crumbs) crumbs.hidden = !id;
  if (id && !p) {
    root.replaceChildren(
      h(
        "p",
        { class: "notice" },
        "That playlist is not in this browser. ",
        h("a", { href: "/my-playlists/" }, "See your playlists"),
        ".",
      ),
    );
    return;
  }
  if (p) {
    const focusKey =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset["fk"]
        : undefined;
    root.replaceChildren(detail(p));
    if (focusKey) root.querySelector<HTMLElement>(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus();
    backupPrompt(p);
    const h1 = $("[data-pl-h1]");
    if (h1) h1.textContent = "Playlist";
  } else {
    root.replaceChildren(listView());
    const bp = $("[data-pl-backup]");
    if (bp) bp.hidden = true;
  }
}

const durOf = (p: UserPlaylist) =>
  p.items.reduce((a, e) => a + (e.dur ?? rows.get(e.rec)?.dur ?? 0), 0);

function itemTrack(e: PlaylistEntry): Track | null {
  const r = rows.get(e.rec);
  if (!r) return null;
  return withClean(
    {
      id: r.id,
      title: e.label ? `${e.label} · ${r.title}` : r.title,
      url: r.url,
      start_sec: e.start ?? r.start,
      end_sec: e.end ?? r.end,
    },
    r,
  );
}

// ---------------------------------------------------------------------------------------------
// List view

function listView(): HTMLElement {
  const lists = store.all();
  const wrap = h("div", {});
  const name = h("input", {
    type: "text",
    placeholder: "New playlist name",
    maxlength: 120,
    "aria-label": "New playlist name",
    required: true,
  });
  const form = h(
    "form",
    { class: "btn-row" },
    name,
    h("button", {
      type: "submit",
      class: "btn btn-primary",
      html: `${iconSvg("plus", 16)} Create playlist`,
    }),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = store.create(name.value.trim());
    if (p) location.assign(`/my-playlists/?id=${p.id}`);
  });
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    if (f) void importFile(f);
    file.value = "";
  });
  const imp = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("upload", 16)} Import a file`,
  });
  imp.addEventListener("click", () => file.click());
  const exp = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("download", 16)} Export all`,
    disabled: lists.length === 0,
  });
  exp.addEventListener("click", () => download(lists));
  wrap.append(h("div", { class: "pl-toolbar" }, form, imp, exp, file));

  if (!lists.length) {
    wrap.append(
      h(
        "div",
        { class: "empty-state" },
        h("h2", {}, "No playlists yet"),
        h(
          "p",
          { class: "muted" },
          "Use “+ Playlist” on any recording, chapter, search result or serial chapter, or name one above. Tonight's playlists can be saved here too.",
        ),
      ),
    );
  } else {
    const tbody = h("tbody", {});
    for (const p of lists) {
      const play = h("button", {
        type: "button",
        class: "icon-btn",
        "data-action": "play",
        "data-tracks": JSON.stringify(p.items.map(itemTrack).filter((t): t is Track => t !== null)),
        "aria-label": `Play ${p.name}`,
        html: iconSvg("play", 16),
      });
      tbody.append(
        h(
          "tr",
          {},
          h(
            "td",
            {},
            h("a", { href: `/my-playlists/?id=${p.id}` }, p.name),
            p.origin?.startsWith("tonight:")
              ? h("span", { class: "tag", style: "margin-left:8px" }, "from tonight")
              : null,
          ),
          h("td", { class: "num" }, String(p.items.length)),
          h("td", { class: "num" }, totalLength(durOf(p))),
          h(
            "td",
            {},
            p.updated
              ? new Date(p.updated).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "",
          ),
          h("td", {}, play),
        ),
      );
    }
    wrap.append(
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "data pl-table" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", { scope: "col" }, "Playlist"),
              h("th", { scope: "col", class: "num" }, "Items"),
              h("th", { scope: "col", class: "num" }, "Length"),
              h("th", { scope: "col" }, "Updated"),
              h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Play")),
            ),
          ),
          tbody,
        ),
      ),
    );
  }
  wrap.append(dropzone());
  wrap.append(
    h(
      "p",
      { class: "small muted" },
      "Files use the open format described at ",
      h("a", { href: "/schemas/playlists-1.json" }, "/schemas/playlists-1.json"),
      " (version 1). A file exported here can be imported on any of the Goldstein story sites.",
    ),
  );
  return wrap;
}

function dropzone(): HTMLElement {
  const z = h(
    "div",
    { class: "dropzone" },
    "Drop a playlists file here to import it (JSON, up to 1 MB).",
  );
  z.addEventListener("dragover", (e) => {
    e.preventDefault();
    z.classList.add("over");
  });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", (e) => {
    e.preventDefault();
    z.classList.remove("over");
    const f = e.dataTransfer?.files[0];
    if (f) void importFile(f);
  });
  return z;
}

function message(kind: "ok" | "error", title: string, lines: string[] = []): void {
  const box = $("[data-pl-messages]");
  if (!box) return;
  const close = h("button", {
    type: "button",
    class: "icon-btn",
    "aria-label": "Dismiss",
    html: iconSvg("close", 16),
  });
  const el = h(
    "div",
    {
      class: `notice${kind === "error" ? " notice-advisory" : ""}`,
      role: kind === "error" ? "alert" : "status",
      style: "margin-bottom:16px",
    },
    h("span", { html: iconSvg(kind === "error" ? "alert" : "check", 18) }),
    h(
      "div",
      { style: "flex:1" },
      h("strong", {}, title),
      lines.length
        ? h(
            "ul",
            { style: "margin:4px 0 0;padding-left:18px" },
            ...lines.map((l) => h("li", {}, l)),
          )
        : null,
    ),
    close,
  );
  close.addEventListener("click", () => el.remove());
  box.replaceChildren(el);
}

async function importFile(f: File): Promise<void> {
  if (f.size > 1024 * 1024) {
    message("error", "Nothing was imported.", [
      `The file is ${(f.size / 1048576).toFixed(1)} MB; the limit is 1 MB.`,
    ]);
    return;
  }
  const res = parseImport(await f.text(), f.size);
  if (!res.ok) {
    message("error", "Nothing was imported. The file did not pass the check:", res.errors);
    return;
  }
  // Titles refreshed from the catalog by id; unknown ids are kept and shown as no longer available.
  const incoming = res.doc.playlists.map((p) => ({
    ...p,
    items: p.items.map((e) => {
      const r = rows.get(e.rec);
      return r ? { ...e, title: r.title.slice(0, 300) } : e;
    }),
  }));
  const conflicts = incoming.filter((p) => store.get(p.id));
  const choices = new Map<string, ConflictChoice>();
  for (const p of conflicts) choices.set(p.id, await askConflict(p));
  const out = mergeImport(store.all(), incoming, (p) => choices.get(p.id) ?? "skip");
  store.replaceAll(out.playlists);
  const unknown = incoming.reduce((a, p) => a + p.items.filter((e) => !rows.has(e.rec)).length, 0);
  const lines = [
    `${out.added} added, ${out.replaced} replaced, ${out.skipped} skipped.`,
    ...res.warnings,
    ...(unknown
      ? [
          `${unknown} item${unknown === 1 ? " is" : "s are"} no longer available in the archive; kept and marked.`,
        ]
      : []),
  ];
  message("ok", "Import finished.", lines);
}

function askConflict(p: UserPlaylist): Promise<ConflictChoice> {
  const dlg = $<HTMLDialogElement>("#conflict-dialog");
  if (!dlg) return Promise.resolve("skip");
  const text = $("[data-conflict-text]", dlg);
  if (text)
    text.textContent = `“${p.name}” is already in this browser. Replace it with the file's copy, keep both, or skip it?`;
  return new Promise((resolve) => {
    const btns = $$<HTMLButtonElement>("[data-conflict]", dlg);
    const done = (c: ConflictChoice) => {
      for (const b of btns) b.onclick = null;
      dlg.onclose = null;
      dlg.close();
      resolve(c);
    };
    for (const b of btns)
      b.onclick = () => done((b.dataset["conflict"] ?? "skip") as ConflictChoice);
    dlg.onclose = () => resolve("skip");
    dlg.showModal();
  });
}

function download(lists: UserPlaylist[]): void {
  const doc = exportDoc(lists, location.origin);
  const blob = new Blob([serialize(doc)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: exportFileName() });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  store.markExported(lists.map((p) => p.id));
  const bp = $("[data-pl-backup]");
  if (bp) bp.hidden = true;
  toast(lists.length === 1 ? "Playlist exported" : `${lists.length} playlists exported`);
}

function backupPrompt(p: UserPlaylist): void {
  const bp = $("[data-pl-backup]");
  if (!bp) return;
  const n = store.meta().sinceExport[p.id] ?? 0;
  if (n < 5) {
    bp.hidden = true;
    return;
  }
  const b = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("download", 16)} Export this playlist`,
  });
  b.addEventListener("click", () => download([p]));
  bp.replaceChildren(
    h("span", { html: iconSvg("info", 18) }),
    h(
      "p",
      { style: "flex:1" },
      `Back up: ${n} items were added since this playlist was last exported.`,
    ),
    b,
  );
  bp.hidden = false;
}

// ---------------------------------------------------------------------------------------------
// One playlist

function detail(p: UserPlaylist): HTMLElement {
  const wrap = h("div", {});
  const name = h("input", {
    class: "pl-name",
    type: "text",
    value: p.name,
    maxlength: 120,
    "aria-label": "Playlist name",
    "data-fk": "name",
  });
  name.addEventListener("change", () =>
    store.update(p.id, (x) => ({ ...x, name: name.value.trim() || x.name })),
  );
  const note = h("textarea", {
    placeholder: "A note about this playlist (optional)",
    maxlength: 2000,
    "aria-label": "Playlist note",
    "data-fk": "note",
  });
  note.value = p.note ?? "";
  note.addEventListener("change", () =>
    store.update(p.id, (x) => {
      const v = note.value.trim();
      const { note: _n, ...rest } = x;
      return v ? { ...rest, note: v } : rest;
    }),
  );
  const tracks = p.items.map(itemTrack).filter((t): t is Track => t !== null);
  const playAll = h("button", {
    type: "button",
    class: "btn btn-primary",
    "data-action": "play",
    "data-tracks": JSON.stringify(tracks),
    disabled: tracks.length === 0,
    html: `${iconSvg("play", 14)} Play all`,
  });
  const queue = h("button", {
    type: "button",
    class: "btn",
    "data-action": "queue",
    "data-tracks": JSON.stringify(tracks),
    disabled: tracks.length === 0,
    html: `${iconSvg("queue", 16)} Queue all`,
  });
  const print = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("print", 16)} Print`,
  });
  print.addEventListener("click", () => void printSheet(p));
  const exp = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("download", 16)} Export`,
  });
  exp.addEventListener("click", () => download([p]));
  const share = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("share", 16)} Share link`,
  });
  share.addEventListener("click", () => void shareLink(p));
  const del = h("button", {
    type: "button",
    class: "btn btn-danger",
    html: `${iconSvg("trash", 16)} Delete`,
  });
  del.addEventListener("click", () => {
    const index = store.all().findIndex((x) => x.id === p.id);
    const gone = store.remove(p.id);
    history.replaceState(null, "", "/my-playlists/");
    void render();
    if (gone)
      toast(
        `Deleted “${gone.name}”`,
        {
          label: "Undo",
          run: () => {
            store.restore(gone, index);
            history.replaceState(null, "", `/my-playlists/?id=${gone.id}`);
            void render();
          },
        },
        10_000,
      );
  });
  wrap.append(
    h(
      "div",
      { class: "pl-head" },
      name,
      h(
        "p",
        { class: "muted", style: "margin:0" },
        `${p.items.length} item${p.items.length === 1 ? "" : "s"} · ${totalLength(durOf(p))}${p.origin?.startsWith("tonight:") ? ` · copied from tonight's playlists (${p.origin.split(":")[1] ?? ""})` : ""}`,
      ),
      note,
      h("div", { class: "btn-row" }, playAll, queue, print, exp, share, del),
    ),
  );
  if (!p.items.length) {
    wrap.append(
      h(
        "p",
        { class: "muted" },
        "This playlist is empty. Use “+ Playlist” on any recording or chapter to add to it.",
      ),
    );
    return wrap;
  }
  wrap.append(
    h(
      "p",
      { class: "small muted" },
      "Reorder by dragging, or focus an item and press Alt+↑ / Alt+↓.",
    ),
  );
  const ol = h("ol", { class: "pl-items" });
  p.items.forEach((e, i) => ol.append(itemRow(p, e, i)));
  wrap.append(ol);
  return wrap;
}

function move(p: UserPlaylist, from: number, to: number): void {
  if (to < 0 || to >= p.items.length || from === to) return;
  store.update(p.id, (x) => {
    const items = [...x.items];
    const [it] = items.splice(from, 1);
    if (it) items.splice(to, 0, it);
    return { ...x, items };
  });
  announce(`Moved to position ${to + 1}`);
}

function itemRow(p: UserPlaylist, e: PlaylistEntry, i: number): HTMLElement {
  const r = rows.get(e.rec);
  const t = itemTrack(e);
  const title = e.label ?? r?.title ?? e.title ?? e.rec;
  const href = `/r/${e.rec}/${e.start !== undefined ? `?t=${Math.floor(e.start)}${e.end !== undefined ? `&end=${Math.floor(e.end)}` : ""}` : ""}`;
  const len =
    e.end !== undefined && e.start !== undefined ? e.end - e.start : (e.dur ?? r?.dur ?? 0);
  const li = h("li", {
    class: "pl-item",
    draggable: "true",
    tabindex: "0",
    "data-i": i,
    "data-fk": `item:${i}`,
    "aria-label": `${i + 1}. ${title}`,
  });
  const up = h("button", {
    type: "button",
    class: "icon-btn",
    "aria-label": `Move ${title} up`,
    disabled: i === 0,
    html: iconSvg("up", 16),
    "data-fk": `up:${i}`,
  });
  up.addEventListener("click", () => move(p, i, i - 1));
  const down = h("button", {
    type: "button",
    class: "icon-btn",
    "aria-label": `Move ${title} down`,
    disabled: i === p.items.length - 1,
    html: iconSvg("down", 16),
    "data-fk": `down:${i}`,
  });
  down.addEventListener("click", () => move(p, i, i + 1));
  const rm = h("button", {
    type: "button",
    class: "icon-btn",
    "aria-label": `Remove ${title}`,
    html: iconSvg("close", 16),
  });
  rm.addEventListener("click", () => {
    store.update(p.id, (x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));
    toast(
      `Removed “${title}”`,
      {
        label: "Undo",
        run: () =>
          store.update(p.id, (x) => {
            const items = [...x.items];
            items.splice(i, 0, e);
            return { ...x, items };
          }),
      },
      10_000,
    );
  });
  const noteBtn = h("button", {
    type: "button",
    class: "icon-btn",
    "aria-label": `Note for ${title}`,
    html: iconSvg("edit", 16),
  });
  const noteBox = h("textarea", {
    maxlength: 1000,
    placeholder: "Note for this item",
    "aria-label": `Note for ${title}`,
    hidden: !e.note,
  });
  noteBox.value = e.note ?? "";
  noteBtn.addEventListener("click", () => {
    noteBox.hidden = false;
    noteBox.focus();
  });
  noteBox.addEventListener("change", () =>
    store.update(p.id, (x) => ({
      ...x,
      items: x.items.map((it, j) => {
        if (j !== i) return it;
        const { note: _n, ...rest } = it;
        return noteBox.value.trim() ? { ...rest, note: noteBox.value.trim() } : rest;
      }),
    })),
  );
  li.append(
    h("span", { class: "handle", "aria-hidden": "true" }, "⋮⋮"),
    h("span", { class: "pos" }, `${i + 1}.`),
    h(
      "div",
      { class: "what" },
      r ? h("a", { href }, title) : h("strong", {}, title),
      h(
        "div",
        { class: "rec-meta" },
        e.label && r ? h("span", {}, `from ${r.title}`) : null,
        e.start !== undefined
          ? h(
              "span",
              { class: "num" },
              `${formatDuration(e.start)}–${formatDuration(e.end ?? r?.end ?? e.start)}`,
            )
          : null,
        h("span", { class: "num" }, humanLength(len)),
        r?.dateLabel ? h("span", { class: "hdate" }, r.dateLabel) : null,
        r ? h("span", {}, `ages ${r.age}+`) : null,
      ),
      r ? null : h("p", { class: "gone" }, "No longer available in the archive."),
      noteBox,
    ),
    h(
      "div",
      { class: "acts" },
      t
        ? h("button", {
            type: "button",
            class: "icon-btn",
            "data-action": "play",
            "data-track": JSON.stringify(t),
            "aria-label": `Play ${title}`,
            html: iconSvg("play", 16),
          })
        : null,
      up,
      down,
      noteBtn,
      rm,
    ),
  );
  li.addEventListener("keydown", (ev) => {
    if (ev.target !== li || !ev.altKey) return;
    if (ev.key === "ArrowUp") move(p, i, i - 1);
    else if (ev.key === "ArrowDown") move(p, i, i + 1);
    else return;
    ev.preventDefault();
    window.setTimeout(
      () => $<HTMLElement>(`[data-fk="item:${ev.key === "ArrowUp" ? i - 1 : i + 1}"]`)?.focus(),
      0,
    );
  });
  li.addEventListener("dragstart", (ev) => {
    ev.dataTransfer?.setData("text/plain", String(i));
    li.classList.add("dragging");
  });
  li.addEventListener("dragend", () => li.classList.remove("dragging"));
  li.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    li.classList.add("drop-before");
  });
  li.addEventListener("dragleave", () => li.classList.remove("drop-before"));
  li.addEventListener("drop", (ev) => {
    ev.preventDefault();
    li.classList.remove("drop-before");
    const from = Number(ev.dataTransfer?.getData("text/plain"));
    if (Number.isInteger(from)) move(p, from, from < i ? i - 1 : i);
  });
  return li;
}

async function shareLink(p: UserPlaylist): Promise<void> {
  const enc = await encodeShare(p);
  if (!enc) {
    message("error", "This playlist is too long for a share link.", [
      "Share links hold about 40 items. Export a file instead and send that.",
    ]);
    return;
  }
  await copyText(
    `${location.origin}/my-playlists/#p=${enc}`,
    "Share link copied. Nothing is sent to a server.",
  );
}

function sharedView(p: UserPlaylist): HTMLElement {
  const h1 = $("[data-pl-h1]");
  if (h1) h1.textContent = "Shared playlist";
  const tracks = p.items.map(itemTrack).filter((t): t is Track => t !== null);
  const save = h("button", {
    type: "button",
    class: "btn btn-primary",
    html: `${iconSvg("plus", 16)} Save to my playlists`,
  });
  save.addEventListener("click", () => {
    const made = store.create(
      p.name,
      p.items.map((e) => ({
        ...e,
        title: rows.get(e.rec)?.title.slice(0, 300) ?? e.title ?? e.rec,
      })),
      "shared link",
    );
    if (made) location.assign(`/my-playlists/?id=${made.id}`);
  });
  const ol = h("ol", { class: "rec-list" });
  for (const e of p.items) {
    const r = rows.get(e.rec);
    ol.append(
      h(
        "li",
        { class: "rec" },
        h(
          "div",
          {},
          h(
            "h3",
            { class: "rec-title" },
            r
              ? h(
                  "a",
                  { href: `/r/${e.rec}/${e.start ? `?t=${Math.floor(e.start)}` : ""}` },
                  e.label ?? r.title,
                )
              : (e.label ?? e.rec),
          ),
          r
            ? h(
                "div",
                { class: "rec-meta" },
                e.label ? h("span", {}, `from ${r.title}`) : null,
                h(
                  "span",
                  {},
                  humanLength(
                    e.end !== undefined && e.start !== undefined ? e.end - e.start : r.dur,
                  ),
                ),
              )
            : h("p", { class: "gone" }, "No longer available."),
          e.note ? h("p", { class: "rec-sum" }, e.note) : null,
        ),
      ),
    );
  }
  return h(
    "div",
    {},
    h("h2", {}, p.name),
    p.note ? h("p", { class: "lede" }, p.note) : null,
    h(
      "p",
      { class: "muted" },
      `${p.items.length} items. This is a read-only copy from a link; save it to keep it in this browser.`,
    ),
    h(
      "div",
      { class: "btn-row", style: "margin-bottom:12px" },
      h("button", {
        type: "button",
        class: "btn",
        "data-action": "play",
        "data-tracks": JSON.stringify(tracks),
        html: `${iconSvg("play", 14)} Play all`,
      }),
      save,
    ),
    ol,
  );
}

async function printSheet(p: UserPlaylist): Promise<void> {
  const sheet = $("[data-print-sheet]");
  if (!sheet) return;
  const { qrSvg } = await import("../lib/qr.ts");
  sheet.replaceChildren(
    h("h1", {}, p.name),
    h("p", {}, `${p.items.length} items · ${totalLength(durOf(p))}${p.note ? ` · ${p.note}` : ""}`),
    h(
      "ol",
      {},
      ...p.items.map((e, i) => {
        const r = rows.get(e.rec);
        const url = `${location.origin}/r/${e.rec}/${e.start !== undefined ? `?t=${Math.floor(e.start)}` : ""}`;
        const len =
          e.end !== undefined && e.start !== undefined ? e.end - e.start : (e.dur ?? r?.dur ?? 0);
        return h(
          "li",
          {},
          h("span", {}, `${i + 1}.`),
          h(
            "div",
            {},
            h("strong", {}, e.label ?? r?.title ?? e.title ?? e.rec),
            h(
              "div",
              {},
              `${humanLength(len)}${e.start !== undefined ? ` · from ${formatDuration(e.start)}` : ""}${r?.dateLabel ? ` · ${r.dateLabel}` : ""}${r ? ` · ages ${r.age}+` : ""}`,
            ),
            r?.lesson ? h("div", { style: "font-style:italic" }, r.lesson) : null,
            e.note ? h("div", {}, `Note: ${e.note}`) : null,
          ),
          h("span", { html: qrSvg(url, 64, `QR code for item ${i + 1}`) }),
        );
      }),
    ),
    h(
      "p",
      { style: "font-size:9pt" },
      `Printed from ${location.host} · ${new Date().toLocaleDateString("en-GB")}`,
    ),
  );
  document.documentElement.classList.add("print-sheet-mode");
  window.addEventListener(
    "afterprint",
    () => document.documentElement.classList.remove("print-sheet-mode"),
    { once: true },
  );
  window.print();
}

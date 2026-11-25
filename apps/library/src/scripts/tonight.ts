/**
 * Tonight's playlists (library.md §9), read from the shared /playlists/ files (bedtime.md §4.6
 * contract). Shown in the library's own style. If the files are missing or malformed the strip and
 * sections are simply omitted: no error is shown anywhere.
 */
import type { Track } from "@goldstein/player";
import {
  type Edition,
  fetchCurrentEdition,
  type HistoryFile,
  type Playlist,
} from "@goldstein/playlists";
import { iconSvg } from "../lib/icons.ts";
import type { PlaylistEntry } from "../lib/playlists.ts";
import { formatDuration, humanLength } from "../lib/time.ts";
import { withClean } from "../lib/tracks.ts";
import type { LibCatalog, LibRow } from "../lib/types.ts";
import { sanitizeEdition } from "../lib/editions.ts";
import { $, h, loadCatalog, toast } from "./core.ts";
import * as store from "./playlist-store.ts";

async function current(): Promise<Edition | null> {
  try {
    return sanitizeEdition(await fetchCurrentEdition());
  } catch {
    return null;
  }
}

async function history(): Promise<Edition[]> {
  try {
    const r = await fetch("/playlists/history.json");
    if (!r.ok) return [];
    const j = (await r.json()) as HistoryFile;
    return Array.isArray(j.nights)
      ? (j.nights as unknown[]).map(sanitizeEdition).filter((e): e is Edition => e !== null)
      : [];
  } catch {
    return [];
  }
}

/** Items of a playlist that exist in the library catalog. */
function known(p: Playlist, rows: Map<string, LibRow>): Playlist["items"] {
  return p.items.filter(
    (i) => rows.has(i.id) && typeof i.start_sec === "number" && typeof i.end_sec === "number",
  );
}

function tracks(p: Playlist, rows: Map<string, LibRow>): Track[] {
  return known(p, rows).map((i) => {
    const r = rows.get(i.id) as LibRow;
    const t: Track = {
      id: i.id,
      title: i.title || r.title,
      url: r.url,
      start_sec: i.start_sec,
      end_sec: i.end_sec,
    };
    if (i.narrator) t.artist = i.narrator;
    return withClean(t, r);
  });
}

function entries(p: Playlist, rows: Map<string, LibRow>): PlaylistEntry[] {
  return known(p, rows).map((i) => {
    const r = rows.get(i.id) as LibRow;
    const e: PlaylistEntry = {
      rec: i.id,
      title: r.title.slice(0, 300),
      dur: Math.round((i.end_sec - i.start_sec) * 10) / 10,
    };
    const whole = Math.abs(i.start_sec - r.start) < 1 && Math.abs(i.end_sec - r.end) < 1;
    if (!whole) {
      e.start = i.start_sec;
      e.end = i.end_sec;
      if (i.title && i.title !== r.title) e.label = i.title.slice(0, 200);
    }
    return e;
  });
}

function saveCopy(ed: Edition, p: Playlist, rows: Map<string, LibRow>): void {
  const name = `${p.title}, ${ed.hebrew_date ?? ed.date}`;
  const made = store.create(name, entries(p, rows), `tonight:${ed.date}:${p.type}`);
  if (made)
    toast(`Saved “${made.name}” to your playlists`, {
      label: "Open",
      run: () => location.assign(`/my-playlists/?id=${made.id}`),
    });
  else toast("You already have 100 playlists.");
}

function playBtn(ts: Track[], label = "Play"): HTMLButtonElement {
  return h("button", {
    type: "button",
    class: "btn btn-primary",
    "data-action": "play",
    "data-tracks": JSON.stringify(ts),
    html: `${iconSvg("play", 14)} ${label}`,
  });
}

// ---------------------------------------------------------------------------------------------

/** Home page strip: up to 3 cards. */
export async function initStrip(): Promise<void> {
  const strip = $("[data-tonight-strip]");
  const cards = $("[data-tonight-cards]");
  if (!strip || !cards || strip.dataset["done"]) return;
  strip.dataset["done"] = "1";
  const [ed, cat] = await Promise.all([current(), loadCatalog()]);
  if (!ed || !cat) return;
  const rows = new Map(cat.rows.map((r) => [r.id, r]));
  const lists = ed.playlists.filter((p) => known(p, rows).length > 0).slice(0, 3);
  if (!lists.length) return;
  cards.replaceChildren(
    ...lists.map((p) => {
      const ts = tracks(p, rows);
      const mins = Math.round(
        ts.reduce((a, t) => a + ((t.end_sec ?? 0) - (t.start_sec ?? 0)), 0) / 60,
      );
      return h(
        "article",
        { class: "card" },
        h("h3", {}, h("a", { href: `/tonight/#${p.type}` }, p.title)),
        h("p", {}, p.subtitle),
        h("p", { class: "small" }, `${ts.length} recordings · ${mins} min · ages ${p.age_min}+`),
        h(
          "div",
          { class: "btn-row" },
          playBtn(ts),
          h("a", { class: "btn", href: `/tonight/#${p.type}` }, "Open"),
        ),
      );
    }),
  );
  strip.hidden = false;
}

function playlistSection(
  ed: Edition,
  p: Playlist,
  cat: LibCatalog,
  rows: Map<string, LibRow>,
  idPrefix: string,
): HTMLElement | null {
  const items = known(p, rows);
  if (!items.length) return null;
  const ts = tracks(p, rows);
  const total = ts.reduce((a, t) => a + ((t.end_sec ?? 0) - (t.start_sec ?? 0)), 0);
  const save = h("button", {
    type: "button",
    class: "btn",
    html: `${iconSvg("plus", 16)} Save a copy to my playlists`,
  });
  save.addEventListener("click", () => saveCopy(ed, p, rows));
  const ol = h("ol", { class: "rec-list" });
  items.forEach((i, n) => {
    const r = rows.get(i.id) as LibRow;
    const range = Math.abs(i.start_sec - r.start) >= 1 || Math.abs(i.end_sec - r.end) >= 1;
    const t: Track = {
      id: i.id,
      title: i.title || r.title,
      url: r.url,
      start_sec: i.start_sec,
      end_sec: i.end_sec,
    };
    withClean(t, r);
    const e = entries({ ...p, items: [i] }, rows)[0];
    const speakers = r.speakers
      .filter((s) => s !== "guest_children")
      .map((s) => cat.vocab["speakers"]?.find((v) => v[0] === s)?.[1] ?? s);
    ol.append(
      h(
        "li",
        { class: "rec" },
        h(
          "div",
          {},
          h(
            "h4",
            { class: "rec-title" },
            h("span", { class: "muted num" }, `${n + 1}. `),
            h(
              "a",
              {
                href: `/r/${i.id}/${range ? `?t=${Math.floor(i.start_sec)}&end=${Math.floor(i.end_sec)}` : ""}`,
              },
              i.title || r.title,
            ),
          ),
          h(
            "div",
            { class: "rec-meta" },
            range
              ? h(
                  "span",
                  {},
                  `${formatDuration(i.start_sec)}–${formatDuration(i.end_sec)} of ${r.title}`,
                )
              : null,
            speakers.length ? h("span", {}, speakers.join(", ")) : null,
            r.dateLabel ? h("span", { class: "hdate" }, r.dateLabel) : null,
            h("span", { class: "num" }, humanLength(i.end_sec - i.start_sec)),
            h("span", {}, `ages ${r.age}+`),
            i.block
              ? h("span", {}, `${i.block.title}, part ${i.block.part} of ${i.block.of}`)
              : null,
          ),
          h("p", { class: "rec-sum" }, r.summary),
        ),
        h(
          "div",
          { class: "rec-actions" },
          h("button", {
            type: "button",
            class: "btn",
            "data-action": "play",
            "data-track": JSON.stringify(t),
            html: `${iconSvg("play", 14)} Play`,
          }),
          h("button", {
            type: "button",
            class: "btn",
            "data-action": "queue",
            "data-track": JSON.stringify(t),
            html: `${iconSvg("queue", 16)} Queue`,
          }),
          e
            ? h("button", {
                type: "button",
                class: "btn",
                "data-action": "add",
                "data-entry": JSON.stringify(e),
                "data-what": i.title || r.title,
                html: `${iconSvg("plus", 16)} Playlist`,
              })
            : null,
          h("a", {
            class: "btn btn-quiet",
            href: `/r/${i.id}/#cite`,
            html: `${iconSvg("quote", 16)} Cite`,
          }),
        ),
      ),
    );
  });
  return h(
    "section",
    { class: "section tonight-list", id: `${idPrefix}${p.type}`, "aria-label": p.title },
    h(
      "div",
      { class: "section-head" },
      h("h3", { class: "tl-title" }, p.title),
      h(
        "span",
        { class: "small muted" },
        `${items.length} recordings · ${Math.round(total / 60)} min · ages ${p.age_min}+`,
      ),
    ),
    h("p", { class: "muted" }, p.subtitle),
    h("div", { class: "btn-row", style: "margin-bottom:10px" }, playBtn(ts, "Play all"), save),
    ol,
  );
}

/** /tonight/ page. */
export async function init(): Promise<void> {
  await initStrip();
  const host = $("[data-tonight]");
  if (!host || host.dataset["done"]) return;
  host.dataset["done"] = "1";
  const [ed, past, cat] = await Promise.all([current(), history(), loadCatalog()]);
  const empty = $("[data-tonight-empty]");
  const loading = $("[data-tonight-loading]");
  if (loading) loading.hidden = true;
  if (!cat || (!ed && !past.length)) {
    if (empty) empty.hidden = false;
    return;
  }
  const rows = new Map(cat.rows.map((r) => [r.id, r]));
  const out: HTMLElement[] = [];
  if (ed) {
    const secs = ed.playlists
      .map((p) => playlistSection(ed, p, cat, rows, ""))
      .filter((s): s is HTMLElement => s !== null);
    if (secs.length) {
      out.push(
        h(
          "h2",
          {},
          `Tonight · ${ed.hebrew_date ?? ""}${ed.hebrew_date ? " · " : ""}${fmtDate(ed.date)}`,
        ),
        ...secs,
      );
    }
  }
  const earlier = past.filter((p) => p.date !== ed?.date).slice(0, 7);
  if (earlier.length) {
    out.push(h("h2", { class: "earlier-h" }, "Earlier this week"));
    for (const night of earlier) {
      const secs = night.playlists
        .map((p) => playlistSection(night, p, cat, rows, `${night.date}-`))
        .filter((s): s is HTMLElement => s !== null);
      if (!secs.length) continue;
      out.push(
        h(
          "details",
          { class: "night" },
          h(
            "summary",
            {},
            h("strong", {}, fmtDate(night.date)),
            night.hebrew_date ? ` · ${night.hebrew_date}` : "",
            h("span", { class: "muted" }, ` · ${secs.length} playlists`),
          ),
          ...secs,
        ),
      );
    }
  }
  if (!out.length) {
    if (empty) empty.hidden = false;
    return;
  }
  host.replaceChildren(...out);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
}

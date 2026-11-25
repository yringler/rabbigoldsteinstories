/**
 * Tonight's playlists (§10): read-only views of the shared editions served at /playlists/*. Not
 * band-filtered; each card shows "Ages N+". Any failure hides the shelf or shows "No playlists tonight".
 */
import {
  fetchCurrentEdition,
  type Edition,
  type HistoryFile,
  type Playlist,
} from "@goldstein/playlists";
import type { Track } from "@goldstein/player";
import { escapeHtml as esc, itemPath } from "../../lib/records.ts";
import { minutes } from "../../lib/kinds.ts";
import { ui } from "../../lib/ui-icons.ts";
import { loadIndex } from "../data.ts";

const moonArt = `<svg class="pl-art" viewBox="0 0 120 80" aria-hidden="true"><circle cx="92" cy="30" r="20" fill="#FFC83D"/><circle cx="86" cy="24" r="4" fill="#F5B82A"/><circle cx="97" cy="37" r="3" fill="#F5B82A"/><g fill="#FFF8EC"><circle cx="20" cy="18" r="1.6"/><circle cx="44" cy="10" r="1.2"/><circle cx="36" cy="40" r="1.4"/><circle cx="12" cy="56" r="1.1"/><circle cx="60" cy="28" r="1"/><circle cx="58" cy="58" r="1.4"/><circle cx="26" cy="32" r="1.5"/></g></svg>`;

export function playlistTracks(p: Playlist): Track[] {
  return p.items.map((i) => {
    const t: Track = {
      id: i.id,
      title: i.title,
      url: i.audio_url,
      start_sec: i.start_sec,
      end_sec: i.end_sec,
      artwork: `/covers/${i.id}.svg`,
    };
    if (i.narrator) t.artist = i.narrator;
    return t;
  });
}

export function playlistCard(p: Playlist): string {
  const req = JSON.stringify({
    tracks: playlistTracks(p),
    mode: "replace",
    source: `Tonight: ${p.title}`,
  });
  const n = p.items.length;
  return (
    `<article class="pl-card">${moonArt}<div class="pl-text"><h3>${esc(p.title)}</h3>` +
    `<p class="pl-sub">${esc(p.kid_line ?? p.subtitle)}</p>` +
    `<p class="pl-meta">${n} ${n === 1 ? "story" : "stories"} · ${p.total_min} min · Ages ${p.age_min}+</p></div>` +
    `<button type="button" class="btn sun pl-play" data-play="${esc(req)}">${ui("play", "", 26)}Play</button></article>`
  );
}

function rows(p: Playlist, inPool: (id: string) => boolean): string {
  return (
    `<ol class="pl-items">` +
    p.items
      .map((i) => {
        const dur = minutes(Math.max(0, i.end_sec - i.start_sec));
        const title = inPool(i.id)
          ? `<a href="${itemPath(i.id)}">${esc(i.title)}</a>`
          : `<span>${esc(i.title)}</span>`;
        return `<li><span class="pl-row-in">${title}<span class="muted">${dur}</span></span></li>`;
      })
      .join("") +
    `</ol>`
  );
}

function nightLabel(e: Edition): string {
  const d = new Date(`${e.date}T12:00:00`);
  const wd = d.toLocaleDateString("en-US", { weekday: "long" });
  const day = e.hebrew_date
    ? e.hebrew_date.replace(/\s\d{4}$/, "")
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${wd} night, ${day}`;
}

export async function initPlaylists(root: HTMLElement, rerender: boolean): Promise<void> {
  if (rerender) return;
  const tonight = root.querySelector<HTMLElement>("[data-tonight]");
  const past = root.querySelector<HTMLElement>("[data-past]");
  const [ed, ix] = await Promise.all([fetchCurrentEdition(), loadIndex()]);
  const inPool = (id: string) => ix.byId.has(id);
  if (tonight) {
    if (!ed || !Array.isArray(ed.playlists) || ed.playlists.length === 0) {
      tonight.innerHTML = `<div class="empty">${moonArt}<p>No playlists tonight. Try again later!</p></div>`;
    } else {
      tonight.innerHTML = ed.playlists
        .map((p) => `<div class="pl-block">${playlistCard(p)}${rows(p, inPool)}</div>`)
        .join("");
    }
  }
  if (past) {
    let hist: HistoryFile | null = null;
    try {
      const r = await fetch("/playlists/history.json");
      hist = r.ok ? ((await r.json()) as HistoryFile) : null;
    } catch {
      hist = null;
    }
    const nights = (hist?.nights ?? []).filter((n) => n.date !== ed?.date).slice(0, 7);
    past.innerHTML =
      nights.length === 0
        ? `<p class="muted">No past nights yet.</p>`
        : nights
            .map(
              (n) =>
                `<details class="night"><summary>${ui("moon", "", 24)}<span>${esc(nightLabel(n))}</span>${ui("down", "chev", 24)}</summary>` +
                n.playlists
                  .map((p) => `<div class="pl-block">${playlistCard(p)}${rows(p, inPool)}</div>`)
                  .join("") +
                `</details>`,
            )
            .join("");
  }
}

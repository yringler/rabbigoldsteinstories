/** Home: the date- and device-dependent shelves (§4.1). Every shelf needs SHELF_MIN items in band. */
import { fetchCurrentEdition } from "@goldstein/playlists";
import {
  BYLINE_NAMES,
  cardHtml,
  coverPath,
  escapeHtml as esc,
  itemPath,
  type Rec,
} from "../../lib/records.ts";
import { minutes } from "../../lib/kinds.ts";
import { storyOfTheDay, surprise } from "../../lib/sotd.ts";
import { HOLIDAY_TILES, SHELF_MIN } from "../../lib/tiles.ts";
import { recTrack } from "../../lib/tracks.ts";
import { ui } from "../../lib/ui-icons.ts";
import {
  dailyPick,
  dayNumber,
  loadCalendar,
  loadExtra,
  loadIndex,
  localDay,
  recIn,
} from "../data.ts";
import { decorateCards } from "../cards.ts";
import { playlistCard } from "./playlists.ts";
import * as S from "../state.ts";

const KIND_ORDER = { story: 0, show: 1, short: 2, event: 3, song: 4 } as const;

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 4 || h >= 18) return "Good evening!";
  if (h < 12) return "Good morning!";
  return "Good afternoon!";
}

function shelfSection(title: string, href: string | null, html: string, cls = ""): string {
  const id = `s-${Math.random().toString(36).slice(2, 8)}`;
  return (
    `<section class="section shelf ${cls}" aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${esc(title)}</h2>` +
    (href ? `<a class="see-all" href="${href}">See all${ui("right", "", 22)}</a>` : "") +
    `</div><div class="shelf-row">${html}</div></section>`
  );
}

export async function initHome(root: HTMLElement, rerender: boolean): Promise<void> {
  const greet = root.querySelector("[data-greet]");
  if (greet) greet.textContent = greeting();
  const [ix, cal] = await Promise.all([loadIndex(), loadCalendar()]);
  const v = S.getVariant();
  const d = dayNumber();
  const today = cal?.days.find((x) => x.d === localDay()) ?? null;
  const inBand = ix.list.filter((r) => recIn(r, v));

  const hdate = root.querySelector("[data-hdate]");
  if (hdate && today)
    hdate.innerHTML = `${esc(today.h)}${today.o ? ` · <b>${esc(today.o)}</b>` : ""}`;

  // Story of the Day.
  const sotd = storyOfTheDay(ix.list, v, d, today?.g ?? [], today?.s ?? []);
  const box = root.querySelector<HTMLElement>("[data-sotd-card]");
  if (box && sotd) {
    const by = sotd.b === undefined ? "" : ` · Told by ${BYLINE_NAMES[sotd.b]}`;
    const req = JSON.stringify({
      tracks: [recTrack(sotd)],
      mode: "single",
      source: "Story of the Day",
    });
    box.outerHTML =
      `<div class="sotd-card" data-sotd-card><div class="sotd-cover"><img src="${coverPath(sotd.id)}" alt="" width="300" height="300"></div>` +
      `<div class="sotd-body"><span class="sotd-kicker">${ui("star", "", 20)} Story of the Day</span>` +
      `<p class="sotd-title"><a href="${itemPath(sotd.id)}">${esc(sotd.t)}</a></p>` +
      `<p class="sotd-meta">${minutes(sotd.d)}${esc(by)}</p><p class="sotd-summary" data-sotd-sum></p>` +
      `<div class="sotd-play"><button type="button" class="btn play-xl" data-play="${esc(req)}" aria-label="Play ${esc(sotd.t)}">${ui("play", "", 42)}</button><span class="sotd-hint">Tap to play</span></div></div></div>`;
    void loadExtra(sotd.id).then((x) => {
      const el = root.querySelector("[data-sotd-sum]");
      if (el && x) el.textContent = x.sum;
    });
  }

  // Keep Listening (the listener's own progress; not band-filtered).
  const keepIds = S.keepListening(6);
  const keep = root.querySelector<HTMLElement>("[data-keep]");
  const keepRow = root.querySelector<HTMLElement>("[data-keep-row]");
  const keepRecs = keepIds.map((id) => ix.byId.get(id)).filter((r): r is Rec => Boolean(r));
  if (keep && keepRow) {
    keep.hidden = keepRecs.length === 0;
    keepRow.innerHTML = keepRecs
      .map((r) => cardHtml(r, { vis: ["l", "k", "b", "lg", "kg", "bg"] }))
      .join("");
  }

  // Tonight's playlists (never blocks the page; hidden on any failure).
  const pl = root.querySelector<HTMLElement>("[data-playlists]");
  const plRow = root.querySelector<HTMLElement>("[data-playlists-row]");
  if (pl && plRow && !rerender) {
    void fetchCurrentEdition().then((ed) => {
      if (!ed || !Array.isArray(ed.playlists) || ed.playlists.length === 0) return;
      plRow.innerHTML = ed.playlists.map((p) => playlistCard(p)).join("");
      pl.hidden = false;
    });
  }

  // Coming up: active holiday groups and chassidishe dates, at most 2 shelves.
  const coming = root.querySelector<HTMLElement>("[data-coming]");
  if (coming) {
    const cands: { title: string; href: string; ids: readonly string[] }[] = [];
    for (const g of today?.g ?? []) {
      const t = HOLIDAY_TILES.find((x) => x.slug === g);
      if (t)
        cands.push({ title: `Coming up: ${t.label}`, href: `/holiday/${t.slug}/`, ids: t.ids });
    }
    for (const id of today?.s ?? []) {
      cands.push({
        title: `Coming up: ${cal?.labels[id] ?? id}`,
        href: `/holiday/chassidishe-yomim-tovim/?d=${id}`,
        ids: [id],
      });
    }
    const shelves: string[] = [];
    for (const c of cands) {
      if (shelves.length >= 2) break;
      const recs = inBand
        .filter((r) => r.c?.some((x) => c.ids.includes(x)))
        .sort((a, b) => KIND_ORDER[a.k] - KIND_ORDER[b.k] || a.r - b.r);
      if (recs.length < SHELF_MIN) continue;
      shelves.push(
        shelfSection(
          c.title,
          c.href,
          recs
            .slice(0, 12)
            .map((r) => cardHtml(r))
            .join(""),
          "coming",
        ),
      );
    }
    coming.innerHTML = shelves.join("");
  }

  // This week's parsha (only when it has at least 2 items in band).
  const parsha = root.querySelector<HTMLElement>("[data-parsha]");
  if (parsha) {
    let html = "";
    for (const p of today?.p ?? []) {
      const recs = inBand.filter((r) => r.p?.includes(p));
      if (recs.length >= 2) {
        html = shelfSection(
          `This week's parsha: ${cal?.labels[p] ?? p}`,
          `/parsha/${p}/`,
          recs
            .slice(0, 12)
            .map((r) => cardHtml(r))
            .join(""),
        );
        break;
      }
    }
    parsha.innerHTML = html;
  }

  // Quick Listens under 10 minutes and radio shows, random by day.
  const fill = (sel: string, rowSel: string, recs: Rec[]) => {
    const sec = root.querySelector<HTMLElement>(sel);
    const row = root.querySelector<HTMLElement>(rowSel);
    if (!sec || !row) return;
    sec.hidden = recs.length < SHELF_MIN;
    row.innerHTML = recs.map((r) => cardHtml(r)).join("");
  };
  fill(
    "[data-quick]",
    "[data-quick-row]",
    dailyPick(
      inBand.filter((r) => r.k === "short" && r.d < 600),
      12,
      d,
    ),
  );
  fill(
    "[data-radio]",
    "[data-radio-row]",
    dailyPick(
      inBand.filter((r) => r.k === "show"),
      12,
      d + 101,
    ),
  );

  // Chapter Stories: a serial in progress comes first, labelled "Next: Chapter N".
  const prog = S.getProgress();
  root.querySelectorAll<HTMLElement>(".home-serials .serial-card").forEach((card) => {
    card.style.order = "";
    card.querySelector(".kicker")?.remove();
    const s = ix.serials[card.dataset["serial"] ?? ""];
    if (!s) return;
    const started = s.ids.some((id) => id && prog[id]);
    if (!started) return;
    const nextIdx = s.ids.findIndex((id) => id !== null && !prog[id]?.done);
    if (nextIdx < 0) return;
    card.style.order = "-1";
    const k = document.createElement("span");
    k.className = "kicker";
    k.textContent = `Next: Chapter ${nextIdx + 1}`;
    card.querySelector(".ct")?.before(k);
  });

  // Meet a Hero: 8 of the heroes in band, rotating daily.
  const heroes = [...root.querySelectorAll<HTMLElement>("[data-hero]")];
  const visible = heroes.filter((h) => (h.dataset["vis"] ?? "").split(" ").includes(v));
  const pick = new Set(dailyPick(visible, 8, d + 7));
  heroes.forEach((h) => h.classList.toggle("rot-hide", !pick.has(h)));

  // Surprise Me.
  const btn = root.querySelector<HTMLButtonElement>("[data-surprise]");
  if (btn && !btn.dataset["bound"]) {
    btn.dataset["bound"] = "1";
    btn.addEventListener("click", () => {
      const r = surprise(ix.list, S.getVariant());
      if (!r) return;
      void window.kidsPlayer?.play({ tracks: [recTrack(r)], mode: "single", source: "Surprise!" });
      window.kidsPlayer?.toast(`Surprise! ${r.t}`);
    });
  }
  decorateCards(root);
}

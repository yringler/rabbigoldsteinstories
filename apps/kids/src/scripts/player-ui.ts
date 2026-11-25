/**
 * The persistent player (docs/sites/kids.md §7). One Player and one <audio> element for the whole
 * visit, living inside #kp (transition:persist), so navigation never interrupts playback. The audio
 * element only ever talks to the media host through its own range requests: no fetch, no Web Audio.
 */
import { Player, type PlayerState, type Track } from "@goldstein/player";
import type { KidChapter } from "../lib/chapters.ts";
import { clock } from "../lib/kinds.ts";
import { groupInfo } from "../lib/queue.ts";
import { cardHtml, coverPath, escapeHtml } from "../lib/records.ts";
import type { PlayRequest } from "../lib/tracks.ts";
import { type ItemExtra, loadExtra, loadIndex, recIn } from "./data.ts";
import * as S from "./state.ts";

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) =>
  root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => [
  ...root.querySelectorAll<T>(sel),
];

const MAX_QUEUE = 50;

export class KidsPlayer {
  readonly audio: HTMLAudioElement;
  readonly player: Player;
  private readonly root: HTMLElement;
  private readonly sheet: HTMLDialogElement;
  private source = "";
  private extra: ItemExtra | null = null;
  private extraFor = "";
  private last: PlayerState | null = null;
  private lastSavedAt = 0;
  private lastKey = "";
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private artworkFor = "";
  private seeking = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.audio = document.createElement("audio");
    this.audio.preload = "metadata";
    this.audio.setAttribute("aria-hidden", "true");
    root.append(this.audio);
    this.player = new Player({
      audio: this.audio,
      store: S.store,
      finishedWithinSec: 20,
      resumeBackSec: 3,
    });
    const sheet = $<HTMLDialogElement>(root, "[data-player-sheet]");
    if (!sheet) throw new Error("player sheet missing");
    this.sheet = sheet;
    this.applySpeed(S.getSpeed());
    this.bind();
    this.player.subscribe((s) => this.render(s));
    this.restore();
    // Save the exact position when the page goes away, so a reload resumes within a few seconds
    // (the periodic save runs only every 5 s).
    const saveNow = () => {
      this.player.savePosition();
      this.persist();
      const st = this.player.state();
      const cur = st.queue[st.index];
      if (cur && st.duration > 0) {
        const g = groupInfo(st.queue, st.index, st.position, st.duration);
        S.saveProgress(cur.id, g.last ? g.pos : Math.min(g.pos, g.dur * 0.9), g.dur);
      }
    };
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNow();
    });
  }

  // ── Public API (used by page scripts through window.kidsPlayer) ─────────
  async play(req: PlayRequest): Promise<void> {
    if (req.tracks.length === 0) return;
    this.hideError();
    const state = this.player.state();
    let queue: Track[];
    let index: number;
    if (req.mode === "single" && state.index >= 0) {
      const rest = state.queue.slice(state.index + 1);
      queue = [...req.tracks, ...rest].slice(0, MAX_QUEUE);
      index = req.index ?? 0;
      if (req.source) this.source = req.source;
    } else {
      queue = req.tracks.slice(0, MAX_QUEUE);
      index = req.index ?? 0;
      this.source = req.source ?? "";
    }
    this.player.stopAfterCurrent(false);
    await this.player.load(queue, index, true);
    if (req.at !== undefined) {
      const t = this.player.current;
      if (t) this.player.seek(req.at - (t.start_sec ?? 0));
      void this.player.play();
    }
    this.persist();
  }

  /** "Play next": after the current item (or start playing when idle). */
  async playNext(track: Track): Promise<void> {
    const s = this.player.state();
    if (s.index < 0) {
      await this.play({ tracks: [track], mode: "replace" });
      return;
    }
    const q = [...s.queue];
    q.splice(s.index + 1, 0, track);
    await this.player.setQueue(q.slice(0, MAX_QUEUE), s.index);
    this.persist();
    this.toast("Added: plays next");
  }

  /** Seek within the current item when it is `id`, else start `id` there. */
  async seekOrPlay(id: string, at: number, fallback: PlayRequest): Promise<void> {
    const t = this.player.current;
    if (
      t &&
      t.id === id &&
      at >= (t.start_sec ?? 0) &&
      (t.end_sec === undefined || at < t.end_sec)
    ) {
      this.player.seek(at - (t.start_sec ?? 0));
      await this.player.play();
      return;
    }
    await this.play({ ...fallback, at });
  }

  currentId(): string | null {
    return this.player.current?.id ?? null;
  }

  openSheet(): void {
    if (!this.sheet.open) this.sheet.showModal();
    this.renderQueue(this.player.state());
  }

  toast(msg: string): void {
    const el = $(this.root, "[data-toast]");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ── Wiring ──────────────────────────────────────────────────────────────
  private bind(): void {
    const r = this.root;
    const click = (sel: string, fn: (el: HTMLElement) => void) =>
      $$(r, sel).forEach((el) => el.addEventListener("click", () => fn(el)));
    click("[data-p-toggle]", () => void this.player.toggle());
    click("[data-p-back]", () => this.player.seek(this.player.state().position - 15));
    click("[data-p-fwd]", () => this.player.seek(this.player.state().position + 30));
    click("[data-p-prev-ch]", () => this.chapterJump(-1));
    click("[data-p-next-ch]", () => this.chapterJump(1));
    click("[data-open-player]", () => this.openSheet());
    click("[data-close-player]", () => this.sheet.close());
    click("[data-p-retry]", () => this.retry());
    click("[data-p-clear-queue]", () => void this.clearUpNext());
    click("[data-p-heart]", () => {
      const id = this.currentId();
      if (!id) return;
      const on = S.toggleFav(id);
      this.toast(on ? "Added to My Shelf" : "Taken off My Shelf");
    });
    click("[data-p-speed]", () => {
      const speeds = S.SPEEDS as readonly number[];
      const next = speeds[(speeds.indexOf(S.getSpeed()) + 1) % speeds.length] ?? 1;
      S.setSpeed(next);
      this.applySpeed(next);
    });
    click("[data-p-sleep]", (el) => {
      const menu = $(r, "[data-p-sleep-menu]");
      if (!menu) return;
      menu.hidden = !menu.hidden;
      el.setAttribute("aria-expanded", String(!menu.hidden));
    });
    $$(r, "[data-sleep]").forEach((el) =>
      el.addEventListener("click", () => {
        const v = el.dataset["sleep"];
        if (v === "end") {
          this.player.stopAfterCurrent(true);
          this.toast("I'll stop at the end of this story");
        } else if (v === "off") {
          this.player.sleepIn(null);
          this.player.stopAfterCurrent(false);
          this.toast("Sleep timer off");
        } else {
          this.player.stopAfterCurrent(false);
          this.player.sleepIn(Number(v));
          this.toast(`Sleep in ${v} minutes`);
        }
        const menu = $(r, "[data-p-sleep-menu]");
        if (menu) menu.hidden = true;
      }),
    );
    const seek = $<HTMLInputElement>(r, "[data-p-seek]");
    seek?.addEventListener("input", () => {
      this.seeking = true;
      const s = this.player.state();
      const pos = (Number(seek.value) / 1000) * s.duration;
      seek.style.setProperty("--pct", `${Number(seek.value) / 10}%`);
      const p = $(r, "[data-p-pos]");
      if (p) p.textContent = clock(pos);
    });
    seek?.addEventListener("change", () => {
      const s = this.player.state();
      this.player.seek((Number(seek.value) / 1000) * s.duration);
      this.seeking = false;
    });
    this.sheet.addEventListener("click", (e) => {
      if (e.target === this.sheet) this.sheet.close();
    });

    this.audio.addEventListener("error", () => this.onError());
    this.audio.addEventListener("playing", () => this.hideError());
    this.audio.addEventListener("timeupdate", () => this.skipSilence());
    S.on("favs", () => this.renderHeart());

    // Queue list: play, remove, drag to reorder (pointer) or arrow keys on the handle.
    const list = $(r, "[data-p-queue]");
    list?.addEventListener("click", (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const li = t?.closest<HTMLLIElement>("li[data-i]");
      if (!li) return;
      const i = Number(li.dataset["i"]);
      if (t?.closest("[data-q-remove]")) void this.removeAt(i);
      else if (t?.closest("[data-q-play]")) void this.player.goTo(i);
    });
    list?.addEventListener("keydown", (e) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (!t?.matches("[data-q-handle]") || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const i = Number(t.closest<HTMLElement>("li")?.dataset["i"]);
      void this.move(i, i + (e.key === "ArrowUp" ? -1 : 1), true);
    });
    list?.addEventListener("pointerdown", (e) => this.dragStart(e));
  }

  private applySpeed(s: number): void {
    this.audio.defaultPlaybackRate = s;
    this.audio.playbackRate = s;
    const label = $(this.root, "[data-p-speed-label]");
    if (label) label.textContent = `${s}×`;
    $(this.root, "[data-p-speed]")?.setAttribute("aria-label", `Speed: ${s} times. Change speed`);
  }

  private restore(): void {
    const q = S.getSavedQueue();
    if (!q) return;
    this.source = q.source;
    void this.player.load(q.tracks, Math.min(Math.max(0, q.index), q.tracks.length - 1), false);
  }

  private persist(): void {
    const s = this.player.state();
    S.saveQueue(s.index < 0 ? null : { tracks: [...s.queue], index: s.index, source: this.source });
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  private render(s: PlayerState): void {
    const t = s.queue[s.index];
    const has = Boolean(t);
    document.documentElement.classList.toggle("has-player", has);
    const mini = $(this.root, "[data-mini]");
    if (mini) mini.hidden = !has;
    this.root.classList.toggle("is-playing", s.playing);
    $$(this.root, "[data-p-toggle]").forEach((b) =>
      b.setAttribute("aria-label", s.playing ? "Pause" : "Play"),
    );
    const prev = this.last;
    this.last = s;
    if (!t) return;

    const key = `${s.index}|${t.id}@${t.start_sec ?? 0}`;
    if (key !== this.lastKey) {
      if (prev && prev.queue[prev.index]) this.maybeFinish(prev);
      this.lastKey = key;
      this.onTrackChange(t, s);
      this.persist();
    }

    const pct = s.duration > 0 ? Math.min(1, s.position / s.duration) : 0;
    const bar = $(this.root, "[data-p-mini-bar]");
    if (bar) bar.style.width = `${pct * 100}%`;
    if (!this.seeking) {
      const seek = $<HTMLInputElement>(this.root, "[data-p-seek]");
      if (seek) {
        seek.value = String(Math.round(pct * 1000));
        seek.max = "1000";
        seek.style.setProperty("--pct", `${pct * 100}%`);
        seek.setAttribute("aria-valuetext", `${clock(s.position)} of ${clock(s.duration)}`);
      }
      const pos = $(this.root, "[data-p-pos]");
      if (pos) pos.textContent = clock(s.position);
    }
    const dur = $(this.root, "[data-p-dur]");
    if (dur) dur.textContent = clock(s.duration);
    this.renderChapterLabel(t, s);
    this.renderSleep(s);

    // Progress: every 5 s of play and on pause.
    const now = Date.now();
    if (
      s.duration > 0 &&
      (now - this.lastSavedAt > 5000 || (prev?.playing === true && !s.playing))
    ) {
      this.lastSavedAt = now;
      const g = groupInfo(s.queue, s.index, s.position, s.duration);
      // A chapter split into ranges is done only after its last range.
      S.saveProgress(t.id, g.last ? g.pos : Math.min(g.pos, g.dur * 0.9), g.dur, now);
    }
    if ("mediaSession" in navigator && s.duration > 0 && Number.isFinite(s.position)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: s.duration,
          position: Math.min(s.position, s.duration),
          playbackRate: this.audio.playbackRate || 1,
        });
      } catch {
        /* unsupported */
      }
    }
    // End of the line: nothing more queued and we stopped at the end.
    const atEnd =
      !s.playing &&
      s.duration > 0 &&
      s.duration - s.position < 1.5 &&
      s.index === s.queue.length - 1;
    void this.renderEnd(atEnd, t.id);
  }

  private maybeFinish(prev: PlayerState): void {
    const t = prev.queue[prev.index];
    if (!t) return;
    const g = groupInfo(prev.queue, prev.index, prev.position, prev.duration);
    if (g.last && S.isDone(g.pos, g.dur)) S.markDone(t.id, g.dur);
  }

  private onTrackChange(t: Track, s: PlayerState): void {
    for (const el of $$<HTMLImageElement>(this.root, "img[data-p-cover]")) el.src = coverPath(t.id);
    for (const el of $$(this.root, "[data-p-title]")) el.textContent = t.title;
    const g = groupInfo(s.queue, s.index, s.position, s.duration);
    const sub = [t.artist, g.of > 1 ? `${g.n} of ${g.of}` : ""].filter(Boolean).join(" · ");
    for (const el of $$(this.root, "[data-p-sub]")) el.textContent = sub;
    const src = $(this.root, "[data-p-source]");
    if (src) src.textContent = this.source;
    this.renderHeart();
    this.renderQueue(s);
    this.extra = null;
    this.extraFor = t.id;
    void loadExtra(t.id).then((x) => {
      if (this.extraFor !== t.id) return;
      this.extra = x;
      this.renderTicks(t);
    });
    this.renderTicks(t);
    void this.setArtwork(t);
  }

  private renderHeart(): void {
    const id = this.currentId();
    const b = $(this.root, "[data-p-heart]");
    if (b && id) b.setAttribute("aria-pressed", String(S.isFav(id)));
  }

  private renderSleep(s: PlayerState): void {
    const label = $(this.root, "[data-p-sleep-label]");
    const btn = $(this.root, "[data-p-sleep]");
    let text = "Sleep";
    if (s.stopAtEnd) text = "Stops at the end";
    else if (s.sleepAt)
      text = `Sleep in ${Math.max(1, Math.ceil((s.sleepAt - Date.now()) / 60_000))} min`;
    if (label && label.textContent !== text) label.textContent = text;
    btn?.classList.toggle("on", s.stopAtEnd || s.sleepAt !== null);
  }

  /** Chapter ticks at segment starts inside the played range; story starts are highlighted. */
  private renderTicks(t: Track): void {
    const box = $(this.root, "[data-p-ticks]");
    if (!box) return;
    box.innerHTML = "";
    const chapters = this.extra?.c ?? [];
    const start = t.start_sec ?? 0;
    const end = t.end_sec ?? (Number.isFinite(this.audio.duration) ? this.audio.duration : 0);
    if (!(end > start)) return;
    for (const c of chapters) {
      if (c.s <= start + 1 || c.s >= end) continue;
      const i = document.createElement("i");
      i.style.left = `${((c.s - start) / (end - start)) * 100}%`;
      if (c.style === "story") i.className = "story";
      box.append(i);
    }
    const prevBtn = $<HTMLButtonElement>(this.root, "[data-p-prev-ch]");
    const nextBtn = $<HTMLButtonElement>(this.root, "[data-p-next-ch]");
    const inRange = this.chaptersInRange(t).length;
    if (prevBtn) prevBtn.disabled = inRange < 2 && this.player.state().index <= 0;
    if (nextBtn)
      nextBtn.disabled =
        inRange < 2 && this.player.state().index >= this.player.state().queue.length - 1;
  }

  private chaptersInRange(t: Track): KidChapter[] {
    const start = t.start_sec ?? 0;
    const end = t.end_sec ?? Infinity;
    return (this.extra?.c ?? []).filter((c) => c.s >= start - 1 && c.s < end);
  }

  private renderChapterLabel(t: Track, s: PlayerState): void {
    const el = $(this.root, "[data-p-chapter]");
    if (!el) return;
    const abs = (t.start_sec ?? 0) + s.position;
    const cur = [...this.chaptersInRange(t)].reverse().find((c) => c.s <= abs + 0.5);
    const text = cur ? cur.label : "";
    if (el.textContent !== text) el.textContent = text;
  }

  private chapterJump(dir: 1 | -1): void {
    const t = this.player.current;
    if (!t) return;
    const s = this.player.state();
    const abs = (t.start_sec ?? 0) + s.position;
    const list = this.chaptersInRange(t);
    if (dir === 1) {
      const next = list.find((c) => c.s > abs + 1);
      if (next) this.player.seek(next.s - (t.start_sec ?? 0));
      else void this.player.next();
    } else {
      const before = list.filter((c) => c.s < abs - 3);
      const prev = before[before.length - 1];
      if (prev) this.player.seek(prev.s - (t.start_sec ?? 0));
      else if (s.position > 3 || s.index === 0) this.player.seek(0);
      else void this.player.previous();
    }
  }

  private skipSilence(): void {
    const z = this.extra?.z;
    const t = this.player.current;
    if (!z || !t || this.extraFor !== t.id) return;
    const now = this.audio.currentTime;
    for (const [a, b] of z) if (now >= a && now < b - 0.5) this.audio.currentTime = b;
  }

  private renderQueue(s: PlayerState): void {
    const list = $(this.root, "[data-p-queue]");
    const empty = $(this.root, "[data-p-queue-empty]");
    if (!list) return;
    list.innerHTML = s.queue
      .map(
        (t, i) =>
          `<li data-i="${i}" class="${i === s.index ? "now" : ""}">` +
          `<button type="button" class="icon-btn q-handle" data-q-handle aria-label="Move ${escapeHtml(t.title)} (use arrow keys)">${gripSvg}</button>` +
          `<button type="button" class="q-play" data-q-play><img src="${coverPath(t.id)}" alt="" width="48" height="48" loading="lazy"><span class="q-text"><span class="q-t">${escapeHtml(t.title)}</span><span class="q-s">${i === s.index ? "Playing now" : i < s.index ? "Played" : `Up next · ${i - s.index}`}</span></span></button>` +
          `<button type="button" class="icon-btn q-remove" data-q-remove aria-label="Remove ${escapeHtml(t.title)}">${closeSvg}</button></li>`,
      )
      .join("");
    if (empty) empty.hidden = s.queue.length > s.index + 1;
  }

  private async removeAt(i: number): Promise<void> {
    const s = this.player.state();
    const q = [...s.queue];
    if (!q[i]) return;
    q.splice(i, 1);
    if (q.length === 0) {
      this.player.pause();
      await this.player.load([], 0, false);
      S.saveQueue(null);
      this.lastKey = "";
      this.render(this.player.state());
      this.sheet.close();
      return;
    }
    if (i === s.index) await this.player.load(q, Math.min(i, q.length - 1), s.playing);
    else await this.player.setQueue(q, i < s.index ? s.index - 1 : s.index);
    this.persist();
    this.renderQueue(this.player.state());
  }

  private async clearUpNext(): Promise<void> {
    const s = this.player.state();
    const cur = s.queue[s.index];
    if (!cur) return;
    await this.player.setQueue([cur], 0);
    this.persist();
    this.renderQueue(this.player.state());
  }

  private async move(from: number, to: number, focus = false): Promise<void> {
    const s = this.player.state();
    if (to < 0 || to >= s.queue.length || from === to) return;
    const q = [...s.queue];
    const [t] = q.splice(from, 1);
    if (!t) return;
    q.splice(to, 0, t);
    let idx = s.index;
    if (from === s.index) idx = to;
    else if (from < s.index && to >= s.index) idx--;
    else if (from > s.index && to <= s.index) idx++;
    await this.player.setQueue(q, idx);
    this.persist();
    this.renderQueue(this.player.state());
    if (focus) $<HTMLButtonElement>(this.root, `li[data-i="${to}"] [data-q-handle]`)?.focus();
  }

  private dragStart(e: PointerEvent): void {
    const handle =
      e.target instanceof Element ? e.target.closest<HTMLElement>("[data-q-handle]") : null;
    const li = handle?.closest<HTMLLIElement>("li[data-i]");
    const list = li?.parentElement;
    if (!handle || !li || !list) return;
    e.preventDefault();
    const from = Number(li.dataset["i"]);
    let to = from;
    li.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const items = [...list.children] as HTMLElement[];
      to = items.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (to < 0) to = items.length - 1;
      else if (to > from) to -= 1;
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      li.classList.remove("dragging");
      void this.move(from, to);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  private async renderEnd(atEnd: boolean, id: string): Promise<void> {
    const box = $(this.root, "[data-p-end]");
    const cards = $(this.root, "[data-p-end-cards]");
    if (!box || !cards) return;
    if (!atEnd) {
      if (!box.hidden) box.hidden = true;
      return;
    }
    if (!box.hidden && box.dataset["for"] === id) return;
    box.dataset["for"] = id;
    const [ix, extra] = await Promise.all([loadIndex(), loadExtra(id)]);
    const v = S.getVariant();
    const next = extra?.n ? ix.byId.get(extra.n) : undefined;
    const recs = next
      ? [next]
      : (extra?.r ?? [])
          .map((x) => ix.byId.get(x))
          .filter(
            (r): r is NonNullable<typeof r> => Boolean(r) && recIn(r as NonNullable<typeof r>, v),
          )
          .slice(0, 3);
    if (recs.length === 0) return;
    const h = box.querySelector("h3");
    if (h) h.textContent = next ? "Next chapter" : "More like this";
    cards.innerHTML = recs
      .map((r) => cardHtml(r, { kicker: next ? `Chapter ${r.ch ?? ""}`.trim() : "" }))
      .join("");
    box.hidden = false;
  }

  private onError(): void {
    if (!this.audio.getAttribute("src")) return;
    const box = $(this.root, "[data-p-error]");
    if (box) box.hidden = false;
    this.toast("This one isn't working right now.");
    const s = this.player.state();
    if (this.errorTimer) clearTimeout(this.errorTimer);
    if (s.index < s.queue.length - 1) {
      this.errorTimer = setTimeout(() => {
        if (box && !box.hidden) void this.player.next();
      }, 8000);
    }
  }

  private hideError(): void {
    const box = $(this.root, "[data-p-error]");
    if (box) box.hidden = true;
    if (this.errorTimer) clearTimeout(this.errorTimer);
  }

  private retry(): void {
    this.hideError();
    const s = this.player.state();
    const pos = s.position;
    this.audio.load();
    this.player.seek(pos);
    void this.player.play();
  }

  /** Media Session artwork: the generated cover rasterised to a 512×512 PNG (same-origin SVG). */
  private async setArtwork(t: Track): Promise<void> {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    if (this.artworkFor === `${t.id}@${t.start_sec ?? 0}`) return;
    this.artworkFor = `${t.id}@${t.start_sec ?? 0}`;
    const meta = () =>
      new MediaMetadata({
        title: t.title,
        artist: t.artist ?? "",
        album: this.source || "Story Shelf",
        artwork: [],
      });
    try {
      const png = await rasterise(coverPath(t.id), 512);
      if (this.player.current?.id !== t.id) return;
      const m = meta();
      m.artwork = [{ src: png, sizes: "512x512", type: "image/png" }];
      navigator.mediaSession.metadata = m;
    } catch {
      navigator.mediaSession.metadata = meta();
    }
  }
}

const gripSvg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"/></svg>`;
const closeSvg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

const pngCache = new Map<string, string>();
async function rasterise(src: string, size: number): Promise<string> {
  const hit = pngCache.get(src);
  if (hit) return hit;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (!blob) throw new Error("no blob");
  const url = URL.createObjectURL(blob);
  pngCache.set(src, url);
  return url;
}

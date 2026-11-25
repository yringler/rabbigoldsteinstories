/**
 * Recording page behaviour: ?t= deep links (no autoplay), seek links, transcript sync with word
 * highlighting and follow mode, find in transcript, select-to-cite, the cite and print dialogs.
 */
import type { Track } from "@goldstein/player";
import { cite, type CiteInput } from "../lib/citation.ts";
import { formatDuration, parseTime } from "../lib/time.ts";
import { lastAtOrBefore, timeWords } from "../lib/words.ts";
import { $, $$, absoluteTime, audio, copyText, currentId, h, player, tracksFrom } from "./core.ts";

let cleanup: (() => void)[] = [];

export function init(): void {
  for (const f of cleanup) f();
  cleanup = [];
  const page = $("[data-rec-page]");
  if (!page) return;
  const id = page.dataset["id"] ?? "";
  const mainBtn = $<HTMLButtonElement>("[data-main-play]", page);
  const base = mainBtn ? tracksFrom(mainBtn)[0] : undefined;
  if (!base) return;
  const params = new URLSearchParams(location.search);
  const t0 = parseTime(params.get("t"));
  const end = parseTime(params.get("end"));
  const q = params.get("q");
  const track: Track = { ...base };
  if (end !== null && t0 !== null && end > t0) track.end_sec = end;
  if (mainBtn) {
    mainBtn.dataset["track"] = JSON.stringify(track);
    if (t0 !== null) {
      mainBtn.dataset["at"] = String(t0);
      const label = $("[data-play-label]", mainBtn);
      if (label) label.textContent = `Play from ${formatDuration(t0)}`;
    }
  }
  const isThis = () =>
    currentId() === id && (player().current?.start_sec ?? 0) <= (absoluteTime() ?? 0);

  // Prime the player at ?t= without autoplay, unless something else is playing.
  if (t0 !== null && (!player().current || (!player().state().playing && currentId() !== id))) {
    void player()
      .load([track], 0, false)
      .then(() => player().seek(t0 - (track.start_sec ?? 0)));
  }

  const seekTo = (t: number) => {
    const s = player().state();
    const cur = player().current;
    if (cur?.id === id && t >= (cur.start_sec ?? 0) && t <= (cur.end_sec ?? Infinity)) {
      player().seek(t - (cur.start_sec ?? 0));
      if (!s.playing) void player().play();
    } else {
      void player()
        .load([{ ...base }], 0, false)
        .then(() => {
          player().seek(t - (base.start_sec ?? 0));
          return player().play();
        });
    }
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const seek = target?.closest<HTMLElement>("[data-seek]");
    if (seek && page.contains(seek)) {
      e.preventDefault();
      seekTo(Number(seek.dataset["seek"]));
      return;
    }
    const w = target?.closest<HTMLElement>(".w");
    const line = target?.closest<HTMLElement>(".t-line");
    if (line && !window.getSelection()?.toString()) {
      seekTo(Number(w?.dataset["t"] ?? line.dataset["s"]));
    }
  };
  page.addEventListener("click", onClick);
  cleanup.push(() => page.removeEventListener("click", onClick));
  const onKeyLine = (e: KeyboardEvent) => {
    const line = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(".t-line") : null;
    if (line && e.key === "Enter") {
      e.preventDefault();
      seekTo(Number(line.dataset["s"]));
    }
  };
  page.addEventListener("keydown", onKeyLine);
  cleanup.push(() => page.removeEventListener("keydown", onKeyLine));

  setupTranscript(page, id, isThis, t0, q);
  setupCite(page, id, t0);
  setupPrint(page);
  setupChapters(page, id);

  const onKey = (ev: Event) => {
    const e = (ev as CustomEvent<KeyboardEvent>).detail;
    if (e.key === "t") {
      const cur = $<HTMLElement>(".t-line.current", page) ?? $<HTMLElement>(".t-line", page);
      if (cur) {
        cur.scrollIntoView({ block: "center" });
        cur.focus({ preventScroll: true });
        e.preventDefault();
      }
    } else if (e.key === "a") {
      $<HTMLButtonElement>('[data-action="add"]', page)?.click();
      e.preventDefault();
    }
  };
  document.addEventListener("gsl:key", onKey);
  cleanup.push(() => document.removeEventListener("gsl:key", onKey));

  // Copy link at current time
  const copyBtn = $<HTMLButtonElement>("[data-copy-link]", page);
  const copyLabel = $("[data-copy-label]", page);
  const linkTime = () => {
    if (currentId() === id) {
      const t = absoluteTime() ?? 0;
      return t >= 1 ? t : null;
    }
    return t0;
  };
  copyBtn?.addEventListener("click", () => {
    const t = linkTime();
    void copyText(
      `${location.origin}/r/${id}/${t !== null ? `?t=${Math.floor(t)}` : ""}`,
      "Link copied",
    );
  });
  const unsub = player().subscribe(() => {
    const t = linkTime();
    if (copyLabel)
      copyLabel.textContent = t !== null ? `Copy link at ${formatDuration(t)}` : "Copy link";
  });
  cleanup.push(unsub);
}

// ---------------------------------------------------------------------------------------------
// Transcript

function setupTranscript(
  page: HTMLElement,
  id: string,
  isThis: () => boolean,
  t0: number | null,
  q: string | null,
): void {
  const body = $("[data-t-body]", page);
  if (!body) return;
  const lines = $$<HTMLElement>(".t-line", body);
  const starts = lines.map((l) => Number(l.dataset["s"]));
  // Wrap words (interpolated timings; see lib/words.ts).
  for (const l of lines) {
    const tx = $(".tx", l);
    if (!tx || tx.dataset["w"]) continue;
    const words = timeWords(tx.textContent ?? "", Number(l.dataset["s"]), Number(l.dataset["e"]));
    tx.replaceChildren(
      ...words.flatMap((w) =>
        [
          w.space ? document.createTextNode(w.space) : null,
          h("span", { class: "w", "data-t": w.t }, w.text),
        ].filter((n): n is Text | HTMLSpanElement => n !== null),
      ),
    );
    tx.dataset["w"] = "1";
  }
  const follow = $<HTMLInputElement>("[data-follow]", page);
  const resume = $<HTMLButtonElement>("[data-resume-follow]", page);
  let current: HTMLElement | null = null;
  let currentWord: HTMLElement | null = null;
  let programmatic = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = (t: number, scroll: boolean) => {
    const i = lastAtOrBefore(starts, t + 0.05);
    const line = i >= 0 ? (lines[i] ?? null) : null;
    const inLine = line && t <= Number(line.dataset["e"]) + 1.5 ? line : null;
    if (inLine !== current) {
      current?.classList.remove("current");
      inLine?.classList.add("current");
      current = inLine;
      if (inLine && scroll) {
        programmatic = performance.now();
        inLine.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      }
    }
    let w: HTMLElement | null = null;
    if (inLine) {
      const ws = $$<HTMLElement>(".w", inLine);
      const wi = lastAtOrBefore(
        ws.map((x) => Number(x.dataset["t"])),
        t,
      );
      w = wi >= 0 ? (ws[wi] ?? null) : null;
    }
    if (w !== currentWord) {
      currentWord?.classList.remove("on");
      w?.classList.add("on");
      currentWord = w;
    }
  };

  let raf = 0;
  const tick = () => {
    raf = 0;
    if (!isThis()) {
      current?.classList.remove("current");
      currentWord?.classList.remove("on");
      current = currentWord = null;
      return;
    }
    show(audio().currentTime, follow?.checked === true);
    if (!audio().paused) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const a = audio();
  a.addEventListener("play", kick);
  a.addEventListener("seeked", kick);
  a.addEventListener("timeupdate", kick);
  cleanup.push(() => {
    a.removeEventListener("play", kick);
    a.removeEventListener("seeked", kick);
    a.removeEventListener("timeupdate", kick);
    if (raf) cancelAnimationFrame(raf);
  });
  if (isThis()) kick();
  else if (t0 !== null) {
    show(t0, false);
    const target = current as HTMLElement | null;
    target?.scrollIntoView({ block: "center" });
  }

  // Manual scrolling pauses following.
  const onScroll = () => {
    if (!follow?.checked || performance.now() - programmatic < 900 || !isThis() || audio().paused)
      return;
    follow.checked = false;
    if (resume) resume.hidden = false;
  };
  window.addEventListener("wheel", onScroll, { passive: true });
  window.addEventListener("touchmove", onScroll, { passive: true });
  cleanup.push(() => {
    window.removeEventListener("wheel", onScroll);
    window.removeEventListener("touchmove", onScroll);
  });
  resume?.addEventListener("click", () => {
    if (follow) follow.checked = true;
    resume.hidden = true;
    programmatic = performance.now();
    current?.scrollIntoView({ block: "center" });
  });
  follow?.addEventListener("change", () => {
    if (resume) resume.hidden = follow.checked;
  });

  setupFind(page, lines, q);
  setupQuote(page, id);
}

function setupFind(page: HTMLElement, lines: HTMLElement[], q: string | null): void {
  const input = $<HTMLInputElement>("[data-t-find]", page);
  const count = $("[data-t-count]", page);
  if (!input) return;
  let hits: HTMLElement[] = [];
  let at = -1;
  const clear = () => {
    for (const m of $$<HTMLElement>(".w.find", page)) m.classList.remove("find", "active");
    hits = [];
    at = -1;
  };
  const run = () => {
    clear();
    const needle = input.value.trim().replace(/^"|"$/g, "").toLowerCase();
    if (needle.length < 2) {
      if (count) count.textContent = "";
      return;
    }
    for (const l of lines) {
      const ws = $$<HTMLElement>(".w", l);
      const text = ws
        .map((w) => w.textContent ?? "")
        .join(" ")
        .toLowerCase();
      let from = text.indexOf(needle);
      while (from >= 0) {
        // map char range → words
        let pos = 0;
        let first: HTMLElement | null = null;
        for (const w of ws) {
          const len = (w.textContent ?? "").length;
          if (pos + len > from && pos < from + needle.length) {
            w.classList.add("find");
            first ??= w;
          }
          pos += len + 1;
        }
        if (first) hits.push(first);
        from = text.indexOf(needle, from + needle.length);
      }
    }
    if (count) count.textContent = hits.length ? `${hits.length} found` : "No matches";
    if (hits.length) go(0);
  };
  const go = (i: number) => {
    if (!hits.length) return;
    hits[at]?.classList.remove("active");
    at = (i + hits.length) % hits.length;
    const el = hits[at];
    el?.classList.add("active");
    el?.scrollIntoView({ block: "center" });
    if (count) count.textContent = `${at + 1} of ${hits.length}`;
  };
  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 150);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(e.shiftKey ? at - 1 : at + 1);
    }
  });
  $("[data-t-next]", page)?.addEventListener("click", () => go(at + 1));
  $("[data-t-prev]", page)?.addEventListener("click", () => go(at - 1));
  if (q) {
    input.value = q.replace(/"/g, "");
    run();
  }
}

function citeInput(): CiteInput | null {
  try {
    return JSON.parse($("#cite-input")?.textContent ?? "null") as CiteInput | null;
  } catch {
    return null;
  }
}

function setupQuote(page: HTMLElement, id: string): void {
  const btn = $<HTMLButtonElement>("[data-copy-quote]", page);
  const body = $("[data-t-body]", page);
  const inp = citeInput();
  if (!btn || !body || !inp) return;
  let quote = "";
  let qt = 0;
  const onUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!sel || !text || !sel.rangeCount || !body.contains(sel.anchorNode)) {
      btn.hidden = true;
      return;
    }
    const startEl =
      sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    const w =
      startEl?.closest<HTMLElement>(".w") ??
      startEl?.closest<HTMLElement>(".t-line")?.querySelector<HTMLElement>(".w");
    qt = Number(w?.dataset["t"] ?? 0);
    quote = text.replace(/\s+/g, " ");
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const box = page.getBoundingClientRect();
    btn.style.top = `${rect.bottom - box.top + 6}px`;
    btn.style.left = `${Math.max(0, rect.left - box.left)}px`;
    btn.hidden = false;
  };
  document.addEventListener("mouseup", onUp);
  document.addEventListener("keyup", onUp);
  cleanup.push(() => {
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("keyup", onUp);
  });
  page.style.position = "relative";
  btn.addEventListener("click", () => {
    const c = cite(inp, qt);
    void copyText(`“${quote}” — ${c.short}. ${c.link}`, "Quote copied with citation");
    btn.hidden = true;
    void id;
  });
}

// ---------------------------------------------------------------------------------------------
// Cite dialog

function setupCite(page: HTMLElement, id: string, t0: number | null): void {
  const dlg = $<HTMLDialogElement>("#cite-dialog", page);
  const inp = citeInput();
  if (!dlg || !inp) return;
  const timeBox = $<HTMLInputElement>("[data-cite-time]", dlg);
  const timeLabel = $("[data-cite-time-label]", dlg);
  let t: number | null = null;
  const render = () => {
    const c = cite(inp, timeBox?.checked && t !== null ? t : null);
    for (const k of ["short", "full", "link"] as const) {
      const o = $(`[data-cite=${k}]`, dlg);
      if (o) o.textContent = c[k];
    }
  };
  $("[data-cite-open]", page)?.addEventListener("click", () => {
    const playing = currentId() === id ? absoluteTime() : null;
    t = playing !== null && playing > 5 ? playing : t0;
    if (timeBox) {
      timeBox.disabled = t === null;
      timeBox.checked = t !== null;
    }
    if (timeLabel)
      timeLabel.textContent =
        t !== null ? `(${formatDuration(t)})` : "(start the player or open a ?t= link)";
    render();
    dlg.showModal();
  });
  timeBox?.addEventListener("change", render);
  if (location.hash === "#cite") $<HTMLButtonElement>("[data-cite-open]", page)?.click();
  for (const b of $$<HTMLButtonElement>("[data-copy-cite]", dlg)) {
    b.addEventListener("click", () => {
      const k = b.dataset["copyCite"] ?? "short";
      void copyText($(`[data-cite=${k}]`, dlg)?.textContent ?? "", "Citation copied");
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Print card (also ?print=card)

function setupPrint(page: HTMLElement): void {
  const dlg = $<HTMLDialogElement>("#print-dialog", page);
  const chapters = $("[data-pc-chapters]", page);
  const html = document.documentElement;
  const go = () => {
    if (chapters) chapters.hidden = !$<HTMLInputElement>("[data-print-chapters]", page)?.checked;
    html.classList.add("print-card-mode");
    dlg?.close();
    window.setTimeout(() => window.print(), 50);
  };
  const after = () => html.classList.remove("print-card-mode");
  window.addEventListener("afterprint", after);
  cleanup.push(() => {
    window.removeEventListener("afterprint", after);
    html.classList.remove("print-card-mode", "card-view");
    $(".card-view-bar")?.remove();
  });
  $("[data-print-card]", page)?.addEventListener("click", () => dlg?.showModal());
  $("[data-print-go]", page)?.addEventListener("click", go);
  if (new URLSearchParams(location.search).get("print") === "card") {
    html.classList.add("card-view");
    const bar = h(
      "div",
      {
        class: "card-view-bar no-print",
        style: "max-width:148mm;margin:24px auto 0;display:flex;gap:8px;padding:0 16px",
      },
      h("a", { class: "btn", href: location.pathname }, "‹ Back to the recording"),
    );
    const p = h("button", { type: "button", class: "btn btn-primary" }, "Print");
    p.addEventListener("click", () => {
      html.classList.add("print-card-mode");
      window.print();
    });
    bar.append(p);
    $(".print-card", page)?.before(bar);
  }
}

// ---------------------------------------------------------------------------------------------
// Chapters: mark the current one

function setupChapters(page: HTMLElement, id: string): void {
  const items = $$<HTMLElement>("[data-ch-start]", page);
  if (!items.length) return;
  const starts = items.map((i) => Number(i.dataset["chStart"]));
  let cur: HTMLElement | null = null;
  const unsub = player().subscribe(() => {
    const t = currentId() === id ? absoluteTime() : null;
    const i = t === null ? -1 : lastAtOrBefore(starts, t + 0.3);
    const el = i >= 0 ? (items[i] ?? null) : null;
    if (el !== cur) {
      cur?.classList.remove("current");
      el?.classList.add("current");
      cur = el;
    }
  });
  cleanup.push(unsub);
}

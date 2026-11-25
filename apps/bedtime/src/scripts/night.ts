/**
 * Night screen and screen wake lock (bedtime.md §1, §2.2):
 *   - after 20 s without input while playing (or after the playlist ended), a near-black screen
 *     with a faint moon and, if a sleep timer runs, a thin arc; no numbers;
 *   - the first tap or key only reveals the controls (never triggers one);
 *   - no wake lock unless "Keep screen on" is ticked; then navigator.wakeLock while playing.
 * Also pauses the star twinkle while the tab is hidden.
 */
import { WAKE_KEY } from "../lib/session.ts";
import type { BedtimePlayer, BedtimeState } from "./bedtime-player.ts";
import type { SheetApi } from "./sheet.ts";
import { store } from "./store.ts";

const IDLE_MS = 20_000;
const ARC = 339.3;

export function mountNight(player: BedtimePlayer, sheet: SheetApi): void {
  const night = document.querySelector<HTMLButtonElement>("[data-night]")!;
  const arc = night.querySelector<SVGCircleElement>("[data-arc]")!;
  let lastInput = Date.now();
  let state: BedtimeState = player.snapshot();
  let swallowUntil = 0;

  const active = () =>
    state.phase === "playing" || state.phase === "loading" || state.phase === "ended";

  function show() {
    if (!night.hidden) return;
    night.hidden = false;
    requestAnimationFrame(() => night.classList.add("on"));
  }
  function hide() {
    night.classList.remove("on");
    night.hidden = true;
  }
  function wakeUp(e: Event) {
    lastInput = Date.now();
    if (night.hidden) return;
    // The first touch only reveals the controls.
    e.preventDefault();
    e.stopPropagation();
    swallowUntil = Date.now() + 450;
    hide();
    if (state.playlist) sheet.open();
  }
  night.addEventListener("pointerdown", wakeUp);
  night.addEventListener("keydown", wakeUp);
  night.addEventListener("click", (e) => {
    e.preventDefault();
    if (!night.hidden) wakeUp(e);
  });
  // Swallow the click that follows the revealing touch, wherever it lands.
  document.addEventListener(
    "click",
    (e) => {
      if (Date.now() < swallowUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"] as const)
    document.addEventListener(ev, (e) => (night.hidden ? (lastInput = Date.now()) : wakeUp(e)), {
      passive: ev === "wheel" || ev === "touchstart",
      capture: true,
    });

  setInterval(() => {
    if (
      active() &&
      night.hidden &&
      Date.now() - lastInput >= IDLE_MS &&
      document.visibilityState === "visible"
    )
      show();
    if (!active() && !night.hidden && state.phase !== "asleep") hide();
    if (!night.hidden) {
      const s = state;
      const frac =
        s.sleepAt !== null && s.sleepTotalMs
          ? Math.max(0, Math.min(1, (s.sleepAt - Date.now()) / s.sleepTotalMs))
          : 0;
      arc.style.strokeDashoffset = String(ARC * (1 - frac));
      arc.style.display = s.sleepAt !== null ? "" : "none";
    }
  }, 1000);

  // ---- wake lock ----
  let lock: WakeLockSentinel | null = null;
  const wanted = () =>
    store.get<boolean>(WAKE_KEY, false) && (state.phase === "playing" || state.phase === "loading");
  async function syncLock() {
    try {
      if (wanted() && !lock && "wakeLock" in navigator && document.visibilityState === "visible") {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => (lock = null));
      } else if (!wanted() && lock) {
        await lock.release();
        lock = null;
      }
    } catch {
      lock = null;
    }
  }
  document.addEventListener("bedtime:wake", () => void syncLock());
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("tab-hidden", document.visibilityState === "hidden");
    if (document.visibilityState === "visible") void syncLock();
  });

  player.onChange((s) => {
    const was = state.phase;
    state = s;
    if (s.phase !== was) {
      if (s.phase === "loading") lastInput = Date.now(); // a new start counts as input
      void syncLock();
    }
  });
}

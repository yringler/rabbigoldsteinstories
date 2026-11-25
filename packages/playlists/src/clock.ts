/**
 * The edition clock (docs/sites/bedtime.md §4.6): one global edition per rotation period, flipping
 * at a fixed local time in a fixed time zone (DST-aware), so every site and visitor agree on
 * "tonight". Pure; works in Node, Workers and browsers (uses Intl only).
 */
export interface ClockConfig {
  /** 24 (one edition per day, recommended) or 12 (a second flip 12 hours after the first). Owner decision pending. */
  rotationHours: 24 | 12;
  /** IANA time zone of the flip. */
  flipTz: string;
  /** Local time of the (first) flip, "HH:MM". */
  flipLocal: string;
}

/** Single place to change the rotation (bedtime.md: 24 h at 09:00 New York recommended; owner to confirm). */
export const CLOCK: ClockConfig = {
  rotationHours: 24,
  flipTz: "America/New_York",
  flipLocal: "09:00",
};

export interface EditionWindow {
  id: string;
  starts_at: string;
  ends_at: string;
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of a local wall-clock time in a time zone. */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz); // second pass settles DST edges
  return t;
}

export function localDate(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMs));
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function flipsOn(date: string, cfg: ClockConfig): { id: string; at: number }[] {
  const first = zonedToUtc(date, cfg.flipLocal, cfg.flipTz);
  if (cfg.rotationHours === 24) return [{ id: date, at: first }];
  const [hh, mm] = cfg.flipLocal.split(":").map(Number) as [number, number];
  const second = `${String((hh + 12) % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const secondDate = hh + 12 >= 24 ? addDays(date, 1) : date;
  return [
    { id: date, at: first },
    { id: `${date}-pm`, at: zonedToUtc(secondDate, second, cfg.flipTz) },
  ];
}

/** Every edition window that starts within [fromDate - 1 day, toDate + 1 day], in order. */
function windowsAround(fromMs: number, toMs: number, cfg: ClockConfig): EditionWindow[] {
  const flips: { id: string; at: number }[] = [];
  let d = addDays(localDate(fromMs, cfg.flipTz), -2);
  const last = addDays(localDate(toMs, cfg.flipTz), 2);
  while (d <= last) {
    flips.push(...flipsOn(d, cfg));
    d = addDays(d, 1);
  }
  flips.sort((a, b) => a.at - b.at);
  return flips.slice(0, -1).map((f, i) => ({
    id: f.id,
    starts_at: new Date(f.at).toISOString(),
    ends_at: new Date(flips[i + 1]!.at).toISOString(),
  }));
}

export function editionAt(now: Date | number, cfg: ClockConfig = CLOCK): EditionWindow {
  const t = typeof now === "number" ? now : now.getTime();
  const w = windowsAround(t, t, cfg).find(
    (x) => Date.parse(x.starts_at) <= t && t < Date.parse(x.ends_at),
  );
  if (!w) throw new Error("no edition window found");
  return w;
}

/** `before` editions before the current one, the current one, and `after` after it, in time order. */
export function editionsAround(
  now: Date | number,
  before: number,
  after: number,
  cfg: ClockConfig = CLOCK,
): EditionWindow[] {
  const t = typeof now === "number" ? now : now.getTime();
  const perDay = 24 / cfg.rotationHours;
  const span = (Math.max(before, after) / perDay + 2) * 86_400_000;
  const all = windowsAround(t - span, t + span, cfg);
  const i = all.findIndex((x) => Date.parse(x.starts_at) <= t && t < Date.parse(x.ends_at));
  return all.slice(Math.max(0, i - before), i + after + 1);
}

export function editionById(id: string, cfg: ClockConfig = CLOCK): EditionWindow | null {
  const date = id.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noon = zonedToUtc(date, "12:00", cfg.flipTz);
  return windowsAround(noon, noon, cfg).find((w) => w.id === id) ?? null;
}

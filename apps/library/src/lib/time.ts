/** Time strings: "12:34" display and the `?t=` deep-link forms (754, 12m34s, 12:34, 1:02:03). */
import { formatDuration } from "@goldstein/data";

export { formatDuration };

/** Parse a `t` value; null when it is not a time. */
export function parseTime(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const colon = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(s);
  if (colon) return Number(colon[1] ?? 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
  return null;
}

/** Human length: "29 min", "1 h 12 min", "45 s". */
export function humanLength(sec: number): string {
  const m = Math.round(sec / 60);
  if (sec < 60) return `${Math.round(sec)} s`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Total length for counts: "5 h 12 m". */
export function totalLength(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} m` : `${m} m`;
}

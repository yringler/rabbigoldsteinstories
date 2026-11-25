/**
 * A queue entry may be one piece of a chapter: a story split by other segments is queued as several
 * ranges of the same recording, labelled with the same `album` ("Chapter 3"). These helpers count
 * chapters rather than tracks and measure progress over the whole chapter. Browser-safe, pure.
 */
import type { Track } from "@goldstein/player";

/** Tracks with the same key, next to each other in the queue, are one chapter. */
export const groupKey = (t: Track): string =>
  t.album ? `${t.id}|${t.album}` : `${t.id}@${t.start_sec ?? 0}`;

export interface GroupInfo {
  /** 1-based chapter (group) number and the number of groups in the queue. */
  n: number;
  of: number;
  /** Seconds heard in the group and its total length. */
  pos: number;
  dur: number;
  /** Is `index` the group's last range? */
  last: boolean;
}

const len = (t: Track, fallback: number) =>
  t.end_sec !== undefined ? Math.max(0, t.end_sec - (t.start_sec ?? 0)) : fallback;

export function groupInfo(
  queue: readonly Track[],
  index: number,
  position: number,
  duration: number,
): GroupInfo {
  let n = 0;
  let of = 0;
  let prevKey = "";
  queue.forEach((t, i) => {
    const k = groupKey(t);
    if (k !== prevKey) {
      of++;
      if (i <= index) n = of;
    }
    prevKey = k;
  });
  const cur = queue[index];
  if (!cur) return { n: 0, of, pos: position, dur: duration, last: true };
  const key = groupKey(cur);
  let start = index;
  while (start > 0 && queue[start - 1] && groupKey(queue[start - 1] as Track) === key) start--;
  let end = index;
  while (queue[end + 1] && groupKey(queue[end + 1] as Track) === key) end++;
  let pos = position;
  let dur = 0;
  for (let i = start; i <= end; i++) {
    const t = queue[i] as Track;
    const l = i === index ? duration : len(t, 0);
    if (i < index) pos += l;
    dur += l;
  }
  return { n, of, pos, dur, last: index === end };
}

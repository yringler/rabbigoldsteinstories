/** Player tracks for the kids site (browser-safe). */
import { cleanUrlOf } from "@goldstein/data";
import type { Track } from "@goldstein/player";
import { type Rec, BYLINE_NAMES, coverPath } from "./records.ts";

export interface ItemLike {
  id: string;
  title: string;
  url: string;
  start: number;
  /** Content end; omitted when the whole file is content. */
  end?: number | undefined;
  byline?: string | null | undefined;
  /** The item has an AI-cleaned copy (docs/design/ai-audio.md); its URL is derived from `url`. */
  clean?: boolean | undefined;
}

export function itemTrack(i: ItemLike, range?: { start_sec: number; end_sec: number }): Track {
  const t: Track = {
    id: i.id,
    title: i.title,
    url: i.url,
    start_sec: range ? range.start_sec : i.start,
    artwork: coverPath(i.id),
  };
  const end = range ? range.end_sec : i.end;
  if (end !== undefined) t.end_sec = end;
  if (i.clean) t.clean_url = cleanUrlOf(i.url);
  if (i.byline) t.artist = i.byline;
  return t;
}

export function recTrack(r: Rec): Track {
  return itemTrack({
    id: r.id,
    title: r.t,
    url: r.u,
    start: r.s ?? 0,
    end: r.e,
    byline: r.b === undefined ? null : BYLINE_NAMES[r.b],
    clean: r.cl === 1,
  });
}

/** What a play button asks for (serialised into data-play). */
export interface PlayRequest {
  tracks: Track[];
  index?: number;
  /** replace: the queue becomes `tracks` (serials, playlists, Play all). single: replace the current item, keep the rest. */
  mode: "replace" | "single";
  /** Shown above the player ("Chapter stories: The Lost Letter"). */
  source?: string;
  /** Start the first track here (seconds from file start), e.g. "Jump to the story" or a clip's place in its episode. */
  at?: number;
}

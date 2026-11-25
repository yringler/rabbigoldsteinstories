/** Shapes of the public indexes (generated/indexes/*.json), as far as the library reads them. */

export interface SerialPart {
  start_sec: number;
  end_sec: number | null;
  title: string;
}
export interface SerialChapterItem {
  id: string;
  title: string;
  date: string | null;
  segment_start_sec: number | null;
  segment_end_sec: number | null;
  parts?: SerialPart[];
  intro_start_sec?: number | null;
}
export interface SerialChapter {
  chapter: number;
  episode: number | null;
  catalog_title?: string | null;
  items: SerialChapterItem[];
  text_matches_in_other_runs?: {
    episode: number;
    item: string;
    chapter: number;
    containment: number;
  }[];
}
export interface SerialRun {
  label: string;
  in_archive: boolean;
  first_episode: number | null;
  last_episode: number | null;
  date_from: string | null;
  date_to: string | null;
  chapters_in_archive: number;
  missing_chapters: number[];
  complete: boolean;
  same_text_as_earlier_run: string[];
  note: string | null;
  chapters: SerialChapter[];
}
export interface Serial {
  story_key: string;
  title: string;
  alt_titles: string[];
  chapters_in_full_telling: number;
  runs_in_archive: number;
  runs: SerialRun[];
  catalog_only_runs?: { label?: string; first_episode?: number; last_episode?: number }[];
}
export interface SerialsFile {
  serials: Serial[];
}

export interface TellingItem {
  id: string;
  title: string;
  segment_title: string | null;
  segment: [number, number | null] | null;
  language: string;
  content_type: string;
  collection: string | null;
  episode: number | null;
  date: string | null;
}
export interface StoryGroup {
  group_id: string;
  title: string;
  languages: string[];
  tellers: string[];
  item_ids: string[];
  tellings: { items: TellingItem[]; languages: string[]; tellers: string[] }[];
}
export interface StoryGroupsFile {
  groups: StoryGroup[];
}

export interface SeriesInfo {
  series_id: string;
  label: string;
  label_unconfirmed: boolean;
  description: string;
  counts: {
    items: number;
    hours: number;
    by_content_type: Record<string, number>;
    by_language: Record<string, number>;
  };
  date_range: {
    earliest: string | null;
    latest: string | null;
    hebrew_years?: number[];
    note?: string;
  } | null;
  episodes?: { distinct_episode_numbers: number; min: number; max: number } | null;
}
export interface SeriesFile {
  series: SeriesInfo[];
}

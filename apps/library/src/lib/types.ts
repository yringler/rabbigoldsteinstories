/**
 * Shapes the library builds from the public dataset (@goldstein/data) and ships to the browser.
 * Everything here is derived from public fields only; see src/pages/idx/catalog.json.ts.
 */
import type { AudienceLevel, ContentType, Lang, Standalone } from "@goldstein/data";

export type PersonRole = "central" | "appears" | "mentioned" | "teaching_cited";

/** "Has" flags shown as a facet. */
export type HasFlag = "chapters" | "transcript" | "serial" | "tellings";

/** One recording in the client catalog (`/idx/catalog.json`). */
export interface LibRow {
  id: string;
  title: string;
  he?: string;
  summary: string;
  lesson?: string;
  keywords: string[];
  characters: string[];
  places: string[];
  type: ContentType;
  series: string | null;
  speakers: string[];
  storyType: string[];
  standalone: Standalone;
  ep?: number;
  clip: boolean;
  /** Public episodes this clip was cut from. */
  clipOf: string[];
  /** Gregorian date (YYYY, YYYY-MM or YYYY-MM-DD). */
  date?: string;
  /** Short display date, Hebrew first ("1 Nissan 5747"), already precision-aware. */
  dateLabel?: string;
  /** Gregorian display ("31 Mar 1987") when precise to the day. */
  dateGreg?: string;
  hy?: number;
  /** Sortable date key (YYYYMMDD; 0 when unknown). */
  sortKey: number;
  /** Playable seconds (content end minus content start). */
  dur: number;
  start: number;
  end: number;
  url: string;
  level: AudienceLevel;
  age: number;
  adv: string[];
  lang: Lang;
  topics: string[];
  midos: string[];
  mitzvos: string[];
  calendar: string[];
  parshiyos: string[];
  people: [string, PersonRole][];
  works: string[];
  serial?: { key?: string; title: string; ch?: number | null };
  has: HasFlag[];
  /** False for superseded copies: never a separate search result (DECISIONS 7). */
  preferred: boolean;
  /** Number of other versions folded under this row. */
  versions: number;
}

/** [id, label, unconfirmed (1/0), aliases for matching only (never displayed)] */
export type VocabTuple = [string, string, 0 | 1, string[]];

export interface LibCatalog {
  v: 1;
  built: string;
  rows: LibRow[];
  vocab: Record<string, VocabTuple[]>;
  /** Serial titles by story key (for suggestions). */
  serials: [string, string][];
}

/** Chapter marks and track metadata for the player (`/idx/rec/<id>.json`). */
export interface RecInfo {
  id: string;
  title: string;
  artist: string;
  /** [start_sec, end_sec, title] */
  chapters: [number, number, string][];
}

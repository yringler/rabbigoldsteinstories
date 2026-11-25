/**
 * The PUBLIC dataset contract. Everything in packages/data/generated/ has one of these shapes, and
 * apps may rely on nothing else. Field names follow data/vocabulary/metadata.schema.json (snake_case)
 * so a field can be traced back to the source schema; derived fields are documented where they are.
 *
 * Never added here (docs/DECISIONS.md 1 and 3): hidden, source, quality, provenance,
 * proposed_new_terms, identity_guesses, audience.privacy. The privacy gate fails the build if any of
 * those keys, or any personal detail from a hidden block, appears in the output.
 */

/** Bump when the shape of anything below changes in a way apps must notice. */
export const PUBLIC_DATA_VERSION = 1;

export type ItemId = string; // 10 lowercase hex chars, stable forever
export type VocabId = string; // ^[a-z0-9_]+$, an id in vocab.json
export type Lang = "en" | "yi" | "he";

export type ContentType =
  | "radio_episode"
  | "radio_segment"
  | "story"
  | "story_chapter"
  | "story_collection"
  | "talk"
  | "lesson_with_story"
  | "shiur"
  | "live_event"
  | "song"
  | "promo"
  | "family_recording"
  | "fragment";

export type AudienceLevel =
  | "young_children"
  | "children"
  | "older_children"
  | "teens_adults"
  | "adults"
  | "family";

export type Standalone = "standalone" | "needs_context" | "cliffhanger" | "teaser" | "fragment";

export type TranscriptDisplay = "show_with_label" | "search_only" | "none";

export interface PublicDate {
  gregorian?: string | null; // YYYY, YYYY-MM or YYYY-MM-DD
  hebrew?: string | null;
  hebrew_year?: number | null;
  precision: "day" | "week" | "month" | "year" | "decade" | "unknown";
  basis: string;
  note?: string;
}

export interface PublicClassification {
  content_type: ContentType;
  story_type: VocabId[];
  series: VocabId | null;
  speakers: VocabId[];
  standalone: Standalone;
  episode?: { number: number; is_clip?: boolean };
  date?: PublicDate;
  serial?: { story_key?: string; story_title: string; chapter?: number | null };
  part?: { set_key?: string; part_number: number; of?: number | null };
  study_text?: {
    work: VocabId;
    unit?: VocabId;
    from?: string;
    to?: string;
    lecture_number?: number | null;
    note?: string;
  }[];
  collections: string[];
}

export interface PublicAdvisory {
  flag: VocabId;
  severity: "mild" | "moderate" | "strong";
  note: string;
  at_sec?: number;
}

export interface PublicSubjects {
  people: { id: VocabId; role: "central" | "appears" | "mentioned" | "teaching_cited" }[];
  characters: string[];
  topics: VocabId[];
  midos: VocabId[];
  mitzvos: VocabId[];
  calendar: VocabId[];
  parshiyos: VocabId[];
  places: string[];
  sources_cited: { work: VocabId; ref?: string; note?: string }[];
}

/**
 * A chapter mark inside the recording (metadata `segments[]`). For the private segment types
 * (shema_guest, mailbox, announcement, sponsor) only type, times and a generic title are
 * published: those segments are where children's names and addresses are read on air.
 */
export interface PublicSegment {
  start_sec: number;
  end_sec?: number;
  type: VocabId;
  title: string;
  summary?: string;
  people?: VocabId[];
  calendar?: VocabId[];
  story_key?: string;
  chapter?: number | null;
  /** Public clip items that cover this segment. */
  linked_items?: ItemId[];
}

export interface PublicRelation {
  type: VocabId; // clip_of, contains, aired_again_in, same_recording, alternate_take, superseded_by, part_of_set, continues, same_story, same_story_other_language
  target_id: ItemId; // always a public item (relations to excluded items are dropped)
  confidence: number;
  offset_sec?: number;
}

/**
 * Derived at build time from internal fields (quality, relations) before they are dropped.
 * These are the only facts from `quality` that reach the public output.
 */
export interface DerivedFlags {
  /** False when the item has a `superseded_by` relation (another copy is the one to feature). */
  preferred_copy: boolean;
  /** Ids of the preferred copies when preferred_copy is false. */
  preferred_ids: ItemId[];
  /** Episode(s) this clip was cut from (public ones only). */
  clip_of: ItemId[];
  /** Clips cut from this item (public ones only). */
  contains: ItemId[];
  /** Ids of every public item directly related by same-audio relations (clip/episode, re-air, same recording, alternate take, superseded). */
  same_audio: ItemId[];
  /** Vocabulary ids used by this item that are unconfirmed placeholders: show their labels as-is (they already say "unconfirmed"); never substitute a guessed name. */
  unconfirmed_ids: VocabId[];
}

export interface PublicMedia {
  url: string; // https://storiesmedia.torahlearningtools.com/goldstein/audio/... (play with <audio src>; no CORS)
  size_bytes?: number;
  mime_type: "audio/mpeg";
}

/** One recording, as published. File: generated/items/<id>.json */
export interface PublicItem {
  id: ItemId;
  /** URL-safe slug, unique: `<title-slug>-<id>` (optional for sites that want readable URLs). */
  slug: string;
  title: string;
  title_he?: string;
  title_translit?: string;
  summary_short: string;
  summary_long: string;
  lesson: string | null;
  keywords: string[];
  /** Length of the audio file. */
  duration_sec: number;
  /** Where the content starts/ends inside the file (from quality.trim; audio is never edited). Always present: 0 and duration_sec when the whole file is content. Player: stop or advance at content_end_sec; page: "content ends at 30:12" when content_end_sec < duration_sec. */
  content_start_sec: number;
  content_end_sec: number;
  media: PublicMedia;
  classification: PublicClassification;
  audience: { level: AudienceLevel; age_min: number; advisories: PublicAdvisory[] };
  subjects: PublicSubjects;
  segments: PublicSegment[];
  relations: PublicRelation[];
  language: { primary: Lang; spoken: Lang[]; transcript_language: "en" | "yi" };
  transcript: {
    /** show_with_label: generated/transcripts/<id>.json exists, show it labelled "automatic transcript, may contain errors". search_only: search text only (Yiddish), never display. none: nothing. */
    display: TranscriptDisplay;
    /** Number of transcript lines withheld for privacy (show "some lines withheld" when > 0). */
    masked_lines: number;
  };
  derived: DerivedFlags;
}

/** Slim row for lists, shelves and facets. File: generated/catalog.json (array, sorted by id). */
export interface CatalogEntry {
  id: ItemId;
  slug: string;
  title: string;
  title_he?: string;
  summary_short: string;
  duration_sec: number;
  /** Playable length: content end minus content start (= duration_sec when there is no blank tape). */
  content_sec: number;
  url: string;
  content_type: ContentType;
  series: VocabId | null;
  speakers: VocabId[];
  story_type: VocabId[];
  standalone: Standalone;
  collections: string[];
  episode?: number;
  is_clip: boolean;
  date?: string; // gregorian, may be partial
  hebrew_year?: number;
  serial?: { story_key?: string; chapter?: number | null };
  part?: { set_key?: string; part_number: number; of?: number | null };
  level: AudienceLevel;
  age_min: number;
  advisory_flags: VocabId[];
  max_advisory: "none" | "mild" | "moderate" | "strong";
  language: Lang;
  topics: VocabId[];
  midos: VocabId[];
  mitzvos: VocabId[];
  calendar: VocabId[];
  parshiyos: VocabId[];
  people: VocabId[];
  has_segments: boolean;
  transcript_display: TranscriptDisplay;
  preferred_copy: boolean;
}

/** English display transcript. File: generated/transcripts/<id>.json (only for display = show_with_label). */
export interface PublicTranscript {
  id: ItemId;
  language: "en";
  label: string; // "Automatic transcript, may contain errors."
  /** Lines in time order. `t: null` = withheld for privacy (show a neutral placeholder, never a reason). */
  lines: { s: number; e: number; t: string | null }[];
}

/** Search text, already masked. File: generated/search/<id>.json. Yiddish text is for indexing only: never display it. */
export interface SearchDoc {
  id: ItemId;
  language: "en" | "yi";
  display: TranscriptDisplay;
  /** Transcript lines (masked lines removed) as [start_sec, text]: lets search jump to a time. */
  lines: [number, string][];
}

/** File: generated/indexes/lost_episodes.json (DECISIONS 9: "help us find this tape"). */
export interface LostEpisodes {
  note: string;
  count: number;
  episodes: {
    episode: number;
    catalog_topic: string | null;
    catalog_story: string | null;
    /** "lost" = no recording; other values (e.g. "defective_copy") = a copy exists but is not published. */
    status: string;
    aired_after?: string | null;
    aired_before?: string | null;
    /** Approximate: show as "about". */
    estimated_date?: string | null;
  }[];
}

export interface VocabEntry {
  id: VocabId;
  label: string;
  description?: string;
  /** Search synonyms (never display them). Dropped for unconfirmed entries. */
  aliases?: string[];
  parent?: VocabId;
  category?: string;
  when?: string;
  /** Placeholder whose real name is not yet confirmed. Show `label` exactly; never present a guess. */
  unconfirmed?: true;
}

/** File: generated/vocab.json. Lists keyed by vocabulary name (topics, midos, people, series...). */
export interface PublicVocab {
  lists: Record<string, VocabEntry[]>;
  /** Known ASR misspellings → correct term: use as search synonyms only. */
  asr_glossary: { correct: string; heard: string[] }[];
}

export interface Manifest {
  version: typeof PUBLIC_DATA_VERSION;
  generated_at: string;
  input_fingerprint: string;
  counts: {
    source_items: number;
    public_items: number;
    excluded: Record<string, number>;
    transcripts: number;
    search_docs: number;
    masked_lines: number;
    units: number;
  };
  /** Public hours, by sum of duration_sec. */
  hours: number;
}

/**
 * Tonight's playlists: the unit pool (docs/sites/bedtime.md §4.1–4.2). File: generated/units.json.
 * Built on the private side (it applies quality, hidden spans and audience.privacy), but contains
 * only public fields. Input to packages/playlists; not served to browsers as-is.
 */
/** story/clip/span/set/serial: the story playlists; episode/episodes: Radio Night (whole episodes; a serial as its complete airing). */
export type UnitKind =
  | "story"
  | "clip"
  | "span"
  | "set"
  | "serial"
  | "episode"
  | "episodes"
  /** One non-story segment of a radio episode (a talk, a song, an opening, a Shema guest...). */
  | "segment";

export interface UnitTrack {
  id: ItemId;
  title: string;
  audio_url: string;
  mime_type: "audio/mpeg";
  /** Always present: whole-file tracks carry the trimmed content bounds. */
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  /**
   * Opening-song rule (bedtime.md §4.2): set when the track skips a short opening song; the song
   * starts here. A playlist's first track plays from this point instead of `start_sec`.
   */
  intro_start_sec?: number;
}

export interface UnitAdvisory {
  flag: VocabId;
  label: string;
  severity: "mild" | "moderate" | "strong";
  /** Seconds into the unit's first track's file, when known (for span inheritance). */
  at_sec?: number;
}

export interface Unit {
  /** `<id>` for whole files, `<id>@<start_sec>` for spans, `set:<set_key>` / `serial:<story_key>` for blocks. */
  unit: string;
  kind: UnitKind;
  /** For kind "segment": the segment type (talk, halachah, sichah, song, opening, closing, quiz, tzedakah, shema_guest). */
  segment?: string;
  title: string;
  /** "Uncle Yossi" or "R' Chaim Levi Goldstein" style label, or null (bedtime.md §5). */
  narrator: string | null;
  /** One track, or several for a block (played together, in order). */
  tracks: UnitTrack[];
  duration_sec: number;
  age_min: number;
  level: AudienceLevel;
  advisories: UnitAdvisory[];
  max_severity: "none" | "mild" | "moderate" | "strong";
  calendar: VocabId[];
  topics: VocabId[];
  story_type: VocabId[];
  /** Derived calm/exciting score (bedtime.md §4.3); null until the scorer is implemented. */
  energy: number | null;
  band: "calm" | "middle" | "exciting" | null;
  /** Dedupe keys: units sharing any key are "the same thing" (bedtime.md §4.2). */
  keys: string[];
  block: { key: string; title: string; of: number } | null;
}

export interface UnitPool {
  version: typeof PUBLIC_DATA_VERSION;
  generated_at: string;
  /** Hash of the unit list, recorded in each generated edition. */
  pool_hash: string;
  units: Unit[];
}

/**
 * The INTERNAL shape of a data/recordings/**\/*.meta.json file (data/vocabulary/metadata.schema.json,
 * schema_version 0.3), written against the schema by hand. Only the build reads this; apps never do.
 * Fields the build does not use are typed loosely.
 */
import type {
  AudienceLevel,
  ContentType,
  Lang,
  PublicAdvisory,
  PublicClassification,
  PublicSegment,
  PublicSubjects,
  TranscriptDisplay,
} from "./types.ts";

export interface RawHiddenPerson {
  name: string;
  role: string;
  group?: string;
  start_sec: number;
  end_sec?: number;
  note?: string;
}
export interface RawHiddenAddress {
  text: string;
  start_sec: number;
  end_sec?: number;
}
export interface RawHiddenOther {
  kind: string;
  text: string;
  start_sec: number;
  end_sec?: number;
}
export interface RawHidden {
  on_air_people: RawHiddenPerson[];
  addresses: RawHiddenAddress[];
  other_personal: RawHiddenOther[];
}

export type PublishRecommendation = "publish" | "publish_with_note" | "review" | "hide";

export interface RawMeta {
  id: string;
  schema_version: string;
  source: {
    collection: string;
    folder: string;
    filename_title: string;
    audio_path: string;
    duration_sec: number;
    [k: string]: unknown;
  };
  display: {
    title: string;
    title_he?: string;
    title_translit?: string;
    title_basis: string;
    summary_short: string;
    summary_long: string;
    lesson?: string | null;
    keywords?: string[];
    transcript_display: TranscriptDisplay;
  };
  classification: Omit<PublicClassification, "content_type" | "story_type" | "speakers" | "collections"> & {
    content_type: ContentType;
    story_type?: string[];
    speakers?: string[];
    collections?: string[];
  };
  audience: {
    level: AudienceLevel;
    age_min: number;
    advisories: PublicAdvisory[];
    privacy: { flag: string; note?: string; at_sec?: number }[];
  };
  subjects: Partial<PublicSubjects> & Pick<PublicSubjects, "people" | "topics" | "midos" | "mitzvos" | "calendar">;
  segments?: PublicSegment[];
  relations: {
    type: string;
    target_id: string;
    evidence: string;
    confidence: number;
    offset_sec?: number;
    note?: string;
  }[];
  language: { primary: Lang; spoken: Lang[]; transcript_language: "en" | "yi"; transcript_language_ok: boolean };
  quality: {
    audio: string;
    transcript: string;
    issues: string[];
    trim?: { content_start_sec?: number; content_end_sec?: number; note?: string } | null;
    publish_recommendation: PublishRecommendation;
    notes?: string;
  };
  provenance: unknown;
  hidden: RawHidden;
  identity_guesses?: unknown[];
  proposed_new_terms?: unknown[];
  media: {
    url: string;
    public_host: string;
    r2_bucket: string;
    r2_key: string;
    size_bytes?: number;
    mime_type: "audio/mpeg";
  };
}

export interface RawTranscript {
  id: string;
  language: string;
  duration?: number;
  segments: { start: number; end: number; text: string }[];
}

export interface RawVocabEntry {
  id: string;
  label: string;
  description?: string;
  aliases?: string[];
  parent?: string;
  category?: string;
  when?: string;
  unconfirmed?: boolean;
  deprecated?: boolean;
  use_instead?: string;
  [k: string]: unknown;
}

/** A loaded recording: its metadata plus where its files are. */
export interface RawRecording {
  meta: RawMeta;
  /** Path of the .meta.json, relative to data/recordings. */
  relPath: string;
  transcriptPath: string;
}

/**
 * Internal metadata → public shapes. Every public object is built field by field from an explicit
 * list (never by copying the source object and deleting keys), so a new internal field can never
 * leak by default.
 */
import { itemSlug } from "../paths.ts";
import { findTerms, hiddenSpans, overlapsAny, redactTerms, type TermSet } from "../privacy.ts";
import type { PublishRecommendation, RawMeta, RawTranscript, RawVocabEntry } from "../raw.ts";
import type {
  CatalogEntry,
  DerivedFlags,
  ItemId,
  PublicItem,
  PublicRelation,
  PublicSegment,
  PublicTranscript,
  PublicVocab,
  SearchDoc,
  VocabEntry,
} from "../types.ts";

/**
 * Which publish_recommendation values reach the public site. Only `hide` is excluded
 * (DECISIONS 4; "Website decisions" 2026-11-25: `review` items are publishable).
 */
export const PUBLISHED: ReadonlySet<PublishRecommendation> = new Set(["publish", "publish_with_note", "review"]);

export const TRANSCRIPT_LABEL = "Automatic transcript, may contain errors.";

/** Relations that mean "the same audio" (clip and episode, re-air, same recording, takes). */
const SAME_AUDIO = new Set(["clip_of", "contains", "aired_again_in", "same_recording", "alternate_take", "superseded_by"]);

export interface Context {
  publicIds: ReadonlySet<ItemId>;
  unconfirmed: ReadonlySet<string>;
  terms: TermSet;
  /** Report of redactions in metadata text (item id + field path, never the text). */
  redactions: { id: ItemId; field: string }[];
}

export function contentBounds(m: RawMeta): { start: number; end: number } {
  const dur = m.source.duration_sec;
  const t = m.quality.trim;
  const start = Math.max(0, Math.min(t?.content_start_sec ?? 0, dur));
  const end = Math.max(start, Math.min(t?.content_end_sec ?? dur, dur));
  return { start, end };
}

export function derive(m: RawMeta, ctx: Context): DerivedFlags {
  const rel = m.relations.filter((r) => ctx.publicIds.has(r.target_id));
  const ofType = (t: string) => [...new Set(rel.filter((r) => r.type === t).map((r) => r.target_id))];
  const superseded = ofType("superseded_by");
  const preferred = superseded.length === 0;
  const used = [
    m.classification.series,
    ...(m.classification.speakers ?? []),
    ...m.subjects.people.map((p) => p.id),
  ].filter((x): x is string => !!x && ctx.unconfirmed.has(x));
  return {
    preferred_copy: preferred,
    preferred_ids: superseded,
    clip_of: ofType("clip_of"),
    contains: ofType("contains"),
    same_audio: [...new Set(rel.filter((r) => SAME_AUDIO.has(r.type)).map((r) => r.target_id))].sort(),
    unconfirmed_ids: [...new Set(used)].sort(),
  };
}

/** Deep-walk strings and redact sensitive terms (records where, never what). */
function scrub<T>(value: T, ctx: Context, id: ItemId, path: string): T {
  if (typeof value === "string") {
    const hits = findTerms(value, ctx.terms);
    if (hits.length === 0) return value;
    ctx.redactions.push({ id, field: path });
    return redactTerms(value, hits) as T;
  }
  if (Array.isArray(value)) return value.map((v, i) => scrub(v, ctx, id, `${path}[${i}]`)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v, ctx, id, path ? `${path}.${k}` : k);
    return out as T;
  }
  return value;
}

function opt<K extends string, V>(key: K, v: V | undefined | null): { [P in K]?: V } {
  return (v === undefined || v === null ? {} : { [key]: v }) as { [P in K]?: V };
}

/** Segment types whose titles and summaries are withheld (owner decision 2026-11-25). */
export const PRIVATE_SEGMENT_TYPES: Readonly<Record<string, string>> = {
  shema_guest: "Shema with a guest",
  mailbox: "Mailbox",
  announcement: "Announcements",
  sponsor: "Sponsor message",
};

function publicSegment(s: PublicSegment, ctx: Context): PublicSegment {
  const linked = (s.linked_items ?? []).filter((i) => ctx.publicIds.has(i));
  const generic = PRIVATE_SEGMENT_TYPES[s.type];
  if (generic) {
    return { start_sec: s.start_sec, ...opt("end_sec", s.end_sec), type: s.type, title: generic };
  }
  return {
    start_sec: s.start_sec,
    ...opt("end_sec", s.end_sec),
    type: s.type,
    title: s.title,
    ...opt("summary", s.summary),
    ...opt("people", s.people),
    ...opt("calendar", s.calendar),
    ...opt("story_key", s.story_key),
    ...(s.chapter !== undefined ? { chapter: s.chapter } : {}),
    ...(linked.length ? { linked_items: linked } : {}),
  };
}

export function toPublicItem(m: RawMeta, ctx: Context, maskedLines: number): PublicItem {
  const c = m.classification;
  const { start, end } = contentBounds(m);
  const dur = m.source.duration_sec;
  const relations: PublicRelation[] = m.relations
    .filter((r) => ctx.publicIds.has(r.target_id))
    .map((r) => ({
      type: r.type,
      target_id: r.target_id,
      confidence: r.confidence,
      ...opt("offset_sec", r.offset_sec),
      ...opt("note", r.note),
    }));
  const item: PublicItem = {
    id: m.id,
    slug: itemSlug(m.display.title, m.id),
    title: m.display.title,
    ...opt("title_he", m.display.title_he),
    ...opt("title_translit", m.display.title_translit),
    summary_short: m.display.summary_short,
    summary_long: m.display.summary_long,
    lesson: m.display.lesson ?? null,
    keywords: m.display.keywords ?? [],
    duration_sec: dur,
    content_start_sec: start,
    content_end_sec: end,
    media: { url: m.media.url, ...opt("size_bytes", m.media.size_bytes), mime_type: m.media.mime_type },
    classification: {
      content_type: c.content_type,
      story_type: c.story_type ?? [],
      series: c.series ?? null,
      speakers: c.speakers ?? [],
      standalone: c.standalone,
      ...opt("episode", c.episode),
      ...opt("date", c.date),
      ...opt("serial", c.serial),
      ...opt("part", c.part),
      ...opt("study_text", c.study_text),
      collections: c.collections ?? [],
    },
    audience: { level: m.audience.level, age_min: m.audience.age_min, advisories: m.audience.advisories },
    subjects: {
      people: m.subjects.people,
      characters: m.subjects.characters ?? [],
      topics: m.subjects.topics,
      midos: m.subjects.midos,
      mitzvos: m.subjects.mitzvos,
      calendar: m.subjects.calendar,
      parshiyos: m.subjects.parshiyos ?? [],
      places: m.subjects.places ?? [],
      sources_cited: m.subjects.sources_cited ?? [],
    },
    segments: (m.segments ?? []).map((s) => publicSegment(s, ctx)),
    relations,
    language: {
      primary: m.language.primary,
      spoken: m.language.spoken,
      transcript_language: m.language.transcript_language,
    },
    transcript: { display: m.display.transcript_display, masked_lines: maskedLines },
    derived: derive(m, ctx),
  };
  // Media url and ids are not free text; everything else is scanned.
  const { media, id, slug, ...rest } = item;
  return { id, slug, ...scrub(rest, ctx, m.id, ""), media } as PublicItem;
}

export function maxSeverity(m: { audience: { advisories: { severity: string }[] } }): CatalogEntry["max_advisory"] {
  const order = ["none", "mild", "moderate", "strong"] as const;
  let best = 0;
  for (const a of m.audience.advisories) best = Math.max(best, order.indexOf(a.severity as (typeof order)[number]));
  return order[best] ?? "none";
}

export function toCatalogEntry(p: PublicItem): CatalogEntry {
  const c = p.classification;
  const start = p.content_start_sec;
  const end = p.content_end_sec;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    ...opt("title_he", p.title_he),
    summary_short: p.summary_short,
    duration_sec: p.duration_sec,
    content_sec: Math.round((end - start) * 10) / 10,
    url: p.media.url,
    content_type: c.content_type,
    series: c.series,
    speakers: c.speakers,
    story_type: c.story_type,
    standalone: c.standalone,
    collections: c.collections,
    ...opt("episode", c.episode?.number),
    is_clip: !!c.episode?.is_clip || p.derived.clip_of.length > 0,
    ...opt("date", c.date?.gregorian),
    ...opt("hebrew_year", c.date?.hebrew_year),
    ...(c.serial ? { serial: { ...opt("story_key", c.serial.story_key), chapter: c.serial.chapter ?? null } } : {}),
    ...opt("part", c.part),
    level: p.audience.level,
    age_min: p.audience.age_min,
    advisory_flags: [...new Set(p.audience.advisories.map((a) => a.flag))],
    max_advisory: maxSeverity(p),
    language: p.language.primary,
    topics: p.subjects.topics,
    midos: p.subjects.midos,
    mitzvos: p.subjects.mitzvos,
    calendar: p.subjects.calendar,
    parshiyos: p.subjects.parshiyos,
    people: p.subjects.people.map((x) => x.id),
    has_segments: p.segments.length > 0,
    transcript_display: p.transcript.display,
    preferred_copy: p.derived.preferred_copy,
  };
}

export interface MaskedTranscript {
  lines: { s: number; e: number; t: string | null }[];
  masked: number;
}

/**
 * Phone numbers read on air (the show's lines, sponsors). Long out of service, so never shown
 * (owner decision 2026-11-25): replaced with PHONE_PLACEHOLDER in public transcript text.
 * Matches "718-763-8200", "(718) 763-8200", "718 763 8200", "1-800-...", and 7-digit "467-7800".
 */
export const PHONE_RE = /(?:\b1[\s.-])?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])?\b\d{3}[\s.-]\d{4}\b/g;
export const PHONE_PLACEHOLDER = "[phone number]";

export function redactPhones(text: string): string {
  return text.replace(PHONE_RE, PHONE_PLACEHOLDER);
}

/** Withhold lines inside this item's hidden spans, and lines naming anyone from any hidden block. */
export function maskTranscript(m: RawMeta, t: RawTranscript, terms: TermSet): MaskedTranscript {
  const spans = hiddenSpans(m.hidden);
  let masked = 0;
  const lines = t.segments.map((seg) => {
    const s = Math.round(seg.start * 100) / 100;
    const e = Math.round(seg.end * 100) / 100;
    const text = seg.text.trim();
    if (overlapsAny(seg.start, seg.end, spans) || findTerms(text, terms).length > 0) {
      masked++;
      return { s, e, t: null };
    }
    return { s, e, t: redactPhones(text) };
  });
  return { lines, masked };
}

export function toTranscript(id: ItemId, mt: MaskedTranscript): PublicTranscript {
  return { id, language: "en", label: TRANSCRIPT_LABEL, lines: mt.lines };
}

export function toSearchDoc(p: PublicItem, mt: MaskedTranscript): SearchDoc {
  return {
    id: p.id,
    language: p.language.transcript_language,
    display: p.transcript.display,
    lines: mt.lines.filter((l) => l.t !== null).map((l) => [l.s, l.t as string]),
  };
}

/** Vocabulary lists that are internal markers, never shown. */
const INTERNAL_LISTS = new Set(["privacy_flag", "quality_issue", "production_notes", "relation_evidence"]);

export function toPublicVocab(lists: Record<string, RawVocabEntry[]>, glossary: PublicVocab["asr_glossary"]): PublicVocab {
  const out: PublicVocab = { lists: {}, asr_glossary: glossary };
  for (const [name, entries] of Object.entries(lists)) {
    if (INTERNAL_LISTS.has(name)) continue;
    out.lists[name] = entries
      .filter((e) => !e.deprecated)
      .map((e): VocabEntry => {
        if (e.unconfirmed) {
          // Placeholder: the label already says "unconfirmed"; drop anything that could carry a guess.
          return { id: e.id, label: e.label, unconfirmed: true };
        }
        return {
          id: e.id,
          label: e.label,
          ...opt("description", e.description),
          ...(e.aliases?.length ? { aliases: e.aliases } : {}),
          ...opt("parent", e.parent),
          ...opt("category", e.category),
          ...opt("when", e.when),
        };
      });
  }
  return out;
}

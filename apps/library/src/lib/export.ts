/**
 * Public data download (library.md §10), built from the public dataset only. The CSV flattens the
 * same records the site uses; vocabularies keep labels only (no review-history descriptions, no
 * ASR glossary).
 */
import type { PublicItem, PublicVocab } from "@goldstein/data";

export const CSV_COLUMNS = [
  "id",
  "url",
  "title",
  "type",
  "series",
  "episode",
  "speakers",
  "hebrew_date",
  "gregorian_date",
  "date_precision",
  "duration_sec",
  "language",
  "age_min",
  "midos",
  "mitzvos",
  "topics",
  "calendar",
  "parshiyos",
  "people",
  "works",
  "audio_url",
] as const;

export function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(items: readonly PublicItem[], origin: string): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const it of items) {
    const c = it.classification;
    const row: (string | number | null | undefined)[] = [
      it.id,
      `${origin}/r/${it.id}/`,
      it.title,
      c.content_type,
      c.series,
      c.episode?.number,
      c.speakers.join(";"),
      c.date?.hebrew,
      c.date?.gregorian,
      c.date?.precision,
      Math.round(it.duration_sec * 10) / 10,
      it.language.primary,
      it.audience.age_min,
      it.subjects.midos.join(";"),
      it.subjects.mitzvos.join(";"),
      it.subjects.topics.join(";"),
      it.subjects.calendar.join(";"),
      it.subjects.parshiyos.join(";"),
      it.subjects.people.map((p) => p.id).join(";"),
      [...new Set(it.subjects.sources_cited.map((s) => s.work))].join(";"),
      it.media.url,
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export interface PublicLabel {
  id: string;
  label: string;
  unconfirmed?: true;
  parent?: string;
  category?: string;
  when?: string;
}

export function publicLabels(v: PublicVocab): Record<string, PublicLabel[]> {
  const out: Record<string, PublicLabel[]> = {};
  for (const [list, entries] of Object.entries(v.lists)) {
    out[list] = entries.map((e) => {
      const l: PublicLabel = { id: e.id, label: e.label };
      if (e.unconfirmed) l.unconfirmed = true;
      if (e.parent) l.parent = e.parent;
      if (e.category) l.category = e.category;
      if (e.when) l.when = e.when;
      return l;
    });
  }
  return out;
}

/** JSON Schema of one record in library.json (descriptive; mirrors @goldstein/data PublicItem). */
export function recordSchema(origin: string): Record<string, unknown> {
  const str = { type: "string" };
  const strs = { type: "array", items: str };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${origin}/schemas/recording-1.json`,
    title: "Goldstein Story Archive: one public recording record",
    type: "object",
    required: [
      "id",
      "title",
      "summary_short",
      "duration_sec",
      "media",
      "classification",
      "audience",
      "subjects",
      "segments",
      "relations",
      "language",
      "transcript",
    ],
    properties: {
      id: { type: "string", pattern: "^[0-9a-f]{10}$", description: "Stable id; never reused" },
      slug: str,
      title: str,
      title_he: str,
      title_translit: str,
      summary_short: { type: "string", description: "AI-written from the recording" },
      summary_long: { type: "string", description: "AI-written from the recording" },
      lesson: { type: ["string", "null"] },
      keywords: strs,
      duration_sec: { type: "number" },
      content_start_sec: {
        type: "number",
        description: "Where the content starts in the file (the audio is never edited)",
      },
      content_end_sec: {
        type: "number",
        description: "Where the content ends; later is blank tape",
      },
      media: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          size_bytes: { type: "integer" },
          mime_type: { const: "audio/mpeg" },
        },
      },
      classification: {
        type: "object",
        properties: {
          content_type: str,
          story_type: strs,
          series: { type: ["string", "null"] },
          speakers: strs,
          standalone: {
            enum: ["standalone", "needs_context", "cliffhanger", "teaser", "fragment"],
          },
          episode: {
            type: "object",
            properties: { number: { type: "integer" }, is_clip: { type: "boolean" } },
          },
          date: {
            type: "object",
            properties: {
              gregorian: { type: ["string", "null"] },
              hebrew: { type: ["string", "null"] },
              hebrew_year: { type: ["integer", "null"] },
              precision: { enum: ["day", "week", "month", "year", "decade", "unknown"] },
              basis: str,
              note: str,
            },
          },
          serial: { type: "object" },
          part: { type: "object" },
          study_text: { type: "array" },
          collections: strs,
        },
      },
      audience: {
        type: "object",
        properties: {
          level: str,
          age_min: { type: "integer" },
          advisories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                flag: str,
                severity: { enum: ["mild", "moderate", "strong"] },
                note: str,
                at_sec: { type: "number" },
              },
            },
          },
        },
      },
      subjects: {
        type: "object",
        properties: {
          people: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: str,
                role: { enum: ["central", "appears", "mentioned", "teaching_cited"] },
              },
            },
          },
          characters: strs,
          topics: strs,
          midos: strs,
          mitzvos: strs,
          calendar: strs,
          parshiyos: strs,
          places: strs,
          sources_cited: {
            type: "array",
            items: { type: "object", properties: { work: str, ref: str, note: str } },
          },
        },
      },
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            start_sec: { type: "number" },
            end_sec: { type: "number" },
            type: str,
            title: str,
            summary: str,
          },
        },
      },
      relations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: str,
            target_id: str,
            confidence: { type: "number" },
            offset_sec: { type: "number" },
          },
        },
      },
      language: {
        type: "object",
        properties: {
          primary: { enum: ["en", "yi", "he"] },
          spoken: strs,
          transcript_language: { enum: ["en", "yi"] },
        },
      },
      transcript: {
        type: "object",
        properties: {
          display: { enum: ["show_with_label", "search_only", "none"] },
          masked_lines: { type: "integer" },
        },
      },
      derived: { type: "object" },
    },
  };
}

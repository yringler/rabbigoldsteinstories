/**
 * Chapter rows for the item page and the player (docs/sites/kids.md §6.1 table). Segment titles and
 * summaries of the private types are never used: shema_guest, mailbox, announcement and sponsor are
 * where children's names are read on air. Kids also hides opening/closing/other titles (§9).
 */
import type { PublicSegment } from "@goldstein/data";

export type ChapterStyle = "story" | "intro" | "talk" | "song" | "minor";

export interface KidChapter {
  /** Start, seconds from file start. */
  s: number;
  e?: number;
  type: string;
  label: string;
  style: ChapterStyle;
  icon: string;
  /** Only for story and talk rows. */
  summary?: string;
}

const STORY = new Set(["story", "story_chapter"]);
const TALK = new Set(["talk", "sichah", "text_study", "halachah", "review", "qa", "quiz"]);

/** Generic labels: these segments never show their own title or summary. */
export const GENERIC_LABEL: Readonly<Record<string, string>> = {
  story_intro: "Story so far",
  shema_guest: "Shema time",
  mailbox: "The mailbox",
  tzedakah: "Tzedakah time",
  opening: "Hello!",
  closing: "Goodbye!",
  announcement: "Announcements",
  sponsor: "A word from our sponsor",
  other: "More",
};

export const PRIVATE_TYPES: ReadonlySet<string> = new Set([
  "shema_guest",
  "mailbox",
  "announcement",
  "sponsor",
  "opening",
  "closing",
  "other",
]);

export function kidChapters(segments: readonly PublicSegment[]): KidChapter[] {
  const out: KidChapter[] = [];
  for (const seg of segments) {
    if (seg.type === "silence") continue;
    const base = {
      s: seg.start_sec,
      type: seg.type,
      ...(seg.end_sec !== undefined ? { e: seg.end_sec } : {}),
    };
    if (STORY.has(seg.type)) {
      out.push({
        ...base,
        label: seg.title,
        style: "story",
        icon: "star",
        ...(seg.summary ? { summary: seg.summary } : {}),
      });
    } else if (TALK.has(seg.type)) {
      out.push({
        ...base,
        label: seg.title,
        style: "talk",
        icon: "speech",
        ...(seg.summary ? { summary: seg.summary } : {}),
      });
    } else if (seg.type === "song") {
      out.push({ ...base, label: seg.title, style: "song", icon: "note" });
    } else if (seg.type === "story_intro") {
      out.push({
        ...base,
        label: GENERIC_LABEL["story_intro"] ?? "Story so far",
        style: "intro",
        icon: "book",
      });
    } else if (seg.type === "tzedakah") {
      out.push({
        ...base,
        label: GENERIC_LABEL["tzedakah"] ?? "Tzedakah time",
        style: "talk",
        icon: "pushka",
      });
    } else {
      // shema_guest, mailbox, opening, closing, announcement, sponsor, other, anything unknown.
      out.push({
        ...base,
        label: GENERIC_LABEL[seg.type] ?? "More",
        style: seg.type === "shema_guest" || seg.type === "mailbox" ? "talk" : "minor",
        icon: seg.type === "shema_guest" ? "ear" : seg.type === "mailbox" ? "envelope" : "dot",
      });
    }
  }
  return out;
}

/** Silence ranges the player skips. */
export function silences(segments: readonly PublicSegment[]): [number, number][] {
  return segments
    .filter((s) => s.type === "silence" && s.end_sec !== undefined)
    .map((s) => [s.start_sec, s.end_sec ?? s.start_sec]);
}

/** First story_intro/story/story_chapter start (§9 story_start_sec). */
export function storyStart(segments: readonly PublicSegment[]): number | null {
  const s = segments.find((x) => x.type === "story_intro" || STORY.has(x.type));
  return s ? s.start_sec : null;
}

/** "Jump to the story" for a serial chapter skips the recap: first story/story_chapter. */
export function storyStartNoRecap(segments: readonly PublicSegment[]): number | null {
  const s = segments.find((x) => STORY.has(x.type));
  return s ? s.start_sec : null;
}

/**
 * The unit pool for tonight's playlists (docs/sites/bedtime.md §4.2). Runs on the private side of
 * the build because the base filter needs quality, hidden spans and audience.privacy; the output
 * (generated/units.json) carries public fields only and goes through the privacy gate.
 *
 * Implemented: base filter B1–B8, unit kinds story / clip / span / set / serial for the story
 * playlists and episode / episodes for Radio Night, clip-vs-parent rule, span advisories and
 * calendar tags, dedupe keys.
 *
 * B9 (no track overlapping a hidden span) was dropped by the owner on 2026-11-25: names read on
 * air ~40 years ago may be HEARD in playlists. Nothing from `hidden` is ever written here as text;
 * units.json still goes through the privacy gate.
 * Owned by the bedtime team: the energy score (energy.ts), the opening-song rule (story tracks carry
 * intro_start_sec), sets with duplicate copies of a part. Counts, and why they differ from the
 * first measurement, are in docs/sites/bedtime.md §4.2.
 */
import { createHash } from "node:crypto";
import type { RawMeta, RawVocabEntry } from "../raw.ts";
import { PUBLIC_DATA_VERSION, type ItemId, type Unit, type UnitAdvisory, type UnitPool, type UnitTrack } from "../types.ts";
import { scoreEnergy } from "./energy.ts";
import { contentBounds, PRIVATE_SEGMENT_TYPES, PUBLISHED } from "./transform.ts";

const MIN_SEC = 3 * 60;
const MAX_SEC = 45 * 60;
const MAX_BLOCK_SEC = 85 * 60;
/**
 * Radio segments that may be playlist tracks on their own (owner, 2026-11-25): talks and songs;
 * openings, closings, quizzes and tzedakah as occasional extras; Shema guests (Little Ones only,
 * tentative). Mailbox, announcements and sponsor messages never play alone (only inside Radio
 * Night's whole episodes). [min, max] seconds; generic titles where the real one names people.
 */
const SEGMENT_TRACKS: Readonly<Record<string, { min: number; max: number; title?: string }>> = {
  talk: { min: 60, max: 15 * 60 },
  halachah: { min: 60, max: 15 * 60 },
  sichah: { min: 60, max: 15 * 60 },
  song: { min: 45, max: 10 * 60 },
  opening: { min: 20, max: 5 * 60, title: "Opening" },
  closing: { min: 15, max: 5 * 60, title: "Closing" },
  quiz: { min: 30, max: 7 * 60, title: "Quiz" },
  tzedakah: { min: 20, max: 4 * 60, title: "Tzedakah with Uncle Yossi" },
  shema_guest: { min: 60, max: 7 * 60, title: PRIVATE_SEGMENT_TYPES["shema_guest"]! },
};
/** Radio Night serial airings: at most four episodes, at most 2 h 15. */
const MAX_RUN_EPISODES = 4;
const MAX_RUN_SEC = 135 * 60;

const KID_LEVELS = new Set(["young_children", "children", "older_children", "family"]);
const BLOCKING_WHOLE = new Set(["defective_source", "truncated_start", "truncated_end", "multiple_programs", "dead_air", "noisy_audio", "mislabeled"]);
const BLOCKING_SPAN = new Set(["defective_source", "noisy_audio", "mislabeled"]);
const KEY_RELATIONS = new Set(["clip_of", "contains", "aired_again_in", "same_recording", "alternate_take", "superseded_by", "same_story", "same_story_other_language"]);
const NARRATORS: Record<string, string> = {
  rabbi_yosef_goldstein: "Uncle Yossi",
  rabbi_chaim_levi_goldstein: "R' Chaim Levi Goldstein",
};

interface SerialsIndex {
  serials: {
    story_key: string;
    title: string;
    runs: {
      in_archive: boolean;
      complete: boolean;
      chapters: { chapter: number; items: { id: string; parts?: { start_sec: number; end_sec: number | null; title?: string }[] }[] }[];
    }[];
  }[];
  single_stories_with_serial_field?: { item: string }[];
}
interface StoryGroups {
  groups: { group_id: string; item_ids: string[] }[];
}

export interface UnitInputs {
  metas: RawMeta[];
  vocab: Record<string, RawVocabEntry[]>;
  serials: SerialsIndex | null;
  storyGroups: StoryGroups | null;
  /** AI-cleaned copy URL by id (no media fragment); tracks of listed ids get clean_audio_url. */
  cleanUrls?: ReadonlyMap<ItemId, string>;
}

/** B1–B8 for a recording (B9 is per track). `span` relaxes B8 as the spec says. */
function passesBase(m: RawMeta, forSpan: boolean): boolean {
  const q = m.quality;
  const blocking = forSpan ? BLOCKING_SPAN : BLOCKING_WHOLE;
  return (
    PUBLISHED.has(q.publish_recommendation) && // B1 (owner 2026-11-25: review is publishable)
    !m.relations.some((r) => r.type === "superseded_by") && // B2
    m.language.primary === "en" && // B3
    KID_LEVELS.has(m.audience.level) &&
    m.audience.age_min <= 10 && // B4
    !m.audience.advisories.some((a) => a.severity === "strong") && // B5
    !m.audience.privacy.some((p) => p.flag === "private_family") && // B6
    (q.audio === "good" || q.audio === "fair") && // B7
    !q.issues.some((i) => blocking.has(i)) // B8
  );
}

export function buildUnitPool(input: UnitInputs): UnitPool {
  const byId = new Map(input.metas.map((m) => [m.id, m]));
  const advisoryLabel = new Map((input.vocab["content_advisory"] ?? []).map((e) => [e.id, e.label]));
  const groupsOf = new Map<ItemId, string[]>();
  for (const g of input.storyGroups?.groups ?? []) {
    for (const id of g.item_ids) groupsOf.set(id, [...(groupsOf.get(id) ?? []), g.group_id]);
  }
  const singleSerial = new Set((input.serials?.single_stories_with_serial_field ?? []).map((s) => s.item));

  const track = (m: RawMeta, start: number, end: number, title = m.display.title): UnitTrack => ({
    id: m.id,
    title,
    audio_url: m.media.url,
    ...(input.cleanUrls?.has(m.id) ? { clean_audio_url: input.cleanUrls.get(m.id) as string } : {}),
    mime_type: m.media.mime_type,
    start_sec: round(start),
    end_sec: round(end),
    duration_sec: round(end - start),
  });
  const advisories = (m: RawMeta, range?: [number, number]): UnitAdvisory[] =>
    m.audience.advisories
      .filter((a) => !range || a.at_sec === undefined || (a.at_sec >= range[0] - 30 && a.at_sec <= range[1]))
      .map((a) => ({ flag: a.flag, label: advisoryLabel.get(a.flag) ?? a.flag, severity: a.severity, ...(a.at_sec !== undefined ? { at_sec: a.at_sec } : {}) }));
  const keysFor = (ms: RawMeta[], extra: string[] = []) => {
    const k = new Set<string>(extra);
    for (const m of ms) {
      k.add(m.id);
      for (const r of m.relations) if (KEY_RELATIONS.has(r.type)) k.add(r.target_id);
      for (const g of groupsOf.get(m.id) ?? []) k.add(g);
    }
    return [...k].sort();
  };
  const narrator = (m: RawMeta) => NARRATORS[m.classification.speakers?.[0] ?? ""] ?? null;

  const units: Unit[] = [];
  const make = (u: Omit<Unit, "duration_sec" | "max_severity" | "energy" | "band">, text: string): Unit => {
    const duration = round(u.tracks.reduce((s, t) => s + t.duration_sec, 0));
    const order = ["none", "mild", "moderate", "strong"] as const;
    const max = u.advisories.reduce((b, a) => Math.max(b, order.indexOf(a.severity)), 0);
    const base: Unit = { ...u, duration_sec: duration, max_severity: order[max] ?? "none", energy: null, band: null };
    return { ...base, ...scoreEnergy(base, text) };
  };
  const wholeText = (m: RawMeta) => [m.display.title, m.display.summary_short, m.display.summary_long, ...(m.display.keywords ?? [])].join(" ");

  // story and clip: whole files
  const spanUnits: { episode: string; start: number; end: number }[] = [];
  for (const m of input.metas) {
    if (!passesBase(m, false)) continue;
    const c = m.classification;
    const isStory = ["story", "lesson_with_story", "story_collection"].includes(c.content_type) && !c.part;
    const isClip = c.content_type === "radio_segment" && (c.story_type?.length ?? 0) > 0;
    if (!(isStory || isClip) || c.standalone !== "standalone") continue;
    const bounds = contentBounds(m);
    const { end } = bounds;
    // Opening song (§4.2): a story that opens with a short song starts after it, except as the
    // first track of a playlist (the recipe's order hook then plays it from intro_start_sec).
    const song = isStory ? openingSongEnd(m) : null;
    const start = song !== null && song > bounds.start && song < end ? song : bounds.start;
    if (end - start < MIN_SEC || end - start > MAX_SEC) continue;
    const t = track(m, start, end);
    if (t.start_sec > bounds.start) t.intro_start_sec = round(bounds.start);
    units.push(
      make(
        {
          unit: m.id,
          kind: isStory ? "story" : "clip",
          title: m.display.title,
          narrator: narrator(m),
          tracks: [t],
          age_min: m.audience.age_min,
          level: m.audience.level,
          advisories: advisories(m),
          calendar: m.subjects.calendar,
          topics: m.subjects.topics,
          story_type: c.story_type ?? [],
          keys: keysFor([m], [`story:${slug(m.display.title)}`]),
          block: null,
        },
        wholeText(m),
      ),
    );
  }

  // span: each story segment of a radio episode is its own unit (owner, 2026-11-25: "episode X,
  // third story, 5:00–17:34"), with the story_intro segment(s) right before it. Name-heavy
  // segments (Shema guests, mailbox, announcements) are never part of a span. Story segments of a
  // serial episode are separate stories (the serial's own chapters are `story_chapter` segments,
  // played only inside serial blocks), so they count too.
  for (const m of input.metas) {
    const c = m.classification;
    if (c.content_type !== "radio_episode" || !passesBase(m, true)) continue;
    const segs = [...(m.segments ?? [])].sort((a, b) => a.start_sec - b.start_sec);
    const { end: contentEnd } = contentBounds(m);
    const stories = segs.filter((x) => x.type === "story");
    for (const story of stories) {
      const k = segs.indexOf(story);
      let first = k;
      while (first > 0 && segs[first - 1]!.type === "story_intro") first--;
      const start = segs[first]!.start_sec;
      const end = Math.min(story.end_sec ?? segs[k + 1]?.start_sec ?? contentEnd, contentEnd);
      if (end - start < MIN_SEC || end - start > MAX_SEC) continue;
      const run = segs.slice(first, k + 1);
      const t = track(m, start, end, story.title);
      const storyKey = `story:${slug(story.title)}`;
      // One story in the episode: the episode's own keys (relations, story groups) apply. Several:
      // they are scoped to this story, so two stories of one episode are not "the same thing".
      const epKeys = keysFor([m]);
      const keys = stories.length === 1 ? [...epKeys, storyKey] : [...epKeys.map((x) => `${x}~${slug(story.title)}`), storyKey];
      spanUnits.push({ episode: m.id, start, end });
      units.push(
        make(
          {
            unit: `${m.id}@${round(start)}`,
            kind: "span",
            title: story.title,
            narrator: narrator(m),
            tracks: [t],
            age_min: m.audience.age_min,
            level: m.audience.level,
            advisories: advisories(m, [start, end]),
            calendar: [...new Set(run.flatMap((x) => x.calendar ?? []))],
            topics: m.subjects.topics,
            story_type: c.story_type ?? [],
            keys: [...new Set(keys)].sort(),
            block: null,
          },
          [...run.flatMap((x) => [x.title, x.summary ?? ""]), ...(m.display.keywords ?? [])].join(" "),
        ),
      );
    }
  }

  // clip vs parent episode: drop the clip when its offset falls inside a span of the episode
  const kept = units.filter((u) => {
    if (u.kind !== "clip") return true;
    const m = byId.get(u.tracks[0]!.id)!;
    return !m.relations
      .filter((r) => r.type === "clip_of")
      .some((r) => spanUnits.some((s) => s.episode === r.target_id && (r.offset_sec === undefined || (r.offset_sec >= s.start && r.offset_sec < s.end))));
  });

  // set blocks: complete multi-part sets
  const sets = new Map<string, RawMeta[]>();
  for (const m of input.metas) {
    const key = m.classification.part?.set_key;
    if (key) sets.set(key, [...(sets.get(key) ?? []), m]);
  }
  // A set may hold several copies of a part (alternate takes, superseded copies, a second
  // telling). B2 drops superseded copies; of the copies left the best one plays (publish over
  // review, good audio over fair, then the lowest id), and the other copies' ids join the block's
  // dedupe keys. A set needs at least two parts: a lone "Part 1" whose other parts are not in the
  // archive is neither a complete block nor a standalone story.
  const copyRank = (m: RawMeta) =>
    (m.quality.publish_recommendation === "review" ? 2 : 0) + (m.quality.audio === "good" ? 0 : 1);
  for (const [key, members] of sets) {
    const of = Math.max(...members.map((m) => Math.max(m.classification.part!.of ?? 0, m.classification.part!.part_number)));
    if (of < 2) continue;
    const parts: RawMeta[] = [];
    const tracks: UnitTrack[] = [];
    for (let n = 1; n <= of; n++) {
      const best = members
        .filter((m) => m.classification.part!.part_number === n && passesBase(m, false))
        .map((m) => {
          const { start, end } = contentBounds(m);
          return { m, t: track(m, start, end) };
        })
        .sort((a, b) => copyRank(a.m) - copyRank(b.m) || a.m.id.localeCompare(b.m.id))[0];
      if (!best) break;
      parts.push(best.m);
      tracks.push(best.t);
    }
    if (parts.length !== of) continue;
    const total = tracks.reduce((s, t) => s + t.duration_sec, 0);
    if (total > MAX_BLOCK_SEC) continue;
    const others = members.filter((m) => !parts.includes(m)).map((m) => m.id);
    const title = parts[0]!.display.title.replace(/,?\s*(Part|Chapter)\s+\d+.*$/i, "");
    kept.push(
      make(
        {
          unit: `set:${key}`,
          kind: "set",
          title,
          narrator: narrator(parts[0]!),
          tracks,
          age_min: Math.max(...parts.map((p) => p.audience.age_min)),
          level: parts[0]!.audience.level,
          advisories: parts.flatMap((p) => advisories(p)),
          calendar: [...new Set(parts.flatMap((p) => p.subjects.calendar))],
          topics: [...new Set(parts.flatMap((p) => p.subjects.topics))],
          story_type: [...new Set(parts.flatMap((p) => p.classification.story_type ?? []))],
          keys: keysFor(parts, [`set:${key}`, ...others]),
          block: { key, title, of },
        },
        parts.map((p) => `${p.display.title} ${p.display.summary_short} ${p.display.summary_long}`).join(" "),
      ),
    );
  }

  // serial blocks: one complete airing of a radio serial
  for (const s of input.serials?.serials ?? []) {
    let best: { tracks: UnitTrack[]; metas: RawMeta[]; total: number } | null = null;
    for (const run of s.runs) {
      if (!run.in_archive || !run.complete) continue;
      const tracks: UnitTrack[] = [];
      const metas: RawMeta[] = [];
      let ok = true;
      for (const ch of [...run.chapters].sort((a, b) => a.chapter - b.chapter)) {
        const item = ch.items.map((i) => ({ i, m: byId.get(i.id) })).find((x) => x.m && passesBase(x.m, true));
        if (!item?.m || !item.i.parts?.length) {
          ok = false;
          break;
        }
        const m = item.m;
        const { end: contentEnd } = contentBounds(m);
        for (const p of item.i.parts) {
          tracks.push(track(m, p.start_sec, Math.min(p.end_sec ?? contentEnd, contentEnd), `${s.title}, Chapter ${ch.chapter}`));
        }
        metas.push(m);
      }
      const total = tracks.reduce((a, t) => a + t.duration_sec, 0);
      if (!ok || total < 10 * 60 || total > MAX_BLOCK_SEC) continue;
      if (!best || total > best.total) best = { tracks, metas, total };
    }
    if (!best) continue;
    const ms = best.metas;
    kept.push(
      make(
        {
          unit: `serial:${s.story_key}`,
          kind: "serial",
          title: s.title,
          narrator: narrator(ms[0]!),
          tracks: best.tracks,
          age_min: Math.max(...ms.map((m) => m.audience.age_min)),
          level: ms[0]!.audience.level,
          advisories: ms.flatMap((m) => advisories(m)),
          calendar: [],
          topics: [...new Set(ms.flatMap((m) => m.subjects.topics))],
          story_type: [...new Set(ms.flatMap((m) => m.classification.story_type ?? []))],
          keys: keysFor(ms, [`serial:${s.story_key}`]),
          block: { key: s.story_key, title: s.title, of: ms.length },
        },
        ms.flatMap((m) => (m.segments ?? []).filter((x) => x.type === "story_chapter").map((x) => x.summary ?? "")).join(" "),
      ),
    );
  }

  // segment: talks, songs and the occasional extras, one unit per segment (recipes decide where
  // and how often each type may play). Keys: the segment itself, and its title per type, so the
  // same march or talk recorded in many episodes counts as one thing.
  for (const m of input.metas) {
    const c = m.classification;
    if (c.content_type !== "radio_episode" || !passesBase(m, true)) continue;
    const segs = [...(m.segments ?? [])].sort((a, b) => a.start_sec - b.start_sec);
    const { end: contentEnd } = contentBounds(m);
    segs.forEach((x, k) => {
      const rule = SEGMENT_TRACKS[x.type];
      if (!rule) return;
      const end = Math.min(x.end_sec ?? segs[k + 1]?.start_sec ?? contentEnd, contentEnd);
      if (end - x.start_sec < rule.min || end - x.start_sec > rule.max) return;
      const title = rule.title ?? x.title;
      kept.push(
        make(
          {
            unit: `${m.id}@${round(x.start_sec)}`,
            kind: "segment",
            segment: x.type,
            title,
            narrator: narrator(m),
            tracks: [track(m, x.start_sec, end, title)],
            age_min: m.audience.age_min,
            level: m.audience.level,
            advisories: advisories(m, [x.start_sec, end]),
            calendar: x.calendar ?? [],
            topics: m.subjects.topics,
            story_type: [],
            keys: [`${m.id}@${round(x.start_sec)}`, `${x.type}:${slug(rule.title ? `${m.id}-${x.start_sec}` : x.title)}`],
            block: null,
          },
          rule.title ? "" : `${x.title} ${x.summary ?? ""}`,
        ),
      );
    });
  }

  // Radio Night: whole episodes, as broadcast (names, mailbox and all; owner 2026-11-25).
  // Standalone episodes play alone; a serial plays only as a complete airing of up to four
  // consecutive episodes, in order (never a chapter out of context).
  for (const m of input.metas) {
    const c = m.classification;
    if (c.content_type !== "radio_episode" || !passesBase(m, false)) continue;
    if ((c.serial && !singleSerial.has(m.id)) || c.standalone === "cliffhanger") continue;
    const { start, end } = contentBounds(m);
    if (end - start < 10 * 60 || end - start > 45 * 60) continue;
    kept.push(
      make(
        {
          unit: `episode:${m.id}`,
          kind: "episode",
          title: m.display.title,
          narrator: narrator(m),
          tracks: [track(m, start, end)],
          age_min: m.audience.age_min,
          level: m.audience.level,
          advisories: advisories(m),
          calendar: m.subjects.calendar,
          topics: m.subjects.topics,
          story_type: c.story_type ?? [],
          keys: keysFor([m], [`episode:${m.id}`]),
          block: null,
        },
        wholeText(m),
      ),
    );
  }
  for (const s of input.serials?.serials ?? []) {
    let best: RawMeta[] | null = null;
    for (const run of s.runs) {
      if (!run.in_archive || !run.complete || run.chapters.length > MAX_RUN_EPISODES) continue;
      const ms: RawMeta[] = [];
      for (const ch of [...run.chapters].sort((a, b) => a.chapter - b.chapter)) {
        const m = ch.items.map((i) => byId.get(i.id)).find((x) => x && passesBase(x, false));
        if (!m || ms.includes(m)) break;
        ms.push(m);
      }
      if (ms.length !== run.chapters.length) continue;
      if (!best || ms.length > best.length) best = ms;
    }
    if (!best || best.length < 2) continue;
    const tracks = best.map((m) => {
      const { start, end } = contentBounds(m);
      return track(m, start, end);
    });
    if (tracks.reduce((a, t) => a + t.duration_sec, 0) > MAX_RUN_SEC) continue;
    kept.push(
      make(
        {
          unit: `episodes:${s.story_key}`,
          kind: "episodes",
          title: s.title,
          narrator: narrator(best[0]!),
          tracks,
          age_min: Math.max(...best.map((m) => m.audience.age_min)),
          level: best[0]!.audience.level,
          advisories: best.flatMap((m) => advisories(m)),
          calendar: [...new Set(best.flatMap((m) => m.subjects.calendar))],
          topics: [...new Set(best.flatMap((m) => m.subjects.topics))],
          story_type: [...new Set(best.flatMap((m) => m.classification.story_type ?? []))],
          keys: keysFor(best, [`serial:${s.story_key}`, `episodes:${s.story_key}`]),
          block: { key: s.story_key, title: s.title, of: best.length },
        },
        best.map((m) => wholeText(m)).join(" "),
      ),
    );
  }

  kept.sort((a, b) => a.unit.localeCompare(b.unit));
  const poolHash = createHash("sha256").update(JSON.stringify(kept)).digest("hex").slice(0, 12);
  return { version: PUBLIC_DATA_VERSION, generated_at: new Date().toISOString(), pool_hash: poolHash, units: kept };
}

/** End of a short opening song (first segment, type `song`, ending before 180 s), or null. */
function openingSongEnd(m: RawMeta): number | null {
  const first = [...(m.segments ?? [])].sort((a, b) => a.start_sec - b.start_sec)[0];
  if (!first || first.type !== "song" || first.end_sec === undefined || first.end_sec === null) return null;
  return first.end_sec < 180 ? first.end_sec : null;
}

/** Dedupe key for a story title: lowercase letters and digits. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

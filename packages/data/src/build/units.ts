/**
 * The unit pool for tonight's playlists (docs/sites/bedtime.md §4.2). Runs on the private side of
 * the build because the base filter needs quality, hidden spans and audience.privacy; the output
 * (generated/units.json) carries public fields only and goes through the privacy gate.
 *
 * Implemented: base filter B1–B9, unit kinds story / clip / span / set / serial, clip-vs-parent
 * rule, span advisories and calendar tags, dedupe keys.
 * Owned by the bedtime team: the energy score (energy.ts), the opening-song rule (story tracks carry
 * intro_start_sec), sets with duplicate copies of a part. Counts, and why they differ from the
 * first measurement, are in docs/sites/bedtime.md §4.2.
 */
import { createHash } from "node:crypto";
import { hiddenSpans, overlapsAny, SPAN_PAD_SEC } from "../privacy.ts";
import type { RawMeta, RawVocabEntry } from "../raw.ts";
import { PUBLIC_DATA_VERSION, type ItemId, type Unit, type UnitAdvisory, type UnitPool, type UnitTrack } from "../types.ts";
import { scoreEnergy } from "./energy.ts";
import { contentBounds, PUBLISHED } from "./transform.ts";

const MIN_SEC = 3 * 60;
const MAX_SEC = 45 * 60;
const MAX_BLOCK_SEC = 85 * 60;

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
    mime_type: m.media.mime_type,
    start_sec: round(start),
    end_sec: round(end),
    duration_sec: round(end - start),
  });
  /**
   * B9 with the transcript-masking pad (SPAN_PAD_SEC = 2 s on each side of a hidden span), so a
   * player overshooting end_sec or a seek landing early can never reach a name. A padded span
   * that only touches the start or the end of the track trims it (story segments often begin
   * where a Shema-guest segment ends); one inside the track rules the track out. Mutates `t`.
   */
  const notHidden = (m: RawMeta, t: UnitTrack): boolean => {
    const spans = hiddenSpans(m.hidden, SPAN_PAD_SEC).sort((a, b) => a.start - b.start);
    let s = t.start_sec;
    let e = t.end_sec;
    for (const h of spans) {
      if (!(s < h.end && e > h.start)) continue;
      if (h.start <= s) s = h.end;
      else if (h.end >= e) e = h.start;
      else return false;
      if (e - s < 60) return false;
    }
    s = Math.ceil(s * 100) / 100;
    e = Math.floor(e * 100) / 100;
    if (overlapsAny(s, e, spans)) return false;
    t.start_sec = s;
    t.end_sec = e;
    t.duration_sec = round(e - s);
    return true;
  };
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
    if (!notHidden(m, t) || t.duration_sec < MIN_SEC) continue;
    if (t.start_sec > bounds.start) {
      const intro = round(bounds.start);
      if (!overlapsAny(intro, t.end_sec, hiddenSpans(m.hidden, SPAN_PAD_SEC))) t.intro_start_sec = intro;
    }
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
          keys: keysFor([m]),
          block: null,
        },
        wholeText(m),
      ),
    );
  }

  // span: story runs inside radio episodes
  for (const m of input.metas) {
    const c = m.classification;
    if (c.content_type !== "radio_episode" || !passesBase(m, true)) continue;
    if ((c.serial && !singleSerial.has(m.id)) || c.standalone === "cliffhanger") continue;
    const segs = [...(m.segments ?? [])].sort((a, b) => a.start_sec - b.start_sec);
    const { end: contentEnd } = contentBounds(m);
    for (let i = 0; i < segs.length; i++) {
      if (!["story", "story_intro"].includes(segs[i]!.type)) continue;
      let j = i;
      while (j + 1 < segs.length && ["story", "story_intro"].includes(segs[j + 1]!.type)) j++;
      const run = segs.slice(i, j + 1);
      i = j;
      if (!run.some((s) => s.type === "story")) continue;
      const last = run[run.length - 1]!;
      const start = run[0]!.start_sec;
      const end = Math.min(last.end_sec ?? segs[j + 1]?.start_sec ?? contentEnd, contentEnd);
      if (end - start < MIN_SEC || end - start > MAX_SEC) continue;
      const story = run.find((s) => s.type === "story")!;
      const t = track(m, start, end, story.title);
      if (!notHidden(m, t) || t.duration_sec < MIN_SEC) continue;
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
            calendar: [...new Set(run.flatMap((s) => s.calendar ?? []))],
            topics: m.subjects.topics,
            story_type: c.story_type ?? [],
            keys: keysFor([m]),
            block: null,
          },
          [...run.flatMap((s) => [s.title, s.summary ?? ""]), ...(m.display.keywords ?? [])].join(" "),
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
        .filter((x) => notHidden(x.m, x.t))
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
          const t = track(m, p.start_sec, Math.min(p.end_sec ?? contentEnd, contentEnd), `${s.title}, Chapter ${ch.chapter}`);
          if (!notHidden(m, t)) ok = false;
          tracks.push(t);
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

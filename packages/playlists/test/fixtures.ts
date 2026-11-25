import type { Unit, UnitPool } from "@goldstein/data";

/** A synthetic pool: `n` single-track units of varied length/energy, plus a few blocks. */
export function fakePool(n = 300, blocks = 6): UnitPool {
  const units: Unit[] = [];
  for (let i = 0; i < n; i++) {
    const id = i.toString(16).padStart(10, "0");
    const dur = 300 + ((i * 7919) % 1500); // 5–30 min
    const energy = (i % 9) - 3;
    units.push({
      unit: id,
      kind: i % 3 === 0 ? "span" : "story",
      title: `Story ${i}`,
      narrator: i % 2 ? "Uncle Yossi" : null,
      tracks: [
        {
          id,
          title: `Story ${i}`,
          audio_url: `https://media.example/${id}.mp3`,
          mime_type: "audio/mpeg",
          start_sec: 0,
          end_sec: dur,
          duration_sec: dur,
        },
      ],
      duration_sec: dur,
      age_min: 3 + (i % 8),
      level: "children",
      advisories: [],
      max_severity: "none",
      calendar: [],
      topics: [],
      story_type: [],
      energy,
      band: energy <= 0 ? "calm" : energy <= 3 ? "middle" : "exciting",
      // every 10th unit shares a story key with the next one (same story told twice)
      keys: [id, ...(i % 10 === 0 ? [`sg${i}`] : i % 10 === 1 ? [`sg${i - 1}`] : [])],
      block: null,
    });
  }
  for (let b = 0; b < blocks; b++) {
    const ids = [0, 1, 2].map((p) => `b${b}p${p}`.padEnd(10, "0"));
    const tracks = ids.map((id) => ({
      id,
      title: `Serial ${b} ch`,
      audio_url: `https://media.example/${id}.mp3`,
      mime_type: "audio/mpeg" as const,
      start_sec: 10,
      end_sec: 910,
      duration_sec: 900,
    }));
    units.push({
      unit: `serial:s${b}`,
      kind: "serial",
      title: `Serial ${b}`,
      narrator: "Uncle Yossi",
      tracks,
      duration_sec: 2700,
      age_min: 6,
      level: "children",
      advisories: [],
      max_severity: "none",
      calendar: [],
      topics: [],
      story_type: [],
      energy: 2,
      band: "middle",
      keys: [`serial:s${b}`, ...ids],
      block: { key: `s${b}`, title: `Serial ${b}`, of: 3 },
    });
  }
  return { version: 1, generated_at: "2026-11-25T00:00:00Z", pool_hash: `fake${n}`, units };
}

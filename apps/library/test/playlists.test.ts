import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  decodeShare,
  encodeShare,
  exportDoc,
  exportFileName,
  MAX_FILE_BYTES,
  mergeImport,
  newId,
  parseImport,
  playlistSchema,
  serialize,
  type UserPlaylist,
  validateDoc,
} from "../src/lib/playlists.ts";

function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function bigPlaylist(n: number, rnd = seeded()): UserPlaylist {
  return {
    id: newId(rnd),
    name: "Hakaras hatov for grade 2",
    note: "Tuesday mornings",
    created: "2026-11-01T10:00:00.000Z",
    updated: "2026-11-20T08:30:00.000Z",
    origin: "tonight:2026-11-25:calm",
    items: Array.from({ length: n }, (_, i) => {
      const rec = Math.floor(rnd() * 0xffffffffff)
        .toString(16)
        .padStart(10, "0");
      return i % 3 === 0
        ? {
            rec,
            start: 737,
            end: 1365,
            label: "The Ten Wedding Gifts, Chapter 1",
            title: "Episode 7",
            dur: 628,
            note: `item ${i}`,
          }
        : { rec, title: `Recording ${i}`, dur: 300 + i };
    }),
  };
}

const ajv = new Ajv2020({ strict: false, validateFormats: false });
const schemaValidate = ajv.compile(playlistSchema("https://story-library.torahlearningtools.com"));

describe("playlists file format", () => {
  it("export → serialize → import reproduces a 50-item playlist exactly", () => {
    const p = bigPlaylist(50);
    const doc = exportDoc(
      [p],
      "https://story-library.torahlearningtools.com",
      new Date("2026-11-25T12:00:00Z"),
    );
    const text = serialize(doc);
    const res = parseImport(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.playlists).toEqual([p]);
    expect(res.warnings).toEqual([]);
    expect(doc.exported).toBe("2026-11-25T12:00:00.000Z");
    expect(exportFileName(new Date("2026-11-25T12:00:00Z"))).toBe(
      "goldstein-playlists-2026-11-25.json",
    );
  });

  it("the exported file validates against the published JSON Schema", () => {
    const doc = exportDoc(
      [bigPlaylist(50), bigPlaylist(3, seeded(7))],
      "https://story-library.torahlearningtools.com",
    );
    const ok = schemaValidate(JSON.parse(serialize(doc)));
    expect(schemaValidate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("the validator and the schema agree on valid and invalid documents", () => {
    const good = exportDoc([bigPlaylist(2)], "https://x.example");
    const bad: unknown[] = [
      { ...good, format: "other" },
      { ...good, version: 0 },
      { ...good, extra: 1 },
      { ...good, playlists: [{ ...bigPlaylist(1), id: "SHORT" }] },
      { ...good, playlists: [{ ...bigPlaylist(1), name: "" }] },
      { ...good, playlists: [{ ...bigPlaylist(1), items: [{ rec: "xyz" }] }] },
      { ...good, playlists: [{ ...bigPlaylist(1), items: [{ rec: "0123456789", start: -1 }] }] },
      { ...good, playlists: [{ ...bigPlaylist(1), items: [{ rec: "0123456789", end: 0 }] }] },
      {
        ...good,
        playlists: [{ ...bigPlaylist(1), items: [{ rec: "0123456789", colour: "red" }] }],
      },
      { ...good, playlists: Array.from({ length: 101 }, () => bigPlaylist(0)) },
      { ...good, playlists: [{ ...bigPlaylist(501) }] },
    ];
    expect(validateDoc(good).ok).toBe(true);
    expect(schemaValidate(good)).toBe(true);
    for (const b of bad) {
      expect(validateDoc(b).ok, JSON.stringify(b).slice(0, 80)).toBe(false);
      expect(schemaValidate(b), JSON.stringify(b).slice(0, 80)).toBe(false);
    }
  });

  it("rejects bad files with a specific message and changes nothing", () => {
    expect(parseImport("not json")).toEqual({ ok: false, errors: ["The file is not valid JSON."] });
    const big = parseImport("x", MAX_FILE_BYTES + 1);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors[0]).toMatch(/limit is 1 MB/);
    const wrong = parseImport(JSON.stringify({ format: "something", version: 1, playlists: [] }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors[0]).toMatch(/not a playlists file/);
    const item = parseImport(
      JSON.stringify({
        format: "goldstein-playlists",
        version: 1,
        playlists: [{ id: "abcdefabcdef", name: "x", items: [{ rec: "nope" }] }],
      }),
    );
    expect(item.ok).toBe(false);
    if (!item.ok)
      expect(item.errors[0]).toBe('Playlist 1, item 1: "rec" must be a 10-character recording id.');
  });

  it("imports what validates from a newer version, and says so", () => {
    const newer = {
      format: "goldstein-playlists",
      version: 2,
      future: true,
      playlists: [
        { id: "abcdefabcdef", name: "ok", items: [{ rec: "0123456789", newField: 1 }] },
        { id: "bad", name: "broken", items: [] },
      ],
    };
    const res = validateDoc(newer);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.playlists.map((p) => p.id)).toEqual(["abcdefabcdef"]);
    expect(res.warnings[0]).toMatch(/version 2/);
    expect(res.warnings.some((w) => /Playlist 2 was skipped/.test(w))).toBe(true);
  });

  it("merges imports: new ones added; conflicts replaced, kept both or skipped", () => {
    const a = bigPlaylist(1, seeded(3));
    const b = bigPlaylist(2, seeded(4));
    const a2 = { ...a, name: "A from file" };
    const r1 = mergeImport([a], [a2, b], () => "replace", seeded(9));
    expect(r1.playlists.map((p) => p.name)).toEqual(["A from file", b.name]);
    expect([r1.added, r1.replaced, r1.skipped]).toEqual([1, 1, 0]);
    const r2 = mergeImport([a], [a2], () => "keep-both", seeded(9));
    expect(r2.playlists).toHaveLength(2);
    expect(r2.playlists[1]?.id).not.toBe(a.id);
    expect(r2.playlists[1]?.name).toBe("A from file (imported)");
    const r3 = mergeImport([a], [a2], () => "skip");
    expect(r3.playlists).toEqual([a]);
    expect(r3.skipped).toBe(1);
  });

  it("ids are 12 lowercase letters or digits", () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[a-z0-9]{12}$/);
  });

  it("share links round-trip, and are refused when too long", async () => {
    const p = bigPlaylist(12);
    const enc = await encodeShare(p);
    expect(enc).not.toBeNull();
    const back = await decodeShare(enc ?? "");
    expect(back?.name).toBe(p.name);
    expect(back?.items.map((i) => i.rec)).toEqual(p.items.map((i) => i.rec));
    expect(back?.items[0]?.title).toBeUndefined(); // titles are refreshed from the catalog, not shared
    expect(await encodeShare(bigPlaylist(400))).toBeNull();
    expect(await decodeShare("!!!")).toBeNull();
  });
});

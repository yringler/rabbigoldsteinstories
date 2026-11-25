/**
 * AI-cleaned audio copies (docs/design/ai-audio.md §2): the URL helper, the manifest reader, the
 * id/key matching, and the generated dataset (whatever part of the manifest exists right now).
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build/build.ts";
import { loadCleanManifest, parseCsv, resolveCleanCopies } from "../src/build/clean.ts";
import { dataDir, inputFingerprint, outDir } from "../src/build/io.ts";
import { cleanUrlOf } from "../src/paths.ts";
import type { RawMeta } from "../src/raw.ts";
import type { CatalogEntry, Manifest, PublicItem, UnitPool } from "../src/types.ts";

const HOST = "https://storiesmedia.torahlearningtools.com";
const TANYA_KEY =
  "goldstein/audio/Yiddish/Tanya Shiurim - R' Yosef Goldstein/Shiur 20 - Chapters 15 and 16, Serving Hashem Beyond Habit.mp3";
const TANYA_URL = `${HOST}/goldstein/audio/Yiddish/Tanya%20Shiurim%20-%20R%27%20Yosef%20Goldstein/Shiur%2020%20-%20Chapters%2015%20and%2016%2C%20Serving%20Hashem%20Beyond%20Habit.mp3`;

describe("cleanUrlOf", () => {
  it("swaps the goldstein/audio/ prefix and keeps the percent-encoding (apostrophe, comma, spaces)", () => {
    expect(cleanUrlOf(TANYA_URL)).toBe(
      `${HOST}/goldstein/audio_clean/Yiddish/Tanya%20Shiurim%20-%20R%27%20Yosef%20Goldstein/Shiur%2020%20-%20Chapters%2015%20and%2016%2C%20Serving%20Hashem%20Beyond%20Habit.mp3`,
    );
  });
  it("replaces the first segment only and keeps a media fragment", () => {
    expect(cleanUrlOf(`${HOST}/goldstein/audio/x/goldstein/audio/y.mp3#t=10,20`)).toBe(
      `${HOST}/goldstein/audio_clean/x/goldstein/audio/y.mp3#t=10,20`,
    );
  });
  it("leaves other URLs alone", () => {
    expect(cleanUrlOf(`${HOST}/goldstein/media/a.pdf`)).toBe(`${HOST}/goldstein/media/a.pdf`);
    expect(cleanUrlOf(`${HOST}/goldstein/audio_clean/a.mp3`)).toBe(`${HOST}/goldstein/audio_clean/a.mp3`);
  });
});

describe("clean manifest", () => {
  it("parses quoted CSV fields with commas, doubled quotes, a BOM and CRLF", () => {
    expect(parseCsv('\uFEFFid,key,size\r\na1,"x, ""y"".mp3",5\r\n\r\nb2,z.mp3,7')).toEqual([
      ["id", "key", "size"],
      ["a1", 'x, "y".mp3', "5"],
      ["b2", "z.mp3", "7"],
    ]);
  });

  const meta = (id: string, key: string, url: string) =>
    ({ id, media: { url, r2_key: key, mime_type: "audio/mpeg" } }) as unknown as RawMeta;

  it("is empty when the file is missing, and matches ids only when the key matches", () => {
    const root = mkdtempSync(join(tmpdir(), "clean-"));
    try {
      expect(loadCleanManifest(root).size).toBe(0);
      mkdirSync(join(root, "catalog"));
      const cleanKey = TANYA_KEY.replace("goldstein/audio/", "goldstein/audio_clean/");
      writeFileSync(
        join(root, "catalog", "r2_clean_manifest.csv"),
        `\uFEFFid,key,size,etag\n76303b6292,"${cleanKey}",121117485,abc-8\nbadbadbad0,goldstein/audio_clean/other.mp3,10,e\n`,
      );
      const m = loadCleanManifest(root);
      expect(m.get("76303b6292")).toEqual({ key: cleanKey, size: 121117485 });
      const { copies, mismatched } = resolveCleanCopies(
        [
          meta("76303b6292", TANYA_KEY, TANYA_URL),
          meta("badbadbad0", "goldstein/audio/elsewhere.mp3", `${HOST}/goldstein/audio/elsewhere.mp3`),
          meta("0000000000", "goldstein/audio/none.mp3", `${HOST}/goldstein/audio/none.mp3`),
        ],
        m,
      );
      expect([...copies.keys()]).toEqual(["76303b6292"]);
      expect(copies.get("76303b6292")).toEqual({ url: cleanUrlOf(TANYA_URL), size_bytes: 121117485 });
      expect(mismatched).toEqual(["badbadbad0"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("clean copies in the generated dataset", () => {
  let catalog: CatalogEntry[];
  let manifest: Manifest;
  let units: UnitPool;
  beforeAll(() => {
    const out = outDir();
    const mp = join(out, "manifest.json");
    const fresh =
      existsSync(mp) && (JSON.parse(readFileSync(mp, "utf8")) as Manifest).input_fingerprint === inputFingerprint();
    if (!fresh) build();
    manifest = JSON.parse(readFileSync(mp, "utf8")) as Manifest;
    catalog = JSON.parse(readFileSync(join(out, "catalog.json"), "utf8")) as CatalogEntry[];
    units = JSON.parse(readFileSync(join(out, "units.json"), "utf8")) as UnitPool;
  });

  it("counts clean_audio and only emits URLs for ids in the committed manifest", () => {
    const listed = loadCleanManifest(dataDir());
    const withClean = catalog.filter((e) => e.clean_url !== undefined);
    expect(manifest.counts.clean_audio).toBe(withClean.length);
    expect(withClean.length).toBeLessThanOrEqual(listed.size);
    for (const e of withClean) {
      expect(listed.has(e.id)).toBe(true);
      expect(e.clean_url).toBe(cleanUrlOf(e.url));
      const item = JSON.parse(readFileSync(join(outDir(), "items", `${e.id}.json`), "utf8")) as PublicItem;
      expect(item.media.clean_url).toBe(e.clean_url);
      expect(item.media.clean_size_bytes).toBe(listed.get(e.id)?.size);
    }
    for (const e of catalog.filter((x) => x.clean_url === undefined)) expect("clean_url" in e).toBe(false);
  });

  it("unit tracks carry clean_audio_url exactly for items with a clean copy", () => {
    const clean = new Map(catalog.filter((e) => e.clean_url).map((e) => [e.id, e.clean_url]));
    for (const u of units.units) {
      for (const t of u.tracks) expect(t.clean_audio_url).toBe(clean.get(t.id));
    }
  });
});

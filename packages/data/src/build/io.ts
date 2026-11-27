/** Locations and file reading for the build (Node only). */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawMeta, RawRecording, RawTranscript, RawVocabEntry } from "../raw.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** packages/data */
export const PACKAGE_DIR = resolve(here, "..", "..");
export const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");

/** The archive's data folder. Override with GOLDSTEIN_DATA_DIR (tests use a fixture). */
export function dataDir(): string {
  return resolve(process.env["GOLDSTEIN_DATA_DIR"] ?? join(REPO_ROOT, "data"));
}

/** Where the public dataset is written. Override with GOLDSTEIN_PUBLIC_DATA_DIR. */
export function outDir(): string {
  return resolve(process.env["GOLDSTEIN_PUBLIC_DATA_DIR"] ?? join(PACKAGE_DIR, "generated"));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else out.push(p);
  }
}

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  if (existsSync(dir)) walk(dir, out);
  return out.sort();
}

export function loadRecordings(root = dataDir()): RawRecording[] {
  const recDir = join(root, "recordings");
  return listFiles(recDir)
    .filter((f) => f.endsWith(".meta.json"))
    .map((f) => ({
      meta: readJson<RawMeta>(f),
      relPath: relative(recDir, f),
      transcriptPath: f.replace(/\.meta\.json$/, ".transcript.json"),
    }));
}

export function loadTranscript(rec: RawRecording): RawTranscript | null {
  return existsSync(rec.transcriptPath) ? readJson<RawTranscript>(rec.transcriptPath) : null;
}

export type RawVocabFile = Record<string, unknown> & {
  asr_glossary?: { correct: string; heard: string[] }[];
};

export function loadVocab(root = dataDir()): RawVocabFile {
  return readJson<RawVocabFile>(join(root, "vocabulary", "vocabularies.json"));
}

/** Vocabulary lists of objects with an id (topics, people...), skipping string lists and _meta. */
export function vocabLists(v: RawVocabFile): Record<string, RawVocabEntry[]> {
  const out: Record<string, RawVocabEntry[]> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k.startsWith("_") || !Array.isArray(val)) continue;
    if (val.every((e) => typeof e === "object" && e !== null && "id" in e && "label" in e)) {
      out[k] = val as RawVocabEntry[];
    }
  }
  return out;
}

export function loadIndex<T>(name: string, root = dataDir()): T | null {
  const p = join(root, "indexes", `${name}.json`);
  return existsSync(p) ? readJson<T>(p) : null;
}

/**
 * Cheap fingerprint of every input (data files and this package's source): path + size + mtime.
 * `ensure` skips the build when it matches the manifest.
 */
export function inputFingerprint(root = dataDir()): string {
  const h = createHash("sha256");
  const inputs = [
    ...listFiles(join(root, "recordings")),
    ...listFiles(join(root, "vocabulary")),
    ...listFiles(join(root, "indexes")),
    join(root, "catalog", "r2_clean_manifest.csv"),
    join(root, "catalog", "audio_frames.csv"),
    ...listFiles(join(PACKAGE_DIR, "src")),
    join(PACKAGE_DIR, "privacy-allowlist.json"),
  ];
  for (const f of inputs) {
    if (!existsSync(f)) continue;
    const st = statSync(f);
    h.update(`${f}\0${st.size}\0${st.mtimeMs}\n`);
  }
  return h.digest("hex").slice(0, 16);
}

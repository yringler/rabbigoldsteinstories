/**
 * The privacy gate. Scans every text file under the given folders (the generated dataset, and in
 * CI each app's dist/ and the API Worker bundle) for:
 *   - personal details from any item's hidden block (names of two or more words, addresses, phone
 *     numbers; see privacy.ts), and
 *   - internal keys (hidden, quality, provenance, identity_guesses, ...) in JSON.
 * Findings name the file and a term NUMBER, never the term itself, so CI logs stay clean.
 * Locally, `npm run privacy:gate -- --reveal <dirs>` prints the terms.
 *
 *   npm run privacy:gate -- apps/kids/dist apps/library/dist
 */
import { readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { FORBIDDEN_KEYS, findTerms, type TermSet } from "../privacy.ts";
import { listFiles, outDir, REPO_ROOT } from "./io.ts";
import { buildTerms } from "./terms.ts";

const TEXT_EXT = new Set([".json", ".html", ".htm", ".js", ".mjs", ".cjs", ".css", ".txt", ".xml", ".svg", ".map", ".webmanifest", ".md", ".csv", ".ts"]);
/** Keys distinctive enough to check in any JSON (app output too). */
const ALWAYS_FORBIDDEN = new Set(["hidden", "provenance", "identity_guesses", "proposed_new_terms", "on_air_people", "other_personal"]);

export interface Finding {
  file: string;
  problem: string;
}

function forbiddenKeys(value: unknown, keys: ReadonlySet<string>, path: string, out: string[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => forbiddenKeys(v, keys, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (keys.has(k)) out.push(`${path}.${k}`);
      forbiddenKeys(v, keys, `${path}.${k}`, out);
    }
  }
}

export function runGate(dirs: string[], terms: TermSet, opts: { reveal?: boolean } = {}): Finding[] {
  const findings: Finding[] = [];
  const termIndex = new Map(terms.terms.map((t, i) => [t, i]));
  const generated = resolve(outDir());
  for (const dir of dirs) {
    const abs = resolve(dir);
    const strictKeys = abs.startsWith(generated) ? new Set<string>(FORBIDDEN_KEYS) : ALWAYS_FORBIDDEN;
    const files = listFiles(abs).filter((f) => TEXT_EXT.has(extname(f).toLowerCase()));
    if (files.length === 0) findings.push({ file: relative(REPO_ROOT, abs), problem: "no files to scan (did the build run?)" });
    for (const f of files) {
      const rel = relative(REPO_ROOT, f);
      const text = readFileSync(f, "utf8");
      for (const hit of findTerms(text, terms)) {
        const label = opts.reveal ? `"${hit}"` : `#${termIndex.get(hit) ?? "?"}`;
        findings.push({ file: rel, problem: `contains hidden personal detail ${label}` });
      }
      if (f.endsWith(".json")) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          continue;
        }
        const bad: string[] = [];
        forbiddenKeys(parsed, strictKeys, "", bad);
        for (const b of bad.slice(0, 5)) findings.push({ file: rel, problem: `internal key ${b}` });
      }
    }
  }
  return findings;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("build/gate.ts");
if (isMain) {
  const args = process.argv.slice(2);
  const reveal = args.includes("--reveal");
  const dirs = args.filter((a) => !a.startsWith("--")).map((d) => resolve(process.env["INIT_CWD"] ?? process.cwd(), d));
  const targets = dirs.length ? dirs : [outDir()];
  const findings = runGate(targets, buildTerms(), { reveal });
  for (const f of findings) console.error(`${f.file}: ${f.problem}`);
  console.log(`privacy gate: ${findings.length} finding(s) in ${targets.map((t) => relative(REPO_ROOT, t) || ".").join(", ")}`);
  process.exit(findings.length ? 1 : 0);
}

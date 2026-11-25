/** The sensitive-term set for the whole archive (every item's hidden block). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildTermSet, publicNamesFromVocab, type TermSet } from "../privacy.ts";
import { dataDir, loadRecordings, loadVocab, PACKAGE_DIR, readJson, vocabLists } from "./io.ts";

export const ALLOWLIST_PATH = join(PACKAGE_DIR, "privacy-allowlist.json");

export function buildTerms(root = dataDir()): TermSet {
  const recs = loadRecordings(root);
  const lists = vocabLists(loadVocab(root));
  const allowlist = existsSync(ALLOWLIST_PATH)
    ? readJson<{ phrases: { phrase: string; reason: string }[] }>(ALLOWLIST_PATH).phrases.map((p) => p.phrase)
    : [];
  return buildTermSet({
    hiddenBlocks: recs.map((r) => r.meta.hidden),
    publicNames: publicNamesFromVocab(lists),
    allowlist,
  });
}

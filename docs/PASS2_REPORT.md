# Pass 2 report

Pass 2 merged six patch files into `items/` and `vocabularies.json` on 2026-11-25. The merge changed 698 of the 1,184 items. Afterwards, `scripts/validate_items.py all` found **1,184 valid items with 0 errors**, and `--file examples.json` found **8 valid with 0 errors**.

## How it was applied

- **Backup:** the pass-1 state is in `pass2/backup/`: `items/` (1,184 files), `vocabularies.json` and `vocab_compact.txt`. To roll back, copy those three back.
- **Script:** `scripts/apply_pass2.py` (run with `python -I -X utf8`). It runs in this order:
  1. It adds `vocab_additions` to `vocabularies.json`.
  2. It regenerates `vocab_compact.txt`.
  3. It applies the patches in this order: vocab, versions_speakers, dates, serials, same_story, deliverables. If `pass2/merge_fixes.json` exists, it applies that last; it wasn't needed this time.
  4. It runs checks on the relations.
- **Rebuilding:** by default the script rebuilds from `pass2/backup/items`, so running it again gives the same result. Each operation is also idempotent: a `set` writes the same value again, an add skips anything already present, and a remove does nothing if the link is already gone. A second run rewrote 0 files.
  - `--dry-run` applies everything in memory and writes nothing.
  - `--base items` applies the patches on top of the current items.
- **Log:** each run writes its counts, conflicts and post-check notes to `pass2/apply_log.json`.
- **vocab_compact.txt:** `make_vocab_compact.py` would overwrite two hand-edited speaker lines (`rabbi_chaim_levi_goldstein` and `bubby_chaya_malka`). The script runs the generator in a scratch folder, then copies those hand-edited lines back in. Both edits survived.
- **Match keys:** in `remove_relation`, the script accepts both `match.target_id` (used by serials and same_story) and `match.target` (used by versions_speakers).

## What changed, per task

| Task | Patches | Applied | Items touched | Main changes |
|---|---|---|---|---|
| vocab | 379 | 379 | 234 | 54 new vocabulary entries; 98 people tags, 31 calendar, 30 mitzvos and 20 midos added; 4 wrong stand-ins replaced; `kesuvim` and other source ids fixed in 59 items, plus 6 new sources; 2 rallies set to the new `simchas_beis_hashoeva_5785` series; `proposed_new_terms` emptied on 129 items |
| versions_speakers | 305 | 305 | 121 | Preferred copy picked in each duplicate group (+41 `superseded_by`); missing reverse links of `same_recording` and `alternate_take` added; 7 redundant `alternate_take` links removed; 17 copies changed from `review` to `publish`; 18 speaker changes (14 from unknown to R' Chaim Levi, 4 from Uncle Yossi to R' Chaim Levi, including the Sukkos 5786 rallies); 2 `quality.trim` content ends set |
| dates | 63 | 63 | 63 | 24 episodes given exact dates between anchors; eps 1 and 424 dated by hand; 39 clips given their episode's date |
| serials | 348 | 348 | 157 | Story keys and titles merged into one per serial; chapter numbers fixed (Storyteller 1988, Return of Yehudah 1986, Storyteller 1987); 208 relations added (`continues` and `part_of_set`); 2 wrong `continues` links removed |
| same_story | 1,083 | 1,083 | 351 | 95 stories linked across all their tellings: 859 `same_story` and 220 `same_story_other_language` links; 4 pass-1 links between copies of the same recording removed |
| deliverables | 1 | 1 | 1 | `private_family` flag added on 870d0298c2 ("motel chein") |

**Vocabulary** is now version 0.3. It has 54 new entries: people 32, calendar 12, works 3, mitzvos 4, midos 2 and series 1. No new id clashed with an existing one.

**Relation counts, before and after:**

| Relation | Before | After | Change |
|---|---|---|---|
| `same_story` | 61 | 910 | +849 |
| `same_story_other_language` | 2 | 222 | +220 |
| `part_of_set` | 141 | 338 | +197 |
| `superseded_by` | 23 | 64 | +41 |
| `continues` | 135 | 155 | +20 |
| `same_recording` | 88 | 106 | +18 |
| `alternate_take` | 33 | 40 | +7 |
| `clip_of`, `contains`, `aired_again_in` | | | unchanged |

## Conflicts and how they were resolved

- **Two tasks writing the same field:** none. No two tasks set the same path, or a path and one of its sub-paths, and no task added a relation that another task removed.
- **A pair linked as both a different telling and the same recording: 3 pairs.** In each, pass 1 had a `same_story` link, and versions_speakers then linked the same pair as `alternate_take` plus `superseded_by`. For the site these are re-recorded takes by the same speaker, not separate tellings, so the version links were kept and the `same_story` links were removed in both directions:
  - 3fecbf9b28 / ee84a13b26: "My Miracle" (COVID), Chanukah
  - 4ab732d2b6 / 5567ce3c30: "Slavita Printer", Part 2
  - b1a205211a / cce7163480: "Hashem's Name", Part 2
- **One-way `part_of_set` links:** 11 were left over from pass 1, and the reverse direction was added. The items affected include 09bc4fa30c, 129637fdeb, 998600af34, e9e5aa5a3f, 1916360509/45b8ad173e and 1ff3abfa6a/603890b365.
- **Checks that found nothing:**
  - no `superseded_by` cycles or chains, and no copy pointing to two preferred copies;
  - no item with two `continues` targets;
  - no removal of a relation that facts require;
  - no `same_story` and `same_story_other_language` links on the same pair.

## Final validation

- `python -I -X utf8 scripts/validate_items.py all` gave **1184 checked, 1184 valid, 0 with errors**.
- `python -I -X utf8 scripts/validate_items.py --file examples.json` gave **8 checked, 8 valid, 0 with errors**.
- No corrections were needed after the merge.

## Still open for the user

These come from the task notes. Details are in each patch file's `notes` and `review` fields and in the files listed below.

- **Names and identities:**
  - the Radatz's name ("Chaim Dovid Tzvi" or "Dovid Tzvi");
  - Rabbi Yehoshua ben Ilem;
  - the Yiddish narrator (probably five different people);
  - "Rabbi Levi Goldstein" as a radio guest;
  - Zaidy Moshe Yehuda as Uncle Yossi's father;
  - the name of the weekly series.
- **Simchas Beis Hashoeva series:** keep a separate series for each year (5785 and 5786), or merge them into one.
- **Facts fixes needed (these fields are locked):**
  - ep 230's filename date is a Monday;
  - ep 326's date conflicts with the audio;
  - 7c429e4277 and 9cc0f3d732 probably have the wrong episode numbers;
  - file "238" is the same recording as ep 287.
- **Dates left open:**
  - eps 125 and 126 both claim the same week;
  - ep 41 may be a re-aired show;
  - clip 09074ce59f is undated.
- **Serials:**
  - confirm the renumbered chapters, which differ from the catalog;
  - 9 single-episode stories still have a `classification.serial` field, since the patch format can't delete a field;
  - possible match between "Golden rods" and "The Golden Staff".
- **same_story:**
  - `6144d5e2ae` may reuse the radio audio;
  - `2647489fa0` follows the same script as "The Dike";
  - 5 links have lower confidence (0.75–0.8);
  - some same-recording pairs found along the way still have no link: 5e3346ab8e and ed960138a4 inside a06fb5b0d9; dc093bdc5d and 6a1de77edd; the three Shpoler Zeide clips.
- **Versions:**
  - whether to show halves cut from a complete recording;
  - listening checks on ep 373, Tanya shiur 56 and ep 136;
  - 7 arbitrary picks between identical copies;
  - 2 parts with no basis to pick a preferred copy.

## Pass 2 deliverables (in `pass2/`)

- [`pass2/REVIEW_QUEUE.md`](pass2/REVIEW_QUEUE.md): open version and speaker questions, and what to listen to.
- [`pass2/family_recordings.csv`](pass2/family_recordings.csv): 18 private family recordings, about 529 minutes (DECISIONS 2).
- [`pass2/to_confirm.csv`](pass2/to_confirm.csv): 9 identity and series-name questions with evidence (DECISIONS 3).
- [`pass2/serials_index.json`](pass2/serials_index.json): 26 radio serials and 67 airings, with chapters, segments, missing chapters and airings known only from the catalog.
- [`pass2/story_groups.json`](pass2/story_groups.json): the 95 stories told more than once, with each telling, its items, times, languages and tellers.
- [`pass2/series_summaries.json`](pass2/series_summaries.json): public descriptions and statistics for the 9 series.
- [`pass2/apply_log.json`](pass2/apply_log.json): the merge log.
- The patch files are `pass2/<task>.json`, and the scripts that built them are in `pass2/work/<task>/`.

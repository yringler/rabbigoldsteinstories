# Metadata scheme for the Story Archive: proposal for review

Draft v0.1, 2026-11-25. Files in `C:\Users\ybrin\Downloads\_metadata\`:

| File | What it is |
|---|---|
| `SCHEMA_PROPOSAL.md` | This document |
| `metadata.schema.json` | JSON Schema (draft 2020-12) for one item |
| `vocabularies.json` | Draft controlled vocabularies (built by `scripts/build_vocab.py`) |
| `examples.json` | 8 hand-filled items from the real transcripts (validate: 0 errors) |
| `scripts/` | Profiling scripts, the validator, and their outputs in `scripts/out/` |

Nothing in `StoryArchive` was modified.

---

## 1. What the profiling found

All counts are over the 1,184 converted items. They come from `scripts/profile_filenames.py`, `test_episode_hypothesis.py`, `text_match_clips.py`, `check_catalog_alignment.py` and `part_sets.py`.

### 1.1 The radio series is well structured and well documented

- **Episode files:** 418 files in the episodes folder.
  - 416 start with an episode number: 412 distinct numbers in the range 1–555.
  - Four numbers have two files each (372, 373, 374, 416).
  - The two files without a number ("mmm la gevina", "mmm la gevina 2") are sponsor jingles for La Gevina cheese, not episodes.
- **Missing episodes:** 143 numbers. That is 42–112 (as the folder name says) plus 72 scattered gaps.
- **Dates:** 109 filenames carry an air date (4 from 1982, 105 from 1986–89).
  - Number order and date order never disagree, and the shows are weekly on Tuesday nights. So most other air dates can be interpolated and then confirmed from cues in the audio: "today is Dalet Iyar", candle-lighting times, "this Friday is the first night of Chanukah".
- **The producer's master tape catalog is in the archive and it is reliable.** The file is `documents/.../TZH Catalouge updated (1).docx`.
  - Row N describes episode N. Its columns are visiting children, topic (midah, mitzvah or Yom Tov) and story title.
  - Test: how many of the catalog title's words appear in the transcript. When row N is compared with episode N, the hit rate is 0.77. When it is compared with episodes N±1, the rate is 0.40 or lower, and serial stories running across neighbouring weeks inflate even that figure.
  - Coverage of the 412 episodes in the archive: story title for 383, topic for 137, visitor names for 91.
  - It also lists 44 of the missing episodes by story title.
  - Parsed copy: `scripts/out/tzh_master_catalog.csv`.
- **The 2010 transfer list confirms the gaps.** The file `list TZH 5-11-10 (1).doc` marks 80 episodes "M". All 80 are absent from the archive.
- **Several files need cleanup before or alongside the fill-in:**
  - Episode "16" (6d98153d65) is the defective item.
  - "113 bad recording" is noisy, but its ASR is fine.
  - Episodes 246 and 399 each end with 22–33 minutes of blank tape.
  - "416 new" is a 5-minute fragment.

### 1.2 Episode-number hypothesis: confirmed

The hypothesis: the number at the end of a topical-folder filename is the episode the clip was cut from.

- **385 of the 389 topical radio clips** end in a number.
  - All 385 numbers are episodes that exist in the archive.
  - None falls in the missing set. By chance alone, about 26% would.
- **Text check.** For 384 of 385 clips, at least half of the clip's word 6-grams occur in the episode with the same number. The usual figure is 0.85–0.97.
  - The one exception, "Havdalah 428", is found in episodes 427, 276 and 379. It is probably mislabeled.
- **Audio-fingerprint check** (probable_duplicates.csv):
  - 210 "contained in" pairs link a clip to its same-numbered episode.
  - The 31 pairs that point to a different episode are reruns, not contradictions. The same talk or story was re-aired, for example "Netilas Yodayim 122", which also aired in 25, 135, 224 and 376.
  - 124 clips appear almost word for word in two or more episodes.
  - Practical upshot: the filename number identifies the airing a clip was cut from. It is not a unique ID for the content.
- **The script gives each clip's position inside its episode** (seconds, `clip_text_matches.csv`). Segment pages can therefore link to the clip and back without manual work.
- **280 of the 412 episodes** have at least one clip cut from them.
- **Heritage Series 2:** 22 of 25 numbered files sit inside the episode with that number.
  - "At Home Everything Is Different 499" is found in 498.
  - "Shema Beni 1/2" carry part numbers and belong to a different, older program, *Shema B'ni*.
  - Inside a Heritage subfolder, "-1/-2/-3" marks pieces of one airing, not separate tellings. Example: Torah the Best Thing 280/281 = 384/385.
- **Top-level Stories:** 39 titles end in a number, and none of them match an episode. There the number is a part number ("negel vasser 1–4") or a night number ("Simchas Beis Hashoeva 3/6").

### 1.3 Other filename patterns

- **Multi-part sets outside the radio series:** 30 sets covering 68 items. They use six different marker styles:

  | Marker style | Items | Example |
  |---|---|---|
  | `part N` | 21 | 10 gifts Besht part 1 |
  | trailing digit | 28 | negel vasser 3 |
  | `-N` | 7 | Baal Shem Tov Saved a Neshama -2 |
  | letter | 7 | Slavita printer a / B |
  | leading `01.` | 2 | 01. Logs and alter rebbe |
  | other | — | hg1a / hg1b |

  - Four lone parts have no sibling, for example "Kidnapped Part 1".
- **Takes and versions:**
  - Same-title groups: "Im Yirtze Hashem" ×2, "Rashi's Prophecy" ×2, "Hashems name A" vs "Hashems name. A".
  - Filenames carry production notes: `good`, `final`, `unedited`, `redo`, `new`, `bad recording`, `needs splicing`, `needs editing in wavelab`, `seems like tanya double`.
- **The 43 Tanya files** are named `<lecture no.> P<perek>`, for example "22 P5-6" or "33b siyum P 17 begin P18".
  - The perek in the name is confirmed by the content in the two shiurim we checked.
  - A shiur can also cover Shulchan Aruch HaRav and seasonal talks. "29 P13" is half Hilchos Hashkamas HaBoker and ends with an Elul talk.
- **ASR language routing went wrong for a few items.** Some were transcribed with the Yiddish model because their title is in Hebrew script, but the speech is English:
  - "4 חכמות" (both files)
  - "מלוה מלכה" (the same recording as "The Melave Malka Special Guest")
  - "נשיקה חסידית" (mostly English)

  The 11 items whose language was "guessed from Hebrew-script name" should be checked and re-transcribed before the fill-in.
- **Repeated stories under different names:**
  - Same story, different telling: "Besht to the Rescue" / "The Besht to the Rescue".
  - Same story in English and Yiddish: "3 din toras" / "דריי דין תורה'ס".
  - Same recording: "Bubby Chaya Malka 1" contains "Besht and the Bear".

  Pass 2 has to find these.

### 1.4 What the transcripts look like (sample of ~45 items in every folder, both languages)

The sample was read by me plus four parallel readers. Their notes are condensed in Appendix C.

- **Radio episode (30 min): the format is very consistent.** Each part opens with a stock phrase, so segment boundaries are easy to find:
  1. Theme song, not transcribed
  2. Greeting
  3. Topical talk, often a teaching of the Rebbe for the season
  4. Sponsor
  5. Hakochainik march ("…and away we go!")
  6. "Your treat for the day… story time"
  7. Shema with guest children ("Studio 604")
  8. Tzedakah
  9. Story chapter, often a serial ("wait till you hear… next chapter")
  10. Mailbox ("splashdown")
  11. Announcements: candle time, birthdays, refuah shleimah, contests
  12. Closing

  Songs show up only as jumps in the timestamps. On-air story titles are often not spoken, which is why the master catalog matters.
- **Radio clips:** mostly self-contained 2–9 minute talks or stories. Some end with "here's today's story…", which is not included, and some are teasers.
- **Story recordings** fall into four groups:
  - The contemporary weekly storyteller. Every recording opens with the song "I believe in Hashem, I trust in Hashem", ties the story to the week, and states the lesson. Live rallies belong to this group.
  - Older dramatized readings, some running 90–100 minutes.
  - Maaseh Rav (stories the Rebbe told, with his explanation).
  - **Private family recordings:** a grandfather's memoir, grandparents telling stories to named grandchildren, a father with his toddler.
- **Yiddish:** Tanya shiurim for adults, a Haggadah course, grandmother's stories and children's stories. The ASR is good enough for an English summary and for perek or story boundaries. It garbles names and loshn-koydesh, so it is not suitable as a public text.
- **Reliable to extract:** genre, plot and lesson, the historical figures, the holiday or parsha tie-in, segment boundaries, whether a piece is a serial chapter, and Hebrew dates stated on air.
- **Risky to extract:**
  - The exact spelling of names. ASR writes "pirates" for poritz and often "Moshiach" for Moshe. A glossary of 48 known errors is in `vocabularies.json`.
  - On-air titles.
  - Anything sung.
- **Privacy:** most radio episodes read children's full names on air. Some also read home addresses and names of sick children.

---

## 2. Design principles

1. **One JSON per item, keyed by the catalog id.**
   - Facts a script can determine (folder, episode number, date in the filename, catalog row, audio-match relations) are filled first and locked.
   - The LLM fills only what needs listening or understanding.
2. **Everything public is in English.** Yiddish items get English titles and summaries plus their Hebrew-script title.
3. **Small, closed vocabularies for facets.** Free text is limited to titles, summaries, lesson, keywords and character names.
4. **Lean.** Every field below has a website use. Fields marked *later* can stay empty in the first run.

## 3. Fields

Source key: **D** = deterministic (script), **L** = LLM from the transcript, **D+L** = script value checked or extended by the LLM, **P2** = cross-item second pass.

Reliability is what I expect from the LLM pass, judged from the examples.

| Field | Type / values | Src | Website use | Reliability | Core? |
|---|---|---|---|---|---|
| `id`, `source.*` (folder, filename title, duration, filename facts, master-catalog row) | strings, numbers | D | internal; provenance | exact | core |
| `display.title` | ≤90 chars, Chabad transliteration | D+L | item page, cards, SEO title | high | core |
| `display.title_he`, `title_translit` | Hebrew script / romanized | D | Yiddish items, search | exact / high | core for Hebrew-script titles |
| `display.title_basis` | filename / master_catalog / on_air / content | L | internal QA | high | core |
| `display.summary_short` | ≤220 chars | L | cards, search results, meta description | high | core |
| `display.summary_long` | 80–220 words, English | L | item page | high (EN), medium-high (YI) | core |
| `display.lesson` | ≤300 chars or null | L | item page; teachers searching "a story about honesty" | high: lessons are usually stated on air | core |
| `display.keywords` | ≤12 short nouns | L | full-text search boost | medium | core |
| `classification.content_type` | 13 values | D+L | browse facet | high | core |
| `classification.story_type` | 9 values (chassidic, tanach_midrash, talmudic…) | L | browse facet | high | core |
| `classification.series` | 10 series | D (+L for top-level stories) | series pages | high | core |
| `classification.speakers` | vocab | D+L | item page, browse by narrator | medium (names rarely said) | core |
| `classification.standalone` | standalone / needs_context / cliffhanger / teaser / fragment | L | "play this alone?" badge; hide fragments from kids' browse | high | core |
| `classification.episode` | number, is_clip | D | episode guide, clip → episode link | exact | core (radio) |
| `classification.date` | gregorian (partial ok), hebrew, precision, basis | D+L | "broadcast Dec 1989", sorting | high with a date in the filename; medium if interpolated | core |
| `classification.serial` | story title, chapter, story_key | D (catalog) + L + P2 | play the serial in order | medium-high | core (radio) |
| `classification.part` | set_key, part n of m | D | "Part 2 →" navigation | high | core |
| `classification.study_text` | work, unit, from–to, lecture no. | D+L | Tanya index by perek | high (filename confirmed) | core (shiurim) |
| `audience.level`, `age_min` | 6 levels; integer | L | age filter | medium (judgment call) | core |
| `audience.advisories` | flag (11) + severity + note | L | parent note; optional filter | medium-high | core |
| `audience.privacy` | flag (6) + note (never displayed) | L | decides what is published or bleeped | high for names and addresses | core, internal |
| `subjects.people` | vocab id + role (central / appears / mentioned / teaching_cited) | L | browse "stories about the Baal Shem Tov"; person pages | high for famous figures | core |
| `subjects.characters` | free text | L | item page, search | medium | optional |
| `subjects.topics` | 1–5 of 35 (two levels) | L | main browse | medium-high | core |
| `subjects.midos` | 28 | L | "stories about honesty" | medium-high | core |
| `subjects.mitzvos` | 54 | L | browse, teachers | high | core |
| `subjects.calendar` | 57 holidays, special dates, seasons | L (D for the folder hint) | "something for Chanukah"; seasonal homepage | high | core |
| `subjects.parshiyos` | 54 | L | parsha browse | high when stated | core |
| `subjects.sources_cited` | work (31) + ref | L | item page ("Source: Kiddushin 31a") | medium: only when said | core (often empty) |
| `subjects.places` | free text | L | search | medium | later |
| `segments[]` | start/end sec, type (20), title, summary, people, story_key, linked_items | L (+D for clip offsets) | chapter markers in the player; deep links; series episode guide | high for radio; medium for Yiddish | core for radio and items >15 min; optional otherwise |
| `relations[]` | type (10), target, evidence, confidence, offset | D + P2 (+L) | "Also in episode…", "Part 2", "Same story in Yiddish", de-duplication | high (D), medium (P2) | core |
| `language` | primary, spoken, transcript language, transcript_language_ok | D+L | language filter; ASR re-run list | high | core |
| `quality` | audio, transcript, issues (17), trim, publish_recommendation, notes | D+L | internal triage; "remastered" notes | medium | core, internal |
| `provenance` | method, model, per-field confidence, needs_human_review | L | review queue | n/a | core, internal |
| `proposed_new_terms[]` | vocabulary, label, suggested_id, used_instead | L | vocabulary reconciliation | n/a | core, internal |

**Public by default:** display, classification, audience.level/age/advisories, subjects, segments, relations.

**Internal:** source, audience.privacy, quality, provenance, proposed_new_terms.

**Deliberately left out** (can be added later): slugs and SEO text (derived at build time from title and summary); full transcript text (a publishing decision, see open questions); per-segment advisories; the names of visiting children.

## 4. Vocabularies (summary; full lists in `vocabularies.json`)

| Vocabulary | Size | Notes |
|---|---|---|
| people | 101 | Categories: Tanach (35), Sages (17), Rishonim/Acharonim (12), Baal Shem Tov circle and Chassidic masters (17), Chabad Rebbeim (7), Rebbeim's family (7), Chassidim (6). Each entry has a label, aliases (known ASR spellings) and an optional Hebrew name. |
| topics | 35 | Two levels. Examples: Stories of Tzaddikim, then Baal Shem Tov / Chabad Rebbeim / The Rebbe; Emunah & bitachon, then hashgachah pratis / miracles; Mitzvos in daily life, then Shabbos / kashrus / waking up; Calendar, then parsha; also Moshiach, Jewish history, Chassidus & Tanya, Hiskashrus, Tzivos Hashem, Hashem in nature, Family heritage. |
| midos | 28 | Ahavas Yisroel, achdus, emes, bitachon, simcha, hakaras hatov, anavah, judging favorably, controlling anger, self-control/yetzer hara, kabbalas ol… |
| mitzvos | 54 | Daily mitzvos (Shema, negel vasser, brachos, tefillin…), interpersonal mitzvos (tzedakah, hachnasas orchim, pidyon shvuyim, kibbud av va'em…), holiday mitzvos, the Rebbe's campaigns. |
| calendar | 57 | Yomim Tovim, fast days, Chassidic dates (Vov Tishrei, Yud-Tes Kislev, Yud Shevat, Gimmel Tammuz, Chai Elul…), special Shabbosos, seasons (Sefirah, Three Weeks, Elul, summer vacation, Hakhel year). Each has its Hebrew date. |
| parshiyos | 54 | |
| works | 31 | For `sources_cited` and `study_text`. |
| content_type 13 · story_type 9 · segment_type 20 · series 10 · speakers 7 | | Small closed lists. |
| audience_level 6 · content_advisory 11 · privacy_flag 6 · quality_issue 17 · relation_type 10 | | |
| transliteration + asr_glossary (48) | | Style rules ("Shabbos, Sukkos, mitzvos") and known ASR errors, used by the prompt and as search synonyms |

## 5. Worked examples (`examples.json`)

| # | Item | What it shows |
|---|---|---|
| 1 | Episode 408 (12-19-89) | Full segment breakdown, serial chapter 2 of "The Storyteller" (inferred from catalog rows 407/409), link to the clip "Chanukah 408" at 82 s, privacy flags (address read on air) |
| 2 | Netilas Yodayim 122 (Inyonei Mitzvos) | Clip: clip_of episode 122 at 803 s, re-aired in 25/135/224/376, alternate take, interpolated date |
| 3 | Besht to the Rescue (top level) | Story: series attribution by narrator style, same story told again in Story Videos, advisories (kidnapping, forced conversion) |
| 4 | The Drunken Father 21 (Heritage) | Heritage item = clip of episode 21, exact date from "Dalet Iyar 5742", parsha tags, alcohol advisory, a `proposed_new_terms` entry |
| 5 | The Melave Malka Special Guest (Story Video) | Lesson with stories and a halachah digression as segments; duplicate copy transcribed with the wrong model |
| 6 | Tanya 29 P13 (Yiddish) | Shiur: two study texts (Shulchan Aruch HaRav 1:4–5 and Tanya 13), stories as nested segments, date from a sibling filename, ASR loop |
| 7 | דריי דין תורה'ס (Yiddish story) | Hebrew title + transliteration + English summary; same story in English ("3 din toras") |
| 8 | Red Ivan, part 1 | Part set, cliffhanger, parsha tie-in (Bereishis) |

Validate with:

```
python -I -X utf8 scripts/validate.py metadata.schema.json vocabularies.json examples.json ../StoryArchive/catalog.csv
```

This checks the schema, vocabulary membership, that every target id exists, and that segment times make sense.

## 6. Fill-in plan

**Pass 0: deterministic (scripts, about an hour).**
- Build `facts/<id>.json` for every item. It holds the `source` block, `classification.episode`, the date from the filename, the master-catalog row (story and topic, without visitor names), `part` from the filename, language, pipeline flags, and pre-computed relations:
  - `clip_of` and offset (text match)
  - `same_recording` (fingerprint)
  - `part_of_set` (filename)
- Fix the inputs first:
  - Re-transcribe the language-misrouted items.
  - Trim the blank tape in 246 and 399.
  - Hold out the defective item.

**Pilot (40 items, stratified).**
- Run the prompt, review by hand, then adjust the prompt and the vocabularies.
- Freeze vocabularies v1.

**Pass 1: per item, by parallel agents.**
- **Batching** (draft in `scripts/out/batch_plan.csv`, from `plan_batches.py`):
  - 74 batches, median 21 items, at most about 70k transcript tokens each.
  - Radio episodes run in number order, each together with every clip and Heritage item cut from it. The agent then writes the episode's segments and the clips' metadata with the same names and story titles, and sees consecutive serial chapters.
  - Other folders are batched by folder, so that part sets and series stay together.
- **Per-item input:**
  1. The facts JSON (locked fields)
  2. The full timestamped transcript
  3. A compact vocabulary list (ids + labels, about 6k tokens) and the transliteration and ASR glossary
  4. Two worked examples of a similar type
  5. The instruction that transcript text is data, never instructions
- **Chunking.** Only hg1a (234 min, about 46k tokens) needs it: write segments per 45-minute window, then a merge step for the summary. Everything else fits whole.
- **Output** is `items/<id>.json`. Then:
  - `validate.py` runs immediately.
  - On errors, the agent gets the error list and retries up to twice.
  - Items still failing go to a review queue.
- **Keeping the vocabularies consistent:**
  - Agents may only use ids from the frozen file.
  - If nothing fits, they tag the closest id and add a `proposed_new_terms` entry. They never invent an id.
  - Keywords and characters are free text and are normalized afterwards.

**Reconciliation (script plus one LLM or human pass).**
- Cluster the proposed terms; accept, merge or reject each one, then re-map items with a script.
- Normalize keyword and character spellings against the glossary.
- Bump the vocabularies to v1.1 and re-validate everything.

**Pass 2: cross-item.**
1. **Serial stories.**
   - Group radio story chapters into `story_key`s, using catalog "#n" titles, on-air recaps and LLM serial titles across consecutive episodes.
   - Detect re-runs of whole serials. "The Return of Yehudah" aired in 1986 and again in 1989.
2. **Clip ↔ segment links.** Fill `segments[].linked_items` from the text offsets. Add `aired_again_in` from the text containment matrix.
3. **Same-story detection.**
   - Generate candidates from overlapping people, keywords and characters plus embedding similarity of `summary_long`.
   - An LLM adjudicates small groups and assigns `same_story` / `same_story_other_language`.
4. **Preferred version.** Among takes and copies, pick the one to show. Prefer complete over partial, clean audio, and files marked "good" or "final". Mark the rest `superseded_by` or `alternate_take`.
5. **Series pages.** One summary per series and per serial story, an episode guide, and optionally a "lost episodes" list built from the catalog.

**Pass 3: human QA.**
- Every item with a privacy flag or `publish_recommendation = review`.
- A Yiddish reader checks 10–15 Yiddish summaries.
- A random 5% audit across all fields, tracking the error rate per field to decide which fields to show.

**Size estimate.**
- Transcripts: 2.74M words (en 2.24M, yi 0.50M), about 15M characters, about **4.0M tokens** (en ≈3.1M, yi ≈0.9M; the Yiddish ratio is uncertain by about ±30%).
- Pass 1 overhead: prompt, vocabularies and examples at about 15k tokens × 74 batches ≈ 1.1M (less with caching).
- Pass 1 output: about 1.5k tokens per item, plus about 2k for the segments of each radio episode, ≈ **2.5M tokens**.
- Pass 2: about 0.5–1M tokens.
- Total: roughly **6M input + 3M output tokens**.
- With ~10 agents in parallel, Pass 1 takes a few hours of wall time.

## 7. Open questions for you

1. **Children's names and addresses on air.**
   - Nearly every episode has a Shema guest and a mailbox; many give full names, some give addresses or names of sick children.
   - Options: publish as is (historical broadcast), bleep or trim the specific spots (the privacy flags give the seconds), or withhold those episodes.
2. **Private family recordings.**
   - The items: Zaidy Moshe Yehuda's memoir, Bubby stories (English and Yiddish), the father-and-toddler Sefirah recording, the "motel chein" fragment.
   - Public, family-only (unlisted), or excluded? A middle option: publish only the story segments.
3. **People.**
   - Is "Uncle Yossi" the same person as Rabbi Yosef Goldstein (Tanya, *Shema B'ni*)?
   - Who is the "I believe in Hashem" storyteller, and what is that series really called?
   - Who narrates the Yiddish stories?
4. **The defective item** (episode "16", a 3-second loop): hide until a good copy is re-downloaded?
5. **Songs, sponsor ads and promos.**
   - Index them only as segments, or also publish song clips ("Purim Song 369", "I thank you Hashem") as items?
   - Any music rights concerns?
6. **Clips vs episodes.**
   - Show the about 389 radio clips as their own items, or only as chapter marks inside the episodes?
   - My suggestion: keep both, with the clip page pointing to the episode as the canonical source.
7. **Duplicates and takes:** hide superseded copies (for example "Caliph's Secretary part 1" vs the full file) or list them as versions?
8. **Transcripts:**
   - Show the English ASR text, labelled "automatic transcript"?
   - Keep the Yiddish text for search only?
9. **Lost episodes:** list the 143 missing numbers (44 with known story titles) so listeners can help find tapes?
10. **Content advisories:** show them as visible notes for parents, as a filter only, or both? Are the 11 flags and the age bands right for your audience?
11. **Before the run:**
    - Re-transcribe the 11 items with a guessed language.
    - Trim episodes 246 and 399.
    - Convert Hebrew dates with a calendar library rather than trusting the LLM.
12. **Heritage Series:** its own series page, or fold it into the radio series (its items are all radio segments)?

---

## Appendix A: scripts and outputs

| Script | Purpose | Output (`scripts/out/`) |
|---|---|---|
| `profile_filenames.py` | Per-folder patterns, episode numbering, dates, parts, title groups | `profile_items.csv` |
| `test_episode_hypothesis.py` | Clip numbers vs the fingerprint pairs in probable_duplicates.csv | (stdout) |
| `text_match_clips.py` | 6-gram containment of every English item in every episode; best match and offset | `clip_text_matches.csv` |
| `parse_tzh_catalog.py` | Master tape catalog docx → CSV | `tzh_catalog_raw.csv`, `tzh_master_catalog.csv` |
| `check_catalog_alignment.py` | Proves row N = episode N | `tzh_catalog_alignment.csv` |
| `part_sets.py` | Part and take groups outside the radio series | (stdout) |
| `plan_batches.py` | Token estimate and draft batches | `batch_plan.csv` |
| `build_vocab.py` | Generates `vocabularies.json` | |
| `validate.py` | Schema, vocabulary and reference validation | |

Run each with `python -I -X utf8 scripts/<name>.py …`; the usage line is in each file's docstring. `validate.py` needs jsonschema; it is vendored in `scripts/_vendor` because `-I` ignores user site-packages.

## Appendix B: radio episode segment cues (for the prompt)

| Segment | Cue |
|---|---|
| Greeting | "Shalom, dear children… This is your Uncle Yossi inviting you all once again…" |
| March | "our weekly Hakochainik march… long spoon… good old chainik… away we go!" … "How'd you like that for our Hakochainik March?" |
| Story | "here comes your treat for the day… story time"; chapter end: "wait till you hear what happens in the next chapter" |
| Shema | "what we do every Tuesday night right before story time… first twelve words of the holy Shema… guest in Studio 604… Are you a member of Tzivos Hashem?" |
| Mailbox | "deep dive into Uncle Yossi's own overloaded mailbox… How'd you like that for a splashdown?" |
| Closing | "thanking you all for tuning in tonight… Until we meet again… Shalom dear children, and shalom to everyone." |

Songs leave timestamp gaps (the line before a song carries the song's duration). Use the JSON end times when exact cut points matter.

## Appendix C: sample reading notes (condensed)

- **Radio episodes read:** 7, 30, 113, 150, 246, 303, 358, 399, 408, 416, 540.
  - Where the catalog gives a topic, it matched.
  - Wherever the story was reached, it matched the catalog story, either by title or as the same plot under a different on-air title. Ep. 408's catalog row is blank. "416 new" breaks off before the story.
  - Ep. 358 holds a chapter of the 1986 serial "The Return of Yehudah", which shows that 1989 episodes rerun older serials.
  - Ep. 540 (about 1992) has no march because it falls in the Three Weeks.
- **Radio clips and Heritage:** most are clean units.
  - Teasers: "Shpoller Zeide 397", "Achdus 1".
  - Mislabeled by scope: "Secret Tunnel 506" runs on into a mailbox and a Shabbos-candles talk.
  - "Rabbi Akiva negel vasser" holds three pieces. One is the "no happy ending" drunk-father story, which suits ages 9+.
- **English stories:**
  - "some drasha" is mistitled; it is a children's hashgachah story.
  - "The Caliph's Secretary part 1" is an earlier edit of the full 103-minute file.
  - "Chanukah Stories" is cut off at the end.
  - The strongest content advisories are in the long dramatized readings: "The Runaway" (a murder, in a dream) and "Caliph's Secretary" (slavery, whipping, forced conversion).
- **Yiddish:**
  - Tanya "22 P5-6" really holds two sessions (end of ch. 5; a review and then ch. 6) with timestamped Baal Shem Tov stories.
  - "hg1a" (234 min) is the master Haggadah course; Haggada 1–3 and hg2a/3a are takes or excerpts of it.
  - "4 חכמות" is in English.
  - "sefiras ha'omer SZ" is a father with his named toddler (private).

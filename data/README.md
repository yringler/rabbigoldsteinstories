# data/

| Folder | Contents |
|---|---|
| `recordings/` | One entry per recording, in the same folder layout as the audio in R2. Each has three files (below). |
| `catalog/` | Tables that link recordings, original files, paths and R2 keys. `recordings_index.csv` is the entry point. |
| `vocabulary/` | `metadata.schema.json` (JSON Schema, draft 2020-12, version 0.3), `vocabularies.json` (controlled lists), `vocab_compact.txt` (ids and labels only, for prompts), `examples.json` (8 hand-made reference items). |
| `indexes/` | Cross-recording indexes for website pages: serials, story groups, series summaries. |
| *(no documents folder)* | The 15 non-audio files from the original archive (PDFs, images, and the producer's master tape catalog of the radio show, `TZH Catalouge updated (1).docx`) are in R2 under `goldstein/media/`, unchanged. Find them through `catalog/media_catalog.csv`. |

## recordings/: the three files per recording
For `<folder>/<name>`, for example `Uncle Yossi - Tzivos Hashem on the Air/Episodes/5742 (1981-82)/Ep 003 - The Tall Chanukah Candles (Chanukah) (1981-12-22)`:

### `<name>.meta.json`: AI metadata, valid against `vocabulary/metadata.schema.json`
- `id`: the stable 10-hex recording id (joins every file).
- `media`: where to play the audio.
  - `url` (public, for example `https://storiesmedia.torahlearningtools.com/goldstein/audio/...mp3`)
  - `public_host`, `r2_bucket` (`stories`), `r2_key`, `size_bytes`, `mime_type`
  - The rule: `url` = `https://` + `public_host` + `/` + percent-encoded `r2_key`, keeping `/`.
- `source`: deterministic facts (original filename, folder, duration, master-catalog row, audio path). Internal.
- `display`: public text.
  - `title`, plus `title_he` and `title_translit` for Hebrew-script titles.
  - `summary_short` and `summary_long`, always in English, including for Yiddish recordings.
  - `lesson` and `keywords`.
  - `transcript_display`: whether the transcript may be shown.
- `classification`:
  - `content_type` (radio_episode, radio_segment, story, story_chapter, shiur, lesson_with_story, live_event, family_recording, song…) and `story_type`.
  - `series`, `speakers` and `collections`.
  - `episode` (number, is_clip).
  - `date`: gregorian (may be partial), hebrew, precision, basis.
  - `serial`, `part` and `study_text` (for example Tanya perek).
- `audience`: `level`, `age_min`, `advisories` (shown to parents), `privacy` (internal flags).
- `subjects`: `people` (vocabulary id plus role), `characters`, `topics`, `midos`, `mitzvos`, `calendar`, `parshiyos`, `sources_cited`, `places`.
- `segments[]`: chapter marks with start and end seconds, type (opening, talk, story, story_chapter, song, sponsor, shema_guest, mailbox, announcement…), title and summary. Radio episodes are fully segmented.
- `relations[]`: `{type, target_id, evidence, confidence, offset_sec}`. Types are clip_of / contains, aired_again_in, same_recording, alternate_take, superseded_by, part_of_set, continues, same_story, same_story_other_language.
- `language`: spoken language and transcript language (en / yi).
- `quality`: audio and transcript issues, `trim` (where the content ends; the audio itself is never edited), `publish_recommendation` (publish / publish_with_note / review / hide). Internal.
- `provenance`: how it was produced, per-field confidence, `needs_human_review`. Internal.
- `hidden`: **never publish.** Names, addresses and other personal details heard on air, with timestamps.
- `identity_guesses`: evidence-backed guesses for unconfirmed placeholder people.
- `proposed_new_terms`: tags an agent wanted that aren't in the vocabulary yet (empty after reconciliation).

### `<name>.transcript.json`: automatic transcript
`{id, language, model, duration, segments: [{start, end, text, avg_logprob, no_speech_prob, words: [[start, end, word, probability], …]}]}`.

English came from faster-whisper `large-v3-turbo`; Yiddish (in Hebrew script) from `ivrit-ai/yi-whisper-large-v3-turbo`. Quality is good enough for search and summaries. Expect phonetic spellings of Hebrew terms; there is a glossary of known ASR errors in `vocabularies.json` → `asr_glossary`. Yiddish transcripts are for search only, not for display.

### `<name>.transcript.txt`
The same transcript, one `[mm:ss.xx] text` line per segment.

## catalog/
| File | Rows | Notes |
|---|---|---|
| `recordings_index.csv` | 1,184 | id, title, folder, name (base filename in `recordings/`), audio_url, audio_r2_key, duration_min |
| `catalog.csv` / `.json` | 1,243 | One row per **original** file in the Google Drive download, including 44 duplicates and 15 documents. Gives provenance (zip, original path, sha256, codec, loudness), `out_path` (current audio path, relative to the archive root), `dup_of`, `language_guess` |
| `moves.csv` | 1,184 | Path before and after the folder reorganization |
| `r2_manifest.csv` | 1,184 | id → R2 key, size, etag (audio) |
| `media_catalog.csv` | 15 | Non-audio files: id, original_path, key (`goldstein/media/…`), public url, content_type, size, etag |
| `transcripts_index.csv` | 1,184 | Transcript QA stats and flags |
| `probable_duplicates.csv` | | Audio-fingerprint pairs with a `relation` label |
| `audio_frames.csv` | 2,368 | MP3 frame table per audio file, for HLS (`docs/design/hls.md`): id, variant (`original` \| `clean`), first_byte, frame_count, bitrate_kbps, sample_rate, size_bytes. Written by `tools/4-r2/scan_audio_frames.py` from the public host; rerun it after uploading or re-encoding audio (a row whose size no longer matches is ignored). |

Audio key in R2: `goldstein/` + `out_path` (for example `goldstein/audio/Maaseh Rav/….mp3`).

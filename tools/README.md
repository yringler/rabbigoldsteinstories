# tools/

Snapshots of the scripts that built the archive, by stage. They ran on the owner's Windows PC with working folders under `C:\Users\ybrin\Downloads\`. The paths in them are absolute, so adjust them before running elsewhere. Install dependencies with `pip install -r requirements.txt` (repo root); ffmpeg and ffprobe must be on PATH.

| Script | Purpose |
|---|---|
| `validate_repo.py` | **Use this.** Validates every `data/recordings/**/*.meta.json` against the schema and vocabularies, from the repo alone. |
| `export_repo.py` | Refreshes `data/`, `docs/`, `review/` and the tool snapshots from the working folders on the owner's PC. |

## 1-normalize/: raw Google Drive download → clean MP3 library
`pipeline.py run | dedup [--apply] | export | report | status`. It is resumable through a SQLite state db.
- **Input:** Drive zips and loose videos.
- **Output:** `StoryArchive/audio/…` as MP3, mono, 96 kbps, 44.1 kHz, two-pass loudnorm to −16 LUFS.
- **Mapping:** `catalog.csv` maps every original file to its output.
- **Deduplication:**
  - byte-identical files (sha256);
  - identical decoded audio;
  - fingerprint near-duplicates (conservative; uncertain pairs go to `probable_duplicates.csv`).
- **Safety:** sources were deleted only after the output was verified.

## 2-transcribe/: speech to text
- `kaggle-kernel/`: the Kaggle notebook (2×T4) that transcribed everything in 4.4 h.
  - Each GPU runs its own worker.
  - English uses faster-whisper `large-v3-turbo` with a Chabad vocabulary prompt; Yiddish uses `ivrit-ai/yi-whisper-large-v3-turbo-ct2`; when the language is unknown, it is auto-detected (Whisper reports Yiddish as German, which also counts as Yiddish).
  - It can resume from previous output.
- `build_dataset.py`: builds the Kaggle dataset as `<id>.mp3` plus `manifest.csv`. Kaggle caps a dataset at 1,000 files, so it was split in two.
- `kg.py`: Kaggle CLI wrapper. Reads the token from `creds.txt` and never prints it.
- `qa.py`: transcript QA (words per minute, repetition loops, confidence).
- `fix_languages.py`: re-checks the language over 6 windows per file and re-transcribes mismatches locally.
- `retranscribe_one.py`: re-transcribes a single file.
- `publish.py`: copies transcripts into the archive and writes `transcripts_index.csv`.

## 3-metadata/: AI metadata
`scripts/` (run from the `_metadata` working folder):
- **Pass 0:** `pass0_facts.py` writes fixed facts per item, from filenames, the parsed master tape catalog (`parse_tzh_catalog.py`), clip-to-episode text matches (`text_match_clips.py`) and part sets.
- **Pass 1:** `make_batches.py` and `prepare_pass1.py` split the work into 97 batches. `workflows/pass1-workflow.js` runs one Claude agent per batch, following `docs/PASS1_INSTRUCTIONS.md`.
- **Validation:** `validate_items.py` (against facts plus schema), `validate.py` (schema plus vocabulary, used by `validate_repo.py`).
- **Pass 2:** `workflows/pass2-workflow.js` runs 6 cross-item agents (vocabulary, dates, serials, same_story, versions_speakers, deliverables). They write patch files, which `apply_pass2.py` merges idempotently.
- **Utilities:**
  - `rename_speaker.py OLD NEW`: confirms a placeholder speaker everywhere.
  - `hdate.py`: Hebrew ↔ Gregorian dates.
  - `plan_reorg.py` and `execute_reorg.py`: the folder reorganization (dry-run plan first, then the move, rewriting every stored path).
  - `add_media.py`: writes each item's `media` block (public URL on `storiesmedia.torahlearningtools.com` plus its R2 key) from `r2_manifest.csv`. Rerun it after any R2 move.

## 4-r2/: Cloudflare R2
- `r2.py`: S3 client; reads `r2.env` (not in git).
- `upload_audio.py`: uploads the audio to `goldstein/audio/…`. It is resumable and writes `r2_manifest.csv`.
- `upload_media.py`: uploads the non-audio files (`StoryArchive/documents`) to `goldstein/media/…` with the right content types, and writes `media_manifest.csv` (exported as `data/catalog/media_catalog.csv`).
- `move_prefix.py`: server-side rename of an R2 prefix.
- `scan_audio_frames.py`: writes `data/catalog/audio_frames.csv`, the MP3 frame table that HLS streaming needs (`docs/design/hls.md`). It reads the public host only (no credentials). It lives only in the repo: run it there after uploading or re-encoding audio. `export_repo.py` keeps it and the CSV.

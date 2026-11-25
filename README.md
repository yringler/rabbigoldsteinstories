# Rabbi Goldstein Stories

Data and tools behind a website for the recorded stories of the Goldstein family:

- **Uncle Yossi (Rabbi Yosef Goldstein)**: *Tzivos Hashem on the Air*, the weekly children's radio show (1981–1992), plus *Shema B'ni* and his Yiddish Tanya shiurim.
- **Rabbi Chaim Levi Goldstein**, his son: the weekly stories that open with "I Believe in Hashem", plus live rallies and farbrengens.
- **Bubby Chaya Malka and Zaidy Moshe Yehuda**: family recordings in English and Yiddish.

**1,184 recordings, 415 hours.** Each one has a transcript and AI-generated metadata (titles, summaries, lessons, tags, people, holidays, chapter marks, links between recordings).

> This repository is **private**. The metadata keeps an internal `hidden` block for personal details heard on air, such as children's names, addresses and refuah lists. The transcripts contain the same words. The website build must never publish `hidden`, and it must mask transcript lines inside those time spans. See [docs/DECISIONS.md](docs/DECISIONS.md).

## Where things are

| Path | What |
|---|---|
| `data/recordings/` | One folder tree with the same layout as the audio. Each recording has `<name>.meta.json` (metadata), `<name>.transcript.json` (segments with word timings) and `<name>.transcript.txt` (readable, timestamped). |
| `data/catalog/recordings_index.csv` | **Start here.** One row per recording: id, title, folder, file name, R2 audio key, duration. |
| `data/catalog/catalog.csv` | One row per *original* file from the Google Drive download, including duplicates and documents: where it came from (zip, path, sha256), format, loudness, and where it went. |
| `data/catalog/moves.csv`, `r2_manifest.csv` | Old-to-new paths from the folder reorganization; recording id to R2 key and checksum. |
| `data/catalog/probable_duplicates.csv` | Audio-fingerprint matches between recordings (clips inside episodes, re-airs, alternate takes). |
| `data/vocabulary/` | `metadata.schema.json` (JSON Schema for a `.meta.json`), `vocabularies.json` (controlled tag lists: people, topics, midos, mitzvos, calendar, series…), worked examples. |
| `data/indexes/` | `serials_index.json` (multi-week radio serials and their chapters), `story_groups.json` (the same story told more than once, across languages), `series_summaries.json`. |
| `data/catalog/media_catalog.csv` | The archive's 15 non-audio files: PDFs, images, and the producer's master tape catalog of the radio show (`TZH Catalouge updated (1).docx`). They are in R2 under `goldstein/media/`; this CSV gives each one's id, original path, R2 key, public URL, type and size. |
| `review/` | Open questions for a person: `to_confirm.csv` (unconfirmed names), `family_recordings.csv`, `REVIEW_QUEUE.md`. |
| `docs/` | How it was built: pipeline report, metadata design, decisions, agent instructions, and logs from each run in `docs/runs/`. |
| `tools/` | The scripts, by stage (below). |

**Audio and documents are not in git.** They are in Cloudflare R2, bucket `stories`: audio under `goldstein/audio/` in the same folder layout, and non-audio files under `goldstein/media/`. It is served publicly from **`https://storiesmedia.torahlearningtools.com/`**.
- Each recording's playable URL is in its `.meta.json` → `media.url`, and in the `audio_url` column of `recordings_index.csv`.
- The rule: `https://storiesmedia.torahlearningtools.com/` + the R2 key, percent-encoded (keep `/`).
- Range requests work, so players can seek.

**Every recording has a stable 10-character id**: the first 10 hex characters of the original file's sha256. The id links the catalog, the metadata, the transcripts and the R2 object (object metadata `item-id`).

## How it was built (2026-11-24/25)

1. **Normalize** (`tools/1-normalize/pipeline.py`):
   - 32 Drive zips and 19 videos (126 GB) became 1,184 MP3s (mono, 96 kbps, loudness −16 LUFS).
   - Duplicates were removed: byte-identical files, plus copies whose audio matched by fingerprint.
   - Each original file maps to its output in `catalog.csv`.
2. **Transcribe** (`tools/2-transcribe/`):
   - A Kaggle notebook on 2×T4 GPUs ran faster-whisper `large-v3-turbo` for English (with a Chabad vocabulary prompt) and `ivrit-ai/yi-whisper-large-v3-turbo` for Yiddish. It took 4.4 GPU-hours.
   - A local pass then re-checked language and re-transcribed misrouted files.
3. **Metadata** (`tools/3-metadata/`):
   - **Pass 0:** fixed facts taken from filenames, the master tape catalog and clip-to-episode matches.
   - **Pass 1:** 97 parallel agent batches. Each wrote one validated `.meta.json` per recording, following `docs/PASS1_INSTRUCTIONS.md`.
   - **Pass 2:** cross-recording work: tag reconciliation, air dates, serial chapters, the same story told more than once, preferred copies. It produced patch files that `apply_pass2.py` merges.
   - **Checking:** `validate_items.py` checks every item against the schema and vocabularies. All 1,184 pass.
4. **Organize and upload**:
   - Folders are arranged by series, with clean titles (`plan_reorg.py`, `execute_reorg.py`).
   - The audio was uploaded to R2 (`tools/4-r2/upload_audio.py`).

`tools/export_repo.py` refreshes this repo from the working folders. The scripts use absolute paths on the original Windows machine (`C:\Users\ybrin\Downloads\...`), so adjust them if you run from elsewhere. Credentials are read from local files that git ignores (`creds.txt`, `_r2/r2.env`); never commit them.

## Monorepo / websites

The repo is also an npm-workspaces monorepo for three sites on Cloudflare Workers:
- `apps/bedtime`, `apps/kids` and `apps/library` (Astro, static);
- the playlist API `workers/api` (cron + KV);
- shared `packages/` (`data` builds the public dataset and holds the privacy gate; `playlists`, `player`, `config`).

`data/`, `tools/` and `review/` are unchanged.

```
npm ci && npm run build      # public dataset → packages/data/generated/, then the API bundle and three sites
npm test                     # includes the privacy gate on the real data
npm run dev:api & npm run dev:kids
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the decisions, data flow, privacy gate, playlists, deployment, team conventions and the owner's one-time setup steps.

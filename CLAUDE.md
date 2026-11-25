# CLAUDE.md: Rabbi Goldstein Stories

Data repo for a planned public website of the Goldstein family's recorded stories: the *Tzivos Hashem on the Air* radio show (Uncle Yossi, 1981–92), R' Chaim Levi Goldstein's weekly stories, Yiddish Tanya shiurim and family recordings. It holds 1,184 recordings (415 h), each with a transcript and AI-generated metadata. Read `README.md` for the full picture. This file has the rules.

## Orientation (read in this order)
1. `README.md`: what is where.
2. `docs/DECISIONS.md`: the owner's decisions (privacy, people, what is published). They are binding.
3. `data/README.md`: file formats. `data/vocabulary/metadata.schema.json` is the contract for `.meta.json`.
4. `review/`: questions still open for the owner. Don't resolve them yourself; ask.

## Key facts
- **People:**
  - Uncle Yossi = **Rabbi Yosef Goldstein** (speaker id `rabbi_yosef_goldstein`).
  - His son **Rabbi Chaim Levi Goldstein** (`rabbi_chaim_levi_goldstein`) tells most of the stories outside the radio show and is known for the song "I Believe in Hashem".
  - Bubby Chaya Malka is Uncle Yossi's mother.
- **The id:** every recording has a stable 10-hex `id` (sha256 prefix of the original file). It joins everything: the catalog, `.meta.json`, transcripts, and the R2 audio object (metadata `item-id`). Never change or reuse ids.
- **Audio is not in git.** It is in Cloudflare R2, bucket `stories`, keys `goldstein/audio/<same folder layout>.mp3`, served publicly at `https://storiesmedia.torahlearningtools.com/<percent-encoded key>`.
  - Every `.meta.json` has `media.url` (ready to play), `media.r2_key`, `size_bytes` and `mime_type`.
  - If you move or rename audio in R2, update `media` too.
  - Non-audio files (tape catalogs, PDFs, images) are at `goldstein/media/…` on the same host. `data/catalog/media_catalog.csv` lists them; don't commit binaries to git.
  - The host sends no CORS headers. `<audio src>` works; `fetch()` from another origin would need a CORS rule on the bucket.

## Rules
- **Privacy:** this repo is private. Every `.meta.json` has a `hidden` block (children's names, addresses and sick lists read on air, with timestamps), and the transcripts contain the same words.
  - Anything public (website, search index, exports) must drop `hidden`, `source`, `quality`, `provenance` and `proposed_new_terms`.
  - It must also mask transcript lines that overlap a `hidden` time span.
  - Never make the repo or its data public without the owner's say-so.
- **The audio itself is never edited.** No trimming or bleeping. Blank tape is recorded in `quality.trim` instead.
- **Placeholders for unknown names:**
  - Don't present guesses about unconfirmed identities (vocabulary entries marked `unconfirmed`) as fact.
  - Evidence goes in `identity_guesses`. Questions go to `review/to_confirm.csv`.
- **Tags come only from `data/vocabulary/vocabularies.json`:**
  - To add a term, add it there first; an agent that needs a missing term uses `proposed_new_terms`.
  - Validate after any metadata change: `python -X utf8 tools/validate_repo.py` (needs `pip install jsonschema pyluach`). It must report 0 errors.
- **Credentials:** never commit or print them. They live outside git (`creds.txt`, `_r2/r2.env` on the owner's PC) and `.gitignore` covers them.
- **Large JSON files:** use scripts (Python with `-X utf8`; text is Hebrew/Yiddish UTF-8) rather than hand-editing hundreds of files. Keep the 2-space or 1-space JSON indentation each file already has, and `ensure_ascii=False`.

## Where the source of truth is
The pipeline ran on the owner's Windows PC, in `C:\Users\ybrin\Downloads\`:
- `StoryArchive\` holds the audio, catalog and transcripts.
- `_metadata\` holds items, vocabulary and pass-2 output.
- `_transcribe\`, `_pipeline\` and `_r2\` hold the tooling for each stage.

`tools/export_repo.py` snapshots those folders into this repo.
- **Working on that PC:** edit the working folders, then re-export.
- **Working anywhere else:** the repo is the source of truth. Edit `data/` directly and validate with `tools/validate_repo.py`. Tool scripts under `tools/` contain absolute Windows paths, so adjust them before running.

## Monorepo / websites
- Three sites plus a landing page (`apps/{bedtime,kids,library,home}`, Astro on Cloudflare Workers static assets), the playlist Worker (`workers/api`, cron + KV) and shared `packages/` (npm workspaces, TypeScript strict). Read `docs/ARCHITECTURE.md` before touching them: layout, data flow, team file ownership, dependency/lockfile rules, deployment.
- Sites read only the public dataset that `packages/data` builds into `packages/data/generated/` (git-ignored), never `data/` directly. The privacy gate (`npm test`, `npm run privacy:gate -- <dirs>`) must pass. Never weaken it to make a build pass.
- Verify with `npm ci && npm run typecheck && npm test && npm run build`.

## Likely next work
- The website: static site or Worker plus R2. Audio needs a public R2 custom domain or signed URLs; the bucket is private now.
- Answering `review/` items with the owner, then applying the answers (for example `tools/3-metadata/scripts/rename_speaker.py` for a confirmed placeholder).
- Search: transcripts plus `display.summary_*` plus tags. Yiddish transcripts are for search only, not display.

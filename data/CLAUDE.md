# CLAUDE.md: data/

- `recordings/**/<name>.meta.json` must stay valid. After changing any of them, run `python -X utf8 tools/validate_repo.py` from the repo root and get 0 errors.
- The `id` inside each file is the real key. File names and folders are for people and can change (`catalog/moves.csv` tracks moves). If you rename or move a recording, update `catalog/recordings_index.csv`, `catalog/catalog.csv` (`out_path`) and `r2_manifest.csv`, and move the R2 object too, or links break.
- Relations need both directions where the type has an inverse or is symmetric: clip_of ↔ contains, same_story, same_recording, part_of_set. Targets are ids (`target_id`).
- Tags must be ids from `vocabulary/vocabularies.json`. Add new terms there first (with label and aliases). Don't invent ids inside items.
- The `hidden` block and transcripts contain personal details of children heard on air. Never copy them into anything public. See the root CLAUDE.md.
- Text is UTF-8 with Hebrew and Yiddish. Read and write with `encoding="utf-8"` and `ensure_ascii=False`. The CSVs have a BOM (`utf-8-sig`) so Excel shows Hebrew.
- `indexes/*.json` were generated in pass 2 from the items. If you change serials, story groups or series, regenerate or update them to match.

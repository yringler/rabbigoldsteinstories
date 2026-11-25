# docs/: how the archive was built

| File | What |
|---|---|
| `DECISIONS.md` | **Binding.** The owner's answers on privacy, people, publishing policy, versions, transcripts and advisories. |
| `PIPELINE_REPORT.md` | Phase 1 (normalization): counts, hours per folder, duplicates, oddities. |
| `SCHEMA_PROPOSAL.md` | The metadata design: what profiling the filenames found (the radio episode numbering, the master tape catalog, clip-to-episode numbering), the field-by-field rationale, and the vocabularies. |
| `PASS1_INSTRUCTIONS.md` | The exact instructions each pass-1 agent followed to write one recording's metadata. Reuse them to (re)process recordings. |
| `PASS2_REPORT.md` | The cross-recording pass: what each task changed, conflicts, final validation. |
| `runs/pass1-batches.json` | The 97 batches (which ids went together). |
| `runs/pass1-batch-reports/` | Each batch agent's notes: findings, data problems, leads. |
| `runs/pass2-patches/` | The pass-2 patch files exactly as merged, plus `apply_log.json`. |
| `runs/transcription/` | The Kaggle per-file log (speed, language), transcript QA stats, and the language-fix report. |

## Timeline (Nov 24–25, 2026)
1. Survey and normalization: 126 GB of Drive zips and videos became 1,184 MP3s (18 GB).
2. ASR benchmark: the CPU was too slow and stock Whisper fails on Yiddish. Chose ivrit-ai for Yiddish, then ran on Kaggle (about 46× realtime per T4).
3. Full transcription on Kaggle: 415 h in 4.4 h, 0 errors. One defective source file (radio episode "16" is a 3-second loop). 7 language-misrouted files were re-transcribed.
4. Metadata design was reviewed and decided with the owner. Then pass 0, the pass-1 pilot, the full pass 1 (paused once by a usage limit and resumed), and pass 2.
5. Folder reorganization by series, upload to R2 (`stories/goldstein/audio/`), and this repo.

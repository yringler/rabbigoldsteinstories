# Phase 1 pipeline report

Generated 2026-11-25 01:11. One catalog row per original file: `StoryArchive/catalog.csv` / `catalog.json`.

## Counts by status

| status | items |
|---|---|
| converted | 1184 |
| document | 15 |
| duplicate | 44 |
| **total** | 1243 |

## Audio hours (unique converted items only)

Total: **415.1 h** in 1184 files.

| collection | folder | files | hours |
|---|---|---|---|
| Stories | **(all)** | 377 | 171.8 |
| Stories | (top level) | 234 | 85.27 |
| Stories | 4 chochmas | 7 | 3.77 |
| Stories | Farbrengen-Power audio | 2 | 0.54 |
| Stories | Maaseh Rav | 7 | 1.63 |
| Stories | Simchas Beis Hashoeva 5786 | 2 | 0.91 |
| Stories | Story Videos | 27 | 10.00 |
| Stories | Uncle Yossi - Heritage Series 2 | 7 | 1.78 |
| Stories | Uncle Yossi - Heritage Series 2/Akiva Torah ship 10m 44s | 3 | 0.18 |
| Stories | Uncle Yossi - Heritage Series 2/Akiva Torah ship 11m 23s | 2 | 0.19 |
| Stories | Uncle Yossi - Heritage Series 2/Drunkard | 2 | 0.45 |
| Stories | Uncle Yossi - Heritage Series 2/King Shabbos candles | 3 | 0.39 |
| Stories | Uncle Yossi - Heritage Series 2/Rebi Akiva - negel vasser | 2 | 0.37 |
| Stories | Uncle Yossi - Heritage Series 2/Shpoler zeida | 4 | 0.40 |
| Stories | Uncle Yossi - Heritage Series 2/Shukel davening | 2 | 0.56 |
| Stories | Uncle Yossi - Heritage Series 2/Tunnel | 2 | 0.35 |
| Stories | אידיש | 5 | 2.85 |
| Stories | אידיש/Pesach/הגדה - אידיש | 15 | 10.82 |
| Stories | אידיש/R Yosef Goldstein - Tanya Yiddish | 43 | 46.93 |
| Stories | אידיש/Sefiras Haomer - Kids | 2 | 1.27 |
| Stories | אידיש/Yiddish stories | 3 | 1.38 |
| Stories | אידיש/Yiddish stories/Bubby Chaya Malka etc | 3 | 1.77 |
| Uncle Yossi - Tzivos Hashem Radio Program | **(all)** | 807 | 243.3 |
| Uncle Yossi - Tzivos Hashem Radio Program | Chasidishe Yomim Tovim | 25 | 1.99 |
| Uncle Yossi - Tzivos Hashem Radio Program | Inyonei Mitzvos | 129 | 10.83 |
| Uncle Yossi - Tzivos Hashem Radio Program | Midos Tovos | 44 | 3.65 |
| Uncle Yossi - Tzivos Hashem Radio Program | Parsha of the Week | 25 | 2.94 |
| Uncle Yossi - Tzivos Hashem Radio Program | Stories | 14 | 1.81 |
| Uncle Yossi - Tzivos Hashem Radio Program | UY Radio program Tzivos Hashem on the Air - missing 42-112 | 418 | 208.56 |
| Uncle Yossi - Tzivos Hashem Radio Program | Yomim Tovim | 152 | 13.49 |

Loudness normalization mode actually used by loudnorm pass 2: dynamic: 1001, linear: 183. (`linear=true` was requested; ffmpeg falls back to dynamic mode when the linear gain needed to reach -16 LUFS would push true peak above -1.5 dBTP, which is the normal case for unprocessed speech. `none` = silent/near-silent source, encoded without normalization.)

## Sizes and disk

- Input (19 loose MP4s + 32 zips as downloaded): 117.6 GiB (126.3 GB)
- Output (everything under StoryArchive, 1203 files): 16.8 GiB (18.0 GB)
  - audio/: 16.7 GiB (17.9 GB)
  - documents/: 0.1 GiB (0.1 GB)
- Net disk freed by the pipeline: 100.8 GiB (108.2 GB)
- Current free space on C: 216.7 GiB (232.7 GB)

## Duplicates

Removed as duplicates: **44**
- audio_fingerprint: 33 (high-confidence near-duplicate (fingerprint corr >= 0.95, >= 95% chunk coverage both ways, duration within 1 s); redundant output deleted, better source kept)
- sha256: 11 (byte-identical file (not converted again))

Probable duplicates left for human review: **201 groups** (552 pairs) in `StoryArchive/probable_duplicates.csv` (all kept).

## Failures and oddities

- No failed or skipped items.

**Silent / near-silent sources (encoded without normalization): 0**

**Duration mismatch between container header and decodable audio (original also kept): 0**

**Decoder reported errors/warnings (output still verified): 0**

**Very quiet sources (< -35 LUFS): 21**
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /426.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5750 (1989-90)/Ep 426 - The Flickering Flame (Sefiras HaOmer) (1990-05-08).mp3): very quiet source (I=-35.0 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Yomim Tovim/Shavuos 430.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Yomim Tovim/After Shavuos - The Tikkun, Flowers and Why We Eat Dairy (Ep 430).mp3): very quiet source (I=-37.8 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Inyonei Mitzvos/12 Psukim B_chol 3 163.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Inyonei Mitzvos/The Twelve Pesukim, Number Three - Bechol Dor Vador (Ep 163).mp3): very quiet source (I=-35.1 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Stories/Hillel on the Roof 425.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Stories/Hillel on the Roof (Ep 425).mp3): very quiet source (I=-35.4 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /373.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5749 (1988-89)/Ep 373 - The Secret of the Empty Fireplace (Yahrzeit of the Tzemach Tzedek) (1989-04-18).mp3): very quiet source (I=-36.5 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Inyonei Mitzvos/Havdalah 428.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Inyonei Mitzvos/Havdalah - Saying Goodbye to Shabbos and the Havdalah Kit (Ep 428) (other version).mp3): very quiet source (I=-35.9 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Midos Tovos/Pirkei Avos 527.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Midos Tovos/Pirkei Avos Chapter 2 - The Eye That Sees, the Ear That Hears (Ep 527).mp3): very quiet source (I=-35.5 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Yomim Tovim/Shavuos -2 429.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Yomim Tovim/Children, the Guarantors of the Torah (Ep 429).mp3): very quiet source (I=-36.3 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Inyonei Mitzvos/Modeh Ani 429.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Inyonei Mitzvos/Before Modeh Ani - Remember That Hashem Is Right Beside You (Ep 429).mp3): very quiet source (I=-37.7 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /430.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5750 (1989-90)/Ep 430 - The Two Voices (After Shavuos) (1990-06-05).mp3): very quiet source (I=-37.3 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Inyonei Mitzvos/Sfiras Haomer 424.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Inyonei Mitzvos/Sefiras HaOmer - Respecting Others and Counting the Days to the Torah (Ep 424).mp3): very quiet source (I=-36.6 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /424.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5750 (1989-90)/Ep 424 - The Whispering Droplets (Sefiras HaOmer) (1990-04-24).mp3): very quiet source (I=-36.4 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Yomim Tovim/Tu B_Shvat 162.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Yomim Tovim/Tu B'Shvat - The Trees Say Happy New Year (Ep 162).mp3): very quiet source (I=-35.5 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Inyonei Mitzvos/Rebbe 521.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Inyonei Mitzvos/What Is a Rebbe A Leader in Every Generation (Ep 521).mp3): very quiet source (I=-38.0 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Inyonei Mitzvos/Sefiras Haomer - Brias Haolam 427.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Inyonei Mitzvos/With Ten Sayings - Hashem Creates the World Every Moment (Ep 427).mp3): very quiet source (I=-35.8 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /429.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5750 (1989-90)/Ep 429 - A Judge for a Day, Chapter 3 (Erev Shavuos) (1990-05-29).mp3): very quiet source (I=-36.4 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /427.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5750 (1989-90)/Ep 427 - A Judge for a Day, Chapter 1 (1990-05-15).mp3): very quiet source (I=-35.6 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Yomim Tovim/Lag Ba_Omer 425.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Yomim Tovim/Lag BaOmer - The Day of Rabbi Shimon bar Yochai's Joy (Ep 425).mp3): very quiet source (I=-35.0 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /521.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5752 (1991-92)/Ep 521 - A Judge for a Day, Chapter 1 (1992-03-24).mp3): very quiet source (I=-37.0 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/Yomim Tovim/Shavuos 429.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Segments/Yomim Tovim/Erev Shavuos - We Were All at Har Sinai (Ep 429).mp3): very quiet source (I=-36.7 LUFS)
- `Uncle Yossi - Tzivos Hashem Radio Program/UY Radio program Tzivos Hashem on the Air - missing 42-112 /157.mp3` (converted, audio/Uncle Yossi - Tzivos Hashem on the Air/Episodes/5745 (1984-85)/Ep 157 - The Flickering Flame, Chapter 2 (Asarah B'Teves) (1985-01-01).mp3): very quiet source (I=-35.7 LUFS)

**Very short (< 2 s): 0**

**Unknown / missing extension: 1**
- `Stories/mayin yovoy ezri` (converted, audio/Other Stories/Just for Hashem - A Chof Cheshvan Class and the Story of Reb Shmuel Brin.mp3): no/unknown extension

**Multiple audio streams: 0**

**The .avi** `Stories/Story Videos/9 shevat 5730 Bracha shehecheyanu.avi`: status converted, audio codec mp3, 26.41 s, had_video=True, output `audio/Other Stories/The Brachah Shehecheyanu, 9 Shevat 5730.mp3`.

## Non-English (Yiddish/Hebrew) and uncertain-language items

**yiddish**: 77 unique audio items, 68.3 h (+5 documents)
- Stories/4 chochmas: 2 items, 2.31 h
- Stories/Maaseh Rav: 3 items, 0.46 h
- Stories/Story Videos: 1 items, 0.46 h
- Stories/אידיש: 5 items, 2.85 h
- Stories/אידיש/Pesach/הגדה - אידיש: 15 items, 10.82 h
- Stories/אידיש/R Yosef Goldstein - Tanya Yiddish: 43 items, 46.93 h
- Stories/אידיש/Sefiras Haomer - Kids: 2 items, 1.27 h
- Stories/אידיש/Yiddish stories: 3 items, 1.38 h
- Stories/אידיש/Yiddish stories/Bubby Chaya Malka etc: 3 items, 1.77 h

**unknown**: 12 unique audio items, 2.7 h (+1 documents)
- Stories: 10 items, 1.83 h
- Stories/Story Videos: 2 items, 0.85 h

## Cleanup status

- Zip files remaining in Downloads: 0
- Loose MP4s remaining in Downloads: 0
- `_staging`: removed
- `creds.txt`: present and unchanged (sha256 matches the hash recorded before the run)
- `desktop.ini`: present and unchanged (sha256 matches the hash recorded before the run)
- Other entries in Downloads: _transcribe

## Files

- Pipeline script: `C:\Users\ybrin\Downloads\_pipeline\pipeline.py` (run with `C:\Users\ybrin\Downloads\_pipeline\.venv\Scripts\python.exe -I -X utf8 pipeline.py run | dedup [--apply] | export | report | status`)
- State DB (resumable): `C:\Users\ybrin\Downloads\_pipeline\state.db`; log: `C:\Users\ybrin\Downloads\_pipeline\pipeline.log`; fingerprints: `C:\Users\ybrin\Downloads\_pipeline\fp`; pair scores: `C:\Users\ybrin\Downloads\_pipeline\neardup_scores.json`
- Catalog: `C:\Users\ybrin\Downloads\StoryArchive\catalog.csv` (UTF-8 with BOM) and `C:\Users\ybrin\Downloads\StoryArchive\catalog.json`
- Review list: `C:\Users\ybrin\Downloads\StoryArchive\probable_duplicates.csv`

## How it was done / caveats

- **Run:** the main conversion ran 2026-11-24 21:47 to 2026-11-25 00:42 (about 2 h 55 min) as a detached process with 6 workers (6 concurrent ffmpeg processes, below-normal priority). The near-duplicate pass took about 13 min. Order: the 19 loose MP4s first, then the 32 zips one at a time.
- **Staging:** each zip member was streamed into `_staging/<zip>/<index>.<ext>` (neutral numeric names, sha256 computed while extracting), processed, then deleted. A zip was deleted only after all its members had a final catalog status and every output was checked to exist. Each loose MP4 was deleted right after its MP3 passed verification. Free space never went near the 15 GB reserve; it rose steadily from 117 GB.
- **Verification of every output:** ffprobe reports mp3 / 44.1 kHz / mono; duration within max(2 s, 1%) of the source's actually decoded duration; a full decode with `-v error` produces no errors. Then the file is moved into place. Container-header duration was also compared with the decoded duration; no file differed.
- **Loudness:** two-pass `loudnorm` (I=-16, TP=-1.5, LRA=11, linear=true, pass-1 measured values plus offset). Measurements were taken on the mono downmix that gets encoded, so `input_lufs` of a stereo file is the mono-downmix value. Of the 1217 files converted (before 33 were removed as fingerprint duplicates), 1028 fell back to loudnorm's *dynamic* mode, because the linear gain needed would have pushed true peak above -1.5 dBTP; only 189 got pure linear gain (1001 and 183 among the 1184 kept files). The outputs still land near -16 LUFS (`output_lufs_est` column). For purely linear normalization, the options are a lower target (about -20 LUFS) or linear gain followed by a true-peak limiter. That decision is for later phases.
- **Video files:** for MP4/AVI, the audio stream was first copied out losslessly (`-c copy`) to a temporary .mka, so the multi-GB video was read only once per pass. Output is audio only.
- **Dedup:** (1) sha256 of the original file, (2) md5 of the decoded 16 kHz mono PCM (none found beyond the sha256 duplicates), (3) a custom fingerprint: 16 log-spaced band energies (150-5500 Hz) at 8 frames/s; Haitsma-Kalker-style 30-bit hashes for candidate search; then verification by Pearson correlation over the full overlap plus per-30-s-chunk correlation with a drift-tolerant offset search. Validated before use: re-encodes (64 kbps MP3, 48 kbps AAC, 0.37 s delay, -7 dB) scored corr 0.998-0.999 with 100% coverage; different recordings scored corr 0.06-0.10 with 0 coverage; trims/partials were correctly *not* treated as duplicates. Only pairs with corr >= 0.95, >= 95% chunk coverage both ways, min chunk corr >= 0.6 **and** durations within 1.0 s were removed; the better source was kept (lossless > higher bitrate > higher sample rate > longer). Known limit: a copy transferred at a slightly different speed (e.g. 1% faster tape) is only partly detected; such pairs can appear in the review list but are never auto-removed.
- **What the 33 fingerprint duplicates were:** mostly the radio-program copies (`Uncle Yossi - Tzivos Hashem Radio Program/Stories/...mp3`) of the same recordings as the lossless WAVs in `Stories/Uncle Yossi - Heritage Series 2/` (WAV kept), Yiddish-folder MP3s identical to WAVs filed elsewhere in `Stories/`, the two `Story Videos/Farbrengen Power` MP4s (identical to the `Farbrengen-Power audio` MP3s), and a few radio segments filed twice under different titles (e.g. `Rosh Hashana 345` = `Teshuvah 345`, `The Drunkard 387` = `Rabbi Akiva negel vasser`). The keeper's notes say where else the audio appeared. Where the removed copy had a different language guess (Yiddish folder), the keeper's `language_guess` was set to `unknown`.
- **probable_duplicates.csv** (all kept, one row per pair, `group` column links them) has a `relation` column: 297 "shorter is contained in longer" pairs, mostly topical radio segments (Inyonei Mitzvos, Yomim Tovim, Midos Tovos...) that are excerpts of the full ~30-min episodes in `UY Radio program ... missing 42-112`; 222 "partial overlap" pairs (shared segments, e.g. a story re-aired in two episodes); 27 "same recording, different length/edit/transfer" pairs (the ones most worth a look, e.g. the two `Rashi's Prophecy` WAVs); 6 "same title, audio differs".
- **Names:** output file names mirror the originals with only whitespace trimming/collapsing (Drive's `_` substitutions are kept in file names, e.g. `Rashi_s Prophecy.mp3`; the `title_guess` column and ID3 title carry the cleaned title). Folder names were trimmed too: the zip's ` Stories` (leading space) became `Stories`, and trailing spaces were dropped from `Farbrengen Power `, `Yiddish stories ` and `... missing 42-112 `. Episode numbers (e.g. `Tu B'Av 390`) were kept in titles because they identify radio episodes; only the `NNm NNs` length suffixes were stripped.
- **Byte-identical copies:** the copy seen first in processing order was kept, so one kept output carries the source's own `(2)` in its file name (`Yomim Tovim/17 Tammuz 435 (2).mp3`), because the un-suffixed source came later. The catalog maps both rows.
- **Not mine:** a `_transcribe` folder appeared in Downloads during the run (the other job). It was not touched and is not counted anywhere.

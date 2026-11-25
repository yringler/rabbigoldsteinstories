# Site concept: the Library (adult / teacher / researcher reference site)

Status: concept spec for implementation. One of three sites in the planned monorepo (the others: a children's site and a bedtime site). This file covers only the Library. Working name: **The Goldstein Story Library**; working path `sites/library/`.

Binding inputs: `CLAUDE.md`, `docs/DECISIONS.md`, `data/README.md`, `data/vocabulary/metadata.schema.json` (v0.3). Every number below was measured on `data/` on 2026-11-25 with read-only scripts; section 13 lists them in one place.

---

## 1. Audience and jobs to be done

| Who | Job | What the site must do |
|---|---|---|
| Classroom teacher, camp counsellor | "I need a 10-minute story about hakaras hatov for 7-year-olds, tomorrow." | Facets for midah, age, duration and "stands alone"; a result she can play, print and queue in under a minute. |
| Parsha / Yom Tov planner | "What is there for Rosh Chodesh Nissan? For Lech Lecha?" | Calendar and parsha indexes; the radio timeline by Hebrew date. |
| Researcher, family member, archivist | "Where did Uncle Yossi tell the Dayeinu story, and when did it air again?" | Full-text transcript search, relations, serial structure, story groups, citations with timestamps. |
| Mashpia / adult learner | "Tanya perek 12 in Yiddish." "Stories citing Hayom Yom." | Study-text index, sources-cited index. |
| Listener who remembers the show | "The serial about the wedding gifts, around 1982." | Serial reader, year grid, lost-episode list with "help us find this tape". |
| Developer / other family projects | "Give me the data." | A public JSON/CSV download of public metadata. |

Design stance: a reading-room catalogue. Dense, text-first, fast, linkable. No hero images, no carousels, no accounts.

## 2. Platform decisions (short)

- **Fully static site** on Cloudflare (Pages or Workers static assets). No Worker code, no D1, no KV in the Library MVP. Reason: it must keep working for years with nobody maintaining it, and nothing in the feature list needs a server (section 5 argues the search case with numbers).
- **Astro** static build, TypeScript, small islands (Preact) for search, player, transcript and playlists. Astro `<ClientRouter>` with the player bar marked `transition:persist` so audio keeps playing across page navigation.
- Audio comes straight from `media.url` in an `<audio>` element. No `fetch()` of audio (the host sends no CORS headers), so no waveform, no Web Audio, no client-side download-as-blob. Range requests work, so seeking works.
- All data the site reads is the **public export** (section 11), built by one script from `data/`. The site never reads `data/recordings/` directly at runtime or in page templates.
- Build output estimate: about 1,180 item pages, 1,180 transcript JSON files, about 1,340 Pagefind files, about 700 index pages. Well under the Pages limit of 20,000 files; largest single file under 1.5 MB.

## 3. Information architecture

Top navigation (always visible, 7 entries): **Search · Radio show · Series · Browse · Playlists · About** and a compact search box. "Browse" opens a panel linking the indexes.

| URL | Page | Purpose |
|---|---|---|
| `/` | Home | Search box, entry points, tonight's playlists strip, archive numbers |
| `/search` | Search and browse | Facets + query + results. The main working page |
| `/r/<id>/` | Recording | Everything public about one recording. `<id>` is the 10-hex id; an optional slug may follow (`/r/585fe67e3e/episode-271-the-mystery-of-dayeinu`) and is ignored for routing |
| `/radio/` | Radio show timeline | 1981–92 by Hebrew year, episode grid including lost episodes |
| `/radio/ep/<n>/` | Episode redirect | Static redirect to the primary recording of episode n, or to the lost-episode entry |
| `/series/`, `/series/<id>/` | Series | Description, counts, date range, item list |
| `/serials/`, `/serials/<story_key>/` | Serial reader | Chapters in order across airings |
| `/stories/`, `/stories/<group_id>/` | Story groups | The same story in different tellings, side by side |
| `/people/`, `/people/<id>/` | People index | 119 people in use, by category |
| `/places/` | Places index | 150 place names |
| `/sources/`, `/sources/<work>/` | Sources cited | 33 works, 2,010 citations |
| `/calendar/`, `/calendar/<id>/` | Jewish calendar | 66 occasions in use, in year order |
| `/parsha/` | Parsha | 54 parshiyos, 29 with material |
| `/midos/`, `/mitzvos/`, `/topics/` | Subject indexes | Term lists with counts; each term links to `/search` with the facet set |
| `/study/` | Study texts | Tanya by perek (42 shiurim), Haggadah, Shulchan Aruch HaRav |
| `/playlists/` | My playlists + Tonight's | Section 8 and 9 |
| `/data/` | Data download | Section 10 |
| `/about/` | About | People, how the archive was made, AI disclosure, privacy, corrections, lost tapes |
| `/help/` | Help | Search syntax, keyboard shortcuts, citing, playlists |

Term index pages (`/midos/` etc.) are thin: they exist for orientation and for search engines. The working surface is always `/search?…`.

### 3.1 Home (wireframe)

```
[Logo] Search | Radio show | Series | Browse v | Playlists | About        [ / search…      ]
------------------------------------------------------------------------------------------
  The Goldstein Story Library
  1,174 recordings · 415 hours · 1981 to today          (numbers from the export)

  [ Search titles, summaries and transcripts…                               ] [Search]
  Try:  hakaras hatov, ages 6+, under 15 min  ·  Rosh Chodesh Nissan  ·  "ad mosai"

  Find a story for class        Radio show 1981–92        Serials
  by midah · mitzvah · parsha   timeline, 555 episodes    26 stories told in chapters
  by Yom Tov · age · length     144 not yet found

  People · Places · Sources cited · Tanya by perek · Same story, different tellings

  Tonight's playlists  (shared with the bedtime site)        [see the last 7 nights]
  [card] [card] [card]
------------------------------------------------------------------------------------------
  About · Data · Help · "Automatic transcripts and AI-written summaries; report an error"
```

No "featured story" editorial slot. Nothing on the home page needs upkeep.

## 4. Search and browse page (`/search`)

### 4.1 Layout

```
[ query box                                         ] [x]   Search in: (•) Everything ( ) Titles & summaries ( ) Transcripts
Active: Midah: hakaras hatov x | Age: 6+ x | Length: under 15 min x          [Clear all]  [Copy link]
+--------------------------+---------------------------------------------------------------+
| FACETS                   | 37 recordings · 5 h 12 m     Sort: Relevance v   View: List|Table |
| Type                     |---------------------------------------------------------------|
|  [ ] Story        (96)   | > Episode 271: The Mystery of Dayeinu (Rosh Chodesh Nissan)    |
|  [ ] Radio episode(412)  |   Radio episode · Uncle Yossi · 1 Nissan 5747 (31 Mar 1987)   |
| Midah  [any|all]         |   29:42 · ages 4+ · chesed, generosity, bitachon              |
|  [x] Hakaras hatov (165) |   Short summary…                                              |
|  [ ] Emunah        (364) |   Transcript: "…everyone sang [Dayenu], and the king…" 21:07  |
|  … show all 30           |               "+3 more matches"                               |
| Age, Length, Language…   |   [Play] [Queue] [+ Playlist] [Cite]                          |
+--------------------------+---------------------------------------------------------------+
```

- All state lives in the URL query string (`q`, one parameter per facet, `sort`, `view`, `in`, `page`). "Copy link" copies it. Back/forward work.
- Facet panel collapses to a "Filters (3)" drawer below 900 px.
- Table view: one row per recording, columns Title, Type, Speaker, Date (Hebrew), Date (Gregorian), Length, Age, Midos; sortable; column chooser; "Download these results as CSV" (generated in the browser from the catalog already in memory).
- Results paginate at 50. Keyboard: `j`/`k` move, `Enter` opens, `p` plays, `a` adds to the current playlist.

### 4.2 Facets

Counts are over all 1,184 recordings before publish filtering; the UI shows live counts.

| Facet | Field | Values in use | Coverage | Multi-select |
|---|---|---|---|---|
| Type | `classification.content_type` | 13 (radio_episode 414, radio_segment 413, lesson_with_story 99, story 96, story_chapter 60, shiur 53, …) | 1,184 | any |
| Series | `classification.series` | 10 in use (+73 with none) | 1,111 | any |
| Speaker | `classification.speakers` | 7 (Uncle Yossi 875, R' Chaim Levi 238, unknown 59, Yiddish storyteller unconfirmed 20, Bubby Chaya Malka 12) | 1,184 | any |
| Story kind | `classification.story_type` | 9 (chassidic 393, moral_fiction 182, mashal_parable 132, historical 104, …) | most | any |
| Midah | `subjects.midos` | 30 | 1,143 | any / all |
| Mitzvah | `subjects.mitzvos` | 58 | 1,130 | any / all |
| Topic | `subjects.topics` | 35 | 1,184 | any / all |
| Jewish calendar | `subjects.calendar` | 66 | 771 | any / all |
| Parsha | `subjects.parshiyos` | 29 of 54 | 116 | any |
| Person | `subjects.people[].id` (+ role filter: central / appears / cited / mentioned) | 119 | 936 | any / all |
| Source cited | `subjects.sources_cited[].work` | 33 | 854 | any / all |
| Place | `subjects.places` | 150 | 312 | any |
| Age | `audience.age_min` as "suitable from age N" slider (3–16) plus `audience.level` | 6 levels | 1,184 | range |
| Parent advisories | `audience.advisories[].flag` | 11 (persecution 212, peril_violence 176, death 152, …) | 578 have at least one | **exclude** by default semantics, see below |
| Language | `language.primary` | en 1,105 · yi 78 · he 1 | 1,184 | any |
| Length | derived buckets: under 5, 5–15, 15–30, 30–60, over 60 min | | 1,184 | any |
| Hebrew year | `classification.date.hebrew_year` | 5742–5753 and recent | 895 | range |
| Stands alone | `classification.standalone` | standalone 896, cliffhanger 146, needs_context 131, fragment 6, teaser 5 | 1,184 | any |
| Has | derived flags: chapter marks (750), transcript shown (about 1,100), part of a serial (185), has other tellings (369) | | | all |

Semantics, fixed:
- **Across facets: AND.** Within a facet: **OR** ("any") by default. Facets marked "any / all" have a two-state toggle in the facet header; "all" means every ticked value must be present.
- **Exclude:** every facet value has a secondary "exclude" control (keyboard `x` on a focused value; a small "not" button on hover/focus). Excluded values render struck through in the active-filter bar. URL form: `midos=emunah,bitachon&midos.mode=all&advisories.not=death,persecution`.
- **Advisories** are presented as "Leave out stories with…" (the checkboxes exclude). This is decision 10's "filter in browse", and matches how a teacher thinks.
- **Counts** are disjunctive: the count beside a value is the number of results if that value were toggled, computed with that facet's own "any" selection ignored and everything else applied. Values with count 0 are shown greyed at the bottom, not removed, so the list does not jump.
- Long facets (person, place, mitzvah, calendar) show the top 8 by count and a type-to-filter box.
- Default scope: recordings marked superseded (64) are folded under their preferred copy and never appear as separate results. A toggle "Clips and full episodes: both / full episodes only / clips and stories only" defaults to **both**; when a clip and its parent episode both match, the clip is nested under the episode row ("also as a 7-min clip").
- Implementation: one bitset (Uint32Array of 37 words) per facet value over the ~1,180 catalog rows; everything recomputes in well under a millisecond. No library needed.

### 4.3 Query box behaviour

1. **Vocabulary first.** As the user types, a dropdown offers matching vocabulary terms (labels and aliases of people, midos, mitzvos, calendar, parshiyos, works, series, serial titles, episode numbers "ep 271") with counts. Choosing one sets a facet instead of a text query. This is the main defence against transliteration variants: `tzedaka` finds the Mitzvah "Tzedakah (370)" even though the transcripts never spell it that way.
2. **Free text** searches metadata and transcripts together (see section 5), ranked: title > keywords/characters/places > lesson > summaries > transcript.
3. Syntax (documented in `/help/`): words are ANDed; `"exact phrase"`; trailing word matches as a prefix; `-word` is not supported in MVP (stated in help).

## 5. Full-text search architecture

### 5.1 What has to be indexed

| Corpus | Size |
|---|---|
| Transcript text, English | 12.05 MB UTF-8, 38,139 segments, 2.27 M words, 24,574 distinct tokens (15,869 occur twice or more) |
| Transcript text, Yiddish (Hebrew script) | 4.23 MB, 7,950 segments, 0.48 M words, 33,913 distinct tokens |
| Total transcript text | **16.3 MB raw, 4.7 MB gzip** (3.76 + 0.97) |
| Word timings | 2.76 M timed words; `transcript.json` files total 116 MB on disk |
| Public metadata text (all fields that may be published) | 5.7 MB JSON, 1.28 MB gzip |
| Compact catalog (one row per recording, everything facets and result cards need) | 1.40 MB JSON, **0.33 MB gzip** |

### 5.2 Options measured

Both built in a scratch directory from the real, masked transcripts (masking rule in 5.4).

| | **A. Pagefind (static, client-side)** | **B. D1 + FTS5 behind a Worker** | C. MiniSearch / FlexSearch shards |
|---|---|---|---|
| Measured size | **17 MB total**: 6.9 MB index in 150 chunks (avg 44 KB, max 186 KB) + 9.2 MB in 1,177 per-recording fragments (avg 5.6 KB, max 99 KB) + 33 KB JS + 10 KB meta | **24.0 MB** SQLite file (9.5–9.7 MB gzip), 26,556 rows at 30-second passages or 40,843 rows at segment level; `porter unicode61` | Not built. A serialised inverted index for 2.75 M tokens with positions is 25–40 MB of JSON before gzip; shards would have to be designed and maintained by hand |
| Per query cost | 1–3 index chunks (about 50–200 KB, cached) + one fragment per result opened | 1 request; 0.1–1.7 ms query time in local SQLite | Whole shard(s) downloaded and parsed |
| Phrase / prefix / boolean | phrase yes, prefix yes, OR and NOT no | all, plus NEAR | varies |
| Hit to timestamp | via anchors in the fragment (5.3) | native (row = passage) | must be built |
| Ops | none; files on the CDN | Worker + D1 binding, schema import in CI, quotas (free tier: 5 M rows read/day, 100 k requests/day), an API to version | none |
| Yiddish "search only" | fragment files necessarily contain the Yiddish text (not displayed by the UI, but fetchable) | text stays server-side; only id + time returned | same as A |
| Failure mode | none at runtime | search is down if the quota is hit or the binding breaks | large downloads on mobile |

### 5.3 Recommendation: **A, Pagefind**, plus an in-memory catalog

- **Facets and metadata text** run in memory over `catalog.json` (0.33 MB gzip, loaded once on `/search`, cached). Metadata text search is a small hand-written scorer over title, keywords, characters, places, lesson, summaries (about 1.4 MB of text): tokenise, lowercase, strip apostrophes and diacritics, AND the terms, prefix on the last term. No fuzzy library in MVP.
- **Transcript search** uses Pagefind, built with the Node API (`pagefind.createIndex()`, `addHTMLFile`) from synthetic HTML, one document per recording: `<html lang="en|yi"><main data-pagefind-body><p id="t531">passage text</p>…`. One `<p>` per passage of about 30 seconds (26,556 passages); the `id` is `t` + start second. Nothing else is in these documents: no titles, no metadata, so ranking is purely transcript.
- **Hit to timestamp:** a Pagefind result's `data()` returns `locations` (word offsets of matches) and `anchors` (each `<p id>` with its word offset). For each location, take the last anchor at or before it: that is the passage start second. Show up to 3 passages per recording with a 12-word excerpt each and "+N more"; each links to `/r/<id>/?t=<sec>&q=<query>`.
- **Joining to facets:** the build writes `pf-map.json` (Pagefind result id to recording id, about 30 KB) by reading the generated fragments. At query time: `search(q)` returns ids and scores without loading fragments; map to recording ids; intersect with the facet bitset; load fragments only for the 50 rows on screen (5.6 KB each, in parallel).
- **Combined ranking:** `score = 3·metadataScore + transcriptScore`, each normalised to 0–1. A recording that matches only in metadata shows no transcript excerpt; one that matches only in transcript shows the excerpt and is labelled "found in transcript".
- **Spelling variants** (measured: the summary says "Dayeinu", the transcript of the same episode says "Dayenu"; "tzedaka" has 0 transcript hits, "tzedakah" 767):
  1. vocabulary-first suggestions (4.3);
  2. at build time, wherever a transcript contains a "heard" form from `vocabularies.json → asr_glossary` (48 entries), the canonical form is appended to that passage in the search document only (never in the displayed transcript);
  3. at query time, a fixed transliteration rule set generates at most 5 variants per term (`-a/-ah`, `ch/kh`, `tz/ts`, `ei/e/ey`, `s/t` for sav, `o/a` for kamatz, doubled consonants) and runs them as parallel Pagefind searches, merged by best score, shown as "also searched: dayenu". Pagefind caches chunks, so this is cheap.
- **Yiddish:** Yiddish documents are indexed under `lang="yi"` (Pagefind builds a second, unstemmed index: measured 1.2 KB meta, separate chunks). A query containing Hebrew-script characters searches the Yiddish index; a Latin-script query searches English; the "Search in" control can force both. Yiddish hits show **no excerpt**, only "Match in the Yiddish recording at 15:28" and a play-from-there button, per decision 8.
- **When to switch to B:** only if the owner rules that Yiddish ASR text must not be retrievable at all (see open question Q3), or users demand OR/NOT/NEAR. The public-export step that produces masked passages is the same input either way, so the switch is contained in one module (`search/engine.ts`, interface `search(q, lang) → [{id, score, passages:[{t, excerpt?}]}]`).

### 5.4 Hidden-span masking and the index

One function, `maskTranscript(meta, transcript)`, in the export package; the transcript viewer files, the Pagefind documents and any future bulk download are all produced from its output and from nothing else.

Rule:
1. Collect spans from `hidden.on_air_people`, `hidden.addresses`, `hidden.other_personal`.
2. Pad each span by 2 seconds on both sides.
3. 49 hidden entries have a start but no end. For those: end = the later of start + 90 s and the end of the enclosing chapter (`segments[]`), if any.
4. A transcript segment is masked when it overlaps any span at all. Masked segments are dropped whole: no partial words.
5. Consecutive masked segments collapse into one gap row `{gap: true, start, end}`. The gap carries no reason, role or kind.
6. A recording with an `audience.privacy` flag but no timed hidden entry (6 recordings) gets no transcript at all (`transcript.mode = "none"`) until someone adds the spans.
7. `hide` (1 recording) and `review` (9) recordings are not exported at all.

Measured effect: hidden spans total **49 hours (11.8 % of the audio)** across 447 recordings and 1,716 entries; **5,183 of 46,089 transcript segments (11.2 %) are masked**. The spans are coarse (median 77 s, 90th percentile 230 s, 67 spans over 5 minutes); in 101 recordings they cover more than 30 % of the running time, and a handful of radio episodes and family recordings are covered end to end. Consequences the UI must handle:
- Gaps are common and sometimes long. The transcript shows a quiet one-line marker: "Part of this recording is not transcribed (personal details read on air). 12:35–14:05. The audio is unchanged." It is seekable.
- Story content that sits inside a coarse span is not searchable by transcript; metadata (summary, chapter titles) still finds it. Tightening the spans with word timings is a data task, not a site task (open question Q1).
- The audio is never altered (decision 1). The player plays through masked spans normally.

Build-time lint (fails the build): no full name from `hidden.on_air_people` may appear in any exported string of the same recording. Today: 0 matches. A softer report lists first names of hidden people that occur in the same recording's public summary or chapter text: today 43 hits in 42 recordings, most likely coincidences with Tanach names; they go to the owner as a review list (Q2), and the build does not fail on them.

## 6. Recording page (`/r/<id>/`)

### 6.1 Layout

```
Radio show › 5747 (1986–87) › Episode 271                               [< Ep 270] [Ep 272 >]
Episode 271: The Mystery of Dayeinu (Rosh Chodesh Nissan)
Radio episode · Rabbi Yosef Goldstein (Uncle Yossi), with guest children
1 Nissan 5747 · Tuesday 31 March 1987 · 29:42 · English · ages 4+
[ > Play ] [Queue] [+ Playlist] [Cite] [Copy link at 12:34] [Print card]
+---------------------------------------------+------------------------------------------+
| Summary (short, then long)                  | Chapters                                 |
| Lesson                                      |  0:00 Opening theme                      |
| Note for parents (advisories)               |  0:29 Rosh Chodesh Nissan: the month…    |
| Subjects: midos · mitzvos · topics ·        |  3:55 A new song: Ad Mosai       [song]  |
|   calendar · parsha (chips → search)        |  …                                       |
| People (grouped by role) · Characters       | Related recordings                       |
| Places · Sources cited (work, ref, note)    |  Contains clip: "Chodesh Nissan" 0:41    |
| Serial / Part of set / Study text           |  Same story: 3 other tellings →          |
| About this date                             |  Other versions                          |
+---------------------------------------------+------------------------------------------+
| Transcript   [Follow audio ✓] [Find in transcript…]   "Automatic transcript, may contain errors" |
| 12:31  …and on Seder night the king, listening at the window, hears everyone sing…     |
+----------------------------------------------------------------------------------------+
[persistent player bar: title · chapter name · scrubber with chapter ticks · speed · queue]
```

### 6.2 Fields, one by one

| Block | Source field(s) | Rendering rules |
|---|---|---|
| Title | `display.title`, `title_he`, `title_translit` | H1. Hebrew title (11 recordings) on its own line, `lang="he" dir="rtl"`, transliteration beneath |
| Type line | `classification.content_type`, `speakers`, `series`, `collections` | Speakers by vocabulary label. `unknown` renders "Speaker not identified". Entries flagged `unconfirmed` in the vocabulary render their label verbatim, which already says "(name unconfirmed)" or "(working title)", and never link to a person page. `identity_guesses` is not exported |
| Date | `classification.date.hebrew`, `gregorian`, `precision`, `basis`, `note` | Hebrew date first, then Gregorian with weekday when precision is `day`. Other precisions: "week of 12 Jan 1988", "Shevat 5748", "5748", "1980s", or "Date unknown". A small "how do we know?" disclosure shows the basis in words ("stated in the recording", "worked out from the weekly sequence", …) and `date.note`. Coverage: 970 have a Hebrew date, 894 a Gregorian one; precision is day 651, week 204, month 31, year 10, decade 1, unknown or absent 287 |
| Length, language, age | derived `duration_sec`, `language.primary` + `spoken`, `audience.level`, `age_min` | "29:42 · English, with some Hebrew and Yiddish · ages 4+". If a derived `content_end_sec` exists (23 recordings): "Content ends at 30:12; the rest of the tape is blank" and the player stops there unless the user seeks past it |
| Summary | `display.summary_short`, `summary_long` | Short in larger type, long below (median 177 words). Labelled once per page, in the footer of the block: "Summary written with AI from the recording" |
| Lesson | `display.lesson` | Present on 1,169. A pull-quote block |
| Keywords | `display.keywords` | Small chips; each runs a text search |
| Parents' note | `audience.advisories[]` (`flag`, `severity`, `note`, `at_sec`) | Visible box above the fold when any advisory exists (578 recordings, 940 advisories; 495 have a time). Each line: label, severity, note, and "at 14:20" as a seek link |
| Subjects | `subjects.midos`, `mitzvos`, `topics`, `calendar`, `parshiyos` | Chip groups with headings; each chip links to `/search` with that facet |
| People | `subjects.people[]` | Grouped by role in this order: Central, Appears, Teaching cited, Mentioned. Links to `/people/<id>/` |
| Characters | `subjects.characters` | Plain list (free text; 807 recordings). Not linked |
| Places | `subjects.places` | Links to `/search?places=…` |
| Sources cited | `subjects.sources_cited[]` (`work`, `ref`, `note`) | Table: Work (linked to `/sources/<work>/`), Reference, Note. 854 recordings, 2,010 citations |
| Serial | `classification.serial` + `serials.json` | "Chapter 2 of 4 of *The Ten Wedding Gifts* (1982 airing)" with previous/next chapter and a link to the serial reader |
| Part of set | `classification.part` | "Part 2 of 3" with sibling links (76 recordings) |
| Study text | `classification.study_text[]` | "Tanya, Likkutei Amarim, perek 12–13 · shiur 17", with the note (53 recordings) |
| Stands alone | `classification.standalone` | Shown only when not `standalone`: "Ends on a cliffhanger: continues in Episode 272" / "Needs the previous chapter" |
| Chapters | `segments[]` (`start_sec`, `end_sec`, `type`, `title`, `summary`, `people`, `calendar`, `story_key`, `chapter`, `linked_items`) | Ordered list; each row is a button that seeks. Type shown as a small tag. Summary on expand. `linked_items` render "also available as a clip". 750 recordings have chapters (5,890 in total, median 4, max 40). 645 chapters lack `end_sec`; the export fills it from the next start or the duration. Sponsor, song and promo chapters are chapter marks only (decision 5). Chapter rows for `shema_guest` and `mailbox` show the generic type label and the public title only |
| Relations | `relations[]` (`type`, `target_id`, `offset_sec`, `confidence`) | Grouped under plain headings, section 6.3. `evidence` and `note` are not shown |
| Transcript | derived masked transcript file | Section 6.4 |
| Citation | derived | Section 6.5 |
| Downloads | `media.url`, `size_bytes` | "Download MP3 (20.4 MB)" as a plain link with `download` |

Not shown and not exported: `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `identity_guesses`, `audience.privacy`, `media.r2_bucket`, `media.r2_key`.

### 6.3 Relations

3,380 relations on 1,080 recordings. Display mapping:

| Type (count) | Heading on the page | Notes |
|---|---|---|
| `clip_of` (449) | "This is a clip from" | Shows the episode and the offset: "Episode 271, starting at 0:41". Play-in-context button opens the episode at `?t=offset` (decision 6) |
| `contains` (437) | "Clips from this episode" | Also marked on the chapter list |
| `aired_again_in` (659) | "Broadcast again" | With dates |
| `continues` (155) | "Continues in / Continued from" | Drives previous/next |
| `part_of_set` (338) | "Other parts" | |
| `same_story` (910), `same_story_other_language` (222) | "Other tellings of this story" | Links to the story-group page when one exists |
| `same_recording` (106), `alternate_take` (40), `superseded_by` (64) | "Other versions" | Decision 7. A superseded recording's own page stays reachable, carries a banner "A better copy of this recording exists", and is `noindex` |

Relations with confidence below 0.8 (243) appear under "Possibly related" at the bottom, collapsed.

### 6.4 Transcript viewer

- Data: `/t/<id>.json`, loaded when the transcript region scrolls near the viewport or the user presses `t`. Format: `{v:1, id, lang, rows:[[start, end, text, [[wordStartOffset, word], …]] | {gap:true, start, end}]}`. Measured gzip size with word timings: median 13.6 KB, max 58 KB per recording; about 15 MB for the whole site.
- English only (`display.transcript_display = show_with_label`, 1,104 recordings). The label "Automatic transcript, may contain errors" is fixed above the transcript and repeated in print. For `search_only` (79) the region reads "This recording is in Yiddish. There is no readable transcript; you can still search it." For `none`: no region.
- Rows grouped under chapter headings from `segments[]`. Timestamp in the left gutter, tabular numerals.
- **Click to seek:** every word is a `<span data-t>`; clicking or pressing Enter on a row seeks to it. Rows are focusable; words are not (2,000+ tab stops would be hostile).
- **Highlighting:** the current row gets a left rule and background; the current word gets the highlight colour. Driven by `timeupdate` plus `requestAnimationFrame` while playing; binary search over row starts.
- **Follow audio** toggle (on by default): keeps the current row in view with `scrollIntoView({block:'nearest'})`; turns itself off when the user scrolls manually and offers "Resume following". Respects `prefers-reduced-motion` (no smooth scrolling).
- **Find in transcript:** in-page filter with match count and next/previous (`Enter` / `Shift+Enter`). Arriving with `?q=` pre-fills it and highlights matches.
- **Select to cite:** selecting text shows a small "Copy quote with citation" button; the copied text is the quote, the citation and the link at the first selected word's time.
- Rendered inside `<section aria-label="Transcript">`; the live position is not announced to screen readers (no `aria-live`), since the audio is already playing.

### 6.5 Deep links and citations

- `?t=<seconds>` or `?t=12m34s` or `?t=12:34` positions the player at that time and scrolls the transcript there. It does **not** autoplay (browsers block it and it is rude); the play button reads "Play from 12:34". `&end=<seconds>` optionally stops there (used by playlists).
- "Copy link at current time" (`c`) writes `https://<site>/r/585fe67e3e/?t=754`.
- The **Cite** dialog offers three copyable forms, pre-built in the export so the strings are identical everywhere:
  - Short: `Uncle Yossi, Tzivos Hashem on the Air, ep. 271, 1 Nissan 5747, 12:34`
  - Full: `Rabbi Yosef Goldstein (Uncle Yossi), "The Mystery of Dayeinu (Rosh Chodesh Nissan)," Tzivos Hashem on the Air, episode 271, broadcast 1 Nissan 5747 (31 March 1987), at 12:34. Goldstein Story Library, https://<site>/r/585fe67e3e/?t=754`
  - Link only.
  Rules: the time part appears only when the player is past 0:05 or `t` is set. Date wording follows precision ("week of…", "c. 5748", omitted when unknown). No speaker is named when the speaker is `unknown` or an unconfirmed placeholder; the citation then starts with the title. Non-radio example: `Rabbi Chaim Levi Goldstein, "Melave Malka: The Special Guest," at 4:10.`
- Each page embeds schema.org `AudioObject` JSON-LD (name, description, duration, contentUrl, datePublished when day precision, inLanguage).

### 6.6 Player

One `<audio>` element owned by the persistent bar. Controls: play/pause, back 15 s, forward 30 s, scrubber with chapter ticks, current chapter name, speed (0.75–2×), volume, queue, sleep is **not** included (that is the bedtime site's job). Media Session API metadata and handlers (lock-screen controls, next/previous). Position per recording is remembered in `localStorage` ("Resume at 12:34?"). On error, a plain message with the direct MP3 link.

## 7. Indexes and structured views

### 7.1 Radio show timeline (`/radio/`)

Facts: episode numbers 1–555; **411 are in the archive** (414 recordings including second copies); **144 numbers are not** (42–112 as one block, 72 scattered, and number 16 whose only copy is defective and hidden). Of 408 episodes with a full date, 398 fall on a Tuesday. Date precision for episodes: day 301, week 107, month 5, year 1. Episodes per Hebrew year: 5742: 39 · 5743: 0 · 5744: 28 · 5745: 35 · 5746: 44 · 5747: 24 · 5748: 30 · 5749: 55 · 5750: 49 · 5751: 50 · 5752: 51 · 5753: 9.

Layout: a year rail (5742 … 5753, each with its Gregorian span and a found/total count) and, per year, a grid in broadcast order, one cell per episode number:

```
5747 (1986–87)   N of M episodes in the archive        (numbers and dates here are illustrative)
[ 262 ] [ 263 ] [ 264 ] [ 265 ] [ 266 ] [ 267 ] [ 268 ] [ 269 ] [ 270 ] [ 271 ] …
 11 Tev   18 Tev  ░lost░  ░lost░   9 Shv   …                               1 Nis
```

- Found cell: number, Hebrew date, title on focus/hover, a coloured edge when it is a serial chapter (one colour slot per serial within a year, plus the serial title in text, never colour alone). Activating opens the recording.
- Lost cell: hatched, labelled "Episode 264: not found yet". Activating opens a small panel: estimated air date (interpolated from the Tuesday sequence, shown as "around 25 Teves 5747"), the title from the producer's master tape catalog when it lists one, and "Do you have this tape? Help us find it" with the contact route chosen by the owner (Q5). The catalog document itself is linked from `/about/` (`media_catalog.csv` gives its public URL).
- The block 42–112 collapses into one wide cell "Episodes 42–112 (5743): 71 episodes not found yet", expandable.
- Toggle "List view": a plain table (No., Hebrew date, Gregorian date, title, serial, status) for screen readers, printing and sorting. The grid is an enhancement of this table, not a separate data path.
- A second toggle arranges the same year by Jewish month, so "what did he say before Pesach each year" reads down a column.
- A full "Lost episodes" list at `/radio/lost/` (decision 9).

### 7.2 Serial reader (`/serials/<story_key>/`)

26 serials, 67 airings in the archive, 56 of them complete, 76 chapters in the full tellings. Page: title, alternate titles, a chapter table with one column per airing (1982, 1986, 1990 …). Each cell: episode number, date, the story segment's start–end inside the episode, a play button that plays **only that segment** (`?t=737&end=1365`), and a "missing" mark where the chapter was not found. "Play the whole story" queues every chapter segment of the most complete airing, in order. "Add story to playlist" does the same into a playlist. Chapters marked as the same text in another airing say so.

### 7.3 Story groups (`/stories/<group_id>/`)

95 groups covering 369 recordings; 22 groups span languages; median 2 tellings, at most 7. Page: story title, then one column (cards on narrow screens) per telling: teller, date, language, length, series, short summary, play at the story's start. For two English tellings, "Compare transcripts" shows the two transcripts in parallel columns, each scrolling independently with its own play position. No diffing. Yiddish tellings show the summary only.

### 7.4 People, places, sources, calendar, parsha, study

- **People** (`/people/`): 119 people in use, grouped by the 7 vocabulary categories, counts beside each. Person page: label, aliases, then four lists by role (Central / Appears / Teaching cited / Mentioned) and a link to the same set in `/search`. No biographies in MVP. Vocabulary entries flagged unconfirmed get no page.
- **Places**: one page, alphabetical with counts (150 names on 312 recordings; top: Yerushalayim 46, Russia 34, Lubavitch 30). No map in MVP.
- **Sources cited** (`/sources/<work>/`): every citation of that work as a table: Reference, Note, Recording, Date; sortable by reference. Chumash 348, Gemara 218, Tehillim 190, Sichos 150, Siddur 134, Pirkei Avos 124 …
- **Calendar**: the 66 occasions in Jewish-year order starting from Elul/Tishrei, with counts; each page lists recordings and, for radio episodes, the year they aired.
- **Parsha**: all 54 in order. Coverage is thin and the page says so: only 116 recordings carry a parsha tag and 25 parshiyos have none. Empty parshiyos show "Nothing tagged yet" and a link to search the parsha name in transcripts.
- **Study** (`/study/`): Tanya table by perek (42 shiurim, Yiddish), then Haggadah (9), Shulchan Aruch HaRav (7), others.

### 7.5 Teacher tools (deliberately few)

1. **"Find a story for class"** is a preset of `/search`: Type = story, story chapter, radio segment, lesson with story; Stands alone = standalone; plus the Midah, Age, Length and "leave out" advisories facets opened. No separate tool.
2. **Print card:** a print stylesheet on the recording page (`@media print`, also reachable as `?print=card`): title, speaker, date, length, ages, short summary, lesson, midos and mitzvos, sources cited, parents' notes, the citation and a QR code to the page (generated at build time as inline SVG). One A5-proportioned card; "Print chapters too" checkbox.
3. **Playlist print sheet:** a playlist prints as a running order with lengths, lessons and a QR code per item.

Not built: lesson-plan generators, worksheets, quizzes, classroom accounts.

## 8. User playlists

### 8.1 Behaviour

- Any play-capable row or page has "+ Playlist": pick an existing playlist or create one. On a chapter row or a serial chapter it adds that **segment** (start and end), not the whole recording.
- `/playlists/` lists the user's playlists; a playlist page allows reorder (drag, and Alt+Up/Down for keyboard), remove, rename, a note per item, play all, print, export, share link, delete (with undo for 10 seconds).
- **The limitation is stated wherever playlists appear**, in a persistent info line, not a one-time toast: "Your playlists are saved in this browser only. There are no accounts. Clearing browser data, private windows or another device will not have them. Export a file to back up or share."
- After 5 or more items have been added since the last export, the playlist page shows a gentle "Back up: export this playlist" prompt. The site requests `navigator.storage.persist()` when the first playlist is created.

### 8.2 Storage

`localStorage` key `gsl.playlists.v1`, value: the document below. Size is tiny (about 60 bytes per item); limit 100 playlists × 500 items, enforced in UI. Writes are whole-document, guarded by a `storage` event listener so two open tabs do not overwrite each other (last write wins per playlist, merged by `updated`).

Export: one playlist or all, as a file `goldstein-playlists-YYYY-MM-DD.json` (`application/json`), via a Blob download. The export embeds titles and durations so the file is readable without the site; on import, titles are refreshed from the catalog by id.

Import: file picker or drag and drop. Validate against the schema; reject files over 1 MB; unknown ids are kept but shown as "No longer available"; a playlist whose `id` already exists prompts "Replace / Keep both / Skip". `version` greater than the site knows: import what validates and say so.

Share link: `/playlists/#p=<base64url(deflate(json of one playlist))>`, offered only when the result is under 1,800 characters (about 40 items); the receiving page shows the playlist read-only with "Save to my playlists". Nothing is sent to a server.

### 8.3 File format (versioned)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://<site>/schemas/playlists-1.json",
  "title": "Goldstein Story Library playlists",
  "type": "object",
  "required": ["format", "version", "playlists"],
  "additionalProperties": false,
  "properties": {
    "format":   { "const": "goldstein-playlists" },
    "version":  { "const": 1 },
    "exported": { "type": "string", "format": "date-time" },
    "site":     { "type": "string", "format": "uri" },
    "playlists": {
      "type": "array", "maxItems": 100,
      "items": {
        "type": "object",
        "required": ["id", "name", "items"],
        "additionalProperties": false,
        "properties": {
          "id":      { "type": "string", "pattern": "^[a-z0-9]{12}$" },
          "name":    { "type": "string", "minLength": 1, "maxLength": 120 },
          "note":    { "type": "string", "maxLength": 2000 },
          "created": { "type": "string", "format": "date-time" },
          "updated": { "type": "string", "format": "date-time" },
          "origin":  { "type": "string", "maxLength": 200,
                       "description": "e.g. 'tonight:2026-11-25:calm-chassidic' when copied from a shared playlist" },
          "items": {
            "type": "array", "maxItems": 500,
            "items": {
              "type": "object",
              "required": ["rec"],
              "additionalProperties": false,
              "properties": {
                "rec":   { "type": "string", "pattern": "^[0-9a-f]{10}$" },
                "start": { "type": "number", "minimum": 0 },
                "end":   { "type": "number", "exclusiveMinimum": 0 },
                "label": { "type": "string", "maxLength": 200,
                           "description": "segment title when start/end are set" },
                "note":  { "type": "string", "maxLength": 1000 },
                "title": { "type": "string", "maxLength": 300,
                           "description": "snapshot for readability; refreshed on import" },
                "dur":   { "type": "number", "minimum": 0 }
              }
            }
          }
        }
      }
    }
  }
}
```

Version policy: additive changes keep `version: 1`; a breaking change bumps the version and ships a migration from every earlier one. The schema file is published at the `$id` URL. The same format is the proposed interchange with the other two sites, so a playlist exported here imports there.

## 9. Tonight's playlists

The bedtime site's concept owns the recipes, rotation and file format. The Library only reads and displays.

- Assumed contract (to be confirmed with that spec; adapt the adapter, not the UI): a same-origin or CORS-enabled static file `tonight.json` holding today's playlists and one file or array for the previous 7 days, each playlist as `{key, title, description, date, items:[{rec, start?, end?}]}`.
- Home page strip: up to 3 cards (title, item count, total time, "Play", "Open").
- `/playlists/tonight/`: today's playlists in full, then "Earlier this week" with one collapsible group per day for 7 days. Each playlist renders with the Library's own row component, so every item has its full metadata, cite and add-to-playlist actions.
- "Save a copy to my playlists" writes a user playlist with `origin` set. This is the only way to keep one after it rotates out; the page says "These change every night and are kept for 7 days".
- If the file is missing or malformed, the strip and page section are omitted without an error banner. Items whose ids are not in the Library catalog are skipped.
- The Library shows them in its own visual style. No bedtime theming, no sleep timer.

## 10. Data download (`/data/`)

Offered as static files generated by the export, with a field guide rendered from the schema:

| File | Contents | Size |
|---|---|---|
| `library.json` | Every public recording record, exactly as the site uses it | about 5.7 MB (1.3 MB gzip) |
| `library.csv` | Flat table: id, url, title, type, series, episode, speakers, Hebrew date, Gregorian date, precision, duration, language, age_min, midos, mitzvos, topics, calendar, parshiyos, people, works, audio_url | about 1 MB |
| `vocabularies.json` | Public labels for every vocabulary id (no descriptions that mention the review process, no `asr_glossary`) | small |
| `serials.json`, `story-groups.json`, `series.json`, `lost-episodes.json` | The indexes | small |
| `schemas/` | JSON Schema for the public record and for playlists | small |

Not offered in MVP: bulk transcripts, the audio as an archive. The page states the terms of use chosen by the owner (Q4) and that summaries and tags are AI-generated. It also links the producer's master tape catalog and the other public documents from `media_catalog.csv` (15 files).

## 11. Public export: fields needed

One package (`packages/export`, shared by all three sites) reads `data/` and writes the public dataset. The Library needs the following. Anything not listed is not exported.

**Passed through unchanged:** `id`; `display.*`; `classification.*`; `audience.level`, `age_min`, `advisories`; `subjects.*`; `segments[]`; `language.*`; `media.url`, `size_bytes`, `mime_type`.

**Dropped (binding):** `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`. **Also dropped by this spec:** `identity_guesses`, `audience.privacy`, `relations[].note`, `relations[].evidence`, `media.r2_bucket`, `media.r2_key`, vocabulary `description` text that records review history.

**Derived:**

| Field | From | Rule |
|---|---|---|
| `duration_sec` | `source.duration_sec` | rounded to 0.1 s |
| `content_start_sec`, `content_end_sec` | `quality.trim` | 23 recordings; numbers only, no note |
| `audio_quality` | `quality.audio` | only the value `fair` is exported, as a flag for a generic "older tape, uneven sound" line (44 recordings) |
| `published` filter | `quality.publish_recommendation` | `hide` (1) and `review` (9) are left out entirely. `publish_with_note` (67) is published; its internal note is not |
| `primary_id`, `versions[]` | `relations` of type `superseded_by`, `same_recording`, `alternate_take` | 64 superseded recordings point at their preferred copy |
| `transcript.mode`, `transcript.rows` → `/t/<id>.json` | transcript + `hidden` | masking rule 5.4; Yiddish rows are never written to `/t/` |
| search documents | masked transcript | 30-second passages, English and Yiddish, glossary canonical forms appended |
| `segments[].end_sec` | next start or duration | fills 645 missing ends |
| `date.weekday`, `date.hebrew_parts {d, m, y}`, `date.sort_key`, `date.display` | `classification.date` | parsed and formatted once |
| `speakers_display[]`, `series_display` | vocabularies | label + `unconfirmed` flag; `unknown` → no label |
| `citation.short`, `citation.full` | section 6.5 | time part appended client-side |
| `slug` | title | for pretty URLs only |
| `flags` | counts | has_chapters, has_transcript, in_serial, has_other_tellings |
| `catalog.json` | all of the above | compact row per recording for search and cards (0.33 MB gzip) |
| `lost-episodes.json` | episode numbers 1–555 not present, the master tape catalog, Tuesday interpolation | `{number, title?, est_gregorian, est_hebrew, block?}`; 144 entries. The catalog document is in R2, not in git; extracting its rows is a one-time data task whose result should be committed under `data/indexes/` |
| `serials.json`, `story-groups.json`, `series.json` | `data/indexes/*` | internal fields (`publish`, containment scores, generator notes) removed |

**Export tests (CI, must pass before any deploy):**
1. No output file contains the keys `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `identity_guesses`, `privacy`.
2. No output string contains a full name from that recording's `hidden.on_air_people` (today 0), nor any `hidden.addresses[].text` or `hidden.other_personal[].text`.
3. For every hidden span, no transcript row and no search passage overlaps it.
4. No Yiddish transcript text appears under `/t/`.
5. Every `rec`/`target_id` in the output resolves to a published recording or is removed.

## 12. Visual direction

A reading room: paper, ink, one blue, one ochre. No gradients, no shadows beyond one hairline elevation for the player bar and dialogs, no illustrations. Icons are a single 1.5 px stroke set, always paired with text labels in primary actions.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAF8F3` | `#12161C` | page |
| `--surface` | `#FFFFFF` | `#1A2029` | cards, panels, player |
| `--ink` | `#1B2430` | `#E6E2D8` | body text |
| `--muted` | `#5B6573` | `#9AA3AF` | secondary text, timestamps |
| `--rule` | `#DDD8CC` | `#2C3440` | hairlines, table borders |
| `--accent` | `#1F4E79` | `#8DB8E8` | links, primary buttons, focus ring |
| `--accent-2` | `#8A5A14` | `#E0B46A` | Hebrew dates, serial markers, active chapter rule |
| `--mark` | `#FFE49A` | `#5A4A12` | current word, search hits |
| `--advisory` | `#9A3B2E` | `#E39A8C` | parents' note border and icon |
| `--ok` | `#2E6B4F` | `#7FC8A2` | "found", "saved" |
| `--lost` | `#EDE8DC` hatched with `--rule` | `#202733` hatched | lost-episode cells |

All text pairs meet WCAG AA (body pairs exceed 7:1). Dark mode follows `prefers-color-scheme` with a manual toggle stored in `localStorage`. Print forces the light palette.

Type (self-hosted WOFF2, `font-display: swap`):
- UI: **Inter** 14/20 base, 13 px for dense table cells, tabular numerals for all times and counts.
- Reading (summaries, lesson, transcript): **Source Serif 4** 17/27, measure capped at 68 characters.
- Hebrew and Yiddish: **Frank Ruhl Libre**, sized 110 % of adjacent Latin; every Hebrew-script run carries `lang` and `dir="rtl"`.
- Headings: Source Serif 4 semibold; H1 28 px, H2 20 px. No display sizes.

Density: 8 px grid; result rows about 96 px in list view, 36 px in table view; facet rows 28 px; minimum pointer target 28 × 28 px in dense views and 44 px on touch widths. Max content width 1,240 px; three breakpoints (600, 900, 1,200).

### Accessibility and keyboard

- Semantic landmarks, one H1, a skip link, visible 2 px focus ring in `--accent` with 2 px offset everywhere.
- Every interactive thing is a real `<button>`, `<a>`, `<input>` or `<details>`. Facets are fieldsets of checkboxes. The timeline grid is a list of links with full text labels ("Episode 271, 1 Nissan 5747, The Mystery of Dayeinu"; "Episode 264, not found yet").
- Result count changes are announced through one polite live region ("37 recordings").
- Works without JavaScript for reading: item pages, indexes, timeline table and audio (`<audio controls>` fallback) are static HTML. Search, transcript sync and playlists need JavaScript and say so.
- Shortcuts (listed in `/help/` and in a `?` dialog; all single-key shortcuts are disabled while a text field has focus and can be switched off in settings, per WCAG 2.1.4):

| Key | Action | Key | Action |
|---|---|---|---|
| `/` | focus search | `Space` | play / pause |
| `j` / `k` (lists) | next / previous result | `←` / `→` | back 15 s / forward 30 s |
| `Enter` | open | `[` / `]` | previous / next chapter |
| `p` | play focused result | `<` / `>` | slower / faster |
| `a` | add to playlist | `c` | copy link at current time |
| `f` | focus facet filter | `t` | jump to transcript |
| `x` | exclude focused facet value | `?` | shortcut help |

## 13. Numbers in one place

| Measure | Value |
|---|---|
| Recordings / hours / audio size | 1,184 / 415.1 h / 17.9 GB |
| Published after policy filters | 1,174 (1 hidden, 9 awaiting review); 64 of them shown only as "other versions" |
| By language (hours) | English 349.9 · Yiddish 65.2 |
| Radio series | 832 recordings, 247.2 h: 414 episodes, 413 segments/clips |
| Weekly stories (R' Chaim Levi) / Tanya (Yiddish) | 190 recordings, 68.6 h / 43 recordings, 46.9 h |
| Episode numbers found / missing | 411 / 144 of 555 |
| Date precision | day 651 · week 204 · month 31 · year 10 · decade 1 · unknown or none 287 |
| With Hebrew date / Gregorian date | 970 / 894 |
| With chapters | 750 recordings, 5,890 chapters |
| With relations | 1,080 recordings, 3,380 relations |
| With sources cited | 854 recordings, 2,010 citations, 33 works |
| With people / places / characters | 936 (119 people) / 312 (150 places) / 807 |
| With lesson / midos / mitzvos / calendar / parsha | 1,169 / 1,143 / 1,130 / 771 / 116 |
| With parents' advisories | 578 recordings, 940 advisories |
| Serials / story groups | 26 serials, 67 airings / 95 groups, 369 recordings, 22 cross-language |
| Transcript text | 16.3 MB raw, 4.7 MB gzip; 46,089 segments; 2.74 M words |
| Hidden spans | 1,716 entries on 447 recordings; 49 h; 11.2 % of transcript segments masked; 49 entries without an end time |
| Pagefind index (measured) | 17 MB total, 150 index chunks averaging 44 KB |
| SQLite FTS5 (measured) | 24 MB, 9.5 MB gzip, queries about 1 ms |
| Catalog for client-side facets | 1.40 MB, 0.33 MB gzip |
| Transcript viewer files | median 13.6 KB gzip, max 58 KB, about 15 MB in total |

## 14. MVP and later

**MVP (launch):**
1. Public export with masking and the five CI tests.
2. Recording page: all fields, chapters, relations, player, transcript with click-to-seek and word highlight, `?t=`, cite dialog, print card.
3. `/search` with all facets, counts, any/all/exclude, vocabulary-first suggestions, metadata + Pagefind transcript search, URL state, list and table views.
4. Radio timeline with lost episodes; series pages; serial reader; story-group pages (without parallel transcripts).
5. People, sources, calendar, parsha, places, study indexes.
6. Playlists with export/import; tonight's playlists strip and page.
7. Data download; About; Help; dark mode; keyboard shortcuts.

**Later, in this order:**
1. Parallel transcript comparison in story groups.
2. Query-time transliteration variants (5.3 item 3) if search logs from user reports show misses; the glossary expansion ships in MVP.
3. Share links for playlists.
4. "Report an error" on any field, pre-filling an email or form with the recording id and field.
5. Tighter hidden spans (data work) and re-export.
6. Hebrew-date lookup "what aired this week in 5749".
7. D1/FTS5 back end, only under the conditions in 5.3.

## 15. Non-goals

- Accounts, sync, comments, ratings, social features.
- Any server-side state or analytics that identify people. If analytics are wanted: Cloudflare Web Analytics only.
- Editing audio, clipping audio files, or serving audio through the site's origin.
- Showing Yiddish ASR text; translating transcripts; correcting transcripts in the browser.
- Asserting unconfirmed identities or the unconfirmed series name; showing `identity_guesses`.
- Bedtime features (sleep timer, calm mode) and children's features (big buttons, mascots): the other two sites.
- Maps, biographies, AI chat or "ask the archive".
- Lesson-plan generation.

## 16. Open questions for the owner (not decided here)

- **Q1. Coarse hidden spans.** 11.8 % of the audio is under a hidden span and 101 recordings are more than 30 % masked, so their transcripts are mostly gaps. Accept for launch, or tighten spans to the actual names first?
- **Q2. First-name review list.** 43 places where a hidden person's first name also occurs in the same recording's public summary or chapter text. Probably Tanach names; someone should look once.
- **Q3. Yiddish text in static search files.** With Pagefind the Yiddish ASR text is not displayed but is technically downloadable. Acceptable, or must it stay server-side (which means D1)?
- **Q4. Terms for the data download** (licence wording, attribution), and whether bulk masked transcripts may be offered.
- **Q5. Contact route** for "help us find this tape" and for corrections.
- **Q6. The 9 `review` recordings**: this spec leaves them out until cleared.
- **Q7. Whole files versus halves** (already in `review/REVIEW_QUEUE.md`): the Library follows whatever is decided through `superseded_by`.
- The site name and the weekly series name (still "Weekly Story (working title)" on 190 recordings).

## 17. Acceptance criteria

Privacy and policy
1. The five export tests in section 11 pass; a deliberately planted hidden name in a fixture makes the build fail.
2. Searching for any full name from any `hidden` block returns no result and no excerpt.
3. Yiddish recordings show no transcript text anywhere, including search excerpts; English transcripts always carry the "Automatic transcript, may contain errors" label.
4. No unconfirmed placeholder is rendered without its "unconfirmed" wording; `unknown` speakers render "Speaker not identified".
5. The hidden episode 16 has no page; it appears in the timeline as not found. Superseded recordings never appear as separate search results and are listed under "Other versions".
6. Every clip page links to its episode at the right offset; every episode lists its clips.

Search
7. From a cold load on a simulated 4G connection, `/search` is interactive within 2.5 s and a facet click updates results and counts within 100 ms.
8. A transcript query transfers under 400 KB for the first results page and returns within 1 s on a warm cache.
9. `midos=hakaras_hatov` + age ≥ 6 + length under 15 min returns the same set as a reference Python query over `data/` (test fixture), and counts beside every facet value match the reference.
10. Searching `"ad mosai"` lists Episode 271 with an excerpt and a timestamp; following it lands on `/r/585fe67e3e/?t=…` with the transcript scrolled to and highlighting that passage.
11. Typing `tzedaka` offers the Mitzvah "Tzedakah" as the first suggestion.
12. The full search state survives reload and can be shared by URL.

Recording page
13. `?t=754` positions the player at 12:34 without autoplay; "Copy link at current time" round-trips to within 1 second.
14. The short citation for Episode 271 at 12:34 is exactly `Uncle Yossi, Tzivos Hashem on the Air, ep. 271, 1 Nissan 5747, 12:34`.
15. During playback the highlighted word is within 0.5 s of the audio; clicking a word seeks to it; manual scrolling pauses following.
16. Masked gaps render as the one-line marker and never show text; the audio plays through them.
17. Audio continues uninterrupted when navigating between pages.

Timeline and indexes
18. `/radio/` shows 555 episode positions: 411 found, 144 not found, with 42–112 collapsed; the list view contains the same information as the grid.
19. Each of the 26 serials has a page whose chapter segments play only their start–end range.
20. Each of the 95 story groups has a page listing all its tellings.

Playlists
21. A playlist of 50 items survives reload; export then import in a fresh browser profile reproduces it exactly; the exported file validates against the published schema.
22. The "saved in this browser only" notice is visible on `/playlists/` and in the add-to-playlist dialog.
23. An invalid or oversized import file is rejected with a specific message and changes nothing.
24. With `tonight.json` absent, no error is visible anywhere.

Accessibility and quality
25. axe-core reports no serious or critical issues on Home, Search, Recording, Radio and Playlists in both themes.
26. Every action in sections 4, 6 and 8 can be completed with the keyboard alone; focus is always visible; shortcuts are inactive in text fields and can be turned off.
27. With JavaScript disabled, a recording page shows all metadata and a working native audio control.
28. Lighthouse performance ≥ 90 and accessibility ≥ 95 on the Recording page (mobile profile). JavaScript shipped on a recording page ≤ 90 KB gzip excluding Pagefind.

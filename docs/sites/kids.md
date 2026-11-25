# Kids' Library: product and UX concept

Status: concept for implementation, 2026-11-25. One of three sites in the planned monorepo (bedtime site, **kids' library**, adult/teacher reference library). Binding inputs: `CLAUDE.md`, `docs/DECISIONS.md`, `data/README.md`. Numbers below come from read-only scripts run over `data/recordings/**/*.meta.json` on this date.

Working name: **"Story Shelf"** (owner to confirm; the name must not appear in code other than one config constant).

---

## 1. Audience and goals

**Who drives it**

| Mode | Who | What they do | Design consequence |
|---|---|---|---|
| Primary | A 6–11-year-old alone on a tablet or a parent's phone | Taps covers, follows a serial, keeps favourites | UI copy at grade 2–3 reading level, 1–4 words per label, every label paired with an icon |
| Secondary | A parent with a 3–5-year-old on their lap | Picks something short and gentle, checks the advisory | Age setting, parent note on every item, "Grown-ups" page |
| Not served here | Teachers, researchers, Yiddish listeners | | Link out to the reference library |

**Goals**
1. A child can start a suitable story within two taps of the home page.
2. A child who finishes a story always has an obvious next one (next chapter, or "more like this").
3. Browsing shows the archive's richness (heroes, midos, holidays, serials) without a single filter form.
4. A parent can see in five seconds what age an item is for and why.
5. Nothing personal from `hidden` is ever shown, indexed or shipped to the browser.

**What the data says about the catalog (drives everything below)**

| Fact | Number |
|---|---|
| All recordings | 1,184 |
| **Kid pool** (rule in §9) | **1,035** |
| Radio shows (`radio_episode`), median 29.9 min | 410 |
| Stories (`story`, `story_chapter`, `lesson_with_story`, `story_collection`, plus radio clips with a `story_type`) | 314 |
| Quick listens (radio clips without a story, plus `talk`); about 355 pool items are under 10 min | 293 |
| Events 11, songs 3 | 14 |
| Excluded: Yiddish/Hebrew 79, adult levels 44, shiurim, fragments, promos, family recordings, 58 superseded copies, 9 `review`, 1 `hide` | 149 |

Three kinds of thing, roughly a third each, so the top navigation is built on **Stories / Radio Show / Quick Listens**, not on series ids. Inside a radio show the story starts at a median of 10:57 and runs a median of 9:28, which is why "Jump to the story" is a first-class button.

---

## 2. Vocabulary used in this spec

- **Kind** (derived, the site's main type):
  - `show` = `content_type` `radio_episode`
  - `story` = `story`, `story_chapter`, `lesson_with_story`, `story_collection`, or `radio_segment` with non-empty `story_type`
  - `short` = `radio_segment` with empty `story_type`, or `talk`
  - `event` = `live_event`; `song` = `song`
- **Age band** (viewer setting, §8): Little, Kids (default), Big Kids.
- **Shelf**: a horizontally scrolling row of cover cards with a title and a "See all" link.
- **Tile**: a large square icon button that opens a tag page.

---

## 3. Site map

```
/                       Home
/stories                All stories (kind=story)
/radio                  The radio show: year tabs, episode number grid, lost episodes
/serials                Chapter stories (radio serials + multi-part weekly stories)
/serial/<story_key>     One serial, chapters in order
/quick                  Quick listens (kind=short)
/explore                Tile hub with 4 tabs: Topics, Midos, Mitzvos, Heroes
/topic/<slug>  /midah/<slug>  /mitzvah/<slug>  /hero/<people id>   Tag pages
/holidays               12 holiday tiles in calendar order
/holiday/<slug>         One holiday shelf page
/parsha/<id>            Parsha list (only for parshiyos with >= 2 items)
/playlists              Tonight's playlists + last 7 days
/favourites             My shelf (localStorage)
/search                 Search
/listen/<id>            Item page (all kinds)
/grown-ups              Parent page: age setting, advisories explained, about, privacy, link to reference library
```

**Navigation**
- Bottom tab bar on phones, left rail on tablets and desktop. Five tabs, icon over label, each at least 64×56 px: **Home, Stories, Radio, Explore, My Shelf**.
- Top bar: logo (home), search button (magnifying glass, opens `/search`), age-band chip (shows current band, opens the band picker).
- Holidays, Quick Listens, Serials and Playlists are reached from Home shelves and from Explore's header row of four wide buttons. They are not tabs.
- The mini-player sits above the tab bar on every page (§7).
- No hamburger menu, no dropdowns, no multi-select filters anywhere. Back is the browser's back; every page also has a visible back arrow top-left.

---

## 4. Pages

### 4.1 Home `/`
Top to bottom. Every shelf is hidden when it has fewer than 4 items in the current age band.

1. **Greeting strip**: "Good evening!" plus the Hebrew date and, if any, today's occasion ("15 Kislev · Chanukah is in 10 days").
2. **Story of the Day**: one hero card, full width, big cover, title, duration, giant Play button. Selection rule in §6.4.
3. **Keep Listening**: up to 6 items with saved progress between 30 s and 95%, most recent first. Hidden when empty.
4. **Tonight's Playlists**: the shared playlists (§10), one card each, plus a "Past nights" link.
5. **Coming up: `<holiday>`**: one shelf per active holiday group (§5.2), at most 2 shelves.
6. **This week's parsha: `<name>`**: shown only if the parsha has at least 2 items (§5.5).
7. **Chapter Stories**: serial cards (cover shows chapter count). If the child has a serial in progress, it is first, labelled "Next: Chapter 3".
8. **Meet a Hero**: 8 hero tiles, rotating daily from the hero list (§5.6).
9. **Pick a Midah**: the 13 midos tiles (§5.3) as a shelf.
10. **Quick Listens (under 10 minutes)**: 12 random-by-day shorts.
11. **Surprise Me** button: plays a random standalone story from the Story-of-the-Day pool.

### 4.2 Stories `/stories`
- Header: "Stories" and a row of 4 one-tap sort chips (single select): **New to me** (unplayed first, default), **Short** (ascending duration), **Long**, **A–Z**.
- Second row, single-select **story type** chips mapped from `classification.story_type` (counts among the 314 stories):

| Chip | `story_type` | Stories |
|---|---|---|
| Chassidic tales | `chassidic` | 176 |
| Tales with a lesson | `moral_fiction` | 56 |
| Long ago | `historical` | 45 |
| Mesholim | `mashal_parable` | 41 |
| It really happened | `contemporary` | 32 |
| From the Torah | `tanach_midrash` | 26 |
| Great rabbis | `rishonim_acharonim` + `talmudic` (merged: 23 + 15) | 38 |

  `family_memoir` (4) gets no chip.
- Grid of cover cards, lazy-loaded 24 at a time.

### 4.3 Radio `/radio`
- Intro card: "Uncle Yossi's radio show. Every week from 1981 to 1992." One Play button: "Play a show" (random show in band).
- **Year tabs** by `date.hebrew_year`: 5742 (39 shows), 5744 (28), 5745 (35), 5746 (44), 5747 (24), 5748 (30), 5749 (52), 5750 (49), 5751 (50), 5752 (51), 5753 (9). Label each as "1981–82" with the Hebrew year small. There are no shows from 5743.
- Under each tab: a **number grid** of episode tiles in order. A held episode is a coloured tile with its number; tap opens the item page.
- **Lost episodes (decision 9):** episode numbers run 1–555 and 412 are in the archive, so 143 are missing. A missing number is a grey dashed tile with a small "?"; tapping it shows a sheet: "We're still looking for this tape. Do you have it? Ask a grown-up to tell us." with the catalog title and estimated date if the export has them, and a link to the reference library's lost-episodes list. Missing numbers with no known year go in a final "Still looking" tab. A number that is in the archive but excluded from the kid pool (hidden, under review) is a plain grey tile, not a "lost" one.
- Shelf above the grid: **Chapter stories from the show** (links to `/serials`).

### 4.4 Serials `/serials` and `/serial/<story_key>`
- Data: `data/indexes/serials_index.json` has 26 radio serials: 2 long ones (*The Return of Yehudah*, 14 chapters; *The Storyteller*, 9), 24 of 1–4 chapters; 15 of them aired more than once (up to 7 runs). Separately, 34 multi-part sets exist in `classification.part.set_key` (mostly the weekly stories; 29 have 2–5 parts in the archive).
- `/serials` lists both as one grid, "Chapter Stories", sorted by chapter count descending. Card shows "4 chapters · 52 min".
- `/serial/<key>`:
  - Cover, title, total listening time, **Play from Chapter 1** or **Continue Chapter N**.
  - Numbered chapter list. Each row: big numeral, chapter title, duration, a tick when finished.
  - **Story-only mode (default on):** for a radio serial, each chapter plays only the story range from the index: start at `intro_start_sec` when present, else `segment_start_sec`; stop at `segment_end_sec` (all `parts` in order when the chapter is split), then auto-advance to the next chapter. A toggle "Play the whole radio show" switches to full episodes.
  - **Which run:** use the earliest run with `complete: true` whose items are all in the kid pool; if none is complete, the run with the most chapters. Missing chapters show as a grey row "Chapter 5: we're still looking for this one". Other runs are listed at the bottom under "Other times Uncle Yossi told this story" (collapsed).
  - A serial is hidden from a band if any chapter of the chosen run is outside that band.

### 4.5 Quick listens `/quick`
Grid of the 293 shorts. Chips (single select) mapped from `classification.collections`: **Yomim Tovim** (`Yomim Tovim` + `Chasidishe Yomim Tovim`), **Mitzvos** (`Inyonei Mitzvos`), **Midos** (`Midos Tovos`), **Parsha** (`Parsha of the Week`).

### 4.6 Explore `/explore` and tag pages
- Header row: four wide buttons, **Holidays, Chapter Stories, Quick Listens, Playlists**.
- Four tabs of tiles (mappings in §5): **Topics (16), Midos (13), Mitzvos (15), Heroes**.
- A **tag page** has: big icon, kid label, one-sentence description (from the build config, not AI-generated at runtime), a "Play all stories" button (queues the Stories section), then up to three sections in fixed order: **Stories**, **Quick Listens**, **Radio Shows**, each a grid sorted unplayed-first then by title. Sectioning by kind is the answer to dense tags: even "Trusting Hashem" (479 items) opens on its 166 stories.

### 4.7 Item page `/listen/<id>`
See §6.

### 4.8 My Shelf `/favourites`
Three sections: **Hearts** (favourites, most recent first, up to 200), **Keep Listening**, **Finished** (last 50, with a "Listen again" affordance). A "Clear my shelf" button behind a confirm dialog. All from localStorage; an empty state shows a drawn empty shelf and "Tap the heart on a story to keep it here."

### 4.9 Grown-ups `/grown-ups`
Reached from the age chip and the footer. Plain adult copy. Contains: the age-band picker and the "Gentle stories only" switch; what each advisory means (labels and descriptions from `content_advisory`); a statement that metadata and summaries are AI-generated and may contain mistakes; a note that broadcasts are unedited originals; who the storytellers are; links to the bedtime site and the reference library (transcripts live there); contact link. No gate or PIN in MVP.

---

## 5. Browse facets: exact mappings

Rules applied to every facet:
- **Minimum:** a tile or shelf needs at least 8 items in the current age band, else it is not rendered.
- **Too dense to be a shelf** (does not discriminate): topic `calendar` (545 of 1,035), mitzvah `shema` (458 of 1,184; it marks the weekly Shema guest), mitzvah `torah_study` (457). These are never tiles. They stay in search and similarity (IDF makes them nearly weightless).
- **Too sparse:** `parshiyos` (only 116 of 1,184 items carry one; 30 of 54 parshiyos are used; maximum 9 items), `places` (872 items have none), free-text `characters` (1,535 distinct strings, only 305 used 3+ times, the top ones generic: "the king" 70, "the poritz" 34). None of these is a browse hub.
- Counts below are items in the kid pool, with stories in brackets. Groups overlap.

### 5.1 Topics tab (from `subjects.topics`)

| Tile (kid label) | Topic ids | Items (stories) |
|---|---|---|
| The Baal Shem Tov | `baal_shem_tov_and_students` | 116 (42) |
| The Rebbeim | `chabad_rebbeim`, `the_rebbe`, `hiskashrus` | 220 (120) |
| Tzaddikim and Chassidim | `chassidic_masters`, `chassidim`, `tzaddikim_stories` | 78 (47) |
| Torah Heroes | `tanach`, `sages`, `great_rabbis`, `torah_heroes` | 148 (42) |
| Hashem Is Watching | `emunah_bitachon`, `hashgacha_pratis` | 235 (98) |
| Miracles | `miracles` | 143 (71) |
| Kindness | `kindness_and_community` | 248 (63) |
| Being My Best | `character`, `teshuvah` | 266 (88) |
| Davening and Brachos | `prayer_and_brachos`, `morning_routine` | 216 (60) |
| Learning Torah | `torah_study`, `chassidus_tanya` | 221 (44) |
| Shabbos and Mitzvos | `shabbos`, `mitzvos_in_daily_life`, `kashrus`, `halachah` | 187 (42) |
| Moshiach and the Beis Hamikdash | `moshiach_geulah`, `beis_hamikdash_eretz_yisroel` | 278 (48) |
| Brave Jews Long Ago | `jewish_history`, `mesiras_nefesh_kiddush_hashem` | 98 (48) |
| Family and Home | `family_and_home`, `family_heritage` | 61 (16) |
| Hashem's World | `hashem_in_nature` | 36 (3) |
| Tzivos Hashem | `tzivos_hashem` | 293 (12) |

Not tiles: `calendar` (use Holidays), `parsha` (use the parsha strip).

### 5.2 Holidays (from `subjects.calendar`; 771 of 1,184 items carry at least one)

| Tile | Calendar ids | Items | "Coming up" window (Hebrew dates) |
|---|---|---|---|
| Rosh Hashanah and Yom Kippur | `elul`, `chai_elul`, `chof_hei_elul`, `selichos`, `rosh_hashanah`, `tzom_gedaliah`, `aseres_yemei_teshuvah`, `shabbos_shuva`, `vav_tishrei`, `yom_kippur`, `yud_gimmel_tishrei` | 130 | 1 Elul – 10 Tishrei |
| Sukkos and Simchas Torah | `sukkos`, `simchas_beis_hashoeva`, `hoshana_rabbah`, `shemini_atzeres_simchas_torah`, `shabbos_bereishis` | 34 | 11 – 30 Tishrei |
| Chanukah | `chanukah`, `zos_chanukah` | 47 | 11 Kislev – 2 Teves |
| Tu BiShvat | `tu_bshvat`, `shabbos_shirah`, `rosh_chodesh_shevat` | 18 | 1 – 15 Shevat |
| Purim | `purim`, `adar`, `taanis_esther`, `shabbos_zachor`, `shabbos_shekalim`, `purim_katan`, `zayin_adar` | 88 | 1 – 15 Adar (Adar II in a leap year) |
| Pesach | `nissan`, `shabbos_hagadol`, `yud_aleph_nissan`, `yud_gimmel_nissan`, `erev_pesach`, `pesach`, `acharon_shel_pesach`, `pesach_sheni` | 75 | 25 Adar – 22 Nissan; 12–14 Iyar |
| Sefirah and Lag BaOmer | `sefiras_haomer`, `lag_baomer` | 76 | 23 Nissan – 18 Iyar |
| Shavuos | `shavuos` | 55 | 19 Iyar – 7 Sivan |
| The Three Weeks | `three_weeks`, `shiva_asar_btammuz`, `nine_days`, `tisha_bav`, `shabbos_chazon`, `shabbos_nachamu`, `tu_bav`, `asarah_bteves` | 77 | 14 Tammuz – 15 Av; 7–10 Teves |
| Chassidishe Yomim Tovim | `yud_tes_kislev`, `yud_kislev`, `yud_daled_kislev`, `chof_cheshvan`, `hei_teves`, `chof_teves`, `chof_daled_teves`, `yud_shevat`, `chof_beis_shevat`, `chof_zayin_adar`, `yud_beis_tammuz`, `gimmel_tammuz`, `chof_av` | 76 | 7 days before each date through the date; the shelf then shows only items with that date's id |
| Summer | `summer_vacation` | 49 | 15 Sivan – 30 Av |
| Shabbos and Rosh Chodesh | `rosh_chodesh`, `shabbos_mevarchim`, `shabbos_weekly`, `shabbos_chazak`, `cheshvan`, `kislev`, `winter`, `hakhel_year` | 134 | Never "coming up"; browse only |

- On `/holidays` the tiles are ordered starting from the next upcoming holiday. A holiday page with more than one calendar id shows them as single-select sub-chips (for example Pesach: "Getting ready", "The Seder", "Pesach Sheni"), each needing at least 4 items.
- Holiday-specific mitzvos (`shofar`, `seder`, `matzah`, `chametz`, `sukkah`, `arba_minim`, `megillah`, `mishloach_manos`, `matanos_levyonim`, `chanukah_lights`, `sefiras_haomer`, `fast_days`, `tashlich`, `parshas_zachor`) are not Mitzvos tiles; those items are already on the holiday pages.
- Example for today (15 Kislev 5787): Home shows "Coming up: Chanukah" (47) and "Coming up: Yud-Tes Kislev" (21).

### 5.3 Midos tab (from `subjects.midos`; only 41 of 1,184 items have none, the best-covered facet)

| Tile | Midos ids | Items (stories) |
|---|---|---|
| Trusting Hashem | `emunah`, `bitachon` | 479 (166) |
| Loving Every Jew | `ahavas_yisroel`, `achdus` | 287 (68) |
| Kindness and Giving | `chesed`, `generosity` | 261 (86) |
| Being Happy | `simcha`, `contentment`, `no_jealousy` | 287 (72) |
| Saying Thank You | `hakaras_hatov` | 143 (39) |
| Respect | `kibbud` | 123 (23) |
| Telling the Truth | `emes` | 95 (41) |
| Being Brave | `courage`, `mesiras_nefesh` | 183 (81) |
| Listening to Hashem | `kabbalas_ol`, `yiras_shamayim` | 229 (91) |
| Trying My Hardest | `hasmadah`, `zerizus`, `valuing_time`, `responsibility` | 207 (62) |
| Being Humble | `anavah` | 92 (39) |
| Staying Calm | `self_control`, `savlanus`, `controlling_anger`, `resisting_bad_influence` | 134 (45) |
| Kind Words and Peace | `shemiras_halashon`, `shalom`, `forgiveness`, `dan_lkaf_zchus` | 89 (38) |

`tznius` (3 items) has no tile. Each tile shows the Hebrew term small under the kid label ("Telling the Truth · Emes").

### 5.4 Mitzvos tab (from `subjects.mitzvos`)

| Tile | Mitzvos ids | Items (stories) |
|---|---|---|
| Tzedakah | `tzedakah` | 350 (66) |
| Davening and Tehillim | `davening`, `tehillim` | 342 (97) |
| Brachos | `brachos` | 144 (43) |
| Welcoming Guests | `hachnasas_orchim` | 112 (41) |
| Shabbos | `shabbos_candles`, `shabbos`, `kiddush`, `havdalah`, `melave_malka` | 177 (35) |
| Honouring Parents | `kibbud_av_vaem`, `kibbud_zekeinim` | 94 (26) |
| Helping Others | `ahavas_yisroel_mitzvah`, `gemilus_chasadim`, `hashavas_aveidah`, `bikur_cholim`, `pidyon_shvuyim`, `hachnasas_kallah` | 248 (83) |
| Teshuvah | `teshuvah` | 144 (48) |
| The 12 Pesukim | `twelve_pesukim` | 84 (6) |
| Good Morning Mitzvos | `negel_vasser`, `modeh_ani` | 66 (31) |
| Mezuzah | `mezuzah` | 44 (11) |
| Tefillin, Tzitzis and Yarmulke | `tefillin`, `tzitzis`, `yarmulke`, `payos`, `upsherin` | 41 (27) |
| Kosher | `kashrus` | 25 (13) |
| Shul and Seforim | `kavod_shul` | 52 (7) |
| Sharing Yiddishkeit | `mivtzoim`, `chinuch`, `chitas`, `rambam_daily` | 126 (30) |

All other mitzvah ids (`shema`, `torah_study`, the holiday mitzvos above, and ids with under 8 items) are search and similarity only.

### 5.5 Parsha
- Build emits the week's parsha (diaspora reading) in `calendar.json`. If the parsha id has at least 2 items in band, Home shows "This week's parsha" and `/parsha/<id>` lists them. Otherwise the shelf is absent; no empty state, no fallback to neighbouring parshiyos.
- Only 9 parshiyos have 6 or more items, so there is no parsha index page in MVP.

### 5.6 Heroes tab (from `subjects.people`)
- A person gets a hero tile when they are `central` or `appears` in at least 5 kid-pool items: 38 of the 133 vocabulary people qualify (22 have 8+). `mentioned` and `teaching_cited` roles (1,792 of 2,732 taggings) never count for browse: "the Rebbe is mentioned" is true of 281 items and tells a child nothing.
- Grouped in rows by vocabulary `category`, with kid labels: **From the Torah** (`tanach`), **The Sages** (`sages`), **Great Rabbis** (`rishonim_acharonim`), **The Baal Shem Tov and Tzaddikim** (`baal_shem_tov_circle_and_chassidic_masters`), **The Rebbeim** (`chabad_rebbeim` + `rebbeim_family`), **Chassidim** (`chassidim`).
- Top heroes by central/appears count: Baal Shem Tov 99, Alter Rebbe 88, Frierdiker Rebbe 46, Tzemach Tzedek 37, Rabbi Akiva 36, Avraham Avinu 32, the Rebbe 28, Rebbe Rashab 26, Eliyahu HaNavi 24, Shpoler Zeide 19.
- `/hero/<id>` is a tag page. People entries marked unconfirmed in the vocabulary never get a tile or a label on this site.
- **Characters** (free text) are shown on the item page as plain, non-clickable chips under "Who's in this story" and are searchable; nothing more.

### 5.7 Storytellers
No storyteller browse. Item pages show "Told by Uncle Yossi" (`rabbi_yosef_goldstein`, 788 pool items) or "Told by Rabbi Chaim Levi Goldstein" (`rabbi_chaim_levi_goldstein`, 219). For `unknown` (47) and any unconfirmed placeholder speaker, show no byline. The series label "Weekly Story (working title)" is unconfirmed and is never displayed.

---

## 6. The item page and what surrounds it

### 6.1 Layout (single column, same for all kinds)
1. **Cover** (§8.4), title (max 2 lines, then ellipsis; full title in the `title` attribute), byline, pills: duration, "Ages N+" (`age_min`), kind.
2. **Play button**, 88 px, primary colour. For a `show`, a second button of equal weight: **"Jump to the story"**, which seeks to the first segment of type `story_intro`, `story` or `story_chapter`. For a serial chapter, "Jump to the story" skips the recap: it seeks to the first `story` or `story_chapter` segment.
3. Row of three actions: **Heart** (favourite), **Play next** (adds after the current queue item), **Share** (Web Share API with the page URL; hidden if unsupported).
4. **What it's about**: `display.summary_short`.
5. **What we learn**: `display.lesson` in a highlighted card with a lightbulb icon. This is the kid-facing text; show it above the fold on tablets.
6. **Chapters** (items with segments; all 410 shows have them, median 10 per show): a tappable list; tapping seeks and plays. Icon and generic label by segment `type`:

| Segment types | Row label | Notes |
|---|---|---|
| `story`, `story_chapter` | The segment's `title` | Highlighted row, star icon |
| `story_intro` | "Story so far" | |
| `talk`, `sichah`, `text_study`, `halachah`, `review`, `qa`, `quiz` | The segment's `title` | |
| `song` | The segment's `title` | Note icon |
| `shema_guest` | "Shema time" | **Never the segment title or summary** |
| `mailbox` | "The mailbox" | **Never the segment title or summary** |
| `tzedakah` | "Tzedakah time" | |
| `opening`, `closing`, `announcement`, `sponsor`, `other` | "Hello!", "Goodbye!", "Announcements", "A word from our sponsor", "More" | Small grey rows |
| `silence` | Not listed; the player skips it | |

   Segment `summary` is shown only for story and talk rows.
7. **Tags**: up to 8 chips, each linking to its tile page (hero tiles first, then midos, holiday, topic). Then "Who's in this story" character chips (non-links, max 8).
8. **Relations block** (only the rows that apply):
   - `clip_of`: "This is a piece of Episode N" card; tapping plays the parent at `offset_sec` (decision 6).
   - `contains` (on a show): nothing extra; the clip is already a chapter row.
   - Serial or part set: "Chapter 2 of 4" strip with Previous / Next chapter buttons and a link to the serial page (`classification.serial`, `classification.part`, `continues`, `part_of_set`).
   - `alternate_take`, `same_recording`, `aired_again_in`, and items whose `superseded_by` points here: collapsed "Other versions" list (decision 7).
   - `same_story` / story group (95 groups, 2–16 items each): "Hear this story told another way", listing one item per other telling, English kid-pool items only. `same_story_other_language` targets are not shown (Yiddish is out of scope) but a line "Also told in Yiddish in the grown-ups' library" links out.
9. **More like this**: 6 cards (§6.3).
10. **For grown-ups** (collapsed by default, expanded if the item has a moderate advisory): each advisory as "label: note" from `audience.advisories` with its severity; `display.summary_long`; air date (`date.gregorian` and `date.hebrew`, respecting `precision`); a line "Read the automatic transcript in the grown-ups' library" linking to the reference site. **The kids' site does not render transcripts.**

### 6.2 Cards (everywhere)
Cover on top (square), title (2 lines), one meta line: duration plus a kind icon. Badges on the cover: chapter numeral for serial chapters, episode number for shows, a small tick when finished, a progress bar along the bottom when partly heard, a heart when favourited. Whole card is one touch target; minimum card width 148 px on phones (2 across), 180 px on tablets.

### 6.3 "More like this": the algorithm
Computed at build time over the kid pool; the export stores the top 12 per item; the client drops ones outside the viewer's age band and shows the first 6.

```
features(item) with base weight w:
  people where role in {central, appears}      w = 3.0   key "p:<id>"
  people where role in {mentioned, teaching_cited}  w = 0.5
  midos                                         w = 1.5
  characters (lower-cased, trimmed)             w = 1.5
  topics, mitzvos, parshiyos, story_type        w = 1.0
  calendar                                      w = 0.75
drop any feature that occurs in only one pool item
weight(f) = w * ln(N / df(f))                   N = pool size, df = items having f
overlap(a,b) = sum of weight(f) for f in both
score(a,b)   = overlap(a,b) / sqrt(total(a) * total(b)) * kindFactor(a,b)
               total(x) = sum of weight(f) over x's features
kindFactor   = 1.0 same kind; 0.8 for story<->show; 0.5 otherwise
```

Exclusions (these have their own rows on the page): same story group; any direct relation in either direction; same `serial.story_key`; same `part.set_key`; any pair scoring 0.85 or more (see below). Diversity: at most 3 of the 12 may share one `serial.story_key` or `part.set_key`; for a multi-part candidate, only its part 1 is eligible. Ties break by id.

Measured on the 1,035-item pool with exactly this formula: the 6th-best score has median 0.32, 10th percentile 0.23, minimum 0.15, so every item gets 6 results with no fallback needed; on average 5.4 of the 6 are the same kind as the source. Spot checks were sensible (a Baal Shem Tov rescue story returned five other Baal Shem Tov and Tzemach Tzedek stories).

**Near-duplicate guard:** a score of 0.85 or more means the same recording twice, not a similar story. The test run found one unlinked pair, "The Plot That Boomeranged" (`333ab07731` and `5ae5c959ac`, score 0.93, no relation between them). The build must list such pairs in a report for the owner and treat them as "Other versions" of each other until resolved.

### 6.4 Story of the Day
- Pool: kind `story` or `show`, `standalone = standalone`, non-empty `story_type`, no moderate or strong advisory, in the viewer's band. Whole-archive size before banding: 381.
- Order the pool by `sha256(id)`. Let `d` = days since 2026-01-01 in the viewer's local time, rolling over at 04:00. Pick `pool[d mod len]`.
- Seasonal override on even `d`: if an active holiday group (§5.2) has at least 5 pool items, pick `seasonal[(d/2) mod len]` instead.
- Deterministic: two devices on the same band and date show the same story.

### 6.5 Search
- **Client-side, MiniSearch**, index built at build time from the kids' export only, loaded on first visit to `/search`.
- **Indexed fields and boosts:** `title` ×5; hero labels and aliases ×4; serial `story_title` ×4; `keywords` ×3; characters ×3; kid tile labels plus the vocabulary labels and aliases of the item's topics, midos, mitzvos, calendar ×2; `lesson` ×2; `summary_short` ×1; titles of segments of type `story`, `story_chapter`, `talk`, `song` ×1.
- **Not indexed:** transcripts (any language), `summary_long`, segment summaries, `shema_guest`/`mailbox`/`announcement`/`sponsor` segment text, places, anything from `hidden`, `source`, `quality`, `provenance`, `identity_guesses`, `proposed_new_terms`. Not indexing transcripts removes the hidden-span masking problem from this site entirely; transcript search belongs to the reference library.
- Prefix matching on, fuzzy distance 1 for terms of 5+ letters. A synonym table folds common spellings to the house transliteration (`Shabbat`→`Shabbos`, `Hanukkah`→`Chanukah`, `Sukkot`→`Sukkos`, `Moshe`/`Moses`, `tzedaka`), seeded from `vocabularies.json` `transliteration` and every `aliases` list.
- **UI:** one large input, results as you type after 2 characters, grouped: Heroes and tiles that match (as tiles) first, then Stories, Quick Listens, Radio Shows, max 12 per group with "Show more". The age band applies. Before typing, the page shows 8 suggestion chips ("Baal Shem Tov", "Chanukah", "miracle", "king", "Shabbos"...). Zero results: "We couldn't find that. Try one of these:" plus the suggestion chips. The query is never sent to a server and never logged.

---

## 7. Player

- **Persistent mini-player** above the tab bar on every page: cover thumbnail, title (1 line), play/pause (56 px), skip-back-15 s, a thin progress line. Tapping it opens the full player sheet. **Audio must not stop or restart on navigation**, so the site is a client-routed app (or uses persisted elements across view transitions) with exactly one `<audio>` element for its lifetime.
- **Audio source:** `<audio src="media.url" preload="metadata">`. No `fetch()`, no Web Audio, no waveform analysis: the media host sends no CORS headers. Seeking relies on range requests.
- **Full player sheet:** large cover, title, scrub bar with **chapter ticks** at segment starts and the current chapter's label above it, −15 s / play / +30 s (each at least 64 px), previous/next chapter, heart, speed (0.8×, 1×, 1.25×; default 1×), **sleep timer** (15 min, 30 min, end of this story), and the queue.
- **Queue ("Up next"):** a simple ordered list, max 50, shown in the sheet with drag handles and remove buttons. It is filled by: "Play all" on a tag page, a playlist, a serial, or "Play next". Tapping Play on a single item replaces the current item and keeps the rest of the queue. Queue entries may carry `start_sec` and `end_sec` (serial story-only mode, playlists, clip parents).
- **Auto-advance:** on in serials, playlists and "Play all" queues. For a single story with an empty queue, playback stops at the end and the sheet shows "Next chapter" if one exists, else the first three "More like this" cards. No endless autoplay into unrelated content.
- **Content end:** if the export gives `content_end_sec` (derived from the internal `quality.trim`), the item is treated as ended there. The audio file is never altered.
- **Progress:** position saved every 5 s and on pause; resume from the saved position minus 3 s; an item is "finished" at 95% or within 20 s of the end.
- **Media Session API:** title, artist (the byline), generated cover PNG artwork, play/pause/seek/next handlers, so lock-screen and headphone controls work.
- **Errors:** if the audio fails to load, show "This one isn't working right now. Try another?" with a retry button and skip to the next queue item after 8 s when a queue exists.

**localStorage** (key prefix `kidslib.v1.`; every read and write wrapped in try/catch; the site works fully without it):

| Key | Value |
|---|---|
| `band` | `little` \| `kids` \| `big` |
| `gentle` | boolean |
| `favs` | `[{id, at}]`, max 200 |
| `progress` | `{id: {pos, dur, at, done}}`, max 300, least-recent evicted |
| `queue` | `[{id, start_sec?, end_sec?, source}]` plus current index |
| `speed` | number |

No accounts, no server state, no analytics that identify a child, no cookies.

---

## 8. Age, advisories and visual direction

### 8.1 Age bands
`age_min` in the kid pool: 3 → 16, 4 → 276, 5 → 401, 6 → 217, 7 → 90, 8 → 31, 9 → 4.

| Band | Rule | Items | Note |
|---|---|---|---|
| **Little** (3–5) | `age_min <= 4` and no moderate/strong advisory | 292 | Only 31 are stories; 149 shows, 108 quick listens. The Little home page therefore leads with Quick Listens and Radio. |
| **Kids** (6–8), default | `age_min <= 6` and no moderate/strong advisory | 827 | |
| **Big Kids** (9+) | whole kid pool | 1,035 | |

- First visit: a one-time, skippable sheet "Who's listening?" with three large picture buttons. Changeable from the top-bar chip. Stored in `band`.
- The band filters every shelf, grid, search result, "More like this" and Story of the Day. A direct link to an out-of-band item still opens, with a banner "This one is for bigger kids (ages 7+)" and a normal Play button; the site does not lock content.
- A serial is in band only if all chapters of its chosen run are.

### 8.2 Advisories (decision 10)
- 606 of 1,184 items have none. Among the 1,035 pool items, 515 have none and 155 have at least one moderate or strong. Most common flags archive-wide: `persecution` 212, `peril_violence` 176, `death` 152, `kidnapping_captivity` 80, `family_hardship` 75.
- **Parent note:** shown on the item page "For grown-ups" block. On cards, an item with a moderate advisory carries a small "i" corner mark (Big Kids band only, since other bands exclude them).
- **Filter:** the single "Gentle stories only" switch on `/grown-ups` restricts every band to items with zero advisories (515 in the whole pool). There is no per-flag filter here; that belongs to the reference library.
- Items with a `strong` advisory (3 advisories archive-wide) are excluded from the kid pool.

### 8.3 Palette and type

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FFF8EC` | Page background (warm cream) |
| `--card` | `#FFFFFF` | Cards, sheets |
| `--ink` | `#22304A` | Text (12.4:1 on paper) |
| `--ink-soft` | `#55627A` | Secondary text |
| `--primary` | `#1F5FBF` | Play button, links, active tab |
| `--primary-ink` | `#FFFFFF` | Text on primary |
| `--sun` | `#FFC83D` | Highlights, Story of the Day, stars |
| `--coral` | `#F0624D` | Hearts, "new" |
| `--leaf` | `#2E9E6B` | Finished ticks, Midos |
| `--grape` | `#7A4FC2` | Heroes, Chassidic tales |
| `--sky` | `#3DB8E8` | Quick Listens |
| `--line` | `#E7DCC8` | Borders, dashed "missing" tiles |
| `--night` | `#14213D` | Player sheet and Playlists background, with `--paper` text |

Cover background families (each has a light, mid and dark step): radio shows **blue** `#1F5FBF`; Rabbi Chaim Levi's stories **coral** `#F0624D`; other stories **grape** `#7A4FC2`; quick listens **sky** `#3DB8E8`; events and songs **leaf** `#2E9E6B`. Holiday tiles use fixed colours of their own (Chanukah deep blue with sun, Purim grape, Pesach leaf, and so on) defined once in the tile config.

- **Type:** headings *Baloo 2* 700 (rounded, friendly); body and UI *Atkinson Hyperlegible* 400/700. Self-hosted. Hebrew-script text (rare here) falls back to *Heebo*. Minimum body size 18 px, card titles 17 px/700, tile labels 16 px/700, nothing below 14 px.
- **Shape:** 20 px radius on cards and tiles, 2 px `--ink` outlines on icons, soft drop shadow `0 2px 0 var(--line)`. Touch targets at least 56×56 px with 12 px gaps.
- **Motion:** 150 ms press-scale on cards, a short wobble on the heart. All motion off under `prefers-reduced-motion`. Light theme only in MVP.
- **Tone of copy:** warm, short, second person, no exclamation overload, no baby talk. "Pick a story." "Keep listening." "What we learn." Hebrew terms kept in house transliteration (Shabbos, mitzvos, midos) with no translation in labels. Never invent facts about a story in UI copy; all story text comes from the export.

### 8.4 Covers: generated, no hand art
Every cover is an SVG composed at build time from the item's tags, also rasterised to 512×512 PNG for Media Session artwork and share previews. Fully deterministic from the item id.

1. **Background:** the kind/collection colour family (§8.3); the step (light/mid/dark) is chosen by `sha256(id)[0] mod 3`.
2. **Pattern layer** at 12% opacity, chosen by first `story_type`: `chassidic` → forest trees; `tanach_midrash` → desert hills; `talmudic`, `rishonim_acharonim` → scroll border; `historical` → rooftops; `mashal_parable` → crowns and stars; `moral_fiction` → dots; `contemporary` → city blocks; none → radio waves.
3. **Emblem:** one icon, centred, from the first rule that matches: (a) the first `central` person who has a hero icon; (b) a calendar id's holiday-group icon; (c) the first midah's tile icon; (d) the first topic's tile icon; (e) the kind icon (radio, book, speech bubble, microphone, note).
4. **Corner mark:** radio shows get the episode number in a dial shape; serial and part chapters get a large chapter numeral; all get nothing else. No title text on the cover.
5. **Serial covers** share one emblem and background across all chapters (seeded by `story_key`), so a serial reads as a set.

**Icon set:** one custom set of about 95 two-colour line icons in one style: 16 topics, 13 midos, 15 mitzvos, 12 holidays, 38 heroes, 5 kinds. This is the only art to commission or draw, and it covers all 1,035 items.

**Respect rule for icons:** no faces or figures of real people, tzaddikim or Rebbeim, and no photographs. Heroes are shown by an object or scene: the Baal Shem Tov by a forest path and wagon, the Alter Rebbe by a Tanya, Rabbi Akiva by a rock worn by water, Avraham Avinu by a tent open on four sides, Eliyahu HaNavi by a cup. Generic characters (a king's crown, a wagon) are fine. The owner approves the hero emblem list before launch.

**No cross-like shapes (owner, 2026-11-25):** no four-pointed stars or sparkles, and nothing drawn as a decorative cross, in icons, cover patterns, emblems, badges or decoration ("might make people nervous, like a cross"). Use dots, circles, crescents and five-pointed stars instead; a Magen David is fine. In the built site this means: stars are five-pointed, the scales stand on a triangle, and there is no spire on the Beis Hamikdash (drawn after the familiar depiction: a flat-topped golden front block with a tall doorway on a stepped platform). After reviewing the redraws (2026-11-25) the owner restored line sun rays, crossed bonfire logs, the globe's grid, X close buttons, "6+" and "1×" labels: the rule is narrowly no four-pointed sparkles and nothing drawn as a decorative cross; and the player sheet collapses with a down chevron. The rule covers artwork and decoration only: an X on close buttons and a + in text ("Ages 6+") are fine (owner). A test (`apps/kids/test/icons.test.ts`) checks the icon set for four-pointed stars and crossing straight strokes.

**Luchos and menorah (owner, 2026-11-25):** the luchos are square, two rectangles with no arched tops (Bava Basra 14a). The menorah follows the Rambam's drawing, as the Rebbe emphasised: straight diagonal branches rising from the stem to one level, no curved arms; the Chanukah menorah has 8 level lights and a raised shamash. Avraham Avinu's emblem is a fabric tent open on all sides. The icon test asserts that the luchos and menorah use no arcs or curves.

**Animals, moons, faces (owner, 2026-11-25):** only kosher animals appear (sheep and rams, goats, cattle, deer, kosher birds such as the dove, fish with fins and scales). The one exception is a horse for the Baal Shem Tov's wagon; the Shpoler Zeide is shown by a fiddle with its bow alongside and two music notes (owner's pick, for his joyful dancing). "Being Brave" uses a ram. Moons are full or nearly full, never a thin crescent, and never drawn with a star. Avoid compositions of two round things above one shape, which read as a face. Matzah is round, hand-made shmurah matzah; the shofar is a curved ram's horn. The icon test checks icon names, tile labels and search suggestions for non-kosher animal words.

---

## 9. Data needed from the public export

**Kid-pool rule** (applied by the build, in this order):
1. `quality.publish_recommendation` is `publish` or `publish_with_note` (drops 1 `hide`, 9 `review`).
2. `language.primary = en`.
3. `audience.level` in `young_children`, `children`, `older_children`, `family`.
4. `content_type` not in `shiur`, `fragment`, `promo`, `family_recording`.
5. Not the source of a `superseded_by` relation (58 in pool; they appear only under "Other versions").
6. No advisory with severity `strong`.

Result on today's data: 1,035 items. Songs (3) are in the pool, reachable by search and direct link, and appear on no shelf (decision 5).

**Files the kids' build consumes** (all produced by the shared export step, which has already dropped `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `identity_guesses`, `audience.privacy`):

`kids/index.json`, one compact record per pool item, loaded at start:

| Field | From |
|---|---|
| `id`, `slug` | `id`; slug derived from title |
| `title` | `display.title` |
| `summary_short`, `lesson` | `display.*` |
| `kind`, `content_type`, `story_type[]` | derived; `classification.*` |
| `series`, `collections[]`, `speakers[]` (confirmed ids only) | `classification.*` |
| `standalone` | `classification.standalone` |
| `episode_number`, `is_clip` | `classification.episode` |
| `hebrew_year` | `classification.date.hebrew_year` |
| `serial {story_key, chapter}`, `part {set_key, part_number, of}` | `classification.serial`, `.part` |
| `duration_sec` | export-derived from the catalog duration |
| `content_end_sec` | export-derived from `quality.trim`; the raw `quality` block is not shipped |
| `age_min`, `level`, `adv_max` (`none`/`mild`/`moderate`) | `audience.*` |
| `topics[]`, `midos[]`, `mitzvos[]`, `calendar[]`, `parshiyos[]` | `subjects.*` |
| `heroes[]` | `subjects.people` ids with role `central` or `appears` |
| `story_start_sec` | first segment of type `story_intro`/`story`/`story_chapter` |
| `audio_url` | `media.url` |

`kids/items/<id>.json`, loaded on the item page: everything above plus `summary_long`, `keywords[]`, `characters[]`, `advisories[] {flag, severity, note}` (no `at_sec` needed), `date {gregorian, hebrew, precision}`, `segments[] {start_sec, end_sec, type, title?, summary?}` with `title` and `summary` **omitted** for `shema_guest`, `mailbox`, `announcement`, `sponsor`, `opening`, `closing`, `other`, and with segment `people`/`linked_items` dropped, `relations[] {type, target_id, offset_sec}` restricted to targets in the public export (no `note`, `evidence`, `confidence`), `related[]` (12 ids, §6.3), `story_group {group_id, other_tellings[]}`.

Also: `kids/serials.json` (from `serials_index.json`: per serial the chosen run, chapters with item id, `segment_start_sec`, `segment_end_sec`, `parts`, `intro_start_sec`, missing chapters, other runs; plus part sets); `kids/tiles.json` (the §5 mappings with labels, descriptions, icon names, colours); `kids/lost_episodes.json` (missing episode numbers with year, estimated date and catalog title where known); `kids/calendar.json` (for each of the next 400 days: Hebrew date string, parsha id of the coming Shabbos, active holiday-group slugs, active single-date ids; rebuilt weekly with `pyluach`); `kids/search-index.json`; `covers/<id>.svg` and `.png`.

**Privacy checks the build must enforce (fail the build on any hit):**
- No key named `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `identity_guesses` or `privacy` anywhere in the output.
- For every item, no `hidden.on_air_people[].name` (case-insensitive, names of 2+ words) appears in any shipped string of that item. Today's data passes: 0 hits across titles, summaries, keywords, characters and segment text, against 1,478 hidden name entries.
- No transcript text in the output.

---

## 10. Tonight's playlists (shared)

The bedtime site's concept owns the recipes, rotation time and the playlist files. This site only reads and renders them.

- **Assumed contract** (to be reconciled with the bedtime spec; adapt field names there, not the behaviour here): a shared static `playlists/tonight.json` and `playlists/history.json` (the previous 7 nights), each night `{date, playlists: [{id, title, subtitle?, items: [{id, start_sec?, end_sec?}], total_min}]}`, items drawn from the shared public export.
- **Home shelf "Tonight's Playlists":** one wide card per playlist on a `--night` background with moon-and-stars art: title, "5 stories · 42 min", and a Play button that replaces the queue with the playlist (source `playlist:<id>`), honouring `start_sec`/`end_sec`.
- **`/playlists`:** tonight's playlists at the top with their item lists expanded (each row links to `/listen/<id>`), then "Past nights": 7 collapsed date rows ("Tuesday night, 14 Kislev"), each expanding to that night's playlists. Nothing older than what `history.json` contains is shown or stored.
- **Banding:** playlists are not filtered by age band (they are curated by the other site's rules). Each card shows "Ages N+" = the highest `age_min` among its items. An item missing from the kid pool but present in the public export still plays and renders as a plain row without a link.
- **Failure:** if the file is missing or malformed, hide the shelf and show "No playlists tonight" on `/playlists`. Never block the home page on it.
- A footer link on `/playlists`: "Just want bedtime? Open the bedtime site."

---

## 11. MVP and later

**MVP**
- All pages in §3; the three kinds; age bands and the Gentle switch.
- Tiles and mappings in §5 exactly; holiday "coming up" from `calendar.json`; parsha strip.
- Item page with chapters, Jump to the story, relations block, More like this.
- Serial pages with story-only playback; number grid with lost episodes.
- Persistent player with queue, resume, sleep timer, Media Session.
- Favourites, Keep Listening, Finished in localStorage.
- Search as specified.
- Generated covers with the full icon set (heroes may launch with the 22 that have 8+ items; the rest fall through to rule (b)–(e)).
- Tonight's playlists and 7-day history.
- Build-time privacy checks.

**Later**
- Installable PWA with offline downloads of hearted stories (needs a CORS rule on the bucket or a proxy; out of MVP).
- Dark theme; listening streak stickers; printable "midah of the week" sheet.
- Parent PIN for the Grown-ups page; per-flag advisory filter.
- Voice search; "read along" highlighted English transcript for older kids (requires hidden-span masking, so it ships only together with the reference library's masking code).
- Parsha index page once more items carry a parsha.
- Yiddish shelf, if the owner wants one for children.

## 12. Non-goals
- No transcripts, no transcript search, no Yiddish or adult content, no shiurim.
- No multi-facet filtering, boolean search, date-range search, sources-cited browsing, places browsing or downloadable data. That is the reference library.
- No accounts, sync, comments, ratings, social features or third-party ads/trackers.
- No playlist recipe logic; no editing of audio; no hand-made per-item art.
- No display of unconfirmed names, working-title series labels or identity guesses.

---

## 13. Open questions for the owner (do not resolve in code)
Answered 2026-11-25 (see docs/DECISIONS.md, "Website decisions"):
- `review` items are publishable; only `hide` is excluded. Recompute the pool counts in §14 accordingly.
- Hero emblem list and no-figures rule: approved.
- The Little band also admits `age_min = 5` items with no advisories.
- Lost-tape contact: `admin@torahlearningtools.com`, read from one shared constant.
- "The Plot That Boomeranged": relation and preferred copy to be set in the data after a transcript comparison.

Still open:
1. Site name ("Story Shelf" is a placeholder).

---

## 14. Implementation notes (apps/kids, 2026-11-25)

Where the built site differs from the text above, and why:
- **Playlists page path:** `/tonight/`, not `/playlists`. `/playlists/*` is reserved on every host for `goldstein-api` (docs/ARCHITECTURE.md §8). The files are still read from `/playlists/index.json` (then the edition file, falling back to `tonight.json`) and `/playlists/history.json`.
- **localStorage keys** use the shared `createStore("kids")` prefix `goldstein:kids:<key>` (ARCHITECTURE §8) instead of `kidslib.v1.`; the keys themselves are as in §7.
- **Near-duplicate guard:** with the formula as written, about 60 unlinked pairs score 0.85 or more, almost all short radio clips with two or three identical tags. All of them are still kept out of "More like this", but a pair is reported (build log) and shown under "Other versions" only when the lengths agree within 5% and the titles mostly match, and neither is a whole show. Today that is 4 pairs. "The Plot That Boomeranged" is now linked in the data.
- **Overlap of two items** uses the smaller of the two weights when a feature has different base weights in each (a person central in one, mentioned in the other); this keeps scores in 0–1.
- **Calendar** is computed at build time with `@hebcal/core` (400 days from the build) instead of `pyluach`; a deploy refreshes it.
- **Covers:** SVG at build; the 512×512 PNG for Media Session artwork is rasterised in the browser from the same-origin SVG (no PNG files in the build). Share previews use no image.
- **Story of the Day "seasonal" pool** also counts the active chassidishe date (e.g. Yud-Tes Kislev) after the holiday groups.
- **Search** also indexes the Hebrew midah term (Emunah, Emes…) with the tile labels, and expands a few nicknames ("besht" → Baal Shem Tov, "rashbi").
- **Tag pages** list events and songs nowhere (as in §4.6); they are reachable through search and direct links.

## 15. Acceptance criteria

**Catalog and privacy**
1. On the 2026-11-25 data the build reports a kid pool of 1,033 items: 411 shows, 310 stories, 298 quick listens, 11 events, 3 songs. (Recomputed after the owner made `review` items publishable and linked "The Plot That Boomeranged" copies; the concept's original figure was 1,035 = 410 / 314 / 293 / 11 / 3. Band sizes now: Little 512, Kids 828, Big Kids 1,033; with Gentle 445 / 500 / 516. Per-tile Big Kids counts are pinned in `apps/kids/test/catalog.test.ts`.)
2. Grepping the entire build output finds none of the keys `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `identity_guesses`, `privacy`, and no transcript text.
3. The hidden-name check (§9) runs in CI and fails the build when a seeded test name is injected into a summary.
4. No Yiddish item, shiur, family recording, superseded copy, `review` or `hide` item is reachable from any shelf, grid, search result or "More like this".
5. `shema_guest` and `mailbox` chapter rows show only the generic labels on every show page.
6. No page shows "Weekly Story (working title)", "unconfirmed" or any placeholder speaker label.

**Browse**
7. Every tile in §5 resolves to exactly the vocabulary ids listed, and its page count for Big Kids matches the tables (±0 on the reference data).
8. No tile, shelf or chip renders with fewer than its stated minimum for the active band; switching band updates all counts without reload.
9. With the clock set to 15 Kislev 5787, Home shows "Coming up" shelves for Chanukah and Yud-Tes Kislev and no parsha shelf for a parsha with fewer than 2 items.
10. `/radio` shows 143 missing-number tiles across all tabs (555 numbers, 412 in the archive); a missing tile opens the "still looking" sheet, not an error. A number that is in the archive but outside the kid pool (for example the hidden defective episode 16) is a plain grey tile with no sheet and no link.
11. Tag pages list Stories before Quick Listens before Radio Shows.

**Item page and relations**
12. On a show, "Jump to the story" starts playback at `story_start_sec` (±1 s).
13. A clip page links to its parent and starts the parent at `offset_sec`.
14. A serial page plays chapters in order in story-only mode, stopping each at `segment_end_sec` and starting the next without user action; a missing chapter is shown and skipped.
15. "More like this" shows 6 cards for every pool item in Big Kids band, never includes an item from the same story group, serial, part set or direct relation, and matches the build's `related[]` order after band filtering.
16. Items with advisories show each advisory's label and note under "For grown-ups"; items without show none.

**Player**
17. Starting audio, then visiting five different pages, never interrupts or restarts playback; there is exactly one `<audio>` element in the DOM.
18. Reloading the page restores the queue and offers resume within 5 s of the last position.
19. The sleep timer pauses playback at the chosen time; "end of this story" pauses at the item's end (or `end_sec`) and does not auto-advance.
20. Lock-screen controls show title, byline and cover, and play/pause/seek work (Media Session).
21. No network request other than the `<audio>` element's own range requests goes to the media host.

**Search**
22. Typing "besht", "Baal Shem", "chanuka", "Hanukkah" and "lion" each returns relevant results within 100 ms after the index has loaded; the index contains no field outside §6.5.
23. Search results respect the age band and the Gentle switch.

**State and resilience**
24. With localStorage disabled, every page renders and audio plays; favourites show the empty state.
25. Hearts persist across reloads; the shelf caps at 200.
26. With `playlists/tonight.json` returning 404, Home renders without the playlists shelf and without console errors.

**Usability and accessibility**
27. Every interactive element is at least 56×56 px on a 360 px-wide viewport; no horizontal page scroll at 360 px.
28. Text contrast is at least 4.5:1; all controls are keyboard reachable with visible focus and have accessible names; covers have empty `alt` (the title follows as text).
29. From Home, a first-time user reaches playing audio in at most 2 taps (band sheet aside).
30. Lighthouse on a mid-range phone profile: performance at least 85, accessibility at least 95; initial JS plus `kids/index.json` under 400 KB gzipped.

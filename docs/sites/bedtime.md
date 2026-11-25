# Bedtime site: product and UX concept

Status: concept for implementation, 2026-11-25 (15 Kislev 5787). Owner of this doc: the bedtime site. **Section 4 (playlist recipes) is shared by all three sites** (`apps/bedtime`, `apps/kids`, `apps/library`); the other two only read and render what it defines.

All pool numbers in this doc come from read-only scripts run over `data/recordings/**/*.meta.json` and `data/indexes/` on 2026-11-25. Re-run the equivalent checks in CI (section 7) whenever the data changes.

Binding rules carried over from `CLAUDE.md` and `docs/DECISIONS.md`: nothing public may contain `hidden`, `source`, `quality`, `provenance` or `proposed_new_terms`; the audio is never edited; unconfirmed names are never shown as fact; Yiddish is not for display.

---

## 1. Audience and core experience

**Who:** a parent (or older sibling) at bedtime, phone in one hand, a child already in bed. Tired, in a dark room, wants zero decisions. The child is the listener, the parent is the user. Secondary: naps, car rides, a quiet Shabbos-afternoon-substitute on a weekday.

**Promise:** open, pick one of five moods, press play, put the phone face down. Up to two hours of stories play by themselves and end quietly.

### The 30-second flow

| Time | What happens |
|---|---|
| 0 s | Parent opens the site (home-screen icon or bookmark). Dark screen, five cards, nothing else to read. If something was playing in the last 18 hours, a single "Continue" row sits above the cards. |
| 5 s | Parent taps a card, e.g. **Quiet Night**. Playback starts immediately from that tap (the tap is the user gesture that browsers need). The player sheet slides up. |
| 10 s | Optional: parent taps the sleep-timer chip (default already "45 min"). |
| 20 s | No touch for 20 s: the screen goes to **night screen** (near-black, a faint moon, no text). The phone may lock; audio continues. |
| later | Stories auto-advance. Lock-screen controls work. At the timer, playback finishes the current story if it has under 4 minutes left, otherwise fades and pauses. |
| morning | Next visit shows "Continue Quiet Night, story 4" for 18 hours, then it is gone and tonight's new cards are the only thing there. |

### Behaviour decisions

- **One tap to audio.** A card tap starts playing. There is no intermediate "playlist page" on the way in. The track list is one swipe up inside the player for parents who want to look.
- **Sleep timer.** Chips: `15`, `30`, `45` (default), `60`, `End of playlist`. The choice is remembered per device. At expiry:
  - if the current story ends within 4 minutes, let it finish, then stop;
  - otherwise fade out over 30 s and pause, saving the position.
  - A timer that is running shows as a thin arc around the moon on the night screen. No numbers.
- **Fade-out.** Use `audio.volume` ramping where it is writable (Android, desktop). On iOS `volume` is read-only and Web Audio cannot be used because the audio host sends no CORS headers, so on iOS the rule becomes "stop at the next story boundary or after 4 more minutes, whichever is first, with a hard pause". Do not fake a fade. If the owner later adds a CORS rule to the R2 bucket, switch to a Web Audio `GainNode` everywhere (section 6, later).
- **Screen dimming, no wake lock.** We want the phone to sleep. Do **not** request a screen wake lock by default. The night screen is plain CSS (`#05070F` background, moon at 35% opacity) so a phone that stays awake still gives off almost no light. "Keep screen on" exists as an off-by-default toggle in the player sheet for parents who use a tablet as a night light; only then call `navigator.wakeLock.request('screen')`.
- **Lock-screen controls.** Media Session API: `metadata` = story title, artist = narrator label, album = "Quiet Night · tonight", artwork = the playlist's moon tile (PNG 512). Handlers: `play`, `pause`, `nexttrack`, `previoustrack`, `seekbackward` (15 s), `seekforward` (30 s), `seekto`. `setPositionState` uses the position inside the **track** (for span tracks, relative to the span start, not the file).
- **Background play.** One `<audio>` element, `preload="auto"`. The next track is started synchronously inside the `ended` handler (or the span-end handler) by assigning `src` and calling `play()`. Never schedule it with `setTimeout`; timers are throttled when the page is in the background. No crossfade.
- **Span tracks.** Many tracks are a time span inside a 30-minute radio episode. Load `media.url + "#t=<start>,<end>"`; additionally watch `timeupdate` and treat `currentTime >= end_sec` (or a `pause` event within 0.5 s of `end_sec`) as the end of the track. Range requests work on the host, so seeking to the start is cheap.
- **Autoplay next.** Always on inside a playlist. It never continues into anything outside the playlist.
- **When the playlist ends.** Audio stops. Nothing loops, nothing else starts. The night screen stays. The next time the page is foregrounded it shows "That was the end. Good night." with tonight's cards below.
- **Resume.** `localStorage` key `bedtime.session.v1` holds a full snapshot of the playlist being played (so a rotation cannot change it mid-listen), track index, position, timer setting, `updated_at`. Written every 10 s and on `pause`/`pagehide`. Shown as "Continue" for 18 hours. Resuming rewinds 10 s.
- **Pinned playlist.** Once started, a playlist is played from the snapshot until it finishes or the parent picks another card, even if the edition flips at 09:00.
- **Offline / PWA.** Worth doing in a small way: a web app manifest and a service worker that caches the app shell and the playlist JSON, so the site opens instantly, installs to the home screen, and shows the last known cards with a "you're offline" line. **Audio is not cached offline in the MVP** (no CORS means opaque responses, which break range requests and cost about 80 MB per playlist). See section 6.
- **Errors.** A track that fails to load (network, 404) is skipped after 8 s and the next one starts; three failures in a row pause with "Can't reach the stories right now."
- **No accounts, no tracking of children.** No cookies. If the owner wants usage numbers, use cookieless page counts only (for example Cloudflare Web Analytics); never log which child-facing playlist a device plays.

---

## 2. Screens and information architecture

Four routes. No navigation bar; the header is the wordmark and one "earlier" link.

```
/                       Tonight (home)
/p/<edition>/<type>     Deep link to one playlist (opens home with that card expanded; no autoplay)
/earlier                The last 7 nights
/about                  For parents: what this is, ages, advisories, how to add to home screen
```

The player is a sheet over any route, not a route.

### 2.1 Tonight (`/`)

```
┌──────────────────────────────────────┐
│  ☾ Goldstein Bedtime Stories         │   wordmark, small
│  Good night.                          │   one line; seasonal when relevant:
│                                       │   "Good night. Chanukah starts Friday night."
│  ┌─ Continue ───────────────────────┐ │   only if a session < 18 h old exists
│  │ ▶ Quiet Night · story 4 · 6:12   │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │ ☾  Little Ones            ▶      │ │   card = one big tap target (min 88 px high)
│  │    Short, gentle stories          │ │
│  │    about 1½ hours · ages 3–6      │ │
│  └──────────────────────────────────┘ │
│  [ Big Kids ] [ Quiet Night ]         │   same card, stacked (one column on phones)
│  [ Adventure Night ] [ Tonight's Mix ]│
│                                       │
│  Earlier this week ›     For parents ›│   two quiet text links
└──────────────────────────────────────┘
```

- Exactly five cards in a fixed order: Little Ones, Big Kids, Quiet Night, Adventure Night, Tonight's Mix. Fixed order means muscle memory: the parent's thumb learns where "their" card is. A sixth card (a holiday playlist) may appear **above** the five during a holiday window once the `season` type ships (section 6).
- Each card: icon, name, one-line description, "about 2 hours · ages N+". Nothing else. No story titles, no counts, no art thumbnails.
- A small "⋯" on the card opens the track list without playing (same list as in the player).
- The page renders from the edition JSON alone. No catalog download.

### 2.2 Player sheet

```
┌──────────────────────────────────────┐
│  ⌄                     Quiet Night    │
│                                       │
│              ☾ (large)                │
│                                       │
│   The King and the Shabbos Candles    │   story title, 2 lines max
│   Uncle Yossi · story 3 of 10         │
│   ━━━━━━━━━●──────────  4:12 / 9:40   │   position inside the track
│                                       │
│      ⏮      ⏪15     ❚❚     ⏩30    ⏭    │   64 px targets
│                                       │
│   Sleep timer  (15)(30)[45](60)(End)  │
│   ▢ Keep screen on                    │
│                                       │
│   ⌃ Tonight's stories                 │   swipe up: the list
└──────────────────────────────────────┘
```

- **Track list:** title, narrator, length. A small "ⓘ" marks a story that has a parent note (an advisory); tapping it shows the advisory labels, e.g. "Danger or violence (mild)". Tapping a row jumps to that story. Multi-part stories show as one indented group ("The Ten Wedding Gifts, 4 chapters").
- **Mini player:** when the sheet is closed, a 64 px bar at the bottom: title, play/pause.
- **Night screen:** after 20 s without touch while playing. One tap anywhere brings the sheet back; the first tap never triggers a control.

### 2.3 Earlier this week (`/earlier`)

```
  Earlier this week
  Tuesday night · 14 Kislev
     (Little Ones) (Big Kids) (Quiet Night) (Adventure Night) (Mix)
  Monday night · 13 Kislev
     ...                                  7 nights, newest first
```

- Each chip opens the same player with that night's playlist (tap = play, "⋯" = list). Nothing older than 7 nights is linked. Weekday is from the edition date; the Hebrew date is the night's (the date that begins at nightfall).

### 2.4 For parents (`/about`)

Short text: what the archive is and who tells the stories (confirmed names only), how playlists are chosen (ages, calmer endings, parent notes), "the recordings are 1980s radio and family tapes, as they were", how to add to the home screen, a link to the kids' library and the full library. Under 250 words.

---

## 3. Visual direction

**Mood:** a child's room with the door open a crack. Deep navy, one warm light. Still, not sleepy-cute.

### Palette (dark only; there is no light theme)

Contrast ratios are against `--bg` / `--surface` (WCAG 2.x, computed).

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--bg` | `#0B1026` | page background | |
| `--surface` | `#151B3D` | cards, sheet | |
| `--raised` | `#1F2752` | pressed card, chips | |
| `--line` | `#2B3466` | hairlines, track of the progress bar (decorative only) | |
| `--text` | `#F3ECDD` | primary text (warm cream, never pure white) | 16.0 / 14.2 |
| `--text-2` | `#B9BEDB` | secondary text | 10.3 / 9.1 |
| `--muted` | `#8E95BD` | tertiary text, min 16 px | 6.4 / 5.7 |
| `--gold` | `#F4C56A` | play button, moon, active chip, focus accents | 11.7 / 10.4 |
| `--focus` | `#FFE08A` | 3 px focus ring | 14.6 / 13.0 |
| `--night` | `#05070F` | night screen | moon drawn in `#8E95BD` (6.9) |
| Little Ones | `#F5B7A6` | card icon and left rule | 10.9 / 9.7 |
| Big Kids | `#93BBF5` | | 9.6 / 8.5 |
| Quiet Night | `#A5D0BE` | | 11.1 / 9.8 |
| Adventure Night | `#F2A45C` | | 9.2 / 8.2 |
| Tonight's Mix | `#C8B5F3` | | 10.2 / 9.0 |

Text on a gold button is `--bg` (11.7:1). Colour never carries meaning alone: every card also has its own icon and name. All text meets AA at minimum; body text meets AAA.

### Typography

- Headings and story titles: **Fraunces** (variable, soft optical style), weight 500. Fallback `Georgia, serif`.
- Everything else: **Nunito Sans**, 400/600. Fallback `system-ui`.
- Self-host both as WOFF2 subsets (Latin + the few diacritics in titles). No third-party font requests.
- Sizes: body 18 px, card title 22 px, story title 26 px, minimum 16 px anywhere. Line height 1.45. Sentence case everywhere.
- Hebrew-script titles (`title_he`) are not shown on this site.

### Motion

- Slow and few: sheet slide 320 ms ease-out; card press scale 0.98; night-screen cross-fade 1.5 s.
- One ambient animation: 12 to 20 static stars with a 6 to 9 s opacity twinkle, CSS only, paused when the tab is hidden.
- `prefers-reduced-motion: reduce` turns off twinkle, slide and cross-fade (instant swaps).
- Nothing bounces, nothing flashes, no confetti.

### Illustration and iconography

- One hand-drawn SVG family, 2 px rounded strokes in the playlist's colour on `--surface`: a small sleeping moon (Little Ones), an open book with a star (Big Kids), a candle flame (Quiet Night), a little ship on a wave (Adventure Night), three stars of different sizes (Mix), a holiday glyph for the seasonal card (menorah, grogger, matzah, and so on).
- No photos, no faces, no cartoon characters, no depictions of real people. The same tiles are exported as 512 px PNGs for Media Session artwork and the app icon.
- Controls use plain geometric icons with visible text labels where space allows; every icon button has an `aria-label`.

### Copy tone

- Few words, whispered. "Good night." "Tonight's stories." "That was the end. Good night."
- Speak to the parent, about the child. No exclamation marks, no "Hey kids!", no marketing.
- Use the archive's own words where natural (Hashem, Shabbos, mitzvah), in the transliteration style of `vocabularies.json`.
- Never show an unconfirmed name. The narrator line shows only a confirmed speaker label ("Uncle Yossi", "Rabbi Chaim Levi Goldstein"); for `unknown` or unconfirmed placeholders it is omitted. Series names are not shown at all (the weekly series name is unconfirmed).

### Accessibility

- Whole site operable by keyboard and screen reader; cards are `<button>`s; the player uses native `<audio>` semantics plus labelled buttons; the progress bar is an `<input type="range">`.
- Touch targets at least 48 × 48 px, primary ones 64 px.
- Night screen is announced as "Playing. Tap to show controls." and never traps focus.
- Works at 200% zoom and 320 px width without horizontal scroll.

---

## 4. Playlist recipe spec (shared by all three sites)

### 4.1 Vocabulary

- **Unit:** the smallest thing a playlist can schedule. Either one **track** or one **block** (several tracks that must play together in order).
- **Track:** `{recording id, start_sec, end_sec}`. A whole recording, or a span inside one.
- **Edition:** one night's set of playlists (one playlist per type). Id = civil date in `America/New_York`, e.g. `2026-11-25`.
- **Head:** the first 40 minutes of a playlist. This is what families actually hear before the timer or sleep, so it gets the strictest freshness rules.

### 4.2 Building the unit pool (build time, private side)

The pool is built in `packages/data` from the full `.meta.json` files (it needs `quality` and `hidden`, which never leave the build). The output, `units.json`, contains only public fields (section 5).

**Base filter, applied to every recording used by any unit:**

| # | Rule | Field |
|---|---|---|
| B1 | publishable: `publish` or `publish_with_note`. `hide` and `review` are out. | `quality.publish_recommendation` |
| B2 | preferred copy only: no `superseded_by` relation | `relations[].type` |
| B3 | English: `primary == "en"` (all Yiddish and the Tanya/Haggadah shiurim drop out here) | `language.primary` |
| B4 | for children: level in `young_children`, `children`, `older_children`, `family` and `age_min <= 10` | `audience.level`, `audience.age_min` |
| B5 | no advisory with severity `strong` | `audience.advisories[]` |
| B6 | not a private family recording | `audience.privacy[].flag != private_family` |
| B7 | audio `good` or `fair` | `quality.audio` |
| B8 | no blocking issue. Whole-file tracks: none of `defective_source`, `truncated_start`, `truncated_end`, `multiple_programs`, `dead_air`, `noisy_audio`, `mislabeled`. Span tracks: none of `defective_source`, `noisy_audio`, `mislabeled` (a clipped episode start or end does not hurt a span in the middle). | `quality.issues` |
| B9 | **no overlap with a hidden span:** a track's `[start_sec, end_sec]` must not overlap any `hidden.on_air_people`, `hidden.addresses` or `hidden.other_personal` time span. The audio is public and unedited, but an auto-playing children's playlist should not be the thing that reads a child's full name. | `hidden.*` |

**Content types.** Eligible: `story`, `lesson_with_story`, `story_collection`, `story_chapter` (inside a complete set only), `radio_episode` (as story spans, or whole for the `radio` type), `radio_segment` with a non-empty `story_type` (story clips). **Never** in a core playlist: `shiur`, `talk`, `live_event` (rallies are loud), `family_recording`, `fragment`, `song`, `promo`, and `radio_segment` talks (those are used only by the `season` type).

**The five kinds of unit:**

| Kind | Definition | Track bounds |
|---|---|---|
| `story` | `content_type` in `story`, `lesson_with_story`, `story_collection`; `classification.standalone == "standalone"`; no `classification.part` (not a member of a multi-part set); 3 to 45 min | whole file, from `quality.trim.content_start_sec` (or 0) to `content_end_sec` (or the duration) |
| `clip` | `radio_segment` with non-empty `story_type`, `standalone == "standalone"`, 3 to 45 min | whole file, trim respected |
| `span` | inside a `radio_episode` that is not a serial chapter (no `classification.serial`, unless the item is listed in `serials_index.json → single_stories_with_serial_field`) and whose `standalone` is not `cliffhanger`: each maximal run of consecutive segments of type `story` or `story_intro` that contains at least one `story`; 3 to 45 min | `start_sec` of the first segment of the run to the end of the last (`end_sec`, else the next segment's `start_sec`, else the content end) |
| `set` (block) | all recordings sharing `classification.part.set_key`, when every part `1..of` is present and passes the base filter, and the total is at most 85 min | each part whole, in `part_number` order |
| `serial` (block) | one airing ("run") of a radio serial from `serials_index.json`: `in_archive`, `complete`, every chapter has an item passing the base filter, total of the chapter spans between 10 and 85 min. If several runs qualify, take the longest total (the fullest telling); ties go to the earliest. | per chapter, the `parts[]` spans of the chapter's first qualifying item, in chapter order. Recap intros are skipped. |

Rules that fall out of this:

- **Serial chapters never appear alone.** A cliffhanger at bedtime is a broken promise. Chapters play only as a complete block, in order. The two long serials (*The Return of Yehudah*, 81 min; *The Storyteller*, 73 min) are valid blocks.
- **Clip versus parent episode.** When a `clip` has a `clip_of` relation to an episode and its `offset_sec` falls inside one of that episode's `span` units (or the offset is missing), the clip is dropped and the span is kept: the span carries the story intro, segment-level calendar tags and advisory timestamps. (19 clips are dropped this way.)
- **Span advisories.** A span inherits only the episode advisories whose `at_sec` falls inside `[start_sec − 30, end_sec]`, plus any advisory with no `at_sec` (conservative).
- **Span calendar tags** come from the `calendar` arrays of the segments in the run, not from the episode. An episode aired before Yud-Beis Tammuz usually carries the tag because of a talk; its story is often unrelated. Whole-file units use `subjects.calendar`.
- **Opening song.** In a `story` unit whose first segment is type `song` and ends before 180 s (83 of 154 of R' Chaim Levi's stories open with "I Believe in Hashem"), the track starts at the end of that segment, **except** when the track is the first track of a playlist. One signature song per night, not one per story.

**Dedupe keys.** Every unit carries `keys` = its recording id(s), plus the `target_id` of every relation of type `clip_of`, `contains`, `aired_again_in`, `same_recording`, `alternate_take`, `superseded_by`, `same_story`, `same_story_other_language`, plus every `group_id` from `story_groups.json` that lists one of its recordings, plus its `set_key` or serial `story_key`. Two units that share any key are "the same thing": never both in one playlist, and a use of one counts as a use of the other for every cooldown below. This covers a clip and its episode, two spans of the same episode, re-airings, alternate takes and the same story told twice.

**Resulting pool (2026-11-25 data):**

| Kind | Units | Hours | Median length |
|---|---|---|---|
| `story` (mostly R' Chaim Levi) | 142 | 47.1 | 20 min |
| `clip` | 50 | 6.6 | 7 min |
| `span` (Uncle Yossi) | 254 | 40.8 | 10 min |
| `set` blocks | 21 | 16.1 | 28 to 73 min each |
| `serial` blocks | 22 | 10.0 | 12 to 81 min each |
| **All story units** | **489** | **120.7** | |
| whole radio episodes passing B1 to B8 (for `radio`) | 396 (250 standalone) | 197.0 (124.2) | 30 min |
| talk clips, 2 to 15 min, standalone (for `season`) | 228 | 20.7 | 5 min |

**As built (2026-11-25, `packages/data/src/build/units.ts`): 487 units, 117.4 h** — story 141, clip 53, span 254, set 20, serial 19; calm 260 / middle 115 / exciting 112. Why it differs from the 489 above (checked by the bedtime team):
- **Serials 19, not 22.** *The Storyteller*, *The Missing Wallet* and *Dama ben Nesina* each have a chapter whose only copy overlaps a hidden span, so B9 rules the whole run out. The first count did not apply B9 to serial chapters. B9 is binding, so 19 is right.
- **Sets 20, not 21.** The first build counted 16: it rejected any set holding two copies of a part (an alternate take, a superseded copy, a second telling). Now each part plays its best copy (B2 drops superseded ones; then publish over review, good audio over fair, lowest id) and the other copies join the block's dedupe keys, which recovers 5 sets (*Baal Shem Tov Saved a Neshama*, *Hashem Always Helps*, *Hashem's Name*, *Slavita Printer*, *The Four Chochmos*). A "set" with a single part (`meayin-yavo-ezri`, a lone "Part 1") is no longer a one-part block: it is incomplete, so it is out.
- Stories 141 / clips 53 vs 142 / 50: data edits since the first count (`review` items are now publishable; *The Plot That Boomeranged* copy is now superseded).
- **Opening song**: 77 story units start after a short opening song and carry `intro_start_sec`; a playlist's first track plays from there.

Narrators in single-track units: Uncle Yossi 307, R' Chaim Levi 137, unknown 16. What was filtered: 168 serial-chapter episodes are reachable only through serial blocks; 14 units (12 stories, 2 spans) were removed by B9; 391 of the 396 whole episodes contain at least one hidden span, which is why the core playlists use story spans and not whole episodes.

### 4.3 The derived `energy` score (calm versus exciting)

There is no mood field. Derive one at build time and store it per unit as `energy` (integer) and `band`. It uses only fields that already exist.

```
energy =  Σ advisory weights (unit's advisories)
        + Σ topic weights      (subjects.topics)
        + Σ story_type weights (classification.story_type)
        + min(3, number of distinct EXCITING patterns matched in the text)
        − min(2, number of distinct CALM patterns matched in the text)
        + 1 if classification.standalone == "cliffhanger"
```

| Advisory flag | mild | moderate |
|---|---|---|
| `peril_violence`, `kidnapping_captivity` | +2 | +4 |
| `forced_conversion` | +3 | +4 |
| `national_tragedy` | +2 | +3 |
| `persecution`, `death` | +1 | +3 |
| `afterlife_judgment`, `illness`, `sad_ending` | +1 | +2 |
| `family_hardship`, `alcohol` | 0 | +1 |

- Topics: `mesiras_nefesh_kiddush_hashem` +2; `miracles`, `jewish_history` +1; `hashem_in_nature`, `morning_routine`, `kindness_and_community`, `family_and_home`, `character`, `prayer_and_brachos`, `mitzvos_in_daily_life` −1 each.
- Story types: `historical` +1; `mashal_parable`, `moral_fiction` −1 each.
- **Text** = for `story`/`clip`: `display.title` + `summary_short` + `summary_long` + `keywords`; for `span`: the run's segment titles and summaries + the episode's `keywords`; for blocks: the parts' titles and summaries (set) or chapter-segment summaries (serial), with the advisories of all parts.
- EXCITING patterns (case-insensitive regex, each counted once): `robber`, `thie[fv]`, `bandit`, `pirate`, `soldier`, `army`, `\bwar\b`, `battle`, `sword`, `\bgun`, `escape`, `chase`, `prison`, `jail`, `dungeon`, `kidnap`, `captur`, `captive`, `danger`, `wol[fv]`, `\bbear\b`, `lion`, `\bfire\b`, `storm`, `blizzard`, `shipwreck`, `drown`, `attack`, `rescue`, `\bspy`, `cossack`, `frighten`, `terrif`, `cruel`, `wicked`, `decree`, `siege`, `poritz`, `accus`, `trial`, `execut`, `death sentence`, `ransom`, `smuggl`, `haunted`, `spooky`, `flood`, `flames`, `sinking`.
- CALM patterns: `bedtime`, `sleep`, `lullab`, `gentle`, `quiet`, `peaceful`, `kindness`, `smile`, `\bsong\b`, `sings`, `garden`, `flower`, `bird`, `stars`, `moon`, `modeh ani`, `shabbos candles`, `thank`, `share`, `sharing`, `honest`, `patien`, `guest`, `hospitality`, `tzedakah`, `brachah`, `bracha`, `blessing`, `helping`, `friend`.

**Bands:** `calm` = energy ≤ 0; `middle` = 1 to 3; `exciting` = ≥ 4.

Measured distribution over the 489 units: calm 255 (50.3 h), middle 115 (31.1 h), exciting 119 (39.3 h). Spot checks read correctly: *Little Avraham Searches for Hashem* −3, *Reb Yosef Mokir Shabbos* −2, *Reb Gavriel and the Pirates* +5, *The Tall Chanukah Candles* +8.

**Overrides and the upgrade path.** The build reads `packages/playlists/overrides.json` (`{unit_id: {energy?, exclude?, note}}`), so the owner or a reviewer can correct a mis-scored story or pull one from all playlists without touching metadata. Later (section 6), replace the lexicon with a one-time classification pass over the transcripts that writes a `pacing` value per unit; the bands and every rule below stay the same.

### 4.4 Playlist types

Every type takes only units that passed 4.2. "Flags" means advisory flags at any severity.

| `type` | Name | Card line (parent-facing) | Kid-facing line (kids' site) | Target length |
|---|---|---|---|---|
| `little` | Little Ones | Short, gentle stories. Ages 3–6. | Cozy little stories | 90 min ± 10 |
| `big` | Big Kids | Longer stories with more to think about. Ages 6–10. | Big stories for big kids | 120 min ± 10 |
| `calm` | Quiet Night | Soft, slow stories for drifting off. | Stories for sleepy heads | 120 min ± 10 |
| `adventure` | Adventure Night | Kings, journeys and narrow escapes, settling down by the end. Ages 6+. | Hold on tight | 120 min ± 10 |
| `mix` | Tonight's Mix | A bit of everything. | A surprise mix | 120 min ± 10 |

**Selection rules and measured pools:**

| `type` | Eligible units | Pool | Median unit |
|---|---|---|---|
| `little` | single tracks only (no blocks); `age_min <= 5`; no advisory of severity `moderate`; none of the flags `kidnapping_captivity`, `forced_conversion`, `national_tragedy`, `afterlife_judgment`, `sad_ending`; `energy <= 3`; length ≤ 20 min | 214 units, 34.0 h | 9.5 min |
| `big` | `age_min >= 6`, or `age_min == 5` with `energy >= 1`; blocks allowed | 281 units (36 blocks), 85.4 h | 16.7 min |
| `calm` | single tracks only; `band == calm`; `age_min <= 8`; no advisory of severity `moderate`; none of the flags `peril_violence`, `kidnapping_captivity`, `forced_conversion`, `national_tragedy`, `sad_ending` | 213 units, 40.0 h | 9.9 min |
| `adventure` | `energy >= 3`; `age_min <= 9`; blocks allowed. The **last 25 minutes** are drawn from the `calm` pool instead (units ≤ 15 min; 173 units, 25.9 h). | 156 units (25 blocks), 49.9 h | 16.6 min |
| `mix` | everything | 489 units (43 blocks), 120.7 h | 11.8 min |

Little Ones is deliberately 90 minutes: its pool is the smallest, younger children fall asleep sooner, and the shorter length is what keeps repeats a week apart. (At 120 minutes the same pool only sustains a 5-day gap.)

Two more types are defined here so all sites agree, but are **not in the MVP**:

- **`season`** (e.g. "Chanukah Stories"): appears only while an anchor holiday window is active (`rosh_hashanah`, `yom_kippur`, `sukkos`, `yud_tes_kislev`, `chanukah`, `yud_shevat`, `purim`, `pesach`, `lag_baomer`, `shavuos`) and that tag has at least 45 minutes of story units. Contents: up to 3 holiday talk clips (≤ 8 min each, B1 to B9 apply) first, then every story unit with the tag, shuffled per edition, capped at 120 minutes. No cooldowns. Measured story/talk minutes: Chanukah 250/59, Yud-Tes Kislev 232/16, Shavuos 202/112, Rosh Hashanah 199/99, Pesach 169/80, Yud Shevat 123/6, Purim 92/57, Lag BaOmer 72/18. Yom Kippur (40/48) and Sukkos (29/41) are thin: there the card shows only if stories plus talks reach 45 minutes.
- **`radio`** ("The Radio Show"): four whole radio episodes, as broadcast, marches and mailbox included. Pool: the 250 standalone episodes (124.2 h); a serial may be used only as its complete run of at most four consecutive episodes. Meant for the kids' and library sites in the daytime. It is **off on the bedtime site**, and because whole episodes contain the children's names read on air, it must not ship anywhere until the owner confirms that auto-playing whole episodes is fine (the episodes are already public as individual items under DECISIONS 1).

### 4.5 Assembling one playlist

Inputs: the type's pool, the edition id, the stored history of earlier editions, the edition's Hebrew date. Random choices use a PRNG seeded with `sha256("<RECIPE_VERSION>|<edition id>|<type>")`, so a given edition is reproducible from the same pool and history.

1. **Candidates** = pool minus units blocked by a cooldown (4.6) minus units sharing a key with something already chosen.
2. **Weights.** Start at 1. Multiply by the seasonal weight (4.7).
3. **Fill** by weighted random draw without replacement until total length ≥ target − tolerance, never exceeding target + tolerance. A draw that would overshoot is skipped.
4. **At most one block per playlist.** A block is never the first unit and never inside the last 25 minutes.
5. **Head rules.** While total length < 40 min, a candidate must also pass the head cooldown and must not be in the head of another playlist of the same edition.
6. **Order** (after the fill):
   - **Opener:** the unit with the highest energy among those ≤ 15 min (≤ 12 min for `little`); if a seasonal unit is among the chosen ones, the shortest seasonal unit opens instead.
   - **Body:** the rest in descending energy, with the block (if any) placed second.
   - **Wind-down:** the final 20 minutes or more must be units with `energy <= 0` and no `moderate` advisory. For `adventure`, `big` and `mix`, if the chosen set does not end that way, swap the last units for draws from the calm pool (same cooldowns) until it does. `little` and `calm` satisfy this by sorting.
   - **Voices:** if both narrators are present, do not put more than three tracks by the same narrator in a row when a swap of equal-band neighbours fixes it.
7. **Validate** (hard failures abort the edition and keep the previous one): length in range; no shared keys; every track has a URL; wind-down satisfied; at most one block.

Generation order of the types inside an edition rotates by edition (so no type always picks last from shared material).

**As built** (`packages/playlists/src/{engine,recipes,seasons}.ts`):
- **Wind-down** is reserved, not swapped in afterwards: every type fills its body to the minimum length less the wind-down, then draws a calm tail (same cooldowns) and plays it last, calmest last. Little Ones and Quiet Night: 20 min from their own calm units; Big Kids and Tonight's Mix: 20 min, Adventure Night: 25 min, from the Quiet Night pool (units ≤ 15 min). The wind-down is never relaxed.
- **Head rules on the final order.** The fill checks head rules in draw order; after sorting, any unit that would start inside the first 40 minutes must also pass them (the engine moves it later otherwise). A block plays second, so it must pass head rules and be short enough to end before the last 25 minutes after a ≤ 15-minute opener (≤ 70 min in a 120-minute playlist). A draw that cannot be ordered validly is retried at the next relaxation step.
- **Seasons**: `@hebcal/hdate` gives the night's Hebrew date; the windows table is `CALENDAR_WINDOWS` in `seasons.ts`. While a tag is "near" (the day or ≤ 3 days ahead) and no seasonal story has been drawn yet, its stories are strongly preferred, so the shortest one usually opens. Cooldowns still win: on 2026-12-06 types with few distinct Chanukah stories may have used them all (Little Ones has none; Quiet Night has one), so criterion 11 is tested as "every type with ≥ 3 Chanukah stories plays one on the first near night, and nearly every night of Chanukah has one somewhere".
- **Voices** swaps the 4th track of a same-narrator run with a later same-band track by the other narrator (never the opener, a block, or across the tail).

### 4.6 Rotation, cooldowns, history

**Rotation period: 24 hours. Recommended, and what the numbers support.** One edition per night.

- The owner suggested 6 to 12 hours. At 12 hours every cooldown below halves (Little Ones would bring a story back after 3 days and to the front after 9), because each type consumes its pool twice as fast: Little Ones has 34 hours of material, and two 90-minute playlists a day would cycle all of it in 11 days. A bedtime happens once a day; a second edition buys nothing at night and costs freshness. `ROTATION_HOURS` is a config value; if it is ever set to 12, add a second flip at 21:00 UTC and halve the cooldowns.
- **Flip time: 09:00 `America/New_York`** (DST-aware; 13:00 or 14:00 UTC). Editions are **global**, not per-user-local: everyone sees the same "tonight", the files are cacheable, and history means the same thing for every visitor. 09:00 Eastern is the one window that is nobody's bedtime: 06:00 Pacific, 14:00 London, 16:00 Jerusalem, about midnight in Melbourne. A nap at 13:00 anywhere in the US already gets tonight's playlists.
- Because a started playlist is pinned in the client, a flip never interrupts playback.

**Cooldowns** (days = editions; "use" means any unit sharing a key). As built in `packages/playlists/src/recipes.ts`; the first proposal is in brackets:

| `type` | No repeat in the same type within | No repeat in the **head** of the same type within |
|---|---|---|
| `little` | 5 days (6) | 10 days (18) |
| `calm` | 6 days (7) | 12 days (21) |
| `adventure` | 6 days (12) | 10 days (24) |
| `big` | 12 days (16) | 24 days (40) |
| `mix` | 16 days (24) | 28 days (45) |

Why lower: with the rule that any shared dedupe key counts as a use, the pools hold far fewer distinct stories than units (re-airings, retellings and story groups). Little Ones has 216 units but 91 key clusters, about 14.5 h of distinct material; Adventure 151 units, 85 clusters, 27.8 h. With the bracketed values almost every playlist relaxed every night (observed minimum gaps then fell to 5 to 8 editions anyway). The new values come from 365-night simulations from three start dates: relaxation in 1 to 6% of playlists, no failed edition, observed minimum same-type gaps little 6, calm 6, adventure 5–6, big 8–10, mix 10–13 editions.

Plus, across types: a unit that was in **any** head is not in any head for the next 2 editions; and within one edition no unit is in two heads. Outside the head, the same story may appear in two different types on the same night (a family picks one).

- **If a pool runs dry** (cannot reach the minimum length): relax in this order, logging each step: multiply the type's cooldowns by 0.75, repeat up to four times; then allow the cross-type head rule to lapse. Never relax eligibility, dedupe keys or the wind-down.
- **Verified by simulation (first proposal; superseded by the measurements above):** 730 consecutive daily editions, three seeds, real pools. With the table above: zero relaxations for `little`, `adventure`, `mix`; at the slightly tighter 8/24 (`calm`) and 18/45 (`big`) the generator needed 2 to 6 relaxation steps in two years, hence the margins chosen. Median same-type gap actually achieved: little 9 days, calm 10, adventure 16, big 22, mix 28; median head gap 20, 28, 31, 55, 64 days. Typical playlist: 9 tracks (little), 10 (calm), 7 to 8 (others).
- What this means for a family: the story that opens Quiet Night tonight will not open it again for at least three weeks, and with a 45-minute timer a child hears a given story roughly once a month.

**Generate on a schedule and store. Do not recompute on the fly.**

| | Deterministic, recomputed in the client or at request time | Generated on a schedule, stored |
|---|---|---|
| Storage | none | about 10 KB per edition |
| History when metadata changes | silently rewrites the past: last Tuesday's playlist changes when a tag or a duplicate link is fixed | stable: what was played is what is listed |
| Cooldowns | needs the whole chain recomputed from day 1, or no cooldowns at all | trivial: read the last 45 stored editions |
| Removing a recording later | automatic | needs a tombstone pass (below) |
| Failure mode | none | a missed job means a stale "tonight" |

**Recommendation: seeded generation, stored.** The generator (`packages/playlists`, pure function `generateEdition(units, history, editionId, config)`) runs in a scheduled CI job daily at 08:00 Eastern and on every deploy. It writes edition files for **today through today + 14 days**. An edition whose `starts_at` is in the past or within the next 24 hours is **frozen** and never rewritten; later ones are regenerated each run so they follow data fixes. The stored editions are committed (`playlists/editions/<id>.json`, public fields only) and are the cooldown history. Fourteen days of runway means a broken job is invisible for two weeks, and the client then falls back to the newest edition it can find rather than showing nothing.

- **Tombstone pass (privacy and owner removals beat immutability):** at every publish, each track of the 8 published editions is re-checked against the current base filter B1, B2, B6, B9 and `overrides.exclude`. A failing track is removed from the stored file (a block loses all its tracks); nothing is substituted.
- **7-day history:** `history.json` lists the 7 editions before the current one. Older edition files stay in the repo for cooldowns but are not published.

**Published files** (same origin on each site, under `/playlists/`; field names match what `docs/sites/kids.md` §10 assumes):

```jsonc
// index.json: the clock. Clients pick the edition whose window contains now (UTC).
{ "recipe_version": 1, "rotation_hours": 24, "flip_tz": "America/New_York", "flip_local": "09:00",
  "editions": [ { "date": "2026-11-25", "starts_at": "2026-11-25T14:00:00Z", "ends_at": "2026-11-26T14:00:00Z",
                  "hebrew_date": "16 Kislev 5787", "file": "editions/2026-11-25.json" } ] }  // 7 past + current + 14 future

// editions/2026-11-25.json: self-contained; a site can render and play from this alone.
{ "date": "2026-11-25", "starts_at": "...", "ends_at": "...", "hebrew_date": "16 Kislev 5787",
  "season": ["yud_tes_kislev", "chanukah"],
  "playlists": [ {
      "id": "2026-11-25/calm", "type": "calm", "title": "Quiet Night", "subtitle": "Soft, slow stories for drifting off.",
      "total_min": 116, "age_min": 5,
      "items": [ { "id": "94d2197a4f", "unit": "94d2197a4f@737", "title": "…", "narrator": "Uncle Yossi",
                   "audio_url": "https://storiesmedia.torahlearningtools.com/…mp3", "mime_type": "audio/mpeg",
                   "start_sec": 737, "end_sec": 1365, "duration_sec": 628,
                   "age_min": 5, "band": "calm", "advisories": [ { "flag": "death", "label": "Death", "severity": "mild" } ],
                   "block": null } ] } ] }
// "block": { "key": "the-ten-wedding-gifts", "title": "The Ten Wedding Gifts", "part": 2, "of": 4 }

// tonight.json = a copy of the current edition; history.json = { "nights": [ …7 editions, newest first… ] }.
// Both are rewritten by the daily job. Clients should prefer index.json and fall back to tonight.json.
```

`start_sec`/`end_sec` are always present (whole-file tracks carry the trimmed bounds). `age_min` of a playlist is the highest among its items. `hebrew_date` is the date of the **night** (the Hebrew date of the next civil day).

### 4.7 Seasonal weighting

The generator computes the edition's Hebrew date (the night's date) with a calendar library (`@hebcal/core` in TS; `pyluach` is what the repo's Python tools use) and derives the set of **active** calendar tags from a table, `packages/playlists/calendar_windows.json`, keyed by the ids in `vocabularies.json → calendar`:

| Kind of tag | Active window | Examples |
|---|---|---|
| Major Yom Tov | 10 days before through the last day (Pesach: 14 before; Chanukah: 7 before through 2 Teves or 3 Teves) | `rosh_hashanah`, `yom_kippur`, `sukkos`, `shemini_atzeres_simchas_torah`, `chanukah`, `purim`, `pesach`, `shavuos` |
| Single days | 3 days before through the day | `yud_tes_kislev`, `yud_shevat`, `tu_bshvat`, `lag_baomer`, `pesach_sheni`, `gimmel_tammuz`, `yud_beis_tammuz`, `chai_elul`, `hei_teves`, fast days, and the other dated Chabad days |
| Month or period | the period itself | `elul`, `adar`, `nissan`, `kislev`, `cheshvan`, `sefiras_haomer`, `three_weeks`, `nine_days`, `aseres_yemei_teshuvah`, `selichos`; `summer_vacation` = 20 June to 1 September |
| Neutral (ignored) | never boosts, never penalises | `rosh_chodesh`, `shabbos_weekly`, `shabbos_mevarchim`, `hakhel_year`, `winter`, and the named Shabbosos |

Weights for a unit, from its non-neutral calendar tags:

- at least one tag active **today or within 3 days**: ×6;
- at least one tag active otherwise: ×4;
- has tags, none active (**out of season**): ×0.1, and never in the head (no Pesach story in Kislev);
- no tags: ×1. (363 of the 503 pre-filter units have no calendar tag, so the ordinary pool is always large.)

Limits: seasonal units fill at most 40% of a playlist's minutes; cooldowns still apply (the boost can never cause a repeat). Mourning tags (`three_weeks`, `nine_days`, `tisha_bav`, `shiva_asar_btammuz`, `asarah_bteves`, `tzom_gedaliah`) are never boosted in `little` or `calm` (weight ×1 while active, ×0.1 otherwise).

Example: on the edition of 2026-11-25 (night of 16 Kislev 5787), `kislev` and `yud_tes_kislev` are active (19 Kislev is 3 days away: ×6) and `chanukah` (first candle Friday night, 4 December) becomes active with the edition of 27 November (night of 18 Kislev). The pool has 8 Yud-Tes Kislev units (232 min) and 13 Chanukah units (250 min), enough for one or two per playlist per night through the holiday without breaking a cooldown.

---

## 5. Data the bedtime site needs from the public export

**The bedtime site ships no catalog.** It fetches `/playlists/index.json`, one edition file, and `history.json`. Everything it renders is inside those files.

Fields present in the published playlist files, and where each comes from:

| Field | Source | Notes |
|---|---|---|
| `items[].id` | `id` | recording id; lets the other sites link to the item page |
| `items[].unit` | derived | `<id>` for whole files, `<id>@<start_sec>` for spans |
| `items[].title` | `display.title`, or the `story` segment's `title` for spans | English only |
| `items[].narrator` | label of `classification.speakers[0]` from the vocabulary | only `rabbi_yosef_goldstein` ("Uncle Yossi") and `rabbi_chaim_levi_goldstein`; anything else → `null` |
| `items[].audio_url`, `mime_type` | `media.url`, `media.mime_type` | |
| `items[].start_sec`, `end_sec`, `duration_sec` | segments / serial index / duration; `quality.trim` is applied at build time and only the resulting numbers ship | |
| `items[].age_min` | `audience.age_min` | |
| `items[].advisories[]` | `audience.advisories[]`: `flag`, `severity`, plus the vocabulary `label` | the free-text `note` is not shipped here (the library sites show it on item pages) |
| `items[].band` | derived `energy` band | the numeric score stays internal |
| `items[].block` | `classification.part` / `serials_index.json` | key, title, part, of |
| edition `hebrew_date`, `season[]` | computed | `season` = active calendar tag ids; labels from the vocabulary |

**Used at build time only, never shipped:** `quality.*` (publish recommendation, audio, issues, trim), `hidden.*` (overlap test B9), `audience.privacy`, `relations` and `story_groups.json` (dedupe keys), `classification.standalone`, `classification.serial`, `subjects.topics`, `classification.story_type`, `display.summary_*` and `keywords` (energy score), `language`, and `source.duration_sec` (for the end of a whole-file track). No transcripts are used at all.

The privacy gate (`npm run privacy:gate`) must scan `/playlists/**` too: no key named `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `privacy`, `identity_guesses`; no string equal to any `hidden.*.name` or address text.

---

## 6. Scope

### MVP

- Routes `/`, `/p/<edition>/<type>`, `/earlier`, `/about`; the player sheet, mini player and night screen.
- The five core types, generated daily, stored, with seasonal weighting, cooldowns, the tombstone pass, `index.json`, `tonight.json`, `history.json`.
- Unit pool build with B1 to B9, `energy` (lexicon version), `overrides.json`.
- Player: auto-advance, span tracks, sleep timer (with the iOS boundary rule), Media Session, resume, pinned snapshot, skip-on-error.
- PWA shell: manifest, icons, service worker caching the shell and playlist JSON (stale-while-revalidate). No audio caching.
- Accessibility as in section 3. Self-hosted fonts. No cookies.

### Later, in rough order

1. `season` card during holiday windows (Chanukah is the obvious first one).
2. Owner adds a CORS rule on the R2 bucket for the three site origins → real fades on iOS via Web Audio; then "Download tonight's playlist for offline" (Cache API, whole files, about 80 MB, explicit button, auto-evict after 3 days).
3. Replace the lexicon `energy` with a transcript-based classification pass; a small review page (internal) listing units by score for the owner to correct.
4. "A little longer" button at timer expiry on the night screen (one tap adds 15 minutes).
5. `radio` type on the other two sites, after the owner's decision.
6. Per-family "skip this story from now on" (local only).
7. Night-of-week flavour (e.g. a Thursday-night parsha story) once `subjects.parshiyos` coverage is checked.

### Non-goals

- No search, browse, tags, series pages, transcripts or item pages. Those belong to the kids' and library sites; this site links to them from `/about` only.
- No accounts, sync, favourites, ratings, comments or sharing widgets.
- No Yiddish, no shiurim, no rallies, no family recordings in any playlist.
- No editing, trimming, bleeping, speed change or loudness processing of audio.
- No light theme. No video. No ads. No notifications.
- No per-user-local rotation and no personalisation of playlist contents.
- No Shabbos/Yom Tov lockout logic (it would need the visitor's location). Editions are generated every day; the site says nothing about it. Flagged for the owner in case a different stance is wanted.

### Open questions for the owner (do not decide in code)

1. Rotation: accept 24 hours (recommended) or insist on 12 with halved freshness?
2. May whole radio episodes auto-play in a playlist (`radio` type), given the names read on air?
3. Is 90 minutes right for Little Ones?
4. Site name and wordmark ("Goldstein Bedtime Stories" is a placeholder).
5. Any stance on Shabbos/Yom Tov, the Nine Days, or Sefirah (some stories open with a song)?

---

## 7. Acceptance criteria

**Pool build (unit tests against the real data, run in CI)**

1. No unit references a recording with `publish_recommendation` of `hide` or `review`, a `superseded_by` relation, `language.primary != "en"`, `age_min > 10`, a `strong` advisory, or a `private_family` flag.
2. No track's time range overlaps any `hidden` span of its recording.
3. No unit has content type `shiur`, `talk`, `live_event`, `family_recording`, `fragment`, `song` or `promo`; no core unit is a whole `radio_episode`.
4. Every `story_chapter` recording and every serial-chapter episode appears only inside a block whose parts are complete and in order.
5. Pool sizes are within 10% of section 4.2 and 4.4 on the 2026-11-25 data (489 units, 120.7 h; little 214, calm 213, adventure 156, big 281); CI prints the table and **fails if any core type's pool drops below 25 hours**.
6. `energy` reproduces the spot checks in 4.3; an entry in `overrides.json` changes the band and an `exclude` removes the unit from the next generated edition.

**Generator**

7. Same pool + same history + same edition id → byte-identical edition file.
8. Every playlist is within its length range; has no two items sharing a dedupe key; has at most one block, not first and not in the last 25 minutes; ends with at least 20 minutes of `energy <= 0` items; `adventure`'s last 25 minutes come from the calm pool.
9. A 730-edition simulation from an empty history completes with no hard failure and with observed minimum gaps at or above the cooldown table (relaxation steps logged; zero expected for `little`, `adventure`, `mix`).
10. No unit is in the head of two playlists of one edition.
11. For edition `2026-12-06` (Chanukah), every playlist contains at least one unit tagged `chanukah`, seasonal items are ≤ 40% of its minutes, and no item tagged only `pesach` or `purim` appears in any head.
12. Re-running the job does not change any edition whose `starts_at` is less than 24 hours away or in the past, except through the tombstone pass.
13. Marking a recording `hide` and re-running removes it from all 8 published editions.
14. `index.json` always lists 7 past, 1 current and 14 future editions with contiguous UTC windows that flip at 09:00 `America/New_York` across a DST change.
15. The privacy gate passes on `/playlists/**`.

**Site**

16. Cold load on a mid-range phone over 4G: cards visible in under 2 s; total transfer for `/` under 150 KB excluding fonts; no request to any third-party origin except the audio host.
17. Tapping a card starts audio with no further interaction; time from tap to sound under 3 s on 4G.
18. With the phone locked: playback continues across at least five track changes including span tracks (iOS Safari and Android Chrome); lock-screen shows title, narrator, artwork; play/pause/next/previous work.
19. A span track starts within 1 s of `start_sec` and advances within 1 s after `end_sec`; it never plays past `end_sec + 2`.
20. Sleep timer 15 min: playback stops between 15:00 and 19:00 after it was set, at a story boundary when one falls in that window; on Android/desktop a 30 s volume ramp is audible; position is saved.
21. After the last track nothing else plays; reopening shows "That was the end. Good night."
22. Kill the tab mid-story, reopen within 18 hours: "Continue" resumes the same playlist, same story, within 15 s of the old position, even if the edition has flipped. After 18 hours "Continue" is gone.
23. No wake lock is requested unless "Keep screen on" is ticked; the night screen appears after 20 s without input and the first tap only reveals controls.
24. `/earlier` lists exactly the 7 previous nights, each with its playlists, and each plays.
25. Offline with a warm cache: `/` renders the last known cards and an offline line; no uncaught errors.
26. `index.json` 404 → the site uses `tonight.json`; both missing → "No stories tonight. Please try again in a little while." and no console errors.
27. axe-core reports no serious or critical issues; all text meets the contrast table; full keyboard operation; `prefers-reduced-motion` disables all animation.
28. No narrator or series label is rendered for unconfirmed vocabulary entries; no Hebrew-script or Yiddish text appears.

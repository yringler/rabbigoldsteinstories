# Language preference: bedtime site

Status: design and implementation plan, 2026-11-27. Owner of this doc: the bedtime team (`apps/bedtime`). The shared contract (values `en | yi | any`, store key `lang`, `?lang=` param, labels "English", "Yiddish / אידיש", "Both") is common to all three sites; this doc covers how the bedtime site applies it.

Binding rules: Yiddish ASR text is never displayed. Unconfirmed names are never shown as a confirmed identity, and the bedtime site goes further and shows no unconfirmed label at all (bedtime.md criterion 28). The privacy gate must pass, and nothing reads `data/`; site code reads only `@goldstein/data/load`.

## 0. Summary

- **The bedtime site cannot have a nightly Yiddish playlist.** There is not enough material. Only **11 Yiddish recordings suit bedtime (about 2 h 14 min)**. One English playlist type alone has 34 h, and CI fails any type below 25 h. A rotating Yiddish playlist would repeat its opening stories every second night.
- **What it gets instead is one fixed Yiddish shelf.** It shows as a card that plays like the others. Its stories are the same every night, and the opening story changes each night. The site says this plainly.
- **The default is `en`.** With `en`, the site looks and behaves exactly as it does today.
  - `any` adds the Yiddish card as a seventh card, after Radio Night.
  - `yi` puts the Yiddish card first and folds tonight's English playlists under one "Tonight in English" button.
- **The generated playlists don't change.** Nothing changes in `packages/playlists`, `workers/api` or `packages/data`. Editions stay English, global and identical on all sites.
- **The shelf is built when the site is built.** The source is a short, reviewed list of ids, resolved through `@goldstein/data/load`.
- **Eight of the 11 stories are Bubby Chaya Malka's home recordings.** The bedtime spec's rule B6 keeps family recordings out of playlists, so they need the owner's yes (§8, Q1). Without them, the shelf has 3 stories (48 min), all by the unconfirmed Yiddish narrator.

## 1. What the Yiddish material is (measured)

**How it was measured.** This checkout has no `node_modules`, so `npm run data:build` could not run here. The numbers come from a read-only Python pass over `data/recordings/**/*.meta.json`. That pass copies `passesBase` in `packages/data/src/build/units.ts` and the unit-kind rules in bedtime.md §4.2. The implementation test (§7, `yiddish.test.ts`) checks the same facts again against `packages/data/generated/catalog.json`. If the numbers differ, the test wins.

**All recordings whose language is not English: 79 (65.2 h).**
- By language: `yi` 78, `he` 1. The Hebrew one is a 25-second family fragment, *The Brachah Shehecheyanu*.
- In the `language.spoken` field, 4 items also contain English.

| Group | Items | Content types | Audience | Fit for bedtime |
|---|---|---|---|---|
| `tanya_yiddish_goldstein` (Rabbi Yosef Goldstein) | 42 | shiur | adults, age 14–16 | **No.** Adult shiurim, 23–126 min each. |
| `haggadah_yiddish` | 15 | 9 shiurim, 6 talks | children, 4–6 | **No.** Teaching (Bedikas Chametz, Ma Nishtana), not stories. Mostly 23–234 min, and often `needs_context` or truncated. Maybe a Pesach item later (§9). |
| `bubby_zaidy_stories` | 12 | 8 stories, 4 family recordings | children, 4–8 | **Yes for the 8 stories** (owner to confirm, Q1). The 4 long family recordings are 24–95 min: compilations of those same stories, Part 1/2 tapes cut at the start or end, and *Zaidy Teaches* (52 min, mixed language, faulty transcript). |
| no series | 10 | 4 stories or story collections, 2 family recordings, 2 fragments, 1 live event, 1 lesson | mixed | **3 stories qualify.** The rest are fragments, the Sefirah home recording, a lesson for teens and a live event. |

**Bedtime base filter with B3 ("English only") removed** (rules B1–B8 of bedtime.md §4.2, plus content type, standalone, not part of a set, and 3–45 min):

| Rule set | Units | Minutes | Narrators |
|---|---|---|---|
| B1–B8 as written (B6 keeps out `private_family`) | **3** | 48.2 | all `yiddish_narrator_unconfirmed` |
| B1–B8 without B6 | **11** | 136.4 (134.2 if two tracks end early, §3.2) | 8 Bubby Chaya Malka, 3 unconfirmed |
| …of which would pass Little Ones (`age_min ≤ 5`, no moderate advisory, ≤ 20 min) | 8 | 81.1 | |

The 11 stories, in shelf order before the nightly rotation (§3.3):

| id | Title (public `display.title`) | Narrator | Min | Age | Advisories |
|---|---|---|---|---|---|
| `a70d104e90` | The Baal Shem Tov and the Bear | Bubby Chaya Malka | 7.6 | 4 | peril (mild) |
| `5e3346ab8e` | Rashi's Father and the Precious Diamond | Bubby Chaya Malka | 6.4 (§3.2) | 4 | none |
| `ed960138a4` | Yosef Mokir Shabbos: The Diamond in the Fish | (unconfirmed, not shown) | 4.5 | 4 | none |
| `db6ee5b364` | Rabbi Meir Baal HaNess and the Lion in the Desert | Bubby Chaya Malka | 15.7 | 4 | peril (mild) |
| `f9f2974567` | Eliyahu HaNavi's Cup | Bubby Chaya Malka | 16.0 | 4 | family hardship (mild) |
| `6164b3359f` | Dayeinu: The Old Man, the King's Lost Ring and the Pesach Seder | Bubby Chaya Malka | 16.8 (§3.2) | 5 | persecution, family hardship (mild) |
| `aae4e91c38` | The Butcher, the Storekeeper and the Boy Judge | Bubby Chaya Malka | 11.6 | 5 | persecution (**moderate**) |
| `407fcad3a4` | Three Din Torahs: The Hidden Tzaddik of Berditchev | (unconfirmed, not shown) | 18.0 | 7 | death (mild) |
| `555e88ce75` | The Wondrous Glasses: How the Brill Family Got Its Name | (unconfirmed, not shown) | 25.7 | 6 | death (mild) |
| *tail* `a690295602` | Eliyahu HaNavi and the Blessed Coin: Seven Good Years | Bubby Chaya Malka | 5.1 | 4 | none |
| *tail* `65cc733f61` | Chana's Prayer and Shmuel HaNavi | Bubby Chaya Malka | 7.0 | 4 | none |

All 11 have `publish_recommendation: publish`, `good` audio, no quality issues and no trim. None is superseded. Each has `transcript_display: search_only`, so no transcript is shown, which is right.

Left out on purpose:
- *The Wondrous Glasses of Lemberg and a Blood Libel in France* (`4bd06e794b`): it contains `555e88ce75`, has a moderate persecution advisory, and the tape ends mid-story.
- The 95-minute *Nine Tales Before Pesach* compilation (`6b6fec027a`): the clips above come from it. The one extra tale in it, *The diamond in the fish*, is the same story as `ed960138a4`, so the shelf would tell it twice.

### 1.1 Is there enough for a nightly Yiddish playlist with cooldowns?

No. The measured numbers:
- Little Ones is 90 ± 10 min, so one playlist needs at least 80 min. The Yiddish Little-Ones pool is 81 min: one playlist uses up the whole pool.
- The Little Ones head cooldown is 20 nights × a 40-minute head. Keeping heads fresh that long needs about 800 distinct minutes (13 h). Yiddish has 81, so the head would repeat every two nights, and the whole playlist would be the same every night.
- Even a 45-minute Yiddish playlist with a 7-night head cooldown needs about 280 min. The full 11-story set is 134 min.
- English for comparison: 514 story units, 126.6 h, and every type is above the 25 h CI floor. Yiddish story material is about 1.8 % of that.

**Also rejected: "Yiddish as an occasional extra track in the English playlists".**
- Editions are global. All three sites and every family get the same edition, and personal playlist contents are a bedtime non-goal (bedtime.md §6). So a Yiddish track in an edition would play to English-only families.
- With 11 stories, cooldowns would bring the same few tracks back anyway.
- Each Yiddish telling already shares dedupe keys with its English versions (`same_story_other_language`). That is harmless, but it brings no benefit either.

**Also rejected: a separate `yiddish` recipe in `packages/playlists`.** It would need Yiddish units in `units.json`, which means changing B3 and B6 in `packages/data`, a package this team doesn't own. Every edition's `playlists[]` would also gain a type that the kids and library sites must render. And it would still be the same 11 stories every night. If the owner later wants one shared Yiddish playlist for all three sites, §9 describes how.

**Chosen: a fixed shelf.** It is honest about its size, keeps its stories, and only the opening changes from night to night.

## 2. The preference control

### 2.1 Values and default

| Value | UI label | Bedtime default? |
|---|---|---|
| `en` | English | **Yes** |
| `yi` | Yiddish / אידיש | |
| `any` | Both | |

**Why the default is `en`:**
- Today the site is English-only, and the five-card, zero-decision promise is the product (bedtime.md §1).
- 93 % of the archive by item count is English, and every generated playlist is English.
- With `any` as the default, every family would see a seventh card that never changes, and three of its stories are by an unconfirmed narrator. With `en`, Yiddish-speaking families opt in with one tap, or arrive already opted in through a shared `/?lang=yi` link.

### 2.2 Where the control lives

There is no first-visit prompt, because a tired parent in a dark room shouldn't have to answer a question before the first story. The header gets nothing either: it is the wordmark and one link, and stays that way.

1. **Home (`/`), under the cards, above the "Earlier this week / For parents" links.** It is a small radio group, styled as three quiet pills:

   ```
   Stories in   ( English )  ( Yiddish / אידיש )  ( Both )
   ```

   It sits below the cards, so the cards stay the first thing a parent sees, but it is still on the one screen people use. Changing it works at once, without a reload, and updates the cards (§3.1).
2. **For parents (`/about`).** A short section, "Stories in Yiddish" (copy in §5), with the same three-way control (one shared component) and links to the Yiddish material on the other two sites.
3. **URL:** `?lang=en|yi|any` on any page.
   - It is read once on load and saved to the store.
   - Then it is removed with `history.replaceState`, so a bookmark or the home-screen icon doesn't fix the choice for good. Other parameters stay; `?play=mix` still works as today and is handled first.
   - An invalid value is ignored.
   - This lets the family, or a Yiddish-speaking school, share `bedtimestories.torahlearningtools.com/?lang=yi`.

### 2.3 Storage

- `createStore("bedtime")` with key `lang`, so the localStorage key is `goldstein:bedtime:lang` and the value is `{"v":"yi"}`.
- A missing or invalid value counts as `en`. The setting is per site, and the other sites keep their own.
- **No flash at load:** an inline script in `Base.astro` `<head>` sets `document.documentElement.dataset.lang` before first paint. It does the same safe read as `createStore`, in try/catch, then `JSON.parse(raw).v`, then validates.
  - CSS shows or hides the sections from that attribute.
  - Without JS, `data-lang` is never set, which acts as `en`, so the Yiddish section stays hidden. That's fine: the cards don't play without JS anyway.
  - `<html lang="en">` stays: the page itself is English.

## 3. Behaviour under en / yi / any

### 3.1 Home (`/`)

| | `en` (default) | `any` (Both) | `yi` (Yiddish) |
|---|---|---|---|
| English cards | the six cards, same as today | the six cards, same as today | grouped under a "Tonight in English" button (6 playlists), closed by default; one tap opens them; not remembered between visits |
| Yiddish card | not shown | **seventh card**, after Radio Night | **first card**, at the top, with a one-line note under it (§5) |
| Continue row | same as today, for any playlist, the Yiddish shelf too | same | same |
| "That was the end. Good night." | same | same | same |
| Edition missing or empty ("No stories tonight…") | same as today | the Yiddish card still shows and plays: it is built into the page and needs no network | same as `any`; the English group is hidden |
| Offline | same as today | Yiddish card from the cached page (the audio still needs the network, as everywhere) | same |

**Cards keep fixed positions.** The six English cards never move. The Yiddish card is either absent, last or first, depending only on the setting. A parent who chooses Yiddish has chosen it to come first.

**Why `yi` does not remove English completely:**
- A family that chooses "only Yiddish" would otherwise be left with one unchanging list.
- The English playlists are one tap away, closed, and labelled. Nothing English plays unless the parent asks for it.
- This is the most literal reading of "only Yiddish" that is still honest about the material.

**The Yiddish card** looks like the other cards (icon, name, line, meta, play button, "⋯"):
- Name: **"Yiddish Stories"**, then `<span lang="yi" dir="rtl">אידישע מעשׂיות</span>` on a second, smaller line.
- Line: "Bubby Chaya Malka's stories, and a few more."
- Meta: "about 2¼ hours · ages 4+". It comes from `aboutLength(total_min)`, and the ages from the lowest `age_min` with a "+".
- If the owner says no to Q1: the line is "Three stories in Yiddish.", and the meta is "about 50 minutes · ages 4+".
- Tapping it plays the shelf as a `Playlist` (§3.3). "⋯" opens its track list. It uses the same player sheet, sleep timer, night screen, Media Session and resume as every other playlist.

### 3.2 The shelf as a playlist

The shelf is built when the site is built (`apps/bedtime/src/lib/build/yiddish.ts`, Node only). The input is the id list in `apps/bedtime/src/lib/yiddish-shelf.ts`; each id is resolved with `loadCatalog()`, `loadItem()` and `loadVocab()`. The result is `PlaylistItem[]`, in the edition's field shape, so the player, sheet and session code need no new types. The list is written into the home page as `<script type="application/json" id="yiddish-shelf">`, about 4 KB, which is not a catalog download.

How each `PlaylistItem` field is filled:
- `id`, `unit` (= `id`), `title` (the public `title`)
- `audio_url` (the public `url`), `clean_audio_url` (when the catalog has `clean_url`)
- `mime_type`
- `start_sec` = `content_start_sec`, and `end_sec` = `content_end_sec` unless it is overridden (see the next list)
- `duration_sec` = `end_sec − start_sec`
- `age_min`
- `advisories` (flag, severity, vocabulary label; no note)
- `band: null`, `block: null`
- `narrator`: "Bubby Chaya Malka" for `bubby_chaya_malka`, the confirmed vocabulary label (DECISIONS §3). Anything else, including `yiddish_narrator_unconfirmed`, gives `null`, so the sheet shows only the length and lock-screen artist is left unset.

**Two tracks end early, before the closing words.** This is range playback, the same mechanism as spans; the audio itself is not edited.
- In two of Bubby's tapes she ends by addressing her grandchildren by name.
- The shelf plays `5e3346ab8e` from 0 to 381 s, the end of its `story` segment (the public `segments[]` gives this).
- It plays `6164b3359f` from 0 to 1005 s. The constant sits in `yiddish-shelf.ts` with a comment saying where it came from and no names.
- The owner dropped B9 for playlists, so this is not required, but on a home tape it is the kinder default (§8, Q2).

**Checks while building the shelf.** The build **fails** if any listed id resolves to something that is not:
- `language == "yi"` and `content_type` in `story`, `lesson_with_story`;
- `level` in the kid levels with `age_min ≤ 8`;
- `max_advisory` other than `strong`;
- `preferred_copy`, with length 3 to 45 min.

An id that is **missing** from the public catalog (unpublished since) is dropped with a build warning. It is not a failure: that is how a `hide` decision should work. Tombstones work at deploy time: a hidden story leaves the shelf at the next site build, and the data build triggers one.

### 3.3 Order: same stories, different opening

- `orderShelf(items, dateKey)` is pure and unit-tested.
- `dateKey` is the current edition's `date` when it is loaded. Otherwise it is today's date in America/New_York from the `@goldstein/playlists` clock helpers, so the opening changes at the same 09:00 flip as the English playlists.
- **Tail, fixed and played last:** `a690295602` (5.1 min), then `65cc733f61` (7.0 min). These are the two calmest, with no advisories, so the night ends on Chana's prayer. This matches the spirit of the wind-down rule.
- **Body:** the other stories, rotated by `dayNumber(dateKey) mod body.length`. The opener is the first story in the rotated body that is 12 min or shorter and has no moderate advisory; it is moved to the front. So a different story opens each night, and the cycle repeats every 9 nights.
- Without Bubby (Q1 = no), the tail is `ed960138a4`, and the body is the other two, rotated.
- The playlist id is `yiddish/<dateKey>` and the type is `yiddish`. `title` is "Yiddish Stories" and `subtitle` is the card line. `ages` is "4+". `total_min` is the rounded sum and `age_min` is the highest.
- After it starts, the session snapshot pins it as it does every playlist (bedtime.md §1), so a flip never reorders a night that is already playing.

### 3.4 The other screens

| Screen or feature | Behaviour |
|---|---|
| Player sheet, mini player, night screen | Unchanged. Sheet colour and icon come from the Yiddish UI entry (§6). Album is "Yiddish Stories · tonight". Artwork is `/icons/yiddish-512.png`. |
| Track list | Title, narrator (only when confirmed), length, and ⓘ for advisories, as now. No Hebrew-script titles: `title_he` is not used. |
| `/earlier` | Editions only, unchanged under all three settings. With `yi` or `any`, one quiet line goes above the list: "The Yiddish stories are on the Tonight page. They're the same every night." |
| `/p/<edition>/<type>` deep links | Unchanged. The shelf has no edition deep link; share `/?lang=yi`. |
| `/landing` | Unchanged: the pitch starts Tonight's Mix, which is English. It is for newcomers, whose default is `en`. |
| Search, browse, "more like this" | The bedtime site has none (bedtime.md §6 non-goals). Nothing to filter. `/about` links to the other sites with `?lang=yi`, the parameter in the shared contract. |
| Empty states | Shelf empty after the build (every id unpublished): the Yiddish card and the "Yiddish" option are not rendered at all, and a stored `yi` acts as `en`. The English edition empty under `yi`: the Yiddish card shows, and the "No stories tonight" notice is replaced by "The English playlists aren't here right now." under the English group. |

## 4. Which Yiddish material is right for this audience

- **In:** standalone stories for children, ages 4–8, 4–26 min, with good audio. In practice that means Bubby Chaya Malka's eight stories (if the owner agrees) and three stories by the Yiddish narrator.
- **Out:** the Tanya shiurim (adults, long), the Haggadah shiurim and talks (teaching, not stories), the live event, the lesson for teens, fragments, and the long family compilations and Part 1/2 tapes. These belong on the library and kids sites, and `/about` links there.
- **Family recordings:**
  - Owner decision DECISIONS §2 publishes them "like everything else".
  - The bedtime spec's B6, a planner's choice, keeps them out of generated playlists.
  - The shelf is not a generated playlist, but it still is "family recordings at bedtime", so the owner is asked (Q1).
  - The recommendation is yes: Bubby telling stories to her grandchildren is exactly what bedtime is for.
- **The unconfirmed narrator:** his three stories appear without a narrator line. The label "Yiddish storyteller (name unconfirmed)" is never rendered on this site, which matches criterion 28 and the stricter bedtime rule.
- **Moderate advisory:** `aae4e91c38` (a boy judge, persecution, moderate) can't open and isn't in the tail, and it shows ⓘ in the list like any English story.

## 5. Copy

Plain, short, parent-facing, in English. The only Hebrew-script text on the site is the language label and the card's second line.

| Where | Text |
|---|---|
| Control legend | Stories in |
| Options | English · Yiddish / אידיש · Both |
| Status line after a change (`role="status"`, visually quiet) | `en`: "Showing English stories." · `yi`: "Showing Yiddish stories first." · `any`: "Showing English and Yiddish stories." |
| Yiddish card | **Yiddish Stories** / אידישע מעשׂיות · "Bubby Chaya Malka's stories, and a few more." · "about 2¼ hours · ages 4+" |
| Note under the Yiddish card (`yi` only) | "There are only eleven Yiddish stories for children in the archive, so this list stays the same. Each night a different one comes first." |
| English group button (`yi`) | "Tonight in English (6 playlists)" ▸ / ▾ |
| `/earlier` line | "The Yiddish stories are on the Tonight page. They're the same every night." |
| `/about` section "Stories in Yiddish" | "Most of the recordings are in English. There are also eleven Yiddish stories for young children, most of them told by Bubby Chaya Malka, Uncle Yossi's mother, to her grandchildren. Choose Yiddish or Both below to see them on the Tonight page. The archive also holds Rabbi Yosef Goldstein's Tanya shiurim and a Haggadah in Yiddish, for older listeners: find them in [The Goldstein Story Archive](library `/?lang=yi`) and [Story Shelf](kids `/?lang=yi`)." |

The numbers in the copy ("eleven", "2¼ hours") come from the built shelf (count and `total_min`), never hard-coded. Keep `/about` under 250 words (bedtime.md §2.4). The new section replaces nothing, so trim elsewhere if needed.

## 6. Accessibility, RTL and visuals

- **Control:** `<fieldset>` with `<legend>Stories in</legend>` and three native `<input type="radio" name="lang">`, each with its label. Arrow keys, focus ring and screen-reader grouping then come for free.
  - Each pill is at least 44 px high.
  - The checked pill uses the card colour token for its border, and its text meets the existing contrast table (bedtime.md §3).
- **Mixed-direction label:** `Yiddish / <span lang="yi" dir="rtl">אידיש</span>`. With its own `dir`, the Hebrew run is isolated, so the slash and the English stay in place on iOS and Android. The card's second line is a block with `lang="yi" dir="rtl"`, aligned to the start of that block, which is the right edge.
- **Font:** Nunito Sans and Fraunces have no Hebrew glyphs. `[lang="yi"] { font-family: "Noto Sans Hebrew", "Arial Hebrew", "Segoe UI", system-ui, sans-serif; }`. No new web font, so the 150 KB budget for `/` is kept (criterion 16).
- **Screen readers:** the `lang` attribute switches the voice for the Hebrew-script run. The card button's `aria-label` is "Play Yiddish Stories. Bubby Chaya Malka's stories, and a few more. About 2¼ hours, ages 4+." It is in English; the Hebrew line is decorative there and is not repeated.
- **English group (`yi`):** a `<button aria-expanded aria-controls>` over a `<div>`. Opening it doesn't move focus, and it uses no animation under `prefers-reduced-motion`. It uses no animation at all, in fact: show and hide only.
- **The status line** is announced politely and never steals focus.
- **The Yiddish UI entry:**
  - `YIDDISH_UI` in `ui.ts`: type `yiddish`, colour `#E8CF8A` (warm candle gold; check it against the contrast table on `#0B1026`).
  - Icon: an open book with a small heart. No crosses or four-pointed shapes, per the owner. The icon set's 2 px round strokes.
  - `make-icons.mjs` adds `public/icons/yiddish-512.png` for the lock screen.

## 7. Implementation plan (file by file)

Everything is inside `apps/bedtime/**` and `docs/sites/bedtime.md`. **Nothing in `packages/playlists`, `workers/api` or `packages/data`.**

| File | Change |
|---|---|
| `apps/bedtime/src/lib/lang.ts` (new) | `type LangPref = "en" \| "yi" \| "any"`; `LANG_KEY = "lang"`; `DEFAULT_LANG = "en"`; `parseLang(x): LangPref`; `langFromSearch(search): LangPref \| null`; `layoutFor(lang, shelfSize): { yiddish: "none" \| "last" \| "first"; englishCollapsed: boolean }` (shelf size 0 → `none`, not collapsed); `LANG_LABELS`; `statusLine(lang)`. Pure, so it can be tested in Node. |
| `apps/bedtime/src/lib/yiddish-shelf.ts` (new) | `SHELF_BODY`, `SHELF_TAIL` (ids, §3.3), `END_OVERRIDES` (`5e3346ab8e: 381`, `6164b3359f: 1005`, with comment), `INCLUDE_BUBBY_FAMILY_STORIES` (set from the owner's Q1 answer; `false` until he answers, which leaves the 3-story shelf), `orderShelf(items, dateKey)`, `shelfPlaylist(items, dateKey): Playlist`, `CONFIRMED_NARRATORS = { bubby_chaya_malka: "Bubby Chaya Malka" }`. Pure. |
| `apps/bedtime/src/lib/build/yiddish.ts` (new, Node only, imported only from `.astro` frontmatter) | `resolveShelf(): PlaylistItem[]` via `@goldstein/data/load` (`loadCatalog`, `loadItem`, `loadVocab`), the build checks of §3.2, a warning for missing ids. Never calls `loadTranscript` or `loadSearchDoc`. |
| `apps/bedtime/src/lib/ui.ts` | `YIDDISH_UI: TypeUi`-like entry (widen the `type` field to `CoreType \| "yiddish"` in a separate `ShelfUi` so `TYPES` and its recipe-order test stay as they are); `uiOf(type)` = `TYPE_BY_ID[type] ?? (type === "yiddish" ? YIDDISH_UI : TYPES[2])`. |
| `apps/bedtime/src/scripts/sheet.ts`, `bedtime-player.ts` | Use `uiOf(p.type)` for colour, icon and artwork instead of `TYPE_BY_ID[...] ?? TYPES[2]`. Nothing else: the shelf is an ordinary `Playlist`. |
| `apps/bedtime/src/components/LangControl.astro` (new) | The fieldset of §6, shared by `/` and `/about`. |
| `apps/bedtime/src/pages/index.astro` | Frontmatter: `const shelf = resolveShelf()`. Markup: a Yiddish card `<li data-yiddish-card>` in **two** slots, `data-slot="first"` above the list and `data-slot="last"` after Radio Night; CSS shows one or none, which keeps the DOM order matching the visual order for screen readers. The English cards are wrapped in `<div data-english>` with the `yi` disclosure button. `<script type="application/json" id="yiddish-shelf">` (rendered only when `shelf.length > 0`). `<LangControl />` above the quiet links. |
| `apps/bedtime/src/layouts/Base.astro` | Inline pre-paint script that sets `data-lang` on `<html>` (§2.3), about 300 bytes. Add `is:inline`, and make sure the CSP or Worker headers (if any) allow it, as the theme scripts on other sites do. |
| `apps/bedtime/src/scripts/pages.ts` | `renderHome`: handle `?lang` (after `?play=mix`), read the store, apply `layoutFor`, wire the radio change (store, set `data-lang`, status line), wire the Yiddish card play and "⋯" with `shelfPlaylist(items, edition?.date ?? clockDateKey())`, and the `yi` English disclosure. On an empty edition, keep the Yiddish card working (§3.4). `renderEarlier`: the one-line note for `yi`/`any`. |
| `apps/bedtime/src/pages/about.astro` | "Stories in Yiddish" section (§5) + `<LangControl />` + `siteUrl("library", "/?lang=yi")`, `siteUrl("kids", "/?lang=yi")`. The count comes from `resolveShelf().length`. |
| `apps/bedtime/src/styles/global.css` | Lang control pills; `:root[data-lang="yi"]`, `[data-lang="any"]` visibility rules for the slots, the English group and the `/earlier` note; `[lang="yi"]` font stack and `text-align: start`. |
| `apps/bedtime/scripts/make-icons.mjs`, `public/icons/yiddish-512.png` | New icon. |
| `apps/bedtime/public/sw.js` | `VERSION = "v4"` so the new shell (pages with the Yiddish card) replaces the cached one. |
| `apps/bedtime/test/lang.test.ts` (new) | `parseLang` (invalid → `en`), `langFromSearch` (`?lang=yi`, `?lang=YI` → null or lowercased, decided in code and documented; `?lang=fr` → null), `layoutFor` for all 3 × {0, 3, 11} combinations, labels exactly "English", "Yiddish / אידיש", "Both". |
| `apps/bedtime/test/yiddish.test.ts` (new; runs on the generated dataset, skipped with a clear message if it isn't built, like the other dataset tests) | (1) Every listed id is public, `language: "yi"`, an allowed content type and kid level, `age_min ≤ 8`, not `strong`, `preferred_copy`, 3–45 min. (2) `resolveShelf()` narrators are only "Bubby Chaya Malka" or `null`, never the unconfirmed label. (3) `END_OVERRIDES` lie inside the content bounds, and `5e3346ab8e`'s equals its public story segment end. (4) `orderShelf` is deterministic per date, keeps the tail last, never opens with a moderate advisory or a story over 12 min, and gives 9 distinct openers over 9 consecutive dates (3-story shelf: 2). (5) The total minutes match the card meta. (6) The shelf JSON contains no key from the privacy gate's internal list. |
| `apps/bedtime/test/lib.test.ts` | Extend: `uiOf("yiddish")` returns the Yiddish entry; unknown types still fall back. |
| `apps/bedtime/test/dist.test.ts` (new, runs only when `dist/` exists, so in CI after the build) | No string "name unconfirmed" in `dist/**`. Every Hebrew-script character in `dist/**/*.html` is inside an element with `lang="yi"` (the amended criterion 28). The home page JSON shelf matches `resolveShelf()`. |
| `apps/bedtime/e2e/smoke.mjs` | Add: default shows 6 cards and no Yiddish card; `/?lang=yi` puts the Yiddish card first, collapses English, and leaves the URL clean; tapping the Yiddish card starts audio; reload keeps `yi`; choosing "Both" moves the card last; `/earlier` shows the note. Screenshots `bedtime-lang-yi.png`, `bedtime-lang-any.png`. |
| `docs/sites/bedtime.md` | Add **§10 Language preference** (summary of this doc and a link). §2.1: the optional seventh card. §6 non-goals: "No Yiddish… in any **generated** playlist; a fixed, opt-in Yiddish shelf exists (§10)". Criterion 28: "no Hebrew-script text appears except inside `lang="yi"` elements (the language label and the Yiddish card); no unconfirmed narrator or series label is rendered". New criteria 29–31: the default `en` looks the same as before; `?lang` is honoured and removed from the URL; no Yiddish transcript or search text is in `dist/`. |

Verify with `npm ci && npm run typecheck && npm test && npm run build`, then `npm run privacy:gate -- apps/bedtime/dist`. The shelf JSON is public titles and URLs only. No gate change is needed, and the gate must not be weakened.

## 8. Open questions for the owner

1. **May Bubby Chaya Malka's eight Yiddish stories be on the bedtime site** (as a fixed shelf, played only when a parent picks it)?
   - These are her home recordings for her grandchildren, flagged `private_family`.
   - DECISIONS §2 publishes them, but the bedtime spec keeps family recordings out of playlists.
   - Recommended: yes. Without them, the shelf is 3 stories, 48 min, all by the unconfirmed narrator.
2. **In two of these tapes she names her grandchildren at the end.** May the shelf stop those two tracks just before the closing words (playing a range; the audio itself is not changed)? Or play them to the end, as radio names are allowed?
   - Recommended: stop before.
3. **The Yiddish narrator of three stories is still unconfirmed.** Until he is named, they play without a narrator line. Is that acceptable, or should they wait?
4. **Default `en` on this site** (Yiddish is opt-in, with a shareable `/?lang=yi` link). Agree?

## 9. Later

- **Pesach:** during the Pesach window, add the short children's Haggadah talks (`380cd387f3` Bedikas Chametz 13 min, `da784bf1d1` Biur Chametz 4 min) as an optional opener to the shelf. They are talks, so they wait for the `season` type's design.
- **If the owner wants one shared Yiddish playlist on all three sites:**
  - `packages/data` would build a separate `yiddish_units` list (B3 reversed, B6 per Q1). That is outside this team's files.
  - `packages/playlists` would add a `fixed`-style recipe with no cooldowns and a fixed tail, published as a separate `yiddish` entry outside `playlists[]`, so the existing type order and all three renderers stay as they are.
  - The bedtime site would then read it from the edition instead of building the shelf.
  - Today's design keeps the same `Playlist` shape, so the move is mechanical.
- **If the archive later gains more Yiddish children's stories** (lost tapes found): when the shelf passes about 8 h, move to a generated `yiddish` recipe with real cooldowns. A test that prints the shelf's hours makes that point visible.

## 10. Implementation notes (2026-11-27, branch `lang-bedtime`)

Where the build differs from the plan above, and why:

- **Numbers confirmed** against the generated catalog (`test/yiddish.test.ts`): 11 stories, 134.2 min; without Bubby, 3 stories, 48.2 min. `INCLUDE_BUBBY_FAMILY_STORIES` is `false` until the owner answers Q1, so the shipped shelf is the 3-story one ("Three stories in Yiddish.", "about 50 minutes · ages 4+"). Both lists are validated by the tests, so flipping the flag is safe.
- **Opener rotation (§3.3).** "First fit story in the rotated body" only ever reaches 3 distinct openers (only 3 body stories are ≤ 12 min without a moderate advisory), and repeats `a70d104e90` six nights in nine. The code instead rotates the opener through the fit stories by day and rotates the rest of the body behind it, so the opener changes every night (cycle of 3) and the rest of the order changes too. On the 3-story shelf no story is ≤ 12 min, so the opener alternates between the two body stories (fallback: stories without a moderate advisory). The test checks 3 and 2 distinct openers, not 9.
- **`END_OVERRIDES`**: `6164b3359f` stops at 1005 s, just before the first privacy-masked span of its private metadata; `5e3346ab8e` at its public story segment end (381 s). Both are checked against the public data.
- **Layout by CSS only.** The inline head script sets `<html data-lang>` (and again on `astro:after-swap`, because the router replaces `<html>`'s attributes); CSS shows the Yiddish slots, the English disclosure and the `/earlier` note. `renderEarlier` is unchanged: the `/earlier` note is static markup shown by CSS. `layoutFor()` is the tested statement of the same rules. `<html data-has-yiddish>` tells the client whether a shelf exists; with an empty shelf no control, card, JSON or head script is rendered and a stored `yi` acts as `en`.
- **Empty English edition under `yi`:** the "No stories tonight" notice and the English button are hidden by CSS and "The English playlists aren't here right now." shows instead; under `any` the notice is unchanged and the Yiddish card still plays.
- **Copy:** the note under the Yiddish card says "There are only three Yiddish bedtime stories here…" (not "in the archive", which would be untrue for the 3-story shelf). The card meta uses the existing `aboutLength`, which has no quarter hours: the 11-story shelf would read "about 2 hours".
- **`/about`** was already over the 250-word budget before this change (about 315 words in the article); the new section adds about 60. Nothing else was trimmed: that copy is the owner's.
- **Icon:** `public/icons/yiddish-512.png` was rendered from the same tile SVG as `make-icons.mjs` with resvg (Playwright and Chromium are not installed here); `make-icons.mjs` now includes the Yiddish tile for the next full run.
- **Not run here:** `e2e/smoke.mjs` (needs Playwright, Chromium and the dev API); the new language checks are written but unverified in a browser.

# Language preference on the kids' site (Story Shelf)

Status: design and implementation plan, 2026-11-27. Scope: `apps/kids/**` and `docs/sites/kids.md`. No shared-package change is needed.
Binding inputs: `CLAUDE.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` §4 and §8, `docs/sites/kids.md`, and the cross-site contract for this feature:
- values `en | yi | any`;
- `createStore` key `lang`;
- optional `?lang=` parameter;
- labels "English", "Yiddish / אידיש", "Both";
- Yiddish ASR text is never displayed;
- unconfirmed names are rendered verbatim and never linked.

Numbers below come from `packages/data/generated/` (`npm run data:build`, 2026-11-27), with the kid-pool rules of kids.md §9 applied exactly as `apps/kids/src/lib/pool.ts` does today.

---

## 1. What the Yiddish material is, and what of it belongs here

The public export has 1,183 items: 1,104 in English, 78 in Yiddish (`yi`) and 1 in Hebrew (`he`).

The kid pool has six rules (kids.md §9). If rule 2 ("`language.primary = en`") is the only rule relaxed and the other five stay as they are, **18 Yiddish items qualify**:

| Group | Items | Kind on this site | Notes |
|---|---|---|---|
| Bubby Chaya Malka's stories (`bubby_zaidy_stories`, `content_type = story`) | 8 | story | Rashi's father and the diamond, Chana's prayer, Eliyahu's cup, the Blessed Coin, the Baal Shem Tov and the bear, Rabbi Meir and the lion, Dayeinu, the Boy Judge. 5–17 min each. Speaker `bubby_chaya_malka` is confirmed (DECISIONS §3). |
| Other Yiddish stories (no series) | 4 | story | Yosef Mokir Shabbos (4 min), The Wondrous Glasses (26 min), Three Din Torahs (18 min), Wondrous Glasses + a blood libel (32 min, `moderate`). Narrator `yiddish_narrator_unconfirmed`. |
| Erev Pesach lessons for children (`haggadah_yiddish`, `content_type = talk`) | 5 | short | Bedikas chametz, biur chametz, the fast of the firstborn, the Haggadah title page, resting on Erev Pesach. 1.6–13 min. Narrator unconfirmed or `unknown`. |
| Live event: "Shehakol Nihyeh Bidvoro" (Yud-Aleph Shevat class at a rally) | 1 | event | 14 min. Unconfirmed narrator. |
| **Total in the Yiddish kid pool** | **18** | 12 stories, 5 shorts, 1 event | **3.5 hours** |

Per view (Gentle = no advisories at all):

| Band | Yiddish items | Stories | Shorts under 10 min | Story-of-the-Day eligible |
|---|---|---|---|---|
| Little | 13 | 7 | 4 | 7 |
| Kids (default) | 15 | 9 | 4 | 9 |
| Big Kids | 18 | 12 | 4 | 10 |
| Any band + Gentle | 10 | 4 | 4 | 4 |

For comparison the English kid pool is 1,033 items. Yiddish is 1.7% of what a child can reach.

**Kept out, by the same rules that keep English material out (no new rule):**
- **42 Tanya shiurim** (Rabbi Yosef Goldstein, `adults`, `shiur`, about 47 h). They are adult learning.
- **9 Haggadah shiurim** (`shiur`, 23–234 min; level `children`). They are lectures, not stories. The 5 short Erev Pesach talks from the same series are in the pool.
- **4 family recordings.**
  - Bubby's "Yiddish Stories" Parts 1 and 2 and "Nine Tales Before Pesach" (24–95 min).
  - "Zaidy Teaches Tov Li Toras Picha" (52 min, unconfirmed narrator, guest children).
  - The pool excludes `family_recording` in English too. Several of the tales in these recordings are also items of their own, which are in the pool.
- **2 Sefiras HaOmer recordings** (family recordings), **2 fragments**, **1 adult lesson** (Likkutei Dibburim, `teens_adults`) and **1 superseded copy**. The superseded copy shows only under "Other versions" on its preferred copy's page.
- **The one Hebrew item**: a 24-second fragment.

**Rule 2 becomes:** `language.primary` is `en` or `yi`. Any other primary language (today only the `he` fragment, which other rules already drop) stays out, so a future Hebrew item can't slip in labelled as Yiddish.

**Where this is suitable for children:**
- Every one of the 18 is marked for children (levels `young_children`/`children`, ages 4–8).
- Age bands, advisories and the Gentle switch apply to them unchanged. The blood-libel story and the Boy Judge are `moderate`, so they are Big Kids only.
- Their titles, summaries, lessons, advisory notes and segment titles are already English metadata. The site displays no Yiddish text at all apart from its own label "אידיש".

**Cross-language tellings:** 7 of the 18 have an English telling of the same story that is in the kid pool (from `story_groups` and `same_story_other_language`). 28 English pool items have a Yiddish twin. Examples:
- Eliyahu HaNavi's Cup ↔ "Eliyahu HaNavi's Surprise Visit" and four radio episodes;
- Dayeinu ↔ Episode 422;
- Yosef Mokir Shabbos ↔ four episodes;
- the Boy Judge ↔ the "Judge for a Day" episodes;
- Rabbi Meir and the lion ↔ the Reb Ariel episodes;
- Three Din Torahs ↔ the Berditchev stories;
- Rashi's father ↔ "A Diamond from Heaven".

That pairing is the most child-friendly use of the Yiddish material ("Hear it in Yiddish" / "Hear it in English"), and §4.6 builds on it.

---

## 2. Preference model

| Value | Label | Lists show | Who it is for |
|---|---|---|---|
| `en` (**default**) | English | English items only. Today's site, byte for byte, except for the discovery links in §3.4. | Nearly every family. |
| `yi` | Yiddish / אידיש | Yiddish items only, with honest empty states and a one-tap way back to Both. | A Yiddish-speaking home with young children. |
| `any` | Both | English and Yiddish mixed, with every Yiddish card marked. | Bilingual homes, and grandparents. |

**Why the default is `en`, not `any`:**
1. It is the current behaviour, and acceptance criterion 4 in kids.md (no Yiddish anywhere) is what families on the site have today.
2. The primary user is a 6–11-year-old alone on a tablet (kids.md §1). Most of them do not understand Yiddish. A Yiddish Story of the Day, or a Yiddish card in "More like this", is a broken experience for that child: they tap, hear a language they don't know, and leave.
3. Yiddish is 1.7% of the pool. Under `any` it would turn up on a shelf rarely and at random, which helps nobody. People who want it are better served by a clear way to find it (§3.4) than by a mixed default.
4. Yiddish-speaking families are a known community, and the owner can give them a link that sets the preference in one step: `https://kidsstories.torahlearningtools.com/?lang=yi` (§3.3).

**Language of an item** (`itemLang`): `"yi"` when `language.primary === "yi"`, otherwise `"en"`. It is derived once in the build model. `language.spoken` is ignored: English radio shows with a Yiddish phrase are English, and the Yiddish rally talk with some English is Yiddish.

**Fit with the band and the Gentle switch:**
- Language is a third axis next to them, and it uses the same mechanism they do: build-time `data-vis` tokens, filtered by CSS (§5.1).
- So static shelves, caps, minimum counts, per-band count labels and grids become language-correct without per-page JavaScript.
- Every rule that respects the band (shelves, grids, search, "More like this", Story of the Day, Surprise Me) also respects the language.
- Rules that ignore the band ignore the language too:
  - Keep Listening, My Shelf, Finished: these are the child's own history;
  - direct links: a page always opens, with a banner;
  - the playlist cards' items.

---

## 3. Where the control lives

### 3.1 The "Who's listening?" sheet (top-bar chip): primary
The band chip already opens this sheet on every page. A **"Stories in…" row** goes under the three band buttons:

```
Who's listening?                                    [X]
[ Little 3–5 ] [ Kids 6–8 ] [ Big Kids 9+ ]
──────────────────────────────────────────────
Stories in…
[ English        ] [ Yiddish / אידיש ] [ Both              ]
  Most stories       15 so far           English and Yiddish
```

- Tapping a language button applies it at once. The page re-renders with the same `rerender` path a band change uses, a toast confirms, and **the sheet stays open**. Tapping a band still closes it, as today. A child who taps a band and goes never meets the language row, which is fine: the row is secondary, and the default is right for that child.
- The "so far" count is per band and Gentle (13/15/18; 10 with Gentle). It uses the same per-variant `vcount` spans as tag pages.
- **First visit:** the sheet already opens once (`hasChosenBand`). The language row is in it with English pressed. Nothing is added to the first-visit flow, and nobody is made to answer a language question.
- **Chip marker:**
  - In `yi` the chip shows "· אידיש" (`lang="yi" dir="rtl"`); in `any` it shows "· Both". It works like the existing "· gentle" mark.
  - In `en` there is no marker.
  - Below 400 px the visible marker is dropped to keep the top bar on one line. The chip's accessible name still includes it ("Who's listening: Kids 6+, stories in Yiddish").

### 3.2 `/grown-ups`: full explanation
A new **"Language"** card goes between "Who's listening?" and the Gentle switch. It has the same three buttons, the counts per band, and the copy in §7.2, which says plainly what exists in Yiddish and where the adult Yiddish material is. The link to the library passes `?lang=yi`; see the open question on the library's deep link.

### 3.3 `?lang=en|yi|any`
- The pre-paint inline script in `Base.astro` reads `?lang=` along with the stored `band` and `gentle`, so the first paint already matches the link.
- `app.ts` then saves it with `S.setLang()` and removes only `lang` from the address with `history.replaceState`. Other parameters, such as `?tab=` and `?d=`, are kept.
- Invalid values are ignored.
- The parameter is a convenience for sharing a link. It never locks content, and the sheet changes it back at any time.

### 3.4 Discovery while the preference is `en`
A Yiddish family that lands on the default must be able to find the Yiddish shelf without knowing the setting exists. There are two quiet entry points, and **no Yiddish card appears on any shelf in `en`**:
- **Home:** one slim link card above "Surprise me!": "Stories in Yiddish · מעשיות אויף אידיש →" (to `/yiddish/`). It is visible only in `en` variants.
- **Explore header:** a fifth wide button, full width under the existing 2×2 (Holidays, Quick Listens, Chapter Stories, Playlists): "In Yiddish / אידיש". It is visible in every mode.

`/yiddish/` is an explicit opt-in page. Its cards are visible in every language mode, with the band still applied, the way a direct link is (§4.5).

---

## 4. Behaviour of every surface

`en` is today's behaviour everywhere unless a row says otherwise. "Hidden" means CSS hides it through `data-vis`.

### 4.1 Home `/` (kids.md §4.1)

| # | Shelf | `en` | `any` | `yi` |
|---|---|---|---|---|
| 1 | Greeting + Hebrew date | same | same | same |
| 2 | Story of the Day | English pool (unchanged picks, §5.4) | English + Yiddish pool | Yiddish pool (7/9/10 by band, 4 with Gentle) |
| 3 | Keep Listening | own progress, any language | same | same |
| 4 | Tonight's Playlists | shown | shown | **hidden**. Playlists are English-only (rule B3 in `packages/data/src/build/units.ts`). |
| 5 | Coming up: holiday (max 2) | as today | English + Yiddish | Yiddish only, min 4 as today. In practice only Pesach (5 talks + Dayeinu). |
| 6 | This week's parsha | as today | mixed | Yiddish (min 2; none today) |
| 7 | **In Yiddish** (new, static) | hidden | shown when ≥ 4 in band: all Yiddish stories, Bubby's first, cap 12 | see 7y |
| 7y | **Yiddish shelves** (new, static) | hidden | hidden | "Bubby's stories" (Bubby Chaya Malka), "More stories" (the other Yiddish stories), "Getting ready for Pesach" (the 5 talks). **Minimum 1**, not 4, because this is all there is. |
| 8 | Quick Listens < 10 min | as today | mixed | **hidden**. Its 4 items are the Pesach talks already in 7y. |
| 9 | From the Radio Show | as today | as today (no Yiddish shows) | hidden (min rule: 0 items) |
| 10 | Chapter Stories | as today | as today | hidden (min rule) |
| 11 | Meet a Hero | as today | counts include Yiddish | hidden (no hero reaches 5 Yiddish items) |
| 12 | Pick a Midah | as today | counts include Yiddish | hidden (min rule at `TILE_MIN`) |
| 13 | **Yiddish note card** (new) | hidden | hidden | "That's all in Yiddish for now." Copy in §7.3; buttons [Show English too] [See all in Yiddish]. |
| 14 | Yiddish link card (§3.4) | shown | hidden | hidden |
| 15 | Surprise me! | English | mixed | Yiddish story-of-the-day pool |

If Story of the Day has an empty pool (possible only with future data), its section is **hidden**. Today the skeleton would stay on screen. That is a small fix that this change needs.

### 4.2 Grid pages: `/stories`, `/quick`, tag, holiday and parsha pages
- Cards carry their language in `data-vis`, so CSS filtering, paging (`applyGrid`), "Play all stories", section hiding and the per-variant count labels follow the language automatically.
- Story-type chips are hidden when they have no items in the variant, as today. In `yi`, `/stories` therefore shows about 4 chips.
- **Empty state in `yi`:** the existing `[data-grid-empty]` block gets the language-aware copy in §7.4 and two buttons, [Show English too] and [Yiddish stories]. Example: `/quick` in `yi` keeps its 5 talks, but `/topic/learning-torah` at Little has none.
- In `any`, Yiddish cards are mixed in by the page's sort. No separate language chip is added: kids.md forbids multi-select filters, and language is a global setting.

### 4.3 Explore and the tile pages
- In `en` and `any`, a tile is visible when it has ≥ `TILE_MIN` (8) items in the variant. Under `any` the English counts already meet this, so the tile set is the same as today, with slightly higher counts.
- In `yi`, a tile is visible when it has **≥ `YI_TILE_MIN = 3`** Yiddish items in the variant. Measured at Big Kids, about 20 tiles qualify, for example:
  - topics: Hashem Is Watching 7, Shabbos and Mitzvos 7;
  - midos: Trusting Hashem 8, Kindness and Giving 7;
  - mitzvos: Tzedakah 7;
  - holidays: Pesach 7.

  At 2 the tiles would mostly be noise; at 8 every tile but one would vanish. Hero tiles need 5 items in the pool, so no hero tile reaches the Yiddish view.
- In `yi`, a panel at the top of Explore reads: "Only a few stories here are in Yiddish." [See all in Yiddish] [Show English too]. It is visible in all `-y` variants. When no tile qualifies, the panel is all that shows.

### 4.4 Radio, Chapter Stories (`/serials`, `/serial/<key>`), Tonight (`/tonight`)
- All of these are English-only content.
- In `yi`, each page's main content is wrapped in a block that is visible only in non-`-y` variants. A panel takes its place:
  - Radio: "Uncle Yossi's radio show is in English."
  - Chapter Stories: "Chapter stories are in English."
  - Tonight: "Tonight's playlists are in English."

  Each panel has [Show English too] and [Stories in Yiddish].
- Episode-number and lost-episode tiles sit inside the wrapped block, so a `yi` listener never sees a grid of English shows.
- The tab bar is unchanged. Hiding the Radio tab would move the other tabs, and the tab leads to a clear explanation.

### 4.5 New page `/yiddish/` ("In Yiddish")
- Head: "In Yiddish". Subtitle: "אויף אידיש · Stories and lessons told in Yiddish." The Hebrew-script run is `lang="yi" dir="rtl"`.
- Sections, in order:
  1. "Bubby's stories" (told by Bubby Chaya Malka);
  2. "More stories";
  3. "Getting ready for Pesach";
  4. "Also in Yiddish": the rally talk.

  This page is the one deliberate exception to "events appear on no shelf" (kids.md §4.6): it is the complete list for one language, and 18 items don't need hiding. Record this in kids.md §14.
- Cards are visible in **every language mode** (their `vis` is the band variants of all three languages), and the band still applies. A section with nothing in band is hidden.
- In `en`, a banner at the top reads "These are in Yiddish. Want them on every shelf?" with [Show Yiddish too] (sets `any`) and [Yiddish only] (sets `yi`).
- Uses `data-init="grid"`, so sorting, paging and "Play all" work as on any grid.
- Not a tab. Reached from §3.4, from the Yiddish note card, from the empty states and from search.

### 4.6 Item page `/listen/<id>`
- **Pages now exist for the 18 Yiddish items**, and for one superseded copy under "Other versions". `hasKidPage` and the cover routes follow `m.items`, so covers are generated with no other change.
- **Language pill:**
  - Yiddish items show "Yiddish / אידיש" in the meta line after kind and duration. "אידיש" is `lang="yi" dir="rtl"`.
  - English items get no pill.
  - Cards elsewhere show a shorter English pill, "Yiddish", so a child who reads only English can read it. Its screen-reader text is "In Yiddish".
- **Byline:** `BYLINES` gains `bubby_chaya_malka → "Bubby Chaya Malka"` (a confirmed identity), so her stories read "Told by Bubby Chaya Malka". The unconfirmed narrator and `unknown` get **no byline**, exactly as unknown English speakers today. The placeholder label is never rendered (acceptance criterion 6 stays true).
- **`title_he`:** rendered under the title when present, with `dir="rtl"`. Use `lang="yi"` for Yiddish items and `lang="he"` otherwise. Only one of the 18 has it: "שהכל נהיה בדברו".
- **"Hear it in Yiddish"** (on English items with a Yiddish twin in the kid pool) and **"Hear it in English"** (on Yiddish items with an English twin):
  - a small card row placed right after "Hear this story told another way";
  - the cards are language-filtered like any card, so the Yiddish row shows in `any`/`yi` and the English row in `en`/`any`;
  - pairs come from story groups and `same_story_other_language` relations, both directions, kid-pool targets only, at most 3 cards, preferring `story` over `show`.
- **For grown-ups (collapsed):**
  - When a twin exists in the other language, add one line in every mode: "Also told in Yiddish: <title>" or "Also told in English: <title>", linking to that kid page.
  - A Yiddish telling that is *not* in the kid pool (Tanya shiurim, family recordings) replaces today's "Also told in Yiddish in the grown-ups' library" with a direct link to that recording: `itemUrl("library", id)`.
  - **Fix:** the line "Read the automatic transcript in the grown-ups' library" shows only when `transcript.display === "show_with_label"`. Yiddish items say "Listen in the grown-ups' library" instead. Today the line would be wrong for every Yiddish page.
- **Banner for a page outside the preference** (direct link, Keep Listening, a twin link):
  - Yiddish item in `en`: "This one is in Yiddish." [Show Yiddish too].
  - English item in `yi`: "This one is in English." [Show English too].
  - The Play button always works. When both the band and the language are out, the language line comes first and the band line after it.
- **More like this** (6 cards), with one list per language mode (§5.3):
  - `en`: today's list, unchanged.
  - `any`, English source: the combined ranking, with **at most 2 Yiddish cards** among the 6.
  - `any`, Yiddish source: the combined ranking with no cap.
  - `yi`: Yiddish neighbours only, up to 6. With 18 items this is often 4–6. When fewer than 3 are in band, the row ends with a "More in Yiddish" link card to `/yiddish/`.
- **End-of-story suggestions** in the player sheet (first 3 "More like this") use the list for the current mode, from the item JSON (§6, file 19).

### 4.7 Search `/search`
- The kid search index now includes the 18 Yiddish items, with the fields of kids.md §6.5 only. These are English metadata. **No transcript of any language is indexed**, as today.
- Yiddish documents add the tokens "Yiddish · Yidish · אידיש" to `tags`, so typing "yiddish" or "אידיש" finds them. Bubby's items add "Bubby Chaya Malka" to `tags`; it is a confirmed name.
- Results are filtered by the variant, which includes the language (`recIn`).
- **Language hint:**
  - In `en`, when some matches were filtered out only because of language: "3 more in Yiddish." [Show Yiddish too].
  - In `yi`, with no Yiddish match: "No Yiddish stories for that. We found 12 in English." [Show English too]. The suggestion chips follow.
- **Suggestion chips in `yi`:** "Eliyahu HaNavi", "Pesach", "diamond", "lion", "Baal Shem Tov", "Bubby". Each is checked by a test to return ≥ 1 Yiddish result at Kids band.
- The query is still never sent anywhere.

### 4.8 Playlists, My Shelf, Keep Listening, the player
- Playlists: unchanged in `en`/`any`. Hidden on Home and replaced by the §4.4 panel in `yi`. The playlist engine stays English-only; there is no shared change.
- My Shelf, Finished and Keep Listening are not filtered. They are the child's own history, and are not filtered by band either. A Yiddish card there carries the pill.
- Media Session artist is the byline, so "Bubby Chaya Malka" or none.

---

## 5. Mechanism

### 5.1 Variants gain a language suffix
Today `Variant` is `l | k | b | lg | kg | bg`. `<html data-v>` holds one of them, and a card's `data-vis` lists the variants that show it. The new design adds a suffix:

```
Variant = `${"l"|"k"|"b"}${""|"g"}${""|"-y"|"-a"}`        // 18 values
en  → "k", "kg"            (unchanged tokens)
yi  → "k-y", "kg-y"
any → "k-a", "kg-a"
inVariant(ageMin, adv, itemLang, v) =
  inBand(ageMin, adv, band(v)) && (!gentle(v) || adv === 0) &&
  (lang(v) === "any" || lang(v) === itemLang)
```

- **English mode keeps the exact token names it has today.** All existing `data-v` values, stored settings and band logic stay valid, and an English item in English mode is visible for the same reason as before.
- `visibleIn`, `capPerVariant`, `countsByVariant`, `serialVis`, the chip and section `vis` lists, and `TagPage`'s `allVis` all iterate `VARIANTS`, so they become language-aware with no per-page logic.
- `visibleIn(list, min)` accepts `min: number | ((v: Variant) => number)`. This is used for `YI_TILE_MIN` (§4.3) and for the Home minimum of 1 in `-y` (§4.1).
- CSS: 18 rules of the existing form `html[data-v="X"] [data-vis]:not([data-vis~="X"]) {display:none}`. A test checks that `global.css` has exactly one rule for each `VARIANTS` entry.
- `<html>` also gets `data-lang="en|yi|any"`, for styling only: the chip marker and the panels' layout.
- Parsing helpers replace the string tricks:
  - `variantBand` / `variantGentle` / `variantLang` parse the base before the `-`;
  - `misc.ts`'s `v.replace("g","")` becomes `withoutGentle(v)`.

**Page weight:**
- A card in all bands goes from `l k b lg kg bg` (14 bytes) to 12 tokens (about 40 bytes) for an English item. A Yiddish item has 12 tokens too: `-y` and `-a`.
- On the largest page (`/radio`, about 411 cards plus number tiles) that is about +11 KB raw and well under 2 KB gzipped.
- To offset it, `vcount` (`src/lib/html.ts`) emits one `<span data-vis="…">` per **distinct** count, listing the variants that share it, instead of one span per variant. That makes count labels smaller than today, even with 18 variants.
- Budget check, kids.md acceptance criterion 30: initial JS plus `kids/index.json` under 400 KB gzipped. The index grows by 18 records and a 1-byte flag, so this is unaffected.

### 5.2 Records and the index
- `Rec.l?: 1` marks Yiddish; absent means English, which keeps the index small. `recIn(r, v)` passes `r.l ? "yi" : "en"`.
- `Rec.b` gains `2` = "Bubby Chaya Malka" (`BYLINE_NAMES[2]`).
- `cardHtml` adds `data-lang="yi"` and the "Yiddish" pill for `r.l`.
- `KItem.lang` is set from `kidLang(item)` in `pool.ts`. `Model.counts` gains `byLang: {en: {pool, show, story, short, event, song}, yi: {…}}`, and `m.pool` becomes both languages.

### 5.3 Similarity, three lists, English unchanged
- `sim` = `computeSimilar(englishPool)`: exactly today's run, so the `en` lists, the near-duplicate report and the build log don't change. Acceptance criterion 15 holds as written.
- `simAny` = `computeSimilar(englishPool ∪ yiddishPool)`. Its ranking is used for `any`. For English sources, cap Yiddish at 2 of the first 6, filling from the next English candidates. `simAny.nearDuplicates` are ignored: different languages are never "the same recording".
- `simYi` = the same combined run with a candidate filter (`isYiddish`). Every source, English or Yiddish, gets its top 6 Yiddish neighbours. This needs one optional parameter on the kids-owned `computeSimilar`: `opts?: { candidate?: (id) => boolean; keep?: number }`. The default behaviour is unchanged.
- The cross-language twin of an item shares its story group, so all three runs exclude it from "More like this". It has its own "Hear it in…" row instead.
- On the item page, one static row holds the union of the three lists. Each card's `vis` is computed per mode, with `capPerVariant(list_for_mode, 6)` restricted to that mode's variants, and then merged. A card that appears in two modes' lists is rendered once.

### 5.4 Story of the Day and Surprise Me
- `Rec.r` stays "position in the pool ordered by `sha256(id)`", now over both languages.
- The selection sorts the eligible records of the current variant by `r` and takes `pool[d mod len]`. Adding Yiddish ids changes the absolute numbers but **not the relative order of English items**, so **every English device picks the same story as today** on every date. A test pins this against today's picks over 400 days.
- The seasonal override applies within the variant, so in `yi` around Pesach it can pick Dayeinu.

### 5.5 State
- `state.ts`:
  - `getLang(): Lang` (validated; default `"en"`);
  - `setLang(l)`, which calls `applyVariant()` and emits the existing `"band"` topic, so every listener that re-renders on band changes re-renders on language changes too;
  - `getVariant()` composes all three axes.
- Storage key `lang` through the existing `createStore("kids")` gives `goldstein:kids:lang`, as the contract requires. It never throws, and the site works without storage, falling back to `en`.
- **Delegated click handler** in `app.ts`: `[data-set-lang="en|yi|any"]` anywhere on a page (panels, banners, empty states, the sheet, grown-ups) calls `S.setLang`, shows the toast and re-renders. That is one handler for every "Show English too" button.

---

## 6. Implementation plan (file by file)

Every file is in `apps/kids/` except the last, and each step keeps `npm run typecheck && npm test && npm run build` green.

| # | File | Change |
|---|---|---|
| 1 | `src/lib/kinds.ts` | `Lang`, `LANGS`, `DEFAULT_LANG = "en"`, `LANG_INFO` labels (§7.1). 18-value `Variant` template type and `VARIANTS`. `variantOf(band, gentle, lang)`, `variantBand`, `variantGentle`, `variantLang`, `withoutGentle`. `inVariant` and `variantsOf` take `itemLang`. `BYLINES` adds `bubby_chaya_malka`. |
| 2 | `src/lib/pool.ts` | Rule 2 is `primary ∈ {en, yi}` (reason `"language"` otherwise). Export `kidLang(it)`. |
| 3 | `src/lib/records.ts` | `Rec.l`, `Rec.b` adds 2, `BYLINE_NAMES[2]`. `cardHtml` adds the pill and `data-lang`. |
| 4 | `src/lib/similar.ts` | Optional `{candidate, keep}` on `computeSimilar`; the default path stays byte-identical. |
| 5 | `src/lib/build/model.ts` | `KItem.lang` and language-aware `vis`. `pool` covers both languages, plus `poolEn`/`poolYi` views. `counts.byLang`. `sim` (English), `simAny`, `simYi` (§5.3). `storyGroupOf` gains `twins: {en: id[], yi: id[]}` (kid-pool tellings in the other language, both directions, plus `same_story_other_language` relations) and `libraryYi: id[]` (Yiddish tellings outside the pool), replacing the boolean `yiddish`. `visibleIn` takes `min` as a number or a function. `toRec` sets `l`, `b = 2`. |
| 6 | `src/lib/tiles.ts` | `YI_TILE_MIN = 3`, `YI_SHELF_MIN = 1`. Helpers `tileMin(v)` / `shelfMin(v)`. |
| 7 | `src/lib/html.ts` | `vcount` emits one span per distinct count. |
| 8 | `src/lib/search.ts` | `SUGGESTIONS_YI`. |
| 9 | `src/lib/build/search-docs.ts` | Index the whole pool. Yiddish docs add the "Yiddish · Yidish · אידיש" tags and Bubby's byline; no new field. |
| 10 | `src/lib/sotd.ts`, `src/scripts/data.ts` | `recIn` / `inVariant` with the record's language. |
| 11 | `src/styles/global.css` | 18 variant rules. `.lang-pill`, `.lang-mark`, `.lang-panel`. `:lang(yi), :lang(he) { font-family: "Heebo", "Noto Sans Hebrew", "Arial Hebrew", system-ui, sans-serif; }` (system fonts only: **no new dependency**, no lockfile change). |
| 12 | `src/layouts/Base.astro` | The pre-paint script reads `lang` and `?lang` and sets `data-v`/`data-lang`. "Stories in…" row in the band sheet. Chip marker and accessible name. |
| 13 | `src/scripts/state.ts` | `getLang`/`setLang`; `getVariant` with the language; `applyVariant` sets `data-lang`. |
| 14 | `src/scripts/app.ts` | Sheet language buttons (no close), the delegated `[data-set-lang]` handler, toasts, chip label sync, `?lang` save plus `replaceState`. |
| 15 | `src/scripts/pages/home.ts` | Hide playlists and Quick Listens in `yi`. Hide the Story of the Day section on an empty pool. Coming-up shelves use the variant, which is already done via `recIn`. |
| 16 | `src/pages/index.astro` | Static shelf 7 (In Yiddish, `any`), shelves 7y, note card 13, link card 14 (§4.1), all through `data-vis`. |
| 17 | `src/pages/yiddish/index.astro` (new) | §4.5. |
| 18 | `src/pages/explore/index.astro`, `radio/index.astro`, `serials/index.astro`, `serial/[key]/index.astro`, `tonight/index.astro`, `stories/index.astro`, `quick/index.astro`, `src/components/TagPage.astro` | Yiddish button on Explore. `tileMin(v)`. `-y` panels and wrapped content (§4.3, §4.4). Language-aware empty-state copy. |
| 19 | `src/pages/listen/[id]/index.astro`, `src/pages/kids/item/[id].json.ts`, `src/scripts/pages/misc.ts`, `src/scripts/player-ui.ts` | Pill, `title_he`, byline, the "Hear it in…" rows, grown-ups lines, the transcript-link fix, the language banner, per-mode "More like this". `ItemExtra` gains `ra?` (any) and `ry?` (Yiddish), included only when different from `r`. The player's end-of-story suggestions pick the list by `S.getLang()`. |
| 20 | `src/scripts/pages/search.ts`, `src/pages/search/index.astro` | Language hint lines and buttons; suggestions by mode. |
| 21 | `src/pages/grown-ups/index.astro`, `misc.ts` `initGrownups` | Language card (§3.2), with buttons synced via `data-set-lang`. |
| 22 | `docs/sites/kids.md` | §1 table: Yiddish listeners are "partly served: 18 children's recordings; the rest in the library". §9 rule 2. §11 "Later": strike "Yiddish shelf". §12: replace "no Yiddish" with "no Yiddish transcripts, no adult Yiddish". §14: implementation notes (variant suffix, the `/yiddish/` event exception, `YI_TILE_MIN`). §15: amend criteria 1, 4 and 6 as in §6.1, and add §16 "Language", which points here. |

### 6.1 Tests (`apps/kids/test/`)
- **`lang.test.ts`** (new):
  - the 18 variants round-trip through `variantOf`/`variantBand`/`variantGentle`/`variantLang`;
  - `inVariant` truth table (band × gentle × preference × item language);
  - `en` tokens equal the old six exactly;
  - `global.css` has exactly one hide rule per variant;
  - the inline pre-paint script and `variantOf` agree for all 18 stored combinations (run the script's code from `Base.astro` under a fake `localStorage` and `location`, and compare `data-v`).
- **`catalog.test.ts`** (amend):
  - Criterion 1 becomes "the English pool is 1,033 (411/310/298/11/3) and the Yiddish pool is 18 (12 stories, 5 shorts, 1 event)". Per band: Little 13, Kids 15, Big 18; Gentle 10.
  - The existing per-tile pins filter to English, so they don't change.
  - New Yiddish pins: Big Kids `midos:trusting-hashem` 8, `holidays:pesach` 7, `mitzvos:tzedakah` 7.
  - Criterion 4 becomes: no shiur, family recording, fragment, adult-level, superseded or non-`en`/`yi` item is reachable, and **no Yiddish item is visible in any `en` variant**, checked through `vis`.
- **`similar.test.ts`** (amend):
  - `sim.related` equals `computeSimilar(englishPool)` exactly (the `en` lists are unchanged);
  - `simYi` lists hold only Yiddish ids;
  - `any` lists for English sources hold ≤ 2 Yiddish ids in the first 6;
  - no list contains the source's own twin or story-group member.
- **`sotd.test.ts`** (new): for 400 days from 2026-11-27, every English variant picks the same id as the pre-change rank order; recompute the old order in the test from the English pool's `sha256` order.
- **`shelves.test.ts`** (amend):
  - `yi` Home shelves meet `YI_SHELF_MIN`;
  - the Yiddish note card shows only in `-y`;
  - Quick Listens and playlists are hidden in `-y`;
  - capped shelves still cap at their size per variant across 18 variants.
- **`privacy.test.ts`** (amend):
  - no built page (`dist/`) contains "name unconfirmed" or "(working title)";
  - no Yiddish item page links to a person page;
  - `kids/index.json`, `kids/item/*.json` and `kids/search-index.json` contain no transcript text (assert that no `search/<id>.json` line of a Yiddish item appears in them);
  - the search index's field set is still exactly §6.5's.
- **`search.test.ts`** (new or in `catalog.test.ts`): "yiddish" and "אידיש" return all Yiddish ids; each `SUGGESTIONS_YI` chip returns ≥ 1 Yiddish result at Kids band; English queries in an `en` variant return no Yiddish id.
- **Manual checks before merge**, each in `en`, `yi` and `any`:
  - phone width 360 px, no horizontal scroll (top bar with the chip marker);
  - keyboard only through the sheet's two button groups;
  - VoiceOver/TalkBack reading "Yiddish / אידיש" (English, then Yiddish voice);
  - `?lang=yi` on a cold load: the first paint is already Yiddish, and the address bar loses `lang`;
  - localStorage disabled: `en`, no errors.
- `npm run privacy:gate -- apps/kids/dist` must pass unchanged.

---

## 7. Copy

Grade 2–3 reading level for children's surfaces. Grown-ups copy is plain adult English. Hebrew script appears only where marked, always `lang="yi" dir="rtl"`.

### 7.1 Labels (shared contract)
- English: "English"; sub "Most stories".
- Yiddish: "Yiddish / <span lang="yi" dir="rtl">אידיש</span>"; sub "{n} so far".
- Both: "Both"; sub "English and Yiddish".
- Sheet row heading: "Stories in…". Grown-ups card heading: "Language".
- Toasts: "Showing English stories" / "Showing Yiddish stories" / "Showing English and Yiddish stories".

### 7.2 Grown-ups card
> Almost everything here is in English. We also have {n} recordings in Yiddish for children: Bubby Chaya Malka's stories, a few more stories, and short lessons for Erev Pesach.
> **English** keeps Yiddish off the shelves. **Yiddish** shows only those. **Both** mixes them in. Age and Gentle settings still apply, and a direct link always opens.
> The Yiddish Tanya shiurim, the Haggadah shiurim and the longer family recordings are for grown-ups. You'll find them in the grown-ups' library ({SITES.library.name}).

### 7.3 Children's surfaces
- Home note card (`yi`): **"That's all in Yiddish for now."** "Everything else here is in English." [Show English too] [See all in Yiddish]
- Home link card (`en`): "Stories in Yiddish · <span lang="yi" dir="rtl">מעשיות אויף אידיש</span>"
- Explore panel (`yi`): "Only a few stories here are in Yiddish." [See all in Yiddish] [Show English too]
- Radio, Chapter Stories and Tonight panels (`yi`): "Uncle Yossi's radio show is in English." / "Chapter stories are in English." / "Tonight's playlists are in English." [Show English too] [Stories in Yiddish]
- `/yiddish/` banner (`en`): "These are in Yiddish. Want them on every shelf?" [Show Yiddish too] [Yiddish only]
- Item banners: "This one is in Yiddish." [Show Yiddish too] · "This one is in English." [Show English too]
- Item rows: "Hear it in Yiddish" · "Hear it in English". Grown-ups lines: "Also told in Yiddish: …" · "Also told in English: …" · "Listen in the grown-ups' library".
- Card pill: "Yiddish" (screen reader: "In Yiddish").

### 7.4 Empty states
- Grid page in `yi` with nothing in band: "No Yiddish stories here yet." [Stories in Yiddish] [Show English too]
- Search in `yi`, no Yiddish match: "No Yiddish stories for that. We found {n} in English." [Show English too], then the suggestion chips.
- Search in `en`, matches filtered out only by language: "{n} more in Yiddish." [Show Yiddish too]

No copy says "only 18". Counts are shown per band through `vcount`, so the number is always true for the viewer.

---

## 8. Accessibility and RTL
- The three language buttons are a `role="group"` labelled by the row heading, using `aria-pressed` buttons like the band options. Each is at least 64×56 px, with 12 px gaps, in one row at 360 px; they wrap to two rows below 340 px.
- Every Hebrew-script run is a `<span lang="yi" dir="rtl">`. The `dir` attribute isolates it, so the label "Yiddish / אידיש" doesn't reorder inside an LTR button.
- The accessible name starts with the English word, so speech-control users can say "Yiddish". Screen readers switch to a Yiddish or Hebrew voice for the span.
- Fonts: Baloo 2 and Atkinson Hyperlegible have no Hebrew glyphs. `:lang(yi)` and `:lang(he)` use a system Hebrew stack (§6 row 11), sized at least 18 px with `line-height: 1.3`. No webfont is added.
- Pills use `--ink` on `--sun` (contrast ≥ 7:1). They are never colour-only: the word is always there.
- Panels and banners are ordinary sections with an `h2`. Language changes re-render in place and announce through the existing toast (`aria-live="polite"`).
- The page stays `lang="en"`. All Yiddish items' displayed text is English metadata.

---

## 9. Rules this design keeps
- **Yiddish ASR text is never displayed.** The kids' site reads no transcript of any language and indexes none. Yiddish items show English metadata only.
- **Unconfirmed names:**
  - `yiddish_narrator_unconfirmed` never appears: there is no byline, and heroes skip unconfirmed entries, as today.
  - The label is never rendered, so it is never "presented as fact". If the owner wants it shown, it must be rendered verbatim and never linked.
- **Privacy:** no new field leaves `@goldstein/data/load`. The gate and its tests are unchanged and must pass on `apps/kids/dist`.
- **No shared-package change.** `@goldstein/player`'s `createStore` is used as is, `@goldstein/data` types already carry `language` and `title_he`, and the playlist engine stays English-only.

---

## 10. Open questions for the owner
1. **Haggadah shiurim (9 items, level `children`, 23–234 min):** keep them out of the kids' site (this plan, since they are lectures), or add them to `/yiddish/` as a "For the Seder" section?
2. **Bubby's long family recordings** (Parts 1 and 2, "Nine Tales Before Pesach"; 24–95 min): keep them out (this plan; most of their tales exist as separate items), or list them on `/yiddish/` under "Bubby's stories"?
3. **Discovery in English mode:** is a quiet "Stories in Yiddish" link on Home and Explore wanted for every visitor (this plan), or only on `/grown-ups`?
4. **Default:** this plan uses `en`. Confirm, or choose `any`.
5. **Library deep link:** the grown-ups card links to the library with `?lang=yi`. That depends on the library honouring the parameter on its browse page, which is the library team's design.

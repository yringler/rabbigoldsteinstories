# Language preference: library site

Status: design and implementation plan, 2026-11-27. Owner of this doc: the library team (`apps/library`). The shared contract is common to all three sites: values `en | yi | any`, store key `lang`, the `?lang=` parameter, and the labels "English", "Yiddish / אידיש" and "Both". This doc covers how the library applies it.

Binding rules:
- Yiddish ASR text is never displayed. It is used for search only.
- Unconfirmed names are rendered verbatim and never linked to a person page.
- The privacy gate must pass and is never weakened.
- Site code reads only `@goldstein/data/load`, never `data/`.

## 0. Summary

- **The library default is `any` ("Both").** That keeps today's behaviour exactly, and it keeps the Yiddish material visible: about 60 hours (§1), including the 39 Tanya shiurim, which are a core reason for an adult to visit. Bedtime (and probably kids) default to English because their current behaviour is English-only. The library has always shown both.
- **What exists today:** the Language facet on `/search`, a separate Yiddish Pagefind index, Yiddish hits rendered without an excerpt ("Match in the Yiddish recording at 15:28"), and the `search_only` notice on recording pages.
- **What is missing:**
  - There is no persisted preference.
  - Transcript search ignores the language filter. A Latin-letter query under `lang=yi` still downloads the English index and then shows nothing useful.
  - Topical lists (people, calendar, sources, places) cannot be narrowed to one language.
- **What this design adds:**
  1. A preference control in the header (also on `/help` and `/about`).
  2. On `/search`, the preference fills the Language facet when the URL has none. The URL is always the truth, so a copied link means the same thing to everyone.
  3. Transcript search respects the language filter, and explains when the query's script and the filter can't meet.
  4. Topical lists hide other-language rows under a one-language setting. This is CSS only, with a "N hidden · Show them" note, and a list is never left empty.
  5. Collection pages and single-recording pages are never filtered. They get "Also told in …" hints, and the home page gets a static "In Yiddish" card.

## 1. What the material is (measured)

Measured on `packages/data/generated/catalog.json` (`npm run data:build`, 2026-11-27). Only preferred copies are counted, since a superseded copy is never a separate result.

| Language | Recordings | Hours |
|---|---|---|
| English (`en`) | 1,044 | 333.0 |
| Yiddish (`yi`) | 73 | 60.1 |
| Hebrew (`he`) | 1 | 0.0 (a 25-second family fragment, *The Brachah Shehecheyanu*) |

The Yiddish recordings by series: `tanya_yiddish_goldstein` 39, `haggadah_yiddish` 13, `bubby_zaidy_stories` 12, no series 10. Of the 74 non-English rows, 72 are `search_only`, 6 have no transcript, and the Hebrew fragment has a labelled transcript.

**All of the Yiddish material suits this audience.** The audience is adults, teachers and researchers, so the family recordings and the Haggadah talks for children are included. The unconfirmed narrator (`yiddish_narrator_unconfirmed`) is shown with his label verbatim and never linked, exactly as today.

How the languages overlap in the topical indexes (number of terms whose recordings are in these languages):

| Index | en only | en + yi | yi only |
|---|---|---|---|
| People | 57 | 49 | 13 |
| Places | 128 | 15 | 7 |
| Sources cited | 8 | 22 | 3 |
| Calendar | 42 | 23 | 1 |
| Parsha | 27 | 2 | 0 |

## 2. The preference

- **Values and storage.** `en | yi | any`, through the existing `createStore("library")` under key `lang`, so localStorage holds `goldstein:library:lang` = `{"v":"yi"}`. Missing or invalid means `any`.
- **No flash.** An inline head script, next to the theme script, sets `html[data-lang-pref]` before first paint. On every ClientRouter swap, `astro:before-swap` copies it onto the new document, as the theme does.
- **`?lang=en|yi|any`** sets the preference on every page except `/search/`, and is then removed from the URL with `replaceState`. It is case-insensitive and trimmed. Any other value is ignored. On `/search/`, `lang` keeps its existing meaning as the facet (§3).
- **The control.** A `<details>` disclosure in the header, after the theme toggle. It is labelled "Language" with the current choice, and opens a radio group:
  - "English"
  - "Yiddish / <span lang="yi" dir="rtl">אידיש</span>": the Hebrew-script run always carries `lang="yi" dir="rtl"`.
  - "Both"

  Under the group: "Sets what lists and search show first. Recording pages always show everything." A change is announced in the live region ("Language setting: English"). The same control (`LangControl.astro`) appears inline on `/help` and `/about`, each instance with its own radio-group name.
- **Without JavaScript**, the control shows "Both" and the site behaves as it does today.

## 3. `/search`

- **The URL is the truth.** `lang` stays the per-search facet (`lang=yi`, `lang.not=en`, …). A new value, `lang=any`, means "no language filter, on purpose", so the preference is not applied.
- **When the URL has no `lang`** and the preference is `en` or `yi`, the preference fills the facet (`lang=<pref>`) and is written into the URL with `replaceState`. A copied link therefore carries the filter (Copy link keeps it).
- **The chip** for a facet that equals the preference reads "Language: English (your setting)". Removing it, or clearing all, writes `lang=any` (only when the preference is not `any`), so a reload doesn't bring the filter back.
- **"Make this my setting"** is a quiet button in the active bar. It appears when the search's language (one value, or none) differs from the stored preference. It stores the preference and announces it.
- **"Also N in Yiddish · Show"** (or English, or "in other languages") is a line under the count. It appears when exactly one language is selected and the disjunctive facet count shows matches in the others. "Show" writes `lang=any`.
- **The facet panel stays as it is**: "Language" with English, Yiddish and Hebrew, and their counts.
- **When the preference changes on `/search`**, and the current filter was the old preference (or absent), the filter follows the new preference (`replaceState`).

### 3.1 Transcript search and the language filter

The new `transcriptLangs(q, sel)` intersects the query's script with the language filter:
- The query's index is `yi` if it has Hebrew-script letters, else `en`.
- It is searched only if the filter allows that language: `sel.any` is empty or contains it, and `sel.not` doesn't contain it.

When the filter and the script don't meet, no index is downloaded, and the status line explains why:
- Hebrew letters under English: "Words in Hebrew letters search the Yiddish recordings, but the language filter is English, so no transcripts were searched. Titles and summaries were."
- Latin letters under Yiddish: "Words in English letters search the English transcripts, but the language filter is Yiddish, so no transcripts were searched. Type Yiddish words in Hebrew letters (for example אמונה)."

Spec §5.3 said "the Search in control can force both". That is dropped as useless: one query string is either Hebrew-script or Latin, and the other index never matches it. The engine still accepts several languages, for a later transliteration table (Q4).

## 4. Topical lists: hide, don't remove

These pages are narrowed: `/people/`, `/people/<id>/`, `/calendar/<id>/`, `/sources/<work>/`, `/places/`, `/parsha/`, `/stories/` (the index), and the midos, mitzvos and topics term lists.

- **At build time**, a single recording row gets `data-lang="<primary>"`. An aggregate row (a person, a place, a story group) gets `data-lang-has="en yi"`: the languages of its recordings. A section gets the union of its rows.
- **CSS hides** a row inside a `[data-lang-scope]` when `html[data-lang-pref]` is `en` or `yi` and the row doesn't carry it. Nothing is removed from the HTML, so search engines, no-JS readers and print see everything.
- **The note.** `LangNote.astro` renders a static line per preference, and CSS shows the matching one: "12 Yiddish recordings are hidden by your language setting (English). [Show them]". "Show them" sets `data-lang-reveal` on the scope (and becomes "Hide them"). It applies to that page only and changes no setting.
- **Never empty.** If a scope has nothing in the preferred language, it gets `data-lang-empty="en"` and isn't filtered. The note then says "Nothing here is in English; showing all languages." This is the case for the 13 Yiddish-only people pages and the 3 Yiddish-only sources.
- **Counts beside terms stay totals.** The note gives the hidden number.
- The Hebrew fragment shows only under "Both" (Q3).

## 5. Pages that are never filtered

Series, study, serials, radio, the story-group pages (`/stories/<group>/`), recording pages, playlists and tonight. A collection is a whole, and hiding half of a story group would misrepresent it.
- **Recording pages** get a hint line under the date line when another telling exists in a different language (from story groups and `same_story_other_language` relations): "Also told in English: *Title*" (at most two links, then "and N more" linking to the story group).
- **The home page** gets a fourth entry card, "In Yiddish": "39 Tanya shiurim, Bubby Chaya Malka's stories, Haggadah talks: 73 recordings, 60 hours". It links to `/search/?lang=yi`. The grid becomes two by two.

## 6. Accessibility and RTL

- Every Hebrew-script run carries `lang="yi" dir="rtl"` and uses Frank Ruhl Libre (the existing `:lang(yi)` / `[dir=rtl]` rules).
- The control is a `<details>` with a real `<fieldset>`/`<legend>` and radios: keyboard and screen reader behaviour comes for free. Its summary has an accessible name ("Language: Both").
- The hidden-rows note is in the reading order before the list. "Show them" is a `<button>` with `aria-pressed`.
- The changes are announced through the existing polite live region.
- Hidden rows use `display: none`, so they are out of the tab order as well.

## 7. File-by-file plan

| File | Change |
|---|---|
| `src/lib/lang.ts` (new) | Types, labels, parse, `?lang=` helpers, `transcriptLangs`, `prefFacet`, the search-state helpers (`withPrefParam`, `langChipIsPref`, `searchLangPref`, `otherLangCount`), and the build-time helpers (`langHas`, `scopeInfo`) |
| `src/lib/facets.ts` | `SearchState.langAny`; `lang=any` parsed and written |
| `src/lib/site-data.ts` | `usageLangs(list)`: the languages of each term's recordings (build time) |
| `src/scripts/core.ts` | `langPref()` / `setLangPref()` (store, `html[data-lang-pref]`, `gsl:lang` event) |
| `src/lib/icons.ts` | `lang` icon (speech bubble, no crossing strokes) |
| `src/components/LangControl.astro` (new) | The disclosure and radio group |
| `src/components/LangNote.astro` (new) | The static hidden-rows note |
| `src/components/RecRow.astro` | `data-lang` on the row |
| `src/components/TermIndex.astro` | A scope, `data-lang-has` on terms, the note |
| `src/layouts/Base.astro` | Inline head script, the header control |
| `src/styles/global.css` | Control, note and hide rules |
| `src/scripts/app.ts` | Binding the control, `?lang=` on page load, the swap hook, reveal buttons |
| `src/scripts/search-page.ts` | Preference to facet, chip, "Make this my setting", "Also N", `transcriptLangs` |
| `src/pages/search/index.astro` | The "also" line host |
| `src/pages/people/[id]`, `people/index`, `calendar/[id]`, `sources/[work]`, `stories/index`, `places/index`, `parsha/index` | Scope, attributes, note |
| `src/pages/r/[id]/index.astro` | "Also told in …" hint |
| `src/pages/index.astro` | "In Yiddish" card |
| `src/pages/help/index.astro`, `about/index.astro` | The control and a short explanation |
| `test/lang.test.ts` (new) | Pure helpers |
| `test/facets.test.ts` | `lang=any` round trip |
| `test/lang-data.test.ts` (new) | Counts and scopes against the generated dataset |
| `test/dist-lang.test.ts` (new) | Built pages (runs when `dist/` exists) |
| `docs/sites/library.md` | §4.2 and §5.3 updated, §17 criteria 29–33 |

There are no shared package changes. A shared `LANG_KEY`/`LangPref` in `packages/player/src/prefs.ts`, next to `AI_AUDIO_KEY`, would be a nicety for the foundation team. Each site keeps its own copy in `lib/lang.ts`, as bedtime does.

## 8. Acceptance criteria (added to library.md §17)

29. With no stored setting, every page behaves exactly as before (`any`). With `en` or `yi` stored, the first paint already has `html[data-lang-pref]`, so nothing flashes. `?lang=` on any page except `/search/` sets the preference and leaves the URL.
30. `/search` with no `lang` in the URL and setting `yi` shows `lang=yi` in the URL and a "(your setting)" chip. Removing the chip writes `lang=any`, and a reload keeps all languages. A copied link reproduces the same results in a browser with another setting.
31. A Hebrew-letter query under `lang=en`, or a Latin query under `lang=yi`, downloads no Pagefind index and shows the explanation. A Hebrew-letter query under `lang=yi` or no filter searches only `/pagefind/yi/`.
32. Under `en`, `/people/` hides the 13 Yiddish-only people and says so, with "Show them". A Yiddish-only person's page is not emptied. Under `any`, nothing is hidden. Recording, series, study and story-group pages are identical under all three settings.
33. Every Hebrew-script run in the control carries `lang="yi" dir="rtl"`. No Yiddish transcript text appears anywhere in `dist/` outside the Pagefind bundle. The unconfirmed narrator is never linked.

## 9. Open questions for the owner

- **Q1.** Default "Both" on the library while bedtime (and probably kids) default to English: agree?
- **Q2.** Under the "English" setting, should topical pages (people, calendar, sources cited) hide Yiddish rows behind a "N hidden · Show them" note, as planned, or only label them and never hide?
- **Q3.** The single Hebrew item (*The Brachah Shehecheyanu*, a 25-second family fragment) shows only under "Both". Should "Yiddish" mean "not English" instead, and include it?
- **Q4 (later).** Should Latin-letter queries also search the Yiddish transcripts through a reviewed transliteration table (for example *emunah* to the Hebrew-script spelling)?

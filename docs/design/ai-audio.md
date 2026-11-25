# AI-improved sound: design spec

Status: design for implementation, 2026-11-25. Owner of this doc: design. Implementers: foundation (shared/data, player, API), bedtime, kids, library. Home has no change (§3.4).

## 0. The feature in one paragraph

Every recording has been run through Sidon (`sarulab-speech/sidon-v0.1`, University of Tokyo, MIT license), an open-source speech-restoration model. It removes hiss and noise and resynthesizes the voice at 48 kHz. It rebuilds the voice rather than filtering it. Speech is usually much clearer, but a voice can sound slightly synthetic, singing, music and jingles can come out garbled, and very poor passages can be misheard. The originals are never edited (DECISIONS 1, binding). The cleaned copies are separate files:

- original: `https://storiesmedia.torahlearningtools.com/goldstein/audio/<path>.mp3` (`media.url`)
- cleaned: the same host and path under `goldstein/audio_clean/` instead of `goldstein/audio/`. The duration is identical, so content bounds, spans, chapter ticks, transcript timestamps, `?t=` links and resume positions carry over unchanged.

Listeners can opt in to the cleaned copy. A cleaned copy may be missing for some items while the job runs, or because of an upload gap. When it is missing, the site plays the original and says nothing about it.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Off by default, everywhere.** | The owner asked for opt-in. The originals are what the archive promises ("as they were"), and the model has failure modes (songs, synthetic timbre) that a listener should choose to accept. Whether bedtime should default to on after a listening trial is open question Q1, not decided here. |
| D2 | **One setting per site, stored in that site's localStorage** (`createStore("<site>")`, key `ai-audio.v1`, so `goldstein:bedtime:ai-audio.v1` and so on). Not shared across sites. | (a) A shared setting needs a cookie on `.torahlearningtools.com`. That cookie would be readable by, and sent to, every host on a zone shared with unrelated projects (True Books, emunas, ...), and to the media host on every audio range request. (b) Bedtime and kids both promise "No cookies" in their copy. A cookie, even a harmless functional one, would make that untrue or need a caveat. (c) The audiences rarely share a browser: a parent's phone at bedtime and a researcher's desktop. They may also want different answers: the parent wants less hiss, the researcher wants the source. (d) It matches the architecture: every existing preference (speed, theme, wake, band) is per site through `createStore`, and the sites are static with no server state. Each site's explanation says that the other sites have their own switch. |
| D3 | **Same label on every site: "AI-improved sound".** Each site's voice decides where the label goes and how it is explained. | One name a listener can recognise across sites. "AI" is in the label because it is honest about the change. "Sound" is plain English for parents; the library also uses it, so the three sites stay consistent. |
| D4 | **Placement follows each site's audience** (details in §3): bedtime has a switch in the player sheet next to "Keep screen on". Kids has a switch on `/grown-ups` only, never in the child's path. Library has a "Sound" selector in the persistent player bar plus the `s` key, which also serves as the A/B compare. | Bedtime parents set things in the sheet, at night. Kids' settings belong to grown-ups, like the age band and Gentle. Researchers need to compare, and a control that switches live at the same position *is* the A/B, so a separate per-recording compare mode isn't needed. |
| D5 | **Toggling during playback switches the source live, at the same position, keeping play/pause state.** | Identical durations make it a seamless swap. On the library it is the A/B, and on bedtime/kids it gives immediate feedback. |
| D6 | **Data: an explicit optional `clean_url` in the public dataset, built from a committed manifest of the cleaned copies.** Compact client indexes may carry a flag and derive the URL with one shared helper. | An item gets a URL only if the cleaned copy is known to exist, so a 404 is unlikely and the build is the single source of truth. A runtime 404 still falls back (D7). |
| D7 | **Fallback: if the cleaned copy fails to load, play the original from the same position, silently, for the rest of the visit.** The library alone shows a one-line note (§3.3). Not counted as a track failure. | The owner asked for a silent fallback. The library's users want to know which version they are hearing. |
| D8 | **Media Session, resume keys, queues, citations, share links and "original" downloads don't change.** Only the `src` the player assigns changes. | Resume is keyed `pos:<id>@<start>` (Player), kids progress by id, bedtime by snapshot index and position, library playlists by rec id: none of them contain the URL. |

## 2. Data contract (foundation: `tools/`, `packages/data`, `packages/playlists`, `workers/api`)

### 2.1 Input
- `_sidon/publish_clean.py` already writes `_r2/r2_clean_manifest.csv` (`id,key,size,etag`; UTF-8 with BOM), like `r2_manifest.csv`.
- `tools/export_repo.py`: copy it to **`data/catalog/r2_clean_manifest.csv`** next to `r2_manifest.csv`, with one more `cp(...)` line. Do not add anything to `.meta.json`, so there is no schema or validator change.
- Re-export and rebuild as the job progresses. Each item gets its cleaned copy as soon as the manifest lists it.

### 2.2 Build (`packages/data/src/build/*`)
- Read the CSV if it exists. If it is missing, there are no clean URLs and nothing fails. Include the file in `inputFingerprint` so `data:ensure` rebuilds when it changes.
- For each public item: if the manifest has its id **and** the manifest key equals `media.r2_key` with the prefix `goldstein/audio/` replaced by `goldstein/audio_clean/`, set the clean URL. Build it with the shared helper below, applied to `media.url`, so it is percent-encoded exactly like the original. On a key mismatch, log `id` and skip that item (no URL). Don't fail the build.
- Shared helper, browser-safe, exported from `@goldstein/data` (`src/paths.ts` or `src/index.ts`):
  ```ts
  /** Cleaned-copy URL for an original audio URL (same host, goldstein/audio/ → goldstein/audio_clean/). */
  export function cleanUrlOf(url: string): string // replaces the first "/goldstein/audio/" path segment only
  ```
  Unit test it with a percent-encoded path containing an apostrophe, a comma and spaces (the Tanya shiur paths do).

### 2.3 Public types (`packages/data/src/types.ts`)
- `PublicMedia`: add `clean_url?: string` and `clean_size_bytes?: number` (from the manifest `size`; used for the library's download label).
- `CatalogEntry`: add `clean_url?: string`.
- `UnitTrack`: add `clean_audio_url?: string`.
- `Manifest.counts`: add `clean_audio: number` (items with a clean URL). Sites render their control only when this is > 0 (read at build time), so nothing appears before the data does.
- `transform.ts`: `media` is already exempt from text scrubbing ("Media url and ids are not free text"). Keep `clean_url` inside `media` so the exemption covers it. The path is the original's path under a different prefix, so the gate sees nothing new. Run the gate anyway.
- Use `opt(...)` so the fields are absent, never `undefined` (`exactOptionalPropertyTypes`).

### 2.4 Playlists (`packages/playlists`, `workers/api`)
- `PlaylistItem` (`contract.ts`): add `clean_audio_url?: string`. `engine.ts` (~line 154) copies it from the `UnitTrack` when present.
- **Frozen editions** in KV have no such field. `workers/api` already matches every served item against its unit's *current* tracks (the tombstone pass). When the matching current track has `clean_audio_url`, copy it onto the served item. Served editions then pick up cleaned copies at once, and stored editions stay an exact record. No `RECIPE_VERSION` bump. The pool hash changes, so unfrozen future editions regenerate; selection is seeded per edition and type, so the picks don't change.

### 2.5 Player (`packages/player/src/player.ts`, `storage.ts`)
- `Track`: add `clean_url?: string`. `url` stays the original and stays the track's identity (`setQueue` keeps comparing `url`).
- `PlayerOptions`: add `preferClean?: boolean` (default false).
- New public API:
  ```ts
  setPreferClean(on: boolean): void   // stores the flag; if the current track's chosen src changes, swap live (below)
  get source(): "original" | "clean" | null  // what is actually playing; null with no track
  ```
  Add `source` to `PlayerState` too, so UIs can show the indicator from `subscribe()`.
- `srcFor(t)` = `preferClean && t.clean_url && !failedClean.has(t.id) ? t.clean_url : t.url`. `goTo` assigns `srcFor(t)` instead of `t.url`.
- **Live swap** (`setPreferClean` while a track is loaded):
  1. Save `at = audio.currentTime` and `wasPlaying = !audio.paused`, then call `savePosition()`.
  2. Set `swapping = true` (exposed as `player.isSwapping`), set `audio.src = new`, then `audio.currentTime = at`, the same deferred-seek pattern `goTo` uses.
  3. If `wasPlaying`, call `play()`. Clear `swapping` on the first `playing` or `loadedmetadata` event, or after 5 s.
  4. Emit. Media Session metadata is not re-set (nothing in it changed).
  Sites must ignore `pause`/`play`/`waiting` events while `isSwapping` is true. That means no sleep-timer freeze, no "paused" phase, and no watchdog.
- **Fallback**: Player registers its `error` listener in the constructor, before any site listener (bedtime's `super()` runs first; kids and library create the Player before adding theirs). On `error`, if the current `src` is the track's `clean_url`:
  1. Add the id to the in-memory `failedClean` set (not persisted: the job will finish, and a network blip shouldn't stick).
  2. Swap to `t.url` at the same position (same steps as the live swap), keeping the play state.
  3. Call `event.stopImmediatePropagation()` so site error handlers (bedtime's 8 s skip, kids' "isn't working" card, the library's message) never see it.
  4. Emit, with `source` now `"original"`.
  Widen `AudioLike.addEventListener` to `(type: string, fn: (e: Event) => void)` for this.
  A failure of the *original* is unchanged and reaches the site handlers as before.
- Preference helper, in `storage.ts` or a small `prefs.ts`, so all three sites share the key name:
  ```ts
  export const AI_AUDIO_KEY = "ai-audio.v1";
  export const getAiAudio = (s: Store): boolean => s.get<boolean>(AI_AUDIO_KEY, false) === true;
  export const setAiAudio = (s: Store, on: boolean): void => s.set(AI_AUDIO_KEY, on);
  ```
- Tests (`packages/player/test`, fake audio):
  - `goTo` picks clean only when preferred and present;
  - the live swap keeps the position and play state and doesn't touch `pos:` keys;
  - an error on clean falls back once and stops propagation;
  - an error on the original propagates;
  - `setQueue` with the same tracks does not reload after a swap.

## 3. Per-site placement, behaviour and copy

The playback rate is reset by a `src` change only when `defaultPlaybackRate` isn't set. Kids and library already set both, so nothing is needed; check it after the swap.

### 3.1 Bedtime (`apps/bedtime`)

**Control:** a second switch in the player sheet's `.settings`, directly under "Keep screen on", same markup and style (`apps/bedtime/src/layouts/Base.astro`, around line 183):

```
[ ] AI-improved sound
    Less tape hiss. Voices can sound a little different.
```

- `<label class="switch"><input type="checkbox" data-ai-audio /> AI-improved sound</label>`, followed by the hint as a `<small class="setting-hint">` inside the label (so the whole row is the tap target, at least 48 px). Render it only if `manifest.counts.clean_audio > 0`.
- `apps/bedtime/src/lib/session.ts`: no new key constant needed (use `AI_AUDIO_KEY` from `@goldstein/player`).
- `apps/bedtime/src/scripts/sheet.ts` (next to the wake setting, ~line 141): init `checked` from `getAiAudio(store)`. On change: call `setAiAudio`, then `player.setPreferClean(checked)`.
- `apps/bedtime/src/scripts/bedtime-player.ts`:
  - construct with `preferClean: getAiAudio(store)`.
  - In `toTracks` (~line 333), when `i.clean_audio_url` is present, add `clean_url: \`${i.clean_audio_url}#t=${i.start_sec},${i.end_sec}\`` (the same media fragment as `url`; spread it conditionally).
  - In the `pause`/`play`/`waiting` handlers and `armWatchdog`, return early while `this.isSwapping`.
  - The session snapshot is unchanged (it stores playlist items; old snapshots without `clean_audio_url` just play originals).
- No discovery hint, no badge, nothing on the night screen. The switch in the sheet is the indicator. Bedtime's UI stays minimal.
- Earlier-this-week and deep-link playlists go through the same `toTracks`.
- `apps/bedtime/src/pages/about.astro`: replace "The recordings" paragraph with:

> These are 1980s radio broadcasts and family tapes, as they were. Nothing is cut or changed, so you may hear a song, a little hiss, or a radio station's sound.
>
> If the hiss bothers you, turn on **AI-improved sound** in the player. A computer program has rebuilt the voices from each tape so they come through clearer. Voices can sound a little different, and songs may come out oddly. The original tapes are kept as they were; switch it off to hear them. The setting stays on this phone, for this site only.

(The page has a 250-word target in bedtime.md §2.4. If it runs over, shorten "At bedtime", not this.)

### 3.2 Kids (`apps/kids`)

**Control:** grown-ups only, on `/grown-ups`. A new card **"Sound"** between "About these recordings" and "Privacy" (`apps/kids/src/pages/grown-ups/index.astro`), using the existing `.gu-card` and `label.switch` markup of the Gentle switch:

> ## Sound
> These are old tapes, and some have hiss and crackle. **AI-improved sound** plays a copy cleaned up by a computer program, which rebuilds the voices so they are clearer. It can make a voice sound a little unnatural, and songs and music may come out muddled. The original recordings are kept unchanged. Turn this off to hear them.
>
> [switch] AI-improved sound *(clearer voices, less tape hiss)*
>
> *Saved in this browser only, for this site. The bedtime site and the library each have their own switch.*

- Switch: `<input type="checkbox" data-ai-audio />`, initialised and saved in the `grownups` page init (`apps/kids/src/scripts/pages/misc.ts` or wherever `data-gentle` is wired). On change: call `setAiAudio(store, on)` and `player.setPreferClean(on)`. The player is persistent, so a story already playing switches live.
- `apps/kids/src/scripts/state.ts`: re-export `getAiAudio`/`setAiAudio` bound to `store`, like `getGentle`.
- Privacy card: change "Hearts, listening progress and the age setting stay in this browser only." to "Hearts, listening progress, the age setting and the sound setting stay in this browser only."
- **Tracks:** the compact `Rec` (`apps/kids/src/lib/records.ts`, built in `lib/build/model.ts` ~line 534) gets `c?: 1` when `clean_url` exists. In `lib/tracks.ts`, add `clean?: boolean` to `ItemLike`; `itemTrack` sets `clean_url: cleanUrlOf(i.url)` when it is true; `recTrack` passes `clean: r.c === 1`. Playlist tracks (`scripts/pages/playlists.ts`) use `PlaylistItem.clean_audio_url` directly. Server-rendered `data-play` JSON (`lib/build/views.ts` `trackOf`) includes `clean_url`. Saved queues from before the change have no `clean_url` and play originals. That's acceptable; don't migrate.
- `apps/kids/src/scripts/player-ui.ts`: construct with `preferClean: getAiAudio()`. Ignore transient events while `isSwapping`.
- **Indicator**: a small, non-interactive label in the sheet's top row, after `[data-p-source]`: `<span class="ps-ai" data-p-ai hidden>AI-improved sound</span>`. Show it when `state.source === "clean"`. Style: 14 px, `--paper` text at 75% on `--night`, pill outline, no icon (no sparkles; DECISIONS artwork rule). Nothing in the mini-player.
- No control and no hint in the child's path (no toggle in the sheet, no banner).

### 3.3 Library (`apps/library`)

**Control and A/B:** a **"Sound"** selector in the persistent player bar's `.player-extra`, before the speed select (`apps/library/src/layouts/Base.astro`, ~line 292), in the same pattern as speed:

```html
<label class="visually-hidden" for="p-sound">Sound</label>
<select id="p-sound" data-p-sound title="Original tape or AI-improved copy (s)">
  <option value="original">Original</option>
  <option value="clean">AI-improved</option>
</select>
```

- Render it only if `manifest.counts.clean_audio > 0`. On change: call `setAiAudio(store, v === "clean")` and `player().setPreferClean(...)`. The choice is sticky (it is the preference), and switching mid-play swaps live at the same position: that is the A/B.
- **Keyboard:** `s` toggles the selector (free key; `a` is taken). Add it to the shortcut table in the shortcuts dialog (`Base.astro` ~line 400) and on `/help`: "`s` Switch between the original and the AI-improved sound". It respects "Turn off single-key shortcuts". After a toggle, announce through the live region: "Playing the AI-improved sound." / "Playing the original."
- **When the current track has no cleaned copy, or fell back:** keep the selector's value (it is the preference) and show the existing `[data-p-msg]` line: "No AI-improved copy of this recording yet; playing the original." Hide it on the next track change. This replaces the silent fallback on this site only (D7). Drive it from `state.source !== "clean"` while the preference is on and a track is loaded.
- `apps/library/src/scripts/app.ts` (~line 69) / `core.ts`: construct the Player with `preferClean: getAiAudio(store)`. The existing error handler (~line 78) never sees clean-copy errors (stopped in the Player). Its "Open the MP3 directly" link keeps pointing at `t.url`, the original.
- **Tracks:** `LibRow` (`lib/types.ts`) gets `clean?: 1` (set in `lib/site-data.ts` ~line 131). `lib/tracks.ts` `trackOf` adds `clean_url: cleanUrlOf(r.url)` when set.
- **Recording page** (`apps/library/src/pages/r/[id]/index.astro`):
  - Downloads: keep "Download MP3 (size)" for the original as the primary download. When `media.clean_url` exists, add a quiet link right after it: `AI-improved MP3 (size)`, using `clean_size_bytes`. Default yes; see Q3.
  - Discovery line under the actions bar, only when the item has a clean URL and the preference is off (toggled client-side; render it `hidden` and reveal it in `recording.ts`): *"Hard to hear? Try the AI-improved sound in the player bar (press s)."* `small muted`, no dismiss.
- **About** (`apps/library/src/pages/about/index.astro`, "How the archive was made"): add a paragraph after the first one:

> Every recording also has an **AI-improved copy**, made with Sidon, an open-source speech-restoration model from the University of Tokyo (<a href="https://huggingface.co/sarulab-speech/sidon-v0.1">sarulab-speech/sidon-v0.1</a>). The model removes hiss and noise and rebuilds the voice. It does not filter the old sound; it generates new sound from it. Speech usually comes through much clearer, but a voice can sound slightly synthetic, singing and music can come out garbled, and on the poorest tapes it can mishear words. The original recordings are kept unchanged and remain the default and the reference: transcripts, timestamps and citations refer to them, and the two copies line up to the second. Choose "Original" or "AI-improved" under Sound in the player bar.

- **Help** (`apps/library/src/pages/help/index.astro`): a new section after "Keyboard shortcuts", `<h2 id="sound">Sound: original and AI-improved</h2>`:

> The player plays the original tape by default. Under **Sound** in the player bar you can switch to an **AI-improved** copy, cleaned by a speech-restoration model: less hiss, clearer voices, but sometimes a slightly synthetic voice, and songs or music may be garbled. Switching keeps your place, so you can compare the two by switching back and forth (shortcut: `s`). The setting is remembered in this browser, for this site only. Both copies have the same length, so timestamps, transcript links and citations work with either. Some recordings may not have an AI-improved copy yet; for those the original plays and the player says so. The AI-improved files are about a third larger.

- **Data download** (`lib/export.ts`, `/data/`): add an optional `clean_audio_url` column at the end of the CSV and an optional `clean_audio_url` property in the JSON and in `schemas/recording-1.json`. These are additive, so the schema version stays the same. Citations (`lib/citation.ts`) keep the original.

### 3.4 Home (`apps/home`)

No change. Home has no player and no settings, and the setting is per site (D2), so there is nothing to switch there. Each site explains it where its listeners already look.

## 4. Behaviour rules (all sites)

1. Default off. The preference is read once at Player construction and re-applied only on user change; a change in another tab takes effect on next load. No `storage`-event sync.
2. Off → every `src` is the original, byte-for-byte the same behaviour as today.
3. On → each track plays `clean_url` if it has one, otherwise the original. Mixed queues are fine.
4. A toggle while playing swaps at the same position and keeps the play/pause state. Sleep timers, "stop after this story", the bedtime watchdog and the failure counter are unaffected.
5. A clean-copy load error falls back to the original at the same position. The id stays on the original for the rest of the visit. The site's error UI is never shown for it (the library shows its one-line note instead).
6. Resume positions (`pos:<id>@<start>`), kids progress, bedtime snapshots, library playlists and share links don't contain the clean URL and don't change.
7. Media Session metadata, artwork and position state are identical for both copies. Lock-screen titles get no "AI" suffix.
8. Content bounds, spans, chapter ticks, `?t=` deep links and transcript sync use the same seconds for both copies.
9. Analytics: none (the sites have none). Don't log the choice.

## 5. Acceptance checklist

Foundation
- [ ] `data/catalog/r2_clean_manifest.csv` is exported. The build emits `media.clean_url`/`clean_size_bytes`, `CatalogEntry.clean_url` and `UnitTrack.clean_audio_url` only for listed ids whose key matches. A missing CSV gives zero clean URLs and a green build.
- [ ] `cleanUrlOf` is unit-tested on percent-encoded paths. Build-time URLs equal `cleanUrlOf(media.url)`.
- [ ] `manifest.counts.clean_audio` is correct. The privacy gate passes on `generated/` and every `dist/`.
- [ ] New editions carry `clean_audio_url`. A frozen KV edition served by the API carries it too (read-time enrichment), and the stored copy is unchanged.
- [ ] Player tests from §2.5 pass. `npm ci && npm run typecheck && npm test && npm run build` is green.

Every site
- [ ] Fresh browser: the control is off and all audio requests go to `/goldstein/audio/`.
- [ ] Turn it on mid-story: within about a second the same words continue from the same place, now from `/goldstein/audio_clean/`, still playing (or still paused if it was paused).
- [ ] Turn it off: back to the original at the same place.
- [ ] Reload: the preference persists (`goldstein:<site>:ai-audio.v1`). The other two sites are unaffected.
- [ ] Make one clean URL 404 (e.g. override `clean_url` in devtools): playback continues on the original from the same place, with no error UI, no skip, and no failure counted.
- [ ] A resume position saved while on the clean copy resumes correctly with the original, and vice versa.
- [ ] Lock-screen controls and metadata are unchanged. With no storage (private mode), the toggle works for the visit.

Bedtime
- [ ] The switch sits under "Keep screen on" with its hint line. Toggling during a story doesn't freeze the sleep timer or show "paused", and the 8 s watchdog never skips the story.
- [ ] Span tracks keep their `#t=` fragment on the clean URL. A Radio Night whole episode and a story span both switch correctly.
- [ ] About page copy is updated.

Kids
- [ ] No control anywhere a child browses. `/grown-ups` has the Sound card and switch, and the privacy line is updated.
- [ ] Toggling on `/grown-ups` while a story plays (persistent player) switches it live. The "AI-improved sound" label shows in the sheet only while the clean copy is playing.
- [ ] Tracks from shelves, item pages, serials and playlists all carry `clean_url` when available. Old saved queues still play.

Library
- [ ] The Sound select is in the player bar, and `s` toggles it (listed in the shortcuts dialog and `/help`, off when shortcuts are off). The live-region announcement works.
- [ ] Preference on with an item that has no clean copy: the note "No AI-improved copy of this recording yet; playing the original." shows.
- [ ] Recording page: "AI-improved MP3 (size)" link appears when available. The discovery line shows only when the preference is off.
- [ ] About and help copy are added. The CSV/JSON export and schema have the optional `clean_audio_url`. Citations are unchanged.

## 6. Open questions for the owner

- **Q1. Default for bedtime.** Off everywhere, as you asked. After you have listened to a few bedtime playlists with it on, would you want bedtime (only) to default to on? It is a one-line change. Kids and library would stay off.
- **Q2. Naming the model publicly.** The library's about page names Sidon and links to its model page, for honesty and credit. Bedtime and kids say only "a computer program". OK, or should the model's name stay off the sites?
- **Q3. Offering the AI copy as a download.** The library would offer "AI-improved MP3" next to the original download, and as a column in the data export. Default: yes (the files are already public on the media host). Say no if you'd rather the AI copy were listen-only.

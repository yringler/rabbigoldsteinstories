# Decisions on the metadata proposal

> `vocabularies.json` has hand edits that come from these decisions (the speaker merge, unconfirmed placeholders). It is now the source of truth. Don't regenerate it with `scripts/build_vocab.py` without re-applying the edits.

Answers to the open questions in SCHEMA_PROPOSAL.md §7, as the user gives them. Apply these to the schema and the pass-1 prompt before the pilot.

## 1. Children's names, addresses and sick lists on air (decided 2026-11-25)
- **Audio is never edited.** No bleeping or trimming for privacy; the broadcasts stay as they were.
- **Capture the details in a hidden metadata block** that is stored but never published:
  - `hidden.on_air_people[]`: name as heard, role (shema_guest, birthday, mailbox_letter, refuah_list, contest_winner, visitor, other), group or school if given, start/end seconds.
  - `hidden.addresses[]`: text as heard, start/end seconds.
  - `hidden.other_personal[]`: anything else personal (phone numbers, family details), with timestamps.
- `audience.privacy` flags stay, as internal markers that point into `hidden`.
- The website build must exclude the whole `hidden` block (and `source`, `quality`, `provenance`, `proposed_new_terms`) from anything public, including the search index.
- This replaces the proposal's line "names of visiting children: deliberately left out".

## 2. Private family recordings (decided 2026-11-25)
- **Keep them in and publish them like everything else.** The user is 99% sure it's fine.
- Flag them so the user can double-check (and possibly send them to the family): set `audience.privacy` to include `private_family`, and keep a note of who is speaking or mentioned, if said.
- After pass 1, produce a short list (`family_recordings.csv`: id, title, duration, who's in it, audio path) and show it to the user.
- Known so far: Zaidy Moshe Yehuda's memoir, the Bubby stories (English and Yiddish), the father-and-toddler Sefirah recording, the "motel chein" fragment. Pass 1 may find more.

## 3. People (partly decided 2026-11-25)
- **Uncle Yossi = Rabbi Yosef Goldstein.** The two speaker entries are merged into `rabbi_yosef_goldstein` ("Rabbi Yosef Goldstein (Uncle Yossi)"), with aliases. Examples were updated and still validate. So the radio host, the Heritage Series, Shema B'ni and the Yiddish Tanya shiurim are all one person, and the site can have one page for him.
- **Unknown narrators and series names: the user isn't sure and will fill them in after the full run.** Until then:
  - Keep placeholder ids (`storyteller_i_believe`; the series id for the weekly story series; a placeholder for the Yiddish narrator) whose labels say they are unconfirmed, e.g. "Weekly Storyteller (name unconfirmed)".
  - Pass-1 agents give a best guess with evidence: `guess`, `confidence` (low/medium/high), and `evidence` (quote + timestamp, e.g. the narrator saying his own name, a series name said on air, a sign-off). Never present a guess as fact in public fields.
  - After the run, produce `to_confirm.csv`: each placeholder, the items it covers, the agents' guesses ranked by how often and how strongly they were supported, and the best quotes. The user fills in the answers, then a script swaps placeholder → real label everywhere.

- **Weekly storyteller = R' Chaim Levi Goldstein** (user, 2026-11-25). He is Uncle Yossi's son, is known for the song "I Believe in Hashem", and tells most of the Stories collection. The vocabulary label is updated now, keeping the id `storyteller_i_believe` while pass 1 runs.
  After pass 1:
  - rename the id to `rabbi_chaim_levi_goldstein` across vocabularies.json and all items;
  - in pass 2, re-attribute Stories-collection items whose speaker is `unknown` but match his format or voice (the "I Believe" opening, a weekly tie-in, the Maaseh Rav narrator, rallies), recording basis and confidence;
  - remove him from `to_confirm.csv`.
  The series name (`weekly_story_i_believe`, "Weekly Story (working title)") is still unconfirmed.
- **Bubby Chaya Malka = Chaya Malka bas Dina, Uncle Yossi's mother** (R' Chaim Levi's grandmother). The user agreed to assume this (2026-11-25), from Uncle Yossi naming his late mother on air in eps 115/116. Fix it later if evidence contradicts it.
- Related lead, not confirmed: in the "Zaidy Moshe Yehuda" memoir the narrator mentions a son Yossi born in Providence, so Zaidy Moshe Yehuda may be Uncle Yossi's father. List it in `to_confirm.csv`; don't assert it publicly.

## 11. Fixes before the run (in progress 2026-11-25)
- Re-transcribing the items whose language was guessed from the filename (`_transcribe/fix_languages.py`).
- Blank tape at the end of episodes 246 and 399: **not trimmed**, in keeping with decision 1 (leave the audio alone). Record where the content ends in `quality.trim` instead, so the player or the episode page can note "content ends at 30:12".

## 4–10, 12: go with Claude's recommendations (user, 2026-11-25)
4. **Defective episode "16":** keep it in the catalog but hide it from the site (`quality.publish_recommendation = hide`, issue noted). Re-download later if a good copy turns up.
5. **Songs, sponsor ads, promos:** chapter marks (segments) only inside their episode; not their own browsable items. Standalone song files (e.g. "Purim Song 369", "I thank you Hashem") get `content_type = song` and are listed but not featured.
6. **Radio clips:** keep both. Each clip is its own item page, linked to its episode as the canonical source (`clip_of` + offset). The episode shows the clip as a chapter.
7. **Duplicates and takes:** show the best copy; list the others as "other versions" (`superseded_by` / `alternate_take`), not hidden entirely.
8. **Transcripts:** English shown on the item page, labelled "automatic transcript, may contain errors". Yiddish ASR text is used for search only, not displayed.
9. **Lost episodes:** list them on the series page (number, estimated date, catalog title if known) with a "help us find this tape" note.
10. **Content advisories:** both: a visible note for parents on the item page and a filter in browse.
12. **Heritage Series:** fold it into the radio series. Its items are radio segments; keep "Heritage Series 2" as a collection tag, not a separate series page.

All questions are now answered.

## After pass 1/2: reorganize folders and files (requested 2026-11-25)
- Once the metadata exists, reorganize StoryArchive into a cleaner layout based on it: by series/collection, episode numbers zero-padded, clean titles in filenames.
- Constraints: catalog ids stay stable; every move is recorded (`catalog.csv` out_path plus a `moves.csv` old→new log); transcripts, facts and items reference files by id, so they need no change. The audio content is never edited (decision 1).
- Propose the layout to the user with a sample before moving anything.

## Names confirmed during review
- **The Radatz = Reb Chaim Dovid Tzvi Chein** (user, 2026-11-25). Vocabulary label "The Radatz (Rabbi Chaim Dovid Tzvi Chein)"; "Dovid Tzvi Chein" kept as an alias. The 6 tagged items already used the full name in their text.

## Website decisions (user, 2026-11-25)
- **`publish_recommendation = review` items are publishable.** The 9 items marked `review` have been public on Google Drive for years; treat them like `publish`. Only `hide` is excluded from the sites.
- **Kids' site hero emblems and the no-figures rule (docs/sites/kids.md §8.4): approved.**
- **Kids' "Little" age band also admits `age_min = 5` items that have no advisories.**
- **Contact for lost tapes and other enquiries: `admin@torahlearningtools.com`.** For now, a single shared constant (e.g. `CONTACT_EMAIL` in the shared site config package) that every site reads; no contact form yet.
- **"The Plot That Boomeranged"**: `333ab07731` and `5ae5c959ac` are the same telling (transcripts match word for word; `5ae5c959ac` plays ~1.7% faster). Linked as `same_recording`; `5ae5c959ac` is `superseded_by` `333ab07731` (shown as "other version"). The "(2)" filename suffix is on the copy whose original was not named "2"; harmless.
- **Site names: placeholders until there is a product owner.** Bedtime: "Lights Out Stories"; kids: "Story Shelf"; reference: "The Goldstein Story Archive". Keep them in one shared constant so renaming is a one-line change.
- **Cloudflare Workers are fine** (the library concept's "no server" was not a requirement). Dynamic pieces (playlists, search fallback) may use Workers, KV, D1 or cron.
- **Hidden passages as marked are acceptable**, even where they blank most of a transcript. No need to narrow the spans.
- **First names that also occur in public text (42 recordings): fine as is.**
- **Yiddish ASR text inside a downloadable search index: fine** (still never displayed).
- **Lost episodes:** extract titles from the master tape catalog; done in `data/indexes/lost_episodes.json` (`tools/3-metadata/scripts/build_lost_episodes.py`). The catalog's visitor column (children's names) is not copied.
- **Bedtime defaults, pending the owner** (he left rotation length to the planners): rotate once a day at 09:00 America/New_York (a config constant, so 12 h is a one-line change); Little Ones 90 min; whole radio episodes are not auto-played in playlists (story spans only); no special Shabbos/Yom Tov/Nine Days/Sefirah behaviour for now.
- **Hostnames (no dashes):** `bedtimestories.`, `kidsstories.`, `storylibrary.torahlearningtools.com`.
- **Bedtime repeats (owner, 2026-11-25):** repeats inside a playlist are fine as long as the order differs; what matters is the first ~30 minutes (the first few stories), since children usually fall asleep by then. Tune cooldowns to keep the *openings* fresh, not whole playlists.
- **Names read on air may be heard in played audio (owner, 2026-11-25): "this aired like 40 years ago."** Playlists may play any part of a radio episode, including spans that overlap `hidden`. This is about *audio playback only*: the `hidden` block, and transcript text inside hidden spans, still never appear as text anywhere public (pages, search index, exports). Playlist rule B9 (no track overlapping a hidden span) is dropped.
- **Radio Night playlist (owner, 2026-11-25):** a playlist of full radio episodes (names, mailbox and all) is wanted.
- **Story segments as playlist tracks (owner, 2026-11-25):** an episode with several stories can contribute each story separately ("episode X, third story, 5:00–17:34"). For the story-focused playlists, prefer story segments over name-heavy segments (Shema guests, mailbox, announcements, contest winners), which are "not interesting for 5 minutes straight".
- **Phone numbers (owner, 2026-11-25):** never shown; they no longer work. Public transcripts replace them with "[phone number]".
- **"46th Street, Brooklyn"** is a sponsor's location in radio ads (Focus Electronics); allowed in transcripts.
- **Radio segments in playlists (owner, 2026-11-25):** talks and songs are fair game. Openings, closings and quizzes occasionally, not often. Shema-guest segments may be cute for the youngest (Little Ones) playlist only; tentative, owner reviewing a sample.
- **Tonight's Mix is the first playlist everywhere** (owner, 2026-11-25): the mix is the default choice; the age- and mood-specific playlists follow.
- **No cross-like shapes in any site artwork** (owner, 2026-11-25; an X for close or remove buttons and a + sign are fine, as standard controls): no four-pointed stars or sparkles, plus signs as decoration, or crossed lines in icons, covers or decorations. Five-pointed stars, dots, crescents and the Magen David are fine. Started with the Big Kids icon's sparkle.
- **Luchos are drawn square** (owner, 2026-11-25): rectangular, never with rounded or arched tops.
- **Menorah branches are straight** (owner, 2026-11-25): diagonal straight branches, never curved arms. Applies to the Chanukah menorah and the Beis Hamikdash menorah.
- **Artwork review (owner, 2026-11-25):** only kosher animals in any artwork (no lion, bear, eagle…), with one exception: the Baal Shem Tov's wagon may have its horse. No crescent-and-star; moons are drawn full or nearly full. Matzah is round, hand-made. A shofar must look like a ram's horn. Avoid compositions that read as a face.
- **Shpoler Zeide emblem: a fiddle** (owner, 2026-11-25), for his joyful dancing; music notes optional, at the designer's discretion.
- **Crossing-line review (owner, 2026-11-25):** old suns (line rays), crossed bonfire logs, the globe grid, the table grid, X close buttons and + signs are all fine and restored. The new scales, house and queue icons are kept. Four-pointed sparkles and the anchor stay out.

# Review queue (pass 2, task versions_speakers)

These are the open questions left after pass 2. Each one needs a person to listen or decide. Item ids are catalog ids. The fixes this task made itself are in `pass2/versions_speakers.json`.

## 1. Versions: decisions and listening checks

**Policy question.** Some recordings exist both as one complete file and as two halves cut from it. Should the site show only the complete file, with the halves listed as other versions? Or should it show both? Pass 2 left these unchanged.
- 6b6fec027a, Bubby Chaya Malka Yiddish stories (complete). The halves a06fb5b0d9 (part 1) and 048cba0e8e (part 2) are split mid-sentence and are still marked `review`.
- b9cf46cd8d, Shlomo Hamelech's Pool (complete). The halves are ad8eb4387b (Pool 01) and 3b507e35c4 (Pool 02).
- 27799e2e4b, Tefilah - Kesser (complete). The halves are 0f82bdc6fb (kesser tefila 1) and 0dab3223a8 (kesser tel lesson).

**Picks that need a listen.**
- Episode 373: pass 2 picked 0f6f2dc878 (quiet, but the story is complete) over c3857a3b34 (has a splice or gap at 18:10-19:06). Is the gap real audio loss?
- Tanya shiur 56: pass 2 picked 241ca67725 over c465a14448. The two transfers differ in length by about 30 s. Which one plays at the correct speed?
- Some pairs were identical and the pick was a coin toss. Swap any you like: 6a1de77edd over dc093bdc5d, 052d37b4ea over 008f627970, fec54397e2 over 054944bbf2, 681b318628 over 777afc34b1, d7fe4cf227 over 1b70a1949c, a91e103f11 over 3ec5471714, afddab9ffe over 5b6b690fa8.

**Same recording under two episode numbers.**
- 9cef1efc9e ("238") and 6c110183df ("287 08-04-87"): the audio fingerprint matches, and the content fits 1987. Is "238" a mislabeled copy of 287, or did 287 rebroadcast 238? 6c110183df is still marked `review`. The episode numbers are locked in facts.
- f33fa1ac66 (136) and 17d9dca041 (186): 186 is 136 re-aired with a new opening. Both are kept as episodes. 136 may have an audio dropout at 10:18-11:00. Please listen.

**Related cuts kept as separate items, with no preferred copy.** Confirm that this is right.
- 213559b057 (Asarah B'Teves 5) and 2cdc2fb9fd (Asarah B'Teves 507): different cuts of the same talk. Also, is file "5" (efb72976ab) a mislabeled or truncated copy of episode 507 (b8577c47e9)?
- 3ab8c0ebe9 (Pesach 223) and 2ea540c461 (Pesach 322): the same talk and skit, but each cut has material the other lacks.
- 2a6ad8add6 (Sefira 273) contains the "lost dime" Sefirah talk plus its own intro. The plain talk's preferred copy is 27e4be78a2 (episode 24).
- ce28d1962a (R Meir rafaels - Aguna) is a single-file edit of the two-part 5e786ca354 / a05fbdecf2.
- 09074ce59f (Rabbi Akiva negel vasser, Heritage) contains the single-story cuts 90086c4a4c and 59ebaba0bf.

**Two recordings with no signal for which one to feature.**
- Hashem's Name part 1: 179f246846 ("A") or 6629d7464c ("A."). For part 2, 'good' cce7163480 was picked.
- Rashab hashavas aveida part 1: 56c2eaabb2 or 73edd7e5fc. The second is marked "copy", but its audio is different.
- The same story told twice by the same narrator: Mitzvos Over Money 1-2 (35dc2fd877, aced8f2be2) and Red Ivan 1-2 (addf1aed4d, 62f0b4603b). Publish both?

## 2. Items still marked `review`
- 0abb04dece, Neiros Chanukah: a 3-minute opening that stops before the story. No continuation was found in the archive. Publish it as a fragment, or hide it?
- 13f49636bc, "32 seems like tanya double": mostly English, but transcribed with the Yiddish model. The text studied is not Tanya. Re-transcribe it in English and decide its series or collection.
- 4ad523a84f, "9 shevat 5730 Bracha shehecheyanu": a 26-second Shehecheyanu. Who is speaking, and should it be listed at all?
- 7c429e4277, Havdalah 428: this is the episode-427 Havdalah lesson (now listed as another version of cbefd2fcab, Havdalah 276). The locked episode number 428 needs a facts fix.
- 870d0298c2, "motel chein": a 90-second private family fragment. Publish it? Who is Motel Chein?
- e707859a8d, 12 Psukim Shema 2 162: a 30-second spoken intro without the song it introduces. Publish it, re-cut it, or hide it?
- a06fb5b0d9 and 048cba0e8e: the Bubby Chaya Malka halves (see section 1).
- 6c110183df: episode 287 vs 238 (see section 1).

## 3. Files that hold more than one program, and cut-off tapes
- Several Tanya Yiddish files join two weekly sessions in one file. They are already segmented and flagged `multiple_programs`: 76303b6292 (20), 180fa300d7 (22), eb0459de7a (23), 285846e5e3 (27), 332f976b78 (30), b0d51c0ab5 (34), 8707992670 (43), c85ce18cdf (50), d640b2306b (49b). Should they get a label, or a split later?
- 46049ff3d0, Shema Beni 1: three nightly broadcasts in one file.
- Continuations were searched for across all English transcripts and not found:
  - 4bd06e794b: the second story is cut off.
  - 3835486e91: Kidnapped Part 1 has no part 2.
  - 764576cb84 ends with "And for this I have a story."
  - 9c6c7e754e ends as the Hillel story begins.
  - 211fe9790b and 1099bfc28c end mid-sentence.
  - f069679286 (Likkutei Dibburim part 1) has no part 2.
  - 5d0376fc7a and a4c62a5281 start mid-story.
  - Tanya files that start or end mid-sentence: 76303b6292, 3d11644d1d, 9595d61d8b, 9c2537ad8a.
- Blank-tape and silence checks:
  - 9b9050cf28 (episode 399): is the last 33 minutes blank?
  - 9187a4035a (shiur 38): is the 55-minute gap blank?
  - 1c578063be: is the rest of the file after 59 s singing?
  - 9f2e683d65 (episode 113): the filename says "bad recording". Please listen.
  - Transcript gaps in eb05b90af0 (365) and 9c22ce4e9b (366): is audio missing?

## 4. Misnumbered or mislabeled files
- 46d718e3d2, episode 41: the host says the show has been on the air "only a few weeks". Is it misnumbered, or an early show re-aired?
- 084bdc9506, episode 121: a guest calls it "your 118th show".
- 5650f2336c, "Shpoller Zeide 397": the clip's source episode is uncertain (397, 446 or 295).
- 32e631c050, "Zman Cheiruseinu 473": it matches the talk in episode 374. Is it mislabeled?
- The clip "Rosh Chodesh Av 388" matches episode 487 better than 388.
- The Tanya Yiddish lecture numbers don't follow the chapter order:
  - 285846e5e3 ("27 P8") comes after 25 P9.
  - ac3847e263 ("41 end P29") may really be 42.
  - The 44-50 range mixes chapters 33 and 36.
  - The years for 45 and 24 conflict.
  Please check the numbering as a whole.
- Filename vs content (minor):
  - 653c681319, "12 Tammuz 485": the talk says 13 Tammuz.
  - 0c696ffa0a: the filename says "Mevorchim", but the talk was on Erev Rosh Chodesh.
  - 8ae8b2f333: the filename says "yahrzeit", but the audio never says it is one.
  - 9587146bd8: the filename says "87m 9s", but the file is 8 minutes long.

## 5. Speakers
**Set to R' Chaim Levi Goldstein in this pass.** The basis is recorded in `provenance.needs_human_review`. Please spot-check the voice.
- The Maaseh Rav narrator: d8e2da15b1, bd0356ce35, eec487ad64, 7666632281, 5003aabf6f, 4289ef2683.
- Negel vasser 1-4: 234db79ac9, bae411ef9d, 09853315db, 1a993b1bd5.
- The live boys' class: 6bdf3b9e45, 1e53bafbf7, 3342eced38.
- Neiros Chanukah: 0abb04dece.
- Rally and puppet hosts that pass 1 had tagged as Uncle Yossi: 85fd6a2f32, 5493440d73, 770aa7cebf, cc16e78758. In the last three, the public text "Uncle Yossi" was changed to the on-air "Rabbi Goldstein".

**Left as `unknown`: different or unidentified voices.** One listening session would settle these.
- A second read-aloud narrator ("kinderlach"): 03fe816538, 8a7660b8a3, 2647489fa0, possibly 3835486e91.
- Readings from printed story books:
  - 92ce45332c, e351e6a1a6, 1cd7878c66, 36e89c0829, 4c6faa00d3
  - e97506b9f6, cad84e0aaf, 0ab028b9b9, e9310309cd, 38a2448562
  - 5d6e893d0e / 7d789b1f0b
  - b9cf46cd8d / ad8eb4387b / 3b507e35c4
- No clue either way:
  - The Kesser trio 27799e2e4b, 0f82bdc6fb, 0dab3223a8
  - 1099bfc28c, cb18bbc23d, 2300e71fce, cdd9f50dce
- d867ec591e (Mineola farbrengen): the guest is Rabbi Pearl's yeshiva study partner.
- Songs: 75bc3346d1 ("I thank you Hashem wachsman") and a45cd82288 (the "I Believe" theme). Who sings on the recorded theme? Wachsman?

**Other identity leads (not changed).**
- The Yiddish narrator placeholder: in 26b3996f18 (around 10:37) a speaker says "You know my song, I Believe in Hashem ... translate into Yiddish". Is `yiddish_narrator_unconfirmed` also R' Chaim Levi?
- The Yiddish Haggadah teacher (933079e352 and its excerpts) is unnamed. Is it possibly Uncle Yossi?
- "Rabbi Levi Goldstein", an adult guest in radio episodes 141-143, 147, 193, 233, 290-291 and 431, is probably R' Chaim Levi. He is kept in `hidden`. May he be named or tagged as a speaker?
- Guest performers have no speaker id: "Reb Nature" Dovid Lazerson (eps 131, 137, 138, 491, 492) and Eli Lipsker (258). Add ids?
- Who are the father in the SZ Sefirah recordings (798eaeecfd, 1dc37ae04f) and the grandfather-teacher in 21abe7ce4a (possibly Uncle Yossi)?

## 6. Policy and privacy questions raised in the batch reports
- The validator requires a privacy flag even when only adults are named (a teacher, a class). Pass 1 used `minor_named` or `identifiable_living_people` as a stopgap. Add a flag for "adult private person named"?
- Phone numbers and addresses treated as public. Please confirm:
  - 212-771-9888, the record orders line (ep 40)
  - Tzivos Hashem's 467-6630 and Dial-a-Story 467-7800
  - 604 and 640 Empire Blvd. The Shpoler Zeide Family Society address and evening number in 3073859dbb are currently hidden.
- Standalone sponsor commercials 60ff0977a7 and bda75a59cd (Lagavina): list them, or hide them under DECISIONS 5?
- Names read on air but missing from the transcript. Fill `hidden` after a listen:
  - 96b0e06c39 (ep 20, 465-495 s)
  - 2ef8dfd816 (ep 245, 5:30-6:10)
  - 4f76af6486 (ep 357, 24:47-25:23)
  - ep 407 (around 13:37)
- 25a669862e (ep 148): the contest-winners segment reads many names and five home addresses. It is marked `publish_with_note`.
- badd162691 (Zaidy Moshe Yehuda memoir) contains strong opinions about Zionists and Conservative synagogues. Publish it as is?
- Batch b042 has no report file in `reports/`. Its items exist and validate, but any notes that batch had are lost.

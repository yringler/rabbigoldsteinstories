"""Build vocabularies.json (draft v0.1) from the lists below. Editing here keeps the JSON tidy.

Usage: python -I -X utf8 build_vocab.py <out vocabularies.json>
"""
import json, sys

def L(rows, keys):
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        if 'aliases' in d and isinstance(d['aliases'], str):
            d['aliases'] = [a.strip() for a in d['aliases'].split(';') if a.strip()]
        out.append({k: v for k, v in d.items() if v not in ('', None, [])})
    return out

V = {}
V['_meta'] = {
    'version': '0.1-draft', 'date': '2026-11-25',
    'rules': [
        'Fields that take vocabulary ids must use an id from this file. If nothing fits, use the closest id AND add an entry to proposed_new_terms; never invent ids.',
        'Labels use Chabad/Ashkenazi transliteration (see transliteration). Aliases are search synonyms and known ASR misspellings; they are never displayed.',
        'Hierarchy: topics have parents; people have categories. Tag the most specific id; the site rolls up to parents.',
    ],
}
V['transliteration'] = {
    'style': 'Chabad/Ashkenazi: sav = s (Shabbos, Sukkos, mitzvos), ches/chaf = ch, tzadi = tz, plural -os/-im, Rebbe titles as used in Chabad.',
    'preferred': ['Shabbos', 'Yom Tov', 'Yomim Tovim', 'Rosh Hashanah', 'Yom Kippur', 'Sukkos', 'Simchas Torah', 'Chanukah', 'Purim', 'Pesach', 'Sefiras HaOmer', 'Lag BaOmer', 'Shavuos', 'Tisha B\'Av', 'mitzvah / mitzvos', 'midah / midos', 'tzedakah', 'tefillin', 'tzitzis', 'negel vasser', 'brachah / brachos', 'davening', 'Moshiach', 'Beis HaMikdash', 'Eretz Yisroel', 'Yerushalayim', 'tzaddik / tzaddikim', 'Chassidus', 'Chassid / Chassidim', 'farbrengen', 'sichah / sichos', 'maamar / maamarim', 'Hashem', 'Torah', 'Gemara', 'Midrash', 'Ahavas Yisroel', 'kibbud av va\'em', 'hachnasas orchim', 'Eliyahu HaNavi', 'poritz', 'shul', 'Tzivos Hashem'],
    'display_titles': 'Title Case English; keep Hebrew/Yiddish terms in the preferred spelling (e.g. "The Baal Shem Tov and the Kidnapped Boy", not "Besht to the Rescue" if the filename is an abbreviation). Keep the filename title as an alias.',
    'yiddish_titles': 'title_he keeps the Hebrew-script title as written (no nikud); title_translit uses YIVO-like romanization for Yiddish words and the Chabad style above for loshn-koydesh words.',
}

V['content_type'] = L([
    ('radio_episode', 'Radio episode', 'A full broadcast (about 30 min) of a radio program.'),
    ('radio_segment', 'Radio segment', 'A clip cut from a radio episode: a talk, a story, a song, an activity.'),
    ('story', 'Story', 'One complete story (may include a short intro and lesson).'),
    ('story_chapter', 'Story chapter', 'One chapter of a serial story; not complete on its own.'),
    ('story_collection', 'Story collection', 'Several distinct stories in one recording (use segments).'),
    ('talk', 'Talk', 'A short teaching on a holiday, midah, mitzvah or parsha, without a main story.'),
    ('lesson_with_story', 'Lesson with story', 'A teaching (halachah, holiday, sichah) with one or more stories woven in.'),
    ('shiur', 'Shiur (class)', 'A study class on a text (Tanya, Shulchan Aruch HaRav, Haggadah) for older listeners.'),
    ('live_event', 'Live event', 'Rally, farbrengen or class recorded live with an audience.'),
    ('song', 'Song / nigun', 'Mostly singing or music.'),
    ('promo', 'Announcement / promo', 'Promotion, campaign or announcement.'),
    ('family_recording', 'Family recording', 'Private home recording (grandparents, children, memoirs).'),
    ('fragment', 'Fragment', 'Too short or incomplete to stand alone.'),
], ['id', 'label', 'description'])

V['story_type'] = L([
    ('chassidic', 'Chassidic story', 'Baal Shem Tov, Rebbeim, tzaddikim and their Chassidim.'),
    ('tanach_midrash', 'Tanach / Midrash', 'Stories from Tanach and Midrash.'),
    ('talmudic', 'Sages of the Talmud', 'Tannaim and Amoraim; Gemara stories.'),
    ('rishonim_acharonim', 'Great rabbis of later generations', 'Rashi, Rambam, Arizal, Ohr HaChayim, etc. (non-Chassidic).'),
    ('historical', 'Historical tale', 'Set in a specific period/place, e.g. Baghdad, Czarist Russia.'),
    ('mashal_parable', 'Mashal / parable', 'Allegory or parable told to make a point.'),
    ('contemporary', 'Contemporary / true-life', 'Modern events, first-person miracle stories, recent Chassidim.'),
    ('moral_fiction', 'Moral tale', 'Fictional children\'s story built around a lesson.'),
    ('family_memoir', 'Family memoir', 'Personal life story.'),
], ['id', 'label', 'description'])

V['segment_type'] = L([
    ('opening', 'Opening / greeting', ''), ('talk', 'Talk / teaching', ''), ('sichah', 'Teaching of the Rebbe (sichah) explained', ''),
    ('story', 'Story', ''), ('story_chapter', 'Story chapter', ''), ('story_intro', 'Story intro / recap', ''),
    ('song', 'Song / march / nigun', 'Includes the Hakochainik march.'), ('shema_guest', 'Shema with guest children', ''),
    ('tzedakah', 'Tzedakah moment', ''), ('quiz', 'Quiz / riddle / call-in', ''), ('mailbox', 'Mailbox / letters', ''),
    ('announcement', 'Announcements (candle time, campaigns, birthdays, refuah shleimah)', ''),
    ('sponsor', 'Sponsor message', ''), ('closing', 'Closing', ''),
    ('text_study', 'Text study (shiur)', ''), ('review', 'Review of previous material', ''), ('halachah', 'Halachah / how-to', ''),
    ('qa', 'Questions and answers with children', ''), ('silence', 'Silence / dead air / blank tape', ''), ('other', 'Other', ''),
], ['id', 'label', 'description'])

V['series'] = L([
    ('uy_tzivos_hashem_on_the_air', 'Uncle Yossi - Tzivos Hashem on the Air', 'Weekly radio program, ~30 min, aired Tuesday nights; episodes 1-555 (1981/2-1990s). Clips in the topical folders belong to this series.'),
    ('uy_heritage_series', 'Uncle Yossi - Heritage Series', 'Story segments re-edited from radio episodes ("Heritage Series 2" folder).'),
    ('shema_beni', 'Shema B\'ni', 'Older nightly program hosted by Rabbi Yosef Goldstein ("tayere kinderlach"); found inside "Shema Beni 1/2".'),
    ('weekly_story_i_believe', 'Weekly Story (working title)', 'Contemporary story series opening with the song "I believe in Hashem, I trust in Hashem"; storyteller not named on air. Real series name to be confirmed.'),
    ('simchas_beis_hashoeva_5786', 'Simchas Beis Hashoeva Rallies 5786', 'Live children\'s rallies, Sukkos 5786.'),
    ('farbrengen_power', 'Farbrengen Power', 'Story farbrengen videos (audio).'),
    ('maaseh_rav', 'Maaseh Rav', 'Short stories the Rebbe told, with explanation.'),
    ('tanya_yiddish_goldstein', 'Tanya Shiur in Yiddish - Rabbi Yosef Goldstein', 'Numbered weekly Tanya classes (Likkutei Amarim), with Shulchan Aruch HaRav and seasonal talks.'),
    ('haggadah_yiddish', 'The Haggadah Explained (Yiddish)', 'Pesach preparation and Haggadah explanation in Yiddish.'),
    ('bubby_zaidy_stories', 'Bubby and Zaidy Stories', 'Grandparents telling stories (English and Yiddish). Private family recordings.'),
], ['id', 'label', 'description'])

V['speakers'] = L([
    # Uncle Yossi = Rabbi Yosef Goldstein (confirmed by the user 2026-11-25); aliases are added in vocabularies.json
    ('rabbi_yosef_goldstein', 'Rabbi Yosef Goldstein (Uncle Yossi)', 'Uncle Yossi, host of Tzivos Hashem on the Air and the Heritage Series; also gives the Yiddish Tanya shiurim and hosts Shema B\'ni.'),
    ('rabbi_chaim_levi_goldstein', 'Rabbi Chaim Levi Goldstein', 'Unnamed narrator of the "I believe in Hashem" story series and rallies.'),
    ('simcha_engel', 'Simcha Engel', 'Sidekick character at the Simchas Beis Hashoeva rallies.'),
    ('bubby_chaya_malka', 'Bubby Chaya Malka', 'Grandmother storyteller (family recordings).'),
    ('guest_children', 'Guest children', 'Children visiting the studio / at a live event.'),
    ('unknown', 'Unknown speaker', ''),
], ['id', 'label', 'description'])

V['audience_level'] = L([
    ('young_children', 'Young children (3-6)'), ('children', 'Children (6-10)'), ('older_children', 'Older children (9-13)'),
    ('teens_adults', 'Teens and adults'), ('adults', 'Adults (study)'), ('family', 'Whole family'),
], ['id', 'label'])

V['content_advisory'] = L([
    ('peril_violence', 'Danger or violence', 'Robbers, pirates, beatings, threats, armed attackers.'),
    ('death', 'Death', 'A character dies or is killed, deathbed scenes, funerals.'),
    ('persecution', 'Persecution of Jews', 'Antisemitic rulers/poritzim, decrees, pogroms, imprisonment for Judaism.'),
    ('kidnapping_captivity', 'Kidnapping / captivity', 'Captives, kidnapped children, slavery, prison.'),
    ('forced_conversion', 'Forced conversion', 'Attempts to convert Jews by force or deception.'),
    ('alcohol', 'Alcohol', 'Drunkenness, a drunk parent, getting someone drunk.'),
    ('illness', 'Serious illness', 'Critically ill people, especially children.'),
    ('afterlife_judgment', 'Afterlife / Heavenly judgment', 'Gehinnom, souls judged, reincarnation (gilgul).'),
    ('sad_ending', 'Sad or unresolved ending', ''),
    ('national_tragedy', 'National tragedy', 'Churban, the Three Weeks, the Holocaust.'),
    ('family_hardship', 'Family hardship', 'Agunah, poverty, a parent\'s failings.'),
], ['id', 'label', 'description'])
V['advisory_severity'] = ['mild', 'moderate', 'strong']

V['privacy_flag'] = L([
    ('minor_named', 'Child named on air (full name)', 'Studio guests, birthdays, letters.'),
    ('home_address', 'Home address read on air', ''),
    ('phone_number', 'Private phone number read on air', 'Not the program\'s own published numbers.'),
    ('health_info', 'Named person\'s health', 'Refuah shleimah lists, illness of a named person.'),
    ('private_family_recording', 'Private family recording', 'Recorded at home; family members named.'),
    ('identifiable_living_people', 'Identifiable private individuals', 'Contemporary true stories naming private people.'),
], ['id', 'label', 'description'])

V['quality_issue'] = L([
    ('defective_source', 'Defective source file'), ('trailing_silence', 'Long silence / blank tape at end'),
    ('dead_air', 'Dead air inside the recording'), ('truncated_start', 'Starts mid-way'), ('truncated_end', 'Cut off before the end'),
    ('splice_glitch', 'Editing splice glitch'), ('noisy_audio', 'Hiss / noise / low quality'), ('low_volume', 'Very quiet source'),
    ('asr_wrong_language', 'Transcribed with the wrong language model'), ('asr_loop', 'ASR repetition/hallucination loop'),
    ('music_untranscribed', 'Music or singing not transcribed'), ('mixed_language', 'Mixed languages'),
    ('time_bound_content', 'Dated content (ads, candle times, contests, old addresses)'),
    ('multiple_programs', 'Several programs/takes joined in one file'), ('mislabeled', 'Filename does not match content'),
    ('alternate_take', 'One of several takes of the same recording'), ('needs_retranscription', 'Re-run ASR'),
], ['id', 'label'])

V['relation_type'] = L([
    ('clip_of', 'Is a clip cut from', 'target = full episode/recording; give offset_sec.'),
    ('contains', 'Contains', 'Inverse of clip_of (generated, do not fill by hand).'),
    ('aired_again_in', 'Same segment also aired in', 'Rebroadcast inside another episode.'),
    ('same_recording', 'Same recording (other transfer/edit)', ''),
    ('alternate_take', 'Alternate take / edit of', ''),
    ('superseded_by', 'Superseded by (better/complete version)', ''),
    ('part_of_set', 'Part of the same multi-part set as', ''),
    ('continues', 'Continues (next chapter/part of)', 'target = previous part/chapter.'),
    ('same_story', 'Same story, different telling', ''),
    ('same_story_other_language', 'Same story told in another language', ''),
], ['id', 'label', 'description'])
V['relation_evidence'] = ['audio_fingerprint', 'text_overlap', 'filename', 'master_catalog', 'content']

V['topics'] = L([
    ('tzaddikim_stories', 'Stories of Tzaddikim', ''),
    ('baal_shem_tov_and_students', 'The Baal Shem Tov and his students', 'tzaddikim_stories'),
    ('chabad_rebbeim', 'The Chabad Rebbeim', 'tzaddikim_stories'),
    ('the_rebbe', 'The Rebbe', 'chabad_rebbeim'),
    ('chassidic_masters', 'Other Chassidic masters', 'tzaddikim_stories'),
    ('chassidim', 'Chassidim and their devotion', 'tzaddikim_stories'),
    ('torah_heroes', 'Heroes of Tanach and the Sages', ''),
    ('tanach', 'Tanach', 'torah_heroes'), ('sages', 'Sages of the Mishnah and Gemara', 'torah_heroes'),
    ('great_rabbis', 'Great rabbis through the ages', 'torah_heroes'),
    ('emunah_bitachon', 'Emunah and bitachon', ''),
    ('hashgacha_pratis', 'Hashgachah pratis (Divine providence)', 'emunah_bitachon'),
    ('miracles', 'Miracles and wonders', 'emunah_bitachon'),
    ('prayer_and_brachos', 'Davening and brachos', ''),
    ('torah_study', 'Learning Torah', ''),
    ('mitzvos_in_daily_life', 'Mitzvos in daily life', ''),
    ('shabbos', 'Shabbos', 'mitzvos_in_daily_life'),
    ('kashrus', 'Kashrus', 'mitzvos_in_daily_life'),
    ('morning_routine', 'Waking up the Jewish way', 'mitzvos_in_daily_life'),
    ('character', 'Character and midos', ''),
    ('kindness_and_community', 'Kindness, tzedakah and community', 'character'),
    ('teshuvah', 'Teshuvah and growth', 'character'),
    ('family_and_home', 'Family and home', ''),
    ('calendar', 'Yomim Tovim and the Jewish calendar', ''),
    ('parsha', 'Parshas HaShavua', 'calendar'),
    ('moshiach_geulah', 'Moshiach and the Geulah', ''),
    ('beis_hamikdash_eretz_yisroel', 'Beis HaMikdash, Yerushalayim and Eretz Yisroel', ''),
    ('jewish_history', 'Jewish history and galus', ''),
    ('mesiras_nefesh_kiddush_hashem', 'Mesiras nefesh and Kiddush Hashem', 'jewish_history'),
    ('chassidus_tanya', 'Chassidus and Tanya', ''),
    ('hiskashrus', 'Connection to the Rebbe and tzaddikim', ''),
    ('tzivos_hashem', 'Tzivos Hashem and mitzvah campaigns', ''),
    ('hashem_in_nature', 'Hashem\'s world: nature and science', ''),
    ('halachah', 'Halachah: how to do it', ''),
    ('family_heritage', 'Family heritage and memoir', ''),
], ['id', 'label', 'parent'])

V['midos'] = L([
    ('ahavas_yisroel', 'Ahavas Yisroel (love for every Jew)', 'love your fellow; kindness to others'),
    ('achdus', 'Achdus (unity)', 'unity; togetherness'),
    ('chesed', 'Chesed (kindness)', 'kindness; helping others'),
    ('emes', 'Emes (honesty and truth)', 'honesty; truthfulness; not stealing'),
    ('emunah', 'Emunah (faith)', 'faith; belief in Hashem'),
    ('bitachon', 'Bitachon (trust in Hashem)', 'trust; not worrying'),
    ('simcha', 'Simcha (joy)', 'happiness; joy'),
    ('hakaras_hatov', 'Hakaras hatov (gratitude)', 'gratitude; thanking Hashem'),
    ('anavah', 'Anavah (humility)', 'humility; modesty'),
    ('savlanus', 'Savlanus (patience)', 'patience'),
    ('zerizus', 'Zerizus (alacrity)', 'eagerness; not being lazy'),
    ('hasmadah', 'Hasmadah (diligence)', 'perseverance; diligence; not giving up'),
    ('generosity', 'Generosity', 'giving; sharing; not being stingy'),
    ('dan_lkaf_zchus', 'Judging others favorably', 'dan l\'kaf zechus; seeing the good'),
    ('shalom', 'Making peace', 'peace; shalom bayis'),
    ('kibbud', 'Respect and honor', 'respect for parents, elders, teachers'),
    ('shemiras_halashon', 'Guarding one\'s speech', 'no lashon hara; clean language'),
    ('controlling_anger', 'Controlling anger', 'kaas; temper'),
    ('no_jealousy', 'Overcoming jealousy', 'jealousy; envy'),
    ('courage', 'Courage', 'bravery; not being afraid'),
    ('mesiras_nefesh', 'Mesiras nefesh (self-sacrifice)', 'self-sacrifice'),
    ('yiras_shamayim', 'Yiras Shamayim (awe of Heaven)', 'fear of G-d; Hashem is watching'),
    ('self_control', 'Self-control and fighting the yetzer hara', 'yetzer hara; temptation'),
    ('responsibility', 'Responsibility', 'keeping your word; being careful'),
    ('tznius', 'Tznius (modesty)', 'modesty'),
    ('kabbalas_ol', 'Kabbalas ol (accepting Hashem\'s rule)', 'obedience; following instructions of a tzaddik'),
    ('contentment', 'Being content', 'sameach b\'chelko; not greedy'),
    ('forgiveness', 'Forgiveness', 'forgiving'),
], ['id', 'label', 'aliases'])

V['mitzvos'] = L([
    ('shema', 'Shema', ''), ('davening', 'Davening (prayer)', 'tefillah'), ('brachos', 'Brachos (blessings)', ''),
    ('modeh_ani', 'Modeh Ani', ''), ('negel_vasser', 'Negel vasser / netilas yadayim', 'washing hands'),
    ('tefillin', 'Tefillin', ''), ('tzitzis', 'Tzitzis', ''), ('mezuzah', 'Mezuzah', ''), ('yarmulke', 'Yarmulke', 'kippah'),
    ('torah_study', 'Torah study', 'talmud torah'), ('chitas', 'Chitas', ''), ('rambam_daily', 'Daily Rambam', ''),
    ('twelve_pesukim', 'The Twelve Pesukim', '12 pesukim'), ('tehillim', 'Saying Tehillim', ''),
    ('shabbos', 'Shabbos', ''), ('shabbos_candles', 'Shabbos and Yom Tov candles', 'neshek; candle lighting'),
    ('kiddush', 'Kiddush', ''), ('havdalah', 'Havdalah', ''), ('melave_malka', 'Melave Malka', ''),
    ('kashrus', 'Kashrus', 'kosher; chalav Yisroel'), ('tzedakah', 'Tzedakah', 'charity; maaser'),
    ('gemilus_chasadim', 'Gemilus chasadim', 'loans; acts of kindness'), ('hachnasas_orchim', 'Hachnasas orchim', 'hospitality'),
    ('bikur_cholim', 'Bikur cholim', 'visiting the sick'), ('pidyon_shvuyim', 'Pidyon shvuyim', 'redeeming captives'),
    ('hachnasas_kallah', 'Hachnasas kallah', 'helping a bride'), ('hashavas_aveidah', 'Hashavas aveidah', 'returning lost objects'),
    ('kibbud_av_vaem', 'Kibbud av va\'em', 'honoring parents'), ('kibbud_zekeinim', 'Honoring elders and teachers', ''),
    ('ahavas_yisroel_mitzvah', 'Loving every Jew (as a mitzvah)', 'v\'ahavta l\'reiacha kamocha'),
    ('shemiras_halashon', 'Shemiras halashon', 'lashon hara'), ('honest_business', 'Honesty in business', 'ona\'ah; fair weights'),
    ('tzaar_baalei_chaim', 'Kindness to animals', ''), ('teshuvah', 'Teshuvah', 'repentance'),
    ('kiddush_hashem', 'Kiddush Hashem', ''), ('kavod_shul', 'Respect for shul and sefarim', ''),
    ('chinuch', 'Chinuch (Jewish education)', ''), ('upsherin', 'Upsherin', 'first haircut'),
    ('shofar', 'Shofar', ''), ('tashlich', 'Tashlich', ''), ('sukkah', 'Sukkah', ''), ('arba_minim', 'Lulav and esrog', 'four kinds'),
    ('chanukah_lights', 'Chanukah lights', 'menorah'), ('megillah', 'Megillah', ''),
    ('mishloach_manos', 'Mishloach manos', ''), ('matanos_levyonim', 'Matanos la\'evyonim', ''),
    ('chametz', 'Chametz: search, burning, selling', 'bedikas chametz'), ('matzah', 'Matzah', ''), ('seder', 'The Seder', 'haggadah'),
    ('sefiras_haomer', 'Counting the Omer', ''), ('fast_days', 'Fast days', ''),
    ('bris', 'Bris milah', ''), ('loving_eretz_yisroel', 'Eretz Yisroel', ''),
    ('mivtzoim', 'The Rebbe\'s mitzvah campaigns (mivtzoim)', 'mivtza'),
], ['id', 'label', 'aliases'])

V['calendar'] = L([
    ('rosh_hashanah', 'Rosh Hashanah', '1-2 Tishrei', ''), ('tzom_gedaliah', 'Tzom Gedaliah', '3 Tishrei', ''),
    ('aseres_yemei_teshuvah', 'Aseres Yemei Teshuvah', '1-10 Tishrei', 'Ten Days of Repentance'),
    ('vav_tishrei', 'Vov Tishrei', '6 Tishrei', 'Yahrzeit of Rebbetzin Chana'), ('yom_kippur', 'Yom Kippur', '10 Tishrei', ''),
    ('sukkos', 'Sukkos', '15-21 Tishrei', 'Succos'), ('simchas_beis_hashoeva', 'Simchas Beis Hashoeva', 'Sukkos nights', ''),
    ('hoshana_rabbah', 'Hoshana Rabbah', '21 Tishrei', ''), ('shemini_atzeres_simchas_torah', 'Shemini Atzeres and Simchas Torah', '22-23 Tishrei', ''),
    ('chof_cheshvan', 'Chof Cheshvan', '20 Cheshvan', 'Birthday of the Rebbe Rashab'),
    ('yud_kislev', 'Yud Kislev', '10 Kislev', 'Liberation of the Mitteler Rebbe'),
    ('yud_tes_kislev', 'Yud-Tes Kislev', '19 Kislev', 'Rosh Hashanah of Chassidus; liberation of the Alter Rebbe'),
    ('chanukah', 'Chanukah', '25 Kislev - 2/3 Teves', ''), ('zos_chanukah', 'Zos Chanukah', '8th day of Chanukah', ''),
    ('asarah_bteves', 'Asarah B\'Teves', '10 Teves', ''), ('chof_daled_teves', 'Chof-Daled Teves', '24 Teves', 'Yahrzeit of the Alter Rebbe'),
    ('hei_teves', 'Hei Teves (Didan Notzach)', '5 Teves', ''),
    ('yud_shevat', 'Yud Shevat', '10 Shevat', 'Yahrzeit of the Frierdiker Rebbe; the Rebbe\'s leadership'),
    ('tu_bshvat', 'Tu B\'Shvat', '15 Shevat', ''), ('chof_beis_shevat', 'Chof-Beis Shevat', '22 Shevat', 'Yahrzeit of Rebbetzin Chaya Mushka'),
    ('rosh_chodesh_shevat', 'Rosh Chodesh Shevat', '1 Shevat', ''),
    ('adar', 'Month of Adar', 'Adar', 'Mishenichnas Adar'), ('purim_katan', 'Purim Katan', '14 Adar I', ''),
    ('taanis_esther', 'Taanis Esther', '13 Adar', ''), ('purim', 'Purim', '14-15 Adar', ''),
    ('nissan', 'Month of Nissan', 'Nissan', ''), ('yud_aleph_nissan', 'Yud-Aleph Nissan', '11 Nissan', 'The Rebbe\'s birthday'),
    ('pesach', 'Pesach', '15-22 Nissan', 'Passover'), ('erev_pesach', 'Erev Pesach and preparations', '14 Nissan', ''),
    ('acharon_shel_pesach', 'Acharon shel Pesach / Moshiach\'s Seudah', '22 Nissan', ''),
    ('sefiras_haomer', 'Sefiras HaOmer', '16 Nissan - 5 Sivan', 'Sefirah'),
    ('pesach_sheni', 'Pesach Sheni', '14 Iyar', ''), ('lag_baomer', 'Lag BaOmer', '18 Iyar', ''),
    ('shavuos', 'Shavuos', '6-7 Sivan', 'Matan Torah'),
    ('gimmel_tammuz', 'Gimmel Tammuz', '3 Tammuz', ''), ('yud_beis_tammuz', 'Yud-Beis Tammuz', '12-13 Tammuz', 'Liberation of the Frierdiker Rebbe'),
    ('shiva_asar_btammuz', 'Shiva Asar B\'Tammuz', '17 Tammuz', ''), ('three_weeks', 'The Three Weeks', '17 Tammuz - 9 Av', 'bein hametzarim'),
    ('nine_days', 'The Nine Days', '1-9 Av', ''), ('tisha_bav', 'Tisha B\'Av', '9 Av', ''), ('tu_bav', 'Tu B\'Av', '15 Av', ''),
    ('chof_av', 'Chof Av', '20 Av', 'Yahrzeit of Rabbi Levi Yitzchak Schneerson'),
    ('elul', 'Month of Elul', 'Elul', ''), ('chai_elul', 'Chai Elul', '18 Elul', 'Birthday of the Baal Shem Tov and the Alter Rebbe'),
    ('selichos', 'Selichos', 'late Elul', ''),
    ('rosh_chodesh', 'Rosh Chodesh', 'monthly', ''), ('shabbos_weekly', 'Shabbos (weekly)', 'weekly', ''),
    ('shabbos_mevarchim', 'Shabbos Mevarchim', 'monthly', ''), ('shabbos_shuva', 'Shabbos Shuvah', '', ''),
    ('shabbos_hagadol', 'Shabbos HaGadol', '', ''), ('shabbos_zachor', 'Shabbos Zachor', '', 'Parshas Zachor'),
    ('shabbos_chazon', 'Shabbos Chazon', '', ''), ('shabbos_nachamu', 'Shabbos Nachamu', '', ''),
    ('shabbos_chazak', 'Shabbos Chazak', '', ''), ('summer_vacation', 'Summer vacation', 'season', ''),
    ('hakhel_year', 'Hakhel year', 'every 7 years', ''), ('winter', 'Winter season', 'season', ''),
], ['id', 'label', 'when', 'aliases'])

PARSHIYOS = ['Bereishis', 'Noach', 'Lech Lecha', 'Vayeira', 'Chayei Sarah', 'Toldos', 'Vayeitzei', 'Vayishlach', 'Vayeishev', 'Mikeitz', 'Vayigash', 'Vayechi',
             'Shemos', 'Va\'eira', 'Bo', 'Beshalach', 'Yisro', 'Mishpatim', 'Terumah', 'Tetzaveh', 'Ki Sisa', 'Vayakhel', 'Pekudei',
             'Vayikra', 'Tzav', 'Shemini', 'Tazria', 'Metzora', 'Acharei', 'Kedoshim', 'Emor', 'Behar', 'Bechukosai',
             'Bamidbar', 'Naso', 'Beha\'aloscha', 'Shelach', 'Korach', 'Chukas', 'Balak', 'Pinchas', 'Matos', 'Masei',
             'Devarim', 'Va\'eschanan', 'Eikev', 'Re\'eh', 'Shoftim', 'Ki Seitzei', 'Ki Savo', 'Nitzavim', 'Vayeilech', 'Haazinu', 'Vezos Haberachah']
import re
V['parshiyos'] = [{'id': re.sub(r'[^a-z]+', '_', p.lower().replace("'", '')).strip('_'), 'label': p} for p in PARSHIYOS]

P = []
def person(id_, label, cat, aliases='', he=''):
    P.append({k: v for k, v in {'id': id_, 'label': label, 'category': cat,
              'aliases': [a.strip() for a in aliases.split(';') if a.strip()], 'he': he}.items() if v not in ('', [])})
# Avos, Tanach
for r in [('adam_harishon', 'Adam HaRishon'), ('noach', 'Noach'), ('avraham_avinu', 'Avraham Avinu', 'Avraham Ovinu'), ('sarah_imeinu', 'Sarah Imeinu'),
          ('yitzchak_avinu', 'Yitzchak Avinu'), ('rivkah_imeinu', 'Rivkah Imeinu'), ('yaakov_avinu', 'Yaakov Avinu'), ('rachel_imeinu', 'Rachel Imeinu'),
          ('leah_imeinu', 'Leah Imeinu'), ('yosef_hatzaddik', 'Yosef HaTzaddik'), ('moshe_rabbeinu', 'Moshe Rabbeinu'), ('aharon_hakohen', 'Aharon HaKohen'),
          ('miriam_haneviah', 'Miriam HaNeviah'), ('yehoshua_bin_nun', 'Yehoshua bin Nun'), ('chana_mother_of_shmuel', 'Chana (mother of Shmuel)'),
          ('shmuel_hanavi', 'Shmuel HaNavi', 'shmuel hanovie'), ('david_hamelech', 'Dovid HaMelech', 'David HaMelech; Davod HaMelech'),
          ('shlomo_hamelech', 'Shlomo HaMelech'), ('eliyahu_hanavi', 'Eliyahu HaNavi', 'Eliyohu Hanovie; Eliyahu Hanavie'), ('elisha_hanavi', 'Elisha HaNavi'),
          ('yonah_hanavi', 'Yonah HaNavi'), ('yirmiyahu_hanavi', 'Yirmiyahu HaNavi'), ('yeshayahu_hanavi', 'Yeshayahu HaNavi'), ('daniel', 'Daniel'),
          ('chizkiyahu_hamelech', 'Chizkiyahu HaMelech'), ('mordechai', 'Mordechai'), ('esther_hamalkah', 'Esther HaMalkah'), ('yehudis', 'Yehudis'),
          ('chashmonaim', 'The Chashmonaim (Maccabees)', 'Yehudah HaMaccabi; Matisyahu'), ('korach', 'Korach'), ('haman', 'Haman'), ('pharaoh', 'Pharaoh'),
          ('nevuchadnetzar', 'Nevuchadnetzar'), ('antiochus', 'Antiochus'), ('bilam', 'Bilam')]:
    person(r[0], r[1], 'tanach', r[2] if len(r) > 2 else '')
for r in [('hillel', 'Hillel HaZaken'), ('shammai', 'Shammai'), ('rabbi_akiva', 'Rabbi Akiva', 'Rebbe Akiva; Rebi Akiva'),
          ('rabbi_shimon_bar_yochai', 'Rabbi Shimon bar Yochai (Rashbi)', 'Rashbi'), ('rabbi_meir_baal_haness', 'Rabbi Meir Baal HaNess'),
          ('rabbi_yochanan_ben_zakai', 'Rabbi Yochanan ben Zakai'), ('rabban_gamliel', 'Rabban Gamliel'), ('rabbi_chanina_ben_dosa', 'Rabbi Chanina ben Dosa'),
          ('nachum_ish_gamzu', 'Nachum Ish Gamzu'), ('choni_hamaagel', 'Choni HaMaagel'), ('rabbi_eliezer_ben_hurkenos', 'Rabbi Eliezer ben Hurkenos'),
          ('rabbi_yehoshua_ben_chanania', 'Rabbi Yehoshua ben Chanania'), ('rabbi_yehudah_hanasi', 'Rabbi Yehudah HaNasi'), ('onkelos', 'Onkelos', 'Unkelus'),
          ('rabbi_tarfon', 'Rabbi Tarfon'), ('rabbi_chanina', 'Rabbi Chanina'), ('dama_ben_nesina', 'Dama ben Nesina')]:
    person(r[0], r[1], 'sages', r[2] if len(r) > 2 else '')
for r in [('rashi', 'Rashi'), ('rabbi_yitzchak_father_of_rashi', 'Rabbi Yitzchak (father of Rashi)'), ('rambam', 'Rambam (Maimonides)'),
          ('ramban', 'Ramban'), ('rabbi_yehudah_halevi', 'Rabbi Yehudah HaLevi'), ('ibn_ezra', 'Rabbi Avraham ibn Ezra'), ('arizal', 'The Arizal'),
          ('beis_yosef', 'Rabbi Yosef Karo (Beis Yosef)'), ('maharal', 'The Maharal of Prague'), ('ohr_hachayim', 'The Ohr HaChayim', 'Ohr Hachayim'),
          ('vilna_gaon', 'The Vilna Gaon'), ('chacham_nissim', 'Chacham Nissim (Alexandria)')]:
    person(r[0], r[1], 'rishonim_acharonim', r[2] if len(r) > 2 else '')
for r in [('baal_shem_tov', 'The Baal Shem Tov', 'Besht; Rabbi Yisroel Baal Shem Tov; Baal Shantiv', 'הבעל שם טוב'),
          ('adel_daughter_of_besht', 'Adel, daughter of the Baal Shem Tov', 'Adul; Udel'),
          ('maggid_of_mezritch', 'The Maggid of Mezritch', 'Mezritcher Maggid; Mizritch HaMaggid; Mizrit Shemagid'),
          ('rabbi_zusha_of_anipoli', 'Rabbi Zusha of Anipoli', 'Reb Zusha; Anepole'),
          ('rabbi_elimelech_of_lizhensk', 'Rabbi Elimelech of Lizhensk'),
          ('rabbi_levi_yitzchak_of_berditchev', 'Rabbi Levi Yitzchak of Berditchev', 'Berditchever; Bardichever'),
          ('rabbi_menachem_mendel_of_horodok', 'Rabbi Menachem Mendel of Horodok (Vitebsk)', 'Horodoker; Haradokar'),
          ('rabbi_avraham_hamalach', 'Rabbi Avraham HaMalach'), ('shpoler_zeide', 'The Shpoler Zeide (Rabbi Aryeh Leib of Shpola)', 'Shpole Zeide; Shpoller Zeide; Sphole Zeide'),
          ('rabbi_moshe_sofer_of_pshevorsk', 'Rabbi Moshe Sofer of Pshevorsk', 'Reb Moshe Soifer'), ('rabbi_pinchas_of_koretz', 'Rabbi Pinchas of Koretz'),
          ('rabbi_boruch_of_mezhibuzh', 'Rabbi Boruch of Mezhibuzh'), ('rabbi_yisroel_of_ruzhin', 'Rabbi Yisroel of Ruzhin', 'Ruzhiner'),
          ('rabbi_yaakov_yosef_of_polonye', 'Rabbi Yaakov Yosef of Polonye'), ('rabbi_nachman_of_breslov', 'Rabbi Nachman of Breslov'),
          ('rabbi_meir_of_premishlan', 'Rabbi Meir of Premishlan'), ('rabbi_shmelke_of_nikolsburg', 'Rabbi Shmelke of Nikolsburg')]:
    person(r[0], r[1], 'baal_shem_tov_circle_and_chassidic_masters', r[2] if len(r) > 2 else '', r[3] if len(r) > 3 else '')
for r in [('alter_rebbe', 'The Alter Rebbe (Rabbi Schneur Zalman of Liadi)', 'Baal HaTanya; Rabbi Schneur Zalman; Alta Rebbe', 'אדמו"ר הזקן'),
          ('mitteler_rebbe', 'The Mitteler Rebbe (Rabbi DovBer)', 'Mittler Rebbe; Mithla Rebbe'),
          ('tzemach_tzedek', 'The Tzemach Tzedek (Rabbi Menachem Mendel)'), ('rebbe_maharash', 'The Rebbe Maharash (Rabbi Shmuel)', 'Maharash'),
          ('rebbe_rashab', 'The Rebbe Rashab (Rabbi Sholom DovBer)', 'Rashab'),
          ('frierdiker_rebbe', 'The Frierdiker Rebbe (Rabbi Yosef Yitzchak, Rebbe Rayatz)', 'Rayatz; Previous Rebbe; Friedrich Rebbe; Fridik Rebbe'),
          ('the_rebbe', 'The Rebbe (Rabbi Menachem Mendel Schneerson)', 'Lubavitcher Rebbe; Rebbe Shlita; Rebbe Melech HaMoshiach')]:
    person(r[0], r[1], 'chabad_rebbeim', r[2] if len(r) > 2 else '', r[3] if len(r) > 3 else '')
for r in [('rebbetzin_chana', 'Rebbetzin Chana Schneerson (the Rebbe\'s mother)', 'Rebbe Tzenchana'),
          ('rabbi_levi_yitzchak_schneerson', 'Rabbi Levi Yitzchak Schneerson (the Rebbe\'s father)'),
          ('rebbetzin_chaya_mushka', 'Rebbetzin Chaya Mushka (the Rebbe\'s wife)'), ('rebbetzin_rivkah', 'Rebbetzin Rivkah (wife of the Rebbe Maharash)'),
          ('rebbetzin_shterna_sarah', 'Rebbetzin Shterna Sarah (wife of the Rebbe Rashab)'),
          ('rebbetzin_nechama_dina', 'Rebbetzin Nechama Dina (wife of the Frierdiker Rebbe)'),
          ('rabbi_nochum_son_of_mitteler_rebbe', 'Rabbi Nochum (son of the Mitteler Rebbe)')]:
    person(r[0], r[1], 'rebbeim_family', r[2] if len(r) > 2 else '')
for r in [('rabbi_shmuel_munkes', 'Rabbi Shmuel Munkes'), ('rabbi_hillel_of_paritch', 'Rabbi Hillel of Paritch'),
          ('rabbi_meir_refoels', 'Reb Meir Refoels', 'R Meir Refaels'), ('rabbi_yaakov_mordechai_of_poltava', 'Rabbi Yaakov Mordechai of Poltava'),
          ('rabbi_mendel_futerfas', 'Rabbi Mendel Futerfas'), ('rabbi_shmaryahu_gurary', 'Rabbi Shmaryahu Gurary')]:
    person(r[0], r[1], 'chassidim', r[2] if len(r) > 2 else '')
V['people_categories'] = ['tanach', 'sages', 'rishonim_acharonim', 'baal_shem_tov_circle_and_chassidic_masters', 'chabad_rebbeim', 'rebbeim_family', 'chassidim']
V['people'] = P
V['people_roles'] = ['central', 'appears', 'mentioned', 'teaching_cited']

V['works'] = L([
    ('chumash', 'Chumash (Torah)'), ('rashi_on_chumash', 'Rashi on Chumash'), ('neviim', 'Nevi\'im'), ('tehillim', 'Tehillim'),
    ('megillas_esther', 'Megillas Esther'), ('mishnah', 'Mishnah'), ('pirkei_avos', 'Pirkei Avos'), ('gemara', 'Talmud Bavli (Gemara)'),
    ('yerushalmi', 'Talmud Yerushalmi'), ('midrash', 'Midrash'), ('zohar', 'Zohar'), ('rambam_mishneh_torah', 'Rambam, Mishneh Torah'),
    ('shulchan_aruch', 'Shulchan Aruch'), ('shulchan_aruch_harav', 'Shulchan Aruch HaRav'), ('tanya', 'Tanya'), ('siddur', 'Siddur'),
    ('haggadah', 'Haggadah (with the Alter Rebbe\'s customs)'), ('torah_or_likkutei_torah', 'Torah Or / Likkutei Torah'),
    ('sichos_of_the_rebbe', 'A sichah of the Rebbe'), ('likkutei_sichos', 'Likkutei Sichos'), ('igros_kodesh', 'Igros Kodesh'),
    ('hayom_yom', 'Hayom Yom'), ('sefer_hasichos', 'Sefer HaSichos'), ('likkutei_dibburim', 'Likkutei Dibburim'),
    ('maamarim', 'Maamarim (Chassidic discourses)'), ('shivchei_habesht', 'Shivchei HaBesht'), ('ateres_rosh', 'Ateres Rosh (Mitteler Rebbe)'),
    ('likkutei_levi_yitzchak', 'Likkutei Levi Yitzchak'), ('sippurei_chassidim', 'Sippurei Chassidim (Zevin)'),
    ('frierdiker_rebbe_memoirs', 'The Frierdiker Rebbe\'s memoirs / talks'), ('oral_tradition', 'Chassidic oral tradition ("Chassidim tell")'),
], ['id', 'label'])

V['study_units'] = ['perek', 'siman', 'seif', 'page', 'section']
V['production_notes'] = ['redo', 'new', 'bad_recording', 'unedited', 'needs_splicing', 'needs_editing', 'good', 'final', 'double', 'copy', 'duration_label', 'take_letter']

V['asr_glossary'] = [{'correct': c, 'heard': [h.strip() for h in hs.split(';')]} for c, hs in [
    ('Hakochainik (march)', 'Hak Echynik; Hakka Chynik; Akashinic; Akashidim'), ('Studio 604', 'RStudio 604'),
    ('Im Yirtzeh Hashem', 'Amir Tzah Hashem; Emir Tzah Hashem; Ymir Tzachem'), ('tayere kinderlach', 'Tairi Kindelach; Teireh Kindelach'),
    ('Yiddishe kinderlach', 'Yiddishik Kindlech; Yiddishikindelach'), ('Rebbe shlita', 'Rebbe Schlitter'), ('Morah', 'Maura'),
    ('Shpoler Zeide', 'Shbola Zeda; Shvala Zeda; Shpala Zeda; Shvalizator'), ('Rebbetzin Chana', 'Rebbe Tzenchana; Tzemachana; Zinchana'),
    ('yahrzeit', 'Yerzite; Yorzeit; yurtzeit'), ('poritz', 'parrots; purits; pirates (when a nobleman is meant); Puritz'),
    ('negel vasser', 'Nagelvasa; Nagelwasser; nickel vassal'), ('netilas yadayim', 'Natilas Yodoyim'), ('Beis HaMikdash', 'Besamikdash; Ves HaMikdosh'),
    ('Kosel HaMaaravi', 'Kosalhamaravi'), ('Tammuz', 'Tamaz; Tommos'), ('Shiva Asar B\'Tammuz', 'Shivos Abitamos'), ('Mitteler Rebbe', 'Mithla Rebbe'),
    ('Baal HaTanya', 'Baal HaTanyor'), ('golus', 'Golis'), ('kibbud av va\'em', 'Kivud Ovaim; Kibbud Ov Voaim'), ('yarmulke', 'Yalmukah'),
    ('Yisborach', 'Yesbarech'), ('Mezritcher Maggid', 'Mizrit Shemagid; Mizritch HaMaget; Mizrach HaMaged'), ('Horodoker', 'Haradokar'),
    ('Frierdiker Rebbe', 'Fridik; Freedek; Friedrich Rebbe'), ('Maharash', 'Marash; Maharaj'), ('Ushpizin', 'Hushbizim'), ('Chol HaMoed', 'Chalamite'),
    ('Beis Din shel Maaleh', 'Beistin Shelmila'), ('Torah Vodaas', 'tore a sammas'), ('Tomchei Temimim', 'Yeshiva Tremchitim; Teimchei Tmimim'),
    ('alav/aleha hashalom', 'Allah Shulam; Oliver Shulam'), ('Torah', 'Taira; Teda; Teira'), ('Yidden', 'Theoden; Yidn'), ('Iyar', 'Ir'),
    ('Dalet Iyar', 'Dalad Ir'), ('Chumash', 'Chumish'), ('Acharei', 'Achrei'), ('Monsey', 'Mansi'), ('Parshas Pekudei', 'Pasha\'s picades'),
    ('Shiviti', 'Shavisi'), ('Lagvina (sponsor)', 'Lagreena; Lagvina'), ('Hachnasas Kallah', 'Chachnosas Kala'), ('kopecks', 'cupkis'),
    ('Rosh Chodesh Shevat', 'Rishchei DeShvat; Rosh Chauda Shabbat'), ('Anipoli', 'Anepole; Anupole; Annapoli'), ('Moshe (name)', 'Moshiach (frequent ASR substitution)'),
]]
V['asr_glossary_note'] = 'Used by the fill-in prompt to read the transcript correctly and by the site as search synonyms. Never copy ASR spellings into display fields.'

json.dump(V, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in V.items() if isinstance(v, list)})

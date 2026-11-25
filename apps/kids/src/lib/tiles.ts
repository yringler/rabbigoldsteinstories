/**
 * Browse facets: the exact vocabulary mappings of docs/sites/kids.md §5, with kid labels, icons,
 * colours and one-sentence descriptions (written here, never generated at runtime).
 * Browser-safe (the search page and client scripts read labels from here).
 */

export type Facet = "topics" | "midos" | "mitzvos" | "calendar" | "people";

export interface Tile {
  /** URL slug (/topic/<slug>, /midah/<slug>, /mitzvah/<slug>, /holiday/<slug>, /hero/<id>). */
  slug: string;
  label: string;
  /** Hebrew term shown small under the label (midos). */
  he?: string;
  facet: Facet;
  ids: readonly string[];
  icon: string;
  color: string;
  description: string;
}

/** Ids that never become tiles (§5 "too dense"); they stay in search and similarity. */
export const TOO_DENSE = { topics: ["calendar"], mitzvos: ["shema", "torah_study"] } as const;

/** Minimum items in the active band for a tile/tag page (§5) and for a shelf (§4.1). */
export const TILE_MIN = 8;
export const SHELF_MIN = 4;

const C = {
  blue: "#1F5FBF",
  sky: "#2A9FD0",
  grape: "#7A4FC2",
  coral: "#E0533F",
  leaf: "#2E9E6B",
  sun: "#E8A317",
  teal: "#1B998B",
  rose: "#D94F86",
  navy: "#2B3F8C",
  amber: "#D9822B",
  forest: "#3F7D3A",
  plum: "#9B3D8F",
} as const;

export const TOPIC_TILES: readonly Tile[] = [
  {
    slug: "baal-shem-tov",
    label: "The Baal Shem Tov",
    facet: "topics",
    ids: ["baal_shem_tov_and_students"],
    icon: "forest-wagon",
    color: C.forest,
    description:
      "Stories of the Baal Shem Tov and his students, who taught that every Jew is precious.",
  },
  {
    slug: "rebbeim",
    label: "The Rebbeim",
    facet: "topics",
    ids: ["chabad_rebbeim", "the_rebbe", "hiskashrus"],
    icon: "building-770",
    color: C.navy,
    description: "Stories about the Chabad Rebbeim and the chassidim who stayed close to them.",
  },
  {
    slug: "tzaddikim",
    label: "Tzaddikim and Chassidim",
    facet: "topics",
    ids: ["chassidic_masters", "chassidim", "tzaddikim_stories"],
    icon: "hat",
    color: C.plum,
    description: "Holy tzaddikim and simple chassidim with big hearts.",
  },
  {
    slug: "torah-heroes",
    label: "Torah Heroes",
    facet: "topics",
    ids: ["tanach", "sages", "great_rabbis", "torah_heroes"],
    icon: "torah-scroll",
    color: C.blue,
    description: "Heroes from the Torah, the Sages and the great rabbis of long ago.",
  },
  {
    slug: "hashem-is-watching",
    label: "Hashem Is Watching",
    facet: "topics",
    ids: ["emunah_bitachon", "hashgacha_pratis"],
    icon: "umbrella",
    color: C.teal,
    description: "Hashem takes care of every one of us, even when we can't see how.",
  },
  {
    slug: "miracles",
    label: "Miracles",
    facet: "topics",
    ids: ["miracles"],
    icon: "sparkles",
    color: C.sun,
    description: "Amazing things that only Hashem could make happen.",
  },
  {
    slug: "kindness",
    label: "Kindness",
    facet: "topics",
    ids: ["kindness_and_community"],
    icon: "heart-hand",
    color: C.rose,
    description: "People who help, share and look after each other.",
  },
  {
    slug: "being-my-best",
    label: "Being My Best",
    facet: "topics",
    ids: ["character", "teshuvah"],
    icon: "mountain-flag",
    color: C.amber,
    description: "Growing a little better every day, and starting again when we slip.",
  },
  {
    slug: "davening-and-brachos",
    label: "Davening and Brachos",
    facet: "topics",
    ids: ["prayer_and_brachos", "morning_routine"],
    icon: "siddur",
    color: C.grape,
    description: "Talking to Hashem and thanking Him for everything.",
  },
  {
    slug: "learning-torah",
    label: "Learning Torah",
    facet: "topics",
    ids: ["torah_study", "chassidus_tanya"],
    icon: "shtender",
    color: C.navy,
    description: "The joy of learning Torah, a little every day.",
  },
  {
    slug: "shabbos-and-mitzvos",
    label: "Shabbos and Mitzvos",
    facet: "topics",
    ids: ["shabbos", "mitzvos_in_daily_life", "kashrus", "halachah"],
    icon: "candles",
    color: C.coral,
    description: "Shabbos, kosher food and the mitzvos we do every day.",
  },
  {
    slug: "moshiach",
    label: "Moshiach and the Beis Hamikdash",
    facet: "topics",
    ids: ["moshiach_geulah", "beis_hamikdash_eretz_yisroel"],
    icon: "beis-hamikdash",
    color: C.sun,
    description: "Waiting for Moshiach and the rebuilt Beis Hamikdash in Yerushalayim.",
  },
  {
    slug: "brave-jews",
    label: "Brave Jews Long Ago",
    facet: "topics",
    ids: ["jewish_history", "mesiras_nefesh_kiddush_hashem"],
    icon: "shield",
    color: C.blue,
    description: "Jews who stayed strong and kept the Torah in hard times.",
  },
  {
    slug: "family-and-home",
    label: "Family and Home",
    facet: "topics",
    ids: ["family_and_home", "family_heritage"],
    icon: "house",
    color: C.coral,
    description: "Stories about families, homes and the people we love.",
  },
  {
    slug: "hashems-world",
    label: "Hashem's World",
    facet: "topics",
    ids: ["hashem_in_nature"],
    icon: "tree-sun",
    color: C.leaf,
    description: "Animals, plants, sky and sea: everything Hashem made.",
  },
  {
    slug: "tzivos-hashem",
    label: "Tzivos Hashem",
    facet: "topics",
    ids: ["tzivos_hashem"],
    icon: "badge",
    color: C.sky,
    description: "Hashem's army of kids, with missions, ranks and mitzvah campaigns.",
  },
];

export const MIDOS_TILES: readonly Tile[] = [
  {
    slug: "trusting-hashem",
    label: "Trusting Hashem",
    he: "Emunah",
    facet: "midos",
    ids: ["emunah", "bitachon"],
    icon: "anchor",
    color: C.teal,
    description: "Knowing that Hashem is with us and everything will be good.",
  },
  {
    slug: "loving-every-jew",
    label: "Loving Every Jew",
    he: "Ahavas Yisroel",
    facet: "midos",
    ids: ["ahavas_yisroel", "achdus"],
    icon: "two-hearts",
    color: C.rose,
    description: "Every Jew is our brother or sister, and we love them all.",
  },
  {
    slug: "kindness-and-giving",
    label: "Kindness and Giving",
    he: "Chesed",
    facet: "midos",
    ids: ["chesed", "generosity"],
    icon: "gift",
    color: C.coral,
    description: "Giving with a big heart and a happy face.",
  },
  {
    slug: "being-happy",
    label: "Being Happy",
    he: "Simcha",
    facet: "midos",
    ids: ["simcha", "contentment", "no_jealousy"],
    icon: "smile-sun",
    color: C.sun,
    description: "Being happy with what we have, and happy for others too.",
  },
  {
    slug: "saying-thank-you",
    label: "Saying Thank You",
    he: "Hakaras Hatov",
    facet: "midos",
    ids: ["hakaras_hatov"],
    icon: "thank-you",
    color: C.amber,
    description: "Noticing the good others do for us, and saying thank you.",
  },
  {
    slug: "respect",
    label: "Respect",
    he: "Kibbud",
    facet: "midos",
    ids: ["kibbud"],
    icon: "medal",
    color: C.navy,
    description: "Treating parents, teachers and everyone with honour.",
  },
  {
    slug: "telling-the-truth",
    label: "Telling the Truth",
    he: "Emes",
    facet: "midos",
    ids: ["emes"],
    icon: "truth",
    color: C.blue,
    description: "Saying what is true, even when it is hard.",
  },
  {
    slug: "being-brave",
    label: "Being Brave",
    he: "Gevurah",
    facet: "midos",
    ids: ["courage", "mesiras_nefesh"],
    icon: "ram",
    color: C.amber,
    description: "Being strong and brave to do what Hashem wants.",
  },
  {
    slug: "listening-to-hashem",
    label: "Listening to Hashem",
    he: "Kabbalas Ol",
    facet: "midos",
    ids: ["kabbalas_ol", "yiras_shamayim"],
    icon: "ear",
    color: C.grape,
    description: "Doing what Hashem asks, even before we understand why.",
  },
  {
    slug: "trying-my-hardest",
    label: "Trying My Hardest",
    he: "Zerizus",
    facet: "midos",
    ids: ["hasmadah", "zerizus", "valuing_time", "responsibility"],
    icon: "rocket",
    color: C.coral,
    description: "Working hard, being quick to do good and using every minute.",
  },
  {
    slug: "being-humble",
    label: "Being Humble",
    he: "Anavah",
    facet: "midos",
    ids: ["anavah"],
    icon: "seedling",
    color: C.leaf,
    description: "Not showing off, and remembering that our gifts come from Hashem.",
  },
  {
    slug: "staying-calm",
    label: "Staying Calm",
    he: "Savlanus",
    facet: "midos",
    ids: ["self_control", "savlanus", "controlling_anger", "resisting_bad_influence"],
    icon: "wave",
    color: C.sky,
    description: "Taking a deep breath, waiting patiently and not getting angry.",
  },
  {
    slug: "kind-words-and-peace",
    label: "Kind Words and Peace",
    he: "Shalom",
    facet: "midos",
    ids: ["shemiras_halashon", "shalom", "forgiveness", "dan_lkaf_zchus"],
    icon: "dove",
    color: C.teal,
    description: "Speaking nicely, forgiving and judging others kindly.",
  },
];

export const MITZVOS_TILES: readonly Tile[] = [
  {
    slug: "tzedakah",
    label: "Tzedakah",
    facet: "mitzvos",
    ids: ["tzedakah"],
    icon: "pushka",
    color: C.leaf,
    description: "Giving charity to help people who need it.",
  },
  {
    slug: "davening-and-tehillim",
    label: "Davening and Tehillim",
    facet: "mitzvos",
    ids: ["davening", "tehillim"],
    icon: "tehillim",
    color: C.grape,
    description: "Davening every day and saying Tehillim.",
  },
  {
    slug: "brachos",
    label: "Brachos",
    facet: "mitzvos",
    ids: ["brachos"],
    icon: "apple",
    color: C.coral,
    description: "Saying a bracha before and after we eat.",
  },
  {
    slug: "welcoming-guests",
    label: "Welcoming Guests",
    facet: "mitzvos",
    ids: ["hachnasas_orchim"],
    icon: "open-door",
    color: C.amber,
    description: "Opening our homes and making guests feel welcome.",
  },
  {
    slug: "shabbos",
    label: "Shabbos",
    facet: "mitzvos",
    ids: ["shabbos_candles", "shabbos", "kiddush", "havdalah", "melave_malka"],
    icon: "challah",
    color: C.sun,
    description: "Candles, Kiddush, challah and Havdalah: Shabbos is special.",
  },
  {
    slug: "honouring-parents",
    label: "Honouring Parents",
    facet: "mitzvos",
    ids: ["kibbud_av_vaem", "kibbud_zekeinim"],
    icon: "flowers",
    color: C.rose,
    description: "Listening to and caring for parents and grandparents.",
  },
  {
    slug: "helping-others",
    label: "Helping Others",
    facet: "mitzvos",
    ids: [
      "ahavas_yisroel_mitzvah",
      "gemilus_chasadim",
      "hashavas_aveidah",
      "bikur_cholim",
      "pidyon_shvuyim",
      "hachnasas_kallah",
    ],
    icon: "helping-hand",
    color: C.teal,
    description: "Visiting the sick, returning lost things and lending a hand.",
  },
  {
    slug: "teshuvah",
    label: "Teshuvah",
    facet: "mitzvos",
    ids: ["teshuvah"],
    icon: "u-turn",
    color: C.blue,
    description: "Saying sorry and coming back to Hashem.",
  },
  {
    slug: "twelve-pesukim",
    label: "The 12 Pesukim",
    facet: "mitzvos",
    ids: ["twelve_pesukim"],
    icon: "twelve",
    color: C.navy,
    description: "The twelve Torah verses every child can know by heart.",
  },
  {
    slug: "good-morning-mitzvos",
    label: "Good Morning Mitzvos",
    facet: "mitzvos",
    ids: ["negel_vasser", "modeh_ani"],
    icon: "washing-cup",
    color: C.sky,
    description: "Modeh Ani and negel vasser, first thing in the morning.",
  },
  {
    slug: "mezuzah",
    label: "Mezuzah",
    facet: "mitzvos",
    ids: ["mezuzah"],
    icon: "mezuzah",
    color: C.amber,
    description: "The mezuzah on our door that reminds us Hashem is here.",
  },
  {
    slug: "tefillin-tzitzis-yarmulke",
    label: "Tefillin, Tzitzis and Yarmulke",
    facet: "mitzvos",
    ids: ["tefillin", "tzitzis", "yarmulke", "payos", "upsherin"],
    icon: "yarmulke",
    color: C.navy,
    description: "The mitzvos we wear, from an upsherin onwards.",
  },
  {
    slug: "kosher",
    label: "Kosher",
    facet: "mitzvos",
    ids: ["kashrus"],
    icon: "kosher-pot",
    color: C.leaf,
    description: "Eating only kosher food.",
  },
  {
    slug: "shul-and-seforim",
    label: "Shul and Seforim",
    facet: "mitzvos",
    ids: ["kavod_shul"],
    icon: "seforim",
    color: C.plum,
    description: "Treating the shul and our holy books with respect.",
  },
  {
    slug: "sharing-yiddishkeit",
    label: "Sharing Yiddishkeit",
    facet: "mitzvos",
    ids: ["mivtzoim", "chinuch", "chitas", "rambam_daily"],
    icon: "mitzvah-tank",
    color: C.coral,
    description: "Helping other Jews do mitzvos, and learning Chitas and Rambam.",
  },
];

/** Hebrew month numbers as in @hebcal/core (Nisan = 1 … Adar II = 13). "adar" = Adar, or Adar II in a leap year. */
export type HMonth =
  | "nisan"
  | "iyar"
  | "sivan"
  | "tammuz"
  | "av"
  | "elul"
  | "tishrei"
  | "cheshvan"
  | "kislev"
  | "teves"
  | "shevat"
  | "adar";
export type HDay = readonly [HMonth, number];

export interface HolidayTile extends Tile {
  facet: "calendar";
  /** "Coming up" windows in Hebrew dates (inclusive). Empty = browse only. */
  windows: readonly (readonly [HDay, HDay])[];
  /** The day the holiday is "on" (greeting: "Chanukah is in 10 days"). */
  main?: HDay;
  /** Chassidishe Yomim Tovim: one date per id; each is "coming up" for the 7 days before it. */
  dates?: Readonly<Record<string, HDay>>;
  /** Sub-chip labels for the calendar ids (default: the vocabulary label). */
  chips?: Readonly<Record<string, string>>;
}

export const HOLIDAY_TILES: readonly HolidayTile[] = [
  {
    slug: "rosh-hashanah-yom-kippur",
    label: "Rosh Hashanah and Yom Kippur",
    facet: "calendar",
    ids: [
      "elul",
      "chai_elul",
      "chof_hei_elul",
      "selichos",
      "rosh_hashanah",
      "tzom_gedaliah",
      "aseres_yemei_teshuvah",
      "shabbos_shuva",
      "vav_tishrei",
      "yom_kippur",
      "yud_gimmel_tishrei",
    ],
    icon: "shofar",
    color: "#B5651D",
    description: "Blowing the shofar, a sweet new year and Yom Kippur.",
    windows: [
      [
        ["elul", 1],
        ["tishrei", 10],
      ],
    ],
    main: ["tishrei", 1],
  },
  {
    slug: "sukkos",
    label: "Sukkos and Simchas Torah",
    facet: "calendar",
    ids: [
      "sukkos",
      "simchas_beis_hashoeva",
      "hoshana_rabbah",
      "shemini_atzeres_simchas_torah",
      "shabbos_bereishis",
    ],
    icon: "sukkah",
    color: "#3F7D3A",
    description: "Sitting in the sukkah, shaking the lulav and dancing with the Torah.",
    windows: [
      [
        ["tishrei", 11],
        ["tishrei", 30],
      ],
    ],
    main: ["tishrei", 15],
  },
  {
    slug: "chanukah",
    label: "Chanukah",
    facet: "calendar",
    ids: ["chanukah", "zos_chanukah"],
    icon: "menorah",
    color: "#1D3F8F",
    description: "Lighting the menorah and remembering the miracle of the oil.",
    windows: [
      [
        ["kislev", 11],
        ["teves", 2],
      ],
    ],
    main: ["kislev", 25],
  },
  {
    slug: "tu-bishvat",
    label: "Tu BiShvat",
    facet: "calendar",
    ids: ["tu_bshvat", "shabbos_shirah", "rosh_chodesh_shevat"],
    icon: "fruit-tree",
    color: "#2E8A4F",
    description: "The new year for trees, with fruit from Eretz Yisroel.",
    windows: [
      [
        ["shevat", 1],
        ["shevat", 15],
      ],
    ],
    main: ["shevat", 15],
  },
  {
    slug: "purim",
    label: "Purim",
    facet: "calendar",
    ids: [
      "purim",
      "adar",
      "taanis_esther",
      "shabbos_zachor",
      "shabbos_shekalim",
      "purim_katan",
      "zayin_adar",
    ],
    icon: "grogger",
    color: "#7A4FC2",
    description: "The Megillah, mishloach manos and a very happy Purim.",
    windows: [
      [
        ["adar", 1],
        ["adar", 15],
      ],
    ],
    main: ["adar", 14],
  },
  {
    slug: "pesach",
    label: "Pesach",
    facet: "calendar",
    ids: [
      "nissan",
      "shabbos_hagadol",
      "yud_aleph_nissan",
      "yud_gimmel_nissan",
      "erev_pesach",
      "pesach",
      "acharon_shel_pesach",
      "pesach_sheni",
    ],
    icon: "matzah",
    color: "#2E9E6B",
    description: "Getting ready, the Seder and leaving Mitzrayim.",
    windows: [
      [
        ["adar", 25],
        ["nisan", 22],
      ],
      [
        ["iyar", 12],
        ["iyar", 14],
      ],
    ],
    main: ["nisan", 15],
    chips: {
      nissan: "Nissan",
      shabbos_hagadol: "Shabbos Hagadol",
      erev_pesach: "Getting ready",
      pesach: "The Seder",
      pesach_sheni: "Pesach Sheni",
    },
  },
  {
    slug: "sefirah-lag-baomer",
    label: "Sefirah and Lag BaOmer",
    facet: "calendar",
    ids: ["sefiras_haomer", "lag_baomer"],
    icon: "bonfire",
    color: "#D9822B",
    description: "Counting the days to Matan Torah, and the Lag BaOmer parade.",
    windows: [
      [
        ["nisan", 23],
        ["iyar", 18],
      ],
    ],
    main: ["iyar", 18],
  },
  {
    slug: "shavuos",
    label: "Shavuos",
    facet: "calendar",
    ids: ["shavuos"],
    icon: "luchos",
    color: "#2B8FBF",
    description: "Receiving the Torah at Har Sinai.",
    windows: [
      [
        ["iyar", 19],
        ["sivan", 7],
      ],
    ],
    main: ["sivan", 6],
  },
  {
    slug: "three-weeks",
    label: "The Three Weeks",
    facet: "calendar",
    ids: [
      "three_weeks",
      "shiva_asar_btammuz",
      "nine_days",
      "tisha_bav",
      "shabbos_chazon",
      "shabbos_nachamu",
      "tu_bav",
      "asarah_bteves",
    ],
    icon: "wall",
    color: "#5B6577",
    description: "Remembering the Beis Hamikdash and hoping for the Geulah.",
    windows: [
      [
        ["tammuz", 14],
        ["av", 15],
      ],
      [
        ["teves", 7],
        ["teves", 10],
      ],
    ],
    main: ["av", 9],
  },
  {
    slug: "chassidishe-yomim-tovim",
    label: "Chassidishe Yomim Tovim",
    facet: "calendar",
    ids: [
      "yud_tes_kislev",
      "yud_kislev",
      "yud_daled_kislev",
      "chof_cheshvan",
      "hei_teves",
      "chof_teves",
      "chof_daled_teves",
      "yud_shevat",
      "chof_beis_shevat",
      "chof_zayin_adar",
      "yud_beis_tammuz",
      "gimmel_tammuz",
      "chof_av",
    ],
    icon: "calendar-star",
    color: "#9B3D8F",
    description: "Special days in the Chabad calendar, like Yud-Tes Kislev and Yud Shevat.",
    windows: [],
    dates: {
      yud_tes_kislev: ["kislev", 19],
      yud_kislev: ["kislev", 10],
      yud_daled_kislev: ["kislev", 14],
      chof_cheshvan: ["cheshvan", 20],
      hei_teves: ["teves", 5],
      chof_teves: ["teves", 20],
      chof_daled_teves: ["teves", 24],
      yud_shevat: ["shevat", 10],
      chof_beis_shevat: ["shevat", 22],
      chof_zayin_adar: ["adar", 27],
      yud_beis_tammuz: ["tammuz", 12],
      gimmel_tammuz: ["tammuz", 3],
      chof_av: ["av", 20],
    },
  },
  {
    slug: "summer",
    label: "Summer",
    facet: "calendar",
    ids: ["summer_vacation"],
    icon: "sun",
    color: "#E8A317",
    description: "Stories for long summer days and camp.",
    windows: [
      [
        ["sivan", 15],
        ["av", 30],
      ],
    ],
  },
  {
    slug: "shabbos-rosh-chodesh",
    label: "Shabbos and Rosh Chodesh",
    facet: "calendar",
    ids: [
      "rosh_chodesh",
      "shabbos_mevarchim",
      "shabbos_weekly",
      "shabbos_chazak",
      "cheshvan",
      "kislev",
      "winter",
      "hakhel_year",
    ],
    icon: "moon",
    color: "#2B3F8C",
    description: "Every Shabbos, every new month and the seasons of the year.",
    windows: [],
  },
];

/** Hero groups (§5.6) by vocabulary category. */
export const HERO_GROUPS: readonly { label: string; categories: readonly string[] }[] = [
  { label: "From the Torah", categories: ["tanach"] },
  { label: "The Sages", categories: ["sages"] },
  { label: "Great Rabbis", categories: ["rishonim_acharonim"] },
  {
    label: "The Baal Shem Tov and Tzaddikim",
    categories: ["baal_shem_tov_circle_and_chassidic_masters"],
  },
  { label: "The Rebbeim", categories: ["chabad_rebbeim", "rebbeim_family"] },
  { label: "Chassidim", categories: ["chassidim"] },
];

/**
 * Hero tiles: kid label and emblem (an object or scene, never a figure; owner-approved list).
 * A person qualifies by data (central/appears in 5+ pool items); one without an entry here gets no
 * tile, and covers fall through to the next emblem rule.
 */
export const HEROES: Readonly<
  Record<string, { label: string; icon: string; description: string }>
> = {
  baal_shem_tov: {
    label: "The Baal Shem Tov",
    icon: "forest-wagon",
    description:
      "He travelled the forests and villages, showing every Jew how much Hashem loves them.",
  },
  alter_rebbe: {
    label: "The Alter Rebbe",
    icon: "tanya",
    description: "The first Chabad Rebbe, who wrote the Tanya and the Shulchan Aruch.",
  },
  frierdiker_rebbe: {
    label: "The Frierdiker Rebbe",
    icon: "key",
    description:
      "The sixth Rebbe, who kept Yiddishkeit alive in Russia and was set free on Yud-Beis Tammuz.",
  },
  tzemach_tzedek: {
    label: "The Tzemach Tzedek",
    icon: "sprout-tree",
    description: "The third Chabad Rebbe, a great scholar who cared for every Jew.",
  },
  rabbi_akiva: {
    label: "Rabbi Akiva",
    icon: "rock-water",
    description: "He began learning at forty, after seeing water wear a hole in a rock.",
  },
  avraham_avinu: {
    label: "Avraham Avinu",
    icon: "tent",
    description: "The first Jew, whose tent was open on all four sides for guests.",
  },
  the_rebbe: {
    label: "The Rebbe",
    icon: "globe",
    description: "The Lubavitcher Rebbe, who sent shluchim all over the world.",
  },
  rebbe_rashab: {
    label: "The Rebbe Rashab",
    icon: "yeshiva",
    description: "The fifth Chabad Rebbe, who founded the yeshiva Tomchei Temimim.",
  },
  eliyahu_hanavi: {
    label: "Eliyahu HaNavi",
    icon: "cup",
    description: "The prophet who visits every Seder and will announce Moshiach.",
  },
  shpoler_zeide: {
    label: "The Shpoler Zeide",
    icon: "fiddle",
    description: "A joyful tzaddik who danced, played and helped poor Jews with great kindness.",
  },
  rambam: {
    label: "The Rambam",
    icon: "mortar",
    description: "A great rabbi and doctor who wrote the Mishneh Torah.",
  },
  rabbi_levi_yitzchak_of_berditchev: {
    label: "Reb Levi Yitzchak of Berditchev",
    icon: "scales",
    description: "The tzaddik who always spoke up for the Jewish people.",
  },
  rabbi_shimon_bar_yochai: {
    label: "Rabbi Shimon bar Yochai",
    icon: "cave",
    description: "He learned Torah in a cave for thirteen years; we celebrate him on Lag BaOmer.",
  },
  rebbe_maharash: {
    label: "The Rebbe Maharash",
    icon: "leap",
    description: "The fourth Chabad Rebbe, who taught: if you can't go under, go over!",
  },
  moshe_rabbeinu: {
    label: "Moshe Rabbeinu",
    icon: "luchos",
    description: "He led the Jews out of Mitzrayim and brought down the Torah.",
  },
  maggid_of_mezritch: {
    label: "The Maggid of Mezritch",
    icon: "spring",
    description: "The Baal Shem Tov's great student, who taught many tzaddikim.",
  },
  rabbi_meir_refoels: {
    label: "Reb Meir Refoels",
    icon: "walking-stick",
    description: "A chassid whose simple faith shines through his stories.",
  },
  rebbetzin_chana: {
    label: "Rebbetzin Chana",
    icon: "inkpot",
    description:
      "The Rebbe's mother, who made ink from herbs in exile so her husband could write Torah.",
  },
  rabbi_chanina_ben_dosa: {
    label: "Rabbi Chanina ben Dosa",
    icon: "oil-lamp",
    description: "A tzaddik so holy that even vinegar burned like oil for his Shabbos lamp.",
  },
  yaakov_avinu: {
    label: "Yaakov Avinu",
    icon: "ladder",
    description: "He dreamed of a ladder reaching up to heaven.",
  },
  mitteler_rebbe: {
    label: "The Mitteler Rebbe",
    icon: "flame",
    description: "The second Chabad Rebbe, son of the Alter Rebbe.",
  },
  rabbi_levi_yitzchak_schneerson: {
    label: "Reb Levi Yitzchak Schneerson",
    icon: "notebook",
    description: "The Rebbe's father, a great Torah scholar who never gave up.",
  },
  rabbi_moshe_galanti: {
    label: "Rabbi Moshe Galanti",
    icon: "scroll-seal",
    description: "A great rabbi of Yerushalayim and Tzfas.",
  },
  david_hamelech: {
    label: "Dovid HaMelech",
    icon: "harp",
    description: "The king who played the harp and wrote Tehillim.",
  },
  rabbi_zusha_of_anipoli: {
    label: "Reb Zusha of Anipoli",
    icon: "patched-bag",
    description: "A poor tzaddik who was always happy with what Hashem gave him.",
  },
  radatz: {
    label: "The Radatz",
    icon: "pocket-watch",
    description: "A chassid and rabbi who loved to learn and to tell stories.",
  },
  rabbi_avraham_hamalach: {
    label: "Reb Avraham HaMalach",
    icon: "feather",
    description: "The Maggid's son, so holy they called him 'the angel'.",
  },
  hillel: {
    label: "Hillel",
    icon: "footprint",
    description: "The gentle sage who taught the whole Torah on one foot.",
  },
  rabbi_yitzchak_father_of_rashi: {
    label: "Rashi's Father",
    icon: "gem",
    description: "He threw a precious jewel into the sea rather than let it be used for idols.",
  },
  rebbetzin_chaya_mushka: {
    label: "Rebbetzin Chaya Mushka",
    icon: "rose",
    description: "The Rebbe's wife, known for her kindness and modesty.",
  },
  aharon_hakohen: {
    label: "Aharon HaKohen",
    icon: "staff-blossom",
    description: "The Kohen Gadol who loved peace and brought people together.",
  },
  sarah_imeinu: {
    label: "Sarah Imeinu",
    icon: "candle",
    description: "Her Shabbos candles burned from one week to the next.",
  },
  rabbi_yisroel_salanter: {
    label: "Rabbi Yisroel Salanter",
    icon: "lantern",
    description:
      "He learned from a shoemaker working by candlelight: as long as the candle burns, you can still fix.",
  },
  rivkah_imeinu: {
    label: "Rivkah Imeinu",
    icon: "jug",
    description: "She gave water to Eliezer and all his camels.",
  },
  rabbi_menachem_mendel_of_horodok: {
    label: "Reb Menachem Mendel of Horodok",
    icon: "ship",
    description: "He led a group of chassidim to settle in Eretz Yisroel.",
  },
  rabbi_meir_of_premishlan: {
    label: "Reb Meir of Premishlan",
    icon: "hill-path",
    description: "A tzaddik who climbed the steep hill to the river every day.",
  },
  shlomo_hamelech: {
    label: "Shlomo HaMelech",
    icon: "crown",
    description: "The wisest king, who built the first Beis Hamikdash.",
  },
  yitzchak_avinu: {
    label: "Yitzchak Avinu",
    icon: "well",
    description: "He dug wells of fresh water, just like his father Avraham.",
  },
};

/** Kind emblems (cover rule (e)). */
export const KIND_ICON = {
  show: "radio",
  story: "book",
  short: "speech",
  event: "mic",
  song: "note",
} as const;

/** /stories story-type chips (§4.2). */
export const STORY_TYPE_CHIPS: readonly { slug: string; label: string; ids: readonly string[] }[] =
  [
    { slug: "chassidic", label: "Chassidic tales", ids: ["chassidic"] },
    { slug: "lesson", label: "Tales with a lesson", ids: ["moral_fiction"] },
    { slug: "long-ago", label: "Long ago", ids: ["historical"] },
    { slug: "mesholim", label: "Mesholim", ids: ["mashal_parable"] },
    { slug: "true", label: "It really happened", ids: ["contemporary"] },
    { slug: "torah", label: "From the Torah", ids: ["tanach_midrash"] },
    { slug: "rabbis", label: "Great rabbis", ids: ["rishonim_acharonim", "talmudic"] },
  ];

/** /quick collection chips (§4.5). */
export const QUICK_CHIPS: readonly {
  slug: string;
  label: string;
  collections: readonly string[];
}[] = [
  {
    slug: "yomim-tovim",
    label: "Yomim Tovim",
    collections: ["Yomim Tovim", "Chasidishe Yomim Tovim"],
  },
  { slug: "mitzvos", label: "Mitzvos", collections: ["Inyonei Mitzvos"] },
  { slug: "midos", label: "Midos", collections: ["Midos Tovos"] },
  { slug: "parsha", label: "Parsha", collections: ["Parsha of the Week"] },
];

export const TAB_TILES = {
  topics: TOPIC_TILES,
  midos: MIDOS_TILES,
  mitzvos: MITZVOS_TILES,
} as const;

/** Base path of a tile's page. */
export function tilePath(t: Pick<Tile, "facet" | "slug">): string {
  switch (t.facet) {
    case "topics":
      return `/topic/${t.slug}/`;
    case "midos":
      return `/midah/${t.slug}/`;
    case "mitzvos":
      return `/mitzvah/${t.slug}/`;
    case "calendar":
      return `/holiday/${t.slug}/`;
    case "people":
      return `/hero/${t.slug}/`;
  }
}

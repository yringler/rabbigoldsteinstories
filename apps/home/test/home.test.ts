import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, MEDIA_HOST, PROJECT_CREDIT, SITES, siteUrl } from "@goldstein/config/sites";
import { loadCatalog, loadLostEpisodes, loadManifest, loadVocab } from "@goldstein/data/load";
import type { Edition, Playlist } from "@goldstein/playlists";
import { filterDomains, lostEpisodesUrl, siteCards } from "../src/lib/sites.ts";
import { assertConfirmed, computeStats, fmt, NAMED_IN_PROSE } from "../src/lib/stats.ts";
import { formatLength, loadTonight, tonightModel } from "../src/lib/tonight.ts";

const src = (p: string) => readFileSync(join(import.meta.dirname, "..", "src", p), "utf8");

describe("archive numbers come from the public dataset", () => {
  const manifest = loadManifest();
  const catalog = loadCatalog();
  const s = computeStats(manifest, catalog, loadLostEpisodes());

  it("matches the manifest and catalog", () => {
    expect(s.recordings).toBe(manifest.counts.public_items);
    expect(s.recordings).toBe(catalog.length);
    expect(s.hours).toBe(Math.round(manifest.hours));
    expect(s.radioEpisodes).toBeGreaterThan(300);
    expect(s.lostEpisodes).toBe(
      loadLostEpisodes().episodes.filter((e) => e.status === "lost").length,
    );
    expect(s.chaimLeviRecordings).toBeGreaterThan(0);
  });

  it("follows the data, not hardcoded values", () => {
    const fake = { ...manifest, counts: { ...manifest.counts, public_items: 7 }, hours: 2.6 };
    const t = computeStats(fake, catalog.slice(0, 3), { note: "", count: 0, episodes: [] });
    expect(t.recordings).toBe(7);
    expect(t.hours).toBe(3);
    expect(t.lostEpisodes).toBe(0);
  });

  it("the page does not hardcode the archive's numbers", () => {
    const page = src("pages/index.astro");
    for (const n of [s.recordings, s.hours, s.radioEpisodes, s.lostEpisodes])
      expect(page).not.toContain(fmt(n));
  });

  it("names only confirmed people and series", () => {
    expect(() => assertConfirmed(loadVocab())).not.toThrow();
    expect(NAMED_IN_PROSE["speakers"]).toContain("rabbi_yosef_goldstein");
    // A placeholder must fail the build.
    expect(() => assertConfirmed(loadVocab(), { series: ["weekly_story_i_believe"] })).toThrow(
      /unconfirmed/,
    );
    expect(() => assertConfirmed(loadVocab(), { speakers: ["nobody_at_all"] })).toThrow();
  });
});

describe("site links come from the shared site table", () => {
  it("one card per site, names and hosts from SITES", () => {
    const cards = siteCards();
    expect(cards.map((c) => c.id)).toEqual(["bedtime", "kids", "library"]);
    for (const c of cards) {
      expect(c.name).toBe(SITES[c.id].name);
      expect(c.url).toBe(siteUrl(c.id));
      expect(c.url).toBe(`https://${SITES[c.id].host}/`);
    }
    expect(lostEpisodesUrl()).toBe(`https://${SITES.library.host}/radio/lost/`);
  });

  it("the filter list names every site host and the media host, once each", () => {
    const hosts = filterDomains().map((d) => d.host);
    expect(hosts.sort()).toEqual([...Object.values(SITES).map((s) => s.host), MEDIA_HOST].sort());
    for (const d of filterDomains()) expect(d.role.length).toBeGreaterThan(0);
    // The roles read as prose ("for children"), not as card labels.
    const roles = filterDomains().map((d) => d.role);
    expect(roles).toContain(`${SITES.bedtime.name}, the listening site for bedtime`);
    expect(roles).toContain(`${SITES.kids.name}, the listening site for children`);
    expect(roles).toContain(`${SITES.library.name}, the listening site for adults and teachers`);
  });

  it("the sites come first: the list is before the tonight strip, with no hero above it", () => {
    const page = src("pages/index.astro");
    const list = page.indexOf('aria-label="Our sites"');
    const tonight = page.search(/<section[^>]*data-tonight\b/);
    expect(list).toBeGreaterThan(0);
    expect(tonight).toBeGreaterThan(list);
    expect(page).not.toMatch(/class="(hero|stats|shelf|eyebrow|lede)"/);
    expect(page).not.toContain("arranged three ways");
  });

  it("the home site is in the table and hosts have no dashes", () => {
    expect(SITES.home.host).toBe("rabbigoldsteinstories.torahlearningtools.com");
    for (const s of Object.values(SITES)) expect(s.host.split(".")[0]).not.toContain("-");
  });

  it("the footer carries the project credit from the shared config", () => {
    const layout = src("layouts/Base.astro");
    expect(layout).toContain("{PROJECT_CREDIT}");
    expect(layout).not.toContain(PROJECT_CREDIT);
  });

  it("pages don't hardcode site hosts or the contact address", () => {
    for (const f of ["pages/index.astro", "layouts/Base.astro", "pages/404.astro"]) {
      const text = src(f);
      expect(text).not.toContain("torahlearningtools.com");
      expect(text).not.toContain(CONTACT_EMAIL);
    }
  });
});

const playlist = (type: string, title: string, extra: Partial<Playlist> = {}): Playlist => ({
  id: `2026-11-25/${type}`,
  type,
  title,
  subtitle: `${title} subtitle`,
  total_min: 118,
  age_min: 3,
  ages: "3+",
  items: [{ id: "0000000000" } as Playlist["items"][number]],
  ...extra,
});

const edition = (playlists: Playlist[]): Edition =>
  ({
    date: "2026-11-25",
    starts_at: "2026-11-25T14:00:00Z",
    ends_at: "2026-11-26T14:00:00Z",
    hebrew_date: "15 Kislev 5787",
    playlists,
  }) as Edition;

describe("tonight strip", () => {
  it("puts Tonight's Mix first and links into the bedtime site", () => {
    const m = tonightModel(
      edition([
        playlist("little", "Little Ones"),
        playlist("mix", "Tonight's Mix"),
        playlist("calm", "Quiet Night"),
      ]),
    );
    expect(m?.cards.map((c) => c.type)).toEqual(["mix", "little", "calm"]);
    expect(m?.cards[0]?.url).toBe(siteUrl("bedtime", "/p/2026-11-25/mix/"));
    expect(m?.hebrewDate).toBe("15 Kislev 5787");
  });

  it("drops empty or malformed playlists", () => {
    const m = tonightModel(
      edition([
        playlist("mix", "Tonight's Mix", { items: [] }),
        playlist("Bad Type", "x"),
        playlist("big", "Big Kids"),
      ]),
    );
    expect(m?.cards.map((c) => c.type)).toEqual(["big"]);
  });

  it("degrades quietly: no data, bad data, or a failing API give null", async () => {
    expect(await loadTonight(async () => null)).toBeNull();
    expect(await loadTonight(async () => ({ date: "../x", playlists: [] }))).toBeNull();
    expect(await loadTonight(async () => edition([]))).toBeNull();
    expect(await loadTonight(async () => "<html>503</html>")).toBeNull();
    expect(
      await loadTonight(async () => {
        throw new Error("network down");
      }),
    ).toBeNull();
  });

  it("the default loader never throws when fetch fails", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    try {
      expect(await loadTonight()).toBeNull();
    } finally {
      globalThis.fetch = real;
    }
  });

  it("the strip ships hidden and is the page's only script", () => {
    const page = src("pages/index.astro");
    expect(page).toMatch(/<section[^>]*data-tonight[^>]*\bhidden\b/);
    expect(page.match(/<script\b/g)).toHaveLength(1);
    expect(src("layouts/Base.astro")).not.toMatch(/<script\b/);
    // The bedtime button goes straight into playing Tonight's Mix on the bedtime site.
    const [bedtime, ...rest] = siteCards();
    expect(bedtime?.href).toBe(siteUrl("bedtime", "/?play=mix"));
    expect(bedtime?.cta).toBe("Play");
    expect(rest.map((c) => c.href)).toEqual(rest.map((c) => c.url));
  });

  it("formats lengths like the bedtime site", () => {
    expect(formatLength(118)).toBe("about 2 hours");
    expect(formatLength(90)).toBe("about 1½ hours");
    expect(formatLength(45)).toBe("45 min");
  });
});

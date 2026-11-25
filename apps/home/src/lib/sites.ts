/**
 * The three sites as the landing page introduces them. Names and links come from the shared site
 * table (packages/config/src/sites.ts), so renaming a site or moving a host is a one-line change
 * there; only the wording below belongs to this page.
 */
import { MEDIA_HOST, SITES, siteUrl, type SiteId } from "@goldstein/config/sites";

export type CardSite = Exclude<SiteId, "home">;

export interface SiteCard {
  id: CardSite;
  name: string;
  url: string;
  host: string;
  /** Short label above the name. */
  kicker: string;
  /** One line: what the site does. */
  purpose: string;
  /** Who it is for. */
  audience: string;
  /** Three short facts shown as a list. */
  points: readonly string[];
  cta: string;
}

const COPY: Record<CardSite, Omit<SiteCard, "id" | "name" | "url" | "host">> = {
  bedtime: {
    kicker: "For bedtime",
    purpose: "Press play once. Up to two hours of stories play by themselves and end quietly.",
    audience: "Parents at bedtime, with a child already in bed.",
    points: [
      "New playlists every night",
      "Tonight's Mix, Little Ones, Quiet Night…",
      "A sleep timer, no reading needed",
    ],
    cta: "Open tonight's stories",
  },
  kids: {
    kicker: "For children",
    purpose: "A bright library to browse: stories, the radio show and quick listens.",
    audience: "Children ages 3 to 11, on their own or on a parent's lap.",
    points: [
      "Picked by age, with notes for parents",
      "Serials chapter by chapter",
      "A shelf of favourites",
    ],
    cta: "Visit the shelf",
  },
  library: {
    kicker: "For adults and teachers",
    purpose: "The full reference archive: search every transcript, cite a moment, plan a lesson.",
    audience: "Teachers, researchers, family and anyone who remembers the show.",
    points: [
      "Search titles, summaries and transcripts",
      "Parsha, Yom Tov, midos and serial indexes",
      "Citations with timestamps, playlists",
    ],
    cta: "Search the archive",
  },
};

export const CARD_ORDER: readonly CardSite[] = ["bedtime", "kids", "library"];

export function siteCards(): SiteCard[] {
  return CARD_ORDER.map((id) => ({
    id,
    name: SITES[id].name,
    url: siteUrl(id),
    host: SITES[id].host,
    ...COPY[id],
  }));
}

/** The library's lost-episodes page (DECISIONS 9). */
export const lostEpisodesUrl = (): string => siteUrl("library", "/radio/lost/");
/** The library's about page (people, how the archive was made, privacy). */
export const libraryAboutUrl = (): string => siteUrl("library", "/about/");

export interface FilterDomain {
  host: string;
  /** What the domain serves, in a few words. */
  role: string;
}

/**
 * Every domain the sites load anything from, for families who whitelist sites in an internet
 * filter. Fonts, scripts and the playlist API are served from each site's own domain, so this is
 * the complete list: the four site hosts plus the audio host.
 */
export function filterDomains(): FilterDomain[] {
  return [
    { host: SITES.home.host, role: "this page, which introduces the archive" },
    ...siteCards().map((c) => ({ host: c.host, role: `${c.name}, the listening site ${c.kicker.toLowerCase()}` })),
    { host: MEDIA_HOST, role: "the audio recordings that all the sites play" },
  ];
}

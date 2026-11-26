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
  /** Short label above the name: who or when it is for. */
  kicker: string;
  /** One line: what the site does. Omitted where the button says it all (bedtime). */
  hook?: string;
  /** The card's button text. */
  cta: string;
  /** What the site is for, in a few words, for the internet-filter list ("for bedtime"). */
  filterRole: string;
}

const COPY: Record<CardSite, Omit<SiteCard, "id" | "name" | "url">> = {
  bedtime: {
    kicker: "For bedtime",
    cta: "New stories every day",
    filterRole: "for bedtime",
  },
  kids: {
    kicker: "Ages 3–11",
    hook: "A bright shelf of stories and the radio show to browse.",
    cta: "Browse stories",
    filterRole: "for children",
  },
  library: {
    kicker: "For adults & teachers",
    hook: "Search every recording and transcript.",
    cta: "Search the archive",
    filterRole: "for adults and teachers",
  },
};

export const CARD_ORDER: readonly CardSite[] = ["bedtime", "kids", "library"];

export function siteCards(): SiteCard[] {
  return CARD_ORDER.map((id) => ({
    id,
    name: SITES[id].name,
    url: siteUrl(id),
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
    ...siteCards().map((c) => ({
      host: SITES[c.id].host,
      role: `${c.name}, the listening site ${c.filterRole}`,
    })),
    { host: MEDIA_HOST, role: "the audio recordings that all the sites play" },
  ];
}

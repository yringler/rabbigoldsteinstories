/**
 * The websites (the three sites plus the landing page), their Worker names and production hosts. One table so that apps can link to
 * each other and the Workers, wrangler.jsonc files and docs agree. If you change a host here, change
 * the matching `routes` entry in apps/<site>/wrangler.jsonc (packages/config/test checks they match).
 */
export const SITE_IDS = ["bedtime", "kids", "library", "home"] as const;
export type SiteId = (typeof SITE_IDS)[number];

export interface SiteInfo {
  readonly id: SiteId;
  /** Display name (placeholder until there is a product owner; docs/DECISIONS.md "Website decisions"). */
  readonly name: string;
  /** Production Worker name (staging adds `-staging`). */
  readonly worker: string;
  /** Production hostname (custom domain on the Worker). */
  readonly host: string;
  /** Path of a recording's page on this site, or null if the site has no item pages. Cross-site links use this. */
  readonly itemPath: ((id: string) => string) | null;
}

/** Zone that holds every host below, including the audio host. */
export const ZONE = "torahlearningtools.com";
/** Public audio and media host (R2 bucket `stories`, custom domain). */
export const MEDIA_HOST = "storiesmedia.torahlearningtools.com";
/** Contact address for lost tapes and other enquiries (owner decision 2026-11-25, docs/DECISIONS.md). No contact form yet. */
export const CONTACT_EMAIL = "admin@torahlearningtools.com";

/** Path of the optional support page, on the landing site (owner decision 2026-11-26, docs/DECISIONS.md). */
export const SUPPORT_PATH = "/support/";
/** Suggested yearly amount in US dollars; any amount is welcome. Change it here only. */
export const SUGGESTED_AMOUNT = 20;
/** The suggested amount as shown in copy on every site. */
export const SUGGESTED_FEE = `$${SUGGESTED_AMOUNT} a year`;
/**
 * Ways to give (owner decision 2026-11-26). Worded "Support", not "Donate" (a design choice, so
 * nothing suggests a tax deduction). Zelle has no link, only the address.
 */
export const SUPPORT = {
  paypal: "https://www.paypal.com/paypalme/yehudaringler",
  paypalSuggested: `https://www.paypal.com/paypalme/yehudaringler/${SUGGESTED_AMOUNT}`,
  cashapp: "https://cash.app/$YehudaRingler",
  cashappSuggested: `https://cash.app/$YehudaRingler/${SUGGESTED_AMOUNT}`,
  zelle: "torahlearningtools@gmail.com",
} as const;

/** Credit line on every about / grown-ups page (owner, 2026-11-25). */
export const PROJECT_CREDIT = "A project of Yehuda Ringler.";

/** Local goldstein-api (`npm run dev:api`); each app's dev server proxies /playlists and /api to it. */
export const DEV_API_ORIGIN = "http://localhost:8787";

export const SITES: Readonly<Record<SiteId, SiteInfo>> = {
  bedtime: {
    id: "bedtime",
    name: "Bedtime Stories",
    worker: "goldstein-bedtime",
    host: "bedtimestories.torahlearningtools.com",
    itemPath: null,
  },
  kids: {
    id: "kids",
    name: "Story Shelf",
    worker: "goldstein-kids",
    host: "kidsstories.torahlearningtools.com",
    itemPath: (id) => `/listen/${id}/`,
  },
  library: {
    id: "library",
    name: "The Goldstein Story Archive",
    worker: "goldstein-library",
    host: "storylibrary.torahlearningtools.com",
    itemPath: (id) => `/r/${id}/`,
  },
  home: {
    id: "home",
    // Landing page: introduces the archive and links to the three sites. Host confirmed by the
    // owner 2026-11-25 (docs/DECISIONS.md); the name is a placeholder like the others.
    name: "Rabbi Goldstein Stories",
    worker: "goldstein-home",
    host: "rabbigoldsteinstories.torahlearningtools.com",
    itemPath: null,
  },
};

/** Absolute link to a recording on another site (null if that site has no item pages). */
export function itemUrl(site: SiteId, id: string): string | null {
  const path = SITES[site].itemPath?.(id);
  return path ? siteUrl(site, path) : null;
}

export function siteUrl(site: SiteId, path = "/"): string {
  return `https://${SITES[site].host}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute link to the support page on the landing site (for the other sites' footers). */
export function supportUrl(): string {
  return siteUrl("home", SUPPORT_PATH);
}

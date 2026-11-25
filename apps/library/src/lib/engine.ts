/**
 * Transcript search engine (docs/sites/library.md §5.3). The page codes against `TranscriptEngine`
 * only, so the Pagefind back end can be replaced by D1 + FTS5 behind a Worker without touching the
 * UI: implement `search` (ids + scores, cheap) and `Hit.passages` (loaded only for rows on screen).
 *
 * Index layout (scripts/build-search.ts): two Pagefind bundles, /pagefind/en/ and /pagefind/yi/,
 * one synthetic document per recording (url /r/<id>/), one <p id="t<sec>"> per ~30 s passage of
 * the already-masked search text. Nothing else is in those documents.
 */

export type TranscriptLang = "en" | "yi";

export interface Passage {
  /** Seconds from the start of the file. */
  t: number;
  /** About 12 words around the match, with <mark>; null for Yiddish (never displayed). */
  excerpt: string | null;
}

export interface Hit {
  id: string;
  lang: TranscriptLang;
  /** 0..1, normalised within one query. */
  score: number;
  /** Up to `max` passages plus the number of further matching passages. */
  passages(max?: number): Promise<{ passages: Passage[]; more: number }>;
}

export interface TranscriptEngine {
  search(query: string, langs: readonly TranscriptLang[]): Promise<Hit[]>;
}

// ---------------------------------------------------------------------------------------------
// Pagefind back end

interface PagefindAnchor {
  element: string;
  id: string;
  text?: string;
  location: number;
}
interface PagefindData {
  url: string;
  content: string;
  locations: number[];
  anchors: PagefindAnchor[];
}
interface PagefindResult {
  id: string;
  score: number;
  data(): Promise<PagefindData>;
}
interface PagefindModule {
  options(o: Record<string, unknown>): Promise<void>;
  init(): Promise<void>;
  search(q: string): Promise<{ results: PagefindResult[] } | null>;
}

/** Recording id from a synthetic document url (/r/<id>/). */
export function idFromUrl(url: string): string | null {
  return /\/r\/([0-9a-f]{10})\/?/.exec(url)?.[1] ?? null;
}

/** Group match word positions into passages using the <p id="t<sec>"> anchors. */
export function passagesFromData(
  data: Pick<PagefindData, "content" | "locations" | "anchors">,
  withExcerpt: boolean,
  max = 3,
): { passages: Passage[]; more: number } {
  const anchors = data.anchors
    .filter((a) => /^t\d+$/.test(a.id))
    .sort((a, b) => a.location - b.location);
  const words = data.content.split(/\s+/).filter(Boolean);
  const byStart = new Map<number, number[]>();
  for (const loc of [...data.locations].sort((a, b) => a - b)) {
    let anchor: PagefindAnchor | undefined;
    for (const a of anchors) {
      if (a.location <= loc) anchor = a;
      else break;
    }
    const t = anchor ? Number(anchor.id.slice(1)) : 0;
    const list = byStart.get(t) ?? [];
    list.push(loc);
    byStart.set(t, list);
  }
  const all = [...byStart.entries()].sort((a, b) => a[0] - b[0]);
  const passages = all.slice(0, max).map(([t, locs]) => ({
    t,
    excerpt: withExcerpt ? excerpt(words, locs) : null,
  }));
  return { passages, more: Math.max(0, all.length - max) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ~12 words around the first match, matches wrapped in <mark>. */
export function excerpt(words: readonly string[], locs: readonly number[], size = 12): string {
  const first = locs[0] ?? 0;
  const from = Math.max(0, first - Math.floor(size / 3));
  const to = Math.min(words.length, from + size);
  const marks = new Set(locs);
  const out: string[] = [];
  for (let i = from; i < to; i++) {
    const w = esc(words[i] ?? "");
    out.push(marks.has(i) ? `<mark>${w}</mark>` : w);
  }
  return `${from > 0 ? "…" : ""}${out.join(" ")}${to < words.length ? "…" : ""}`;
}

interface Loaded {
  pf: PagefindModule;
  /** Pagefind result id (fragment hash) → recording id; written by scripts/build-search.ts. */
  map: Record<string, string>;
}

export class PagefindEngine implements TranscriptEngine {
  private readonly modules = new Map<TranscriptLang, Promise<Loaded | null>>();

  constructor(private readonly base = "/pagefind/") {}

  private load(lang: TranscriptLang): Promise<Loaded | null> {
    let m = this.modules.get(lang);
    if (!m) {
      const dir = `${this.base}${lang}/`;
      m = Promise.all([
        import(/* @vite-ignore */ `${dir}pagefind.js`) as Promise<PagefindModule>,
        fetch(`${dir}map.json`).then((r) =>
          r.ok ? (r.json() as Promise<Record<string, string>>) : {},
        ),
      ])
        .then(async ([pf, map]) => {
          await pf.options({ excerptLength: 0 });
          await pf.init();
          return { pf, map };
        })
        .catch(() => null);
      this.modules.set(lang, m);
    }
    return m;
  }

  /** True when at least one bundle loads (false in `astro dev` before the index is built). */
  async available(lang: TranscriptLang = "en"): Promise<boolean> {
    return (await this.load(lang)) !== null;
  }

  async search(query: string, langs: readonly TranscriptLang[]): Promise<Hit[]> {
    const out: Hit[] = [];
    for (const lang of langs) {
      const loaded = await this.load(lang);
      if (!loaded) continue;
      const res = await loaded.pf.search(query);
      const results = res?.results ?? [];
      const top = results[0]?.score ?? 1;
      for (const r of results) {
        const id = loaded.map[r.id];
        if (!id) continue;
        let cached: Promise<PagefindData> | null = null;
        out.push({
          id,
          lang,
          score: top > 0 ? r.score / top : 0,
          passages: async (max = 3) =>
            passagesFromData(await (cached ??= r.data()), lang === "en", max),
        });
      }
    }
    return out;
  }
}

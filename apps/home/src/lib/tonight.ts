/**
 * "Tonight's playlists" strip: the only client code on the page. Reads the shared playlist API
 * (same origin, /playlists/*, served by goldstein-api through the site Worker), puts Tonight's Mix
 * first (owner decision) and links each playlist into the bedtime site's deep link
 * /p/<edition>/<type>/. Any failure (API down, bad JSON, empty edition) returns null and the strip
 * stays hidden: no error is shown.
 */
import { siteUrl } from "@goldstein/config/sites";
import { fetchCurrentEdition, type Edition } from "@goldstein/playlists";

export const MIX_TYPE = "mix";

export interface TonightCard {
  type: string;
  title: string;
  subtitle: string;
  minutes: number;
  ages: string | null;
  url: string;
}

export interface TonightModel {
  edition: string;
  hebrewDate: string | null;
  cards: TonightCard[];
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Pure: an edition (or anything) → the strip's model, or null when there is nothing to show. */
export function tonightModel(edition: unknown): TonightModel | null {
  if (!edition || typeof edition !== "object") return null;
  const e = edition as Partial<Edition>;
  if (!isStr(e.date) || !/^\d{4}-\d{2}-\d{2}(-pm)?$/.test(e.date) || !Array.isArray(e.playlists))
    return null;
  const date = e.date;
  const cards = e.playlists
    .filter(
      (p) =>
        p &&
        isStr(p.type) &&
        /^[a-z]+$/.test(p.type) &&
        isStr(p.title) &&
        Array.isArray(p.items) &&
        p.items.length > 0,
    )
    .map((p) => ({
      type: p.type,
      title: p.title,
      subtitle: typeof p.subtitle === "string" ? p.subtitle : "",
      minutes: Number.isFinite(p.total_min) ? Math.round(p.total_min) : 0,
      ages: isStr(p.ages) ? p.ages : null,
      url: siteUrl("bedtime", `/p/${date}/${p.type}/`),
    }));
  // Tonight's Mix first; the rest keep the edition's order (stable sort).
  cards.sort((a, b) => Number(b.type === MIX_TYPE) - Number(a.type === MIX_TYPE));
  if (!cards.length) return null;
  return { edition: date, hebrewDate: isStr(e.hebrew_date) ? e.hebrew_date : null, cards };
}

/** Never throws. `load` is injectable for tests. */
export async function loadTonight(
  load: () => Promise<unknown> = () => fetchCurrentEdition(),
): Promise<TonightModel | null> {
  try {
    return tonightModel(await load());
  } catch {
    return null;
  }
}

/** "about 2 hours", "about 1½ hours", "45 min". */
export function formatLength(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const halves = Math.round(min / 30) / 2;
  const whole = Math.floor(halves);
  const text = halves === whole ? `${whole}` : `${whole === 0 ? "" : whole}½`;
  return `about ${text} hour${halves > 1 ? "s" : ""}`;
}

/** Fills the strip's list (textContent only, never innerHTML) and reveals it. */
export function renderTonight(root: HTMLElement, model: TonightModel): void {
  const list = root.querySelector<HTMLElement>("[data-tonight-list]");
  const tpl = root.querySelector<HTMLTemplateElement>("template[data-tonight-card]");
  if (!list || !tpl) return;
  list.replaceChildren(
    ...model.cards.map((c) => {
      const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
      const link = node.querySelector<HTMLAnchorElement>("a");
      if (link) {
        link.href = c.url;
        link.dataset["type"] = c.type;
      }
      const set = (sel: string, text: string) => {
        const el = node.querySelector<HTMLElement>(sel);
        if (el) el.textContent = text;
      };
      set("[data-title]", c.title);
      set("[data-sub]", c.subtitle);
      set(
        "[data-meta]",
        [formatLength(c.minutes), c.ages ? `ages ${c.ages}` : ""].filter(Boolean).join(" · "),
      );
      return node;
    }),
  );
  const date = root.querySelector<HTMLElement>("[data-tonight-date]");
  if (date && model.hebrewDate) date.textContent = model.hebrewDate;
  root.hidden = false;
}

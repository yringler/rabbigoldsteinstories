/**
 * Language preference in the browser (docs/design/language-bedtime.md §2). The inline script in
 * Base.astro sets <html data-lang> before first paint (and again after each page swap); CSS shows
 * or hides the Yiddish card, the English group and the /earlier note from it. This module takes
 * `?lang=` out of the URL and wires the radio controls.
 */
import {
  effectiveLang,
  LANG_KEY,
  langFromSearch,
  parseLang,
  searchWithoutLang,
  statusLine,
  type LangPref,
} from "../lib/lang.ts";
import { store } from "./store.ts";

/** The site was built with a non-empty Yiddish shelf (Base.astro sets this attribute). */
const hasShelf = () => document.documentElement.hasAttribute("data-has-yiddish");

export function currentLang(): LangPref {
  return effectiveLang(parseLang(store.get<unknown>(LANG_KEY, null)), hasShelf() ? 1 : 0);
}

function apply(lang: LangPref): void {
  document.documentElement.dataset["lang"] = lang;
}

/**
 * `?lang=en|yi|any`: saved (when valid and the shelf exists), then removed from the address so a
 * bookmark or the home-screen icon does not pin the choice. Other parameters stay.
 */
export function takeLangParam(): void {
  if (!new URLSearchParams(location.search).has("lang")) return;
  const lang = langFromSearch(location.search);
  if (lang && hasShelf()) store.set(LANG_KEY, lang);
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${searchWithoutLang(location.search)}${location.hash}`,
  );
}

/** Check the stored choice in any control on the page and save changes. */
export function mountLangControls(): void {
  const lang = currentLang();
  apply(lang);
  for (const control of document.querySelectorAll<HTMLElement>("[data-lang-control]")) {
    if (control.dataset["ready"]) continue;
    control.dataset["ready"] = "1";
    const status = control.querySelector<HTMLElement>("[data-lang-status]");
    for (const input of control.querySelectorAll<HTMLInputElement>('input[name="lang"]')) {
      input.checked = input.value === lang;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        const next = parseLang(input.value);
        store.set(LANG_KEY, next);
        apply(next);
        if (status) status.textContent = statusLine(next);
      });
    }
  }
}

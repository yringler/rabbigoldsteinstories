/** Keyboard-map helpers (pure; take a minimal element shape so they can be tested without a DOM). */

export interface KeyTarget {
  tagName: string;
  closest(selector: string): unknown;
}

const OWN_KEYS = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
const OWN_ROLES =
  '[role="option"],[role="listbox"],[role="radio"],[role="checkbox"],[role="slider"],[role="tab"],[role="menuitem"],[contenteditable="true"]';

/**
 * Does the focused element use Space or the arrow keys itself (checkbox, radio, select, option,
 * button, link, summary…)? Then the player shortcuts for those keys stay out of the way.
 */
export function ownsSpaceAndArrows(t: unknown): boolean {
  if (!t || typeof t !== "object" || !("tagName" in t) || !("closest" in t)) return false;
  const el = t as KeyTarget;
  if (OWN_KEYS.has(el.tagName.toUpperCase())) return true;
  return el.closest(OWN_ROLES) !== null;
}

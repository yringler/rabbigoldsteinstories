/** Interface icons (24×24, one colour = currentColor). Decorative: the button carries the name. */
const UI: Readonly<Record<string, string>> = {
  home: `<path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>`,
  stories: `<path d="M12 6C9 4 5.5 4 3 5v14c2.5-1 6-1 9 1 3-2 6.5-2 9-1V5c-2.5-1-6-1-9 1Z"/><path d="M12 6v14"/>`,
  radio: `<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M7 8l9-5"/><circle cx="8.5" cy="14" r="2.5"/><path d="M14 12.5h4M14 15.5h4"/>`,
  explore: `<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5Z" fill="currentColor"/>`,
  shelf: `<path d="M3 20h18M3 13h18"/><rect x="5" y="4" width="3" height="9" rx=".5"/><rect x="9" y="5" width="3" height="8" rx=".5"/><path d="M14 5.5l2.8-.8 2.2 8-2.8.8Z"/><path d="M8.5 17.5c-1.6-1.2-2-2.3-1.2-3 .5-.4 1-.2 1.2.2.2-.4.7-.6 1.2-.2.8.7.4 1.8-1.2 3Z" fill="currentColor"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>`,
  play: `<path d="M7 4.5v15l12.5-7.5Z" fill="currentColor"/>`,
  pause: `<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>`,
  back15: `<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.5v4h4"/><text x="12.2" y="15.3" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">15</text>`,
  fwd30: `<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.5v4h-4"/><text x="11.8" y="15.3" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">30</text>`,
  prev: `<path d="M6 5v14"/><path d="M19 5v14L9 12Z" fill="currentColor"/>`,
  next: `<path d="M18 5v14"/><path d="M5 5v14l10-7Z" fill="currentColor"/>`,
  heart: `<path d="M12 20C5 15.5 2.5 11.5 4 8c1.3-3 5.3-3.6 8-.6 2.7-3 6.7-2.4 8 .6 1.5 3.5-1 7.5-8 12Z"/>`,
  "heart-fill": `<path d="M12 20C5 15.5 2.5 11.5 4 8c1.3-3 5.3-3.6 8-.6 2.7-3 6.7-2.4 8 .6 1.5 3.5-1 7.5-8 12Z" fill="currentColor"/>`,
  "play-next": `<path d="M3 6h11M3 11h11M3 16h6"/><path d="M14 14v7l5.5-3.5Z" fill="currentColor"/>`,
  share: `<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>`,
  moon: `<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.2"/><path d="M12 4a8 8 0 0 1 0 16c-3-2.5-4.5-5-4.5-8S9 6.5 12 4Z" fill="currentColor" stroke="none"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  back: `<path d="M15 5 8 12l7 7"/>`,
  down: `<path d="M5 9l7 7 7-7"/>`,
  right: `<path d="M9 5l7 7-7 7"/>`,
  queue: `<path d="M4 6h16M4 12h16M4 18h10"/>`,
  bulb: `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1v.5h5V16c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>`,
  star: `<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
  info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/>`,
  grip: `<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" stroke-width="3.2"/>`,
  trash: `<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>`,
  dice: `<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>`,
  rocket: `<path d="M12 3c3.5 2.5 4.5 7 3 12H9C7.5 10 8.5 5.5 12 3Z"/><circle cx="12" cy="9" r="1.6"/><path d="M9 13l-3 3v3l3.5-2.5M15 13l3 3v3l-3.5-2.5M10.5 18.5 12 21l1.5-2.5"/>`,
  chapters: `<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>`,
  "story-jump": `<path d="M4 12h11M11 7l5 5-5 5"/><path d="M19.5 5l.8 1.8 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.7.9.4-1.9L16.8 7l1.9-.3Z" fill="currentColor" stroke-width="1"/>`,
  speech: `<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>`,
  mic: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>`,
  note: `<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/>`,
  holidays: `<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 12.5l1.2 2.3 2.5.4-1.8 1.7.4 2.5-2.3-1.2-2.3 1.2.4-2.5-1.8-1.7 2.5-.4Z" fill="currentColor" stroke-width="1"/>`,
  serial: `<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="16" rx="1.5"/><path d="M16.5 5.5l4-1 3 14.5-4 1Z" transform="translate(-2 0)"/>`,
  quick: `<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/>`,
  playlist: `<path d="M4 6h12M4 11h12M4 16h7"/><path d="M15 21c-1.7 0-3-1-3-2.5s1.3-2.5 3-2.5 3 1 3 2.5M18 18.5V10l3-1"/>`,
  timer: `<circle cx="12" cy="13" r="8"/><path d="M12 9v4h3M10 2h4"/>`,
  speed: `<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>`,
  more: `<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>`,
  grownups: `<circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v6"/>`,
};

export function ui(name: string, cls = "", size = 24): string {
  const body = UI[name] ?? UI["more"] ?? "";
  return `<svg class="ui ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const UI_NAMES: readonly string[] = Object.keys(UI);

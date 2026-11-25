/**
 * The Story Shelf icon set (docs/sites/kids.md §8.4): two-colour line icons on a 48×48 grid, one style.
 * Kinds, topics, midos, mitzvos, holidays and heroes. Respect rule: no faces or figures of real people;
 * heroes are shown by an object or scene (owner-approved). Generic animals are fine.
 *
 * Markup uses three placeholder colours that `icon()` fills in: I = ink (outlines), A = accent,
 * W = white/paper. Everything else (stroke width, caps) comes from the wrapper group.
 */

const ICONS: Readonly<Record<string, string>> = {
  // ── Kinds ─────────────────────────────────────────────────────────────
  radio: `<path d="M15 16 31 6"/><circle cx="31" cy="6" r="1.6" fill="I"/><rect x="5" y="16" width="38" height="25" rx="6" fill="A"/><circle cx="17" cy="28.5" r="6.5" fill="W"/><circle cx="17" cy="28.5" r="2" fill="I"/><path d="M28 24h9M28 29h9M28 34h6"/>`,
  book: `<path d="M24 13C18 9 10 9 4 11v27c6-2 14-2 20 2Z" fill="A"/><path d="M24 13c6-4 14-4 20-2v27c-6-2-14-2-20 2Z" fill="W"/><path d="M24 13v27M29 18c3-1 7-1 10 0M29 24c3-1 7-1 10 0M29 30c3-1 7-1 10 0"/>`,
  speech: `<path d="M9 9h30a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H22l-9 8v-8H9a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5Z" fill="A"/><circle cx="15" cy="21.5" r="2.2" fill="W"/><circle cx="24" cy="21.5" r="2.2" fill="W"/><circle cx="33" cy="21.5" r="2.2" fill="W"/>`,
  mic: `<rect x="17" y="4" width="14" height="24" rx="7" fill="A"/><path d="M17 12h5M17 17h5M17 22h5"/><path d="M11 21a13 13 0 0 0 26 0"/><path d="M24 34v7M16 43h16"/>`,
  note: `<path d="M19 34V11l20-5v23" /><path d="M19 11l20-5v6l-20 5Z" fill="A"/><circle cx="14" cy="34" r="5.5" fill="A"/><circle cx="34" cy="29" r="5.5" fill="A"/>`,

  // ── Topics ────────────────────────────────────────────────────────────
  "forest-wagon": `<path d="M10 4 3 17h4L2 27h16l-5-10h4Z" fill="A"/><path d="M10 27v5"/><path d="M38 6l-6 11h3l-4 8h14l-4-8h3Z" fill="A"/><path d="M38 25v5"/><path d="M2 43h44"/><rect x="15" y="27" width="20" height="9" rx="2" fill="W"/><path d="M35 33l5 1"/><circle cx="19" cy="38" r="4" fill="A"/><circle cx="31" cy="38" r="4" fill="A"/>`,
  "building-770": `<path d="M6 42V18l6-9 6 9 6-9 6 9 6-9 6 9v24Z" fill="A"/><path d="M6 18h36"/><path d="M10 27a2.5 2.5 0 0 1 5 0v4h-5ZM33 27a2.5 2.5 0 0 1 5 0v4h-5ZM20 42v-9a4 4 0 0 1 8 0v9" fill="W"/><path d="M3 42h42"/>`,
  hat: `<path d="M13 32V17c0-4 5-6 11-6s11 2 11 6v15" fill="A"/><rect x="13" y="25" width="22" height="5" fill="W"/><ellipse cx="24" cy="33" rx="20" ry="5.5" fill="A"/><path d="M13 32c3 1 7 1.5 11 1.5S32 33 35 32"/>`,
  "torah-scroll": `<rect x="12" y="9" width="24" height="30" fill="W"/><path d="M17 16h14M17 21h14M17 26h14M17 31h10"/><rect x="5" y="6" width="8" height="36" rx="4" fill="A"/><rect x="35" y="6" width="8" height="36" rx="4" fill="A"/><path d="M9 2v4M39 2v4M9 42v4M39 42v4"/>`,
  umbrella: `<path d="M4 25a20 18 0 0 1 40 0c-3-3-7-3-10 0-3-3-7-3-10 0-3-3-7-3-10 0-3-3-7-3-10 0Z" fill="A"/><path d="M24 7V4M24 25v13a4 4 0 0 1-8 0"/><path d="M9 34l-2 4M38 32l-2 4M32 40l-2 4"/>`,
  sparkles: `<path d="M21.0 9.0L25.5 19.8L37.2 20.7L28.3 28.4L31.0 39.8L21.0 33.6L11.0 39.8L13.7 28.4L4.8 20.7L16.5 19.8Z" fill="A"/><path d="M39.0 2.0L40.9 6.5L45.7 6.8L42.0 10.0L43.1 14.7L39.0 12.2L34.9 14.7L36.0 10.0L32.3 6.8L37.1 6.5Z" fill="W"/><path d="M40.0 32.0L41.6 35.8L45.7 36.1L42.6 38.8L43.5 42.9L40.0 40.7L36.5 42.9L37.4 38.8L34.3 36.1L38.4 35.8Z" fill="W"/>`,
  "heart-hand": `<path d="M24 25c-9-6-11-14-5-16 2.5-.8 4.3.6 5 2.3.7-1.7 2.5-3.1 5-2.3 6 2 4 10-5 16Z" fill="A"/><path d="M3 31h7l8 4h11c3 0 3 4.5 0 4.5h-9" /><path d="M20 39.5h10l11-8c2.5-1.8 5 1.2 3 3.2L32 45H13l-10-2" fill="W"/>`,
  "mountain-flag": `<path d="M2 43 17 17l8 12 6-9 15 23Z" fill="A"/><path d="M13 24l4-7 4 6-4-1Z" fill="W"/><path d="M17 17V4"/><path d="M17 4h11l-3 3.5 3 3.5H17" fill="W"/>`,
  siddur: `<rect x="9" y="5" width="30" height="37" rx="3" fill="A"/><path d="M15 5v37"/><path d="M27 15l5.5 9.5h-11ZM27 28l5.5-9.5h-11Z" stroke="W" stroke-width="2"/><path d="M32 42v5l2.5-2 2.5 2v-5" fill="W"/>`,
  shtender: `<path d="M6 24l18-6 18 6v6l-18-6-18 6Z" fill="A"/><path d="M24 18v6"/><path d="M10 22l12-4M26 18l12 4" stroke="W" stroke-width="1.6"/><path d="M24 26v16M14 43h20"/>`,
  candles: `<path d="M15 6c3 4 3.5 7.5 0 10-3.5-2.5-3-6 0-10ZM33 6c3 4 3.5 7.5 0 10-3.5-2.5-3-6 0-10Z" fill="A"/><path d="M15 16v3M33 16v3"/><rect x="11" y="19" width="8" height="19" rx="1.5" fill="W"/><rect x="29" y="19" width="8" height="19" rx="1.5" fill="W"/><path d="M7 38h14l-2 5h-10ZM27 38h14l-2 5h-10Z" fill="A"/>`,
  "beis-hamikdash": `<path d="M3 43h42M7 39h34M11 35h26"/><rect x="13" y="15" width="22" height="20" fill="A"/><path d="M10 15h28l-3-5H13Z" fill="W"/><path d="M20 35V24a4 4 0 0 1 8 0v11" fill="W"/><path d="M15 19v12M33 19v12"/><circle cx="24" cy="6" r="2.5" fill="A"/>`,
  shield: `<path d="M24 4l17 6v12c0 10-7 17-17 22C14 39 7 32 7 22V10Z" fill="A"/><path d="M24 14l6 10.5H18ZM24 31l6-10.5H18Z" stroke="W" stroke-width="2"/>`,
  house: `<rect x="10" y="20" width="28" height="22" fill="A"/><path d="M5 23 24 7l19 16" /><path d="M20 42V31h8v11" fill="W"/><rect x="14" y="24" width="6" height="5" fill="W"/><path d="M33 25.5c-2-1.6-2.4-3.4-1-4 .6-.2 1 .1 1 .5 0-.4.4-.7 1-.5 1.4.6 1 2.4-1 4Z" fill="W"/><path d="M33 7v6"/>`,
  "tree-sun": `<circle cx="37" cy="11" r="6" fill="W"/><circle cx="37" cy="2.5" r="1.4" fill="I" stroke="none"/><circle cx="45" cy="9" r="1.4" fill="I" stroke="none"/><circle cx="44" cy="16" r="1.4" fill="I" stroke="none"/><circle cx="30" cy="5" r="1.4" fill="I" stroke="none"/><circle cx="18" cy="21" r="12" fill="A"/><path d="M18 33v9M18 27l-5-4M18 29l5-5M3 43h42"/>`,
  badge: `<path d="M16 29l-4 15 6-3.5 4 5 3-13M32 29l4 15-6-3.5-4 5-3-13" fill="W"/><circle cx="24" cy="20" r="15" fill="A"/><path d="M24 10l3 6.3 6.8.8-5 4.6 1.4 6.8L24 25l-6.2 3.5 1.4-6.8-5-4.6 6.8-.8Z" fill="W"/>`,

  // ── Midos ─────────────────────────────────────────────────────────────
  anchor: `<ellipse cx="17" cy="24" rx="6" ry="8" fill="W"/><ellipse cx="30" cy="23" rx="6" ry="8.5" fill="W"/><path d="M4 26c0 11 9 16 20 16s20-5 20-16Z" fill="A"/><path d="M8 31c6 2 12 2 16 1M24 36c6 0 12-2 15-5M10 37c4 1 8 1 11 0" stroke="W" stroke-width="2"/>`,
  "two-hearts": `<path d="M20 40C6 31 3 20 9 15c4-3 9-1 11 3 2-4 7-6 11-3 6 5 3 16-11 25Z" fill="A"/><path d="M35 26c-6-4-7.5-9-4.8-11 1.8-1.4 4-.5 4.8 1.3.8-1.8 3-2.7 4.8-1.3 2.7 2 1.2 7-4.8 11Z" fill="W"/>`,
  gift: `<rect x="8" y="21" width="32" height="21" fill="A"/><rect x="6" y="14" width="36" height="7" rx="1.5" fill="A"/><rect x="21" y="14" width="6" height="28" fill="W"/><path d="M24 14c-3-7-11-8-10-2 .5 2 5 2 10 2 5 0 9.5 0 10-2 1-6-7-5-10 2Z" fill="W"/>`,
  "smile-sun": `<circle cx="24" cy="24" r="13" fill="A"/><circle cx="43.5" cy="24.0" r="2" fill="I" stroke="none"/><circle cx="39.8" cy="35.5" r="2" fill="I" stroke="none"/><circle cx="30.0" cy="42.5" r="2" fill="I" stroke="none"/><circle cx="18.0" cy="42.5" r="2" fill="I" stroke="none"/><circle cx="8.2" cy="35.5" r="2" fill="I" stroke="none"/><circle cx="4.5" cy="24.0" r="2" fill="I" stroke="none"/><circle cx="8.2" cy="12.5" r="2" fill="I" stroke="none"/><circle cx="18.0" cy="5.5" r="2" fill="I" stroke="none"/><circle cx="30.0" cy="5.5" r="2" fill="I" stroke="none"/><circle cx="39.8" cy="12.5" r="2" fill="I" stroke="none"/><circle cx="19.5" cy="21.5" r="1.6" fill="I"/><circle cx="28.5" cy="21.5" r="1.6" fill="I"/><path d="M18.5 27c3 3.5 8 3.5 11 0"/>`,
  "thank-you": `<rect x="5" y="11" width="38" height="27" rx="3" fill="W"/><path d="M5 14l19 14 19-14"/><path d="M24 39c-6-4-7.5-9-4.5-11 1.8-1.3 3.8-.4 4.5 1.2.7-1.6 2.7-2.5 4.5-1.2 3 2 1.5 7-4.5 11Z" fill="A"/>`,
  medal: `<path d="M14 3h7l3 15h-7ZM34 3h-7l-3 15h7Z" fill="W"/><circle cx="24" cy="31" r="12" fill="A"/><path d="M24 23.5l2.3 4.8 5.2.6-3.9 3.6 1 5.2-4.6-2.6-4.6 2.6 1-5.2-3.9-3.6 5.2-.6Z" fill="W"/>`,
  truth: `<path d="M9 7h30a5 5 0 0 1 5 5v17a5 5 0 0 1-5 5H22l-9 8v-8H9a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5Z" fill="A"/><path d="M15 20.5l6 6 12-12" stroke="W" stroke-width="4"/>`,
  lion: `<path d="M24 4l4 4 5-2 2 5 5 1-1 5 4 3-3 4 3 4-4 3 1 5-5 1-2 5-5-2-4 4-4-4-5 2-2-5-5-1 1-5-4-3 3-4-3-4 4-3-1-5 5-1 2-5 5 2Z" fill="A"/><circle cx="24" cy="25" r="11" fill="W"/><circle cx="20" cy="23" r="1.5" fill="I"/><circle cx="28" cy="23" r="1.5" fill="I"/><path d="M22 27.5h4l-2 2.5ZM24 30v2M20.5 32c2 1.5 5 1.5 7 0" fill="I"/>`,
  ear: `<path d="M17 19c0-8 6-13 12-13 7 0 12 6 12 13 0 8-8 10-8 17 0 5-4 8-8 8s-7-3-7-6" fill="A"/><path d="M25 20c0-4.5 7-5 7 0 0 3.5-5 4-5 8" stroke="W" stroke-width="2.4"/><path d="M9 15c-3.5 5-3.5 11 0 16M13 18.5c-2 3-2 6 0 9"/>`,
  rocket: `<path d="M24 3c8 6 10 18 6 31H18C14 21 16 9 24 3Z" fill="W"/><circle cx="24" cy="17" r="4" fill="A"/><path d="M18 26l-7 8v7l9-7M30 26l7 8v7l-9-7" fill="A"/><path d="M20 34c0 5 4 10 4 10s4-5 4-10Z" fill="A"/>`,
  seedling: `<path d="M24 43V25"/><path d="M24 30C14 30 9 23 9 15c9 0 15 5 15 15Z" fill="A"/><path d="M24 25c0-10 6-15 15-15 0 9-6 15-15 15Z" fill="A"/><path d="M15 21l6 5M33 16l-6 5" stroke="W" stroke-width="1.6"/><path d="M11 43h26"/>`,
  wave: `<path d="M3 31c5-6 9-6 14 0s9 6 14 0 9-6 14 0v12H3Z" fill="A"/><path d="M3 20c5-6 9-6 14 0s9 6 14 0 9-6 14 0"/><path d="M3 9c5-5 9-5 14 0s9 5 14 0 9-5 14 0" stroke="A"/>`,
  dove: `<path d="M5 27c7 0 11-4 15-10 3-5 9-8 14-4l7-2-3 6c1 11-8 20-21 20l-9 5 2-7c-4-2-6-5-5-8Z" fill="W"/><path d="M17 29c7-1 12-6 13-12"/><circle cx="33" cy="15" r="1.4" fill="I"/><path d="M38 22c4 2 6 5 7 10"/><ellipse cx="42" cy="25" rx="2" ry="3.2" fill="A" transform="rotate(-40 42 25)"/><ellipse cx="45" cy="31" rx="1.8" ry="3" fill="A" transform="rotate(10 45 31)"/>`,

  // ── Mitzvos ───────────────────────────────────────────────────────────
  pushka: `<circle cx="24" cy="8" r="5" fill="W"/><path d="M22 8h4"/><rect x="9" y="15" width="30" height="28" rx="4" fill="A"/><rect x="17" y="19" width="14" height="3.5" rx="1.5" fill="I"/><path d="M24 37c-6-4-7.5-9-4.5-11 1.8-1.3 3.8-.4 4.5 1.2.7-1.6 2.7-2.5 4.5-1.2 3 2 1.5 7-4.5 11Z" fill="W"/>`,
  tehillim: `<path d="M24 19c-6-4-13-4-19-2v24c6-2 13-2 19 2Z" fill="A"/><path d="M24 19c6-4 13-4 19-2v24c-6-2-13-2-19 2Z" fill="W"/><path d="M24 19v24"/><path d="M30 13V4l8-2v9" /><circle cx="27.5" cy="13" r="2.6" fill="A"/><circle cx="35.5" cy="11" r="2.6" fill="A"/>`,
  apple: `<path d="M24 15c-6-6-17-4-17 8 0 12 8 21 17 18 9 3 17-6 17-18 0-12-11-14-17-8Z" fill="A"/><path d="M24 15c0-4 2-8 5-10"/><path d="M27 10c4-4.5 9-4.5 11-2.5-3 4.5-8 4.5-11 2.5Z" fill="W"/><path d="M14 22c0-3 2-5 4-5.5" stroke="W" stroke-width="2"/>`,
  "open-door": `<rect x="13" y="5" width="22" height="37" fill="W"/><path d="M13 5l11 4v34l-11-1Z" fill="A"/><circle cx="21" cy="27" r="1.4" fill="I"/><path d="M7 43h34M35 42l6 1"/><path d="M28 14l4 3M28 22l5 1"/>`,
  challah: `<path d="M5 30c0-9 9-14 19-14s19 5 19 14c0 5-6 7-19 7S5 35 5 30Z" fill="A"/><path d="M13 19c2 5 1 11-2 15M21 16.5c2 6 1 13-2 19M29 16.5c2 6 1 13-2 19M37 19c2 5 1 11-2 15" stroke="W" stroke-width="2"/><path d="M4 41h40"/>`,
  flowers: `<path d="M24 28V12M19 28 12 18M29 28 36 18"/><circle cx="12" cy="16" r="5.5" fill="A"/><circle cx="24" cy="10" r="5.5" fill="A"/><circle cx="36" cy="16" r="5.5" fill="A"/><circle cx="12" cy="16" r="2" fill="W"/><circle cx="24" cy="10" r="2" fill="W"/><circle cx="36" cy="16" r="2" fill="W"/><path d="M15 28h18l-6 16h-6Z" fill="W"/>`,
  "helping-hand": `<path d="M12 20a12 12 0 0 1 24 0" stroke-width="3"/><circle cx="18" cy="20" r="4.5" fill="W"/><circle cx="27" cy="19" r="4.5" fill="W"/><circle cx="23" cy="13.5" r="4" fill="W"/><path d="M5 20h38l-5 22H10Z" fill="A"/><path d="M11 27h26M13 34h22" stroke="W" stroke-width="2"/>`,
  "u-turn": `<path d="M14 43V21a10 10 0 0 1 20 0v11" stroke-width="9"/><path d="M14 43V21a10 10 0 0 1 20 0v11" stroke="A" stroke-width="4.5"/><path d="M25 30l9 10 9-10Z" fill="A"/>`,
  twelve: `<rect x="11" y="8" width="26" height="32" fill="W"/><rect x="5" y="5" width="8" height="38" rx="4" fill="A"/><rect x="35" y="5" width="8" height="38" rx="4" fill="A"/><path d="M17 19l4-3v17M26 20c0-4 8-5 8 0 0 4-8 8-8 13h8.5" stroke-width="3"/>`,
  "washing-cup": `<path d="M14 11h20l-3 31H17Z" fill="A"/><path d="M14 15c-7 0-7 12 1 12M34 15c7 0 7 12-1 12"/><path d="M14 11h20" /><path d="M20 3c1.5 2 1.5 3.5 0 4.5-1.5-1-1.5-2.5 0-4.5ZM28 2c1.5 2 1.5 3.5 0 4.5-1.5-1-1.5-2.5 0-4.5Z" fill="W"/><path d="M20 20h8" stroke="W" stroke-width="2"/>`,
  mezuzah: `<g transform="rotate(-25 24 24)"><rect x="18" y="4" width="12" height="40" rx="4" fill="A"/><path d="M21 14v5c0 2 6 2 6 0v-5M24 14v6" stroke="W" stroke-width="2"/><circle cx="24" cy="36" r="2" fill="W"/></g>`,
  yarmulke: `<path d="M5 31C5 19 13 12 24 12s19 7 19 19Z" fill="A"/><path d="M5 31h38"/><path d="M9 25l4-3.5 4 3.5 4-3.5 4 3.5 4-3.5 4 3.5 4-3.5 3 2.5" stroke="W" stroke-width="2"/><circle cx="24" cy="12" r="1.6" fill="I"/>`,
  "kosher-pot": `<path d="M7 20h34v13a9 9 0 0 1-9 9H16a9 9 0 0 1-9-9Z" fill="A"/><path d="M7 24H3M41 24h4"/><path d="M9 20c0-7 30-7 30 0" fill="W"/><path d="M22 12h4"/><path d="M20 26v11M28 26l-7 5.5 7 5.5" stroke="W" stroke-width="2.6"/>`,
  seforim: `<rect x="8" y="33" width="32" height="9" rx="2" fill="A"/><rect x="11" y="23" width="28" height="10" rx="2" fill="W"/><rect x="7" y="13" width="30" height="10" rx="2" fill="A"/><path d="M33 13v10M14 23v10M35 33v9" /><path d="M14 6l3 7M20 5l2 8" />`,
  "mitzvah-tank": `<path d="M3 18h29l8 9h5v11H3Z" fill="A"/><path d="M32 18v9h8" fill="W"/><rect x="8" y="22" width="9" height="7" rx="1" fill="W"/><rect x="20" y="22" width="8" height="7" rx="1" fill="W"/><circle cx="12" cy="38" r="4.5" fill="W"/><circle cx="35" cy="38" r="4.5" fill="W"/><path d="M12 18v-5l8-4v9" fill="W"/>`,

  // ── Holidays ──────────────────────────────────────────────────────────
  shofar: `<path d="M5 34c5 0 9-4 13-10C24 14 32 7 42 6l3 7c-10 2-16 8-20 16-4 9-10 14-18 14Z" fill="A"/><path d="M14 30l4 4M19 23l5 4M26 15l4 5M34 9l3 6" stroke="W" stroke-width="2"/><path d="M5 34l2 9"/>`,
  sukkah: `<rect x="8" y="17" width="32" height="25" fill="W"/><path d="M3 17l4-7 4 7 4-7 4 7 4-7 4 7 4-7 4 7 4-7 4 7 4-7 2 4" fill="A"/><path d="M3 17h42"/><path d="M19 42V29h10v13"/><path d="M14 22v5M34 22v5"/><circle cx="14" cy="29" r="2" fill="A"/><circle cx="34" cy="29" r="2" fill="A"/>`,
  menorah: `<path d="M24 16v20M18 43h12M24 36v7"/><path d="M5 17h38"/><path d="M8 17c0 12 32 12 32 0M14 17c0 8 20 8 20 0M19 17c0 4 10 4 10 0" /><path d="M5 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM10 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM15 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM19.5 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM28.5 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM33 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM38 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM43 9c1.6 2 1.6 4 0 5-1.6-1-1.6-3 0-5ZM24 3c1.8 2.3 1.8 4.5 0 5.8-1.8-1.3-1.8-3.5 0-5.8Z" fill="A" stroke-width="1.6"/><path d="M24 11v5" />`,
  "fruit-tree": `<circle cx="24" cy="18" r="15" fill="A"/><path d="M24 33v10M24 29l-6-5M24 31l6-6M6 43h36"/><circle cx="16" cy="13" r="2.6" fill="W"/><circle cx="29" cy="10" r="2.6" fill="W"/><circle cx="33" cy="21" r="2.6" fill="W"/><circle cx="18" cy="23" r="2.6" fill="W"/>`,
  grogger: `<rect x="12" y="6" width="22" height="16" rx="3" fill="A" transform="rotate(-15 23 14)"/><path d="M17 11l10-3M18 16l10-3" stroke="W" stroke-width="2" transform="rotate(-15 23 14)"/><path d="M24 22v6"/><rect x="21" y="28" width="6" height="15" rx="3" fill="W"/><path d="M40 8l5-2M41 15h5M39 22l4 3"/>`,
  matzah: `<path d="M8 9l4 1 4-1 4 1 4-1 4 1 4-1 4 1 4-1v30l-4 1-4-1-4 1-4-1-4 1-4-1-4 1-4-1Z" fill="A"/><path d="M14 15v20M22 15v20M30 15v20M38 15v20" stroke="W" stroke-width="2" stroke-dasharray="1 4"/>`,
  bonfire: `<path d="M24 5c6 8 12 12 10 23-1 6-6 8-10 8s-9-2-10-8c-2-8 6-12 10-23Z" fill="A"/><path d="M24 19c3 4 5 7 4 11-1 3-7 3-8 0-1-4 2-7 4-11Z" fill="W"/><rect x="6" y="37" width="36" height="6" rx="3" fill="W"/><circle cx="9" cy="40" r="1.5" fill="I"/><circle cx="39" cy="40" r="1.5" fill="I"/>`,
  luchos: `<path d="M5 43V15a8.5 8.5 0 0 1 17 0v28ZM26 43V15a8.5 8.5 0 0 1 17 0v28Z" fill="A"/><path d="M10 18h7M10 24h7M10 30h7M10 36h7M31 18h7M31 24h7M31 30h7M31 36h7" stroke="W" stroke-width="2"/>`,
  wall: `<rect x="4" y="10" width="40" height="33" fill="A"/><path d="M4 18h40M4 26h40M4 34h40M14 10v8M30 10v8M22 18v8M38 18v8M10 26v8M28 26v8M18 34v9M36 34v9" stroke="W" stroke-width="2"/><path d="M4 10h40v33H4Z"/><path d="M30 10c0-4 3-7 6-7M30 10c-2-3-5-4-8-3" stroke="I"/><path d="M36 3c-2 1-3 3-2 5 2-1 3-3 2-5Z" fill="W"/>`,
  "calendar-star": `<rect x="5" y="9" width="38" height="34" rx="4" fill="W"/><path d="M5 13a4 4 0 0 1 4-4h30a4 4 0 0 1 4 4v6H5Z" fill="A"/><path d="M14 5v8M34 5v8"/><path d="M24 24l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" fill="A"/>`,
  sun: `<circle cx="24" cy="24" r="11" fill="A"/><circle cx="42.0" cy="24.0" r="2.2" fill="I" stroke="none"/><circle cx="38.6" cy="34.6" r="2.2" fill="I" stroke="none"/><circle cx="29.6" cy="41.1" r="2.2" fill="I" stroke="none"/><circle cx="18.4" cy="41.1" r="2.2" fill="I" stroke="none"/><circle cx="9.4" cy="34.6" r="2.2" fill="I" stroke="none"/><circle cx="6.0" cy="24.0" r="2.2" fill="I" stroke="none"/><circle cx="9.4" cy="13.4" r="2.2" fill="I" stroke="none"/><circle cx="18.4" cy="6.9" r="2.2" fill="I" stroke="none"/><circle cx="29.6" cy="6.9" r="2.2" fill="I" stroke="none"/><circle cx="38.6" cy="13.4" r="2.2" fill="I" stroke="none"/>`,
  moon: `<path d="M28 5a19 19 0 1 0 15 29A15 15 0 1 1 28 5Z" fill="A"/><path d="M38.0 6.5L39.2 9.4L42.3 9.6L39.9 11.6L40.6 14.6L38.0 13.0L35.4 14.6L36.1 11.6L33.7 9.6L36.8 9.4Z" fill="W"/><path d="M43.0 20.0L43.8 21.9L45.9 22.1L44.3 23.4L44.8 25.4L43.0 24.4L41.2 25.4L41.7 23.4L40.1 22.1L42.2 21.9Z" fill="W"/>`,

  // ── Heroes (objects and scenes only) ───────────────────────────────────
  tanya: `<rect x="7" y="7" width="26" height="35" rx="3" fill="A"/><path d="M12 7v35"/><rect x="17" y="15" width="12" height="8" rx="1" fill="W"/><path d="M44 4C34 8 28 18 25 30c8-6 15-14 19-26Z" fill="W"/><path d="M25 30l-3 7M27 25l10-13"/>`,
  key: `<circle cx="14" cy="15" r="10" fill="A"/><circle cx="14" cy="15" r="3.5" fill="W"/><path d="M21 22l21 21M34 35l-5 5M39 40l-4 4M30 31l-3 3" stroke-width="3"/>`,
  "sprout-tree": `<path d="M24 43V18M24 30l-9-8M24 25l9-9M24 36l8-5"/><ellipse cx="24" cy="11" rx="5" ry="7" fill="A"/><ellipse cx="12" cy="19" rx="5" ry="6.5" fill="A" transform="rotate(-40 12 19)"/><ellipse cx="36" cy="13" rx="5" ry="6.5" fill="A" transform="rotate(40 36 13)"/><ellipse cx="35" cy="29" rx="4" ry="5.5" fill="W" transform="rotate(60 35 29)"/><path d="M12 43h24"/>`,
  "rock-water": `<path d="M4 43c0-11 6-16 14-16 7 0 9-4 15-3 7 1 11 9 10 19Z" fill="A"/><path d="M24 27c0 3 2 5 4 5" stroke="W" stroke-width="2.4"/><circle cx="25" cy="30" r="2.6" fill="W"/><path d="M25 3c2.5 3.5 2.5 6 0 7.5-2.5-1.5-2.5-4 0-7.5ZM25 14c2 2.8 2 4.8 0 6-2-1.2-2-3.2 0-6Z" fill="W"/>`,
  tent: `<path d="M3 19 24 7l21 12Z" fill="A"/><path d="M6 19v24M18 19v24M30 19v24M42 19v24M2 43h44"/><circle cx="12" cy="21.5" r="1.6" fill="W" stroke="none"/><circle cx="24" cy="21.5" r="1.6" fill="W" stroke="none"/><circle cx="36" cy="21.5" r="1.6" fill="W" stroke="none"/>`,
  globe: `<circle cx="24" cy="24" r="19" fill="A"/><path d="M24 5c-8 6-8 32 0 38M24 5c8 6 8 32 0 38M8 15c10 4 22 4 32 0M8 33c10-4 22-4 32 0" stroke="W" stroke-width="2"/><circle cx="24" cy="24" r="19"/>`,
  yeshiva: `<rect x="8" y="20" width="32" height="22" fill="A"/><path d="M4 22 24 10l20 12"/><path d="M24 10V3h5" /><path d="M20 42v-9a4 4 0 0 1 8 0v9" fill="W"/><rect x="12" y="25" width="5" height="5" fill="W"/><rect x="31" y="25" width="5" height="5" fill="W"/><path d="M22 18c0-3 4-3 4 0v2h-4Z" fill="W"/>`,
  cup: `<path d="M11 5h26c0 15-5 21-13 21S11 20 11 5Z" fill="A"/><path d="M14 11h20" stroke="W" stroke-width="2"/><path d="M24 26v10"/><path d="M15 42c0-4 4-6 9-6s9 2 9 6Z" fill="A"/>`,
  bear: `<circle cx="12" cy="13" r="6" fill="A"/><circle cx="36" cy="13" r="6" fill="A"/><circle cx="24" cy="26" r="16" fill="A"/><ellipse cx="24" cy="32" rx="7" ry="5.5" fill="W"/><path d="M21.5 30h5l-2.5 3Z" fill="I"/><circle cx="18" cy="23" r="1.8" fill="I"/><circle cx="30" cy="23" r="1.8" fill="I"/><circle cx="12" cy="13" r="2.4" fill="W"/><circle cx="36" cy="13" r="2.4" fill="W"/>`,
  mortar: `<path d="M33 3l-9 20" stroke-width="5"/><path d="M33 3l-9 20" stroke="W" stroke-width="2"/><path d="M5 23h38c0 11-8 16-19 16S5 34 5 23Z" fill="A"/><path d="M16 39l-2 4h20l-2-4"/><path d="M12 29c2 3 5 4 8 4" stroke="W" stroke-width="2"/>`,
  scales: `<path d="M24 15 15 42h18Z" fill="A"/><path d="M6 15h36"/><path d="M8 15l-5 11M8 15l5 11M40 15l-5 11M40 15l5 11"/><path d="M2 26h12a6 6 0 0 1-12 0ZM34 26h12a6 6 0 0 1-12 0Z" fill="W"/><circle cx="24" cy="12" r="3" fill="A"/>`,
  cave: `<path d="M2 43C4 22 14 10 26 10s20 14 20 33Z" fill="A"/><path d="M14 43c0-10 4-16 10-16s10 6 10 16Z" fill="I"/><path d="M20 43c0-3 2-5 4-8 2 3 4 5 4 8Z" fill="W"/><path d="M8 25l5-2M38 22l4 3M30 15l5 1" stroke="W" stroke-width="2"/>`,
  leap: `<rect x="17" y="27" width="14" height="16" fill="A"/><path d="M17 32h14M17 37h14M24 27v5M21 32v5M27 37v6" stroke="W" stroke-width="2"/><path d="M4 42C6 16 38 6 42 32" stroke-dasharray="0.1 5" stroke-width="3"/><path d="M36 28l6 6 3-8Z" fill="A"/><path d="M2 43h44"/>`,
  spring: `<path d="M24 34V14"/><path d="M24 14c-7 0-11 7-13 15M24 14c7 0 11 7 13 15M24 20c-4 0-6 4-7 9M24 20c4 0 6 4 7 9" stroke="A" stroke-width="3"/><path d="M24 14c-7 0-11 7-13 15M24 14c7 0 11 7 13 15"/><path d="M6 34h36l-5 9H11Z" fill="A"/><path d="M24 4c1.6 2.4 1.6 4 0 5-1.6-1-1.6-2.6 0-5Z" fill="W"/>`,
  "walking-stick": `<path d="M8 45 36 9" stroke-width="3.5"/><path d="M30 3c6-3 15 1 14 9-1 6-9 9-14 5-4-3-5-11 0-14Z" fill="A"/><path d="M34 6l6 8" stroke="W" stroke-width="2"/><path d="M3 45h40"/>`,
  inkpot: `<path d="M44 3C34 6 27 15 24 27c8-5 15-13 20-24Z" fill="W"/><path d="M24 27l-2 6M27 22l9-11"/><path d="M10 26h20v12a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5Z" fill="A"/><rect x="14" y="21" width="12" height="5" rx="1" fill="A"/><path d="M14 33h12" stroke="W" stroke-width="2"/>`,
  "oil-lamp": `<path d="M4 30c0-6 9-8 20-6l18-5c0 7-7 15-20 15-11 0-18-1-18-4Z" fill="A"/><path d="M4 30C1 30 1 24 6 25"/><path d="M42 6c3 4 3.5 7 0 10-3.5-3-3-6 0-10Z" fill="A"/><path d="M42 16v3"/><path d="M14 34l-2 9h20l-2-9" fill="W"/>`,
  ladder: `<path d="M15 45 20 6M33 45 28 6M18 36h13M19 27h10.6M20 18h8.6M21 10h6.4"/><path d="M9 9c0-3 3-5 6-4 1-3 5-4 7-1 3-1 6 1 5 4" fill="W"/><path d="M38.0 3.0L39.1 5.5L41.8 5.8L39.7 7.6L40.4 10.2L38.0 8.8L35.6 10.2L36.3 7.6L34.2 5.8L36.9 5.5Z" fill="A"/><path d="M8 45h32"/><path d="M15 45 20 6M33 45 28 6" stroke="A" stroke-width="1.4"/>`,
  flame: `<path d="M24 3c8 9 15 15 13 27-1 8-7 13-13 13s-12-5-13-13c-1-9 7-12 6-20 4 3 5 6 5 9 3-5 2-11 2-16Z" fill="A"/><path d="M24 24c4 4 6 8 5 12-1 3-4 4-5 4s-4-1-5-4c-1-4 2-8 5-12Z" fill="W"/>`,
  notebook: `<rect x="8" y="5" width="26" height="38" rx="3" fill="W"/><path d="M8 11h-3M8 18h-3M8 25h-3M8 32h-3M8 39h-3"/><path d="M14 14h14M14 20h14M14 26h9"/><path d="M45 13 29 39l-4 3 1-5 16-26Z" fill="A"/><path d="M39 16l4 3"/>`,
  "scroll-seal": `<path d="M10 9h26a4 4 0 0 1 0 8H14v22a4 4 0 0 1-8 0V13a4 4 0 0 1 4-4Z" fill="W"/><path d="M14 17h24v22H10" fill="W"/><path d="M18 23h14M18 28h14M18 33h8"/><circle cx="35" cy="37" r="6" fill="A"/><path d="M33 42l-2 5 4-2 4 2-2-5" fill="A"/>`,
  harp: `<path d="M12 5v38h27C39 26 29 11 12 5Z" fill="W"/><path d="M18 12v31M24 17v26M30 24v19M35 33v10" stroke-width="1.8"/><rect x="7" y="3" width="7" height="42" rx="3.5" fill="A"/><path d="M12 5C29 11 39 26 39 43" stroke-width="4" stroke="A"/><path d="M12 5C29 11 39 26 39 43"/>`,
  "patched-bag": `<path d="M16 15C8 23 8 43 24 43s16-20 8-28Z" fill="A"/><path d="M15 15l-3-7h24l-3 7Z" fill="A"/><path d="M16 15h16"/><rect x="18" y="25" width="11" height="10" fill="W" transform="rotate(-8 23 30)"/><path d="M20 26l1 2M24 25l1 2M27 27l1 2" stroke-width="1.6"/>`,
  "pocket-watch": `<circle cx="24" cy="6" r="3.5"/><path d="M24 9.5v1.5"/><circle cx="24" cy="27" r="16" fill="A"/><circle cx="24" cy="27" r="12" fill="W"/><path d="M24 19v8l5 4"/><circle cx="24" cy="27" r="1.4" fill="I"/>`,
  feather: `<path d="M40 4C22 8 12 22 9 41c14-6 26-17 31-37Z" fill="A"/><path d="M5 45l30-35" /><path d="M18 30l7 1M24 23l7 0M30 16l5-1" stroke="W" stroke-width="1.8"/>`,
  footprint: `<path d="M17 18c6-2 12 2 12 10 0 7-2 15-8 15s-8-6-8-12c0-6 0-12 4-13Z" fill="A"/><circle cx="15" cy="10" r="3" fill="A"/><circle cx="21.5" cy="7" r="2.6" fill="A"/><circle cx="27" cy="8" r="2.3" fill="A"/><circle cx="31" cy="11" r="2" fill="A"/><circle cx="33" cy="15.5" r="1.8" fill="A"/>`,
  gem: `<path d="M9 17l8-10h14l8 10-15 25Z" fill="A"/><path d="M9 17h30M17 7l-2 10 9 25 9-25-2-10M15 17l9-10 9 10" stroke="W" stroke-width="1.8"/><path d="M9 17l8-10h14l8 10-15 25Z"/>`,
  rose: `<circle cx="24" cy="15" r="11" fill="A"/><path d="M24 15c-3-3 1-6 4-4 4 3 0 10-5 9-6-1-7-9-2-12" stroke="W" stroke-width="2"/><path d="M24 26v18"/><path d="M24 36c-5 0-9-3-10-8 6 0 9 3 10 8ZM24 32c4 0 7-3 8-7-5 0-7 3-8 7Z" fill="A"/>`,
  "staff-blossom": `<path d="M24 45V14" stroke-width="4"/><path d="M24 45V14" stroke="W" stroke-width="1.5"/><circle cx="24" cy="9" r="5" fill="A"/><circle cx="15" cy="15" r="4.2" fill="A"/><circle cx="33" cy="15" r="4.2" fill="A"/><circle cx="24" cy="9" r="1.6" fill="W"/><circle cx="15" cy="15" r="1.4" fill="W"/><circle cx="33" cy="15" r="1.4" fill="W"/><path d="M24 24c-5-1-8 1-9 5 4 1 7-1 9-5ZM24 30c5-1 8 1 9 5-4 1-7-1-9-5Z" fill="A"/>`,
  candle: `<circle cx="24" cy="13" r="10" fill="none" stroke="A" stroke-width="1.6" stroke-dasharray="2 3"/><path d="M24 5c3.5 4 4 8 0 11-4-3-3.5-7 0-11Z" fill="A"/><path d="M24 16v4"/><rect x="18" y="20" width="12" height="18" rx="2" fill="W"/><path d="M10 38h28l-3 6H13Z" fill="A"/>`,
  lantern: `<path d="M18 9a6 6 0 0 1 12 0"/><path d="M14 13h20l-2-4H16Z" fill="A"/><rect x="15" y="13" width="18" height="24" rx="2" fill="W"/><path d="M24 20c3 4 3.5 7 0 10-3.5-3-3-6 0-10Z" fill="A"/><path d="M15 13v24M33 13v24"/><path d="M13 37h22l-2 6H15Z" fill="A"/>`,
  jug: `<path d="M13 9h18l2 7c5 2 5 12 0 15l-2 2v4a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6V18Z" fill="A"/><path d="M13 9l-5-3"/><path d="M33 18c4 1 4 9 0 11" stroke="W" stroke-width="2"/><path d="M6 12c1.6 2.4 1.6 4 0 5-1.6-1-1.6-2.6 0-5Z" fill="W"/><path d="M14 24h17" stroke="W" stroke-width="2"/>`,
  ship: `<path d="M4 29h40l-6 11H10Z" fill="A"/><path d="M24 29V4"/><path d="M24 6l14 19H24Z" fill="W"/><path d="M24 10l-10 15h10Z" fill="W"/><path d="M2 45c4-3 7-3 11 0s7 3 11 0 7-3 11 0 7 3 11 0"/>`,
  "hill-path": `<path d="M2 43C10 20 30 12 46 24v19Z" fill="A"/><path d="M30 17c-4 5 6 6 1 10s-14 4-10 9-5 7-7 7" stroke="W" stroke-width="3"/><path d="M38.0 5.0L39.1 7.5L41.8 7.8L39.7 9.6L40.4 12.2L38.0 10.8L35.6 12.2L36.3 9.6L34.2 7.8L36.9 7.5Z" fill="W"/>`,
  crown: `<path d="M5 37 7 13l9 11 8-15 8 15 9-11 2 24Z" fill="A"/><rect x="5" y="33" width="38" height="7" rx="2" fill="W"/><circle cx="24" cy="36.5" r="2" fill="A"/><circle cx="14" cy="36.5" r="1.6" fill="A"/><circle cx="34" cy="36.5" r="1.6" fill="A"/>`,
  well: `<path d="M6 15 24 6l18 9Z" fill="A"/><path d="M11 15v11M37 15v11"/><rect x="8" y="26" width="32" height="17" rx="2" fill="A"/><path d="M8 32h32M8 38h32M16 26v6M28 26v6M22 32v6M34 32v6M14 38v5M30 38v5" stroke="W" stroke-width="1.8"/><path d="M24 15v5"/><path d="M20 20h8l-1 5h-6Z" fill="W"/>`,

  // ── Small icons used inside the chapter list ────────────────────────────
  star: `<path d="M24 5l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L24 33.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8Z" fill="A"/>`,
  envelope: `<rect x="5" y="11" width="38" height="27" rx="3" fill="A"/><path d="M5 14l19 14 19-14" stroke="W" stroke-width="2.4"/>`,
  dot: `<circle cx="24" cy="24" r="6" fill="A"/>`,
};

export interface IconColors {
  ink?: string;
  accent: string;
  white?: string;
}

export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

export const hasIcon = (name: string): boolean => name in ICONS;

/** Inner SVG markup (no <svg> wrapper) for embedding in covers and tiles. */
export function iconBody(name: string, c: IconColors): string {
  const body = ICONS[name] ?? ICONS["dot"] ?? "";
  const ink = c.ink ?? "#22304A";
  const white = c.white ?? "#FFFFFF";
  const colored = body
    .replace(/(fill|stroke)="I"/g, `$1="${ink}"`)
    .replace(/(fill|stroke)="A"/g, `$1="${c.accent}"`)
    .replace(/(fill|stroke)="W"/g, `$1="${white}"`);
  return `<g fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${colored}</g>`;
}

/** A standalone inline <svg> (decorative: aria-hidden). */
export function iconSvg(name: string, c: IconColors, size = 48, cls = ""): string {
  return `<svg class="ic ${cls}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${iconBody(name, c)}</svg>`;
}

/** Plain geometric control icons (bedtime.md §3 "Controls use plain geometric icons"). */
const svg = (size: number, body: string, filled = false) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${
    filled
      ? 'fill="currentColor"'
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  } aria-hidden="true">${body}</svg>`;

export const GLYPHS = {
  play: (s = 24) =>
    svg(
      s,
      '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/>',
      true,
    ),
  pause: (s = 24) =>
    svg(
      s,
      '<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>',
      true,
    ),
  next: (s = 24) =>
    svg(
      s,
      '<path d="M6 6.2v11.6a.8.8 0 0 0 1.2.7l8.6-5.8a.8.8 0 0 0 0-1.4L7.2 5.5a.8.8 0 0 0-1.2.7Z"/><rect x="16.5" y="5.5" width="2.2" height="13" rx="1"/>',
      true,
    ),
  prev: (s = 24) =>
    svg(
      s,
      '<path d="M18 6.2v11.6a.8.8 0 0 1-1.2.7l-8.6-5.8a.8.8 0 0 1 0-1.4l8.6-5.8a.8.8 0 0 1 1.2.7Z"/><rect x="5.3" y="5.5" width="2.2" height="13" rx="1"/>',
      true,
    ),
  back: (s = 28) => svg(s, '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4h4"/>'),
  fwd: (s = 28) => svg(s, '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M20 4v4h-4"/>'),
  down: (s = 28) => svg(s, '<path d="m6 9 6 6 6-6"/>'),
  more: (s = 24) =>
    svg(
      s,
      '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
      true,
    ),
  info: (s = 22) =>
    svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.2"/>'),
  arrow: (s = 18) => svg(s, '<path d="m9 6 6 6-6 6"/>'),
} as const;

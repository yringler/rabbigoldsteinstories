/** `/p/<edition>/<type>` (bedtime.md §2): a deep link to one playlist, served the home page. */
export const DEEP_LINK = /^\/p\/(\d{4}-\d{2}-\d{2}(?:-pm)?)\/([a-z]+)\/?$/;

export function isDeepLink(pathname: string): boolean {
  return DEEP_LINK.test(pathname);
}

export function parseDeepLink(pathname: string): { edition: string; type: string } | null {
  const m = DEEP_LINK.exec(pathname);
  return m ? { edition: m[1]!, type: m[2]! } : null;
}

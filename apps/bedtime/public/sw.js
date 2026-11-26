/* Lights Out Stories service worker (bedtime.md §1 "Offline / PWA", §6 MVP):
 * - the app shell (pages, built CSS/JS/fonts, icons): cache first, refreshed in the background;
 * - the playlist JSON under /playlists/: network first, cache only when offline (a removed story
 *   must disappear at once; the cache is just for showing the last known cards offline);
 * - audio is never cached (no CORS on the media host: opaque responses break range requests). */
const VERSION = "v3";
const SHELL = `bedtime-shell-${VERSION}`;
const DATA = `bedtime-data-${VERSION}`;
const PAGES = ["/", "/earlier/", "/about/", "/landing/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PAGES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(cacheName, request, fallbackUrl, matchOptions) {
  const cache = await caches.open(cacheName);
  const cached =
    (await cache.match(request, matchOptions)) ||
    (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || new Response("", { status: 503, statusText: "Offline" });
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(request)) ||
      new Response("{}", { status: 503, headers: { "content-type": "application/json" } })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // audio and anything else: straight to the network
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/playlists/")) {
    event.respondWith(networkFirst(DATA, req));
    return;
  }
  if (req.mode === "navigate") {
    const fallback = url.pathname.startsWith("/p/") ? "/" : undefined;
    // Pages ignore the query (e.g. /?play=mix offline is the cached /).
    event.respondWith(staleWhileRevalidate(SHELL, req, fallback, { ignoreSearch: true }));
    return;
  }
  event.respondWith(staleWhileRevalidate(SHELL, req));
});

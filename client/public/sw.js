/* Bullex PWA service worker — minimal. Only caches icons/manifest for installability.
   All app code (HTML/JS/CSS) is always fetched fresh from the network so updates appear immediately. */
const CACHE = "bullex-icons-v3";
const ICONS = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ICONS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Serve icons/manifest from cache
  if (ICONS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((c) => c || fetch(req))
    );
    return;
  }
  // Everything else: pass-through to network (no caching). Browser HTTP cache still applies.
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

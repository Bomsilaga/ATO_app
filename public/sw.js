// Minimal service worker: network-first for everything, cached shell as an
// offline fallback for navigations. Data (records, reports) always comes
// from the network — a tax app must never show stale figures from a cache.
const CACHE = "ato-triage-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/dashboard", "/login"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const shell = await caches.match("/dashboard");
        if (shell) return shell;
      }
      return Response.error();
    })
  );
});

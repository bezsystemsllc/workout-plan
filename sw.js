// Tempo service worker — offline app shell via precache + background refresh.
// Bump CACHE to ship an update (old caches are purged on activate).
const CACHE = "tempo-v9";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./storage.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./data/exercises.js",
  "./data/workouts.js",
  "./data/meals.js",
  "./data/exercise-icons.js",
  "./data/motivation.js",
  "./data/foods.js",
  "./lib/plan.js",
  "./lib/meals.js",
  "./lib/progression.js",
  "./lib/adaptations.js",
  "./lib/calc.js",
  "./lib/modal.js",
  "./lib/date-nav.js",
  "./lib/html.js",
  "./views/today.js",
  "./views/workout.js",
  "./views/meals.js",
  "./views/progress.js",
  "./views/settings.js",
  "./views/timer.js",
];
const ASSET_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.location.href).href));

function fetchAndCache(req, cacheKey = req) {
  return fetch(req).then((res) => {
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      return caches.open(CACHE).then((c) => c.put(cacheKey, copy)).then(() => res);
    }
    return res;
  });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return; // same-origin only

  // Navigations: prefer the network so users see deployed fixes promptly, then
  // fall back to the cached app shell for offline deep links like /workout.
  if (req.mode === "navigate") {
    const fresh = fetchAndCache(req, "./index.html");
    e.respondWith(fresh.catch(() => caches.match("./index.html")));
    return;
  }

  // App-shell assets are cache-first; CACHE version bumps pick up changes.
  if (ASSET_URLS.has(req.url)) {
    e.respondWith(caches.match(req).then((cached) => cached || fetchAndCache(req)));
    return;
  }

  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

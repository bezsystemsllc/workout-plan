// Tempo service worker — offline app shell via precache + cache-first.
// Bump CACHE to ship an update (old caches are purged on activate).
const CACHE = "tempo-v4";

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
  "./views/today.js",
  "./views/workout.js",
  "./views/meals.js",
  "./views/progress.js",
  "./views/settings.js",
  "./views/timer.js",
];

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

  // Navigations: serve the cached app shell (clean-URL SPA). This makes deep
  // links like /workout work offline and on any host, regardless of whether the
  // server has an SPA fallback. Falls back to the network on a cold cache.
  if (req.mode === "navigate") {
    e.respondWith(caches.match("./index.html").then((r) => r || fetch(req)));
    return;
  }

  // Assets: cache-first, then network (and cache what we fetch).
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

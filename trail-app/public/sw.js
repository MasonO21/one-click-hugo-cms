// Offline app shell. Trails themselves live in IndexedDB; this makes the app open with no signal.
const CACHE = 'waypath-shell-v1';
const SHELL = [
  '/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon.svg',
  '/lib/geo.js', '/lib/guide.js', '/lib/trail.js', '/lib/recorder.js', '/lib/gpx.js',
  '/lib/sim.js', '/lib/glasses.js', '/lib/sensors.js', '/lib/store.js', '/lib/map.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // stale-while-revalidate: instant open offline, fresh copy for next time
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Offline cache for the installable web version. Bump VERSION whenever files change.
const VERSION = 'shardfall-v12';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/data.js', 'js/store.js', 'js/audio.js', 'js/match.js', 'js/draw.js', 'js/hud.js', 'js/net.js', 'js/platform.js', 'js/lobby.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/favicon-32.png', 'assets/icons/apple-touch-icon.png',
  'legal/privacy.html', 'legal/terms.html'
];
// In-match hero sprites (same list as SF.ART.sprites in js/data.js), so offline matches have them.
// Cached best-effort: a missing file just falls back to the drawn crystal hero.
const SPRITES = ['kaida', 'orin', 'sylva', 'brakka', 'nyx', 'lumen', 'vexa', 'drace', 'rhea', 'oska', 'quarra',
  'kaida_frost', 'kaida_solar', 'orin_abyss', 'orin_coral', 'sylva_autumn', 'sylva_storm', 'brakka_magma', 'nyx_bloodmoon',
  'lumen_aurora', 'lumen_laureate', 'vexa_neon', 'drace_obsidian', 'rhea_dawn', 'oska_reef', 'oska_storm'].map(id => `assets/art/sprites/${id}.webp`);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => Promise.allSettled(SPRITES.map(u => c.add(u))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Pages: network first so updates arrive, cache when offline. Everything else: cache first.
// Fonts from Google are cached as they load; the game API and WebSocket are never cached.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  if (sameOrigin && url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});

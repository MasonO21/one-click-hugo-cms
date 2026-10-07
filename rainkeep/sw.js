/*
 * Rainkeep service worker: offline play when the game is hosted on a real domain.
 * Registered by native.js (KHNative.init) only on http(s), outside iframes, outside the
 * Capacitor app, and not on localhost (so local edits are never served stale).
 *
 * Strategy
 * - App shell (scripts, styles, fonts, the vendored 3D engine, icons, manifest): cache-first
 *   from a versioned cache.
 *   Releasing a new web build = change VERSION below. The new worker precaches fresh
 *   copies, takes over, and deletes the old caches. scripts/build-www.mjs stamps VERSION
 *   with a content hash automatically for builds made from www/.
 * - index.html / navigations: network-first (so updates arrive), cached copy offline.
 * - Google Fonts CSS and font files (older builds used them): stale-while-revalidate.
 * - Every other cross-origin request is left to the browser.
 */
'use strict';

const VERSION = 'rainkeep-v4.0'; // bump on every web deploy
const SHELL_CACHE = `${VERSION}-shell`;
const FONT_CACHE = 'rainkeep-fonts-v1';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  'index.html', 'style.css', 'data.js', 'lore.js', 'audio.js', 'native.js', 'core.js', 'art2d.js', 'ui.js',
  'vendor/three.min.js', 'art3d.js', 'town.js', 'town3d.js', 'events.js', 'keep.js', 'channels.js', 'bond.js', 'cloudrun.js', 'decor.js', 'story.js', 'forge.js', 'trials.js', 'patron.js', 'caravan.js', 'world.js', 'bloom.js', 'world3d.js',
  'manifest.webmanifest', 'icon.svg',
  'fonts/el-messiri-latin-500-normal.woff2', 'fonts/el-messiri-latin-600-normal.woff2', 'fonts/el-messiri-latin-700-normal.woff2',
  'fonts/barlow-semi-condensed-latin-400-normal.woff2', 'fonts/barlow-semi-condensed-latin-500-normal.woff2',
  'fonts/barlow-semi-condensed-latin-600-normal.woff2', 'fonts/barlow-semi-condensed-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

const SCOPE = new URL('./', self.location.href);
const INDEX_URL = new URL('index.html', SCOPE).href;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// Safari refuses redirected responses for navigations, so store a clean copy.
async function clean(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function cacheable(res) {
  return !!res && res.status === 200 && (res.type === 'basic' || res.type === 'cors');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One failed or missing file must not break installation.
    await Promise.allSettled(SHELL.map(async (path) => {
      const url = new URL(path, SCOPE).href;
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (cacheable(res)) await cache.put(url, await clean(res));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, FONT_CACHE]);
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('rainkeep-') && !keep.has(n))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(SCOPE.href)) return; // rest of the site: not ours
    const isPage = req.mode === 'navigate' || url.href === INDEX_URL || url.href === SCOPE.href;
    event.respondWith(isPage ? networkFirst(event, req, url) : cacheFirst(req));
    return;
  }
  if (FONT_HOSTS.has(url.hostname)) event.respondWith(staleWhileRevalidate(event, req));
  // Any other cross-origin request falls through to the network untouched.
});

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (cacheable(res)) await cache.put(req, await clean(res.clone())).catch(() => {});
    return res;
  } catch (err) {
    const loose = await cache.match(req, { ignoreSearch: true });
    return loose || Response.error();
  }
}

async function networkFirst(event, req, url) {
  const cache = await caches.open(SHELL_CACHE);
  const key = url.href === SCOPE.href || url.pathname.endsWith('/') ? INDEX_URL : url.href.split('?')[0];
  const network = fetch(req).then(async (res) => {
    if (cacheable(res)) {
      const copy = await clean(res.clone());
      await cache.put(key, copy).catch(() => {});
    }
    return res;
  });
  event.waitUntil(network.catch(() => {}));

  // Slow network: fall back to the cached page after a few seconds; the fetch above
  // still finishes in the background and refreshes the cache for next launch.
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const cached = await cache.match(key);
    return cached || await network;
  } catch (err) {
    return (await cache.match(key)) || (await cache.match(INDEX_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(async (res) => {
    // Font CSS is fetched no-cors (opaque); font files are CORS. Both are safe to keep.
    if (res && (res.ok || res.type === 'opaque')) await cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  try { return await network; } catch (err) { return Response.error(); }
}

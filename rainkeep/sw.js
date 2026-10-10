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

const VERSION = 'rainkeep-v4.44'; // bump on every web deploy
const SHELL_CACHE = `${VERSION}-shell`;
const FONT_CACHE = 'rainkeep-fonts-v1';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  'index.html', 'style.css', 'data.js', 'lore.js', 'audio.js', 'native.js', 'core.js', 'artmap.js', 'art2d.js', 'ui.js', 'gfx.js', 'net-http.js', 'net.js',
  'vendor/three.min.js', 'vendor/three-gltf.js', 'vendor/meshopt-decoder.js', 'art3d.js', 'models3d.js', 'town.js', 'town3d.js', 'events.js', 'keep.js', 'dryseason.js', 'channels.js', 'bond.js', 'cloudrun.js', 'decor.js', 'story.js', 'forge.js', 'trials.js', 'patron.js', 'caravan.js', 'world.js', 'bloom.js', 'deepspring.js', 'crossing.js', 'companions.js', 'road.js', 'rivals.js', 'pacts.js', 'siege.js', 'intel.js', 'formation.js', 'heirloom.js', 'awaken.js', 'talents.js', 'hall.js', 'outposts.js', 'trade.js', 'decrees.js', 'journeys.js', 'charters.js', 'defense.js', 'ranks.js', 'clash.js', 'fishing.js', 'derby.js', 'cookfire.js', 'dig.js', 'founding.js', 'kinships.js', 'leviathan.js', 'charms.js', 'spar.js', 'stars.js', 'arts.js', 'heroic.js', 'orders.js', 'mp.js', 'playtest.js', 'ready.js', 'news.js', 'world3d.js',
  'manifest.webmanifest', 'icon.svg',
  'fonts/el-messiri-latin-500-normal.woff2', 'fonts/el-messiri-latin-600-normal.woff2', 'fonts/el-messiri-latin-700-normal.woff2',
  'fonts/barlow-semi-condensed-latin-400-normal.woff2', 'fonts/barlow-semi-condensed-latin-500-normal.woff2',
  'fonts/barlow-semi-condensed-latin-600-normal.woff2', 'fonts/barlow-semi-condensed-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  // painted art (artmap.js)
  ...'zahra tariq leila idris soraya nadia bashir amira kofi yara rashid samira omar nuri halima lio tamir mara imani kaveh tomas sefa maram hadi nima yusra haroun noor pal-fennec pal-sandcat pal-hoopoe pal-oryx pal-falcon pal-caracal'.split(' ').map((n) => `art/portraits/${n}.webp`),
  ...'raider beast scorpion serpent drake spirit construct crystal sun void'.split(' ').map((n) => `art/foes/${n}.webp`),
  'art/scenes/act1.webp', 'art/scenes/act2.webp', 'art/scenes/act3.webp', 'art/title.webp',
  ...'shelter quarry grove well mine infirmary barracks watchtower archive hall storehouse forge deepspring companions'.split(' ').map((n) => `art/buildings/${n}.webp`),
  ...'rainfest hunt builder forgefest spirerush oasis crossing road road-board rivals siege intel clash derby dry journeys cookfire buriedcity founding leviathan stars'.split(' ').map((n) => `art/events/${n}.webp`),
  'art/derby/camel.webp', 'art/derby/track.webp',
  ...'founder stipend ledger growth stormkit warchest forgekit foundkit tidekit lvpack lvpack2 sg1 sg2 sg3 sg4 sg5 sg6'.split(' ').map((n) => `art/offers/${n}.webp`),
  ...'cart wagons observatory bunker chapel airship den pool forge shrine scouts mine'.split(' ').map((n) => `art/ruins/${n}.webp`),
  'art/endings/act1.webp', 'art/endings/act2.webp', 'art/endings/act3.webp',
  'art/wyrm/grotto.webp', 'art/wyrm/emblem.webp',
  ...'anvil bag ballista bandit beacon bell book bounty btn-ember btn-gold btn-indigo calendar caravan channel chest cistern ck-banquet ck-broth ck-fire ck-larder ck-pilaf ck-roast ck-skewers ck-stew clash clashbanner clashmap clock compass copper corner dc-arms dc-feast dc-harvest dc-roads dc-rush dc-vigil decree derby dg-beads dg-charge dg-chariot dg-chest dg-clock dg-flute dg-idol dg-jar dg-lamp dg-mirror dg-rock dg-sandal dg-seal dg-spear dg-staff dg-tablet dg-trowel die drill dry dry-chest dry-cistern dry-medal dry-ration dry-watch duel dustdevil dy-bridle dy-cup dy-pads dy-ribbon dy-saddle dy-speed dy-spirit dy-stamina errand event firepot fish fish-barb fish-carp fish-eel fish-float fish-koi fish-minnow fish-rod fish-whiskers flag food fort fw garden gem glory hammer heart heirloom heroes hl-bell hl-bridle hl-conch hl-ladle hl-lantern hl-pick hl-quiver horn hunt intel journal journey kite lostcaravan luckydie mail market mirage pals paw peace pearl people plunder power rank-champ rank-elite rank-vet recruit relic rescue revenge riders riptide road ruin scorpking scout scroll shieldwall shop shrine siegechest spire stakes star stone storm sunsteel swarm sword tideglass town tr-armored tr-frenzy tr-regen tr-shell tr-venom treat trophy veil walls water waterrights well whetstone world wyrm'.split(' ').map((n) => `art/ui/${n}.webp`),
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

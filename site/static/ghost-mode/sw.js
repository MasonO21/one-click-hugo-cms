/* Ghost Mode for Kids: offline support, so the installed app opens without a connection. */
const CACHE = 'ghost-mode-v14';
const SHELL = [
  '/ghost-mode/',
  '/ghost-mode/manifest.webmanifest',
  '/ghost-mode/icon-192.png',
  '/ghost-mode/icon-512.png',
  '/ghost-mode/icon-maskable-512.png',
  '/ghost-mode/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ghost-mode-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app page: network first so updates show up, saved copy when offline.
  if (req.mode === 'navigate' && url.pathname.startsWith('/ghost-mode')) {
    // Only the app page itself, loaded successfully and without a redirect, may replace the saved copy.
    // Error pages, captive portals and other files must never become the offline app.
    const isShell = url.pathname === '/ghost-mode/' || url.pathname === '/ghost-mode/index.html';
    e.respondWith(
      fetch(req)
        .then(res => {
          if (isShell && res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('/ghost-mode/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/ghost-mode/'))
    );
    return;
  }

  // Icons, manifest and fonts: saved copy first, then network.
  const ownAsset = url.origin === location.origin && url.pathname.startsWith('/ghost-mode/');
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (ownAsset || font) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});

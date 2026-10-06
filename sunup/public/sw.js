// Sunup service worker: offline app shell and push notifications.
const CACHE = 'sunup-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key !== 'sunup-auth') await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);

// Network first, falling back to the last copy so the app opens offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(new URL('./', self.registration.scope).href))),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Sunup', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'sunup:refresh' });
      await self.registration.showNotification(data.title || 'Sunup', {
        body: data.body || '',
        tag: data.tag,
        renotify: !!data.urgent,
        requireInteraction: !!data.urgent,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: data.urgent ? [300, 150, 300, 150, 300] : [80],
        // Check in straight from the notification (browsers without action buttons ignore this).
        actions: data.action === 'checkin' ? [{ action: 'checkin', title: data.urgent ? "I'm okay" : "I'm up" }] : [],
        data: { link: data.link || '', userId: data.userId || '' },
      });
    })(),
  );
});

// The page keeps a copy of its sign-in token here so the "I'm up" button works without opening the app.
const TOKEN_URL = new URL('__sunup/token', self.registration.scope).href;

async function checkInFromNotification(forUserId) {
  const cache = await caches.open('sunup-auth');
  const saved = await cache.match(TOKEN_URL);
  let session = null;
  try {
    session = saved ? JSON.parse(await saved.text()) : null;
  } catch {
    session = null;
  }
  // Only check in the account the notification was for (someone else may be signed in now).
  if (!session?.token || (forUserId && session.userId !== forUserId)) return false;
  const token = session.token;
  const res = await fetch(new URL('api/action', self.registration.scope).href, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'checkIn' }),
  }).catch(() => null);
  if (!res || !res.ok) return false;
  await self.registration
    .showNotification("You're checked in", { body: "Your circle knows you're okay.", tag: 'sunup-reminder', icon: 'icon-192.png' })
    .catch(() => undefined);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of windows) w.postMessage({ type: 'sunup:refresh' });
  return true;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'checkin') {
    event.waitUntil(
      checkInFromNotification(event.notification.data?.userId).then((done) => {
        if (!done) return self.clients.openWindow(new URL('./#today', self.registration.scope).href);
      }),
    );
    return;
  }
  const target = new URL(`./${event.notification.data?.link || ''}`, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if (w.url.startsWith(self.registration.scope)) {
          await w.focus();
          if ('navigate' in w) await w.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

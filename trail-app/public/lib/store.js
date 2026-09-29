// Local persistence (IndexedDB, works offline, handles photos) + the sharing API client.

const DB_NAME = 'waypath';
const STORE = 'trails';

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const localTrails = {
  list: () => tx('readonly', (s) => s.getAll()),
  get: (id) => tx('readonly', (s) => s.get(id)),
  put: (trail) => tx('readwrite', (s) => s.put(trail)),
  remove: (id) => tx('readwrite', (s) => s.delete(id)),
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const remoteTrails = {
  nearby: ({ lat, lng, radiusKm = 100 } = {}) => {
    const q = new URLSearchParams({ radiusKm });
    if (lat != null && lng != null) {
      q.set('lat', lat);
      q.set('lng', lng);
    }
    return api(`/api/trails?${q}`).then((r) => r.trails);
  },
  get: (id) => api(`/api/trails/${encodeURIComponent(id)}`),
  publish: (trail) =>
    api('/api/trails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trail) }),
  unpublish: (id, token) => api(`/api/trails/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Delete-Token': token } }),
};

/** Small key/value settings in localStorage; every access guarded (private mode can throw). */
export const settings = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`waypath:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`waypath:${key}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

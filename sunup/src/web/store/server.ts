// Server mode: talks to the Sunup server, which runs the engine and sends real
// push notifications, texts and calls.

import type { Action } from '../../shared/service';
import type { Snapshot } from '../../shared/snapshot';
import { ApiError, type Api, type SignupInput } from './api';

const TOKEN_KEY = 'sunup.token';
const POLL_MS = 10_000;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable; the session lasts until reload.
  }
  if (!token) void shareSessionWithWorker(null);
}

/**
 * The service worker can't read localStorage, so the notification "I'm up" button reads the
 * session from here. It's tagged with the user id so a button meant for someone else is ignored.
 */
async function shareSessionWithWorker(session: { token: string; userId: string } | null) {
  try {
    const cache = await caches.open('sunup-auth');
    const key = new URL('__sunup/token', location.href).href;
    if (session) await cache.put(key, new Response(JSON.stringify(session)));
    else await cache.delete(key);
  } catch {
    // Cache Storage unavailable: the button falls back to opening the app.
  }
}

/** Stops push to this browser for the signed-in account (on sign-out or deletion). */
async function dropPush(token: string | null) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    if (token) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    }
    await sub.unsubscribe();
  } catch {
    // Best effort: the server also hands an endpoint to whoever subscribes with it next.
  }
}

function base64ToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function createServerApi(features: { billing?: boolean } = {}): Api {
  let token = readToken();
  /** Remembers the session for the worker whenever we learn who is signed in. */
  const seen = <T extends Snapshot | null | undefined>(snap: T): T => {
    if (snap && token) void shareSessionWithWorker({ token, userId: snap.me.id });
    return snap;
  };
  const listeners = new Set<(snap: Snapshot) => void>();
  const photos = new Map<string, Promise<string>>();

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.code ?? `http_${res.status}`, body.message ?? 'Something went wrong. Try again.');
    return body as T;
  }

  async function refresh() {
    if (!token || listeners.size === 0) return;
    try {
      const snap = await call<Snapshot>('/api/state');
      listeners.forEach((l) => l(snap));
    } catch {
      // Offline: try again on the next poll.
    }
  }

  setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !token) return;
    // Opening the app is a smart check-in signal (Premium, if enabled).
    call<Snapshot>('/api/action', { method: 'POST', body: JSON.stringify({ type: 'activity' }) })
      .then((snap) => listeners.forEach((l) => l(snap)))
      .catch(() => undefined);
  });
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'sunup:refresh') void refresh();
  });

  return {
    mode: 'server',

    async load() {
      if (!token) return null;
      try {
        return seen(await call<Snapshot>('/api/state'));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'unauthorized') {
          token = null;
          writeToken(null);
          return null;
        }
        throw e;
      }
    },

    async signup(input: SignupInput) {
      const res = await call<{ token: string; snapshot: Snapshot }>('/api/signup', { method: 'POST', body: JSON.stringify(input) });
      token = res.token;
      writeToken(token);
      return seen(res.snapshot);
    },

    act(action: Action) {
      return call<Snapshot>('/api/action', { method: 'POST', body: JSON.stringify(action) });
    },

    async invite(code) {
      try {
        return await call<{ name: string; color: string }>(`/api/invite/${encodeURIComponent(code)}`);
      } catch {
        return null;
      }
    },

    inviteUrl(code) {
      return `${location.origin}/?join=${code}`;
    },

    photo(ref) {
      if (ref.startsWith('data:')) return Promise.resolve(ref);
      let p = photos.get(ref);
      if (!p) {
        p = fetch(ref, { headers: token ? { authorization: `Bearer ${token}` } : {} })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('photo'))))
          .then((blob) => URL.createObjectURL(blob));
        p.catch(() => photos.delete(ref));
        photos.set(ref, p);
      }
      return p;
    },

    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async enablePush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return 'denied';
      try {
        const { key } = await call<{ key: string }>('/api/push/key');
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(key) }));
        await call('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
        return 'granted';
      } catch {
        return 'unsupported';
      }
    },

    signOut() {
      const old = token;
      const done = () => {
        token = null;
        writeToken(null);
        location.replace('/');
      };
      if (!old) return done();
      dropPush(old)
        .then(() => fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${old}` } }))
        .finally(done);
    },

    async exportData() {
      const res = await fetch('/api/export', { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new ApiError('export', 'Couldn\'t download your data. Try again.');
      return res.blob();
    },

    async deleteAccount() {
      await call('/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: true }) });
      await dropPush(null);
      token = null;
      writeToken(null);
      location.replace('/');
    },

    billing: features.billing
      ? {
          async checkout(interval) {
            const { url } = await call<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ interval }) });
            location.assign(url);
          },
          async portal() {
            const { url } = await call<{ url: string }>('/api/billing/portal', { method: 'POST', body: '{}' });
            location.assign(url);
          },
        }
      : undefined,

    auth: {
      start(phone) {
        return call('/api/auth/start', { method: 'POST', body: JSON.stringify({ phone }) });
      },
      async verify(input) {
        const res = await call<{ token?: string; snapshot?: Snapshot; needsName?: boolean }>('/api/auth/verify', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        if (res.token) {
          token = res.token;
          writeToken(token);
        }
        return { snapshot: seen(res.snapshot), needsName: res.needsName };
      },
    },
  };
}

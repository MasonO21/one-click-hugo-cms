import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action } from '../../shared/service';
import type { Snapshot } from '../../shared/snapshot';
import type { Outbound } from '../../shared/types';
import { ApiError, type Api } from './api';
import { playAlarm, playChime } from '../lib/media';

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: 'info' | 'ok' | 'alert' | 'error';
  link?: string;
}

export interface Question {
  title: string;
  body?: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
}

interface Store {
  api: Api;
  snap: Snapshot;
  setSnap: (snap: Snapshot) => void;
  /** Runs an action; shows errors as toasts and opens the paywall for Premium features. Returns success. */
  run: (action: Action) => Promise<boolean>;
  /** Runs any API call with the same error handling. */
  attempt: (fn: () => Promise<Snapshot>) => Promise<boolean>;
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
  paywall: string | null;
  openPaywall: (reason?: string) => void;
  closePaywall: () => void;
  /** An in-app confirmation (native confirm() is unavailable in some embeds and ugly on phones). */
  ask: (q: Question) => Promise<boolean>;
  question: Question | null;
  answer: (yes: boolean) => void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside provider');
  return store;
}

const SEEN_KEY = 'sunup.seen';

/** The newest message already shown. First run: surface anything from the last half hour. */
function readSeen(): number {
  const fallback = Date.now() - 30 * 60_000;
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

function showSystemNotification(o: Outbound) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(o.title, { body: o.body, tag: o.alertId ?? o.id, icon: 'icon-192.png' });
    n.onclick = () => {
      window.focus();
      if (o.link) location.hash = o.link;
    };
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

export function StoreProvider({ api, initial, children }: { api: Api; initial: Snapshot; children: ReactNode }) {
  const [snap, setSnapState] = useState(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paywall, setPaywall] = useState<string | null>(null);
  const seen = useRef(readSeen());
  const [question, setQuestion] = useState<Question | null>(null);
  const pending = useRef<((yes: boolean) => void) | null>(null);

  const ask = useCallback((q: Question) => {
    pending.current?.(false);
    setQuestion(q);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
  }, []);

  const answer = useCallback((yes: boolean) => {
    pending.current?.(yes);
    pending.current = null;
    setQuestion(null);
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === 'alert' ? 9000 : 4500);
  }, []);

  const dismiss = useCallback((id: string) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  // Surface new messages addressed to this person as in-app toasts (and, in the demo, as system notifications).
  const setSnap = useCallback(
    (next: Snapshot) => {
      const fresh = next.outbox
        .filter((o) => o.at > seen.current && o.channel === 'push' && o.to.type === 'user' && o.to.id === next.me.id)
        .reverse();
      if (fresh.length) {
        seen.current = Math.max(...fresh.map((o) => o.at));
        try {
          localStorage.setItem(SEEN_KEY, String(seen.current));
        } catch {
          // Not critical.
        }
        for (const o of fresh) {
          toast({ title: o.title, body: o.body, tone: o.urgent ? 'alert' : 'info', link: o.link });
          if (api.mode === 'demo' || document.visibilityState === 'hidden') showSystemNotification(o);
        }
        if (fresh.some((o) => o.urgent)) playAlarm();
        else playChime();
      }
      setSnapState(next);
    },
    [api.mode, toast],
  );

  useEffect(() => api.watch(setSnap), [api, setSnap]);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'premium') {
        setPaywall(e.message);
        return;
      }
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      toast({ title: message, tone: 'error' });
    },
    [toast],
  );

  const attempt = useCallback(
    async (fn: () => Promise<Snapshot>) => {
      try {
        setSnap(await fn());
        return true;
      } catch (e) {
        handle(e);
        return false;
      }
    },
    [handle, setSnap],
  );

  const run = useCallback((action: Action) => attempt(() => api.act(action)), [api, attempt]);

  const value: Store = {
    api,
    snap,
    setSnap,
    run,
    attempt,
    toasts,
    toast,
    dismiss,
    paywall,
    openPaywall: (reason) => setPaywall(reason ?? ''),
    closePaywall: () => setPaywall(null),
    ask,
    question,
    answer,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Re-renders every `ms` so countdowns stay live. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

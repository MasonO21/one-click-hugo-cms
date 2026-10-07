/**
 * App lifecycle helpers: "going to background" and "coming back" across browser events
 * (visibilitychange / pagehide / pageshow) and Capacitor App events (pause / resume).
 * Callbacks may fire more than once per transition (several sources report the same event) —
 * consumers should be idempotent.
 * OWNER: meta agent.
 */
import { isNative } from './env';

type Cb = () => void;

function subscribe(kind: 'background' | 'foreground', cb: Cb): Cb {
  const offs: Cb[] = [];
  let disposed = false;

  if (typeof document !== 'undefined') {
    const vis = () => {
      if (document.visibilityState === (kind === 'background' ? 'hidden' : 'visible')) cb();
    };
    document.addEventListener('visibilitychange', vis);
    offs.push(() => document.removeEventListener('visibilitychange', vis));
  }
  if (typeof window !== 'undefined') {
    const ev = kind === 'background' ? 'pagehide' : 'pageshow';
    window.addEventListener(ev, cb);
    offs.push(() => window.removeEventListener(ev, cb));
  }
  if (isNative()) {
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const handles = [
          kind === 'background' ? await App.addListener('pause', cb) : await App.addListener('resume', cb),
          await App.addListener('appStateChange', (s) => {
            if (s.isActive === (kind === 'foreground')) cb();
          }),
        ];
        if (disposed) handles.forEach((h) => void h.remove());
        else offs.push(() => handles.forEach((h) => void h.remove()));
      })
      .catch(() => {
        /* App plugin unavailable — browser events still work in the WebView */
      });
  }
  return () => {
    disposed = true;
    offs.forEach((f) => f());
  };
}

/** The app is being hidden / paused / closed: flush anything important. Returns an unsubscribe. */
export function onBackground(cb: Cb): Cb {
  return subscribe('background', cb);
}

/** The app is visible and active again. Returns an unsubscribe. */
export function onForeground(cb: Cb): Cb {
  return subscribe('foreground', cb);
}

/**
 * App lifecycle helpers: "going to background" and "coming back" across browser events
 * (visibilitychange / pagehide / pageshow) and Capacitor App events (pause / resume).
 * Callbacks may fire more than once per transition (several sources report the same event) —
 * consumers should be idempotent.
 * OWNER: meta agent.
 */
import { isNative, platformName } from './env';

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

/**
 * Android back button (hardware key or back gesture). `handler` returns true when it used the press (closed a
 * panel, left build mode, cleared a selection); otherwise the app goes to the background like a Home press, so
 * the colony is saved and kept rather than the activity being finished mid-session. Registering a listener
 * replaces Capacitor's default (WebView history back, then exit). No-op on web and iOS. Returns an unsubscribe.
 */
export function onBackButton(handler: () => boolean): Cb {
  if (platformName() !== 'android') return () => {};
  let off: Cb | null = null;
  let disposed = false;
  void import('@capacitor/app')
    .then(async ({ App }) => {
      const h = await App.addListener('backButton', () => {
        let used = false;
        try {
          used = handler();
        } catch (e) {
          console.error('[back] handler failed', e);
          used = true; // never leave the app because of a UI error
        }
        if (!used) void App.minimizeApp().catch(() => undefined);
      });
      if (disposed) void h.remove();
      else off = () => void h.remove();
    })
    .catch(() => {
      /* App plugin unavailable */
    });
  return () => {
    disposed = true;
    off?.();
  };
}

/** The app is visible and active again. Returns an unsubscribe. */
export function onForeground(cb: Cb): Cb {
  return subscribe('foreground', cb);
}

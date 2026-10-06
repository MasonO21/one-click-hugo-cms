import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { Api } from './store/api';
import { createDemoApi } from './store/demo';
import { createServerApi } from './store/server';
import { API_BASE, CAN_PURCHASE, IS_NATIVE, apiUrl, initNative } from './native';
import './styles.css';

const MODE = import.meta.env.VITE_SUNUP_MODE as 'demo' | 'server' | undefined;

/** Server mode when a Sunup server answers, otherwise the on-device demo. */
async function pickApi(): Promise<Api> {
  // An app build without a server address is the on-device demo.
  if (MODE === 'demo' || (IS_NATIVE && !API_BASE)) return createDemoApi();
  if (MODE === 'server') {
    const health = await fetch(apiUrl('/api/health')).then((r) => r.json()).catch(() => ({}));
    return createServerApi({ billing: health.billing === true && CAN_PURCHASE });
  }
  try {
    const res = await fetch(apiUrl('/api/health'), { signal: AbortSignal.timeout(IS_NATIVE ? 6000 : 2500) });
    const health = res.ok ? await res.json() : null;
    if (health?.sunup) return createServerApi({ billing: health.billing === true && CAN_PURCHASE });
  } catch {
    // No server: fall through to the demo.
  }
  return createDemoApi();
}

function registerServiceWorker() {
  // The single-file demo has no sw.js next to it, and the native apps use native push.
  if (import.meta.env.VITE_SUNUP_SINGLE === '1' || IS_NATIVE) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'about:') return;
  navigator.serviceWorker.register('sw.js').catch(() => undefined);
}

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  const api = await pickApi();
  registerServiceWorker();
  void initNative({ onPush: () => window.dispatchEvent(new Event('sunup:refresh')) });
  let initial = null;
  try {
    initial = await api.load();
  } catch {
    root.render(
      <div className="boot-error">
        <h1>Can't reach Sunup</h1>
        <p>Check your connection and try again.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>,
    );
    return;
  }
  root.render(
    <StrictMode>
      <App api={api} initial={initial} />
    </StrictMode>,
  );
}

void boot();

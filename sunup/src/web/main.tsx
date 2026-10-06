import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { Api } from './store/api';
import { createDemoApi } from './store/demo';
import { createServerApi } from './store/server';
import './styles.css';

const MODE = import.meta.env.VITE_SUNUP_MODE as 'demo' | 'server' | undefined;

/** Server mode when a Sunup server answers, otherwise the on-device demo. */
async function pickApi(): Promise<Api> {
  if (MODE === 'demo') return createDemoApi();
  if (MODE === 'server') return createServerApi();
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
    if (res.ok && (await res.json()).sunup) return createServerApi();
  } catch {
    // No server: fall through to the demo.
  }
  return createDemoApi();
}

function registerServiceWorker() {
  // The single-file demo has no sw.js next to it.
  if (import.meta.env.VITE_SUNUP_SINGLE === '1') return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'about:') return;
  navigator.serviceWorker.register('sw.js').catch(() => undefined);
}

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  const api = await pickApi();
  registerServiceWorker();
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

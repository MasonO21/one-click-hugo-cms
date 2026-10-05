// Starts a throwaway server on a random port and gives tests small WebSocket helpers.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));

export function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [join(here, '..', 'src', 'index.js')], {
      env: { ...process.env, PORT: '0', QUEUE_WAIT: '1', DATA_DIR: mkdtempSync(join(tmpdir(), 'sf-')), ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let errs = '';
    proc.stderr.on('data', d => { errs += d; });
    proc.stdout.on('data', d => {
      const m = /listening on :(\d+)/.exec(String(d));
      if (m) resolve({ port: +m[1], proc, url: `ws://127.0.0.1:${m[1]}/ws`, http: `http://127.0.0.1:${m[1]}`, errors: () => errs, stop: () => proc.kill() });
    });
    proc.on('exit', code => reject(new Error('server exited ' + code + '\n' + errs)));
  });
}

export function client(url) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    inbox.push(msg);
    for (const w of waiters.slice()) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const api = {
    ws, inbox,
    open: () => new Promise(r => ws.once('open', r)),
    send: o => ws.send(JSON.stringify(o)),
    next(pred, ms = 8000) {
      const hit = inbox.find(pred);
      if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error('timed out waiting for message')); } }, ms);
      });
    },
    // Latest snapshot received after `since` (ms timestamp).
    async snapshotAfter(ms) {
      await new Promise(r => setTimeout(r, ms));
      const snaps = inbox.filter(m => m.t === 's');
      inbox.length = 0;
      return snaps[snaps.length - 1];
    },
    close: () => ws.close()
  };
  return api;
}

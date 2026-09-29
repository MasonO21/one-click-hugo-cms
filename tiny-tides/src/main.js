// Tiny Tides — entry point.
import { createScene } from './render.js';
import { createGame } from './game.js';
import { createUI } from './ui.js';
import * as A from './audio.js';
import { store, onAppState, setupChrome, hideSplash, notify } from './platform.js';

async function boot() {
  const canvas = document.getElementById('scene');
  const scene = createScene(canvas);
  const G = createGame(scene);
  const ui = createUI(G);
  G.ui = ui;
  ui.mount();
  await setupChrome();
  await G.load();
  scene.state = G.state;
  scene.setBiome('tide');
  const summary = G.fresh ? null : G.catchUp();
  ui.layoutChanged();
  store.init((pid, tx) => G.onStoreTransaction(pid, tx)).then(() => G.reconcilePurchases(true)).catch(() => {});
  ui.start(summary);
  hideSplash();

  // iOS webview: no pinch-zoom / double-tap zoom / rubber-banding
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !e.target.closest('.mb,.sh-body,.dock-in,.tabs,.hatrow,.days')) e.preventDefault(); }, { passive: false });

  // ---------------- input
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  let down = null, painting = false, lastKey = '';
  const paintAt = (p) => {
    const t = scene.screenToTile(p.x, p.y);
    scene.hover = t;
    if (!t) return;
    const k = `${t.x},${t.y}`;
    if (k === lastKey) return;
    lastKey = k; G.buildAt(t.x, t.y);
  };
  canvas.addEventListener('pointerdown', (e) => {
    A.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const p = pt(e), hit = scene.hit(p.x, p.y);
    down = { p, hit, moved: false };
    if (G.tab === 'build' && G.tool && hit && hit.type !== 'bubble') { painting = true; lastKey = ''; paintAt(p); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pt(e);
    if (!down) { if (G.tab === 'build' && e.pointerType === 'mouse') scene.hover = scene.screenToTile(p.x, p.y); return; }
    if (Math.hypot(p.x - down.p.x, p.y - down.p.y) > 12) down.moved = true;
    if (painting) paintAt(p);
  });
  const end = () => {
    if (down && !painting && !down.moved) tap(down.hit);
    down = null; painting = false; lastKey = ''; scene.hover = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { down = null; painting = false; scene.hover = null; });
  function tap(hit) {
    if (!hit) return;
    if (hit.type === 'bubble') return void G.collect(hit.id);
    if (hit.type === 'egg') return void G.tapEgg(hit.id);
    if (hit.type === 'creature') {
      if (G.tab === 'build' && G.tool) return;
      ui.openSheet(hit.id); G.pet(hit.id); return;
    }
    if (hit.type === 'tile') {
      const pl = G.state.pools[G.biome], tl = pl.tiles[hit.y * pl.w + hit.x];
      if (tl?.d === 'capsulemachine' && G.state.tut.done && !(G.tab === 'build' && G.tool)) { ui.openGacha(); return; }
    }
    if (ui.sheetIsOpen()) ui.closeSheet();
  }

  // ---------------- loops
  // Draw at the display rate while the player is interacting or something is happening, and at ~30 fps when the scene is just
  // sitting there (or in Battery saver): gentler on older phones and the battery. `last` only advances when a frame is drawn,
  // so animations keep their real-time speed at either rate.
  let last = performance.now(), lastInput = last;
  for (const ev of ['pointerdown', 'pointermove', 'keydown']) window.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });
  const modalRoot = document.getElementById('modal-root');
  const frame = (t) => {
    requestAnimationFrame(frame);
    if (document.hidden) { last = t; return; }
    const calm = t - lastInput > 4000 && !scene.parts.length && !scene.texts.length && !modalRoot.firstElementChild;
    if ((G.state.settings.battery || calm) && t - last < 30) return;
    const dt = (t - last) / 1000; last = t;
    scene.frame(dt, G.now());
  };
  requestAnimationFrame(frame);
  setInterval(() => { G.tick(); }, 1000);
  setInterval(() => { G.save(); }, 8000);

  // ---------------- lifecycle
  onAppState(async (active) => {
    if (active) {
      A.suspend(false);
      const s = G.catchUp();                 // before anything async, so the 1s tick can't consume the offline gains first
      ui.onResume(s);
      G.reconcilePurchases();
      notify.cancelAll();
    } else {
      await G.save(true);
      A.suspend(true);
      G.scheduleReminders();
    }
  });
  window.addEventListener('pagehide', () => { G.save(true); });
}

boot().catch((e) => {
  console.error('Tiny Tides failed to start', e);
  hideSplash();
  const b = document.getElementById('boot');
  if (b) b.innerHTML = '<div style="padding:24px;text-align:center;font-family:sans-serif"><h2>Something went wrong</h2><p>Please restart the app.</p></div>';
});

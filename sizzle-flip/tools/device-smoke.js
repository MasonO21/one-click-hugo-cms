// Self-test that runs inside the real app on an Android emulator / iOS Simulator / phone. Only in builds made with
// `node tools/build.mjs --smoke` (CI: .github/workflows/sizzle-flip-devices.yml); never in a store build.
// It checks the native plugins load, plays level 1 through the game's own touch handlers, exercises the shop and
// the store plugin's error paths, and prints "SMOKE ..." lines to the device log. "SMOKE SHOT <name>" lines ask
// the CI script for a screenshot; the test pauses a moment after each one.
import { PHYS } from '../src/physics.js';
import { ITEMS } from '../src/art/items.js';

const out = (...a) => console.log('SMOKE', ...a);
const results = [];
const check = (ok, msg) => { results.push([!!ok, msg]); out(ok ? 'PASS' : 'FAIL', msg); };
const info = (msg) => out('INFO', msg);
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => errors.push('unhandled rejection: ' + String((e.reason && (e.reason.message || e.reason)) || e.reason)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; };
const within = (p, ms) => Promise.race([Promise.resolve(p).then(v => ({ ok: true, v }), e => ({ ok: true, e })), sleep(ms).then(() => ({ ok: false }))]);
const shot = async (name) => { out('SHOT', name); await sleep(2500); };
const $ = (id) => document.getElementById(id);

// feed a level's stored route through pointerDown/Move/Up at the exact physics step the solver used
function play(app, game) {
  return new Promise((resolve) => {
    const sol = game.level.solution;
    let n = 0, wait = -1, t0 = 0, done = false;
    const fire = (a, p) => {
      const len = 14 + p * (app.maxDrag() - 14), sx = 195, sy = 420;
      game.pointerDown(sx, sy); game.pointerMove(sx - Math.cos(a) * len, sy - Math.sin(a) * len); game.pointerUp();
    };
    const tick = () => {
      const s = game.sim;
      if (done || game.phase !== 'play' || n >= sol.length) return;
      if (wait < 0) {
        if (!(n === 0 ? s.canLaunch() : s.t - t0 > 0.15 && s.canLaunch())) return;
        wait = Math.round((sol[n][2] || 0) / PHYS.DT);
      } else wait--;
      if (wait === 0) {
        const flips = game.flips;
        fire(sol[n][0], sol[n][1]);
        if (game.flips !== flips + 1) { done = true; resolve(`shot ${n + 1} not accepted`); return; }
        t0 = s.t; n++; wait = -1;
        if (n >= sol.length) { done = true; resolve(''); }
      }
    };
    const s = game.sim, step = s.step.bind(s);
    s.step = () => { step(); tick(); };
    tick();
  });
}

async function run() {
  await until(() => window.__app && window.__app.ui, 15000);
  const app = window.__app, Cap = window.Capacitor;
  info(`platform ${Cap && Cap.getPlatform ? Cap.getPlatform() : 'web'} · ${innerWidth}x${innerHeight} @${devicePixelRatio} · ${navigator.userAgent}`);
  await sleep(2500);
  await shot('1-title');

  // --- native shell and plugins
  check(Cap && Cap.isNativePlatform && Cap.isNativePlatform(), 'runs as a native app (Capacitor)');
  check(app.ads.kind === 'admob', `ads use the AdMob plugin (${app.ads.kind}, test mode ${app.ads.testing})`);
  check(app.shop.kind === 'store', `shop uses the store billing plugin (${app.shop.kind})`);
  const ready = await within(app.shop.ready, 60000);
  check(ready.ok, 'store connection started (products and purchases queried) without hanging');
  info(`store prices: ${JSON.stringify(app.shop.prices)} (empty = no products for this test install)`);
  check(/^[0-9a-f-]{36}$/.test(app.save.walletId || ''), 'wallet id created');
  const mirror = await within(app.shop.prefs.get({ key: 'sizzleflip.wallet.v1' }), 10000);
  let copy = null;
  try { copy = mirror.ok && mirror.v && JSON.parse(mirror.v.value); } catch (e) { /* bad */ }
  check(copy && copy.walletId === app.save.walletId, 'wallet copy stored in native storage (Preferences plugin)');

  // --- play level 1 for real
  app.startLevel(0);
  const game = app.game;
  game.pointerDown(0, 0);                         // skip the intro, like a tap
  const drive = play(app, game);
  await sleep(1200);
  await shot('2-level');
  const why = await within(drive, 45000);
  const won = await until(() => !$('scr-win').hidden, 30000);
  check(won && why.ok && !why.v, `level 1 won through the game's touch handlers${why.v ? ' (' + why.v + ')' : ''}`);
  check((app.save.stars[0] || 0) >= 1, `stars saved (${app.save.stars[0] || 0})`);
  await sleep(1500);
  await shot('3-win');

  // --- a shop character, rendered in a level
  app.save.owned.dragon = { at: Date.now(), source: 'smoke' };
  app.shop.equip('dragon');
  app.ui.action('replay');
  await sleep(600);
  app.game.pointerDown(0, 0);
  await sleep(1500);
  check(app.shop.characterItem() && app.shop.characterItem().id === 'dragon' && app.game.phase === 'play', 'a shop character (Dragon) plays in a level');
  await shot('4-dragon');
  delete app.save.owned.dragon; app.shop.equip('sausage');

  // --- shop and Hot Dog packs
  app.toMenu('scr-title');
  await sleep(500);
  app.ui.show('scr-shop');
  await sleep(800);
  check(document.querySelectorAll('#shop-grid .shop-card').length === ITEMS.filter(i => i.cat === 'food').length, 'shop opens with the Food tab');
  check(!!document.querySelector('#shop-bundle-slot .shop-bundle'), 'the Food bundle is offered');
  await shot('5-shop');
  app.ui.openPacks();
  await sleep(600);
  const prices = [...document.querySelectorAll('.hd-pack .hp-price')].map(e => e.textContent);
  check(prices.length === 6, `Get Hot Dogs shows 6 packs (${prices.join(', ')})`);
  await shot('6-packs');
  // on an emulator / simulator without store products this must fail cleanly, not hang or crash
  const t = Date.now();
  const buy = await within(app.shop.buyPack('hotdogs_100'), 90000);
  info(`test purchase → ${buy.ok ? JSON.stringify(buy.v || String(buy.e)) : 'no answer in 90 s'} after ${((Date.now() - t) / 1000).toFixed(1)} s`);
  check(buy.ok && !app.shop.busy, 'the purchase call returns and leaves the shop usable');
  const got = buy.ok && buy.v && buy.v.r === 'bought' ? buy.v.n : 0;
  check(app.shop.balance === got, `credited exactly what was bought (${got} Hot Dogs)`);
  app.ui.closePacks();

  // --- ads (network dependent: informational)
  await until(() => app.ads.provider.ready && app.ads.provider.ready.interstitial && app.ads.provider.ready.rewarded, 30000);
  info(`AdMob test ads loaded: interstitial ${!!app.ads.provider.ready?.interstitial}, rewarded ${!!app.ads.provider.ready?.rewarded}, can request ${app.ads.provider.canRequest}`);

  // --- result
  check(errors.length === 0, `no JavaScript errors${errors.length ? ': ' + [...new Set(errors)].join(' | ') : ''}`);
  const failed = results.filter(r => !r[0]);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:9999;background:rgba(20,10,20,.92);color:#fff;font:13px/1.35 monospace;padding:10px;border-radius:10px;white-space:pre-wrap';
  box.textContent = `SELF-TEST ${failed.length ? 'FAILED' : 'PASSED'} (${results.length - failed.length}/${results.length})\n` + results.map(([ok, m]) => `${ok ? '✓' : '✗'} ${m}`).join('\n');
  box.style.borderLeft = `6px solid ${failed.length ? '#ef4b3c' : '#6cc24a'}`;
  document.body.appendChild(box);
  await shot('7-results');
  out(`DONE pass=${results.length - failed.length} fail=${failed.length}`);
}

run().catch((e) => { out('FAIL', 'self-test crashed: ' + (e && (e.stack || e.message) || e)); out('DONE pass=0 fail=1'); });

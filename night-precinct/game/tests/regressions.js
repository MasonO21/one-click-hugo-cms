// Regression tests for defects found in review (each one reproduced first, then fixed).  node regressions.js
const { launch, url } = require('./lib');
const { initScript } = require('./mock-bridge');
const BUNDLE = 'com.yourcompany.nightprecinct';
const PRICES = { badges_80: '0.99', badges_500: '4.99', badges_1200: '9.99', badges_2600: '19.99', badges_7000: '49.99', badges_15000: '99.99', piggy: '2.99', deal_crates: '2.99', deal_cash: '4.99', deal_recruit: '7.99', starter: '1.99', pass_premium: '9.99', auto_basic: '4.79', auto_combo: '9.59', auto_upgrade: '4.79', vip_weekly: '4.99' };
let fails = 0;
const check = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); };

(async () => {
  const b = await launch();
  async function open(cfg, opts = {}) {
    const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    if (cfg) await p.addInitScript(initScript, Object.assign({ bundle: BUNDLE, prices: PRICES }, cfg));
    if (opts.local) await p.addInitScript(v => { try { localStorage.setItem('night-precinct-v2', v); } catch (e) { } }, opts.local);
    await p.goto(url()); await p.waitForTimeout(opts.wait || 700);
    return p;
  }
  const E = (p, f, a) => p.evaluate(f, a);

  /* Chief's Club renewed while away: offline pay uses the renewed subscription (100%, 8 h cap) */
  {
    const now = Date.now();
    const save = JSON.stringify({ v: 3, last: now - 10 * 36e5, vip: now - 864e5, owned: [50, 20, 5], funds: 1e3, run: 1e3, life: 1e3 });
    const ent = [{ id: '3', originalId: '1', productId: BUNDLE + '.vip_weekly', type: 'autoRenewable', purchaseDate: now - 3 * 864e5, expirationDate: now + 4 * 864e5, revoked: false }];
    const p = await open({ save, entitlements: ent }, { wait: 1500 });
    const r = await E(p, () => { const s = window.__np.S(); return { secs: s.pending && s.pending.secs, vip: window.__np.D.vip, txt: document.getElementById('modal-root').innerText }; });
    check('offline pay after a renewal: 8 h at 100%', r.vip && r.secs === 8 * 3600 && /100%/.test(r.txt), r);
    await p.context().close();
  }
  /* Price loading failed at launch: retried when the app comes back, purchases work */
  {
    const p = await open({ failProducts: 1 });
    const before = await E(p, () => window.__np.Pay.loaded);
    await E(p, () => window.NPNative.onForeground()); await p.waitForTimeout(300);
    const after = await E(p, () => window.__np.Pay.loaded);
    check('failed price load is retried (not dead for the session)', before === false && after === true, { before, after });
    await p.context().close();
  }
  /* Store country from StoreKit: Belgian storefront blocks paid crates even with a US device region */
  {
    const p = await open({ storefront: 'BEL', region: 'US' });
    const r = await E(p, () => ({ sf: window.__np.APP.storefront, allowed: window.__np.crateBuyAllowed() }));
    check('Belgian App Store country switches off paid crates', r.sf === 'BE' && r.allowed === false, r);
    await p.context().close();
  }
  /* Purchase in progress: the sheet cannot be closed or replaced, and only it is closed afterwards */
  {
    const p = await open({ delay: 800 });
    await E(p, () => window.__np.purchaseSheet('badges_80', { title: 'x', lines: ['y'] }));
    await p.click('#buyBtn'); await p.waitForTimeout(100);
    const mid = await E(p, () => ({ x: document.querySelector('#modal-root .x').hidden, cancel: document.getElementById('cancelBtn').hidden }));
    await E(p, () => window.__np.settingsModal()); await p.waitForTimeout(50);
    const stillSheet = await E(p, () => !!document.getElementById('buyBtn'));
    await p.waitForTimeout(1200);
    const after = await E(p, () => document.getElementById('modal-root').innerText.slice(0, 40));
    check('purchase sheet locked while processing', mid.x && mid.cancel && stillSheet, mid);
    check('queued dialog opens after the purchase finishes', /settings/i.test(after), after);
    await p.context().close();
  }
  /* Refund of a Gold Badge pack takes back unspent badges and the Patron total */
  {
    const p = await open({});
    const r = await E(p, async () => {
      const N = window.__np, S = N.S(); const tx = window.__mock.tx('badges_500'); await N.processTx(tx);
      const mid = { b: S.badges, spent: S.spent }; await N.processTx(Object.assign({}, tx, { revoked: true }));
      return { mid, b: S.badges, spent: S.spent };
    });
    check('refunded pack removes its Gold Badges and Patron spend', r.spent === 0 && r.mid.b - r.b === 1050, r);
    await p.context().close();
  }
  /* Refund of a Chief's Club renewal does not lower the Patron total (renewals never raised it) */
  {
    const p = await open({});
    const r = await E(p, async () => {
      const N = window.__np, S = N.S(), M = window.__mock, week = 7 * 864e5;
      const first = M.tx('vip_weekly', { expirationDate: Date.now() + week }); await N.processTx(first);
      const renew = M.tx('vip_weekly', { originalId: first.id, expirationDate: Date.now() + 2 * week }); await N.processTx(renew);
      const mid = S.spent; await N.processTx(Object.assign({}, renew, { revoked: true }));
      return { mid, spent: S.spent };
    });
    check('refunded renewal leaves the Patron total alone', r.mid === 4.99 && r.spent === 4.99, r);
    await p.context().close();
  }
  /* First-run coach: a new player gets it and can skip it; a save that already has progress never sees it */
  {
    const q = await open(null, { wait: 500 });
    const st = () => E(q, () => ({ tut: window.__np.S().tut, shown: !document.getElementById('coach').hidden, text: document.querySelector('#coach .bubble p').textContent }));
    const a = await st();
    check('new player sees the coach on the tap button', a.tut === 1 && a.shown && /tap/i.test(a.text), a);
    await E(q, () => { for (let i = 0; i < 20; i++) window.__np.doTap(150); }); await q.waitForTimeout(300);
    const h = await st();
    check('after earning $15 the coach points at the first hire', h.tut === 3 && h.shown, h);
    await E(q, () => document.querySelector('#coach [data-c=skip]').click()); await q.waitForTimeout(200);
    const sk = await st();
    check('Skip tutorial ends it for good', sk.tut === 99 && !sk.shown, sk);
    await q.context().close();
    const old = await open(null, { wait: 500, local: JSON.stringify({ v: 3, last: Date.now(), owned: [12, 3], funds: 500, run: 900, life: 900 }) });
    const o = await E(old, () => ({ tut: window.__np.S().tut, shown: !document.getElementById('coach').hidden }));
    check('existing save with progress skips the coach', o.tut === 99 && !o.shown, o);
    await old.context().close();
  }
  /* Music: each world's loop renders without errors, loops seamlessly, and Settings can switch it off and on */
  {
    const q = await open(null, { wait: 500 });
    const m = await E(q, async () => { const out = {}; for (const id of ['police', 'fire', 'ems']) { const b = await window.__np.Music.render(id), x = b.getChannelData(0); let pk = 0, bad = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (!(v <= 1)) bad++; if (v > pk) pk = v; } out[id] = { secs: +(x.length / b.sampleRate).toFixed(1), pk: +pk.toFixed(2), bad, seam: +Math.abs(x[0] - x[x.length - 1]).toFixed(3) }; } return out; });
    check('music loops render cleanly for all three worlds', Object.values(m).every(r => r.secs > 30 && r.pk > 0.5 && r.pk <= 0.91 && r.bad === 0 && r.seam < 0.02), m);
    await E(q, () => { window.__np.S().tut = 99; window.__np.settingsModal(); });
    const t1 = await E(q, () => { const b = document.querySelector('#modal-root [data-x=music]'); b.click(); return window.__np.S().music; });
    const t2 = await E(q, () => { document.querySelector('#modal-root [data-x=music]').click(); return window.__np.S().music; });
    check('Settings has a Music switch that turns music off and on', t1 === false && t2 === true && q.errs.length === 0, { t1, t2, errs: q.errs });
    await q.context().close();
  }
  /* The rest runs in the web build (no bridge needed) */
  const p = await open(null, { wait: 500 });
  const close = () => E(p, () => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; document.getElementById('app').inert = false; });
  await E(p, () => { const N = window.__np, s = N.S(); s.funds = 999500; N.recalc(); });
  await p.waitForTimeout(250);
  const f2 = await E(p, () => document.getElementById('funds').textContent);
  check('999,500 is shown as $1.00M, not $1000K', /1\.00M/.test(f2) && await E(p, () => window.__np.fmt(9996) === '10.0K'), f2);
  // daily streak survives a time-zone move west (the stored date is "tomorrow")
  const d = await E(p, () => { const N = window.__np, s = N.S(); const t = new Date(); t.setDate(t.getDate() + 1); const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; s.daily = { last: k, streak: 6, at: Date.now() - 2 * 36e5 }; return N.dailyState(); });
  check('daily streak: a later stored date counts as claimed, not broken', d.claimed === true && !d.broken, d);
  const d2 = await E(p, () => { const N = window.__np, s = N.S(); s.daily = { last: '2000-01-01', streak: 4, at: Date.now() - 30 * 36e5 }; return N.dailyState(); });
  check('daily streak: a claim less than 48 h ago keeps the streak across a skipped date', !d2.broken && !d2.claimed && d2.day === 4, d2);
  // lump sums ignore temporary boosts
  const c = await E(p, () => { const N = window.__np, s = N.S(); s.owned[0] = 100; s.boosts.dbl = 0; s.boosts.spree = 0; N.recalc(); const base = N.D.ips; N.addBoost('dbl', 600); N.addBoost('spree', 20); N.recalc(); return { base, boosted: N.D.ips, baseIps: N.D.baseIps }; });
  check('time warps and deals use income without temporary boosts', Math.abs(c.baseIps - c.base) < 1e-6 * c.base && c.boosted > c.base * 10, c);
  // lapsed Chief's Club: a job in the third slot can still be collected
  await close();
  const slot = await E(p, () => { const N = window.__np, s = N.S(); s.vip = 0; s.boosts.dbl = 0; s.boosts.spree = 0; s.ops = [null, null, { id: 'stop', end: Date.now() - 1000 }, null, null]; N.recalc(); N.showTab('ops'); return !!document.querySelector('[data-act=claim][data-s="2"]'); });
  check('job left in a lapsed extra slot can be collected', slot);
  // promotion pays out finished jobs and keeps running ones
  const pr = await E(p, () => { const N = window.__np, s = N.S(); s.ops = [{ id: 'king', end: Date.now() - 1000 }, { id: 'raid', end: Date.now() + 60000 }, null, null, null]; s.run = 1e40; s.life = 1e40; N.recalc(); const b0 = s.badges, done0 = s.opsDone; N.promote(); return { paid: s.opsDone - done0, running: !!(s.ops[1] && s.ops[1].id === 'raid') }; });
  check('promotion pays finished jobs and keeps running ones', pr.paid === 1 && pr.running, pr);
  // clock moved back: cooldowns and boosts are shifted, not locked for weeks
  await close();
  const sk = await E(p, () => { const N = window.__np, s = N.S(); const t = Date.now(); s.last = t + 30 * 864e5; s.rallyAt = t + 30 * 864e5; s.boosts.dbl = t + 30 * 864e5 + 900e3; N.tickGame(); return { rallyIn: (s.rallyAt - Date.now()) / 36e5, dblLeft: (s.boosts.dbl - Date.now()) / 60e3 }; });
  check('clock moved back: cooldowns and boosts move back too', sk.rallyIn < 0.01 && sk.dblLeft > 14 && sk.dblLeft < 16, sk);
  // offline pay is added to uncollected pay
  await close();
  const pm = await E(p, () => { const N = window.__np, s = N.S(); s.pending = { amount: 1e6, secs: 3600, capped: false }; s.last = Date.now() - 2 * 36e5; N.tickGame(); return s.pending; });
  check('new offline pay is added to uncollected pay', pm && pm.secs > 3600 && pm.amount > 1e6, pm);
  // a sticky dialog is never replaced
  const st = await E(p, () => { const N = window.__np; N.offlineModal(); N.settingsModal(); return { offline: !!document.querySelector('#modal-root [data-offline]') }; });
  check('offline earnings dialog is not replaced by another dialog', st.offline, st);
  await close();
  // holding Enter is not a free auto-clicker
  const taps = await E(p, () => { const s = window.__np.S(), t0 = s.taps, btn = document.getElementById('arrestBtn'); for (let i = 0; i < 10; i++) btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: i > 0, bubbles: true })); return s.taps - t0; });
  check('holding Enter taps once', taps === 1, taps);
  check('no page errors', p.errs.length === 0, p.errs);
  await b.close();
  console.log(fails ? `\n${fails} REGRESSION CHECK(S) FAILED` : '\nALL REGRESSION CHECKS PASS');
  process.exit(fails ? 1 : 0);
})();

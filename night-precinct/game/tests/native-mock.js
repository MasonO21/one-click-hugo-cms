// Runs the game against a MOCK of the iOS bridge (window.webkit.messageHandlers.np) and checks the whole purchase
// pipeline: product loading, success / pending / cancel / failure, de-duplication, unfinished-transaction recovery,
// entitlement sync (non-consumables + subscription), restore, region gating, save mirroring and privacy (no network).
//   node native-mock.js
const { launch, url } = require('./lib');
const BUNDLE = 'com.yourcompany.nightprecinct';
const PRICES = { badges_80: '0.99', badges_500: '4.99', badges_1200: '9.99', badges_2600: '19.99', badges_7000: '49.99', badges_15000: '99.99', piggy: '2.99', deal_crates: '2.99', deal_boost: '2.99', deal_cash: '4.99', deal_recruit: '7.99', starter: '1.99', pass_premium: '9.99', auto_basic: '4.79', auto_combo: '9.59', auto_upgrade: '4.79', vip_weekly: '4.99' };

const { initScript } = require('./mock-bridge');

let fails = 0;
const check = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };

(async () => {
  const b = await launch();
  const net = [];
  async function open(cfg = {}) {
    const ctx = await b.newContext({ viewport: { width: 400, height: 820 } });
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) net.push(r.url()); });
    await p.addInitScript(initScript, Object.assign({ bundle: BUNDLE, prices: PRICES }, cfg));
    await p.goto(url()); await p.waitForTimeout(700);
    return p;
  }
  const S = (p, f) => p.evaluate(f);
  const buy = async (p, sku) => { await p.evaluate(s => { const N = window.__np; N.purchaseSheet(s, { title: s, lines: ['x'] }); }, sku); await p.click('#buyBtn'); await p.waitForTimeout(250); };

  /* 1. boot: products loaded, native flag, localized price shown, no restricted content */
  let p = await open();
  check('native mode detected', await S(p, () => window.__np.APP.native === true));
  check('all products loaded', await S(p, () => Object.keys(window.__np.Pay.info).length === Object.keys(window.__np.PRODUCTS).length && window.__np.Pay.loaded));
  check('storekit price is displayed (not the hard-coded USD)', await S(p, () => window.__np.Pay.price('badges_500') === '€4.99'));
  check('entitlements + unfinished queried at launch', await S(p, () => { const c = window.__log.map(m => m.cmd); return c.includes('products') && c.includes('unfinished') && c.includes('entitlements'); }));
  await p.evaluate(() => window.__np.showTab('shop')); await p.waitForTimeout(200);
  const shopText = await p.evaluate(() => document.getElementById('panel').innerText);
  check('shop shows localized prices', /€4\.99/.test(shopText), shopText.slice(0, 200));
  check('shop has Restore Purchases', /Restore Purchases/i.test(shopText));
  check('shop has crate odds disclosure', /odds/i.test(shopText) || /%/.test(shopText));
  check('no console errors at boot', p.errs.length === 0, p.errs);

  /* 1b. reviewer reachability: on a brand-new save every product can be opened from the Store tab and bought */
  const found = [];
  await p.evaluate(() => window.__np.showTab('shop')); await p.waitForTimeout(200);
  const targets = await p.evaluate(() => [...document.querySelectorAll('#panel [data-act]')].filter(b => ['pack', 'starter', 'vip', 'pass', 'piggy', 'deal', 'autoBuy'].includes(b.dataset.act)).map(b => ({ act: b.dataset.act, id: b.dataset.id || '', l: b.dataset.l || '' })));
  for (const tg of targets) {
    await p.evaluate(({ act, id, l }) => { const b = [...document.querySelectorAll('#panel [data-act]')].find(x => x.dataset.act === act && (x.dataset.id || '') === id && (x.dataset.l || '') === l); b.click(); }, tg);
    await p.waitForTimeout(60);
    const sheet = await p.evaluate(() => { const m = document.getElementById('modal-root'); const b = document.getElementById('buyBtn'); return { open: m.classList.contains('on'), enabled: !!b && !b.disabled, txt: b ? b.textContent : '' }; });
    if (sheet.open && sheet.enabled) found.push(tg.act + ':' + (tg.id || tg.l));
    await p.evaluate(() => { const c = document.querySelector('#modal-root [data-x=close]'); if (c) c.click(); });
  }
  console.log('  info reachable purchase entries: ' + found.join(', '));
  check('every product is reachable from the Store tab on a new save', found.filter(x => x.startsWith('pack')).length === 6 && found.includes('starter:') && found.includes('pass:') && found.includes('vip:') && found.includes('piggy:') && found.filter(x => x.startsWith('deal')).length === 3 && found.includes('autoBuy:1') && found.includes('autoBuy:2'), found);

  /* 1c. offers that contain crates show the odds; with paid random items off, no offer contains crates at all */
  await p.evaluate(() => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; });
  const paidRandom = await S(p, () => window.__np.PAID_RANDOM);
  console.log('  info paid random items: ' + (paidRandom ? 'ON' : 'OFF'));
  const sheets = {};
  for (const [act, id] of [['starter', ''], ['pass', ''], ...(paidRandom ? [['deal', 'd0']] : []), ['deal', 'd1'], ['deal', 'd2'], ['vip', ''], ['piggy', '']]) {
    await p.evaluate(() => window.__np.showTab('shop')); await p.waitForTimeout(100);
    await p.evaluate(({ act, id }) => { const b = [...document.querySelectorAll('#panel [data-act]')].find(x => x.dataset.act === act && (x.dataset.id || '') === id); b.click(); }, { act, id });
    sheets[act + id] = await p.evaluate(() => document.getElementById('modal-root').innerText);
    await p.evaluate(() => { const c = document.querySelector('#modal-root [data-x=close]'); if (c) c.click(); });
  }
  if (paidRandom) {
    check('Starter Pack sheet lists its crates and their odds', /3 Standard crates/.test(sheets.starter) && /odds/i.test(sheets.starter) && /55%/.test(sheets.starter), sheets.starter);
    check('Crate Trio sheet lists Elite crate odds', /odds/i.test(sheets.deald0) && /17%/.test(sheets.deald0), sheets.deald0);
    check('Career Pass sheet lists Elite and Legend odds', /odds/i.test(sheets.pass) && /35%/.test(sheets.pass) && /17%/.test(sheets.pass), sheets.pass);
  } else {
    const any = Object.entries(sheets).filter(([k, t]) => /odds|random/i.test(t));
    check('no purchase sheet sells random items', any.length === 0, any.map(x => x[0]));
    check('Crate Trio not offered', await S(p, () => { window.__np.showTab('shop'); return !document.querySelector('#panel [data-act=deal][data-id=d0]'); }));
    check('Career Pass premium lists fixed Gold Badges instead of crates', /Gold Badges on every fifth tier/.test(sheets.pass), sheets.pass);
  }
  await p.evaluate(() => window.__np.showTab('career')); await p.waitForTimeout(200);
  check('Career tab premium button shows the StoreKit price', await S(p, () => /Go Premium\s*€9\.99/i.test(document.getElementById('panel').innerText)));

  /* 2. consumable success: grants once, finishes tx, counts spend */
  const before = await S(p, () => window.__np.S().badges);
  await buy(p, 'badges_500');
  const after = await S(p, () => ({ badges: window.__np.S().badges, txs: window.__np.S().txs.length, unf: window.__mock.unfinished.size, spent: window.__np.S().spent }));
  check('consumable pack grants badges', after.badges > before, after);
  check('transaction recorded and finished', after.txs === 1 && after.unf === 0, after);
  check('spend tracked', Math.abs(after.spent - 4.99) < 0.001, after);

  /* 3. duplicate delivery of the same transaction id does not grant twice */
  const dup = await p.evaluate(async () => { const N = window.__np, S = N.S(), tx = window.__mock.tx('badges_80'); const b0 = S.badges; await N.processTx(tx); const b1 = S.badges; await N.processTx(tx); await window.NPNative.onTransaction(tx); await new Promise(r => setTimeout(r, 50)); return { first: b1 - b0, again: S.badges - b1 }; });
  check('duplicate transaction not re-granted', dup.first > 0 && dup.again === 0, dup);

  /* 3b. a weekly renewal extends Chief's Club but does not count again toward the Patron rank */
  await buy(p, 'vip_weekly');
  const sp0 = await S(p, () => window.__np.S().spent);
  const ren = await p.evaluate(async () => { const N = window.__np, S = N.S(); const first = S.vip; const tx = window.__mock.tx('vip_weekly', { originalId: '1', expirationDate: Date.now() + 14 * 864e5 }); await N.processTx(tx); return { extended: S.vip > first, spent: S.spent }; });
  check('subscription renewal extends VIP without adding to spend', ren.extended && ren.spent === sp0, { ren, sp0 });

  /* 4. cancel / pending / error: nothing granted, UI recovers */
  for (const beh of ['cancelled', 'pending', 'error']) {
    await p.evaluate(x => { window.__mock.behaviour = x; }, beh);
    const b0 = await S(p, () => window.__np.S().badges);
    await buy(p, 'badges_1200');
    const st = await S(p, () => ({ b: window.__np.S().badges, modal: document.getElementById('modal-root').classList.contains('on') }));
    check(beh + ': nothing granted, sheet closed', st.b === b0 && !st.modal, st);
  }
  await p.evaluate(() => { window.__mock.behaviour = 'success'; });

  /* 5. non-consumables & subscription */
  await buy(p, 'auto_basic'); check('auto-clicker level 1', await S(p, () => window.__np.S().perm.auto === 1));
  await buy(p, 'auto_upgrade'); check('upgrade -> combo auto-clicker', await S(p, () => window.__np.S().perm.auto === 2));
  await buy(p, 'pass_premium'); check('premium pass', await S(p, () => window.__np.S().pass.premium === true));
  await buy(p, 'starter'); check('starter pack', await S(p, () => window.__np.S().starter === true));
  await buy(p, 'vip_weekly'); check("Chief's Club active with expiry", await S(p, () => window.__np.S().vip > Date.now() && window.__np.D.vip === true));
  const sheet = await p.evaluate(() => { window.__np.purchaseSheet('vip_weekly', { title: 'x', lines: ['y'] }); return document.getElementById('modal-root').innerText; });
  check('subscription sheet: renewal + cancel disclosure and links', /renews automatically/i.test(sheet) && /cancel/i.test(sheet) && /Terms of Use/.test(sheet) && /Privacy Policy/.test(sheet) && /per week/i.test(sheet), sheet.slice(0, 400));
  await p.evaluate(() => window.__np.ACT && document.querySelector('[data-x=close]').click());
  check('no errors during purchases', p.errs.length === 0, p.errs);
  await p.context().close();

  /* 6. unfinished transaction from a previous run is granted at launch, exactly once */
  p = await open({ unfinished: [{ id: '777', originalId: '777', productId: BUNDLE + '.badges_500', type: 'consumable', purchaseDate: Date.now(), expirationDate: null, revoked: false }] });
  let r = await S(p, () => ({ b: window.__np.S().badges, txs: window.__np.S().txs, unf: window.__mock.unfinished.size }));
  check('unfinished tx recovered at launch', r.b > 60 && r.txs.includes('777') && r.unf === 0, r);
  await p.context().close();

  /* 7. entitlements restore a fresh install (reinstall / new device) */
  const ent = [{ id: '1', originalId: '1', productId: BUNDLE + '.auto_combo', type: 'nonConsumable', purchaseDate: Date.now(), expirationDate: null, revoked: false },
  { id: '2', originalId: '2', productId: BUNDLE + '.pass_premium', type: 'nonConsumable', purchaseDate: Date.now(), expirationDate: null, revoked: false },
  { id: '3', originalId: '3', productId: BUNDLE + '.vip_weekly', type: 'autoRenewable', purchaseDate: Date.now(), expirationDate: Date.now() + 3 * 864e5, revoked: false }];
  p = await open({ entitlements: ent });
  r = await S(p, () => { const s = window.__np.S(); return { auto: s.perm.auto, pass: s.pass.premium, vip: s.vip > Date.now() }; });
  check('launch sync restores combo auto-clicker, pass and Chief\'s Club', r.auto === 2 && r.pass && r.vip, r);
  /* subscription lapses -> benefit removed on next sync; restore button works */
  await p.evaluate(() => window.__mock.setEntitlements([]));
  await p.evaluate(() => window.__np.syncEntitlements()); await p.waitForTimeout(100);
  check('lapsed subscription removes VIP', await S(p, () => window.__np.S().vip === 0 && !window.__np.D.vip));
  check('non-consumable is never taken away by a later sync', await S(p, () => window.__np.S().perm.auto === 2 && window.__np.S().pass.premium));
  await p.evaluate(() => window.__mock.setEntitlements([{ id: '9', originalId: '9', productId: 'com.yourcompany.nightprecinct.starter', type: 'nonConsumable', purchaseDate: Date.now(), expirationDate: null, revoked: false }]));
  await p.evaluate(() => window.__np.restorePurchases()); await p.waitForTimeout(150);
  check('restore purchases grants starter flag', await S(p, () => window.__np.S().starter === true));
  check('restore command was sent to native', await S(p, () => window.__log.some(m => m.cmd === 'restore')));
  await p.context().close();

  /* 7b. refund: a revoked non-consumable is taken away, everything else stays */
  p = await open({ entitlements: ent });
  await p.evaluate(() => { window.__mock.setEntitlements([window.__mock.tx('pass_premium', { id: '2', originalId: '2' })]); });
  await p.evaluate(async () => { await window.__np.processTx({ id: '1', originalId: '1', productId: 'com.yourcompany.nightprecinct.auto_combo', type: 'nonConsumable', purchaseDate: Date.now(), expirationDate: null, revoked: true }); });
  r = await S(p, () => { const s = window.__np.S(); return { auto: s.perm.auto, pass: s.pass.premium }; });
  check('refunded auto-clicker unlock removed, pass kept', r.auto === 0 && r.pass === true, r);
  await p.context().close();

  /* 8. missing product (not configured in App Store Connect) cannot be bought */
  p = await open({ missing: [BUNDLE + '.badges_15000'] });
  check('unavailable product reported as unavailable', await S(p, () => window.__np.Pay.available('badges_15000') === false && window.__np.Pay.available('badges_80') === true));
  await p.context().close();

  /* 9. region gate: Belgium cannot buy randomized crates with badges; other regions can */
  const paidOn = await (async () => { const q = await open(); const v = await q.evaluate(() => window.__np.PAID_RANDOM); await q.context().close(); return v; })();
  for (const [region, expB] of [['BE', true], ['BR', true], ['US', false]]) {
    const expectBlocked = expB || !paidOn;
    p = await open({ region });
    const res = await p.evaluate(() => {
      const N = window.__np; N.S().badges = 5000;
      N.showTab('ops'); const buttons = document.querySelectorAll('#panel [data-act=buyCrate]').length;
      const before = N.S().crates.std; N.ACT.buyCrate && document.body.click();
      return { buttons, region: N.APP.region };
    });
    const blockedCall = await p.evaluate(() => { const N = window.__np, S = N.S(), b = S.badges, c = S.crates.std; const btn = document.createElement('button'); btn.dataset.act = 'buyCrate'; btn.dataset.k = 'std'; btn.dataset.n = '1'; document.getElementById('panel').appendChild(btn); btn.click();
      /* crate purchases go through a confirmation that shows the odds */
      const m = document.getElementById('modal-root'), ok = m.querySelector('[data-x=ok]'), confirm = { shown: !!ok, odds: /odds/i.test(m.innerText) }; if (ok) ok.click();
      return { granted: S.crates.std - c, spent: b - S.badges, confirm }; });
    check('region ' + region + ': crate-buy buttons ' + (expectBlocked ? 'hidden' : 'shown'), expectBlocked ? res.buttons === 0 : res.buttons > 0, res);
    check('region ' + region + ': direct buyCrate ' + (expectBlocked ? 'refused' : 'works after a confirmation with the odds'), expectBlocked ? (blockedCall.granted === 0 && blockedCall.spent === 0 && !blockedCall.confirm.shown) : (blockedCall.granted === 1 && blockedCall.spent > 0 && blockedCall.confirm.shown && blockedCall.confirm.odds), blockedCall);
    const starter = await p.evaluate(() => { const N = window.__np; N.showTab('shop'); const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; const b = document.querySelector('#panel [data-act=starter]'); if (!b) return null; b.click(); const t = m.innerText; m.classList.remove('on'); m.innerHTML = ''; return t + (document.querySelector('#panel [data-act=deal][data-id=d0]') ? '\n[Crate Trio offered]' : ''); });
    if (starter !== null) check('region ' + region + ': Starter Pack ' + (expectBlocked ? 'has Gold Badges instead of crates' : 'includes crates'), expectBlocked ? (!/crate|odds/i.test(starter) && /390 Gold Badges/.test(starter)) : /3 Standard crates/.test(starter), starter);
    if (starter !== null) check('region ' + region + ': Crate Trio deal ' + (expectBlocked ? 'hidden' : 'offered'), /\[Crate Trio offered\]/.test(starter) !== expectBlocked);
    await p.context().close();
  }

  /* 10. save mirror: newest of file vs localStorage wins; saves are pushed to native */
  const older = JSON.stringify({ v: 3, last: Date.now() - 1e6, funds: 111, badges: 11 }), newer = JSON.stringify({ v: 3, last: Date.now() - 1e3, funds: 222, badges: 22 });
  p = await open({ save: newer });
  check('boot save (file mirror) is loaded', await S(p, () => window.__np.S().badges >= 22));
  await p.evaluate(() => { window.__np.S().badges = 4242; window.__np.save(); });
  await p.waitForTimeout(100);
  check('save() mirrors to native', await S(p, () => { try { return JSON.parse(window.__saved).badges === 4242; } catch (e) { return false; } }));
  await p.context().close();
  const ctx2 = await b.newContext({ viewport: { width: 400, height: 820 } }); p = await ctx2.newPage();
  await p.addInitScript(initScript, { bundle: BUNDLE, prices: PRICES, save: older });
  await p.addInitScript(n => { try { localStorage.setItem('night-precinct-v2', n); } catch (e) { } }, newer);
  await p.goto(url()); await p.waitForTimeout(500);
  check('newer localStorage beats older file mirror', await S(p, () => window.__np.S().badges >= 22 && window.__np.S().badges !== 11));
  await ctx2.close();

  /* 11. links open through the native bridge */
  p = await open();
  await p.evaluate(() => window.__np.settingsModal()); await p.waitForTimeout(100);
  const linkBtns = await p.evaluate(() => [...document.querySelectorAll('#modal-root [data-x],#modal-root [data-act]')].map(e => (e.dataset.x || e.dataset.act) + ':' + e.textContent.trim().slice(0, 24)));
  console.log('  info settings controls: ' + linkBtns.join(' | '));
  check('settings has Privacy/Terms/Support entries', ['Privacy', 'Terms', 'Support'].every(k => linkBtns.some(x => x.includes(k))), linkBtns);
  await p.context().close();

  /* 11b. Erase save needs two taps and must beat a stale save that the app keeps handing to the page */
  const staleSave = JSON.stringify({ v: 3, last: Date.now() - 5000, badges: 9999, funds: 1e9 });
  p = await open({ save: staleSave });
  check('stale boot save loads before erase', await S(p, () => window.__np.S().badges >= 9999));
  await p.evaluate(() => window.__np.settingsModal());
  await p.click('[data-x=erase]'); await p.waitForTimeout(100);
  check('first tap on Erase only arms it', await S(p, () => window.__np.S().badges >= 9999 && !(window.__log || []).some(m => m.cmd === 'wipe')));
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-x=erase]')]);
  await p.waitForTimeout(600);
  check('after Erase the game restarts fresh even though the app still passes the old save', await S(p, () => window.__np.S().badges < 1000), await S(p, () => window.__np.S().badges));
  await p.context().close();

  /* 12. privacy: nothing but the bridge is ever contacted */
  check('zero network requests', net.length === 0, net);
  await b.close();
  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL NATIVE-MOCK CHECKS PASS');
  process.exit(fails ? 1 : 0);
})();

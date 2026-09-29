// Corrupt / hostile / odd save files must never break the game.   node saves.js
const { launch, url } = require('./lib');
const cases = {
  invalid_json: '{not json',
  empty_obj: '{}',
  garbage_types: JSON.stringify({ v: 3, owned: 'x', funds: 'abc', run: null, world: 'zzz', ws: { fire: { owned: [1, 2, null, 'q'], ops: [{ id: 'bogus', end: 'x' }], promos: 99, ups: 5 }, bogus: {} }, ops: [{ id: 'nope' }, { id: 'king', end: 'soon' }, null], perm: { auto: 7, off: 99, slots: -4 }, skin: 'weird', boosts: { dbl: 'x', spree: null }, last: 9999999999999, amt: 'lots', badges: -50, medals: 1e400, crates: { std: 'a' }, daily: { last: 5, streak: 'x' }, pass: { xp: 'z', f: 1, p: [] }, gear: { vest: 99, nonsense: 3 }, txs: [1, 'a', null] }),
  huge_numbers: JSON.stringify({ v: 3, funds: 1e300, run: 1e300, life: 1e308, medals: 1e200, badges: 1e15, owned: Array(16).fill(1e6) }),
  future_clock: JSON.stringify({ v: 3, last: Date.now() + 9e9, t0: Date.now() + 9e9, vip: Date.now() + 9e12, rallyAt: Date.now() + 9e12 }),
  old_v2_shape: JSON.stringify({ v: 2, funds: 5e6, run: 5e6, life: 5e6, badges: 120, medals: 3, promos: 2, owned: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0], adfree: true, adAt: 5 }),
};
(async () => {
  const b = await launch(); let allOk = true;
  for (const [name, payload] of Object.entries(cases).concat([['storage_blocked', null]])) {
    const p = await (await b.newContext({ viewport: { width: 400, height: 820 } })).newPage();
    const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    if (payload === null) await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    else await p.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { } }, ['night-precinct-v2', payload]);
    await p.goto(url()); await p.waitForTimeout(1200);
    for (const t of ['hq', 'upgrades', 'ops', 'shop', 'career', 'roster']) { await p.evaluate(t => window.__np.showTab(t), t); await p.waitForTimeout(120); }
    const info = await p.evaluate(() => {
      const txt = document.body.innerText, m = txt.match(/NaN|undefined|Infinity|\[object/), S = window.__np.S(), bad = [];
      const scan = (o, pa) => { if (typeof o === 'number') { if (!isFinite(o)) bad.push(pa); } else if (o && typeof o === 'object') for (const k in o) scan(o[k], pa + '.' + k); }; scan(S, 'S');
      return { textBad: m ? m[0] : null, bad, world: S.world, promos: S.promos, rosterCards: document.querySelectorAll('.gen').length, txs: S.txs.length };
    });
    const ok = errs.length === 0 && !info.textBad && info.bad.length === 0 && info.rosterCards > 0;
    if (!ok) allOk = false;
    console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(info), errs.join(' | '));
    await p.context().close();
  }
  console.log(allOk ? 'ALL SAVE CASES PASS' : 'SOME FAILED');
  await b.close(); process.exit(allOk ? 0 : 1);
})();

// Random-input stress test: clicks/taps/cheats/time-jumps/world-hops for N actions, scanning for JS errors,
// NaN/undefined text, non-finite state and horizontal overflow.   node monkey.js [seed] [actions] [WxH]
const { launch, url } = require('./lib');
(async () => {
  const seedArg = +(process.argv[2] || 1), N = +(process.argv[3] || 2000), vp = (process.argv[4] || '400x820').split('x').map(Number);
  const b = await launch();
  const p = await (await b.newContext({ viewport: { width: vp[0], height: vp[1] } })).newPage();
  const errs = [], seen = new Set();
  const add = m => { if (!seen.has(m)) { seen.add(m); errs.push(m); } };
  p.on('pageerror', e => add('pageerror: ' + e.message.split('\n')[0]));
  p.on('console', m => { if (m.type() === 'error') add('console: ' + m.text().slice(0, 200)); });
  await p.addInitScript(() => { window.__off = 0; const RD = Date; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + window.__off); } static now() { return RD.now() + window.__off; } }; });
  await p.goto(url()); await p.waitForTimeout(500);
  await p.evaluate(seed => { window.__s = seed >>> 0; window.__r = () => { let t = (window.__s += 0x6D2B79F5); t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }, seedArg);
  for (let i = 0; i < N; i++) {
    await p.evaluate(() => {
      const R = window.__r, N = window.__np, S = N.S(), roll = R();
      const pick = a => a[Math.floor(R() * a.length)];
      const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.hidden; };
      const modalOn = document.getElementById('modal-root').classList.contains('on');
      if (roll < 0.04) { const k = pick([1e3, 1e6, 1e9, 1e12, 1e18, 1e25, 1e33]); S.funds += k; S.run += k; S.life += k; S.badges += Math.floor(R() * 500); N.recalc(); }
      else if (roll < 0.06) { window.__off += pick([0.02, 0.5, 2, 8, 30, 100]) * 3600 * 1000; }
      else if (roll < 0.08) { const id = pick(['police', 'fire', 'ems']); S.done.police = true; S.done.fire = true; if (id !== S.world) N.doTravel(id); }
      else if (roll < 0.10) { S.promos = Math.floor(R() * 11); S.run = 1e40; S.life = Math.max(S.life, 1e40); N.recalc(); }
      else if (roll < 0.14) { const cv = document.getElementById('scene'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + R() * r.width, clientY: r.top + R() * r.height, bubbles: true })); }
      else if (roll < 0.20) { document.getElementById('arrestBtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
      else {
        let c;
        if (modalOn) c = [...document.querySelectorAll('#modal-root [data-x]')].filter(vis).filter(e => !['terms', 'privacy', 'purch', 'odds', 'support', 'erase'].includes(e.dataset.x));
        else c = [...document.querySelectorAll('[data-act],.tab,.fugitive,#badgeBtn,.chip')].filter(vis).filter(e => !['reset', 'link'].includes(e.dataset && e.dataset.act));
        if (c.length) pick(c).click();
      }
    });
    if (i % 50 === 49) {
      (await p.evaluate(() => {
        const out = [], S = window.__np.S();
        const scan = (o, path) => { if (o === null || o === undefined) return; if (typeof o === 'number') { if (!isFinite(o)) out.push('nonfinite ' + path); return; } if (typeof o === 'object') for (const k in o) scan(o[k], path + '.' + k); };
        scan(S, 'S');
        const txt = document.body.innerText, m = txt.match(/NaN|undefined|Infinity|\[object|null\b/);
        if (m) out.push('text:' + m[0] + ' near "' + txt.slice(Math.max(0, txt.indexOf(m[0]) - 30), txt.indexOf(m[0]) + 30).replace(/\n/g, ' ') + '"');
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('h-overflow');
        return out;
      })).forEach(x => add('state@' + i + ': ' + x));
    }
    if (i % 400 === 399) await p.waitForTimeout(150);
  }
  console.log(JSON.stringify({ seed: seedArg, vp: vp.join('x'), actions: N, errors: errs }));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();

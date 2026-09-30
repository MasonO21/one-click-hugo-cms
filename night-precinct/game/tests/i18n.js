// Translation coverage and per-language smoke test.
//  1. Pseudo-language: every translated string is shown as [[text]]. Any visible text with letters that is NOT
//     bracketed was never passed through the translator, so it would stay English in every language.
//  2. Every language that ships (English plus each catalog in game/i18n): boots, visits every tab and the main modals with no errors and no untranslated keys.
//   node i18n.js
const { launch, url } = require('./lib');
const ALLOW = /^(Night Precinct|English|Español|Français|Deutsch|Italiano|Português \(Brasil\)|日本語|한국어|简体中文|繁體中文|US\$[\d.,]+|x\d+|\d+(\.\d+)?[KMBT]?)$/;

async function visitAll(p, fn) {
  const shots = [];
  for (const world of ['police', 'fire', 'ems']) {
    await p.evaluate(w => { const N = window.__np, s = N.S(); s.done.police = true; s.done.fire = true; if (s.world !== w) N.doTravel(w); const t = N.S(); t.funds = 5e12; t.run = 5e12; t.life = 5e12; t.badges = 999; for (let i = 0; i < 10; i++) t.owned[i] = 20 + i; t.crates.std = 3; t.crates.elite = 1; t.ops[0] = { id: 'stop', end: Date.now() + 20000 }; t.perm.auto = 1; N.recalc(); const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; }, world);
    await p.waitForTimeout(500);
    for (const tab of ['hq', 'roster', 'upgrades', 'ops', 'shop', 'career']) {
      await p.evaluate(t => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; window.__np.showTab(t); }, tab);
      await p.waitForTimeout(150); shots.push(await fn(`${world}/${tab}`));
    }
  }
  const modals = {
    settings: N => N.settingsModal(), language: N => N.languageModal(),
    odds: N => N.ACT.odds(), daily: N => { N.S().daily = { last: '', streak: 0 }; N.ACT.daily(); },
    promote: N => { const s = N.S(); s.run = 1e40; s.life = 1e40; N.recalc(); N.ACT.promote(); },
    crate: N => { N.S().crates.std = 2; document.querySelector('[data-act=openCrate][data-k=std]') ? null : null; N.showTab('ops'); document.querySelector('[data-act=openCrate][data-k=std]').click(); },
    vip: N => N.ACT.vip(), pass: N => N.ACT.pass(), starter: N => N.ACT.starter(), piggy: N => N.ACT.piggy(), auto: N => N.ACT.autoBuy({ dataset: { l: '2' } }),
    pack: N => N.ACT.pack({ dataset: { id: 'p3' } }), deal: N => N.ACT.deal({ dataset: { id: 'd0' } }),
    offline: N => { const s = N.S(); s.pending = { amount: 1e6, secs: 5000, capped: true }; N.offlineModal(); },
  };
  for (const [name, f] of Object.entries(modals)) {
    await p.evaluate(src => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; (0, eval)('(' + src + ')')(window.__np); }, f.toString());
    await p.waitForTimeout(150); shots.push(await fn('modal/' + name));
  }
  return shots;
}

const collect = () => {
  const out = [];
  const walk = n => {
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) return;
      const el = n.parentElement; if (!el || el.closest('svg,script,style')) return;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width === 0 || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden]')) return;
      out.push(t);
    } else n.childNodes.forEach(walk);
  };
  walk(document.body);
  document.querySelectorAll('[aria-label]').forEach(e => out.push('aria:' + e.getAttribute('aria-label')));
  return out;
};

(async () => {
  const b = await launch(); let fails = 0;
  /* 1. pseudo-language coverage */
  {
    const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url()); await p.waitForTimeout(400);
    await p.evaluate(() => window.__np.pseudoLang());
    const leaks = new Map();
    await visitAll(p, async where => {
      const texts = await p.evaluate(collect);
      /* Walk all visible text in order, tracking bracket depth; letters at depth 0 were never translated. */
      let depth = 0;
      for (const t of texts) {
        if (t.startsWith('aria:')) { const a = t.slice(5); if (!/^\u27e6.*\u27e7$/.test(a) && /[A-Za-z]{3,}/.test(a) && !ALLOW.test(a)) leaks.set('aria-label: ' + a, where); continue; }
        let out = '';
        for (const ch of t) { if (ch === '\u27e6') depth++; else if (ch === '\u27e7') depth = Math.max(0, depth - 1); else if (depth === 0) out += ch; }
        const words = out.replace(/[\d$€£¥%+\-–:|/().,×!?·•]+/g, ' ').split(/\s+/).filter(w => /[A-Za-z]{3,}/.test(w) && !ALLOW.test(w));
        if (words.length && !ALLOW.test(t.trim()) && !leaks.has(t)) leaks.set(t, where);
      }
      return where;
    });
    const list = [...leaks.entries()].filter(([t]) => !/^(Night Precinct 1\.0\.0)/.test(t));
    console.log(list.length ? 'UNTRANSLATED TEXT:\n' + list.map(([t, w]) => `  [${w}] ${t.slice(0, 140)}`).join('\n') : 'PASS pseudo-language: every visible string goes through the translator');
    if (list.length) fails++;
    if (errs.length) { fails++; console.log('FAIL errors in pseudo mode: ' + errs.join(' | ')); }
    await p.context().close();
  }
  /* 2. every real language */
  const langs = await (async () => { const p = await (await b.newContext()).newPage(); await p.goto(url()); const l = await p.evaluate(() => window.__np.availLangs().map(x => x[0])); await p.context().close(); return l; })();
  for (const code of langs) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: code })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(url()); await p.waitForTimeout(400);
    const active = await p.evaluate(() => document.documentElement.lang);
    let braces = 0;
    await visitAll(p, async where => { const n = await p.evaluate(() => (document.body.innerText.match(/\{[a-z]+\}/g) || []).length); braces += n; return where; });
    const ok = active === code && !errs.length && !braces;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${code}: device language picked=${active}, errors=${errs.length}${errs.length ? ' ' + errs[0] : ''}, unfilled placeholders=${braces}`);
    await p.context().close();
  }
  await b.close();
  console.log(fails ? `\n${fails} I18N CHECK(S) FAILED` : '\nALL I18N CHECKS PASS');
  process.exit(fails ? 1 : 0);
})();

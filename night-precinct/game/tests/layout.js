// Layout audit across phone/tablet sizes and all worlds/tabs: page overflow, off-screen elements, clipped buttons.  node layout.js
const { launch, url } = require('./lib');
(async () => {
  const b = await launch(); const issues = [];
  for (const [vw, vh] of [[320, 568], [360, 640], [390, 844], [430, 932], [812, 375], [768, 1024], [1024, 1366]]) {
    const p = await (await b.newContext({ viewport: { width: vw, height: vh } })).newPage();
    p.on('pageerror', e => issues.push(`${vw}x${vh} pageerror ${e.message}`));
    await p.goto(url()); await p.waitForTimeout(500);
    for (const world of ['police', 'fire', 'ems']) {
      await p.evaluate(world => { const N = window.__np, s = N.S(); s.done.police = true; s.done.fire = true; if (s.world !== world) N.doTravel(world); const t = N.S(); t.funds = 5e12; t.run = 5e12; t.life = 5e12; t.badges = 999; t.perm.auto = 1; for (let i = 0; i < 10; i++) t.owned[i] = 20 + i; t.crates.std = 3; N.recalc(); const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; }, world);
      await p.waitForTimeout(700); await p.evaluate(() => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; });
      const views = ['roster', 'upgrades', 'ops', 'shop', 'career', 'hq'];
      for (const tab of views.concat(['modal:settings', 'modal:purchase'])) {
        if (tab.startsWith('modal:')) await p.evaluate(t => { const N = window.__np; if (t === 'modal:settings') N.settingsModal(); else N.purchaseSheet('vip_weekly', { title: "Chief's Club", lines: ['Line one of the benefits list', 'Line two of the benefits list', 'Line three'] }); }, tab);
        else await p.evaluate(t => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; window.__np.showTab(t); }, tab);
        await p.waitForTimeout(120);
        const res = await p.evaluate(() => {
          const out = [], W = innerWidth;
          if (document.documentElement.scrollWidth > W + 1) out.push('page h-scroll ' + document.documentElement.scrollWidth);
          for (const el of document.querySelectorAll('#app *,#modal-root *')) {
            if (el.closest('.scroller') || el.closest('.chips') || (el.closest('svg') && el.tagName !== 'svg')) continue;
            const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (r.right > W + 1 || r.left < -1) out.push('offscreen ' + el.tagName + '.' + String(el.className).slice(0, 30) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
            if (el.tagName === 'HEADER' || el.classList.contains('hud')) continue;
            if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !['svg', 'CANVAS', 'HTML', 'BODY'].includes(el.tagName) && cs.overflow !== 'hidden') out.push('overflowing ' + el.tagName + '.' + String(el.className).slice(0, 30) + ' sw=' + el.scrollWidth + ' cw=' + el.clientWidth);
          }
          for (const el of document.querySelectorAll('button,.btn')) { const r = el.getBoundingClientRect(); if (r.width > 0 && el.scrollWidth > el.clientWidth + 2) out.push('button clipped: ' + el.textContent.trim().slice(0, 30)); }
          return [...new Set(out)].slice(0, 6);
        });
        res.forEach(x => issues.push(`${vw}x${vh} ${world}/${tab}: ${x}`));
      }
    }
    await p.context().close();
  }
  console.log(issues.length ? issues.join('\n') : 'NO LAYOUT ISSUES');
  await b.close(); process.exit(issues.length ? 1 : 0);
})();

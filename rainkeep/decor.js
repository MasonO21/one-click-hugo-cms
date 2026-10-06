/*
 * Rainkeep: the keep gardens. Monuments and gardens with their own place in the terraced keep
 * (a fountain inside the gate, wyrm statues before the temple, a beacon on the upper terrace...).
 * Each climbs five levels for a small lasting bonus. Most are paid in resources scaled to the keep,
 * which gives late-game stone somewhere to go; a few take Sunsteel or Starglass. The 3D keep
 * (town3d.js) shows them as they rise; this file owns the rules and the Gardens sheet.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const DC = DATA.decor;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.decor = {}; for (const d of DC.items) s.decor[d.id] = 0; s.stats.decor = 0; });

  const unlocked = () => !!S && S.lv.wyrm >= DC.unlock;
  const item = (id) => DC.items.find((d) => d.id === id);
  const lvl = (id) => (S && S.decor ? S.decor[id] || 0 : 0);
  // what the next level costs: resources scaled to the keep now, or Sunsteel / Starglass
  function costOf(d, L = lvl(d.id)) {
    const m = Math.pow(DC.growth, L);
    if (d.starglass) return { starglass: Math.round(d.starglass * m) };
    if (d.sunsteel) return { sunsteel: Math.round(d.sunsteel * m) };
    const c = KH.scaleReward(d.cost);
    for (const k in c) c[k] = Math.round(c[k] * m);
    return c;
  }
  const bonusText = (d, L) => `+${d.pct ? Math.round(d.per * L * 1000) / 10 + '%' : Math.round(d.per * L * 100) / 100} ${d.unit}`;
  KH.hooks.bonus.push((k) => {
    if (!S || !S.decor) return 0;
    let v = 0;
    for (const d of DC.items) if (d.key === k) v += d.per * (S.decor[d.id] || 0);
    return v;
  });
  KH.decorLevel = lvl;
  KH.decorItems = () => DC.items;

  ACT.decor = (id) => {
    const d = item(id);
    if (!d) return;
    if (!unlocked()) return KH.toast(`The keep gardens open at Rainwyrm Lv ${DC.unlock}.`, 'warn');
    if (d.needs && !S.lv[d.needs]) return KH.toast(`Build the ${KH.plotName(d.needs)} first.`, 'warn');
    const L = lvl(id);
    if (L >= DC.maxLevel) return KH.toast(`${d.name} is already at its finest.`, '');
    const c = costOf(d);
    if (!KH.canAfford(c)) return KH.toast('Not enough to build it yet.', 'warn');
    KH.pay(c);
    S.decor[id] = L + 1;
    S.stats.decor = Object.values(S.decor).reduce((a, b) => a + b, 0);
    KH.emit('decor', { id, to: L + 1 });
    KH.sfx('complete');
    KH.toast(`${d.name} ${L ? `raised to Lv ${L + 1}` : 'built'}: ${bonusText(d, L + 1)}.`, 'good');
  };
  ACT.decorshow = (id) => {
    const d = item(id);
    if (!d) return;
    UI.sheet = null;
    if (UI.tab !== 'town') ACT.tab('town');
    if (KH.town3d && KH.town3d.focusAt) KH.town3d.focusAt(d.at[0], d.at[1]);
  };
  ACT.gardens = () => {
    if (!unlocked()) return KH.toast(`The keep gardens open at Rainwyrm Lv ${DC.unlock}.`, 'warn');
    UI.sheet = { kind: 'gardens' };
  };

  KH.sheets.gardens = () => {
    const rows = DC.items.map((d) => {
      const L = lvl(d.id), max = L >= DC.maxLevel, c = max ? null : costOf(d), locked = d.needs && !S.lv[d.needs];
      const pips = Array.from({ length: DC.maxLevel }, (_, i) => `<i class="${i < L ? 'on' : ''}"></i>`).join('');
      const btn = max ? '<span class="chip r-epic">Finest</span>'
        : locked ? `<span class="muted small">Needs the ${esc(KH.plotName(d.needs))}</span>`
          : `<button class="btn small ${KH.canAfford(c) ? (c.starglass ? '' : 'gold') : 'off'}" data-act="decor" data-arg="${d.id}">${L ? 'Raise' : 'Build'} ${KH.costHTML(c)}</button>`;
      return `<div class="card decor-row stack"><div class="row"><div class="grow"><b>${esc(d.name)}</b> <span class="decor-pips">${pips}</span>
          <div class="muted small">${esc(d.desc)}</div></div></div>
        <div class="row wrap"><span class="small">${L ? bonusText(d, L) : 'Not built'}${max ? '' : ` → <b>${bonusText(d, L + 1)}</b>`}</span><span class="grow"></span>
          <button class="btn small alt" data-act="decorshow" data-arg="${d.id}">Show me</button>${btn}</div></div>`;
    }).join('');
    const total = Object.values(S.decor).reduce((a, b) => a + b, 0);
    return {
      title: 'Keep gardens', lvl: `${total}/${DC.items.length * DC.maxLevel}`,
      body: `<p class="muted small">Monuments and gardens with their own place in the keep. Each climbs ${DC.maxLevel} levels and adds a small lasting bonus. Resource costs grow with your Rainwyrm.</p><div class="stack">${rows}</div>`,
    };
  };
  KH.side.push({ id: 'gardens', icon: 'i-garden', label: 'Gardens', act: 'gardens', show: () => unlocked(), dot: () => !Object.values(S.decor).some(Boolean) && DC.items.some((d) => !d.starglass && !d.sunsteel && KH.canAfford(costOf(d))) });
  KH.on('upgrade', (e) => { if (e.plot === 'wyrm' && !e.offline && e.to === DC.unlock) KH.toast('The keep gardens are open: fountains, statues and gardens, each with its own place in the keep.', 'good', 'gardens', 5); });

  // for tests and the balance bot
  KH.decor = { unlocked, costOf: (id) => costOf(item(id)), level: lvl };
})();

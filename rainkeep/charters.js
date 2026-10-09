/*
 * Rainkeep: Building Charters. When a kind of building first reaches Lv 10 it takes one of two charters, a
 * lasting specialization: more of what it makes, or something else the keep needs (a Deep Well's Artesian Bore or
 * its Covered Cisterns, a Quarry's Deep Cut or its Masons' Guild, and so on). The two Mudbrick Houses share one.
 * The first charter is free and changing it costs Starglass. The charters' effects are KH.bonus keys; the choice is
 * offered on the building's own sheet (ui.js asks KH.charterCard).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc, fmt } = KH.u;
  const { UI, ACT } = KH;
  const C = DATA.charters;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.charters = {};
    s.stats.charters = 0; s.stats.chartered = 0;
  });
  // a kind of building is chartered from the highest level among its plots
  const lvOf = (type) => Math.max(0, ...DATA.plots.filter((p) => p.type === type).map((p) => S.lv[p.id] || 0));
  const open = (type) => !!S && !!C.types[type] && lvOf(type) >= C.level;
  const chosen = (type) => (S && S.charters ? S.charters[type] : null);
  const opt = (type, id) => (C.types[type] || []).find((o) => o.id === id);

  KH.hooks.bonus.push((k) => {
    if (!S || !S.charters) return 0;
    let v = 0;
    for (const [type, id] of Object.entries(S.charters)) {
      const o = opt(type, id);
      if (o && o.fx[k] && open(type)) v += o.fx[k];
    }
    return v;
  });

  ACT.charter = (arg) => {
    const [type, id] = String(arg).split(':'), o = opt(type, id);
    if (!o) return;
    if (!open(type)) return KH.toast(`A charter comes at Lv ${C.level}.`, 'warn');
    const was = chosen(type);
    if (was === id) return;
    if (was) {
      const ask = `${type}:${id}`;
      if (UI.charterAsk !== ask) { UI.charterAsk = ask; return KH.toast(`Tap again to change the charter to ${o.name} for ${C.change} Starglass.`); }
      UI.charterAsk = null;
      if (S.starglass < C.change) return KH.toast(`Changing a charter takes ${C.change} Starglass.`, 'warn');
      S.starglass -= C.change;
    } else S.stats.charters++;
    S.charters[type] = id;
    S.stats.chartered = Object.keys(S.charters).length;
    KH.emit('charter', { type, id });
    KH.sfx('claim');
    KH.toast(`${o.name}: ${o.text}.`, 'good');
  };

  // the card on a building's sheet
  KH.charterCard = (pid) => {
    const P = DATA.plots.find((p) => p.id === pid), type = P && P.type, opts = type && C.types[type];
    if (!opts || !S) return '';
    const L = lvOf(type), c = chosen(type);
    if (L < C.level - 3 && !c) return ''; // it shows itself a few levels before it opens
    const cards = opts.map((o) => {
      const on = c === o.id;
      return `<button class="tl-opt ${on ? 'on' : ''} ${c && !on ? 'other' : ''} ${L >= C.level ? '' : 'off'}" data-act="charter" data-arg="${type}:${o.id}">${icon(DATA.buildings[type] ? (KH.ICON[DATA.buildings[type].prod] || 'i-scroll') : 'i-scroll')}<b>${esc(o.name)}</b><small>${esc(o.text)}</small></button>`;
    }).join('');
    return `<div class="card stack ch-card"><div class="row"><b class="grow">Charter</b>${L >= C.level && !c ? '<span class="chip dc-ready">Choose one</span>' : L < C.level ? `<span class="chip muted">${icon('i-lock')}Lv ${C.level}</span>` : ''}</div>
      <div class="muted small">${L >= C.level ? `One of two for ${type === 'shelter' ? 'both Houses' : 'this building'}, for good. The first is free; changing it costs ${fmt(C.change)} Starglass.` : `At Lv ${C.level} this building takes one of two charters.`}</div>
      <div class="tl-pair">${cards}</div></div>`;
  };
  const ready = () => !!S && Object.keys(C.types).some((t) => open(t) && !chosen(t));

  KH.charters = { open, chosen, opt, lvOf, ready, types: C.types };
})();

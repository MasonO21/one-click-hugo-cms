/*
 * Rainkeep: Gate Defenses. Three works at the front gate (Ballista Towers, Oil Cauldrons and a Stake Yard),
 * raised with resources scaled to the keep up to Lv 10. Each helps every level against raids and rival
 * warbands (harder-hitting defenders, steadier defenders, weaker raiders), and at Lv 5 and Lv 10 brings one more
 * of its tactic to every Scorpion Siege. town3d.js builds them on the walls as they rise; world.js reads the
 * raid bonuses and siege.js the extra tactics through KH.defense.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const DF = DATA.defense;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.defense = {}; for (const d of DF.items) s.defense[d.id] = 0; s.stats.defense = 0; });

  const unlocked = () => !!S && S.lv.wyrm >= DF.unlock;
  const item = (id) => DF.items.find((d) => d.id === id);
  const lvl = (id) => (S && S.defense ? S.defense[id] || 0 : 0);
  function costOf(d, L = lvl(d.id)) {
    const c = KH.scaleReward(d.cost), m = Math.pow(DF.growth, L);
    for (const k in c) c[k] = Math.round(c[k] * m);
    return c;
  }
  const per = (d) => d.raidAtk || d.raidDef || d.raidWeaken;
  const pct = (v) => `${+(v * 100).toFixed(1)}%`;
  const bonusText = (d, L) => `+${pct(per(d) * L)} ${d.unit}`;
  const extraOf = (d, L) => DF.tacticAt.filter((n) => L >= n).length;

  // read by world.js (raids and warbands at the gate) and siege.js (tactics per siege)
  const sum = (k) => DF.items.reduce((a, d) => a + (d[k] || 0) * lvl(d.id), 0);
  const raid = () => ({ atk: sum('raidAtk'), def: sum('raidDef'), weaken: sum('raidWeaken') });
  const tactic = (t) => { const d = DF.items.find((x) => x.tactic === t); return d ? extraOf(d, lvl(d.id)) : 0; };

  ACT.defense = (id) => {
    const d = item(id);
    if (!d) return;
    if (!unlocked()) return KH.toast(`Gate defenses open at Rainwyrm Lv ${DF.unlock}.`, 'warn');
    const L = lvl(id);
    if (L >= DF.max) return KH.toast(`${d.name} can rise no higher.`, '');
    const c = costOf(d);
    if (!KH.canAfford(c)) return KH.toast('Not enough to build it yet.', 'warn');
    KH.pay(c);
    S.defense[id] = L + 1;
    S.stats.defense = Object.values(S.defense).reduce((a, b) => a + b, 0);
    if (KH.duty) KH.duty('defense');
    KH.emit('defense', { id, to: L + 1 });
    KH.sfx('complete');
    const more = DF.tacticAt.includes(L + 1) && KH.siege ? ` Every siege now brings ${DATA.siege.stock + tactic(d.tactic)} ${DATA.siege.tactics[d.tactic].name}.` : '';
    KH.toast(`${d.name} ${L ? `raised to Lv ${L + 1}` : 'built'}: ${bonusText(d, L + 1)}.${more}`, 'good');
  };
  ACT.defenses = () => {
    if (!unlocked()) return KH.toast(`Gate defenses open at Rainwyrm Lv ${DF.unlock}.`, 'warn');
    UI.sheet = { kind: 'defenses' };
  };
  ACT.defenseshow = () => {
    UI.sheet = null;
    if (UI.tab !== 'town') ACT.tab('town');
    if (KH.town3d && KH.town3d.focusAt) KH.town3d.focusAt(DATA.keep.gate.x, DATA.keep.gate.z);
  };

  KH.sheets.defenses = () => {
    const rows = DF.items.map((d) => {
      const L = lvl(d.id), max = L >= DF.max, c = max ? null : costOf(d), t = DATA.siege.tactics[d.tactic];
      const pips = Array.from({ length: DF.max }, (_, i) => `<i class="${i < L ? 'on' : ''}${DF.tacticAt.includes(i + 1) ? ' star' : ''}"></i>`).join('');
      const next = DF.tacticAt.find((n) => n > L);
      return `<div class="card stack df-row"><div class="row">${icon(d.icon, 'df-ic')}<div class="grow"><b>${esc(d.name)}</b> <span class="decor-pips df-pips">${pips}</span>
          <div class="muted small">${esc(d.desc)}</div></div></div>
        <div class="small">${L ? bonusText(d, L) : 'Not built'}${max ? '' : ` → <b>${bonusText(d, L + 1)}</b>`}</div>
        <div class="small muted">Siege: ${DATA.siege.stock + extraOf(d, L)} ${esc(t.name)} a siege${next ? ` (one more at Lv ${next})` : ''}</div>
        <div class="row"><span class="grow"></span>${max ? '<span class="chip r-epic">Lv 10</span>' : `<button class="btn small ${KH.canAfford(c) ? 'gold' : 'off'}" data-act="defense" data-arg="${d.id}">${L ? 'Raise' : 'Build'} ${KH.costHTML(c)}</button>`}</div></div>`;
    }).join('');
    const total = Object.values(S.defense).reduce((a, b) => a + b, 0);
    return {
      title: 'Gate defenses', lvl: `${total}/${DF.items.length * DF.max}`,
      body: `<p class="muted small">Works at the front gate. Every level helps your defenders against raiders and rival warbands, and at Lv ${DF.tacticAt.join(' and Lv ')} each brings one more of its tactic to every Scorpion Siege. Costs grow with your Rainwyrm.</p>
        <div class="stack">${rows}</div><button class="btn wide alt" data-act="defenseshow">${icon('i-walls')}Show me the gate</button>`,
    };
  };
  // a card on the Watchtower's sheet
  const prev = KH.plotExtras.watchtower;
  KH.plotExtras.watchtower = (pid, R) => `${prev ? prev(pid, R) : ''}${unlocked() ? `<button class="btn wide alt" data-act="defenses">${icon('i-ballista')}Gate defenses · ${Object.values(S.defense).reduce((a, b) => a + b, 0)}/${DF.items.length * DF.max}</button>` : ''}`;

  KH.defense = { unlocked, lvl, raid, tactic, costOf };
})();

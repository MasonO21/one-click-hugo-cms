/*
 * Rainkeep: Troop Ranks. Troops drilled at the Barracks rise from recruit to Veteran, Elite and Champion, each rank
 * opening at a Barracks level and each stronger than the last. A drill takes the Barracks the way training does
 * (so the training queue chip, speedups and notifications all apply), costs resources scaled to the keep, and
 * moves a batch of one class up one rank. A class fights at the average strength of all its troops (core.js
 * reads KH.rankMult in teamStats and unitPower). Recruits fall first: ranks only thin out once a class has fewer
 * troops than ranked ones, lowest rank first.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc, fmt, fmtTime, clamp } = KH.u;
  const { UI, ACT } = KH;
  const R = DATA.ranks, LIST = R.list, CLS = Object.keys(DATA.troops);
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.ranks = {};
    for (const c of CLS) s.ranks[c] = LIST.map(() => 0);
    s.stats.drilled = 0; s.stats.champs = 0;
  });
  UI.drillType = 'guard'; UI.drillRank = 0; UI.drillN = 10;

  const sumOf = (a) => a.reduce((x, y) => x + y, 0);
  const away = (c) => (S.map && S.map.marches ? S.map.marches.reduce((a, m) => a + ((m.troops && m.troops[c]) || 0), 0) : 0);
  // every troop of a class (home and out marching), split into recruits and each rank; trims the ranks when the
  // class has lost more than its recruits
  function split(c) {
    const r = S.ranks[c], total = (S.troops[c] || 0) + away(c);
    let over = sumOf(r) - total;
    for (let i = 0; i < r.length && over > 0; i++) { const k = Math.min(r[i], over); r[i] -= k; over -= k; }
    return { recruits: total - sumOf(r), ranks: r, total };
  }
  function rankMult(c) {
    if (!S || !S.ranks || !S.ranks[c]) return 1;
    const sp = split(c);
    if (!sp.total) return 1;
    return LIST.reduce((m, rk, i) => m + sp.ranks[i] * rk.mult, sp.recruits) / sp.total;
  }
  const open = (i) => !!S && S.lv.barracks >= LIST[i].barracks;
  const unlocked = () => open(0);
  // who a drill to rank i takes: recruits for the first rank, the rank below for the others
  const pool = (c, i) => { const sp = split(c); return i ? sp.ranks[i - 1] : sp.recruits; };
  const batch = () => R.batch * S.lv.barracks;
  function costOf(c, i, n) {
    const g = {};
    for (const [k, v] of Object.entries(DATA.troops[c].cost)) g[k] = v * LIST[i].cost * n;
    return KH.scaleReward(g);
  }
  const timeOf = (i, n) => (KH.trainTime(n) * LIST[i].secs) / DATA.trainSecondsPerUnit;
  const label = (tr) => `${fmt(tr.n)} ${DATA.troops[tr.type].name} → ${LIST[tr.rank].name}`;

  ACT.dtype = (c) => { if (DATA.troops[c]) UI.drillType = c; };
  ACT.drank = (i) => {
    i = Number(i);
    if (!LIST[i]) return;
    if (!open(i)) return KH.toast(`${LIST[i].name}s open at Barracks Lv ${LIST[i].barracks}.`, 'warn');
    UI.drillRank = i;
  };
  ACT.dn = (d) => {
    const have = Math.min(batch(), pool(UI.drillType, UI.drillRank));
    if (d === 'max') {
      let n = have;
      const one = costOf(UI.drillType, UI.drillRank, 1);
      for (const [k, v] of Object.entries(one)) if (v > 0) n = Math.min(n, Math.floor((k in S.res ? S.res[k] : S[k] || 0) / v));
      UI.drillN = Math.max(1, n);
    } else UI.drillN = clamp(UI.drillN + Number(d), 1, Math.max(1, have));
  };
  ACT.drill = () => {
    if (!unlocked()) return KH.toast(`Troop ranks open at Barracks Lv ${LIST[0].barracks}.`, 'warn');
    if (S.training) return KH.toast(S.training.rank != null ? 'The barracks is already drilling.' : 'The barracks is training. Drill when the recruits are in.', 'warn');
    const c = UI.drillType, i = UI.drillRank, rk = LIST[i];
    if (!open(i)) return KH.toast(`${rk.name}s open at Barracks Lv ${rk.barracks}.`, 'warn');
    const have = pool(c, i);
    if (!have) return KH.toast(`No ${i ? `${LIST[i - 1].name}s` : 'recruits'} among your ${DATA.troops[c].name} to drill.`, 'warn');
    const n = clamp(UI.drillN, 1, Math.min(have, batch()));
    const cost = costOf(c, i, n);
    if (!KH.canAfford(cost)) return KH.toast('Not enough resources for that drill.', 'warn');
    KH.pay(cost);
    S.training = { type: c, n, rank: i, start: S.time, end: S.time + timeOf(i, n) };
    KH.emit('drillStart', { type: c, rank: i, n });
  };
  // core.js finishTraining hands a finished drill here
  function finish(tr, offline, log) {
    const c = tr.type, i = tr.rank, n = Math.min(tr.n, pool(c, i));
    if (n > 0) {
      if (i) S.ranks[c][i - 1] -= n;
      S.ranks[c][i] += n;
    }
    S.stats.drilled += n;
    S.stats.champs = Math.max(S.stats.champs || 0, CLS.reduce((a, k) => a + S.ranks[k][LIST.length - 1], 0));
    if (KH.duty) KH.duty('drill');
    KH.emit('drill', { type: c, rank: i, n });
    if (log) (log.built = log.built || []).push(`${fmt(n)} ${LIST[i].name} ${DATA.troops[c].name}`);
    if (!offline) { KH.sfx('complete'); KH.toast(`${fmt(n)} ${DATA.troops[c].name} drilled to ${LIST[i].name}.`, 'good'); }
  }

  // the bar of one class: recruits and each rank as a share of its troops
  function bar(sp) {
    if (!sp.total) return '<div class="rk-bar"><i style="flex:1"></i></div>';
    const seg = (n, col) => (n ? `<i style="flex:${n};background:${col}"></i>` : '');
    return `<div class="rk-bar">${seg(sp.recruits, '#5a4a3e')}${LIST.map((rk, i) => seg(sp.ranks[i], rk.color)).join('')}</div>`;
  }
  const pct = (m) => `+${Math.round((m - 1) * 100)}%`;
  function section() {
    if (!unlocked()) {
      return `<div class="section-label">Troop ranks</div><div class="card stack rk-teaser"><div class="row">${icon('i-drill', 'rk-ic')}<div class="grow"><b>Opens at Barracks Lv ${LIST[0].barracks}</b>
        <div class="muted small">Drill your troops into ${LIST.map((rk) => `${rk.name}s (${pct(rk.mult)})`).join(', ')}. Every rank makes the whole class fight harder.</div></div></div></div>`;
    }
    const rows = CLS.map((c) => {
      const sp = split(c), m = rankMult(c);
      const parts = [`${fmt(sp.recruits)} recruits`, ...LIST.map((rk, i) => (sp.ranks[i] ? `<b style="color:${rk.color}">${fmt(sp.ranks[i])}</b> ${rk.name}${sp.ranks[i] === 1 ? '' : 's'}` : '')).filter(Boolean)];
      return `<div class="rk-row"><div class="row">${icon(DATA.classes[c].icon)}<b class="grow">${esc(DATA.troops[c].name)}</b><b class="rk-str">${m > 1.0005 ? pct(m) : '±0%'}</b></div>${bar(sp)}<div class="muted small">${parts.join(' · ')}</div></div>`;
    }).join('');
    let drill = '';
    if (!S.training) {
      if (!open(UI.drillRank)) UI.drillRank = 0;
      const c = UI.drillType, i = UI.drillRank, rk = LIST[i], have = Math.min(batch(), pool(c, i));
      UI.drillN = clamp(UI.drillN, 1, Math.max(1, have));
      const n = UI.drillN, cost = costOf(c, i, n), from = i ? `${LIST[i - 1].name}s` : 'recruits';
      const types = CLS.map((k) => `<button class="${k === c ? 'on' : ''}" data-act="dtype" data-arg="${k}">${icon(DATA.classes[k].icon)}${esc(DATA.classes[k].name.split(' ').pop())}</button>`).join('');
      const ranks = LIST.map((r, j) => `<button class="${j === i ? 'on' : ''}${open(j) ? '' : ' off'}" data-act="drank" data-arg="${j}">${icon(r.icon)}${esc(r.name)}<small>${open(j) ? pct(r.mult) : `Barracks ${r.barracks}`}</small></button>`).join('');
      drill = `<div class="section-label">Drill</div><div class="seg rk-seg">${types}</div><div class="seg rk-seg">${ranks}</div>
        <p class="muted small">${have ? `Drills ${from} into ${rk.name}s, who fight at ${pct(rk.mult)}. ${fmt(pool(c, i))} ${from} ready.` : `No ${from} among your ${esc(DATA.troops[c].name)} to drill${i ? ` yet. Drill them to ${LIST[i - 1].name} first.` : '.'}`}</p>
        ${have ? `<div class="row"><span class="grow muted small">Troops (max ${fmt(have)})</span>
          <div class="stepper"><button data-act="dn" data-arg="-10" aria-label="Fewer">−</button><b>${fmt(n)}</b><button data-act="dn" data-arg="10" aria-label="More">+</button></div>
          <button class="btn small alt" data-act="dn" data-arg="max">Max</button></div>
          ${KH.costHTML(cost)}<div class="chip muted">${icon('i-clock')}${fmtTime(timeOf(i, n))}</div>
          <button class="btn wide ${KH.canAfford(cost) ? 'gold' : 'off'}" data-act="drill">${icon(rk.icon)}Drill ${fmt(n)} to ${esc(rk.name)}</button>` : ''}`;
    }
    return `<div class="section-label">Troop ranks</div><p class="muted small">Each class fights at the average strength of all its troops. In a fight the recruits fall first.</p>
      <div class="stack rk-list">${rows}</div>${drill}`;
  }
  // a letter when each rank opens
  KH.on('upgrade', (e) => {
    if (e.plot !== 'barracks') return;
    const i = LIST.findIndex((rk) => rk.barracks === e.to);
    if (i < 0) return;
    const rk = LIST[i];
    KH.mail(`${rk.name}s`, i ? `The drill sergeants at the Barracks can now raise ${LIST[i - 1].name}s to ${rk.name}. ${rk.name}s fight at +${Math.round((rk.mult - 1) * 100)}%, and every one lifts the strength of its whole class.`
      : `The Barracks has drill sergeants now. They can raise recruits to Veterans, who fight at +${Math.round((rk.mult - 1) * 100)}%. Every ranked troop lifts the strength of its whole class, and in a fight the recruits fall first. Elites open at Barracks Lv ${LIST[1].barracks} and Champions at Lv ${LIST[2].barracks}.`);
    if (!e.offline) KH.toast(`${rk.name}s open at the Barracks.`, 'good');
  });
  const prev = KH.plotExtras.barracks;
  KH.plotExtras.barracks = (pid, R0) => `${prev ? prev(pid, R0) : ''}${section()}`;

  KH.rankMult = rankMult;
  KH.ranks = { unlocked, open, split, pool, costOf, timeOf, batch, finish, label, mult: rankMult };
})();

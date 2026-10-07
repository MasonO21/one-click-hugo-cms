/*
 * Rainkeep: the Deepspring, the endgame under the Rainwyrm's pool. From Rainwyrm Lv 20 the wyrm
 * finds older water beneath the keep. Tideglass, refined from water and copper (or won in the Far
 * South, high in the Mirage Spire and from Colossus raids), deepens the spring through 30 levels:
 * every level strengthens troops and production, and every fifth is a Springsong rank that raises
 * every hero's level cap and adds a perk. Refine charges build up in keep time, so the spring keeps
 * filling while you are away.
 * Plugs into core through KH.hooks (defaults, tick, bonus, power), KH.sheets, KH.side and
 * KH.wyrmExtras; core grants Tideglass and reads the 'heroCap' bonus; town3d.js lights the pool
 * from KH.deep.rank().
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, today } = KH.u;
  const { UI, ACT } = KH;
  const D = DATA.deepspring, RF = D.refine;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.ICON.tideglass = 'i-tideglass';
  KH.NAME.tideglass = 'Tideglass';

  KH.hooks.defaults.push((s) => {
    s.tideglass = 0;
    s.deep = { lv: 0, open: false, charges: 0, acc: 0, sgDay: -1, sgN: 0, last: null };
    s.stats.refines = 0; s.stats.tideglass = 0; s.stats.deepLv = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= D.unlock;
  const level = () => (S && S.deep ? S.deep.lv : 0);
  const rank = (L = level()) => D.ranks.filter((r) => L >= r.at).length;
  const rankAt = (L) => D.ranks.find((r) => r.at === L);
  const nextRank = (L = level()) => D.ranks.find((r) => r.at > L);
  const levelCost = (L) => ({ tideglass: D.glass(L), ...D.res(L) });
  const refineCost = () => KH.scaleReward(RF.cost);
  const sgCost = () => RF.starglass + RF.starglassStep * (S.deep.sgDay === today() ? S.deep.sgN : 0);
  // refining and deepening never take the stores below a little water for the wyrm to drink
  const reserve = () => KH.scaleReward({ water: D.reserve }).water;
  const leaves = (c) => KH.canAfford(c) && S.res.water - (c.water || 0) >= reserve();
  const canRefine = () => unlocked() && S.deep.charges >= 1 && leaves(refineCost());
  const canDeepen = () => unlocked() && level() < D.max && leaves(levelCost(level() + 1));

  // every level: troops and production; every rank: the hero level cap and its perk
  KH.hooks.bonus.push((k) => {
    const L = level();
    if (!L) return 0;
    if (k === 'troop') return D.troop * L;
    if (k === 'prod') return D.prod * L;
    let v = 0;
    for (const r of D.ranks) if (L >= r.at && r.bonus[k]) v += r.bonus[k];
    return v;
  });
  KH.hooks.power.push(() => level() * 250);

  // The spring opens the moment the wyrm reaches Lv 20 (or the first tick of an older save that already
  // has), full of charges and with a gift in the mail. After that a charge builds up every 20 minutes.
  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const d = S.deep;
    if (!d.open) {
      d.open = true; d.charges = RF.cap; d.acc = 0;
      KH.mail('The Deepspring', `${S.wyrm.name} has found older water beneath the pool, deeper than the well ever reached. Refine its Tideglass from water and copper, and deepen the spring: every level makes your troops stronger and your keep richer, and every fifth raises what your heroes can become.`, { tideglass: D.welcome });
      KH.emit('deepOpen', {});
      return;
    }
    if (d.charges >= RF.cap) { d.acc = 0; return; }
    d.acc += dt;
    while (d.acc >= RF.every && d.charges < RF.cap) { d.acc -= RF.every; d.charges++; }
    if (d.charges >= RF.cap) d.acc = 0;
  });

  function roll() {
    let r = Math.random();
    for (const [n, p] of RF.yield) { if (r < p) return n; r -= p; }
    return RF.yield[0][0];
  }
  function gain(n, refines) {
    S.tideglass += n; S.stats.tideglass += n; S.stats.refines += refines;
    S.deep.last = { refines, n };
    KH.emit('refined', { refines, n });
  }
  ACT.refine = (arg) => {
    if (!unlocked()) return KH.toast(`The Deepspring opens at Rainwyrm Lv ${D.unlock}.`, 'warn');
    const want = arg === '5' ? 5 : 1, c = refineCost();
    let done = 0, got = 0;
    while (done < want && S.deep.charges >= 1 && leaves(c)) {
      KH.pay(c); S.deep.charges--; got += roll(); done++;
    }
    if (!done) return KH.toast(S.deep.charges < 1 ? `No refine is ready. The next in ${fmtTime(RF.every - S.deep.acc)}.` : KH.canAfford(c) ? `The cisterns keep ${fmt(reserve())} water for ${S.wyrm.name} to drink.` : 'Not enough water or copper to refine.', 'warn');
    gain(got, done);
    KH.toast(`Refined ${got} Tideglass${done > 1 ? ` in ${done} refines` : ''}.`, 'good');
    KH.sfx(got >= 5 * done ? 'victory' : 'coin');
  };
  // when no charge waits: one more refine for Starglass, a little dearer each time that day
  ACT.refinesg = () => {
    if (!unlocked()) return;
    const d = S.deep, sg = sgCost(), c = refineCost();
    if (S.starglass < sg) return KH.toast(`A Starglass refine costs ${sg} Starglass.`, 'warn');
    if (!leaves(c)) return KH.toast(KH.canAfford(c) ? `The cisterns keep ${fmt(reserve())} water for ${S.wyrm.name} to drink.` : 'Not enough water or copper to refine.', 'warn');
    KH.pay({ ...c, starglass: sg });
    if (d.sgDay !== today()) { d.sgDay = today(); d.sgN = 0; }
    d.sgN++;
    const got = roll();
    gain(got, 1);
    KH.toast(`Refined ${got} Tideglass.`, 'good');
    KH.sfx('coin');
  };
  ACT.deepen = () => {
    if (!unlocked()) return KH.toast(`The Deepspring opens at Rainwyrm Lv ${D.unlock}.`, 'warn');
    if (level() >= D.max) return KH.toast('The Deepspring is as deep as it goes.', 'warn');
    const c = levelCost(level() + 1);
    if (!leaves(c)) return KH.toast(S.tideglass < c.tideglass ? 'Not enough Tideglass. Refine more, or win it in the Far South and the Spire.' : KH.canAfford(c) ? `The cisterns keep ${fmt(reserve())} water for ${S.wyrm.name} to drink.` : 'Not enough resources in the stores.', 'warn');
    KH.pay(c);
    S.deep.lv++;
    S.stats.deepLv = S.deep.lv;
    const r = rankAt(S.deep.lv);
    if (r) {
      KH.toast(`${r.name}! Every hero's level cap rises by ${r.bonus.heroCap}. ${r.perk}.`, 'good', null, 6);
      KH.sfx('victory');
      KH.mail(r.name, `The Deepspring sings a note deeper. ${S.wyrm.name} glows with it, and every hero's level cap rises by ${r.bonus.heroCap}. ${r.perk}.`);
    } else {
      KH.toast(`The Deepspring reached Lv ${S.deep.lv}.`, 'good');
      KH.sfx('claim');
    }
    KH.emit('deepen', { lv: S.deep.lv });
  };
  ACT.deepspring = () => { UI.sheet = { kind: 'deepspring' }; };

  // ======================================================================
  // The sheet
  // ======================================================================
  const pct = (v) => `${Math.round(v * 100)}%`;
  function perksNow(L) {
    const rows = [['Troop strength', `+${pct(D.troop * L)}`], ['Production', `+${pct(D.prod * L)}`]];
    const cap = D.ranks.filter((r) => L >= r.at).reduce((a, r) => a + r.bonus.heroCap, 0);
    if (cap) rows.push(['Hero level cap', `+${cap}`]);
    return rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  KH.sheets.deepspring = () => {
    const L = level(), nr = nextRank(L), d = S && S.deep;
    const intro = KH.art.banner('building', 'deepspring', 'Older water than the well ever reached, glowing under the pool. Every level makes your troops stronger and your keep richer, and every fifth raises what your heroes can become.');
    if (!unlocked()) {
      return {
        title: 'The Deepspring', lvl: 'Locked',
        body: `${intro}<div class="card"><p>${icon('i-lock')} Opens when your Rainwyrm reaches Lv ${D.unlock}. Until then the water under the pool is too deep for ${esc(S.wyrm.name)} to reach.</p></div>`,
      };
    }
    const ranks = D.ranks.map((r) => `<div class="bloom-ms deep-ms ${L >= r.at ? 'done' : ''}"><span class="n">${r.at}</span><div class="grow"><b>${esc(r.name)}</b><div class="muted small">Hero level cap +${r.bonus.heroCap} · ${esc(r.perk)}</div></div>${L >= r.at ? icon('i-check') : ''}</div>`).join('');
    let deepen;
    if (L >= D.max) deepen = `<div class="card"><p><b>The Deepspring is as deep as it goes.</b> ${esc(S.wyrm.name)} is Keeper of the Deepspring.</p></div>`;
    else {
      const c = levelCost(L + 1), r = rankAt(L + 1), ok = leaves(c);
      deepen = `<div class="card stack deep-next"><div class="row"><div class="grow"><b>Lv ${L + 1}</b><div class="muted small">Troops +${pct(D.troop)}, production +${pct(D.prod)}${r ? `, and <b class="deep-rank">${esc(r.name)}</b>: hero level cap +${r.bonus.heroCap}, ${esc(r.perk.charAt(0).toLowerCase() + r.perk.slice(1))}` : ''}</div></div></div>
        ${KH.costHTML(c)}
        <button class="btn wide ${ok ? 'gold' : 'off'}" data-act="deepen" data-primary>${icon('i-tideglass')}Deepen the spring</button></div>`;
    }
    const cost = refineCost(), waitFor = d.charges >= RF.cap ? 0 : RF.every - d.acc;
    const last = d.last ? `<p class="muted small">Last time: ${d.last.n} Tideglass from ${d.last.refines} refine${d.last.refines === 1 ? '' : 's'}.</p>` : '';
    const refine = `<div class="card stack deep-refine"><div class="row"><div class="grow"><b>Tideglass refinery</b>
        <div class="muted small">Each refine turns water and copper into 1 to 5 Tideglass.</div></div>
        <span class="deep-charges"><b>${d.charges}</b>/${RF.cap}</span></div>
      <div class="bar xp"><i style="width:${(d.charges / RF.cap) * 100}%"></i></div>
      <p class="muted small">${d.charges >= RF.cap ? 'Every refine is ready. Charges stop building while they wait.' : `A refine charges every ${Math.round(RF.every / 60)} minutes. Next in ${fmtTime(waitFor)}.`}</p>
      ${KH.costHTML(cost)}
      ${d.charges >= 1
        ? `<div class="row"><button class="btn grow ${leaves(cost) ? '' : 'off'}" data-act="refine" data-arg="1">Refine</button>${d.charges >= 2 ? `<button class="btn grow alt ${leaves(cost) ? '' : 'off'}" data-act="refine" data-arg="5">Refine ×${Math.min(5, d.charges)}</button>` : ''}</div>`
        : `<button class="btn wide alt ${S.starglass >= sgCost() && leaves(cost) ? '' : 'off'}" data-act="refinesg">Refine now · ${icon('i-gem')}${sgCost()}</button>`}
      ${KH.canAfford(cost) && !leaves(cost) ? `<p class="muted small">The cisterns keep ${fmt(reserve())} water back for ${esc(S.wyrm.name)} to drink.</p>` : ''}
      ${last}</div>`;
    return {
      title: 'The Deepspring', lvl: `Lv ${L}/${D.max}`,
      body: `${intro}
        <div class="card stack deep-head"><div class="row"><div class="grow"><b class="deep-rank">${rank(L) ? esc(D.ranks[rank(L) - 1].name) : 'Unsung'}</b>
          <div class="muted small">${nr ? `${nr.at - L} more level${nr.at - L === 1 ? '' : 's'} to ${esc(nr.name)}` : 'Every rank is sung.'}</div></div>
          <span class="chip deep-have">${icon('i-tideglass')}${fmt(S.tideglass)}</span></div>
          ${L ? `<dl class="kv">${perksNow(L)}</dl>` : '<p class="muted small">Deepen the spring once to feel it.</p>'}</div>
        ${deepen}
        ${refine}
        <div class="section-label">Springsong ranks</div><div class="stack">${ranks}</div>
        <p class="muted small">Tideglass also comes from the Far South (1 a stage, ${D.farSouth.boss} from each boss), from Mirage Spire floors past 100 and from every Colossus your Caravan brings down.</p>`,
    };
  };

  // the side rail, the Rainwyrm's sheet and the canvases
  KH.side.push({ id: 'deepspring', icon: 'i-tideglass', label: 'Deepspring', act: 'deepspring', show: unlocked,
    dot: () => S.deep.charges >= RF.cap || canDeepen(), badge: () => `Lv ${level()}` });
  const prevExtras = KH.wyrmExtras;
  KH.wyrmExtras = () => `${prevExtras ? prevExtras() : ''}${unlocked() ? `<button class="btn wide alt" data-act="deepspring">${icon('i-tideglass')}The Deepspring · Lv ${level()}</button>` : ''}`;

  // for town3d.js, tests and the balance bot
  KH.deep = {
    unlocked, open: () => unlocked() && !!S.deep.open, level, rank, levelCost, refineCost, canDeepen, canRefine, reserve,
    charges: () => (S && S.deep ? S.deep.charges : 0), sgCost,
  };
})();

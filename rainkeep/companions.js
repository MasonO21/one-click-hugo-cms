/*
 * Rainkeep: Companions, the desert animals that come to live in the keep. Sahra the fennec arrives
 * with the mail at Rainwyrm Lv 7; five more (a sand cat, a hoopoe, an oryx, a saker falcon and a
 * caracal) can be tamed once the keep has grown enough, with Honeyed Dates (treats) and Camel Bells.
 * Each levels to 30 on treats, with an Advance at Lv 10 and 20 that takes bells. Every level adds to
 * the companion's keep bonus, and each has a skill on a cooldown in keep time: a cache of supplies,
 * hurried timers or an hour's boost. Treats forage on their own (one every 30 minutes, up to 16 waiting)
 * and come from beasts on the Dunes, daily duty chests and the Companion Kit; bells come from every
 * expedition boss, every tenth Mirage Spire floor and the Crossing's hidden oasis.
 * Plugs into core through KH.hooks (defaults, tick, bonus, power), KH.sheets, KH.side and KH.on;
 * town3d.js shows the tamed companions about the keep through KH.pals.owned().
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const D = DATA.companions, FG = D.forage;
  const PAL = Object.fromEntries(D.list.map((p) => [p.id, p]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.pals = { open: false, own: {}, forage: 0, acc: 0, buffs: [] };
    s.stats.tamed = 0; s.stats.palLv = 0; s.stats.palTop = 0; s.stats.palSkills = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= D.unlock;
  const open = () => unlocked() && !!S.pals.open;
  const own = (id) => (S && S.pals ? S.pals.own[id] : null);
  const rf = (p) => D.rarity[p.rarity];
  // the level a companion can reach before its next Advance
  const capOf = (o) => (o.adv < D.tiers.length ? D.tiers[o.adv] : D.max);
  const feedCost = (p, L) => ({ treats: D.treat(L, rf(p)) });
  const advCost = (p, o) => ({ bells: Math.round(D.bells[o.adv] * rf(p)) });
  const needsAdvance = (o) => o.lv >= capOf(o) && o.lv < D.max;
  const passive = (p, L) => p.per * L;
  const reqMet = (p) => !p.req || ((!p.req.wyrm || S.lv.wyrm >= p.req.wyrm) && (!p.req.stage || S.stage > p.req.stage));
  const reqShort = (p) => (!p.req ? '' : p.req.wyrm ? `Rainwyrm Lv ${p.req.wyrm}` : `stage ${p.req.stage}`);
  const canTame = (p) => open() && !own(p.id) && reqMet(p) && KH.canAfford(p.tame || {});
  const canFeed = (p) => { const o = own(p.id); return !!o && o.lv < capOf(o) && KH.canAfford(feedCost(p, o.lv + 1)); };
  const canAdvance = (p) => { const o = own(p.id); return !!o && needsAdvance(o) && KH.canAfford(advCost(p, o)); };
  const skillReady = (p) => { const o = own(p.id); return !!o && S.time >= (o.ready || 0); };
  const val = (pair, L) => pair[0] + pair[1] * L; // [base, per level]
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;

  // passive bonuses from every companion, and the timed boosts their skills leave behind
  KH.hooks.bonus.push((k) => {
    if (!S || !S.pals || !S.pals.open) return 0;
    let v = 0;
    for (const [id, o] of Object.entries(S.pals.own)) if (PAL[id] && PAL[id].key === k) v += passive(PAL[id], o.lv);
    for (const b of S.pals.buffs) if (b.k === k && S.time < b.until) v += b.v;
    return v;
  });
  KH.hooks.power.push(() => (S && S.pals ? Object.values(S.pals.own).reduce((a, o) => a + o.lv, 0) * D.power : 0));

  function tally() {
    const lv = Object.values(S.pals.own).map((o) => o.lv);
    S.stats.tamed = lv.length; S.stats.palLv = lv.reduce((a, b) => a + b, 0); S.stats.palTop = Math.max(0, ...lv);
  }

  // Sahra arrives the moment the wyrm reaches Lv 7 (or on the first tick of an older save that already has);
  // after that a treat forages every 30 minutes of keep time.
  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const P = S.pals;
    if (!P.open) {
      P.open = true;
      P.own.fennec = { lv: 1, adv: 0, ready: 0 };
      P.forage = Math.min(FG.cap, 4); P.acc = 0;
      tally();
      KH.mail('A fennec at the gate', `A fennec kit followed the last caravan in and has decided the keep is hers. The children call her Sahra. She digs up whatever the sand hides, and more animals will come as the keep grows. Feed her Honeyed Dates to raise her, and tame the others with Camel Bells.`, { treats: D.welcome.treats, bells: D.welcome.bells });
      KH.emit('palsOpen', {});
      return;
    }
    if (P.buffs.length && P.buffs.some((b) => S.time >= b.until)) P.buffs = P.buffs.filter((b) => S.time < b.until);
    if (P.forage >= FG.cap) { P.acc = 0; return; }
    P.acc += dt;
    while (P.acc >= FG.every && P.forage < FG.cap) { P.acc -= FG.every; P.forage++; }
    if (P.forage >= FG.cap) P.acc = 0;
  });

  // bells from every expedition boss, every tenth Spire floor and the Crossing's oasis
  const bells = (n, why) => { if (!open() || !n) return; KH.grant({ bells: n }); KH.toast(`+${n} Camel Bell${n > 1 ? 's' : ''} ${why}.`, 'good', 'bells', 3); };
  KH.on('stage', ({ n }) => { if (open() && KH.enemyFor && KH.enemyFor(n).boss) bells(D.bossBells, 'from the fallen boss'); });
  KH.on('spire', ({ floor, win }) => { if (win && floor % 10 === 0) bells(D.bossBells, "from the Spire's Warden"); });
  KH.on('crossing', ({ won }) => { if (won) bells(D.crossBells, 'from the hidden oasis'); });

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.pals = () => { UI.sheet = { kind: 'pals' }; };
  ACT.pal = (id) => { if (PAL[id]) UI.sheet = { kind: 'pal', id }; };
  ACT.forage = () => {
    if (!open()) return;
    const n = S.pals.forage;
    if (!n) return KH.toast(`Nothing foraged yet. The next treat in ${fmtTime(FG.every - S.pals.acc)}.`, 'warn');
    S.pals.forage = 0;
    KH.grant({ treats: n });
    KH.toast(`+${n} Honeyed Dates.`, 'good');
    KH.sfx('coin');
  };
  ACT.paltame = (id) => {
    const p = PAL[id];
    if (!p || !open() || own(id)) return;
    if (!reqMet(p)) return KH.toast(`${p.name} comes to the keep once you reach ${reqShort(p)}.`, 'warn');
    if (!KH.canAfford(p.tame || {})) return KH.toast('Not enough treats or bells yet.', 'warn');
    KH.pay(p.tame || {});
    S.pals.own[id] = { lv: 1, adv: 0, ready: 0 };
    tally();
    KH.toast(`${p.name} the ${p.kind.toLowerCase()} joins the keep!`, 'good', null, 4);
    KH.sfx('recruit');
    KH.emit('palTamed', { id });
  };
  // feed: one level, or as many as the treats (and the next Advance) allow
  ACT.palfeed = (arg) => {
    const [id, mode] = String(arg).split(':'), p = PAL[id], o = own(id);
    if (!p || !o) return;
    if (needsAdvance(o)) return KH.toast(`${p.name} needs an Advance before Lv ${o.lv + 1}.`, 'warn');
    if (o.lv >= D.max) return KH.toast(`${p.name} is fully grown.`, 'warn');
    let n = 0;
    const want = mode === 'max' ? D.max : 1;
    while (n < want && o.lv < capOf(o) && KH.canAfford(feedCost(p, o.lv + 1))) { KH.pay(feedCost(p, o.lv + 1)); o.lv++; n++; }
    if (!n) return KH.toast('Not enough Honeyed Dates.', 'warn');
    tally();
    KH.toast(`${p.name} reached Lv ${o.lv}.`, 'good');
    KH.sfx('claim');
    KH.emit('palLevel', { id, lv: o.lv });
  };
  ACT.paladv = (id) => {
    const p = PAL[id], o = own(id);
    if (!p || !o || !needsAdvance(o)) return;
    const c = advCost(p, o);
    if (!KH.canAfford(c)) return KH.toast(`An Advance takes ${c.bells} Camel Bells.`, 'warn');
    KH.pay(c);
    o.adv++;
    KH.toast(`${p.name} advanced and can now grow to Lv ${capOf(o)}.`, 'good');
    KH.sfx('victory');
  };
  // what a skill does at level L, in words (for the sheet) and in effect
  function skillWords(p, L) {
    const s = p.skill;
    if (s.res) {
      const g = KH.scaleReward(Object.fromEntries(Object.entries(s.res).map(([k, v]) => [k, val(v, L)])));
      if (s.starglass) g.starglass = Math.round(val(s.starglass, L));
      return Object.entries(g).map(([k, v]) => `${fmt(v)} ${(KH.NAME[k] || k).toLowerCase()}`).join(', ');
    }
    if (s.mins) return `${Math.round(val(s.mins, L))} minutes off every timer`;
    return `+${pct(val(s.buff.v, L))} ${s.buff.key === 'gather' ? 'gathering' : s.buff.key === 'teamAtk' ? 'squad attack' : 'troop strength'} for ${Math.round(s.buff.secs / 60)} minutes`;
  }
  const jobs = () => [...S.builds, S.research, S.training].filter((j) => j && j.end > S.time);
  ACT.palskill = (id) => {
    const p = PAL[id], o = own(id);
    if (!p || !o) return;
    if (!skillReady(p)) return KH.toast(`${p.skill.name} is ready in ${fmtTime(o.ready - S.time)}.`, 'warn');
    const s = p.skill, L = o.lv;
    if (s.res) {
      const g = KH.scaleReward(Object.fromEntries(Object.entries(s.res).map(([k, v]) => [k, val(v, L)])));
      if (s.starglass) g.starglass = Math.round(val(s.starglass, L));
      KH.grant(g);
      KH.toast(`${p.name}: ${skillWords(p, L)}.`, 'good', null, 4);
      KH.sfx('coin');
    } else if (s.mins) {
      const js = jobs();
      if (!js.length) return KH.toast('Nothing is under way for Hudhud to hurry.', 'warn');
      const secs = Math.round(val(s.mins, L) * 60);
      for (const j of js) KH.cutJob(j, secs);
      KH.toast(`Hudhud hurried ${js.length} timer${js.length > 1 ? 's' : ''} by ${Math.round(secs / 60)} minutes.`, 'good', null, 4);
      KH.sfx('claim');
    } else {
      const v = val(s.buff.v, L);
      S.pals.buffs = S.pals.buffs.filter((b) => b.id !== id);
      S.pals.buffs.push({ id, k: s.buff.key, v, until: S.time + s.buff.secs });
      KH.toast(`${s.name}: ${skillWords(p, L)}.`, 'good', null, 4);
      KH.sfx('victory');
    }
    o.ready = S.time + s.cd;
    S.stats.palSkills++;
    if (KH.duty) KH.duty('companion');
    KH.emit('palSkill', { id });
  };

  // ======================================================================
  // Sheets
  // ======================================================================
  const port = (p) => KH.art.portrait({ id: `pal-${p.id}`, rarity: p.rarity === 'common' ? 'rare' : p.rarity === 'rare' ? 'epic' : 'legendary' });
  const RAR = { common: 'Common', rare: 'Rare', epic: 'Epic' };
  const bonusText = (p, L) => `+${pct(passive(p, L))} ${p.unit}`;
  const haveChips = () => `<span class="chip">${icon('i-treat')}${fmt(KH.have('treats'))}</span><span class="chip">${icon('i-bell')}${fmt(KH.have('bells'))}</span>`;
  const palDot = (p) => { const o = own(p.id); return o ? skillReady(p) || canFeed(p) || canAdvance(p) : canTame(p); };

  KH.sheets.pals = () => {
    const intro = KH.art.banner('building', 'companions', 'Desert animals who have made the keep their home. Feed them Honeyed Dates to grow them; each makes the keep a little stronger and has a skill of its own.');
    if (!unlocked()) {
      return { title: 'Companions', lvl: 'Locked', body: `${intro}<div class="card"><p>${icon('i-lock')} The first companion arrives when your Rainwyrm reaches Lv ${D.unlock}.</p></div>` };
    }
    const P = S.pals, wait = P.forage >= FG.cap ? 0 : FG.every - P.acc;
    const forage = `<div class="card stack"><div class="row"><div class="grow"><b>Foraging</b><div class="muted small">${P.forage >= FG.cap ? 'The baskets are full. Foraging waits until you collect.' : `A treat forages every ${Math.round(FG.every / 60)} minutes. Next in ${fmtTime(wait)}.`}</div></div>
        <span class="deep-charges"><b>${P.forage}</b>/${FG.cap}</span></div>
      <div class="bar xp"><i style="width:${(P.forage / FG.cap) * 100}%"></i></div>
      <button class="btn wide ${P.forage ? 'gold' : 'off'}" data-act="forage">${icon('i-treat')}Collect ${P.forage} Honeyed Date${P.forage === 1 ? '' : 's'}</button></div>`;
    const cards = D.list.map((p) => {
      const o = own(p.id);
      const sub = o ? `Lv ${o.lv}${skillReady(p) ? ' · skill ready' : ''}` : reqMet(p) ? 'Ready to tame' : `Needs ${reqShort(p)}`;
      return `<button class="hcard pal-card ${p.rarity} ${o ? '' : 'pal-wild'}" data-act="pal" data-arg="${p.id}">${port(p)}<span class="meta"><span class="nm">${esc(p.name)}</span><span class="sub"><span>${esc(sub)}</span></span></span>${palDot(p) ? '<i class="dot"></i>' : ''}</button>`;
    }).join('');
    const boosts = P.buffs.filter((b) => S.time < b.until).map((b) => `<span class="chip good">${esc(PAL[b.id].skill.name)} · ${fmtTime(b.until - S.time)}</span>`).join('');
    return {
      title: 'Companions', lvl: `${Object.keys(P.own).length}/${D.list.length}`,
      body: `${intro}<div class="row pal-have">${haveChips()}${boosts}</div>${forage}<div class="hero-grid">${cards}</div>
        <p class="muted small">Honeyed Dates also come from every beast on the Dunes and from the daily duty chests. Camel Bells come from every expedition boss, every tenth Mirage Spire floor and the Crossing's hidden oasis.</p>`,
    };
  };

  KH.sheets.pal = () => {
    const p = PAL[UI.sheet.id], o = own(p.id);
    const head = `<div class="row" style="align-items:flex-start"><div style="width:120px;flex:none;border-radius:12px;overflow:hidden;border:1px solid var(--line)">${port(p)}</div>
      <div class="grow"><div class="r-${p.rarity === 'common' ? 'rare' : p.rarity === 'rare' ? 'epic' : 'legendary'}" style="font-weight:700">${RAR[p.rarity]} · ${esc(p.kind)}</div>
      <p class="small" style="margin-top:6px">${esc(p.bio)}</p><div class="row" style="margin-top:6px">${haveChips()}</div></div></div>`;
    const L = o ? o.lv : 1;
    const skill = `<div class="card stack"><div class="row"><div class="grow"><b>${esc(p.skill.name)}</b><div class="muted small">${esc(p.skill.desc)} Now: ${esc(skillWords(p, L))}. Every ${Math.round(p.skill.cd / 3600)} hours.</div></div></div>
      ${o ? (skillReady(p) ? `<button class="btn wide gold" data-act="palskill" data-arg="${p.id}">${icon('i-star')}Use ${esc(p.skill.name)}</button>` : `<button class="btn wide off" data-act="palskill" data-arg="${p.id}">Ready in ${fmtTime(o.ready - S.time)}</button>`) : ''}</div>`;
    if (!o) {
      const ok = reqMet(p);
      return {
        title: p.name, lvl: 'Wild',
        body: `${head}<div class="card"><b>Keep bonus</b><div class="muted small">${esc(bonusText(p, 1))} at Lv 1, up to ${esc(bonusText(p, D.max))} at Lv ${D.max}.</div></div>${skill}
          ${ok ? `<div class="card stack"><b>Tame ${esc(p.name)}</b>${KH.costHTML(p.tame || {})}<button class="btn wide ${canTame(p) ? 'gold' : 'off'}" data-act="paltame" data-arg="${p.id}" data-primary>${icon('i-pals')}Tame</button></div>`
            : `<p class="notice">${icon('i-lock')} ${esc(p.name)} comes to the keep once you reach ${esc(reqShort(p))}.</p>`}`,
      };
    }
    let grow;
    if (o.lv >= D.max) grow = `<div class="card"><p><b>${esc(p.name)} is fully grown.</b></p></div>`;
    else if (needsAdvance(o)) {
      const c = advCost(p, o);
      grow = `<div class="card stack"><div><b>Advance</b><div class="muted small">${esc(p.name)} has grown as far as Lv ${o.lv} allows. An Advance raises the limit to Lv ${o.adv + 1 < D.tiers.length ? D.tiers[o.adv + 1] : D.max}.</div></div>
        ${KH.costHTML(c)}<button class="btn wide ${canAdvance(p) ? 'gold' : 'off'}" data-act="paladv" data-arg="${p.id}" data-primary>${icon('i-bell')}Advance</button></div>`;
    } else {
      const c = feedCost(p, o.lv + 1);
      grow = `<div class="card stack"><div><b>Feed to Lv ${o.lv + 1}</b><div class="muted small">${esc(bonusText(p, o.lv + 1))}, and a stronger ${esc(p.skill.name)}.</div></div>
        ${KH.costHTML(c)}<div class="row"><button class="btn grow ${canFeed(p) ? 'gold' : 'off'}" data-act="palfeed" data-arg="${p.id}:1" data-primary>${icon('i-treat')}Feed</button>
        <button class="btn grow alt ${canFeed(p) ? '' : 'off'}" data-act="palfeed" data-arg="${p.id}:max">Feed to Lv ${capOf(o)}</button></div></div>`;
    }
    const bar = `<div class="bar xp"><i style="width:${(o.lv / D.max) * 100}%"></i></div>`;
    return {
      title: p.name, lvl: `Lv ${o.lv}/${D.max}`,
      body: `${head}<div class="card stack"><div class="row"><div class="grow"><b>Keep bonus</b><div class="muted small">${esc(bonusText(p, o.lv))}</div></div><span class="muted small">Advance ${o.adv}/${D.tiers.length}</span></div>${bar}</div>
        ${skill}${grow}<button class="btn wide alt" data-act="pals">All companions</button>`,
    };
  };

  // the side rail and the backpack
  KH.side.push({ id: 'pals', icon: 'i-pals', label: 'Companions', act: 'pals', show: unlocked,
    dot: () => S.pals.forage >= FG.cap / 2 || D.list.some(palDot), badge: () => `${Object.keys(S.pals.own).length}/${D.list.length}` });

  // for town3d.js, tests and the balance bot
  KH.pals = {
    unlocked, open, own, owned: () => (S && S.pals ? Object.keys(S.pals.own) : []), list: D.list, capOf, feedCost, advCost,
    canTame, canFeed, canAdvance, skillReady, needsAdvance, reqMet, forage: () => (S && S.pals ? S.pals.forage : 0),
  };
})();

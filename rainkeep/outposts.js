/*
 * Rainkeep: Oasis Outposts. From Rainwyrm Lv 7 a resource node on the Dunes can be claimed as an outpost: builders
 * march out with a garrison, and when they arrive a palisade goes up and the garrison stays. The outpost yields the
 * node's resource every hour (Sunsteel on a vein, more on a flooded oasis) and keeps up to eight hours of it for you
 * to collect, rises to Lv 5, and draws a raider band every few hours. Raiders are as many as a share of your march
 * cap would be, fresh recruits at your Barracks level, so what tells is the garrison you leave (its size, its ranks,
 * your gear) and the outpost's walls. A garrison that loses is routed: half of it limps home and the outpost falls.
 * You get more outposts as the Rainwyrm grows. world.js asks KH.outposts about tiles, marches and the troops held
 * out; world3d.js draws the palisades.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, rand, sum, clamp } = KH.u;
  const { UI, ACT } = KH;
  const O = DATA.outposts, RD = O.raid, CLS = ['guard', 'bow', 'lancer'];
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.outposts = [];
    s.stats.outposts = 0; s.stats.outpostsHeld = 0; s.stats.outpostDefs = 0; s.stats.outpostFalls = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= O.unlock;
  const slots = () => (S ? O.slots.reduce((a, [w, n]) => (S.lv.wyrm >= w ? n : a), 0) : 0);
  const list = () => (S && S.outposts) || [];
  const at = (k) => list().find((o) => o.k === k) || null;
  const building = () => (S ? S.map.marches.filter((m) => m.kind === 'outpost' && m.build) : []);
  const free = () => slots() - list().length - building().length;
  const garrisoned = () => list().reduce((a, o) => a + sum(o.troops), 0);
  const garrisonOf = (c) => list().reduce((a, o) => a + (o.troops[c] || 0), 0);
  const nameOf = (o) => `${KH.world.tileName(KH.world.tile(o.x, o.y))} Outpost`;
  const scaled = (g, m = 1) => { const c = KH.scaleReward(g); for (const k in c) c[k] = Math.round(c[k] * m); return c; };
  const costOf = () => scaled(O.cost);
  const upCost = (o) => scaled(O.up, Math.pow(O.growth, o.lvl - 1));
  const minGarrison = () => Math.ceil(KH.marchCap() * O.garrison);
  const nodeLvl = (o) => KH.world.tile(o.x, o.y).lvl || 1;
  // what one hour yields
  function perHour(o) {
    const m = (1 + O.nodeLvl * (nodeLvl(o) - 1)) * (o.flooded ? O.flooded : 1);
    if (o.res === 'sunsteel') return { sunsteel: Math.round(O.sunsteel[o.lvl - 1] * m) };
    return scaled({ [o.res]: O.yield[o.lvl - 1] * m });
  }
  const capOf = (o) => Object.values(perHour(o))[0] * O.hold;
  // a raider band: as many fresh recruits as a share of your march cap, at your Barracks level
  function raidFoe(o, cls = CLS[Math.floor(Math.random() * 3)]) {
    const share = RD.base + RD.perLvl * nodeLvl(o), n = Math.round(KH.marchCap() * share), um = KH.troopMult();
    let atk = 0, def = 0, hp = 0;
    for (const c of CLS) { const t = DATA.troops[c], k = n / 3; atk += k * t.atk * um; def += k * t.def * um; hp += k * t.hp * um; }
    return { name: 'Raiders', cls, boss: false, n: nodeLvl(o), atk, def, hp, size: n };
  }
  const guard = (o, cls) => KH.teamStats(cls, { troops: { ...o.troops }, heroes: [], defBonus: RD.wall * o.lvl });
  // how a garrison would fare: the raiders' class is unknown, so take the worst of the three
  function odds(o) {
    const ours = Math.min(...CLS.map((c) => KH.statPower(guard(o, c)) / KH.statPower(raidFoe(o, c))));
    return ours >= 1.25 ? ['Holds well', 'var(--good)'] : ours >= 1 ? ['Should hold', 'var(--gold)'] : ['Too thin', 'var(--bad)'];
  }

  // ======================================================================
  // Raising, reinforcing, collecting, raising a level, leaving
  // ======================================================================
  ACT.outpost = (k) => {
    const [x, y] = k.split(',').map(Number), t = KH.world.tile(x, y);
    if (!unlocked()) return KH.toast(`Outposts open at Rainwyrm Lv ${O.unlock}.`, 'warn');
    if (t.kind !== 'node' || t.gone || t.busy || !KH.world.visible(x, y)) return;
    if (free() <= 0) return KH.toast(`You hold all the outposts you can (${slots()}). The Rainwyrm's growth brings more.`, 'warn');
    const why = KH.world.march.canSend(false);
    if (why) return KH.toast(why, 'warn');
    const troops = KH.world.march.pickTroops(UI.wsend);
    if (sum(troops) < minGarrison()) return KH.toast(`A garrison needs at least ${fmt(minGarrison())} troops.`, 'warn');
    const c = costOf();
    if (!KH.canAfford(c)) return KH.toast('Not enough to build the palisade yet.', 'warn');
    KH.pay(c);
    const m = KH.world.march.newMarch('outpost', t, troops);
    m.build = true; m.res = t.res;
    UI.sheet = null;
    KH.toast(`Builders and ${fmt(sum(troops))} troops set out to raise an outpost.`, 'good');
  };
  ACT.outreinforce = (k) => {
    const o = at(k);
    if (!o) return;
    const why = KH.world.march.canSend(false);
    if (why) return KH.toast(why, 'warn');
    const troops = KH.world.march.pickTroops(UI.wsend);
    if (sum(troops) < 1) return KH.toast('No troops at home to send.', 'warn');
    const t = KH.world.tile(o.x, o.y), m = KH.world.march.newMarch('outpost', t, troops);
    m.build = false;
    UI.sheet = null;
    KH.toast(`${fmt(sum(troops))} troops march to reinforce the ${nameOf(o)}.`, 'good');
  };
  // world.js hands an arriving outpost march here, then drops the march: its troops stay as the garrison
  function arrive(m, offline) {
    let o = at(KH.world.key(m.x, m.y));
    if (o) { for (const c in m.troops) o.troops[c] = (o.troops[c] || 0) + m.troops[c]; return; }
    const t = KH.world.tile(m.x, m.y);
    o = { k: t.k, x: t.x, y: t.y, res: t.res, flooded: !!t.flooded, lvl: 1, troops: { ...m.troops }, stored: 0, since: S.time, raidAt: S.time + rand(RD.every[0], RD.every[1]), warned: false };
    S.outposts.push(o);
    S.stats.outposts++;
    S.stats.outpostsHeld = Math.max(S.stats.outpostsHeld || 0, list().length);
    KH.emit('outpost', { k: o.k });
    if (!offline) { KH.sfx('complete'); KH.toast(`The ${nameOf(o)} is raised. Its garrison holds the ground.`, 'good'); }
  }
  function collect(o, quiet) {
    const n = Math.floor(o.stored);
    if (n < 1) return 0;
    o.stored -= n;
    KH.grant({ [o.res]: n });
    if (KH.duty) KH.duty('outpost');
    KH.emit('outpostCollect', { res: o.res, n });
    if (!quiet) KH.toast(`Collected ${fmt(n)} ${KH.NAME[o.res].toLowerCase()} from the ${nameOf(o)}.`, 'good');
    return n;
  }
  ACT.outcollect = (k) => { const o = at(k); if (o && !collect(o)) KH.toast('Nothing to collect yet.', ''); };
  ACT.outcollectall = () => {
    let any = 0;
    for (const o of list()) any += collect(o, true);
    KH.toast(any ? 'Collected from every outpost.' : 'Nothing to collect yet.', any ? 'good' : '');
  };
  ACT.outup = (k) => {
    const o = at(k);
    if (!o || o.lvl >= O.max) return;
    const c = upCost(o);
    if (!KH.canAfford(c)) return KH.toast('Not enough to raise its walls yet.', 'warn');
    KH.pay(c);
    o.lvl++;
    KH.sfx('upgrade');
    KH.toast(`The ${nameOf(o)} rises to Lv ${o.lvl}.`, 'good');
  };
  // the garrison comes home (with what's stored); the node is free again
  function sendHome(o, troops) {
    S.map.seq++;
    const back = KH.world.travel(o.x, o.y);
    if (sum(troops) > 0) S.map.marches.push({ id: S.map.seq, kind: 'garrison', x: o.x, y: o.y, troops, heroes: [], depart: S.time, arrive: S.time, back: S.time + back, state: 'back', amount: 0, res: null, workEnd: 0, report: null });
    S.outposts = list().filter((x) => x !== o);
  }
  ACT.outleave = (k) => {
    const o = at(k);
    if (!o) return;
    if (UI.sheet && UI.sheet.confirm !== k) { UI.sheet = { ...UI.sheet, confirm: k }; return; }
    collect(o, true);
    sendHome(o, { ...o.troops });
    UI.sheet = null;
    KH.toast(`The garrison leaves the ${nameOf(o)} and marches home.`, '');
  };
  ACT.outposts = () => {
    if (!unlocked()) return KH.toast(`Outposts open at Rainwyrm Lv ${O.unlock}.`, 'warn');
    UI.sheet = { kind: 'outposts' };
  };
  ACT.outshow = (k) => { const o = at(k); if (!o) return; UI.sheet = null; KH.world.focus(o.x, o.y); };

  // ======================================================================
  // Yield and raids
  // ======================================================================
  function resolveRaid(o, offline) {
    const foe = raidFoe(o), res = KH.simulateBattle(guard(o, foe.cls), foe), name = nameOf(o);
    if (res.win) {
      for (const c in o.troops) o.troops[c] -= Math.round(o.troops[c] * RD.lossWin);
      const share = 0.5 + nodeLvl(o) * 0.1, g = scaled({ journals: O.win.journals * share });
      g.starglass = Math.round(O.win.starglass * share);
      KH.grant(g);
      S.stats.outpostDefs++;
      KH.emit('outpostHeld', { k: o.k });
      o.raidAt = S.time + rand(RD.every[0], RD.every[1]); o.warned = false;
      if (offline) KH.mail(`The ${name} held`, `Raiders came for the ${name} while you were away. The garrison beat them off.`, g);
      else KH.toast(`The ${name} beat off the raiders: ${KH.u.fmt(g.starglass)} Starglass.`, 'good');
    } else {
      const left = {};
      for (const c in o.troops) left[c] = Math.floor(o.troops[c] * (1 - RD.lossFall));
      S.stats.outpostFalls++;
      KH.emit('outpostFell', { k: o.k });
      sendHome(o, left);
      const msg = `Raiders overran the ${name}. The survivors, ${fmt(sum(left))} troops, are limping home. A bigger garrison, or higher walls, would have held.`;
      if (offline) KH.mail(`The ${name} fell`, msg); else { KH.toast(msg, 'warn'); KH.sfx('defeat'); }
    }
  }
  KH.hooks.tick.push((dt, offline) => {
    if (!S || !list().length) return;
    for (const o of list().slice()) {
      if (dt) o.stored = Math.min(capOf(o), (o.stored || 0) + (Object.values(perHour(o))[0] * dt) / 3600);
      if (!o.warned && o.raidAt - S.time <= RD.warn) {
        o.warned = true;
        if (!offline) { KH.toast(`Raiders are moving on the ${nameOf(o)}. They strike in ${fmtTime(o.raidAt - S.time)}.`, 'warn'); KH.sfx('raid'); }
      }
      if (S.time >= o.raidAt) resolveRaid(o, offline);
    }
  });

  // ======================================================================
  // Sheets: the outpost's own tile, the claim card on a node, and the list
  // ======================================================================
  const store = (o) => `${fmt(Math.floor(o.stored))}/${fmt(capOf(o))}`;
  const raidLine = (o) => (o.warned ? `<p class="notice heat">${icon('i-swarm')}Raiders strike in ${fmtTime(Math.max(0, o.raidAt - S.time))}.</p>` : `<p class="muted small">Raiders come every ${Math.round(RD.every[0] / 3600)} to ${Math.round(RD.every[1] / 3600)} hours; your lookouts give ${Math.round(RD.warn / 60)} minutes' warning.</p>`);
  // the sheet of a tile that is your outpost
  function tileSheet(t) {
    const o = t.outpost, ph = perHour(o), [res, n] = Object.entries(ph)[0], od = odds(o), foe = raidFoe(o, 'guard');
    const avail = sum(KH.capTroops(S.troops, KH.marchCap(), S.formation));
    const fracs = [[0.25, '¼'], [0.5, '½'], [1, 'All']].map(([f, l]) => `<button class="${UI.wsend === f ? 'on' : ''}" data-act="wfrac" data-arg="${f}">${l}<small>${fmt(Math.floor(avail * f))}</small></button>`).join('');
    const up = o.lvl < O.max ? upCost(o) : null;
    const confirm = UI.sheet && UI.sheet.confirm === o.k;
    return {
      title: nameOf(o), lvl: `Lv ${o.lvl}`,
      body: `<div class="card stack"><div class="row">${icon(KH.ICON[res] || 'i-fort', 'op-ic')}<div class="grow"><b>${fmt(n)} ${esc(KH.NAME[res].toLowerCase())} an hour</b><div class="muted small">Stored ${store(o)} (it keeps ${O.hold} hours' worth)</div></div>
          <button class="btn small ${o.stored >= 1 ? 'gold' : 'off'}" data-act="outcollect" data-arg="${o.k}">Collect</button></div>
          <div class="bar xp"><i style="width:${Math.min(100, (o.stored / capOf(o)) * 100)}%"></i></div></div>
        <div class="card stack"><div class="row"><div class="grow"><b>Garrison · ${fmt(sum(o.troops))} troops</b><div class="muted small">${CLS.map((c) => `${fmt(o.troops[c] || 0)} ${DATA.troops[c].name}`).join(' · ')}</div></div><b style="color:${od[1]}">${od[0]}</b></div>
          <div class="muted small">Raiders bring about ${fmt(foe.size)} fighters. Walls give the garrison +${Math.round(RD.wall * o.lvl * 100)}% defense.</div>${raidLine(o)}
          <div class="seg">${fracs}</div><button class="btn wide alt" data-act="outreinforce" data-arg="${o.k}">Send reinforcements</button></div>
        ${up ? `<div class="card row"><div class="grow"><b>Raise to Lv ${o.lvl + 1}</b><div class="muted small">More yield and +${Math.round(RD.wall * 100)}% walls</div></div><button class="btn small ${KH.canAfford(up) ? 'gold' : 'off'}" data-act="outup" data-arg="${o.k}">${KH.costHTML(up)}</button></div>` : '<p class="muted small">The outpost stands at its highest level.</p>'}
        <button class="btn wide ${confirm ? '' : 'alt'}" data-act="outleave" data-arg="${o.k}">${confirm ? 'Tap again to bring the garrison home' : 'Leave the outpost'}</button>`,
    };
  }
  // the card on a node's sheet that offers to raise one
  function claimHTML(t) {
    if (!unlocked() || t.gone) return '';
    const n = slots(), c = costOf(), pool = KH.capTroops(S.troops, KH.marchCap(), S.formation), send = Math.floor(sum(pool) * UI.wsend);
    if (free() <= 0) return `<p class="muted small">${icon('i-fort')}You hold all ${n} of your outposts. ${n < O.slots[O.slots.length - 1][1] ? 'The Rainwyrm\'s growth brings more.' : ''}</p>`;
    const o = { x: t.x, y: t.y, res: t.res, flooded: !!t.flooded, lvl: 1, troops: {} }, [res, ph] = Object.entries(perHour(o))[0];
    const enough = send >= minGarrison();
    return `<div class="card stack op-claim"><div class="row">${icon('i-fort', 'op-ic')}<div class="grow"><b>Raise an outpost</b><div class="muted small">Leave a garrison here and it yields ${fmt(ph)} ${esc(KH.NAME[res].toLowerCase())} an hour, but raiders will come for it. The troops you send stay as its garrison (at least ${fmt(minGarrison())}).</div></div></div>
      <div class="row"><span class="grow muted small">${list().length + building().length}/${n} outposts</span><button class="btn small ${KH.canAfford(c) && enough && !t.busy ? 'gold' : 'off'}" data-act="outpost" data-arg="${t.k}">${KH.costHTML(c)}</button></div></div>`;
  }
  KH.sheets.outposts = () => {
    const rows = list().map((o) => {
      const [res, n] = Object.entries(perHour(o))[0], od = odds(o);
      return `<div class="card stack op-row"><div class="row">${icon(KH.ICON[res] || 'i-fort', 'op-ic')}<div class="grow"><b>${esc(nameOf(o))}</b> <span class="chip">Lv ${o.lvl}</span><div class="muted small">${fmt(n)}/h · stored ${store(o)} · ${fmt(sum(o.troops))} troops · <span style="color:${od[1]}">${od[0]}</span></div></div></div>
        ${o.warned ? `<p class="notice heat small">Raiders strike in ${fmtTime(Math.max(0, o.raidAt - S.time))}.</p>` : ''}
        <div class="row"><span class="grow"></span><button class="btn small alt" data-act="outshow" data-arg="${o.k}">${icon('i-map')}Show</button><button class="btn small ${o.stored >= 1 ? 'gold' : 'off'}" data-act="outcollect" data-arg="${o.k}">Collect</button></div></div>`;
    }).join('');
    return {
      title: 'Outposts', lvl: `${list().length}/${slots()}`,
      body: `<p class="muted small">Claim a resource node on the Dunes (tap it on the map) and leave a garrison: it yields every hour and keeps up to ${O.hold} hours of it. Raiders come for each outpost every few hours, as many as a share of your march, so leave enough troops. More outposts open at Rainwyrm Lv ${O.slots.slice(1).map((s) => s[0]).join(', ')}.</p>
        ${rows || '<div class="card"><p class="muted">No outposts yet. Open the World map and tap a resource node.</p></div>'}
        ${list().length ? '<button class="btn wide gold" data-act="outcollectall">Collect from all</button>' : '<button class="btn wide gold" data-act="tab" data-arg="map">To the Dunes</button>'}`,
    };
  };
  KH.side.push({ id: 'outposts', icon: 'i-fort', label: 'Outposts', act: 'outposts', show: unlocked, dot: () => list().some((o) => o.warned || o.stored >= capOf(o)), badge: () => `${list().length}/${slots()}` });
  KH.chips.push(() => {
    if (!S || !list().length) return '';
    const hit = list().find((o) => o.warned);
    if (hit) return `<button class="qchip raid" data-act="outposts">${icon('i-swarm')}Outpost raid <time>${fmtTime(Math.max(0, hit.raidAt - S.time))}</time></button>`;
    return list().some((o) => o.stored >= capOf(o)) ? `<button class="qchip" data-act="outposts">${icon('i-fort')}Outposts full</button>` : '';
  });

  KH.outposts = { unlocked, slots, list, at, free, garrisoned, garrisonOf, perHour, capOf, costOf, upCost, raidFoe, odds, arrive, collect, tileSheet, claimHTML, resolveRaid, minGarrison };
})();

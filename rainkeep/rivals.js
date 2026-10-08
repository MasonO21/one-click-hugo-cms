/*
 * Rainkeep: Rival Keeps, the other keeps on the Dunes. From Rainwyrm Lv 8 eight rival keeps stand on
 * open sand around yours, each with a warden, a standing on the Dunes and a storehouse. Scout one to see
 * its defenders and stores, then march your squad on it: a win carries home part of its stores, and the
 * rival raises a Peace Shield for a while. A rival you raid may send its warband back against your gate
 * (the Hold the Gate raid, under its name); strike back within the hour for a revenge bonus. A Peace
 * Shield of your own (Starglass) keeps every warband away, until you attack someone yourself.
 * Plugs into world.js (tile layout, marches, fights, the tile sheet, raids) through KH.rivals, and into
 * core through KH.hooks (defaults, tick) and KH.on.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, rand, pick } = KH.u;
  // (a rival's warband rides as the next raid on the gate: world.js reads S.map.raid.from)
  const { UI, ACT } = KH;
  const R = DATA.rivals;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.rivals = { open: false, list: [], peaceUntil: 0, last: null };
    s.stats.rivalWins = 0; s.stats.rivalLosses = 0; s.stats.revenges = 0; s.stats.struck = 0; s.stats.rivalsBeaten = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= R.unlock;
  const open = () => unlocked() && !!S.rivals.open && S.rivals.list.length > 0;
  const byKey = (k) => (S && S.rivals ? S.rivals.list.findIndex((r) => r.k === k) : -1);
  const peace = () => !!S && S.rivals.peaceUntil > S.time;
  const shielded = (r) => r.shieldUntil > S.time;
  const scouted = (r) => r.scoutedUntil > S.time;
  const revenge = (r) => r.raidedYou > 0 && S.time - r.raidedYou < R.revenge.secs;
  // a rival fights as strong as this expedition stage (its share of yours, never below stage 3)
  const stageOf = (r) => Math.max(3, S.stage * r.mult);
  const foeOf = (r) => ({ n: Math.round(stageOf(r)), name: r.name, cls: r.cls, boss: false, ...KH.foeStats(stageOf(r), R.wall) });
  const lvlOf = (r) => Math.max(1, Math.round(S.lv.wyrm + (r.mult - 1) * 8));
  // the storehouse fills back up over R.refill after a raid
  const fill = (r) => Math.min(1, (S.time - r.stashT) / R.refill);
  const stashOf = (r) => { const full = KH.scaleReward(Object.fromEntries(KH.RES.map((k) => [k, R.stash * r.mult]))), f = fill(r); return Object.fromEntries(Object.entries(full).map(([k, v]) => [k, Math.floor(v * f)])); };

  // ======================================================================
  // The rivals take their places on open sand, spread round the keep, the first time the Dunes allow
  // ======================================================================
  function place() {
    const W = KH.world, cands = [];
    for (let y = 0; y < W.N; y++) for (let x = 0; x < W.N; x++) {
      const d = W.dist(x, y);
      if (d < R.ring[0] || d > R.ring[1] || !W.openSand(x, y)) continue;
      cands.push({ x, y, d, a: Math.atan2(y - W.C, x - W.C), k: W.key(x, y) });
    }
    // one per sector round the keep, nearer ones for the weaker rivals
    const names = DATA.keeps.slice().sort(() => Math.random() - 0.5), wardens = DATA.names.slice().sort(() => Math.random() - 0.5);
    const list = [];
    for (let i = 0; i < R.count; i++) {
      const lo = -Math.PI + (i * 2 * Math.PI) / R.count, hi = lo + (2 * Math.PI) / R.count;
      const inSector = cands.filter((c) => c.a >= lo && c.a < hi && !list.some((r) => r.k === c.k));
      if (!inSector.length) continue;
      list.push({ c: inSector[Math.floor(Math.random() * inSector.length)] });
    }
    list.sort((a, b) => a.c.d - b.c.d);
    S.rivals.list = list.map(({ c }, i) => ({
      k: c.k, x: c.x, y: c.y, name: names[i % names.length], warden: wardens[i % wardens.length], mult: R.ranks[Math.min(i, R.ranks.length - 1)],
      cls: pick(['guard', 'bow', 'lancer']), color: R.colors[i % R.colors.length],
      shieldUntil: 0, stashT: -1e9, scoutedUntil: 0, raidedYou: 0, hits: 0, losses: 0,
    }));
    if (W.reset) W.reset();
  }

  KH.hooks.tick.push(() => {
    if (!unlocked() || !KH.world) return;
    const P = S.rivals;
    if (!P.open) {
      P.open = true;
      place();
      if (P.list.length) KH.mail('Other keeps on the Dunes', `Your scouts report ${P.list.length} other keeps within reach, each with a warden and a storehouse of its own. Scout one before you march on it: a win carries home part of its stores. Expect a keep you raid to answer in kind; a Peace Shield keeps their warbands away, until you attack someone yourself.`, { starglass: 50 });
      KH.emit('rivalsOpen', {});
      return;
    }
    // a warband on its way turns back at a Peace Shield
    if (peace() && S.map.raid.from != null) {
      KH.toast(`${(P.list[S.map.raid.from] || { name: 'A rival' }).name}'s warband turned back at your Peace Shield.`, 'good', 'peace', 4);
      cancelStrike();
    }
  });
  function cancelStrike() {
    if (S.map.raid.from == null) return;
    S.map.raid.from = null; S.map.raid.warned = false;
    S.map.raid.next = S.time + rand(DATA.world.raids.every[0], DATA.world.raids.every[1]);
  }

  // a raid on the gate by a rival's warband (world.js resolves it): remember it for the revenge bonus
  KH.on('rivalStrike', ({ id, win }) => {
    const r = S.rivals.list[id];
    if (!r) return;
    r.raidedYou = S.time;
    S.stats.struck++;
    S.rivals.last = { id, win, t: S.time };
    KH.mail(win ? `${r.name}'s warband was driven off` : `${r.name}'s warband broke through`, `${r.warden} of ${r.name} sent a warband against your gate in answer to your raid. ${win ? 'Your defenders drove it off.' : 'It made off with part of your stores.'} Strike back within the hour for +${Math.round(R.revenge.atk * 100)}% attack.`);
  });

  // ======================================================================
  // Fights: world.js marches the squad there and asks for the outcome
  // ======================================================================
  function resolve(m, team0) {
    const id = byKey(`${m.x},${m.y}`), r = S.rivals.list[id];
    if (!r) return null;
    const foe = foeOf(r), rev = revenge(r);
    const team = KH.teamStats(foe.cls, { troops: m.troops, heroes: m.heroes, atkBonus: rev ? R.revenge.atk : 0 });
    const result = KH.simulateBattle(team, foe);
    let rewards = null;
    if (result.win) {
      const stash = stashOf(r);
      rewards = Object.fromEntries(Object.entries(stash).map(([k, v]) => [k, Math.floor(v * R.plunder)]));
      Object.assign(rewards, KH.scaleReward({ starglass: Math.round(R.win.starglass * r.mult), journals: R.win.journals * r.mult }));
      KH.grant(rewards);
      // what is left in its storehouse, and the shield it raises
      const left = fill(r) * (1 - R.plunder);
      r.stashT = S.time - left * R.refill;
      r.shieldUntil = S.time + R.shield;
      if (!r.hits) S.stats.rivalsBeaten++;
      r.hits++; S.stats.rivalWins++;
      if (rev) { S.stats.revenges++; r.raidedYou = 0; }
      KH.emit('rivalWin', { id, revenge: rev });
    } else { r.losses++; S.stats.rivalLosses++; }
    // it may send its warband back at your gate: the next raid on the keep is theirs, sighted from the
    // watchtower like any other
    if (S.map.raid.from == null && !peace() && Math.random() < R.strike.chance) {
      S.map.raid.next = S.time + rand(R.strike.after[0], R.strike.after[1]); S.map.raid.from = id; S.map.raid.warned = false;
    }
    if (KH.duty) KH.duty('rival');
    return { foe, team, result, rewards, lossFrac: result.win ? R.lossWin : R.loss, lvl: lvlOf(r) };
  }
  // the warband that strikes back (world.js uses it for the raid on the gate)
  const warband = (id) => { const r = S.rivals.list[id]; return r ? { n: Math.round(stageOf(r)), name: `${r.name}'s warband`, cls: r.cls, boss: false, chapter: 'Raid', ...KH.foeStats(stageOf(r) * R.strikeMult, 1.1) } : null; };

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.rivals = () => { UI.sheet = { kind: 'rivals' }; };
  ACT.rivalscout = (k) => {
    const r = S.rivals.list[byKey(k)];
    if (!r) return;
    const c = KH.scaleReward(R.scout);
    if (!KH.canAfford(c)) return KH.toast('Not enough food to send scouts.', 'warn');
    KH.pay(c);
    r.scoutedUntil = S.time + R.scoutFor;
    KH.toast(`Scouts report on ${r.name}.`, 'good');
    KH.sfx('build');
  };
  ACT.rivalpeace = () => {
    if (!open()) return;
    if (!KH.canAfford({ starglass: R.peace.starglass })) return KH.toast(`A Peace Shield costs ${R.peace.starglass} Starglass.`, 'warn');
    KH.pay({ starglass: R.peace.starglass });
    S.rivals.peaceUntil = Math.max(S.rivals.peaceUntil, S.time) + R.peace.secs;
    cancelStrike();
    KH.toast(`A Peace Shield rises over the keep for ${fmtTime(R.peace.secs)}. No rival will strike while it holds.`, 'good', null, 4);
    KH.sfx('claim');
  };
  // world.js calls this as a march sets out for a rival: your own Peace Shield drops when you attack
  function marching() {
    if (peace()) { S.rivals.peaceUntil = 0; KH.toast('Your Peace Shield drops as your march sets out.', 'warn'); }
  }

  // ======================================================================
  // The tile sheet for a rival keep, and the standings
  // ======================================================================
  const range = (v, sc) => (sc ? fmt(v) : `${fmt(Math.round(v * 0.8 / 100) * 100)}–${fmt(Math.round(v * 1.2 / 100) * 100)}`);
  function sheet(t, ui) {
    const r = S.rivals.list[byKey(t.k)];
    const foe = foeOf(r), sc = scouted(r), rev = revenge(r);
    const team = KH.teamStats(foe.cls, { troops: ui.troops, heroes: KH.squadHome(), atkBonus: rev ? R.revenge.atk : 0 });
    const ours = KH.statPower(team), theirs = KH.statPower(foe);
    const odds = ours >= theirs * 1.15 ? ['Favored', 'var(--good)'] : ours >= theirs * 0.9 ? ['Even fight', 'var(--gold)'] : ['Risky', 'var(--bad)'];
    const stash = stashOf(r);
    const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === foe.cls);
    const why = ui.why || (shielded(r) ? `${r.name} is under a Peace Shield for ${fmtTime(r.shieldUntil - S.time)}.` : null);
    const scoutCost = KH.scaleReward(R.scout);
    return {
      title: r.name, lvl: `Lv ${lvlOf(r)}`,
      body: `<div class="row rival-head"><span class="rival-flag" style="background:${r.color}">${icon('i-fort')}</span><div class="grow"><b>${esc(r.warden)}, Warden of ${esc(r.name)}</b>
          <div class="muted small">${shielded(r) ? `${icon('i-peace')} Peace Shield for ${fmtTime(r.shieldUntil - S.time)}` : `Raided ${r.hits} time${r.hits === 1 ? '' : 's'}${r.losses ? `, held you off ${r.losses}` : ''}`}</div></div></div>
        ${rev ? `<p class="notice">${icon('i-revenge')} ${esc(r.name)} raided your gate. Strike back in the next ${fmtTime(R.revenge.secs - (S.time - r.raidedYou))} for +${Math.round(R.revenge.atk * 100)}% attack.</p>` : ''}
        <div class="row">${KH.foeArt(foe, 'mini-foe')}<div class="grow"><div class="muted small">${sc ? `${icon(DATA.classes[foe.cls].icon)} Defenders fight like ${DATA.classes[foe.cls].name}s. Weak to ${DATA.classes[counter].name}s.` : 'Scout it to learn how its defenders fight.'}</div>
        <div class="vs"><div class="side"><span class="muted small">Your march</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">Defenders</span><b>${range(theirs, sc)}</b></div></div>
        <b style="color:${odds[1]}">${sc ? odds[0] : `${odds[0]}?`}</b></div></div>
        <div class="card stack"><b>Storehouse ${sc ? '' : '(scout to see)'}</b>${sc ? `<div class="costs">${KH.rewardHTML(stash)}</div><div class="muted small">A win carries home ${Math.round(R.plunder * 100)}% of it, ${fill(r) < 1 ? `and it is ${Math.round(fill(r) * 100)}% full` : 'and it is full'}.</div>` : '<div class="muted small">Stores fill back up within an hour and a half of a raid.</div>'}
          <button class="btn small alt" data-act="rivalscout" data-arg="${t.k}">${icon('i-scout')}Scout · ${KH.costHTML(scoutCost)}</button></div>
        ${ui.busyMsg}${ui.slotLine}<div class="seg">${ui.fracs}</div>
        <p class="muted small">Your squad leads the march. A win also brings Starglass and journals, and ${esc(r.name)} raises a Peace Shield for ${fmtTime(R.shield)}. A lost attack costs ${Math.round(R.loss * 100)}% of the troops sent. ${peace() ? '<b>Attacking drops your own Peace Shield.</b>' : `A keep you raid may strike back at your gate within ${Math.round(R.strike.after[1] / 60)} minutes.`}</p>
        ${why ? `<p class="notice heat">${esc(why)}</p>` : ''}
        <button class="btn wide ${why || t.busy ? 'off' : ''}" data-act="wattack" data-arg="${t.k}" data-primary>${icon('i-sword')}${rev ? 'Take revenge' : 'Attack'}</button>
        <button class="btn wide alt" data-act="rivals">Standings on the Dunes</button>`,
    };
  }

  KH.sheets.rivals = () => {
    const intro = KH.art.banner('event', 'rivals', 'Other keeps on the Dunes, each with a warden and a storehouse. Scout them, raid them, and watch your gate.');
    if (!unlocked()) return { title: 'Rival Keeps', lvl: 'Locked', body: `${intro}<div class="card"><p>${icon('i-lock')} Your scouts find other keeps once your Rainwyrm reaches Lv ${R.unlock}.</p></div>` };
    if (!open()) return { title: 'Rival Keeps', lvl: '', body: `${intro}<p class="muted">Your scouts are still searching the Dunes.</p>` };
    const P = S.rivals;
    const mine = KH.statPower(KH.teamStats(null));
    const rows = P.list.map((r, i) => ({ r, i, p: KH.statPower(foeOf(r)) })).concat([{ me: true, p: mine }]).sort((a, b) => b.p - a.p);
    const board = rows.map((x, n) => x.me ? `<div class="you"><span>${n + 1}</span><b>Your keep</b><span>${fmt(x.p)}</span></div>`
      : `<button class="rival-row" data-act="rivalgo" data-arg="${x.r.k}"><span>${n + 1}</span><b><i class="rival-dot" style="background:${x.r.color}"></i>${esc(x.r.name)}${shielded(x.r) ? ` ${icon('i-peace')}` : ''}${revenge(x.r) ? ` ${icon('i-revenge')}` : ''}</b><span>${scouted(x.r) ? fmt(x.p) : '?'}</span></button>`).join('');
    const myRank = rows.findIndex((x) => x.me) + 1;
    S.stats.rivalRank = Math.min(S.stats.rivalRank || 99, myRank);
    const peaceCard = peace() ? `<div class="card"><b>${icon('i-peace')} Peace Shield up</b><div class="muted small">No rival will strike for ${fmtTime(P.peaceUntil - S.time)}. Attacking anyone drops it.</div></div>`
      : `<div class="card stack"><b>${icon('i-peace')} Peace Shield</b><div class="muted small">For ${fmtTime(R.peace.secs)} no rival warband will strike at your gate. Attacking anyone drops it.</div><button class="btn ${KH.canAfford({ starglass: R.peace.starglass }) ? 'gold' : 'off'}" data-act="rivalpeace">${icon('i-gem')}${R.peace.starglass} · Raise the shield</button></div>`;
    const from = S.map.raid.from != null ? P.list[S.map.raid.from] : null;
    const strike = from ? `<p class="notice heat">${icon('i-horn')} ${esc(from.name)}'s warband is on its way to your gate: it arrives in ${fmtTime(S.map.raid.next - S.time)}.</p>` : '';
    return {
      title: 'Rival Keeps', lvl: `Rank ${myRank}`,
      body: `${intro}${strike}<div class="section-label">Standings on the Dunes · by strength</div><div class="board rival-board">${board}</div>
        <p class="muted small">Tap a keep to find it on the Dunes. Scout a keep to see its exact strength.</p>${peaceCard}
        <div class="muted small">Raids won ${S.stats.rivalWins} · lost ${S.stats.rivalLosses} · revenge taken ${S.stats.revenges} · warbands at your gate ${S.stats.struck}</div>`,
    };
  };
  ACT.rivalgo = (k) => {
    const [x, y] = String(k).split(',').map(Number);
    UI.sheet = null;
    KH.ACT.tab('world');
    if (UI.sub) UI.sub.world = 'map';
    KH.world.focus(x, y);
    ACT.wsel(k);
  };

  // for world.js, world3d.js, tests and the balance bot
  KH.rivals = { unlocked, open, byKey, peace, shielded, scouted, revenge, resolve, warband, marching, sheet, foeOf, stashOf, lvlOf,
    list: () => (S && S.rivals ? S.rivals.list : []), at: (k) => { const i = byKey(k); return i >= 0 ? S.rivals.list[i] : null; } };
})();

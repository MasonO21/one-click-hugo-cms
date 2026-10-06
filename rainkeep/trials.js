/*
 * Rainkeep: trials beyond the story. The Mirage Spire (a tower of single fights, each
 * floor with a twist) and the Dune Duels (a ladder of rival wardens, simulated like
 * the Caravan and Oasis Wars). Both add World subtabs through KH.worldTabs and use the
 * shared battle screen (KH.startBattle) and combat model (KH.teamStats, simulateBattle).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, seeded, clamp } = KH.u;
  const { UI, ACT, HERO } = KH;
  const SP = DATA.spire, DU = DATA.duels;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.spire = { floor: 1 };
    s.duels = { rank: DU.ranks, best: DU.ranks, tickets: DU.tickets, tixAt: 0, seasonEnd: DU.season, season: 1, bought: 0, milestones: [] };
    s.stats.spireWins = 0; s.stats.duelWins = 0; s.stats.duels = 0;
  });

  const oddsOf = (ours, theirs, breath) => {
    const o = ours * (1 + breath);
    return o >= theirs * 1.15 ? ['Favored', 'var(--good)', 'fav'] : o >= theirs * 0.9 ? ['Even fight', 'var(--gold)', 'even'] : ['Risky', 'var(--bad)', 'risky'];
  };
  const breathNow = () => (S.dormant ? 0 : DATA.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath')));

  // ======================================================================
  // Mirage Spire
  // ======================================================================
  const spireOpen = () => S.stage >= SP.unlockStage;
  const modOf = (f) => (f % 10 === 0 ? 'warden' : SP.cycle[(f * 7 + Math.floor(f / 10)) % SP.cycle.length]);
  function spireFoe(f) {
    const mod = modOf(f), warden = mod === 'warden';
    const r = seeded(f * 131 + 7);
    const base = SP.foes[Math.floor(r() * SP.foes.length)];
    const name = warden ? `Warden of the ${f}th Floor` : base[0];
    const cls = warden ? ['guard', 'bow', 'lancer'][Math.floor(f / 10) % 3] : base[1];
    return { n: f, name, cls, boss: warden, chapter: 'Mirage Spire', mod, ...KH.foeStats(SP.base + SP.per * f, warden ? SP.warden : 1) };
  }
  function spireTeam(foe) {
    const m = SP.mods[foe.mod];
    const troops = m.troops ? Object.fromEntries(Object.entries(KH.marchTroops()).map(([k, v]) => [k, Math.floor(v * m.troops)])) : undefined;
    return KH.teamStats(m.noCounter ? null : foe.cls, { troops, atkBonus: m.atkBonus || 0, defBonus: m.defBonus || 0 });
  }
  ACT.spire = () => {
    if (!spireOpen()) return KH.toast(`The Mirage Spire appears after you beat stage ${SP.unlockStage - 1}.`, 'warn');
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const f = S.spire.floor, foe = spireFoe(f), m = SP.mods[foe.mod], team = spireTeam(foe);
    KH.fightLive({
      title: `Mirage Spire · Floor ${f} · ${m.name}`, foe, team, opts: { noBreath: !!m.noBreath }, intro: m.desc, loseLine: 'The mirage swallows the squad and spits them out at the gate.',
      onEnd: (result) => {
        let rewards = null;
        if (result.win && S.spire.floor === f) {
          rewards = SP.rewards(f);
          KH.grant(rewards);
          S.spire.floor++;
          S.stats.spireWins++;
          KH.addPassXp(DATA.passXp.stage);
          if (KH.duty) KH.duty('spire');
        }
        KH.emit('battle', { kind: 'spire', win: result.win, foe });
        KH.emit('spire', { floor: f, win: result.win });
        KH.save();
        return { rewards };
      },
    });
  };
  function panelSpire() {
    const head = '<div class="panel-head"><h2>Mirage Spire</h2><p>A tower that is only there at noon</p></div>';
    if (!spireOpen()) {
      return `${head}<div class="card stack"><b>${icon('i-spire')}Not yet</b><p class="muted small">The Spire rises out of the Glass Sea once the Sand Colossus has fallen (beat stage ${SP.unlockStage - 1}). Every floor is a single fight with its own twist, and the first clear of each floor pays Sunsteel, Starglass and journals.</p></div>`;
    }
    const f = S.spire.floor, foe = spireFoe(f), m = SP.mods[foe.mod], team = spireTeam(foe);
    const ours = KH.statPower(team), theirs = KH.statPower(foe);
    const odds = oddsOf(ours, theirs, m.noBreath ? 0 : breathNow());
    const home = KH.squadHome();
    const base = f - ((f - 1) % 10);
    const cells = Array.from({ length: 10 }, (_, i) => {
      const n = base + i, md = modOf(n);
      return `<i class="${n < f ? 'done' : n === f ? 'cur' : ''} ${md === 'warden' ? 'boss' : ''}" title="${esc(SP.mods[md].name)}">${n}</i>`;
    }).join('');
    const nextBig = Math.ceil((f) / 10) * 10;
    return `${head}
      <div class="stage-card spire ${foe.boss ? 'boss' : ''}">
        <span class="stage-num">Floor ${f}${foe.boss ? ' · Warden' : ''}</span>
        <div class="foe">${esc(foe.name)}</div>
        <div class="mod-chip">${icon(foe.mod === 'tide' ? 'i-water' : foe.mod === 'heat' ? 'i-sun' : foe.mod === 'sandstorm' ? 'i-storm' : 'i-spire')}<b>${esc(m.name)}</b> ${esc(m.desc)}</div>
        <div class="muted small">${icon(DATA.classes[foe.cls].icon)} Fights like ${DATA.classes[foe.cls].name}s.</div>
        <div class="vs"><div class="side"><span class="muted small">Your squad</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">Floor ${f}</span><b>${fmt(theirs)}</b></div></div>
        <div class="row"><b class="grow" style="color:${odds[1]}">${odds[0]}</b></div>
        <div style="margin-top:10px"><div class="muted small" style="margin-bottom:6px">First clear: ${KH.rewardHTML(SP.rewards(f))}</div>
          <button class="btn wide ${home.length ? '' : 'off'}" data-act="spire" data-primary>${home.length ? 'Climb' : 'Squad is away on the Dunes'}</button></div>
      </div>
      <div class="section-label">Floors ${base}-${base + 9}</div><div class="stage-list">${cells}</div>
      <div class="card stack" style="margin-top:12px"><div class="row"><div class="grow"><b>Floor ${nextBig}: a Warden</b><div class="muted small">${KH.rewardHTML(SP.rewards(nextBig))}</div></div></div></div>
      <p class="muted small">Floors never reset. Losing costs nothing: grow stronger and come back. Highest floor cleared: ${f - 1}.</p>`;
  }
  KH.worldTabs.push({ id: 'spire', label: 'Spire', panel: panelSpire, dot: () => spireOpen() && KH.squadHome().length && oddsOf(KH.statPower(spireTeam(spireFoe(S.spire.floor))), KH.statPower(spireFoe(S.spire.floor)), breathNow())[2] === 'fav' });

  // ======================================================================
  // Dune Duels
  // ======================================================================
  const duelsOpen = () => S.stage >= DU.unlockStage;
  const ticketCap = () => DU.tickets + KH.bonus('tickets'); // Patron perks add ticket slots
  const rankStage = (r) => DU.lo + (DU.hi - DU.lo) * Math.pow(1 - (clamp(r, 1, DU.ranks) - 1) / (DU.ranks - 1), DU.curve);
  // A rival warden at rank r. Seeded by rank and season so the ladder holds still while you look at it.
  function rival(r) {
    const R = seeded(r * 977 + S.duels.season * 31 + 3);
    const heroes = [];
    while (heroes.length < 3) { const h = DATA.heroes[Math.floor(R() * DATA.heroes.length)].id; if (!heroes.includes(h)) heroes.push(h); }
    const lead = heroes[0];
    const name = `${DATA.names[Math.floor(R() * DATA.names.length)]} of ${DATA.keeps[Math.floor(R() * DATA.keeps.length)]}`;
    const title = DU.titles[Math.floor(R() * DU.titles.length)];
    const mult = 0.9 + R() * 0.2;
    return { n: r, name, title, cls: HERO[lead].cls, heroes, portrait: lead, boss: false, chapter: 'Dune Duels', ...KH.foeStats(rankStage(r), mult) };
  }
  // three challengers above you: a near one, an even one and a long jump
  function challengers() {
    const r = S.duels.rank;
    if (r <= 1) return [];
    const picks = [Math.max(1, r - Math.max(1, Math.round(r * 0.02))), Math.max(1, r - Math.max(2, Math.round(r * 0.06))), Math.max(1, r - Math.max(4, Math.round(r * 0.13)))];
    return [...new Set(picks)].filter((x) => x < r).map((x) => rival(x));
  }
  const nextTicket = () => (S.duels.tickets >= ticketCap() ? 0 : Math.max(0, S.duels.tixAt + DU.ticketEvery - S.time));
  function milestoneCheck() {
    for (const [rk, g] of DU.milestones) {
      if (S.duels.best <= rk && !S.duels.milestones.includes(rk)) {
        S.duels.milestones.push(rk);
        KH.grant(g);
        KH.toast(`Duel rank ${rk} reached: rewards collected.`, 'good');
      }
    }
  }
  ACT.duel = (arg) => {
    if (!duelsOpen()) return;
    const r = Number(arg), list = challengers(), idx = list.findIndex((x) => x.n === r);
    if (idx < 0) return;
    if (S.duels.tickets < 1) return KH.toast('No duel tickets left. One comes back every 12 minutes.', 'warn');
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const foe = list[idx], team = KH.teamStats(foe.cls);
    if (S.duels.tickets >= ticketCap()) S.duels.tixAt = S.time;
    S.duels.tickets--;
    S.stats.duels++;
    KH.fightLive({
      title: `Dune Duel · rank ${foe.n}`, foe, team, sideLabel: 'Your squad', intro: `${foe.title} ${foe.name} rides out to meet you.`, loseLine: `${foe.name} holds the rank. You keep yours.`, noTips: false,
      onEnd: (result) => {
        let rewards;
        if (result.win) {
          const glory = DU.winGlory[Math.min(2, idx)]; // near, even, long jump
          rewards = { glory };
          KH.grant(rewards);
          if (foe.n < S.duels.rank) S.duels.rank = foe.n;
          S.duels.best = Math.min(S.duels.best, foe.n);
          S.stats.duelWins++;
          milestoneCheck();
        } else {
          rewards = { glory: 3 };
          KH.grant(rewards);
        }
        if (KH.duty) KH.duty('duel');
        KH.emit('battle', { kind: 'duel', win: result.win, foe });
        KH.emit('duel', { win: result.win, rank: S.duels.rank });
        KH.save();
        return { rewards, resultTitle: result.win ? `Rank ${foe.n}` : null };
      },
    });
  };
  ACT.duelticket = () => {
    if (S.duels.tickets >= ticketCap()) return KH.toast('Your tickets are full.', 'warn');
    if (S.duels.bought >= DU.ticketBuys) return KH.toast('No more extra tickets this season.', 'warn');
    if (S.starglass < DU.ticketCost) return KH.toast('Not enough Starglass.', 'warn');
    S.starglass -= DU.ticketCost;
    S.duels.bought++;
    S.duels.tickets++;
    KH.emit('speedup', { starglass: DU.ticketCost });
  };
  ACT.gloryshop = (id) => {
    const it = DU.shop.find((x) => x.id === id);
    if (!it) return;
    if (S.glory < it.cost) return KH.toast('Not enough Glory.', 'warn');
    S.glory -= it.cost;
    KH.grant(it.grants);
    KH.sfx('coin');
    KH.toast('Traded for Glory.', 'good');
  };
  function endSeason() {
    const d = S.duels, row = DU.seasonGlory.find(([rk]) => d.rank <= rk);
    const glory = row ? row[1] : 0;
    KH.mail(`Dune Duels: season ${d.season} is over`, `You finished at rank ${d.rank} (best ${d.best}). The new season starts with every warden a little further down the ladder.`, { glory });
    d.season++;
    d.rank = Math.min(DU.ranks, Math.round(d.rank * DU.slip + 20));
    d.bought = 0;
    d.seasonEnd = S.time + DU.season;
  }
  KH.hooks.tick.push((dt) => {
    if (!S || !S.duels || !dt) return;
    const d = S.duels;
    if (d.tickets < ticketCap()) {
      while (d.tickets < ticketCap() && S.time - d.tixAt >= DU.ticketEvery) { d.tickets++; d.tixAt += DU.ticketEvery; }
    } else d.tixAt = S.time;
    if (duelsOpen() && S.time >= d.seasonEnd) endSeason();
    else if (!duelsOpen()) d.seasonEnd = Math.max(d.seasonEnd, S.time + DU.season);
  });

  function panelDuels() {
    const head = '<div class="panel-head"><h2>Dune Duels</h2><p>Rival wardens, one fight at a time</p></div>';
    if (!duelsOpen()) {
      return `${head}<div class="card stack"><b>${icon('i-duel')}Not yet</b><p class="muted small">Once your squad has cleared stage ${DU.unlockStage - 1}, other keeps start sending challengers. Climb a ladder of ${fmt(DU.ranks)} wardens, earn Glory and trade it for Sunsteel, speedups and shard pouches.</p></div>`;
    }
    const d = S.duels, list = challengers(), next = DU.milestones.find(([rk]) => d.best > rk);
    const nt = nextTicket();
    const cards = list.map((foe, i) => {
      const team = KH.teamStats(foe.cls), ours = KH.statPower(team), theirs = KH.statPower(foe), odds = oddsOf(ours, theirs, breathNow());
      return `<div class="card duel"><div class="duel-pt">${KH.portrait(foe.portrait)}</div>
        <div class="grow"><b>${esc(foe.name)}</b><div class="muted small">${esc(foe.title)} · rank ${foe.n} · ${icon(DATA.classes[foe.cls].icon)}${DATA.classes[foe.cls].name} lead</div>
          <div class="row small"><span>${fmt(ours)} vs ${fmt(theirs)}</span><b style="color:${odds[1]}">${odds[0]}</b><span class="chip muted small">${icon('i-glory')}${DU.winGlory[i]}</span></div></div>
        <button class="btn small ${d.tickets && KH.squadHome().length ? '' : 'off'}" data-act="duel" data-arg="${foe.n}" ${i === 0 ? 'data-primary' : ''}>Duel</button></div>`;
    }).join('') || '<p class="notice good">You hold rank 1. Every warden on the Dunes knows your name.</p>';
    const shop = DU.shop.map((it) => `<button class="card sg" data-act="gloryshop" data-arg="${it.id}">${KH.rewardHTML(it.grants)}<span class="chip">${icon('i-glory')}${it.cost}</span></button>`).join('');
    return `${head}
      <div class="card stack"><div class="row"><div class="grow"><b>Rank ${fmt(d.rank)}</b><div class="muted small">Best ${fmt(d.best)} · season ${d.season} ends in ${fmtTime(Math.max(0, d.seasonEnd - S.time))}</div></div>
        <span class="chip">${icon('i-glory')}${fmt(S.glory)}</span></div>
        <div class="row"><div class="grow small">${icon('i-duel')}<b>${d.tickets}/${ticketCap()}</b> tickets${nt ? ` · next in ${fmtTime(nt)}` : ''}</div>
        <button class="btn small alt ${d.tickets < ticketCap() && d.bought < DU.ticketBuys ? '' : 'off'}" data-act="duelticket">+1 ${icon('i-gem')}${DU.ticketCost}</button></div>
        ${next ? `<div class="muted small">Reach rank ${next[0]}: ${KH.rewardHTML(next[1])}</div>` : ''}</div>
      <div class="section-label">Challengers</div><div class="stack">${cards}</div>
      <p class="muted small">Win and you take the rival's rank. Lose and you keep yours. Pick rivals your heroes counter: a ${DATA.classes.guard.name} lead is weak to ${DATA.classes.lancer.name}s, and so on.</p>
      <div class="section-label">Glory trades</div><div class="sg-grid">${shop}</div>
      <p class="muted small">Seasons last ${fmtTime(DU.season)} of play. At the end you earn Glory by rank, and everyone slips back down the ladder a little.</p>`;
  }
  KH.worldTabs.push({ id: 'duels', label: 'Duels', panel: panelDuels, dot: () => duelsOpen() && S.duels.tickets >= ticketCap() });

  KH.trials = { spireFoe, spireTeam, modOf, rival, challengers, rankStage, spireOpen, duelsOpen };
})();

/*
 * Rainkeep Caravan: a simulated alliance. Members help your timers, fund Caravan
 * tech, share gift chests, chat, and fight the Colossus raid alongside you.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { clamp, fmt, fmtTime, icon, esc, rand, pick, sum } = KH.u;
  const CREST = { WEL: 'i-water', SUN: 'i-sun', PLM: 'i-garden' }; // each Caravan's banner
  const { UI, ACT } = KH;
  const K = DATA.caravan;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.caravan = {
      joined: null, points: 0, charges: 6, chargeT: 0, tech: {}, techXp: {}, focus: 'supply',
      members: [], chat: [], gifts: 0, nextGift: 0, nextChat: 0, requests: 0, nextReq: 0,
      helpQ: [], raid: { idx: -1, max: 0, dmg: {}, mine: 0, attacks: 0, ended: true, killed: false, start: 0 },
    };
    K.techs.forEach((t) => { s.caravan.tech[t.id] = 0; s.caravan.techXp[t.id] = 0; });
  });

  const opt = () => K.options.find((o) => o.id === S.caravan.joined);
  KH.caravanName = () => (opt() ? opt().name : 'your Caravan');
  const hallLv = () => S.lv.hall;
  const maxCharges = () => 5 + hallLv();
  const memberCount = () => S.caravan.members.length;
  const online = (m) => Math.sin(S.time / 97 + m.seed * 13) > -0.35;

  // bonuses from Caravan tech
  KH.hooks.bonus.push((k) => {
    if (!S || !S.caravan || !S.caravan.joined) return 0;
    const t = S.caravan.tech;
    if (k === 'cool') return 0.5 * t.shade;
    if (k === 'prod') return 0.03 * t.supply;
    if (k === 'troop') return 0.03 * t.banners;
    if (k === 'build') return 0.03 * t.hands;
    if (k === 'gather') return 0.05 * t.scouts;
    return 0;
  });

  // ======================================================================
  // Chat
  // ======================================================================
  const LINES = {
    idle: ["Morning all. Wells holding up?", 'Anyone else\'s wyrm blow bubbles in its sleep? Mine does.', 'Pushed another expedition stage last night!', 'Who has spare copper? Kidding. Mostly.',
      'Remember to donate, the tech bar is close.', 'That last sandstorm nearly buried us.', 'New event is up, go go go', 'Tip: drizzle on calm days, it saves a lot of water.',
      'Lancers beat archers, archers beat shields, shields beat lancers. Took me a week to learn that.', 'Found the hidden oasis ruin yesterday. Worth it.',
      'Stewards matter more than you would think.', 'Anyone tried the Glass Sea yet? My boots melted.', 'My scouts found a level 6 copper vein, go grab it if you are near.',
      "Don't forget your daily gift.", 'Raiders hit me while my troops were out gathering. Lesson learned.', '{wyrm} looks bigger every day, Warden.'],
    reply: ['Thanks!', 'On it.', 'Same to you!', 'Good luck out there.', 'Ha!', 'Agreed.', 'Keep those wells deep.', 'We got this.'],
    storm: ['{storm} on the horizon. Make those wyrms pour!', 'Fill the cisterns, everyone. {storm} incoming.', 'Watchtower says {storm}. Stay in the shade.'],
    evolve: ['Congrats on the {stage}, Warden!', 'Look at that {stage}! Beautiful.', 'Your wyrm is a {stage} now? Amazing.'],
    raidOpen: ["Colossus is up! Hit it while it's fresh.", 'Raid is open, everyone in.', 'Shade of the Colossus spotted. Three hits each, people.'],
    raidKill: ['We got it! Good work all.', 'Colossus down. Chests for everyone.', 'That was fast. Nice work, Caravan.'],
    youHit: ['Nice hit, Warden!', 'Big damage from the Warden.', 'Ooh, that one hurt it.'],
    welcome: ['Welcome to the Caravan, Warden!', 'A new keep joins the road. Welcome!', 'Welcome! Ask if you need anything.'],
    gift: ['{who} bought the {pack}. Everyone gets a gift!'],
  };
  function say(who, text, you = false) {
    S.caravan.chat.push({ who, text, t: S.time, you });
    if (S.caravan.chat.length > 40) S.caravan.chat.shift();
  }
  const fill = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (k === 'wyrm' ? S.wyrm.name : v[k] || ''));
  const randomMember = (pred = () => true) => pick(S.caravan.members.filter((m) => pred(m))) || S.caravan.members[0];
  function aiSay(kind, v) {
    if (!S || !S.caravan.joined) return;
    const m = randomMember(online);
    if (m) say(m.name, fill(pick(LINES[kind]), v));
  }
  ACT.kchat = (i) => {
    const line = K.quickChat[Number(i)];
    if (!line || !S.caravan.joined) return;
    say('You', line, true);
    S.caravan.pendingReply = S.time + rand(2, 6);
  };

  // ======================================================================
  // Joining
  // ======================================================================
  function makeMembers() {
    const names = DATA.names.slice().sort(() => Math.random() - 0.5).slice(0, K.members - 1);
    return names.map((name, i) => ({
      name, seed: Math.random(), f: rand(0.45, 1.7) * (i === 0 ? 1.4 : 1),
      rank: i === 0 ? 'R5' : i < 3 ? 'R4' : i < 7 ? 'R3' : i < 11 ? 'R2' : 'R1',
    }));
  }
  ACT.kjoin = (id) => {
    if (!S.lv.hall) return KH.toast('Build the Caravan Hall first.', 'warn');
    if (S.caravan.joined) return;
    const o = K.options.find((x) => x.id === id);
    if (!o) return;
    S.caravan.joined = id;
    S.caravan.members = makeMembers();
    S.caravan.charges = maxCharges();
    S.caravan.nextGift = S.time + rand(60, 180);
    S.caravan.nextChat = S.time + rand(8, 20);
    S.caravan.nextReq = S.time + 20;
    say(S.caravan.members[0].name, fill(pick(LINES.welcome)));
    KH.toast(`You joined ${o.name}.`, 'good');
    KH.sfx('claim');
    KH.emit('caravanJoin', { id });
  };
  ACT.kleave = () => { UI.kleave = true; };
  ACT.kleaveno = () => { UI.kleave = false; };
  ACT.kleaveyes = () => {
    UI.kleave = false;
    const keep = S.caravan.tech;
    S.caravan.joined = null;
    S.caravan.members = [];
    S.caravan.chat = [];
    S.caravan.helpQ = [];
    S.caravan.points = Math.floor(S.caravan.points / 2);
    S.caravan.tech = Object.fromEntries(Object.keys(keep).map((k) => [k, 0]));
    S.caravan.techXp = Object.fromEntries(Object.keys(keep).map((k) => [k, 0]));
    KH.toast('You left the Caravan. Half your Caravan points came with you.', '');
  };

  // ======================================================================
  // Help on timers
  // ======================================================================
  function scheduleHelps(key) {
    if (!S.caravan.joined || !S.lv.hall) return;
    const n = Math.round(Math.min(S.caravan.members.filter(online).length, 2 + hallLv()) * opt().helpMult);
    for (let i = 0; i < n; i++) S.caravan.helpQ.push({ key, at: S.time + rand(2, 28), who: randomMember().name });
  }
  KH.on('buildStart', (e) => scheduleHelps(e.plot));
  KH.on('researchStart', () => scheduleHelps('research'));
  ACT.khelp = () => {
    const n = Math.min(S.caravan.requests, 20);
    if (!n) return;
    S.caravan.requests = 0;
    S.caravan.points += 10 * n;
    KH.toast(`You helped ${n} Caravan member${n > 1 ? 's' : ''}. +${10 * n} Caravan points.`, 'good');
  };

  // ======================================================================
  // Donations + tech
  // ======================================================================
  const donateCost = () => {
    const L = S.lv.wyrm;
    return { stone: Math.round(60 * Math.pow(L, 1.35)), food: Math.round(40 * Math.pow(L, 1.35)) };
  };
  function addTechXp(id, xp) {
    const t = K.techs.find((x) => x.id === id);
    if (!t || S.caravan.tech[id] >= t.max) return false;
    S.caravan.techXp[id] += xp;
    let up = false;
    while (S.caravan.tech[id] < t.max && S.caravan.techXp[id] >= K.techXp(S.caravan.tech[id])) {
      S.caravan.techXp[id] -= K.techXp(S.caravan.tech[id]);
      S.caravan.tech[id]++;
      up = true;
    }
    if (S.caravan.tech[id] >= t.max) S.caravan.techXp[id] = 0;
    return up;
  }
  ACT.kdonate = (id) => {
    if (!S.caravan.joined) return;
    if (S.caravan.charges < 1) return KH.toast(`Out of donations. One recharges every ${K.chargeEvery}s.`, 'warn');
    const t = K.techs.find((x) => x.id === id);
    if (S.caravan.tech[id] >= t.max) return KH.toast(`${t.name} is fully researched.`, 'warn');
    const c = donateCost();
    if (!KH.canAfford(c)) return KH.toast('Not enough resources to donate.', 'warn');
    KH.pay(c);
    S.caravan.charges--;
    S.caravan.points += K.donatePoints;
    S.stats.donations++;
    const up = addTechXp(id, K.donateXp);
    KH.emit('donate', { tech: id });
    KH.sfx('coin');
    if (up) { KH.toast(`${t.name} reached level ${S.caravan.tech[id]}!`, 'good'); aiSay('reply'); }
  };
  ACT.kbuy = (id) => {
    const it = K.shop.find((x) => x.id === id);
    if (!it) return;
    if (S.caravan.points < it.cost) return KH.toast('Not enough Caravan points. Donate, help and join raids to earn more.', 'warn');
    S.caravan.points -= it.cost;
    KH.grant(it.grants);
    KH.toast(`Bought ${it.name}.`, 'good');
  };
  ACT.kgifts = () => {
    const n = S.caravan.gifts;
    if (!n) return;
    S.caravan.gifts = 0;
    const total = {};
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      const g = roll < 0.35 ? { speed5: 1 } : roll < 0.6 ? { journals: 10 + S.lv.wyrm * 2 } : roll < 0.8 ? { starglass: 20 } : roll < 0.95 ? { crate_stone: 1 } : { beacons: 1 };
      for (const [k, v] of Object.entries(g)) total[k] = (total[k] || 0) + v;
    }
    KH.grant(total);
    KH.toast(`Opened ${n} gift${n > 1 ? 's' : ''}.`, 'good');
    KH.sfx('claim');
  };

  // ======================================================================
  // Colossus raid
  // ======================================================================
  const R = K.raid;
  const raidIdx = () => Math.floor(S.time / R.every);
  const raidOpen = () => S.caravan.joined && !S.caravan.raid.ended && S.time - S.caravan.raid.start < R.open;
  function raidFoe() {
    const s = KH.foeStats(KH.stageLevel(Math.max(1, S.stage + 2)), DATA.enemy.boss);
    return { n: S.stage, name: R.boss, cls: 'guard', boss: true, chapter: KH.caravanName(), ...s };
  }
  function attackDamage() {
    const foe = raidFoe(), team = KH.teamStats(foe.cls);
    return (team.atk * 3 * team.atk) / (team.atk + foe.def * (1 - team.fx.pierce)) * 5 * (1 + team.fx.burst / 5);
  }
  function startRaid(idx) {
    const r = S.caravan.raid;
    const e = attackDamage();
    const parts = S.caravan.members.map((m) => m.f * e * R.attacks * opt().raidMult * rand(0.6, 0.95));
    r.idx = idx; r.start = idx * R.every; r.attacks = R.attacks; r.mine = 0; r.killed = false; r.ended = false;
    r.max = Math.round((e * R.attacks + sum(parts)) * rand(0.88, 1.04));
    r.dmg = {};
    S.caravan.members.forEach((m, i) => { r.dmg[m.name] = { final: parts[i], w: rand(0.8, 1.2) }; });
  }
  function membersDamage() {
    const r = S.caravan.raid;
    const p = clamp((S.time - r.start) / R.open, 0, 1);
    let tot = 0;
    for (const d of Object.values(r.dmg)) tot += d.final * Math.min(1, Math.pow(p, 0.85) * d.w);
    return tot;
  }
  const raidHp = () => Math.max(0, S.caravan.raid.max - S.caravan.raid.mine - membersDamage());
  function endRaid() {
    const r = S.caravan.raid;
    if (r.ended) return;
    r.ended = true;
    const p = clamp((S.time - r.start) / R.open, 0, 1);
    const board = Object.entries(r.dmg).map(([n, d]) => ({ name: n, dmg: d.final * Math.min(1, Math.pow(p, 0.85) * d.w) }));
    board.push({ name: 'You', dmg: r.mine, you: true });
    board.sort((a, b) => b.dmg - a.dmg);
    const rank = board.findIndex((b) => b.you) + 1;
    if (!r.mine) {
      KH.mail('Colossus raid: you missed it', `${KH.caravanName()} fought the ${R.boss} without you. ${r.killed ? 'They brought it down.' : 'It escaped.'} The next raid opens in ${fmtTime(R.every - R.open)}.`);
      return;
    }
    const row = K.raidRewards.find(([n]) => rank <= n);
    const reward = row ? { ...row[1] } : { starglass: 20 };
    if (r.killed) {
      S.stats.raidKills++;
      for (const [k, v] of Object.entries(KH.scaleReward(K.raidKillReward))) reward[k] = (reward[k] || 0) + v;
    }
    KH.mail(`Colossus raid: ${r.killed ? 'the Shade fell' : 'the Shade escaped'}`, `You placed ${rank} of ${board.length} with ${fmt(r.mine)} damage.`, reward);
  }
  ACT.kraid = () => {
    const r = S.caravan.raid;
    if (!raidOpen()) return KH.toast('The Colossus raid is not open right now.', 'warn');
    if (r.attacks < 1) return KH.toast('You have used all three attacks this raid.', 'warn');
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes.', 'warn');
    const foe = raidFoe(), team = KH.teamStats(foe.cls);
    const before = raidHp();
    const dmg = Math.min(before, attackDamage() * rand(0.9, 1.1));
    r.attacks--;
    r.mine += dmg;
    S.stats.raidAttacks++;
    S.caravan.points += 30;
    const hits = 5, rounds = [];
    let eh = before, th = team.hp;
    for (let i = 0; i < hits; i++) {
      eh = Math.max(0, eh - dmg / hits);
      th = Math.max(team.hp * 0.2, th - team.hp * 0.12);
      rounds.push({ ours: dmg / hits, theirs: team.hp * 0.12, th, eh });
    }
    const killed = eh <= 0;
    if (killed) { r.killed = true; aiSay('raidKill'); }
    else if (Math.random() < 0.6) aiSay('youHit');
    KH.emit('raidAttack', { dmg });
    KH.startBattle({
      title: `${KH.caravanName()} · Colossus raid`, foe: { ...foe, hp: Math.max(before, 1) }, team,
      result: { win: killed, rounds, breath: 0 }, intro: 'Your squad charges the Shade…',
      resultTitle: killed ? 'Colossus down!' : 'Strike landed', noTips: true, loseLine: 'The Shade staggers, but it holds.',
      extra: `You dealt ${fmt(dmg)} damage. ${r.attacks} attack${r.attacks === 1 ? '' : 's'} left. +30 Caravan points.`,
      onClose: () => { if (killed) endRaid(); },
    });
  };

  // ======================================================================
  // Tick
  // ======================================================================
  KH.hooks.tick.push((dt, offline) => {
    if (!S || !S.caravan.joined) return;
    const k = S.caravan;
    // donation charges
    if (k.charges < maxCharges()) {
      k.chargeT += dt;
      while (k.chargeT >= K.chargeEvery && k.charges < maxCharges()) { k.chargeT -= K.chargeEvery; k.charges++; }
    } else k.chargeT = 0;
    // members fund the focus tech
    let focus = k.focus;
    const ft = K.techs.find((t) => t.id === focus);
    if (!ft || k.tech[focus] >= ft.max) {
      const next = K.techs.find((t) => k.tech[t.id] < t.max);
      if (next) k.focus = focus = next.id;
    }
    if (K.techs.some((t) => t.id === focus && k.tech[focus] < t.max)) {
      if (addTechXp(focus, K.aiXpPerSecond * dt * (0.6 + memberCount() / 14)) && !offline) {
        KH.toast(`Caravan tech: ${K.techs.find((t) => t.id === focus).name} reached level ${k.tech[focus]}.`, 'good');
      }
    }
    // helps arriving
    if (k.helpQ.length) {
      const due = k.helpQ.filter((h) => S.time >= h.at);
      if (due.length) {
        k.helpQ = k.helpQ.filter((h) => S.time < h.at);
        for (const h of due) {
          const job = KH.findJob(h.key);
          if (job && job.end > S.time) KH.cutJob(job, Math.max(0.01 * (job.end - job.start), 3));
        }
        if (!offline) KH.toast(`${due[0].who}${due.length > 1 ? ` and ${due.length - 1} other${due.length > 2 ? 's' : ''}` : ''} helped your work.`, 'good', 'helps', 6);
      }
    }
    // help requests from members
    if (S.time >= k.nextReq) { k.requests = Math.min(20, k.requests + 1); k.nextReq = S.time + rand(35, 80); }
    // gift chests
    if (S.time >= k.nextGift) {
      k.gifts = Math.min(30, k.gifts + 1);
      const packs = ["Founder's Cache", 'Sandstorm Kit', 'Oasis Stipend', "Warden's War Chest", 'Growth Fund'];
      if (!offline) say(randomMember().name, fill(LINES.gift[0], { who: 'I', pack: pick(packs) }).replace('I bought', 'Just bought'));
      k.nextGift = S.time + rand(220, 420) / (opt().giftMult || 1);
    }
    // chatter
    if (!offline && S.time >= k.nextChat) {
      aiSay('idle');
      k.nextChat = S.time + rand(45, 120) / opt().chatty;
    }
    if (k.pendingReply && S.time >= k.pendingReply) { k.pendingReply = 0; aiSay('reply'); }
    // raid cycle
    const idx = raidIdx();
    if (k.raid.idx !== idx) {
      if (!k.raid.ended) endRaid();
      if (S.time - idx * R.every < R.open) {
        startRaid(idx);
        if (!offline) { aiSay('raidOpen'); KH.toast('The Colossus raid is open. Strike it with your squad.', 'good', 'raid', 30); }
      } else k.raid.idx = idx;
    }
    if (!k.raid.ended) {
      if (raidHp() <= 0 && !k.raid.killed) { k.raid.killed = true; if (!offline) aiSay('raidKill'); }
      if (k.raid.killed || S.time - k.raid.start >= R.open) endRaid();
    }
  });
  KH.on('stormSighted', (e) => { if (Math.random() < 0.7) aiSay('storm', { storm: DATA.weather[e.type].name }); });
  KH.on('evolve', (e) => aiSay('evolve', { stage: e.stage }));

  // ======================================================================
  // UI
  // ======================================================================
  KH.caravanDot = () => !!S.caravan.joined && (S.caravan.gifts > 0 || (raidOpen() && S.caravan.raid.attacks > 0) || S.caravan.requests >= 5 || S.caravan.charges >= maxCharges());
  KH.chips.push(() => (raidOpen() && S.caravan.raid.attacks > 0
    ? `<button class="qchip raid" data-act="tab" data-arg="caravan">${icon('i-sword')}Colossus raid <time>${fmtTime(R.open - (S.time - S.caravan.raid.start))}</time></button>` : ''));

  function panelJoin() {
    if (!S.lv.hall) {
      return `<div class="panel-head"><h2>Caravan</h2></div><div class="card stack"><b>No Caravan yet</b>
        <p class="muted small">A Caravan is a band of keeps that help each other: they speed up your upgrades, fund shared research, send gifts, and hunt the Colossus together. Build the Caravan Hall to join one.</p>
        <button class="btn wide ${S.lv.wyrm < DATA.plots.find((p) => p.id === 'hall').unlock ? 'off' : 'gold'}" data-act="plot" data-arg="hall">${S.lv.wyrm < 4 ? 'Caravan Hall unlocks at Rainwyrm Lv 4' : 'Build the Caravan Hall'}</button></div>`;
    }
    return `<div class="panel-head"><h2>Caravan</h2><p>Choose who you stand with.</p></div><div class="stack">${K.options.map((o) => `<div class="card stack">
      <div class="row"><span class="tagbox" title="${o.tag}">${CREST[o.tag] ? icon(CREST[o.tag]) : o.tag}</span><div class="grow"><h3>${esc(o.name)}</h3><div class="muted small">"${esc(o.motto)}"</div></div></div>
      <p class="small">${esc(o.style)}</p><button class="btn wide" data-act="kjoin" data-arg="${o.id}" data-primary>Join ${esc(o.name)}</button></div>`).join('')}</div>`;
  }

  KH.panels.caravan = () => {
    if (!S.caravan.joined) return panelJoin();
    const k = S.caravan, o = opt();
    const r = k.raid;
    const totalPower = sum(k.members.map((m) => m.f)) * KH.power() + KH.power();
    let raid;
    if (raidOpen()) {
      const hp = raidHp();
      raid = `<div class="card raid-card stack"><div class="row"><div class="grow"><span class="section-label" style="margin:0">Colossus raid · open</span><h3>${esc(R.boss)}</h3></div><time class="chip">${icon('i-clock')}${fmtTime(R.open - (S.time - r.start))}</time></div>
        <div class="bar foe"><i style="width:${(hp / r.max) * 100}%"></i></div><div class="row"><span class="grow muted small">${fmt(hp)} / ${fmt(r.max)} health · your damage ${fmt(r.mine)}</span></div>
        <button class="btn wide ${r.attacks > 0 ? '' : 'off'}" data-act="kraid" data-primary>${r.attacks > 0 ? `Attack (${r.attacks} left)` : 'No attacks left'}</button></div>`;
    } else {
      const next = R.every - (S.time % R.every);
      raid = `<div class="card raid-card"><div class="row"><div class="grow"><span class="section-label" style="margin:0">Colossus raid</span><h3>${esc(R.boss)}</h3><p class="muted small">${r.idx >= 0 ? (r.killed ? 'Brought down last time. ' : 'Escaped last time. ') : ''}Opens again in ${fmtTime(next)}. Every member gets three attacks.</p></div>${icon('i-sword')}</div></div>`;
    }
    const cost = donateCost();
    const techs = K.techs.map((t) => {
      const lvl = k.tech[t.id], need = K.techXp(lvl), xp = k.techXp[t.id], maxed = lvl >= t.max;
      return `<div class="card tech"><div class="grow"><h3>${esc(t.name)} <span class="muted small">${lvl}/${t.max}</span>${k.focus === t.id && !maxed ? ' <span class="chip small r-epic">Caravan focus</span>' : ''}</h3><div class="muted small">${esc(t.desc)}</div>
        ${maxed ? '' : `<div class="bar xp" style="margin-top:6px"><i style="width:${(xp / need) * 100}%"></i></div>`}</div>
        ${maxed ? '<span class="muted small">Max</span>' : `<button class="btn small ${k.charges < 1 || !KH.canAfford(cost) ? 'off' : ''}" data-act="kdonate" data-arg="${t.id}">Donate</button>`}</div>`;
    }).join('');
    const shop = K.shop.map((it) => `<button class="card sg" data-act="kbuy" data-arg="${it.id}">${icon((DATA.items[Object.keys(it.grants)[0]] || {}).icon || KH.ICON[Object.keys(it.grants)[0]] || 'i-gem')}<b class="small">${esc(it.name)}</b><span class="chip ${k.points < it.cost ? 'muted' : ''}">${icon('i-caravan')}${fmt(it.cost)}</span></button>`).join('');
    const members = k.members.slice().sort((a, b) => b.f - a.f).map((m) => `<div class="member"><i class="${online(m) ? 'on' : ''}"></i><b>${esc(m.name)}</b><span class="chip small">${m.rank}</span><span class="muted small">${fmt(m.f * KH.power())}</span></div>`).join('');
    const chat = k.chat.slice(-14).map((c) => `<div class="msg ${c.you ? 'you' : ''}"><b>${esc(c.who)}</b> ${esc(c.text)}</div>`).join('');
    return `<div class="panel-head"><h2>${esc(o.name)}</h2><p>[${o.tag}] "${esc(o.motto)}"</p></div>
      <div class="row wrap"><span class="chip">${icon('i-power')}${fmt(totalPower)} power</span><span class="chip">${icon('i-people')}${k.members.length + 1} members</span><span class="chip">${icon('i-caravan')}${fmt(k.points)} points</span></div>
      <div class="section-label">Raid</div>${raid}
      <div class="section-label">Help and gifts</div>
      <div class="card stack"><div class="row"><div class="grow"><b>${k.requests} help request${k.requests === 1 ? '' : 's'}</b><div class="muted small">Help members with their timers for 10 Caravan points each. Up to ${Math.round((2 + hallLv()) * o.helpMult)} members help each of your upgrades and research.</div></div><button class="btn small ${k.requests ? 'gold' : 'off'}" data-act="khelp">Help all</button></div>
        <div class="row"><div class="grow"><b>${k.gifts} gift chest${k.gifts === 1 ? '' : 's'}</b><div class="muted small">When a member makes a purchase, everyone gets a gift.</div></div><button class="btn small ${k.gifts ? 'gold' : 'off'}" data-act="kgifts">Open</button></div></div>
      <div class="section-label">Caravan tech · ${k.charges}/${maxCharges()} donations</div>
      <p class="muted small">Each donation costs ${KH.rewardHTML(cost)} and earns ${K.donatePoints} points.${k.charges < maxCharges() ? ` Next donation in ${fmtTime(K.chargeEvery - k.chargeT)}.` : ''}</p>
      <div class="stack">${techs}</div>
      <div class="section-label">Caravan shop</div><div class="sg-grid">${shop}</div>
      <div class="section-label">Chat</div>
      <div class="card chat">${chat || '<p class="muted small">Quiet in here.</p>'}</div>
      <div class="row wrap quick">${K.quickChat.map((q, i) => `<button class="btn small alt" data-act="kchat" data-arg="${i}">${esc(q)}</button>`).join('')}</div>
      <div class="section-label">Members</div><div class="card members">${members}</div>
      ${UI.kleave ? '<p class="notice">Leave the Caravan? You keep half your points but lose its tech bonuses.</p><div class="confirm-actions"><button class="btn alt" data-act="kleaveno">Stay</button><button class="btn" data-act="kleaveyes">Leave</button></div>' : '<button class="btn alt small" style="margin-top:14px" data-act="kleave">Leave Caravan</button>'}`;
  };

  KH.hooks.power.push(() => (S && S.caravan && S.caravan.joined ? sum(Object.values(S.caravan.tech)) * 50 : 0));
})();

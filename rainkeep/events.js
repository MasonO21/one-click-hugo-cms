/*
 * Rainkeep meta systems: backpack + speedups, daily duties, login calendar,
 * achievements, mail, and the rotating timed events (including Oasis Wars).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { clamp, fmt, fmtTime, icon, esc, today, rand, pick } = KH.u;
  const { HERO, UI, ACT } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.daily = { day: -1, prog: {}, pts: 0, chests: [], done: [] };
    s.login = { last: -1, count: 0 };
    s.ach = { claimed: [] };
    s.mail = [];
    s.mailSeq = 0;
    s.ev = { idx: -1, start: 0, pts: 0, claimed: [], rivals: [], bracket: '' };
  });

  // ======================================================================
  // Mail
  // ======================================================================
  KH.mail = (title, body, reward = null) => {
    S.mailSeq++;
    S.mail.unshift({ id: S.mailSeq, t: Date.now(), title, body, reward, claimed: !reward, read: false });
    if (S.mail.length > 40) S.mail.length = 40;
  };
  const mailDot = () => S.mail.some((m) => !m.read || !m.claimed);
  ACT.mailclaim = (id) => {
    const m = S.mail.find((x) => x.id === Number(id));
    if (!m || m.claimed) return;
    m.claimed = true; m.read = true;
    KH.grant(m.reward);
    KH.sfx('claim');
  };
  ACT.mailall = () => {
    let n = 0;
    for (const m of S.mail) { m.read = true; if (!m.claimed) { m.claimed = true; KH.grant(m.reward); n++; } }
    if (n) { KH.toast(`Collected ${n} attachment${n > 1 ? 's' : ''}.`, 'good'); KH.sfx('claim'); }
  };
  ACT.mailclear = () => { S.mail = S.mail.filter((m) => !m.claimed); };
  KH.sheets.mail = () => {
    S.mail.forEach((m) => { m.read = true; });
    const rows = S.mail.map((m) => `<div class="card mail ${m.claimed ? 'claimed' : ''}"><div class="row"><b class="grow">${esc(m.title)}</b><span class="muted small">${new Date(m.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
      <p class="small muted">${esc(m.body)}</p>${m.reward ? `<div class="row wrap"><div class="costs grow">${KH.rewardHTML(m.reward)}</div>${m.claimed ? '<span class="muted small">Collected</span>' : `<button class="btn small gold" data-act="mailclaim" data-arg="${m.id}">Collect</button>`}</div>` : ''}</div>`).join('');
    return {
      title: 'Mail', lvl: '',
      body: `${S.mail.length ? `<div class="row"><button class="btn small gold grow" data-act="mailall">Collect all</button><button class="btn small alt" data-act="mailclear">Delete read</button></div><div class="stack">${rows}</div>` : '<p class="muted">No mail. Event rewards and letters from your Caravan arrive here.</p>'}`,
    };
  };

  // ======================================================================
  // Backpack + speedups
  // ======================================================================
  function useItem(id, n = 1) {
    const it = DATA.items[id];
    if (!it || (S.items[id] || 0) < n) return false;
    if (it.kind === 'crate') {
      S.items[id] -= n;
      const amt = DATA.crateSize(it.res, S.lv.wyrm) * n;
      S.res[it.res] += amt;
      KH.toast(`+${fmt(amt)} ${KH.NAME[it.res]}.`, 'good');
      KH.sfx('coin');
      return true;
    }
    return false;
  }
  ACT.useitem = (arg) => {
    const [id, mode] = arg.split(':');
    const it = DATA.items[id];
    if (!it) return;
    if (it.kind === 'shards') { UI.sheet = { kind: 'pouch', id }; return; }
    if (it.kind === 'speed') return KH.toast('Use speedups from any timer: tap a building that is being upgraded.', '');
    useItem(id, mode === 'all' ? S.items[id] : 1);
  };
  ACT.pouch = (arg) => {
    const [itemId, hero] = arg.split(':');
    const it = DATA.items[itemId];
    if (!it || !(S.items[itemId] > 0) || !HERO[hero] || HERO[hero].rarity !== it.rarity) return;
    S.items[itemId]--;
    const isNew = KH.addHero(hero, it.n);
    KH.toast(isNew ? `${HERO[hero].name} joins your keep!` : `+${it.n} shards for ${HERO[hero].name}.`, 'good');
    KH.sfx(it.rarity === 'legendary' ? 'legendary' : 'recruit');
    UI.sheet = { kind: 'hero', id: hero };
  };
  KH.sheets.bag = () => {
    const ids = Object.keys(DATA.items).filter((k) => S.items[k] > 0);
    const rows = ids.map((k) => {
      const it = DATA.items[k];
      let btn = '';
      if (it.kind === 'crate') btn = `<button class="btn small" data-act="useitem" data-arg="${k}:1">Open</button>${S.items[k] > 1 ? `<button class="btn small alt" data-act="useitem" data-arg="${k}:all">All</button>` : ''}`;
      else if (it.kind === 'shards') btn = `<button class="btn small gold" data-act="useitem" data-arg="${k}">Choose hero</button>`;
      const desc = it.kind === 'crate' ? `${fmt(DATA.crateSize(it.res, S.lv.wyrm))} ${KH.NAME[it.res].toLowerCase()} each` : it.kind === 'speed' ? 'Use from any building, research or training timer' : it.desc;
      return `<div class="card bag-row">${icon(it.icon)}<div class="grow"><b>${esc(it.name)} <span class="muted">×${S.items[k]}</span></b><div class="muted small">${esc(desc)}</div></div>${btn}</div>`;
    }).join('');
    return { title: 'Backpack', lvl: '', body: rows ? `<div class="stack">${rows}</div>` : '<p class="muted">Your backpack is empty. Daily duties, events, ruins and the Caravan shop fill it up.</p>' };
  };
  KH.sheets.pouch = () => {
    const it = DATA.items[UI.sheet.id];
    const heroes = DATA.heroes.filter((h) => h.rarity === it.rarity);
    return {
      title: it.name, lvl: `×${S.items[UI.sheet.id] || 0}`,
      body: `<p class="muted small">${esc(it.desc)}</p><div class="hero-grid">${heroes.map((h) => {
        const own = S.heroes[h.id];
        return `<button class="hcard ${h.rarity}" data-act="pouch" data-arg="${UI.sheet.id}:${h.id}">${KH.portrait(h.id)}<span class="meta"><span class="nm">${esc(h.name.split(' ')[0])}</span><span class="sub"><span>${own ? `${own.shards} shards` : 'New!'}</span></span></span></button>`;
      }).join('')}</div>`,
    };
  };
  const speedItems = () => Object.keys(DATA.items).filter((k) => DATA.items[k].kind === 'speed').sort((a, b) => DATA.items[b].secs - DATA.items[a].secs);
  ACT.speedsheet = (key) => { UI.sheet = { kind: 'speed', id: key }; };
  ACT.usespeed = (arg) => {
    const [key, id] = arg.split(':');
    const job = KH.findJob(key);
    if (!job) { UI.sheet = null; return; }
    const use = (k) => { S.items[k]--; KH.cutJob(job, DATA.items[k].secs); };
    if (id === 'auto') {
      // largest items that don't overshoot, then the smallest one that finishes it
      for (const k of speedItems()) while (S.items[k] > 0 && job.end - S.time >= DATA.items[k].secs) use(k);
      if (job.end > S.time) {
        const fin = speedItems().reverse().find((k) => S.items[k] > 0 && DATA.items[k].secs >= job.end - S.time);
        if (fin) use(fin);
      }
    } else if (S.items[id] > 0) use(id);
    KH.sfx('coin');
    if (!KH.findJob(key) || job.end <= S.time) { UI.sheet = null; KH.toast('Finished!', 'good'); }
  };
  KH.sheets.speed = () => {
    const key = UI.sheet.id, job = KH.findJob(key);
    if (!job) return { title: 'Speedups', lvl: '', body: '<p class="muted">Already finished.</p>' };
    const left = job.end - S.time;
    const owned = speedItems().filter((k) => S.items[k] > 0);
    return {
      title: 'Speedups', lvl: fmtTime(left),
      body: `<div class="bar"><i style="width:${clamp((1 - left / (job.end - job.start)) * 100, 0, 100)}%"></i></div>
        ${owned.length ? `<button class="btn wide gold" data-act="usespeed" data-arg="${key}:auto">Use the best fit</button><div class="stack">${owned.map((k) => `<div class="card bag-row">${icon('i-clock')}<div class="grow"><b>${esc(DATA.items[k].name)}</b> <span class="muted">×${S.items[k]}</span></div><button class="btn small" data-act="usespeed" data-arg="${key}:${k}">Use</button></div>`).join('')}</div>` : '<p class="muted">No speedups left.</p>'}
        <button class="btn wide alt" data-act="speed" data-arg="${key}">${icon('i-gem')}${KH.speedCost(job.end)} Finish now</button>`,
    };
  };

  // ======================================================================
  // Daily duties
  // ======================================================================
  function rollDay() {
    if (S.daily.day === today()) return;
    S.daily = { day: today(), prog: {}, pts: 0, chests: [], done: [] };
  }
  function duty(id, n = 1) {
    rollDay();
    const d = DATA.duties.find((x) => x.id === id);
    if (!d || S.daily.done.includes(id)) return;
    S.daily.prog[id] = (S.daily.prog[id] || 0) + n;
    if (S.daily.prog[id] >= d.n) {
      S.daily.done.push(id);
      S.daily.pts += d.pts;
      KH.addPassXp(DATA.passXp.duty);
      KH.toast(`Duty done: ${d.text}. +${d.pts} points.`, 'good', `duty-${id}`, 2);
    }
  }
  KH.duty = duty;
  KH.on('upgrade', () => duty('upgrade'));
  KH.on('stage', () => duty('stage'));
  KH.on('beast', () => duty('beast'));
  KH.on('gatherDone', () => duty('gather'));
  KH.on('train', (e) => duty('train', e.n));
  KH.on('pull', (e) => duty('pull', e.n));
  KH.on('donate', () => duty('donate'));
  KH.on('pet', () => duty('pet'));
  KH.on('stormEnd', (e) => { if (e.clean) duty('storm'); });
  KH.on('patrol', () => duty('patrol'));
  KH.on('research', () => duty('research'));
  const dutyChestReady = () => DATA.dutyChests.some(([p], i) => S.daily.pts >= p && !S.daily.chests.includes(i));
  ACT.dutychest = (i) => {
    i = Number(i);
    rollDay();
    const c = DATA.dutyChests[i];
    if (!c || S.daily.pts < c[0] || S.daily.chests.includes(i)) return;
    S.daily.chests.push(i);
    KH.grant(c[1]);
    S.stats.dutyChests++;
    KH.toast('Duty chest opened.', 'good');
    KH.sfx('claim');
  };
  KH.sheets.duties = () => {
    rollDay();
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const chests = DATA.dutyChests.map(([p, g], i) => {
      const got = S.daily.chests.includes(i), ready = S.daily.pts >= p;
      return `<button class="chest ${got ? 'got' : ready ? 'ready' : ''}" data-act="dutychest" data-arg="${i}" aria-label="Chest at ${p} points">${icon('i-bag')}<span>${p}</span></button>`;
    }).join('');
    const rows = DATA.duties.map((d) => {
      const p = Math.min(S.daily.prog[d.id] || 0, d.n), done = S.daily.done.includes(d.id);
      return `<div class="duty ${done ? 'done' : ''}"><div class="grow"><b>${esc(d.text)}</b><div class="bar xp"><i style="width:${(p / d.n) * 100}%"></i></div></div><span class="muted small">${fmt(p)}/${fmt(d.n)}</span><span class="chip">+${d.pts}</span></div>`;
    }).join('');
    const nextChest = DATA.dutyChests.find(([p]) => S.daily.pts < p);
    return {
      title: 'Daily Duties', lvl: `${S.daily.pts} pts`,
      body: `<p class="muted small">Resets in ${fmtTime((mid - now) / 1000)}. ${nextChest ? `Next chest at ${nextChest[0]} points: ${KH.rewardHTML(nextChest[1])}` : 'Every chest is open. See you tomorrow.'}</p>
        <div class="bar"><i style="width:${Math.min(100, S.daily.pts)}%"></i></div><div class="chests">${chests}</div>
        <div class="stack">${rows}</div>`,
    };
  };

  // ======================================================================
  // Login calendar
  // ======================================================================
  const loginReady = () => S.login.last !== today();
  ACT.login = () => {
    if (!loginReady()) return;
    const g = DATA.login[S.login.count % DATA.login.length];
    S.login.last = today();
    S.login.count++;
    KH.grant(g);
    KH.toast('Daily gift collected. Come back tomorrow for the next one.', 'good');
    KH.sfx('claim');
  };
  KH.sheets.login = () => {
    const n = DATA.login.length, pos = S.login.count % n;
    const fullCycle = pos === 0 && S.login.count > 0 && !loginReady();
    const cells = DATA.login.map((g, i) => {
      const got = i < pos || fullCycle;
      const isToday = loginReady() && i === pos;
      return `<div class="day ${got ? 'got' : ''} ${isToday ? 'today' : ''}"><span>Day ${i + 1}</span><div class="costs">${KH.rewardHTML(g)}</div></div>`;
    }).join('');
    return {
      title: 'Daily Gifts', lvl: `Day ${loginReady() ? pos + 1 : pos || n}`,
      body: `<p class="muted small">One gift a day. Miss a day and nothing is lost: the calendar waits for you.</p><div class="calendar">${cells}</div>
        <button class="btn wide ${loginReady() ? 'gold' : 'off'}" data-act="login">${loginReady() ? "Collect today's gift" : 'Collected. Back tomorrow'}</button>`,
    };
  };

  // ======================================================================
  // Achievements
  // ======================================================================
  function statOf(stat) {
    switch (stat) {
      case 'wyrm': return S.lv.wyrm;
      case 'stages': return S.stage - 1;
      case 'heroes': return Object.keys(S.heroes).length;
      case 'stars': return Object.values(S.heroes).reduce((a, h) => a + h.stars, 0);
      case 'pop': return Math.max(S.pop, S.stats.maxPop || 0);
      default: return S.stats[stat] || 0;
    }
  }
  const achReady = (a) => !S.ach.claimed.includes(a.id) && statOf(a.stat) >= a.n;
  ACT.ach = (id) => {
    const a = DATA.achievements.find((x) => x.id === id);
    if (!a || !achReady(a)) return;
    S.ach.claimed.push(id);
    KH.grant(a.reward);
    KH.toast(`Achievement: ${a.text}.`, 'good');
    KH.sfx('claim');
  };
  KH.sheets.trophies = () => {
    const list = DATA.achievements.slice().sort((a, b) => (achReady(b) - achReady(a)) || (S.ach.claimed.includes(a.id) - S.ach.claimed.includes(b.id)));
    const rows = list.map((a) => {
      const got = S.ach.claimed.includes(a.id), v = Math.min(statOf(a.stat), a.n), ready = achReady(a);
      return `<div class="duty ${got ? 'done' : ''}"><div class="grow"><b>${esc(a.text)}</b><div class="bar xp"><i style="width:${(v / a.n) * 100}%"></i></div></div>
        <span class="muted small">${fmt(v)}/${fmt(a.n)}</span>${got ? '<span class="chip muted">Done</span>' : ready ? `<button class="btn small gold" data-act="ach" data-arg="${a.id}">${KH.rewardHTML(a.reward)}</button>` : `<span class="chip">${KH.rewardHTML(a.reward)}</span>`}</div>`;
    }).join('');
    return { title: 'Achievements', lvl: `${S.ach.claimed.length}/${DATA.achievements.length}`, body: `<div class="stack">${rows}</div>` };
  };

  // ======================================================================
  // Timed events
  // ======================================================================
  const EV = DATA.events;
  const cycle = () => Math.floor(S.time / EV.length);
  const evKey = (idx) => EV.rotation[((idx % EV.rotation.length) + EV.rotation.length) % EV.rotation.length];
  const bracket = () => (S.spentUsd >= 50 ? 'Patron' : S.spentUsd > 0 ? 'Supporter' : 'Free');
  function makeRivals() {
    const L = S.lv.wyrm;
    const mult = { Free: 1, Supporter: 1.15, Patron: 1.4 }[bracket()];
    const names = DATA.keeps.slice().sort(() => Math.random() - 0.5).slice(0, 9);
    const base = DATA.events.warPace(L) * (EV.length / 60) * mult;
    return names.map((n, i) => ({ name: n, final: Math.round(base * (i === 0 ? rand(1.5, 1.9) : i < 3 ? rand(0.9, 1.5) : rand(0.3, 1.2))), wob: rand(0, 6) }));
  }
  function rivalScore(r) {
    const p = clamp((S.time - S.ev.start) / EV.length, 0, 1);
    return Math.round(r.final * Math.pow(p, 1.05) * (1 + 0.04 * Math.sin(S.time / 40 + r.wob)));
  }
  function standings() {
    const list = S.ev.rivals.map((r) => ({ name: r.name, pts: rivalScore(r) }));
    list.push({ name: 'Your keep', pts: Math.round(S.ev.pts), you: true });
    return list.sort((a, b) => b.pts - a.pts);
  }
  const scaled = (g) => KH.scaleReward(g);
  function endEvent() {
    const def = EV.defs[evKey(S.ev.idx)];
    const missed = {};
    def.tiers.forEach(([p, g], i) => {
      if (S.ev.pts >= p && !S.ev.claimed.includes(i)) for (const [k, v] of Object.entries(scaled(g))) missed[k] = (missed[k] || 0) + v;
    });
    if (Object.keys(missed).length) KH.mail(`${def.name}: unclaimed rewards`, `The event ended with ${fmt(S.ev.pts)} points. Here is what you earned but didn't collect.`, missed);
    if (def.ranks && S.ev.rivals.length) {
      const st = standings();
      const rank = st.findIndex((x) => x.you) + 1;
      const row = def.ranks.find(([r]) => rank <= r);
      if (rank === 1) S.stats.warWins++;
      KH.mail(`Oasis Wars: you placed ${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'}`, `${bracket()} bracket. ${rank === 1 ? 'Your keep held the oasis this round.' : `${st[0].name} took first with ${fmt(st[0].pts)} points.`}`, row ? row[1] : null);
    }
  }
  function syncEvent(offline) {
    const c = cycle();
    if (S.ev.idx === c) return;
    const first = S.ev.idx < 0;
    if (!first && S.ev.idx < c) endEvent();
    S.ev = { idx: c, start: c * EV.length, pts: 0, claimed: [], rivals: [], bracket: bracket() };
    if (evKey(c) === 'oasis') S.ev.rivals = makeRivals();
    if (!offline && !first) KH.toast(`New event: ${EV.defs[evKey(c)].name}.`, 'good', 'event', 5);
  }
  const addPts = (key, n) => { if (S && S.ev.idx === cycle() && evKey(S.ev.idx) === key) S.ev.pts += n; };
  const TP = EV.warPoints;
  KH.on('mist', (e) => addPts('rainfest', e.seconds * (e.high ? 2 : 1)));
  KH.on('beast', (e) => { addPts('hunt', 10 * e.lvl); addPts('oasis', TP.beast * e.lvl); });
  KH.on('upgrade', (e) => { addPts('builder', 10 * e.to); addPts('oasis', TP.upgrade * e.to); });
  KH.on('research', (e) => { addPts('builder', 5 * e.to); addPts('oasis', TP.research * e.to); });
  KH.on('train', (e) => { addPts('builder', e.n / 10); addPts('oasis', TP.train * e.n); });
  KH.on('stage', () => addPts('oasis', TP.stage));
  KH.on('pull', (e) => addPts('oasis', TP.pull * e.n));
  KH.on('gatherDone', (e) => addPts('oasis', (TP.gather * e.amount) / 100));
  KH.on('raidRepelled', () => addPts('oasis', TP.raid));
  KH.on('campDestroyed', (e) => addPts('oasis', 40 * e.lvl));
  ACT.evclaim = (i) => {
    i = Number(i);
    const def = EV.defs[evKey(S.ev.idx)];
    const t = def.tiers[i];
    if (!t || S.ev.pts < t[0] || S.ev.claimed.includes(i)) return;
    S.ev.claimed.push(i);
    KH.grant(scaled(t[1]));
    KH.toast(`${def.name} reward collected.`, 'good');
    KH.sfx('claim');
  };
  const evReady = () => S.ev.idx >= 0 && EV.defs[evKey(S.ev.idx)].tiers.some(([p], i) => S.ev.pts >= p && !S.ev.claimed.includes(i));
  KH.sheets.events = () => {
    const key = evKey(S.ev.idx), def = EV.defs[key];
    const left = S.ev.start + EV.length - S.time;
    const max = def.tiers[def.tiers.length - 1][0];
    const tiers = def.tiers.map(([p, g], i) => {
      const got = S.ev.claimed.includes(i), ready = S.ev.pts >= p;
      return `<div class="duty ${got ? 'done' : ''}"><span class="chip">${fmt(p)}</span><div class="costs grow">${KH.rewardHTML(scaled(g))}</div>${got ? '<span class="muted small">Got</span>' : ready ? `<button class="btn small gold" data-act="evclaim" data-arg="${i}">Claim</button>` : icon('i-lock')}</div>`;
    }).join('');
    let board = '';
    if (def.ranks) {
      const st = standings();
      board = `<div class="section-label">${bracket()} bracket</div><div class="board">${st.map((r, i) => `<div class="${r.you ? 'you' : ''}"><span>${i + 1}</span><b>${esc(r.name)}</b><span>${fmt(r.pts)}</span></div>`).join('')}</div>
        <p class="muted small">Rank rewards: ${def.ranks.map(([r, g]) => `top ${r}: ${KH.rewardHTML(g)}`).join(' · ')}. Rewards arrive by mail when the event ends.</p>`;
    }
    const upcoming = [1, 2, 3].map((d) => `<span class="chip muted small">${EV.defs[evKey(S.ev.idx + d)].name} in ${fmtTime(left + (d - 1) * EV.length)}</span>`).join('');
    return {
      title: def.name, lvl: fmtTime(left),
      body: `<p class="muted">${esc(def.desc)}</p>
        <div class="row"><b class="grow">${fmt(S.ev.pts)} points</b></div><div class="bar"><i style="width:${Math.min(100, (S.ev.pts / max) * 100)}%"></i></div>
        <div class="stack">${tiers}</div>${board}
        <div class="section-label">Coming up</div><div class="row wrap">${upcoming}</div>`,
    };
  };

  // ======================================================================
  // Side strip on the keep screen
  // ======================================================================
  KH.side.push(
    { id: 'events', icon: 'i-event', label: 'Event', act: 'sheet', arg: 'events', dot: () => evReady(), badge: () => fmtTime(S.ev.start + EV.length - S.time) },
    { id: 'duties', icon: 'i-scroll', label: 'Duties', act: 'sheet', arg: 'duties', dot: () => { rollDay(); return dutyChestReady(); }, badge: () => `${S.daily.day === today() ? S.daily.pts : 0}/100` },
    { id: 'login', icon: 'i-calendar', label: 'Gifts', act: 'sheet', arg: 'login', dot: () => loginReady() },
    { id: 'bag', icon: 'i-bag', label: 'Bag', act: 'sheet', arg: 'bag', dot: () => false },
    { id: 'mail', icon: 'i-mail', label: 'Mail', act: 'sheet', arg: 'mail', dot: () => mailDot() },
    { id: 'trophies', icon: 'i-trophy', label: 'Trophies', act: 'sheet', arg: 'trophies', dot: () => DATA.achievements.some(achReady) },
  );

  KH.hooks.tick.push((dt, offline) => {
    if (!S) return;
    syncEvent(offline);
    if (S.pop > (S.stats.maxPop || 0)) S.stats.maxPop = S.pop;
  });
  KH.hooks.boot.push((fresh) => {
    if (fresh && !S.mail.length) {
      KH.mail('A letter from the old keepers', `If you are reading this, the egg hatched. Keep the wells deep, keep ${S.wyrm.name} watered, and watch the horizon for storms. We left you a little something to start.`, { beacons: 2, speed5: 2, journals: 20 });
    }
  });
})();

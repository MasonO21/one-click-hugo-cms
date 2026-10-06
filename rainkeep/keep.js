/*
 * Rainkeep: life in the keep. The Rainwyrm's Call the Rain ability, timed boosts,
 * surplus bubbles over production buildings, incidents (small decisions at home)
 * and travelling merchants. Plugs into core through KH.hooks, KH.ACT, KH.sheets,
 * KH.chips and KH.side like the other feature scripts; renderers read KH.keep.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { clamp, fmt, fmtTime, icon, esc, rand, pick } = KH.u;
  const { UI, ACT, PLOT, NAME, ICON } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  // Rain Lore research: faster recharge, longer showers
  const rainDur = (L) => DATA.rain.duration(L) + 2 * ((S && S.tech.rainlore) || 0);
  const rainCd = (L) => Math.round(DATA.rain.cooldown(L) * (1 - 0.04 * ((S && S.tech.rainlore) || 0)));

  KH.hooks.defaults.push((s) => {
    s.keep = {
      rainUntil: 0, rainReady: 0, buffs: [], surplus: {}, incident: null, nextIncident: 120, recent: [],
      merchant: { next: DATA.merchant.first, until: 0, offers: [] },
    };
    DATA.surplus.plots.forEach((p) => { s.keep.surplus[p] = 0; });
    s.stats.rains = 0; s.stats.surplus = 0; s.stats.incidents = 0; s.stats.trades = 0;
  });

  const quest = () => DATA.quests[S.quest];
  const questWants = (go) => { const q = quest(); return !!q && q.go === go && !q.check(S); };

  // ======================================================================
  // Timed boosts (from incidents) and the rain's effects, all through KH.bonus
  // ======================================================================
  const raining = () => !!S && S.time < S.keep.rainUntil;
  KH.hooks.bonus.push((k) => {
    if (!S || !S.keep) return 0;
    let v = 0;
    for (const b of S.keep.buffs) if (b.key === k && S.time < b.until) v += b.val;
    if (raining()) {
      const R = DATA.rain;
      if (k === 'cool') v += R.cool;
      if (k === 'outdoor') v += 1;
      if (k === 'mult_water') v += R.water - 1;
      if (k === 'heal') v += R.heal - 1;
    }
    return v;
  });
  function addBuff(b) {
    if (!b) return;
    S.keep.buffs.push({ key: b.key, val: b.val, until: S.time + b.secs, label: b.label });
  }
  const activeBuffs = () => S.keep.buffs.filter((b) => S.time < b.until);

  // ======================================================================
  // Call the Rain
  // ======================================================================
  const rainUnlocked = () => S.lv.wyrm >= DATA.rain.unlock;
  const rainLeft = () => Math.max(0, S.keep.rainReady - S.time);
  ACT.rain = () => {
    if (!rainUnlocked()) return KH.toast(`Your Rainwyrm learns to call the rain at Lv ${DATA.rain.unlock}.`, 'warn');
    if (raining()) return KH.toast('It is already raining.', 'warn');
    if (rainLeft() > 0) {
      if ((S.items.rainCharm || 0) > 0) return ACT.raincharm();
      return KH.toast(`The clouds need time to gather. Ready in ${fmtTime(rainLeft())}.`, 'warn');
    }
    startRain();
  };
  ACT.raincharm = () => {
    if (!rainUnlocked() || raining() || !(S.items.rainCharm > 0)) return;
    S.items.rainCharm--;
    startRain();
  };
  function startRain() {
    const L = S.lv.wyrm, R = DATA.rain;
    S.keep.rainUntil = S.time + rainDur(L);
    S.keep.rainReady = S.time + rainCd(L);
    const burst = KH.scaleReward({ water: R.burst });
    KH.grant(burst);
    S.stats.rains++;
    UI.petT = performance.now();
    KH.toast(`${S.wyrm.name} calls the rain! +${fmt(burst.water)} water. The wells fill and the keep cools.`, 'good');
    KH.emit('rain', { duration: rainDur(L) });
    if (KH.duty) KH.duty('rain');
  }

  // ======================================================================
  // Surplus bubbles
  // ======================================================================
  const SP = DATA.surplus;
  const surplusAmount = (pid) => {
    const b = DATA.buildings[PLOT[pid].type];
    return Math.max(10, Math.round(KH.workerRate(pid) * Math.max(1, S.workers[pid] || 0) * 60 * SP.minutes));
  };
  const bubbles = () => SP.plots.filter((p) => S.lv[p] && S.keep.surplus[p] >= 1).map((p) => ({ pid: p, res: DATA.buildings[PLOT[p].type].prod }));
  ACT.collect = (pid) => {
    if (!S.lv[pid] || !(S.keep.surplus[pid] >= 1)) return;
    const res = DATA.buildings[PLOT[pid].type].prod, n = surplusAmount(pid);
    S.res[res] += n;
    S.keep.surplus[pid] = 0;
    S.stats.surplus++;
    UI.floaters.push({ plot: pid, text: `+${fmt(n)} ${NAME[res].toLowerCase()}`, t0: performance.now() });
    KH.sfx('coin');
    KH.haptic('light');
    if (KH.duty) KH.duty('surplus');
    KH.emit('surplus', { pid, res, n });
  };
  ACT.collectall = () => { for (const b of bubbles()) ACT.collect(b.pid); };

  // ======================================================================
  // Incidents
  // ======================================================================
  const IN = Object.fromEntries(DATA.incidents.map((i) => [i.id, i]));
  const incident = () => (S.keep.incident ? IN[S.keep.incident.id] : null);
  function spawnIncident(offline) {
    const pool = DATA.incidents.filter((i) => (!i.needs || i.needs(S)) && !S.keep.recent.includes(i.id));
    if (!pool.length) return;
    const d = pick(pool);
    S.keep.incident = { id: d.id, t: S.time, outcome: null };
    S.keep.recent = [d.id, ...S.keep.recent].slice(0, 5);
    if (!offline) {
      KH.toast(`${d.name}: you're needed in the keep.`, 'good', 'incident', 4);
      KH.sfx('chime');
    }
    KH.emit('incident', { id: d.id });
  }
  const scaled = (g) => KH.scaleReward(g || {});
  const choiceOk = (c) => (!c.needs || c.needs(S)) && KH.canAfford(scaled(c.cost));
  function applyReward(rw) {
    const g = {}, notes = [];
    for (const [k, v] of Object.entries(rw)) {
      if (k === 'survivors') { const n = KH.addSurvivors(v); notes.push(n ? `${n} survivor${n > 1 ? 's' : ''} joined the keep.` : 'There was no room in the houses, so they moved on.'); }
      else if (k === 'sick') {
        const healthy = S.pop - S.sick, n = Math.min(healthy - 1, Math.round(healthy * v));
        if (n > 0) { S.sick += n; S.stats.sickTotal += n; notes.push(`${n} survivor${n > 1 ? 's' : ''} fell ill.`); }
      } else if (k === 'heal') { const n = S.sick; S.sick = 0; if (n) notes.push(`${n} sick survivor${n > 1 ? 's' : ''} recovered.`); }
      else if (k === 'troopsLost') {
        let lost = 0;
        for (const t in S.troops) { const l = Math.round(S.troops[t] * v); S.troops[t] -= l; lost += l; }
        if (lost) notes.push(`${lost} troops were lost.`);
      } else if (k === 'buff' || k === 'buff2') { addBuff(v); notes.push(`${v.label} for ${fmtTime(v.secs)}.`); }
      else if (/Cost$/.test(k)) {
        const res = k.slice(0, -4), c = Math.min(S.res[res], scaled({ [res]: v })[res]);
        S.res[res] -= c;
        notes.push(`You lost ${fmt(c)} ${NAME[res].toLowerCase()}.`);
      } else g[k] = v;
    }
    const got = scaled(g);
    KH.grant(got);
    return { reward: got, notes };
  }
  ACT.incident = () => { if (incident()) UI.sheet = { kind: 'incident' }; };
  ACT.incpick = (i) => {
    const d = incident(), inc = S.keep.incident;
    if (!d || inc.outcome) return;
    const ch = d.choices[Number(i)];
    if (!ch || !choiceOk(ch)) return KH.toast('You can\'t afford that right now.', 'warn');
    if (ch.cost) KH.pay(scaled(ch.cost));
    let x = Math.random(), out = ch.outcomes[ch.outcomes.length - 1];
    for (const o of ch.outcomes) { if (x < o.p) { out = o; break; } x -= o.p; }
    inc.outcome = { choice: ch.label, text: out.text, ...applyReward(out.reward) };
    S.stats.incidents++;
    if (KH.duty) KH.duty('incident');
    KH.addPassXp(DATA.passXp.duty);
    KH.sfx('claim');
    KH.emit('incidentDone', { id: d.id });
  };
  ACT.incdone = () => {
    S.keep.incident = null;
    S.keep.nextIncident = S.time + rand(DATA.incidentEvery[0], DATA.incidentEvery[1]);
    UI.sheet = null;
  };
  KH.sheets.incident = () => {
    const d = incident(), inc = S.keep.incident;
    if (!d) { UI.sheet = null; return { title: '', lvl: '', body: '' }; }
    if (inc.outcome) {
      const o = inc.outcome;
      return {
        title: d.name, lvl: '', noClose: true,
        body: `<p class="muted small">You chose: ${esc(o.choice)}</p><p class="lore">${esc(o.text)}</p>
          ${Object.keys(o.reward).length ? `<div class="costs">${KH.rewardHTML(o.reward)}</div>` : ''}
          ${o.notes.map((n) => `<p class="notice ${/lost|ill|−/.test(n) ? 'heat' : 'good'}">${esc(n)}</p>`).join('')}
          <button class="btn wide" data-act="incdone">Back to the keep</button>`,
      };
    }
    const where = d.at === 'gate' ? 'At the gate' : d.at === 'wyrm' ? `By ${esc(S.wyrm.name)}'s spring` : `At the ${esc(KH.plotName(d.at))}`;
    return {
      title: d.name, lvl: 'Incident',
      body: `<div class="ruin-art incident-art">${icon('i-event')}<span>${where}</span></div><p class="lore">${esc(d.text)}</p>
        <div class="stack">${d.choices.map((c, i) => {
          const cost = scaled(c.cost), ok = choiceOk(c);
          const why = c.needs && !c.needs(S) ? '<span class="muted small">Needs at least a few troops at home</span>' : '';
          return `<button class="btn wide alt choice ${ok ? '' : 'off'}" data-act="incpick" data-arg="${i}" ${i === 0 && ok ? 'data-primary' : ''}><span class="grow">${esc(c.label)}</span>${c.cost ? KH.costHTML(cost) : ''}${why}</button>`;
        }).join('')}</div>
        <p class="muted small">You can leave this for later. The next matter waits until this one is settled.</p>`,
    };
  };

  // ======================================================================
  // Travelling merchants
  // ======================================================================
  const M = DATA.merchant;
  const merchantHere = () => !!S && S.keep.merchant.until > S.time;
  function makeOffers() {
    const V = M.value, res = KH.RES.filter((r) => r !== 'copper' || S.lv.mine);
    const worth = (r) => S.res[r] * V[r];
    const byWorth = res.slice().sort((a, b) => worth(b) - worth(a));
    const offers = [];
    const swap = (give, get, q, left) => {
      const amt = KH.scaleReward({ [give]: q })[give];
      offers.push({ give: { [give]: amt }, get: { [get]: Math.round((amt * V[give] * M.rate) / V[get]) }, left });
    };
    swap(byWorth[0], byWorth[byWorth.length - 1], 1, 2);
    if (byWorth.length > 2) swap(byWorth[1], byWorth[byWorth.length - 2], 1, 1);
    const extra = Math.random() < 0.5 ? { rainCharm: 1 } : { speed5: 1 };
    offers.push({ give: { [byWorth[0]]: KH.scaleReward({ [byWorth[0]]: 1.5 })[byWorth[0]] }, get: extra, left: 1 });
    if (S.lv.wyrm >= 5 && Math.random() < 0.3) offers.push({ give: { starglass: 1600 }, get: { shard_epic: 1 }, left: 1 });
    else offers.push({ give: { food: KH.scaleReward({ food: 2 }).food }, get: { journals: 10 + 4 * S.lv.wyrm }, left: 2 });
    return offers;
  }
  function arrive(offline) {
    const m = S.keep.merchant;
    m.until = S.time + M.stay;
    m.offers = makeOffers();
    if (!offline) { KH.toast('A merchant caravan has stopped at the gate.', 'good', 'merchant', 10); KH.sfx('chime'); }
    KH.emit('merchant');
  }
  ACT.merchant = () => { if (merchantHere()) UI.sheet = { kind: 'merchant' }; };
  ACT.trade = (i) => {
    const m = S.keep.merchant, o = m.offers[Number(i)];
    if (!merchantHere() || !o || o.left < 1) return;
    if (!KH.canAfford(o.give)) return KH.toast('You don\'t have enough to trade.', 'warn');
    KH.pay(o.give);
    KH.grant(o.get);
    o.left--;
    S.stats.trades++;
    KH.sfx('coin');
    KH.toast('Trade done.', 'good');
    KH.emit('trade');
  };
  KH.sheets.merchant = () => {
    const m = S.keep.merchant;
    if (!merchantHere()) {
      return { title: 'Merchant', lvl: '', body: `<p class="muted">No merchant at the gate right now. The next caravan is expected in about ${fmtTime(Math.max(0, m.next - S.time))}.</p>` };
    }
    const rows = m.offers.map((o, i) => `<div class="card trade ${o.left < 1 ? 'sold' : ''}"><div class="costs">${KH.costHTML(o.give)}</div><span class="arrow">${icon('i-up')}</span><div class="costs grow">${KH.rewardHTML(o.get)}</div>
      ${o.left < 1 ? '<span class="muted small">Sold out</span>' : `<button class="btn small ${KH.canAfford(o.give) ? '' : 'off'}" data-act="trade" data-arg="${i}" ${i === 0 ? 'data-primary' : ''}>Trade${o.left > 1 ? ` ×${o.left}` : ''}</button>`}</div>`).join('');
    return {
      title: 'Merchant Caravan', lvl: fmtTime(m.until - S.time),
      body: `<p class="lore">Traders from the far oases, their camels heavy with goods. They'll take what you have plenty of for what you're short on.</p><div class="stack">${rows}</div>
        <p class="muted small">Merchants stay for ${fmtTime(M.stay)} and come back every ${Math.round(M.every[0] / 60)}-${Math.round(M.every[1] / 60)} minutes of play. Their prices follow what your keep has too much of.</p>`,
    };
  };

  // ======================================================================
  // Tick
  // ======================================================================
  KH.hooks.tick.push((dt, offline) => {
    if (!S || !S.keep) return;
    const k = S.keep;
    if (k.buffs.length && k.buffs.some((b) => S.time >= b.until)) k.buffs = k.buffs.filter((b) => S.time < b.until);
    if (offline || !dt) return;
    // the tutorial quest shouldn't make a new player wait out a full fill
    const fill = questWants('surplus') ? SP.fill / 10 : SP.fill;
    for (const p of SP.plots) if (S.lv[p] && (S.workers[p] || 0) > 0) k.surplus[p] = Math.min(1, (k.surplus[p] || 0) + dt / fill);
    // incidents: one at a time, and right away if the chapter quest is asking for one
    if (!k.incident && (S.time >= k.nextIncident || (questWants('sheet:incident') && S.time - (k.lastQuestSpawn || 0) > 10))) {
      if (S.seenIntro && S.quest >= 3) { k.lastQuestSpawn = S.time; spawnIncident(offline); }
      else k.nextIncident = S.time + 60;
    }
    // merchants
    const m = k.merchant;
    if (m.until && S.time >= m.until) { m.until = 0; m.offers = []; m.next = S.time + rand(M.every[0], M.every[1]); }
    if (!m.until && (S.time >= m.next || questWants('sheet:merchant'))) arrive(offline);
  });

  // ======================================================================
  // UI hooks: chips, side button, wyrm-sheet controls, quest pointer
  // ======================================================================
  KH.chips.push(() => {
    let h = '';
    if (incident() && !S.keep.incident.outcome) h += `<button class="qchip incident" data-act="incident">${icon('i-event')}${esc(incident().name)}</button>`;
    if (raining()) h += `<span class="qchip rain">${icon('i-water')}Rain <time>${fmtTime(S.keep.rainUntil - S.time)}</time></span>`;
    for (const b of activeBuffs().slice(0, 2)) h += `<span class="qchip buff ${b.val < 0 ? 'neg' : ''}">${icon('i-star')}${esc(b.label)} <time>${fmtTime(b.until - S.time)}</time></span>`;
    return h;
  });
  KH.side.push({ id: 'merchant', icon: 'i-caravan', label: 'Merchant', act: 'merchant', show: () => merchantHere(), dot: () => true, badge: () => fmtTime(S.keep.merchant.until - S.time) });

  // Extra controls on the Rainwyrm sheet (ui.js calls KH.wyrmExtras)
  KH.wyrmExtras = () => {
    const L = S.lv.wyrm, R = DATA.rain;
    let rain;
    if (!rainUnlocked()) rain = `<p class="muted small">At Lv ${R.unlock} ${esc(S.wyrm.name)} learns to <b>Call the Rain</b>: a shower that fills the wells, cools the keep and settles sandstorms.</p>`;
    else {
      const charms = S.items.rainCharm || 0;
      const btn = raining() ? `<button class="btn wide off">Raining · ${fmtTime(S.keep.rainUntil - S.time)}</button>`
        : rainLeft() > 0 ? `<button class="btn wide ${charms ? 'gold' : 'off'}" data-act="rain">${charms ? `Use a Rain Charm (${charms})` : `Clouds gathering · ${fmtTime(rainLeft())}`}</button>`
          : `<button class="btn wide gold" data-act="rain" data-primary>${icon('i-water')}Call the Rain</button>`;
      rain = `${btn}<p class="muted small">Rain lasts ${fmtTime(rainDur(L))}: +${Math.round((R.water - 1) * 100)}% water from the wells, −${R.cool}°C in the keep, no sandstorm slowdown outdoors, faster healing, and an instant ${fmt(KH.scaleReward({ water: R.burst }).water)} water. It can wake a dormant wyrm. Recharges in ${fmtTime(rainCd(L))}.</p>`;
    }
    const auto = L >= DATA.wyrm.autoMistLevel
      ? `<div class="row"><div class="grow"><b>Attuned mist</b><div class="muted small">${esc(S.wyrm.name)} pours before storms, drizzles at night and saves water when the cisterns run low.</div></div><button class="switch ${S.autoMist ? 'on' : ''}" data-act="automist" role="switch" aria-checked="${S.autoMist}" aria-label="Attuned mist"><i></i></button></div>`
      : `<p class="muted small">At Lv ${DATA.wyrm.autoMistLevel} ${esc(S.wyrm.name)} learns to set its own mist.</p>`;
    return `<div class="section-label">Call the Rain</div>${rain}${auto}`;
  };

  KH.keep = {
    raining, bubbles, rainLeft, merchantHere,
    incidentAt: () => (incident() && !S.keep.incident.outcome ? incident().at : null),
    rainK: () => (!S ? 0 : clamp(Math.min((S.keep.rainUntil - S.time) / 4, 1), 0, 1)),
    activeBuffs,
  };
})();

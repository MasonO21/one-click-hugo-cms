/*
 * Rainkeep: the Scorpion Siege, ten waves of the Scorpion host against the gate. From Rainwyrm Lv 10 a host
 * gathers in the dunes every 6 hours of keep time and camps outside the walls until you sound the horn.
 * The scouts call each wave before it comes (a sand-rat swarm, a shieldwall or camel riders, then the
 * Scorpion Captain at wave 5 and the Scorpion King at wave 10), and one tactic a wave counters it: Fire Pots
 * for a swarm, the Ballista for a shieldwall, Stakes for riders. Each siege brings only three of each, so
 * spend them where they count. The defenders' health carries from wave to wave; a lost wave costs a wall,
 * and the third breaches the gate. Every wave held pays, and the siege chest at the end grows with them.
 * Waves measure themselves against the defenders on the walls when the horn sounds (troops at home and the
 * squad heroes in the keep, never less than a foe of 70% of your expedition stage), and only those defenders
 * fight the siege out. Each wave is a live battle (KH.fightLive, with the worn health in
 * opts.startHp). Plugs into core through KH.hooks, KH.sheets, KH.side and KH.chips; town3d.js camps the host
 * outside the gate through KH.siege.view(); KH.siege.auto() plays a whole siege for tests and the balance bot.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, clamp } = KH.u;
  const { UI, ACT } = KH;
  const G = DATA.siege, F = G.foe, TAC = G.tactics, KIND = G.kinds;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.siege = { open: false, hosts: 0, acc: 0, run: null, last: null, best: 0 };
    s.stats.sieges = 0; s.stats.siegeWaves = 0; s.stats.siegeWins = 0; s.stats.kings = 0;
  });

  const pct = (v) => `${Math.round(v * 100)}%`;
  const unlocked = () => !!S && S.lv.wyrm >= G.unlock;
  const run = () => (S && S.siege ? S.siege.run : null);
  const bossOf = (w) => (w === G.waves ? 'king' : w === G.captainAt ? 'captain' : null);
  const counterOf = (kind) => Object.keys(TAC).find((t) => TAC[t].vs === kind);
  // how many waves the scouts can see: the next one, or two from Watchtower Lv 12
  const seen = (R) => R.wave + (S.lv.watchtower >= G.farSight ? 1 : 0);

  // A host gathers every 6 hours of keep time; the first is waiting the moment the siege unlocks.
  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const x = S.siege;
    if (!x.open) {
      x.open = true; x.hosts = G.cap; x.acc = 0;
      KH.mail('The Scorpion host', "Scouts at the watchtower count fires in the dunes: not a raiding party but the whole Scorpion host, with siege ladders and war camels. They will come at the gate in waves when you sound the horn, and the scouts will call each wave before it comes. Fire Pots for a swarm, the Ballista for a shieldwall, Stakes for riders. Hold all ten and the Scorpion King comes himself. A new host gathers every 6 hours.");
      KH.emit('siegeOpen', {});
      return;
    }
    // no raiding party tries the walls while the host is attacking them
    if (x.run && S.map.raid.next > 0 && S.map.raid.next - S.time < 60) S.map.raid.next = S.time + 60;
    if (x.hosts >= G.cap) { x.acc = 0; return; }
    x.acc += dt;
    while (x.acc >= G.every && x.hosts < G.cap) { x.acc -= G.every; x.hosts++; }
    if (x.hosts >= G.cap) x.acc = 0;
  });

  // ======================================================================
  // The waves
  // ======================================================================
  function makeWaves() {
    const kinds = Object.keys(G.odds), total = kinds.reduce((a, k) => a + G.odds[k], 0), out = [];
    const roll = () => { let v = Math.random() * total; for (const k of kinds) { v -= G.odds[k]; if (v < 0) return k; } return kinds[0]; };
    for (let w = 1; w <= G.waves; w++) {
      let k = roll();
      // never three of a kind in a row
      for (let i = 0; i < 6 && w > 2 && out[w - 2] === k && out[w - 3] === k; i++) k = roll();
      out.push(k);
    }
    return out;
  }
  // the defenders on the walls when the horn sounds: what the host measures itself against, never less than a
  // foe of G.floor of your expedition stage
  function onWalls() {
    const t = KH.teamStats(null, { troops: { ...S.troops }, heroes: KH.squadHome() }), fl = KH.foeStats(Math.max(2, S.stage * G.floor));
    return { atk: Math.max(t.atk, fl.atk), def: Math.max(t.def, fl.def), hp: Math.max(t.hp, fl.hp) };
  }
  // only those defenders fight the siege out: troops trained since stay in the barracks, and anyone who
  // marches off leaves the wall short
  function defenders() {
    const R = run(), home = KH.squadHome(), troops = {};
    for (const k in R.troops) troops[k] = Math.min(R.troops[k], S.troops[k] || 0);
    return { troops, heroes: R.heroes.filter((id) => home.includes(id)) };
  }
  function foeAt(w, pick) {
    const R = run(), kind = R.kinds[w - 1], K = KIND[kind], boss = bossOf(w), T = pick && TAC[pick];
    const m = (F.start + F.per * (w - 1)) * (boss ? F[boss] : 1);
    let atk = R.base.atk * m * K.atk, def = R.base.def * m * K.def;
    const hp = R.base.hp * m * K.hp;
    if (T && T.vs === kind) { if (T.def) def *= T.def; if (T.foeAtk) atk *= T.foeAtk; }
    const name = boss === 'king' ? 'The Scorpion King' : boss === 'captain' ? 'Scorpion Captain' : K.name;
    return { n: S.stage, name, cls: K.cls, boss: !!boss, kind, chapter: 'The Scorpion Siege', atk, def, hp };
  }
  function teamFor(foe, pick) {
    const R = run(), T = pick && TAC[pick];
    const wall = G.wall * S.lv.watchtower + (R.cauldrons ? G.cauldronBonus : 0);
    const tAtk = T ? (T.vs === foe.kind ? T.atk || 0 : G.offAtk) : 0;
    return KH.teamStats(foe.cls, { ...defenders(), atkBonus: wall + tAtk, defBonus: wall });
  }
  function odds(w, pick) {
    const R = run(), foe = foeAt(w, pick), t = teamFor(foe, pick);
    const breath = S.dormant ? 0 : DATA.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath'));
    const ours = KH.statPower({ atk: t.atk, def: t.def, hp: t.hp * R.hp }) * (1 + breath), theirs = KH.statPower(foe);
    return ours >= theirs * 1.15 ? 'fav' : ours >= theirs * 0.9 ? 'even' : 'risky';
  }
  const ODDS = { fav: 'Favored', even: 'Even', risky: 'Risky' };

  function endSiege(why) {
    const R = run(), d = R.held, king = R.king;
    const rewards = KH.scaleReward(G.chest(d, king));
    for (const k of Object.keys(rewards)) if (!rewards[k]) delete rewards[k];
    if (d) KH.grant(rewards);
    S.siege.best = Math.max(S.siege.best, d);
    S.stats.sieges++;
    if (d >= G.waves) S.stats.siegeWins++;
    if (king) S.stats.kings++;
    S.siege.last = { d, king, why, rewards: d ? rewards : {}, walls: R.walls };
    S.siege.run = null;
    KH.emit('siege', { d, king, why });
    return d ? rewards : {};
  }

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.siege = () => { UI.sheet = { kind: 'siege' }; };
  ACT.siegestart = () => {
    if (!unlocked()) return KH.toast(`The Scorpion host comes once your Rainwyrm reaches Lv ${G.unlock}.`, 'warn');
    if (run()) return;
    if (S.siege.hosts < 1) return KH.toast(`No host is camped outside. The next gathers in ${fmtTime(G.every - S.siege.acc)}.`, 'warn');
    S.siege.hosts--;
    S.siege.run = { wave: 1, hp: 1, walls: G.walls, held: 0, king: false, kinds: makeWaves(), pick: null, cauldrons: false, bought: 0,
      stock: Object.fromEntries(Object.keys(TAC).map((t) => [t, G.stock])), results: [], note: '', quit: false, base: onWalls(), troops: { ...S.troops }, heroes: KH.squadHome() };
    S.siege.last = null;
    UI.siegeAt = performance.now();
    KH.sfx('raid');
    KH.toast('The horn sounds from the walls. The Scorpion host is coming!', 'warn', 'horn', 3);
    KH.emit('siegeStart', {});
  };
  ACT.siegepick = (t) => {
    const R = run();
    if (!R || !TAC[t]) return;
    if (R.pick === t) { R.pick = null; return; }
    if (R.stock[t] < 1) return KH.toast(`No ${TAC[t].name} left for this siege.`, 'warn');
    R.pick = t;
    KH.sfx('tap');
  };
  ACT.siegebuy = (t) => {
    const R = run();
    if (!R || !TAC[t]) return;
    if (R.bought >= G.extra.max) return KH.toast(`The armoury is bare: ${G.extra.max} extra a siege.`, 'warn');
    const cost = { starglass: G.extra.starglass };
    if (!KH.canAfford(cost)) return KH.toast('Not enough Starglass.', 'warn');
    KH.pay(cost);
    R.stock[t]++; R.bought++; R.pick = t;
    KH.sfx('coin');
  };
  ACT.siegepour = () => {
    const R = run();
    if (!R || R.cauldrons) return;
    const cost = KH.scaleReward(G.cauldrons);
    if (!KH.canAfford(cost)) return KH.toast('Not enough water to spare for the cauldrons.', 'warn');
    KH.pay(cost);
    R.cauldrons = true;
    KH.sfx('build');
    KH.toast(`Cauldrons of boiling water stand ready on the walls: +${pct(G.cauldronBonus)} attack and defense for the whole siege.`, 'good');
  };
  ACT.siegego = () => {
    const R = run();
    if (!R) return;
    const w = R.wave, pick = R.pick && R.stock[R.pick] > 0 ? R.pick : null;
    const foe = foeAt(w, pick), team = teamFor(foe, pick), boss = bossOf(w);
    R.quit = false;
    KH.fightLive({
      title: `The Scorpion Siege · wave ${w} of ${G.waves}`, foe, team, opts: { startHp: R.hp * team.hp },
      sideLabel: 'Your defenders',
      intro: boss === 'king' ? 'A horn like a dying camel. The Scorpion King rides to the gate himself, his guard around him.'
        : boss === 'captain' ? 'The Scorpion Captain leads this wave, roaring orders over the drums.'
        : `${KIND[foe.kind].name} at the gate!${pick ? ` ${TAC[pick].name} ready on the walls.` : ''}`,
      loseLine: R.walls > 1 ? 'They break through the outer gate. The defenders fall back to the inner wall.' : 'The gate gives way. The host pours into the keep, and the siege is lost.',
      onEnd: (result) => {
        if (run() !== R) return {};
        if (pick) R.stock[pick]--;
        R.pick = null;
        let rewards = {}, extra = '';
        if (result.win) {
          R.held++; S.stats.siegeWaves++;
          rewards = KH.scaleReward(G.wave);
          if (boss === 'captain') for (const [k, v] of Object.entries(KH.scaleReward(G.captainGift))) rewards[k] = (rewards[k] || 0) + v;
          if (boss === 'king') R.king = true;
          KH.grant(rewards);
          R.hp = clamp(result.th / team.hp + G.rest + G.restPer * S.lv.infirmary, 0.05, 1);
          R.note = boss === 'king' ? 'The Scorpion King falls from his camel, and the host breaks and runs for the deep desert.' : `Wave ${w} held. The healers move along the wall.`;
          KH.emit('siegeWave', { w, boss });
          if (KH.duty) KH.duty('siege');
        } else {
          R.walls--;
          R.hp = Math.max(result.th / team.hp, G.rally);
          R.note = R.walls > 0 ? `Wave ${w} broke through the outer gate. ${R.walls === 1 ? 'One wall left.' : `${R.walls} walls left.`}` : '';
        }
        R.results.push(result.win ? 1 : 0);
        R.wave++;
        KH.emit('battle', { kind: 'siege', win: result.win, foe });
        if (R.wave > G.waves || R.walls <= 0) {
          const chest = endSiege(R.walls <= 0 ? 'breached' : 'done');
          for (const [k, v] of Object.entries(chest)) rewards[k] = (rewards[k] || 0) + v;
          extra = R.walls <= 0 ? `The walls are breached after ${R.held} wave${R.held === 1 ? '' : 's'} held. The siege chest holds what you won.` : R.king ? 'The siege is broken! The siege chest is yours.' : 'The host draws off into the dunes. The siege chest holds what you won.';
        }
        UI.siegeAt = performance.now();
        KH.queueSheet({ kind: 'siege' });
        KH.save();
        return { rewards: Object.keys(rewards).length ? rewards : null, extra };
      },
    });
  };
  ACT.siegequit = (arg) => {
    const R = run();
    if (!R) return;
    if (arg !== 'yes') { R.quit = !R.quit; return; }
    endSiege('left');
    KH.toast('The defenders let the host go. It draws off into the dunes.', '');
  };
  ACT.siegedone = () => { S.siege.last = null; };

  // ======================================================================
  // The sheet
  // ======================================================================
  const kindName = (k) => KIND[k].name;
  function ladder(R) {
    const cells = [];
    for (let w = 1; w <= G.waves; w++) {
      const boss = bossOf(w), known = w <= seen(R), res = R.results[w - 1];
      const cls = `sg-wave${boss ? ` ${boss}` : ''}${res === 1 ? ' held' : res === 0 ? ' lost' : w === R.wave ? ' next' : ''}`;
      const inner = res != null ? icon(res ? 'i-check' : 'i-sword') : known ? icon(KIND[R.kinds[w - 1]].icon) : '<b>?</b>';
      cells.push(`<div class="${cls}" title="${known ? esc(kindName(R.kinds[w - 1])) : 'Not yet scouted'}"><span class="sg-n">${w}</span>${inner}${boss ? `<i class="sg-crown">${icon(boss === 'king' ? 'i-scorpking' : 'i-star')}</i>` : ''}</div>`);
    }
    return `<div class="sg-ladder">${cells.join('')}</div>`;
  }
  function walls(R) {
    return `<span class="sg-walls" aria-label="${R.walls} walls left">${Array.from({ length: G.walls }, (_, i) => `<i class="${i < R.walls ? 'up' : 'down'}">${icon('i-walls')}</i>`).join('')}</span>`;
  }
  function tacticRow(R, kind) {
    return Object.entries(TAC).map(([t, T]) => {
      const n = R.stock[t], on = R.pick === t, counter = T.vs === kind;
      if (n < 1) {
        const can = R.bought < G.extra.max;
        return `<button class="sg-tac empty${counter ? ' counter' : ''}${can ? '' : ' off'}" data-act="siegebuy" data-arg="${t}">${icon(T.icon)}<b>${esc(T.name)}</b><small>${can ? `${icon('i-gem')}${G.extra.starglass}` : 'none left'}</small></button>`;
      }
      return `<button class="sg-tac${on ? ' on' : ''}${counter ? ' counter' : ''}" data-act="siegepick" data-arg="${t}" aria-pressed="${on}">${icon(T.icon)}<b>${esc(T.name)}</b><small>×${n}</small></button>`;
    }).join('');
  }
  KH.sheets.siege = () => {
    const intro = KH.art.banner('event', 'siege', 'Ten waves of the Scorpion host against the gate. The scouts call each wave before it comes; counter it from the walls, and hold for the Scorpion King.');
    if (!unlocked()) return { title: 'Scorpion Siege', lvl: 'Locked', body: `${intro}<div class="card"><p>${icon('i-lock')} The Scorpion host comes once your Rainwyrm reaches Lv ${G.unlock}.</p></div>` };
    const R = run(), x = S.siege;
    if (!R) {
      const L = x.last;
      const last = L ? `<div class="card stack sg-last"><b>${L.king ? 'The siege is broken: the Scorpion King is dead!' : L.why === 'breached' ? `The walls fell after ${L.d} wave${L.d === 1 ? '' : 's'} held.` : L.why === 'left' ? `You let the host go after ${L.d} wave${L.d === 1 ? '' : 's'}.` : `The host drew off after ${L.d} waves.`}</b>
        ${Object.keys(L.rewards).length ? `<div class="costs">${KH.rewardHTML(L.rewards)}</div>` : ''}</div>` : '';
      const chest = KH.scaleReward(G.chest(G.waves, true));
      const away = KH.squadHome().length < S.squad.length || (S.map.marches || []).some((m) => m.troops && Object.values(m.troops).some((v) => v > 0));
      return {
        title: 'Scorpion Siege', lvl: `Best: ${x.best ? `${x.best} wave${x.best === 1 ? '' : 's'}` : '—'}`,
        body: `${intro}${last}
          <div class="card stack"><div class="row"><div class="grow"><b>${x.hosts ? 'A Scorpion host is camped outside the walls' : 'No host in sight'}</b><div class="muted small">${x.hosts >= G.cap ? 'It waits for your horn.' : `A new host gathers every 6 hours. Next in ${fmtTime(G.every - x.acc)}.`}</div></div>${icon('i-horn', 'sg-horn')}</div>
            <p class="muted small">Ten waves, each called by the scouts before it comes. Pick a tactic for each: ${Object.values(TAC).map((T) => `<b>${esc(T.name)}</b> against ${esc(kindName(T.vs).toLowerCase())}s`).join(', ')}. You have ${G.stock} of each. Your defenders' health carries from wave to wave, and three lost waves breach the gate. Hold all ten for the whole siege chest:</p>
            <div class="row sg-chest">${icon('i-siegechest')}<div class="costs grow">${KH.rewardHTML(chest)}</div></div>
            ${away ? `<p class="notice heat small">${icon('i-flag')} Only the troops at home and the heroes in the keep man the walls. Troops out on the Dunes miss the siege.</p>` : ''}
            <button class="btn wide ${x.hosts >= 1 ? 'gold' : 'off'}" data-act="siegestart" data-primary>${icon('i-horn')}Sound the horn</button></div>
          <div class="muted small">Sieges ${S.stats.sieges} · waves held ${S.stats.siegeWaves} · Scorpion Kings slain ${S.stats.kings}</div>`,
      };
    }
    const w = R.wave, kind = R.kinds[w - 1], K = KIND[kind], boss = bossOf(w), pick = R.pick && R.stock[R.pick] > 0 ? R.pick : null;
    const o = odds(w, pick), hpCls = R.hp < 0.35 ? 'low' : R.hp < 0.65 ? 'mid' : '';
    const counter = counterOf(kind);
    const after = w < G.waves && w + 1 <= seen(R) ? `<div class="muted small">After it, the scouts see: <b>${esc(kindName(R.kinds[w]))}</b>${bossOf(w + 1) ? (bossOf(w + 1) === 'king' ? ' with the Scorpion King' : ' with the Captain') : ''}.</div>` : '';
    const chestNow = KH.scaleReward(G.chest(R.held, false));
    for (const k of Object.keys(chestNow)) if (!chestNow[k]) delete chestNow[k];
    const cost = KH.scaleReward(G.cauldrons);
    return {
      title: 'Scorpion Siege', lvl: `Wave ${w}/${G.waves}`,
      body: `<div class="card stack sg-head"><div class="row"><div class="grow"><b>Defenders</b><div class="bar cx-hp ${hpCls}"><i style="width:${R.hp * 100}%"></i></div></div><span class="cx-hpn">${pct(R.hp)}</span>${walls(R)}</div>
          ${ladder(R)}</div>
        ${R.note ? `<p class="cx-note">${esc(R.note)}</p>` : ''}
        <div class="card stack sg-next ${boss || ''}"><div class="row">${icon(K.icon, 'sg-kind')}<div class="grow"><div class="section-label">Wave ${w}${boss ? (boss === 'king' ? ' · the Scorpion King' : ' · the Captain') : ''}</div><b>${esc(K.name)}</b><div class="muted small">${esc(K.desc)}</div></div><span class="cx-odds ${o}">${ODDS[o]}</span></div>
          ${after}
          <div class="section-label">Tactic for this wave${counter ? ` · ${esc(TAC[counter].name)} counters it` : ''}</div>
          <div class="sg-tacs">${tacticRow(R, kind)}</div>
          <div class="muted small">${pick ? esc(TAC[pick].vs === kind ? TAC[pick].desc : `${TAC[pick].name} against ${K.name.toLowerCase()}: only +${pct(G.offAtk)} attack.`) : 'No tactic: the defenders fight it plain.'}</div>
          <button class="btn wide gold" data-act="siegego" data-primary>${icon('i-sword')}Face wave ${w}</button></div>
        ${R.cauldrons ? `<p class="muted small">${icon('i-water')} Cauldrons ready: +${pct(G.cauldronBonus)} attack and defense for the whole siege.</p>` : `<button class="btn small alt" data-act="siegepour">${icon('i-water')}Boil water for the walls · ${KH.rewardHTML(cost)} · +${pct(G.cauldronBonus)} for the whole siege</button>`}
        <div class="row cx-foot"><span class="grow muted small">${R.held ? `Letting them go now keeps: ${KH.rewardHTML(chestNow)}` : 'Hold a wave to start filling the siege chest.'}</span>
          ${R.quit ? '<button class="btn small" data-act="siegequit" data-arg="yes">Let them go</button><button class="btn small alt" data-act="siegequit">Fight on</button>' : '<button class="btn small alt" data-act="siegequit">Let them go…</button>'}</div>`,
    };
  };

  // the side rail while a host is camped outside or the siege is on, and the Play hub always
  KH.side.push({ id: 'siege', icon: 'i-horn', label: 'Siege', act: 'siege', show: () => unlocked() && (!!run() || S.siege.hosts > 0),
    dot: () => !run() && S.siege.hosts > 0, badge: () => (run() ? `Wave ${run().wave}` : '') });
  KH.side.push({ id: 'siegehall', icon: 'i-horn', label: 'Siege', act: 'siege', show: unlocked,
    dot: () => !run() && S.siege.hosts > 0, badge: () => (run() ? `Wave ${run().wave}` : `${S.siege.hosts}/${G.cap}`) });
  KH.chips.push(() => (run() ? `<button class="qchip raid" data-act="siege">${icon('i-horn')}Siege · wave ${run().wave}/${G.waves}</button>` : ''));

  // the camped host in the 3D keep: 0.8 of the way to the gate while it waits, at the gate once the horn
  // sounds, and pulled back a little after each wave so the next one can be seen coming
  const view = () => {
    if (!unlocked()) return null;
    if (run()) {
      const since = UI.siegeAt ? (performance.now() - UI.siegeAt) / 1000 : 9;
      return clamp(0.86 + since * 0.035, 0.86, 1);
    }
    return S.siege.hosts > 0 ? 0.78 : null;
  };

  // ======================================================================
  // Auto play, for tests and the balance bot: counter every wave it can, cauldrons when water allows,
  // and an extra tactic for the Captain or the King when Starglass is plentiful
  // ======================================================================
  function autoRun(opts = {}) {
    ACT.siegestart();
    const R0 = run();
    if (!R0) return null;
    const cost = KH.scaleReward(G.cauldrons);
    if (opts.cauldrons !== false && KH.canAfford(cost) && S.res.water > cost.water * 4) ACT.siegepour();
    for (let guard = 0; guard < G.waves + 2 && run() === R0; guard++) {
      const R = run(), kind = R.kinds[R.wave - 1], c = counterOf(kind), boss = bossOf(R.wave);
      if (opts.tactics === false) R.pick = null;
      else if (R.stock[c] > 0) R.pick = c;
      else if (boss && opts.buy && S.starglass >= opts.buy + G.extra.starglass) ACT.siegebuy(c);
      else R.pick = boss ? Object.keys(TAC).find((t) => R.stock[t] > 0) || null : null;
      const quick = KH.quickBattles; KH.quickBattles = true;
      ACT.siegego();
      KH.quickBattles = quick;
      UI.battle = null; const el = document.getElementById('battle'); if (el) el.hidden = true;
      UI.sheet = null; UI.sheetQueue = UI.sheetQueue.filter((s) => s.kind !== 'siege');
    }
    return S.siege.last;
  }

  KH.siege = { unlocked, run, view, auto: autoRun, foeAt, teamFor, odds, makeWaves, hosts: () => (S ? S.siege.hosts : 0) };
})();

/*
 * Rainkeep: Stage Stars. Every story stage (1 to 150) holds three stars: one for the victory, one for ending the
 * fight with the squad at half its health or more (Unbroken), and one for winning within five rounds (Swift). A
 * first clear at the edge of the squad's strength rarely takes all three, so any cleared stage can be fought again
 * from the chapter's stage list for the stars it is missing: no rewards but the stars, and no limit.
 * Each chapter's thirty stars fill three chests. The live battle is where the last stars are won: the breath into a
 * wind-up, a Mend before the squad drops below half, a Sunder against armor. First clears report through
 * KH.stageStars (core.js, ACT.fight); replays are fought here; the stage list on the Expedition tab comes from
 * KH.starList, and the Rewards hub has a sheet of every chapter's chests.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const T = DATA.stars, NAMES = ['Victory', 'Unbroken', 'Swift'];
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.stars = { by: {}, chests: {}, upTo: 0 };
    s.stats.stars = 0; s.stats.starChests = 0; s.stats.starReplays = 0; s.stats.starFull = 0;
  });

  const count = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
  const of = (n) => S.stars.by[n] || 0;
  const story = (n) => n >= 1 && n <= DATA.finalStage;
  const swiftOf = () => T.swift;
  // the story chapters, each with its first and last stage
  const CH = DATA.chapters.filter((c) => c.from <= DATA.finalStage).map((c, i, a) => ({ from: c.from, to: (a[i + 1] ? a[i + 1].from : DATA.finalStage + 1) - 1, name: c.name }));
  const chOf = (n) => CH.filter((c) => n >= c.from).pop();
  const chStars = (c) => { let t = 0; for (let s = c.from; s <= c.to; s++) t += count(of(s)); return t; };
  const chMax = (c) => 3 * (c.to - c.from + 1);
  const claimed = (c) => S.stars.chests[c.from] || 0; // a bitmask over the three chests
  const ready = (c) => { const t = chStars(c), k = claimed(c); return T.chests.map(([need], i) => t >= need && !(k & (1 << i))); };
  const anyReady = () => !!S && CH.some((c) => ready(c).some(Boolean));
  const readyCount = () => (S ? CH.reduce((a, c) => a + ready(c).filter(Boolean).length, 0) : 0);

  // the stars a battle earned: 1 victory, 2 unbroken, 4 swift
  function earned(n, result, team) {
    if (!result.win) return 0;
    let m = 1;
    if (result.th / Math.max(1, team.hp) >= T.unbroken) m |= 2;
    if (result.rounds.length <= swiftOf(n)) m |= 4;
    return m;
  }
  function record(n, m) {
    const was = of(n), now = was | m, got = count(now) - count(was);
    if (!got) return 0;
    S.stars.by[n] = now;
    S.stats.stars += got;
    if (count(now) === 3) S.stats.starFull++;
    KH.emit('stars', { n, got });
    return got;
  }
  // a line for the battle's result: which stars it took and which are new
  function line(n, m, got) {
    const all = of(n);
    const pips = NAMES.map((name, i) => `<span class="st-res ${m & (1 << i) ? 'on' : ''}">${icon('i-star')}${name}</span>`).join('');
    return `<span class="st-line">${pips}</span>${got ? `<br>${got} new star${got === 1 ? '' : 's'} · stage ${n} has ${count(all)} of 3` : count(all) === 3 ? '<br>All three stars on this stage' : ''}`;
  }
  // first clears (core.js): the stars count as they would on a replay
  KH.stageStars = (n, result, team) => {
    if (!S || !story(n) || !result.win) return '';
    const m = earned(n, result, team);
    return line(n, m, record(n, m));
  };
  // every stage already cleared has at least its victory star (old saves, and any clear that came another way)
  KH.hooks.tick.push(() => {
    if (!S || !S.stars) return;
    const top = Math.min(S.stage - 1, DATA.finalStage);
    while (S.stars.upTo < top) { S.stars.upTo++; record(S.stars.upTo, 1); }
  });

  const pips = (n, cls = '') => `<span class="st-pips ${cls}">${[0, 1, 2].map((i) => `<b class="${of(n) & (1 << i) ? 'on' : ''}"></b>`).join('')}</span>`;
  KH.starPips = pips;

  ACT.starstage = (n) => { n = +n; if (!story(n) || n >= S.stage) return; UI.sheet = { kind: 'starstage', n }; };
  ACT.starfight = (n) => {
    n = +n;
    if (!story(n) || n >= S.stage || count(of(n)) === 3) return;
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const foe = KH.enemyFor(n), team = KH.teamStats(foe.cls);
    UI.sheet = null;
    KH.fightLive({
      title: `Stage ${n} · for the stars`, foe, team,
      onEnd: (result) => {
        const m = earned(n, result, team), got = record(n, m);
        S.stats.starReplays++;
        KH.emit('battle', { kind: 'replay', win: result.win, foe });
        KH.save();
        return { rewards: null, noTips: !!result.win, extra: result.win ? line(n, m, got) : '' };
      },
    });
  };
  ACT.starchest = (arg) => {
    const [from, i] = String(arg).split(':').map(Number), c = CH.find((x) => x.from === from);
    if (!c || !ready(c)[i]) return;
    S.stars.chests[from] = claimed(c) | (1 << i);
    S.stats.starChests++;
    const g = KH.scaleReward(T.chests[i][1]);
    KH.grant(g);
    KH.sfx('claim');
    KH.toast(`${c.name}: the ${T.chests[i][0]}-star chest.`, 'good');
    KH.save();
  };
  // browse the chapters on the Expedition tab
  ACT.starch = (d) => {
    const cur = chOf(Math.min(S.stage, DATA.finalStage)), at = CH.indexOf(chOf(UI.starCh || cur.from));
    const i = Math.max(0, Math.min(CH.indexOf(cur), at + Number(d)));
    UI.starCh = CH[i].from;
  };
  ACT.stars = () => { UI.sheet = { kind: 'stars' }; };
  // a new stage cleared: the stage list goes back to the chapter being fought
  KH.on('stage', () => { UI.starCh = null; });
  ACT.starsgo = (from) => { UI.starCh = +from; UI.sheet = null; KH.UI.tab = 'world'; KH.UI.sub.world = 'expedition'; };

  const chests = (c) => {
    const r = ready(c), k = claimed(c), t = chStars(c);
    return T.chests.map(([need], i) => {
      const got = k & (1 << i);
      return r[i] ? `<button class="st-chest ready" data-act="starchest" data-arg="${c.from}:${i}" aria-label="Open the ${need}-star chest">${icon('i-chest')}<small>${need}</small></button>`
        : `<span class="st-chest ${got ? 'got' : t >= need ? '' : 'locked'}" title="${need} stars">${icon(got ? 'i-check' : 'i-chest')}<small>${need}</small></span>`;
    }).join('');
  };
  // the chapter's stage list with each cleared stage's stars, a way to fight it again, and the chapter's chests
  KH.starList = (curFrom) => {
    const cur = chOf(curFrom), sel = UI.starCh && UI.starCh <= cur.from ? chOf(UI.starCh) : cur;
    const i = CH.indexOf(sel), n = S.stage;
    const cells = [];
    for (let s = sel.from; s <= sel.to; s++) {
      const boss = DATA.bosses[s] ? 'boss' : '';
      cells.push(s < n
        ? `<button class="st-cell ${boss}" data-act="starstage" data-arg="${s}" aria-label="Stage ${s}, ${count(of(s))} stars">${s}${pips(s)}</button>`
        : `<i class="${s === n ? 'cur' : ''} ${boss}">${s}</i>`);
    }
    return `<div class="row st-head"><button class="btn small alt st-nav ${i ? '' : 'off'}" data-act="starch" data-arg="-1" aria-label="The chapter before">‹</button>
        <div class="section-label grow">${esc(sel.name)}<span class="st-total">${icon('i-star')}${chStars(sel)}/${chMax(sel)}</span></div>
        <button class="btn small alt st-nav ${sel === cur ? 'off' : ''}" data-act="starch" data-arg="1" aria-label="The next chapter">›</button></div>
      <div class="stage-list st-list">${cells.join('')}</div>
      <div class="row st-chests"><span class="muted small grow">Tap a cleared stage to fight it again for its stars.</span>${chests(sel)}</div>`;
  };

  KH.sheets.starstage = () => {
    const n = UI.sheet.n, foe = KH.enemyFor(n), team = KH.teamStats(foe.cls), m = of(n);
    const home = KH.squadHome();
    const rule = [`Win the fight`, `End it with half the squad's health or more`, `Win within ${swiftOf(n)} rounds`];
    const rows = NAMES.map((name, i) => `<div class="row st-rule ${m & (1 << i) ? 'on' : ''}">${icon(m & (1 << i) ? 'i-star' : 'i-lock', 'st-ic')}<div class="grow"><b>${name}</b><div class="muted small">${rule[i]}</div></div></div>`).join('');
    const ours = KH.statPower(team), theirs = KH.statPower(foe);
    return {
      title: `Stage ${n}${foe.boss ? ' · Boss' : ''}`, lvl: `${count(m)}/3`,
      body: `<div class="card stack"><div class="row"><div class="grow"><b>${esc(foe.name)}</b><div class="muted small">${esc(foe.chapter)}</div></div><span class="chip">${fmt(ours)} vs ${fmt(theirs)}</span></div>
          ${foe.traits && foe.traits.length && KH.traitRows ? `<div class="traits">${KH.traitRows(foe, home)}</div>` : ''}${KH.artRow ? KH.artRow(foe) : ''}</div>
        <div class="card stack">${rows}</div>
        <p class="muted small">A stage fought again pays only its stars. The live battle is where the last ones are won: breathe into a wind-up, Mend before the squad drops below half.</p>
        <button class="btn wide ${home.length && count(m) < 3 ? '' : 'off'}" data-act="starfight" data-arg="${n}">${count(m) === 3 ? 'All three stars won' : home.length ? `${icon('i-sword')}Fight for the stars` : 'Squad is away on the Dunes'}</button>`,
    };
  };
  // every chapter's stars and chests, newest first
  KH.sheets.stars = () => {
    const top = CH.indexOf(chOf(Math.min(S.stage, DATA.finalStage)));
    const rows = CH.slice(0, top + 1).reverse().map((c) => `<div class="row st-ch"><div class="grow"><b>${esc(c.name)}</b><div class="muted small">Stages ${c.from}-${c.to} · ${icon('i-star')}${chStars(c)}/${chMax(c)}</div></div>
      ${chests(c)}<button class="btn small alt" data-act="starsgo" data-arg="${c.from}" aria-label="Go to ${esc(c.name)}">Go</button></div>`).join('');
    return {
      title: 'Stage Stars', lvl: `${fmt(S.stats.stars)}`,
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'stars', '') : ''}<p class="muted small">Every story stage holds three stars: the victory, ending with half the squad's health, and winning within ${T.swift} rounds. Each chapter's stars fill three chests.</p><div class="card stack">${rows}</div>`,
    };
  };
  KH.side.push({ id: 'stars', icon: 'i-star', label: 'Stars', act: 'stars', show: () => !!S && S.stage > 2, dot: anyReady, badge: () => (anyReady() ? `${readyCount()}` : `${S.stats.stars}`) });
  KH.stars = { earned, record, of, count, chapters: () => CH, chStars, ready, anyReady, swiftOf };
})();

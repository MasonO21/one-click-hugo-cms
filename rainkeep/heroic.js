/*
 * Rainkeep: Heroic Chapters. A chapter whose thirty stars are all won opens its Heroic version: the same ten stages,
 * fought in order, each foe as strong as a stage fifteen further on and carrying two traits (a boss three), so the
 * squad, the formation and the Breath Art all have to fit the foe. Each Heroic chapter features one hero (Epics early,
 * Legendaries from chapter 10). A first clear pays Starglass and that hero's shards, and brings the hero to the keep if
 * they aren't there yet; a won stage can then be raided, at once and without a fight, for more of those shards, three
 * raids a day across every chapter, so the player chooses whose shards to gather. The Heroic strip sits under the
 * chapter's stars on the Expedition tab (KH.heroicStrip, from stars.js), and the Heroic sheet in the Play hub lists
 * every open chapter with its hero and a raid.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const H = DATA.heroic, HERO = Object.fromEntries(DATA.heroes.map((h) => [h.id, h]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.heroic = { won: {}, day: 0, raids: 0 }; s.stats.heroicWins = 0; s.stats.heroicRaids = 0; });

  const CH = () => KH.stars.chapters();
  const chOf = (n) => CH().filter((c) => n >= c.from).pop();
  const heroOf = (c) => H.heroes[CH().indexOf(c)];
  const isOpen = (c) => !!S && !!c && KH.stars.chStars(c) >= 3 * (c.to - c.from + 1);
  const won = (n) => !!S.heroic.won[n];
  const wonIn = (c) => { let k = 0; for (let n = c.from; n <= c.to; n++) if (won(n)) k++; return k; };
  const next = (c) => { for (let n = c.from; n <= c.to; n++) if (!won(n)) return n; return null; };
  const boss = (n) => !!DATA.bosses[n];
  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); };
  const raidsLeft = () => { if (!S) return 0; if (S.heroic.day !== today()) { S.heroic.day = today(); S.heroic.raids = 0; } return Math.max(0, H.raids - S.heroic.raids); };
  const anyOpen = () => !!S && CH().some(isOpen);

  // the Heroic foe: a stage fifteen further on, with two traits (three for a boss) on its own beat
  function foe(n) {
    const base = KH.enemyFor(n), T = DATA.traits, O = T.order, b = boss(n);
    const a = O[(n * 3 + 1) % O.length], traits = [a, O[(O.indexOf(a) + 2) % O.length]];
    if (b) traits.push(O[(O.indexOf(a) + 4) % O.length]);
    const st = KH.foeStats(KH.stageLevel(n + H.ahead), b ? DATA.enemy.boss : 1);
    const e = traits.reduce((m, t) => m * (T.list[t].ease != null ? T.list[t].ease : T.ease), 1);
    for (const k of ['atk', 'def', 'hp']) st[k] *= e;
    if (traits.includes('armored')) st.def *= T.list.armored.def;
    return { ...base, ...st, n, name: `Heroic ${base.name}`, boss: b, traits, heroic: true };
  }
  // shards for the chapter's hero; the first ones bring the hero to the keep
  function giveShards(id, k) {
    const isNew = !S.heroes[id];
    KH.addHero(id, k);
    if (isNew) KH.toast(`${HERO[id].name} joins the keep!`, 'good');
    return isNew;
  }

  ACT.heroicstage = (n) => { n = +n; const c = chOf(n); if (!isOpen(c) || (n !== next(c) && !won(n))) return; UI.sheet = { kind: 'heroicstage', n }; };
  ACT.heroicfight = (n) => {
    n = +n;
    const c = chOf(n);
    if (!isOpen(c) || n !== next(c)) return;
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const f = foe(n), team = KH.teamStats(f.cls), id = heroOf(c);
    UI.sheet = null;
    KH.fightLive({
      title: `Heroic stage ${n} · ${c.name}`, foe: f, team, opts: { art: KH.artOf() },
      onEnd: (result) => {
        KH.emit('battle', { kind: 'heroic', win: result.win, foe: f });
        if (!result.win || won(n)) { KH.save(); return {}; }
        const g = boss(n) ? H.first.boss : H.first.stage;
        S.heroic.won[n] = true; S.stats.heroicWins++;
        KH.grant({ starglass: g.starglass });
        const joined = giveShards(id, g.shards);
        KH.save();
        return { rewards: { starglass: g.starglass }, extra: joined ? `${esc(HERO[id].name)} joins the keep.` : `${icon('i-star')}${g.shards} shards for ${esc(HERO[id].name)}` };
      },
    });
  };
  ACT.heroicraid = (n) => {
    n = +n;
    if (!won(n)) return;
    if (!raidsLeft()) return KH.toast('No raids left today. Three more tomorrow.', 'warn');
    const c = chOf(n), id = heroOf(c), r = boss(n) ? H.raid.boss : H.raid.stage;
    S.heroic.raids++; S.stats.heroicRaids++;
    giveShards(id, r.shards);
    KH.grant(KH.scaleReward({ journals: r.journals }));
    KH.sfx('claim');
    KH.toast(`Raided Heroic stage ${n}: ${r.shards} shards for ${HERO[id].name.split(' ')[0]}.`, 'good');
    KH.save();
  };
  ACT.heroic = () => { UI.sheet = { kind: 'heroic' }; };
  ACT.heroicgo = (from) => { UI.starCh = +from; UI.sheet = null; KH.UI.tab = 'world'; KH.UI.sub.world = 'expedition'; };

  const heroLine = (id) => {
    const h = S.heroes[id];
    return h ? `${esc(HERO[id].name)} · ${h.stars}★ · ${fmt(h.shards)}/${10 * h.stars} shards` : `${esc(HERO[id].name)} · not yet in the keep`;
  };
  const best = (c) => { let b = null; for (let n = c.from; n <= c.to; n++) if (won(n) && (!b || boss(n) >= boss(b))) b = n; return b; };
  // under the chapter's stars on the Expedition tab
  KH.heroicStrip = (c) => {
    if (!isOpen(c)) return '';
    const id = heroOf(c), nx = next(c), cells = [];
    for (let n = c.from; n <= c.to; n++) {
      const cls = won(n) ? 'won' : n === nx ? 'cur' : 'locked';
      cells.push(cls === 'locked' ? `<i class="hc-cell locked ${boss(n) ? 'boss' : ''}">${n}</i>`
        : `<button class="hc-cell ${cls} ${boss(n) ? 'boss' : ''}" data-act="heroicstage" data-arg="${n}" aria-label="Heroic stage ${n}${won(n) ? ', won' : ''}">${n}</button>`);
    }
    return `<div class="card hc-strip"><div class="row hc-head"><div class="hc-face">${KH.art.portrait(id)}</div><div class="grow"><b>Heroic ${esc(c.name)}</b><div class="muted small">${heroLine(id)}</div></div><span class="chip">${wonIn(c)}/10</span></div>
      <div class="stage-list hc-list">${cells.join('')}</div><div class="muted small">Raids today: ${raidsLeft()} of ${H.raids}</div></div>`;
  };
  KH.sheets.heroicstage = () => {
    const n = UI.sheet.n, c = chOf(n), f = foe(n), team = KH.teamStats(f.cls), id = heroOf(c), home = KH.squadHome();
    const g = boss(n) ? H.first.boss : H.first.stage, r = boss(n) ? H.raid.boss : H.raid.stage;
    const ours = KH.statPower(team), theirs = KH.statPower(f);
    const act = won(n)
      ? `<button class="btn wide gold ${raidsLeft() ? '' : 'off'}" data-act="heroicraid" data-arg="${n}">Raid: ${r.shards} shards (${raidsLeft()} left today)</button>`
      : `<button class="btn wide ${home.length ? '' : 'off'}" data-act="heroicfight" data-arg="${n}">${home.length ? `${icon('i-sword')}Fight` : 'Squad is away on the Dunes'}</button>`;
    return {
      title: `Heroic stage ${n}${f.boss ? ' · Boss' : ''}`, lvl: won(n) ? 'Won' : '',
      body: `<div class="card stack"><div class="row"><div class="grow"><b>${esc(f.name)}</b><div class="muted small">${esc(c.name)} · as strong as stage ${n + H.ahead}</div></div><span class="chip">${fmt(ours)} vs ${fmt(theirs)}</span></div>
          <div class="traits">${KH.traitRows ? KH.traitRows(f, home) : ''}</div>${KH.formationRow ? KH.formationRow(f) : ''}${KH.artRow ? KH.artRow(f) : ''}</div>
        <div class="card row hc-hero"><div class="hc-face">${KH.art.portrait(id)}</div><div class="grow"><b>${esc(HERO[id].name)}</b><div class="muted small">${heroLine(id)}</div>
          <div class="small">${won(n) ? `A raid: ${r.shards} shards and Field Journals, at once.` : `First clear: ${g.starglass} Starglass and ${g.shards} shards${S.heroes[id] ? '' : ' (and the hero joins the keep)'}.`}</div></div></div>
        ${act}`,
    };
  };
  // every open Heroic chapter: its hero, how far it is won, and a raid on its best won stage
  KH.sheets.heroic = () => {
    const open = CH().filter(isOpen).reverse();
    const rows = open.map((c) => {
      const id = heroOf(c), b = best(c);
      return `<div class="row hc-ch"><div class="hc-face">${KH.art.portrait(id)}</div><div class="grow"><b>${esc(c.name)}</b><div class="muted small">${heroLine(id)}</div><div class="small">${wonIn(c)}/10 won</div></div>
        <div class="stack hc-btns">${b ? `<button class="btn small gold ${raidsLeft() ? '' : 'off'}" data-act="heroicraid" data-arg="${b}">Raid</button>` : ''}<button class="btn small alt" data-act="heroicgo" data-arg="${c.from}">Go</button></div></div>`;
    }).join('');
    return {
      title: 'Heroic Chapters', lvl: `${raidsLeft()}/${H.raids}`,
      body: `<p class="muted small">Win all thirty stars in a chapter and its Heroic version opens: the same stages in order, each foe as strong as a stage ${H.ahead} further on, with two traits. Each chapter pays one hero's shards; raid a won stage (${H.raids} raids a day) for more.</p>
        ${rows ? `<div class="card stack">${rows}</div>` : '<p class="muted">No chapter has all thirty stars yet.</p>'}`,
    };
  };
  KH.side.push({ id: 'heroic', icon: 'i-star', label: 'Heroic', act: 'heroic', show: anyOpen, dot: () => raidsLeft() > 0 && Object.keys(S.heroic.won).length > 0, badge: () => `${raidsLeft()}/${H.raids}` });
  KH.heroic = { foe, isOpen, next, won, raidsLeft, heroOf, chOf };
})();

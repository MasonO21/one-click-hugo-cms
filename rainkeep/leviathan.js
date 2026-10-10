/*
 * Rainkeep: the Sand Leviathan. From Rainwyrm Lv 9 a leviathan surfaces on the Dunes for a hunt of one day of keep
 * time. It cannot be killed: each of three attacks a hunt is a full 12-round battle (live, with breath and skills),
 * scored by the damage done before the squad falls back or the rounds run out. The best attack of the hunt ranks
 * you among the Hall of Wardens' fifty, whose own attacks are their share of your par by power with some luck on
 * the day; par is what the strongest squad to attack this hunt does on auto-battle (it only ever rises, so a weak
 * first attack can't set it low), and marks for beating it pay as soon as
 * they are reached. Each hunt it fights as one troop class, so the squad that counters it does most. When the hunt
 * ends the rank pays by mail.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, seeded } = KH.u;
  const { UI, ACT } = KH;
  const L = DATA.leviathan, CLS = ['guard', 'bow', 'lancer'];
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.lev = { open: false, hunt: 0, start: 0, left: 0, best: 0, par: 0, marks: [], last: null };
    s.stats.levHunts = 0; s.stats.levBest = 0; s.stats.levTop = 0; s.stats.levAttacks = 0; s.stats.levTop3 = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= L.unlock;
  const V = () => S.lev;
  const clsOf = (n) => CLS[n % CLS.length];
  // a foe trait each hunt (none on the first), turning through the five on a different beat from the class
  const traitOf = (n) => (n > 1 && DATA.traits ? DATA.traits.order[(n * 2 + 1) % DATA.traits.order.length] : null);
  // the Leviathan as it surfaces this hunt: the current expedition foe's strength, far more health, and a class
  function foe() {
    // the hunt's own stage, as plain stats: no boss or trait of whatever stage the keep is on today
    const n = V().stage || S.stage, e = { ...KH.foeStats(KH.stageLevel(n), 1), act: KH.enemyFor(n).act };
    const tr = traitOf(V().hunt), T = DATA.traits;
    return { n, name: 'The Sand Leviathan', cls: clsOf(V().hunt), boss: true, chapter: 'The Dunes', act: e.act, atk: e.atk * L.atk, def: e.def * (tr === 'armored' ? T.list.armored.def : 1), hp: e.hp * L.hp, base: e.hp, traits: tr ? [tr] : [] };
  }
  const damageOf = (f, result) => Math.round(f.hp - (result.rounds.length ? result.rounds[result.rounds.length - 1].eh : f.hp));
  // par: the squad on auto-battle, a few times over, when the hunt begins
  function parNow(team) {
    const f = foe();
    team = team || KH.teamStats(f.cls);
    let t = 0;
    for (let k = 0; k < 5; k++) t += damageOf(f, KH.simulateBattle(team, f, { breathHp: f.base, art: KH.artOf() }));
    return Math.max(1, Math.round(t / 5));
  }
  // the other wardens' best attacks this hunt: their share of your par by power, and their luck on the day
  function board() {
    const v = V(), rows = [];
    if (KH.hall) {
      const me = Math.max(1, KH.hall.mine ? KH.hall.mine() : KH.power()), rnd = seeded(v.hunt * 7919 + 13);
      for (const w of KH.hall.list()) {
        const luck = L.luck[0] + rnd() * (L.luck[1] - L.luck[0]);
        rows.push({ name: w.name, keep: w.keep, color: w.color, dmg: Math.round(v.par * Math.pow(KH.hall.powerOf(w) / me, 0.9) * luck) });
      }
    }
    rows.push({ you: true, name: 'You', keep: 'Rainkeep', color: '#3fd0c0', dmg: v.best });
    rows.sort((a, b) => b.dmg - a.dmg || (a.you ? -1 : 1));
    return rows;
  }
  const rankNow = () => board().findIndex((r) => r.you) + 1;
  const rewardFor = (rank) => (L.rank.find(([r]) => rank <= r) || [0, null])[1];

  function surface() {
    const v = V();
    v.hunt++; v.start = S.time; v.left = L.attacks; v.best = 0; v.marks = [];
    // par is set by the attacks themselves, from the squads that make them (not whoever was home when it surfaced)
    v.stage = S.stage; v.par = 0;
  }
  function endHunt() {
    const v = V();
    if (v.left < L.attacks) {
      const rank = rankNow(), g = rewardFor(rank);
      v.last = { hunt: v.hunt, rank, best: v.best, cls: clsOf(v.hunt) };
      S.stats.levHunts++;
      S.stats.levTop = S.stats.levTop ? Math.min(S.stats.levTop, rank) : rank;
      if (rank <= 3) S.stats.levTop3++;
      if (g) KH.mail(`The Leviathan dives: rank ${rank}`, `The Sand Leviathan has gone back under the dunes. Your best attack of the hunt did ${fmt(v.best)} damage, rank ${rank} of ${board().length} wardens.`, KH.scaleReward(g));
    } else v.last = null;
  }
  KH.hooks.tick.push(() => {
    if (!unlocked()) return;
    const v = V();
    if (!v.open) {
      v.open = true;
      surface();
      KH.mail('The Sand Leviathan', 'Scouts report a leviathan surfacing in the deep dunes, too big to kill and too dangerous to leave alone. Each day it surfaces you may attack it three times; the wardens of the Hall will be hunting it too, and the best attack of each hunt is ranked.', null);
      KH.emit('levOpen', {});
      return;
    }
    if (S.time - v.start >= L.hunt) { endHunt(); surface(); }
  });

  ACT.leviathan = () => {
    if (!unlocked()) return KH.toast(`The Sand Leviathan surfaces at Rainwyrm Lv ${L.unlock}.`, 'warn');
    UI.sheet = { kind: 'leviathan' };
  };
  ACT.levattack = () => {
    const v = V();
    if (!unlocked() || v.left < 1) return KH.toast('No attacks left this hunt. The Leviathan surfaces again tomorrow.', 'warn');
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const f = foe(), team = KH.teamStats(f.cls), hunt = v.hunt;
    // par only ever rises: a weak squad sent first can't set it low for the real attacks to beat
    v.par = Math.max(v.par || 0, parNow(team));
    v.left--;
    KH.fightLive({
      title: `Hunt ${v.hunt} · attack ${L.attacks - v.left} of ${L.attacks}`, foe: f, team, opts: { breathHp: f.base, art: KH.artOf() },
      intro: 'The sand heaves. The Leviathan rises out of the dune…',
      onEnd: (result) => {
        // the hunt ended while the fight went on: it counts for nothing (the Leviathan had already dived)
        if (v.hunt !== hunt) return { loseLine: 'The Leviathan dived before the attack was done.', timeoutLine: 'The Leviathan dived before the attack was done.', noTips: true, resultTitle: 'It dived' };
        const dmg = damageOf(f, result), was = v.best;
        v.best = Math.max(v.best, dmg);
        S.stats.levBest = Math.max(S.stats.levBest || 0, dmg);
        S.stats.levAttacks++;
        if (KH.duty) KH.duty('leviathan');
        const got = {};
        L.marks.forEach(([k, g], i) => { if (!v.marks.includes(i) && v.best >= k * v.par) { v.marks.push(i); for (const [a, n] of Object.entries(KH.scaleReward(g))) got[a] = (got[a] || 0) + n; } });
        if (Object.keys(got).length) KH.grant(got);
        KH.emit('levAttack', { dmg, best: v.best > was });
        KH.emit('battle', { kind: 'leviathan', win: false, foe: f });
        KH.save();
        const line = result.timeout ? 'The Leviathan dives back under the sand.' : 'The squad falls back from the Leviathan.';
        return { rewards: Object.keys(got).length ? got : null, loseLine: line, timeoutLine: line, noTips: true, resultTitle: `${fmt(dmg)} damage`,
          extra: `${v.best > was && was ? 'A new best this hunt. ' : ''}Rank ${rankNow()} of ${board().length} · ${v.left} attack${v.left === 1 ? '' : 's'} left${Object.keys(got).length ? ' · a mark beaten' : ''}` };
      },
    });
  };

  const counterOf = (cls) => Object.keys(DATA.counters).find((c) => DATA.counters[c] === cls);
  KH.sheets.leviathan = () => {
    const v = V(), rows = board(), me = rows.findIndex((r) => r.you), f = foe();
    const marks = L.marks.map(([k, g], i) => `<div class="row lv-mark ${v.marks.includes(i) ? 'got' : ''}"><span class="lv-k">${fmt(Math.round(k * v.par))}</span><div class="costs grow">${KH.rewardHTML(KH.scaleReward(g))}</div>${v.marks.includes(i) ? icon('i-check') : ''}</div>`).join('');
    const show = rows.slice(0, 5).concat(me >= 5 ? [null, rows[me]] : []);
    const table = !v.par ? '<p class="muted small">The other wardens are hunting it too. Their attacks show once yours sets par.</p>' : show.map((r) => (r ? `<div class="row lv-row ${r.you ? 'you' : ''}"><span class="lv-rank">${rows.indexOf(r) + 1}</span><span class="dot-c" style="background:${r.color}"></span><span class="grow">${esc(r.name)}<small class="muted"> · ${esc(r.keep)}</small></span><b>${fmt(r.dmg)}</b></div>` : '<div class="lv-gap">⋯</div>')).join('');
    const g = rewardFor(me + 1);
    return {
      title: 'The Sand Leviathan', lvl: `Hunt ${v.hunt}`,
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'leviathan', 'Too big to kill, too dangerous to leave alone.') : ''}
        <div class="card stack"><div class="row"><span class="grow">It fights as a <b>${esc(DATA.classes[f.cls].name)}</b> this hunt: ${esc(DATA.classes[counterOf(f.cls)].name)} counter it.</span><span class="chip">${icon('i-clock')}${fmtTime(Math.max(0, L.hunt - (S.time - v.start)))}</span></div>
          ${f.traits.length && KH.traitRows ? `<div class="traits">${KH.traitRows(f, KH.squadHome())}</div>` : ''}${KH.artRow ? KH.artRow(f) : ''}
          <div class="row"><span class="lv-pips">${Array.from({ length: L.attacks }, (_, i) => `<i class="${i < v.left ? 'on' : ''}"></i>`).join('')}</span><span class="grow muted small">${v.left} attack${v.left === 1 ? '' : 's'} left · best ${fmt(v.best)}</span>
          <button class="btn gold ${v.left ? '' : 'off'}" data-act="levattack">${icon('i-sword')}Attack</button></div></div>
        <div class="card stack"><div class="section-label">Marks this hunt · par ${v.par ? fmt(v.par) : 'set by your first attack'}</div>${v.par ? marks : ''}<p class="muted small">Par is what your strongest squad this hunt does on auto-battle, and it only rises. Breathe into its wind-ups and time the skills to beat it.</p></div>
        <div class="card stack"><div class="row"><b class="grow">The hunt so far</b><span class="chip">${v.par ? `Rank ${me + 1}` : 'No attack yet'}</span></div>${table}
          ${g && v.par ? `<div class="row muted small"><span class="grow">If the hunt ended now:</span><div class="costs">${KH.rewardHTML(KH.scaleReward(g))}</div></div>` : ''}</div>
        ${v.last ? `<p class="muted small">Last hunt: rank ${v.last.rank} with ${fmt(v.last.best)} damage.</p>` : ''}`,
    };
  };
  KH.side.push({ id: 'leviathan', icon: 'i-lev', label: 'Leviathan', act: 'leviathan', show: unlocked, dot: () => V().left > 0, badge: () => `${V().left}/${L.attacks}` });
  KH.chips.push(() => (unlocked() && V().left > 0 ? `<button class="qchip" data-act="leviathan">${icon('i-lev')}${V().left} attack${V().left === 1 ? '' : 's'} <time>${fmtTime(Math.max(0, L.hunt - (S.time - V().start)))}</time></button>` : ''));

  KH.leviathan = { unlocked, foe, board, rankNow, parNow, damageOf, surface, endHunt };
})();

/*
 * Rainkeep: Bloom. Once the rain is back (after Act I), plant groves on open sand near the keep.
 * A grove grows on its own, from seedling to young grove to oasis; there is nothing to tend. Each
 * oasis adds a little food and well water, and every few oases the keep gets a lasting gift (cooler
 * air, more production, longer rain, and at thirty a wyrm skin). world3d.js draws the groves; this
 * file owns the rules, the Bloom sheet and the "Plant a grove" button on open-sand tiles.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const B = DATA.bloom;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.bloom = { groves: {}, claimed: [], told: false };
    s.stats.groves = 0; s.stats.oases = 0;
  });

  const unlocked = () => !!S && S.stage > DATA.actOneStage;
  const W = () => KH.world;
  const count = () => Object.keys(S.bloom.groves).length;
  // 0 seedling, 1 young grove, 2 oasis
  const stageOf = (g) => { const age = S.time - g.t; return age < B.grow[0] ? 0 : age < B.grow[0] + B.grow[1] ? 1 : 2; };
  const oases = () => (S ? Object.values(S.bloom.groves).filter((g) => stageOf(g) === 2).length : 0);
  const costOf = () => {
    const c = KH.scaleReward(B.cost), m = Math.pow(B.costGrowth, count());
    for (const k in c) c[k] = Math.round(c[k] * m);
    return c;
  };
  // open sand (bare, or with a few dry palms or rocks), in sight and within reach of the keep
  function plantable(x, y) {
    const w = W(), t = w.base(x, y);
    if (t.kind !== 'empty' || !w.visible(x, y)) return false;
    const d = w.dist(x, y);
    return d >= 1 && d <= B.reach && !S.bloom.groves[t.k];
  }
  function nearest() {
    const w = W(), list = [];
    for (let y = 0; y < w.N; y++) for (let x = 0; x < w.N; x++) if (plantable(x, y)) list.push([w.dist(x, y) + Math.atan2(y - w.C, x - w.C) * 0.01, x, y]);
    list.sort((a, b) => a[0] - b[0]);
    return list.length ? w.base(list[0][1], list[0][2]) : null;
  }
  const why = () => (!unlocked() ? 'Groves can only grow once the rain is back.' : count() >= B.max ? 'The Dunes near the keep are as green as they can be.' : !KH.canAfford(costOf()) ? 'Not enough water and food to plant a grove.' : null);

  // perks: a little from every oasis, more at each milestone
  KH.hooks.bonus.push((k) => {
    if (!S || !S.bloom || !count()) return 0;
    const n = oases();
    let v = 0;
    for (const [pk, pv] of B.per) if (pk === k) v += pv * n;
    for (const m of B.milestones) if (n >= m.n) for (const [pk, pv] of m.perks) if (pk === k) v += pv;
    return v;
  });
  KH.hooks.tick.push((dt, offline) => {
    if (!S || !S.bloom) return;
    if (!S.bloom.told && unlocked() && !offline && S.seenIntro) {
      S.bloom.told = true;
      KH.mail('The sand remembers green', `Now that it rains, seeds will take on the Dunes. Plant groves on open sand near the keep and they will grow into oases by themselves. Look for Bloom on the Dunes map.`, KH.scaleReward({ water: 4, food: 3 }));
    }
    const n = oases();
    S.stats.oases = n;
    for (const m of B.milestones) {
      if (n < m.n || S.bloom.claimed.includes(m.n)) continue;
      S.bloom.claimed.push(m.n);
      KH.grant(m.reward);
      if (!offline) { KH.toast(`${m.n} oases on the Dunes: ${m.text}.`, 'good', 'bloom', 5); KH.sfx('complete'); }
    }
  });

  ACT.plant = (k) => {
    const w = W(), [x, y] = String(k).split(',').map(Number);
    const err = why();
    if (err) return KH.toast(err, 'warn');
    if (!plantable(x, y)) return KH.toast('A grove can only go on open sand near the keep.', 'warn');
    KH.pay(costOf());
    S.bloom.groves[w.key(x, y)] = { t: S.time };
    S.stats.groves++;
    KH.sfx('build');
    KH.toast('A grove is planted. It will be an oasis by itself in a while.', 'good');
    KH.emit('plant', { x, y });
    if (UI.sheet && UI.sheet.kind === 'tile') UI.sheet = null;
  };
  ACT.plantnear = () => {
    const err = why();
    if (err) return KH.toast(err, 'warn');
    const t = nearest();
    if (!t) return KH.toast('There is no open sand left within reach. Grow the wyrm to clear more of the haze.', 'warn');
    ACT.plant(t.k);
  };
  ACT.bloom = () => { UI.sheet = { kind: 'bloom' }; };

  KH.sheets.bloom = () => {
    const n = oases(), c = count(), growing = Object.values(S.bloom.groves).filter((g) => stageOf(g) < 2);
    const soon = growing.length ? Math.min(...growing.map((g) => g.t + B.grow[0] + B.grow[1] - S.time)) : 0;
    const err = why();
    const ms = B.milestones.map((m) => `<div class="bloom-ms ${n >= m.n ? 'done' : ''}"><span class="n">${m.n}</span><div class="grow"><b>${esc(m.text)}</b><div class="costs">${KH.rewardHTML(m.reward)}</div></div>${n >= m.n ? icon('i-check') : ''}</div>`).join('');
    return {
      title: 'Bloom', lvl: `${n}/${B.max} oases`,
      body: `<p class="muted small">Plant groves on open sand near the keep. They grow into oases by themselves, and each oasis adds a little food and well water.</p>
        <div class="bloom-meter"><i style="width:${(n / B.max) * 100}%"></i><i class="young" style="width:${(c / B.max) * 100}%"></i></div>
        <p class="small">${c} planted${growing.length ? ` · ${growing.length} growing, the next oasis in ${fmtTime(soon)}` : ''}</p>
        <div class="card stack"><div class="row"><div class="grow"><b>Plant a grove</b><div class="muted small">On the nearest open sand</div></div><div class="costs">${count() < B.max ? KH.costHTML(costOf()) : ''}</div></div>
          <button class="btn wide ${err ? 'off' : 'gold'}" data-act="plantnear" data-primary>${icon('i-sprout')}Plant</button>${err && unlocked() && count() < B.max ? `<p class="muted small">${esc(err)}</p>` : ''}</div>
        <div class="section-label">Gifts of the green</div><div class="stack">${ms}</div>`,
    };
  };

  // the open-sand tile sheet (world.js) gets a Plant button
  KH.bloomTile = (t) => {
    if (!unlocked()) return '';
    const g = S.bloom.groves[t.k];
    if (g) {
      const st = stageOf(g), left = g.t + B.grow[0] + (st ? B.grow[1] : 0) - S.time;
      return `<p>${st === 2 ? 'An oasis: palms, shade and a pool, where there was only sand.' : st === 1 ? `A young grove, finding its roots. An oasis in ${fmtTime(left)}.` : `Seedlings, barely above the sand. A young grove in ${fmtTime(left)}.`}</p>`;
    }
    if (!plantable(t.x, t.y)) return W().dist(t.x, t.y) > B.reach ? '<p class="muted small">Too far from the keep for a grove to take.</p>' : '';
    const err = why();
    return `<div class="card stack"><div class="row"><div class="grow"><b>Plant a grove</b><div class="muted small">It grows into an oasis by itself.</div></div><div class="costs">${KH.costHTML(costOf())}</div></div>
      <button class="btn wide ${err ? 'off' : 'gold'}" data-act="plant" data-arg="${t.k}" data-primary>${icon('i-sprout')}Plant</button></div>`;
  };

  // for world3d.js, tests and the balance bot
  KH.bloom = { unlocked, groves: () => (S ? S.bloom.groves : {}), stageOf, oases, count, costOf, nearest, max: B.max };
})();

/*
 * Rainkeep: the Buried City. From Rainwyrm Lv 11 the well-diggers break into a city under the sand, and the keep
 * digs it out layer by layer. A layer is a grid of sand hiding five relics (the last and largest is its grand relic).
 * A Trowel digs one tile; dug sand shows how many relic pieces lie in the eight tiles around it, so the digging is a
 * small puzzle of where the relics must be, and a careful digger spends far fewer Trowels than a careless one.
 * Bedrock (from layer 4) takes two Trowels; a Blasting Charge clears a 3x3 patch. A relic dug up whole pays by its
 * size, more the deeper it lies; all five open the layer's chest and the way down. Trowels come free with time, from
 * beasts and bosses, from the chests and from the daily Digger's Kit.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const G = DATA.dig, W = G.w, H = G.h, N = W * H;
  const COLORS = ['#c9874a', '#5fa8a0', '#b06ab3', '#d4a12a', '#e0603a'];
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.dig = { open: false, layer: 1, cells: [], rock: [], dug: [], relics: [], acc: 0, found: {} };
    s.stats.digs = 0; s.stats.relics = 0; s.stats.grandRelics = 0; s.stats.digLayer = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= G.unlock;
  const sizeKey = (r) => `${Math.min(r.w, r.h)}x${Math.max(r.w, r.h)}`;
  const nbrs = (i) => {
    const x = i % W, y = (i / W) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H) out.push(Y * W + X);
    }
    return out;
  };

  // a new layer: five relics laid either way round without overlapping, and some bedrock
  function newLayer(n) {
    const D = S.dig;
    for (let tries = 0; tries < 200; tries++) {
      const cells = Array(N).fill(-1), relics = [];
      const used = {};
      let ok = true;
      G.sizes.forEach(([a, b], idx) => {
        if (!ok) return;
        for (let t = 0; t < 300; t++) {
          const [w, h] = Math.random() < 0.5 ? [a, b] : [b, a];
          const x = Math.floor(Math.random() * (W - w + 1)), y = Math.floor(Math.random() * (H - h + 1));
          let free = true;
          for (let dy = 0; dy < h && free; dy++) for (let dx = 0; dx < w; dx++) if (cells[(y + dy) * W + x + dx] >= 0) { free = false; break; }
          if (!free) continue;
          for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells[(y + dy) * W + x + dx] = idx;
          const key = `${a}x${b}`, pool = G.relics[key].filter((r) => !used[r.id]);
          const kind = pool[Math.floor(Math.random() * pool.length)];
          used[kind.id] = true;
          relics.push({ kind: kind.id, key, x, y, w, h, done: false });
          return;
        }
        ok = false;
      });
      if (!ok) continue;
      const rock = Array(N).fill(0), nr = G.rock(n);
      for (let k = 0; k < nr;) { const i = Math.floor(Math.random() * N); if (!rock[i]) { rock[i] = 1; k++; } }
      Object.assign(D, { layer: n, cells, relics, rock, dug: Array(N).fill(0) });
      S.stats.digLayer = Math.max(S.stats.digLayer || 0, n);
      return;
    }
  }
  const KIND = {};
  for (const [key, list] of Object.entries(G.relics)) for (const r of list) KIND[r.id] = { ...r, key };
  const relicTiles = (r) => { const out = []; for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) out.push((r.y + dy) * W + r.x + dx); return out; };
  const clue = (i) => nbrs(i).filter((j) => S.dig.cells[j] >= 0).length;
  const cleared = () => !!S && S.dig.relics.length > 0 && S.dig.relics.every((r) => r.done);
  // tiles next to dug sand that shows 0 are known to be empty
  const knownClear = () => {
    const D = S.dig, out = new Set();
    for (let i = 0; i < N; i++) if (D.dug[i] === 2 && D.cells[i] < 0 && clue(i) === 0) for (const j of nbrs(i)) if (D.dug[j] !== 2) out.add(j);
    return out;
  };
  const nameOf = (k) => (KH.NAME && KH.NAME[k]) || (DATA.items[k] && DATA.items[k].name) || ({ starglass: 'Starglass', journals: 'Field Journals' })[k] || k;
  const giveText = (g) => Object.entries(g).map(([k, v]) => `+${fmt(v)} ${nameOf(k)}`).join(', ');
  const payOf = (r) => {
    const base = KH.scaleReward(G.pay[r.key]), m = Math.min(2, 1 + G.deeper * (S.dig.layer - 1)), out = {};
    for (const [k, v] of Object.entries(base)) out[k] = k in S.res || ['starglass', 'journals', 'treats', 'whetstone'].includes(k) ? Math.round(v * m) : v;
    return out;
  };
  const chestOf = (n) => {
    const g = { ...G.chest };
    if (n % G.chargeEvery === 0) g.charge = (g.charge || 0) + 1;
    const ms = G.milestones.find(([l]) => l === n);
    if (ms) Object.assign(g, ms[1]);
    else if (n > 20 && n % 10 === 0) g.shard_legendary = 1;
    return g;
  };

  KH.hooks.tick.push((dt) => {
    if (!unlocked()) return;
    const D = S.dig;
    if (!D.open) {
      D.open = true; D.acc = 0;
      newLayer(1);
      KH.mail('The Buried City', 'Digging the Deep Well deeper, the well-diggers broke through into rooms under the sand: a city older than the keep, buried by the dunes. Every layer hides five relics. A Trowel digs one tile, and the sand you dig shows how many relic pieces lie around it, so read it before you dig again. Here are Trowels and a Blasting Charge to start you off.', { ...G.welcome });
      KH.emit('digOpen', {});
      return;
    }
    if (!D.relics.length) newLayer(D.layer || 1);
    if (!dt) return;
    if (KH.have('trowel') >= G.free.cap) { D.acc = 0; return; }
    D.acc += dt;
    while (D.acc >= G.free.every && KH.have('trowel') < G.free.cap) { D.acc -= G.free.every; KH.grant({ trowel: 1 }); }
    if (KH.have('trowel') >= G.free.cap) D.acc = 0;
  });
  const trowels = (n, why) => { if (!unlocked() || !S.dig.open || !n) return; KH.grant({ trowel: n }); KH.toast(`+${n} Trowel${n > 1 ? 's' : ''} ${why}.`, 'good', 'trowel', 3); };
  KH.on('stage', ({ n }) => { if (KH.enemyFor && KH.enemyFor(n).boss) trowels(G.bossTrowels, 'from the fallen boss'); });
  KH.on('beast', () => { if (Math.random() < G.beast) trowels(1, 'from the beast hunt'); });

  // dig one tile (already paid for); returns the relic finished, if any
  function open(i) {
    const D = S.dig;
    if (D.dug[i] === 2) return null;
    D.dug[i] = 2;
    S.stats.digs++;
    const ri = D.cells[i];
    KH.emit('dug', { relic: ri >= 0 });
    if (ri < 0) return null;
    const r = D.relics[ri];
    if (r.done || !relicTiles(r).every((j) => D.dug[j] === 2)) return null;
    r.done = true;
    const g = payOf(r);
    if (!S.dig.found) S.dig.found = {};
    if (!S.dig.found[r.kind]) for (const [k, v] of Object.entries(G.firstFind)) g[k] = (g[k] || 0) + v;
    S.dig.found[r.kind] = (S.dig.found[r.kind] || 0) + 1;
    KH.grant(g);
    S.stats.relics++;
    if (ri === D.relics.length - 1) S.stats.grandRelics++;
    KH.emit('relic', { kind: r.kind, grand: ri === D.relics.length - 1 });
    return { r, g };
  }
  function announce(found) {
    for (const { r, g } of found) KH.toast(`${KIND[r.kind].name} dug up whole${S.dig.found[r.kind] === 1 ? ', new for the Relic Hall' : ''}! ${giveText(g)}`, 'good');
    if (cleared()) { KH.sfx('victory'); KH.toast(`All five relics of layer ${S.dig.layer} found. Open the chest and go deeper.`, 'good'); } else if (found.length) KH.sfx('claim');
  }
  ACT.digmode = (m) => { UI.digMode = m === 'charge' && UI.digMode !== 'charge' ? 'charge' : 'trowel'; };
  ACT.dig = (arg) => {
    if (!unlocked() || !S.dig.open) return;
    const i = +arg, D = S.dig;
    if (!(i >= 0 && i < N) || cleared()) return;
    if (UI.digMode === 'charge') {
      if (KH.have('charge') < 1) { UI.digMode = 'trowel'; return KH.toast('No Blasting Charges. They come from every third layer\'s chest and the Digger\'s Kit.', 'warn'); }
      const area = [i, ...nbrs(i)].filter((j) => D.dug[j] !== 2);
      if (!area.length) return KH.toast('Nothing left to blast there.', 'warn');
      KH.pay({ charge: 1 });
      UI.digMode = 'trowel';
      const found = [];
      for (const j of area) { const f = open(j); if (f) found.push(f); }
      if (KH.duty) KH.duty('dig', area.length);
      UI.digJust = { at: Date.now(), tiles: area };
      KH.sfx('thunder');
      announce(found);
      return;
    }
    if (D.dug[i] === 2) return;
    if (KH.have('trowel') < 1) return KH.toast(`No Trowels left. A free one comes every ${Math.round(G.free.every / 60)} minutes.`, 'warn');
    KH.pay({ trowel: 1 });
    if (KH.duty) KH.duty('dig');
    if (D.rock[i] && D.dug[i] === 0) { D.dug[i] = 1; UI.digJust = { at: Date.now(), tiles: [i] }; KH.sfx('tap'); return; }
    const f = open(i);
    UI.digJust = { at: Date.now(), tiles: [i] };
    KH.sfx(D.cells[i] >= 0 ? 'coin' : 'build');
    announce(f ? [f] : []);
  };
  ACT.digdown = () => {
    if (!cleared()) return;
    const n = S.dig.layer, g = chestOf(n);
    const got = KH.scaleReward(g);
    KH.grant(got);
    KH.toast(`Layer ${n}'s chest: ${giveText(got)}`, 'good');
    newLayer(n + 1);
    UI.digJust = null;
    KH.emit('digLayer', { n: n + 1 });
    KH.sfx('claim');
  };
  ACT.buriedcity = () => {
    if (!unlocked()) return KH.toast(`The Buried City is found at Rainwyrm Lv ${G.unlock}.`, 'warn');
    UI.sheet = { kind: 'buriedcity' };
  };

  // the sheet: tools, the five relics, the grid
  const shapeHTML = (r, i) => `<span class="dg-shape" style="--c:${COLORS[i]};grid-template-columns:repeat(${Math.max(r.w, r.h)},8px)">${'<i></i>'.repeat(r.w * r.h)}</span>`;
  KH.sheets.buriedcity = () => {
    const D = S.dig, clear = knownClear(), done = cleared(), mode = UI.digMode === 'charge' ? 'charge' : 'trowel';
    const just = UI.digJust && Date.now() - UI.digJust.at < 900 ? new Set(UI.digJust.tiles) : new Set();
    const at = (i) => `grid-area:${((i / W) | 0) + 1}/${(i % W) + 1}`;
    const tiles = D.cells.map((c, i) => {
      const st = D.dug[i], j = just.has(i) ? 'just' : '';
      if (st === 2) {
        if (c >= 0) {
          const r = D.relics[c];
          return `<button class="dg-tile relic ${r.done ? 'whole' : ''} ${j}" style="${at(i)};--c:${COLORS[c]}" data-act="dig" data-arg="${i}" aria-label="${esc(KIND[r.kind].name)}">${r.done ? '' : icon(`i-dg-${r.kind}`)}</button>`;
        }
        const n = clue(i);
        return `<button class="dg-tile hollow ${j}" style="${at(i)}" data-act="dig" data-arg="${i}" aria-label="${n} relic pieces around">${n ? `<b class="n${Math.min(n, 5)}">${n}</b>` : ''}</button>`;
      }
      const cls = [D.rock[i] ? (st === 1 ? 'rock cracked' : 'rock') : 'sand', clear.has(i) ? 'clear' : '', j].join(' ');
      return `<button class="dg-tile ${cls}" style="${at(i)}" data-act="dig" data-arg="${i}" aria-label="${D.rock[i] ? 'Bedrock' : 'Sand'}">${D.rock[i] ? icon('i-dg-rock') : ''}</button>`;
    }).join('') + D.relics.map((r, c) => (r.done
      ? `<div class="dg-over" style="grid-area:${r.y + 1}/${r.x + 1}/span ${r.h}/span ${r.w};--c:${COLORS[c]}">${icon(`i-dg-${r.kind}`)}</div>` : '')).join('');
    const relics = D.relics.map((r, i) => {
      const got = relicTiles(r).filter((j) => D.dug[j] === 2).length, size = r.w * r.h;
      return `<div class="dg-relic ${r.done ? 'done' : ''}">${shapeHTML(r, i)}<span class="grow small"><b>${esc(KIND[r.kind].name)}</b>${i === D.relics.length - 1 ? ' <span class="chip r-legendary">Grand</span>' : ''}</span><span class="small">${r.done ? icon('i-check') : `${got}/${size}`}</span></div>`;
    }).join('');
    const nT = KH.have('trowel'), nC = KH.have('charge');
    const free = nT >= G.free.cap ? `Free Trowels wait while you hold ${G.free.cap}.` : `Next free Trowel in ${fmtTime(G.free.every - D.acc)}.`;
    const chest = KH.scaleReward(chestOf(D.layer));
    return {
      title: 'The Buried City', lvl: `Layer ${D.layer}`,
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'buriedcity', 'A city older than the keep, under the sand.') : ''}
        <div class="card row dg-tools"><span class="chip">${icon('i-dg-trowel')}<b>${fmt(nT)}</b> Trowel${nT === 1 ? '' : 's'}</span>
          <button class="btn small ${mode === 'charge' ? 'gold' : 'alt'} ${nC ? '' : 'off'}" data-act="digmode" data-arg="charge">${icon('i-dg-charge')}${nC} Charge${nC === 1 ? '' : 's'}</button>
          <span class="grow muted small">${free}</span></div>
        <p class="muted small">${mode === 'charge' ? '<b>Blasting:</b> tap a tile to clear it and the eight around it.' : 'Tap sand to dig. Dug sand shows how many relic pieces lie in the eight tiles around it. Bedrock takes two Trowels.'}</p>
        <div class="dg-grid ${mode}" style="grid-template-columns:repeat(${W},1fr)">${tiles}</div>
        ${done ? `<div class="card stack dg-chest"><div class="row"><b class="grow">Layer ${D.layer} cleared</b></div><div class="costs">${KH.rewardHTML(chest)}</div><button class="btn gold" data-act="digdown">${icon('i-dg-chest')}Open the chest and dig down to layer ${D.layer + 1}</button></div>` : ''}
        <div class="card stack"><div class="section-label">Five relics in this layer</div>${relics}</div>
        <details class="card dg-hall"><summary class="row"><b class="grow">The Relic Hall</b><span class="chip">${Object.keys(D.found || {}).length}/${Object.keys(KIND).length}</span></summary>
          <p class="muted small">The first of each kind dug up pays ${giveText(G.firstFind)} more.</p>
          <div class="dg-hall-grid">${Object.values(KIND).map((k) => `<span class="dg-hall-item ${(D.found || {})[k.id] ? 'on' : ''}">${icon(`i-dg-${k.id}`)}<small>${esc(k.name)}</small>${(D.found || {})[k.id] ? `<b>×${D.found[k.id]}</b>` : ''}</span>`).join('')}</div></details>`,
    };
  };
  KH.side.push({ id: 'buriedcity', icon: 'i-dg-trowel', label: 'Buried City', act: 'buriedcity', show: () => unlocked() && S.dig.open, dot: () => cleared() || KH.have('trowel') >= G.free.cap, badge: () => `${fmt(KH.have('trowel'))}` });

  KH.dig = { unlocked, cleared, clue, knownClear, newLayer, relicTiles, chestOf, payOf, W, H, N, nbrs, view: () => S.dig };
})();

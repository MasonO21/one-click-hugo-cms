/* global __DEBUG__ */
// Tiny Tides — game controller: owns the state, save/load, actions (sim + juice), tutorial, reminders.
import * as D from './data.js';
import * as S from './sim.js';
import * as A from './audio.js';
import { storage, haptic, notify, store, shareCanvas } from './platform.js';

const { FORMS, FAMILIES, PIECES } = D;
const BAK_KEY = D.SAVE_KEY + '.bak';

export function createGame(scene) {
  const G = {
    scene, state: null, ui: null, biome: 'tide', tab: 'pool', tool: null, selected: null,
    clockOffset: 0, reveals: [], busy: false, fresh: false, combo: { n: 0, t: 0 }, toastAt: 0,
    lastJson: '', lastBak: 0, dirty: false, saving: false,
  };
  G.now = () => Date.now() + G.clockOffset;
  const st = () => G.state;
  const pool = () => G.state.pools[G.biome];
  const view = (id) => scene.views.get(id);
  const posOf = (id) => { const v = view(id); return v ? scene.tileCenter(v.x, v.y) : [scene.W / 2, scene.H / 2]; };
  const tell = (msg, kind) => G.ui?.toast(msg, kind);
  const refresh = () => { tutorialTick(G.now()); G.ui?.refresh(); };
  const mark = () => { G.dirty = true; };
  const nameOf = (c) => FORMS[c.form].name;

  // ------------------------------------------------------------------ save / load
  G.load = async () => {
    const now = G.now();
    const [n1, w1] = await storage.get(D.SAVE_KEY);
    const [n2, w2] = await storage.get(BAK_KEY);
    const cands = [n1, w1, n2, w2].filter(Boolean).map((s) => S.deserialize(s, now)).filter(Boolean);
    cands.sort((a, b) => (b.lastTick || 0) - (a.lastTick || 0));
    G.fresh = !cands.length;
    G.state = cands[0] || S.newState(now);
    if (G.fresh) G.state.lastSeen = now;
    G.applySettings();
    return G.state;
  };
  G.save = async (force) => {
    if (!G.state || G.saving || (!G.dirty && !force)) return;
    G.saving = true;
    try {
      const now = Date.now();
      G.state.lastSeen = G.now();
      const json = S.serialize(G.state);
      if (G.lastJson && now - G.lastBak > 10 * 60e3) { await storage.set(BAK_KEY, G.lastJson); G.lastBak = now; }
      await storage.set(D.SAVE_KEY, json);
      G.lastJson = json; G.dirty = false;
    } finally { G.saving = false; }
  };
  G.reset = async () => {
    G.saving = true; G.dirty = false;            // stop autosave / pagehide save from resurrecting the old game
    await storage.remove(D.SAVE_KEY); await storage.remove(BAK_KEY);
    await notify.cancelAll();
    location.reload();
  };

  G.applySettings = () => {
    const s = st().settings;
    A.configure({ music: s.music, sfx: s.sfx });
    haptic.enable(s.haptics);
    scene.reduceMotion = !!s.reduceMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.toggle('reduce', scene.reduceMotion);
    scene.battery = s.battery;
  };
  G.setSetting = async (k, v) => {
    if (k === 'notif' && v) {
      const ok = await notify.request();
      if (!ok && notify.supported) { tell('Turn on notifications in iOS Settings to get reminders', 'warn'); v = false; }
      if (!notify.supported) { tell('Reminders are available in the app version', 'warn'); v = false; }
    }
    st().settings[k] = v; mark(); G.applySettings(); if (k === 'battery') scene.resize(scene.W, scene.H, window.devicePixelRatio, scene.insets); refresh();
  };

  // ------------------------------------------------------------------ events from the simulation
  G.handle = (events, o = {}) => {
    for (const e of events) {
      if (e.type === 'evolved') { G.reveals.push(e); }
      else if (e.type === 'levelup') { G.ui?.showLevelUp(e); A.play('levelup'); haptic.success(); scene.confetti(40); }
      else if (e.type === 'egg' && !o.silent && e.biome === G.biome) {
        A.play('bloop'); tell('An egg washed ashore!', 'good');
        const eg = pool().eggs.find((x) => x.id === e.id);
        if (eg) { scene.burst(eg.x, eg.y, 'bubble', 8, { colors: ['#fff'], speed: 50 }); scene.ring(eg.x, eg.y, '#fff'); }
      }
    }
    if (G.reveals.length && !o.silent) G.ui?.pumpReveals();
    mark();
  };

  G.tick = () => {
    if (!G.state) return;
    const now = G.now();
    const events = S.tick(G.state, now);
    S.ensureDaily(G.state, now);
    G.handle(events);
    tutorialTick(now);
  };

  /** Called after load / resume; returns a summary if the player was away. */
  G.catchUp = () => {
    const now = G.now(), s = G.state;
    const away = now - (s.lastSeen || now);
    const before = S.storedTotal(s);
    const events = S.tick(s, now);
    S.ensureDaily(s, now);
    const summary = {
      away, pearls: Math.max(0, Math.round(S.storedTotal(s) - before)),
      eggs: events.filter((e) => e.type === 'egg').length,
      evolved: events.filter((e) => e.type === 'evolved'),
      levelups: events.filter((e) => e.type === 'levelup'),
    };
    G.handle(events, { silent: true });
    mark();
    return summary;
  };

  // ------------------------------------------------------------------ actions: collecting & creatures
  const comboBump = () => { const t = performance.now(); G.combo.n = t - G.combo.t < 1500 ? G.combo.n + 1 : 1; G.combo.t = t; return G.combo.n; };
  G.collect = (id, delay = 0) => {
    const p0 = posOf(id);
    const amt = S.collect(st(), G.biome, id);
    if (!amt) return 0;
    const n = comboBump();
    setTimeout(() => {
      A.play('pop', n); haptic.pop();
      scene.burst(0, 0, 'pearl', 7, { px: p0[0], py: p0[1], lift: scene.ts * 0.7, speed: 110, size: 7, life: 0.7 });
      scene.burst(0, 0, 'bubble', 6, { px: p0[0], py: p0[1], lift: scene.ts * 0.7, speed: 80, colors: ['#bdf6ff', '#fff'], size: 8 });
      scene.text(0, 0, `+${amt}`, '#fff6b0', { px: p0[0], py: p0[1] - scene.ts * 0.6, size: 17 });
      if (n >= 4) scene.text(0, 0, `x${n} combo!`, '#ffb1e6', { px: p0[0], py: p0[1] - scene.ts * 1.1, size: 14 });
    }, delay);
    mark(); refresh();
    return amt;
  };
  G.collectAll = () => {
    const ids = pool().creatures.filter((c) => c.stored >= 1 && !c.evo).map((c) => c.id);
    let total = 0;
    ids.forEach((id, i) => { total += G.collect(id, i * 80); });
    if (total) tell(`+${total} pearls`, 'good');
    return total;
  };
  G.readyPearls = () => pool().creatures.reduce((a, c) => a + (c.evo ? 0 : Math.floor(c.stored)), 0);
  G.tapEgg = (id) => {
    const p = pool(), egg = p.eggs.find((e) => e.id === id), v = view(id), now = G.now();
    if (!egg) return;
    if (now < egg.ready) { A.play('tick'); if (v) v.squash = 1; tell(`Still warming… ${S.fmtDur(egg.ready - now)}`); return; }
    v.taps = (v.taps || 0) + 1; v.squash = 1; A.play('crack'); haptic.tap();
    scene.burst(egg.x, egg.y, 'spark', 5, { speed: 70, size: 4 });
    if (v.taps < 3) return;
    const res = S.hatchEgg(st(), G.biome, id, now);
    if (!res.ok) return;
    A.play('hatch'); haptic.success();
    scene.burst(egg.x, egg.y, 'spark', 16, { speed: 130 });
    scene.burst(egg.x, egg.y, 'heart', 5, { colors: ['#ff8fc4'], speed: 60, size: 9, up: 70 });
    scene.ring(egg.x, egg.y, '#fff');
    tell(`${FORMS[res.creature.form].name} hatched!`, 'good');
    G.handle(res.events);
    mark(); refresh();
  };
  G.pet = (id) => {
    const r = S.petCreature(st(), G.biome, id, G.now());
    scene.tap(id);
    const p = posOf(id);
    if (r.ok) {
      A.play('pet'); haptic.tap();
      scene.burst(0, 0, 'heart', 3, { px: p[0], py: p[1], lift: scene.ts * 0.6, colors: ['#ff8fc4', '#ff6fa8'], speed: 45, size: 9, up: 60 });
      mark();
    } else A.play('tick');
  };
  G.select = (id) => {
    G.selected = id; scene.selected = id;
    if (id) scene.tap(id);
    G.ui?.refreshSheet();
  };

  G.levelUp = (id) => {
    const r = S.levelUp(st(), G.biome, id);
    if (!r.ok) { if (r.reason === 'pearls') tell(`Need ${r.need} pearls`, 'warn'); A.play('error'); return r; }
    const c = pool().creatures.find((k) => k.id === id), p = posOf(id);
    A.play('coin'); haptic.tap(); scene.tap(id);
    scene.burst(0, 0, 'spark', 8, { px: p[0], py: p[1], lift: scene.ts * 0.3, speed: 90 });
    scene.text(0, 0, `Lv ${r.lvl}`, '#b9f5c4', { px: p[0], py: p[1] - scene.ts * 0.9, size: 16 });
    G.handle(r.events); mark(); refresh();
    return r;
  };
  G.evolve = (id) => {
    const r = S.startEvolution(st(), G.biome, id, G.now());
    if (!r.ok) { A.play('error'); return r; }
    const p = posOf(id);
    A.play('evolve'); haptic.heavy();
    scene.burst(0, 0, 'spark', 22, { px: p[0], py: p[1], speed: 150, size: 7 });
    scene.ring(0, 0, '#e6d0ff', { px: p[0], py: p[1], size: scene.ts * 1.2 });
    tell('Evolution started!', 'good'); mark(); refresh();
    return r;
  };
  G.speedUp = (id, mode) => {
    const r = S.speedUp(st(), G.biome, id, G.now(), mode);
    if (!r.ok) { if (r.reason === 'glass') { tell('Not enough Sea Glass', 'warn'); G.ui?.openShop('glass'); } A.play('error'); return r; }
    A.play('whoosh'); haptic.success(); G.handle(r.events); mark(); refresh();
    return r;
  };
  G.release = (id) => {
    const c = pool().creatures.find((k) => k.id === id);
    const r = S.releaseCreature(st(), G.biome, id, G.now());
    if (r.ok) { tell(`${c ? nameOf(c) : 'Friend'} swam home  +${r.refund}`, 'good'); A.play('bloop'); G.select(null); G.ui?.closeSheet(); mark(); refresh(); }
    return r;
  };
  G.setHat = (id, hat) => { if (S.setHat(st(), G.biome, id, hat)) { A.play('tap'); scene.tap(id); mark(); G.ui?.refreshSheet(); } };

  // ------------------------------------------------------------------ actions: building
  const FAIL = {
    pearls: (r) => `Need ${r.need} pearls`, locked: (r) => `Unlocks at Pool Lv ${r.lvl}`, occupied: () => 'A creature has no room to move',
    water: () => "Can't go on that water depth", piece: () => 'Remove the rock there first', max: () => 'Already at max depth', dry: () => 'Nothing to fill',
    empty: () => '', same: () => '', shore: () => 'Shore decor goes on dry sand', float: () => 'Floaty decor goes on water', notowned: () => 'Buy it in the Shop first', nope: () => '',
  };
  G.setTool = (tool) => {
    G.tool = tool; scene.toolTint = tool === 'dig' ? '#7cf0ff' : tool === 'fill' ? '#ffd9a0' : tool === 'erase' ? '#ff9ab0' : '#fff';
    A.play('tick'); G.ui?.refreshDock();
  };
  G.buildAt = (x, y) => {
    if (!G.tool) return null;
    const r = S.applyTool(st(), G.biome, G.tool, x, y);
    const idx = y * pool().w + x;
    if (!r.ok) {
      const msg = (FAIL[r.reason] || (() => ''))(r);
      const t = performance.now();
      if (msg && t - G.toastAt > 900) { tell(msg, 'warn'); G.toastAt = t; A.play('error'); haptic.warn(); }
      return r;
    }
    const [px, py] = scene.tileCenter(x, y);
    const kind = G.tool;
    if (kind === 'dig') { A.play('dig'); scene.burst(x, y, 'bubble', 7, { colors: ['#fff', '#bdf6ff'], speed: 70, size: 7 }); }
    else if (kind === 'fill') { A.play('fill'); scene.burst(x, y, 'spark', 4, { colors: ['#ffe9b0'], speed: 50, size: 4 }); }
    else if (kind === 'erase') { A.play('erase'); scene.burst(x, y, 'spark', 5, { colors: ['#ffc4d2'], speed: 60, size: 4 }); }
    else { A.play('place'); scene.pop(idx); scene.burst(x, y, 'spark', 6, { speed: 70, size: 5 }); }
    haptic.tap();
    if (r.cost) scene.text(0, 0, `-${r.cost}`, '#ffd6ee', { px, py: py - scene.ts * 0.2, size: 13, life: 0.8 });
    else if (r.refund) scene.text(0, 0, `+${r.refund}`, '#b9f5c4', { px, py: py - scene.ts * 0.2, size: 13, life: 0.8 });
    mark(); refresh();
    return r;
  };
  G.expand = () => {
    const r = S.expandPool(st(), G.biome);
    if (!r.ok) { tell(r.reason === 'pearls' ? `Need ${r.need} pearls` : r.reason === 'locked' ? `Unlocks at Pool Lv ${r.lvl}` : 'Fully expanded', 'warn'); A.play('error'); return r; }
    scene.relayout(); A.play('levelup'); haptic.success(); scene.confetti(30); tell(`Pool expanded to ${r.w}×${r.h}!`, 'good'); mark(); refresh();
    return r;
  };

  // ------------------------------------------------------------------ shop & rewards
  G.buyDecor = (id) => {
    const r = S.buyDecor(st(), id);
    if (!r.ok) { if (r.reason === 'pearls') tell(`Need ${r.need} pearls`, 'warn'); else if (r.reason === 'glass') { tell('Not enough Sea Glass', 'warn'); G.ui?.openShop('glass'); } A.play('error'); return r; }
    A.play('buy'); haptic.success(); tell(`${D.DECOR[id].name} unlocked!`, 'good'); if (D.DECOR[id].kind === 'skin' || D.DECOR[id].kind === 'fx') S.equip(st(), id); mark(); refresh();
    return r;
  };
  G.equip = (id) => { if (S.equip(st(), id)) { A.play('tap'); scene._baseKey = ''; mark(); refresh(); } };
  G.buyBoost = (id) => {
    const r = S.buyBoost(st(), id, G.now());
    if (!r.ok) { tell(r.reason === 'glass' ? 'Not enough Sea Glass' : r.reason === 'full' ? 'Your pool is full — release a friend first' : r.reason === 'nothing' ? 'Hatch a friend first!' : "Can't do that right now", 'warn'); if (r.reason === 'glass') G.ui?.openShop('glass'); A.play('error'); return r; }
    A.play('buy'); haptic.success(); scene.confetti(20);
    tell(id === 'sun' ? 'Sun Surge! Double pearls for 2 hours' : id === 'egg' ? 'A lucky egg washed ashore!' : `+${S.fmtNum(r.pearls)} pearls`, 'good'); mark(); refresh();
    return r;
  };
  G.claimGift = () => {
    const r = S.claimGift(st(), G.now());
    if (!r.ok) return r;
    A.play('gift'); haptic.success(); scene.confetti(30); mark(); refresh(); G.ui?.showReward('Tide Gift', r, r.window);
    return r;
  };
  G.claimDaily = () => {
    const r = S.claimDaily(st(), G.now());
    if (!r.ok) return r;
    A.play('gift'); haptic.success(); scene.confetti(40); mark(); refresh(); G.ui?.showReward(`Day ${r.n} reward`, r, r.saved ? 'Your streak shield saved you!' : 'Come back tomorrow for more!');
    return r;
  };
  G.claimQuest = (i) => { const r = S.claimQuest(st(), i); if (r.ok) { A.play('coin'); haptic.success(); scene.confetti(14); mark(); refresh(); } return r; };
  G.claimChest = () => { const r = S.claimQuestChest(st()); if (r.ok) { A.play('gift'); haptic.success(); scene.confetti(40); mark(); refresh(); G.ui?.showReward('Daily bonus chest', r, 'You cleared every quest!'); } return r; };
  G.claimDex = (i) => {
    const m = D.DEX_MILESTONES[i], s = st();
    if (!m || s.dexClaimed.includes(i) || S.dexCount(s) < m.n) return { ok: false };
    s.dexClaimed.push(i); s.cur.glass += m.glass; A.play('coin'); haptic.success(); scene.confetti(20); mark(); refresh();
    return { ok: true, glass: m.glass };
  };

  // ------------------------------------------------------------------ purchases
  const grant = async (pid, txId, opts = {}) => {
    const res = S.applyProduct(st(), pid, txId, G.now(), opts);
    if (!res.ok) return res;
    mark(); await G.save(true);            // persist the grant BEFORE telling the store we delivered
    await store.finish(txId);
    return res;
  };
  G.purchase = async (pid) => {
    if (G.busy) return;
    G.busy = true; G.ui?.setBusy(true);
    try {
      const r = await store.buy(pid);
      if (r.ok) {
        const res = await grant(pid, r.txId);
        if (res.ok && !res.dup) {
          A.play('buy'); haptic.success(); scene.confetti(70);
          const P = D.PRODUCTS[pid];
          tell(`${P.name} unlocked!`, 'good');
          G.ui?.showPurchased(pid);
        }
      } else if (r.pending) tell('Waiting for approval… your purchase will arrive automatically', 'warn');
      else if (r.error) tell(r.error, 'warn');
    } finally { G.busy = false; G.ui?.setBusy(false); refresh(); }
  };
  G.onStoreTransaction = async (pid, txId) => {
    const res = await grant(pid, txId);
    if (res.ok && !res.dup) { A.play('buy'); scene.confetti(50); tell(`${D.PRODUCTS[pid].name} delivered!`, 'good'); refresh(); }
  };
  G.restore = async () => {
    if (G.busy) return;
    G.busy = true; G.ui?.setBusy(true);
    try {
      const r = await store.restore();
      if (!r.ok) { tell(r.error || 'Could not restore purchases', 'warn'); return; }
      let n = 0;
      for (const it of r.items) { const res = await grant(it.id, `restore:${it.id}`, { restore: true }); if (res.ok && !res.dup) n++; }
      tell(n ? `Restored ${n} purchase${n > 1 ? 's' : ''}` : (store.mode === 'demo' ? 'Nothing to restore in the demo' : 'Everything is already restored'), 'good');
    } finally { G.busy = false; G.ui?.setBusy(false); refresh(); }
  };

  // ------------------------------------------------------------------ biome & tabs
  G.switchBiome = (b) => {
    if (b === G.biome) return;
    if (b === 'deep' && !st().iap.deep) { G.ui?.showDeepUpsell(); return; }
    G.biome = b; scene.setBiome(b); G.select(null); G.ui?.closeSheet(); A.play('whoosh'); refresh();
  };
  G.setTab = (tab) => {
    G.tab = tab; scene.buildMode = tab === 'build';
    if (tab !== 'build') { G.tool = null; scene.hover = null; }
    else if (!G.tool) G.tool = S.pieceUnlocked(st(), D.PIECES_BY_BIOME[G.biome][0]) ? 'dig' : 'dig';
    A.play('tick'); G.ui?.layoutChanged(); refresh();
  };

  // ------------------------------------------------------------------ photo mode
  G.snap = async () => {
    const cv = scene.snapshot(G.now());
    G.ui?.showPhoto(cv);
  };
  G.sharePhoto = async (cv) => {
    const r = await shareCanvas(cv, `My Tiny Tides pool — ${S.dexCount(st())} creatures discovered!`);
    if (r.downloaded) tell('Picture saved', 'good');
  };

  // ------------------------------------------------------------------ reminders (local notifications)
  G.scheduleReminders = async () => {
    const s = st();
    if (!s.settings.notif || !notify.supported) return;
    const now = G.now(), list = [];
    const quiet = (t) => { const d = new Date(t); const h = d.getHours() + d.getMinutes() / 60; if (h >= 8 && h < 21.5) return t; const n = new Date(t); if (h >= 21.5) n.setDate(n.getDate() + 1); n.setHours(8, 5, 0, 0); return n.getTime(); };
    // evolutions finishing
    for (const p of Object.values(s.pools)) for (const c of p.creatures) if (c.evo && c.evo.end > now) list.push({ t: quiet(c.evo.end + 30e3), title: `${nameOf(c)} is ready!`, body: 'Their evolution has finished. Come see who they became.' });
    // bubbles nearly full
    let stored = 0, cap = 0, rate = 0;
    for (const p of Object.values(s.pools)) for (const c of p.creatures) if (!c.evo) { const r = S.creatureRate(s, p, c, now); stored += c.stored; cap += r * D.bubbleCapHours(s.lvl); rate += r; }
    if (cap > 0 && rate > 0) { const need = cap * 0.9 - stored; list.push({ t: quiet(now + Math.max(need / rate, 1.5) * D.HOUR), title: 'Your bubbles are full', body: 'Pearls are waiting to be popped. Pop them before they stop growing!' }); }
    // next tide gift
    const g = S.nextGiftAt(now); if (g - now < 26 * D.HOUR) list.push({ t: quiet(g + 5 * 60e3), title: 'A Tide Gift washed ashore', body: 'Something shiny is waiting on the beach.' });
    list.sort((a, b) => a.t - b.t);
    const out = [];
    for (const it of list) if (!out.length || it.t - out[out.length - 1].t >= 2 * D.HOUR) out.push(it);
    await notify.schedule(out.slice(0, 5).map((it, i) => ({ id: 100 + i, title: it.title, body: it.body, at: new Date(it.t - G.clockOffset) })));
  };

  // ------------------------------------------------------------------ tutorial
  const T = () => st().tut;
  const freeTiles = (want) => {
    const p = st().pools.tide, out = [];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const t = S.tileAt(p, x, y); if (want(t, x, y) && !S.occupantAt(p, x, y)) out.push({ x, y }); }
    return out;
  };
  const cx = () => { const p = st().pools.tide; return [Math.floor(p.w / 2), Math.floor(p.h / 2) - 1]; };
  G.tutorial = () => {
    const s = st(), t = T();
    if (t.done) return null;
    const p = s.pools.tide, [mx, my] = cx();
    const water = p.tiles.filter((x) => x.w >= 1).length, rocks = p.tiles.filter((x) => x.p).length;
    switch (t.step) {
      case 1: return { text: 'Tap the sand to dig a little pool. Dig two tiles!', tab: 'build', tool: 'dig', tiles: [{ x: mx, y: my }, { x: mx, y: my + 1 }].filter((q) => S.tileAt(p, q.x, q.y)?.w < 1), progress: `${water}/2` };
      case 2: {
        const w = p.tiles.map((tl, i) => [tl, i]).find(([tl]) => tl.w >= 1);
        const wx = w ? w[1] % p.w : mx, wy = w ? Math.floor(w[1] / p.w) : my;
        const near = freeTiles((tl, x, y) => tl.w === 0 && !tl.p && Math.abs(x - wx) + Math.abs(y - wy) === 1).slice(0, 2);
        return { text: 'Now place a rock beside the water. Creatures love rocky shores!', tab: 'build', tool: 'piece:granite', tiles: near };
      }
      case 3: { const egg = p.eggs[0]; return { text: egg && G.now() < egg.ready ? 'Something is washing in…' : 'An egg! Tap it 3 times to hatch it.', tab: 'pool', tool: null, tiles: egg ? [{ x: egg.x, y: egg.y }] : [], noProgress: true }; }
      case 4: { const c = p.creatures[0]; return { text: 'Hello, little friend! Tap the bubble to pop your first pearls.', tab: 'pool', tool: null, tiles: c ? [{ x: c.x, y: c.y }] : [] }; }
      case 5: { const c = p.creatures[0]; return { text: 'Tap your friend, then Level up to Lv 3.', tab: 'pool', tool: null, tiles: c ? [{ x: c.x, y: c.y }] : [], target: '#sheet .btn-level' }; }
      case 6: {
        const c = p.creatures[0];
        const near = c ? freeTiles((tl, x, y) => !tl.p && Math.abs(x - c.x) + Math.abs(y - c.y) === 1 && tl.w <= 1).slice(0, 3) : [];
        const info = c && S.evoInfo(s, p, c);
        if (info?.canStart) return { text: 'Perfect — they love it here! Open your friend and tap Evolve.', tab: 'pool', tool: null, tiles: [{ x: c.x, y: c.y }], target: '#sheet .btn-evolve' };
        return { text: 'What your friend becomes depends on what surrounds them. Place rocks right next to them!', tab: 'build', tool: 'piece:granite', tiles: near, progress: info ? `Stone ${Math.round(info.traits.stone)}/${D.BRANCH_NEED}` : '' };
      }
      case 7: return { text: 'Evolving… this first one is quick. Watch the cocoon!', tab: 'pool', tool: null, tiles: [], noProgress: true };
      case 8: return { text: '', tab: 'pool', tiles: [] };
      default: return null;
    }
  };
  function tutorialTick(now) {
    const s = st(), t = T();
    if (!s.tut || t.done) return;
    const p = s.pools.tide, c = p.creatures[0];
    const adv = (n) => { t.step = n; mark(); G.ui?.tutorialChanged(); };
    switch (t.step) {
      case 0: break;
      case 1: if (p.tiles.filter((x) => x.w >= 1).length >= 2) { adv(2); } break;
      case 2: if (p.tiles.some((x) => x.p)) {
        const rp = p.tiles.findIndex((x) => x.p);
        S.spawnEgg(s, p, now, { fam: 'crab', near: [rp % p.w, Math.floor(rp / p.w)], warm: 4000 });
        adv(3); G.setTab('pool'); A.play('bloop');
      } break;
      case 3: if (c) { c.stored = Math.max(c.stored, 30); adv(4); } break;
      case 4: if (s.stats.collected >= 1) { s.cur.pearls = Math.max(s.cur.pearls, 60); adv(5); } break;
      case 5: if (c && c.lvl >= 3) { s.cur.pearls = Math.max(s.cur.pearls, 220); adv(6); } else if (c && s.cur.pearls < S.levelCost(1, c.lvl)) s.cur.pearls += S.levelCost(1, c.lvl); break;
      case 6: if (c?.evo) adv(7); else if (s.cur.pearls < 120) s.cur.pearls = 120; break;
      case 7: if (c && !c.evo && FORMS[c.form].stage >= 2) { adv(8); } break;
      case 8: break;
      default: break;
    }
  }
  G.tutorialStart = () => { T().step = 1; mark(); G.setTab('build'); G.ui?.tutorialChanged(); };
  G.tutorialFinish = () => {
    const t = T(), p = st().pools.tide;
    t.done = true; t.step = 9; p.nextEgg = G.now() + 6 * D.MIN; mark();
    st().cur.glass += 10;
    G.ui?.closeSheet(); G.setTab('pool'); G.ui?.tutorialChanged(); refresh();
  };
  G.tutorialSkip = () => {
    const t = T(); t.done = true; t.step = 9; st().flags.firstEvo = true; st().pools.tide.nextEgg = G.now() + 2 * D.MIN; st().cur.pearls = Math.max(st().cur.pearls, 150); mark();
    G.setTab('pool'); G.ui?.tutorialChanged(); refresh();
  };

  // ------------------------------------------------------------------ debug hooks (stripped from release builds)
  if (__DEBUG__) {
    window.__tt = {
      G, S, D, scene,
      advance(ms) { G.clockOffset += ms; G.tick(); refresh(); },
      give(o) { Object.assign(st().cur, o); refresh(); },
      level(n) { st().lvl = n; refresh(); },
    };
  }
  return G;
}

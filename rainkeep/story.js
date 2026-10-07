/*
 * Rainkeep story: the scene player, the Chronicle, the kin of Act III and the Hero Tales.
 * The words live in lore.js (DATA.cast, DATA.scenes, DATA.kin, DATA.tales).
 *
 *  Scenes   a short dialogue plays before a stage's first fight (boss stages and act openings).
 *           Full-screen overlay with portraits; tap to advance, Skip to jump to the fight. Replay
 *           any scene you have seen from the chapter card or the Chronicle.
 *  Kin      the elder Rainwyrms freed in Act III: lasting perks, a sheet when each wakes, a card on
 *           the Rainwyrm's sheet; town3d.js rests them on the canyon rim.
 *  Tales    three chapters per hero, each a page of story and a fight with that hero leading the
 *           squad; the last ends in a choice that makes the hero's skill or steward post stronger.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, fmt, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const HERO = KH.HERO;
  let S = null;

  KH.hooks.defaults.push((s) => {
    s.story.scenes = [];
    s.story.kin = [];
    s.story.act3Mail = false;
    s.tales = {};
    s.settings.scenes = true;
    Object.assign(s.stats, { scenes: 0, kin: 0, taleParts: 0, talesDone: 0 });
  });
  KH.hooks.boot.push(() => {
    S = KH.S;
    // saves from before Act III: kin already passed wake quietly, and veterans get a letter
    for (const k of DATA.kin) if (S.stage > k.at && !S.story.kin.includes(k.id)) S.story.kin.push(k.id);
    S.stats.kin = freed().filter((k) => !k.mother).length;
    if (S.stage > DATA.actTwoStage && !S.story.act3Mail) {
      S.story.act3Mail = true;
      KH.mail('A song from the south', `Since the Ember Throne broke, ${S.wyrm.name} has been singing toward the south, and something sings back. Act III, The Wyrmsong, runs from stage 101 to 150. Every hero now has a tale to tell, too: look for them on each hero's page.`, { starglass: 300, journals: 60 });
    }
  });
  const fill = (t) => t.replace(/\{wyrm\}/g, S.wyrm.name).replace(/\{lead\}/g, leadName());
  const first = (id) => HERO[id].name.split(' ')[0];
  const leadName = () => { const id = S.squad.find((h) => S.heroes[h]); return id ? first(id) : 'Hadi'; };

  // ======================================================================
  // Kin
  // ======================================================================
  const kinOf = (id) => DATA.kin.find((k) => k.id === id);
  const freed = () => (S ? DATA.kin.filter((k) => S.stage > k.at) : []);
  KH.kinFreed = freed;
  KH.hooks.bonus.push((key) => {
    if (!S || S.stage <= DATA.kin[0].at) return 0;
    let v = 0;
    for (const k of DATA.kin) if (S.stage > k.at) for (const [pk, pv] of k.perks) if (pk === key) v += pv;
    return v;
  });
  // a sheet-sized portrait of a kin wyrm (painted like the Rainwyrm's, in the kin's colours)
  KH.kinCanvas = (id, cls = '', w = 320, h = 200) => {
    const k = kinOf(id);
    return `<canvas class="wyrm-portrait ${cls}" data-wyrm="${k.level}" data-element="" data-skin="${k.skin}" width="${w}" height="${h}"></canvas>`;
  };
  KH.on('stage', (e) => {
    const k = DATA.kin.find((x) => x.at === e.n);
    if (!k) return;
    S.stats.kin = freed().filter((x) => !x.mother).length;
    // the Mother wakes in the ending itself. Queued behind whatever is open: the battle screen may not
    // be up yet when a fight resolves at once
    if (!k.mother && !S.story.kin.includes(k.id) && !UI.sheetQueue.some((s) => s.kind === 'kin' && s.id === k.id)) UI.sheetQueue.push({ kind: 'kin', id: k.id });
  });
  KH.sheets.kin = () => {
    const k = kinOf(UI.sheet.id);
    if (!S.story.kin.includes(k.id)) S.story.kin.push(k.id);
    const left = DATA.kin.filter((x) => !x.mother && S.stage <= x.at).length;
    return {
      title: '', lvl: '',
      body: `<div class="evolve">${KH.kinCanvas(k.id, 'big')}<span class="section-label">The kin are waking</span><h1>${esc(k.name)}, ${esc(k.title)}</h1></div>
        <p class="lore">${esc(fill(k.line))}</p><p class="lore">${esc(fill(k.rest))}</p>
        <div class="card"><b>A lasting gift</b><div class="muted small">${esc(k.perk)}</div></div>
        <p class="muted small" style="text-align:center">${left ? `${left} of the kin still ${left === 1 ? 'sleeps' : 'sleep'} in the south.` : 'Only the Mother of Rains still sleeps, at the bottom of the Well.'}</p>
        <button class="btn wide gold" data-act="kinshow" data-arg="${k.id}">Welcome home</button>`,
    };
  };
  // fly the keep's camera to where a kin rests (town3d.js places them on the canyon rim)
  ACT.kinshow = (id) => {
    const T3 = KH.town3d;
    if (UI.sheet && UI.sheet.kind === 'kin' && !S.story.kin.includes(id)) S.story.kin.push(id);
    UI.sheet = null;
    if (UI.tab !== 'town') ACT.tab('town');
    const v = T3 && T3.kinView && T3.kinView(id);
    if (v && T3.flyTo) T3.flyTo(v);
  };
  // the kin card under the bond card on the Rainwyrm's sheet
  const wyrmTop = KH.wyrmTop;
  KH.wyrmTop = () => {
    const base = wyrmTop ? wyrmTop() : '';
    if (S.stage <= DATA.actTwoStage) return base;
    const f = freed();
    const rows = DATA.kin.map((k) => (S.stage > k.at
      ? `<div class="kin-row row"><div class="grow"><b>${esc(k.name)}</b> <span class="muted small">${esc(k.title)}</span><div class="small">${esc(k.perk)}</div></div><button class="btn small alt" data-act="kinshow" data-arg="${k.id}">Show me</button></div>`
      : `<div class="kin-row off"><b>???</b> <span class="muted small">Sleeps beyond stage ${k.at}</span></div>`)).join('');
    return `${base}<div class="card stack kin-card"><div class="row"><div class="grow"><b>The kin</b><div class="muted small">${f.length ? `${f.length} of ${DATA.kin.length} elder wyrms have come home.` : `Somewhere past the Burning Line, ${esc(S.wyrm.name)}'s kin are sleeping.`}</div></div></div>${rows}</div>`;
  };

  // ======================================================================
  // Scene player
  // ======================================================================
  let SC = null; // { n, lines, i, shown, typing, timer, onDone, replay }
  function speaker(code, n) {
    if (DATA.cast[code]) { const c = DATA.cast[code]; return { key: code, name: c.name, side: 'l', art: KH.art.portrait(c) }; }
    if (code === 'wyrm') return { key: 'wyrm', name: S.wyrm.name, side: 'l', art: KH.wyrmCanvas({ cls: 'sc-wyrm', w: 300, h: 330 }) };
    if (code === 'lead') {
      const id = S.squad.find((h) => S.heroes[h]);
      return id ? { key: `h-${id}`, name: first(id), side: 'l', art: KH.art.portrait(id) } : speaker('hadi', n);
    }
    if (code === 'foe') {
      const f = KH.enemyFor(n);
      return { key: 'foe', name: f.name, side: 'r', art: KH.art.foe(f, 'sc-foe') };
    }
    const k = kinOf(code);
    if (k) return { key: code, name: `${k.name}, ${k.title}`, side: 'l', art: KH.kinCanvas(k.id, 'sc-wyrm', 300, 330) };
    return { key: code, name: code, side: 'l', art: '' };
  }
  function overlay() {
    let el = $('#scene');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'scene';
    el.hidden = true;
    el.innerHTML = `<div class="sc-sky"></div>
      <div class="sc-head"><span class="sc-ch"></span><button class="btn small alt sc-skip" type="button">Skip</button></div>
      <div class="sc-stage">
        <svg class="sc-land" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <circle class="glow" cx="238" cy="112" r="46"/><circle class="sun" cx="238" cy="112" r="24"/>
          <path class="d3" d="M0 172 C60 148 130 158 190 170 C250 182 330 148 400 160 L400 300 L0 300Z"/>
          <path class="d2" d="M0 208 C70 188 150 198 230 212 C300 224 350 198 400 204 L400 300 L0 300Z"/>
          <path class="d1" d="M0 246 C80 228 160 238 230 250 C300 260 350 242 400 246 L400 300 L0 300Z"/>
        </svg>
        <div class="sc-title"><span class="sc-act"></span><b class="sc-chname"></b></div>
        <div class="sc-cast"><div class="sc-por sc-l"></div><div class="sc-por sc-r"></div></div>
      </div>
      <div class="sc-box"><div class="sc-name"></div><p class="sc-text"></p><span class="sc-more">Tap to continue</span></div>`;
    $('#battle').parentNode.appendChild(el);
    el.querySelector('.sc-skip').addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); advance(); });
    window.addEventListener('keydown', (e) => {
      if (!SC) return;
      if (e.key === 'Escape') { e.preventDefault(); finish(); } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
    }, true);
    return el;
  }
  function play(n, onDone, replay = false) {
    const lines = DATA.scenes[n];
    if (!lines) { if (onDone) onDone(); return; }
    const el = overlay(), ch = KH.chapterOf(n);
    SC = { n, lines, i: -1, onDone, replay, timer: null, shown: 0, l: null, r: null };
    const act = Math.min(3, ch.act || 1), idx = DATA.chapters.indexOf(ch) + 1;
    el.className = `act${act}`;
    el.querySelector('.sc-ch').textContent = `Stage ${n}${DATA.bosses[n] ? ' · Boss' : ''}`;
    el.querySelector('.sc-act').textContent = `${['Act I', 'Act II', 'Act III'][act - 1]} · Chapter ${idx}`;
    el.querySelector('.sc-chname').textContent = ch.name;
    el.querySelector('.sc-l').innerHTML = '';
    el.querySelector('.sc-r').innerHTML = '';
    // a boss waits on the right from the start, so the scene reads as a face-off
    if (lines.some(([who]) => who === 'foe')) { const f = speaker('foe', n); el.querySelector('.sc-r').innerHTML = f.art; SC.r = 'foe'; }
    el.hidden = false;
    KH.sfx('chime');
    next();
  }
  function next() {
    const el = $('#scene');
    SC.i++;
    if (SC.i >= SC.lines.length) return finish();
    const [who, raw] = SC.lines[SC.i];
    const sp = speaker(who, SC.n);
    const slot = el.querySelector(sp.side === 'r' ? '.sc-r' : '.sc-l');
    if (SC[sp.side] !== sp.key) {
      slot.innerHTML = sp.art;
      SC[sp.side] = sp.key;
      if (KH.paintWyrms) KH.paintWyrms(slot);
    }
    el.querySelector('.sc-l').classList.toggle('on', sp.side === 'l');
    el.querySelector('.sc-r').classList.toggle('on', sp.side === 'r');
    const narr = raw.startsWith('*') && raw.endsWith('*');
    const text = fill(narr ? raw.slice(1, -1) : raw);
    el.querySelector('.sc-name').textContent = sp.name;
    el.querySelector('.sc-name').className = `sc-name ${sp.side}`;
    const p = el.querySelector('.sc-text');
    p.className = `sc-text ${narr ? 'narr' : ''}`;
    // type the line out; a tap finishes it
    SC.text = text; SC.shown = 0;
    clearInterval(SC.timer);
    p.textContent = '';
    SC.timer = setInterval(() => {
      SC.shown = Math.min(SC.text.length, SC.shown + 2);
      p.textContent = SC.text.slice(0, SC.shown);
      if (SC.shown >= SC.text.length) { clearInterval(SC.timer); SC.timer = null; }
    }, 22);
  }
  function advance() {
    if (!SC) return;
    if (SC.timer) { clearInterval(SC.timer); SC.timer = null; $('#scene .sc-text').textContent = SC.text; return; }
    KH.sfx('tap');
    next();
  }
  function finish() {
    if (!SC) return;
    clearInterval(SC.timer);
    const { n, onDone, replay } = SC;
    SC = null;
    $('#scene').hidden = true;
    if (!replay && !S.story.scenes.includes(n)) { S.story.scenes.push(n); S.stats.scenes++; }
    if (onDone) onDone();
  }
  KH.playScene = play;
  KH.sceneActive = () => !!SC;

  // a stage's scene plays before its first fight
  const fight = ACT.fight;
  ACT.fight = (...a) => {
    const n = S.stage;
    if (DATA.scenes[n] && !S.story.scenes.includes(n) && !KH.quickBattles && S.settings.scenes !== false && KH.squadHome().length && !UI.battle) {
      return play(n, () => fight(...a));
    }
    return fight(...a);
  };
  ACT.scene = (n) => play(Number(n), null, true);

  // scenes of a chapter, listed on its story card
  const chapterEnd = (ch) => { const i = DATA.chapters.indexOf(ch); return DATA.chapters[i + 1] ? DATA.chapters[i + 1].from : Infinity; };
  const scenesIn = (ch) => Object.keys(DATA.scenes).map(Number).filter((n) => n >= ch.from && n < chapterEnd(ch));
  KH.chapterScenes = (ch) => {
    const list = scenesIn(ch);
    if (!list.length) return '';
    return `<div class="section-label">Scenes</div><div class="scene-list">${list.map((n) => {
      const seen = S.story.scenes.includes(n), boss = DATA.bosses[n];
      const label = boss ? `Stage ${n} · ${boss[0]}` : `Stage ${n}`;
      return seen ? `<button class="btn small alt" data-act="scene" data-arg="${n}">${icon('i-play')}${esc(label)}</button>`
        : `<span class="chip off">${icon('i-lock')}${esc(label)}</span>`;
    }).join('')}</div>`;
  };
  ACT.chronicle = () => { UI.sheet = { kind: 'chronicle' }; };
  KH.sheets.chronicle = () => {
    const total = Object.keys(DATA.scenes).length;
    const acts = [[1, 'Act I · The Rains'], [2, 'Act II · The Long Rains'], [3, 'Act III · The Wyrmsong']];
    const body = acts.map(([a, label]) => {
      const chs = DATA.chapters.filter((c) => (c.act || 1) === a && c.from <= DATA.finalStage);
      if (!chs.length || chs[0].from > S.stage) return '';
      return `<div class="section-label">${label}</div><div class="stack">${chs.filter((c) => c.from <= S.stage).map((c) => {
        const sc = scenesIn(c), seen = sc.filter((n) => S.story.scenes.includes(n)).length;
        return `<button class="card row chron-row" data-act="story" data-arg="${c.from}"><div class="grow"><b>${esc(c.name)}</b><div class="muted small">Stages ${c.from}-${chapterEnd(c) - 1} · ${seen}/${sc.length} scenes</div></div>${icon('i-play')}</button>`;
      }).join('')}</div>`;
    }).join('');
    const ends = [[S.endingSeen, 1, DATA.ending.title], [S.ending2Seen, 2, DATA.ending2.title], [S.ending3Seen, 3, DATA.ending3.title]].filter((e) => e[0]);
    return {
      title: 'Chronicle', lvl: `${S.story.scenes.length}/${total} scenes`,
      body: `<p class="muted small">Every chapter you have reached, and every scene you have watched. Tap a chapter to read it again.</p>${body}
        ${ends.length ? `<div class="section-label">Endings</div><div class="row wrap">${ends.map(([, a, t]) => `<button class="btn small alt" data-act="reending" data-arg="${a}">${esc(t)}</button>`).join('')}</div>` : ''}`,
    };
  };
  // re-read an ending (no second reward: the close handler only pays once)
  ACT.reending = (a) => { UI.sheet = { kind: 'ending', act: Number(a) === 1 ? undefined : Number(a) }; };

  // ======================================================================
  // Hero Tales
  // ======================================================================
  const T = DATA.tales;
  const taleOf = (id) => ((S.tales && S.tales[id]) || { part: 0 });
  const needOf = (p) => DATA.taleNeeds[p];
  const needMet = (id, p) => { const h = S.heroes[id], nd = needOf(p); return !!h && h.lvl >= nd.lvl && h.stars >= nd.stars; };
  const needText = (p) => { const nd = needOf(p); return `Lv ${nd.lvl}${nd.stars > 1 ? ` and ${nd.stars} stars` : ''}`; };
  KH.taleReady = (id) => {
    if (!S || !T[id] || !S.heroes[id]) return false;
    const t = taleOf(id);
    return t.part >= 3 ? !t.choice : needMet(id, t.part);
  };
  KH.taleAny = () => !!S && Object.keys(S.heroes).some(KH.taleReady);
  // the lasting perk a finished tale gives: 'skill' (battle) or 'steward' (keep)
  KH.taleBoost = (id, kind) => {
    const t = S && S.tales && S.tales[id];
    if (!t || !t.choice) return 0;
    return (t.choice === 'a') === (kind === 'skill') ? DATA.talePerk[kind] : 0;
  };
  const perkText = (id, c) => {
    const post = DATA.stewardPosts[HERO[id].steward.kind];
    return c === 'a' ? `${HERO[id].skill.name} grows ${Math.round(DATA.talePerk.skill * 100)}% stronger` : `${Math.round(DATA.talePerk.steward * 100)}% more from ${first(id)} as steward of the ${KH.plotName(post.plot)}`;
  };
  const foeFor = (id, p) => {
    const part = T[id].parts[p], n = Math.max(3, S.stage - 8), boss = p === 2;
    return { n, name: part.foe[0], cls: part.foe[1], boss, chapter: T[id].name, ...KH.foeStats(n, boss ? 1.2 : 1) };
  };

  KH.heroTale = (id) => {
    const d = T[id];
    if (!d || !S.heroes[id]) return '';
    const t = taleOf(id);
    const rows = d.parts.map((p, i) => {
      if (i < t.part) return `<div class="tale-row done"><span>${icon('i-check')}</span><b class="grow">${esc(p.title)}</b><button class="btn small alt" data-act="tale" data-arg="${id}:${i}">Read</button></div>`;
      if (i === t.part) return needMet(id, i)
        ? `<div class="tale-row next"><span>${i + 1}</span><b class="grow">${esc(p.title)}</b><button class="btn small gold" data-act="tale" data-arg="${id}:${i}">Read</button></div>`
        : `<div class="tale-row"><span>${i + 1}</span><span class="grow muted small">Opens at ${needText(i)}</span></div>`;
      return `<div class="tale-row"><span>${i + 1}</span><span class="grow muted small">Opens at ${needText(i)}</span></div>`;
    }).join('');
    const end = t.choice ? `<div class="muted small">Chosen: <b>${esc(d.choice[t.choice].label)}</b>. ${esc(perkText(id, t.choice))}.</div>`
      : t.part >= 3 ? `<button class="btn wide gold" data-act="talechoose" data-arg="${id}">Choose how the tale ends</button>` : '';
    return `<div class="card stack tale-card"><div class="row"><div class="grow"><b>Tale: ${esc(d.name)}</b><div class="muted small">${t.part}/3 chapters · the ending makes ${esc(first(id))} stronger for good</div></div></div>${rows}${end}</div>`;
  };
  KH.rosterExtras = () => {
    const owned = Object.keys(S.heroes).filter((id) => T[id]);
    if (!owned.length) return '';
    const ready = owned.filter(KH.taleReady).length;
    const done = owned.filter((id) => taleOf(id).choice).length;
    return `<button class="card row tales-entry" data-act="tales"><div class="grow"><b>Hero Tales</b><div class="muted small">${ready ? `${ready} chapter${ready > 1 ? 's' : ''} ready to read` : 'Level and star your heroes to open their stories'} · ${done}/${Object.keys(T).length} told</div></div>${ready ? '<span class="tale-dot"></span>' : ''}${icon('i-play')}</button>`;
  };
  ACT.tales = () => { UI.sheet = { kind: 'tales' }; };
  KH.sheets.tales = () => {
    const ids = Object.keys(T).filter((id) => S.heroes[id]).sort((a, b) => (KH.taleReady(b) ? 1 : 0) - (KH.taleReady(a) ? 1 : 0) || taleOf(b).part - taleOf(a).part);
    const rows = ids.map((id) => {
      const t = taleOf(id), ready = KH.taleReady(id);
      const state = t.choice ? 'Told' : t.part >= 3 ? 'Choose an ending' : ready ? `Chapter ${t.part + 1} ready` : `Chapter ${t.part + 1} at ${needText(t.part)}`;
      return `<button class="card row tale-pick ${ready ? 'ready' : ''}" data-act="hero" data-arg="${id}"><div class="tale-face">${KH.art.portrait(id)}</div><div class="grow"><b>${esc(T[id].name)}</b><div class="muted small">${esc(first(id))} · ${t.part}/3 · ${state}</div></div>${ready ? '<span class="tale-dot"></span>' : ''}</button>`;
    }).join('');
    const missing = Object.keys(T).length - ids.length;
    return {
      title: 'Hero Tales', lvl: `${ids.filter((id) => taleOf(id).choice).length}/${Object.keys(T).length} told`,
      body: `<p class="muted small">Every hero has a story in three chapters. Each chapter is a fight with that hero leading your squad; the last ends in a choice that makes them stronger for good.</p><div class="stack">${rows}</div>${missing ? `<p class="muted small">${missing} more tale${missing > 1 ? 's' : ''} for heroes you have not recruited yet.</p>` : ''}`,
    };
  };

  // reading a chapter: its page, then the fight (or, for a chapter already won, just the page)
  ACT.tale = (arg) => {
    const [id, ps] = String(arg).split(':');
    const p = Number(ps);
    if (!T[id] || !S.heroes[id]) return;
    UI.sheet = { kind: 'tale', id, p };
  };
  KH.sheets.tale = () => {
    const { id, p } = UI.sheet, d = T[id], part = d.parts[p], t = taleOf(id);
    const fresh = p === t.part && needMet(id, p);
    const foe = foeFor(id, p);
    const r = DATA.taleRewards[p];
    const reward = { ...r };
    delete reward.shards;
    return {
      title: '', lvl: '',
      body: `<div class="tale-head"><div class="tale-face big">${KH.art.portrait(id)}</div><div><span class="section-label">${esc(d.name)} · Chapter ${p + 1} of 3</span><h1>${esc(part.title)}</h1></div></div>
        <p class="lore">${esc(fill(part.text))}</p>
        ${fresh ? `<div class="card stack"><div class="row"><div class="tale-foe">${KH.art.foe(foe, 'b-enemy')}</div><div class="grow"><b>${esc(foe.name)}</b><div class="muted small">${icon(DATA.classes[foe.cls].icon)} ${DATA.classes[foe.cls].name}s · as strong as stage ${foe.n}${foe.boss ? ', and then some' : ''}. ${esc(first(id))} leads the squad.</div></div></div>
          <div class="costs">${KH.rewardHTML(reward)}${r.shards ? `<span class="chip">+${r.shards} ${esc(first(id))} shards</span>` : ''}</div>
          <button class="btn wide gold" data-act="talefight" data-arg="${id}" data-primary>Fight</button></div>`
          : `<button class="btn wide alt" data-act="hero" data-arg="${id}">Back to ${esc(first(id))}</button>`}`,
    };
  };
  ACT.talefight = (id) => {
    const t = taleOf(id), p = t.part;
    if (!T[id] || p >= 3 || !needMet(id, p)) return;
    const home = KH.squadHome();
    if (!home.length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    if (KH.heroBusy && KH.heroBusy(id)) return KH.toast(`${first(id)} is out leading a march.`, 'warn');
    const foe = foeFor(id, p);
    const heroes = [id, ...home.filter((x) => x !== id)].slice(0, 3);
    const team = KH.teamStats(foe.cls, { heroes });
    KH.fightLive({
      title: `${T[id].name} · Chapter ${p + 1}`, foe, team,
      onEnd: (result) => {
        let rewards = null;
        const after = [];
        if (result.win && taleOf(id).part === p) {
          const r = DATA.taleRewards[p];
          rewards = { ...r };
          delete rewards.shards;
          KH.grant(rewards);
          if (r.shards) S.heroes[id].shards += r.shards;
          S.tales[id] = { ...taleOf(id), part: p + 1 };
          S.stats.taleParts++;
          if (p === 2) after.push({ kind: 'talechoice', id });
          KH.emit('tale', { id, part: p + 1 });
        }
        KH.emit('battle', { kind: 'tale', win: result.win, foe });
        KH.save();
        return { rewards, after, extra: result.win && r0(id, p) ? r0(id, p) : '' };
      },
    });
  };
  const r0 = (id, p) => (DATA.taleRewards[p].shards ? `+${DATA.taleRewards[p].shards} ${first(id)} shards.` : '');
  ACT.talechoose = (id) => { UI.sheet = { kind: 'talechoice', id }; };
  KH.sheets.talechoice = () => {
    const id = UI.sheet.id, d = T[id], c = d.choice;
    const opt = (k) => `<div class="card stack tale-opt"><b>${esc(c[k].label)}</b><p class="small">${esc(fill(c[k].text))}</p><div class="muted small">${k === 'a' ? 'In battle' : 'In the keep'}: ${esc(perkText(id, k))}.</div>
      <button class="btn ${k === 'a' ? '' : 'alt'}" data-act="talepick" data-arg="${id}:${k}">Choose</button></div>`;
    return {
      title: '', lvl: '',
      body: `<div class="tale-head"><div class="tale-face big">${KH.art.portrait(id)}</div><div><span class="section-label">${esc(d.name)} · The ending</span><h1>${esc(first(id))}'s choice</h1></div></div>
        <p class="lore">${esc(fill(c.prompt))}</p>${opt('a')}${opt('b')}<p class="muted small" style="text-align:center">This can't be changed.</p>`,
    };
  };
  ACT.talepick = (arg) => {
    const [id, k] = String(arg).split(':');
    const t = taleOf(id);
    if (!T[id] || t.part < 3 || t.choice || (k !== 'a' && k !== 'b')) return;
    S.tales[id] = { ...t, choice: k };
    S.stats.talesDone++;
    KH.grant({ starglass: 300 });
    KH.sfx('complete');
    KH.toast(`${T[id].name} is told. ${perkText(id, k)}.`, 'good');
    KH.emit('tale', { id, done: true });
    UI.sheet = { kind: 'hero', id };
  };

  // for tests and the balance bot
  KH.tales = { ready: KH.taleReady, of: taleOf, fight: ACT.talefight, pick: ACT.talepick };
})();

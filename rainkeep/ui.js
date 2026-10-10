/*
 * Rainkeep UI: HUD, tabs, panels, sheets, toasts, battles, hints, input.
 * Feature scripts add their own pieces through KH.panels, KH.sheets, KH.side,
 * KH.chips and KH.renderHooks.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, sum, fmt, fmtTime, fmtTemp, perMin, icon, esc, today } = KH.u;
  const { HERO, PLOT, RES, ICON, NAME, SHORT, plotName, UI, ACT } = KH;
  let S = null;
  KH.on('booted', () => { S = KH.S; });
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.panels = KH.panels || {};
  KH.sheets = KH.sheets || {};
  KH.side = KH.side || [];
  KH.chips = KH.chips || [];
  KH.plotRows = KH.plotRows || {}; // type -> (pid, L, N, up) => [[label, value, next], ...] for the building sheet
  KH.plotExtras = KH.plotExtras || {}; // type -> (pid, R) => extra HTML on the building sheet
  KH.worldTabs = KH.worldTabs || []; // extra World subtabs: { id, label, panel(), dot() }
  KH.renderHooks = KH.renderHooks || [];
  UI.prices = {};

  const audio = (name) => { if (window.KHAudio && S && S.settings.sfx) window.KHAudio.sfx(name); };
  const haptic = (kind) => { if (window.KHNative && S && S.settings.haptics) window.KHNative.haptic(kind); };
  KH.sfx = audio;
  KH.haptic = haptic;

  // ======================================================================
  // Small builders
  // ======================================================================
  function rewardHTML(g) {
    return Object.entries(g).map(([k, v]) => {
      if (ICON[k]) return `<span class="chip">${icon(ICON[k])}${fmt(v)}</span>`;
      if (DATA.items[k]) return `<span class="chip">${icon(DATA.items[k].icon)}${v > 1 ? `${v}× ` : ''}${esc(DATA.items[k].name)}</span>`;
      if (k === 'builder2') return `<span class="chip">${icon('i-hammer')}2nd builder</span>`;
      if (k === 'stipend') return `<span class="chip">${icon('i-gem')}90/day × ${v}</span>`;
      if (k === 'ledger') return `<span class="chip">${icon('i-journal')}Premium track</span>`;
      if (k === 'growth') return `<span class="chip">${icon('i-gem')}Growth Fund</span>`;
      if (k === 'skin') return `<span class="chip">${icon('i-beacon')}${esc(DATA.skins[v].name)} skin</span>`;
      if (k === 'cpoints') return `<span class="chip">${icon('i-caravan')}${fmt(v)} Caravan points</span>`;
      if (k === 'survivors') return `<span class="chip">${icon('i-people')}${v} survivors</span>`;
      return '';
    }).join(' ');
  }
  function costHTML(c, mult = 1) {
    return `<div class="costs">${Object.entries(c).map(([k, v]) => {
      const need = v * mult, have = KH.have(k);
      const ic = ICON[k] || (DATA.items[k] && DATA.items[k].icon) || 'i-gem';
      return `<span class="cost ${have < need ? 'short' : ''}">${icon(ic)}${fmt(need)}</span>`;
    }).join('')}</div>`;
  }
  const starsHTML = (n) => `<span class="stars">${Array.from({ length: DATA.heroMaxStars }, (_, i) => icon('i-star', i < n ? '' : 'off')).join('')}</span>`;
  const subtabs = (tab, opts) => `<div class="subtabs">${opts.map(([id, label, dot]) => `<button class="${UI.sub[tab] === id ? 'on' : ''}" data-act="sub" data-arg="${tab}:${id}">${label}${dot ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>`;
  const price = (id, usd) => UI.prices[id] || `$${usd.toFixed(2)}`;
  Object.assign(KH, { rewardHTML, costHTML, starsHTML, subtabs });

  // ======================================================================
  // Portraits
  // ======================================================================
  // Illustrated hero portraits and foe art live in art2d.js.
  const portrait = (id) => KH.art.portrait(id);
  const foeArt = (foe, cls = 'b-enemy') => KH.art.foe(foe, cls);
  // A canvas placeholder that art2d.js paints with the wyrm (see KH.paintWyrms).
  const wyrmCanvas = (opts = {}) => `<canvas class="wyrm-portrait ${opts.cls || ''}" data-wyrm="${opts.level || S.lv.wyrm}" data-element="${opts.element || S.wyrm.element || ''}" data-skin="${opts.skin || S.skins.on}" width="${opts.w || 320}" height="${opts.h || 200}"></canvas>`;
  Object.assign(KH, { portrait, foeArt, wyrmCanvas });

  // ======================================================================
  // DOM rendering helpers
  // ======================================================================
  function setHTML(el, html, force) {
    if (!el || el._h === html) return false;
    if (UI.pointerDown && !force) return false;
    const scroller = el.querySelector('.sheet-body');
    const keep = scroller ? scroller.scrollTop : 0;
    // what the player is typing survives a redraw (a chat message arriving, a timer ticking): inputs keep their
    // value and the one in use keeps the caret
    const typed = {}, act = document.activeElement;
    // (only what the player changed: a field the game fills, such as a save code, shows the game's new value)
    el.querySelectorAll('input[id],textarea[id]').forEach((i) => { if (i.type !== 'checkbox' && !i.readOnly && i.value !== i.defaultValue) typed[i.id] = i.value; });
    const focus = act && el.contains(act) && act.id && act.matches('input,textarea') ? { id: act.id, a: act.selectionStart, b: act.selectionEnd } : null;
    el.innerHTML = html;
    for (const id in typed) { const i = el.querySelector(`#${CSS.escape(id)}`); if (i) i.value = typed[id]; }
    if (focus) { const i = el.querySelector(`#${CSS.escape(focus.id)}`); if (i) { i.focus(); try { i.setSelectionRange(focus.a, focus.b); } catch (e) { /* not a text input */ } } }
    el._h = html;
    const s2 = el.querySelector('.sheet-body');
    if (s2) s2.scrollTop = keep;
    if (KH.paintWyrms) KH.paintWyrms(el);
    return true;
  }
  KH.setHTML = setHTML;

  // ======================================================================
  // HUD + stage overlays
  // ======================================================================
  function renderHUD(R) {
    // one bar: the wyrm's medallion, the four stores, Starglass and the menu; a sky ribbon under it
    const dry = S.dormant || (R.net.water < 0 && S.res.water / -R.net.water < 45);
    const medal = $('#hud-medal');
    setHTML(medal, `${icon('i-wyrm')}<b>${S.lv.wyrm}</b>`);
    medal.classList.toggle('dry', !!dry);
    medal.title = `${S.wyrm.name}, Lv ${S.lv.wyrm}${S.dormant ? ' (dormant)' : ''}`;
    $('#hud-starglass').textContent = fmt(S.starglass);
    setHTML($('#hud-res'), RES.map((r) => {
      const locked = r === 'copper' && !S.lv.mine && S.res.copper < 1;
      const neg = !locked && R.net[r] < -0.004;
      return `<span class="r ${locked ? 'locked' : ''} ${neg ? 'neg' : ''}" title="${NAME[r]} ${locked ? '(locked)' : perMin(R.net[r])}">${icon(ICON[r])}<b>${fmt(S.res[r])}</b></span>`;
    }).join(''));
    const band = R.band, cls = band.name.toLowerCase();
    const w = KH.curWx(), range = KH.forecastRange();
    let next;
    if (w.type !== 'clear') next = `${icon('i-storm')}<span>${esc(DATA.weather[w.type].name)}</span> <b>${fmtTime(w.end - S.time)} left</b>`;
    else {
      const sev = S.wx.find((x) => x.start > S.time && KH.isStorm(x.type) && x.start - S.time <= range);
      next = sev ? `${icon('i-storm')}<span>${DATA.weather[sev.type].name}</span> <b>${fmtTime(sev.start - S.time)}</b>` : `<span>Clear skies</span>`;
    }
    if (KH.keep && KH.keep.raining()) next = `${icon('i-water')}<span>Rain</span> <b>${fmtTime(S.keep.rainUntil - S.time)} left</b>`;
    const warn = KH.isStorm(w.type) || next.includes('i-storm');
    const dn = KH.dayNight();
    setHTML($('#hud-climate'), `<span class="temp t-${cls}" title="${band.name}">${icon(dn.night > 0.6 ? 'i-moon' : 'i-sun', 'tod')}${fmtTemp(R.temp)}</span><i class="sep"></i>
      <span class="pop">${icon('i-people')}${S.pop}/${KH.housing()}${S.sick ? ` · ${S.sick} sick` : ''}${S.thirsty ? ' · <b class="thirst">thirsty</b>' : ''}</span><i class="sep"></i><span class="next ${warn ? 'warn' : ''}">${next}</span>`);
  }

  function renderStageOverlays() {
    // side rail: the event, the hubs (Rewards, Play, Ventures) and whatever is visiting the keep right now
    const vis = KH.side.filter((b) => !b.show || b.show());
    const inHub = new Set(Object.values(HUBS).flatMap((h) => h.ids).concat(MENU_IDS));
    let side = '';
    const one = (b, ctx) => {
      const badge = b.badge ? b.badge() : '';
      return `<button class="side-btn ${ctx ? 'ctx' : ''}" data-act="${b.act}" data-arg="${b.arg || ''}" aria-label="${esc(b.label)}">${icon(b.icon)}${b.dot && b.dot() ? '<i class="dot"></i>' : ''}<span>${esc(b.label)}</span>${badge ? `<small>${esc(badge)}</small>` : ''}</button>`;
    };
    for (const b of vis) if (b.id === 'events') side += one(b);
    for (const b of vis) if (b.pin) side += one(b); // standing entries (the Warden's Decrees)
    for (const [id, h] of Object.entries(HUBS)) {
      const members = vis.filter((b) => h.ids.includes(b.id));
      if (!members.length) continue;
      const dot = members.some((b) => b.dot && b.dot());
      side += `<button class="side-btn" data-act="hub" data-arg="${id}" data-members="${members.map((b) => b.arg || b.act).join(' ')}" aria-label="${h.label}">${icon(h.icon)}${dot ? '<i class="dot"></i>' : ''}<span>${h.label}</span></button>`;
    }
    for (const b of vis) if (b.id !== 'events' && !b.pin && !inHub.has(b.id)) side += one(b, true);
    setHTML($('#side'), side);

    let q = '';
    for (let i = 0; i < S.builders; i++) {
      const b = S.builds[i];
      q += b
        ? `<button class="qchip" data-act="plot" data-arg="${b.plot}">${icon('i-hammer')}${SHORT[b.plot]} Lv ${b.to} <time>${fmtTime(b.end - S.time)}</time></button>`
        : `<span class="qchip idle">${icon('i-hammer')}Builder idle</span>`;
    }
    if (S.research) {
      const t = DATA.techs.find((x) => x.id === S.research.tech);
      q += `<button class="qchip" data-act="plot" data-arg="archive">${icon('i-journal')}${esc(t.name)} <time>${fmtTime(S.research.end - S.time)}</time></button>`;
    }
    if (S.training) q += `<button class="qchip" data-act="plot" data-arg="barracks">${icon(DATA.classes[S.training.type].icon)}${S.training.rank != null && KH.ranks ? KH.ranks.label(S.training) : `${S.training.n} ${DATA.troops[S.training.type].name}`} <time>${fmtTime(S.training.end - S.time)}</time></button>`;
    for (const f of KH.chips) q += f() || '';
    // urgent chips first, and no more than four at a time
    const chips = q.split(/(?=<(?:button|span) class="qchip)/).filter(Boolean);
    const rank = (c) => (/qchip (raid|incident)/.test(c) ? 0 : /qchip idle/.test(c) ? 1 : 2);
    chips.sort((a, b) => rank(a) - rank(b));
    setHTML($('#queue'), chips.slice(0, 4).join('') + (chips.length > 4 ? `<span class="qchips-more">+${chips.length - 4} more</span>` : ''));

    const quest = DATA.quests[S.quest];
    let h = '';
    if (quest) {
      const done = quest.check(S);
      UI.questTarget = !done && quest.go.startsWith('plot:') ? quest.go.slice(5) : null;
      h = `<div class="quest ${done ? 'done' : ''}"><span class="qnum" title="Chapter quest ${S.quest + 1} of ${DATA.quests.length}"><span>${S.quest + 1}</span></span><div class="qtext">
        <div class="qgoal">${esc(quest.text)}</div><div class="qrew">${rewardHTML(quest.reward)}</div></div>
        ${done ? '<button class="btn gold small" data-act="claimquest">Claim</button>' : `<button class="btn small alt" data-act="go" data-arg="${quest.go}">Go</button>`}</div>`;
    } else {
      UI.questTarget = null;
      h = `<div class="quest"><span class="qnum"><span>✓</span></span><div class="qtext"><div class="qgoal">${S.stage > DATA.finalStage ? 'Every quest is done. Push into the Far South as far as your keep can reach.' : 'Every chapter quest is done.'}</div></div></div>`;
    }
    setHTML($('#quest'), h);
  }

  // the side rail's hubs: tiles that open each member's own sheet (with a way back)
  const HUBS = {
    rewards: { icon: 'i-chest', label: 'Rewards', ids: ['duties', 'orders', 'login', 'stars', 'hall', 'mail', 'trophies'], blurb: 'Daily duties, gifts, letters and trophies. Anything waiting for you glows.' },
    play: { icon: 'i-kite', label: 'Play', ids: ['heroic', 'crossing', 'siegehall', 'clash', 'leviathan', 'derby', 'fishing', 'cookfire', 'buriedcity', 'channels', 'cloudrun', 'gardens'], blurb: "Pastimes for you and your wyrm, each with a reward of its own." },
    ventures: { icon: 'i-caravan', label: 'Ventures', ids: ['outposts', 'trade', 'journeys'], blurb: "The keep's business out on the sand: outposts on the Dunes, trade caravans to the markets beyond, and heroes on far journeys." },
  };
  const MENU_IDS = ['bag', 'news', 'feedback', 'playtest'];
  KH.HUBS = HUBS;
  const tile = (b, back) => {
    const badge = b.badge ? b.badge() : '';
    return `<button class="hub-tile" data-act="hubopen" data-arg="${back}|${b.act}|${b.arg || ''}">${icon(b.icon)}<b>${esc(b.label)}</b>${badge ? `<small>${esc(badge)}</small>` : ''}${b.dot && b.dot() ? '<i class="dot"></i>' : ''}</button>`;
  };
  function sheetHub() {
    const h = HUBS[UI.sheet.id];
    const items = KH.side.filter((b) => h.ids.includes(b.id) && (!b.show || b.show()));
    return { title: h.label, lvl: '', body: `<p class="muted small">${esc(h.blurb)}</p><div class="hub-grid">${items.map((b) => tile(b, `hub:${UI.sheet.id}`)).join('')}</div>` };
  }
  function sheetMenu() {
    const items = [
      ...KH.side.filter((b) => MENU_IDS.includes(b.id) && (!b.show || b.show())),
      { icon: 'i-stone', label: 'Stores', act: 'stores' },
      { icon: 'i-sun', label: 'Forecast', act: 'forecast' },
      ...(KH.sheets.tales ? [{ icon: 'i-scroll', label: 'Hero Tales', act: 'tales', dot: () => KH.taleAny && KH.taleAny() }] : []),
      ...(KH.sheets.chronicle ? [{ icon: 'i-book', label: 'Chronicle', act: 'chronicle' }] : []),
      { icon: 'i-gear', label: 'Settings', act: 'settings' },
    ];
    return { title: 'Menu', lvl: '', body: `<div class="hub-grid">${items.map((b) => tile(b, 'menu')).join('')}</div>` };
  }
  function sheetStores(R) {
    const row = (k, v, rate, extra = '') => `<div class="store-row">${icon(ICON[k])}<div class="grow"><b>${NAME[k]}</b>${extra ? `<div class="muted small">${extra}</div>` : ''}</div><span class="amt">${fmt(v)}</span>${rate != null ? `<span class="rate ${rate < -0.004 ? 'neg' : ''}">${perMin(rate)}</span>` : '<span class="rate"></span>'}</div>`;
    const prot = KH.protectOf ? KH.protectOf() : 0;
    return {
      title: 'Your stores', lvl: '',
      body: `<div class="card stack">${RES.map((r) => row(r, S.res[r], R.net[r], r === 'water' ? `${esc(S.wyrm.name)} and ${fmt(S.pop)} survivors drink from it` : r === 'copper' && !S.lv.mine ? 'Build the Copper Mine' : '')).join('')}</div>
        ${prot ? `<p class="muted small">The Storehouse keeps ${fmt(prot)} of each safe from raiders.</p>` : ''}
        <div class="card stack">${row('starglass', S.starglass, null)}${row('beacons', S.beacons, null)}${row('journals', S.journals, null)}${S.lv.forge || S.sunsteel ? row('sunsteel', S.sunsteel, null) : ''}${S.tideglass || S.lv.wyrm >= DATA.deepspring.unlock ? row('tideglass', S.tideglass || 0, null) : ''}</div>
        <dl class="kv"><dt>Squad power</dt><dd>${fmt(KH.power())}</dd><dt>Survivors</dt><dd>${S.pop}/${KH.housing()}${S.sick ? ` (${S.sick} sick)` : ''}</dd></dl>`,
    };
  }
  ACT.hub = (id) => { UI.sheet = { kind: 'hub', id }; };
  ACT.menu = () => { UI.sheet = { kind: 'menu' }; };
  ACT.stores = () => { UI.sheet = { kind: 'stores' }; };
  // open a hub member; its sheet gets a back arrow to the hub
  ACT.hubopen = (arg) => {
    const [back, act, a] = String(arg).split('|');
    UI.sheet = null;
    if (ACT[act]) ACT[act](a || undefined);
    if (UI.sheet && !UI.sheet.back) UI.sheet.back = back;
  };
  ACT.sheetback = () => {
    const b = UI.sheet && UI.sheet.back;
    if (!b) return ACT.close();
    const [kind, id] = b.split(':');
    UI.sheet = id ? { kind, id } : { kind };
  };

  function renderDots() {
    const dots = {
      world: KH.worldDot ? KH.worldDot() : false,
      heroes: S.beacons >= 1 || !!(KH.talents && KH.talents.anyReady()),
      caravan: KH.caravanDot ? KH.caravanDot() : false,
      shop: shopDot(),
    };
    for (const [k, v] of Object.entries(dots)) { const d = $(`#dot-${k}`); if (d) d.hidden = !v; }
    document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.arg === UI.tab));
  }
  function shopDot() {
    if (KH.levelPackOpen() && !S.lvPack.seen && UI.tab !== 'shop') return true;
    if (S.stipend.left > 0 && S.stipend.last !== today()) return true;
    if (S.bought.growth && DATA.growthFund.some(([l]) => S.lv.wyrm >= l && !S.growthClaimed.includes(l))) return true;
    const tier = KH.passTier();
    for (let i = 0; i < tier; i++) if (!S.pass.free.includes(i) || (S.pass.premium && !S.pass.prem.includes(i))) return true;
    return !!(KH.patronDot && KH.patronDot());
  }

  // ======================================================================
  // Panels
  // ======================================================================
  function panelHeroes() {
    const tabs = subtabs('heroes', [['roster', 'Roster', (KH.taleAny && KH.taleAny()) || (KH.talents && KH.talents.anyReady())], ['beacon', 'The Beacon', S.beacons >= 1], ...(KH.panelGear ? [['gear', 'Gear', KH.gearDot && KH.gearDot()]] : [])]);
    if (UI.sub.heroes === 'beacon') return tabs + panelRecruit();
    if (UI.sub.heroes === 'gear' && KH.panelGear) return tabs + KH.panelGear();
    const owned = Object.keys(S.heroes).sort((a, b) => KH.heroPower(b) - KH.heroPower(a));
    const missing = DATA.heroes.filter((h) => !S.heroes[h.id]).sort((a, b) => (KH.heroAvailable(a) ? 0 : 1) - (KH.heroAvailable(b) ? 0 : 1));
    const team = KH.teamStats(null);
    const card = (id) => {
      const d = HERO[id], h = S.heroes[id];
      const inSquad = S.squad.includes(id), steward = S.stewards[d.steward.kind] === id, away = KH.heroBusy && KH.heroBusy(id);
      const canLevel = h.lvl < KH.heroCap(id) && S.journals >= 2 * h.lvl;
      const canStar = h.stars < DATA.heroMaxStars && h.shards >= 10 * h.stars;
      return `<button class="hcard ${d.rarity}" data-act="hero" data-arg="${id}">${portrait(id)}
        <span class="badges"><span class="cls-badge">${icon(DATA.classes[d.cls].icon)}</span><span style="display:grid;gap:3px;justify-items:end">${away ? '<span class="away-badge">AWAY</span>' : inSquad ? '<span class="squad-badge">SQUAD</span>' : ''}${steward ? '<span class="steward-badge">STEWARD</span>' : ''}${canStar ? '<span class="steward-badge" style="background:var(--gold)">★ UP</span>' : ''}</span></span>
        <span class="meta"><span class="nm">${esc(d.name.split(' ')[0])}${KH.awakenBadge ? KH.awakenBadge(id) : ''}${canLevel && inSquad ? ' <span class="up-dot"></span>' : ''}${KH.taleReady && KH.taleReady(id) ? ' <span class="tale-dot" title="A tale chapter is ready"></span>' : ''}${KH.talents && KH.talents.ready(id) ? ' <span class="tl-dot" title="A talent to choose"></span>' : ''}</span><span class="sub"><span>Lv ${h.lvl}</span>${starsHTML(h.stars)}</span></span></button>`;
    };
    return `${tabs}<div class="panel-head"><h2>Heroes</h2><p>Squad power ${fmt(KH.statPower(team))}</p></div>
      <div class="card stack"><div class="row"><div class="grow"><b>Expedition squad</b><div class="muted small">Up to 3 heroes march with your troops and defend the keep. Tap a hero to swap.</div></div></div>
      <div class="squad">${[0, 1, 2].map((i) => S.squad[i] ? `<button class="slot" data-act="hero" data-arg="${S.squad[i]}">${portrait(S.squad[i])}</button>` : '<div class="slot">+</div>').join('')}</div></div>
      ${KH.rosterExtras ? KH.rosterExtras() : ''}
      <div class="row"><span class="section-label grow">Roster · ${owned.length}/${DATA.heroes.length}</span><span class="chip muted small">${icon('i-journal')}${fmt(S.journals)} journals</span></div>
      <div class="hero-grid">${owned.map(card).join('')}${missing.map((d) => `<button class="hcard ${d.rarity} missing" data-act="hero" data-arg="${d.id}">${portrait(d.id)}<span class="meta"><span class="nm">${esc(d.name.split(' ')[0])}</span><span class="sub"><span class="r-${d.rarity}">${KH.heroAvailable(d) ? DATA.rarities[d.rarity].name : 'Act II'}</span></span></span></button>`).join('')}</div>`;
  }

  function panelRecruit() {
    const f = HERO[KH.featured()];
    const toPity = DATA.recruit.pity - S.pity;
    const costLine = (n) => {
      const sg = n === 1 ? DATA.recruit.singleCost : DATA.recruit.tenCost;
      return S.beacons >= n ? `<small>${icon('i-beacon')}${n} token${n > 1 ? 's' : ''}</small>` : `<small>${icon('i-gem')}${fmt(sg)}</small>`;
    };
    const left = DATA.events.length - (S.time % DATA.events.length);
    return `<div class="panel-head"><h2>The Beacon</h2><p>Light it and see who answers.</p></div>
      <div class="beacon-hero"><div><span class="section-label" style="margin:0">Featured Legendary · ${fmtTime(left)}</span><div class="feat-name r-legendary">${esc(f.name)}</div>
        <p class="muted small" style="margin:4px 0 0">${esc(f.title)}. Half of all Legendary results are ${esc(f.name.split(' ')[0])} until the banner changes.</p></div>
        <div class="portrait-wrap">${portrait(f.id)}</div></div>
      <div class="pull-row"><button class="btn alt" data-act="pull" data-arg="1" data-primary>Recruit ×1${costLine(1)}</button><button class="btn" data-act="pull" data-arg="10">Recruit ×10${costLine(10)}</button></div>
      <div class="card stack" style="margin-top:12px">
        <div class="row"><div class="grow"><b>Legendary guarantee</b><div class="muted small">${S.firstPull ? 'Your first recruit is a guaranteed Epic. ' : ''}A Legendary is guaranteed within ${toPity} more recruit${toPity === 1 ? '' : 's'}.</div></div><button class="btn small alt" data-act="odds">Odds</button></div>
        <div class="bar"><i style="width:${(S.pity / DATA.recruit.pity) * 100}%"></i></div>
        <div class="muted small">Every ×10 includes at least one Epic or better. Duplicates become shards for that hero's next star: ${DATA.shardsPerDupe.rare} for a Rare, ${DATA.shardsPerDupe.epic} for an Epic, ${DATA.shardsPerDupe.legendary} for a Legendary.</div>
      </div>
      <div class="row" style="margin-top:12px"><span class="chip">${icon('i-beacon')}${S.beacons} Beacon Tokens</span><span class="chip">${icon('i-gem')}${fmt(S.starglass)} Starglass</span></div>`;
  }

  // foe traits (DATA.traits) on the stage card and in battle: what each does and whether the squad can answer it
  // a hero's skill, or the breath in the right Breath Art (DATA.battle.arts)
  const TRAIT_ANSWER = { armored: ['pierce'], regen: ['atk', 'burst'], venom: ['heal'], frenzy: [], shell: [] };
  const ART_ANSWER = { regen: ['riptide'], venom: ['veil'], frenzy: ['torrent', 'riptide'], shell: ['torrent'] };
  function traitAnswered(t, heroes, art) {
    if (!S.dormant && (ART_ANSWER[t] || []).includes(art || KH.artOf())) return true;
    return heroes.some((id) => TRAIT_ANSWER[t].includes(KH.skillKind(id)));
  }
  KH.traitAnswered = traitAnswered;
  function traitRows(foe, heroes) {
    const TL = DATA.traits.list;
    const need = { armored: 'Sunder', regen: 'Volley or Charge', venom: 'Mend' }, AR = DATA.battle.arts;
    // a breath that would answer it, one tap away
    const artFix = (t) => { const a = S.dormant ? null : (ART_ANSWER[t] || []).find((x) => KH.artOpen(x)); return a ? ` <button class="btn small alt tr-art" data-act="breathart" data-arg="${a}">${icon(AR[a].icon)}Breathe a ${esc(AR[a].name)}</button>` : ''; };
    // the swap and what it costs the squad's power (troops and all), so the player can weigh it against the answer
    const swap = (t) => {
      const c = traitAnswerer(t);
      if (!c) return '';
      const out = swapOut(t, foe.traits);
      if (!out && S.squad.length >= 3) return '';
      const after = S.squad.length < 3 ? S.squad.concat([c]) : S.squad.map((id) => (id === out ? c : id));
      const pw = (h) => KH.statPower(KH.teamStats(foe.cls, { heroes: h })), d = Math.round((pw(after) / Math.max(1, pw(S.squad)) - 1) * 100);
      return ` <button class="btn small alt tr-swap" data-act="traitswap" data-arg="${t}|${(foe.traits || []).join(',')}">Swap in ${esc(HERO[c].name.split(' ')[0])} <small>(squad ${d >= 0 ? '+' : '−'}${Math.abs(d)}%)</small></button>`;
    };
    return (foe.traits || []).map((t) => `<div class="row trait-row">${icon(TL[t].icon, 'tr-ic')}<div class="grow"><b>${esc(TL[t].name)}</b> <span class="small">${esc(TL[t].text)}</span>${!traitAnswered(t, heroes) ? `<div class="small tr-need">${need[t] ? `No hero in the squad has ${need[t]}.` : S.dormant ? `${esc(S.wyrm.name)} is dormant: no breath to answer it.` : `The ${esc(AR[KH.artOf()].name)} can't answer it.`}${need[t] ? swap(t) : ''}${artFix(t)}</div>` : ''}</div>
      ${traitAnswered(t, heroes) ? `<span class="chip tr-ok" title="Your squad can answer it">${icon('i-check')}</span>` : `<span class="chip tr-no" title="No hero in the squad can answer it">!</span>`}</div>`).join('');
  }
  // the strongest free hero whose skill answers a trait, to swap in for the squad's weakest
  function traitAnswerer(t) {
    const need = TRAIT_ANSWER[t];
    if (!need || !need.length) return null;
    return Object.keys(S.heroes).filter((id) => !S.squad.includes(id) && !(KH.heroBusy && KH.heroBusy(id)) && need.includes(KH.skillKind(id))).sort((a, b) => KH.heroPower(b) - KH.heroPower(a))[0] || null;
  }
  // the squad hero a swap would replace: the weakest one at home who isn't the only answer to the foe's other trait
  const swapOut = (t, traits) => {
    const needed = (id) => (traits || []).some((o) => o !== t && traitAnswered(o, S.squad) && !traitAnswered(o, S.squad.filter((x) => x !== id)));
    return S.squad.filter((id) => !(KH.heroBusy && KH.heroBusy(id)) && !needed(id)).sort((a, b) => KH.heroPower(a) - KH.heroPower(b))[0] || null;
  };
  ACT.traitswap = (arg) => {
    const [t, list] = String(arg).split('|'), c = traitAnswerer(t);
    if (!c) return;
    if (S.squad.length < 3) S.squad.push(c);
    else {
      const out = swapOut(t, list ? list.split(',') : []);
      if (!out) return toast('No hero in the squad can make way: the others are away or answer another trait.', 'warn');
      S.squad[S.squad.indexOf(out)] = c;
      toast(`${HERO[c].name.split(' ')[0]} takes ${HERO[out].name.split(' ')[0]}'s place in the squad.`, 'good');
    }
    audio('tap');
  };
  KH.traitRows = traitRows;
  // the breath as it lands, in each Breath Art
  const breathFx = (a, foeSel, usSel) => {
    const W = S.wyrm.name, lines = [];
    if (a.art === 'veil') { if (a.heal) floaty(usSel, `+${fmt(a.heal)}`, 'heal'); lines.push(a.broke ? `${W}'s mist swallows the wind-up!` : `${W} veils the squad in cool mist.`); if (a.cured) lines.push('The venom is drawn out.'); }
    else {
      floaty(foeSel, `−${fmt(a.dmg)}`, 'torrent');
      if (a.art === 'riptide') lines.push(a.broke ? `${W}'s riptide drags the foe under before the blow!` : `${W}'s riptide drags the foe under.`);
      else lines.push(a.broke ? `${W}'s breath breaks the wind-up!` : `${W} breathes a torrent!`);
      if (a.cracked) lines.push('The sand-shell cracks!');
      if (a.calmed) lines.push('The frenzy breaks.');
    }
    return lines;
  };
  const traitChips = (foe) => (foe.traits || []).map((t) => `<span class="chip tr-chip">${icon(DATA.traits.list[t].icon)}${esc(DATA.traits.list[t].name)}</span>`).join('');

  function panelExpedition() {
    const tabs = subtabs('world', [['map', 'Dunes'], ['expedition', 'Expedition'], ...KH.worldTabs.map((w) => [w.id, w.label, w.dot && w.dot()])]);
    const extra = KH.worldTabs.find((w) => w.id === UI.sub.world);
    if (extra) return tabs + extra.panel();
    const n = S.stage;
    const p = KH.patrolPreview();
    let patrol;
    if (!p) patrol = '<div class="card"><b>Patrol cache</b><p class="muted small">Clear stage 1 and your scouts start bringing back journals and supplies while you play or rest.</p></div>';
    else {
      patrol = `<div class="card stack"><div class="row"><div class="grow"><b>Patrol cache</b><div class="muted small">${Math.floor(p.mins)} of ${DATA.patrolCapMinutes} min collected</div></div>
        <button class="btn small ${p.mins < 1 ? 'off' : 'gold'}" data-act="patrol">Collect</button></div>
        <div class="bar xp"><i style="width:${(p.mins / DATA.patrolCapMinutes) * 100}%"></i></div><div class="costs">${rewardHTML(p.g)}</div></div>`;
    }
    const foe = KH.enemyFor(n), team = KH.teamStats(foe.cls);
    const ours = KH.statPower(team), theirs = KH.statPower(foe);
    const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === foe.cls);
    const ch = KH.chapterOf(n);
    const endless = n > DATA.finalStage;
    const base = endless ? n - ((n - 1) % 10) : ch.from;
    const cells = Array.from({ length: 10 }, (_, i) => {
      const s = base + i;
      const boss = DATA.bosses[s] || (s > DATA.finalStage && s % 10 === 0);
      return `<i class="${s < n ? 'done' : s === n ? 'cur' : ''} ${boss ? 'boss' : ''}">${s}</i>`;
    }).join('');
    const breath = S.dormant ? 0 : DATA.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath'));
    const odds = ours * (1 + breath) >= theirs * 1.15 ? ['Favored', 'var(--good)'] : ours * (1 + breath) >= theirs * 0.9 ? ['Even fight', 'var(--gold)'] : ['Risky', 'var(--bad)'];
    const home = KH.squadHome();
    return `${tabs}<div class="panel-head"><h2>${endless ? 'The Far South' : ch.act === 3 ? 'Expedition · Act III' : ch.act === 2 ? 'Expedition · Act II' : 'Expedition'}</h2><p>${esc(ch.name)}</p></div>
      ${patrol}
      <div class="section-label">Next stage</div>
      <div class="stage-card ${foe.boss ? 'boss' : ''}">
        <div class="row stage-top"><div class="grow"><span class="stage-num">Stage ${n}${foe.boss ? ' · Boss' : ''}</span><div class="foe">${esc(foe.name)}</div>
          <div class="muted small">${icon(DATA.classes[foe.cls].icon)} Weak to ${DATA.classes[counter].name}s</div></div><div class="stage-foe">${foeArt(foe, 'b-enemy')}</div></div>
        ${foe.traits && foe.traits.length ? `<div class="traits">${traitRows(foe, home)}</div>` : ''}
        <div class="vs"><div class="side"><span class="muted small">Your squad</span><b>${fmt(ours)}</b></div><span class="odds" style="color:${odds[1]}">${odds[0]}</span><div class="side right"><span class="muted small">Enemy</span><b>${fmt(theirs)}</b></div></div>
        <div class="row wrap"><div class="squad">${home.map((id) => `<button class="slot" data-act="hero" data-arg="${id}">${portrait(id)}</button>`).join('') || '<div class="slot">—</div>'}</div>
          <div class="grow costs">${S.lv.barracks ? `<span class="cost" title="Troops marching (cap ${KH.marchCap()})">${icon('i-people')}${fmt(sum(team.troops))}</span>` : '<span class="muted small">Build Barracks to add troops</span>'}${breath ? `<span class="cost" title="${esc(S.wyrm.name)}'s breath: ${esc(DATA.battle.arts[KH.artOf()].name)}">${icon(DATA.battle.arts[KH.artOf()].icon)}${KH.artOf() === 'veil' ? `+${Math.round(breath * DATA.battle.arts.veil.heal * 100)}%` : `${Math.round(breath * (KH.artOf() === 'riptide' ? DATA.battle.arts.riptide.hit : 1) * 100)}%`}</span>` : S.dormant ? '<span class="cost short">Wyrm dormant</span>' : ''}</div></div>
        ${KH.formationRow ? KH.formationRow(foe) : ''}${KH.artRow ? KH.artRow(foe) : ''}
        <div style="margin-top:12px"><div class="costs" style="margin-bottom:8px" title="First clear">${rewardHTML(KH.stageRewards(n))}</div><button class="btn wide ${home.length ? '' : 'off'}" data-act="fight" data-primary>${home.length ? 'Fight' : 'Squad is away on the Dunes'}</button></div>
      </div>
      ${endless || !KH.starList ? `<div class="section-label">${esc(ch.name)}</div><div class="stage-list">${cells}</div>` : ''}${KH.starList ? KH.starList(endless ? DATA.finalStage : ch.from) : ''}
      <div class="row" style="margin-top:12px"><button class="btn alt small" data-act="story" data-arg="${ch.from}">Read the chapter</button>${KH.sheets.chronicle ? '<button class="btn alt small" data-act="chronicle">Chronicle</button>' : ''}</div>`;
  }

  function panelShop() {
    const packs = KH.levelPackOpen() ? DATA.shop.filter((x) => x.levelPack) : [];
    if (packs.length) S.lvPack.seen = true;
    const offers = [...packs, ...DATA.shop.filter((x) => !x.id.startsWith('sg') && !x.levelPack && (!x.needs || S.lv[x.needs]) && (!x.needsWyrm || S.lv.wyrm >= x.needsWyrm) && (!x.when || x.when(S)))];
    const offerArt = (id) => (KH.art.painted('offer', id) ? `<div class="offer-art art-o-${id}"></div>` : '');
    const offer = (o) => {
      if (o.levelPack) {
        const got = S.lvPack.bought.includes(o.id);
        return `<div class="card offer featured lvpack">${offerArt(o.id)}<div class="grow"><h3>${esc(o.name)}<span class="tag">Rainwyrm Lv ${S.lvPack.lvl + 1}</span><span class="tag">Ends in ${fmtTime(S.lvPack.until - S.time)}</span></h3>
          <p class="muted small" style="margin:4px 0 6px">${esc(o.desc)}</p><div class="costs">${rewardHTML(KH.levelPackGrants(o.id))}</div></div>
          ${got ? '<span class="muted small">Bought</span>' : `<button class="btn small" data-act="buy" data-arg="${o.id}">${price(o.id, o.usd)}</button>`}</div>`;
      }
      const done = o.once && S.bought[o.id];
      const daily = o.daily && S.boughtDay[o.id] === today();
      let extra = '';
      if (o.id === 'stipend' && S.stipend.left > 0) {
        extra = S.stipend.last !== today()
          ? '<button class="btn small gold" data-act="stipend">Claim 90 today</button>'
          : `<span class="muted small">Claimed today · ${S.stipend.left} days left</span>`;
      }
      if (o.id === 'growth' && S.bought.growth) {
        extra = `<div class="row wrap">${DATA.growthFund.map(([l, sg]) => {
          const got = S.growthClaimed.includes(l), ready = S.lv.wyrm >= l;
          return got ? `<span class="chip muted small">Lv ${l} ✓</span>` : `<button class="btn small ${ready ? 'gold' : 'off'}" data-act="growth" data-arg="${l}">Lv ${l}: ${fmt(sg)}</button>`;
        }).join('')}</div>`;
      }
      return `<div class="card offer ${o.id === 'founder' && !done ? 'featured' : ''}">${offerArt(o.id)}<div class="grow"><h3>${esc(o.name)}${o.tag ? `<span class="tag">${o.tag}</span>` : ''}</h3>
        <p class="muted small" style="margin:4px 0 6px">${esc(o.desc)}</p>${extra}</div>
        ${done ? '<span class="muted small">Owned</span>' : daily ? '<span class="muted small">Tomorrow</span>' : `<button class="btn small" data-act="buy" data-arg="${o.id}">${price(o.id, o.usd)}</button>`}</div>`;
    };
    const tier = KH.passTier(), xpIn = S.pass.xp - tier * DATA.pass.xpPerTier;
    const season = S.pass.season || 1;
    const passRows = DATA.pass.tiers.map((_, i) => {
      const reached = tier > i;
      const cell = (track, g) => {
        const claimed = S.pass[track].includes(i);
        const locked = track === 'prem' && !S.pass.premium;
        let btn = '';
        if (claimed) btn = '<span class="muted small">Got</span>';
        else if (reached && !locked) btn = `<button class="btn small gold" data-act="passclaim" data-arg="${track}:${i}">Claim</button>`;
        else if (locked) btn = icon('i-lock');
        return `<div class="pass-cell ${track === 'prem' ? 'prem' : ''} ${claimed ? 'claimed' : ''}"><span class="costs">${rewardHTML(g)}</span>${btn}</div>`;
      };
      return `<div class="pass-row"><span class="tier ${reached ? 'reached' : ''}">${i + 1}</span>${cell('free', KH.passReward(i, 'free'))}${cell('prem', KH.passReward(i, 'prem'))}</div>`;
    }).join('');
    const skins = Object.entries(DATA.skins).filter(([, sk]) => !sk.hidden).map(([id, sk]) => {
      const own = S.skins.owned.includes(id), on = S.skins.on === id;
      const p = own ? (on ? 'Equipped' : 'Equip') : sk.locked ? `${icon('i-lock')}Earned` : sk.starglass ? `${icon('i-gem')}${fmt(sk.starglass)}` : price(id, sk.usd);
      return `<button class="card skin ${on ? 'on' : ''}" data-act="skin" data-arg="${id}">
        <span class="swatch" style="background:radial-gradient(60% 80% at 30% 70%, ${sk.mist[1]}, transparent 60%), radial-gradient(40% 50% at 75% 30%, ${sk.fin}, transparent 70%), linear-gradient(120deg, ${sk.body[0]}, ${sk.body[1]})"></span>
        <b>${esc(sk.name)}</b><span class="muted small">${sk.note ? esc(sk.note) : own ? 'Owned' : 'Cosmetic only'}</span><span class="chip">${p}</span></button>`;
    }).join('');
    const sg = DATA.shop.filter((x) => x.id.startsWith('sg')).map((o) => `<button class="card sg" data-act="buy" data-arg="${o.id}">${KH.art.painted('offer', o.id) ? `<span class="sg-art art-o-${o.id}"></span>` : icon('i-gem')}<b>${fmt(o.grants.starglass)}</b><span class="muted small">${esc(o.name)}</span><span class="btn small">${price(o.id, o.usd)}</span></button>`).join('');
    const crates = RES.map((r) => `<button class="card sg" data-act="crate" data-arg="${r}">${icon(ICON[r])}<b>${fmt(DATA.crateSize(r, S.lv.wyrm))}</b><span class="muted small">${NAME[r]} crate</span><span class="chip">${icon('i-gem')}${DATA.crateCost}</span></button>`).join('');
    const native = window.KHNative && window.KHNative.purchasesAvailable;
    return `<div class="panel-head"><h2>Store</h2><p>${native ? '' : `Simulated spend so far: $${S.spentUsd.toFixed(2)}`}</p></div>
      ${native ? '' : '<p class="proto-note">This version: purchases are simulated and nothing is charged. In the App Store and Google Play versions these buttons use the store\'s in-app purchase.</p>'}
      ${KH.patronCard ? KH.patronCard() : ''}
      <div class="section-label">Offers</div><div class="stack">${offers.map(offer).join('')}</div>
      <div class="section-label">Wellkeeper's Ledger · Season ${season}${S.pass.end ? ` · ends in ${fmtTime(Math.max(0, S.pass.end - S.time))}` : ''}</div>
      <div class="card stack"><div class="row"><div class="grow"><b>Tier ${tier} of ${DATA.pass.tiers.length}</b><div class="muted small">Earn Ledger XP from quests, upgrades, battles, beasts, gathering and recruits. A new season, with new rewards and a new premium skin, starts every ${Math.round(DATA.pass.seasonLength / 3600)} hours of play; anything you earned but did not claim arrives by mail.</div></div>
        ${S.pass.premium ? '<span class="chip r-epic">Premium active</span>' : `<button class="btn small" data-act="buy" data-arg="ledger">Unlock premium</button>`}</div>
        <div class="bar xp"><i style="width:${tier >= DATA.pass.tiers.length ? 100 : (xpIn / DATA.pass.xpPerTier) * 100}%"></i></div>
        <div class="pass-row"><span></span><span class="muted small">Free</span><span class="muted small">Premium</span></div>${passRows}</div>
      <div class="section-label">Wyrm skins</div><div class="skin-grid">${skins}</div>
      <div class="section-label">Starglass</div><div class="sg-grid">${sg}</div>
      <div class="section-label">Supply crates</div><div class="sg-grid four">${crates}</div>
      ${native ? '<button class="btn alt small" style="margin-top:14px" data-act="restore">Restore purchases</button>' : ''}`;
  }

  function renderPanel(force) {
    const panel = $('#panel');
    const showPanel = UI.tab !== 'town' && !(UI.tab === 'world' && UI.sub.world === 'map');
    panel.hidden = !showPanel;
    const world = $('#world');
    if (world) world.hidden = !(UI.tab === 'world' && UI.sub.world === 'map');
    if (!showPanel) return;
    const keep = panel.scrollTop;
    let html;
    if (UI.tab === 'heroes') html = panelHeroes();
    else if (UI.tab === 'world') html = panelExpedition();
    else if (UI.tab === 'shop') html = panelShop();
    else if (KH.panels[UI.tab]) html = KH.panels[UI.tab]();
    else html = '<p class="muted">Coming soon.</p>';
    setHTML(panel, html, force);
    panel.scrollTop = keep;
  }

  // ======================================================================
  // Sheets
  // ======================================================================
  function effectRows(pid) {
    const type = PLOT[pid].type, L = S.lv[pid], N = L + 1;
    const maxed = L >= KH.maxLevel();
    const up = (v) => (maxed || !L ? '' : `<span class="up">→ ${v}</span>`);
    const rows = [];
    const b = DATA.buildings[type];
    if (type === 'wyrm') {
      rows.push(['Cooling at current mist', `−${KH.coolAt(L)}°C`, up(`−${KH.coolAt(N)}°C`)]);
      rows.push(['Water the wyrm drinks', `${perMin(KH.drinkRate()).replace('+', '')}`, up(perMin(DATA.wyrm.drink(N) * KH.mist().drink).replace('+', ''))]);
      rows.push(["Wyrm's Torrent", `${Math.round(DATA.wyrm.breath(L) * (1 + KH.bonus('breath')) * 100)}%`, up(`${Math.round(DATA.wyrm.breath(N) * (1 + KH.bonus('breath')) * 100)}%`)]);
      rows.push(['Building level cap', `Lv ${L}`, up(`Lv ${N}`)]);
    } else if (type === 'shelter') {
      rows.push(['Beds', `${L ? b.housing(L) : 0}`, up(b.housing(N))]);
    } else if (b.prod) {
      const per = (lvl) => b.perWorker * (1 + DATA.workerGrowth * (lvl - 1)) * 60;
      rows.push([`${NAME[b.prod]} per worker`, L ? `${per(L).toFixed(1)}/min` : '—', up(`${per(N).toFixed(1)}/min`)]);
      rows.push(['Worker slots', `${KH.slotsOf(pid)}`, up(DATA.workerSlots(N))]);
    } else if (type === 'infirmary') {
      const rec = (lvl) => Math.round(1 / (DATA.baseRecovery + DATA.infirmaryRate * lvl * (1 + 0.3 * (S.tech.medicine || 0))));
      rows.push(['Average recovery', L ? `${rec(L)}s` : `${Math.round(1 / DATA.baseRecovery)}s`, up(`${rec(N)}s`)]);
    } else if (type === 'barracks') {
      rows.push(['March capacity', `${KH.marchCap()}`, up(DATA.marchCap(N))]);
      rows.push(['Troop housing', `${KH.troopCap()}`, up(DATA.marchCap(N) * 2)]);
      rows.push(['Training batch', `${KH.batchMax()}`, up(10 * N)]);
      rows.push(['Dunes marches', `${DATA.world.marchSlots(L)}`, up(DATA.world.marchSlots(N))]);
      rows.push(['Troop strength', `+${Math.round((KH.troopMult() - 1) * 100)}%`, '']);
      if (DATA.ranks) { const top = (lv) => DATA.ranks.list.filter((r) => lv >= r.barracks).map((r) => r.name).pop() || 'None yet'; rows.push(['Highest troop rank', top(L), top(N) !== top(L) ? up(top(N)) : '']); }
    } else if (type === 'watchtower') {
      rows.push(['Forecast range', fmtTime(KH.forecastRange()), up(fmtTime(KH.forecastRange() + 45))]);
      rows.push(['Defenders steadied', `+${3 * L}%`, up(`+${3 * N}%`)]);
    } else if (type === 'archive') {
      rows.push(['Research level cap', `${KH.techMax()}`, up(Math.min(DATA.techMaxLevel, N))]);
    } else if (type === 'hall') {
      rows.push(['Members who can help', `${L ? 2 + L : 0}`, up(2 + N)]);
      rows.push(['Donation charges', `${L ? 5 + L : 0}`, up(5 + N)]);
    } else if (type === 'storehouse') {
      rows.push(['Protected per resource', fmt(KH.protectOf()), up(fmt(b.protect(N)))]);
    } else if (KH.plotRows[type]) rows.push(...KH.plotRows[type](pid, L, N, up));
    if (!rows.length) return '';
    return `<dl class="kv">${rows.map(([k, v, u]) => `<dt>${k}</dt><dd>${v}${u}</dd>`).join('')}</dl>`;
  }

  function jobProgress(key, job, label) {
    const total = job.end - job.start, left = job.end - S.time, c = KH.speedCost(job.end);
    const speedItems = Object.keys(DATA.items).some((k) => DATA.items[k].kind === 'speed' && S.items[k] > 0);
    return `<div class="section-label">${label}</div>
      <div class="bar"><i style="width:${clamp((1 - left / total) * 100, 0, 100)}%"></i></div>
      <div class="row wrap"><span class="grow chip">${icon('i-clock')}${fmtTime(left)} left</span>
      ${speedItems && c ? `<button class="btn small alt" data-act="speedsheet" data-arg="${key}">${icon('i-clock')}Speedups</button>` : ''}
      <button class="btn small ${c ? 'alt' : 'gold'}" data-act="speed" data-arg="${key}">${c ? `${icon('i-gem')}${c} Finish` : 'Finish free'}</button></div>`;
  }
  KH.jobProgress = jobProgress;

  function upgradeHTML(pid) {
    const L = S.lv[pid], to = L + 1;
    const job = S.builds.find((b) => b.plot === pid);
    if (job) return jobProgress(pid, job, L ? `Upgrading to Lv ${to}` : 'Under construction');
    if (L >= KH.maxLevel()) return '<p class="notice good">Max level.</p>';
    const why = KH.upgradeBlock(pid), cost = KH.buildCost(pid, to), afford = KH.canAfford(cost);
    const busy = S.builds.length >= S.builders;
    let h = `<div class="section-label">${L ? `Upgrade to Lv ${to}` : 'Build'}</div>`;
    if (pid === 'wyrm' && DATA.wyrmReqs(to).length) {
      h += `<div class="costs">${DATA.wyrmReqs(to).map((r) => `<span class="cost ${S.lv[r.plot] < r.lvl ? 'short' : ''}">${SHORT[r.plot]} Lv ${r.lvl}</span>`).join('')}</div>`;
    }
    h += `${costHTML(cost)}<div class="chip muted">${icon('i-clock')}${fmtTime(KH.buildTime(pid, to))}</div>`;
    // when the block is another building's level, offer the way there instead of a dead button
    let fix = null;
    if (why && pid === 'wyrm') { const r = DATA.wyrmReqs(to).find((q) => S.lv[q.plot] < q.lvl); if (r) fix = r.plot; }
    else if (why && S.lv.wyrm >= KH.PLOT[pid].unlock && to > S.lv.wyrm) fix = 'wyrm';
    if (why) h += `<p class="notice heat">${esc(why)}</p>`;
    else if (busy) {
      const b = S.builds[0];
      h += `<p class="notice">Builder busy with ${SHORT[b.plot]} Lv ${b.to} (${fmtTime(b.end - S.time)}).${S.builders < 2 ? " The Founder's Cache adds a permanent second builder." : ''}</p>`;
    } else if (!afford) {
      const short = Object.keys(cost).filter((k) => KH.have(k) < cost[k]);
      h += `<p class="muted small">Short on ${short.map((k) => NAME[k].toLowerCase()).join(' and ')}. Gather on the Dunes, open crates from your Backpack, or wait for production.</p>`;
    }
    if (fix) h += `<button class="btn wide gold" data-act="plot" data-arg="${fix}">${icon(fix === 'wyrm' ? 'i-wyrm' : 'i-up')}${fix === 'wyrm' ? `Grow ${esc(S.wyrm.name)} first` : `Go to the ${esc(SHORT[fix])}`}</button>`;
    else h += `<button class="btn wide ${why || busy || !afford ? 'off' : ''}" data-act="build" data-arg="${pid}">${icon('i-up')}${L ? 'Upgrade' : 'Build'}</button>`;
    return h;
  }

  function wyrmControls(R) {
    const seg = Object.entries(DATA.wyrm.mist).map(([k, v]) =>
      `<button class="${S.mist === k ? 'on' : ''}" data-act="mist" data-arg="${k}">${v.name}<small>−${Math.round(DATA.wyrm.cool(S.lv.wyrm) * v.cool)}°C · ${Math.round(DATA.wyrm.drink(S.lv.wyrm) * v.drink * 60)}/min</small></button>`).join('');
    let status;
    if (S.dormant) status = `<p class="notice">${esc(S.wyrm.name)} is dormant. It wakes once you have 20 water. Put more workers on the Deep Well.</p>`;
    else if (R.net.water < 0) status = `<p class="notice">The cisterns run dry in ${fmtTime(S.res.water / -R.net.water)} at this mist.</p>`;
    else status = `<p class="notice good">Water supply is steady (${perMin(R.net.water)}).</p>`;
    const skins = S.skins.owned.map((id) => `<button class="btn small ${S.skins.on === id ? 'gold' : 'alt'}" data-act="skin" data-arg="${id}">${esc(DATA.skins[id].name)}</button>`).join('');
    const petReady = S.wyrm.petDay !== today();
    const asc = S.wyrm.element ? DATA.ascension.branches[S.wyrm.element] : null;
    return `<div class="section-label">Mist</div><div class="seg">${seg}</div>${status}
      <p class="muted small">Your survivors drink ${perMin(R.thirst).replace('+', '')} on top of what the wyrm needs. A Downpour doubles the wyrm's drinking for 45% more cooling. Let it drizzle on calm days and pour before a sandstorm or heatwave.</p>
      <div class="row wrap"><button class="btn small ${petReady ? 'gold' : 'alt'}" data-act="pet">${icon('i-heart')}Pet ${esc(S.wyrm.name)}${petReady ? ' (daily gift)' : ''}</button><button class="btn small alt" data-act="sheet" data-arg="rename">Rename</button></div>
      ${asc ? `<p class="notice good">${esc(asc.name)} wyrm: ${esc(asc.desc)}</p>` : S.lv.wyrm >= DATA.ascension.level ? '<button class="btn wide gold" data-act="sheet" data-arg="ascend">Choose the Ascension</button>' : `<p class="muted small">At Lv ${DATA.ascension.level} ${esc(S.wyrm.name)} ascends, and you choose the storm it carries.</p>`}
      ${KH.wyrmExtras ? KH.wyrmExtras() : ''}
      <div class="section-label">Scales</div><div class="row wrap">${skins}<button class="btn small alt" data-act="tab" data-arg="shop">More skins</button></div>`;
  }

  function workerControls(pid, R) {
    const b = DATA.buildings[PLOT[pid].type];
    const idle = S.pop - sum(S.workers);
    return `<div class="section-label">Workers</div>
      <div class="row"><div class="grow"><b>${perMin(R.prod[b.prod])}</b> <span class="muted small">${NAME[b.prod].toLowerCase()} right now</span><div class="muted small">${idle} idle survivor${idle === 1 ? '' : 's'}</div></div>
      <div class="stepper"><button data-act="work" data-arg="${pid}:-1" aria-label="Remove worker">−</button><b>${S.workers[pid]}/${KH.slotsOf(pid)}</b><button data-act="work" data-arg="${pid}:1" aria-label="Add worker">+</button></div></div>
      <button class="btn small ${S.autoWork ? 'gold' : 'alt'}" data-act="autowork">${S.autoWork ? 'Auto-assign on' : 'Auto-assign off'}</button>
      ${b.outdoor ? '<p class="muted small">Outdoor work: sandstorms halve output here, and heatwaves cut it harder.</p>' : ''}`;
  }

  function trainingHTML() {
    if (S.training) return jobProgress('training', S.training, S.training.rank != null && KH.ranks ? `Drilling ${KH.ranks.label(S.training)}` : `Training ${S.training.n} ${DATA.troops[S.training.type].name}`);
    const room = Math.max(0, KH.troopCap() - KH.troopsAll());
    UI.trainN = clamp(UI.trainN, 1, Math.max(1, Math.min(KH.batchMax(), room)));
    const t = DATA.troops[UI.trainType];
    const rows = Object.entries(DATA.troops).map(([k, v]) => {
      const lock = v.needs && !S.lv[v.needs];
      return `<button class="troop-row ${UI.trainType === k ? 'on' : ''}" data-act="ttype" data-arg="${k}"><span class="row">${icon(DATA.classes[k].icon)}<span><b>${v.name}</b><br><span class="muted small">${lock ? 'Needs the Copper Mine' : `Beats ${DATA.classes[DATA.counters[k]].name}s`}</span></span></span><b>${fmt(S.troops[k])}</b></button>`;
    }).join('');
    const away = KH.troopsAway ? KH.troopsAway() : 0;
    return `<div class="section-label">Train troops · ${fmt(KH.troopsAll())}/${fmt(KH.troopCap())} housed${away ? ` (${fmt(away)} out marching)` : ''}</div><div class="stack">${rows}</div>
      <div class="row"><span class="grow muted small">Batch size (max ${KH.batchMax()})</span>
      <div class="stepper"><button data-act="tn" data-arg="-10" aria-label="Fewer">−</button><b>${UI.trainN}</b><button data-act="tn" data-arg="10" aria-label="More">+</button></div>
      <button class="btn small alt" data-act="tn" data-arg="max">Max</button></div>
      ${costHTML(t.cost, UI.trainN)}<div class="chip muted">${icon('i-clock')}${fmtTime(KH.trainTime(UI.trainN))}</div>
      <button class="btn wide ${room <= 0 ? 'off' : ''}" data-act="train">${room <= 0 ? 'Barracks full' : `Train ${UI.trainN} ${t.name}`}</button>`;
  }

  function researchHTML() {
    const max = KH.techMax();
    const active = S.research ? jobProgress('research', S.research, `Researching ${DATA.techs.find((t) => t.id === S.research.tech).name} ${S.research.to}`) : '';
    return `${active}<div class="section-label">Research · level cap ${max}</div><div class="stack">${DATA.techs.map((t) => {
      const lvl = S.tech[t.id], isActive = S.research && S.research.tech === t.id;
      let right;
      if (isActive) right = '<span class="muted small">In progress</span>';
      else if (lvl >= DATA.techMaxLevel) right = '<span class="muted small">Complete</span>';
      else if (t.needs && !S.lv[t.needs]) right = `<span class="muted small">${icon('i-lock')}Needs the ${esc(plotName(t.needs))}</span>`;
      else right = `<button class="btn small ${S.research || lvl >= max || !KH.canAfford(KH.techCost(t, lvl)) ? 'off' : ''}" data-act="research" data-arg="${t.id}">Research</button>`;
      return `<div class="card tech"><div class="grow"><h3>${esc(t.name)} <span class="muted small">${lvl}/${DATA.techMaxLevel}</span></h3><div class="muted small">${esc(t.desc)}</div>
        ${lvl < DATA.techMaxLevel && !isActive ? `<div class="row wrap" style="margin-top:6px">${costHTML(KH.techCost(t, lvl))}<span class="chip muted small">${icon('i-clock')}${fmtTime(KH.techTime(t, lvl))}</span></div>` : ''}</div>${right}</div>`;
    }).join('')}</div>`;
  }

  function forecastHTML() {
    const range = KH.forecastRange();
    const items = S.wx.filter((w) => w.end > S.time).slice(0, 8).map((w) => {
      const now = w.start <= S.time;
      const visible = now || w.start - S.time <= range;
      const d = DATA.weather[w.type];
      if (!visible) return `<div class="fc unknown">${icon('i-storm')}<span>Beyond sight</span><span class="muted small">${fmtTime(w.start - S.time)}</span></div>`;
      return `<div class="fc ${w.type} ${now ? 'now' : ''}">${icon(w.type === 'clear' ? 'i-temp' : 'i-storm')}<span><b>${d.name}</b> <span class="muted small">${fmtTemp(KH.outsideTemp(d, false))} by day${d.outdoor < 1 ? ` · outdoor work ${Math.round(d.outdoor * 100)}%` : ''}</span></span>
        <span class="muted small">${now ? `now · ends ${fmtTime(w.end - S.time)}` : `in ${fmtTime(w.start - S.time)}`}</span></div>`;
    });
    return `<div class="forecast">${items.join('')}</div>`;
  }

  function sheetPlot(pid, R) {
    const p = PLOT[pid], type = p.type, b = DATA.buildings[type], L = S.lv[pid];
    const locked = pid !== 'wyrm' && S.lv.wyrm < p.unlock;
    let body = '';
    if (type === 'wyrm') {
      const st = KH.stageOf(L);
      const next = DATA.wyrm.stages.find((s) => s.from > L);
      body += `<div class="wyrm-head">${wyrmCanvas()}<div><div class="wyrm-name">${esc(S.wyrm.name)}</div><div class="chip" style="color:var(--gold)">${esc(st.name)}</div><p class="muted small">${next ? `Next form at Lv ${next.from}` : 'Final form'}</p></div></div>`;
      body += `<p class="muted">${esc(b.desc)}</p>`;
      if (KH.wyrmTop) body += KH.wyrmTop(R);
      body += wyrmControls(R) + effectRows(pid) + upgradeHTML(pid);
    } else {
      body += KH.art.banner('building', type, esc(b.desc));
      if (locked) body += `<p class="notice heat">Unlocks when your Rainwyrm reaches Lv ${p.unlock}.</p>`;
      // raiders on the way: the defense card comes first
      const raidFirst = L && type === 'watchtower' && KH.raidNear && KH.raidNear();
      if (raidFirst) body += KH.raidInfo();
      if (L && b.prod) body += workerControls(pid, R);
      if (L && type === 'shelter') body += `<p class="notice good">${S.pop} survivors housed across ${KH.housing()} beds${S.sick ? `, ${S.sick} sick` : ''}.</p>`;
      if (L && type === 'well') body += `<p class="notice ${R.net.water < 0 ? 'heat' : 'good'}">The keep drinks ${perMin(R.thirst).replace('+', '')} and ${esc(S.wyrm.name)} drinks ${perMin(R.burn).replace('+', '')}. Net ${perMin(R.net.water)}.</p>`;
      if (L && type === 'infirmary') body += `<p class="notice ${S.sick ? 'heat' : 'good'}">${S.sick ? `${S.sick} patient${S.sick > 1 ? 's' : ''} in care.` : 'No one is sick right now.'}</p>`;
      if (L && type === 'hall') body += S.caravan && S.caravan.joined ? `<button class="btn wide alt" data-act="tab" data-arg="caravan">Open ${esc(KH.caravanName ? KH.caravanName() : 'your Caravan')}</button>` : '<button class="btn wide gold" data-act="tab" data-arg="caravan">Find a Caravan</button>';
      if (L && type === 'storehouse') body += `<p class="notice good">Raiders can never take the first ${fmt(KH.protectOf())} of each resource.</p>`;
      body += effectRows(pid);
      if (!locked) body += upgradeHTML(pid);
      if (L && type === 'barracks') body += trainingHTML();
      if (L && type === 'archive') body += researchHTML();
      if (L && KH.plotExtras[type]) body += KH.plotExtras[type](pid, R);
      if (L && KH.charterCard) body += KH.charterCard(pid); // Building Charters (charters.js)
      if (L && type === 'watchtower') body += `${KH.raidInfo && !raidFirst ? KH.raidInfo() : ''}<div class="section-label">What the lookouts see</div>${forecastHTML()}`;
    }
    return { title: plotName(pid), lvl: L ? `Lv ${L}` : locked ? 'Locked' : 'Not built', body };
  }

  function sheetHero(id) {
    const d = HERO[id], h = S.heroes[id];
    const head = `<div class="row" style="align-items:flex-start"><div style="width:112px;flex:none;border-radius:12px;overflow:hidden;border:1px solid var(--line)">${portrait(id)}</div>
      <div class="grow"><div class="r-${d.rarity}" style="font-weight:700">${DATA.rarities[d.rarity].name} · ${DATA.classes[d.cls].name}</div><div class="muted small">${esc(d.title)}</div>
      <p class="small" style="margin-top:6px">${esc(d.bio)}</p></div></div>`;
    const skill = `<div class="card"><b>${esc(d.skill.name)}</b><div class="muted small">${esc(KH.skillText(id))}${h ? ' Grows 20% stronger with every star.' : ''}</div></div>`;
    const post = DATA.stewardPosts[d.steward.kind];
    if (!h) {
      return { title: d.name, lvl: 'Not recruited', body: `${head}${skill}${KH.heroKin ? KH.heroKin(id) : ''}<div class="card"><b>Steward: ${plotName(post.plot)}</b><div class="muted small">${post.label(d.steward.val)}</div></div>
        ${KH.heroAvailable(d) ? `<p class="notice heat">Recruit ${esc(d.name.split(' ')[0])} at the Beacon, or with a ${DATA.rarities[d.rarity].name} Shard Pouch.</p><button class="btn wide" data-act="tab" data-arg="recruit">Go to the Beacon</button>` : `<p class="notice">${esc(d.name.split(' ')[0])} arrives at the Beacon when ${d.act >= 3 ? `Act III begins, after the Ember Throne falls (stage ${DATA.actTwoStage})` : `Act II begins, after you quench the Sunheart (stage ${DATA.actOneStage})`}.</p>`}` };
    }
    const s = KH.heroStats(id), cap = KH.heroCap(id), cost = 2 * h.lvl;
    const isSteward = S.stewards[d.steward.kind] === id;
    const other = S.stewards[d.steward.kind] && !isSteward ? HERO[S.stewards[d.steward.kind]].name.split(' ')[0] : null;
    const needShards = 10 * h.stars;
    const inSquad = S.squad.includes(id), away = KH.heroBusy && KH.heroBusy(id);
    return {
      title: d.name, lvl: `Lv ${h.lvl}`,
      body: `${head}
        ${away ? `<p class="notice">${KH.journeys && KH.journeys.away(id) ? 'Away on a far journey.' : 'Out leading a march on the Dunes.'}</p>` : ''}
        <div class="stats"><div class="stat"><span>Attack</span><b>${fmt(s.atk)}</b></div><div class="stat"><span>Defense</span><b>${fmt(s.def)}</b></div><div class="stat"><span>Health</span><b>${fmt(s.hp)}</b></div></div>
        ${skill}
        ${KH.heroKin ? KH.heroKin(id) : ''}
        ${KH.heroCharm ? KH.heroCharm(id) : ''}
        ${KH.heroSpar ? KH.heroSpar(id) : ''}
        ${KH.heroHeirloom ? KH.heroHeirloom(id) : ''}
        ${KH.heroTale ? KH.heroTale(id) : ''}
        <div class="card stack"><div class="row"><div class="grow"><b>Level ${h.lvl} / ${cap}</b><div class="muted small">Next level costs ${cost} Field Journals · you have ${fmt(S.journals)}</div></div></div>
          <div class="row"><button class="btn grow ${h.lvl >= cap || S.journals < cost ? 'off' : ''}" data-act="lvl" data-arg="${id}:1" data-primary>Level up</button><button class="btn alt ${h.lvl >= cap || S.journals < cost ? 'off' : ''}" data-act="lvl" data-arg="${id}:max">Max</button></div></div>
        <div class="card stack"><div class="row"><div class="grow"><b>${starsHTML(h.stars)}</b><div class="muted small">${h.stars >= DATA.heroMaxStars ? 'Fully starred.' : `${h.shards}/${needShards} shards. Each star adds 15% stats, 10 levels, a stronger skill and a stronger steward bonus.`}</div></div>
          ${h.stars < DATA.heroMaxStars ? `<button class="btn small ${h.shards < needShards ? 'off' : 'gold'}" data-act="star" data-arg="${id}">Add star</button>` : ''}</div>
          ${h.stars < DATA.heroMaxStars ? `<div class="bar xp"><i style="width:${Math.min(100, (h.shards / needShards) * 100)}%"></i></div>` : ''}</div>
        ${KH.heroAwaken ? KH.heroAwaken(id) : ''}
        ${KH.heroTalents ? KH.heroTalents(id) : ''}
        <div class="card stack"><div class="row"><div class="grow"><b>Steward of the ${plotName(post.plot)}</b><div class="muted small">${post.label(Math.round(KH.stewardOf(id) * 10) / 10)} while stationed${other ? `. Replaces ${esc(other)}.` : '.'} Stewards still fight.</div></div>
          <button class="btn small ${isSteward ? 'gold' : 'alt'}" data-act="station" data-arg="${id}">${isSteward ? 'Stationed' : 'Station'}</button></div></div>
        <button class="btn wide ${inSquad ? 'alt' : ''}" data-act="squad" data-arg="${id}">${inSquad ? 'Remove from squad' : 'Add to squad'}</button>`,
    };
  }

  function sheetForecast(R) {
    const dn = KH.dayNight();
    const cool = S.dormant ? 0 : KH.coolOf(S.lv.wyrm);
    const kc = KH.bonus('cool');
    const deg = (v) => `−${Math.round(v * 10) / 10}°C`;
    const [pleasant, warm, hot] = DATA.comfort.map((b) => Math.ceil(b.max));
    return {
      title: 'Forecast', lvl: `Sight ${fmtTime(KH.forecastRange())}`,
      body: `<dl class="kv"><dt>Outside</dt><dd>${fmtTemp(KH.outsideTemp(R.wx))}</dd>
        <dt>${dn.name}</dt><dd>${dn.shift > 0 ? '+' : '−'}${Math.abs(Math.round(dn.shift))}°C · ${dn.name === 'Night' || dn.name === 'Dawn' ? 'sunrise' : 'nightfall'} in ${fmtTime(dn.next)}</dd>
        <dt>${esc(S.wyrm.name)} (${KH.mist().name}${S.autoMist ? ', attuned' : ''})</dt><dd>${deg(cool)}</dd>
        ${S.tech.shade ? `<dt>Shade Sails</dt><dd>${deg(S.tech.shade)}</dd>` : ''}${KH.stewardVal('cool') ? `<dt>Steward</dt><dd>${deg(KH.stewardVal('cool'))}</dd>` : ''}
        ${kc ? `<dt>${KH.keep && KH.keep.raining() ? 'Rain, Caravan and Ascension' : 'Caravan and Ascension'}</dt><dd>${deg(kc)}</dd>` : ''}
        <dt>In the keep</dt><dd class="t-${R.band.name.toLowerCase()}">${fmtTemp(R.temp)} · ${R.band.name}</dd></dl>
        ${KH.keep && KH.keep.activeBuffs().length ? `<div class="section-label">Boosts</div><div class="row wrap">${KH.keep.activeBuffs().map((b) => `<span class="chip small ${b.val < 0 ? 'neg' : ''}">${esc(b.label)} · ${fmtTime(b.until - S.time)}</span>`).join('')}</div>` : ''}
        ${forecastHTML()}
        <div class="card small"><b>How the heat works</b><div class="muted">The sun hunts water: every time your wyrm grows, storms come for it a little hotter. Under ${pleasant}°C the keep is Pleasant and works 10% faster. Above ${warm}°C people start falling ill, and above ${hot}°C the sick can be lost. Nights are ${Math.abs(DATA.day.night)}°C cooler and middays ${DATA.day.noon}°C hotter, so the wyrm can drizzle after dark. If the wells run dry, the wyrm sleeps and people leave to find water. The Watchtower and Signal Mirrors research let you see storms sooner.</div></div>
        <button class="btn wide" data-act="plot" data-arg="wyrm">Tend ${esc(S.wyrm.name)}</button>`,
    };
  }

  function toggle(key, label) {
    return `<div class="row"><span class="grow">${label}</span><button class="switch ${S.settings[key] ? 'on' : ''}" data-act="setting" data-arg="${key}" role="switch" aria-checked="${S.settings[key]}" aria-label="${esc(label)}"><i></i></button></div>`;
  }
  function sheetSettings() {
    if (UI.confirmReset) {
      return { title: 'Start over?', lvl: '', body: '<p class="notice">Erase this keep and start over? Your heroes, buildings and progress will be gone. Copy your save code first if you might want it back.</p><div class="confirm-actions"><button class="btn alt" data-act="resetno">Keep playing</button><button class="btn" data-act="resetyes">Erase keep</button></div>' };
    }
    const native = window.KHNative && window.KHNative.isNative;
    return {
      title: 'Settings', lvl: '',
      body: `<div class="card stack">${toggle('sfx', 'Sound effects')}${toggle('music', 'Music and ambience')}${toggle('haptics', 'Vibration')}${native ? toggle('notify', 'Notifications when builds finish') : ''}${KH.A3 && KH.A3.ok ? toggle('gfx3d', '3D graphics (turn off to save battery)') : ''}${KH.A3 && KH.A3.ok && S.settings.gfx3d !== false && KH.gfxRow ? KH.gfxRow() : ''}${toggle('liveBattle', 'Play battles round by round (off: they resolve at once)')}${toggle('scenes', 'Story scenes before boss fights')}</div>
        <div class="section-label">Your keep</div>
        <dl class="kv"><dt>Time in the keep</dt><dd>${fmtTime(S.time)}</dd><dt>Survivors</dt><dd>${S.pop}</dd><dt>Stages cleared</dt><dd>${S.stage - 1}</dd>
        <dt>Heroes recruited</dt><dd>${Object.keys(S.heroes).length}/${DATA.heroes.length}</dd><dt>Storms survived cleanly</dt><dd>${S.stats.cleanStorms}</dd><dt>Buildings upgraded</dt><dd>${S.stats.upgrades}</dd>
        ${native ? '' : `<dt>Simulated spend</dt><dd>$${S.spentUsd.toFixed(2)}</dd>`}</dl>
        <div class="section-label">Save</div>
        <p class="muted small">Progress saves on this device. To move it to another device or browser, copy your save code there.</p>
        <div class="row wrap"><button class="btn small alt" data-act="sheet" data-arg="savecode">Copy save code</button><button class="btn small alt" data-act="sheet" data-arg="loadcode">Load a save code</button>${native ? '<button class="btn small alt" data-act="restore">Restore purchases</button>' : ''}</div>
        <div class="section-label">About</div>
        ${DATA.privacyUrl ? `<p class="small"><a href="${esc(DATA.privacyUrl)}" target="_blank" rel="noopener">Privacy policy</a></p>` : ''}<p class="muted small">Rainkeep ${DATA.version}. Timers and production run about 30× faster than a typical live-service strategy game, so the whole story fits in a couple of weeks of evenings. Your Caravan's members and the rival keeps on the Dunes are run by the game; when the game is played online, the Caravan tab's Online side is real players.</p>
        ${S.online && Object.keys(S.online.blocked || {}).length ? `<div class="section-label">Blocked players</div><div class="card stack">${Object.keys(S.online.blocked).map((id) => `<div class="row"><span class="grow small">${esc((KH.mp && KH.mp.M.names[id]) || 'A player')}</span><button class="btn small alt" data-act="mpunblock" data-arg="${esc(id)}">Unblock</button></div>`).join('')}</div>` : ''}
        <button class="btn alt wide" data-act="reset">Start a new keep</button>`,
    };
  }

  function sheetIntro() {
    return {
      title: '', lvl: '', noClose: true,
      body: `<div class="intro-art${KH.art.painted('title') ? ' painted' : ''}"><span>The year of the Long Noon</span><h1>Rainkeep</h1></div>
        <p class="lore">The rain stopped a generation ago. At the bottom of a dry well you found a cracked egg, and inside it a creature made of water. You named it ${esc(S.wyrm.name)}.</p>
        <p class="lore">As long as it drinks, its mist keeps the heat off your people. <b>Dig the wells. Water the wyrm. Watch the horizon.</b></p>
        <button class="btn wide" data-act="close">Open the keep</button>`,
    };
  }

  function sheetOffline() {
    const o = UI.sheet.data, l = o.log;
    const gains = {};
    for (const r of RES) if (l[r] > 0.5) gains[r] = Math.floor(l[r]);
    if (l.sunsteel) gains.sunsteel = l.sunsteel;
    const mins = Math.round(o.capped / 60);
    return {
      title: 'While you were away', lvl: '',
      body: `<p>Your keep kept working for ${mins >= 120 ? `${(mins / 60).toFixed(1)} hours` : `${mins} minute${mins === 1 ? '' : 's'}`}${o.seconds > o.capped ? ` (it banks up to ${Math.round((DATA.offline.capSeconds + KH.bonus('offlineCap')) / 3600)} hours of production)` : ''}. ${esc(S.wyrm.name)} kept a gentle mist over the keep, so no one fell ill.</p>
        ${Object.keys(gains).length ? `<div class="costs">${rewardHTML(gains)}</div>` : '<p class="muted">Production was balanced out by what the keep consumed.</p>'}
        ${l.arrived ? `<p class="notice good">${l.arrived} survivor${l.arrived > 1 ? 's' : ''} found their way to the keep.</p>` : ''}
        ${l.built ? `<p class="notice good">Finished: ${l.built.map(esc).join(', ')}.</p>` : ''}
        ${l.marches ? `<p class="notice good">${l.marches.map(esc).join(' ')}</p>` : ''}
        <button class="btn wide" data-act="close">Back to the keep</button>`,
    };
  }

  function sheetOdds() {
    const o = DATA.recruit.odds;
    const pool = DATA.heroes.filter((h) => KH.heroAvailable(h)), later = DATA.heroes.filter((h) => !KH.heroAvailable(h));
    const list = (r) => pool.filter((h) => h.rarity === r).map((h) => esc(h.name)).join(', ');
    const nOf = (r) => pool.filter((h) => h.rarity === r).length;
    const per = (r) => (o[r] * 100) / nOf(r);
    const feat = KH.featured();
    return {
      title: 'Recruitment odds', lvl: '',
      body: `<dl class="kv"><dt class="r-legendary">Legendary</dt><dd>${(o.legendary * 100).toFixed(1)}%</dd><dt class="r-epic">Epic</dt><dd>${(o.epic * 100).toFixed(1)}%</dd><dt class="r-rare">Rare</dt><dd>${(o.rare * 100).toFixed(1)}%</dd></dl>
        <p class="small"><b class="r-legendary">Legendary:</b> ${esc(HERO[feat].name)} (featured) ${((o.legendary * DATA.recruit.featuredShare + (o.legendary * (1 - DATA.recruit.featuredShare)) / nOf('legendary')) * 100).toFixed(2)}%, every other Legendary ${((o.legendary * (1 - DATA.recruit.featuredShare)) / nOf('legendary') * 100).toFixed(2)}% each. <span class="muted">${list('legendary')}</span></p>
        <p class="small"><b class="r-epic">Epic:</b> ${per('epic').toFixed(2)}% each. <span class="muted">${list('epic')}</span></p>
        <p class="small"><b class="r-rare">Rare:</b> ${per('rare').toFixed(2)}% each. <span class="muted">${list('rare')}</span></p>
        <p class="muted small">Your first recruit is ${HERO[DATA.recruit.firstPull].name}. A Legendary is guaranteed on or before the ${DATA.recruit.pity}th recruit since your last one. Every ×10 includes at least one Epic or better. The featured hero changes with each event.${later.length ? ` ${later.map((h) => esc(h.name)).join(', ')} join the pool when Act II begins (after stage ${DATA.actOneStage}), and the odds above are then shared among more heroes.` : ''}</p>`,
    };
  }

  function sheetBuy() {
    const sh = UI.sheet;
    let name, desc, usd, grants = null, id;
    if (sh.skin) {
      const sk = DATA.skins[sh.skin];
      name = sk.name; desc = 'A cosmetic wyrm skin. It changes how your Rainwyrm looks and nothing else.'; usd = sk.usd; id = sh.skin;
    } else {
      const it = KH.shopItem(sh.id);
      name = it.name; desc = it.desc || `${fmt(it.grants.starglass)} Starglass.`; usd = it.usd; id = it.id;
      grants = it.levelPack ? KH.levelPackGrants(it.id) : it.grants;
    }
    return {
      title: name, lvl: price(id, usd),
      body: `${sh.skin ? wyrmCanvas({ skin: sh.skin }) : ''}<p>${esc(desc)}</p>${grants ? `<div class="costs">${rewardHTML(grants)}</div>` : ''}
        <p class="proto-note">This version: no money changes hands. In the store versions this step opens the store's purchase sheet.</p>
        <div class="confirm-actions"><button class="btn alt" data-act="close">Cancel</button><button class="btn" data-act="confirmbuy">Simulate ${price(id, usd)}</button></div>`,
    };
  }

  function sheetResults() {
    const rs = UI.sheet.results;
    return {
      title: 'The beacon answers', lvl: '',
      body: `<div class="results ${rs.length === 1 ? 'single' : ''}">${rs.map((r, i) => `<div class="rcard ${r.rarity}" style="animation-delay:${i * 90}ms">${portrait(r.id)}<p class="r-${r.rarity}">${esc(HERO[r.id].name.split(' ')[0])}</p><p class="${r.isNew ? 'new' : 'muted'}">${r.isNew ? 'New!' : `+${DATA.shardsPerDupe[r.rarity]} shards`}</p></div>`).join('')}</div>
        <div class="confirm-actions"><button class="btn alt" data-act="tab" data-arg="heroes">View heroes</button><button class="btn" data-act="close">Continue</button></div>`,
    };
  }

  function sheetStory() {
    const ch = DATA.chapters.find((c) => c.from === UI.sheet.from) || DATA.chapters[0];
    const idx = DATA.chapters.indexOf(ch) + 1;
    return {
      title: '', lvl: '',
      body: `<div class="story-art ${ch.act ? `act${ch.act}` : ''}"><span>${ch.from > DATA.finalStage ? 'Endless' : `${ch.act === 3 ? 'Act III · ' : ch.act === 2 ? 'Act II · ' : ''}Chapter ${idx}`}</span><h1>${esc(ch.name)}</h1></div>
        <p class="lore">${esc(ch.story.replace(/\{wyrm\}/g, S.wyrm.name))}</p>
        ${KH.chapterScenes ? KH.chapterScenes(ch) : ''}
        <button class="btn wide" data-act="close">${UI.tab === 'world' ? 'Set out' : 'Continue'}</button>`,
    };
  }

  function sheetEvolve() {
    const st = DATA.wyrm.stages.find((s) => s.from === UI.sheet.from) || KH.stageOf(S.lv.wyrm);
    return {
      title: '', lvl: '',
      body: `<div class="evolve">${wyrmCanvas({ level: st.from, cls: 'big' })}<span class="section-label">A new form</span><h1>${esc(st.name)}</h1></div>
        <p class="lore">${esc(S.wyrm.name)} ${esc(st.line)}</p>
        <button class="btn wide" data-act="close">Wonderful</button>`,
    };
  }

  function sheetAscend() {
    const cards = Object.entries(DATA.ascension.branches).map(([id, b]) => `<div class="card asc">
      ${wyrmCanvas({ element: id, level: DATA.ascension.level })}
      <div class="grow"><h3 style="color:${b.color}">${esc(b.name)}</h3><p class="muted small">${esc(b.desc)}</p></div>
      <button class="btn small" data-act="ascend" data-arg="${id}">Choose</button></div>`).join('');
    return {
      title: 'Ascension', lvl: '',
      body: `<p class="lore">${esc(S.wyrm.name)} is ready to ascend. Its storm will take one shape for good. Choose carefully: this can't be changed.</p><div class="stack">${cards}</div>`,
    };
  }

  function sheetRename() {
    return {
      title: `Name your wyrm`, lvl: '',
      body: `<label class="field"><span class="muted small">Name (up to 16 letters)</span><input id="wyrm-name" maxlength="16" value="${esc(S.wyrm.name)}" autocomplete="off" spellcheck="false"></label>
        <div class="confirm-actions"><button class="btn alt" data-act="plot" data-arg="wyrm">Cancel</button><button class="btn" data-act="rename">Save name</button></div>`,
    };
  }

  function sheetEnding() {
    const act = UI.sheet.act || 1, E = act === 3 ? DATA.ending3 : act === 2 ? DATA.ending2 : DATA.ending, last = act === 3;
    const art = last && KH.kinCanvas ? `<div class="kin-pair">${wyrmCanvas({ cls: 'big' })}${KH.kinCanvas('ghaitha', 'big')}</div>` : wyrmCanvas({ cls: 'big' });
    return {
      title: '', lvl: '',
      body: `${KH.art.banner('ending', `act${act}`, '')}<div class="evolve">${art}<span class="section-label">${last ? 'Epilogue' : act === 2 ? 'End of Act II' : 'End of Act I'}</span><h1>${esc(E.title)}</h1></div>
        ${E.lines.map((l) => `<p class="lore">${esc(l.replace(/\{wyrm\}/g, S.wyrm.name))}</p>`).join('')}
        <div class="card"><b>${esc(E.badge)}</b><div class="muted small">${esc(E.note)}</div><div class="costs" style="margin-top:8px">${rewardHTML(E.reward)}</div></div>
        <button class="btn wide gold" data-act="close">${last ? 'Claim and continue' : act === 2 ? 'Claim and begin Act III' : 'Claim and begin Act II'}</button>
        ${last ? '<p class="muted small" style="text-align:center">Made with care. Thank you for keeping the water flowing.</p>' : ''}`,
    };
  }

  function sheetSaveCode() {
    return {
      title: 'Your save code', lvl: '',
      body: `<p class="muted small">Copy this code and paste it into Rainkeep on another device under Settings, Load a save code.</p>
        <textarea id="save-out" class="code" readonly>${esc(KH.exportSave())}</textarea>
        <button class="btn wide" data-act="copysave">Copy code</button>`,
    };
  }
  function sheetLoadCode() {
    return {
      title: 'Load a save code', lvl: '',
      body: `<p class="notice">Loading a code replaces this keep completely.</p>
        <textarea id="save-in" class="code" placeholder="Paste your save code here" spellcheck="false"></textarea>
        <div class="confirm-actions"><button class="btn alt" data-act="close">Cancel</button><button class="btn" data-act="loadsave">Load keep</button></div>`,
    };
  }

  const SHEETS = {
    plot: (R) => sheetPlot(UI.sheet.pid, R), hero: () => sheetHero(UI.sheet.id), forecast: sheetForecast, settings: sheetSettings,
    intro: sheetIntro, offline: sheetOffline, odds: sheetOdds, buy: sheetBuy, results: sheetResults, story: sheetStory, hub: sheetHub, menu: sheetMenu, stores: sheetStores,
    evolve: sheetEvolve, ascend: sheetAscend, rename: sheetRename, ending: sheetEnding, savecode: sheetSaveCode, loadcode: sheetLoadCode,
  };

  function renderSheet(R, force) {
    const el = $('#sheet'), scrim = $('#scrim');
    if (!UI.sheet) KH.nextSheet();
    $('#app').classList.toggle('sheet-open', !!UI.sheet);
    if (!UI.sheet) {
      if (!el.hidden) { el.hidden = true; scrim.hidden = true; el._h = null; el._key = null; }
      return;
    }
    const sh = UI.sheet, k = sh.kind;
    const fn = SHEETS[k] || KH.sheets[k];
    if (!fn) { UI.sheet = null; return; }
    const s = fn(R);
    if (UI.sheet !== sh) return renderSheet(R, true); // the sheet closed or replaced itself
    const html = `${s.title || s.lvl ? `<div class="sheet-head">${sh.back ? `<button class="icon-btn back" data-act="sheetback" aria-label="Back">${icon('i-up')}</button>` : ''}<h2>${esc(s.title)}</h2>${s.lvl ? `<span class="lvl">${esc(s.lvl)}</span>` : ''}
      ${s.noClose ? '' : `<button class="icon-btn" data-act="close" aria-label="Close">${icon('i-close')}</button>`}</div>` : ''}<div class="sheet-body">${s.body}</div>`;
    const key = `${k}:${sh.pid || sh.id || sh.skin || sh.from || sh.tile || ''}`;
    const fresh = el.hidden || el._key !== key;
    el.hidden = false; scrim.hidden = false;
    setHTML(el, html, force || fresh);
    if (fresh) {
      el._key = key;
      const body = el.querySelector('.sheet-body');
      if (body) body.scrollTop = 0;
    }
  }

  // ======================================================================
  // Toasts
  // ======================================================================
  function toast(msg, kind = '', key = null, gap = 0) {
    const now = performance.now();
    if (key) {
      if (UI.lastToast[key] && now - UI.lastToast[key] < gap * 1000) return;
      UI.lastToast[key] = now;
    }
    const host = $('#toasts');
    if (!host) return;
    if ([...host.children].some((c) => c.textContent === msg)) return;
    while (host.children.length >= 2) host.firstChild.remove();
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 3000);
    if (kind === 'warn') { audio('warn'); haptic('warning'); }
  }
  KH.toast = toast;

  // ======================================================================
  // Battle overlay
  // ======================================================================
  function startBattle(b) {
    UI.battle = { ...b, i: -1, timer: null };
    UI.sheet = null;
    const el = $('#battle');
    const foe = b.foe;
    const heroes = (b.team.heroes || []).filter((id) => S.heroes[id]);
    const h0 = b.opts && b.opts.startHp != null ? Math.min(b.team.hp, b.opts.startHp) : b.team.hp;
    el.innerHTML = `
      <div class="b-title"><span class="stage-num">${esc(b.title)}</span><h2>${esc(foe.name)}</h2></div>
      <div class="b-field">
        <div class="b-side" id="b-foe">${foe.portrait ? `<div class="b-rival">${portrait(foe.portrait)}</div>` : foeArt(foe)}
          <div class="b-hp"><div class="lbl"><span>${esc(foe.name)}</span><span id="b-eh">${fmt(foe.hp)}</span></div><div class="bar foe"><i id="b-ehb" style="width:100%"></i></div></div>
        </div>
        <div class="b-log" id="b-log">${esc(b.intro || 'Your squad marches out across the sand…')}</div>
        <div class="b-side" id="b-us">
          <div class="squad">${heroes.map((id) => `<div class="slot">${portrait(id)}</div>`).join('') || '<div class="slot">—</div>'}</div>
          <div class="b-hp"><div class="lbl"><span>${esc(b.sideLabel || 'Your squad')} · ${fmt(sum(b.team.troops))} troops</span><span id="b-th">${fmt(h0)}</span></div><div class="bar"><i id="b-thb" style="width:${(h0 / b.team.hp) * 100}%"></i></div></div>
        </div>
      </div>
      <div id="b-foot"><button class="btn alt wide" data-act="bskip">Skip</button></div>`;
    el.hidden = false;
    const step = () => {
      const B = UI.battle;
      if (!B || B.done) return;
      if (B.i === -1) {
        B.i = 0;
        if (B.result.breath > 0) {
          const after = Math.max(0, foe.hp - B.result.breath);
          $('#b-ehb').style.width = `${(after / foe.hp) * 100}%`;
          $('#b-eh').textContent = fmt(after);
          floaty('#b-foe', `−${fmt(B.result.breath)}`, 'torrent');
          $('#b-log').textContent = `${S.wyrm.name} calls a torrent!`;
          audio('roar');
          B.timer = setTimeout(step, 650);
          return;
        }
      }
      const r = B.result.rounds[B.i];
      if (!r) return finishBattle();
      $('#b-ehb').style.width = `${(r.eh / foe.hp) * 100}%`;
      $('#b-eh').textContent = fmt(r.eh);
      // breath and hero skills fired this round (auto-battle)
      const lines = [];
      for (const a of r.acts || []) {
        if (a.kind === 'breath') { lines.push(...breathFx(a, '#b-foe', '#b-us')); audio('roar'); }
        else { if (a.dmg) floaty('#b-foe', `−${fmt(a.dmg)}`, 'skill'); if (a.heal) floaty('#b-us', `+${fmt(a.heal)}`, 'heal'); lines.push(skillLine(a)); }
      }
      if (r.ours) { floaty('#b-foe', `−${fmt(r.ours)}`, ''); audio('hit'); haptic('light'); }
      $('#b-log').textContent = lines.join(' ') || (B.i === 0 && B.team.fx.burst ? 'Opening charge!' : r.windup ? 'A heavy blow is coming!' : `Round ${B.i + 1}`);
      B.timer = setTimeout(() => {
        if (!UI.battle || UI.battle.done) return;
        $('#b-thb').style.width = `${(r.th / B.team.hp) * 100}%`;
        $('#b-th').textContent = fmt(r.th);
        if (r.stunned) $('#b-log').textContent = `${foe.name} thrashes under the water and lands nothing.`;
        if (r.theirs) { floaty('#b-us', `−${fmt(r.theirs)}`, 'hurt'); audio('hurt'); }
        if (r.venom) floaty('#b-us', `−${fmt(r.venom)}`, 'venom');
        B.i++;
        B.timer = setTimeout(step, 360);
      }, 360);
    };
    UI.battle.timer = setTimeout(step, 600);
  }
  KH.startBattle = startBattle;
  // a full-screen overlay (a battle, Cloud Run, the fishing pond) hides the keep, which then skips drawing
  const COVERS = ['#battle', '#cloudrun', '#fishing', '#clash', '#derby'];
  KH.covered = () => COVERS.some((sel) => { const e = $(sel); return !!e && !e.hidden; });

  // ======================================================================
  // Live battles: the same engine stepped round by round. Tap a hero when its skill is charged,
  // spend the Rainwyrm's breath once (best on a wind-up), or let Auto play it. cfg.onEnd(result)
  // applies the outcome and returns { rewards, after, extra, resultTitle } for the result panel.
  // ======================================================================
  KH.quickBattles = /[?&]quick/.test(location.search);
  KH.fightLive = (cfg) => {
    if (KH.quickBattles || S.settings.liveBattle === false) {
      const result = KH.simulateBattle(cfg.team, cfg.foe, cfg.opts || {});
      return startBattle({ ...cfg, result, ...(cfg.onEnd(result) || {}) });
    }
    liveBattle(cfg);
  };
  function liveBattle(cfg) {
    const st = KH.newBattle(cfg.team, cfg.foe, cfg.opts || {});
    UI.battle = { ...cfg, live: true, st, q: { breath: false, skills: new Set() }, i: 0, timer: null, result: { win: false, rounds: [] } };
    UI.sheet = null;
    const el = $('#battle'), foe = cfg.foe, BT = DATA.battle;
    const skills = st.skills.map((sk, i) => {
      const d = BT.skills[sk.kind];
      return `<button class="b-skill" data-act="bskill" data-arg="${i}" id="b-sk${i}" aria-label="${esc(HERO[sk.id].name)}: ${esc(d.name)}">${portrait(sk.id)}<span class="b-ring"><i></i></span><span class="b-skn">${esc(d.name)}</span></button>`;
    }).join('');
    el.innerHTML = `
      <div class="b-title"><span class="stage-num">${esc(cfg.title)}</span><h2>${esc(foe.name)}</h2>${foe.traits && foe.traits.length ? `<div class="b-traits">${traitChips(foe)}</div>` : ''}</div>
      <div class="b-field">
        <div class="b-side" id="b-foe">${foe.portrait ? `<div class="b-rival">${portrait(foe.portrait)}</div>` : foeArt(foe)}<div class="b-wind" id="b-wind">Winding up!</div>
          <div class="b-hp"><div class="lbl"><span>${esc(foe.name)}</span><span id="b-eh">${fmt(foe.hp)}</span></div><div class="bar foe"><i id="b-ehb" style="width:100%"></i></div></div>
        </div>
        <div class="b-log" id="b-log">${esc(cfg.intro || 'Your squad marches out across the sand…')}</div>
        <div class="b-side" id="b-us">
          <div class="squad b-skills">${skills || '<div class="slot">—</div>'}</div>
          <div class="b-hp"><div class="lbl"><span>${esc(cfg.sideLabel || 'Your squad')} · ${fmt(sum(cfg.team.troops))} troops</span><span id="b-th">${fmt(st.th)}</span></div><div class="bar"><i id="b-thb" style="width:${(st.th / cfg.team.hp) * 100}%"></i></div></div>
        </div>
      </div>
      <div id="b-foot"><div class="b-acts">
        ${st.breath > 0 ? `<button class="btn gold" data-act="bbreath" id="b-breath">${icon(DATA.battle.arts[st.art].icon)}${esc(DATA.battle.arts[st.art].name)}</button>` : ''}
        <button class="btn alt small" data-act="bauto" id="b-auto"></button><button class="btn alt small" data-act="bspeed" id="b-speed"></button><button class="btn alt small" data-act="bskip">Skip</button></div>
        <p class="muted small b-tip">Tap a hero when their ring is full. Save the breath for a wind-up to break it.</p></div>`;
    el.hidden = false;
    liveUI();
    UI.battle.timer = setTimeout(liveTick, 900);
  }
  const speed = () => (S.settings.battleSpeed === 2 ? 2 : 1);
  function liveUI() {
    const B = UI.battle;
    if (!B || !B.live) return;
    const st = B.st, BT = DATA.battle;
    st.skills.forEach((sk, i) => {
      const b = $(`#b-sk${i}`);
      if (!b) return;
      const k = Math.min(1, sk.charge / BT.charge);
      b.querySelector('.b-ring i').style.width = `${k * 100}%`;
      b.classList.toggle('ready', k >= 1 && !B.done);
      b.classList.toggle('queued', B.q.skills.has(i));
    });
    const br = $('#b-breath');
    if (br) { br.disabled = st.breathUsed || B.done; br.classList.toggle('queued', B.q.breath); br.classList.toggle('hint', st.windup && !st.breathUsed); }
    const w = $('#b-wind');
    if (w) w.classList.toggle('on', st.windup && !st.over);
    const auto = $('#b-auto');
    if (auto) { auto.textContent = S.settings.autoBattle ? 'Auto: on' : 'Auto: off'; auto.classList.toggle('gold', !!S.settings.autoBattle); }
    const sp = $('#b-speed');
    if (sp) sp.textContent = `${speed()}×`;
  }
  const skillLine = (a) => {
    const d = DATA.battle.skills[a.kind], who = HERO[a.id].name.split(' ')[0];
    if (a.kind === 'dr') return `${who} raises a ${d.name}!`;
    if (a.kind === 'heal') return `${who} mends the line (+${fmt(a.heal)}).`;
    if (a.kind === 'pierce') return `${who} sunders their guard!`;
    return `${who}: ${d.name}!`;
  };
  function liveTick() {
    const B = UI.battle;
    if (!B || !B.live || B.done) return;
    const st = B.st;
    const acts = S.settings.autoBattle ? KH.autoActs(st) : { skills: [] };
    if (B.q.breath) acts.breath = true;
    for (const i of B.q.skills) if (!acts.skills.includes(i)) acts.skills.push(i);
    B.q = { breath: false, skills: new Set() };
    const rec = KH.battleStep(st, acts);
    const sp = speed(), lines = [];
    for (const a of rec.acts) {
      if (a.kind === 'breath') { audio('roar'); lines.push(...breathFx(a, '#b-foe', '#b-us')); }
      else { if (a.dmg) floaty('#b-foe', `−${fmt(a.dmg)}`, 'skill'); if (a.heal) floaty('#b-us', `+${fmt(a.heal)}`, 'heal'); lines.push(skillLine(a)); if (a.cured) lines.push('The venom is drawn out.'); audio('upgrade'); }
    }
    const bars = () => {
      $('#b-ehb').style.width = `${(st.eh / B.foe.hp) * 100}%`; $('#b-eh').textContent = fmt(st.eh);
      $('#b-thb').style.width = `${(rec.th / B.team.hp) * 100}%`; $('#b-th').textContent = fmt(rec.th);
    };
    if (rec.ours) { setTimeout(() => { if (UI.battle === B) { floaty('#b-foe', `−${fmt(rec.ours)}`, ''); audio('hit'); haptic('light'); } }, lines.length ? 220 / sp : 0); }
    $('#b-log').textContent = lines.join(' ') || (st.r === 1 && B.team.fx.burst ? 'Opening charge!' : rec.windup ? `Round ${st.r} · the heavy blow falls` : `Round ${st.r}`);
    $('#b-ehb').style.width = `${(st.eh / B.foe.hp) * 100}%`; $('#b-eh').textContent = fmt(st.eh);
    B.timer = setTimeout(() => {
      if (UI.battle !== B || B.done) return;
      if (rec.stunned) $('#b-log').textContent = `${B.foe.name} thrashes under the water and lands nothing.`;
      if (rec.theirs) {
        floaty('#b-us', `−${fmt(rec.theirs)}`, rec.windup ? 'hurt big' : 'hurt');
        audio('hurt');
        if (rec.windup) { $('#b-log').textContent = rec.guarded ? 'The heavy blow lands on raised shields.' : 'A heavy blow!'; haptic('medium'); }
      }
      if (rec.regen) floaty('#b-foe', `+${fmt(rec.regen)}`, 'heal');
      if (rec.venom) floaty('#b-us', `−${fmt(rec.venom)}`, 'venom');
      if (rec.regen || rec.venom) $('#b-log').textContent = [rec.regen ? `${B.foe.name} regenerates.` : '', rec.venom ? 'The venom burns.' : ''].filter(Boolean).join(' ');
      bars();
      if (st.over) return endLive();
      if (rec.next === 'windup') $('#b-log').textContent = `${B.foe.name} is winding up a heavy blow!`;
      liveUI();
      B.timer = setTimeout(liveTick, 760 / sp);
    }, 420 / sp);
    liveUI();
  }
  function endLive() {
    const B = UI.battle;
    if (!B || !B.live || B.endedLive) return;
    B.endedLive = true;
    clearTimeout(B.timer);
    const st = B.st;
    while (!st.over) KH.battleStep(st, KH.autoActs(st));
    const result = { win: st.win, rounds: st.rounds, breath: 0, timeout: st.timeout, th: st.th };
    Object.assign(B, { result }, B.onEnd(result) || {});
    B.live = false;
    finishBattle();
  }
  ACT.bskill = (i) => {
    const B = UI.battle;
    if (!B || !B.live || B.done) return;
    i = Number(i);
    const sk = B.st.skills[i];
    if (!sk) return;
    if (sk.charge < DATA.battle.charge) return toast(`${HERO[sk.id].name.split(' ')[0]} is still gathering strength.`, '', 'skwait', 1);
    if (B.q.skills.has(i)) B.q.skills.delete(i); else B.q.skills.add(i);
    liveUI();
  };
  ACT.bbreath = () => {
    const B = UI.battle;
    if (!B || !B.live || B.done || B.st.breathUsed) return;
    B.q.breath = !B.q.breath;
    liveUI();
  };
  ACT.bauto = () => { S.settings.autoBattle = !S.settings.autoBattle; liveUI(); };
  ACT.bspeed = () => { S.settings.battleSpeed = speed() === 2 ? 1 : 2; liveUI(); };
  function floaty(sel, text, cls) {
    const host = $(sel);
    if (!host) return;
    const f = document.createElement('div');
    f.className = `floaty ${cls}`;
    f.textContent = text;
    host.appendChild(f);
    host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake');
    setTimeout(() => f.remove(), 800);
  }
  function finishBattle() {
    const B = UI.battle;
    if (!B || B.done) return;
    clearTimeout(B.timer);
    const rounds = B.result.rounds;
    const last = rounds[rounds.length - 1] || { eh: B.foe.hp, th: B.team.hp };
    $('#b-ehb').style.width = `${(last.eh / B.foe.hp) * 100}%`;
    $('#b-eh').textContent = fmt(last.eh);
    $('#b-thb').style.width = `${(last.th / B.team.hp) * 100}%`;
    $('#b-th').textContent = fmt(last.th);
    const win = B.result.win;
    $('#b-log').textContent = win ? `${B.foe.name} defeated${rounds.length ? ` in ${rounds.length} round${rounds.length > 1 ? 's' : ''}` : ' by the torrent alone'}.` : B.result.timeout ? B.timeoutLine || 'The squad could not break through in time.' : B.loseLine || 'The squad falls back to the keep.';
    const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === B.foe.cls);
    const missing = (B.foe.traits || []).filter((t) => !traitAnswered(t, B.team.heroes || [], B.st ? B.st.art : undefined));
    const answer = { armored: 'a hero with Sunder', regen: 'a hero with Volley or Charge', venom: 'a hero with Mend' };
    const tips = win || B.noTips ? '' : `<p class="muted small">Level your heroes, train more troops, or bring a ${DATA.classes[counter].name} hero: they hit ${esc(B.foe.name)} 20% harder.${missing.filter((t) => answer[t]).map((t) => ` It is ${DATA.traits.list[t].name}: bring ${answer[t]}.`).join('')}</p>`;
    $('#b-foot').innerHTML = `<div class="b-result">
      <h2 class="${win || B.resultTitle ? 'win' : 'lose'}">${esc(B.resultTitle || (win ? 'Victory' : 'Defeat'))}</h2>
      ${B.rewards ? `<div class="costs">${rewardHTML(B.rewards)}</div>` : ''}${B.extra ? `<p class="small">${B.extra}</p>` : ''}${tips}
      <button class="btn wide" data-act="bclose">Continue</button></div>`;
    audio(win || B.resultTitle ? 'victory' : 'defeat');
    haptic(win || B.resultTitle ? 'success' : 'warning');
    B.done = true;
    B.timer = null;
  }
  ACT.bskip = () => (UI.battle && UI.battle.live ? endLive() : finishBattle());
  ACT.bclose = () => {
    const B = UI.battle;
    UI.battle = null;
    $('#battle').hidden = true;
    if (B && B.after) for (const s of B.after) KH.queueSheet(s);
    if (B && B.onClose) B.onClose();
  };

  // ======================================================================
  // UI actions
  // ======================================================================
  const TAB_ALIAS = { recruit: ['heroes', 'beacon'], roster: ['heroes', 'roster'], gear: ['heroes', 'gear'], expedition: ['world', 'expedition'], map: ['world', 'map'], spire: ['world', 'spire'], duels: ['world', 'duels'] };
  ACT.tab = (tab) => {
    let sub = null;
    if (TAB_ALIAS[tab]) [tab, sub] = TAB_ALIAS[tab];
    if (sub) UI.sub[tab] = sub;
    UI.tab = tab;
    UI.sheet = null;
    const panel = $('#panel');
    panel.scrollTop = 0;
    panel._h = null;
    maybeChapterStory();
  };
  ACT.sub = (arg) => {
    const [tab, sub] = arg.split(':');
    UI.sub[tab] = sub;
    $('#panel').scrollTop = 0;
    maybeChapterStory();
  };
  function maybeChapterStory() {
    if (UI.tab === 'world' && UI.sub.world === 'expedition') {
      const ch = KH.chapterOf(S.stage);
      if (!S.story.chapters.includes(ch.from)) KH.queueSheet({ kind: 'story', from: ch.from });
    }
  }
  ACT.close = () => {
    const sh = UI.sheet;
    if (sh) {
      if (sh.kind === 'intro') S.seenIntro = true;
      if (sh.kind === 'story' && !S.story.chapters.includes(sh.from)) S.story.chapters.push(sh.from);
      if (sh.kind === 'evolve' && !S.story.forms.includes(sh.from)) S.story.forms.push(sh.from);
      if (sh.kind === 'ending' && !sh.act && !S.endingSeen) {
        S.endingSeen = true;
        KH.grant(DATA.ending.reward);
        S.skins.on = DATA.ending.reward.skin;
      }
      if (sh.kind === 'ending' && sh.act === 2 && !S.ending2Seen) {
        S.ending2Seen = true;
        KH.grant(DATA.ending2.reward);
        S.skins.on = DATA.ending2.reward.skin;
        KH.emit('ending2');
      }
      if (sh.kind === 'ending' && sh.act === 3 && !S.ending3Seen) {
        S.ending3Seen = true;
        KH.grant(DATA.ending3.reward);
        S.skins.on = DATA.ending3.reward.skin;
        KH.emit('ending3');
      }
    }
    UI.sheet = null;
    UI.confirmReset = false;
  };
  ACT.plot = (pid) => {
    if (UI.tab !== 'town') ACT.tab('town');
    UI.sheet = { kind: 'plot', pid };
    if (KH.town3d && KH.town3d.focus) KH.town3d.focus(pid);
  };
  ACT.camhome = () => { if (KH.town3d && KH.town3d.reset) KH.town3d.reset(); };
  ACT.go = (target) => {
    const [kind, arg] = target.split(':');
    if (kind === 'surplus') { ACT.tab('town'); if (KH.keep && !KH.keep.bubbles().length) toast('Surplus builds up over working buildings. Tap the bubble when it appears.', ''); return; }
    if (kind === 'sheet' && arg === 'incident') return ACT.incident ? ACT.incident() : null;
    if (kind === 'sheet' && arg === 'merchant') return ACT.merchant ? ACT.merchant() : null;
    if (kind === 'plot') ACT.plot(arg);
    else if (kind === 'sheet') ACT.sheet(arg);
    else ACT.tab(arg);
  };
  ACT.sheet = (kind) => { UI.sheet = { kind }; };
  ACT.forecast = () => { UI.sheet = { kind: 'forecast' }; };
  ACT.settings = () => { UI.sheet = { kind: 'settings' }; };
  ACT.hero = (id) => { UI.sheet = { kind: 'hero', id }; };
  ACT.odds = () => { UI.sheet = { kind: 'odds' }; };
  ACT.story = (from) => { UI.sheet = { kind: 'story', from: Number(from) }; };
  ACT.setting = (key) => {
    S.settings[key] = !S.settings[key];
    if (window.KHAudio) window.KHAudio.setEnabled({ sfx: S.settings.sfx, music: S.settings.music });
  };
  ACT.copysave = () => {
    const ta = $('#save-out');
    if (!ta) return;
    const done = () => toast('Save code copied.', 'good');
    try {
      navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('Select the code and copy it.', ''); });
    } catch (e) { ta.select(); toast('Select the code and copy it.', ''); }
  };
  ACT.loadsave = () => {
    const ta = $('#save-in');
    if (!ta || !ta.value.trim()) return toast('Paste a save code first.', 'warn');
    try {
      KH.importSave(ta.value);
      KH.hooks.boot.forEach((f) => f(false));
      UI.sheet = null;
      UI.sheetQueue = [];
      ACT.tab('town');
      toast('Keep loaded.', 'good');
    } catch (e) {
      toast("That code didn't work. Check that you copied all of it.", 'warn');
    }
  };

  // ======================================================================
  // Tutorial hints: pulse whatever the current quest needs pressed next
  // ======================================================================
  let toldDone = -1;
  function applyHints() {
    document.querySelectorAll('.hint').forEach((e) => e.classList.remove('hint'));
    const q = DATA.quests[S.quest];
    if (!q || UI.battle) return;
    const mark = (sel) => { const e = $(sel); if (e) e.classList.add('hint'); return !!e; };
    // a quest finished away from the keep (a recruit at the Beacon, a battle on the Dunes): its Claim is on the
    // keep's quest bar, so the Keep tab pulses and a toast says so, once
    if (q.check(S)) {
      if (UI.tab !== 'town' && !UI.sheet) {
        mark('#tabs [data-arg="town"]');
        if (toldDone !== S.quest) { toldDone = S.quest; toast('Quest complete. Claim your reward in the Keep.', 'good', 'questdone', 4); }
      }
      return;
    }
    const [kind, arg] = q.go.split(':');
    if (UI.sheet) {
      if (kind === 'sheet' && (UI.sheet.kind === 'hub' || UI.sheet.kind === 'menu')) { mark(`#sheet .hub-tile[data-arg$="|${arg}"]`); return; }
      if (kind === 'plot' && UI.sheet.kind === 'plot' && UI.sheet.pid === arg) {
        if (arg === 'wyrm' && /Pet/.test(q.text)) mark('#sheet [data-act="pet"]');
        else if (arg === 'wyrm' && /rain/i.test(q.text)) mark('#sheet [data-act="rain"]');
        else if (/Train/.test(q.text)) mark('#sheet [data-act="train"]');
        else if (/research/i.test(q.text)) mark('#sheet [data-act="research"]:not(.off)');
        else mark('#sheet [data-act="build"]');
      } else if (UI.sheet.kind === 'hero') mark('#sheet [data-primary]:not(.off)') || mark('#sheet [data-act="station"]');
      else if (KH.sheetHint) KH.sheetHint(q, kind, arg, mark);
      return;
    }
    if (kind === 'plot') { if (UI.tab !== 'town') mark('#tabs [data-arg="town"]'); return; }
    if (kind === 'surplus') { if (UI.tab !== 'town') mark('#tabs [data-arg="town"]'); return; }
    if (kind === 'sheet' && arg === 'incident') { mark('#queue .qchip.incident'); return; }
    if (kind === 'sheet' && arg === 'merchant') { mark('#side [data-act="merchant"]'); return; }
    if (kind === 'sheet') { mark(`#side [data-arg="${arg}"]`) || mark(`#side [data-members~="${arg}"]`) || mark('#hud [data-act="menu"]'); return; }
    const [tab, sub] = TAB_ALIAS[arg] || [arg, null];
    if (UI.tab !== tab) { mark(`#tabs [data-arg="${tab}"]`); return; }
    if (sub && UI.sub[tab] !== sub) { mark(`.subtabs [data-arg="${tab}:${sub}"]`); return; }
    if (tab === 'heroes' && UI.sub.heroes === 'roster') { mark('.hcard:not(.missing)'); return; }
    mark('#panel [data-primary]') || mark('#world [data-primary]');
  }

  // ======================================================================
  // Render all
  // ======================================================================
  let lastR = null;
  KH.lastRates = () => lastR;
  function renderAll(force) {
    if (!S) return;
    // story beats that must never be skipped: bring them back if something replaced them
    if (!UI.sheet && !UI.battle) {
      const queued = (k) => UI.sheetQueue.some((s) => s.kind === k);
      if (S.stage > DATA.actOneStage && !S.endingSeen && !queued('ending')) KH.queueSheet({ kind: 'ending' });
      else if (S.stage > DATA.actTwoStage && S.endingSeen && !S.ending2Seen && !queued('ending')) KH.queueSheet({ kind: 'ending', act: 2 });
      else if (S.stage > DATA.finalStage && S.ending2Seen && !S.ending3Seen && !queued('ending')) KH.queueSheet({ kind: 'ending', act: 3 });
    }
    const R = KH.rates(false);
    lastR = R;
    renderHUD(R);
    renderStageOverlays();
    renderDots();
    renderPanel(force);
    for (const f of KH.renderHooks) f(force, R);
    renderSheet(R, force);
    UI.upgradable = new Set();
    if (S.builds.length < S.builders) {
      for (const pid of Object.keys(PLOT)) {
        if (S.lv[pid] && !KH.upgradeBlock(pid) && KH.canAfford(KH.buildCost(pid, S.lv[pid] + 1))) UI.upgradable.add(pid);
      }
    }
    applyHints();
    if (window.KHAudio) window.KHAudio.setAmbience({ weather: KH.keep && KH.keep.raining() ? 'rain' : KH.curWx().type, mist: S.dormant ? 'off' : S.mist, active: UI.tab === 'town' && !document.hidden });
  }
  KH.renderAll = renderAll;

  // ======================================================================
  // Input
  // ======================================================================
  document.addEventListener('pointerdown', () => {
    UI.pointerDown = true;
    clearTimeout(UI.pdTimer);
    if (window.KHAudio) window.KHAudio.init();
  }, true);
  const release = () => { clearTimeout(UI.pdTimer); UI.pdTimer = setTimeout(() => { UI.pointerDown = false; }, 120); };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  const QUIET = new Set(['bskip', 'close']);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !S) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    if (!QUIET.has(el.dataset.act)) audio('tap');
    fn(el.dataset.arg, el);
    KH.save();
    renderAll(true);
  });
  document.addEventListener('keydown', (e) => {
    // Enter that ends a word being composed (Chinese, Japanese, Korean input) isn't a send
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' && UI.sheet && UI.sheet.kind !== 'intro') { ACT.close(); renderAll(true); }
    if (e.key === 'Enter' && e.target && e.target.id === 'wyrm-name') { ACT.rename(); renderAll(true); }
    // an input that names an action for Enter (a chat line, a search) runs it
    else if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.enter && ACT[e.target.dataset.enter]) { e.preventDefault(); ACT[e.target.dataset.enter](e.target.dataset.arg); renderAll(true); }
  });

  // ======================================================================
  // Sound + haptics for game events
  // ======================================================================
  KH.on('buildStart', () => audio('build'));
  KH.on('upgrade', (e) => { if (!e.offline) { audio('complete'); haptic('success'); } });
  KH.on('research', () => audio('upgrade'));
  KH.on('heroLevel', () => audio('upgrade'));
  KH.on('heroStar', () => { audio('upgrade'); haptic('medium'); });
  KH.on('quest', () => audio('claim'));
  KH.on('patrol', () => audio('claim'));
  KH.on('purchase', () => audio('coin'));
  KH.on('pull', (e) => {
    const leg = e.results.some((r) => r.rarity === 'legendary');
    audio(leg ? 'legendary' : 'recruit');
    if (leg) haptic('heavy');
  });
  KH.on('stormSighted', () => audio('storm'));
  KH.on('pet', () => audio('pet'));
  KH.on('rain', () => { audio('thunder'); haptic('medium'); });
  KH.on('evolve', () => { audio('roar'); haptic('heavy'); });
  KH.on('ascend', () => audio('roar'));

  // ======================================================================
  // Native: prices, notifications while the app is in the background
  // ======================================================================
  const scheduled = new Set();
  KH.on('hidden', () => {
    const N = window.KHNative;
    if (!N || !N.isNative || !S.settings.notify) return;
    const at = (end) => Date.now() + (end - S.time) * 1000;
    for (const b of S.builds) { const id = `build-${b.plot}`; N.notify(id, 'Construction finished', `${plotName(b.plot)} reached Lv ${b.to}.`, at(b.end)); scheduled.add(id); }
    if (S.research) { N.notify('research', 'Research finished', 'Your scholars have news. Come see.', at(S.research.end)); scheduled.add('research'); }
    if (S.training) { N.notify('training', S.training.rank != null ? 'Drill finished' : 'Troops ready', S.training.rank != null && KH.ranks ? `${KH.ranks.label(S.training)}: the drill is done.` : `${S.training.n} ${DATA.troops[S.training.type].name} are ready.`, at(S.training.end)); scheduled.add('training'); }
    if (KH.notifyHooks) for (const f of KH.notifyHooks) for (const n of f() || []) { N.notify(n.id, n.title, n.body, at(n.end)); scheduled.add(n.id); }
  });
  KH.on('visible', () => {
    const N = window.KHNative;
    if (!N) return;
    for (const id of scheduled) N.cancel(id);
    scheduled.clear();
  });
  KH.on('booted', () => {
    if (window.KHAudio) window.KHAudio.setEnabled({ sfx: S.settings.sfx, music: S.settings.music });
    const N = window.KHNative;
    if (N && N.init) {
      Promise.resolve(N.init({ revenueCatApiKey: DATA.revenueCatApiKey })).then(() => N.products ? N.products() : []).then((list) => {
        const SK = N.SKUS || {};
        for (const p of list || []) {
          const id = Object.keys(SK).find((k) => SK[k] === p.sku) || p.sku;
          if (p.priceString) UI.prices[id] = p.priceString;
        }
        renderAll(true);
      }).catch(() => {});
    }
    if (S.stage > DATA.actOneStage && !S.endingSeen) KH.queueSheet({ kind: 'ending' });
    if (S.lv.wyrm >= DATA.ascension.level && !S.wyrm.element) KH.queueSheet({ kind: 'ascend' });
  });
})();

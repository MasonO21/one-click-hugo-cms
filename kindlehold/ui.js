/*
 * Kindlehold UI: HUD, tabs, panels, sheets, toasts, battles, hints, input.
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
      if (k === 'kpoints') return `<span class="chip">${icon('i-kindred')}${fmt(v)} Kindred points</span>`;
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
  const SKIN_TONES = ['#f2cba8', '#d9a47c', '#b07850', '#7d4e33', '#e9bc95', '#c48a62'];
  const RAR_BG = { rare: ['#132a45', '#2c5d8f'], epic: ['#221840', '#5b3d92'], legendary: ['#33230a', '#9a6d1c'] };
  const BEARDS = { bram: '#3b2a1d', gunnar: '#a8682e', ondrak: '#d9d2c4', oskar: '#6b4a2e', rurik: '#2a1d14', tomas: '#7a5434' };
  function portrait(id) {
    const d = HERO[id], i = DATA.heroes.indexOf(d);
    const [bg1, bg2] = RAR_BG[d.rarity];
    const skin = SKIN_TONES[(i * 5) % SKIN_TONES.length];
    const cloak = `hsl(${d.hue} 38% 34%)`, cloakD = `hsl(${d.hue} 40% 20%)`, accent = `hsl(${d.hue} 75% 64%)`;
    let gear = '';
    if (d.cls === 'guard') {
      gear = `<path d="M33 52 C33 27 67 27 67 52 Z" fill="#9aa6b2"/><path d="M37 40 C42 31 58 31 63 40" stroke="#c9d2dc" stroke-width="2" fill="none"/>
        <rect x="31" y="47" width="38" height="6" rx="3" fill="#7c8794"/><rect x="48.5" y="47" width="3" height="13" fill="#7c8794"/>
        <path d="M50 26 C56 16 66 16 70 20 C62 20 56 24 52 30 Z" fill="${accent}"/>`;
    } else if (d.cls === 'bow') {
      gear = `<path d="M29 64 C26 36 38 22 50 20 C62 22 74 36 71 64 C67 50 62 41 50 39 C38 41 33 50 29 64 Z" fill="${cloak}"/>
        <path d="M50 20 C62 22 74 36 71 64 C69 54 66 46 60 41 Z" fill="${cloakD}" opacity=".7"/>`;
    } else {
      gear = `<path d="M34 40 C34 22 66 22 66 40 Z" fill="${cloakD}"/><ellipse cx="50" cy="40" rx="20" ry="7" fill="#e3d9c6"/>
        <rect x="37" y="42" width="26" height="7" rx="3.5" fill="#2a3440"/><circle cx="44" cy="45.5" r="3" fill="${accent}" opacity=".85"/><circle cx="56" cy="45.5" r="3" fill="${accent}" opacity=".85"/>`;
    }
    const eyes = d.cls === 'lancer' ? '' : (id === 'mireille'
      ? '<circle cx="44" cy="54" r="1.9" fill="#1b1410"/><ellipse cx="56" cy="54" rx="4.6" ry="3.6" fill="#1b1410"/><path d="M36 50 L64 57" stroke="#1b1410" stroke-width="1.4"/>'
      : '<circle cx="44" cy="54" r="1.9" fill="#1b1410"/><circle cx="56" cy="54" r="1.9" fill="#1b1410"/>');
    const beard = BEARDS[id] ? `<path d="M37 57 C38 77 62 77 63 57 C58 64 42 64 37 57 Z" fill="${BEARDS[id]}"/>` : '<path d="M45.5 63 Q50 66 54.5 63" stroke="#6b3b2a" stroke-width="1.5" fill="none"/>';
    const extra = d.rarity === 'legendary' ? `<circle cx="50" cy="42" r="46" fill="none" stroke="${accent}" stroke-width="1.2" opacity=".35"/>` : '';
    return `<svg class="portrait" viewBox="0 0 100 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="110" fill="${bg1}"/><circle cx="50" cy="42" r="48" fill="${bg2}" opacity=".55"/>${extra}
      <circle cx="18" cy="20" r="1.3" fill="#fff" opacity=".4"/><circle cx="84" cy="30" r="1" fill="#fff" opacity=".4"/><circle cx="76" cy="12" r="1.5" fill="#fff" opacity=".3"/>
      <path d="M6 110 C9 84 28 73 50 73 C72 73 91 84 94 110 Z" fill="${cloak}"/>
      <path d="M50 73 C72 73 91 84 94 110 L62 110 Z" fill="${cloakD}" opacity=".6"/>
      <rect x="44" y="62" width="12" height="14" fill="${skin}"/>
      <ellipse cx="50" cy="53" rx="14" ry="17" fill="${skin}"/>
      ${eyes}${beard}${gear}
      <path d="M23 84 C33 71 67 71 77 84 C69 92 31 92 23 84 Z" fill="#ebe4d8"/>
      <path d="M30 86 C38 90 62 90 70 86" stroke="#cfc6b6" stroke-width="1.5" fill="none"/>
    </svg>`;
  }
  function foeArt(foe, cls = 'b-enemy') {
    const col = { guard: '#6b8fb8', bow: '#8a7bd0', lancer: '#4fa9c0' }[foe.cls];
    const eye = foe.boss ? '#ff6a3c' : '#bff4ff';
    return `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="66" r="46" fill="${col}" opacity=".12"/>
      <path d="M22 60 L30 18 L44 46 L56 8 L68 44 L84 16 L98 60 Z" fill="#d9f0ff" opacity=".85"/>
      <ellipse cx="60" cy="72" rx="38" ry="34" fill="${col}"/>
      <ellipse cx="60" cy="80" rx="26" ry="20" fill="#0b1320" opacity=".35"/>
      <ellipse cx="45" cy="66" rx="9" ry="6" fill="${eye}" opacity=".35"/><ellipse cx="75" cy="66" rx="9" ry="6" fill="${eye}" opacity=".35"/>
      <ellipse cx="45" cy="66" rx="5.5" ry="3.2" fill="${eye}"/><ellipse cx="75" cy="66" rx="5.5" ry="3.2" fill="${eye}"/>
      <path d="M42 84 L47 92 L52 84 L57 93 L62 84 L67 93 L72 84 L77 91 L80 84 Z" fill="#eef7ff"/>
      ${foe.boss ? '<path d="M38 30 L44 40 L50 28 L56 40 L60 24 L64 40 L70 28 L76 40 L82 30 L80 44 L40 44 Z" fill="#ffcf6e"/>' : ''}
    </svg>`;
  }
  // A canvas placeholder that town.js paints with the wyrm (see KH.paintWyrms).
  const wyrmCanvas = (opts = {}) => `<canvas class="wyrm-portrait ${opts.cls || ''}" data-wyrm="${opts.level || S.lv.hearth}" data-element="${opts.element || S.wyrm.element || ''}" data-skin="${opts.skin || S.skins.on}" width="320" height="200"></canvas>`;
  Object.assign(KH, { portrait, foeArt, wyrmCanvas });

  // ======================================================================
  // DOM rendering helpers
  // ======================================================================
  function setHTML(el, html, force) {
    if (!el || el._h === html) return false;
    if (UI.pointerDown && !force) return false;
    const scroller = el.querySelector('.sheet-body');
    const keep = scroller ? scroller.scrollTop : 0;
    el.innerHTML = html;
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
    $('#hud-power').textContent = fmt(KH.power());
    setHTML($('#hud-wyrm'), `<b>Lv ${S.lv.hearth}</b><span>${esc(S.wyrm.name)}</span>`);
    $('#hud-starglass').textContent = fmt(S.starglass);
    $('#hud-beacons').textContent = fmt(S.beacons);
    setHTML($('#hud-res'), RES.map((r) => {
      const locked = r === 'iron' && !S.lv.ironmine && S.res.iron < 1;
      const net = R.net[r];
      return `<div class="res ${locked ? 'locked' : ''}" title="${NAME[r]}">${icon(ICON[r])}<div><b>${fmt(S.res[r])}</b><small class="${net < -0.004 ? 'neg' : ''}">${locked ? 'Locked' : perMin(net)}</small></div></div>`;
    }).join(''));
    const band = R.band, cls = band.name.toLowerCase();
    const w = KH.curWx(), range = KH.forecastRange();
    let next;
    if (w.type !== 'clear') next = `${icon('i-snow')}<span>${esc(DATA.weather[w.type].name)}</span> <b>${fmtTime(w.end - S.time)} left</b>`;
    else {
      const sev = S.wx.find((x) => x.start > S.time && KH.isStorm(x.type) && x.start - S.time <= range);
      next = sev ? `${icon('i-snow')}<span>${DATA.weather[sev.type].name}</span> <b>${fmtTime(sev.start - S.time)}</b>` : `<span>Clear skies ahead</span>`;
    }
    const warn = KH.isStorm(w.type) || next.includes('i-snow');
    setHTML($('#hud-climate'), `<span class="temp t-${cls}">${icon('i-temp')}${fmtTemp(R.temp)}</span><span class="band t-${cls}">${band.name}</span>
      <span class="pop">${icon('i-people')}${S.pop}/${KH.housing()}${S.sick ? ` · ${S.sick} sick` : ''}</span><span class="next ${warn ? 'warn' : ''}">${next}</span>`);
  }

  function renderStageOverlays() {
    // side strip (events, duties, bag, ...)
    const side = KH.side.filter((b) => !b.show || b.show()).map((b) => {
      const dot = b.dot && b.dot();
      const badge = b.badge ? b.badge() : '';
      return `<button class="side-btn" data-act="${b.act}" data-arg="${b.arg || ''}" aria-label="${esc(b.label)}">${icon(b.icon)}${dot ? '<i class="dot"></i>' : ''}<span>${badge || esc(b.label)}</span></button>`;
    }).join('');
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
    if (S.training) q += `<button class="qchip" data-act="plot" data-arg="barracks">${icon(DATA.classes[S.training.type].icon)}${S.training.n} ${DATA.troops[S.training.type].name} <time>${fmtTime(S.training.end - S.time)}</time></button>`;
    for (const f of KH.chips) q += f() || '';
    setHTML($('#queue'), q);

    const quest = DATA.quests[S.quest];
    let h = '';
    if (quest) {
      const done = quest.check(S);
      UI.questTarget = !done && quest.go.startsWith('plot:') ? quest.go.slice(5) : null;
      h = `<div class="quest ${done ? 'done' : ''}"><div class="qtext"><div class="qlabel">Chapter quest ${S.quest + 1} of ${DATA.quests.length}</div>
        <div class="qgoal">${esc(quest.text)}</div><div class="qrew">${rewardHTML(quest.reward)}</div></div>
        ${done ? '<button class="btn gold small" data-act="claimquest">Claim</button>' : `<button class="btn small alt" data-act="go" data-arg="${quest.go}">Go</button>`}</div>`;
    } else {
      UI.questTarget = null;
      h = `<div class="quest"><div class="qtext"><div class="qlabel">Chapter quests</div><div class="qgoal">${S.stage > DATA.finalStage ? 'Every quest is done. Push the Frostline as far as it will go.' : 'Every chapter quest is done.'}</div></div></div>`;
    }
    setHTML($('#quest'), h);
  }

  function renderDots() {
    const dots = {
      world: KH.worldDot ? KH.worldDot() : false,
      heroes: S.beacons >= 1,
      kindred: KH.kindredDot ? KH.kindredDot() : false,
      shop: shopDot(),
    };
    for (const [k, v] of Object.entries(dots)) { const d = $(`#dot-${k}`); if (d) d.hidden = !v; }
    document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.arg === UI.tab));
  }
  function shopDot() {
    if (S.stipend.left > 0 && S.stipend.last !== today()) return true;
    if (S.bought.growth && DATA.growthFund.some(([l]) => S.lv.hearth >= l && !S.growthClaimed.includes(l))) return true;
    const tier = KH.passTier();
    for (let i = 0; i < tier; i++) if (!S.pass.free.includes(i) || (S.pass.premium && !S.pass.prem.includes(i))) return true;
    return false;
  }

  // ======================================================================
  // Panels
  // ======================================================================
  function panelHeroes() {
    const tabs = subtabs('heroes', [['roster', 'Roster'], ['beacon', 'The Beacon', S.beacons >= 1]]);
    if (UI.sub.heroes === 'beacon') return tabs + panelRecruit();
    const owned = Object.keys(S.heroes).sort((a, b) => KH.heroPower(b) - KH.heroPower(a));
    const missing = DATA.heroes.filter((h) => !S.heroes[h.id]);
    const team = KH.teamStats(null);
    const card = (id) => {
      const d = HERO[id], h = S.heroes[id];
      const inSquad = S.squad.includes(id), steward = S.stewards[d.steward.kind] === id, away = KH.heroBusy && KH.heroBusy(id);
      const canLevel = h.lvl < KH.heroCap(id) && S.journals >= 2 * h.lvl;
      const canStar = h.stars < DATA.heroMaxStars && h.shards >= 10 * h.stars;
      return `<button class="hcard ${d.rarity}" data-act="hero" data-arg="${id}">${portrait(id)}
        <span class="badges"><span class="cls-badge">${icon(DATA.classes[d.cls].icon)}</span><span style="display:grid;gap:3px;justify-items:end">${away ? '<span class="away-badge">AWAY</span>' : inSquad ? '<span class="squad-badge">SQUAD</span>' : ''}${steward ? '<span class="steward-badge">STEWARD</span>' : ''}${canStar ? '<span class="steward-badge" style="background:var(--gold)">★ UP</span>' : ''}</span></span>
        <span class="meta"><span class="nm">${esc(d.name.split(' ')[0])}${canLevel && inSquad ? ' <span class="up-dot"></span>' : ''}</span><span class="sub"><span>Lv ${h.lvl}</span>${starsHTML(h.stars)}</span></span></button>`;
    };
    return `${tabs}<div class="panel-head"><h2>Heroes</h2><p>Squad power ${fmt(KH.statPower(team))}</p></div>
      <div class="card stack"><div class="row"><div class="grow"><b>Expedition squad</b><div class="muted small">Up to 3 heroes march with your troops and defend the hold. Tap a hero to swap.</div></div></div>
      <div class="squad">${[0, 1, 2].map((i) => S.squad[i] ? `<button class="slot" data-act="hero" data-arg="${S.squad[i]}">${portrait(S.squad[i])}</button>` : '<div class="slot">+</div>').join('')}</div></div>
      <div class="row"><span class="section-label grow">Roster · ${owned.length}/${DATA.heroes.length}</span><span class="chip muted small">${icon('i-journal')}${fmt(S.journals)} journals</span></div>
      <div class="hero-grid">${owned.map(card).join('')}${missing.map((d) => `<button class="hcard ${d.rarity} missing" data-act="hero" data-arg="${d.id}">${portrait(d.id)}<span class="meta"><span class="nm">${esc(d.name.split(' ')[0])}</span><span class="sub"><span class="r-${d.rarity}">${DATA.rarities[d.rarity].name}</span></span></span></button>`).join('')}</div>`;
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

  function panelExpedition() {
    const tabs = subtabs('world', [['map', 'Snowfield'], ['expedition', 'Expedition']]);
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
    const frost = n > DATA.finalStage;
    const base = frost ? n - ((n - 1) % 10) : ch.from;
    const cells = Array.from({ length: 10 }, (_, i) => {
      const s = base + i;
      const boss = DATA.bosses[s] || (s > DATA.finalStage && s % 10 === 0);
      return `<i class="${s < n ? 'done' : s === n ? 'cur' : ''} ${boss ? 'boss' : ''}">${s}</i>`;
    }).join('');
    const breath = S.dormant ? 0 : DATA.hearth.breath(S.lv.hearth) * (1 + KH.bonus('breath'));
    const odds = ours * (1 + breath) >= theirs * 1.15 ? ['Favored', 'var(--good)'] : ours * (1 + breath) >= theirs * 0.9 ? ['Even fight', 'var(--gold)'] : ['Risky', 'var(--bad)'];
    const home = KH.squadHome();
    return `${tabs}<div class="panel-head"><h2>${frost ? 'The Frostline' : 'Expedition'}</h2><p>${esc(ch.name)}</p></div>
      ${patrol}
      <div class="section-label">Next stage</div>
      <div class="stage-card ${foe.boss ? 'boss' : ''}">
        <span class="stage-num">Stage ${n}${foe.boss ? ' · Boss' : ''}</span>
        <div class="foe">${esc(foe.name)}</div>
        <div class="muted small">${icon(DATA.classes[foe.cls].icon)} Fights like ${DATA.classes[foe.cls].name}s. Weak to ${DATA.classes[counter].name}s.</div>
        <div class="vs"><div class="side"><span class="muted small">Your squad</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">Enemy</span><b>${fmt(theirs)}</b></div></div>
        <div class="row wrap"><div class="squad">${home.map((id) => `<button class="slot" data-act="hero" data-arg="${id}">${portrait(id)}</button>`).join('') || '<div class="slot">—</div>'}</div>
          <div class="grow small muted">${fmt(sum(team.troops))} troops march${S.lv.barracks ? ` (cap ${KH.marchCap()})` : '. Build Barracks to add troops.'}${breath ? `<br>${esc(S.wyrm.name)}'s breath scorches ${Math.round(breath * 100)}% first.` : S.dormant ? '<br>Your wyrm is dormant and cannot breathe fire.' : ''}<br><b style="color:${odds[1]}">${odds[0]}</b></div></div>
        <div style="margin-top:12px"><div class="muted small" style="margin-bottom:6px">First clear: ${rewardHTML(KH.stageRewards(n))}</div><button class="btn wide ${home.length ? '' : 'off'}" data-act="fight" data-primary>${home.length ? 'Fight' : 'Squad is away on the Snowfield'}</button></div>
      </div>
      <div class="section-label">${esc(ch.name)}</div><div class="stage-list">${cells}</div>
      <button class="btn alt small" style="margin-top:12px" data-act="story" data-arg="${ch.from}">Read the chapter</button>`;
  }

  function panelShop() {
    const offers = DATA.shop.filter((x) => !x.id.startsWith('sg'));
    const offer = (o) => {
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
          const got = S.growthClaimed.includes(l), ready = S.lv.hearth >= l;
          return got ? `<span class="chip muted small">Lv ${l} ✓</span>` : `<button class="btn small ${ready ? 'gold' : 'off'}" data-act="growth" data-arg="${l}">Lv ${l}: ${fmt(sg)}</button>`;
        }).join('')}</div>`;
      }
      return `<div class="card offer ${o.id === 'founder' && !done ? 'featured' : ''}"><div class="grow"><h3>${esc(o.name)}${o.tag ? `<span class="tag">${o.tag}</span>` : ''}</h3>
        <p class="muted small" style="margin:4px 0 6px">${esc(o.desc)}</p>${extra}</div>
        ${done ? '<span class="muted small">Owned</span>' : daily ? '<span class="muted small">Tomorrow</span>' : `<button class="btn small" data-act="buy" data-arg="${o.id}">${price(o.id, o.usd)}</button>`}</div>`;
    };
    const tier = KH.passTier(), xpIn = S.pass.xp - tier * DATA.pass.xpPerTier;
    const passRows = DATA.pass.tiers.map((t, i) => {
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
      return `<div class="pass-row"><span class="tier ${reached ? 'reached' : ''}">${i + 1}</span>${cell('free', t[0])}${cell('prem', t[1])}</div>`;
    }).join('');
    const skins = Object.entries(DATA.skins).map(([id, sk]) => {
      const own = S.skins.owned.includes(id), on = S.skins.on === id;
      const p = own ? (on ? 'Equipped' : 'Equip') : sk.locked ? `${icon('i-lock')}Earned` : sk.starglass ? `${icon('i-gem')}${fmt(sk.starglass)}` : price(id, sk.usd);
      return `<button class="card skin ${on ? 'on' : ''}" data-act="skin" data-arg="${id}">
        <span class="swatch" style="background:radial-gradient(60% 80% at 30% 70%, ${sk.fire[1]}, transparent 60%), linear-gradient(120deg, ${sk.body[0]}, ${sk.body[1]})"></span>
        <b>${esc(sk.name)}</b><span class="muted small">${sk.note ? esc(sk.note) : own ? 'Owned' : 'Cosmetic only'}</span><span class="chip">${p}</span></button>`;
    }).join('');
    const sg = DATA.shop.filter((x) => x.id.startsWith('sg')).map((o) => `<button class="card sg" data-act="buy" data-arg="${o.id}">${icon('i-gem')}<b>${fmt(o.grants.starglass)}</b><span class="muted small">${esc(o.name)}</span><span class="btn small">${price(o.id, o.usd)}</span></button>`).join('');
    const crates = RES.map((r) => `<button class="card sg" data-act="crate" data-arg="${r}">${icon(ICON[r])}<b>${fmt(DATA.crateSize(r, S.lv.hearth))}</b><span class="muted small">${NAME[r]} crate</span><span class="chip">${icon('i-gem')}${DATA.crateCost}</span></button>`).join('');
    const native = window.KHNative && window.KHNative.purchasesAvailable;
    return `<div class="panel-head"><h2>Store</h2><p>${native ? '' : `Simulated spend so far: $${S.spentUsd.toFixed(2)}`}</p></div>
      ${native ? '' : '<p class="proto-note">Web version: purchases are simulated and nothing is charged. In the App Store version these buttons use Apple in-app purchase.</p>'}
      <div class="section-label">Offers</div><div class="stack">${offers.map(offer).join('')}</div>
      <div class="section-label">Hearthkeeper's Ledger · Season 1</div>
      <div class="card stack"><div class="row"><div class="grow"><b>Tier ${tier} of ${DATA.pass.tiers.length}</b><div class="muted small">Earn Ledger XP from quests, upgrades, battles, beasts, gathering and recruits.</div></div>
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
    if (type === 'hearth') {
      rows.push(['Heat at current blaze', `+${KH.heatAt(L)}°C`, up(`+${KH.heatAt(N)}°C`)]);
      rows.push(['Coal burned', `${perMin(KH.burnRate()).replace('+', '')}`, up(perMin(DATA.hearth.burn(N) * KH.blaze().burn).replace('+', ''))]);
      rows.push(["Wyrm's Breath", `${Math.round(DATA.hearth.breath(L) * (1 + KH.bonus('breath')) * 100)}%`, up(`${Math.round(DATA.hearth.breath(N) * (1 + KH.bonus('breath')) * 100)}%`)]);
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
      rows.push(['Snowfield marches', `${DATA.world.marchSlots(L)}`, up(DATA.world.marchSlots(N))]);
      rows.push(['Troop strength', `+${Math.round((KH.troopMult() - 1) * 100)}%`, '']);
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
    }
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
    if (pid === 'hearth' && DATA.hearthReqs(to).length) {
      h += `<div class="costs">${DATA.hearthReqs(to).map((r) => `<span class="cost ${S.lv[r.plot] < r.lvl ? 'short' : ''}">${SHORT[r.plot]} Lv ${r.lvl}</span>`).join('')}</div>`;
    }
    h += `${costHTML(cost)}<div class="chip muted">${icon('i-clock')}${fmtTime(KH.buildTime(pid, to))}</div>`;
    if (why) h += `<p class="notice cold">${esc(why)}</p>`;
    else if (busy) {
      const b = S.builds[0];
      h += `<p class="notice">Builder busy with ${SHORT[b.plot]} Lv ${b.to} (${fmtTime(b.end - S.time)}).${S.builders < 2 ? " The Founder's Cache adds a permanent second builder." : ''}</p>`;
    } else if (!afford) {
      const short = Object.keys(cost).filter((k) => KH.have(k) < cost[k]);
      h += `<p class="muted small">Short on ${short.map((k) => NAME[k].toLowerCase()).join(' and ')}. Gather on the Snowfield, open crates from your Backpack, or wait for production.</p>`;
    }
    h += `<button class="btn wide ${why || busy || !afford ? 'off' : ''}" data-act="build" data-arg="${pid}">${icon('i-up')}${L ? 'Upgrade' : 'Build'}</button>`;
    return h;
  }

  function hearthControls(R) {
    const seg = Object.entries(DATA.hearth.blaze).map(([k, v]) =>
      `<button class="${S.blaze === k ? 'on' : ''}" data-act="blaze" data-arg="${k}">${v.name}<small>+${Math.round(DATA.hearth.heat(S.lv.hearth) * v.heat)}°C · ${Math.round(DATA.hearth.burn(S.lv.hearth) * v.burn * 60)}/min</small></button>`).join('');
    let status;
    if (S.dormant) status = `<p class="notice">${esc(S.wyrm.name)} is dormant. It wakes once you have 20 coal. Put more workers on the Coal Pit.</p>`;
    else if (R.net.coal < 0) status = `<p class="notice">Coal runs out in ${fmtTime(S.res.coal / -R.net.coal)} at this blaze.</p>`;
    else status = `<p class="notice good">Coal supply is steady (${perMin(R.net.coal)}).</p>`;
    const skins = S.skins.owned.map((id) => `<button class="btn small ${S.skins.on === id ? 'gold' : 'alt'}" data-act="skin" data-arg="${id}">${esc(DATA.skins[id].name)}</button>`).join('');
    const petReady = S.wyrm.petDay !== today();
    const asc = S.wyrm.element ? DATA.ascension.branches[S.wyrm.element] : null;
    return `<div class="section-label">Blaze</div><div class="seg">${seg}</div>${status}
      <p class="muted small">Roaring doubles coal use for 45% more heat. Bank the fire on calm days and let it roar before a blizzard.</p>
      <div class="row wrap"><button class="btn small ${petReady ? 'gold' : 'alt'}" data-act="pet">${icon('i-heart')}Pet ${esc(S.wyrm.name)}${petReady ? ' (daily gift)' : ''}</button><button class="btn small alt" data-act="sheet" data-arg="rename">Rename</button></div>
      ${asc ? `<p class="notice good">${esc(asc.name)} wyrm: ${esc(asc.desc)}</p>` : S.lv.hearth >= DATA.ascension.level ? '<button class="btn wide gold" data-act="sheet" data-arg="ascend">Choose the Ascension</button>' : `<p class="muted small">At Lv ${DATA.ascension.level} ${esc(S.wyrm.name)} ascends, and you choose the fire it carries.</p>`}
      <div class="section-label">Scales</div><div class="row wrap">${skins}<button class="btn small alt" data-act="tab" data-arg="shop">More skins</button></div>`;
  }

  function workerControls(pid, R) {
    const b = DATA.buildings[PLOT[pid].type];
    const idle = S.pop - sum(S.workers);
    return `<div class="section-label">Workers</div>
      <div class="row"><div class="grow"><b>${perMin(R.prod[b.prod])}</b> <span class="muted small">${NAME[b.prod].toLowerCase()} right now</span><div class="muted small">${idle} idle survivor${idle === 1 ? '' : 's'}</div></div>
      <div class="stepper"><button data-act="work" data-arg="${pid}:-1" aria-label="Remove worker">−</button><b>${S.workers[pid]}/${KH.slotsOf(pid)}</b><button data-act="work" data-arg="${pid}:1" aria-label="Add worker">+</button></div></div>
      <button class="btn small ${S.autoWork ? 'gold' : 'alt'}" data-act="autowork">${S.autoWork ? 'Auto-assign on' : 'Auto-assign off'}</button>
      ${b.outdoor ? '<p class="muted small">Outdoor work: blizzards halve output here.</p>' : ''}`;
  }

  function trainingHTML() {
    if (S.training) return jobProgress('training', S.training, `Training ${S.training.n} ${DATA.troops[S.training.type].name}`);
    const room = Math.max(0, KH.troopCap() - KH.troopsAll());
    UI.trainN = clamp(UI.trainN, 1, Math.max(1, Math.min(KH.batchMax(), room)));
    const t = DATA.troops[UI.trainType];
    const rows = Object.entries(DATA.troops).map(([k, v]) => {
      const lock = v.needs && !S.lv[v.needs];
      return `<button class="troop-row ${UI.trainType === k ? 'on' : ''}" data-act="ttype" data-arg="${k}"><span class="row">${icon(DATA.classes[k].icon)}<span><b>${v.name}</b><br><span class="muted small">${lock ? 'Needs the Iron Mine' : `Beats ${DATA.classes[DATA.counters[k]].name}s`}</span></span></span><b>${fmt(S.troops[k])}</b></button>`;
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
      if (!visible) return `<div class="fc unknown">${icon('i-snow')}<span>Beyond sight</span><span class="muted small">${fmtTime(w.start - S.time)}</span></div>`;
      return `<div class="fc ${w.type} ${now ? 'now' : ''}">${icon(w.type === 'clear' ? 'i-temp' : 'i-snow')}<span><b>${d.name}</b> <span class="muted small">${fmtTemp(KH.outsideTemp(d))} outside${d.outdoor < 1 ? ` · outdoor work ${Math.round(d.outdoor * 100)}%` : ''}</span></span>
        <span class="muted small">${now ? `now · ends ${fmtTime(w.end - S.time)}` : `in ${fmtTime(w.start - S.time)}`}</span></div>`;
    });
    return `<div class="forecast">${items.join('')}</div>`;
  }

  function sheetPlot(pid, R) {
    const p = PLOT[pid], type = p.type, b = DATA.buildings[type], L = S.lv[pid];
    const locked = pid !== 'hearth' && S.lv.hearth < p.unlock;
    let body = '';
    if (type === 'hearth') {
      const st = KH.stageOf(L);
      const next = DATA.hearth.stages.find((s) => s.from > L);
      body += `<div class="wyrm-head">${wyrmCanvas()}<div><div class="wyrm-name">${esc(S.wyrm.name)}</div><div class="chip" style="color:var(--gold)">${esc(st.name)}</div><p class="muted small">${next ? `Next form at Lv ${next.from}` : 'Final form'}</p></div></div>`;
      body += `<p class="muted">${esc(b.desc)}</p>`;
      body += hearthControls(R) + effectRows(pid) + upgradeHTML(pid);
    } else {
      if (locked) body += `<p class="notice cold">Unlocks when your Hearthwyrm reaches Lv ${p.unlock}.</p>`;
      body += `<p class="muted">${esc(b.desc)}</p>`;
      if (L && b.prod) body += workerControls(pid, R);
      if (L && type === 'shelter') body += `<p class="notice good">${S.pop} survivors housed across ${KH.housing()} beds${S.sick ? `, ${S.sick} sick` : ''}.</p>`;
      if (L && type === 'infirmary') body += `<p class="notice ${S.sick ? 'cold' : 'good'}">${S.sick ? `${S.sick} patient${S.sick > 1 ? 's' : ''} in care.` : 'No one is sick right now.'}</p>`;
      if (L && type === 'hall') body += S.kindred && S.kindred.joined ? `<button class="btn wide alt" data-act="tab" data-arg="kindred">Open ${esc(KH.kindredName ? KH.kindredName() : 'your Kindred')}</button>` : '<button class="btn wide gold" data-act="tab" data-arg="kindred">Find a Kindred</button>';
      if (L && type === 'storehouse') body += `<p class="notice good">Raiders can never take the first ${fmt(KH.protectOf())} of each resource.</p>`;
      body += effectRows(pid);
      if (!locked) body += upgradeHTML(pid);
      if (L && type === 'barracks') body += trainingHTML();
      if (L && type === 'archive') body += researchHTML();
      if (L && type === 'watchtower') body += `${KH.raidInfo ? KH.raidInfo() : ''}<div class="section-label">What the lookouts see</div>${forecastHTML()}`;
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
      return { title: d.name, lvl: 'Not recruited', body: `${head}${skill}<div class="card"><b>Steward: ${plotName(post.plot)}</b><div class="muted small">${post.label(d.steward.val)}</div></div>
        <p class="notice cold">Recruit ${esc(d.name.split(' ')[0])} at the Beacon, or with a ${DATA.rarities[d.rarity].name} Shard Pouch.</p><button class="btn wide" data-act="tab" data-arg="recruit">Go to the Beacon</button>` };
    }
    const s = KH.heroStats(id), cap = KH.heroCap(id), cost = 2 * h.lvl;
    const isSteward = S.stewards[d.steward.kind] === id;
    const other = S.stewards[d.steward.kind] && !isSteward ? HERO[S.stewards[d.steward.kind]].name.split(' ')[0] : null;
    const needShards = 10 * h.stars;
    const inSquad = S.squad.includes(id), away = KH.heroBusy && KH.heroBusy(id);
    return {
      title: d.name, lvl: `Lv ${h.lvl}`,
      body: `${head}
        ${away ? '<p class="notice">Out leading a march on the Snowfield.</p>' : ''}
        <div class="stats"><div class="stat"><span>Attack</span><b>${fmt(s.atk)}</b></div><div class="stat"><span>Defense</span><b>${fmt(s.def)}</b></div><div class="stat"><span>Health</span><b>${fmt(s.hp)}</b></div></div>
        ${skill}
        <div class="card stack"><div class="row"><div class="grow"><b>Level ${h.lvl} / ${cap}</b><div class="muted small">Next level costs ${cost} Field Journals · you have ${fmt(S.journals)}</div></div></div>
          <div class="row"><button class="btn grow ${h.lvl >= cap || S.journals < cost ? 'off' : ''}" data-act="lvl" data-arg="${id}:1" data-primary>Level up</button><button class="btn alt ${h.lvl >= cap || S.journals < cost ? 'off' : ''}" data-act="lvl" data-arg="${id}:max">Max</button></div></div>
        <div class="card stack"><div class="row"><div class="grow"><b>${starsHTML(h.stars)}</b><div class="muted small">${h.stars >= DATA.heroMaxStars ? 'Fully starred.' : `${h.shards}/${needShards} shards. Each star adds 15% stats, 10 levels, a stronger skill and a stronger steward bonus.`}</div></div>
          ${h.stars < DATA.heroMaxStars ? `<button class="btn small ${h.shards < needShards ? 'off' : 'gold'}" data-act="star" data-arg="${id}">Add star</button>` : ''}</div>
          ${h.stars < DATA.heroMaxStars ? `<div class="bar xp"><i style="width:${Math.min(100, (h.shards / needShards) * 100)}%"></i></div>` : ''}</div>
        <div class="card stack"><div class="row"><div class="grow"><b>Steward of the ${plotName(post.plot)}</b><div class="muted small">${post.label(Math.round(d.steward.val * (1 + 0.2 * (h.stars - 1))))} while stationed${other ? `. Replaces ${esc(other)}.` : '.'} Stewards still fight.</div></div>
          <button class="btn small ${isSteward ? 'gold' : 'alt'}" data-act="station" data-arg="${id}">${isSteward ? 'Stationed' : 'Station'}</button></div></div>
        <button class="btn wide ${inSquad ? 'alt' : ''}" data-act="squad" data-arg="${id}">${inSquad ? 'Remove from squad' : 'Add to squad'}</button>`,
    };
  }

  function sheetForecast(R) {
    const heat = S.dormant ? 0 : KH.heatOf(S.lv.hearth);
    const kh = KH.bonus('heat');
    return {
      title: 'Forecast', lvl: `Sight ${fmtTime(KH.forecastRange())}`,
      body: `<dl class="kv"><dt>Outside</dt><dd>${fmtTemp(KH.outsideTemp(R.wx))}</dd><dt>${esc(S.wyrm.name)} (${KH.blaze().name})</dt><dd>+${Math.round(heat)}°C</dd>
        ${S.tech.insulation ? `<dt>Hide-Lined Walls</dt><dd>+${2 * S.tech.insulation}°C</dd>` : ''}${KH.stewardVal('heat') ? `<dt>Steward</dt><dd>+${Math.round(KH.stewardVal('heat'))}°C</dd>` : ''}
        ${kh ? `<dt>Kindred and Ascension</dt><dd>+${Math.round(kh)}°C</dd>` : ''}
        <dt>In the hold</dt><dd class="t-${R.band.name.toLowerCase()}">${fmtTemp(R.temp)} · ${R.band.name}</dd></dl>
        ${forecastHTML()}
        <div class="card small"><b>How warmth works</b><div class="muted">The frost hunts warmth: every time your wyrm grows, storms come for it a little colder. Comfortable (5°C and up) speeds work by 10%. Below −5°C people start falling ill, and below −15°C the sick can be lost. The Watchtower and the Long Horns research let you see storms sooner.</div></div>
        <button class="btn wide" data-act="plot" data-arg="hearth">Tend ${esc(S.wyrm.name)}</button>`,
    };
  }

  function toggle(key, label) {
    return `<div class="row"><span class="grow">${label}</span><button class="switch ${S.settings[key] ? 'on' : ''}" data-act="setting" data-arg="${key}" role="switch" aria-checked="${S.settings[key]}" aria-label="${esc(label)}"><i></i></button></div>`;
  }
  function sheetSettings() {
    if (UI.confirmReset) {
      return { title: 'Start over?', lvl: '', body: '<p class="notice">Erase this hold and start over? Your heroes, buildings and progress will be gone. Copy your save code first if you might want it back.</p><div class="confirm-actions"><button class="btn alt" data-act="resetno">Keep playing</button><button class="btn" data-act="resetyes">Erase hold</button></div>' };
    }
    const native = window.KHNative && window.KHNative.isNative;
    return {
      title: 'Settings', lvl: '',
      body: `<div class="card stack">${toggle('sfx', 'Sound effects')}${toggle('music', 'Music and ambience')}${toggle('haptics', 'Vibration')}${native ? toggle('notify', 'Notifications when builds finish') : ''}</div>
        <div class="section-label">Your hold</div>
        <dl class="kv"><dt>Time in the hold</dt><dd>${fmtTime(S.time)}</dd><dt>Survivors</dt><dd>${S.pop}</dd><dt>Stages cleared</dt><dd>${S.stage - 1}</dd>
        <dt>Heroes recruited</dt><dd>${Object.keys(S.heroes).length}/${DATA.heroes.length}</dd><dt>Storms survived cleanly</dt><dd>${S.stats.cleanStorms}</dd><dt>Buildings upgraded</dt><dd>${S.stats.upgrades}</dd>
        ${native ? '' : `<dt>Simulated spend</dt><dd>$${S.spentUsd.toFixed(2)}</dd>`}</dl>
        <div class="section-label">Save</div>
        <p class="muted small">Progress saves on this device. To move it to another device or browser, copy your save code there.</p>
        <div class="row wrap"><button class="btn small alt" data-act="sheet" data-arg="savecode">Copy save code</button><button class="btn small alt" data-act="sheet" data-arg="loadcode">Load a save code</button>${native ? '<button class="btn small alt" data-act="restore">Restore purchases</button>' : ''}</div>
        <div class="section-label">About</div>
        ${DATA.privacyUrl ? `<p class="small"><a href="${esc(DATA.privacyUrl)}" target="_blank" rel="noopener">Privacy policy</a></p>` : ''}<p class="muted small">Kindlehold ${DATA.version}. Timers and production run about 30× faster than a typical live-service strategy game, so the whole story fits in a handful of evenings. Kindred members and rival holds are simulated.</p>
        <button class="btn alt wide" data-act="reset">Start a new hold</button>`,
    };
  }

  function sheetIntro() {
    return {
      title: '', lvl: '', noClose: true,
      body: `<div class="intro-art"><h1>Kindlehold</h1></div>
        <p class="lore">The sun went grey in the winter they now call the Long Night, and it never warmed again. Cities froze. Forests died standing.</p>
        <p class="lore">In the ash of a fallen forge you found something still warm: a cracked egg, and inside it a creature made of embers. You named it ${esc(S.wyrm.name)}.</p>
        <p class="lore">It is small and it is hungry. As long as it burns, the cold cannot reach the people huddled around it.</p>
        <p class="lore"><b>Feed the Hearthwyrm. Shelter the survivors. Watch the sky.</b></p>
        <button class="btn wide" data-act="close">Light the hold</button>`,
    };
  }

  function sheetOffline() {
    const o = UI.sheet.data, l = o.log;
    const gains = {};
    for (const r of RES) if (l[r] > 0.5) gains[r] = Math.floor(l[r]);
    const mins = Math.round(o.capped / 60);
    return {
      title: 'While you were away', lvl: '',
      body: `<p>Your hold kept working for ${mins >= 120 ? `${(mins / 60).toFixed(1)} hours` : `${mins} minute${mins === 1 ? '' : 's'}`}${o.seconds > o.capped ? ` (it banks up to ${Math.round(DATA.offline.capSeconds / 3600)} hours of production)` : ''}. ${esc(S.wyrm.name)} banked its fire, so no one fell ill.</p>
        ${Object.keys(gains).length ? `<div class="costs">${rewardHTML(gains)}</div>` : '<p class="muted">Production was balanced out by what the hold consumed.</p>'}
        ${l.arrived ? `<p class="notice good">${l.arrived} survivor${l.arrived > 1 ? 's' : ''} found their way to the hold.</p>` : ''}
        ${l.built ? `<p class="notice good">Finished: ${l.built.map(esc).join(', ')}.</p>` : ''}
        ${l.marches ? `<p class="notice good">${l.marches.map(esc).join(' ')}</p>` : ''}
        <button class="btn wide" data-act="close">Back to the hold</button>`,
    };
  }

  function sheetOdds() {
    const o = DATA.recruit.odds;
    const list = (r) => DATA.heroes.filter((h) => h.rarity === r).map((h) => esc(h.name)).join(', ');
    const nOf = (r) => DATA.heroes.filter((h) => h.rarity === r).length;
    const per = (r) => (o[r] * 100) / nOf(r);
    const feat = KH.featured();
    return {
      title: 'Recruitment odds', lvl: '',
      body: `<dl class="kv"><dt class="r-legendary">Legendary</dt><dd>${(o.legendary * 100).toFixed(1)}%</dd><dt class="r-epic">Epic</dt><dd>${(o.epic * 100).toFixed(1)}%</dd><dt class="r-rare">Rare</dt><dd>${(o.rare * 100).toFixed(1)}%</dd></dl>
        <p class="small"><b class="r-legendary">Legendary:</b> ${esc(HERO[feat].name)} (featured) ${((o.legendary * DATA.recruit.featuredShare + (o.legendary * (1 - DATA.recruit.featuredShare)) / nOf('legendary')) * 100).toFixed(2)}%, every other Legendary ${((o.legendary * (1 - DATA.recruit.featuredShare)) / nOf('legendary') * 100).toFixed(2)}% each. <span class="muted">${list('legendary')}</span></p>
        <p class="small"><b class="r-epic">Epic:</b> ${per('epic').toFixed(2)}% each. <span class="muted">${list('epic')}</span></p>
        <p class="small"><b class="r-rare">Rare:</b> ${per('rare').toFixed(2)}% each. <span class="muted">${list('rare')}</span></p>
        <p class="muted small">Your first recruit is ${HERO[DATA.recruit.firstPull].name}. A Legendary is guaranteed on or before the ${DATA.recruit.pity}th recruit since your last one. Every ×10 includes at least one Epic or better. The featured hero changes with each event.</p>`,
    };
  }

  function sheetBuy() {
    const sh = UI.sheet;
    let name, desc, usd, grants = null, id;
    if (sh.skin) {
      const sk = DATA.skins[sh.skin];
      name = sk.name; desc = 'A cosmetic wyrm skin. It changes how your Hearthwyrm looks and nothing else.'; usd = sk.usd; id = sh.skin;
    } else {
      const it = KH.shopItem(sh.id);
      name = it.name; desc = it.desc || `${fmt(it.grants.starglass)} Starglass.`; usd = it.usd; grants = it.grants; id = it.id;
    }
    return {
      title: name, lvl: price(id, usd),
      body: `${sh.skin ? wyrmCanvas({ skin: sh.skin }) : ''}<p>${esc(desc)}</p>${grants ? `<div class="costs">${rewardHTML(grants)}</div>` : ''}
        <p class="proto-note">Web version: no money changes hands. In the App Store version this step opens Apple's purchase sheet.</p>
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
      body: `<div class="story-art"><span>${idx <= 6 ? `Chapter ${idx}` : 'Endless'}</span><h1>${esc(ch.name)}</h1></div>
        <p class="lore">${esc(ch.story)}</p>
        <button class="btn wide" data-act="close">${UI.tab === 'world' ? 'Set out' : 'Continue'}</button>`,
    };
  }

  function sheetEvolve() {
    const st = DATA.hearth.stages.find((s) => s.from === UI.sheet.from) || KH.stageOf(S.lv.hearth);
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
      body: `<p class="lore">${esc(S.wyrm.name)} is ready to ascend. Its fire will take one shape for good. Choose carefully: this can't be changed.</p><div class="stack">${cards}</div>`,
    };
  }

  function sheetRename() {
    return {
      title: `Name your wyrm`, lvl: '',
      body: `<label class="field"><span class="muted small">Name (up to 16 letters)</span><input id="wyrm-name" maxlength="16" value="${esc(S.wyrm.name)}" autocomplete="off" spellcheck="false"></label>
        <div class="confirm-actions"><button class="btn alt" data-act="plot" data-arg="hearth">Cancel</button><button class="btn" data-act="rename">Save name</button></div>`,
    };
  }

  function sheetEnding() {
    const E = DATA.ending;
    return {
      title: '', lvl: '',
      body: `<div class="evolve">${wyrmCanvas({ cls: 'big' })}<span class="section-label">Epilogue</span><h1>${esc(E.title)}</h1></div>
        ${E.lines.map((l) => `<p class="lore">${esc(l.replace('{wyrm}', S.wyrm.name))}</p>`).join('')}
        <div class="card"><b>Thawbringer</b><div class="muted small">You beat Kindlehold's story. The Frostline stays open for as long as you want to push it.</div><div class="costs" style="margin-top:8px">${rewardHTML(E.reward)}</div></div>
        <button class="btn wide gold" data-act="close">Claim and continue</button>
        <p class="muted small" style="text-align:center">Made with care. Thank you for keeping the fire lit.</p>`,
    };
  }

  function sheetSaveCode() {
    return {
      title: 'Your save code', lvl: '',
      body: `<p class="muted small">Copy this code and paste it into Kindlehold on another device under Settings, Load a save code.</p>
        <textarea id="save-out" class="code" readonly>${esc(KH.exportSave())}</textarea>
        <button class="btn wide" data-act="copysave">Copy code</button>`,
    };
  }
  function sheetLoadCode() {
    return {
      title: 'Load a save code', lvl: '',
      body: `<p class="notice">Loading a code replaces this hold completely.</p>
        <textarea id="save-in" class="code" placeholder="Paste your save code here" spellcheck="false"></textarea>
        <div class="confirm-actions"><button class="btn alt" data-act="close">Cancel</button><button class="btn" data-act="loadsave">Load hold</button></div>`,
    };
  }

  const SHEETS = {
    plot: (R) => sheetPlot(UI.sheet.pid, R), hero: () => sheetHero(UI.sheet.id), forecast: sheetForecast, settings: sheetSettings,
    intro: sheetIntro, offline: sheetOffline, odds: sheetOdds, buy: sheetBuy, results: sheetResults, story: sheetStory,
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
    const html = `${s.title || s.lvl ? `<div class="sheet-head"><h2>${esc(s.title)}</h2>${s.lvl ? `<span class="lvl">${esc(s.lvl)}</span>` : ''}
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
    el.innerHTML = `
      <div class="b-title"><span class="stage-num">${esc(b.title)}</span><h2>${esc(foe.name)}</h2></div>
      <div class="b-field">
        <div class="b-side" id="b-foe">${foeArt(foe)}
          <div class="b-hp"><div class="lbl"><span>${esc(foe.name)}</span><span id="b-eh">${fmt(foe.hp)}</span></div><div class="bar foe"><i id="b-ehb" style="width:100%"></i></div></div>
        </div>
        <div class="b-log" id="b-log">${esc(b.intro || 'Your squad marches out into the snow…')}</div>
        <div class="b-side" id="b-us">
          <div class="squad">${heroes.map((id) => `<div class="slot">${portrait(id)}</div>`).join('') || '<div class="slot">—</div>'}</div>
          <div class="b-hp"><div class="lbl"><span>${esc(b.sideLabel || 'Your squad')} · ${fmt(sum(b.team.troops))} troops</span><span id="b-th">${fmt(b.team.hp)}</span></div><div class="bar"><i id="b-thb" style="width:100%"></i></div></div>
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
          floaty('#b-foe', `−${fmt(B.result.breath)}`, 'fire');
          $('#b-log').textContent = `${S.wyrm.name} breathes fire!`;
          audio('roar');
          B.timer = setTimeout(step, 650);
          return;
        }
      }
      const r = B.result.rounds[B.i];
      if (!r) return finishBattle();
      $('#b-ehb').style.width = `${(r.eh / foe.hp) * 100}%`;
      $('#b-eh').textContent = fmt(r.eh);
      if (r.ours) { floaty('#b-foe', `−${fmt(r.ours)}`, ''); audio('hit'); haptic('light'); }
      $('#b-log').textContent = B.i === 0 && B.team.fx.burst ? 'Opening charge!' : `Round ${B.i + 1}`;
      B.timer = setTimeout(() => {
        if (!UI.battle || UI.battle.done) return;
        if (r.theirs) {
          $('#b-thb').style.width = `${(r.th / B.team.hp) * 100}%`;
          $('#b-th').textContent = fmt(r.th);
          floaty('#b-us', `−${fmt(r.theirs)}`, 'hurt');
          audio('hurt');
        }
        B.i++;
        B.timer = setTimeout(step, 360);
      }, 360);
    };
    UI.battle.timer = setTimeout(step, 600);
  }
  KH.startBattle = startBattle;
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
    $('#b-log').textContent = win ? `${B.foe.name} defeated${rounds.length ? ` in ${rounds.length} round${rounds.length > 1 ? 's' : ''}` : ' by fire alone'}.` : B.result.timeout ? 'The squad could not break through in time.' : B.loseLine || 'The squad falls back to the hold.';
    const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === B.foe.cls);
    const tips = win || B.noTips ? '' : `<p class="muted small">Level your heroes, train more troops, or bring a ${DATA.classes[counter].name} hero: they hit ${esc(B.foe.name)} 20% harder.</p>`;
    $('#b-foot').innerHTML = `<div class="b-result">
      <h2 class="${win || B.resultTitle ? 'win' : 'lose'}">${esc(B.resultTitle || (win ? 'Victory' : 'Defeat'))}</h2>
      ${B.rewards ? `<div class="costs">${rewardHTML(B.rewards)}</div>` : ''}${B.extra ? `<p class="small">${B.extra}</p>` : ''}${tips}
      <button class="btn wide" data-act="bclose">Continue</button></div>`;
    audio(win || B.resultTitle ? 'victory' : 'defeat');
    haptic(win || B.resultTitle ? 'success' : 'warning');
    B.done = true;
    B.timer = null;
  }
  ACT.bskip = () => finishBattle();
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
  const TAB_ALIAS = { recruit: ['heroes', 'beacon'], roster: ['heroes', 'roster'], expedition: ['world', 'expedition'], map: ['world', 'map'] };
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
      if (sh.kind === 'ending' && !S.endingSeen) {
        S.endingSeen = true;
        KH.grant(DATA.ending.reward);
        S.skins.on = DATA.ending.reward.skin;
      }
    }
    UI.sheet = null;
    UI.confirmReset = false;
  };
  ACT.plot = (pid) => {
    if (UI.tab !== 'town') ACT.tab('town');
    UI.sheet = { kind: 'plot', pid };
  };
  ACT.go = (target) => {
    const [kind, arg] = target.split(':');
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
      toast('Hold loaded.', 'good');
    } catch (e) {
      toast("That code didn't work. Check that you copied all of it.", 'warn');
    }
  };

  // ======================================================================
  // Tutorial hints: pulse whatever the current quest needs pressed next
  // ======================================================================
  function applyHints() {
    document.querySelectorAll('.hint').forEach((e) => e.classList.remove('hint'));
    const q = DATA.quests[S.quest];
    if (!q || q.check(S) || UI.battle) return;
    const [kind, arg] = q.go.split(':');
    const mark = (sel) => { const e = $(sel); if (e) e.classList.add('hint'); return !!e; };
    if (UI.sheet) {
      if (kind === 'plot' && UI.sheet.kind === 'plot' && UI.sheet.pid === arg) {
        if (arg === 'hearth' && /Pet/.test(q.text)) mark('#sheet [data-act="pet"]');
        else if (/Train/.test(q.text)) mark('#sheet [data-act="train"]');
        else if (/research/i.test(q.text)) mark('#sheet [data-act="research"]:not(.off)');
        else mark('#sheet [data-act="build"]');
      } else if (UI.sheet.kind === 'hero') mark('#sheet [data-primary]:not(.off)') || mark('#sheet [data-act="station"]');
      else if (KH.sheetHint) KH.sheetHint(q, kind, arg, mark);
      return;
    }
    if (kind === 'plot') { if (UI.tab !== 'town') mark('#tabs [data-arg="town"]'); return; }
    if (kind === 'sheet') { mark(`#side [data-arg="${arg}"]`); return; }
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
      if (S.stage > DATA.finalStage && !S.endingSeen && !queued('ending')) KH.queueSheet({ kind: 'ending' });
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
    if (window.KHAudio) window.KHAudio.setAmbience({ weather: KH.curWx().type, blaze: S.dormant ? 'off' : S.blaze, active: UI.tab === 'town' && !document.hidden });
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
    if (e.key === 'Escape' && UI.sheet && UI.sheet.kind !== 'intro') { ACT.close(); renderAll(true); }
    if (e.key === 'Enter' && e.target && e.target.id === 'wyrm-name') { ACT.rename(); renderAll(true); }
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
    if (S.training) { N.notify('training', 'Troops ready', `${S.training.n} ${DATA.troops[S.training.type].name} are ready.`, at(S.training.end)); scheduled.add('training'); }
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
    if (S.stage > DATA.finalStage && !S.endingSeen) KH.queueSheet({ kind: 'ending' });
    if (S.lv.hearth >= DATA.ascension.level && !S.wyrm.element) KH.queueSheet({ kind: 'ascend' });
  });
})();

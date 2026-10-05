/* Lobby / meta-game: home and modes, heroes, skins, shop, pass, missions, event, profile, results. */
(function (SF) {
  const S = SF.store;
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const usd = n => '$' + n.toFixed(2);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let view = 'home', heroSel = null, shopTab = 'featured', lastSummary = null, lastRewards = null, bound = false, queueing = false;
  const stage = { parts: [] };

  // ---------- small render helpers ----------
  function chip(r) {
    switch (r.type) {
      case 'coins': return `<span class="chip"><i class="ico ico-coin"></i>${fmt(r.n)}</span>`;
      case 'gems': return `<span class="chip"><i class="ico ico-gem"></i>${fmt(r.n)}</span>`;
      case 'fragments': return `<span class="chip"><i class="ico ico-frag"></i>${r.n} skin shards${r.note ? ` <span class="muted">(${r.note})</span>` : ''}</span>`;
      case 'chest': return `<span class="chip"><i class="ico ico-chest"></i>${r.n > 1 ? r.n + '× ' : ''}Aether Chest</span>`;
      case 'passXp': return `<span class="chip"><i class="ico ico-xp"></i>${fmt(r.n)} pass XP</span>`;
      case 'tokens': return `<span class="chip"><i class="ico ico-token"></i>${fmt(r.n)} ${SF.EVENT.token}</span>`;
      case 'skin': { const s = SF.SKIN[r.id]; return `<span class="chip" style="color:${SF.SKIN_TIERS[s.tier].color}">${s.name} ${SF.HERO[s.hero].name}</span>`; }
      case 'hero': return `<span class="chip">Hero unlocked: ${SF.HERO[r.id].name}</span>`;
      default: return '';
    }
  }
  const heroCanvas = (heroId, skinId) => `<canvas data-hero="${heroId}" data-skin="${skinId}"></canvas>`;
  function paintCanvases(root) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    root.querySelectorAll('canvas[data-hero]').forEach(c => {
      const w = c.clientWidth || 64, h = c.clientHeight || 64;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      SF.drawHero(g, { heroId: c.dataset.hero, skinId: c.dataset.skin, x: w / 2, y: h * 0.86, t: 1.2, scale: Math.min(w, h) / 82, face: { x: 1, y: 0.2 } });
    });
  }
  function rewardIcon(r) {
    if (r.type === 'skin') return heroCanvas(SF.SKIN[r.id].hero, r.id);
    if (r.type === 'coins') return `<i class="ico ico-coin" style="width:28px;height:28px"></i><span>${fmt(r.n)}</span>`;
    if (r.type === 'gems') return `<i class="ico ico-gem" style="width:22px;height:22px;margin:4px"></i><span>${fmt(r.n)}</span>`;
    if (r.type === 'fragments') return `<i class="ico ico-frag" style="width:18px;height:26px"></i><span>${r.n} shards</span>`;
    if (r.type === 'chest') return `<i class="ico ico-chest" style="width:30px;height:24px"></i><span>${r.n > 1 ? r.n + '× ' : ''}Chest</span>`;
    return '';
  }
  function rankBadge(r, big) {
    const pips = r.starsPerDiv === 3
      ? Array.from({ length: 3 }, (_, i) => `<i class="${i < r.star ? 'on' : ''}"></i>`).join('')
      : `<span class="num">★ ${r.star}${r.starsPerDiv ? ' / ' + r.starsPerDiv : ''}</span>`;
    return `<span class="rank ${big ? 'big' : ''}" style="--c:${r.color}"><span class="gem-mark"></span><b>${r.label}</b><span class="pips">${pips}</span></span>`;
  }
  function masteryBadge(heroId) {
    const m = S.masteryOf(heroId);
    return m.lvl ? `<span class="mastery" style="--l:${m.lvl}">${m.name}</span>` : '';
  }

  function modal(html) {
    closeModal();
    const el = document.createElement('div');
    el.className = 'modal-back'; el.id = 'modal';
    el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    $('modalRoot').appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) closeModal(); });
    paintCanvases(el);
    return el;
  }
  function closeModal() { const el = $('modal'); if (el) el.remove(); }
  function rewardsModal(title, got, sub) {
    modal(`<p class="eyebrow">Rewards</p><h3>${title}</h3>${sub ? `<p class="muted">${sub}</p>` : ''}
      <div class="rewards">${got.map(chip).join('')}</div><button class="btn primary" data-act="close">Collect</button>`);
    SF.sfx.play('coin');
    if (SF.haptics) SF.haptics.success();
    refreshTop();
  }
  function infoModal(title, text) {
    modal(`<h3>${title}</h3><p class="muted">${text}</p><button class="btn primary" data-act="close">OK</button>`);
  }
  function notEnough(cur) {
    if (cur === 'gems') modal(`<h3>Not enough gems</h3><p class="muted">Gems come from the Shard Pass, achievements, daily login, the Aether Card and gem packs.</p>
      <div class="actions"><button class="btn ghost" data-act="close">Not now</button><button class="btn gem" data-act="go" data-v="shop" data-tab="gems">See gem packs</button></div>`);
    else modal(`<h3>Not enough coins</h3><p class="muted">Every match pays coins. Daily missions, login rewards and free coin caches add more.</p>
      <div class="actions"><button class="btn ghost" data-act="close">OK</button><button class="btn primary" data-act="go" data-v="free">Free rewards</button></div>`);
  }
  // Every gem spend gets a confirmation step so nothing is bought by accident.
  function confirmSpend(name, price, fn) {
    const cur = price.gems != null ? 'gems' : 'coins';
    if (!S.afford(price)) return notEnough(cur);
    const amt = price.gems != null ? price.gems : price.coins;
    const el = modal(`<h3>Confirm</h3><p>Spend <span class="chip"><i class="ico ico-${cur === 'gems' ? 'gem' : 'coin'}"></i>${fmt(amt)}</span> on <b>${name}</b>?</p>
      <p class="muted">You have ${fmt(cur === 'gems' ? S.d.gems : S.d.coins)} ${cur}.</p>
      <div class="actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn ${cur === 'gems' ? 'gem' : 'primary'}" id="confirmYes">Buy</button></div>`);
    el.querySelector('#confirmYes').onclick = () => { if (S.pay(price)) { closeModal(); fn(); refreshTop(); } };
  }

  function refreshTop() {
    const d = S.d;
    $('coinVal').textContent = fmt(d.coins);
    $('gemVal').textContent = fmt(d.gems);
    $('pName').textContent = d.name;
    const lv = $('accLvl');
    lv.querySelector('b').textContent = d.account.level;
    lv.style.setProperty('--p', d.account.xp / S.accountNeed(d.account.level));
    const setBadge = (id, n) => { const b = $(id); if (!b) return; b.hidden = !n; b.textContent = n; };
    setBadge('bPass', S.passClaimable());
    setBadge('bMis', S.missionsReady() + (S.loginReady() ? 1 : 0));
    const free = (d.ads.coins < SF.ADS.coins.perDay ? 1 : 0) + (d.ads.chest < SF.ADS.chest.perDay ? 1 : 0) + (S.monthlyReady() ? 1 : 0) + (d.chests > 0 ? 1 : 0);
    setBadge('bFree', free);
    setBadge('bProf', S.achievementsReady().length + S.rankRewardsReady().length);
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view || (view === 'results' && b.dataset.v === 'home')));
  }

  // ---------- online helpers (net.js is optional) ----------
  const serverUrl = () => (S.d.settings.server || window.SF_SERVER_URL || '').trim();
  const onlineReady = () => !!(SF.net && SF.RemoteMatch && serverUrl());

  // ---------- views ----------
  const VIEWS = {
    home() {
      let id = S.d.selected; if (!S.playable(id)) id = S.d.selected = S.d.heroes[0];
      const h = SF.HERO[id], sk = SF.SKIN[S.skinOf(id)];
      const tier = S.passTier(), into = tier >= SF.PASS.tiers ? 1 : (S.d.pass.xp % SF.PASS.xpPerTier) / SF.PASS.xpPerTier;
      const mode = SF.MODES[S.d.mode] ? S.d.mode : 'quick';
      const offer = !S.d.starter ? `<button class="offer" data-act="starter">
          <div><p class="eyebrow" style="color:var(--gold)">One-time offer</p><h3>Starter Pack</h3></div>
          <p>300 gems, Frostbrand Kaida skin and 2,000 coins</p><span class="btn buy sm price">${usd(SF.OFFERS.starter.usd)}</span></button>` : '';
      const monthly = S.monthlyReady() ? `<button class="card slim" data-act="claimMonthly">
          <span><span class="eyebrow">Aether Card</span><br><b>Today's gems are ready</b></span><span class="chip"><i class="ico ico-gem"></i>${SF.OFFERS.monthly.daily}</span></button>` : '';
      const event = `<button class="card slim event-mini" data-act="go" data-v="event">
          <span><span class="eyebrow" style="color:#7cc8ff">Event</span><br><b>${SF.EVENT.name}</b></span><span class="chip"><i class="ico ico-token"></i>${fmt(S.d.event.tokens)}</span></button>`;
      let body = '', ready = true, label = 'Battle';
      if (mode === 'quick') {
        body = `<div class="seg" role="radiogroup" aria-label="Bot difficulty">${SF.CASUAL_DIFFS.map(k => `<button role="radio" aria-checked="${k === S.d.difficulty}" data-act="diff" data-d="${k}">${SF.DIFFICULTY[k].label}</button>`).join('')}</div>`;
      } else if (mode === 'ranked') {
        if (!S.rankedUnlocked()) { ready = false; label = `Level ${SF.RANKS.unlockLevel}`; body = `<p class="muted small">Ranked unlocks at account level ${SF.RANKS.unlockLevel}. Play a few Quick Matches first.</p>`; }
        else { const r = S.rank(); body = `<div class="rank-row">${rankBadge(r)}<span class="muted small">Bots: ${SF.DIFFICULTY[r.diff].label}${S.d.rank.streak >= 2 ? ` · ${S.d.rank.streak} win streak` : ''}</span></div>`; }
      } else if (mode === 'brawl') {
        body = `<p class="muted small">You get a random hero each match, including heroes you don't own yet.</p>`;
      } else {
        ready = onlineReady() && !queueing;
        label = queueing ? 'Searching…' : 'Find match';
        body = onlineReady() ? `<p class="muted small">${queueing ? 'Looking for players. Bots fill any empty slots.' : `Server: ${esc(serverUrl())}`}</p>${queueing ? '<button class="btn sm ghost" data-act="cancelQueue">Cancel search</button>' : ''}`
          : `<p class="muted small">Online play needs the Shardfall game server. Add its address in Settings.</p>`;
      }
      return `<div class="home">
        <div class="stage" data-act="go" data-v="heroes" data-id="${id}" role="button" tabindex="0" aria-label="Change hero">
          <canvas id="stageCanvas" aria-hidden="true"></canvas>
          <div class="stage-info">
            <p class="eyebrow">${h.role}</p>
            <h1 class="hero-name">${mode === 'brawl' ? '???' : h.name}</h1>
            <p class="hero-sub">${mode === 'brawl' ? 'Random hero in Shard Brawl' : `${h.title} · ${sk.name}`}</p>
            ${mode !== 'brawl' ? masteryBadge(id) : ''}
          </div>
        </div>
        <aside class="battle">
          ${offer}${monthly}${event}
          <div class="card mode">
            <div class="modes" role="tablist" aria-label="Game mode">${Object.keys(SF.MODES).map(k => `<button role="tab" aria-selected="${k === mode}" class="${k === mode ? 'on' : ''}" data-act="mode" data-m="${k}">${SF.MODES[k].tab}</button>`).join('')}</div>
            <h2>${SF.MODES[mode].name}</h2>
            <p class="muted mode-sub">${SF.MODES[mode].sub} About ${SF.MODES[mode].minutes} minutes.</p>
            ${body}
          </div>
          <button class="btn-battle" data-act="battle" ${ready ? '' : 'disabled'}><span>${label}</span></button>
          <button class="card pass-mini" data-act="go" data-v="pass">
            <span class="row"><span>Shard Pass · Tier ${tier}</span><span class="muted">${tier >= SF.PASS.tiers ? 'Complete' : fmt(S.d.pass.xp % SF.PASS.xpPerTier) + ' / ' + fmt(SF.PASS.xpPerTier)}</span></span>
            <span class="bar" style="--p:${into}"><i></i></span>
          </button>
        </aside>
      </div>`;
    },

    heroes() {
      const sel = heroSel || S.d.selected, rot = S.freeRotation();
      const cards = SF.HEROES.map(h => {
        const owned = S.owns.hero(h.id), free = rot.includes(h.id);
        const status = owned ? (S.d.selected === h.id ? '<span class="tag sel-tag">Selected</span>' : '<span class="tag">Owned</span>')
          : free ? '<span class="tag" style="color:var(--good)">Free this week</span>' : `<span class="chip"><i class="ico ico-coin"></i>${fmt(h.price.coins)}</span>`;
        return `<button class="tile ${sel === h.id ? 'sel' : ''}" data-act="pickHero" data-id="${h.id}">${heroCanvas(h.id, S.skinOf(h.id))}
          <h3>${h.name}</h3><div class="meta"><span>${h.role}</span>${status}</div>${masteryBadge(h.id)}</button>`;
      }).join('');
      return `<div class="page"><div class="page-head"><h2>Heroes</h2><p class="muted">Free this week: ${rot.map(id => SF.HERO[id].name).join(' and ')}</p></div>
        <div class="hero-layout"><div class="grid hero-grid">${cards}</div>${heroDetail(sel)}</div></div>`;
    },

    shop() {
      const tabs = [['featured', 'Featured'], ['skins', 'Skins'], ['gems', 'Gems'], ['chests', 'Chests'], ['exchange', 'Shard Exchange']];
      let body = '';
      if (shopTab === 'featured') {
        const leg = SF.SKIN.kaida_solar;
        const mActive = S.monthlyActive();
        body = `<div class="offer-row">
          ${!S.d.starter ? `<div class="feature gold"><p class="eyebrow" style="color:var(--gold)">One-time · best value</p><h3>Starter Pack</h3>
            <ul><li>300 gems</li><li>Frostbrand Kaida (Rare skin)</li><li>2,000 coins</li></ul>
            <button class="btn buy" data-act="starter">${usd(SF.OFFERS.starter.usd)}</button></div>` : ''}
          <div class="feature gemmy"><p class="eyebrow" style="color:var(--gem)">30-day card</p><h3>Aether Card</h3>
            <ul><li>${SF.OFFERS.monthly.now} gems right away</li><li>${SF.OFFERS.monthly.daily} gems every day you log in for ${SF.OFFERS.monthly.days} days</li><li>Up to ${fmt(SF.OFFERS.monthly.now + SF.OFFERS.monthly.daily * (SF.OFFERS.monthly.days - 1))} gems in total</li></ul>
            ${mActive ? (S.monthlyReady() ? `<button class="btn gem" data-act="claimMonthly">Claim today's ${SF.OFFERS.monthly.daily} gems</button>` : `<p class="muted">Active until ${S.d.monthly.until}. Come back tomorrow for more gems.</p>`)
              : `<button class="btn buy" data-act="monthly">${usd(SF.OFFERS.monthly.usd)}</button>`}</div>
          ${!S.d.pass.elite ? `<div class="feature"><p class="eyebrow">Season ${SF.PASS.season}</p><h3>Elite Shard Pass</h3>
            <ul><li>Abyssal Herald Orin right away</li><li>Obsidian Howl Drace at tier 15</li><li>Stormcrown Sylva at tier 30</li><li>+20% pass XP from every match</li><li>280 gems back across the season</li></ul>
            <button class="btn gem" data-act="go" data-v="pass"><i class="ico ico-gem"></i>${SF.PASS.elitePrice}</button></div>` : ''}
          <div class="feature"><p class="eyebrow" style="color:var(--gold)">Legendary skin</p><h3>${leg.name}</h3>
            <div style="height:150px">${heroCanvas('kaida', leg.id).replace('<canvas', '<canvas style="width:100%;height:100%"')}</div>
            ${S.owns.skin(leg.id) ? '<span class="tag">Owned</span>' : `<button class="btn gem" data-act="buySkin" data-id="${leg.id}"><i class="ico ico-gem"></i>${leg.price.gems}</button>`}</div>
        </div>`;
      } else if (shopTab === 'skins') {
        body = `<div class="grid">${SF.SKINS.filter(s => s.tier !== 'Classic').map(s => skinTile(s, true)).join('')}</div>`;
      } else if (shopTab === 'gems') {
        body = `<p class="muted">Gems buy skins, the Elite Pass and chests. Every hero can also be unlocked with coins you earn by playing.</p>
          <div class="grid">${SF.GEM_PACKS.map((p, i) => {
            const first = !S.d.firstPack[p.id];
            return `<button class="tile pack" data-act="buyPack" data-id="${p.id}">
              ${first ? '<span class="tag first">2× first purchase</span>' : p.tag ? `<span class="tag first" style="background:var(--gold);color:#2a1800">${p.tag}</span>` : ''}
              <span class="gemstack">${Array.from({ length: Math.min(5, i + 1) }, (_, k) => `<i style="left:${8 + k * 7}px;top:${18 - (k % 2) * 12}px"></i>`).join('')}</span>
              <span class="amt num">${fmt(first ? p.gems * 2 : p.gems + p.bonus)}</span>
              <span class="bonus">${first ? `${fmt(p.gems)} + ${fmt(p.gems)} first-time bonus` : p.bonus ? `includes ${fmt(p.bonus)} bonus` : '&nbsp;'}</span>
              <span class="btn buy sm wide">${usd(p.usd)}</span></button>`;
          }).join('')}</div>
          ${SF.iap.restore ? '<button class="btn ghost sm" data-act="restore">Restore purchases</button>' : ''}`;
      } else if (shopTab === 'chests') {
        const left = SF.CHEST.pity - S.d.chestPity;
        body = `<div class="offer-row"><div class="feature gemmy"><p class="eyebrow" style="color:var(--gem)">Aether Chest</p><h3>You have ${S.d.chests}</h3>
            <p class="muted">An Epic skin is guaranteed within the next ${left} chest${left === 1 ? '' : 's'}.</p>
            <div class="actions">
              <button class="btn primary" data-act="openChest" ${S.d.chests ? '' : 'disabled'}>Open</button>
              <button class="btn gem" data-act="buyChest"><i class="ico ico-gem"></i>${SF.CHEST.gemPrice}</button>
              <button class="btn ad" data-act="adChest" ${S.d.ads.chest < SF.ADS.chest.perDay ? '' : 'disabled'}>Free with video (${SF.ADS.chest.perDay - S.d.ads.chest} left)</button>
            </div></div>
          <div class="feature"><h3>Drop rates</h3>${oddsTable()}</div></div>`;
      } else {
        const list = SF.SKINS.filter(s => (s.tier === 'Rare' || s.tier === 'Epic') && !s.lock);
        body = `<p>You have <span class="chip"><i class="ico ico-frag"></i>${S.d.fragments} skin shards</span>. Shards come from chests, the Shard Pass, mastery and duplicate skins.</p>
          <div class="grid">${list.map(s => {
            const cost = SF.FRAGMENT_COST[s.tier], own = S.owns.skin(s.id);
            return `<div class="tile">${heroCanvas(s.hero, s.id)}<h3>${s.name}</h3><div class="meta"><span>${SF.HERO[s.hero].name}</span><span class="tier" style="color:${SF.SKIN_TIERS[s.tier].color}">${s.tier}</span></div>
              ${own ? '<span class="tag">Owned</span>' : `<button class="btn sm primary" data-act="fragSkin" data-id="${s.id}" ${S.d.fragments >= cost ? '' : 'disabled'}><i class="ico ico-frag"></i>${cost}</button>`}</div>`;
          }).join('')}</div>`;
      }
      return `<div class="page"><div class="page-head"><h2>Shop</h2></div>
        <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${shopTab === k}" class="${shopTab === k ? 'on' : ''}" data-act="shopTab" data-tab="${k}">${l}</button>`).join('')}</div>${body}</div>`;
    },

    pass() {
      const P = SF.PASS, d = S.d.pass, tier = S.passTier();
      const into = tier >= P.tiers ? 1 : (d.xp % P.xpPerTier) / P.xpPerTier;
      const cell = (t, track) => {
        const r = track === 'free' ? P.free(t) : P.elite(t);
        const claimed = (track === 'free' ? d.free : d.elite_).includes(t);
        const lockedTrack = track === 'elite' && !d.elite;
        const ready = t <= tier && !claimed && !lockedTrack;
        return `<button class="cell ${track === 'elite' ? 'elite' : ''} ${ready ? 'ready' : ''} ${claimed ? 'done' : ''}" data-act="claimTier" data-t="${t}" data-track="${track}" aria-label="Tier ${t} ${track} reward">
          ${lockedTrack ? `<span class="lock">${SF.ICONS.lock}</span>` : ''}${rewardIcon(r)}${claimed ? '<span class="muted" style="font-size:11px">Claimed</span>' : ''}</button>`;
      };
      let track = `<span class="rowlabel" style="align-self:end">Tier</span><span class="rowlabel" style="align-self:center">Free</span><span class="rowlabel" style="align-self:center;color:var(--gold)">Elite</span>`;
      for (let t = 1; t <= P.tiers; t++) track += `<span class="tn ${t <= tier ? 'reached' : ''}">${t}</span>${cell(t, 'free')}${cell(t, 'elite')}`;
      const n = S.passClaimable();
      return `<div class="page">
        <div class="pass-head">
          <div><p class="eyebrow">Season ${P.season}</p><h2 class="title-xl">${P.name.split(': ')[1]}</h2>
            <p class="muted" style="margin:4px 0 8px">Tier ${tier} of ${P.tiers} · ${tier >= P.tiers ? 'Season complete' : `${fmt(d.xp % P.xpPerTier)} / ${fmt(P.xpPerTier)} XP to the next tier`}</p>
            <div class="bar" style="--p:${into};max-width:420px"><i></i></div></div>
          <div class="actions" style="justify-content:flex-end">
            ${n ? `<button class="btn primary" data-act="claimAll">Claim all (${n})</button>` : ''}
            ${tier < P.tiers ? `<button class="btn ghost" data-act="buyTier">+1 tier <i class="ico ico-gem"></i>${P.tierPrice}</button>` : ''}
            ${d.elite ? '<span class="tag" style="color:var(--gold)">Elite active · +20% XP</span>' : `<button class="btn gem" data-act="elite">Unlock Elite <i class="ico ico-gem"></i>${P.elitePrice}</button>`}
          </div>
        </div>
        <div class="track">${track}</div>
        <p class="muted" style="font-size:13px">Earn pass XP from every match (more for wins) and from daily missions.</p>
      </div>`;
    },

    missions() {
      const d = S.d, ready = S.loginReady(), next = d.login.day % 7;
      const days = SF.DAILY_LOGIN.map((r, i) => {
        const got = ready ? i < next : i < d.login.day;
        const today = ready && i === next;
        return `<div class="day ${got ? 'got' : ''} ${today ? 'today' : ''}"><span class="muted">Day ${i + 1}</span>${rewardIcon(r)}</div>`;
      }).join('');
      const row = (m, prog, claimed, act) => {
        const p = Math.min(m.goal, prog), done = p >= m.goal;
        return `<div class="card mrow"><div><h4>${m.text}</h4><div class="rw">${m.reward.map(chip).join('')}</div><div class="bar" style="--p:${p / m.goal}"><i></i></div></div>
          ${claimed ? '<span class="tag">Done</span>' : done ? `<button class="btn primary" data-act="${act}" data-id="${m.id}">Claim</button>` : `<span class="num muted">${p} / ${m.goal}</span>`}</div>`;
      };
      return `<div class="page">
        <div class="page-head"><h2>Missions</h2><p class="muted">Daily missions reset at midnight</p></div>
        <div class="card" style="display:grid;gap:10px"><div class="page-head"><h3 class="title-md">7-day login</h3>
          ${ready ? '<button class="btn primary sm" data-act="claimLogin">Claim today</button>' : '<span class="muted">Come back tomorrow</span>'}</div><div class="cal">${days}</div></div>
        <button class="card slim event-mini" data-act="go" data-v="event"><span><span class="eyebrow" style="color:#7cc8ff">Event</span><br><b>${SF.EVENT.name}: earn ${SF.EVENT.token} from every match</b></span><span class="chip"><i class="ico ico-token"></i>${fmt(d.event.tokens)}</span></button>
        <div class="list">${SF.MISSIONS.map(m => row(m, d.daily.progress[m.stat] || 0, d.daily.claimed.includes(m.id), 'claimMission')).join('')}</div>
        <h3 class="title-md">Weekly</h3>
        <div class="list">${row(SF.WEEKLY, d.weekly.progress, d.weekly.claimed, 'claimWeekly')}</div>
      </div>`;
    },

    event() {
      const E = SF.EVENT, ev = S.d.event;
      const items = E.shop.map(it => {
        const n = ev.bought[it.id] || 0, soldOut = n >= it.limit || (it.reward.type === 'skin' && S.owns.skin(it.reward.id));
        const icon = it.reward.type === 'skin' ? heroCanvas(SF.SKIN[it.reward.id].hero, it.reward.id) : `<div class="ev-ic">${rewardIcon(it.reward)}</div>`;
        return `<div class="tile">${icon}<h3>${it.label}</h3><div class="meta"><span>${it.reward.type === 'skin' ? 'Event exclusive' : `${n} / ${it.limit} this week`}</span></div>
          ${soldOut ? '<span class="tag">Sold out</span>' : `<button class="btn sm primary" data-act="eventBuy" data-id="${it.id}" ${ev.tokens >= it.cost ? '' : 'disabled'}><i class="ico ico-token"></i>${it.cost}</button>`}</div>`;
      }).join('');
      return `<div class="page">
        <div class="page-head"><div><p class="eyebrow" style="color:#7cc8ff">Limited-time event</p><h2>${E.name}</h2></div><span class="chip big-chip"><i class="ico ico-token"></i>${fmt(ev.tokens)} ${E.token}</span></div>
        <p class="muted">Earn ${E.perWin} tokens for every win and ${E.perLoss} for every loss, plus 50% more in Shard Brawl. Purchase limits reset every Monday.</p>
        <div class="grid">${items}</div></div>`;
    },

    free() {
      const d = S.d, ac = SF.ADS;
      const card = (eyebrow, title, text, btn) => `<div class="feature"><p class="eyebrow">${eyebrow}</p><h3>${title}</h3><p class="muted">${text}</p>${btn}</div>`;
      return `<div class="page"><div class="page-head"><h2>Free rewards</h2><p class="muted">Video rewards refresh every day</p></div>
        <div class="offer-row">
          ${card('Video reward', 'Coin cache', `Watch a short video for 100 coins. ${ac.coins.perDay - d.ads.coins} of ${ac.coins.perDay} left today.`,
            `<button class="btn ad" data-act="adCoins" ${d.ads.coins < ac.coins.perDay ? '' : 'disabled'}>Watch video</button>`)}
          ${card('Video reward', 'Free Aether Chest', `One free chest every day. ${ac.chest.perDay - d.ads.chest} left today.`,
            `<button class="btn ad" data-act="adChest" ${d.ads.chest < ac.chest.perDay ? '' : 'disabled'}>Watch video</button>`)}
          ${card('Every day', '7-day login', S.loginReady() ? "Today's login reward is waiting." : 'Claimed today. A new reward unlocks tomorrow.',
            `<button class="btn primary" data-act="${S.loginReady() ? 'claimLogin' : 'go'}" data-v="missions">${S.loginReady() ? 'Claim' : 'View calendar'}</button>`)}
          ${d.chests ? card('Inventory', `${d.chests} Aether Chest${d.chests > 1 ? 's' : ''}`, 'Open them for coins, gems, skin shards or an Epic skin.', '<button class="btn primary" data-act="openChest">Open</button>') : ''}
          ${S.monthlyActive() ? card('Aether Card', 'Daily gems', S.monthlyReady() ? `${SF.OFFERS.monthly.daily} gems are ready.` : 'Claimed today.', `<button class="btn gem" data-act="claimMonthly" ${S.monthlyReady() ? '' : 'disabled'}>Claim</button>`) : ''}
          ${card('Achievements', 'Gems for milestones', `${S.achievementsReady().length} ready to claim. Every achievement pays gems once.`, '<button class="btn primary" data-act="go" data-v="profile">View achievements</button>')}
        </div>
        <p class="muted" style="font-size:13px">After any match you can also watch a video to double your coins (${ac.double.perDay} times a day).</p></div>`;
    },

    profile() {
      const d = S.d, st = d.stats, r = S.rank();
      const wr = st.matches ? Math.round(st.wins / st.matches * 100) + '%' : '–';
      const kda = st.deaths ? ((st.kills + st.assists) / st.deaths).toFixed(1) : (st.kills + st.assists ? 'Perfect' : '–');
      const stat = (label, val) => `<div class="stat"><b class="num">${val}</b><span>${label}</span></div>`;
      const rewards = SF.RANKS.rewards.map(x => {
        const got = d.rank.claimed.includes(x.tier), can = x.tier <= d.rank.best && !got;
        return `<div class="rr ${got ? 'done' : ''}"><span style="color:${SF.RANKS.tiers[x.tier].color}">${SF.RANKS.tiers[x.tier].name}</span>${chip(x.reward)}
          ${got ? '<span class="tag">Claimed</span>' : can ? `<button class="btn sm primary" data-act="claimRank" data-t="${x.tier}">Claim</button>` : '<span class="muted small">Locked</span>'}</div>`;
      }).join('');
      const top = SF.HEROES.map(h => ({ h, m: S.masteryOf(h.id) })).filter(x => x.m.pts > 0).sort((a, b) => b.m.pts - a.m.pts).slice(0, 5);
      const mastery = top.length ? top.map(({ h, m }) => `<div class="trow">${heroCanvas(h.id, S.skinOf(h.id))}<div class="nm"><b>${h.name} ${masteryBadge(h.id)}</b>
          <span class="bar" style="--p:${m.next ? (m.pts - m.prev) / (m.next - m.prev) : 1}"><i></i></span></div><span class="num muted">${fmt(m.pts)}</span></div>`).join('')
        : '<p class="muted">Play matches to build mastery with your heroes. Each mastery level pays a reward.</p>';
      const hist = d.history.length ? d.history.map(x => `<div class="trow ${x.won ? 'won' : 'lost'}">${heroCanvas(x.hero, x.skin)}<div class="nm"><b>${x.won ? 'Victory' : 'Defeat'}${x.mvp ? '<span class="mvp">MVP</span>' : ''}</b>
          <span>${SF.MODES[x.mode] ? SF.MODES[x.mode].name : x.mode} · ${SF.HERO[x.hero] ? SF.HERO[x.hero].name : x.hero} · ${Math.floor(x.time / 60)}:${String(Math.floor(x.time % 60)).padStart(2, '0')} · ${x.at.slice(0, 10)}</span></div>
          <span class="kda">${x.k} / ${x.d} / ${x.a}</span></div>`).join('') : '<p class="muted">No matches yet.</p>';
      const ach = SF.ACHIEVEMENTS.map(a => {
        const v = Math.min(a.goal, S.achievementValue(a.stat)), got = d.achievements.includes(a.id), can = !got && v >= a.goal;
        return `<div class="card mrow ${got ? 'done' : ''}"><div><h4>${a.name}</h4><p class="muted small">${a.text}</p><div class="bar" style="--p:${v / a.goal}"><i></i></div></div>
          ${got ? '<span class="tag">Done</span>' : can ? `<button class="btn gem sm" data-act="claimAch" data-id="${a.id}"><i class="ico ico-gem"></i>${a.gems}</button>` : `<span class="num muted">${a.stat === 'bestTier' ? SF.RANKS.tiers[v].name : v + ' / ' + a.goal}</span>`}</div>`;
      }).join('');
      return `<div class="page">
        <div class="page-head"><div><p class="eyebrow">Account level ${d.account.level}</p><h2>${esc(d.name)}</h2></div>
          <div class="actions"><button class="btn sm ghost" data-act="rename">Change name</button><button class="btn sm ghost" data-act="settings">Settings</button></div></div>
        <div class="pgrid">
          <div class="card" style="display:grid;gap:12px"><p class="eyebrow">Ranked · Season ${SF.RANKS.season}</p>${rankBadge(r, true)}
            <p class="muted small">Best this season: ${SF.RANKS.tiers[d.rank.best].name}. Reaching a tier unlocks its reward.</p><div class="rr-list">${rewards}</div></div>
          <div class="card" style="display:grid;gap:12px"><p class="eyebrow">Career</p><div class="stats">
            ${stat('Matches', fmt(st.matches))}${stat('Win rate', wr)}${stat('KDA', kda)}${stat('MVPs', fmt(st.mvps))}${stat('Towers', fmt(st.towers))}${stat('Shards', fmt(st.shards))}</div>
            <p class="eyebrow">Most played</p><div class="list">${mastery}</div></div>
        </div>
        <h3 class="title-md">Achievements</h3><div class="list ach">${ach}</div>
        <h3 class="title-md">Match history</h3><div class="list">${hist}</div>
      </div>`;
    },

    results() {
      const s = lastSummary, rw = lastRewards;
      if (!s) { view = 'home'; return VIEWS.home(); }
      const side = team => s.rows.filter(r => r.team === team).map(r => `<div class="trow ${r.isPlayer ? 'me' : ''}">${heroCanvas(r.heroId, r.skin)}
          <div class="nm"><b>${esc(r.name)}${s.mvp === r ? '<span class="mvp">MVP</span>' : ''}${r.human && !r.isPlayer ? ' <span class="tag">Player</span>' : ''}</b><span>${r.hero} · Lv ${r.level} · ${fmt(r.dmg)} dmg</span></div>
          <span class="kda">${r.k} / ${r.d} / ${r.a}</span></div>`).join('');
      const mm = Math.floor(s.time / 60), ss = String(Math.floor(s.time % 60)).padStart(2, '0');
      const canDouble = !rw.doubled && S.d.ads.double < SF.ADS.double.perDay;
      let rank = '';
      if (rw.ranked) {
        const x = rw.ranked;
        const note = x.delta > 0 ? `+${x.delta} star${x.delta > 1 ? 's' : ''}${x.delta > 1 ? ' (win streak)' : ''}` : x.delta < 0 ? '−1 star' : x.mvpSaved ? 'MVP: no star lost' : x.protected ? 'Tier protection: no star lost' : '';
        rank = `<div class="card rank-change"><p class="eyebrow">Ranked</p><div class="rank-row">${rankBadge(x.before)}<span class="arrow">→</span>${rankBadge(x.after)}</div><p class="small">${note}${x.after.tier > x.before.tier ? ` · Promoted to ${x.after.name}!` : ''}</p></div>`;
      }
      const m = S.masteryOf(rw.heroId), mh = SF.HERO[rw.heroId];
      const mastery = `<div class="card"><p class="eyebrow">Mastery · ${mh.name}</p><p><b>${m.name}</b> <span class="muted small">+${rw.mastery.pts} points${rw.mastery.after > rw.mastery.before ? ' · level up!' : ''}</span></p>
        <div class="bar" style="--p:${m.next ? (m.pts - m.prev) / (m.next - m.prev) : 1}"><i></i></div>${rw.mastery.got.length ? `<div class="rewards" style="margin-top:8px">${rw.mastery.got.map(chip).join('')}</div>` : ''}</div>`;
      const ach = S.achievementsReady().length;
      return `<div class="results ${s.won ? 'won' : 'lost'}">
        <div><p class="eyebrow">${SF.MODES[rw.mode] ? SF.MODES[rw.mode].name : 'Match'} · ${mm}:${ss} · ${s.kills[0]} – ${s.kills[1]}</p><h1 class="verdict">${s.won ? 'Victory' : 'Defeat'}</h1></div>
        <div class="teams"><div class="card" style="display:grid;gap:6px"><p class="eyebrow" style="color:var(--ally)">Your team</p>${side(0)}</div>
          <div class="card" style="display:grid;gap:6px"><p class="eyebrow" style="color:var(--enemy)">Enemy team</p>${side(1)}</div></div>
        <div class="pgrid">${rank}${mastery}</div>
        <div class="card" style="display:grid;gap:10px"><p class="eyebrow">Rewards</p>
          <div class="rewards">${chip({ type: 'coins', n: rw.coins * (rw.doubled ? 2 : 1) })}${chip({ type: 'passXp', n: rw.passXp })}${chip({ type: 'tokens', n: rw.tokens })}<span class="chip">+${rw.accXp} account XP</span>
          ${rw.ups.length ? `<span class="chip" style="color:var(--shard)">Account level ${S.d.account.level}! +${200 * rw.ups.length} coins</span>` : ''}
          ${rw.tierUp > 0 ? `<span class="chip" style="color:var(--gold)">Shard Pass tier ${S.passTier()} reached</span>` : ''}</div>
          ${ach ? `<p class="small" style="color:var(--gem)">${ach} achievement${ach > 1 ? 's' : ''} ready to claim in your profile.</p>` : ''}
          ${!S.d.pass.elite ? '<p class="muted small">Elite Pass holders earn 20% more pass XP per match.</p>' : ''}
          <div class="actions">${canDouble ? `<button class="btn ad" data-act="double">Watch video: +${rw.coins} coins</button>` : ''}
            <button class="btn" data-act="again">Play again</button>
            <button class="btn primary" data-act="continue">Continue</button></div></div>
      </div>`;
    }
  };

  function heroDetail(id) {
    const h = SF.HERO[id], owned = S.owns.hero(id), free = S.freeRotation().includes(id), m = S.masteryOf(id);
    const skills = h.skills.map((s, i) => `<div class="skill"><span class="ic">${SF.ICONS[s.kind]}</span><div><b>${s.name}</b>
      <span class="muted" style="font-size:12px"> ${i === 2 ? 'Ultimate · ' : ''}${s.cd}s cooldown</span><p>${s.desc}</p></div></div>`).join('');
    let actions;
    if (owned) actions = S.d.selected === id ? '<span class="tag sel-tag">Selected for battle</span>' : `<button class="btn primary" data-act="select" data-id="${id}">Select</button>`;
    else actions = `<button class="btn primary" data-act="unlock" data-id="${id}" data-cur="coins"><i class="ico ico-coin"></i>${fmt(h.price.coins)}</button>
      <button class="btn gem" data-act="unlock" data-id="${id}" data-cur="gems"><i class="ico ico-gem"></i>${h.price.gems}</button>
      ${free ? `<button class="btn" data-act="select" data-id="${id}">Play free this week</button>` : ''}`;
    return `<div class="card detail"><div><p class="eyebrow">${h.role}</p><h3>${h.name}</h3><p class="muted">${h.title}. ${h.lore}</p></div>
      <div class="actions">${actions}</div>
      <div><p class="small"><b>Mastery: ${m.name}</b> <span class="muted">${fmt(m.pts)}${m.next ? ' / ' + fmt(m.next) : ''} points</span></p><div class="bar" style="--p:${m.next ? (m.pts - m.prev) / (m.next - m.prev) : 1}"><i></i></div></div>
      ${skills}
      <p class="eyebrow">Skins</p><div class="skins">${SF.skinsFor(id).map(s => skinTile(s, false)).join('')}</div></div>`;
  }
  function skinTile(s, showHero) {
    const own = S.owns.skin(s.id), eq = S.skinOf(s.hero) === s.id;
    let action;
    if (own) action = eq ? '<span class="tag">Equipped</span>' : `<button class="btn sm" data-act="equip" data-id="${s.id}">Equip</button>`;
    else if (s.lock === 'pass') action = `<button class="btn sm ghost" data-act="go" data-v="pass" style="color:var(--shard)">Shard Pass</button>`;
    else if (s.lock === 'ranked') action = `<button class="btn sm ghost" data-act="go" data-v="profile" style="color:#ff9d5c">Ranked reward</button>`;
    else if (s.lock === 'event') action = `<button class="btn sm ghost" data-act="go" data-v="event" style="color:#7cc8ff">Event</button>`;
    else action = `<button class="btn sm gem" data-act="buySkin" data-id="${s.id}"><i class="ico ico-gem"></i>${s.price.gems}</button>`;
    return `<div class="tile">${heroCanvas(s.hero, s.id)}${showHero ? `<h3>${s.name}</h3><div class="meta"><span>${SF.HERO[s.hero].name}</span>` : `<h4>${s.name}</h4><div class="meta">`}
      <span class="tier" style="color:${SF.SKIN_TIERS[s.tier].color}">${s.tier}</span></div>${action}</div>`;
  }
  function oddsTable() {
    const total = SF.CHEST.table.reduce((a, e) => a + e.w, 0);
    return `<table class="odds"><thead><tr><th>Reward</th><th>Chance</th></tr></thead><tbody>
      ${SF.CHEST.table.map(e => `<tr><td>${e.label}</td><td>${(e.w / total * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>
      <p class="muted" style="font-size:12px;margin-top:8px">Every ${SF.CHEST.pity}th chest without an Epic skin is guaranteed to contain one. Duplicate skins convert to skin shards.</p>`;
  }

  function render(scrollTop) {
    const v = $('view');
    v.innerHTML = VIEWS[view]();
    if (scrollTop) v.scrollTop = 0;
    paintCanvases(v);
    refreshTop();
  }

  // ---------- match flow ----------
  const TIPS = [
    'Stay behind your minions. Towers shoot minions first.',
    'Drag a skill button to aim it. Release over Cancel to call it off.',
    'The Shard Colossus wakes up at 1:30 by the river.',
    'Tall grass hides you from enemies until they step close.',
    'Press Recall to heal at your base fountain.',
    'The glowing item on the left is your next recommended buy.',
    'Tap the score at the top to see everyone\'s items and K/D/A.',
    'MVPs never lose a star in Ranked.'
  ];
  const pickSkin = id => { const list = SF.skinsFor(id).filter(s => !s.lock || Math.random() < 0.3); return Math.random() < 0.5 ? list[0].id : list[Math.floor(Math.random() * list.length)].id; };

  function startBattle(modeArg) {
    const mode = modeArg || S.d.mode || 'quick';
    if (mode === 'online') return startOnline();
    if (mode === 'ranked' && !S.rankedUnlocked()) return infoModal('Ranked is locked', `Reach account level ${SF.RANKS.unlockLevel} to play Ranked.`);
    let heroId = S.d.selected; if (!S.playable(heroId)) heroId = S.d.heroes[0];
    if (mode === 'brawl') heroId = SF.HEROES[Math.floor(Math.random() * SF.HEROES.length)].id;
    const others = shuffle(SF.HEROES.map(h => h.id).filter(id => id !== heroId));
    const names = shuffle(SF.BOT_NAMES.slice());
    const allies = others.slice(0, 2).map((id, i) => ({ id, skin: pickSkin(id), name: names[i] }));
    const enemies = others.slice(2, 5).map((id, i) => ({ id, skin: pickSkin(id), name: names[2 + i] }));
    const difficulty = mode === 'ranked' ? S.rank().diff : mode === 'brawl' ? 'normal' : S.d.difficulty;
    const opts = { hero: heroId, skin: S.skinOf(heroId), playerName: S.d.name, difficulty, allies, enemies, mode: mode === 'brawl' ? 'brawl' : 'classic', tutorial: !S.d.tutorial && mode === 'quick' };
    const me = { id: heroId, skin: opts.skin };
    showLoading(SF.MODES[mode].name, [allies[0], me, allies[1]], enemies, 1, () => SF.hud.start(opts, sum => finishMatch(sum, { mode, heroId, skin: opts.skin })));
  }
  function showLoading(title, blue, red, meIndex, done) {
    const el = $('loading');
    const card = (s, team, me, i) => `<div class="lcard" style="--c:${team === 0 ? 'var(--ally)' : 'var(--enemy)'};animation-delay:${i * 0.08}s">${heroCanvas(s.id, s.skin)}<b>${SF.HERO[s.id].name}</b><span>${me ? 'You' : esc(s.name)}</span>${me ? masteryBadge(s.id) : ''}</div>`;
    el.innerHTML = `<h2>${title}</h2>
      <div class="vs"><div class="side">${blue.map((s, i) => card(s, 0, i === meIndex, i)).join('')}</div>
      <span class="vsmark">VS</span><div class="side">${red.map((e, i) => card(e, 1, false, i + 3)).join('')}</div></div>
      <div class="bar loadbar"><i id="loadFill"></i></div><p class="muted" style="text-align:center">${TIPS[Math.floor(Math.random() * TIPS.length)]}</p>`;
    el.hidden = false;
    closeModal();
    paintCanvases(el);
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(1, p + 0.05 + Math.random() * 0.05);
      const f = $('loadFill'); if (f) f.style.setProperty('--p', p);
      if (p >= 1) {
        clearInterval(iv);
        setTimeout(() => { el.hidden = true; $('lobby').hidden = true; SF.music.play('match'); done(); }, 250);
      }
    }, 100);
  }

  function startOnline() {
    if (!onlineReady()) return infoModal('Online play is not set up', 'Add the address of your Shardfall game server in Settings, then try again.');
    if (queueing) return;
    let heroId = S.d.selected; if (!S.playable(heroId)) heroId = S.d.heroes[0];
    queueing = true; render();
    const fail = msg => { queueing = false; render(); infoModal('Could not join online', esc(msg || 'The game server did not respond.')); };
    try {
      SF.net.connect(serverUrl());
      SF.net.queue({ mode: 'quick', heroId, skinId: S.skinOf(heroId), name: S.d.name }, {
        onQueued() { /* searching state already shown */ },
        onError: e => fail(e && e.message ? e.message : e),
        onMatch: info => {
          queueing = false;
          const remote = info && info.remote ? info.remote : info;
          const heroes = remote.heroes || [];
          const blue = heroes.filter(h => h.team === 0).map(h => ({ id: h.def0.id, skin: h.skin, name: h.name }));
          const red = heroes.filter(h => h.team === 1).map(h => ({ id: h.def0.id, skin: h.skin, name: h.name }));
          const meIndex = heroes.filter(h => h.team === 0).indexOf(remote.player);
          showLoading(SF.MODES.online.name, blue, red, meIndex, () => SF.hud.start({ remote, tutorial: false }, sum => finishMatch(sum, { mode: 'online', heroId: remote.player.def0.id, skin: remote.player.skin })));
        }
      });
    } catch (e) { fail(e.message); }
  }

  function finishMatch(sum, ctx) {
    $('lobby').hidden = false;
    SF.music.play('lobby');
    if (SF.net && ctx.mode === 'online') { try { SF.net.close(); } catch (e) { /* ignore */ } }
    const me = sum.rows.find(r => r.isPlayer) || sum.rows[0];
    const won = sum.won, mvp = !!(sum.mvp && sum.mvp.isPlayer);
    const modeMul = ctx.mode === 'brawl' ? 0.8 : ctx.mode === 'ranked' ? 1.25 : 1;
    const coins = Math.round(((won ? 160 : 90) + Math.min(80, me.k * 10 + me.a * 5) + (mvp ? 50 : 0)) * modeMul);
    let passXp = Math.round(((won ? 450 : 300) + (mvp ? 50 : 0)) * (ctx.mode === 'brawl' ? 0.8 : 1));
    if (S.d.pass.elite) passXp = Math.round(passXp * 1.2);
    const accXp = won ? 150 : 100;
    const tokens = Math.round((won ? SF.EVENT.perWin : SF.EVENT.perLoss) * (ctx.mode === 'brawl' ? SF.EVENT.brawlBonus : 1));
    S.rollover();
    const st = S.d.stats;
    st.matches++; if (won) st.wins++; st.kills += me.k; st.deaths += me.d; st.assists += me.a;
    st.towers += sum.teamStats[0].towers; st.shards += sum.teamStats[0].shards;
    if ((me.multi || 0) >= 3) st.triples++;
    if (mvp) st.mvps++;
    S.track('matches', 1); S.track('wins', won ? 1 : 0); S.track('takedowns', me.k + me.a);
    S.track('towers', sum.teamStats[0].towers); S.track('shards', sum.teamStats[0].shards);
    const tierBefore = S.passTier();
    S.grant([{ type: 'coins', n: coins }, { type: 'passXp', n: passXp }]);
    S.d.event.tokens += tokens;
    const ups = S.addAccountXp(accXp);
    if (ups.length) S.grant(ups.map(() => ({ type: 'coins', n: 200 })));
    const ranked = ctx.mode === 'ranked' ? S.applyRanked(won, mvp) : null;
    const mastery = S.addMastery(ctx.heroId, (won ? 120 : 60) + Math.min(60, (me.k + me.a) * 10) + (mvp ? 40 : 0));
    mastery.pts = (won ? 120 : 60) + Math.min(60, (me.k + me.a) * 10) + (mvp ? 40 : 0);
    S.pushHistory({ mode: ctx.mode, hero: ctx.heroId, skin: ctx.skin, won, k: me.k, d: me.d, a: me.a, mvp, time: sum.time, at: new Date().toISOString() });
    if (ctx.mode === 'quick') S.d.tutorial = true;
    S.save();
    lastSummary = sum;
    lastRewards = { mode: ctx.mode, heroId: ctx.heroId, coins, passXp, accXp, tokens, ups, ranked, mastery, tierUp: S.passTier() - tierBefore, doubled: false };
    view = 'results'; render(true);
  }

  // ---------- actions ----------
  const A = {
    go(d) { view = d.v; if (d.tab) shopTab = d.tab; if (d.v === 'heroes') heroSel = d.id || heroSel; closeModal(); render(true); },
    mode(d) { S.d.mode = d.m; S.save(); render(); },
    diff(d) { S.d.difficulty = d.d; S.save(); render(); },
    battle() { startBattle(); },
    again() { startBattle(lastRewards ? lastRewards.mode : S.d.mode); },
    cancelQueue() { try { SF.net.cancel(); } catch (e) { /* ignore */ } queueing = false; render(); },
    pickHero(d) { heroSel = d.id; render(); },
    select(d) { if (!S.playable(d.id)) return; S.d.selected = d.id; S.save(); render(); },
    unlock(d) {
      const h = SF.HERO[d.id];
      const price = d.cur === 'gems' ? { gems: h.price.gems } : { coins: h.price.coins };
      confirmSpend(h.name, price, () => { const got = S.grant([{ type: 'hero', id: d.id }]); S.d.selected = d.id; S.save(); render(); rewardsModal(`${h.name} joins you`, got); });
    },
    equip(d) { const s = SF.SKIN[d.id]; if (!S.owns.skin(d.id)) return; S.d.equipped[s.hero] = d.id; S.save(); render(); },
    buySkin(d) {
      const s = SF.SKIN[d.id];
      if (!s.price) return;
      confirmSpend(`${s.name} ${SF.HERO[s.hero].name}`, s.price, () => {
        const got = S.grant([{ type: 'skin', id: d.id }]); S.d.equipped[s.hero] = d.id; S.save(); render(); rewardsModal('New skin', got);
      });
    },
    fragSkin(d) {
      const s = SF.SKIN[d.id], cost = SF.FRAGMENT_COST[s.tier];
      if (S.d.fragments < cost || S.owns.skin(d.id)) return;
      S.d.fragments -= cost;
      const got = S.grant([{ type: 'skin', id: d.id }]); render(); rewardsModal('Skin exchanged', got);
    },
    buyPack(d) {
      const p = SF.GEM_PACKS.find(x => x.id === d.id), first = !S.d.firstPack[p.id];
      SF.iap.buy({ id: p.id, name: `${fmt(p.gems)} Gems`, usd: p.usd }).then(ok => {
        if (!ok) return;
        S.d.firstPack[p.id] = true;
        const got = S.grant([{ type: 'gems', n: first ? p.gems * 2 : p.gems + p.bonus }]);
        render(); rewardsModal('Purchase complete', got, first ? 'First-purchase bonus: gems doubled.' : '');
      });
    },
    restore() {
      if (!SF.iap.restore) return;
      Promise.resolve(SF.iap.restore()).then(() => { render(); infoModal('Purchases restored', 'Any purchases tied to your store account have been restored.'); })
        .catch(() => infoModal('Could not restore', 'Check your connection and try again.'));
    },
    starter() {
      if (S.d.starter) return;
      const o = SF.OFFERS.starter;
      SF.iap.buy({ id: o.id, name: o.name, usd: o.usd }).then(ok => {
        if (!ok) return;
        S.d.starter = true;
        const got = S.grant(o.rewards); S.d.equipped.kaida = 'kaida_frost'; S.save(); render(); rewardsModal('Starter Pack', got);
      });
    },
    monthly() {
      if (S.monthlyActive()) return;
      const o = SF.OFFERS.monthly;
      SF.iap.buy({ id: o.id, name: o.name, usd: o.usd }).then(ok => {
        if (!ok) return;
        const until = new Date(); until.setDate(until.getDate() + o.days - 1);
        S.d.monthly.until = SF.dayKey(until); S.d.monthly.last = SF.dayKey();
        const got = S.grant([{ type: 'gems', n: o.now }]); render();
        rewardsModal('Aether Card active', got, `Log in each day for ${o.daily} more gems, through ${S.d.monthly.until}.`);
      });
    },
    claimMonthly() { const got = S.claimMonthly(); if (got) { render(); rewardsModal('Aether Card', got); } },
    openChest() {
      const r = S.openChest(); if (!r) return;
      render();
      modal(`<div class="reveal"><div class="crystal"></div><p class="big">${r.label}</p><div class="rewards">${r.got.map(chip).join('')}</div></div>
        <p class="muted" style="text-align:center;font-size:13px">Epic skin guaranteed within ${SF.CHEST.pity - S.d.chestPity} more chests.</p>
        <div class="actions" style="justify-content:center">${S.d.chests ? `<button class="btn primary" data-act="openChest">Open another (${S.d.chests})</button>` : ''}<button class="btn ghost" data-act="close">Done</button></div>`);
      SF.sfx.play('level'); if (SF.haptics) SF.haptics.success(); refreshTop();
    },
    buyChest() { confirmSpend('an Aether Chest', { gems: SF.CHEST.gemPrice }, () => { S.d.chests++; S.save(); A.openChest(); }); },
    adChest() {
      if (S.d.ads.chest >= SF.ADS.chest.perDay) return;
      SF.ads.showRewarded('Free Aether Chest').then(ok => {
        if (!ok) return infoModal('No reward', 'The video was closed early or could not load. Watch to the end to get the reward.');
        S.d.ads.chest++; S.d.chests++; S.save(); A.openChest();
      });
    },
    adCoins() {
      if (S.d.ads.coins >= SF.ADS.coins.perDay) return;
      SF.ads.showRewarded('Coin cache').then(ok => {
        if (!ok) return infoModal('No reward', 'The video was closed early or could not load. Watch to the end to get the reward.');
        S.d.ads.coins++; const got = S.grant(SF.ADS.coins.reward); render(); rewardsModal('Coin cache', got);
      });
    },
    elite() {
      confirmSpend('the Elite Shard Pass', { gems: SF.PASS.elitePrice }, () => {
        S.d.pass.elite = true; S.save(); render();
        rewardsModal('Elite Pass unlocked', [], 'Elite rewards for every tier you have reached are ready to claim.');
      });
    },
    buyTier() {
      if (S.passTier() >= SF.PASS.tiers) return;
      confirmSpend('one Shard Pass tier', { gems: SF.PASS.tierPrice }, () => { S.addPassXp(SF.PASS.xpPerTier - (S.d.pass.xp % SF.PASS.xpPerTier)); S.save(); render(); });
    },
    claimTier(d) {
      const t = +d.t, P = SF.PASS, ps = S.d.pass;
      if (t > S.passTier()) return;
      let got;
      if (d.track === 'free') { if (ps.free.includes(t)) return; ps.free.push(t); got = S.grant([P.free(t)]); }
      else { if (!ps.elite) return A.elite(); if (ps.elite_.includes(t)) return; ps.elite_.push(t); got = S.grant([P.elite(t)]); }
      render(); rewardsModal(`Tier ${t}`, got);
    },
    claimAll() {
      const P = SF.PASS, ps = S.d.pass, tier = S.passTier(), list = [];
      for (let t = 1; t <= tier; t++) {
        if (!ps.free.includes(t)) { ps.free.push(t); list.push(P.free(t)); }
        if (ps.elite && !ps.elite_.includes(t)) { ps.elite_.push(t); list.push(P.elite(t)); }
      }
      const got = S.grant(list);
      const merged = [];
      got.forEach(r => { const m = merged.find(x => x.type === r.type && r.n != null && !r.id && !r.note); if (m && r.n != null && !r.id && !r.note) m.n += r.n; else merged.push(Object.assign({}, r)); });
      render(); rewardsModal('Pass rewards', merged);
    },
    claimMission(d) {
      const m = SF.MISSIONS.find(x => x.id === d.id), dd = S.d.daily;
      if (!m || dd.claimed.includes(m.id) || (dd.progress[m.stat] || 0) < m.goal) return;
      dd.claimed.push(m.id); const got = S.grant(m.reward); render(); rewardsModal('Mission complete', got);
    },
    claimWeekly() {
      const w = S.d.weekly; if (w.claimed || w.progress < SF.WEEKLY.goal) return;
      w.claimed = true; const got = S.grant(SF.WEEKLY.reward); render(); rewardsModal('Weekly mission complete', got);
    },
    claimLogin() { const got = S.claimLogin(); if (got) { render(); rewardsModal(`Day ${S.d.login.day} login reward`, got); } },
    claimAch(d) {
      const a = SF.ACHIEVEMENTS.find(x => x.id === d.id);
      if (!a || S.d.achievements.includes(a.id) || S.achievementValue(a.stat) < a.goal) return;
      S.d.achievements.push(a.id); const got = S.grant([{ type: 'gems', n: a.gems }]); render(); rewardsModal(a.name, got, a.text);
    },
    claimRank(d) {
      const t = +d.t, x = SF.RANKS.rewards.find(r => r.tier === t);
      if (!x || S.d.rank.claimed.includes(t) || t > S.d.rank.best) return;
      S.d.rank.claimed.push(t); const got = S.grant([x.reward]); render(); rewardsModal(`${SF.RANKS.tiers[t].name} reward`, got);
    },
    eventBuy(d) {
      const it = SF.EVENT.shop.find(x => x.id === d.id);
      const el = modal(`<h3>Confirm</h3><p>Spend <span class="chip"><i class="ico ico-token"></i>${it.cost}</span> on <b>${it.label}</b>?</p>
        <div class="actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" id="confirmYes">Exchange</button></div>`);
      el.querySelector('#confirmYes').onclick = () => { const got = S.eventBuy(d.id); closeModal(); if (got) { S.save(); render(); rewardsModal('Event exchange', got); } };
    },
    double() {
      if (!lastRewards || lastRewards.doubled || S.d.ads.double >= SF.ADS.double.perDay) return;
      SF.ads.showRewarded('Double match coins').then(ok => {
        if (!ok) return;
        S.d.ads.double++; lastRewards.doubled = true;
        S.grant([{ type: 'coins', n: lastRewards.coins }]); render(); SF.sfx.play('coin');
      });
    },
    continue() { view = 'home'; lastSummary = null; render(true); },
    shopTab(d) { shopTab = d.tab; render(); },
    settings() { settingsModal(); },
    rename() {
      const el = modal(`<h3>Change name</h3><div class="field"><label for="nameInput">Player name</label>
        <input id="nameInput" maxlength="16" value="${esc(S.d.name)}" autocomplete="off"><p class="muted small">3 to 16 letters, numbers, spaces or underscores.</p></div>
        <p class="small" id="nameErr" style="color:var(--enemy)" hidden></p>
        <div class="actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" id="nameSave">Save</button></div>`);
      const inp = el.querySelector('#nameInput');
      inp.focus();
      el.querySelector('#nameSave').onclick = () => {
        const v = inp.value.trim().replace(/\s+/g, ' ');
        if (!/^[A-Za-z0-9_ ]{3,16}$/.test(v)) { const e = el.querySelector('#nameErr'); e.textContent = 'Use 3 to 16 letters, numbers, spaces or underscores.'; e.hidden = false; return; }
        S.d.name = v; S.save(); closeModal(); render();
      };
    },
    setting(d) {
      const s = S.d.settings;
      if (d.k === 'sound') s.sound = !s.sound;
      if (d.k === 'music') { s.music = !s.music; s.music ? SF.music.play('lobby') : SF.music.halt(); }
      if (d.k === 'gfx') s.gfx = s.gfx === 'low' ? 'high' : 'low';
      if (d.k === 'numbers') s.numbers = !s.numbers;
      if (d.k === 'lefty') s.lefty = !s.lefty;
      SF.gfx.low = s.gfx === 'low'; SF.gfx.numbers = s.numbers;
      S.save(); settingsModal();
    },
    resetAsk() { const c = $('resetConfirm'); if (c) c.hidden = false; },
    resetYes() {
      if (SF.net && SF.net.deleteAccount) { try { SF.net.deleteAccount(); } catch (e) { /* ignore */ } }
      S.reset(); closeModal(); view = 'home'; heroSel = null; render(true);
    },
    close() { closeModal(); }
  };

  function settingsModal() {
    const s = S.d.settings, caps = [0, 10, 25, 50, 100];
    const tog = (k, label, on, onText, offText) => `<div class="switch"><span>${label}</span><button class="btn sm ${on ? '' : 'ghost'}" data-act="setting" data-k="${k}" aria-pressed="${on}">${on ? onText || 'On' : offText || 'Off'}</button></div>`;
    const hist = S.d.purchases.length
      ? S.d.purchases.slice(0, 20).map(p => `<div><span>${esc(p.name)}</span><span class="num">${usd(p.usd)} · ${p.at.slice(0, 10)}</span></div>`).join('')
      : '<span class="muted">No purchases yet.</span>';
    modal(`<p class="eyebrow">${esc(S.d.name)} · Level ${S.d.account.level}</p><h3>Settings</h3>
      ${tog('sound', 'Sound effects', s.sound)}${tog('music', 'Music', s.music)}
      ${tog('gfx', 'Graphics quality', s.gfx !== 'low', 'High', 'Battery saver')}${tog('numbers', 'Damage numbers', s.numbers)}
      ${tog('lefty', 'Controls', !s.lefty, 'Joystick left', 'Joystick right')}
      <div class="field"><label for="capSel">Monthly spending limit</label>
        <select id="capSel">${caps.map(c => `<option value="${c}" ${s.cap === c ? 'selected' : ''}>${c ? usd(c) + ' per month' : 'No limit'}</option>`).join('')}</select>
        <p class="muted small">Spent this month: ${usd(S.monthSpent())}. Purchases that would go over the limit are blocked.</p></div>
      <div class="field"><label>Purchase history</label><div class="history">${hist}</div></div>
      ${SF.net ? `<div class="field"><label for="serverInput">Online game server</label><input id="serverInput" placeholder="wss://play.example.com" value="${esc(s.server || '')}" autocomplete="off" spellcheck="false"></div>` : ''}
      <p class="small"><a href="legal/privacy.html" target="_blank" rel="noopener">Privacy policy</a> · <a href="legal/terms.html" target="_blank" rel="noopener">Terms of service</a></p>
      <div class="actions"><button class="btn ghost" data-act="resetAsk">Delete my data</button><button class="btn primary" data-act="close">Done</button></div>
      <div id="resetConfirm" class="card" hidden><p>This permanently deletes your progress, purchases history and account data on this device${SF.net ? ' and on the game server' : ''}.</p><div class="actions" style="margin-top:8px"><button class="btn sm danger" data-act="resetYes">Delete everything</button></div></div>`);
  }
  function loginModal() {
    if (!S.loginReady() || $('modal') || view !== 'home') return;
    const next = S.d.login.day % 7, r = SF.DAILY_LOGIN[next];
    modal(`<p class="eyebrow">Day ${next + 1} of 7</p><h3>Welcome back</h3><p class="muted">Log in every day for bigger rewards. Day 7 pays 80 gems.</p>
      <div class="rewards">${chip(r)}</div><button class="btn primary" data-act="claimLogin">Claim</button>`);
  }

  // ---------- ambient lobby animation ----------
  const shards = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), s: 6 + Math.random() * 22, v: 0.004 + Math.random() * 0.012, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: Math.random() < 0.7 ? '#4fe3d3' : '#d38cff', a: 0.05 + Math.random() * 0.12 }));
  function fit(c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w, h };
  }
  let lastTs = 0;
  function tick(ts) {
    requestAnimationFrame(tick);
    if ($('lobby').hidden && $('loading').hidden) return;
    const t = ts / 1000, dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
    const bg = fit($('bgCanvas'));
    bg.g.clearRect(0, 0, bg.w, bg.h);
    if (!SF.gfx.low) for (const s of shards) {
      s.y -= s.v * dt * 6; s.r += s.vr * dt; if (s.y < -0.05) { s.y = 1.05; s.x = Math.random(); }
      bg.g.save(); bg.g.translate(s.x * bg.w, s.y * bg.h); bg.g.rotate(s.r); bg.g.globalAlpha = s.a; bg.g.fillStyle = s.c;
      bg.g.beginPath(); bg.g.moveTo(0, -s.s); bg.g.lineTo(s.s * 0.5, 0); bg.g.lineTo(0, s.s * 0.8); bg.g.lineTo(-s.s * 0.5, 0); bg.g.closePath(); bg.g.fill(); bg.g.restore();
    }
    const sc = $('stageCanvas');
    if (sc && view === 'home') {
      const { g, w, h } = fit(sc);
      g.clearRect(0, 0, w, h);
      const brawl = S.d.mode === 'brawl';
      const id = brawl ? SF.HEROES[Math.floor(t / 0.6) % SF.HEROES.length].id : S.d.selected, sk = SF.SKIN[brawl ? SF.defaultSkin(id) : S.skinOf(id)];
      const scale = Math.max(1.6, Math.min(w / 120, h / 105));
      const cx = w * 0.56, cy = h * 0.86;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2);
      g.beginPath(); g.ellipse(cx, cy, 34 * scale, 12 * scale, 0, 0, Math.PI * 2);
      const pg = g.createRadialGradient(cx, cy, 0, cx, cy, 34 * scale); pg.addColorStop(0, sk.c1 + '66'); pg.addColorStop(1, sk.c1 + '00'); g.fillStyle = pg; g.fill();
      g.lineWidth = 2; g.strokeStyle = sk.c3 + (pulse > 0.5 ? 'aa' : '66'); g.stroke();
      if (sk.aura && !SF.gfx.low && Math.random() < 0.5) stage.parts.push({ x: cx + (Math.random() - 0.5) * 40 * scale, y: cy - Math.random() * 60 * scale, vy: -(20 + Math.random() * 30) * scale, life: 1.2, c: { frost: '#cfefff', gold: '#ffe27a', bubbles: '#8ff7ff', leaf: '#ffb35c', storm: '#c8d4ff', embers: '#ff8a3d', void: '#8a5bff' }[sk.aura] });
      g.globalAlpha = brawl ? 0.55 : 1;
      SF.drawHero(g, { heroId: id, skinId: sk.id, x: cx, y: cy, t, scale, face: { x: 1, y: 0.2 } });
      g.globalAlpha = 1;
      for (const p of stage.parts) { p.life -= dt; p.y += p.vy * dt; g.globalAlpha = Math.max(0, p.life / 1.2); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 1.6 * scale, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      stage.parts = stage.parts.filter(p => p.life > 0);
    }
  }

  function bindOnce() {
    if (bound) return; bound = true;
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.closest('#match') || el.disabled) return;
      SF.sfx.unlock(); SF.sfx.play('click');
      if (SF.haptics) SF.haptics.tap();
      const fn = A[el.dataset.act];
      if (fn) fn(el.dataset, el);
    });
    document.addEventListener('pointerdown', () => SF.sfx.unlock(), { once: true });
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.stage[data-act]')) { e.preventDefault(); e.target.click(); }
      if (e.key === 'Escape' && $('modal')) closeModal();
    });
    document.addEventListener('change', e => {
      if (e.target.id === 'capSel') { S.d.settings.cap = +e.target.value; S.save(); settingsModal(); }
      if (e.target.id === 'serverInput') { S.d.settings.server = e.target.value.trim(); S.save(); }
    });
    window.addEventListener('resize', () => { if (!$('lobby').hidden) paintCanvases($('view')); });
    requestAnimationFrame(tick);
  }

  SF.lobby = {
    init(data) {
      S.load(data && data.save);
      bindOnce();
      render(true);
      SF.music.play('lobby');
      setTimeout(loginModal, 500);
    },
    // Hooks used by automated tests.
    _test: { startBattle, finishMatch, get view() { return view; }, go: v => A.go({ v }) }
  };

  function boot(data) { SF.lobby.init(data || {}); }
  try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ save: S.d })); } catch (e) { /* optional */ }
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
  else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
})(window.SF);

/* Player profile, economy rules, and the stand-ins for real ads / in-app purchases. */
(function (SF) {
  const KEY = 'shardfall.save.v1';
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const weekKey = (d = new Date()) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
  };
  SF.dayKey = dayKey; SF.weekKey = weekKey;

  function fresh() {
    return {
      v: 1,
      name: 'Shardling' + Math.floor(1000 + Math.random() * 9000),
      coins: 1200, gems: 60, fragments: 0, chests: 1,
      heroes: ['kaida', 'orin', 'sylva'],
      skins: SF.HEROES.map(h => SF.defaultSkin(h.id)),
      equipped: {}, selected: 'kaida', difficulty: 'easy',
      account: { level: 1, xp: 0 },
      pass: { xp: 0, elite: false, free: [], elite_: [] },
      login: { last: null, day: 0 },
      daily: { key: dayKey(), progress: {}, claimed: [] },
      weekly: { key: weekKey(), progress: 0, claimed: false },
      ads: { key: dayKey(), coins: 0, chest: 0, double: 0 },
      chestPity: 0,
      stats: { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 },
      purchases: [], firstPack: {}, starter: false,
      monthly: { until: null, last: null },
      settings: { sound: true, cap: 0 },
      tutorial: false
    };
  }

  let memory = null;
  const S = SF.store = {
    get d() { return memory; },

    load(snapshot) {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
      if (!raw && snapshot && snapshot.v === 1) raw = snapshot;
      const base = fresh();
      memory = raw && raw.v === 1 ? Object.assign(base, raw) : base;
      S.rollover();
      S.save();
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* storage blocked: keep in memory */ }
    },
    reset() {
      memory = fresh();
      S.save();
    },

    // Daily / weekly resets.
    rollover() {
      const d = memory, today = dayKey(), wk = weekKey();
      if (d.daily.key !== today) d.daily = { key: today, progress: {}, claimed: [] };
      if (d.ads.key !== today) d.ads = { key: today, coins: 0, chest: 0, double: 0 };
      if (d.weekly.key !== wk) d.weekly = { key: wk, progress: 0, claimed: false };
    },

    owns: {
      hero: id => memory.heroes.includes(id),
      skin: id => memory.skins.includes(id)
    },
    skinOf(heroId) {
      const s = memory.equipped[heroId];
      return s && memory.skins.includes(s) ? s : SF.defaultSkin(heroId);
    },

    // Free hero rotation changes weekly, so every player can try locked heroes.
    freeRotation() {
      const locked = SF.HEROES.filter(h => h.price.coins > 0).map(h => h.id);
      const seed = [...weekKey()].reduce((a, c) => a + c.charCodeAt(0), 0);
      return [locked[seed % locked.length], locked[(seed + 1) % locked.length]].filter((v, i, a) => a.indexOf(v) === i);
    },
    playable(id) { return S.owns.hero(id) || S.freeRotation().includes(id); },

    afford(price) {
      if (price.gems != null) return memory.gems >= price.gems;
      if (price.coins != null) return memory.coins >= price.coins;
      return false;
    },
    pay(price) {
      if (!S.afford(price)) return false;
      if (price.gems != null) memory.gems -= price.gems; else memory.coins -= price.coins;
      S.save();
      return true;
    },

    // Grants a list of rewards. Returns what was actually received (duplicates become shards).
    grant(list) {
      const out = [];
      for (const r of list) {
        switch (r.type) {
          case 'coins': memory.coins += r.n; out.push(r); break;
          case 'gems': memory.gems += r.n; out.push(r); break;
          case 'fragments': memory.fragments += r.n; out.push(r); break;
          case 'chest': memory.chests += r.n; out.push(r); break;
          case 'passXp': S.addPassXp(r.n); out.push(r); break;
          case 'hero':
            if (!memory.heroes.includes(r.id)) { memory.heroes.push(r.id); out.push(r); }
            break;
          case 'skin':
            if (memory.skins.includes(r.id)) {
              const n = SF.FRAGMENT_COST[SF.SKIN[r.id].tier] || 60;
              memory.fragments += n; out.push({ type: 'fragments', n, note: 'duplicate ' + SF.SKIN[r.id].name });
            } else {
              memory.skins.push(r.id); out.push(r);
              const hero = SF.SKIN[r.id].hero;
              if (!memory.heroes.includes(hero)) { memory.heroes.push(hero); out.push({ type: 'hero', id: hero }); }
            }
            break;
          case 'randomEpic': {
            const pool = SF.SKINS.filter(s => s.tier === 'Epic' && !memory.skins.includes(s.id));
            if (pool.length) out.push(...S.grant([{ type: 'skin', id: pool[Math.floor(Math.random() * pool.length)].id }]));
            else { memory.fragments += 120; out.push({ type: 'fragments', n: 120, note: 'all Epic skins owned' }); }
            break;
          }
        }
      }
      S.save();
      return out;
    },

    // ---- Battle pass ----
    passTier() { return Math.min(SF.PASS.tiers, Math.floor(memory.pass.xp / SF.PASS.xpPerTier)); },
    addPassXp(n) { memory.pass.xp = Math.min(SF.PASS.tiers * SF.PASS.xpPerTier, memory.pass.xp + n); },
    passClaimable() {
      const t = S.passTier(); let n = 0;
      for (let i = 1; i <= t; i++) {
        if (!memory.pass.free.includes(i)) n++;
        if (memory.pass.elite && !memory.pass.elite_.includes(i)) n++;
      }
      return n;
    },

    // ---- Account level ----
    addAccountXp(n) {
      const a = memory.account; a.xp += n; const ups = [];
      while (a.xp >= S.accountNeed(a.level)) { a.xp -= S.accountNeed(a.level); a.level++; ups.push(a.level); }
      return ups;
    },
    accountNeed: lvl => 300 + lvl * 120,

    // ---- Missions ----
    track(stat, n) {
      if (!n) return;
      memory.daily.progress[stat] = (memory.daily.progress[stat] || 0) + n;
      if (stat === SF.WEEKLY.stat) memory.weekly.progress += n;
    },
    missionsReady() {
      let n = SF.MISSIONS.filter(m => (memory.daily.progress[m.stat] || 0) >= m.goal && !memory.daily.claimed.includes(m.id)).length;
      if (memory.weekly.progress >= SF.WEEKLY.goal && !memory.weekly.claimed) n++;
      return n;
    },

    // ---- Daily login ----
    loginReady() { return memory.login.last !== dayKey(); },
    claimLogin() {
      if (!S.loginReady()) return null;
      const idx = memory.login.day % 7;
      memory.login.day = idx + 1;
      memory.login.last = dayKey();
      return S.grant([SF.DAILY_LOGIN[idx]]);
    },

    // ---- Aether Card (monthly pass) ----
    monthlyActive() { return memory.monthly.until && memory.monthly.until >= dayKey(); },
    monthlyReady() { return S.monthlyActive() && memory.monthly.last !== dayKey(); },
    claimMonthly() {
      if (!S.monthlyReady()) return null;
      memory.monthly.last = dayKey();
      return S.grant([{ type: 'gems', n: SF.OFFERS.monthly.daily }]);
    },

    // ---- Chests ----
    openChest() {
      if (memory.chests <= 0) return null;
      memory.chests--;
      memory.chestPity++;
      let pick;
      if (memory.chestPity >= SF.CHEST.pity) pick = SF.CHEST.table.find(e => e.reward.type === 'randomEpic');
      else {
        const total = SF.CHEST.table.reduce((a, e) => a + e.w, 0);
        let roll = Math.random() * total;
        pick = SF.CHEST.table.find(e => (roll -= e.w) < 0) || SF.CHEST.table[0];
      }
      if (pick.reward.type === 'randomEpic') memory.chestPity = 0;
      return { label: pick.label, got: S.grant([pick.reward]) };
    },

    // ---- Spending ----
    monthSpent() {
      const m = monthKey();
      return memory.purchases.filter(p => p.at.slice(0, 7) === m).reduce((a, p) => a + p.usd, 0);
    },
    capAllows(usd) { const cap = memory.settings.cap; return !cap || S.monthSpent() + usd <= cap + 1e-9; },
    recordPurchase(id, name, usd) {
      memory.purchases.unshift({ id, name, usd, at: new Date().toISOString() });
      S.save();
    }
  };

  // ---------------------------------------------------------------------------
  // Stand-ins for platform SDKs. Replace the bodies of these two objects when
  // shipping: SF.iap -> StoreKit 2 (e.g. via RevenueCat), SF.ads -> AdMob/AppLovin
  // rewarded video. Everything else in the game calls only these functions.
  // ---------------------------------------------------------------------------
  function overlay(html) {
    const el = document.createElement('div');
    el.className = 'sdk-overlay';
    el.innerHTML = html;
    document.getElementById('modalRoot').appendChild(el);
    return el;
  }

  SF.iap = {
    // Resolves true if the purchase completed.
    buy(product) {
      return new Promise(resolve => {
        if (!S.capAllows(product.usd)) {
          const el = overlay(`<div class="sdk-sheet">
            <h3>Monthly spending limit reached</h3>
            <p>This purchase ($${product.usd.toFixed(2)}) would go over the $${S.d.settings.cap} limit set in Settings. You've spent $${S.monthSpent().toFixed(2)} this month.</p>
            <div class="sdk-actions"><button class="btn" data-x="ok">OK</button></div></div>`);
          el.querySelector('[data-x=ok]').onclick = () => { el.remove(); resolve(false); };
          return;
        }
        const el = overlay(`<div class="sdk-sheet">
          <p class="sdk-tag">Test purchase · no charge</p>
          <h3>${product.name}</h3>
          <p class="sdk-price">$${product.usd.toFixed(2)}</p>
          <p class="sdk-note">On iOS this sheet is Apple's purchase dialog.</p>
          <div class="sdk-actions"><button class="btn ghost" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Buy</button></div></div>`);
        el.querySelector('[data-x=no]').onclick = () => { el.remove(); resolve(false); };
        el.querySelector('[data-x=yes]').onclick = () => {
          el.remove(); S.recordPurchase(product.id, product.name, product.usd); SF.sfx.play('coin'); resolve(true);
        };
      });
    }
  };

  SF.ads = {
    // Rewarded video. Resolves true only if the viewer watched to the end.
    showRewarded(placement) {
      return new Promise(resolve => {
        let left = 5;
        const el = overlay(`<div class="ad-screen">
          <div class="ad-top"><span>Ad · test</span><button class="ad-close" aria-label="Close ad">✕</button></div>
          <div class="ad-body"><div class="ad-spinner"></div><p>Rewarded video placeholder</p><p class="ad-sub">${placement}</p></div>
          <div class="ad-bar"><div class="ad-fill"></div></div>
          <p class="ad-count">Reward in <b>${left}</b>s</p></div>`);
        const fill = el.querySelector('.ad-fill'), count = el.querySelector('.ad-count b');
        fill.style.transitionDuration = left + 's';
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '100%'; }));
        const iv = setInterval(() => {
          left--; count.textContent = Math.max(0, left);
          if (left <= 0) { clearInterval(iv); el.querySelector('.ad-count').textContent = 'Reward earned'; setTimeout(() => { el.remove(); resolve(true); }, 450); }
        }, 1000);
        el.querySelector('.ad-close').onclick = () => { clearInterval(iv); el.remove(); resolve(left <= 0); };
      });
    }
  };

  // ---- Tiny synthesized sound effects (no audio files to ship) ----
  let ac = null;
  SF.sfx = {
    unlock() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); },
    play(name) {
      if (!ac || !memory || !memory.settings.sound) return;
      const P = {
        hit: [220, 120, 0.05, 'square', 0.04], skill: [520, 260, 0.14, 'sawtooth', 0.05], coin: [880, 1320, 0.12, 'triangle', 0.08],
        level: [440, 880, 0.35, 'triangle', 0.09], kill: [330, 660, 0.3, 'sawtooth', 0.07], click: [660, 660, 0.04, 'sine', 0.06],
        win: [523, 1046, 0.7, 'triangle', 0.1], lose: [330, 165, 0.7, 'triangle', 0.08], tower: [140, 60, 0.4, 'square', 0.08]
      }[name];
      if (!P) return;
      const [f0, f1, dur, type, vol] = P, t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    }
  };
})(window.SF);

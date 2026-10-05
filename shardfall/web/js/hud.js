/* In-match HUD and controls: floating joystick, attack button, drag-to-aim skills, keyboard. */
(function (SF) {
  const $ = id => document.getElementById(id);
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

  SF.ICONS = {
    dash: '<svg viewBox="0 0 24 24"><path d="M4 6l7 6-7 6M12 6l7 6-7 6"/></svg>',
    nova: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M3 12h15M13 6l6 6-6 6"/></svg>',
    zone: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
    buff: '<svg viewBox="0 0 24 24"><path d="M6 12l6-6 6 6M6 19l6-6 6 6"/></svg>',
    heal: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    ult: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.9 6.4.6-4.9 4.2 1.5 6.3L12 16.8 6.4 20l1.5-6.3L3 9.5l6.4-.6z"/></svg>',
    atk: '<svg viewBox="0 0 24 24"><path d="M14.5 3.5H20v5.5L9.5 19.5l-5-5z"/><path d="M4.5 14.5L3 16l5 5 1.5-1.5M7 17l-3 3"/></svg>',
    recall: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/></svg>',
    flash: '<svg viewBox="0 0 24 24"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    skull: '<svg viewBox="0 0 24 24"><path d="M4 20l16-16M4 4l16 16"/></svg>'
  };
  const abbr = id => SF.ITEMS[id].name.replace(/'/g, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  SF.itemIcon = id => `<span class="item-ic" style="--c:${SF.ITEMS[id].c}">${abbr(id)}</span>`;

  let m = null, R = null, raf = 0, last = 0, paused = false, onEnd = null, ended = false, bound = false;
  let aim = null, mouse = null, mouseT = 0, annT = 0, toastT = 0, slowT = 0, lastHit = 0, lastCoin = 0, shopSig = '';
  let annQ = [];
  const keys = new Set();
  const joy = { id: null, ox: 0, oy: 0, dir: null };

  function toast(text, dur = 1.6) { const t = $('toast'); t.textContent = text; t.hidden = false; toastT = dur; }
  function showAnnounce(a) {
    const el = $('announce');
    el.querySelector('b').textContent = a.text;
    el.querySelector('span').textContent = a.sub || '';
    el.style.setProperty('--c', a.team === 0 ? '#7cc8ff' : a.team === 1 ? '#ff8591' : '#9ffcf2');
    el.hidden = false;
    const b = el.querySelector('b'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  }

  function cast(i, manual) {
    if (!m || paused) return;
    const p = m.player;
    const r = m.castSkill(p, i, manual ? m.resolveAim(p, i, manual) : null);
    if (r === 'locked') toast('Ultimate unlocks at level 4');
    else if (r === 'notarget') toast('No target in range');
  }
  function mouseAim(i) {
    if (!mouse || performance.now() - mouseT > 4000) return null;
    const w = R.toWorld(mouse.x, mouse.y), p = m.player, s = p.def0.skills[i];
    const dx = w.x - p.x, dy = w.y - p.y;
    return { x: dx, y: dy, len: Math.min(1, Math.hypot(dx, dy) / (s.range || 200)) };
  }
  function keyDir() {
    let x = 0, y = 0;
    if (keys.has('w') || keys.has('arrowup')) y -= 1;
    if (keys.has('s') || keys.has('arrowdown')) y += 1;
    if (keys.has('a') || keys.has('arrowleft')) x -= 1;
    if (keys.has('d') || keys.has('arrowright')) x += 1;
    return x || y ? norm(x, y) : null;
  }
  function doFlash() {
    if (!m) return;
    const p = m.player, d = keyDir() || joy.dir || p.face;
    if (p.flashCd > 0) toast('Blink recharging');
    else m.flash(p, d);
  }
  function doRecall() {
    if (!m || !m.player.alive) return;
    m.startRecall(m.player);
    if (m.player.recallT > 0) toast('Recalling… stand still for 3s', 2);
  }
  function quickBuy() {
    if (!m) return;
    const p = m.player, id = p.nextItem();
    if (id && m.buy(p, id)) { SF.sfx.play('coin'); toast('Bought ' + SF.ITEMS[id].name); }
    else if (id) toast(`Need ${Math.ceil(SF.ITEMS[id].cost - p.gold)} more gold`);
  }
  function toggleShop(force) {
    const el = $('shop');
    el.hidden = force != null ? !force : !el.hidden;
    if (!el.hidden) { shopSig = ''; renderShop(); }
  }
  function togglePause(force) {
    if (!m || ended) return;
    paused = force != null ? force : !paused;
    const el = $('pause');
    el.hidden = !paused;
    if (paused) {
      el.innerHTML = `<div class="tut"><p class="eyebrow">Paused</p><h3>Take a breather</h3>
        <div class="actions"><button class="btn primary" data-hud="resume">Resume</button>
        <button class="btn ghost" data-hud="sound">Sound: ${SF.store.d.settings.sound ? 'On' : 'Off'}</button>
        <button class="btn ghost" data-hud="surrender">Surrender</button></div></div>`;
    }
  }
  function showTutorial() {
    paused = true;
    const el = $('tutorial');
    el.hidden = false;
    el.innerHTML = `<div class="tut"><p class="eyebrow">First match</p><h3>Destroy the enemy Heartstone</h3><ol>
      <li><b>Move</b> by dragging anywhere on the left half of the screen (WASD on a keyboard).</li>
      <li><b>Attack</b> by holding the red button (Space). It picks the best target for you.</li>
      <li><b>Skills:</b> tap to auto-aim, or drag the button to aim it yourself (Q, E, R). Your ultimate unlocks at level 4.</li>
      <li><b>Gold</b> comes from landing the final hit on minions. Tap the glowing item on the left to buy it.</li>
      <li><b>Towers</b> take less damage unless your minions are beside them. The <b>Shard Colossus</b> by the river empowers your whole team.</li>
    </ol><button class="btn primary" data-hud="tutDone">Start the match</button></div>`;
  }

  function renderShop() {
    const p = m.player, rec = p.def0.build;
    const ids = Object.keys(SF.ITEMS).sort((a, b) => ((rec.indexOf(a) < 0) - (rec.indexOf(b) < 0)) || (rec.indexOf(a) - rec.indexOf(b)) || SF.ITEMS[a].cost - SF.ITEMS[b].cost);
    const sig = p.items.join() + '|' + ids.filter(id => p.gold >= SF.ITEMS[id].cost).join();
    if (sig === shopSig) { const g = $('shopGold'); if (g) g.textContent = Math.floor(p.gold); return; }
    shopSig = sig;
    $('shop').innerHTML = `<div class="sheet-head"><h3>Armory</h3><span class="chip"><i class="ico ico-coin"></i><span class="num" id="shopGold">${Math.floor(p.gold)}</span></span>
      <button class="icon-btn" data-hud="closeShop" aria-label="Close shop"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="sheet-body">${ids.map(id => {
        const it = SF.ITEMS[id], owned = p.items.includes(id), r = rec.indexOf(id);
        const can = p.gold >= it.cost && p.items.length < 6;
        return `<div class="irow ${r >= 0 ? 'rec' : ''}">${SF.itemIcon(id)}<div><b>${it.name}</b>${r >= 0 ? ` <span class="tag">Build ${r + 1}</span>` : ''}<p>${it.desc}</p></div>
          ${owned ? '<span class="own">Owned</span>' : `<button class="btn sm buy" data-hud="buy" data-id="${id}" ${can ? '' : 'disabled'}><i class="ico ico-coin"></i>${it.cost}</button>`}</div>`;
      }).join('')}<p class="muted" style="font-size:13px">You can shop from anywhere on the map. Six item slots.</p></div>`;
  }

  function renderFeed() {
    const el = $('feed');
    el.innerHTML = m.feed.filter(f => m.t - f.t < 8).map(f => {
      const kc = f.team === 0 ? 'b' : 'r', vc = f.team === 0 ? 'r' : 'b';
      const k = f.killer ? `<span class="${kc}">${f.killer.name}</span>` : `<span class="${kc}">Tower</span>`;
      return `<li>${k}${SF.ICONS.skull}<span class="${vc}">${f.victim.name}</span></li>`;
    }).join('');
  }

  function bind() {
    if (bound) return; bound = true;
    $('btnAtk').insertAdjacentHTML('afterbegin', SF.ICONS.atk);
    $('btnRecall').insertAdjacentHTML('afterbegin', SF.ICONS.recall);
    $('btnFlash').insertAdjacentHTML('afterbegin', SF.ICONS.flash);

    const zone = $('joyZone'), base = $('joy'), knob = $('joyKnob');
    const moveJoy = e => {
      const RAD = 52;
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const L = Math.hypot(dx, dy);
      if (L > RAD * 1.5) {
        joy.ox += dx / L * (L - RAD * 1.5); joy.oy += dy / L * (L - RAD * 1.5);
        const r = zone.getBoundingClientRect();
        base.style.left = (joy.ox - r.left) + 'px'; base.style.top = (joy.oy - r.top) + 'px';
        dx = e.clientX - joy.ox; dy = e.clientY - joy.oy;
      }
      const L2 = Math.hypot(dx, dy);
      if (L2 > RAD) { dx = dx / L2 * RAD; dy = dy / L2 * RAD; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.dir = L2 > 8 ? { x: dx / RAD, y: dy / RAD } : null;
    };
    zone.addEventListener('pointerdown', e => {
      if (!m || joy.id !== null) return;
      SF.sfx.unlock();
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      const r = zone.getBoundingClientRect();
      base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px';
      base.hidden = false; $('joyHint').hidden = true;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      moveJoy(e); e.preventDefault();
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moveJoy(e); });
    const endJoy = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.dir = null; base.hidden = true; knob.style.transform = ''; };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);

    const atk = $('btnAtk');
    atk.addEventListener('pointerdown', e => {
      if (!m) return; SF.sfx.unlock();
      try { atk.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      m.player.attackHeld = true; atk.classList.add('held'); e.preventDefault();
    });
    const atkUp = () => { if (m) m.player.attackHeld = false; atk.classList.remove('held'); };
    atk.addEventListener('pointerup', atkUp);
    atk.addEventListener('pointercancel', atkUp);

    const cz = $('cancelZone');
    const inRect = (e, el) => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    document.querySelectorAll('.pbtn.sk').forEach(btn => {
      const i = +btn.dataset.i;
      btn.addEventListener('pointerdown', e => {
        if (!m || !m.player.alive || paused) return;
        SF.sfx.unlock();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        const r = btn.getBoundingClientRect();
        aim = { i, pid: e.pointerId, sx: r.left + r.width / 2, sy: r.top + r.height / 2, manual: null, cancel: false };
        btn.classList.add('held'); cz.hidden = false; e.preventDefault();
      });
      btn.addEventListener('pointermove', e => {
        if (!aim || aim.pid !== e.pointerId) return;
        const dx = e.clientX - aim.sx, dy = e.clientY - aim.sy, L = Math.hypot(dx, dy);
        aim.manual = L > 22 ? { x: dx, y: dy, len: Math.min(1, L / 110) } : null;
        aim.cancel = inRect(e, cz);
        cz.classList.toggle('hot', aim.cancel);
      });
      const finish = (e, fire) => {
        if (!aim || aim.pid !== e.pointerId) return;
        const a = aim; aim = null;
        btn.classList.remove('held'); cz.hidden = true; cz.classList.remove('hot');
        if (fire && !a.cancel) cast(a.i, a.manual);
      };
      btn.addEventListener('pointerup', e => finish(e, true));
      btn.addEventListener('pointercancel', e => finish(e, false));
    });

    $('btnFlash').addEventListener('click', doFlash);
    $('btnRecall').addEventListener('click', doRecall);
    $('btnShop').addEventListener('click', () => toggleShop());
    $('btnQuick').addEventListener('click', quickBuy);
    $('btnPause').addEventListener('click', () => togglePause());

    $('match').addEventListener('click', e => {
      const el = e.target.closest('[data-hud]');
      if (!el || !m) return;
      const a = el.dataset.hud;
      if (a === 'closeShop') toggleShop(false);
      else if (a === 'buy') { if (m.buy(m.player, el.dataset.id)) SF.sfx.play('coin'); renderShop(); }
      else if (a === 'resume') togglePause(false);
      else if (a === 'sound') { const s = SF.store.d.settings; s.sound = !s.sound; SF.store.save(); el.textContent = 'Sound: ' + (s.sound ? 'On' : 'Off'); }
      else if (a === 'surrender') { togglePause(false); m.end(1); }
      else if (a === 'tutDone') { $('tutorial').hidden = true; paused = false; SF.sfx.unlock(); }
    });

    const canvas = $('game');
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; mouseT = performance.now();
    });

    window.addEventListener('keydown', e => {
      if (!m || $('match').hidden) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      SF.sfx.unlock();
      keys.add(k);
      if (k === 'escape') { togglePause(); return; }
      if (paused) return;
      if (k === ' ' || k === 'j') m.player.attackHeld = true;
      const si = { q: 0, 1: 0, e: 1, 2: 1, r: 2, 3: 2 }[k];
      if (si != null) cast(si, mouseAim(si));
      if (k === 'f') doFlash();
      if (k === 'b') doRecall();
      if (k === 'p' || k === 'tab') toggleShop();
      if (k === 'g') quickBuy();
    });
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (m && (k === ' ' || k === 'j')) m.player.attackHeld = false;
    });
    window.addEventListener('blur', () => { keys.clear(); if (m) m.player.attackHeld = false; });
    window.addEventListener('resize', () => { if (R && m) R.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && m && !ended && !paused) togglePause(true); });
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (!m) return;
    if (!paused) {
      const p = m.player;
      p.wantDir = keyDir() || joy.dir;
      m.update(dt);
    }
    R.draw(m, aim ? { i: aim.i, manual: aim.manual } : null);
    updateHud(paused ? 0 : dt);
  }

  const skillEls = () => [...document.querySelectorAll('.pbtn.sk')];
  function updateHud(dt) {
    const p = m.player;
    const mm = Math.floor(m.t / 60), ss = Math.floor(m.t % 60);
    $('clock').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    $('kBlue').textContent = m.kills[0]; $('kRed').textContent = m.kills[1];
    skillEls().forEach((b, i) => {
      const s = p.def0.skills[i], cd = p.skillCd[i], max = s.cd * (1 - p.cdr), el = b.querySelector('.cd');
      el.textContent = cd > 0 ? Math.ceil(cd) : '';
      el.style.setProperty('--cd', cd > 0 ? cd / max : 0);
      b.classList.toggle('locked', i === 2 && p.level < 4);
    });
    const fcd = $('btnFlash').querySelector('.cd');
    fcd.textContent = p.flashCd > 0 ? Math.ceil(p.flashCd) : '';
    fcd.style.setProperty('--cd', p.flashCd / 90);
    $('death').hidden = p.alive || ended;
    if (!p.alive) $('respawnT').textContent = Math.ceil(p.respawnT);
    $('game').classList.toggle('dead', !p.alive && !ended);
    $('xpFill').style.setProperty('--p', p.level >= SF.MAX_LEVEL ? 1 : p.xp / p.xpNeed);

    slowT -= dt;
    if (slowT <= 0) {
      slowT = 0.2;
      $('goldVal').textContent = Math.floor(p.gold);
      const id = p.nextItem(), q = $('btnQuick');
      q.hidden = !id;
      if (id) {
        const it = SF.ITEMS[id];
        $('qIcon').outerHTML = `<span class="item-ic" id="qIcon" style="--c:${it.c}">${abbr(id)}</span>`;
        $('qName').textContent = it.name;
        $('qCost').textContent = it.cost;
        q.classList.toggle('ready', p.gold >= it.cost);
      }
      $('slots').innerHTML = Array.from({ length: 6 }, (_, i) => (p.items[i] ? SF.itemIcon(p.items[i]) : '<span class="empty"></span>')).join('');
      $('buffs').innerHTML = p.buffs.filter(b => b.label).map(b => `<span class="buff" style="--c:${b.id === 'shard' ? '#4fe3d3' : '#ffb347'}">${b.label} ${Math.ceil(b.t)}s</span>`).join('');
      if (!$('shop').hidden) renderShop();
      renderFeed();
      $('rotate').hidden = !(window.innerHeight > window.innerWidth);
    }
    if (dt > 0) {
      annT -= dt;
      if (annT <= 0 && annQ.length) { showAnnounce(annQ.shift()); annT = 2.1; }
      else if (annT <= 0 && !ended) $('announce').hidden = true;
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').hidden = true; }
    }
  }

  SF.hud = {
    start(opts, cb) {
      bind();
      onEnd = cb; ended = false; paused = false; annQ = []; annT = 0; aim = null; keys.clear();
      joy.id = null; joy.dir = null; $('joy').hidden = true; $('joyHint').hidden = false;
      $('match').hidden = false;
      m = new SF.Match(opts);
      if (!R) R = new SF.Renderer($('game'), $('minimap')); else R.resize();
      R.bushImgs = null; R.cam = { x: m.player.x, y: m.player.y };
      skillEls().forEach((b, i) => {
        const s = m.player.def0.skills[i];
        b.querySelectorAll('svg').forEach(n => n.remove());
        b.insertAdjacentHTML('afterbegin', SF.ICONS[s.kind] || SF.ICONS.bolt);
        b.setAttribute('aria-label', s.name);
        b.title = s.name;
      });
      m.on('announce', (text, team, sub) => annQ.push({ text, team, sub }));
      m.on('kill', ev => { renderFeed(); if (ev.killer === m.player || ev.victim === m.player || ev.assists.includes(m.player)) SF.sfx.play('kill'); });
      m.on('levelup', h => { if (h === m.player) { toast(h.level === 4 ? 'Ultimate unlocked' : 'Level ' + h.level); SF.sfx.play('level'); } });
      m.on('cast', h => { if (h === m.player) SF.sfx.play('skill'); });
      m.on('hit', () => { const n = performance.now(); if (n - lastHit > 90) { lastHit = n; SF.sfx.play('hit'); } });
      m.on('gold', () => { const n = performance.now(); if (n - lastCoin > 160) { lastCoin = n; SF.sfx.play('coin'); } });
      m.on('tower', () => SF.sfx.play('tower'));
      m.on('end', team => {
        ended = true; annQ = [];
        $('shop').hidden = true; $('death').hidden = true; $('game').classList.remove('dead');
        showAnnounce({ text: team === 0 ? 'Victory' : 'Defeat', team: team === 0 ? 2 : 1, sub: team === 0 ? 'The enemy Heartstone shatters' : 'Your Heartstone has fallen' });
        SF.sfx.play(team === 0 ? 'win' : 'lose');
        setTimeout(() => { const s = m.summary(); SF.hud.stop(); onEnd(s); }, 2800);
      });
      $('shop').hidden = true; $('pause').hidden = true; $('tutorial').hidden = true; $('announce').hidden = true; $('toast').hidden = true;
      $('feed').innerHTML = '';
      if (opts.tutorial) showTutorial();
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      return m;
    },
    stop() {
      cancelAnimationFrame(raf); raf = 0;
      $('match').hidden = true;
      m = null;
    },
    get match() { return m; }
  };
})(window.SF);

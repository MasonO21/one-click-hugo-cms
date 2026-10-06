/* Online play: connection, matchmaking and SF.RemoteMatch, a server-fed stand-in for SF.Match
   that the HUD and renderer drive exactly like an offline match. Does nothing until called. */
(function (SF) {
  const W = SF.WORLD;
  const INTERP = 0.1;   // render this many seconds behind the newest snapshot, for smooth motion
  const KIND = { h: 'hero', m: 'minion', t: 'tower', c: 'core', n: 'monster' };
  const NET_KEY = 'shardfall.net.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(NET_KEY) || '{}'); } catch (e) { return {}; } };
  const write = o => { try { localStorage.setItem(NET_KEY, JSON.stringify(o)); } catch (e) { /* storage blocked */ } };

  class RUnit {
    constructor(m, id) {
      this.m = m; this.id = id; this.alive = true; this.deadT = 0; this.vis = [true, true, true];
      this.buffs = []; this.items = []; this.skillCd = [0, 0, 0]; this.ranks = [0, 0, 0]; this.points = 0; this.face = { x: 1, y: 0 };
      this.anim = Math.random() * 10; this.flash = 0; this.shield = 0; this.stunT = 0; this.slowT = 0; this.invisT = 0; this.bush = -1;
      this.k = 0; this.dth = 0; this.ast = 0; this.level = 1; this.respawnT = 0; this.recallT = 0; this.gold = 0; this.xp = 0; this.xpNeed = 140;
      this.cdr = 0; this.spellCd = 0; this.spell = 'blink'; this.range = 0; this.x = 0; this.y = 0; this.hp = 1; this.maxHp = 1; this.r = 20;
    }
    get hpPct() { return this.maxHp ? this.hp / this.maxHp : 0; }
    bv(key) { let s = 0; for (const b of this.buffs) if (b[key]) s += b[key]; return s; }
    hasBuff(id) { return this.buffs.some(b => b.id === id); }
    nextItem() { return !this.def0 || this.items.length >= 6 ? null : this.def0.build.find(id => !this.items.includes(id)) || null; }
  }

  class RemoteMatch {
    constructor(info, net) {
      this.net = net; this.remote = true; this.mode = 'classic'; this.roomId = info.room;
      this.myTeam = info.team; this.mirror = info.team === 1; this.pid = info.pid;
      this.t = 0; this.units = []; this.heroes = []; this.projs = []; this.fx = []; this.parts = []; this.floats = []; this.zones = []; this.feed = [];
      this.kills = [0, 0]; this.over = false; this.winner = -1; this.listeners = {}; this.shakeT = 0; this.shakeMag = 0;
      this.teamStats = [{ towers: 0, shards: 0 }, { towers: 0, shards: 0 }];
      this.fountains = [{ x: 110, y: W.laneY, r: 230 }, { x: W.w - 110, y: W.laneY, r: 230 }];
      this.bushes = (info.bushes || []).map(b => Object.assign({}, b, { x: this.mx(b.x) }));
      this.camps = []; this.shard = null; this.signals = [];
      this.map = new Map(); this.snaps = []; this.pending = []; this.lastInput = ''; this.inputT = 0; this.endInfo = null;
      for (const r of info.roster) {
        const h = this.unit(r.i);
        Object.assign(h, { kind: 'hero', team: this.mt(r.tm), def0: SF.HERO[r.h], skin: r.sk, name: r.n, human: r.hu, pid: r.pid, r: 24, alive: true, spell: SF.SPELLS[r.sp] ? r.sp : 'blink' });
        if (r.pid && r.pid === info.pid) { h.isPlayer = true; this.player = h; }
        this.heroes.push(h);
      }
      this.player.spawn = { x: 180, y: W.laneY };
      this.player.x = 180; this.player.y = W.laneY;
    }
    // Local perspective: your team is always 0 (blue, left side).
    mx(x) { return this.mirror ? W.w - x : x; }
    mt(t) { return this.mirror && t < 2 ? 1 - t : t; }
    out(v) { return v ? { x: this.mirror ? -v.x : v.x, y: v.y } : null; }
    outP(p) { return p ? { x: this.mx(p.x), y: p.y } : null; }
    unit(id) { let u = this.map.get(id); if (!u) { u = new RUnit(this, id); this.map.set(id, u); } return u; }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }

    // ---- server messages ----
    ingest(s) {
      this.snaps.push({ time: s.time, recv: performance.now(), s, pos: new Map(s.u.map(e => [e.i, e])) });
      if (this.snaps.length > 12) this.snaps.shift();
      for (const e of s.ev || []) this.pending.push({ time: s.time, e });
      this.apply(s);
    }
    finish(msg) {
      const sum = msg.summary;
      const rows = sum.rows.map(r => Object.assign({}, r, { team: this.mt(r.team), isPlayer: !!r.pid && r.pid === this.pid }));
      const k = this.mirror ? [sum.kills[1], sum.kills[0]] : sum.kills;
      const ts = sum.teamStats.map(x => ({ towers: x.towers, shards: x.shards }));
      this.endInfo = { winner: this.mt(sum.winner), won: sum.winner === this.myTeam, time: sum.time, kills: k, rows, mvp: rows[sum.mvp] || null, teamStats: this.mirror ? [ts[1], ts[0]] : ts };
      this.flushEvents(Infinity);
      this.over = true; this.winner = this.endInfo.winner;
      this.emit('end', this.winner);
    }
    summary() { return this.endInfo; }

    // Latest snapshot: everything except positions (which are interpolated in update()).
    apply(s) {
      this.kills = this.mirror ? [s.k[1], s.k[0]] : s.k.slice();
      const ts = s.ts.map(([towers, shards]) => ({ towers, shards }));
      this.teamStats = this.mirror ? [ts[1], ts[0]] : ts;
      const seen = new Set();
      for (const e of s.u) {
        const u = this.unit(e.i);
        seen.add(u);
        u.kind = KIND[e.k]; u.team = this.mt(e.tm); u.hp = e.hp; u.maxHp = e.mh; u.r = e.r; u.mtype = e.mt;
        u.alive = e.al !== 0; u.deadT = 0;
        u.face = { x: this.mirror ? -e.fx : e.fx, y: e.fy }; u.moving = !!e.mv; u.flash = e.fl ? 0.1 : 0;
        u.stunT = e.st || 0; u.slowT = e.sl ? 1 : 0; u.shield = e.sh || 0;
        if (u.kind === 'tower' || u.kind === 'core') { u.range = e.rg; u.guard = e.g ? this.unit(e.g) : null; u.target = e.tg ? this.unit(e.tg) : null; }
        if (u.kind === 'hero') {
          u.def0 = SF.HERO[e.h]; u.skin = e.sk; u.name = e.n; u.bush = e.bu; u.invisT = e.iv ? 1 : 0;
          u.vis = [true, u.team === 0 ? !!e.ev : true, true];
          if (u !== this.player) u.recallT = e.rc || 0;
        }
        if (!u.placed) { u.x = this.mx(e.x); u.y = e.y; u.placed = true; }
      }
      // Units that left the snapshot: minions/monsters died (fade out), enemy heroes went out of sight.
      this.units = this.units.filter(u => seen.has(u) || ((u.kind === 'minion' || u.kind === 'monster') && (u.alive = false, u.deadT < 0.6)));
      for (const u of seen) if (!this.units.includes(u)) this.units.push(u);
      for (const h of this.heroes) if (!seen.has(h)) { h.vis = [h.team === 0, true, true]; h.placed = h.team === 0 && h.placed; }
      for (const [id, lv, k, d, a, items, alive, rs] of s.hs) {
        const h = this.unit(id);
        h.level = lv; h.k = k; h.dth = d; h.ast = a; h.items = items; h.alive = !!alive; h.respawnT = rs;
      }
      this.camps = s.cp.map(([x, y, alive]) => ({ x: this.mx(x), y, unit: alive ? { alive: true } : null }));
      this.shard = s.sd ? this.unit(s.sd) : null;
      const p = this.player, me = s.me;
      if (me) {
        p.gold = me.gold; p.xp = me.xp; p.xpNeed = me.xn; p.level = me.lv; p.items = me.items; p.skillCd = me.cd; p.cdr = me.cdr;
        p.spellCd = me.fcd; if (me.rk) { p.ranks = me.rk; p.points = me.pt; } p.recallT = me.rc; p.range = me.rg; p.ms = me.ms; p.respawnT = me.rs;
        p.target = me.tg ? this.unit(me.tg) : null;
        p.buffs = me.b.map(([id, t, label]) => ({ id, t, label: label || undefined }));
      }
      this.zones = s.z.map(z => Object.assign({}, z, { x: this.mx(z.x), started: !!z.started, dir: z.dir ? this.out(z.dir) : undefined, follow: z.fo ? this.unit(z.fo) : undefined, base: z.t, at: s.time }));
      this.projs = s.pj.map(q => ({
        x: this.mx(q.x), y: q.y, vx: q.vx != null ? (this.mirror ? -q.vx : q.vx) : undefined, vy: q.vy, speed: q.sp, kind: q.kind, color: q.c, r: q.r,
        homing: q.ho ? this.unit(q.ho) : null, src: q.src ? this.unit(q.src) : null, ang: this.mirror ? Math.PI - q.ang : q.ang
      }));
    }

    // Replays server events once render time catches up with them.
    flushEvents(upTo) {
      while (this.pending.length && this.pending[0].time <= upTo) {
        const e = this.pending.shift().e, p = this.player, U = id => this.map.get(id);
        switch (e[0]) {
          case 'fx': {
            const f = Object.assign({}, e[1], { t: 0 });
            f.x = this.mx(f.x); if (f.x2 != null) f.x2 = this.mx(f.x2);
            if (this.mirror && f.ang != null) f.ang = Math.PI - f.ang;
            if (f.dir) f.dir = this.out(f.dir);
            this.fx.push(f); break;
          }
          case 'burst': SF.Match.prototype.burst.call(this, this.mx(e[1]), e[2], e[3], e[4], e[5]); break;
          case 'shake': this.shake(e[1]); break;
          case 'dmg': { const t = U(e[2]); if (t && t === p) this.took(p, U(e[1]) || null, Math.min(e[3], p.maxHp), e[4] ? 'skill' : 'basic'); if (t && !(SF.gfx && SF.gfx.numbers === false)) this.float(t.x + (Math.random() - 0.5) * 20, t.y - t.r - 26, e[3], t === p ? '#ff6b7a' : e[4] ? '#ffb347' : '#ffffff', e[4] ? 1.25 : 1); break; }
          case 'heal': if (U(e[1]) === p) this.float(p.x, p.y - 50, '+' + e[2], '#7dffa0', 1); break;
          case 'gold': if (U(e[1]) === p) { this.float(p.x, p.y - 64, '+' + e[2], '#ffc84a', 1); this.emit('gold', e[2]); } break;
          case 'hit': this.emit('hit'); break;
          case 'announce': this.emit('announce', e[1], this.mt(e[2]), e[3]); break;
          case 'levelup': { const h = U(e[1]); if (h) this.emit('levelup', h); break; }
          case 'cast': { const h = U(e[1]); if (h && h.def0) this.emit('cast', h, h.def0.skills[e[2]]); break; }
          case 'tower': this.emit('tower', U(e[1])); break;
          case 'sig': {
            const s = { kind: e[1], team: this.mt(e[2]), x: this.mx(e[3]), y: e[4], t: this.t, from: U(e[5]), target: e[6] ? U(e[6]) : null, text: e[7] };
            if (!SF.SIGNALS[s.kind]) break;
            this.signals = this.signals.filter(q => this.t - q.t < 6).concat(s);
            this.emit('signal', s);
            break;
          }
          case 'msg': {
            this.feed.unshift({ msg: e[3], from: U(e[1]), team: this.mt(e[2]), t: this.t });
            this.feed.length = Math.min(this.feed.length, 5);
            this.emit('message', U(e[1]), e[3]);
            break;
          }
          case 'kill': {
            const killer = e[1] ? U(e[1]) : null, victim = U(e[2]);
            if (!victim) break;
            if (victim === p) { victim.recapInfo = this.recap(victim, killer); victim.taken = []; }
            this.feed.unshift({ killer, victim, team: 1 - victim.team, t: this.t });
            this.feed.length = Math.min(this.feed.length, 4);
            this.emit('kill', { killer, victim, assists: e[3].map(U).filter(Boolean), text: e[4] });
            break;
          }
        }
      }
    }

    // ---- per frame ----
    update(dt) {
      this.sendInput(dt);
      if (!this.snaps.length) { this.updateFx(dt); return; }
      const last = this.snaps[this.snaps.length - 1];
      const now = last.time + (performance.now() - last.recv) / 1000;
      const rt = now - INTERP;
      let a = this.snaps[0], b = last;
      for (let i = 0; i < this.snaps.length - 1; i++) if (this.snaps[i].time <= rt && this.snaps[i + 1].time >= rt) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
      const k = b.time > a.time ? Math.max(0, Math.min(1, (rt - a.time) / (b.time - a.time))) : 1;
      this.t = Math.max(this.t, Math.min(rt, last.time));
      for (const u of this.units) {
        if (!u.alive && u.kind !== 'hero' && u.kind !== 'tower' && u.kind !== 'core') { u.deadT += dt; continue; }
        const pa = a.pos.get(u.id), pb = b.pos.get(u.id) || last.pos.get(u.id);
        if (!pb) continue;
        let x = pb.x, y = pb.y;
        if (pa && pb !== pa) { x = pa.x + (pb.x - pa.x) * k; y = pa.y + (pb.y - pa.y) * k; }
        x = this.mx(x);
        if (u === this.player) this.predict(u, x, y, last, dt);
        else { u.x = x; u.y = y; }
        if (u.moving) u.anim += dt * 2.5;
      }
      if (this.player.recallT > 0) this.player.recallT = Math.max(0, this.player.recallT - dt);
      for (let i = 0; i < 3; i++) this.player.skillCd[i] = Math.max(0, this.player.skillCd[i] - dt);
      this.player.spellCd = Math.max(0, this.player.spellCd - dt);
      for (const q of this.projs) {
        if (q.homing) {
          const dx = q.homing.x - q.x, dy = q.homing.y - q.y, L = Math.hypot(dx, dy), st = q.speed * dt;
          if (L > st) { q.x += dx / L * st; q.y += dy / L * st; q.ang = Math.atan2(dy, dx); }
        } else if (q.vx != null) { q.x += q.vx * q.speed * dt; q.y += q.vy * q.speed * dt; }
      }
      for (const z of this.zones) z.t = z.base + Math.max(0, rt - z.at);
      this.flushEvents(rt);
      this.updateFx(dt);
    }
    // Your own hero moves immediately from input and is eased toward the server's position.
    predict(p, sx, sy, last, dt) {
      const e = last.pos.get(p.id);
      const lx = e ? this.mx(e.x) : sx, ly = e ? e.y : sy;
      const d = p.wantDir, canMove = p.alive && p.stunT <= 0;
      if (d && canMove && Math.hypot(d.x, d.y) > 0.05) {
        const l = Math.hypot(d.x, d.y), sp = (p.ms || 300) * Math.min(1, l) * dt;
        p.x += d.x / l * sp; p.y += d.y / l * sp;
        p.face = { x: d.x / l, y: d.y / l }; p.moving = true;
        const err = Math.hypot(lx - p.x, ly - p.y);
        if (err > 140) { p.x = lx; p.y = ly; }
        else { p.x += (lx - p.x) * Math.min(1, dt * 2); p.y += (ly - p.y) * Math.min(1, dt * 2); }
      } else {
        p.x += (lx - p.x) * Math.min(1, dt * 12); p.y += (ly - p.y) * Math.min(1, dt * 12);
      }
      p.x = Math.max(40, Math.min(W.w - 40, p.x)); p.y = Math.max(60, Math.min(W.h - 60, p.y));
    }
    sendInput(dt) {
      const p = this.player, d = this.out(p.wantDir);
      const key = (d ? `${d.x.toFixed(2)},${d.y.toFixed(2)}` : '-') + (p.attackHeld ? 'A' : '');
      this.inputT -= dt;
      if (key !== this.lastInput || this.inputT <= 0) {
        this.lastInput = key; this.inputT = 0.25;
        this.net.send({ t: 'in', d: d ? { x: +d.x.toFixed(3), y: +d.y.toFixed(3) } : null, a: !!p.attackHeld });
      }
    }

    // ---- actions the HUD calls (the server decides; these give instant local feedback) ----
    castSkill(h, i, aim) {
      const s = h.def0.skills[i];
      if (!h.alive || h.stunT > 0 || h.skillCd[i] > 0) return 'cooldown';
      if (!h.ranks[i]) return i === 2 && h.level < 4 ? 'locked' : 'unranked';
      if (s.needsTarget) { aim = aim || this.resolveAim(h, i, null); if (!aim.target) return 'notarget'; }
      this.net.send({ t: 'cast', i, dir: aim ? this.out(aim.dir) : null, p: aim && aim.point ? this.outP(aim.point) : null, tg: aim && aim.target ? aim.target.id : null });
      h.skillCd[i] = Math.max(h.skillCd[i], 0.25);
      return true;
    }
    buy(h, id) {
      const it = SF.ITEMS[id];
      if (!it || h.items.length >= 6 || h.items.includes(id) || h.gold < it.cost) return false;
      this.net.send({ t: 'buy', id });
      h.gold -= it.cost; h.items = h.items.concat(id);
      return true;
    }
    useSpell(h, aim = {}) {
      if (!h.alive || h.spellCd > 0) return 'cooldown';
      if (h.stunT > 0 && h.spell !== 'purify') return 'stunned';
      const target = h.spell === 'smite' || h.spell === 'shatter' ? aim.target || this.spellTarget(h, h.spell) : null;
      if ((h.spell === 'smite' || h.spell === 'shatter') && !target) return 'notarget';
      this.net.send({ t: 'spell', d: this.out(aim.dir || h.face), tg: target ? target.id : null });
      h.spellCd = SF.SPELLS[h.spell].cd;
      this.emit('spell', h, h.spell);
      return true;
    }
    startRecall(h) { if (!h.alive) return; this.net.send({ t: 'recall' }); h.recallT = 3; }
    upgradeSkill(h, i) {
      if (!this.canUpgrade(h, i)) return false;
      this.net.send({ t: 'up', i });
      h.ranks = h.ranks.slice(); h.ranks[i]++; h.points--;   // shown at once; the next snapshot confirms
      return true;
    }
    signal(h, kind) {
      if (!SF.SIGNALS[kind] || this.t - (h.sigT == null ? -9 : h.sigT) < 1.5) return false;
      h.sigT = this.t;
      this.net.send({ t: 'signal', k: kind });
      return true;
    }
    end() { this.net.send({ t: 'surrender' }); }
  }
  // Local-only helpers come straight from the offline match so aiming and effects behave the same.
  for (const k of ['resolveAim', 'autoTarget', 'spellTarget', 'spellWouldKill', 'took', 'recap', 'rankCap', 'canUpgrade', 'autoUpgrade', 'visible', 'targetable', 'ring', 'slashFx', 'float', 'shake', 'beam', 'bolt', 'updateFx', 'inFountain']) {
    RemoteMatch.prototype[k] = SF.Match.prototype[k];
  }

  // ---------------------------------------------------------------------------
  let ws = null, url = '', cbs = {}, match = null, queuedMsg = null, welcome = null, outbox = [];
  const toWs = u => {
    let s = String(u).trim();
    if (/^https?:/i.test(s)) s = s.replace(/^http/i, 'ws');
    if (!/^wss?:/i.test(s)) s = 'wss://' + s;
    return /\/ws\/?$/.test(s) ? s : s.replace(/\/$/, '') + '/ws';
  };
  const toHttp = u => toWs(u).replace(/^ws/i, 'http').replace(/\/ws$/, '');

  function onMessage(ev) {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    switch (msg.t) {
      case 'welcome': welcome = msg; write(Object.assign(read(), { token: msg.token, pid: msg.pid })); if (queuedMsg) { SF.net.send(queuedMsg); queuedMsg = null; } break;
      case 'queued': if (cbs.onQueued) cbs.onQueued(msg); break;
      case 'match':
        if (match && match.roomId === msg.room) break; // reconnected: the snapshot stream simply resumes
        match = new RemoteMatch(msg, SF.net); if (cbs.onMatch) cbs.onMatch({ remote: match, info: msg });
        break;
      case 's': if (match) match.ingest(msg); break;
      case 'end': if (match) match.finish(msg); break;
      case 'error': if (cbs.onError) cbs.onError(new Error(msg.msg)); break;
    }
  }

  SF.RemoteMatch = RemoteMatch;
  SF.net = {
    get connected() { return !!ws && ws.readyState === 1; },
    get welcome() { return welcome; },
    connect(serverUrl) {
      const target = toWs(serverUrl || window.SF_SERVER_URL || '');
      if (ws && ws.readyState <= 1 && url === target) return;
      if (ws) try { ws.close(); } catch (e) { /* ignore */ }
      url = target; welcome = null;
      ws = new WebSocket(url);
      ws.onopen = () => { const st = read(); ws.send(JSON.stringify({ t: 'hello', token: st.token || null, name: SF.store && SF.store.d ? SF.store.d.name : undefined })); outbox.splice(0).forEach(m => ws.send(m)); };
      ws.onmessage = onMessage;
      ws.onerror = () => { if (cbs.onError && !match) cbs.onError(new Error('Could not reach the game server at ' + url)); };
      ws.onclose = () => { if (match && !match.over) setTimeout(() => { if (match && !match.over) SF.net.connect(url); }, 1500); };
    },
    send(obj) {
      const s = JSON.stringify(obj);
      if (ws && ws.readyState === 1) ws.send(s); else if (outbox.length < 50) outbox.push(s);
    },
    queue(opts, callbacks) {
      cbs = callbacks || {}; match = null;
      const msg = { t: 'queue', mode: opts.mode || 'quick', heroId: opts.heroId, skinId: opts.skinId, spell: opts.spell, name: opts.name };
      if (welcome) SF.net.send(msg); else queuedMsg = msg;
    },
    cancel() { queuedMsg = null; SF.net.send({ t: 'cancel' }); },
    close() { match = null; cbs = {}; if (ws) { try { ws.close(); } catch (e) { /* ignore */ } } ws = null; welcome = null; },

    // ---- HTTP API: accounts and cloud save ----
    async login(baseUrl, deviceId) {
      const st = read();
      const id = deviceId || st.device || (st.device = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)));
      const r = await fetch(toHttp(baseUrl) + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: id, name: SF.store && SF.store.d ? SF.store.d.name : undefined }) });
      if (!r.ok) throw new Error('Sign-in failed');
      const j = await r.json();
      write(Object.assign(st, { device: id, token: j.token, pid: j.pid, base: toHttp(baseUrl) }));
      return j;
    },
    async loadSave() {
      const st = read(); if (!st.token) throw new Error('Not signed in');
      const r = await fetch(st.base + '/api/save', { headers: { Authorization: 'Bearer ' + st.token } });
      if (!r.ok) throw new Error('Could not load the cloud save');
      return r.json();
    },
    async pushSave(data) {
      const st = read(); if (!st.token) throw new Error('Not signed in');
      const r = await fetch(st.base + '/api/save', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.token }, body: JSON.stringify({ save: data }) });
      if (!r.ok) throw new Error('Could not upload the save');
      return r.json();
    },
    async deleteAccount() {
      const st = read();
      if (st.token && st.base) await fetch(st.base + '/api/account', { method: 'DELETE', headers: { Authorization: 'Bearer ' + st.token } }).catch(() => {});
      write({});
    },
    async leaderboard(baseUrl) {
      const r = await fetch(toHttp(baseUrl) + '/api/leaderboard');
      return r.ok ? r.json() : { top: [] };
    }
  };
})(window.SF);

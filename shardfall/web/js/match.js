/* Match simulation: units, combat, skills, objectives and bot AI. No rendering here. */
(function (SF) {
  const W = SF.WORLD;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  const dist = (a, b) => Math.sqrt(d2(a, b));
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
  SF.util = { clamp, d2, dist, norm };

  const isStructure = u => u.kind === 'tower' || u.kind === 'core';
  const MAX_LEVEL = 12;
  const xpNeed = l => 140 + 90 * (l - 1);

  const MINION = {
    melee:  { r: 16, hp: 460,  atk: 22, def: 10, ms: 255, range: 60,  as: 0.8, gold: 30, xp: 55 },
    ranged: { r: 14, hp: 300,  atk: 34, def: 5,  ms: 255, range: 300, as: 0.7, gold: 40, xp: 45 },
    siege:  { r: 22, hp: 950,  atk: 60, def: 30, ms: 230, range: 330, as: 0.5, gold: 70, xp: 90, siege: true },
    golem:  { r: 30, hp: 1800, atk: 90, def: 50, ms: 240, range: 90,  as: 0.6, gold: 90, xp: 120, siege: true }
  };

  let UID = 1;
  class Unit {
    constructor(m, o) {
      this.m = m; this.id = UID++;
      this.r = 20; this.team = 0; this.kind = 'minion';
      this.maxHp = 100; this.atk = 10; this.power = 0; this.def = 0; this.ms = 250; this.range = 80; this.as = 1;
      this.regen = 0; this.lifesteal = 0; this.cdr = 0;
      this.alive = true; this.atkCd = 0; this.lockT = 0; this.target = null; this.want = null; this.wantDir = null;
      this.face = { x: 1, y: 0 }; this.vx = 0; this.vy = 0;
      this.slowT = 0; this.slowAmt = 0; this.stunT = 0; this.shield = 0; this.shieldT = 0;
      this.buffs = []; this.flash = 0; this.dash = null; this.knock = null; this.anim = Math.random() * 10; this.deadT = 0;
      Object.assign(this, o);
      this.hp = o.hp != null ? o.hp : this.maxHp;
    }
    get hpPct() { return this.hp / this.maxHp; }
    bv(key) { let s = 0; for (const b of this.buffs) if (b[key]) s += b[key]; return s; }
    speed() {
      if (this.stunT > 0) return 0;
      let s = this.ms * (1 + this.bv('msMul'));
      if (this.slowT > 0) s *= 1 - this.slowAmt;
      return s;
    }
    atkSpeed() { return Math.min(2.5, this.as * (1 + this.bv('asMul'))); }
    dmgMul() { return 1 + this.bv('dmgMul'); }
    hasBuff(id) { return this.buffs.some(b => b.id === id); }
    addBuff(b) { const i = this.buffs.findIndex(x => x.id === b.id); if (i >= 0) this.buffs[i] = b; else this.buffs.push(b); }
    removeBuff(id) { this.buffs = this.buffs.filter(b => b.id !== id); }
  }

  class Hero extends Unit {
    constructor(m, def, o) {
      super(m, Object.assign({ kind: 'hero', r: 24, maxHp: 1 }, o));
      this.def0 = def; this.level = 1; this.xp = 0; this.gold = 300; this.goldEarned = 0; this.items = [];
      this.skillCd = [0, 0, 0]; this.k = 0; this.dth = 0; this.ast = 0; this.towers = 0;
      this.streak = 0; this.multiN = 0; this.multiT = 0; this.respawnT = 0; this.recallT = 0; this.flashCd = 0;
      this.hitBy = new Map(); this.dmgDealt = 0; this.aggroT = -9; this.revealT = -9; this.invisT = 0;
      this.vis = [true, true, true]; this.bush = -1;
      this.maxHp = 0; this.recalc(); this.hp = this.maxHp;
      this.spawn = { x: o.x, y: o.y };
    }
    recalc() {
      const b = this.def0.base, g = this.def0.grow, lv = this.level - 1;
      const add = { hp: 0, atk: 0, power: 0, def: 0, ms: 0, as: 0, regen: 0, lifesteal: 0, cdr: 0 };
      for (const id of this.items) { const s = SF.ITEMS[id].stats; for (const k in s) add[k] += s[k]; }
      const newMax = b.hp + g.hp * lv + add.hp;
      if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
      this.maxHp = newMax; this.hp = Math.min(this.hp, newMax);
      this.atk = b.atk + g.atk * lv + add.atk;
      this.power = b.power + (g.power || 0) * lv + add.power;
      this.def = b.def + g.def * lv + add.def;
      this.ms = b.ms + add.ms;
      this.range = b.range;
      this.as = b.as * (1 + 0.025 * lv + add.as);
      this.regen = b.regen + lv * 0.6 + add.regen;
      this.lifesteal = add.lifesteal;
      this.cdr = Math.min(0.4, add.cdr);
    }
    nextItem() { return this.items.length >= 6 ? null : this.def0.build.find(id => !this.items.includes(id)) || null; }
    get xpNeed() { return xpNeed(this.level); }
  }

  // ---------------------------------------------------------------------------
  // Skills. Each returns true when cast, false when it had nothing to hit.
  // ---------------------------------------------------------------------------
  const skinC = h => (SF.SKIN[h.skin] || {}).c1 || '#fff';
  const SK = {
    flare_step(m, h, a, s) {
      m.dashTo(h, a.dir, s.range, 1500, { trail: skinC(h), onPass: e => m.applyDamage(h, e, 70 + 0.9 * h.atk, { skill: true }) });
      return true;
    },
    cinder_whirl(m, h, a, s) {
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) { m.applyDamage(h, e, 90 + 1.0 * h.atk, { skill: true }); m.slow(e, 0.3, 1.5); }
      m.ring(h.x, h.y, s.range, skinC(h), 0.35, 6); m.burst(h.x, h.y, '#ffb347', 18, 260);
      return true;
    },
    phoenix_verdict(m, h, a, s) {
      const t = a.target; if (!t || t.kind !== 'hero') return false;
      const dir = norm(t.x - h.x, t.y - h.y);
      m.dashTo(h, dir, Math.max(0, dist(h, t) - (h.r + t.r)), 1900, { trail: '#ffb347', onEnd: () => {
        if (!t.alive) return;
        m.applyDamage(h, t, 170 + 1.2 * h.atk + 0.22 * (t.maxHp - t.hp), { skill: true });
        m.ring(t.x, t.y, 130, '#ffb347', 0.4, 8); m.burst(t.x, t.y, '#ffd29a', 26, 320); m.shake(7);
        if (!t.alive) h.skillCd[2] *= 0.2;
      } });
      return true;
    },
    riptide_bolt(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 950, r: 16, max: s.range, color: skinC(h), kind: 'orb', onHit: e => { m.applyDamage(h, e, 110 + 0.75 * h.power, { skill: true }); m.slow(e, 0.35, 1.5); m.burst(e.x, e.y, skinC(h), 10, 160); } });
      return true;
    },
    whirlpool(m, h, a, s) {
      const p = a.point;
      m.zone({ x: p.x, y: p.y, r: 130, team: h.team, delay: 0.7, dur: 0.4, color: skinC(h), kind: 'whirl', onStart: z => {
        for (const e of m.enemiesIn(h.team, z.x, z.y, z.r)) { m.applyDamage(h, e, 150 + 0.9 * h.power, { skill: true }); m.stun(e, 0.8); }
        m.ring(z.x, z.y, z.r, skinC(h), 0.4, 6); m.shake(3);
      } });
      return true;
    },
    leviathan_surge(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 760, r: 62, max: s.range, pierce: true, color: skinC(h), kind: 'wave', onHit: e => {
        m.applyDamage(h, e, 280 + 1.3 * h.power, { skill: true }); m.knockback(e, a.dir, 150);
      } });
      m.shake(4);
      return true;
    },
    piercing_gale(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 1450, r: 14, max: s.range, pierce: true, color: skinC(h), kind: 'arrow', onHit: e => m.applyDamage(h, e, 90 + 1.1 * h.atk, { skill: true }) });
      return true;
    },
    tailwind(m, h) {
      h.addBuff({ id: 'tailwind', t: 4, msMul: 0.35, asMul: 0.6 });
      m.ring(h.x, h.y, 70, skinC(h), 0.3, 4);
      return true;
    },
    storm_volley(m, h, a, s) {
      const base = Math.atan2(a.dir.y, a.dir.x);
      for (let i = -3; i <= 3; i++) {
        const ang = base + i * 0.13;
        m.shoot(h, { x: Math.cos(ang), y: Math.sin(ang) }, { speed: 1250, r: 12, max: s.range, color: skinC(h), kind: 'arrow', onHit: e => m.applyDamage(h, e, 70 + 0.6 * h.atk, { skill: true }) });
      }
      return true;
    },
    boulder_charge(m, h, a, s) {
      m.dashTo(h, a.dir, s.range, 1150, { stopOnHero: true, trail: '#d8c7a0', onPass: e => {
        m.applyDamage(h, e, 80 + 0.06 * h.maxHp, { skill: true });
        if (e.kind === 'hero') { m.stun(e, 1.0); m.shake(4); }
      } });
      return true;
    },
    quake(m, h, a, s) {
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) { m.applyDamage(h, e, 70 + 0.05 * h.maxHp, { skill: true }); m.slow(e, 0.4, 2); }
      m.ring(h.x, h.y, s.range, '#e3d27a', 0.45, 8); m.shake(4);
      return true;
    },
    granite_bulwark(m, h, a, s) {
      const amt = 250 + 0.25 * h.maxHp;
      m.shieldUnit(h, amt, 5);
      for (const al of m.heroes) if (al !== h && al.alive && al.team === h.team && d2(al, h) < 420 * 420) m.shieldUnit(al, amt * 0.5, 5);
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) { m.stun(e, 0.7); m.applyDamage(h, e, 100 + 0.04 * h.maxHp, { skill: true }); }
      m.ring(h.x, h.y, s.range, '#e3d27a', 0.5, 10); m.ring(h.x, h.y, 420, '#e3d27a', 0.6, 2); m.shake(6);
      return true;
    },
    shadow_lunge(m, h, a, s) {
      const t = a.target; if (!t) return false;
      const dir = norm(t.x - h.x, t.y - h.y);
      m.burst(h.x, h.y, '#6b4bd6', 12, 140);
      h.x = clamp(t.x + dir.x * (t.r + h.r + 6), 40, W.w - 40); h.y = clamp(t.y + dir.y * (t.r + h.r + 6), 60, W.h - 60);
      h.face = { x: -dir.x, y: -dir.y };
      m.applyDamage(h, t, 80 + 1.0 * h.atk, { skill: true });
      m.burst(h.x, h.y, skinC(h), 14, 180);
      h.target = t;
      return true;
    },
    veil(m, h) {
      h.invisT = 3; h.addBuff({ id: 'veil', t: 3, msMul: 0.3 }); h.addBuff({ id: 'veilstrike', t: 6 });
      m.burst(h.x, h.y, '#6b4bd6', 20, 160);
      if (h.brain) h.target = null;
      return true;
    },
    eclipse(m, h, a, s) {
      const t = a.target; if (!t || t.kind !== 'hero') return false;
      const dir = norm(t.x - h.x, t.y - h.y);
      h.x = clamp(t.x - dir.x * (t.r + h.r + 4), 40, W.w - 40); h.y = clamp(t.y - dir.y * (t.r + h.r + 4), 60, W.h - 60);
      h.stunImmune = 0.7;
      for (let i = 0; i < 3; i++) {
        m.later(i * 0.2, () => {
          if (!t.alive || !h.alive) return;
          const extra = i === 2 ? 0.25 * (t.maxHp - t.hp) : 0;
          m.applyDamage(h, t, 70 + 0.7 * h.atk + extra, { skill: true });
          m.slashFx(t.x, t.y, Math.random() * 6.28, skinC(h)); if (i === 2) { m.shake(6); m.burst(t.x, t.y, skinC(h), 24, 280); }
        });
      }
      return true;
    },
    radiant_orb(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 1000, r: 16, max: s.range, color: skinC(h), kind: 'orb', onHit: e => { m.applyDamage(h, e, 100 + 0.7 * h.power, { skill: true }); m.slow(e, 0.2, 1); } });
      return true;
    },
    mending_light(m, h, a, s) {
      for (const al of m.heroes) if (al.alive && al.team === h.team && d2(al, h) < s.range * s.range) {
        m.heal(al, 120 + 0.8 * h.power + 0.05 * al.maxHp); m.burst(al.x, al.y, '#9dffb0', 10, 120);
      }
      m.ring(h.x, h.y, s.range, '#9dffb0', 0.5, 3);
      return true;
    },
    sanctuary(m, h, a, s) {
      const p = a.point;
      m.zone({ x: p.x, y: p.y, r: 220, team: h.team, dur: 4, color: skinC(h), kind: 'sanct', tick: (dt) => {
        for (const al of m.heroes) if (al.alive && al.team === h.team && d2(al, p) < 220 * 220) { m.heal(al, (50 + 0.3 * h.power) * dt, true); al.addBuff({ id: 'sanct', t: 0.3, dmgRed: 0.25 }); }
        for (const e of m.enemiesIn(h.team, p.x, p.y, 220)) m.slow(e, 0.3, 0.3);
      } });
      return true;
    }
  };

  // ---------------------------------------------------------------------------
  class Match {
    constructor(opts) {
      this.opts = opts;
      this.t = 0; this.units = []; this.heroes = []; this.projs = []; this.fx = []; this.parts = []; this.floats = []; this.zones = [];
      this.feed = []; this.later_ = []; this.listeners = {};
      this.kills = [0, 0]; this.over = false; this.winner = -1;
      this.nextWave = 4; this.waveN = 0; this.firstBlood = false;
      this.shard = null; this.shardAt = 90; this.shardSpawnedT = 0; this.siegeBonus = [0, 0];
      this.overcharged = false; this.shakeT = 0; this.shakeMag = 0;
      this.teamStats = [{ towers: 0, shards: 0 }, { towers: 0, shards: 0 }];
      this.fountains = [{ x: 110, y: W.laneY, r: 230 }, { x: W.w - 110, y: W.laneY, r: 230 }];
      this.setupMap();
      this.setupHeroes();
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }
    add(u) { this.units.push(u); return u; }
    later(delay, fn) { this.later_.push({ at: this.t + delay, fn }); }

    setupMap() {
      const L = W.laneY;
      this.towers = [[], []]; this.cores = [];
      for (const team of [0, 1]) {
        const X = x => (team === 0 ? x : W.w - x);
        const core = this.add(new Unit(this, { kind: 'core', team, x: X(340), y: L, r: 64, maxHp: 7000, atk: 240, def: 60, range: 440, as: 0.9, name: 'Heartstone' }));
        const inner = this.add(new Unit(this, { kind: 'tower', team, x: X(780), y: L, r: 42, maxHp: 5000, atk: 190, def: 60, range: 410, as: 0.9, name: 'Inner Spire' }));
        const outer = this.add(new Unit(this, { kind: 'tower', team, x: X(1200), y: L, r: 42, maxHp: 4500, atk: 175, def: 60, range: 410, as: 0.9, name: 'Outer Spire' }));
        inner.guard = outer; core.guard = inner;
        [core, inner, outer].forEach(s => { s.heat = 0; });
        this.towers[team] = [outer, inner]; this.cores[team] = core;
      }
      this.camps = [
        { type: 'wisp', x: 1000, y: 270 }, { type: 'thorn', x: 1000, y: 930 },
        { type: 'wisp', x: 2200, y: 930 }, { type: 'thorn', x: 2200, y: 270 }
      ].map(c => Object.assign(c, { unit: null, respawnAt: 20 }));
      this.bushes = [
        { x: 1360, y: 452, rx: 120, ry: 46 }, { x: 1840, y: 748, rx: 120, ry: 46 },
        { x: 820, y: 820, rx: 92, ry: 66 }, { x: 2380, y: 380, rx: 92, ry: 66 },
        { x: 1600, y: 905, rx: 110, ry: 60 }, { x: 1425, y: 300, rx: 78, ry: 58 }, { x: 1775, y: 300, rx: 78, ry: 58 }
      ];
    }

    // Two ways to build a match:
    //  - single player: opts.hero/skin + opts.allies + opts.enemies (the local player is always blue, slot 1)
    //  - roster (online / server): opts.roster = [[spec...], [spec...]] with spec { id, skin, name, human, pid, difficulty }
    //    and opts.localPid naming which human (if any) is the local player.
    setupHeroes() {
      const o = this.opts;
      const mk = (spec, team, slot, human) => {
        const def = SF.HERO[spec.id];
        const f = this.fountains[team];
        const h = new Hero(this, def, { team, x: f.x + (team === 0 ? 70 : -70), y: W.laneY + (slot - 1) * 70, skin: spec.skin || SF.defaultSkin(spec.id), name: spec.name, human, pid: spec.pid, isPlayer: false });
        if (!human || o.autoplay) h.brain = new Brain(this, h, spec.difficulty || (o.roster || team === 0 ? 'normal' : o.difficulty));
        if (!human && team === 1 && !o.roster) h.botDmg = SF.DIFFICULTY[o.difficulty].dmg;
        this.add(h); this.heroes.push(h);
        return h;
      };
      if (o.roster) {
        o.roster.forEach((list, team) => list.forEach((spec, i) => mk(spec, team, i, !!spec.human)));
        this.player = this.heroes.find(h => h.human && h.pid != null && h.pid === o.localPid) || null;
      } else {
        this.player = mk({ id: o.hero, skin: o.skin, name: o.playerName || 'You' }, 0, 1, true);
        o.allies.forEach((s, i) => mk(s, 0, i === 0 ? 0 : 2, false));
        o.enemies.forEach((s, i) => mk(s, 1, i, false));
      }
      if (this.player) this.player.isPlayer = true;
      for (const team of [0, 1]) {
        const bots = this.heroes.filter(h => h.team === team && h.brain && !h.human);
        const j = bots.find(b => b.def0.role === 'Assassin' || b.def0.role === 'Fighter') || (team === 1 ? bots[0] : null);
        if (j) j.brain.jungler = true;
      }
    }

    // ---- main loop ----------------------------------------------------------
    update(dt) {
      dt = Math.min(dt, 0.05);
      this.updateFx(dt);
      if (this.over) return;
      this.t += dt;
      this.timers(dt);
      for (const h of this.heroes) this.heroTick(h, dt);
      this.updateVisibility();
      this.playerControl(dt);
      for (const h of this.heroes) if (h.alive && h.brain) h.brain.think(dt);
      for (const u of this.units) {
        if (!u.alive) continue;
        this.statusTick(u, dt);
        if (u.kind === 'minion') this.minionAI(u, dt);
        else if (isStructure(u)) this.towerAI(u, dt);
        else if (u.kind === 'monster') this.monsterAI(u, dt);
      }
      for (const u of this.units) if (u.alive) this.combat(u, dt);
      for (const u of this.units) if (u.alive) this.move(u, dt);
      this.separate();
      this.updateProjs(dt);
      this.updateZones(dt);
      this.fountainTick(dt);
      this.units = this.units.filter(u => u.alive || u.kind === 'hero' || isStructure(u) || (u.deadT += dt) < 0.6);
      if (this.t > 900 && !this.over) this.timeoutEnd();
    }

    timers(dt) {
      if (this.t >= this.nextWave) { this.spawnWave(); this.nextWave += 30; }
      for (const c of this.camps) if (!c.unit && this.t >= c.respawnAt) this.spawnCamp(c);
      if (!this.shard && this.t >= this.shardAt) this.spawnShard();
      if (!this.overcharged && this.t >= 480) { this.overcharged = true; this.announce('Shards Overcharged', 2, 'Minions are empowered'); }
      for (const h of this.heroes) { this.addGold(h, 3.2 * dt, true); if (h.alive) this.giveXp(h, 2 * dt); }
      if (this.later_.length) {
        const due = this.later_.filter(l => l.at <= this.t);
        this.later_ = this.later_.filter(l => l.at > this.t);
        due.forEach(l => l.fn());
      }
    }

    addGold(h, n, passive) { h.gold += n; h.goldEarned += n; if (!passive && h === this.player) this.emit('gold', n); }

    giveXp(h, n) {
      if (h.level >= MAX_LEVEL) return;
      h.xp += n;
      while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) {
        h.xp -= xpNeed(h.level); h.level++; h.recalc();
        this.emit('levelup', h);
        if (h === this.player || h.team === 0) this.ring(h.x, h.y, 60, '#ffe27a', 0.5, 3);
      }
    }

    heroTick(h, dt) {
      if (!h.alive) {
        h.respawnT -= dt;
        if (h.respawnT <= 0) this.respawn(h);
        return;
      }
      for (let i = 0; i < 3; i++) h.skillCd[i] = Math.max(0, h.skillCd[i] - dt);
      h.flashCd = Math.max(0, h.flashCd - dt);
      h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);
      if (h.multiT > 0) { h.multiT -= dt; if (h.multiT <= 0) h.multiN = 0; }
      if (h.invisT > 0) h.invisT -= dt;
      if (h.stunImmune > 0) h.stunImmune -= dt;
      if (h.recallT > 0) {
        h.recallT -= dt;
        if (h.recallT <= 0) {
          h.recallT = 0; h.x = h.spawn.x; h.y = h.spawn.y; h.want = null; h.target = null;
          this.ring(h.x, h.y, 80, SF.TEAM_COLORS[h.team], 0.5, 4);
        }
      }
    }

    respawn(h) {
      h.alive = true; h.hp = h.maxHp; h.x = h.spawn.x; h.y = h.spawn.y;
      h.buffs = []; h.dash = null; h.knock = null; h.target = null; h.want = null; h.shield = 0;
      this.emit('respawn', h);
    }

    statusTick(u, dt) {
      if (u.atkCd > 0) u.atkCd -= dt;
      if (u.slowT > 0) u.slowT -= dt;
      if (u.stunT > 0) u.stunT -= dt;
      if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
      if (u.flash > 0) u.flash -= dt;
      if (u.buffs.length) {
        for (const b of u.buffs) b.t -= dt;
        u.buffs = u.buffs.filter(b => b.t > 0);
      }
    }

    // ---- spawning -----------------------------------------------------------
    spawnWave() {
      this.waveN++;
      const mins = this.t / 60, sc = (1 + 0.045 * mins) * (this.overcharged ? 1.4 : 1);
      for (const team of [0, 1]) {
        const core = this.cores[team]; if (!core.alive) continue;
        const dir = team === 0 ? 1 : -1;
        const list = ['melee', 'melee', 'melee', 'ranged', 'ranged'];
        if (this.waveN % 3 === 0) list.push('siege');
        if (this.siegeBonus[team] > 0) { list.push('golem'); this.siegeBonus[team]--; }
        list.forEach((type, i) => {
          const T = MINION[type];
          this.add(new Unit(this, {
            kind: 'minion', mtype: type, team, x: core.x + dir * (90 - i * 24), y: W.laneY + ((i % 3) - 1) * 26,
            r: T.r, maxHp: T.hp * sc, atk: T.atk * sc, def: T.def, ms: T.ms, range: T.range, as: T.as,
            gold: Math.round(T.gold + mins), xp: T.xp, siege: !!T.siege, yo: (Math.random() - 0.5) * 90, think: Math.random() * 0.3
          }));
        });
      }
    }

    spawnCamp(c) {
      const s = 1 + 0.08 * (this.t / 60);
      const T = c.type === 'wisp'
        ? { name: 'Ember Wisp', maxHp: 1100 * s, atk: 38 * s, r: 26, def: 20, range: 130, as: 0.8, gold: 100, xp: 110 }
        : { name: 'Thornback', maxHp: 1500 * s, atk: 46 * s, r: 32, def: 30, range: 110, as: 0.7, gold: 130, xp: 140 };
      c.unit = this.add(new Unit(this, Object.assign({ kind: 'monster', mtype: c.type, team: 2, x: c.x, y: c.y, ms: 290, home: { x: c.x, y: c.y }, camp: c }, T)));
    }

    spawnShard() {
      const mins = this.t / 60;
      this.shard = this.add(new Unit(this, {
        kind: 'monster', mtype: 'colossus', team: 2, x: W.riverX, y: 230, home: { x: W.riverX, y: 230 },
        name: 'Shard Colossus', maxHp: 4200 + 180 * mins, atk: 95 + 6 * mins, r: 56, def: 40, range: 160, as: 0.6, ms: 200, slamCd: 4
      }));
      this.shardSpawnedT = this.t;
      this.announce('The Shard Colossus awakens', 2, 'Defeat it to empower your team');
    }

    // ---- visibility (bushes, invisibility) ---------------------------------
    bushAt(u) {
      for (let i = 0; i < this.bushes.length; i++) {
        const b = this.bushes[i], dx = (u.x - b.x) / b.rx, dy = (u.y - b.y) / b.ry;
        if (dx * dx + dy * dy <= 1) return i;
      }
      return -1;
    }
    updateVisibility() {
      for (const h of this.heroes) h.bush = h.alive ? this.bushAt(h) : -1;
      for (const h of this.heroes) {
        if (!h.alive) continue;
        for (const team of [0, 1]) {
          if (team === h.team) { h.vis[team] = true; continue; }
          const invis = h.invisT > 0;
          let v = h.bush < 0 && !invis;
          if (!v && !invis && h.revealT > this.t) v = true;
          if (!v) {
            const R = invis ? 130 : 190;
            for (const o of this.units) {
              if (!o.alive || o.team !== team) continue;
              if (o.kind !== 'hero' && o.kind !== 'minion' && !isStructure(o)) continue;
              const rr = isStructure(o) ? Math.min(o.range, 260) : R;
              if (d2(o, h) < rr * rr || (!invis && o.kind === 'hero' && o.bush === h.bush)) { v = true; break; }
            }
          }
          h.vis[team] = v;
        }
        h.vis[2] = !(h.invisT > 0);
      }
    }
    visible(u, team) {
      if (u.team === team || u.kind !== 'hero') return true;
      return !!u.vis[team];
    }
    targetable(u) { return !isStructure(u) || !u.guard || !u.guard.alive; }
    valid(u, t) { return !!t && t.alive && t.team !== u.team && this.targetable(t) && this.visible(t, u.team); }

    // ---- AI for minions, towers, monsters -----------------------------------
    minionAI(u, dt) {
      u.think -= dt;
      const t = u.target;
      const bad = !this.valid(u, t) || d2(u, t) > 520 * 520 || (t.kind === 'hero' && Math.abs(t.y - W.laneY) > 320);
      if (bad || u.think <= 0) {
        u.think = 0.4;
        if (bad) u.target = null;
        if (!u.target || u.target.kind !== 'minion') u.target = this.acquire(u, 330);
      }
      if (!u.target) {
        const ec = this.cores[1 - u.team];
        u.want = { x: ec.x, y: W.laneY + u.yo };
      }
    }
    acquire(u, R) {
      let best = null, bs = 1e18, bt = 9;
      const foe = 1 - u.team;
      for (const o of this.units) {
        if (!o.alive || o.team !== foe || !this.targetable(o) || !this.visible(o, u.team)) continue;
        const dd = d2(o, u), rr = R + o.r;
        if (dd > rr * rr) continue;
        const tier = o.kind === 'minion' ? 0 : isStructure(o) ? 1 : 2;
        if (tier < bt || (tier === bt && dd < bs)) { bt = tier; bs = dd; best = o; }
      }
      return best;
    }
    towerAI(u, dt) {
      u.think = (u.think || 0) - dt;
      if (u.think > 0) return;
      u.think = 0.25;
      const R = u.range + 8;
      let pri = null;
      for (const h of this.heroes) {
        if (h.alive && h.team !== u.team && h.aggroT > this.t - 2 && d2(h, u) < (R + h.r) * (R + h.r)) { pri = h; break; }
      }
      if (pri) { u.target = pri; return; }
      if (this.valid(u, u.target) && d2(u, u.target) < (R + u.target.r) ** 2) return;
      let best = null, bs = 1e18, bt = 9;
      for (const o of this.units) {
        if (!o.alive || o.team !== 1 - u.team || isStructure(o)) continue;
        const dd = d2(o, u); if (dd > (R + o.r) ** 2) continue;
        if (o.kind === 'hero' && !this.visible(o, u.team)) continue;
        const tier = o.kind === 'minion' ? 0 : 1;
        if (tier < bt || (tier === bt && dd < bs)) { bt = tier; bs = dd; best = o; }
      }
      u.target = best;
    }
    monsterAI(u, dt) {
      const home = u.home;
      if (u.aggro && (!u.aggro.alive || d2(u, home) > 480 * 480 || (u.aggro.kind === 'hero' && !this.visible(u.aggro, 2)))) { u.aggro = null; u.resetting = true; }
      if (u.resetting) {
        u.target = null; u.want = home; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3 * dt);
        if (d2(u, home) < 30 * 30) { u.resetting = false; u.want = null; }
        return;
      }
      if (u.aggro) u.target = u.aggro;
      else { u.target = null; u.want = d2(u, home) > 20 * 20 ? home : null; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt); }
      if (u.mtype === 'colossus' && u.aggro) {
        u.slamCd -= dt;
        if (u.slamCd <= 0) {
          u.slamCd = 5;
          for (const h of this.heroes) if (h.alive && d2(h, u) < 230 * 230) this.applyDamage(u, h, 110 + 0.03 * h.maxHp);
          this.ring(u.x, u.y, 230, '#8ff7ff', 0.5, 8); this.shake(5);
        }
      }
    }

    // ---- player control -----------------------------------------------------
    // Applies human input (wantDir / attackHeld set by the HUD or by the network) for every human hero.
    playerControl(dt) {
      for (const p of this.heroes) if (p.human && !p.brain && p.alive) this.humanControl(p, dt);
    }
    humanControl(p, dt) {
      if (p.wantDir) { p.want = null; if (p.recallT > 0) p.recallT = 0; }
      if (p.attackHeld) {
        p.retarget = (p.retarget || 0) - dt;
        if (!this.valid(p, p.target) || p.retarget <= 0) { p.target = this.pickAttackTarget(p) || (this.valid(p, p.target) ? p.target : null); p.retarget = 0.3; }
      } else if (p.wantDir) {
        p.target = null;
      } else if (p.target && (!this.valid(p, p.target) || d2(p, p.target) > (p.range + p.r + p.target.r + 30) ** 2)) {
        p.target = null;
      }
      if (!p.attackHeld && !p.target) p.want = null;
    }
    pickAttackTarget(h) {
      const hero = this.autoTarget(h, h.range + 170, true);
      if (hero) return hero;
      let best = null, bs = 1e9;
      for (const u of this.units) {
        if (!u.alive || u.team === h.team || u.kind === 'hero' || !this.targetable(u)) continue;
        const D = dist(u, h) - u.r - h.r;
        if (D > h.range + 90) continue;
        const sc = (u.kind === 'minion' ? u.hp : u.kind === 'monster' ? 3000 + u.hp : 9000) + D;
        if (sc < bs) { bs = sc; best = u; }
      }
      return best;
    }
    autoTarget(h, range, heroOnly) {
      let best = null, bs = 1e9;
      for (const u of this.heroes) {
        if (!u.alive || u.team === h.team || !this.visible(u, h.team)) continue;
        const D = dist(u, h) - u.r;
        if (D > range) continue;
        const sc = D + u.hpPct * 160;
        if (sc < bs) { bs = sc; best = u; }
      }
      if (best || heroOnly) return best;
      for (const u of this.units) {
        if (!u.alive || u.team === h.team || u.kind === 'hero' || isStructure(u)) continue;
        const D = dist(u, h) - u.r;
        if (D > range) continue;
        if (D < bs) { bs = D; best = u; }
      }
      return best;
    }
    resolveAim(h, i, manual) {
      const s = h.def0.skills[i];
      const range = s.range || 200;
      let target = null, dir, point = null;
      if (manual) {
        dir = norm(manual.x, manual.y);
        if (s.ground) { const k = clamp(manual.len, 0.15, 1); point = { x: h.x + dir.x * range * k, y: h.y + dir.y * range * k }; }
        if (s.needsTarget) {
          let bs = 1e9;
          for (const u of this.units) {
            if (!u.alive || u.team === h.team || isStructure(u) || !this.visible(u, h.team)) continue;
            if (!s.anyTarget && u.kind !== 'hero') continue;
            const dx = u.x - h.x, dy = u.y - h.y, D = Math.hypot(dx, dy) || 1;
            if (D > range + u.r) continue;
            const cos = (dx * dir.x + dy * dir.y) / D;
            if (cos < 0.75) continue;
            const sc = D * (2 - cos) - (u.kind === 'hero' ? 200 : 0);
            if (sc < bs) { bs = sc; target = u; }
          }
        }
      } else {
        target = this.autoTarget(h, range * 1.05 + 20, s.needsTarget && !s.anyTarget);
        dir = target ? norm(target.x - h.x, target.y - h.y) : { x: h.face.x, y: h.face.y };
        if (s.ground) {
          if (s.ai === 'fight') point = { x: h.x, y: h.y };
          else point = target ? { x: target.x, y: target.y } : { x: h.x + dir.x * range * 0.6, y: h.y + dir.y * range * 0.6 };
        }
      }
      if (point) {
        const D = dist(point, h);
        if (D > range) point = { x: h.x + (point.x - h.x) / D * range, y: h.y + (point.y - h.y) / D * range };
      }
      return { dir, point, target };
    }
    castSkill(h, i, aim) {
      const s = h.def0.skills[i];
      if (!h.alive || h.stunT > 0 || h.dash || h.skillCd[i] > 0) return 'cooldown';
      if (i === 2 && h.level < 4) return 'locked';
      aim = aim || this.resolveAim(h, i, null);
      if (s.needsTarget && !aim.target) return 'notarget';
      if (s.needsTarget && dist(aim.target, h) > s.range + aim.target.r + 10) return 'notarget';
      h.recallT = 0;
      if (h.invisT > 0 && s.id !== 'veil') h.invisT = 0;
      if (!SK[s.id](this, h, aim, s)) return 'notarget';
      h.skillCd[i] = s.cd * (1 - h.cdr);
      if (s.id !== 'veil') h.revealT = this.t + 1;
      if (aim.dir && !h.dash) h.face = { x: aim.dir.x, y: aim.dir.y };
      h.lockT = Math.max(h.lockT, 0.1);
      this.emit('cast', h, s);
      return true;
    }
    buy(h, id) {
      const it = SF.ITEMS[id];
      if (!h || !it || h.items.length >= 6 || h.items.includes(id) || h.gold < it.cost) return false;
      h.gold -= it.cost; h.items.push(id); h.recalc();
      this.emit('buy', h, id);
      return true;
    }
    flash(h, dir) {
      if (!h.alive || h.flashCd > 0 || h.stunT > 0) return false;
      const d = norm(dir.x, dir.y);
      this.burst(h.x, h.y, '#fff7c2', 12, 160);
      h.x = clamp(h.x + d.x * 250, 40, W.w - 40); h.y = clamp(h.y + d.y * 250, 60, W.h - 60);
      h.face = d; h.flashCd = 90; h.recallT = 0; h.dash = null;
      this.burst(h.x, h.y, '#fff7c2', 12, 160);
      return true;
    }
    startRecall(h) {
      if (!h.alive || h.recallT > 0 || this.inFountain(h)) return;
      h.recallT = 3; h.target = null; h.want = null; h.wantDir = null;
    }
    inFountain(h) { const f = this.fountains[h.team]; return d2(h, f) < f.r * f.r; }

    // ---- combat --------------------------------------------------------------
    combat(u, dt) {
      if (u.stunT > 0 || u.dash || u.knock || (u.kind === 'hero' && u.recallT > 0)) return;
      const t = u.target;
      if (!t) { u.inRange = false; return; }
      if (!this.valid(u, t)) { u.target = null; u.inRange = false; return; }
      const reach = u.range + u.r + t.r;
      if (d2(u, t) <= reach * reach) {
        u.inRange = true;
        if (!isStructure(u)) u.face = norm(t.x - u.x, t.y - u.y);
        if (u.atkCd <= 0) this.attack(u, t);
      } else {
        u.inRange = false;
        if (!isStructure(u) && !u.wantDir) u.want = { x: t.x, y: t.y };
      }
    }
    attack(u, t) {
      u.atkCd = 1 / u.atkSpeed();
      u.lockT = u.kind === 'hero' ? 0.12 : 0.1;
      let dmg = u.atk;
      if (u.kind === 'minion' && isStructure(t)) dmg *= u.siege ? 2 : 1;
      if (isStructure(u)) {
        if (t.kind === 'hero') { u.heat = u.lastT === t ? Math.min(u.heat + 1, 4) : 0; dmg *= 1 + 0.35 * u.heat; }
        else dmg *= 1.5;
        u.lastT = t;
      }
      if (u.kind === 'hero') {
        u.revealT = this.t + 1; u.invisT = 0; u.recallT = 0;
        if (u.hasBuff('veilstrike')) { dmg *= 2; u.removeBuff('veilstrike'); this.burst(t.x, t.y, '#b49bff', 12, 200); }
      }
      if (u.range > 200) {
        const src = isStructure(u) ? { x: u.x, y: u.y - (u.kind === 'core' ? 90 : 80) } : { x: u.x + u.face.x * u.r, y: u.y + u.face.y * u.r };
        this.projs.push({
          homing: t, x: src.x, y: src.y, speed: isStructure(u) ? 950 : 1150, dmg, src: u, team: u.team, basic: true,
          color: u.kind === 'hero' ? skinC(u) : SF.TEAM_COLORS[u.team], r: isStructure(u) ? 10 : u.kind === 'hero' ? 6 : 4,
          kind: isStructure(u) ? 'bolt' : 'basic'
        });
      } else {
        this.applyDamage(u, t, dmg, { basic: true });
        if (u.kind === 'hero' || u.kind === 'monster') this.slashFx(t.x, t.y, Math.atan2(u.face.y, u.face.x), u.kind === 'hero' ? skinC(u) : '#e8d9a8');
      }
      if (u === this.player || t === this.player) this.emit('hit', u, t);
    }
    applyDamage(src, t, amt, o = {}) {
      if (!t.alive) return 0;
      if (isStructure(t) && !this.targetable(t)) return 0;
      if (src && src.dmgMul) amt *= src.dmgMul();
      if (src && src.botDmg) amt *= src.botDmg;
      if (src && src.kind === 'hero' && isStructure(t)) {
        let covered = false;
        for (const u of this.units) if (u.alive && u.kind === 'minion' && u.team === src.team && d2(u, t) < (t.range + 80) ** 2) { covered = true; break; }
        if (!covered) amt *= 0.4;
      }
      if (isStructure(t) && this.t < 240) amt *= 0.5; // early-game fortification
      amt *= 100 / (100 + Math.max(0, t.def));
      amt *= 1 - Math.min(0.6, t.bv('dmgRed'));
      if (t.shield > 0) { const s = Math.min(t.shield, amt); t.shield -= s; amt -= s; }
      t.hp -= amt; t.flash = 0.1;
      if (src && src.kind === 'hero') {
        src.dmgDealt += amt;
        if (o.basic && src.lifesteal) src.hp = Math.min(src.maxHp, src.hp + amt * src.lifesteal);
        if (t.kind === 'hero') { src.aggroT = this.t; t.hitBy.set(src, this.t); }
      }
      if (t.kind === 'hero' && t.recallT > 0) t.recallT = 0;
      if (t.kind === 'monster' && src && !t.resetting) t.aggro = src;
      if (amt >= 1 && (src === this.player || t === this.player)) {
        const col = t === this.player ? '#ff6b7a' : o.skill ? '#ffb347' : '#ffffff';
        this.float(t.x + (Math.random() - 0.5) * 20, t.y - t.r - 26, Math.round(amt), col, o.skill ? 1.25 : 1);
      }
      if (t.hp <= 0) this.kill(t, src);
      return amt;
    }
    lastHero(t) {
      let best = null, bt = this.t - 10;
      if (t.hitBy) for (const [h, when] of t.hitBy) if (when > bt) { bt = when; best = h; }
      return best;
    }
    kill(t, src) {
      t.alive = false; t.hp = 0; t.deadT = 0; t.target = null; t.dash = null; t.knock = null; t.want = null;
      const killer = src && src.kind === 'hero' ? src : (t.kind === 'hero' ? this.lastHero(t) : null);
      if (t.kind === 'minion') {
        if (killer) { this.addGold(killer, t.gold); if (killer === this.player) this.float(t.x, t.y - 30, '+' + t.gold, '#ffc84a', 1); }
        const near = this.heroes.filter(h => h.alive && h.team !== t.team && d2(h, t) < 900 * 900);
        near.forEach(h => this.giveXp(h, t.xp * (near.length > 1 ? 0.7 : 1)));
        this.burst(t.x, t.y, SF.TEAM_COLORS[t.team], 8, 140);
      } else if (t.kind === 'monster') {
        const team = killer ? killer.team : -1;
        this.burst(t.x, t.y, '#f0d38a', 20, 220);
        if (t.mtype === 'colossus') {
          this.shard = null; this.shardAt = this.t + 180;
          if (team >= 0) {
            for (const h of this.heroes) if (h.team === team) {
              this.addGold(h, 150); this.giveXp(h, 200);
              if (h.alive) h.addBuff({ id: 'shard', t: 90, dmgMul: 0.15, msMul: 0.08, label: 'Shard Empowered' });
            }
            this.siegeBonus[team] = 3; this.teamStats[team].shards++;
            this.announce(team === 0 ? 'Your team took the Shard' : 'Enemy took the Shard', team, 'Empowered for 90s + Shard Golems join the next waves');
            this.shake(6);
          }
        } else {
          t.camp.unit = null; t.camp.respawnAt = this.t + 70;
          if (killer) {
            this.addGold(killer, t.gold); this.giveXp(killer, t.xp);
            if (killer === this.player) this.float(t.x, t.y - 34, '+' + t.gold, '#ffc84a', 1.1);
            if (t.mtype === 'wisp') killer.addBuff({ id: 'ember', t: 70, dmgMul: 0.1, label: 'Ember Blessing' });
          }
        }
      } else if (isStructure(t)) {
        const team = 1 - t.team;
        for (const h of this.heroes) if (h.team === team) this.addGold(h, 150);
        if (killer) { this.addGold(killer, 100); killer.towers++; }
        this.teamStats[team].towers++;
        this.burst(t.x, t.y - 40, SF.TEAM_COLORS[t.team], 40, 360); this.shake(10);
        this.emit('tower', t, killer);
        if (t.kind === 'core') this.end(team);
        else this.announce(t.team === 0 ? 'Your tower has fallen' : 'Enemy tower destroyed', team);
      } else if (t.kind === 'hero') {
        t.dth++; t.respawnT = 6 + t.level * 2 + Math.min(10, this.t / 60); t.recallT = 0; t.buffs = []; t.shield = 0; t.slowT = 0; t.stunT = 0; t.invisT = 0;
        const shutdown = t.streak >= 3;
        const bounty = 220 + (shutdown ? 50 * Math.min(6, t.streak) : 0);
        t.streak = 0;
        this.kills[1 - t.team]++;
        const assists = [];
        for (const [h, when] of t.hitBy) if (h !== killer && h.team !== t.team && this.t - when < 10) assists.push(h);
        if (killer) {
          killer.k++; this.addGold(killer, bounty); killer.streak++;
          killer.multiN = killer.multiT > 0 ? killer.multiN + 1 : 1; killer.multiT = 10;
        }
        assists.forEach(h => { h.ast++; this.addGold(h, 90); });
        const near = this.heroes.filter(h => h.alive && h.team !== t.team && d2(h, t) < 1000 * 1000);
        near.forEach(h => this.giveXp(h, (140 + 30 * t.level) * (near.length > 1 ? 0.65 : 1)));
        t.hitBy.clear();
        let text = null;
        if (!this.firstBlood) { this.firstBlood = true; text = 'First Blood'; }
        if (killer) {
          if (killer.multiN === 2) text = 'Double Kill';
          else if (killer.multiN >= 3) text = 'Triple Kill';
          else if (!text) text = ({ 3: 'Killing Spree', 4: 'Rampage', 5: 'Unstoppable' })[killer.streak] || (killer.streak >= 6 ? 'Godlike' : null);
        }
        if (!text && shutdown) text = 'Shutdown';
        const ace = this.heroes.every(h => h.team !== t.team || !h.alive);
        this.feed.unshift({ killer, victim: t, team: 1 - t.team, t: this.t });
        this.feed.length = Math.min(this.feed.length, 4);
        this.burst(t.x, t.y, skinC(t), 30, 300);
        this.emit('kill', { killer, victim: t, assists, text });
        if (text) this.announce(text, 1 - t.team, killer ? `${killer.name} · ${killer.def0.name}` : '');
        if (ace) this.later(1.2, () => this.announce('Ace', 1 - t.team, 'Every enemy hero is down'));
      }
    }
    end(team) {
      if (this.over) return;
      this.over = true; this.winner = team;
      this.emit('end', team);
    }
    timeoutEnd() {
      const score = team => this.units.filter(u => u.team === team && isStructure(u) && u.alive).reduce((a, u) => a + u.hp, 0) + this.kills[team] * 200;
      this.end(score(0) >= score(1) ? 0 : 1);
    }

    // ---- status helpers -----------------------------------------------------
    slow(u, amt, dur) { if (isStructure(u)) return; if (u.slowT <= 0 || amt >= u.slowAmt) u.slowAmt = amt; u.slowT = Math.max(u.slowT, dur); }
    stun(u, dur) { if (isStructure(u) || u.stunImmune > 0) return; u.stunT = Math.max(u.stunT, dur); if (u.kind === 'hero') u.recallT = 0; }
    shieldUnit(u, amt, dur) { u.shield += amt; u.shieldT = Math.max(u.shieldT, dur); }
    heal(u, amt, quiet) {
      const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + amt);
      if (!quiet && u === this.player && u.hp - before >= 1) this.float(u.x, u.y - 50, '+' + Math.round(u.hp - before), '#7dffa0', 1);
    }
    knockback(u, dir, d) { if (isStructure(u)) return; u.knock = { vx: dir.x * d / 0.22, vy: dir.y * d / 0.22, t: 0.22 }; }
    dashTo(u, dir, distance, speed, o = {}) {
      u.dash = { vx: dir.x, vy: dir.y, left: distance, speed, hit: new Set(), onPass: o.onPass, stopOnHero: o.stopOnHero, onEnd: o.onEnd, trail: o.trail };
      u.recallT = 0; u.face = { x: dir.x, y: dir.y };
    }
    shoot(h, dir, o) {
      this.projs.push(Object.assign({ x: h.x + dir.x * h.r, y: h.y + dir.y * h.r, vx: dir.x, vy: dir.y, trav: 0, hit: new Set(), team: h.team, src: h }, o));
    }
    zone(z) { z.t = 0; z.started = false; this.zones.push(z); }
    enemiesIn(team, x, y, r) {
      const out = [];
      for (const u of this.units) {
        if (!u.alive || u.team === team || isStructure(u)) continue;
        const rr = r + u.r, dx = u.x - x, dy = u.y - y;
        if (dx * dx + dy * dy <= rr * rr) out.push(u);
      }
      return out;
    }
    towerCovers(team, p, pad = 0) {
      for (const u of this.units) {
        if (!u.alive || u.team !== team || !isStructure(u)) continue;
        if (d2(u, p) < (u.range + pad) ** 2) return u;
      }
      return null;
    }
    frontStructure(team) {
      const list = [this.towers[team][0], this.towers[team][1], this.cores[team]];
      return list.find(s => s.alive) || this.cores[team];
    }

    // ---- movement ------------------------------------------------------------
    move(u, dt) {
      if (isStructure(u)) return;
      const ox = u.x, oy = u.y;
      if (u.dash) {
        const D = u.dash, step = Math.min(D.left, D.speed * dt);
        u.x += D.vx * step; u.y += D.vy * step; D.left -= step;
        if (D.onPass || D.stopOnHero) {
          for (const e of this.enemiesIn(u.team, u.x, u.y, u.r + 8)) {
            if (D.hit.has(e)) continue;
            D.hit.add(e);
            if (D.onPass) D.onPass(e);
            if (D.stopOnHero && e.kind === 'hero') { D.left = 0; break; }
          }
        }
        if (D.trail && Math.random() < 0.8) this.parts.push({ x: u.x, y: u.y - 16, vx: 0, vy: -20, life: 0.35, max: 0.35, color: D.trail, size: 6 });
        if (D.left <= 0.5) { u.dash = null; if (D.onEnd) D.onEnd(D); }
      } else if (u.knock) {
        u.x += u.knock.vx * dt; u.y += u.knock.vy * dt; u.knock.t -= dt;
        if (u.knock.t <= 0) u.knock = null;
      } else if (u.stunT <= 0) {
        if (u.lockT > 0) { u.lockT -= dt; }
        else {
          let dir = null, mag = 1;
          if (u.wantDir) { dir = u.wantDir; mag = Math.min(1, Math.hypot(dir.x, dir.y)); dir = norm(dir.x, dir.y); }
          else if (u.want && !(u.target && u.inRange)) {
            const dx = u.want.x - u.x, dy = u.want.y - u.y, L = Math.hypot(dx, dy);
            const step = u.speed() * dt;
            if (L <= step) { u.x = u.want.x; u.y = u.want.y; u.want = null; }
            else if (L > 2) dir = { x: dx / L, y: dy / L };
          }
          if (dir && mag > 0.05) {
            const s = u.speed() * dt * Math.max(0.35, mag);
            u.x += dir.x * s; u.y += dir.y * s; u.face = dir; u.anim += dt * (u.speed() / 120);
          }
        }
      }
      u.x = clamp(u.x, 40, W.w - 40); u.y = clamp(u.y, 60, W.h - 60);
      u.vx = (u.x - ox) / dt; u.vy = (u.y - oy) / dt;
      u.moving = Math.abs(u.vx) + Math.abs(u.vy) > 5;
    }
    separate() {
      const arr = this.units.filter(u => u.alive && !u.dash && (u.kind === 'minion' || u.kind === 'hero' || u.kind === 'monster'));
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          const dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * 0.85;
          const dd = dx * dx + dy * dy;
          if (dd >= rr * rr || dd < 0.01) continue;
          const D = Math.sqrt(dd), push = (rr - D) / D * 0.5;
          const wa = a.kind === 'hero' && b.kind !== 'hero' ? 0.2 : b.kind === 'hero' && a.kind !== 'hero' ? 1.8 : 1;
          a.x -= dx * push * wa; a.y -= dy * push * wa;
          b.x += dx * push * (2 - wa); b.y += dy * push * (2 - wa);
        }
        for (const s of this.units) {
          if (!s.alive || !isStructure(s)) continue;
          const dx = a.x - s.x, dy = a.y - s.y, rr = a.r + s.r * 0.8, dd = dx * dx + dy * dy;
          if (dd < rr * rr && dd > 0.01) { const D = Math.sqrt(dd); a.x = s.x + dx / D * rr; a.y = s.y + dy / D * rr; }
        }
      }
    }

    updateProjs(dt) {
      for (const p of this.projs) {
        if (p.homing) {
          const t = p.homing;
          if (!t.alive) { p.dead = true; continue; }
          const dx = t.x - p.x, dy = t.y - p.y, L = Math.hypot(dx, dy), step = p.speed * dt;
          p.ang = Math.atan2(dy, dx);
          if (L <= step + t.r * 0.6) { p.dead = true; this.applyDamage(p.src, t, p.dmg, { basic: p.basic }); }
          else { p.x += dx / L * step; p.y += dy / L * step; }
        } else {
          const step = p.speed * dt;
          p.x += p.vx * step; p.y += p.vy * step; p.trav += step; p.ang = Math.atan2(p.vy, p.vx);
          for (const u of this.units) {
            if (!u.alive || u.team === p.team || p.hit.has(u) || isStructure(u)) continue;
            const rr = u.r + p.r;
            if (d2(u, p) < rr * rr) { p.hit.add(u); p.onHit(u); if (!p.pierce) { p.dead = true; break; } }
          }
          if (Math.random() < 0.6) this.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.3, max: 0.3, color: p.color, size: p.r * 0.5 });
          if (p.trav >= p.max) p.dead = true;
        }
      }
      this.projs = this.projs.filter(p => !p.dead);
    }
    updateZones(dt) {
      for (const z of this.zones) {
        z.t += dt;
        if (!z.started && z.t >= (z.delay || 0)) { z.started = true; if (z.onStart) z.onStart(z); }
        if (z.started && z.tick) z.tick(dt, z);
        if (z.t >= (z.delay || 0) + (z.dur || 0)) z.dead = true;
      }
      this.zones = this.zones.filter(z => !z.dead);
    }
    fountainTick(dt) {
      this.fountains.forEach((f, team) => {
        for (const h of this.heroes) {
          if (!h.alive || d2(h, f) > f.r * f.r) continue;
          if (h.team === team) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.14 * dt);
          else this.applyDamage(this.cores[team], h, 1200 * dt);
        }
      });
    }

    // ---- effects (cosmetic) -------------------------------------------------
    ring(x, y, r, color, dur, w) { this.fx.push({ type: 'ring', x, y, r, color, t: 0, dur, w: w || 3 }); }
    slashFx(x, y, ang, color) { this.fx.push({ type: 'slash', x, y, ang, color, t: 0, dur: 0.18 }); }
    burst(x, y, color, n, sp) {
      for (let i = 0; i < n && this.parts.length < 700; i++) {
        const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
        this.parts.push({ x, y: y - 12, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: 0.5, max: 0.5, color, size: 3 + Math.random() * 4, drag: 3 });
      }
    }
    float(x, y, text, color, scale) { this.floats.push({ x, y, text, color, t: 0, dur: 0.9, scale: scale || 1 }); }
    shake(m) { this.shakeT = 0.25; this.shakeMag = Math.max(this.shakeMag, m); }
    announce(text, team, sub) { this.emit('announce', text, team, sub || ''); }
    updateFx(dt) {
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.dur);
      for (const p of this.parts) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const f of this.floats) { f.t += dt; f.y -= 40 * dt; }
      this.floats = this.floats.filter(f => f.t < f.dur);
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    }

    // ---- results ------------------------------------------------------------
    summary() {
      const rows = this.heroes.map(h => ({
        name: h.name, hero: h.def0.name, heroId: h.def0.id, skin: h.skin, team: h.team, isPlayer: h.isPlayer, pid: h.pid, human: !!h.human,
        k: h.k, d: h.dth, a: h.ast, gold: Math.round(h.goldEarned), dmg: Math.round(h.dmgDealt), level: h.level, towers: h.towers,
        score: h.k * 3 + h.ast * 2 - h.dth * 1.5 + h.dmgDealt / 1500 + h.towers * 2 + h.goldEarned / 1200
      }));
      const winners = rows.filter(r => r.team === this.winner);
      const mvp = winners.reduce((a, r) => (!a || r.score > a.score ? r : a), null);
      return { winner: this.winner, won: this.winner === 0, time: this.t, kills: this.kills.slice(), rows, mvp, teamStats: this.teamStats };
    }
  }

  // ---------------------------------------------------------------------------
  // Bot brain. One per AI-controlled hero.
  // ---------------------------------------------------------------------------
  class Brain {
    constructor(m, h, diff) {
      this.m = m; this.h = h; this.D = SF.DIFFICULTY[diff]; this.tick = Math.random() * 0.4;
      this.yo = (Math.random() - 0.5) * 120; this.jungler = false;
    }
    think(dt) {
      const m = this.m, h = this.h;
      this.tick -= dt;
      if (this.tick > 0) return;
      this.tick = this.D.react * (0.7 + Math.random() * 0.6);
      if (!h.alive || h.dash) return;
      const nxt = h.nextItem(); if (nxt && h.gold >= SF.ITEMS[nxt].cost) m.buy(h, nxt);
      if (h.recallT > 0) return;
      const hp = h.hpPct, f = m.fountains[h.team];
      if (m.inFountain(h) && hp < 0.9) { h.want = null; h.target = null; return; }
      const foes = m.heroes.filter(e => e.alive && e.team !== h.team && m.visible(e, h.team) && d2(e, h) < 760 * 760);

      if (hp < this.D.retreat || (hp < 0.5 && foes.length >= 2 && this.alliesNear(700) < foes.length)) {
        const close = foes.some(e => d2(e, h) < 620 * 620);
        if (!close && !m.towerCovers(1 - h.team, h, h.r)) { m.startRecall(h); return; }
        h.target = null; h.want = { x: f.x, y: f.y };
        this.escape();
        return;
      }

      let best = null, bs = -1e9;
      for (const e of foes) {
        const D = dist(e, h); if (D > 620) continue;
        const sc = -e.hpPct * 100 - D / 8 + (e.hp < h.atk * 3 ? 40 : 0);
        if (sc > bs) { bs = sc; best = e; }
      }
      if (best) {
        const my = this.strength(h.team, best), their = this.strength(1 - h.team, best);
        const dive = m.towerCovers(1 - h.team, best, 30) && !(best.hpPct < 0.2 && hp > 0.55);
        if (!dive && (my >= their * 0.85 || best.hpPct < 0.25)) { this.useSkills(best, 'fight'); h.target = best; return; }
        if (their > my * 1.2) { h.target = null; const s = m.frontStructure(h.team); h.want = { x: s.x - (h.team === 0 ? 1 : -1) * 60, y: s.y + this.yo * 0.5 }; return; }
      }

      const sh = m.shard;
      if (sh && sh.alive && hp > 0.55 && m.t - m.shardSpawnedT > 8 && m.heroes.filter(x => x.alive && x.team === h.team).length >= 2) { this.hit(sh); return; }
      if (this.jungler && hp > 0.45) { const c = this.pickCamp(); if (c) { this.hit(c.unit); return; } }
      this.lane();
    }
    alliesNear(r) { return this.m.heroes.filter(a => a.alive && a.team === this.h.team && d2(a, this.h) < r * r).length; }
    strength(team, around) {
      let s = 0;
      for (const x of this.m.heroes) if (x.alive && x.team === team && this.m.visible(x, this.h.team) && d2(x, around) < 800 * 800) s += x.hpPct * (0.8 + x.level * 0.05);
      return s;
    }
    hit(u) {
      const h = this.h;
      h.target = u;
      if (Math.random() < 0.35) this.useSkills(u, 'farm');
    }
    pickCamp() {
      const h = this.h, own = c => (h.team === 0 ? c.x < W.riverX : c.x > W.riverX);
      let best = null, bd = 1e18;
      for (const c of this.m.camps) {
        if (!c.unit || !c.unit.alive || c.unit.resetting || !own(c)) continue;
        const dd = d2(c, h); if (dd < bd) { bd = dd; best = c; }
      }
      return best;
    }
    lane() {
      const m = this.m, h = this.h, dir = h.team === 0 ? 1 : -1, L = W.laneY;
      const et = m.frontStructure(1 - h.team);
      if (et && et.alive && et.target === h) { h.target = null; h.want = { x: h.x - dir * 260, y: L + this.yo * 0.5 }; return; }
      let front = null;
      for (const u of m.units) if (u.alive && u.kind === 'minion' && u.team === h.team && (!front || (u.x - front.x) * dir > 0)) front = u;
      let ax = front ? front.x - dir * 110 : m.frontStructure(h.team).x + dir * 140;
      if (et && et.alive) {
        const edge = et.x - dir * (et.range + h.r + 30);
        const tanking = et.target && et.target.kind === 'minion';
        if ((ax - edge) * dir > 0 && !tanking) ax = edge;
      }
      let tgt = null, bs = 1e9;
      for (const u of m.units) {
        if (!u.alive || u.team !== 1 - h.team || u.kind === 'hero' || !m.targetable(u)) continue;
        const D = dist(u, h); if (D > h.range + 240) continue;
        if (isStructure(u) && !(u.target && u.target.kind === 'minion')) continue;
        if (!isStructure(u) && m.towerCovers(1 - h.team, u, h.range * 0.3) && !(et && et.target && et.target.kind === 'minion')) continue;
        const sc = (u.kind === 'minion' ? u.hp - (u.hp < h.atk * 1.2 ? 1000 : 0) : 3000) + D * 0.5;
        if (sc < bs) { bs = sc; tgt = u; }
      }
      if (tgt) { h.target = tgt; if (Math.random() < 0.12) this.useSkills(tgt, 'farm'); return; }
      h.target = null; h.want = { x: ax, y: L + this.yo };
    }
    aimAt(e) {
      const h = this.h, lead = this.D.lead;
      const p = { x: e.x + (e.vx || 0) * lead, y: e.y + (e.vy || 0) * lead };
      return { dir: norm(p.x - h.x, p.y - h.y), point: p, target: e };
    }
    escape() {
      const m = this.m, h = this.h, f = m.fountains[h.team];
      for (let i = 0; i < 3; i++) {
        if (h.skillCd[i] > 0 || (i === 2 && h.level < 4)) continue;
        const s = h.def0.skills[i];
        let aim = null;
        if (s.kind === 'dash' && !s.needsTarget) aim = { dir: norm(f.x - h.x, f.y - h.y), point: null, target: null };
        else if (s.ai === 'self' || s.ai === 'heal') aim = { dir: h.face, point: { x: h.x, y: h.y }, target: null };
        if (aim && m.castSkill(h, i, aim) === true) return;
      }
    }
    useSkills(e, mode) {
      const m = this.m, h = this.h;
      for (const i of [2, 0, 1]) {
        if (h.skillCd[i] > 0 || (i === 2 && (h.level < 4 || mode === 'farm'))) continue;
        if (Math.random() > this.D.skill) continue;
        const s = h.def0.skills[i];
        const D = e ? dist(e, h) : 1e9;
        let aim = null;
        switch (s.ai) {
          case 'enemy': if (e && D <= s.range * 0.95 + e.r) aim = this.aimAt(e); break;
          case 'near': if (e && D <= s.range * 0.9 + e.r) aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: h.x, y: h.y }, target: e }; break;
          case 'execute': if (e && e.kind === 'hero' && D <= s.range && e.hpPct < 0.55) aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: e.x, y: e.y }, target: e }; break;
          case 'self': if (mode === 'fight' && e && D < h.range + 260) aim = { dir: h.face, point: { x: h.x, y: h.y }, target: null }; break;
          case 'heal': if (m.heroes.some(a => a.alive && a.team === h.team && a.hpPct < 0.6 && d2(a, h) < s.range * s.range)) aim = { dir: h.face, point: { x: h.x, y: h.y }, target: null }; break;
          case 'fight': if (mode === 'fight' && e && D < 360) aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: h.x, y: h.y }, target: e }; break;
        }
        if (s.needsTarget && aim && (!aim.target || (aim.target.kind !== 'hero' && !s.anyTarget))) aim = null;
        if (aim && m.castSkill(h, i, aim) === true) return true;
      }
      return false;
    }
  }

  SF.Match = Match;
  SF.Brain = Brain;
  SF.MAX_LEVEL = MAX_LEVEL;
})(window.SF);

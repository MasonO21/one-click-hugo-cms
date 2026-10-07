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
      this.skillCd = [0, 0, 0]; this.ranks = [0, 0, 0]; this.points = 1; this.passives = new Set(); this.k = 0; this.dth = 0; this.ast = 0; this.towers = 0;
      this.streak = 0; this.multiN = 0; this.multiT = 0; this.respawnT = 0; this.recallT = 0; this.spellCd = 0; this.ccImmune = 0;
      this.hitBy = new Map(); this.dmgDealt = 0; this.aggroT = -9; this.revealT = -9; this.invisT = 0;
      this.vis = [true, true, true]; this.bush = -1;
      this.spell = SF.SPELLS[o.spell] ? o.spell : 'blink';
      this.maxHp = 0; this.recalc(); this.hp = this.maxHp;
      this.spawn = { x: o.x, y: o.y };
    }
    recalc() {
      const b = this.def0.base, g = this.def0.grow, lv = this.level - 1;
      const add = { hp: 0, atk: 0, power: 0, def: 0, ms: 0, as: 0, regen: 0, lifesteal: 0, cdr: 0, crit: 0 };
      for (const id of this.items) { const s = SF.ITEMS[id].stats; for (const k in s) add[k] += s[k]; }
      const mu = (this.m && this.m.mut) || {};
      const newMax = (b.hp + g.hp * lv + add.hp) * (mu.hp || 1);
      if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
      this.maxHp = newMax; this.hp = Math.min(this.hp, newMax);
      this.atk = b.atk + g.atk * lv + add.atk;
      this.power = b.power + (g.power || 0) * lv + add.power;
      this.def = b.def + g.def * lv + add.def;
      this.ms = (b.ms + add.ms) * (mu.ms || 1);
      this.range = b.range;
      this.as = b.as * (1 + 0.025 * lv + add.as);
      this.regen = b.regen + lv * 0.6 + add.regen;
      this.lifesteal = add.lifesteal;
      this.cdr = Math.min(0.4, add.cdr);
      this.crit = Math.min(0.6, add.crit);
      this.passives = new Set(this.items.map(id => SF.ITEMS[id].passive).filter(Boolean));
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
      // Aimed at a target: stop just past it. Drag-aimed (no target): the full distance.
      const len = a.target ? clamp(dist(h, a.target) + 60, 120, s.range) : s.range;
      m.dashTo(h, a.dir, len, 1500, { trail: skinC(h), onPass: e => m.applyDamage(h, e, 80 + 0.95 * h.atk, { skill: s }) });
      return true;
    },
    cinder_whirl(m, h, a, s) {
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) { m.applyDamage(h, e, 90 + 1.0 * h.atk, { skill: s }); m.slow(e, 0.3, 1.5); }
      m.ring(h.x, h.y, s.range, skinC(h), 0.35, 6); m.burst(h.x, h.y, '#ffb347', 18, 260);
      return true;
    },
    phoenix_verdict(m, h, a, s) {
      const t = a.target; if (!t || t.kind !== 'hero') return false;
      const dir = norm(t.x - h.x, t.y - h.y);
      m.dashTo(h, dir, Math.max(0, dist(h, t) - (h.r + t.r)), 1900, { trail: '#ffb347', onEnd: () => {
        if (!t.alive) return;
        m.applyDamage(h, t, 170 + 1.2 * h.atk + 0.22 * (t.maxHp - t.hp), { skill: s });
        m.ring(t.x, t.y, 130, '#ffb347', 0.4, 8); m.burst(t.x, t.y, '#ffd29a', 26, 320); m.shake(7);
        if (!t.alive) h.skillCd[2] *= 0.2;
      } });
      return true;
    },
    riptide_bolt(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 950, r: 16, max: s.range, color: skinC(h), kind: 'orb', onHit: e => { m.applyDamage(h, e, 100 + 0.7 * h.power, { skill: s }); m.slow(e, 0.35, 1.5); m.burst(e.x, e.y, skinC(h), 10, 160); } });
      return true;
    },
    whirlpool(m, h, a, s) {
      const p = a.point;
      m.zone({ x: p.x, y: p.y, r: 130, team: h.team, delay: 0.7, dur: 0.4, color: skinC(h), kind: 'whirl', onStart: z => {
        for (const e of m.enemiesIn(h.team, z.x, z.y, z.r)) { m.applyDamage(h, e, 150 + 0.9 * h.power, { skill: s }); m.stun(e, 0.8); }
        m.ring(z.x, z.y, z.r, skinC(h), 0.4, 6); m.shake(3);
      } });
      return true;
    },
    leviathan_surge(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 760, r: 62, max: s.range, pierce: true, color: skinC(h), kind: 'wave', onHit: e => {
        m.applyDamage(h, e, 280 + 1.3 * h.power, { skill: s }); m.knockback(e, a.dir, 150);
      } });
      m.shake(4);
      return true;
    },
    piercing_gale(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 1450, r: 14, max: s.range, pierce: true, color: skinC(h), kind: 'arrow', onHit: e => m.applyDamage(h, e, 80 + 1.0 * h.atk, { skill: s }) });
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
        m.shoot(h, { x: Math.cos(ang), y: Math.sin(ang) }, { speed: 1250, r: 12, max: s.range, color: skinC(h), kind: 'arrow', onHit: e => m.applyDamage(h, e, 70 + 0.6 * h.atk, { skill: s }) });
      }
      return true;
    },
    boulder_charge(m, h, a, s) {
      m.dashTo(h, a.dir, s.range, 1150, { stopOnHero: true, trail: '#d8c7a0', onPass: e => {
        m.applyDamage(h, e, 80 + 0.06 * h.maxHp, { skill: s });
        if (e.kind === 'hero') { m.stun(e, 1.0); m.shake(4); }
      } });
      return true;
    },
    quake(m, h, a, s) {
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) { m.applyDamage(h, e, 70 + 0.05 * h.maxHp, { skill: s }); m.slow(e, 0.4, 2); }
      m.ring(h.x, h.y, s.range, '#e3d27a', 0.45, 8); m.shake(4);
      return true;
    },
    granite_bulwark(m, h, a, s) {
      const amt = 250 + 0.25 * h.maxHp;
      m.shieldUnit(h, amt, 5);
      for (const al of m.heroes) if (al !== h && al.alive && al.team === h.team && d2(al, h) < 420 * 420) m.shieldUnit(al, amt * 0.5, 5);
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) { m.stun(e, 0.7); m.applyDamage(h, e, 100 + 0.04 * h.maxHp, { skill: s }); }
      m.ring(h.x, h.y, s.range, '#e3d27a', 0.5, 10); m.ring(h.x, h.y, 420, '#e3d27a', 0.6, 2); m.shake(6);
      return true;
    },
    shadow_lunge(m, h, a, s) {
      const t = a.target; if (!t) return false;
      const dir = norm(t.x - h.x, t.y - h.y);
      m.burst(h.x, h.y, '#6b4bd6', 12, 140);
      h.x = clamp(t.x + dir.x * (t.r + h.r + 6), 40, W.w - 40); h.y = clamp(t.y + dir.y * (t.r + h.r + 6), 60, W.h - 60);
      h.face = { x: -dir.x, y: -dir.y };
      m.applyDamage(h, t, 110 + 1.2 * h.atk, { skill: s });
      m.burst(h.x, h.y, skinC(h), 14, 180);
      h.target = t;
      return true;
    },
    veil(m, h) {
      h.invisT = 3; h.addBuff({ id: 'veil', t: 3, msMul: 0.3 }); h.addBuff({ id: 'veilstrike', t: 6 });
      m.heal(h, h.maxHp * 0.1, false, h);
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
          m.applyDamage(h, t, 80 + 0.8 * h.atk + extra, { skill: s });
          m.slashFx(t.x, t.y, Math.random() * 6.28, skinC(h)); if (i === 2) { m.shake(6); m.burst(t.x, t.y, skinC(h), 24, 280); }
        });
      }
      return true;
    },
    radiant_orb(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 1000, r: 16, max: s.range, color: skinC(h), kind: 'orb', onHit: e => { m.applyDamage(h, e, 100 + 0.7 * h.power, { skill: s }); m.slow(e, 0.2, 1); } });
      return true;
    },
    mending_light(m, h, a, s) {
      for (const al of m.heroes) if (al.alive && al.team === h.team && d2(al, h) < s.range * s.range) {
        m.heal(al, 140 + 0.85 * h.power + 0.05 * al.maxHp, false, h); m.burst(al.x, al.y, '#9dffb0', 10, 120);
      }
      m.ring(h.x, h.y, s.range, '#9dffb0', 0.5, 3);
      return true;
    },
    sanctuary(m, h, a, s) {
      const p = a.point;
      m.zone({ x: p.x, y: p.y, r: 220, team: h.team, dur: 4, color: skinC(h), kind: 'sanct', tick: (dt) => {
        for (const al of m.heroes) if (al.alive && al.team === h.team && d2(al, p) < 220 * 220) { m.heal(al, (50 + 0.3 * h.power) * dt, true, h); al.addBuff({ id: 'sanct', t: 0.3, dmgRed: 0.25 }); }
        for (const e of m.enemiesIn(h.team, p.x, p.y, 220)) m.slow(e, 0.3, 0.3);
      } });
      return true;
    },
    chain_spark(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 1100, r: 15, max: s.range, color: skinC(h), kind: 'orb', onHit: e => {
        const dmg = 95 + 0.65 * h.power;
        m.applyDamage(h, e, dmg, { skill: s });
        const hit = new Set([e]);
        let from = e;
        for (let k = 0; k < 2; k++) {
          let next = null, bd = 270 * 270;
          for (const o of m.enemiesIn(h.team, from.x, from.y, 270)) { if (!hit.has(o) && d2(o, from) < bd) { bd = d2(o, from); next = o; } }
          if (!next) break;
          hit.add(next); m.beam(from, next, skinC(h));
          const target = next, mul = 0.75 - k * 0.15;
          m.later(0.08 * (k + 1), () => { if (target.alive) m.applyDamage(h, target, dmg * mul, { skill: s }); });
          from = next;
        }
      } });
      return true;
    },
    static_field(m, h, a, s) {
      const p = a.point;
      m.zone({ x: p.x, y: p.y, r: 140, team: h.team, dur: 3, color: skinC(h), kind: 'static', acc: 0, tick: (dt, z) => {
        const inside = m.enemiesIn(h.team, z.x, z.y, z.r);
        for (const e of inside) m.slow(e, 0.35, 0.4);
        z.acc += dt;
        if (z.acc >= 0.5) { z.acc -= 0.5; for (const e of inside) m.applyDamage(h, e, 40 + 0.25 * h.power, { skill: s }); }
      } });
      return true;
    },
    tempest(m, h, a, s) {
      const p = { x: a.point.x, y: a.point.y };
      m.zone({ x: p.x, y: p.y, r: 160, team: h.team, dur: 2, color: skinC(h), kind: 'tempest' });
      for (let i = 0; i < 3; i++) {
        m.later(0.6 + i * 0.6, () => {
          for (const e of m.enemiesIn(h.team, p.x, p.y, 160)) m.applyDamage(h, e, 130 + 0.6 * h.power, { skill: s });
          m.bolt(p.x + (Math.random() - 0.5) * 90, p.y + (Math.random() - 0.5) * 60, skinC(h)); m.shake(4);
        });
      }
      return true;
    },
    cleave(m, h, a, s) {
      const dir = a.dir;
      let healed = 0;
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) {
        const v = norm(e.x - h.x, e.y - h.y);
        if (v.x * dir.x + v.y * dir.y < 0.4 && d2(e, h) > (h.r + e.r) ** 2) continue;
        const dealt = m.applyDamage(h, e, 85 + 1.05 * h.atk, { skill: s });
        if (e.kind === 'hero') healed += dealt * 0.35;
      }
      if (healed) m.heal(h, healed, false, h);
      m.fx.push({ type: 'arc', x: h.x, y: h.y, ang: Math.atan2(dir.y, dir.x), r: s.range, color: skinC(h), t: 0, dur: 0.25 });
      return true;
    },
    war_cry(m, h) {
      h.addBuff({ id: 'warcry', t: 4, dmgMul: 0.25, msMul: 0.2 });
      for (const al of m.heroes) if (al !== h && al.alive && al.team === h.team && d2(al, h) < 450 * 450) al.addBuff({ id: 'warcry_ally', t: 4, dmgMul: 0.1 });
      m.ring(h.x, h.y, 450, '#ff8a5c', 0.5, 3); m.ring(h.x, h.y, 80, skinC(h), 0.3, 6);
      return true;
    },
    earthsplitter(m, h, a, s) {
      const d = a.dir, x0 = h.x, y0 = h.y, L = s.range;
      m.zone({ x: x0, y: y0, r: 45, team: h.team, dur: 0.45, kind: 'fissure', dir: d, len: L, color: skinC(h) });
      m.later(0.45, () => {
        for (const e of m.unitsOnLine(h.team, x0, y0, d, L, 45)) { m.applyDamage(h, e, 220 + 1.1 * h.atk, { skill: s }); m.stun(e, 1); }
        m.fx.push({ type: 'fissure', x: x0, y: y0, dir: d, len: L, color: skinC(h), t: 0, dur: 0.7 }); m.shake(7);
      });
      return true;
    },
    refraction(m, h, a, s) {
      const base = Math.atan2(a.dir.y, a.dir.x);
      for (let i = -1; i <= 1; i++) {
        const ang = base + i * 0.1;
        m.shoot(h, { x: Math.cos(ang), y: Math.sin(ang) }, { speed: 1300, r: 12, max: s.range, color: skinC(h), kind: 'arrow', onHit: e => m.applyDamage(h, e, 50 + 0.65 * h.atk, { skill: s }) });
      }
      return true;
    },
    mirror_step(m, h, a, s) {
      m.dashTo(h, a.dir, s.range, 1600, { trail: skinC(h) });
      h.addBuff({ id: 'mirror', t: 3 });
      return true;
    },
    solar_lance(m, h, a, s) {
      const d = a.dir;
      h.lockT = 0.5;
      m.zone({ x: h.x, y: h.y, r: 30, team: h.team, dur: 0.5, kind: 'charge', dir: d, len: s.range, color: skinC(h), follow: h });
      m.later(0.5, () => {
        if (!h.alive) return;
        for (const e of m.unitsOnLine(h.team, h.x, h.y, d, s.range, 32)) m.applyDamage(h, e, 260 + 1.25 * h.atk, { skill: s });
        m.fx.push({ type: 'lance', x: h.x, y: h.y, dir: d, len: s.range, color: skinC(h), t: 0, dur: 0.45 }); m.shake(5);
      });
      return true;
    },
    anchor_hook(m, h, a, s) {
      m.shoot(h, a.dir, { speed: 1100, r: 18, max: s.range, color: skinC(h), kind: 'hook', onHit: e => {
        m.applyDamage(h, e, 90 + 0.6 * h.power + 0.03 * h.maxHp, { skill: s });
        if (!e.alive) return;
        const D = dist(e, h) - (e.r + h.r + 10);
        if (D > 0) { const v = norm(h.x - e.x, h.y - e.y); e.knock = { vx: v.x * D / 0.25, vy: v.y * D / 0.25, t: 0.25 }; }
        m.stun(e, 0.6); m.beam(h, e, '#d9fff6');
      } });
      return true;
    },
    barnacle_guard(m, h, a, s) {
      const amt = 160 + 0.1 * h.maxHp;
      m.shieldUnit(h, amt, 3);
      let best = null;
      for (const al of m.heroes) if (al !== h && al.alive && al.team === h.team && d2(al, h) < s.range * s.range && (!best || al.hpPct < best.hpPct)) best = al;
      if (best) { m.shieldUnit(best, amt, 3); m.beam(h, best, '#d9fff6'); }
      m.ring(h.x, h.y, 70, skinC(h), 0.3, 5);
      return true;
    },
    // Quarra: constructions. Turrets and the bastion are 'summon' units owned by her.
    shard_turret(m, h, a, s) {
      const p = a.point || { x: h.x + a.dir.x * s.range * 0.6, y: h.y + a.dir.y * s.range * 0.6 };
      const mine = m.units.filter(u => u.alive && u.owner === h && u.mtype === 'turret').sort((x, y) => x.born - y.born);
      if (mine.length >= 2) m.unsummon(mine[0]);
      m.summon(h, 'turret', p.x, p.y, { r: 22, maxHp: 520 + 45 * h.level, atk: 28 + 0.4 * h.power, def: 18, range: 380, as: 1.1, life: 12 });
      m.burst(p.x, p.y - 20, skinC(h), 16, 180);
      return true;
    },
    prism_wall(m, h, a, s) {
      const p = a.point || { x: h.x + a.dir.x * s.range * 0.7, y: h.y + a.dir.y * s.range * 0.7 };
      const d = norm(p.x - h.x, p.y - h.y), n = { x: -d.y, y: d.x }, half = 150, thick = 16;
      const wall = { x: p.x, y: p.y, d, n, half, thick, team: h.team, t: 0, dur: 3, color: skinC(h), owner: h };
      // Enemies standing on the line are thrown to the far side and slowed.
      for (const e of m.enemiesIn(h.team, p.x, p.y, half + 30)) {
        if (isStructure(e) || e.kind === 'summon') continue;
        const along = (e.x - p.x) * n.x + (e.y - p.y) * n.y, across = (e.x - p.x) * d.x + (e.y - p.y) * d.y;
        if (Math.abs(along) > half + e.r || Math.abs(across) > thick + e.r) continue;
        const side = across >= 0 ? 1 : -1, k = (thick + e.r + 4) * side - across;
        e.x += d.x * k; e.y += d.y * k;
        m.slow(e, 0.4, 1.5); m.applyDamage(h, e, 60 + 0.5 * h.power, { skill: s });
      }
      m.walls.push(wall);
      for (let i = -3; i <= 3; i++) m.burst(p.x + n.x * i * 45, p.y + n.y * i * 45, skinC(h), 4, 120);
      return true;
    },
    crystal_bastion(m, h, a, s) {
      const p = a.point || { x: h.x, y: h.y };
      m.summon(h, 'bastion', p.x, p.y, { r: 34, maxHp: 1400 + 90 * h.level, atk: 70 + 0.7 * h.power, def: 40, range: 450, as: 0.9, life: 8, shieldAmt: 45 + 0.25 * h.power });
      m.ring(p.x, p.y, 350, skinC(h), 0.6, 6); m.burst(p.x, p.y - 30, skinC(h), 30, 260); m.shake(5);
      return true;
    },
    riptide_dome(m, h, a, s) {
      const p = { x: h.x, y: h.y };
      m.zone({ x: p.x, y: p.y, r: s.range, team: h.team, dur: 3, color: skinC(h), kind: 'dome', acc: 0, tick: (dt, z) => {
        const inside = m.enemiesIn(h.team, z.x, z.y, z.r);
        for (const e of inside) m.slow(e, 0.5, 0.3);
        for (const al of m.heroes) if (al.alive && al.team === h.team && d2(al, z) < z.r * z.r) al.addBuff({ id: 'dome', t: 0.3, dmgRed: 0.2 });
        z.acc += dt;
        if (z.acc >= 0.5) { z.acc -= 0.5; for (const e of inside) m.applyDamage(h, e, 35 + 0.012 * h.maxHp, { skill: s }); }
      } });
      m.shake(4);
      return true;
    },
    // Tolvar: carries one hero on his charge, taunts with the bell, and traps a fight under the Great Bell.
    iron_rush(m, h, a, s) {
      const len = a.target ? clamp(dist(h, a.target) + 110, 180, s.range) : s.range, speed = 1250;
      let carried = null;
      m.dashTo(h, a.dir, len, speed, { trail: skinC(h), onPass: e => {
        m.applyDamage(h, e, 70 + 0.05 * h.maxHp, { skill: s });
        if (isStructure(e) || !e.alive) return;
        if (!carried && e.kind === 'hero' && !(e.ccImmune > 0) && h.dash) {
          // Pushed ahead of Tolvar at the charge's own speed, so it ends where he ends.
          carried = e;
          const T = h.dash.left / speed;
          e.dash = null; e.recallT = 0;
          e.knock = { vx: a.dir.x * speed, vy: a.dir.y * speed, t: T };
          m.later(T, () => { if (e.alive) { m.stun(e, 0.5); m.burst(e.x, e.y - 20, skinC(h), 14, 220); } });
        } else if (e !== carried) {
          const side = (e.x - h.x) * -a.dir.y + (e.y - h.y) * a.dir.x >= 0 ? 1 : -1;
          m.knockback(e, { x: -a.dir.y * side, y: a.dir.x * side }, 80);
        }
      }, onEnd: () => { m.ring(h.x, h.y, 90, skinC(h), 0.3, 5); m.shake(3); } });
      return true;
    },
    toll_of_challenge(m, h, a, s) {
      for (const e of m.enemiesIn(h.team, h.x, h.y, s.range)) {
        m.applyDamage(h, e, 60 + 0.045 * h.maxHp, { skill: s });
        if (e.kind === 'hero') m.taunt(e, h, 1);
      }
      h.addBuff({ id: 'toll', t: 2.5, dmgRed: 0.1 });
      m.ring(h.x, h.y, s.range, skinC(h), 0.45, 7); m.ring(h.x, h.y, s.range * 0.55, '#f6c27a', 0.3, 4);
      m.burst(h.x, h.y - 40, skinC(h), 16, 200); m.shake(3);
      return true;
    },
    great_bell(m, h, a, s) {
      const p = a.point || { x: h.x + a.dir.x * s.range * 0.6, y: h.y + a.dir.y * s.range * 0.6 };
      const trapped = new Set();
      m.zone({ x: p.x, y: p.y, r: 240, team: h.team, delay: 0.4, dur: 3, color: skinC(h), kind: 'bell', trapped, owner: h,
        onStart: z => {
          for (const e of m.enemiesIn(h.team, z.x, z.y, z.r)) {
            if (isStructure(e)) continue;
            m.applyDamage(h, e, 120 + 0.05 * h.maxHp, { skill: s });
            if (e.kind === 'hero' && !(e.ccImmune > 0)) { trapped.add(e); m.slow(e, 0.3, 1); }
          }
          m.ring(z.x, z.y, z.r, skinC(h), 0.7, 9); m.burst(z.x, z.y - 40, '#f6c27a', 36, 320); m.shake(9);
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
      this.signals = []; this.orders = [null, null];
      this.walls = [];   // Prism Walls: block enemy movement for a few seconds   // quick signals: on-map markers, and the order each team's bots follow
      this.kills = [0, 0]; this.over = false; this.winner = -1;
      this.nextWave = 4; this.waveN = 0; this.firstBlood = false;
      this.shard = null; this.shardAt = 90; this.shardSpawnedT = 0; this.siegeBonus = [0, 0];
      this.wyrm = null; this.wyrmAt = 360; this.wyrmSpawnedT = 0;   // late-game objective at the bottom river
      this.runes = []; this.runeAt = 120; this.runeId = 1;          // river power-ups
      this.goldLine = [[0, 0, 0]]; this.goldAt = 15;                 // [time, blue gold, red gold] every 15s, for the results graph
      this.overcharged = false; this.shakeT = 0; this.shakeMag = 0;
      this.teamStats = [{ towers: 0, shards: 0, wyrms: 0 }, { towers: 0, shards: 0, wyrms: 0 }];
      this.fountains = [{ x: 110, y: W.laneY, r: 230 }, { x: W.w - 110, y: W.laneY, r: 230 }];
      // 'classic' (quick / ranked / online) or 'brawl': start at level 5 with gold, no jungle, early Shard.
      // 'practice' is the Training Grounds: dummy enemies, optional free cooldowns / gold / max level.
      this.mode = opts.mode === 'brawl' ? 'brawl' : opts.mode === 'practice' ? 'practice' : 'classic';
      // Brawl's weekly rule twist (see SF.MUTATORS).
      this.mutator = this.mode === 'brawl' && SF.MUTATOR[opts.mutator] ? opts.mutator : null;
      this.mut = this.mutator ? SF.MUTATOR[this.mutator].fx : {};
      this.waveEvery = 30; this.overchargeAt = 480; this.respawnMul = 1;
      this.setupMap();
      this.setupHeroes();
      if (this.mode === 'practice') this.setupPractice(opts.practice || {});
      if (this.mode === 'brawl') {
        this.camps = []; this.shardAt = 45; this.wyrmAt = 150; this.runeAt = 60; this.nextWave = 2; this.waveEvery = 25; this.overchargeAt = 240; this.respawnMul = 0.6;
        for (const h of this.heroes) { h.level = 5; h.points = 5; h.recalc(); h.hp = h.maxHp; h.gold = 1800; h.cdMul = this.mut.cd || 1; }
        if (this.mut.rune) this.runeAt = 30;
        if (this.mutator) { const mu = SF.MUTATOR[this.mutator]; this.later(1.5, () => this.announce(mu.name, 2, mu.desc)); }
        for (const u of this.units) if (isStructure(u)) { u.maxHp *= 0.7; u.hp = u.maxHp; }
      }
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
        { x: 1600, y: 870, rx: 110, ry: 56 }, { x: 1425, y: 300, rx: 78, ry: 58 }, { x: 1775, y: 300, rx: 78, ry: 58 }
      ];
    }

    // Training Grounds: the enemy heroes become target dummies in mid lane. They never act, heal to
    // full a few seconds after the last hit and stand back up 2 seconds after falling.
    setupPractice(o) {
      this.practice = { cd: o.cd !== false, gold: o.gold !== false, max: o.max !== false };
      this.shardAt = this.wyrmAt = 1e9; this.runeAt = 20;
      const spots = [[1680, 540], [1790, 650], [1900, 540]], p = this.player;
      this.heroes.filter(h => h.team === 1).forEach((h, i) => {
        h.brain = null; h.human = true; h.dummy = true; h.name = 'Dummy ' + (i + 1);
        h.x = spots[i][0]; h.y = spots[i][1]; h.spawn = { x: h.x, y: h.y };
      });
      if (this.practice.max) { p.level = p.points = MAX_LEVEL; p.xp = 0; }
      for (const h of this.heroes) if (h.dummy) { h.level = p.level; h.recalc(); h.hp = h.maxHp; }
      p.recalc(); p.hp = p.maxHp;
      if (this.practice.gold) p.gold = 99999;
    }
    practiceTick() {
      const p = this.player, o = this.practice;
      if (o.cd) { p.skillCd = [0, 0, 0]; p.spellCd = 0; }
      if (o.gold) p.gold = 99999;
      for (const h of this.heroes) if (h.dummy && h.alive && this.t - (h.lastHurt || -9) > 4) { h.hp = h.maxHp; h.shield = 0; h.slowT = 0; h.stunT = 0; }
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
        const h = new Hero(this, def, { team, x: f.x + (team === 0 ? 70 : -70), y: W.laneY + (slot - 1) * 70, skin: spec.skin || SF.defaultSkin(spec.id), name: spec.name, human, pid: spec.pid, isPlayer: false, spell: spec.spell });
        if (!human || o.autoplay) h.brain = new Brain(this, h, spec.difficulty || (o.roster || team === 0 ? 'normal' : o.difficulty));
        if (!human && team === 1 && !o.roster) h.botDmg = SF.DIFFICULTY[o.difficulty].dmg;
        this.add(h); this.heroes.push(h);
        return h;
      };
      if (o.roster) {
        o.roster.forEach((list, team) => list.forEach((spec, i) => mk(spec, team, i, !!spec.human)));
        this.player = this.heroes.find(h => h.human && h.pid != null && h.pid === o.localPid) || null;
      } else {
        this.player = mk({ id: o.hero, skin: o.skin, name: o.playerName || 'You', spell: o.spell }, 0, 1, true);
        o.allies.forEach((s, i) => mk(s, 0, i === 0 ? 0 : 2, false));
        o.enemies.forEach((s, i) => mk(s, 1, i, false));
      }
      if (this.player) this.player.isPlayer = true;
      // Each team gets one jungler. A human who brought Shard Smite is it; otherwise the bot best
      // suited to it (both teams get the same treatment, so neither side starts a camp behind).
      const JUNGLE_ROLES = ['Assassin', 'Fighter', 'Tank', 'Mage', 'Support', 'Marksman'];
      for (const team of [0, 1]) {
        if (this.heroes.some(h => h.team === team && h.human && h.spell === 'smite')) continue;
        const bots = this.heroes.filter(h => h.team === team && h.brain && !h.human);
        const j = JUNGLE_ROLES.map(r => bots.find(b => b.def0.role === r)).find(Boolean);
        if (j) j.brain.jungler = true;
      }
      // Bots without a chosen spell bring the one that suits their job.
      const specOf = h => (o.roster ? o.roster[h.team].find(s => s.pid === h.pid && s.id === h.def0.id) : null);
      for (const h of this.heroes) {
        if (!h.brain || h.human || (specOf(h) && specOf(h).spell)) continue;
        h.spell = h.brain.jungler ? 'smite' : SF.SPELL_FOR_ROLE[h.def0.role] || 'blink';
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
      for (const h of this.heroes) if (h.alive && h.tauntT > 0) this.tauntTick(h);
      for (const u of this.units) {
        if (!u.alive) continue;
        this.statusTick(u, dt);
        if (u.kind === 'minion') this.minionAI(u, dt);
        else if (isStructure(u)) this.towerAI(u, dt);
        else if (u.kind === 'monster') this.monsterAI(u, dt);
        else if (u.kind === 'summon') this.summonAI(u, dt);
      }
      if (this.walls.length) { for (const w of this.walls) w.t += dt; this.walls = this.walls.filter(w => w.t < w.dur); }
      for (const u of this.units) if (u.alive) this.combat(u, dt);
      for (const u of this.units) if (u.alive) this.move(u, dt);
      this.separate();
      this.updateProjs(dt);
      this.updateZones(dt);
      this.fountainTick(dt);
      if (this.practice) this.practiceTick();
      this.units = this.units.filter(u => u.alive || u.kind === 'hero' || isStructure(u) || (u.deadT += dt) < 0.6);
      if (this.t > 900 && !this.over && !this.practice) this.timeoutEnd();
    }

    timers(dt) {
      if (this.t >= this.nextWave) { this.spawnWave(); this.nextWave += this.waveEvery; }
      for (const c of this.camps) if (!c.unit && this.t >= c.respawnAt) this.spawnCamp(c);
      if (!this.shard && this.t >= this.shardAt) this.spawnShard();
      if (!this.wyrm && this.t >= this.wyrmAt) this.spawnWyrm();
      if (this.t >= this.runeAt) this.spawnRunes();
      if (this.t >= (this.cbAt || 0)) { this.cbAt = this.t + 1; this.comebackTick(); }
      if (this.t >= this.goldAt) { this.goldAt += 15; this.goldLine.push([Math.round(this.t), ...[0, 1].map(tm => Math.round(this.heroes.reduce((a, h) => a + (h.team === tm ? h.goldEarned : 0), 0)))]); }
      if (this.runes.length) this.runePickups();
      if (!this.overcharged && this.t >= this.overchargeAt) { this.overcharged = true; this.announce('Shards Overcharged', 2, 'Minions are empowered'); }
      for (const h of this.heroes) { this.addGold(h, 3.2 * (this.mut.gold || 1) * dt, true); if (h.alive) this.giveXp(h, 2 * dt); }
      if (this.later_.length) {
        const due = this.later_.filter(l => l.at <= this.t);
        this.later_ = this.later_.filter(l => l.at > this.t);
        due.forEach(l => l.fn());
      }
    }

    // Comeback gold: while a team trails by 1,500+ gold, its heroes carry a 'comeback' buff and their
    // kills, assists and tower takedowns pay 30% more (assists 50% more).
    comebackTick() {
      if (this.practice) return;
      const g = [0, 1].map(tm => this.heroes.reduce((a, h) => a + (h.team === tm ? h.goldEarned : 0), 0));
      const behind = g[1] - g[0] >= 1500 ? 0 : g[0] - g[1] >= 1500 ? 1 : -1;
      for (const h of this.heroes) {
        if (h.team === behind) h.addBuff({ id: 'comeback', t: 1.6, label: 'Comeback gold' });
        else if (h.hasBuff('comeback')) h.removeBuff('comeback');
      }
    }
    addGold(h, n, passive) { h.gold += n; h.goldEarned += n; if (!passive && h === this.player) this.emit('gold', n); }

    giveXp(h, n) {
      if (h.level >= MAX_LEVEL) return;
      h.xp += n;
      while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) {
        h.xp -= xpNeed(h.level); h.level++; h.points++; h.recalc();
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
      const cdDt = dt * (1 + h.bv('cdRate'));   // Stoneward Blessing speeds cooldowns up
      for (let i = 0; i < 3; i++) h.skillCd[i] = Math.max(0, h.skillCd[i] - cdDt);
      h.spellCd = Math.max(0, h.spellCd - dt);
      if (h.ccImmune > 0) h.ccImmune -= dt;
      this.passiveTick(h);
      h.hp = Math.min(h.maxHp, h.hp + (h.regen + h.maxHp * h.bv('regenPct')) * dt);
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
      if (u.tauntT > 0) { u.tauntT -= dt; if (u.tauntT <= 0) u.tauntBy = null; }
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

    // The Abyssal Wyrm: tougher than the Colossus, later, at the opposite end of the river. Its reward
    // is Wyrm Aegis: every hero on the team that slays it cheats death once in the next 150 seconds.
    spawnWyrm() {
      const mins = this.t / 60;
      this.wyrm = this.add(new Unit(this, {
        kind: 'monster', mtype: 'wyrm', team: 2, x: W.riverX, y: 1050, home: { x: W.riverX, y: 1050 },
        name: 'Abyssal Wyrm', maxHp: 6000 + 200 * mins, atk: 110 + 7 * mins, r: 58, def: 45, range: 170, as: 0.55, ms: 190, breathCd: 5
      }));
      this.wyrmSpawnedT = this.t;
      this.announce('The Abyssal Wyrm rises', 2, 'Slay it and your team cheats death once');
    }

    // River power-ups: fill any empty spot with a random shard, then again in 90 seconds.
    spawnRunes() {
      this.runeAt = this.t + (this.mut.rune || 90);
      const ids = Object.keys(SF.RUNES);
      let n = 0;
      for (const s of SF.RUNE_SPOTS) {
        if (this.runes.some(r => r.x === s.x && r.y === s.y)) continue;
        this.runes.push({ id: this.runeId++, x: s.x, y: s.y, type: ids[Math.floor(Math.random() * ids.length)], at: this.t });
        n++;
      }
      if (n) this.announce('Power Shards in the river', 2, 'Walk over one to take it');
    }
    runePickups() {
      for (const r of this.runes) {
        const h = this.heroes.find(x => x.alive && d2(x, r) < 48 * 48);
        if (h) this.takeRune(h, r);
      }
      this.runes = this.runes.filter(r => !r.taken);
    }
    takeRune(h, r) {
      r.taken = true;
      const R = SF.RUNES[r.type];
      if (r.type === 'haste') h.addBuff({ id: 'haste', t: 20, msMul: 0.3, label: 'Haste' });
      else if (r.type === 'renewal') this.heal(h, h.maxHp * 0.35);
      else if (r.type === 'bulwark') this.shieldUnit(h, h.maxHp * 0.2, 20);
      else if (r.type === 'fury') h.addBuff({ id: 'fury', t: 20, dmgMul: 0.15, label: 'Fury' });
      this.ring(r.x, r.y, 70, R.color, 0.5, 5); this.burst(r.x, r.y - 20, R.color, 18, 200);
      this.feed.unshift({ msg: `took a ${R.name}`, from: h, team: h.team, t: this.t });
      this.feed.length = Math.min(this.feed.length, 5);
      this.emit('rune', h, r.type);
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
      if (this.practice) { u.target = null; return; }   // towers stand down in the Training Grounds
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
      if (u.mtype === 'wyrm' && u.aggro) {
        u.breathCd -= dt;
        if (u.breathCd <= 0) {
          u.breathCd = 6;
          for (const h of this.heroes) if (h.alive && d2(h, u) < 270 * 270) { this.applyDamage(u, h, 130 + 0.04 * h.maxHp); this.slow(h, 0.4, 1.5); }
          this.ring(u.x, u.y, 270, '#b48cff', 0.6, 9); this.burst(u.x, u.y - 40, '#c9a6ff', 26, 300); this.shake(6);
        }
      }
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
      if (h.tauntT > 0) return 'taunted';
      if (!h.ranks[i]) return i === 2 && h.level < 4 ? 'locked' : 'unranked';
      aim = aim || this.resolveAim(h, i, null);
      if (s.needsTarget && !aim.target) return 'notarget';
      if (s.needsTarget && dist(aim.target, h) > s.range + aim.target.r + 10) return 'notarget';
      h.recallT = 0;
      if (h.invisT > 0 && s.id !== 'veil') h.invisT = 0;
      if (!SK[s.id](this, h, aim, s)) return 'notarget';
      h.skillCd[i] = SF.skillCdOf(h, i);
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
    // ---- constructions (Quarra) -------------------------------------------------------
    summon(owner, mtype, x, y, o) {
      return this.add(new Unit(this, Object.assign({
        kind: 'summon', mtype, team: owner.team, owner, x: clamp(x, 40, W.w - 40), y: clamp(y, 60, W.h - 60), ms: 0, born: this.t,
        color: skinC(owner), name: mtype === 'bastion' ? 'Crystal Bastion' : 'Shard Turret'
      }, o)));
    }
    unsummon(u) { if (!u.alive) return; u.alive = false; u.deadT = 0; u.target = null; this.burst(u.x, u.y - 20, u.color || '#fff', 12, 160); }
    summonAI(u, dt) {
      u.life -= dt;
      if (u.life <= 0) { this.unsummon(u); return; }
      const R = u.range + 8, o = u.owner;
      // Shoot what the owner is fighting if it's in reach, else keep the current target, else the nearest enemy.
      const want = o && o.alive && o.target && this.valid(u, o.target) && d2(o.target, u) < (R + o.target.r) ** 2 ? o.target : null;
      if (want) u.target = want;
      else if (!this.valid(u, u.target) || d2(u, u.target) > (R + u.target.r) ** 2) {
        let best = null, bs = 1e18;
        for (const e of this.units) {
          if (!e.alive || e.team === u.team || e.team === 2 && e.kind !== 'monster' || !this.targetable(e) || !this.visible(e, u.team)) continue;
          if (e.kind === 'monster' && !e.aggro) continue;   // don't wake jungle camps
          const dd = d2(e, u); if (dd > (R + e.r) ** 2) continue;
          const sc = dd - (e.kind === 'hero' ? 120000 : 0);
          if (sc < bs) { bs = sc; best = e; }
        }
        u.target = best;
      }
      if (u.mtype === 'bastion') {
        u.pulse = (u.pulse || 0) - dt;
        if (u.pulse <= 0) {
          u.pulse = 1;
          for (const a of this.heroes) if (a.alive && a.team === u.team && d2(a, u) < 350 * 350 && a.shield < u.shieldAmt * 3) this.shieldUnit(a, u.shieldAmt, 1.6);
          this.ring(u.x, u.y, 350, u.color, 0.4, 2);
        }
      }
    }
    // Prism Wall: enemies of the wall's team can't cross its line (walking, dashing or knocked back).
    wallBlock(u, ox, oy) {
      for (const w of this.walls) {
        if (w.team === u.team) continue;
        const along = (u.x - w.x) * w.n.x + (u.y - w.y) * w.n.y;
        if (Math.abs(along) > w.half + u.r) continue;
        const was = (ox - w.x) * w.d.x + (oy - w.y) * w.d.y, now = (u.x - w.x) * w.d.x + (u.y - w.y) * w.d.y, gap = w.thick + u.r;
        const side = was >= 0 ? 1 : -1;
        if (now * side < gap) {   // would cross or press into it: stop at our own face of the wall
          const k = gap * side - now;
          u.x += w.d.x * k; u.y += w.d.y * k;
          if (u.dash) u.dash.left = 0;
        }
      }
    }

    // ---- hero passives ----------------------------------------------------------------
    // Basic-attack passives. Returns the attack's damage; may tag the hit (opt.gale).
    passiveAttack(u, t, dmg, opt) {
      switch (u.def0.passive.id) {
        case 'kindling':   // Kaida: 2 stacks from skill hits -> an erupting, healing attack
          if (u.pstack >= 2) { dmg *= 1.6; u.pstack = 0; this.heal(u, u.maxHp * 0.1, false, u); this.burst(t.x, t.y, '#ff8a3d', 18, 240); this.ring(t.x, t.y, 70, '#ffb347', 0.3, 5); }
          break;
        case 'galewind':   // Sylva: every 4th attack
          u.pstack = (u.pstack || 0) + 1;
          if (u.pstack >= 4) { u.pstack = 0; dmg *= 1.4; opt.gale = true; this.burst(u.x, u.y - 20, '#c8ffe0', 10, 200); }
          break;
        case 'masterwork': // Quarra: bonus on enemies her turrets recently hit
          if (t.markBy === u && t.markT > this.t) dmg *= 1.25;
          break;
        case 'predator':   // Nyx
          if (t.kind === 'hero' && t.hpPct < 0.5) dmg *= 1.15;
          break;
        case 'focus':      // Rhea: ramps on one target
          if (u.focusT === t) u.pstack = Math.min(4, (u.pstack || 0) + 1); else { u.focusT = t; u.pstack = 0; }
          dmg *= 1 + 0.08 * u.pstack;
          break;
        case 'dawnlight': { // Lumen: every 6s an attack also heals the most wounded ally nearby
          if (u.dawnT > this.t) break;
          let best = null;
          for (const a of this.heroes) if (a.alive && a.team === u.team && a.hpPct < 1 && d2(a, u) < 600 * 600 && (!best || a.hpPct < best.hpPct)) best = a;
          if (best) { this.heal(best, best.maxHp * 0.04, false, u); this.beam(u, best, '#fff3b0'); this.burst(best.x, best.y - 20, '#fff3b0', 8, 120); u.dawnT = this.t + 6; }
          break;
        }
      }
      return dmg;
    }
    // Passives on hero-vs-hero hits (attacks and skills). Returns the damage.
    passiveHit(src, t, amt, o) {
      const id = src.def0.passive.id;
      if (o.skill) {
        if (id === 'kindling' && (src.pstack || 0) < 2) { src.pstack = (src.pstack || 0) + 1; src.pstackT = this.t + 6; }
        if (id === 'undertow') { if (t.soakT > this.t && t.soakBy === src) amt *= 1.2; t.soakT = this.t + 3; t.soakBy = src; }
        if (id === 'overcharge') {
          src.pstack = Math.min(3, (src.pstack || 0) + 1);
          if (src.pstack >= 3 && !(src.ochT > this.t)) { this.stun(t, 0.6); src.pstack = 0; src.ochT = this.t + 5; this.bolt(t.x, t.y, '#d9b8ff'); }
        }
      }
      // Tidewall (Oska): allies near an Oska take less damage from heroes.
      for (const a of this.heroes) if (a.alive && a.team === t.team && a.def0.passive.id === 'tidewall' && d2(a, t) < 450 * 450) { amt *= 0.92; break; }
      return amt;
    }
    // Per-tick passive upkeep (stack timeouts, Bloodrage).
    passiveTick(h) {
      const id = h.def0.passive.id;
      if (id === 'kindling' && h.pstack && this.t > h.pstackT) h.pstack = 0;
      if (id === 'bloodrage') {
        h.rage = clamp((1 - h.hpPct) / 0.8, 0, 1);
        if (h.rage > 0.02) h.addBuff({ id: 'bloodrage', t: 0.3, asMul: 0.4 * h.rage }); else h.removeBuff('bloodrage');
      }
    }

    // ---- skill ranks ------------------------------------------------------------------
    rankCap(h, i) { const R = SF.SKILL_RANK; return i === 2 ? R.ultAt.filter(l => h.level >= l).length : Math.min(R.max[i], Math.ceil(h.level / 2)); }
    canUpgrade(h, i) { return h.points > 0 && i >= 0 && i < 3 && h.ranks[i] < this.rankCap(h, i); }
    upgradeSkill(h, i) {
      if (!this.canUpgrade(h, i)) return false;
      h.ranks[i]++; h.points--;
      this.emit('upgrade', h, i);
      return true;
    }
    // The order bots (and auto-upgrade) use: ultimate whenever possible, unlock both basic skills,
    // then max the first one.
    autoUpgrade(h) {
      let n = 0;
      while (h.points > 0) {
        const i = [2, ...(h.ranks[0] ? [] : [0]), ...(h.ranks[1] ? [] : [1]), 0, 1].find(k => this.canUpgrade(h, k));
        if (i == null || !this.upgradeSkill(h, i)) break;
        n++;
      }
      return n;
    }

    // ---- quick signals --------------------------------------------------------------
    // A human tells their team what to do. Bot allies follow the latest order for a while.
    //   attack:  the closest visible enemy hero, else the enemy's front structure
    //   retreat: fall back to our front structure
    //   gather:  take the Colossus if it's up, else group up on the signaller
    signal(h, kind) {
      if (!SF.SIGNALS[kind] || this.over) return false;
      if (this.t - (h.sigT == null ? -9 : h.sigT) < 1.5) return false;   // no spamming
      h.sigT = this.t;
      let target = null, x = h.x, y = h.y, text;
      if (kind === 'attack') {
        let bs = 900 * 900;
        for (const e of this.heroes) if (e.alive && e.team !== h.team && this.visible(e, h.team) && d2(e, h) < bs) { bs = d2(e, h); target = e; }
        if (!target) target = this.frontStructure(1 - h.team);
        text = target.kind === 'hero' ? `Attack ${target.name}!` : target.kind === 'core' ? 'Hit the Heartstone!' : 'Push the tower!';
      } else if (kind === 'retreat') {
        target = this.frontStructure(h.team); text = 'Retreat!';
      } else {
        const obj = [this.shard, this.wyrm].filter(u => u && u.alive).sort((a, b) => d2(a, h) - d2(b, h))[0];
        target = obj || h; text = obj ? (obj.mtype === 'wyrm' ? 'Take the Wyrm!' : 'Take the Colossus!') : 'Group up!';
      }
      if (kind !== 'retreat') { x = target.x; y = target.y; }
      const s = { kind, team: h.team, x, y, t: this.t, from: h, target, text, until: this.t + SF.SIGNALS[kind].dur };
      this.signals.push(s);
      this.signals = this.signals.filter(q => this.t - q.t < 6);
      this.orders[h.team] = s;
      this.message(h, text);
      this.emit('signal', s);
      // One bot ally answers, so it's clear the call was heard.
      const bot = this.heroes.find(b => b.team === h.team && b.alive && b.brain && !b.human);
      if (bot) this.later(0.6, () => { if (bot.alive) this.message(bot, SF.SIGNALS[kind].reply); });
      return true;
    }
    message(h, text) {
      this.feed.unshift({ msg: text, from: h, team: h.team, t: this.t });
      this.feed.length = Math.min(this.feed.length, 5);
      this.emit('message', h, text);
    }

    // ---- battle spells ---------------------------------------------------------
    // Smite: the Colossus first, then camps, then minions. Shatter: the enemy hero with the least health.
    spellTarget(h, id) {
      const R = SF.SPELLS[id].range || 0;
      let best = null, bs = 1e18;
      for (const u of this.units) {
        if (!u.alive || u.team === h.team || !this.visible(u, h.team)) continue;
        if (id === 'shatter' ? u.kind !== 'hero' : u.kind !== 'monster' && u.kind !== 'minion') continue;
        const D = dist(u, h) - u.r;
        if (D > R) continue;
        const sc = id === 'shatter' ? u.hp : (u.mtype === 'colossus' || u.mtype === 'wyrm' ? 0 : u.kind === 'monster' ? 1e5 : 2e5) + D;
        if (sc < bs) { bs = sc; best = u; }
      }
      return best;
    }
    // True when Smite or Shatter would land the killing blow right now (the HUD makes the button glow).
    spellWouldKill(h) {
      if (!h.alive || h.spellCd > 0 || (h.spell !== 'smite' && h.spell !== 'shatter')) return false;
      const t = this.spellTarget(h, h.spell);
      return !!t && SF.spellDamage(h.spell, h, t) >= t.hp + (t.shield || 0);
    }
    // aim.dir steers Blink; aim.target overrides the automatic Smite / Shatter target.
    useSpell(h, aim = {}) {
      const id = h.spell, S = SF.SPELLS[id];
      if (!h.alive || h.spellCd > 0) return 'cooldown';
      if (h.dash) return 'busy';
      if (h.stunT > 0 && id !== 'purify') return 'stunned';
      switch (id) {
        case 'blink': {
          const d = aim.dir ? norm(aim.dir.x, aim.dir.y) : h.face;
          this.burst(h.x, h.y, '#fff7c2', 12, 160);
          h.x = clamp(h.x + d.x * 250, 40, W.w - 40); h.y = clamp(h.y + d.y * 250, 60, W.h - 60);
          for (const z of this.zones) if (z.trapped) z.trapped.delete(h);   // the one way out of the Great Bell
          h.face = { x: d.x, y: d.y }; h.dash = null;
          this.burst(h.x, h.y, '#fff7c2', 12, 160);
          break;
        }
        case 'mend':
          for (const a of this.heroes) {
            if (!a.alive || a.team !== h.team || d2(a, h) > 520 * 520) continue;
            this.heal(a, a.maxHp * 0.15, false, h);
            a.addBuff({ id: 'mend', t: 2, msMul: 0.2 });
            this.burst(a.x, a.y - 20, '#7dffa0', 12, 140);
          }
          this.ring(h.x, h.y, 520, '#7dffa0', 0.5, 4);
          break;
        case 'smite':
        case 'shatter': {
          const a = aim.target;
          const ok = a && a.alive && a.team !== h.team && this.visible(a, h.team) && dist(a, h) - a.r <= S.range + 30 &&
            (id === 'shatter' ? a.kind === 'hero' : a.kind === 'monster' || a.kind === 'minion');
          const t = ok ? a : this.spellTarget(h, id);
          if (!t) return 'notarget';
          this.fx.push({ type: 'lightning', x: t.x, y: t.y, color: id === 'smite' ? '#ffe27a' : '#c8a2ff', dur: 0.35, t: 0 });
          this.burst(t.x, t.y, id === 'smite' ? '#ffe27a' : '#c8a2ff', 18, 240);
          this.applyDamage(h, t, SF.spellDamage(id, h, t), { true: true, skill: true });
          if (id === 'smite') this.heal(h, h.maxHp * 0.05, false, h);
          h.face = norm(t.x - h.x, t.y - h.y);
          if (t.kind === 'hero') { h.revealT = this.t + 1; h.invisT = 0; }
          break;
        }
        case 'sprint':
          h.addBuff({ id: 'sprint', t: 8, msMul: 0.4, label: 'Sprint' });
          this.burst(h.x, h.y, '#8fd3ff', 10, 160);
          break;
        case 'purify':
          h.stunT = 0; h.slowT = 0; h.tauntT = 0; h.tauntBy = null; h.ccImmune = 1.5;
          this.ring(h.x, h.y, 70, '#ffffff', 0.4, 4);
          this.burst(h.x, h.y - 20, '#ffffff', 14, 180);
          break;
      }
      h.spellCd = S.cd; h.recallT = 0;
      this.emit('spell', h, id);
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
      const opt = { basic: true };
      if (u.kind === 'hero') {
        u.revealT = this.t + 1; u.invisT = 0; u.recallT = 0;
        if (u.hasBuff('veilstrike')) { dmg *= 2; u.removeBuff('veilstrike'); this.burst(t.x, t.y, '#b49bff', 12, 200); }
        if (u.hasBuff('mirror')) { dmg *= 1.8; u.removeBuff('mirror'); this.burst(t.x, t.y, skinC(u), 12, 200); }
        dmg = this.passiveAttack(u, t, dmg, opt);
        if (u.crit > 0 && Math.random() < u.crit) { dmg *= 1.75; opt.crit = true; }
      }
      if (u.range > 200) {
        const src = isStructure(u) ? { x: u.x, y: u.y - (u.kind === 'core' ? 90 : 80) } : { x: u.x + u.face.x * u.r, y: u.y + u.face.y * u.r };
        this.projs.push({
          homing: t, x: src.x, y: src.y, speed: isStructure(u) ? 950 : 1150, dmg, src: u, team: u.team, basic: true, opt,
          color: u.kind === 'hero' ? skinC(u) : u.color || SF.TEAM_COLORS[u.team], r: isStructure(u) ? 10 : u.kind === 'hero' ? 6 : u.kind === 'summon' ? (u.mtype === 'bastion' ? 9 : 6) : 4,
          kind: isStructure(u) ? 'bolt' : 'basic'
        });
      } else {
        this.applyDamage(u, t, dmg, opt);
        if (u.kind === 'hero' || u.kind === 'monster') this.slashFx(t.x, t.y, Math.atan2(u.face.y, u.face.x), u.kind === 'hero' ? skinC(u) : '#e8d9a8');
      }
      if (u.mtype === 'bastion') {   // Crystal Bastion fires at two enemies at once
        const t2 = this.units.find(e => e.alive && e !== t && e.team !== u.team && e.team !== 2 && this.targetable(e) && this.visible(e, u.team) && d2(e, u) < (u.range + e.r) ** 2);
        if (t2) this.projs.push({ homing: t2, x: u.x, y: u.y - 30, speed: 1000, dmg, src: u, team: u.team, basic: true, opt: { basic: true }, color: u.color, r: 9, kind: 'basic' });
      }
      if (u === this.player || t === this.player) this.emit('hit', u, t);
    }
    applyDamage(src, t, amt, o = {}) {
      if (!t.alive || t.rebornT > this.t) return 0;
      if (isStructure(t) && !this.targetable(t)) return 0;
      if (o.skill && o.skill.id && src && src.ranks) {
        const i = src.def0.skills.indexOf(o.skill);
        if (i >= 0) amt *= SF.SKILL_RANK.dmg[i][Math.max(0, src.ranks[i] - 1)];
      }
      if (src && src.passives && src.passives.size && t.kind === 'hero') {
        // Nightglass: a skill hit adds 6% of the target's max health, once per 1.5s per target.
        if (o.skill && src.passives.has('glass') && !(t.glassT > this.t)) { amt += 0.06 * t.maxHp; t.glassT = this.t + 1.5; }
        if (src.passives.has('wither')) t.witherT = this.t + 2.5;
      }
      if (o.basic && src && src.passives && src.passives.has('frost') && !isStructure(t)) this.slow(t, 0.2, 1);
      if (o.gale && !isStructure(t)) this.slow(t, 0.3, 0.8);
      if (src && src.kind === 'hero' && this.mut.dmg) amt *= this.mut.dmg;
      if (src && src.kind === 'hero' && t.kind === 'hero' && t.team !== src.team) amt = this.passiveHit(src, t, amt, o);
      // Spined Carapace: reflect a quarter of a hero's attack back as true damage.
      if (o.basic && !o.reflect && t.passives && t.passives.has('thorns') && src && src.kind === 'hero' && src.alive) this.applyDamage(t, src, amt * 0.25, { true: true, reflect: true });
      if (src && src.dmgMul && !o.true) amt *= src.dmgMul();
      if (src && src.botDmg) amt *= src.botDmg;
      if (src && src.kind === 'hero' && isStructure(t)) {
        let covered = false;
        for (const u of this.units) if (u.alive && u.kind === 'minion' && u.team === src.team && d2(u, t) < (t.range + 80) ** 2) { covered = true; break; }
        if (!covered) amt *= 0.4;
      }
      if (isStructure(t) && this.t < 240 && this.mode === 'classic') amt *= 0.5; // early-game fortification
      if (!o.true) {   // true damage (Smite, Shatter) ignores defense and damage reduction
        amt *= 100 / (100 + Math.max(0, t.def));
        amt *= 1 - Math.min(0.6, t.bv('dmgRed'));
        // Unbroken (Tolvar): heroes he has taunted hit him for 25% less.
        if (src && src.tauntBy === t && src.tauntT > 0 && t.def0.passive.id === 'unbroken') amt *= 0.75;
      }
      // Bedrock (Brakka): falling below 40% raises a shield that already soaks this hit.
      if (t.kind === 'hero' && t.def0.passive.id === 'bedrock' && !(t.bedrockT > this.t) && t.hp + t.shield - amt < t.maxHp * 0.4 && t.hp > t.maxHp * 0.4) {
        this.shieldUnit(t, t.maxHp * 0.12, 4); t.bedrockT = this.t + 30;
        this.ring(t.x, t.y, 80, '#c9b27a', 0.5, 5); this.burst(t.x, t.y - 30, '#e8d9a8', 16, 160);
      }
      if (t.shield > 0) { const s = Math.min(t.shield, amt); t.shield -= s; amt -= s; }
      const dealt = Math.max(0, Math.min(amt, t.hp));   // overkill doesn't count in stats or the recap
      if (t.kind === 'hero' && amt > 0) {
        this.took(t, src, dealt, o.true ? 'true' : o.skill ? 'skill' : 'basic');
        t.dmgTaken = (t.dmgTaken || 0) + dealt;
        if (src && src.kind === 'hero') src.heroDmg = (src.heroDmg || 0) + dealt;
      }
      t.hp -= amt; t.flash = 0.1;
      if (src && src.kind === 'summon' && src.owner) {
        if (t.kind === 'hero') { t.hitBy.set(src.owner, this.t); src.owner.aggroT = this.t; }
        if (src.owner.def0.passive.id === 'masterwork') { t.markT = this.t + 3; t.markBy = src.owner; }
      }
      if (src && src.kind === 'hero') {
        src.dmgDealt += amt;
        const ls = src.lifesteal + (src.def0.passive.id === 'bloodrage' ? 0.15 * (src.rage || 0) : 0);   // Bloodrage (Drace)
        if (o.basic && ls) src.hp = Math.min(src.maxHp, src.hp + amt * ls * (src.witherT > this.t ? 0.5 : 1));
        if (t.kind === 'hero') { src.aggroT = this.t; t.hitBy.set(src, this.t); }
      }
      if (t.kind === 'hero' && t.recallT > 0) t.recallT = 0;
      if (t.kind === 'monster' && src && !t.resetting) t.aggro = src;
      if (amt >= 1 && (src === this.player || t === this.player) && !(SF.gfx && SF.gfx.numbers === false)) {
        const col = t === this.player ? '#ff6b7a' : o.crit ? '#ffd23f' : o.skill ? '#ffb347' : '#ffffff';
        this.float(t.x + (Math.random() - 0.5) * 20, t.y - t.r - 26, o.crit ? Math.round(amt) + '!' : Math.round(amt), col, o.crit ? 1.55 : o.skill ? 1.25 : 1);
      }
      if (t.hp <= 0 && t.kind === 'hero' && t.hasBuff('aegis')) this.aegisSave(t);
      if (t.hp <= 0) this.kill(t, src);
      return amt;
    }
    // Death recap: damage each hero took over the last few seconds, grouped by who dealt it.
    took(t, src, amt, kind) {
      t.lastHurt = this.t;
      const log = t.taken || (t.taken = []);
      log.push({ at: this.t, src, amt, kind });
      while (log.length && log[0].at < this.t - 12) log.shift();
    }
    recap(t, killer) {
      const since = this.t - 10, groups = new Map();
      let total = 0;
      for (const e of t.taken || []) {
        if (e.at < since) continue;
        const s = e.src, key = !s ? 'other' : s.kind === 'minion' ? 'minions' : s;
        let g = groups.get(key);
        if (!g) {
          const named = s && (s.name || ({ tower: 'Tower', core: 'Heartstone', monster: s.mtype === 'colossus' ? 'Shard Colossus' : 'Jungle monster' })[s.kind]);
          g = { name: !s ? 'Other' : s.kind === 'minion' ? 'Minions' : named || 'Unknown', hero: s && s.kind === 'hero' ? s.def0.id : null, skin: s && s.skin, team: s ? s.team : 2, total: 0, basic: 0, skill: 0, true: 0, src: s && s.kind !== 'minion' ? s : null };
          groups.set(key, g);
        }
        g.total += e.amt; g[e.kind] += e.amt; total += e.amt;
      }
      const rows = [...groups.values()].sort((a, b) => b.total - a.total);
      return { total, rows, killer: killer || null };
    }
    // Wyrm Aegis: instead of dying, come back at 40% health, untouchable for 1.5 seconds.
    aegisSave(t) {
      t.removeBuff('aegis');
      t.hp = t.maxHp * 0.4; t.rebornT = this.t + 1.5; t.stunT = 0; t.slowT = 0;
      this.ring(t.x, t.y, 110, '#c58bff', 0.7, 7); this.burst(t.x, t.y - 30, '#e6d0ff', 30, 260); this.shake(5);
      this.announce('Aegis', t.team, `${t.name} cheats death`);
      this.emit('aegis', t);
    }
    lastHero(t) {
      let best = null, bt = this.t - 10;
      if (t.hitBy) for (const [h, when] of t.hitBy) if (when > bt) { bt = when; best = h; }
      return best;
    }
    kill(t, src) {
      t.alive = false; t.hp = 0; t.deadT = 0; t.target = null; t.dash = null; t.knock = null; t.want = null;
      const killer = src && src.kind === 'hero' ? src : src && src.owner && src.owner.kind === 'hero' ? src.owner : (t.kind === 'hero' ? this.lastHero(t) : null);
      if (t.kind === 'summon') { this.burst(t.x, t.y - 20, t.color || '#fff', 14, 180); return; }
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
        } else if (t.mtype === 'wyrm') {
          this.wyrm = null; this.wyrmAt = this.t + 240;
          if (team >= 0) {
            for (const h of this.heroes) if (h.team === team) {
              this.addGold(h, 200); this.giveXp(h, 250);
              if (h.alive) h.addBuff({ id: 'aegis', t: 150, label: 'Wyrm Aegis' });
            }
            this.teamStats[team].wyrms++;
            this.announce(team === 0 ? 'Your team slew the Wyrm' : 'Enemy slew the Wyrm', team, 'Wyrm Aegis: cheat death once in the next 150s');
            this.shake(8);
          }
        } else {
          t.camp.unit = null; t.camp.respawnAt = this.t + 70;
          if (killer) {
            this.addGold(killer, t.gold); this.giveXp(killer, t.xp);
            if (killer === this.player) this.float(t.x, t.y - 34, '+' + t.gold, '#ffc84a', 1.1);
            // The two jungle blessings: Ember Wisp for damage, Thornback for cooldowns and regeneration.
            if (t.mtype === 'wisp') killer.addBuff({ id: 'ember', t: 70, dmgMul: 0.1, label: 'Ember Blessing' });
            if (t.mtype === 'thorn') killer.addBuff({ id: 'stoneward', t: 70, cdRate: 0.2, regenPct: 0.004, label: 'Stoneward Blessing' });
          }
        }
      } else if (isStructure(t)) {
        const team = 1 - t.team;
        for (const h of this.heroes) if (h.team === team) this.addGold(h, h.hasBuff('comeback') ? 200 : 150);
        if (killer) { this.addGold(killer, 100); killer.towers++; }
        this.teamStats[team].towers++;
        this.burst(t.x, t.y - 40, SF.TEAM_COLORS[t.team], 40, 360); this.shake(10);
        this.emit('tower', t, killer);
        if (t.kind === 'core') this.end(team);
        else this.announce(t.team === 0 ? 'Your tower has fallen' : 'Enemy tower destroyed', team);
      } else if (t.kind === 'hero') {
        t.dth++; t.respawnT = this.practice ? 2 : (6 + t.level * 2 + Math.min(10, this.t / 60)) * this.respawnMul; t.recallT = 0; t.buffs = []; t.shield = 0; t.slowT = 0; t.stunT = 0; t.invisT = 0; t.tauntT = 0; t.tauntBy = null;
        const shutdown = t.streak >= 3;
        const bounty = 220 + (shutdown ? 50 * Math.min(6, t.streak) : 0);
        t.streak = 0;
        this.kills[1 - t.team]++;
        const assists = [];
        for (const [h, when] of t.hitBy) if (h !== killer && h.team !== t.team && this.t - when < 10) assists.push(h);
        if (killer) {
          killer.k++; this.addGold(killer, Math.round(bounty * (killer.hasBuff('comeback') ? 1.3 : 1))); killer.streak++;
          killer.multiN = killer.multiT > 0 ? killer.multiN + 1 : 1; killer.multiT = 10;
          killer.bestMulti = Math.max(killer.bestMulti || 0, killer.multiN);
        }
        assists.forEach(h => { h.ast++; this.addGold(h, h.hasBuff('comeback') ? 135 : 90); });
        t.pstack = 0;
        for (const h of [killer, ...assists]) if (h && h.alive && h.def0.passive.id === 'predator') { h.skillCd[0] = 0; this.burst(h.x, h.y, '#b49bff', 14, 200); }
        const near = this.heroes.filter(h => h.alive && h.team !== t.team && d2(h, t) < 1000 * 1000);
        near.forEach(h => this.giveXp(h, (140 + 30 * t.level) * (near.length > 1 ? 0.65 : 1)));
        t.recapInfo = this.recap(t, killer || src);
        t.taken = [];
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
    slow(u, amt, dur) { if (isStructure(u) || u.ccImmune > 0) return; if (u.kind === 'hero' && u.def0.passive.id === 'unbroken') dur *= 0.7; if (u.slowT <= 0 || amt >= u.slowAmt) u.slowAmt = amt; u.slowT = Math.max(u.slowT, dur); }
    stun(u, dur) {
      if (isStructure(u) || u.stunImmune > 0 || u.ccImmune > 0) return;
      if (u.kind === 'hero' && u.def0.passive.id === 'unbroken') dur *= 0.7;
      u.stunT = Math.max(u.stunT, dur); if (u.kind === 'hero') u.recallT = 0;
    }
    // Taunt: the hero has to walk to `by` and attack it, and can't use skills or recall. Spells still work.
    taunt(u, by, dur) {
      if (u.kind !== 'hero' || u.ccImmune > 0 || u.stunImmune > 0) return;
      if (u.def0.passive.id === 'unbroken') dur *= 0.7;
      if (!(u.tauntT > 0) || u.tauntBy === by) { u.tauntT = Math.max(u.tauntT || 0, dur); u.tauntBy = by; u.recallT = 0; }
    }
    tauntTick(h) {
      const by = h.tauntBy;
      if (!by || !by.alive || !(h.tauntT > 0)) { h.tauntT = 0; h.tauntBy = null; return; }
      if (h.dummy) return;   // Training Grounds dummies show the taunt but stay put
      h.target = by; h.want = null; h.wantDir = null; h.attackHeld = false; h.recallT = 0;
    }
    // Great Bell: a trapped hero can't leave the ring.
    bellBlock(u) {
      for (const z of this.zones) {
        if (z.kind !== 'bell' || !z.started || !z.trapped || !z.trapped.has(u)) continue;
        const dx = u.x - z.x, dy = u.y - z.y, D = Math.hypot(dx, dy) || 1, max = z.r - u.r * 0.5;
        if (D > max) { u.x = z.x + dx / D * max; u.y = z.y + dy / D * max; if (u.dash) u.dash.left = 0; u.knock = null; }
      }
    }
    shieldUnit(u, amt, dur) { u.shield += amt; u.shieldT = Math.max(u.shieldT, dur); }
    // src: the hero doing the healing, for the post-match healing stat.
    heal(u, amt, quiet, src) {
      if (u.witherT > this.t) amt *= 0.5;   // Witherblade
      const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + amt);
      if (src && src.kind === 'hero') src.healed = (src.healed || 0) + (u.hp - before);
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
    unitsOnLine(team, x0, y0, dir, len, half) {
      const out = [];
      for (const u of this.units) {
        if (!u.alive || u.team === team || isStructure(u)) continue;
        const dx = u.x - x0, dy = u.y - y0, along = dx * dir.x + dy * dir.y;
        if (along < -u.r || along > len + u.r) continue;
        if (Math.abs(dx * dir.y - dy * dir.x) <= half + u.r) out.push(u);
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
      if (isStructure(u) || u.kind === 'summon') return;
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
      if (this.walls.length) this.wallBlock(u, ox, oy);
      if (this.zones.length && u.kind === 'hero') this.bellBlock(u);
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
          if (!s.alive || !(isStructure(s) || s.kind === 'summon')) continue;
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
          if (L <= step + t.r * 0.6) { p.dead = true; this.applyDamage(p.src, t, p.dmg, p.opt || { basic: p.basic }); }
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
    beam(a, b, color) { this.fx.push({ type: 'beam', x: a.x, y: a.y, x2: b.x, y2: b.y, color, t: 0, dur: 0.25 }); }
    bolt(x, y, color) { this.fx.push({ type: 'lightning', x, y, color, t: 0, dur: 0.3 }); this.ring(x, y, 90, color, 0.35, 4); this.burst(x, y, color, 10, 200); }
    burst(x, y, color, n, sp) {
      if (SF.gfx && SF.gfx.low) n = Math.ceil(n / 3);
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
        k: h.k, d: h.dth, a: h.ast, multi: h.bestMulti || 0, gold: Math.round(h.goldEarned), dmg: Math.round(h.dmgDealt), level: h.level, towers: h.towers,
        hd: Math.round(h.heroDmg || 0), tk: Math.round(h.dmgTaken || 0), hl: Math.round(h.healed || 0),
        score: h.k * 3 + h.ast * 2 - h.dth * 1.5 + h.dmgDealt / 1500 + h.towers * 2 + h.goldEarned / 1200
      }));
      const winners = rows.filter(r => r.team === this.winner);
      const mvp = winners.reduce((a, r) => (!a || r.score > a.score ? r : a), null);
      const g0 = rows.reduce((a, r) => a + (r.team === 0 ? r.gold : 0), 0), g1 = rows.reduce((a, r) => a + (r.team === 1 ? r.gold : 0), 0);
      const goldLine = this.goldLine.concat([[Math.round(this.t), g0, g1]]);
      return { winner: this.winner, won: this.winner === 0, time: this.t, kills: this.kills.slice(), rows, mvp, teamStats: this.teamStats, goldLine };
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
      if (h.points > 0) m.autoUpgrade(h);
      const nxt = h.nextItem(); if (nxt && h.gold >= SF.ITEMS[nxt].cost) m.buy(h, nxt);
      if (h.recallT > 0) return;
      const hp = h.hpPct, f = m.fountains[h.team];
      if (m.inFountain(h) && hp < 0.9) { h.want = null; h.target = null; return; }
      const foes = m.heroes.filter(e => e.alive && e.team !== h.team && m.visible(e, h.team) && d2(e, h) < 760 * 760);
      if (h.spellCd <= 0 && this.spellLogic(foes)) return;
      if (h.tauntT > 0) return;   // taunted: the match walks it to Tolvar
      const order = m.orders[h.team];
      if (order && m.t < order.until && order.from !== h && hp > this.D.retreat + 0.05 && this.obey(order, foes)) return;

      if (hp < this.D.retreat || (hp < 0.5 && foes.length >= 2 && this.alliesNear(700) < foes.length)) {
        const close = foes.some(e => d2(e, h) < 620 * 620);
        if (!close && !m.towerCovers(1 - h.team, h, h.r)) { m.startRecall(h); return; }
        h.target = null; h.want = { x: f.x, y: f.y };
        this.escape();
        return;
      }

      // Team-fight targeting: low health and close first, then by job. Divers reach for the squishy
      // backline, tanks and supports peel whoever is hitting a teammate, and everyone leans toward
      // the enemy their team is already focusing.
      const role = h.def0.role, diver = role === 'Assassin' || role === 'Fighter', guard = role === 'Tank' || role === 'Support';
      let best = null, bs = -1e9;
      for (const e of foes) {
        const D = dist(e, h); if (D > 620) continue;
        let sc = -e.hpPct * 100 - D / 8 + (e.hp < h.atk * 3 ? 40 : 0);
        if (diver && (e.def0.role === 'Marksman' || e.def0.role === 'Mage' || e.def0.role === 'Support')) sc += 25;
        const victim = e.target && e.target.kind === 'hero' && e.target.team === h.team ? e.target : null;
        if (guard && victim && victim !== h && d2(victim, h) < 600 * 600) sc += 45;
        if (m.heroes.some(a => a !== h && a.alive && a.team === h.team && a.target === e)) sc += 15;
        if (sc > bs) { bs = sc; best = e; }
      }
      if (best) {
        const my = this.strength(h.team, best), their = this.strength(1 - h.team, best);
        const dive = m.towerCovers(1 - h.team, best, 30) && !(best.hpPct < 0.2 && hp > 0.55);
        if (!dive && (my >= their * 0.85 || best.hpPct < 0.25)) { this.useSkills(best, 'fight'); h.target = best; return; }
        if (their > my * 1.2) { h.target = null; const s = m.frontStructure(h.team); h.want = { x: s.x - (h.team === 0 ? 1 : -1) * 60, y: s.y + this.yo * 0.5 }; return; }
      }

      // A Power Shard close by is worth the detour (Renewal especially when hurt).
      if (m.runes.length && hp > 0.25 && !this.jungler) {
        const r = m.runes.find(q => d2(q, h) < (q.type === 'renewal' && hp < 0.6 ? 900 : 620) ** 2 && !foes.some(e => d2(e, q) < d2(h, q)));
        if (r) { h.target = null; h.want = { x: r.x, y: r.y }; return; }
      }
      // Objectives: the Colossus, and the tougher Wyrm (only with the whole team up and healthy).
      const up = m.heroes.filter(x => x.alive && x.team === h.team).length;
      const sh = m.shard, wy = m.wyrm;
      const goSh = sh && sh.alive && hp > 0.55 && m.t - m.shardSpawnedT > 8 && up >= 2;
      const goWy = wy && wy.alive && hp > 0.6 && m.t - m.wyrmSpawnedT > 10 && up >= 3;
      if (goSh || goWy) { this.hit(goSh && (!goWy || d2(sh, h) < d2(wy, h)) ? sh : wy); return; }
      if (this.jungler && hp > 0.45) { const c = this.pickCamp(); if (c) { this.hit(c.unit); return; } }
      this.lane();
    }
    // Follows a teammate's quick signal. Returns false once there's nothing special to do, so the
    // normal logic (fight what's near, farm) takes over on arrival.
    obey(o, foes) {
      const m = this.m, h = this.h, T = o.target;
      if (o.kind === 'retreat') {
        const s = m.frontStructure(h.team), back = h.team === 0 ? -1 : 1;
        h.target = null; h.want = { x: s.x + back * 90, y: s.y + this.yo * 0.5 };
        const e = foes.find(f => d2(f, h) < (h.range + 60) ** 2);
        if (e && h.hpPct > 0.5) h.target = e;   // still swing at anyone in our face
        return true;
      }
      if (o.kind === 'gather' && T && (T.mtype === 'colossus' || T.mtype === 'wyrm')) {
        if (!T.alive) return false;
        this.hit(T); return true;
      }
      if (o.kind === 'attack' && T && T.alive && T.team !== h.team && m.valid(h, T) && d2(T, h) < 1400 * 1400) {
        if (T.kind === 'hero') this.useSkills(T, 'fight');
        h.target = T; return true;
      }
      // Group up / attack the spot: walk over, then let the normal logic fight whatever is there.
      const at = o.kind === 'gather' ? o.from : o;
      if (!at || (at.alive === false)) return false;
      if (d2(at, h) > 240 * 240) { h.target = null; h.want = { x: at.x, y: at.y + this.yo * 0.4 }; return true; }
      return false;
    }
    // Bots use their battle spell when it clearly pays off. Returns true if it was cast.
    spellLogic(foes) {
      const m = this.m, h = this.h, hp = h.hpPct, f = m.fountains[h.team];
      if (Math.random() > this.D.skill) return false;
      const close = foes.filter(e => d2(e, h) < 520 * 520);
      const danger = close.length > 0 && hp < 0.3;
      switch (h.spell) {
        case 'purify': return (h.stunT > 0.5 || h.tauntT > 0.6) && close.length > 0 && m.useSpell(h) === true;
        case 'mend': {
          const hurt = m.heroes.filter(a => a.alive && a.team === h.team && a.hpPct < 0.35 && d2(a, h) < 500 * 500 && foes.some(e => d2(e, a) < 600 * 600));
          return (danger || hurt.length > 0) && m.useSpell(h) === true;
        }
        case 'sprint': return danger && m.useSpell(h) === true;
        case 'blink': return danger && hp < 0.22 && m.useSpell(h, { dir: norm(f.x - h.x, f.y - h.y) }) === true;
        case 'shatter':
        case 'smite': {
          const t = m.spellTarget(h, h.spell);
          if (!t || SF.spellDamage(h.spell, h, t) < t.hp + (t.shield || 0)) return false;
          // Smite: only for the Colossus and camps (bots don't waste it on minions).
          if (h.spell === 'smite' && t.kind !== 'monster') return false;
          return m.useSpell(h, { target: t }) === true;
        }
      }
      return false;
    }
    // Worth dashing onto this hero? Not under their tower, and they're low, alone, or outnumbered.
    safeDive(e) {
      const m = this.m, h = this.h;
      if (m.towerCovers(1 - h.team, e, 0) && e.hpPct > 0.2) return false;
      const theirs = m.heroes.filter(x => x.alive && x.team === e.team && x !== e && d2(x, e) < 450 * 450).length;
      const ours = m.heroes.filter(x => x.alive && x.team === h.team && x !== h && d2(x, e) < 600 * 600).length;
      return e.hpPct < 0.45 || theirs === 0 || ours >= theirs;
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
        if (h.skillCd[i] > 0 || !h.ranks[i]) continue;
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
        if (h.skillCd[i] > 0 || !h.ranks[i] || (i === 2 && mode === 'farm')) continue;
        if (Math.random() > this.D.skill) continue;
        const s = h.def0.skills[i];
        const D = e ? dist(e, h) : 1e9;
        let aim = null;
        switch (s.ai) {
          case 'enemy':
            if (!e || D > s.range * 0.95 + e.r) break;
            if (s.kind === 'dash' && e.kind === 'hero' && !this.safeDive(e)) break;   // don't jump into a crowd
            aim = this.aimAt(e); break;
          case 'near': if (e && D <= s.range * 0.9 + e.r) aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: h.x, y: h.y }, target: e }; break;
          case 'execute': if (e && e.kind === 'hero' && D <= s.range && e.hpPct < 0.55) aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: e.x, y: e.y }, target: e }; break;
          case 'self': if (mode === 'fight' && e && D < h.range + 260) aim = { dir: h.face, point: { x: h.x, y: h.y }, target: null }; break;
          case 'heal': if (m.heroes.some(a => a.alive && a.team === h.team && a.hpPct < 0.6 && d2(a, h) < s.range * s.range)) aim = { dir: h.face, point: { x: h.x, y: h.y }, target: null }; break;
          case 'fight': if (mode === 'fight' && e && D < 360) aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: h.x, y: h.y }, target: e }; break;
          case 'turret': if (e && D < s.range + 160) { const k = Math.min(1, (s.range * 0.85) / Math.max(1, D)); aim = { dir: norm(e.x - h.x, e.y - h.y), point: { x: h.x + (e.x - h.x) * k, y: h.y + (e.y - h.y) * k }, target: e }; } break;
          case 'wall': if (mode === 'fight' && e && e.kind === 'hero' && D < 380) { const dd = norm(e.x - h.x, e.y - h.y); aim = { dir: dd, point: { x: e.x - dd.x * 40, y: e.y - dd.y * 40 }, target: e }; } break;
          case 'bell': if (mode === 'fight' && e && e.kind === 'hero' && D < s.range + 100) {
            // Trap two or more heroes, or one wounded one with a teammate around to finish it.
            const foes = m.heroes.filter(x => x.alive && x.team !== h.team && d2(x, e) < 220 * 220);
            if (foes.length >= 2 || (e.hpPct < 0.55 && this.alliesNear(700) > 0)) {
              const c = { x: foes.reduce((a, x) => a + x.x, 0) / foes.length, y: foes.reduce((a, x) => a + x.y, 0) / foes.length };
              aim = { dir: norm(c.x - h.x, c.y - h.y), point: c, target: e };
            }
          } break;
          case 'bastion': if (mode === 'fight' && e && D < 520) { const dd = norm(e.x - h.x, e.y - h.y); aim = { dir: dd, point: { x: h.x + dd.x * 120, y: h.y + dd.y * 120 }, target: e }; } break;
        }
        if (s.needsTarget && aim && (!aim.target || (aim.target.kind !== 'hero' && !s.anyTarget))) aim = null;
        if (aim && m.castSkill(h, i, aim) === true) return true;
      }
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Draft (offline Quick / Ranked). Picks alternate blue, red, red, you, blue, red, so you see two
  // enemy picks before choosing. Ranked opens with one ban per team.
  // ---------------------------------------------------------------------------
  const FRONT = ['Tank', 'Fighter'], RANGED = ['Marksman', 'Mage'];
  SF.Draft = {
    ORDER: ['B', 'R', 'R', 'P', 'B', 'R'],
    taken(st) { return new Set([...st.blue, ...st.red, ...st.bans]); },
    // A bot fills what its team lacks: no duplicate roles, a frontliner and a ranged damage dealer
    // early, and (for red) an answer to a blue team stacked with squishies.
    botPick(side, st, rnd = Math.random) {
      const taken = SF.Draft.taken(st), mine = st[side].map(id => SF.HERO[id].role), theirs = st[side === 'blue' ? 'red' : 'blue'].map(id => SF.HERO[id].role);
      let best = null, bs = -1e9;
      for (const h of SF.HEROES) {
        if (taken.has(h.id)) continue;
        let sc = rnd();
        if (mine.includes(h.role)) sc -= 1.5;
        if (!mine.some(r => FRONT.includes(r)) && FRONT.includes(h.role)) sc += 0.8;
        if (!mine.some(r => RANGED.includes(r)) && RANGED.includes(h.role)) sc += 0.8;
        if (theirs.filter(r => r === 'Marksman' || r === 'Mage' || r === 'Support').length >= 2 && h.role === 'Assassin') sc += 0.6;
        if (sc > bs) { bs = sc; best = h.id; }
      }
      return best;
    },
    botBan(st, rnd = Math.random) {
      const pool = SF.HEROES.filter(h => !SF.Draft.taken(st).has(h.id));
      return pool[Math.floor(rnd() * pool.length)].id;
    }
  };

  SF.Match = Match;
  SF.Brain = Brain;
  SF.MAX_LEVEL = MAX_LEVEL;
})(window.SF);

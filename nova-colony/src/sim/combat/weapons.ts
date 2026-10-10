/**
 * Weapons — turrets, traps, the player's weapon and all projectiles.
 *
 * Turrets acquire the nearest valid alien via the spatial hash (and keep it while valid), track it
 * with their head, and fire on cooldown: hitscan for laser/rail (rail pierces along the beam),
 * homing travelling projectiles for everything else (cannons lob, drones fly out and return).
 * Flyers can only be hit by anti-air turrets/traps and the player.
 */
import { CELL } from '../../core/constants';
import { approachAngle } from '../../core/math';
import type { Alien, Projectile } from '../../core/state';
import type { CombatContext, KillCredit } from './context';
import { levelMult, type TurretEntry } from './buildingIndex';
import { targetable } from './spatialHash';
import { HIT_AIR, HIT_ALL, HIT_GROUND, PROJECTILE_SPEED, TARGET_PLAYER, TUNE, isHitscan } from './types';

/** Hit mask of a turret spec. */
export function turretMask(spec: { antiAir?: boolean; airOnly?: boolean }): number {
  if (spec.airOnly) return HIT_AIR;
  return spec.antiAir ? HIT_ALL : HIT_GROUND;
}

export class Weapons {
  private playerCd = 0;
  /** Reused buffers (no per-frame allocation). */
  private readonly hits: Alien[] = [];
  private railT = new Float32Array(64);

  constructor(private readonly ctx: CombatContext) {}

  /** Full combat step (aliens present or projectiles in flight). */
  update(dt: number): void {
    this.turrets(dt);
    this.traps(dt);
    this.player(dt);
    this.projectiles(dt);
  }

  /** Quiet step: only cooldowns tick so defenses are ready when aliens appear. */
  idle(dt: number): void {
    for (const t of this.ctx.index.turrets) {
      if (t.cd > 0) t.cd = Math.max(0, t.cd - dt);
      t.target = -1;
    }
    if (this.playerCd > 0) this.playerCd = Math.max(0, this.playerCd - dt);
  }

  // ------------------------------------------------------------------ turrets

  /** Effective shots per second of a turret right now. */
  fireRate(t: TurretEntry): number {
    const ctx = this.ctx;
    let rate = t.spec.fireRate;
    if (t.spec.manual && ctx.playerAlive()) {
      const p = ctx.game.state.player;
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const r = TUNE.MANUAL_RANGE + CELL * 0.5;
      if (dx * dx + dz * dz <= r * r) rate *= 2;
    }
    if ((t.def.power ?? 0) < 0) rate *= Math.max(0.25, Math.min(1, ctx.game.derived.power.ratio));
    return rate;
  }

  /** Is a colonist with the turret's `mannedBy` job working there (the building's worker job)? */
  manned(t: TurretEntry): boolean {
    const job = t.spec.mannedBy;
    if (!job || t.b.workers.length === 0) return false;
    return !t.def.workers || t.def.workers.job === job;
  }

  /** Damage per shot of a turret right now. */
  shotDamage(t: TurretEntry): number {
    return t.spec.damage * levelMult(t.b, t.def) * this.ctx.mods.turretDamage * (this.manned(t) ? 1.5 : 1);
  }

  /** The alien the player asked turrets to focus (still alive and in the fight), or undefined. */
  private focused(): Alien | undefined {
    const c = this.ctx.game.state.combat;
    if (c.focusId == null) return undefined;
    const a = this.ctx.alienById.get(c.focusId);
    if (!a || a.state === 'dying' || a.retreat || a.hp <= 0 || this.ctx.game.state.playTime > (c.focusUntil ?? 0)) {
      c.focusId = null;
      return undefined;
    }
    return a;
  }

  private turrets(dt: number): void {
    const ctx = this.ctx;
    const st = ctx.game.state;
    const focus = this.focused();
    for (const t of ctx.index.turrets) {
      t.cd -= dt;
      if (t.cd < -0.05) t.cd = -0.05;
      if (t.b.status !== 'active') {
        t.target = -1;
        continue;
      }
      const spec = t.spec;
      const mask = turretMask(spec);
      const range = spec.range * CELL * ctx.mods.turretRange;
      let target = t.target >= 0 ? ctx.alienById.get(t.target) : undefined;
      // the tapped boss comes first for every turret that can reach it
      if (focus && focus !== target && targetable(focus, mask)) {
        const fx = focus.x - t.x;
        const fz = focus.z - t.z;
        const reach = range + (focus.rad ?? 0.5);
        if (fx * fx + fz * fz <= reach * reach) target = focus;
      }
      if (target) {
        const dx = target.x - t.x;
        const dz = target.z - t.z;
        const reach = range + (target.rad ?? 0.5);
        if (!targetable(target, mask) || dx * dx + dz * dz > reach * reach) target = undefined;
      }
      if (!target) {
        // idle scan: frequent when loaded, relaxed while reloading
        t.retarget -= dt;
        if (t.retarget <= 0) {
          t.retarget = t.cd <= 0 ? 0.08 : 0.2;
          target = ctx.hash.nearest(t.x, t.z, range, mask) ?? undefined;
        }
      }
      t.target = target ? target.id : -1;
      if (!target) continue;
      t.yaw = approachAngle(t.yaw, Math.atan2(target.x - t.x, target.z - t.z), dt * TUNE.TURN_SPEED);
      if (t.cd > 0) continue;
      t.cd += 1 / Math.max(0.05, this.fireRate(t));
      t.firedAt = st.playTime;
      const kind = spec.projectile;
      const end = this.shoot(kind, t.x, 1.6, t.z, target, this.shotDamage(t), (spec.splash ?? 0) * CELL, spec.slow ?? 0, spec.pierce ?? 0, mask, kind === 'drone' ? 'drone' : 'turret', t.b.id, range);
      if (ctx.budget.fired.take()) {
        ctx.game.bus.emit('turret:fired', { building: t.b.id, kind, x: t.x, z: t.z, tx: end.x, tz: end.z });
      }
    }
  }

  /** Total turret DPS (UI "Defense rating"). */
  turretDps(): number {
    let sum = 0;
    for (const t of this.ctx.index.turrets) if (t.b.status === 'active') sum += this.shotDamage(t) * this.fireRate(t);
    return sum;
  }

  // ------------------------------------------------------------------ shooting

  private readonly endPt = { x: 0, z: 0 };

  /**
   * Fire a shot of `kind` at `target`. Hitscan resolves instantly; others spawn a projectile.
   * Returns the visual end point (reused object — copy before storing).
   */
  shoot(kind: string, x: number, y: number, z: number, target: Alien, dmg: number, splash: number, slow: number, pierce: number, mask: number, by: KillCredit, src: number, range: number): { x: number; z: number } {
    const end = this.endPt;
    end.x = target.x;
    end.z = target.z;
    if (isHitscan(kind)) {
      if (kind === 'rail') this.rail(x, z, target, dmg, pierce, slow, mask, by, range, end);
      else this.applyHit(kind, target.x, target.y, target.z, target, dmg, splash, slow, mask, by);
      return end;
    }
    const p = this.ctx.newProjectile();
    if (!p) {
      this.applyHit(kind, target.x, target.y, target.z, target, dmg, splash, slow, mask, by); // projectile cap: resolve instantly
      return end;
    }
    const speed = PROJECTILE_SPEED[kind] ?? 30;
    const dx = target.x - x;
    const dz = target.z - z;
    const d = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
    const T = d / speed;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.tx = target.x;
    p.tz = target.z;
    p.speed = speed;
    p.vx = (dx / d) * speed;
    p.vz = (dz / d) * speed;
    if (kind === 'cannon') {
      p.g = 18;
      p.vy = (p.g * T) / 2 + (target.y + 0.4 - y) / Math.max(0.05, T);
    } else {
      p.g = 0;
      p.vy = 0;
    }
    p.ttl = T + 2.5;
    p.damage = dmg;
    p.splash = splash;
    p.pierce = pierce;
    p.slow = slow;
    p.team = 'friendly';
    p.target = target.id;
    p.antiAir = (mask & HIT_AIR) !== 0;
    p.mask = mask;
    p.by = by;
    p.src = src;
    p.leg = 0;
    return end;
  }

  /** Railgun: hit the target and up to `pierce` more aliens along the beam. */
  private rail(x: number, z: number, target: Alien, dmg: number, pierce: number, slow: number, mask: number, by: KillCredit, range: number, end: { x: number; z: number }): void {
    let dx = target.x - x;
    let dz = target.z - z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d;
    dz /= d;
    const L = Math.max(range, d) + 1;
    const hits = this.hits;
    const n = this.ctx.hash.query(x + (dx * L) / 2, z + (dz * L) / 2, L / 2 + 1, hits, 64);
    if (this.railT.length < n) this.railT = new Float32Array(n * 2);
    const ts = this.railT;
    let cnt = 0;
    for (let k = 0; k < n; k++) {
      const a = hits[k];
      if (!targetable(a, mask)) continue;
      const rx = a.x - x;
      const rz = a.z - z;
      const t = rx * dx + rz * dz;
      if (t < 0 || t > L) continue;
      if (Math.abs(rx * dz - rz * dx) > (a.rad ?? 0.5) + 0.6) continue;
      hits[cnt] = a;
      ts[cnt] = t;
      cnt++;
    }
    const maxHits = 1 + Math.max(0, pierce);
    let lastT = d;
    for (let h = 0; h < maxHits && h < cnt; h++) {
      let m = h;
      for (let k = h + 1; k < cnt; k++) if (ts[k] < ts[m]) m = k;
      const ta = hits[m];
      hits[m] = hits[h];
      hits[h] = ta;
      const tt = ts[m];
      ts[m] = ts[h];
      ts[h] = tt;
      this.ctx.damageAlien(ta, dmg, by);
      if (slow > 0) this.applySlow(ta, slow);
      lastT = tt;
    }
    if (cnt === 0) this.ctx.damageAlien(target, dmg, by);
    end.x = x + dx * Math.max(lastT, maxHits > 1 ? L : d);
    end.z = z + dz * Math.max(lastT, maxHits > 1 ? L : d);
    if (this.ctx.budget.impact.take()) this.ctx.game.bus.emit('projectile:impact', { kind: 'rail', x: target.x, y: target.y + 0.5, z: target.z, splash: 0 });
  }

  private applySlow(a: Alien, slow: number): void {
    const s = Math.min(0.9, slow);
    if (s > a.slow) a.slow = s;
    if (a.slowT < TUNE.SLOW_TIME) a.slowT = TUNE.SLOW_TIME;
  }

  /** Resolve a hit at (x, z): splash damages everything valid around it, else the target (or nearest). */
  private applyHit(kind: string, x: number, y: number, z: number, target: Alien | undefined, dmg: number, splash: number, slow: number, mask: number, by: KillCredit): void {
    const ctx = this.ctx;
    if (splash > 0) {
      const hits = this.hits;
      const n = ctx.hash.query(x, z, splash, hits, 64);
      let hitTarget = false;
      for (let k = 0; k < n; k++) {
        const a = hits[k];
        if (!targetable(a, mask)) continue;
        if (a === target) hitTarget = true;
        const dx = a.x - x;
        const dz = a.z - z;
        const d = Math.sqrt(dx * dx + dz * dz) - (a.rad ?? 0.5);
        const fall = d <= 0 ? 1 : Math.max(0.5, 1 - (d / splash) * 0.5);
        ctx.damageAlien(a, dmg * fall, by);
        if (slow > 0) this.applySlow(a, slow);
      }
      // the intended target always takes the hit (it may have spawned after this frame's hash rebuild)
      const reach = splash + (target?.rad ?? 0.5) + 1;
      if (!hitTarget && target && targetable(target, mask) && (target.x - x) ** 2 + (target.z - z) ** 2 <= reach * reach) {
        ctx.damageAlien(target, dmg, by);
        if (slow > 0) this.applySlow(target, slow);
      }
    } else {
      let t = target && targetable(target, mask) ? target : null;
      if (!t) t = ctx.hash.nearest(x, z, 1.0, mask);
      if (t) {
        ctx.damageAlien(t, dmg, by);
        if (slow > 0) this.applySlow(t, slow);
      }
    }
    if (ctx.budget.impact.take()) ctx.game.bus.emit('projectile:impact', { kind, x, y: Math.max(0.2, y + 0.4), z, splash });
  }

  // ------------------------------------------------------------------ traps

  private traps(dt: number): void {
    const ctx = this.ctx;
    const hits = this.hits;
    for (const tr of ctx.index.traps) {
      tr.acc += dt;
      if (tr.acc < TUNE.TRAP_TICK) continue;
      tr.acc -= TUNE.TRAP_TICK;
      if (tr.acc > TUNE.TRAP_TICK) tr.acc = 0;
      if (tr.b.status !== 'active') continue;
      const mask = tr.spec.antiAir ? HIT_ALL : HIT_GROUND;
      const pad = tr.def.solid ? 0.45 : 0; // solid traps (electric fences) zap aliens touching them
      const hw = (tr.x1 - tr.x0) / 2 + pad;
      const hh = (tr.z1 - tr.z0) / 2 + pad;
      const n = ctx.hash.query(tr.cx, tr.cz, Math.sqrt(hw * hw + hh * hh) + 0.5, hits, 64);
      if (n === 0) continue;
      const dmg = tr.spec.dps * levelMult(tr.b, tr.def) * ctx.mods.turretDamage * TUNE.TRAP_TICK;
      for (let k = 0; k < n; k++) {
        const a = hits[k];
        if (!targetable(a, mask)) continue;
        const r = (a.rad ?? 0.5) * 0.6;
        if (a.x + r < tr.x0 - pad || a.x - r > tr.x1 + pad || a.z + r < tr.z0 - pad || a.z - r > tr.z1 + pad) continue;
        ctx.damageAlien(a, dmg, 'trap');
        if (tr.spec.slow) {
          const s = Math.min(0.9, tr.spec.slow);
          if (s > a.slow) a.slow = s;
          if (a.slowT < TUNE.TRAP_TICK * 2) a.slowT = TUNE.TRAP_TICK * 2;
        }
      }
    }
  }

  // ------------------------------------------------------------------ player weapon

  /** Equipped weapon stats (null when unarmed). */
  weaponStats(): { damage: number; fireRate: number; range: number; projectile: string } | null {
    const game = this.ctx.game;
    const id = game.state.player.equip.weapon;
    const s = id ? game.data.item(id)?.stats : undefined;
    if (!s || !s.damage) return null;
    return { damage: s.damage, fireRate: s.fireRate ?? 1, range: s.range ?? 10, projectile: s.projectile ?? 'bullet' };
  }

  /** Player weapon DPS (UI). */
  playerDps(): number {
    const w = this.weaponStats();
    return w ? w.damage * w.fireRate * this.ctx.game.sys.economy.modifier('playerDamage') : 0;
  }

  private player(dt: number): void {
    const ctx = this.ctx;
    this.playerCd -= dt;
    if (this.playerCd < -0.05) this.playerCd = -0.05;
    if (this.playerCd > 0 || !ctx.playerAlive()) return;
    const game = ctx.game;
    const id = game.state.player.equip.weapon;
    const s = id ? game.data.item(id)?.stats : undefined;
    if (!s || !s.damage) return;
    const p = game.state.player;
    const range = s.range ?? 10;
    const target = ctx.hash.nearest(p.x, p.z, range, HIT_ALL);
    if (!target) return;
    this.playerCd += 1 / Math.max(0.05, s.fireRate ?? 1);
    const kind = s.projectile ?? 'bullet';
    const end = this.shoot(kind, p.x, 1.3, p.z, target, s.damage * ctx.mods.playerDamage, 0, 0, 0, HIT_ALL, 'player', -1, range);
    if (ctx.budget.playerFired.take()) game.bus.emit('player:fired', { kind, x: p.x, z: p.z, tx: end.x, tz: end.z });
  }

  // ------------------------------------------------------------------ projectiles

  private projectiles(dt: number): void {
    const arr = this.ctx.game.state.combat.projectiles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      const done = p.team === 'hostile' ? this.hostileStep(p, dt) : this.friendlyStep(p, dt);
      if (done) this.ctx.releaseProjectileAt(i);
    }
  }

  /** Move toward (tx, tz). Returns true on arrival this frame. */
  private fly(p: Projectile, tx: number, tz: number, ty: number, dt: number): boolean {
    const speed = p.speed ?? 30;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const step = speed * dt;
    if (p.g) {
      p.vy -= p.g * dt;
      p.y += p.vy * dt;
    } else {
      p.y += (ty - p.y) * Math.min(1, dt * 6);
    }
    if (d <= step + 0.05) {
      p.x = tx;
      p.z = tz;
      return true;
    }
    p.vx = (dx / d) * speed;
    p.vz = (dz / d) * speed;
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    return false;
  }

  private friendlyStep(p: Projectile, dt: number): boolean {
    const ctx = this.ctx;
    p.ttl -= dt;
    if (p.leg === 1) {
      // drone flying home to its pad
      const pad = p.src !== undefined && p.src >= 0 ? ctx.index.turret(p.src) : undefined;
      if (pad) {
        p.tx = pad.x;
        p.tz = pad.z;
      }
      return this.fly(p, p.tx ?? p.x, p.tz ?? p.z, 1.6, dt) || p.ttl <= 0;
    }
    const mask = p.mask ?? HIT_ALL;
    let target = p.target !== null ? ctx.alienById.get(p.target) : undefined;
    if (target && targetable(target, mask)) {
      p.tx = target.x;
      p.tz = target.z;
    } else target = undefined;
    const arrived = this.fly(p, p.tx ?? p.x, p.tz ?? p.z, target ? target.y + 0.5 : 0.4, dt);
    if (!arrived && p.ttl > 0 && !(p.g && p.y <= 0 && p.vy < 0)) return false;
    this.applyHit(p.kind, p.x, p.y, p.z, target, p.damage, p.splash, p.slow, mask, (p.by ?? 'turret') as KillCredit);
    if (p.kind === 'drone' && p.leg === 0) {
      p.leg = 1;
      p.ttl = 6;
      p.target = null;
      return false;
    }
    return true;
  }

  private hostileStep(p: Projectile, dt: number): boolean {
    const ctx = this.ctx;
    p.ttl -= dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.vy -= (p.g ?? 0) * dt;
    p.y += p.vy * dt;
    if (p.ttl > 0) return false;
    if (p.target === TARGET_PLAYER) {
      const pl = ctx.game.state.player;
      const dx = pl.x - p.x;
      const dz = pl.z - p.z;
      if (dx * dx + dz * dz <= 1.8 * 1.8) ctx.damagePlayer(p.damage);
    } else if (p.target !== null) {
      const b = ctx.index.get(p.target);
      if (b) ctx.damageBuilding(b, p.damage, p.x, p.z);
    }
    if (ctx.budget.impact.take()) ctx.game.bus.emit('projectile:impact', { kind: p.kind, x: p.x, y: Math.max(0.2, p.y), z: p.z, splash: 0 });
    return true;
  }
}

/**
 * AlienAI — per-frame behaviour for invaders, flyers, burrowers, queens and wild aliens.
 *
 * Invaders follow the flow field to the core (mild separation, axis-separated collision against
 * blocked cells) and attack whatever building blocks the next cells of their path. `prefers`:
 *   'defense' → break off for the nearest turret within range+3 · 'wall' → nearest wall piece ·
 *   'core' → straight at the core, bashing through · 'any' → field + whatever blocks it.
 * Flyers fly straight at their target, ignoring walls. Invaders near the player attack the player.
 * Wild aliens idle around home, chase the player inside their leash and walk back otherwise.
 */
import { CELL } from '../../core/constants';
import { approachAngle } from '../../core/math';
import type { Alien, BuildingInstance } from '../../core/state';
import type { AlienDef } from '../../data/schema';
import type { CombatContext } from './context';
import { centerX, centerZ, rectDist2 } from './buildingIndex';
import { COST_OPEN } from './flowField';
import { TARGET_PLAYER, TUNE } from './types';
import type { TurretEntry } from './buildingIndex';

export class AlienAI {
  /** Reused neighbour buffer for separation queries. */
  private readonly near: Alien[] = [];
  /** Invasion queens that already announced their summons (the wave counter rises when they do). */
  private readonly summoned = new Set<number>();

  constructor(private readonly ctx: CombatContext) {}

  /** Update every alien present at the start of the frame (spawns during the frame wait a frame). */
  update(dt: number): void {
    const game = this.ctx.game;
    const aliens = game.state.combat.aliens;
    const n = aliens.length;
    for (let i = 0; i < n; i++) {
      const a = aliens[i];
      a.t += dt;
      if (a.state === 'dying') continue;
      const def = game.data.alien(a.def);
      if (!def) {
        this.ctx.retreat(a);
        continue;
      }
      if (a.cd > 0) a.cd -= dt;
      if (a.slowT > 0) {
        a.slowT -= dt;
        if (a.slowT <= 0) a.slow = 0;
      }
      if (a.retreat) {
        this.retreatStep(a, def, dt);
        continue;
      }
      if (a.state === 'spawning') {
        this.emerge(a, def);
        continue;
      }
      if (def.spawns) this.queen(a, def, dt);
      if (a.wild) this.wild(a, def, dt);
      else this.invader(a, def, dt);
    }
  }

  // ------------------------------------------------------------------ lifecycle

  private emerge(a: Alien, def: AlienDef): void {
    const burrow = !!def.burrow && !a.air;
    const dur = burrow ? TUNE.BURROW_TIME : TUNE.SPAWN_TIME;
    const k = Math.min(1, a.t / dur);
    if (burrow) a.y = -1 + k;
    else if (a.air) a.y = TUNE.FLY_Y + (1 - k) * 3;
    if (a.t >= dur) {
      a.state = 'moving';
      a.t = 0;
      a.y = a.air ? TUNE.FLY_Y : 0;
    }
  }

  private retreatStep(a: Alien, def: AlienDef, dt: number): void {
    let dx = a.x - this.ctx.coreX;
    let dz = a.z - this.ctx.coreZ;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d;
    dz /= d;
    this.steer(a, a.x + dx * 8, a.z + dz * 8, def.speed * CELL * 1.3, dt, false);
  }

  /** Swarm queens periodically spawn minions (invasion or wild, like the queen). */
  private queen(a: Alien, def: AlienDef, dt: number): void {
    const sp = def.spawns!;
    const ctx = this.ctx;
    const c = ctx.game.state.combat;
    // invasion queens: a few broods each, and none late in the attack (the raid must be able to end)
    if (!a.wild) {
      const late = ctx.game.state.playTime - (c.attackStartedAt ?? ctx.game.state.playTime) > TUNE.QUEEN_QUIET_AFTER;
      if (late || (a.broods ?? 0) >= (def.boss ? TUNE.BOSS_BROODS : TUNE.QUEEN_BROODS)) return;
    }
    a.spawnT += dt;
    if (a.spawnT < sp.every) return;
    a.spawnT = 0;
    a.broods = (a.broods ?? 0) + 1;
    const minion = ctx.game.data.alien(sp.alien);
    if (!minion) return;
    for (let k = 0; k < sp.count; k++) {
      const ang = ctx.game.rng.range(0, Math.PI * 2);
      const r = (a.rad ?? 1) + 0.8;
      const m = ctx.spawnAlien(minion, a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r, {
        wild: a.wild,
        homeX: a.homeX,
        homeZ: a.homeZ,
        hpScale: a.wild ? 1 : ctx.hpScale,
      });
      if (m && !a.wild) c.waveTotal = (c.waveTotal ?? 0) + 1;
    }
    // the first summons of an invasion queen explains why "aliens remaining" just went up
    if (!a.wild && !this.summoned.has(a.id)) {
      this.summoned.add(a.id);
      ctx.game.toast(`The ${def.name} is summoning ${minion.name.toLowerCase()}s. Tap her to focus your turrets!`, 'warning', '👑');
    }
  }

  // ------------------------------------------------------------------ invaders

  private invader(a: Alien, def: AlienDef, dt: number): void {
    const ctx = this.ctx;
    const speed = def.speed * CELL * (a.slowT > 0 ? 1 - a.slow : 1);
    a.think = (a.think ?? 0) - dt;
    if (a.think <= 0) {
      a.think = TUNE.THINK + ctx.game.rng.next() * 0.2;
      this.chooseTarget(a, def);
    }

    if (a.target === TARGET_PLAYER) {
      if (this.engagePlayer(a, def, speed, dt, TUNE.PLAYER_DROP)) return;
      a.target = null;
    }
    if (a.target !== null && a.target >= 0) {
      const b = ctx.index.get(a.target);
      if (b && b.status !== 'damaged') {
        this.engageBuilding(a, def, b, speed, dt);
        return;
      }
      a.target = null;
    }
    if (a.air || def.prefers === 'core') {
      this.goForCore(a, def, speed, dt);
      return;
    }
    this.followField(a, def, speed, dt);
  }

  /** Periodic target choice according to `prefers` (player aggro wins). */
  private chooseTarget(a: Alien, def: AlienDef): void {
    const ctx = this.ctx;
    const p = ctx.game.state.player;
    if (ctx.playerAlive()) {
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= TUNE.PLAYER_AGGRO * TUNE.PLAYER_AGGRO) {
        a.target = TARGET_PLAYER;
        return;
      }
      if (a.target === TARGET_PLAYER && d2 <= TUNE.PLAYER_DROP * TUNE.PLAYER_DROP) return;
    }
    switch (def.prefers) {
      case 'defense': {
        const t = this.nearestTurret(a, (def.range + 3) * CELL);
        a.target = t ? t.b.id : null;
        break;
      }
      case 'wall': {
        const w = a.air ? null : this.nearestWall(a, TUNE.WALL_SEEK);
        a.target = w ? w.id : null;
        break;
      }
      default:
        a.target = null; // field / core path re-acquires blockers itself
    }
  }

  private nearestTurret(a: Alien, r: number): TurretEntry | null {
    let best: TurretEntry | null = null;
    let bestD = r * r;
    for (const t of this.ctx.index.turrets) {
      if (t.b.status === 'damaged') continue; // switched-off / unfinished turrets are still targets
      const dx = t.x - a.x;
      const dz = t.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD) {
        bestD = d2;
        best = t;
      }
    }
    return best;
  }

  private nearestWall(a: Alien, r: number): BuildingInstance | null {
    const data = this.ctx.game.data;
    let best: BuildingInstance | null = null;
    let bestD = r * r;
    for (const w of this.ctx.index.walls) {
      if (w.status === 'damaged') continue;
      const def = data.building(w.def);
      if (!def) continue;
      const d2 = rectDist2(a.x, a.z, w, def);
      if (d2 <= bestD) {
        bestD = d2;
        best = w;
      }
    }
    return best;
  }

  private reach(a: Alien, def: AlienDef): number {
    return def.range * CELL + (a.rad ?? 0.5) + 0.25;
  }

  /** Chase / attack the player. Returns false when the player is gone or too far. */
  private engagePlayer(a: Alien, def: AlienDef, speed: number, dt: number, giveUp: number): boolean {
    const ctx = this.ctx;
    if (!ctx.playerAlive()) return false;
    const p = ctx.game.state.player;
    const dx = p.x - a.x;
    const dz = p.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > giveUp) return false;
    if (d <= this.reach(a, def) + 0.3) {
      this.attack(a, def, TARGET_PLAYER, p.x, p.z, dt);
      return true;
    }
    a.state = 'moving';
    this.steer(a, p.x, p.z, speed, dt, !a.air);
    return true;
  }

  /** Move toward / attack a specific building. Ground movers attack anything solid in their way. */
  private engageBuilding(a: Alien, def: AlienDef, b: BuildingInstance, speed: number, dt: number): void {
    const bdef = this.ctx.game.data.building(b.def);
    if (!bdef) {
      a.target = null;
      return;
    }
    const tx = centerX(b, bdef);
    const tz = centerZ(b, bdef);
    const reach = this.reach(a, def);
    if (rectDist2(a.x, a.z, b, bdef) <= reach * reach) {
      a.target = b.id;
      this.attack(a, def, b.id, tx, tz, dt);
      return;
    }
    if (!a.air) {
      const bump = this.bump(a, tx, tz);
      if (bump && bump !== b) {
        const bd = this.ctx.game.data.building(bump.def);
        if (bd && rectDist2(a.x, a.z, bump, bd) <= reach * reach) {
          a.target = bump.id;
          this.attack(a, def, bump.id, centerX(bump, bd), centerZ(bump, bd), dt);
          return;
        }
      }
    }
    a.state = 'moving';
    this.steer(a, tx, tz, speed, dt, !a.air);
  }

  private goForCore(a: Alien, def: AlienDef, speed: number, dt: number): void {
    const core = this.ctx.index.core;
    if (core && core.status !== 'damaged') {
      this.engageBuilding(a, def, core, speed, dt);
      return;
    }
    a.state = 'moving';
    this.steer(a, this.ctx.coreX, this.ctx.coreZ, speed, dt, !a.air);
  }

  /** The alien-blocking building just ahead toward (tx, tz), if any. */
  private bump(a: Alien, tx: number, tz: number): BuildingInstance | null {
    const f = this.ctx.field;
    if (!f.ready) return null;
    let dx = tx - a.x;
    let dz = tz - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-3) return null;
    dx /= d;
    dz /= d;
    const probe = (a.rad ?? 0.5) + CELL * 0.5;
    const i = f.idxAt(a.x + dx * probe, a.z + dz * probe);
    if (i < 0 || f.occ[i] === 0) return null;
    const b = this.ctx.index.get(f.occ[i]);
    return b && b.status !== 'damaged' ? b : null;
  }

  /** Follow the flow field; attack the first building blocking the path within reach. */
  private followField(a: Alien, def: AlienDef, speed: number, dt: number): void {
    const ctx = this.ctx;
    const f = ctx.field;
    const ci = f.ready ? f.idxAt(a.x, a.z) : -1;
    if (ci < 0 || f.dist[ci] === Infinity) {
      this.goForCore(a, def, speed, dt); // outside the field or cut off: head straight in
      return;
    }
    const next = f.next;
    const occ = f.occ;
    const reach = this.reach(a, def);
    const look = Math.max(1, Math.ceil(def.range + 0.5));
    let j = ci;
    for (let k = 0; k < look; k++) {
      const nj = next[j];
      if (nj < 0) break;
      const id = occ[nj];
      if (id !== 0) {
        const b = ctx.index.get(id);
        const bd = b ? ctx.game.data.building(b.def) : undefined;
        if (b && bd && b.status !== 'damaged' && rectDist2(a.x, a.z, b, bd) <= reach * reach) {
          a.target = b.id;
          this.attack(a, def, b.id, centerX(b, bd), centerZ(b, bd), dt);
          return;
        }
        break;
      }
      j = nj;
    }
    const ni = next[ci];
    if (ni < 0) {
      this.goForCore(a, def, speed, dt); // standing on a goal cell (inside the core footprint)
      return;
    }
    let tx = f.centerX(ni);
    let tz = f.centerZ(ni);
    const nni = next[ni];
    if (nni >= 0 && f.cost[ni] === COST_OPEN && f.cost[nni] === COST_OPEN) {
      tx = (tx + f.centerX(nni)) * 0.5; // look a little further ahead for smoother curves
      tz = (tz + f.centerZ(nni)) * 0.5;
    }
    a.state = 'moving';
    this.steer(a, tx, tz, speed, dt, true);
  }

  /** Stand still (with gentle separation), face the target and hit it on cooldown. */
  private attack(a: Alien, def: AlienDef, target: number, tx: number, tz: number, dt: number): void {
    const ctx = this.ctx;
    a.state = 'attacking';
    this.steer(a, a.x, a.z, 0, dt, !a.air);
    a.rot = approachAngle(a.rot, Math.atan2(tx - a.x, tz - a.z), dt * 10);
    if (a.cd > 0) return;
    a.cd = 1 / Math.max(0.05, def.attackRate);
    if (def.ranged) {
      ctx.spit(a, def, target, tx, tz);
    } else if (target === TARGET_PLAYER) {
      ctx.damagePlayer(def.damage * TUNE.PLAYER_DMG_MULT);
    } else {
      const b = ctx.index.get(target);
      if (b) ctx.damageBuilding(b, def.damage, a.x, a.z);
    }
    if (ctx.budget.attack.take()) {
      ctx.game.bus.emit('alien:attack', { id: a.id, def: a.def, x: a.x, z: a.z, tx, tz, target, ranged: !!def.ranged });
    }
  }

  // ------------------------------------------------------------------ wild aliens

  private wild(a: Alien, def: AlienDef, dt: number): void {
    const ctx = this.ctx;
    const speed = def.speed * CELL * (a.slowT > 0 ? 1 - a.slow : 1);
    const hx = a.homeX ?? a.x;
    const hz = a.homeZ ?? a.z;
    const hdx = a.x - hx;
    const hdz = a.z - hz;
    const dHome2 = hdx * hdx + hdz * hdz;
    const collide = !a.air;

    if (a.returning) {
      if (dHome2 <= TUNE.WANDER * TUNE.WANDER) a.returning = false;
      else {
        a.target = null;
        a.state = 'moving';
        this.steer(a, hx, hz, speed * 1.15, dt, collide);
        return;
      }
    }
    const leash = TUNE.LEASH;
    if (dHome2 > (leash + 2 * CELL) * (leash + 2 * CELL)) {
      a.returning = true;
      a.target = null;
      return;
    }
    const p = ctx.game.state.player;
    if (ctx.playerAlive()) {
      const pdx = p.x - hx;
      const pdz = p.z - hz;
      if (pdx * pdx + pdz * pdz <= leash * leash) {
        a.target = TARGET_PLAYER;
        if (this.engagePlayer(a, def, speed, dt, Infinity)) return;
      }
    }
    if (a.target === TARGET_PLAYER) {
      a.target = null;
      a.returning = dHome2 > TUNE.WANDER * TUNE.WANDER; // lost the player: walk home
      return;
    }
    // idle: amble between random points near home
    a.think = (a.think ?? 0) - dt;
    if (a.think <= 0) {
      const rng = ctx.game.rng;
      a.think = rng.range(2, 5);
      const ang = rng.range(0, Math.PI * 2);
      const r = rng.range(0, TUNE.WANDER);
      a.wx = hx + Math.cos(ang) * r;
      a.wz = hz + Math.sin(ang) * r;
    }
    const wx = a.wx ?? hx;
    const wz = a.wz ?? hz;
    const wdx = wx - a.x;
    const wdz = wz - a.z;
    a.state = 'moving';
    if (wdx * wdx + wdz * wdz > 0.36) this.steer(a, wx, wz, speed * 0.35, dt, collide);
    else this.steer(a, a.x, a.z, 0, dt, collide);
  }

  // ------------------------------------------------------------------ movement

  /**
   * Smooth steering toward (tx, tz) at `speed` with mild separation from nearby aliens on the same
   * layer, and (ground) axis-separated collision against blocked flow-field cells.
   */
  private steer(a: Alien, tx: number, tz: number, speed: number, dt: number, collide: boolean): void {
    let dx = tx - a.x;
    let dz = tz - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-4) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 0;
    }
    // separation
    const rad = a.rad ?? 0.5;
    const near = this.near;
    const cnt = this.ctx.hash.query(a.x, a.z, rad + 1.2, near, 12);
    let sx = 0;
    let sz = 0;
    for (let k = 0; k < cnt; k++) {
      const o = near[k];
      if (o === a || o.state === 'dying' || !!o.air !== !!a.air) continue;
      let ox = a.x - o.x;
      let oz = a.z - o.z;
      const min = rad + (o.rad ?? 0.5) + 0.1;
      let d2 = ox * ox + oz * oz;
      if (d2 >= min * min) continue;
      if (d2 < 1e-6) {
        ox = a.id & 1 ? 0.7 : -0.7;
        oz = a.id & 2 ? 0.7 : -0.7;
        d2 = 0.98;
      }
      const dd = Math.sqrt(d2);
      const push = (min - dd) / min;
      sx += (ox / dd) * push;
      sz += (oz / dd) * push;
    }
    const sepBase = Math.max(speed, CELL * 0.8) * TUNE.SEPARATION;
    const dvx = dx * speed + sx * sepBase;
    const dvz = dz * speed + sz * sepBase;
    const k = Math.min(1, dt * 10);
    const vx = (a.vx ?? 0) + (dvx - (a.vx ?? 0)) * k;
    const vz = (a.vz ?? 0) + (dvz - (a.vz ?? 0)) * k;
    let nx = a.x + vx * dt;
    let nz = a.z + vz * dt;
    a.vx = vx;
    a.vz = vz;
    if (collide) {
      const f = this.ctx.field;
      if (f.ready) {
        const probe = Math.min(0.6, rad);
        if (vx !== 0 && f.blockedAt(nx + (vx > 0 ? probe : -probe), a.z) && !f.blockedAt(a.x, a.z)) {
          nx = a.x;
          a.vx = 0;
        }
        if (vz !== 0 && f.blockedAt(nx, nz + (vz > 0 ? probe : -probe)) && !f.blockedAt(nx, a.z)) {
          nz = a.z;
          a.vz = 0;
        }
      }
    }
    a.x = nx;
    a.z = nz;
    if (speed > 0 && vx * vx + vz * vz > 0.04) a.rot = approachAngle(a.rot, Math.atan2(vx, vz), dt * 8);
  }
}

/** Is the cell under a world point open ground in the field (used by burrow spawns). */
export function openAt(ctx: CombatContext, x: number, z: number): boolean {
  const f = ctx.field;
  if (!f.ready) return true;
  const i = f.idxAt(x, z);
  return i < 0 || f.cost[i] === COST_OPEN;
}

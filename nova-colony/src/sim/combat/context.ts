/**
 * CombatContext — shared runtime for the combat sub-modules: spatial hash, flow field, building index,
 * object pools, event throttles, cached modifiers, and the central damage / kill / spawn pipeline.
 * Everything here is transient (never saved); persistent combat data lives in state.combat.
 */
import { CELL, WORLD_CELLS, cellCenter, cellOf } from '../../core/constants';
import type { Game } from '../../core/Game';
import type { Alien, BuildingInstance, Id, Projectile } from '../../core/state';
import type { AlienDef } from '../../data/schema';
import { AlienHash } from './spatialHash';
import { COST_BLOCKED, COST_OPEN, FlowField } from './flowField';
import { BuildingIndex, blocksAliens, centerX, centerZ, footH, footW } from './buildingIndex';
import { TARGET_PLAYER, TUNE } from './types';

/** Token bucket used to throttle presentation events when combat gets busy. */
export class Throttle {
  private tokens: number;
  constructor(
    private readonly cap: number,
    private readonly rate: number,
  ) {
    this.tokens = cap;
  }
  refill(dt: number): void {
    this.tokens = Math.min(this.cap, this.tokens + this.rate * dt);
  }
  take(): boolean {
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type KillCredit = 'turret' | 'player' | 'trap' | 'drone';

function blankAlien(): Alien {
  return {
    id: 0, def: '', x: 0, z: 0, y: 0, rot: 0, hp: 1, maxHp: 1, state: 'spawning', target: null, cd: 0, slowT: 0, slow: 0, spawnT: 0, t: 0,
    wild: false, homeX: 0, homeZ: 0, wx: 0, wz: 0, returning: false, vx: 0, vz: 0, retreat: false, think: 0, air: false, rad: 0.5,
  };
}

function blankProjectile(): Projectile {
  return {
    id: 0, kind: 'bullet', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0, damage: 0, splash: 0, pierce: 0, slow: 0, team: 'friendly', target: null, antiAir: false,
    tx: 0, tz: 0, by: 'turret', src: -1, leg: 0, mask: 1, g: 0, speed: 30,
  };
}

export interface SpawnOptions {
  wild?: boolean;
  /** Emerge from underground (burrowers). */
  burrow?: boolean;
  hpScale?: number;
  homeX?: number;
  homeZ?: number;
}

export class CombatContext {
  readonly hash = new AlienHash(8);
  readonly field = new FlowField();
  readonly index: BuildingIndex;
  readonly alienById = new Map<Id, Alien>();
  /** Cached economy modifiers (refreshed twice per second). */
  readonly mods = { turretDamage: 1, turretRange: 1, playerDamage: 1 };
  /** Presentation event budgets (burst, per second). */
  readonly budget = {
    fired: new Throttle(24, 45),
    hit: new Throttle(30, 60),
    impact: new Throttle(24, 45),
    shield: new Throttle(4, 8),
    attack: new Throttle(10, 20),
    playerFired: new Throttle(4, 10),
  };
  /** Colony center = core footprint center (world units). */
  coreX = 0;
  coreZ = 0;
  /** Invasion aliens still fighting (computed by sweep()). */
  invaders = 0;
  /** HP multiplier for invaders of the current wave. */
  hpScale = 1;
  /** playTime of the last invader spawn or kill (straggler detection). */
  lastProgressAt = 0;

  private readonly alienPool: Alien[] = [];
  private readonly projPool: Projectile[] = [];
  private modsT = 0;
  private goals = new Int32Array(64);
  private terrain = new Uint8Array(0);
  private terrainKey = '';

  constructor(readonly game: Game) {
    this.index = new BuildingIndex(game);
  }

  /** Per-frame bookkeeping: event budgets, modifiers, building caches, colony center. */
  beginFrame(dt: number): void {
    const b = this.budget;
    b.fired.refill(dt);
    b.hit.refill(dt);
    b.impact.refill(dt);
    b.shield.refill(dt);
    b.attack.refill(dt);
    b.playerFired.refill(dt);
    this.modsT -= dt;
    if (this.modsT <= 0) this.refreshMods();
    this.index.tick(dt);
    if (this.index.refresh()) this.updateCenter();
  }

  refreshMods(): void {
    const econ = this.game.sys.economy;
    this.mods.turretDamage = econ.modifier('turretDamage');
    this.mods.turretRange = econ.modifier('turretRange');
    this.mods.playerDamage = econ.modifier('playerDamage');
    this.modsT = 0.5;
  }

  updateCenter(): void {
    const core = this.index.core;
    const def = core ? this.game.data.building(core.def) : undefined;
    if (core && def) {
      this.coreX = centerX(core, def);
      this.coreZ = centerZ(core, def);
    } else {
      this.coreX = 0;
      this.coreZ = 0;
    }
  }

  /**
   * Drop all transient runtime (load / reset). Loaded entities are discarded rather than pooled: they
   * come from JSON with a different field layout than pooled objects (keeps hidden classes uniform).
   */
  reset(): void {
    const c = this.game.state.combat;
    c.aliens.length = 0;
    c.projectiles.length = 0;
    this.alienById.clear();
    this.index.clearRuntime();
    this.field.ready = false;
    this.terrainKey = '';
    this.invaders = 0;
  }

  // ------------------------------------------------------------------ player

  /** Can aliens target the player / can the player shoot? */
  playerAlive(): boolean {
    const st = this.game.state;
    return st.player.downUntil <= st.playTime && st.player.hp > 0;
  }

  /** Soft damage to the player; at 0 hp they are knocked out for a few seconds (no loss). */
  damagePlayer(amount: number): void {
    if (amount <= 0 || !this.playerAlive()) return;
    const st = this.game.state;
    const p = st.player;
    p.hp = Math.max(0, p.hp - amount);
    this.game.bus.emit('player:damaged', { amount });
    if (p.hp <= 0) {
      p.downUntil = st.playTime + TUNE.KO_SECONDS;
      this.game.bus.emit('player:downed', {});
    }
  }

  // ------------------------------------------------------------------ aliens

  /** Spawn an alien from the pool. Returns null if the def is unknown or the alien cap is reached. */
  spawnAlien(def: AlienDef, x: number, z: number, opts: SpawnOptions = {}): Alien | null {
    const c = this.game.state.combat;
    if (c.aliens.length >= TUNE.MAX_ALIENS) return null;
    const a = this.alienPool.pop() ?? blankAlien();
    const hp = Math.max(1, Math.round(def.hp * (opts.hpScale ?? 1)));
    const air = !!def.flying;
    a.id = c.nextEntityId++;
    a.def = def.id;
    a.x = x;
    a.z = z;
    a.y = air ? TUNE.FLY_Y + 3 : opts.burrow ? -1 : 0;
    a.rot = Math.atan2(this.coreX - x, this.coreZ - z);
    a.hp = hp;
    a.maxHp = hp;
    a.state = 'spawning';
    a.target = null;
    a.cd = this.game.rng.range(0, 1 / Math.max(0.1, def.attackRate));
    a.slowT = 0;
    a.slow = 0;
    a.spawnT = 0;
    a.t = 0;
    a.wild = !!opts.wild;
    a.homeX = opts.homeX ?? x;
    a.homeZ = opts.homeZ ?? z;
    a.wx = a.homeX;
    a.wz = a.homeZ;
    a.returning = false;
    a.vx = 0;
    a.vz = 0;
    a.retreat = false;
    a.think = this.game.rng.range(0, TUNE.THINK);
    a.air = air;
    a.rad = 0.35 * CELL * def.scale;
    c.aliens.push(a);
    this.alienById.set(a.id, a);
    if (!a.wild) this.lastProgressAt = this.game.state.playTime;
    this.game.bus.emit('alien:spawned', { id: a.id, def: a.def, x, z });
    return a;
  }

  private releaseAlien(a: Alien): void {
    if (this.alienPool.length < 512) this.alienPool.push(a);
  }

  /** Damage an alien; returns true if this hit killed it. */
  damageAlien(a: Alien, dmg: number, by: KillCredit): boolean {
    if (dmg <= 0 || a.state === 'dying' || a.hp <= 0 || a.retreat) return false;
    a.hp -= dmg;
    if (this.budget.hit.take()) this.game.bus.emit('alien:hit', { id: a.id, x: a.x, z: a.z, damage: Math.round(dmg) });
    if (a.hp <= 0) {
      this.kill(a, by);
      return true;
    }
    return false;
  }

  /** Kill: drop loot, count stats, play the short 'dying' state. */
  kill(a: Alien, by: KillCredit): void {
    const st = this.game.state;
    const c = st.combat;
    a.hp = 0;
    a.state = 'dying';
    a.t = 0;
    a.vx = 0;
    a.vz = 0;
    a.target = null;
    const def = this.game.data.alien(a.def);
    if (def?.drop) this.game.sys.economy.addBag(def.drop, 'drop', a.x, a.z);
    c.kills++;
    st.stats.kills++;
    if (!a.wild) {
      c.killsThisWave++;
      this.lastProgressAt = st.playTime;
    }
    this.game.bus.emit('alien:killed', { id: a.id, def: a.def, x: a.x, z: a.z, by });
  }

  /** Make an alien run off and despawn (no drops). */
  retreat(a: Alien): void {
    if (a.state === 'dying') return;
    a.retreat = true;
    a.t = 0;
    a.target = null;
    a.state = 'moving';
  }

  /** Remove finished aliens (swap-remove into the pool) and count invaders still fighting. */
  sweep(): void {
    const arr = this.game.state.combat.aliens;
    let invaders = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const a = arr[i];
      if ((a.state === 'dying' && a.t >= TUNE.DYING_TIME) || (a.retreat && a.t >= TUNE.RETREAT_TIME)) {
        const last = arr.pop()!;
        if (i < arr.length) arr[i] = last;
        this.alienById.delete(a.id);
        this.releaseAlien(a);
      } else if (!a.wild && !a.retreat && a.state !== 'dying') {
        invaders++;
      }
    }
    this.invaders = invaders;
  }

  // ------------------------------------------------------------------ buildings

  /**
   * Damage a building, letting active shields covering it absorb first (shield:hit), then forward
   * the rest to BuildingSystem.damage (0 hp => 'damaged', never destroyed). Returns damage dealt.
   */
  damageBuilding(b: BuildingInstance, amount: number, fromX: number, fromZ: number): number {
    if (amount <= 0 || b.status === 'damaged') return 0;
    const def = this.game.data.building(b.def);
    if (!def) return 0;
    const bx = centerX(b, def);
    const bz = centerZ(b, def);
    const shields = this.index.shields;
    for (let i = 0; i < shields.length && amount > 0; i++) {
      const s = shields[i];
      if (s.hp <= 0 || s.b.status !== 'active') continue;
      const dx = bx - s.x;
      const dz = bz - s.z;
      if (dx * dx + dz * dz > s.radius * s.radius) continue;
      const take = Math.min(s.hp, amount);
      s.hp -= take;
      amount -= take;
      if (this.budget.shield.take()) {
        // ripple where the attack meets the bubble (or at the building if the attacker is inside)
        const ax = fromX - s.x;
        const az = fromZ - s.z;
        const d = Math.sqrt(ax * ax + az * az);
        const inside = d <= s.radius || d < 1e-3;
        this.game.bus.emit('shield:hit', { building: s.b.id, x: inside ? bx : s.x + (ax / d) * s.radius, z: inside ? bz : s.z + (az / d) * s.radius });
      }
    }
    if (amount <= 0) return 0;
    this.game.sys.buildings.damage(b.id, amount);
    return amount;
  }

  /** Regenerate shield capacity (always, also between waves) while the generator is active. */
  regenShields(dt: number): void {
    for (const s of this.index.shields) if (s.b.status === 'active' && s.hp < s.cap) s.hp = Math.min(s.cap, s.hp + s.regen * dt);
  }

  // ------------------------------------------------------------------ projectiles

  /** Take a fresh projectile from the pool (already pushed to state). Null at the cap. */
  newProjectile(): Projectile | null {
    const c = this.game.state.combat;
    if (c.projectiles.length >= TUNE.MAX_PROJECTILES) return null;
    const p = this.projPool.pop() ?? blankProjectile();
    p.id = c.nextEntityId++;
    p.vx = p.vy = p.vz = 0;
    p.ttl = 1;
    p.damage = 0;
    p.splash = 0;
    p.pierce = 0;
    p.slow = 0;
    p.team = 'friendly';
    p.target = null;
    p.antiAir = false;
    p.leg = 0;
    p.g = 0;
    p.src = -1;
    c.projectiles.push(p);
    return p;
  }

  /** Swap-remove the projectile at index i into the pool. */
  releaseProjectileAt(i: number): void {
    const arr = this.game.state.combat.projectiles;
    const p = arr[i];
    const last = arr.pop()!;
    if (i < arr.length) arr[i] = last;
    if (this.projPool.length < 1024) this.projPool.push(p);
  }

  /** Alien ranged attack: a lobbed goo ball at a building (id) or the player (TARGET_PLAYER). */
  spit(a: Alien, def: AlienDef, target: Id, tx: number, tz: number): void {
    const p = this.newProjectile();
    if (!p) return;
    const speed = 13;
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.max(0.5, Math.sqrt(dx * dx + dz * dz));
    const T = Math.max(0.3, d / speed);
    p.kind = 'spit';
    p.team = 'hostile';
    p.x = a.x;
    p.y = (a.y ?? 0) + 0.8;
    p.z = a.z;
    p.tx = tx;
    p.tz = tz;
    p.g = 14;
    p.speed = d / T;
    p.vx = dx / T;
    p.vz = dz / T;
    p.vy = (p.g * T) / 2 + (0.6 - p.y) / T;
    p.ttl = T;
    p.target = target;
    p.damage = def.damage * (target === TARGET_PLAYER ? TUNE.PLAYER_DMG_MULT : 1);
    p.by = 'alien';
    p.src = a.id;
  }

  // ------------------------------------------------------------------ flow field

  invalidateTerrain(): void {
    this.terrainKey = '';
  }

  /** Rebuild the flow field around the core from terrain + building occupancy. */
  rebuildField(): void {
    const game = this.game;
    const st = game.state;
    const f = this.field;
    this.updateCenter();
    const R = Math.max(4, st.colony.radius + TUNE.FIELD_MARGIN);
    const n = Math.min(WORLD_CELLS, R * 2 + 1);
    const ox = Math.max(0, Math.min(WORLD_CELLS - n, cellOf(this.coreX) - R));
    const oz = Math.max(0, Math.min(WORLD_CELLS - n, cellOf(this.coreZ) - R));
    f.reset(ox, oz, n);
    const size = n * n;

    // terrain (cached: world generation is static; region unlocks invalidate)
    const key = `${ox},${oz},${n},${st.world.regionsUnlocked.length}`;
    if (key !== this.terrainKey || this.terrain.length !== size) {
      if (this.terrain.length !== size) this.terrain = new Uint8Array(size);
      const world = game.sys.world;
      for (let i = 0; i < size; i++) {
        let ok = true;
        try {
          ok = world.walkable(cellCenter(ox + (i % n)), cellCenter(oz + Math.floor(i / n)));
        } catch {
          ok = true;
        }
        this.terrain[i] = ok ? 1 : 0;
      }
      this.terrainKey = key;
    }
    const cost = f.cost;
    const occ = f.occ;
    for (let i = 0; i < size; i++) cost[i] = this.terrain[i] ? COST_OPEN : COST_BLOCKED;

    // own occupancy from the building list (works even while BuildingSystem queries are stubbed)
    const core = this.index.core;
    let goalCount = 0;
    for (const b of st.buildings.list) {
      const def = game.data.building(b.def);
      if (!def) continue;
      const isCore = b === core;
      if (!isCore && (b.status === 'damaged' || !blocksAliens(def))) continue;
      const w = footW(def, b.rot);
      const h = footH(def, b.rot);
      for (let dz = 0; dz < h; dz++) {
        for (let dx = 0; dx < w; dx++) {
          const i = f.idx(b.x + dx, b.z + dz);
          if (i < 0) continue;
          cost[i] = TUNE.BASH_COST;
          occ[i] = b.id;
          if (isCore) {
            if (goalCount >= this.goals.length) {
              const g = new Int32Array(this.goals.length * 2);
              g.set(this.goals);
              this.goals = g;
            }
            this.goals[goalCount++] = i;
          }
        }
      }
    }

    // merge the construction system's alien blocking (if implemented)
    const bs = game.sys.buildings;
    try {
      for (let i = 0; i < size; i++) {
        if (occ[i] !== 0 || cost[i] === COST_BLOCKED) continue;
        const cx = ox + (i % n);
        const cz = oz + Math.floor(i / n);
        if (!bs.blocked(cx, cz, 'alien')) continue;
        const ob = bs.at(cx, cz);
        if (ob) {
          if (ob.status === 'damaged') continue;
          cost[i] = TUNE.BASH_COST;
          occ[i] = ob.id;
        } else {
          cost[i] = COST_BLOCKED;
        }
      }
    } catch {
      // construction queries unavailable — own occupancy is enough
    }

    if (goalCount === 0) {
      const ci = f.idx(cellOf(this.coreX), cellOf(this.coreZ));
      this.goals[goalCount++] = ci >= 0 ? ci : Math.floor(size / 2);
    }
    f.solve(this.goals, goalCount);
  }
}

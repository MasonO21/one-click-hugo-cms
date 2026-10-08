/**
 * PlayerSystem — joystick movement (camera-relative) with collision against solid buildings, nodes,
 * water and locked regions; vehicles; contextual interaction (gather, loot, rescue, use building,
 * mount vehicle); auto-gather; backpack + auto-deposit inside the colony; equipment & items;
 * knock-out/respawn (no loss).
 *
 * OWNER: world agent. Writes state.player.
 *
 * Movement follows the camera convention in docs/ARCHITECTURE.md:
 *   dx = moveX*cos(yaw) - moveY*sin(yaw);  dz = -moveX*sin(yaw) - moveY*cos(yaw);  rot = atan2(dx, dz)
 * The movement path is allocation-free: collision is a circle vs. blocked cells (building / water /
 * locked region / world edge) plus solid nodes from the static bucket grid, resolved by push-out in
 * sub-steps so the player slides along obstacles and can never tunnel through a wall at any dt.
 */
import { System } from './System';
import type { EquipSlot, ItemDef, VehicleDef } from '../data/schema';
import { CELL, WORLD_CELLS, cellMin, cellOf, rotatedSize } from '../core/constants';
import { approachAngle } from '../core/math';
import type { WorldNode } from './world';

export interface Interaction {
  kind: 'gather' | 'loot' | 'rescue' | 'building' | 'vehicle' | 'event' | 'deposit' | 'beacon' | 'attack' | 'chat';
  /** Button label, e.g. "Chop", "Mine", "Open", "Rescue". */
  label: string;
  icon: string;
  target: number | string | null;
  x: number;
  z: number;
}

/** Collision radius on foot / in a vehicle (world units). */
const RADIUS = 0.45;
const VEHICLE_RADIUS = 0.62;
/** Max distance moved per collision sub-step (must stay well below one cell). */
const STEP = 0.35;
/** Seconds knocked out before waking up at the colony core. */
const DOWN_SECONDS = 6;
/** Seconds without taking damage before health regenerates. */
const REGEN_DELAY = 6;
/** Health regenerated per second as a fraction of max HP (x3 inside the colony). */
const REGEN_RATE = 0.012;
/** Carry capacity without a backpack item (pockets). */
const POCKETS = 20;
const DRONE_RANGE = 8;
const DRONE_INTERVAL = 1.5;
const EVENT_RANGE = 7;
const POI_RANGE = 5;
const COOLDOWN_TOAST = 4;

export class PlayerSystem extends System {
  /** Actual (collision-aware, smoothed) speed in world units / s — for walk animations. */
  currentSpeed = 0;

  private vx = 0;
  private vz = 0;
  private px = 0;
  private pz = 0;
  /** Position before the current collision sub-step, and the joystick's world-space heading (unit, or 0). */
  private prevX = 0;
  private prevZ = 0;
  private intentX = 0;
  private intentZ = 0;
  private gatherCd = 0;
  private droneCd = 0;
  private depositCd = 0;
  private wasInColony = false;
  private lastDamageAt = -99;
  private lastHp = -1;
  private wasDown = false;
  private downAnnounced = false;
  private lockedIdx = -1;
  private stuckT = 0;
  private speedCache = 7;
  private maxHpCache = 100;
  private cacheT = 0;
  private lockToastAt = -99;
  private toolToastAt = -99;
  private packToastAt = -99;
  private fullToastAt = -99;
  private scratch = new Int32Array(256);

  // ================================================================== lifecycle

  override init(): void {
    this.game.bus.on('player:downed', () => {
      this.downAnnounced = true;
    });
  }

  override onLoad(fresh: boolean): void {
    const g = this.game;
    const p = g.state.player;
    if (fresh) {
      for (const [id, n] of Object.entries(g.data.starterKit.items)) this.addItem(id, n);
      for (const id of Object.values(g.data.starterKit.equip)) this.equip(id);
      p.x = 0;
      p.z = 5;
      p.rot = 0;
      this.refreshCaches();
      p.hp = this.maxHp();
    } else {
      if (p.vehicle && !p.vehicles.includes(p.vehicle)) p.vehicle = null;
      this.refreshCaches();
      p.hp = Math.min(p.hp, this.maxHp());
      if (p.hp <= 0 && p.downUntil <= 0) p.hp = this.maxHp();
      // a save made mid-knockout resumes the countdown from "now"
      if (p.downUntil > g.state.playTime + DOWN_SECONDS) p.downUntil = g.state.playTime + DOWN_SECONDS;
      if (!this.cellFreeAt(p.x, p.z)) {
        const spot = this.findFreeSpot(p.x, p.z);
        p.x = spot.x;
        p.z = spot.z;
      }
    }
    this.lastHp = p.hp;
    this.vx = this.vz = 0;
    this.wasInColony = this.inColony();
  }

  override update(dt: number): void {
    const g = this.game;
    const st = g.state;
    const p = st.player;
    const now = st.playTime;

    this.cacheT -= dt;
    if (this.cacheT <= 0) {
      this.cacheT = 0.25;
      this.refreshCaches();
    }
    if (this.lastHp >= 0 && p.hp < this.lastHp - 1e-6) this.lastDamageAt = now;

    if (this.updateDown(dt)) {
      this.lastHp = p.hp;
      return;
    }

    this.updateMovement(dt);
    this.updateDeposit(dt);
    this.updateGather(dt);
    if (g.input.interact) this.interact();
    this.updateRegen(dt);
    this.lastHp = p.hp;
  }

  private refreshCaches(): void {
    this.speedCache = this.speed();
    this.maxHpCache = this.computeMaxHp();
    // every way the carry limit can shrink (dismount, knock-out, backpack swapped out) passes through here
    if (this.carried() > this.capacity() + 1e-9) this.trimPack();
  }

  // ================================================================== movement & collision

  private updateMovement(dt: number): void {
    const g = this.game;
    const p = g.state.player;
    const inp = g.input;
    const vehicle = this.vehicleDef();

    let mx = inp.moveX;
    let my = inp.moveY;
    let mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
      mag = 1;
    } else if (mag < 0.06) {
      mx = my = mag = 0;
    }
    const yaw = g.view.camera.yaw;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ix = mx * c - my * s;
    const iz = -mx * s - my * c;
    this.intentX = mag > 0 ? ix / mag : 0;
    this.intentZ = mag > 0 ? iz / mag : 0;
    const tvx = ix * this.speedCache;
    const tvz = iz * this.speedCache;

    // smooth acceleration (vehicles are a bit heavier)
    const rate = mag > 0 ? (vehicle ? 7 : 13) : vehicle ? 8 : 16;
    const k = 1 - Math.exp(-dt * rate);
    this.vx += (tvx - this.vx) * k;
    this.vz += (tvz - this.vz) * k;

    const radius = vehicle ? VEHICLE_RADIUS : RADIUS;
    const hover = !!vehicle?.hover;
    const x0 = p.x;
    const z0 = p.z;
    this.px = x0;
    this.pz = z0;
    this.lockedIdx = -1;
    const dx = this.vx * dt;
    const dz = this.vz * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / STEP));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      this.prevX = this.px;
      this.prevZ = this.pz;
      this.px += sx;
      this.pz += sz;
      this.resolve(radius, hover);
    }
    p.x = this.px;
    p.z = this.pz;

    // actual speed (blocked pushing counts as standing still: lets auto-gather work against a tree)
    const moved = dt > 0 ? Math.sqrt((p.x - x0) * (p.x - x0) + (p.z - z0) * (p.z - z0)) / dt : 0;
    this.currentSpeed += (moved - this.currentSpeed) * (1 - Math.exp(-dt * 14));
    if (this.currentSpeed < 0.02) this.currentSpeed = 0;

    // facing: along the motion
    const sp2 = this.vx * this.vx + this.vz * this.vz;
    if (sp2 > 0.36 && moved > 0.4) p.rot = approachAngle(p.rot, Math.atan2(this.vx, this.vz), 16 * dt);

    // bumped a locked region border while pushing toward it
    if (this.lockedIdx >= 0 && mag > 0.1) this.notifyLocked(this.lockedIdx);

    // wedged inside geometry we cannot push out of (e.g. fully walled in): pop to the nearest free spot
    if (this.cellCode(cellOf(p.x), cellOf(p.z), hover) !== 0) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        const spot = this.findFreeSpot(p.x, p.z);
        p.x = spot.x;
        p.z = spot.z;
        this.stuckT = 0;
      }
    } else {
      this.stuckT = 0;
    }
  }

  /** 0 = free, 1 = blocked (building / water / world edge), 2 = locked region. */
  private cellCode(cx: number, cz: number, hover: boolean): number {
    const g = this.game;
    const t = g.sys.world.terrainCode(cx, cz, hover);
    if (t !== 0) {
      if (t === 2) this.lockedIdx = g.sys.world.gen.regionMap[cz * WORLD_CELLS + cx];
      return t;
    }
    return g.sys.buildings.blocked(cx, cz, 'player') ? 1 : 0;
  }

  /** Terrain + building test for a world point (no radius). */
  private cellFreeAt(x: number, z: number): boolean {
    const li = this.lockedIdx;
    const r = this.cellCode(cellOf(x), cellOf(z), false) === 0;
    this.lockedIdx = li;
    return r;
  }

  /**
   * Push the player circle (this.px/this.pz, radius r) out of blocked cells and solid nodes. A few
   * relaxation passes handle corners and node/wall combinations; allocation-free.
   */
  private resolve(r: number, hover: boolean): void {
    const world = this.game.sys.world;
    const depleted = this.game.state.world.depleted;
    const nodes = world.gen.nodes;
    const r2 = r * r;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const cx0 = cellOf(this.px - r);
      const cx1 = cellOf(this.px + r);
      const cz0 = cellOf(this.pz - r);
      const cz1 = cellOf(this.pz + r);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (this.cellCode(cx, cz, hover) === 0) continue;
          const minx = cellMin(cx);
          const minz = cellMin(cz);
          const maxx = minx + CELL;
          const maxz = minz + CELL;
          const qx = this.px < minx ? minx : this.px > maxx ? maxx : this.px;
          const qz = this.pz < minz ? minz : this.pz > maxz ? maxz : this.pz;
          const ddx = this.px - qx;
          const ddz = this.pz - qz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= r2) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const f = (r - d) / d;
            this.px += ddx * f;
            this.pz += ddz * f;
          } else {
            this.escapeCell(cx, cz, minx, minz, maxx, maxz, r, hover);
          }
          moved = true;
        }
      }
      // solid resource nodes
      const reach = r + 1.25;
      const n = world.grid.collect(this.px - reach, this.pz - reach, this.px + reach, this.pz + reach, this.scratch);
      for (let k = 0; k < n; k++) {
        const i = this.scratch[k];
        const rad = world.nodeRadius(i);
        if (rad <= 0 || depleted[i] !== undefined) continue;
        const node = nodes[i];
        const ddx = this.px - node.x;
        const ddz = this.pz - node.z;
        const min = rad + r;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= min * min) continue;
        // Walking up to a trunk/boulder should *stop* you in front of it (so you can chop it), not make you
        // orbit it: when the stick points into the node, cancel the step instead of sliding around.
        if (d2 > 1e-10 && this.stepIntoNode(node.x, node.z, min, Math.sqrt(d2))) {
          moved = true;
          continue;
        }
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const f = (min - d) / d;
          this.px += ddx * f;
          this.pz += ddz * f;
        } else {
          this.px += min;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  /**
   * If the player is pushing (stick within ~45 degrees) straight into a node and the previous sub-step was clear
   * of it, undo this sub-step. Returns true when the step was cancelled.
   */
  private stepIntoNode(nx: number, nz: number, minDist: number, dist: number): boolean {
    const tx = (nx - this.px) / dist;
    const tz = (nz - this.pz) / dist;
    if (this.intentX * tx + this.intentZ * tz < 0.7) return false;
    const fx = this.prevX - nx;
    const fz = this.prevZ - nz;
    const c = fx * fx + fz * fz - minDist * minDist;
    if (c < 0) return false; // already overlapping: let the push-out resolve it
    // slide the sub-step back to the exact contact point (ray vs. circle) so we stop flush against the trunk
    const dx = this.px - this.prevX;
    const dz = this.pz - this.prevZ;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const disc = b * b - 4 * a * c;
    let t = 0;
    if (a > 1e-12 && disc >= 0) t = Math.min(1, Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)));
    this.px = this.prevX + dx * t;
    this.pz = this.prevZ + dz * t;
    return true;
  }

  /** The circle centre is inside a blocked cell: leave through the nearest face that opens onto a free cell. */
  private escapeCell(cx: number, cz: number, minx: number, minz: number, maxx: number, maxz: number, r: number, hover: boolean): void {
    const l = this.px - minx;
    const rt = maxx - this.px;
    const d = this.pz - minz;
    const u = maxz - this.pz;
    let best = -1;
    let bd = Infinity;
    if (l < bd && this.cellCode(cx - 1, cz, hover) === 0) {
      bd = l;
      best = 0;
    }
    if (rt < bd && this.cellCode(cx + 1, cz, hover) === 0) {
      bd = rt;
      best = 1;
    }
    if (d < bd && this.cellCode(cx, cz - 1, hover) === 0) {
      bd = d;
      best = 2;
    }
    if (u < bd && this.cellCode(cx, cz + 1, hover) === 0) {
      bd = u;
      best = 3;
    }
    if (best < 0) {
      const m = Math.min(l, rt, d, u);
      best = m === l ? 0 : m === rt ? 1 : m === d ? 2 : 3;
    }
    if (best === 0) this.px = minx - r;
    else if (best === 1) this.px = maxx + r;
    else if (best === 2) this.pz = minz - r;
    else this.pz = maxz + r;
  }

  private notifyLocked(regionIdx: number): void {
    const g = this.game;
    const now = g.state.playTime;
    if (now - this.lockToastAt < COOLDOWN_TOAST) return;
    this.lockToastAt = now;
    const id = g.sys.world.gen.regionIds[regionIdx];
    const reason = g.sys.world.lockReason(id) ?? 'Locked';
    g.toast(`🔒 ${g.data.biome(id)?.name ?? id} — ${reason}`, 'warning');
    g.bus.emit('world:regionLocked', { id, reason });
  }

  /**
   * Nearest free standing spot to (x, z): spirals outward over cells, rejecting blocked cells, water,
   * locked regions and spots inside solid nodes. Used for respawn, fast travel and un-sticking.
   */
  findFreeSpot(x: number, z: number): { x: number; z: number } {
    const world = this.game.sys.world;
    const cx0 = cellOf(x);
    const cz0 = cellOf(z);
    const li = this.lockedIdx;
    let out: { x: number; z: number } | null = null;
    for (let ring = 0; ring <= 14 && !out; ring++) {
      for (let dz = -ring; dz <= ring && !out; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const cx = cx0 + dx;
          const cz = cz0 + dz;
          if (this.cellCode(cx, cz, false) !== 0) continue;
          const wx = cellMin(cx) + CELL / 2;
          const wz = cellMin(cz) + CELL / 2;
          // keep the whole circle clear of neighbours too
          if (this.cellCode(cx - 1, cz, false) !== 0 || this.cellCode(cx + 1, cz, false) !== 0 || this.cellCode(cx, cz - 1, false) !== 0 || this.cellCode(cx, cz + 1, false) !== 0) {
            if (ring < 14) continue;
          }
          if (world.solidNear(wx, wz, RADIUS + 0.1)) continue;
          out = { x: wx, z: wz };
          break;
        }
      }
    }
    this.lockedIdx = li;
    return out ?? { x: 0, z: 5 };
  }

  /** Teleport (debug / scripted). Updates fog, discovery and POI proximity immediately. */
  teleport(x: number, z: number): void {
    const p = this.game.state.player;
    p.x = x;
    p.z = z;
    this.vx = this.vz = 0;
    this.currentSpeed = 0;
    this.game.sys.world.onPlayerMoved();
  }

  /** Effective walking speed (world units / s) including vehicle & modifiers. */
  speed(): number {
    const g = this.game;
    const v = this.vehicleDef();
    return g.data.balance.playerSpeed * g.sys.economy.modifier('moveSpeed') * (v?.speed ?? 1);
  }

  // ================================================================== backpack & colony

  /** Is the player inside the colony (deposit zone)? */
  inColony(): boolean {
    const g = this.game;
    const p = g.state.player;
    const r = (g.state.colony.radius + 4) * CELL;
    return p.x * p.x + p.z * p.z <= r * r;
  }

  /** Total resources currently carried. */
  carried(): number {
    const bp = this.game.state.player.backpack;
    let n = 0;
    for (const k in bp) n += bp[k];
    return n;
  }

  /** Backpack capacity: equipped backpack item + vehicle storage. */
  capacity(): number {
    const bp = this.equippedDef('backpack');
    return (bp?.stats?.capacity ?? POCKETS) + (this.vehicleDef()?.storage ?? 0);
  }

  /** Move everything in the backpack into colony storage (what does not fit stays in the pack). */
  depositBackpack(): void {
    this.deposit(false);
  }

  /**
   * The carry limit dropped below what is carried (e.g. stepping off a vehicle that held 60 extra): the surplus is
   * sent home to colony storage, so the pack can never exceed its capacity. Whatever storage cannot hold is left
   * behind, exactly like a gather drop that does not fit.
   */
  private trimPack(): void {
    const g = this.game;
    const p = g.state.player;
    const bp = p.backpack;
    let excess = this.carried() - this.capacity();
    const moved: Record<string, number> = {};
    let total = 0;
    for (const id of Object.keys(bp)) {
      if (excess <= 1e-9) break;
      const take = Math.min(bp[id], excess);
      if (!(take > 0)) continue;
      bp[id] -= take;
      excess -= take;
      if (bp[id] <= 1e-9) delete bp[id];
      const added = g.sys.economy.add(id, take, 'gather', p.x, p.z);
      if (added > 0) {
        moved[id] = added;
        total += added;
      }
    }
    if (total > 0) {
      g.bus.emit('player:deposit', { bag: moved });
      g.toast('📦 Extra cargo was sent home to colony storage', 'info');
    }
  }

  private deposit(quiet: boolean): number {
    const g = this.game;
    const p = g.state.player;
    const bp = p.backpack;
    const moved: Record<string, number> = {};
    let total = 0;
    for (const id in bp) {
      const n = bp[id];
      if (!(n > 0)) {
        delete bp[id];
        continue;
      }
      const added = g.sys.economy.add(id, n, 'gather', p.x, p.z);
      if (added > 0) {
        moved[id] = added;
        total += added;
        bp[id] = n - added;
        if (bp[id] <= 1e-9) delete bp[id];
      }
    }
    if (total > 0) {
      g.bus.emit('player:deposit', { bag: moved });
      if (!quiet) g.bus.emit('sfx', { id: 'deposit', x: p.x, z: p.z });
      else g.bus.emit('sfx', { id: 'deposit', x: p.x, z: p.z, volume: 0.6 });
    }
    return total;
  }

  private updateDeposit(dt: number): void {
    const inCol = this.inColony();
    if (inCol && !this.wasInColony && this.carried() > 0) this.deposit(false);
    this.wasInColony = inCol;
    // storage may have been full on arrival: retry once a second while inside
    this.depositCd -= dt;
    if (inCol && this.depositCd <= 0) {
      this.depositCd = 1;
      if (this.carried() > 0) this.deposit(true);
    }
  }

  // ================================================================== gathering

  /** Tool tier of the equipped tool (bare hands = 0). */
  toolTier(): number {
    return this.equippedDef('tool')?.stats?.toolTier ?? 0;
  }

  private updateGather(dt: number): void {
    const g = this.game;
    const st = g.state;
    const p = st.player;
    const world = g.sys.world;
    const bal = g.data.balance;
    this.gatherCd -= dt;
    this.droneCd -= dt;

    // drone assistant (ad boost): gathers nearby nodes even while you run around
    if (this.droneCd <= 0 && this.droneActive()) {
      this.droneCd = DRONE_INTERVAL;
      const node = world.nearestNode(p.x, p.z, DRONE_RANGE, this.toolTier());
      if (node) this.hit(node, false);
    }
    if (this.gatherCd > 0 || g.view.panelOpen) return;

    const held = g.input.interactHeld;
    const auto = st.settings.autoGather && this.currentSpeed < 2.5;
    if (!auto && !held) return;
    // holding the button gathers only when gathering is what the button would do
    if (!auto && held) {
      const it = this.interaction();
      if (!it || it.kind !== 'gather') return;
    }
    const tier = this.toolTier();
    const node = world.nearestNode(p.x, p.z, bal.interactRange, tier);
    if (node) {
      this.hit(node, true);
    } else {
      const hard = world.nearestNode(p.x, p.z, bal.interactRange);
      if (hard) this.warnTool();
    }
  }

  private droneActive(): boolean {
    const boosts = this.game.state.liveops.boosts;
    const now = this.game.now();
    for (let i = 0; i < boosts.length; i++) if (boosts[i].kind === 'drone' && boosts[i].until > now) return true;
    return false;
  }

  private warnTool(): void {
    const now = this.game.state.playTime;
    if (now - this.toolToastAt < COOLDOWN_TOAST) return;
    this.toolToastAt = now;
    this.game.toast('🔧 Needs a better tool', 'warning');
  }

  /** One gather hit on a node. `face` turns the player toward it and starts the hit cooldown. */
  private hit(node: WorldNode, face: boolean): boolean {
    const g = this.game;
    const p = g.state.player;
    const world = g.sys.world;
    const def = world.nodeDef(node.i);
    if (def.toolTier > this.toolTier()) {
      this.warnTool();
      return false;
    }
    const mult = g.sys.economy.modifier('gatherYield') * g.sys.worldEvents.gatherBonus();
    const drop = world.hitNode(node.i, mult);
    if (face) {
      p.rot = Math.atan2(node.x - p.x, node.z - p.z);
      this.gatherCd = g.data.balance.gatherInterval / Math.max(0.1, g.sys.economy.modifier('gatherSpeed'));
    }
    this.collect(drop, node.x, node.z);
    return true;
  }

  /** Store a gather drop: straight into colony storage inside the colony, else into the backpack. */
  private collect(drop: Record<string, number | undefined>, x: number, z: number): void {
    const g = this.game;
    const st = g.state;
    const bp = st.player.backpack;
    const inCol = this.inColony();
    let gathered = 0;
    let full = false;
    let storageFull = false;
    for (const id in drop) {
      let n = drop[id] ?? 0;
      if (n <= 0) continue;
      if (inCol) {
        const added = g.sys.economy.add(id, n, 'gather', x, z);
        gathered += added;
        n -= added;
        if (n > 0) storageFull = true;
      }
      if (n > 0) {
        const free = Math.max(0, Math.floor(this.capacity() - this.carried()));
        const take = Math.min(n, free);
        if (take > 0) {
          bp[id] = (bp[id] ?? 0) + take;
          gathered += take;
        }
        if (take < n) full = true;
      }
    }
    st.stats.gathered += gathered;
    const now = st.playTime;
    if (full) {
      g.bus.emit('player:backpackFull', {});
      if (now - this.packToastAt >= COOLDOWN_TOAST) {
        this.packToastAt = now;
        g.toast(inCol ? '📦 Storage full — build more storage!' : '🎒 Backpack full — head back to the colony to unload', 'warning');
      }
    } else if (storageFull && now - this.fullToastAt >= COOLDOWN_TOAST) {
      this.fullToastAt = now;
      g.toast('📦 Storage is full — extra goes in your backpack', 'info');
    }
  }

  addItem(id: string, count = 1): void {
    const items = this.game.state.player.items;
    items[id] = (items[id] ?? 0) + count;
    this.game.bus.emit('item:gained', { item: id, count });
  }

  removeItem(id: string, count = 1): boolean {
    const p = this.game.state.player;
    const items = p.items;
    if ((items[id] ?? 0) < count) return false;
    items[id] -= count;
    if (items[id] <= 0) {
      delete items[id];
      // an equipped item that is no longer owned comes off
      for (const slot of Object.keys(p.equip) as EquipSlot[]) if (p.equip[slot] === id) this.unequip(slot);
    }
    return true;
  }

  // ================================================================== interaction

  /** Best interaction available near the player (drives the context button). */
  interaction(): Interaction | null {
    const g = this.game;
    const st = g.state;
    const p = st.player;
    if (this.isDown()) return null;
    const world = g.sys.world;
    const range = g.data.balance.interactRange;

    // 1. world event marker
    let bestD = Infinity;
    let found: Interaction | null = null;
    for (const ev of st.world.events) {
      const def = g.data.worldEvent(ev.def);
      if (!def || ev.endsAt <= st.playTime) continue;
      if (ev.claimed && def.kind !== 'merchant') continue;
      if (def.kind === 'storm' && !def.reward.resources && !def.reward.nova && !def.reward.rp && !def.reward.items) continue;
      const d = Math.hypot(ev.x - p.x, ev.z - p.z);
      if (d > EVENT_RANGE || d >= bestD) continue;
      bestD = d;
      found = { kind: 'event', label: eventLabel(def.kind), icon: def.icon, target: ev.id, x: ev.x, z: ev.z };
    }
    if (found) return found;

    // 1b. a colonist with a Chat wish close by (sim/wishes.ts): "Chat" with them
    const chat = g.sys.wishes?.chatTarget(p.x, p.z);
    if (chat) return { kind: 'chat', label: 'Chat', icon: '💬', target: chat.colonist.id, x: chat.colonist.x, z: chat.colonist.z };

    // 2. points of interest
    bestD = Infinity;
    for (const poi of world.gen.pois) {
      const dx = poi.x - p.x;
      const dz = poi.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > POI_RANGE || d >= bestD) continue;
      const def = g.data.poi(poi.def);
      if (!def) continue;
      const looted = st.world.pois[poi.id]?.looted === true;
      let it: Interaction | null = null;
      if (def.kind === 'beacon') {
        const active = st.world.beacons.includes(poi.id);
        it = { kind: 'beacon', label: active ? 'Fast Travel' : 'Activate', icon: def.icon, target: poi.id, x: poi.x, z: poi.z };
      } else if (looted) {
        continue;
      } else if (def.kind === 'camp') {
        it = { kind: 'rescue', label: 'Rescue', icon: def.icon, target: poi.id, x: poi.x, z: poi.z };
      } else if (def.kind === 'nest') {
        // guardians wake when you get close (WorldSystem); while any are alive the nest reads "Clear Nest"
        it = { kind: 'loot', label: def.guards && world.nestGuarded(poi.id) ? 'Clear Nest' : 'Open', icon: def.icon, target: poi.id, x: poi.x, z: poi.z };
      } else {
        it = { kind: 'loot', label: 'Open', icon: def.icon, target: poi.id, x: poi.x, z: poi.z };
      }
      bestD = d;
      found = it;
    }
    if (found) return found;

    // 3. buildings you can use
    const b = this.nearestUsableBuilding(range);
    if (b) return b;

    // 4. resource nodes
    const node = world.nearestNode(p.x, p.z, range);
    if (node) {
      const def = world.nodeDef(node.i);
      return { kind: 'gather', label: gatherLabel(def.model), icon: this.dropIcon(def.drop), target: node.i, x: node.x, z: node.z };
    }
    return null;
  }

  private dropIcon(drop: Record<string, number | undefined>): string {
    let best = '';
    let bn = -1;
    for (const id in drop) {
      const n = drop[id] ?? 0;
      if (n > bn) {
        bn = n;
        best = id;
      }
    }
    return this.game.data.resource(best)?.icon ?? '✋';
  }

  /** Closest interactive (non-piece, non-decor) building whose footprint is within `range`. */
  private nearestUsableBuilding(range: number): Interaction | null {
    const g = this.game;
    const p = g.state.player;
    const bs = g.sys.buildings;
    const pcx = cellOf(p.x);
    const pcz = cellOf(p.z);
    let best: Interaction | null = null;
    let bestD = range;
    for (const b of bs.all()) {
      if (Math.abs(b.x - pcx) > 16 || Math.abs(b.z - pcz) > 16) continue;
      if (b.status === 'building') continue;
      const def = bs.def(b);
      if (!def || def.piece || def.category === 'decor') continue;
      const [w, h] = rotatedSize(def.size, b.rot);
      const minx = cellMin(b.x);
      const minz = cellMin(b.z);
      const dx = Math.max(minx - p.x, 0, p.x - (minx + w * CELL));
      const dz = Math.max(minz - p.z, 0, p.z - (minz + h * CELL));
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > bestD) continue;
      bestD = d;
      const cx = minx + (w * CELL) / 2;
      const cz = minz + (h * CELL) / 2;
      let label = 'Manage';
      if (def.core) label = 'Colony';
      else if (def.spinWheel) label = 'Spin';
      else if (def.recruit) label = 'Recruit';
      else if (def.garage) label = 'Garage';
      else if (def.teleporter) label = 'Travel';
      else if (def.station) label = 'Craft';
      best = { kind: 'building', label, icon: def.icon, target: b.id, x: cx, z: cz };
    }
    return best;
  }

  /** Perform the current interaction (same as pressing the context button). */
  interact(): boolean {
    const it = this.interaction();
    if (!it) return false;
    const g = this.game;
    g.bus.emit('player:interact', { kind: it.kind, target: it.target });
    switch (it.kind) {
      case 'gather': {
        if (this.gatherCd > 0) return true;
        const node = g.sys.world.gen.nodes[it.target as number];
        if (node) this.hit(node, true);
        return true;
      }
      case 'event': {
        const ev = g.state.world.events.find((e) => e.id === it.target);
        const def = ev ? g.data.worldEvent(ev.def) : undefined;
        if (ev && def?.kind === 'merchant') {
          // first visit hands over the greeting gift; trades happen in the merchant panel
          g.sys.worldEvents.claim(ev.id);
          g.bus.emit('ui:open', { panel: 'merchant', arg: ev.id });
        } else if (ev) {
          g.sys.worldEvents.claim(ev.id);
        }
        return true;
      }
      case 'beacon': {
        const id = it.target as string;
        if (g.state.world.beacons.includes(id)) g.bus.emit('ui:open', { panel: 'map' });
        else g.sys.world.lootPoi(id);
        return true;
      }
      case 'chat':
        g.sys.wishes.chat(it.target as number);
        return true;
      case 'loot':
      case 'rescue': {
        const id = it.target as string;
        g.sys.world.lootPoi(id);
        return true;
      }
      case 'building': {
        const b = g.sys.buildings.get(it.target as number);
        const def = b ? g.sys.buildings.def(b) : undefined;
        if (!b || !def) return false;
        if (def.core) g.bus.emit('ui:open', { panel: 'colony' });
        else if (def.spinWheel) g.bus.emit('ui:open', { panel: 'spin' });
        else if (def.recruit) g.bus.emit('ui:open', { panel: 'recruit' });
        else if (def.garage) g.bus.emit('ui:open', { panel: 'vehicles' });
        else if (def.teleporter) g.bus.emit('ui:open', { panel: 'map' });
        else if (def.station) g.bus.emit('ui:open', { panel: 'craft', arg: def.station });
        else g.bus.emit('ui:open', { panel: 'building', arg: b.id });
        return true;
      }
      default:
        return false;
    }
  }

  // ================================================================== health, equipment, items

  private computeMaxHp(): number {
    const g = this.game;
    const armor = this.equippedDef('armor');
    return Math.max(1, Math.round((g.data.balance.playerHp + (armor?.stats?.hp ?? 0)) * g.sys.economy.modifier('playerHp')));
  }

  /** Max health: balance base + armor, scaled by research. */
  maxHp(): number {
    return this.computeMaxHp();
  }

  isDown(): boolean {
    const st = this.game.state;
    return st.player.hp <= 0 || st.player.downUntil > st.playTime;
  }

  /** Damage the player (combat helper). Knocks out at 0 HP — never kills. */
  hurt(amount: number): void {
    if (amount <= 0 || this.isDown()) return;
    const g = this.game;
    const p = g.state.player;
    p.hp = Math.max(0, p.hp - amount);
    this.lastDamageAt = g.state.playTime;
    g.bus.emit('player:damaged', { amount });
    g.bus.emit('sfx', { id: 'player_hurt', x: p.x, z: p.z });
    g.bus.emit('ui:float', { text: `-${Math.round(amount)}`, x: p.x, z: p.z, color: '#ff6b6b' });
    if (p.hp <= 0) this.updateDown(0);
  }

  /** Restore health (capped at max). Returns the amount healed. */
  heal(amount: number): number {
    const p = this.game.state.player;
    const max = this.maxHp();
    const before = p.hp;
    p.hp = Math.min(max, p.hp + amount);
    return p.hp - before;
  }

  /**
   * Knock-out state machine. Returns true while the player is out (no movement / interaction).
   * Combat only needs to reduce `hp` (or set `downUntil`); this notices it.
   */
  private updateDown(_dt: number): boolean {
    const g = this.game;
    const st = g.state;
    const p = st.player;
    const down = p.hp <= 0 || p.downUntil > st.playTime;
    if (!down) {
      this.wasDown = false;
      this.downAnnounced = false;
      return false;
    }
    if (!this.wasDown) {
      this.wasDown = true;
      if (p.downUntil <= st.playTime) p.downUntil = st.playTime + DOWN_SECONDS;
      p.hp = 0;
      this.vx = this.vz = 0;
      this.currentSpeed = 0;
      if (p.vehicle) this.dismountNow();
      if (!this.downAnnounced) g.bus.emit('player:downed', {});
      g.toast('💫 You were knocked out — waking up at the colony…', 'info');
    }
    if (st.playTime >= p.downUntil) {
      const core = g.sys.world.coreCenter();
      const spot = this.findFreeSpot(core.x, core.z + 5);
      p.x = spot.x;
      p.z = spot.z;
      p.hp = this.maxHp();
      p.downUntil = 0;
      this.wasDown = false;
      this.downAnnounced = false;
      g.sys.world.onPlayerMoved();
      g.bus.emit('player:respawned', {});
      g.toast('🛰️ Back at the colony — good as new!', 'success');
      return false;
    }
    return true;
  }

  private updateRegen(dt: number): void {
    const g = this.game;
    const p = g.state.player;
    if (p.hp >= this.maxHpCache) return;
    if (g.state.playTime - this.lastDamageAt < REGEN_DELAY) return;
    const rate = REGEN_RATE * (this.inColony() ? 3 : 1);
    p.hp = Math.min(this.maxHpCache, p.hp + this.maxHpCache * rate * dt);
  }

  private equippedDef(slot: EquipSlot): ItemDef | undefined {
    const id = this.game.state.player.equip[slot];
    return id ? this.game.data.item(id) : undefined;
  }

  /** Item id equipped in a slot, if any. */
  equipped(slot: EquipSlot): string | undefined {
    return this.game.state.player.equip[slot];
  }

  equip(itemId: string): boolean {
    const g = this.game;
    const p = g.state.player;
    const def = g.data.item(itemId);
    if (!def?.slot) return false;
    if ((p.items[itemId] ?? 0) <= 0) return false;
    if (p.equip[def.slot] === itemId) return true;
    const oldMax = this.computeMaxHp();
    p.equip[def.slot] = itemId;
    const newMax = this.computeMaxHp();
    // armor that raises max HP also tops you up by the difference
    if (newMax > oldMax && p.hp > 0) p.hp += newMax - oldMax;
    p.hp = Math.min(p.hp, newMax);
    this.refreshCaches();
    g.bus.emit('player:equipped', { item: itemId, slot: def.slot });
    return true;
  }

  unequip(slot: EquipSlot): void {
    const g = this.game;
    const p = g.state.player;
    if (!p.equip[slot]) return;
    delete p.equip[slot];
    this.refreshCaches();
    if (p.hp > this.maxHpCache) p.hp = this.maxHpCache;
    g.bus.emit('player:equipped', { item: '', slot });
  }

  /** Use a consumable (heal) or open a crate (reward). Returns false when nothing happened. */
  useItem(itemId: string): boolean {
    const g = this.game;
    const p = g.state.player;
    const def = g.data.item(itemId);
    if (!def?.use || (p.items[itemId] ?? 0) <= 0 || this.isDown()) return false;
    const use = def.use;
    if (use.heal && !use.reward && p.hp >= this.maxHp() - 1e-6) {
      g.toast('❤️ Already at full health', 'info');
      return false;
    }
    if (!this.removeItem(itemId, 1)) return false;
    if (use.heal) {
      const healed = this.heal(use.heal);
      g.bus.emit('ui:float', { text: `+${Math.round(healed || use.heal)} HP`, x: p.x, z: p.z, color: '#6be37a' });
    }
    if (use.reward) {
      g.bus.emit('sfx', { id: 'crate_open' });
      g.toast(`${def.icon} ${def.name} opened!`, 'reward');
      g.grant(use.reward, 'crate', p.x, p.z, def.id);
    }
    return true;
  }

  // ================================================================== vehicles

  vehicleDef(): VehicleDef | undefined {
    const id = this.game.state.player.vehicle;
    return id ? this.game.data.vehicle(id) : undefined;
  }

  /** Mount any owned vehicle, anywhere (cozy: no garage trip needed). */
  mount(vehicleId: string): boolean {
    const g = this.game;
    const p = g.state.player;
    if (!p.vehicles.includes(vehicleId) || !g.data.vehicle(vehicleId) || this.isDown()) return false;
    if (p.vehicle === vehicleId) return true;
    if (g.sys.expeditions?.vehicleAway(vehicleId)) return false; // out on an expedition with a squad
    // switching vehicles swaps directly (no stop in between), so cargo is not trimmed to on-foot capacity
    const previous = p.vehicle;
    p.vehicle = vehicleId;
    this.refreshCaches();
    if (previous) g.bus.emit('vehicle:dismounted', { vehicle: previous });
    g.bus.emit('vehicle:mounted', { vehicle: vehicleId });
    g.bus.emit('sfx', { id: 'vehicle_start', x: p.x, z: p.z });
    return true;
  }

  dismount(): void {
    const g = this.game;
    const p = g.state.player;
    if (!p.vehicle) return;
    // hover vehicles can float over lakes — you cannot step off into the water
    if (g.sys.world.isWater(p.x, p.z)) {
      g.toast("🌊 Can't get off over water!", 'warning');
      return;
    }
    this.dismountNow();
  }

  private dismountNow(): void {
    const g = this.game;
    const p = g.state.player;
    const v = p.vehicle;
    if (!v) return;
    p.vehicle = null;
    this.refreshCaches();
    g.bus.emit('vehicle:dismounted', { vehicle: v });
  }

  // ================================================================== fast travel

  /** Teleport to a beacon/teleporter POI id or 'base'. */
  fastTravel(to: string): boolean {
    const g = this.game;
    const p = g.state.player;
    if (this.isDown()) return false;
    const target = g.sys.world.fastTravelTargets().find((t) => t.id === to);
    if (!target) return false;
    const spot = this.findFreeSpot(target.x, target.z + (to === 'base' ? 5 : 2.6));
    p.x = spot.x;
    p.z = spot.z;
    this.vx = this.vz = 0;
    this.currentSpeed = 0;
    g.sys.world.onPlayerMoved();
    g.bus.emit('world:fastTravel', { to });
    g.bus.emit('sfx', { id: 'teleport', x: p.x, z: p.z });
    return true;
  }
}

function eventLabel(kind: string): string {
  switch (kind) {
    case 'drop':
      return 'Collect';
    case 'rescue':
      return 'Rescue';
    case 'nest':
      return 'Clear Nest';
    case 'merchant':
      return 'Trade';
    case 'ancient':
      return 'Activate';
    case 'storm':
      return 'Investigate';
    default:
      return 'Salvage';
  }
}

function gatherLabel(model: string): string {
  if (model.includes('tree')) return 'Chop';
  if (model.includes('bush') || model.includes('berry')) return 'Pick';
  if (/rock|ore|coal|crystal|ice|titanium|scrap|metal/.test(model)) return 'Mine';
  return 'Harvest';
}

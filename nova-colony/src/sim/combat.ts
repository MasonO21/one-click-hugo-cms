/**
 * CombatSystem — invasion schedule (peace -> warning 2:00 -> attack -> victory chest), wave
 * composition from InvasionDef, alien spawning (edge / burrow / queen spawns), flow-field pathing to
 * the core, alien attacks on buildings & player, turrets/traps/shields/repair, projectiles, player
 * weapon auto-fire, kill drops, victory rewards (double via rewarded ad).
 *
 * Cozy rules: buildings are never destroyed (0 hp => 'damaged', auto-repaired for free afterwards);
 * if aliens overwhelm the core, the attack simply ends with a smaller chest.
 *
 * Schedule: the first attack is scheduled by the tutorial mission (`schedule`). After the first
 * victory, attacks come every `TierDef.invasionInterval` seconds of online play (warning
 * `balance.warningSeconds`). Loading a save never resumes a fight: transient aliens are cleared and an
 * interrupted warning/attack restarts as a full warning.
 *
 * Implementation lives in ./combat/* (context, flow field, spatial hash, AI, weapons, waves).
 *
 * OWNER: combat agent. Writes state.combat.
 */
import { System } from './System';
import type { Game } from '../core/Game';
import type { CombatPhase, Id } from '../core/state';
import { CELL } from '../core/constants';
import { fmtClock } from '../core/format';
import { CombatContext } from './combat/context';
import { AlienAI, openAt } from './combat/alienAI';
import { Weapons } from './combat/weapons';
import { planWave, scaleReward, victoryReward, type SpawnItem } from './combat/waves';
import { centerX, centerZ, footH, footW, type ShieldEntry, type TurretEntry } from './combat/buildingIndex';
import type { FlowField } from './combat/flowField';
import { TUNE, type VictoryInfo } from './combat/types';
import { installCombatHints } from './combat/hints';

export type { VictoryInfo } from './combat/types';

export class CombatSystem extends System {
  private readonly ctx: CombatContext;
  private readonly ai: AlienAI;
  private readonly weapons: Weapons;
  /** Victory celebration countdown before returning to peace. */
  private victoryT = 0;
  /** playTime when the debounced flow-field rebuild is due (attack only). */
  private fieldDueAt = Infinity;
  private fieldLayout = -1;
  private secondT = 0;
  /** Countdown toasts already shown for the current warning. */
  private warnedFinal = false;
  /** The core was already 'damaged' when the attack began (don't count it as a breach). */
  private coreDownAtStart = false;

  constructor(game: Game) {
    super(game);
    this.ctx = new CombatContext(game);
    this.ai = new AlienAI(this.ctx);
    this.weapons = new Weapons(this.ctx);
  }

  // ================================================================== lifecycle

  override init(): void {
    const bus = this.game.bus;
    installCombatHints(this.game);
    const dirty = () => {
      this.ctx.index.dirty = true;
    };
    bus.on('building:placed', dirty);
    bus.on('building:completed', dirty);
    bus.on('building:moved', dirty);
    bus.on('building:removed', dirty);
    bus.on('building:upgraded', dirty);
    bus.on('building:broken', dirty);
    bus.on('building:repaired', dirty);
    bus.on('building:changed', dirty);
    bus.on('colony:expanded', () => {
      dirty();
      this.markField();
    });
    bus.on('colony:tierUp', () => {
      this.game.state.combat.waveAtTier = 0;
      dirty();
    });
    bus.on('world:regionUnlocked', () => this.ctx.invalidateTerrain());
  }

  override onLoad(fresh: boolean): void {
    const c = this.normalize();
    this.ctx.reset();
    c.spawnQueue.length = 0;
    this.ctx.index.refresh(true);
    this.ctx.updateCenter();
    this.fieldDueAt = Infinity;
    this.victoryT = 0;
    if (fresh) {
      c.phase = 'peace';
      c.nextAt = Infinity;
      return;
    }
    switch (c.phase) {
      case 'warning':
      case 'attack': {
        // never resume a fight after loading: restart a full warning instead
        const warn = c.warnFor && c.warnFor > 0 ? c.warnFor : this.game.data.balance.warningSeconds;
        c.warnFor = warn;
        this.beginWarning(warn);
        break;
      }
      case 'victory':
        this.enterPeace();
        break;
      default:
        if (!Number.isFinite(c.nextAt) && c.wave > 0) this.enterPeace();
    }
  }

  override update(dt: number): void {
    const st = this.game.state;
    const c = st.combat;
    const ctx = this.ctx;
    ctx.beginFrame(dt);

    switch (c.phase) {
      case 'peace':
        if (st.playTime >= c.nextAt) this.beginWarning(c.warnFor ?? this.game.data.balance.warningSeconds);
        break;
      case 'warning':
        this.warningTick();
        break;
      case 'attack':
        this.attackTick();
        break;
      case 'victory':
        this.victoryT -= dt;
        if (this.victoryT <= 0) this.enterPeace();
        break;
    }

    if (c.aliens.length > 0 || c.projectiles.length > 0) {
      ctx.hash.rebuild(c.aliens);
      this.ai.update(dt);
      this.weapons.update(dt);
      ctx.sweep();
    } else {
      ctx.invaders = 0;
      this.weapons.idle(dt);
    }
    ctx.regenShields(dt);
    if (c.phase === 'attack') this.checkEnd();

    this.secondT -= dt;
    if (this.secondT <= 0) {
      this.secondT = 1;
      this.updateDerived();
    }
  }

  // ================================================================== public API (contract)

  /** Seconds until the next attack (warning included), or Infinity. */
  secondsToAttack(): number {
    const st = this.game.state;
    const c = st.combat;
    const warn = c.warnFor ?? this.game.data.balance.warningSeconds;
    switch (c.phase) {
      case 'peace':
        return Number.isFinite(c.nextAt) ? Math.max(0, c.nextAt - st.playTime) + warn : Infinity;
      case 'warning':
        return Math.max(0, c.nextAt - st.playTime);
      case 'attack':
        return 0;
      case 'victory':
        return Math.max(0, this.victoryT) + this.regularGap() + this.game.data.balance.warningSeconds;
    }
    return Infinity;
  }

  /** Schedule an attack: warning begins after `delay` seconds and lasts `warning` seconds. */
  schedule(delay: number, warning: number): void {
    const st = this.game.state;
    const c = st.combat;
    c.tutorialAttackDone = true;
    if (c.phase === 'attack') return; // already fighting
    if (c.phase !== 'peace') this.setPhase('peace');
    c.warnFor = Math.max(0, warning);
    c.nextAt = st.playTime + Math.max(0, delay);
  }

  /** Skip the remaining warning and start immediately (small bonus reward). */
  startNow(): void {
    const c = this.game.state.combat;
    if (c.phase === 'warning' || (c.phase === 'peace' && Number.isFinite(c.nextAt))) this.beginAttack(true);
  }

  /** Claim the pending victory chest (doubled = rewarded ad watched). */
  claimReward(doubled: boolean): boolean {
    const c = this.game.state.combat;
    const pending = c.pendingReward;
    if (!pending) return false;
    c.pendingReward = null;
    this.game.grant(doubled ? scaleReward(pending, 2) : pending, 'invasion', this.ctx.coreX, this.ctx.coreZ);
    this.game.bus.emit('combat:rewardClaimed', { doubled });
    if (c.phase === 'victory') this.enterPeace();
    return true;
  }

  /**
   * Spawn "wild" aliens outside of invasions (alien nests, world events). They chase the player within a
   * leash radius and never path to the colony. Returns spawned ids. Positions in world units.
   */
  spawnWild(alienId: string, count: number, x: number, z: number): number[] {
    const def = this.game.data.alien(alienId);
    const ids: number[] = [];
    if (!def) return ids;
    const rng = this.game.rng;
    for (let i = 0; i < count; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const r = count > 1 ? rng.range(0.5, 1.5) * CELL : 0;
      const a = this.ctx.spawnAlien(def, x + Math.cos(ang) * r, z + Math.sin(ang) * r, { wild: true, homeX: x, homeZ: z });
      if (a) ids.push(a.id);
    }
    return ids;
  }

  /** Living wild aliens within `radius` world units of a position (a nest is cleared when this reaches 0). */
  wildNear(x: number, z: number, radius: number): number {
    let n = 0;
    const r2 = radius * radius;
    for (const a of this.game.state.combat.aliens) {
      if (!a.wild || a.state === 'dying' || a.hp <= 0) continue;
      const dx = a.x - x;
      const dz = a.z - z;
      if (dx * dx + dz * dz <= r2) n++;
    }
    return n;
  }

  /** Rough defense strength for UI ("Defense rating") = total turret DPS. */
  defenseRating(): number {
    this.ctx.index.refresh();
    return Math.round(this.weapons.turretDps());
  }

  /** Player weapon damage per second against aliens nearby (for UI). */
  playerDps(): number {
    return Math.round(this.weapons.playerDps() * 10) / 10;
  }

  // ================================================================== public API (additions)

  /**
   * Spawn one invasion alien at a world position (scripted events / debug). It paths to the core like
   * any invader (burrowers emerge from the ground right there) and counts toward the current wave if
   * an attack is running. Returns its id or null.
   */
  spawnInvader(alienId: string, x: number, z: number): number | null {
    const def = this.game.data.alien(alienId);
    if (!def) return null;
    const c = this.game.state.combat;
    const a = this.ctx.spawnAlien(def, x, z, { hpScale: this.ctx.hpScale, burrow: !!def.burrow && !def.flying });
    if (a && c.phase === 'attack') c.waveTotal = (c.waveTotal ?? 0) + 1;
    return a ? a.id : null;
  }

  /** Damage a building through shields (e.g. meteor world events). Returns damage that got through. */
  hitBuilding(id: Id, amount: number, fromX?: number, fromZ?: number): number {
    this.ctx.index.refresh();
    const b = this.ctx.index.get(id);
    if (!b) return 0;
    const def = this.game.data.building(b.def)!;
    return this.ctx.damageBuilding(b, amount, fromX ?? centerX(b, def), fromZ ?? centerZ(b, def));
  }

  /** Turret runtime for render (aim yaw, current target, last shot time). */
  turretInfo(id: Id): Readonly<TurretEntry> | undefined {
    return this.ctx.index.turret(id);
  }

  /** Shield runtime for render/UI (current & max absorb capacity, radius in world units). */
  shieldInfo(id: Id): Readonly<ShieldEntry> | undefined {
    return this.ctx.index.shield(id);
  }

  /** Invasion aliens still to beat this wave (alive + queued), for a wave progress bar. */
  remaining(): number {
    const c = this.game.state.combat;
    if (c.phase !== 'attack') return 0;
    let alive = 0;
    for (const a of c.aliens) if (!a.wild && !a.retreat && a.state !== 'dying') alive++;
    return alive + c.spawnQueue.length;
  }

  /** The alien flow field (debug overlays / tests). */
  flowField(): FlowField {
    return this.ctx.field;
  }

  /** Force-refresh building caches and the flow field (after bulk edits; tests). */
  refresh(): void {
    this.ctx.index.refresh(true);
    this.ctx.updateCenter();
    this.ctx.rebuildField();
    this.fieldLayout = this.ctx.index.layoutVersion;
  }

  // ================================================================== phases

  private normalize() {
    const c = this.game.state.combat;
    c.aliens ??= [];
    c.projectiles ??= [];
    c.spawnQueue ??= [];
    if (typeof c.nextAt !== 'number' || c.nextAt > 1e299) c.nextAt = Infinity;
    c.phase ??= 'peace';
    c.wave ??= 0;
    c.waveAtTier ??= 0;
    c.killsThisWave ??= 0;
    c.kills ??= 0;
    c.nextEntityId ??= 1;
    c.pendingReward ??= null;
    c.tutorialAttackDone ??= false;
    return c;
  }

  private setPhase(phase: CombatPhase): void {
    const c = this.game.state.combat;
    const prev = c.phase;
    c.phase = phase;
    if (prev !== phase) this.game.bus.emit('combat:phase', { phase, prev });
  }

  /** Seconds of peace between a victory and the next warning. */
  private regularGap(): number {
    const st = this.game.state;
    const interval = this.game.data.tier(st.colony.tier).invasionInterval;
    return Math.max(30, interval - this.game.data.balance.warningSeconds);
  }

  private enterPeace(): void {
    const st = this.game.state;
    const c = st.combat;
    this.setPhase('peace');
    if (c.wave > 0) {
      c.nextAt = st.playTime + this.regularGap();
      c.warnFor = this.game.data.balance.warningSeconds;
    } else {
      c.nextAt = Infinity;
    }
  }

  private beginWarning(seconds: number): void {
    const st = this.game.state;
    const c = st.combat;
    if (seconds <= 0) {
      this.beginAttack(false);
      return;
    }
    c.killsThisWave = 0;
    c.bonus = 0;
    c.nextAt = st.playTime + seconds;
    this.warnedFinal = seconds <= 15;
    this.setPhase('warning');
    this.game.bus.emit('combat:warning', { wave: c.wave + 1, seconds });
    this.game.toast(`ALIEN ACTIVITY DETECTED — ATTACK IN ${fmtClock(seconds)}`, 'warning', '👾');
    this.game.bus.emit('sfx', { id: 'alarm' });
  }

  private warningTick(): void {
    const st = this.game.state;
    const c = st.combat;
    const left = c.nextAt - st.playTime;
    if (!this.warnedFinal && left <= 10) {
      this.warnedFinal = true;
      this.game.toast(`Aliens incoming — ${fmtClock(left)}! Stand near your turrets.`, 'warning', '👾');
    }
    if (left <= 0) this.beginAttack(false);
  }

  /** Farthest point (cells from the colony center) any turret can hit — waves spawn beyond it. */
  private turretReachCells(): number {
    const ctx = this.ctx;
    let reach = 0;
    for (const t of ctx.index.turrets) {
      const d = Math.hypot(t.x - ctx.coreX, t.z - ctx.coreZ) / CELL + t.spec.range * ctx.mods.turretRange;
      if (d > reach) reach = d;
    }
    return reach > 0 ? Math.ceil(reach + 2) : 0;
  }

  private beginAttack(early: boolean): void {
    const st = this.game.state;
    const c = st.combat;
    const ctx = this.ctx;
    ctx.index.refresh(true);
    ctx.updateCenter();
    const plan = planWave(this.game, st.playTime, ctx.coreX, ctx.coreZ, c.wave < TUNE.EARLY_WAVES ? this.defenseBearing() : null, this.turretReachCells());
    c.spawnQueue.length = 0;
    for (const it of plan.queue) c.spawnQueue.push(it);
    ctx.hpScale = plan.hpScale;
    c.waveTotal = plan.queue.length;
    c.killsThisWave = 0;
    c.bonus = early ? 0.1 : 0;
    c.attackStartedAt = st.playTime;
    c.nextAt = Infinity;
    ctx.lastProgressAt = st.playTime;
    this.coreDownAtStart = ctx.index.core?.status === 'damaged';
    ctx.rebuildField();
    this.fieldLayout = ctx.index.layoutVersion;
    this.fieldDueAt = Infinity;
    this.setPhase('attack');
    this.game.bus.emit('combat:started', { wave: c.wave + 1, aliens: plan.queue.length });
    this.game.bus.emit('sfx', { id: 'attack_start' });
    this.game.bus.emit('fx:shake', { strength: 0.6 });
    this.game.toast(early ? 'Bring it on! The aliens are attacking (+10% reward).' : 'The aliens are attacking! Defend the colony!', 'danger', '👾');
  }

  /** Direction (radians, atan2(dz, dx)) from the core toward the centroid of working turrets, or null. */
  private defenseBearing(): number | null {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const t of this.ctx.index.turrets) {
      if (t.b.status !== 'active') continue;
      sx += t.x;
      sz += t.z;
      n++;
    }
    if (n === 0) return null;
    const dx = sx / n - this.ctx.coreX;
    const dz = sz / n - this.ctx.coreZ;
    return dx * dx + dz * dz < 1 ? null : Math.atan2(dz, dx);
  }

  private markField(): void {
    if (this.game.state.combat.phase !== 'attack') return;
    const due = this.game.state.playTime + TUNE.FIELD_DEBOUNCE;
    if (due < this.fieldDueAt) this.fieldDueAt = due;
  }

  private attackTick(): void {
    const st = this.game.state;
    const c = st.combat;
    const q = c.spawnQueue;
    while (q.length > 0 && q[q.length - 1].at <= st.playTime) this.spawnQueued(q.pop()!);
    if (this.ctx.index.layoutVersion !== this.fieldLayout) {
      this.fieldLayout = this.ctx.index.layoutVersion;
      this.markField();
    }
    if (st.playTime >= this.fieldDueAt) {
      this.fieldDueAt = Infinity;
      this.ctx.rebuildField();
    }
  }

  private spawnQueued(it: SpawnItem): void {
    const def = this.game.data.alien(it.alien);
    if (!def) return;
    let x = it.x;
    let z = it.z;
    const burrow = !!def.burrow && !def.flying;
    if (burrow) {
      const p = this.burrowPoint();
      x = p.x;
      z = p.z;
    }
    this.ctx.spawnAlien(def, x, z, { burrow, hpScale: this.ctx.hpScale });
  }

  /** Free ground next to a random building (burrowers emerge inside the colony). */
  private burrowPoint(): { x: number; z: number } {
    const ctx = this.ctx;
    const list = this.game.state.buildings.list;
    const rng = this.game.rng;
    for (let attempt = 0; attempt < 6 && list.length > 0; attempt++) {
      const b = list[rng.int(0, list.length - 1)];
      const def = this.game.data.building(b.def);
      if (!def) continue;
      const w = footW(def, b.rot) * CELL;
      const h = footH(def, b.rot) * CELL;
      const cx = centerX(b, def);
      const cz = centerZ(b, def);
      for (let k = 0; k < 8; k++) {
        const ang = rng.range(0, Math.PI * 2);
        const r = Math.max(w, h) / 2 + rng.range(1, 2.5) * CELL * 0.75;
        const x = cx + Math.cos(ang) * r;
        const z = cz + Math.sin(ang) * r;
        if (openAt(ctx, x, z)) return { x, z };
      }
    }
    const ang = rng.range(0, Math.PI * 2);
    return { x: ctx.coreX + Math.cos(ang) * 5 * CELL, z: ctx.coreZ + Math.sin(ang) * 5 * CELL };
  }

  private checkEnd(): void {
    const st = this.game.state;
    const c = st.combat;
    const core = this.ctx.index.core;
    if (core) {
      if (core.status === 'damaged') {
        if (!this.coreDownAtStart) {
          this.endAttack('breach');
          return;
        }
      } else this.coreDownAtStart = false;
    }
    if (c.spawnQueue.length > 0) return;
    const left = this.ctx.invaders;
    if (left === 0) {
      this.endAttack('victory');
      return;
    }
    const stragglers = left <= Math.max(2, Math.ceil((c.waveTotal ?? 0) * 0.25));
    if (stragglers && st.playTime - this.ctx.lastProgressAt > TUNE.STALL_SECONDS) this.endAttack('timeout');
    else if (st.playTime - (c.attackStartedAt ?? st.playTime) > TUNE.ATTACK_TIMEOUT) this.endAttack('timeout');
  }

  private endAttack(reason: VictoryInfo['reason']): void {
    const st = this.game.state;
    const c = st.combat;
    const kills = c.killsThisWave;
    const reward = victoryReward(this.game, kills, c.bonus ?? 0, reason === 'breach');
    c.wave++;
    c.waveAtTier++;
    st.stats.wavesWon++;
    if (c.pendingReward) this.game.grant(c.pendingReward, 'invasion'); // never lose an unclaimed chest
    c.pendingReward = reward;
    c.spawnQueue.length = 0;
    c.nextAt = Infinity;
    for (const a of c.aliens) if (!a.wild) this.ctx.retreat(a);
    this.fieldDueAt = Infinity;
    this.victoryT = TUNE.VICTORY_LINGER;
    this.setPhase('victory');
    if (reason === 'breach') {
      this.game.toast('The aliens retreated — your colony held!', 'success', '🛡️');
      this.game.bus.emit('combat:retreated', { wave: c.wave });
    } else if (reason === 'timeout') {
      this.game.toast('The last aliens fled — victory!', 'success', '🏆');
    }
    this.game.bus.emit('combat:ended', { wave: c.wave, kills, reward });
    this.game.bus.emit('sfx', { id: 'victory' });
    const info: VictoryInfo = { wave: c.wave, kills, reward, reason };
    this.game.bus.emit('ui:open', { panel: 'victory', arg: info });
  }

  private updateDerived(): void {
    const d = this.game.derived.defense;
    d.rating = Math.round(this.weapons.turretDps());
    let n = 0;
    for (const t of this.ctx.index.turrets) if (t.b.status === 'active') n++;
    d.turrets = n;
  }
}

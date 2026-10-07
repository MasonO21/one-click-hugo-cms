/**
 * MissionSystem — main story chain (drives the first 15 minutes), side missions, daily missions.
 * Listens to bus events and maintains lifetime counters "<type>:<target>" (+ "<type>:*"), plus
 * per-active-mission progress since activation. Claiming grants rewards and activates `next`
 * missions; `onComplete` scripted triggers (first attack, survivor spawn, celebration) fire the
 * moment a mission completes.
 *
 * Flow rules (cozy + retention-critical):
 *  - Main-chain missions auto-claim ~1.2 s after completion so the first 15 minutes flow without taps.
 *    Side and daily missions wait for a tap (`claim`).
 *  - One-shot missions (build X, research Y...) get retroactive credit from state at activation so
 *    doing things out of order never strands the player.
 *  - A daily that was finished but never tapped is auto-claimed when the day rolls over.
 *
 * OWNER: meta agent. Writes state.missions.
 */
import { System } from './System';
import type { MissionDef, MissionType } from '../data/schema';
import type { GainSource } from '../core/events';
import { dateKey } from '../core/format';
import { DAILY_COUNT, isLiveType, liveValue, pickDailies, retroValue } from './meta/missionRules';

/** Seconds between a main mission completing and it being claimed automatically. */
export const AUTO_CLAIM_DELAY = 1.2;
const LIVE_INTERVAL = 0.25;
const GATHER_SOURCES: ReadonlySet<GainSource> = new Set<GainSource>(['gather', 'production', 'drop']);

export interface MissionProgress {
  value: number;
  target: number;
  done: boolean;
}

export class MissionSystem extends System {
  /** Seconds left until a completed main mission claims itself. */
  private autoClaim = new Map<string, number>();
  /** Active mission ids by type (immutable arrays, rebuilt on change) for O(1) event dispatch. */
  private byType = new Map<MissionType, readonly string[]>();
  private liveIds: readonly string[] = [];
  /** > 0 while system-made progress (e.g. the free Lucky Wheel) must not count toward missions. */
  private muted = 0;
  private liveAcc = 0;
  private dayAcc = 0;
  private lastShown = new Map<string, number>();
  private survivorTries = 0;
  private survivorSpawned = false;

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    const bus = this.game.bus;
    bus.on('resource:gained', (e) => {
      if (GATHER_SOURCES.has(e.source)) this.bump('gather', [e.id], e.amount);
    });
    bus.on('building:completed', (e) => {
      const def = this.game.data.building(e.def);
      const keys = [e.def];
      if (def) keys.push(`category:${def.category}`);
      this.bump('build', keys, 1);
      this.recheckLive();
    });
    bus.on('building:upgraded', (e) => this.bump('upgrade', [e.def], 1));
    bus.on('colonist:recruited', (e) => {
      this.bump('recruit', [e.rarity], 1);
      this.recheckLive();
    });
    bus.on('colonist:assigned', () => this.recheckLive());
    bus.on('survivor:rescued', () => {
      this.bump('rescue', [], 1);
      this.recheckLive();
    });
    bus.on('world:regionDiscovered', (e) => this.bump('discover', [e.id], 1));
    bus.on('alien:killed', (e) => this.bump('kill', [e.def], 1));
    bus.on('combat:ended', () => this.bump('defend', [], 1));
    bus.on('craft:completed', (e) => this.bump('craft', [e.recipe], 1));
    bus.on('research:completed', (e) => this.bump('research', [e.id], 1));
    bus.on('world:poiLooted', (e) => this.bump('loot', [e.poi], 1));
    bus.on('player:equipped', (e) => this.bump('equip', [e.item], 1));
    bus.on('spin:result', () => this.bump('spin', [], 1));
    bus.on('colony:tierUp', () => this.recheckLive());
  }

  override onLoad(fresh: boolean): void {
    const m = this.game.state.missions;
    this.sanitize();
    if (fresh || (m.active.length === 0 && m.completed.length === 0)) this.seed();
    else this.repairChain();
    this.rollDaily();
    this.rebuildIndex();
    this.recheckLive();
    // anything finished-but-unclaimed in a loaded save resumes its auto-claim countdown
    for (const id of m.active) if (this.isMain(id) && this.isDone(id)) this.autoClaim.set(id, AUTO_CLAIM_DELAY);
  }

  override update(dt: number): void {
    if (this.autoClaim.size > 0) {
      for (const [id, left] of this.autoClaim) {
        if (left - dt <= 0) {
          this.autoClaim.delete(id);
          this.claim(id);
        } else this.autoClaim.set(id, left - dt);
      }
    }
    this.liveAcc += dt;
    if (this.liveAcc >= LIVE_INTERVAL) {
      this.liveAcc = 0;
      this.recheckLive();
    }
    this.dayAcc += dt;
    if (this.dayAcc >= 1) {
      this.dayAcc = 0;
      if (this.game.state.missions.dailyDate !== dateKey(this.game.now())) {
        this.rollDaily();
        this.rebuildIndex();
      }
    }
  }

  // ---------------------------------------------------------------- public API

  /** Active missions (in progress or waiting to be claimed): main first, then side, then daily. */
  active(): MissionDef[] {
    const out: MissionDef[] = [];
    for (const chain of ['main', 'side', 'daily'] as const) out.push(...this.activeByChain(chain));
    return out;
  }

  activeByChain(chain: MissionDef['chain']): MissionDef[] {
    const out: MissionDef[] = [];
    for (const id of this.game.state.missions.active) {
      const d = this.game.data.mission(id);
      if (d && d.chain === chain) out.push(d);
    }
    return out;
  }

  /** Today's daily missions (including ones already claimed). */
  dailies(): MissionDef[] {
    const out: MissionDef[] = [];
    for (const id of this.game.state.missions.daily) {
      const d = this.game.data.mission(id);
      if (d) out.push(d);
    }
    return out;
  }

  progress(id: string): MissionProgress {
    const def = this.game.data.mission(id);
    if (!def) return { value: 0, target: 1, done: false };
    const m = this.game.state.missions;
    if (m.completed.includes(id) && !m.active.includes(id)) return { value: def.count, target: def.count, done: true };
    const v = m.progress[id] ?? 0;
    return { value: Math.min(v, def.count), target: def.count, done: v >= def.count };
  }

  /** Completed and waiting for the player to tap Claim. */
  claimable(): MissionDef[] {
    return this.active().filter((d) => this.isDone(d.id));
  }

  /** True once the mission has been claimed. */
  isClaimed(id: string): boolean {
    const m = this.game.state.missions;
    return m.completed.includes(id) && !m.active.includes(id);
  }

  /** Claim a completed mission: grant its reward and activate its `next` missions. */
  claim(id: string): boolean {
    const m = this.game.state.missions;
    const def = this.game.data.mission(id);
    if (!def || !m.active.includes(id) || !this.isDone(id)) return false;
    m.active = m.active.filter((a) => a !== id);
    delete m.progress[id];
    this.autoClaim.delete(id);
    this.lastShown.delete(id);
    if (!m.completed.includes(id)) m.completed.push(id);
    try {
      this.game.grant(def.reward, 'mission');
    } catch (e) {
      console.error('[missions] reward grant failed', id, e);
    }
    this.game.bus.emit('mission:claimed', { id });
    for (const next of def.next ?? []) this.activate(next);
    this.rebuildIndex();
    return true;
  }

  /** Claim every finished mission (Missions panel "Claim all"). Returns how many were claimed. */
  claimAll(): number {
    let n = 0;
    for (const d of this.claimable()) if (this.claim(d.id)) n++;
    return n;
  }

  /** The main-chain mission currently guiding the player (tutorial hint/arrow). */
  current(): MissionDef | null {
    let fallback: MissionDef | null = null;
    for (const id of this.game.state.missions.active) {
      const d = this.game.data.mission(id);
      if (!d || d.chain !== 'main') continue;
      if (!this.isDone(id)) return d;
      fallback ??= d;
    }
    return fallback;
  }

  /** Lifetime counter, e.g. counter('build','campfire') or counter('kill'). */
  counter(type: MissionType, target = '*'): number {
    return this.game.state.missions.counters[`${type}:${target}`] ?? 0;
  }

  /** Run `fn` without crediting missions for events it causes (system-made content, e.g. the free wheel). */
  quietly<T>(fn: () => T): T {
    this.muted++;
    try {
      return fn();
    } finally {
      this.muted--;
    }
  }

  /**
   * Self-heal for the survivor step: if the current main mission points at a POI that no longer exists
   * (e.g. the dynamic camp was lost on reload), ask the world to spawn one again. Returns true if spawned.
   */
  ensureGuidePoi(): boolean {
    const def = this.current();
    if (!def || def.guide?.kind !== 'poi' || !def.guide.ref || def.type !== 'rescue' || this.isDone(def.id)) return false;
    if (this.survivorSpawned || this.survivorTries >= 5) return false;
    const w = this.game.sys.world;
    const poiState = this.game.state.world.pois;
    const exists = (w.gen?.pois ?? []).some((p) => p.def === def.guide!.ref && !poiState[p.id]?.looted);
    if (exists) return false;
    this.survivorTries++;
    return this.trySpawnSurvivor();
  }

  // ---------------------------------------------------------------- internals

  private isMain(id: string): boolean {
    return this.game.data.mission(id)?.chain === 'main';
  }

  private isDone(id: string): boolean {
    const def = this.game.data.mission(id);
    return !!def && (this.game.state.missions.progress[id] ?? 0) >= def.count;
  }

  /** Fresh colony: first main mission + the head of every side chain (the rest unlock as each is claimed). */
  private seed(): void {
    this.activate(this.game.data.firstMission);
    for (const d of this.game.data.missions) if (d.chain === 'side' && this.sideUnlocked(d.id)) this.activate(d.id);
  }

  /**
   * A side mission is offered once the side mission leading to it (via `next`) has been completed; chain
   * heads always are. Keeps the Side tab to a handful of reachable goals instead of every chain at once
   * (a new player was shown "Defeat 1,500 aliens" and "Build an Automated Farm" in minute one).
   */
  private sideUnlocked(id: string): boolean {
    const m = this.game.state.missions;
    let hasParent = false;
    for (const d of this.game.data.missions) {
      if (d.chain !== 'side' || !d.next?.includes(id)) continue;
      hasParent = true;
      if (m.completed.includes(d.id)) return true;
    }
    return !hasParent;
  }

  /** Make a loaded save consistent with current content (unknown ids dropped, new side missions added). */
  private repairChain(): void {
    const { data } = this.game;
    const m = this.game.state.missions;
    m.active = m.active.filter((id) => !!data.mission(id));
    m.completed = m.completed.filter((id) => !!data.mission(id));
    // older saves had every side mission active: keep only the reachable ones (progress is recomputed when a
    // mission becomes active again, from the lifetime counters / current colony)
    m.active = m.active.filter((id) => data.mission(id)?.chain !== 'side' || this.sideUnlocked(id));
    for (const d of data.missions) if (d.chain === 'side' && !m.completed.includes(d.id) && this.sideUnlocked(d.id)) this.activate(d.id);
    const hasMain = m.active.some((id) => this.isMain(id));
    if (hasMain) return;
    let started = false;
    for (const id of m.completed) {
      const d = data.mission(id);
      if (d?.chain !== 'main') continue;
      for (const next of d.next ?? []) if (this.activate(next)) started = true;
    }
    if (!started && !m.completed.some((id) => this.isMain(id))) this.activate(data.firstMission);
  }

  private sanitize(): void {
    const m = this.game.state.missions;
    m.active ??= [];
    m.completed ??= [];
    m.progress ??= {};
    m.counters ??= {};
    m.daily ??= [];
    m.dailyDate ??= '';
    for (const id of Object.keys(m.progress)) if (!m.active.includes(id)) delete m.progress[id];
  }

  /** Start tracking a mission. Returns true if it newly became active. */
  private activate(id: string): boolean {
    const m = this.game.state.missions;
    const def = this.game.data.mission(id);
    if (!def || m.active.includes(id) || (m.completed.includes(id) && def.chain !== 'daily')) return false;
    if (def.chain === 'daily' && this.isClaimed(id)) return false;
    m.active.push(id);
    m.progress[id] = 0;
    this.lastShown.set(id, 0);
    this.rebuildIndex();
    this.game.bus.emit('mission:progress', { id, value: 0, target: def.count });
    this.setProgress(id, def, isLiveType(def.type) ? liveValue(this.game, def) : retroValue(this.game, def));
    if (def.chain === 'main') this.healSurvivorOnActivate(def);
    return true;
  }

  private rebuildIndex(): void {
    const by = new Map<MissionType, string[]>();
    const live: string[] = [];
    for (const id of this.game.state.missions.active) {
      const d = this.game.data.mission(id);
      if (!d || this.isDone(id)) continue;
      if (isLiveType(d.type)) live.push(id);
      else {
        const list = by.get(d.type);
        if (list) list.push(id);
        else by.set(d.type, [id]);
      }
    }
    this.byType = by;
    this.liveIds = live;
  }

  /** Credit an event to the counters and to every active mission it matches. */
  private bump(type: MissionType, targets: readonly string[], amount: number): void {
    if (this.muted > 0 || !(amount > 0)) return;
    const c = this.game.state.missions.counters;
    for (const t of targets) {
      const k = `${type}:${t}`;
      c[k] = (c[k] ?? 0) + amount;
    }
    const star = `${type}:*`;
    c[star] = (c[star] ?? 0) + amount;
    const ids = this.byType.get(type);
    if (!ids) return;
    for (const id of ids) {
      const def = this.game.data.mission(id);
      if (!def) continue;
      if (def.target === '*' || targets.includes(def.target)) {
        this.setProgress(id, def, (this.game.state.missions.progress[id] ?? 0) + amount);
      }
    }
  }

  /** Re-read state-derived (live) missions. Cheap; runs on relevant events and at 4 Hz. */
  private recheckLive(): void {
    if (this.liveIds.length === 0) return;
    for (const id of this.liveIds) {
      const def = this.game.data.mission(id);
      if (def && !this.isDone(id)) this.setProgress(id, def, liveValue(this.game, def));
    }
  }

  private setProgress(id: string, def: MissionDef, value: number): void {
    const m = this.game.state.missions;
    if (!m.active.includes(id)) return;
    const prev = m.progress[id] ?? 0;
    if (prev >= def.count) return; // finished missions are locked
    const next = Math.min(value, def.count);
    if (next === prev) return;
    m.progress[id] = next;
    const shown = Math.floor(next);
    if (shown !== (this.lastShown.get(id) ?? Math.floor(prev))) {
      this.lastShown.set(id, shown);
      this.game.bus.emit('mission:progress', { id, value: next, target: def.count });
    }
    if (next >= def.count) this.complete(id, def);
  }

  private complete(id: string, def: MissionDef): void {
    const bus = this.game.bus;
    this.rebuildIndex();
    bus.emit('mission:completed', { id });
    bus.emit('sfx', { id: 'mission_done' });
    this.runTriggers(def);
    if (def.chain === 'main') this.autoClaim.set(id, AUTO_CLAIM_DELAY);
  }

  /** Scripted first-15-minutes triggers. Failures never block the mission flow. */
  private runTriggers(def: MissionDef): void {
    const t = def.onComplete;
    if (!t) return;
    if (t.attack) {
      try {
        this.game.sys.combat.schedule(t.attack.delay, t.attack.warning);
      } catch (e) {
        console.error('[missions] combat.schedule failed', e);
      }
    }
    if (t.spawnSurvivor) this.trySpawnSurvivor();
    if (t.celebrate) this.game.bus.emit('ui:celebrate', { title: t.celebrate, text: def.name, icon: '🎉' });
  }

  private trySpawnSurvivor(): boolean {
    try {
      const spawned = this.game.sys.world.spawnSurvivorNear(0, 0) != null;
      if (spawned) this.survivorSpawned = true;
      return spawned;
    } catch (e) {
      console.error('[missions] spawnSurvivorNear failed', e);
      return false;
    }
  }

  /** If a rescue step is activated and no camp exists yet (spawn failed earlier), try again. */
  private healSurvivorOnActivate(def: MissionDef): void {
    if (def.type === 'rescue') this.ensureGuidePoi();
  }

  /**
   * Only offer dailies the player can finish today: fighting (and the Lucky Wheel, whose offers unlock after
   * the first victory) waits for a won invasion; research, upgrades and the bigger "_big" variants wait for
   * Reinforced Wood.
   */
  private dailyFeasible(id: string): boolean {
    const def = this.game.data.mission(id);
    if (!def) return false;
    const st = this.game.state;
    const won = st.stats.wavesWon > 0;
    const settled = st.colony.tier >= 1;
    if (id.endsWith('_big') && !settled) return false;
    switch (def.type) {
      case 'kill':
      case 'defend':
      case 'spin':
        return won;
      case 'research':
      case 'upgrade':
        return settled;
      default:
        return true;
    }
  }

  /** Switch to the current local day's daily missions (deterministic per date). */
  private rollDaily(): void {
    const m = this.game.state.missions;
    const today = dateKey(this.game.now());
    if (m.dailyDate === today && m.daily.length > 0) return;
    // never lose a finished-but-untapped daily to the date change
    let collected = 0;
    for (const id of [...m.daily]) {
      if (m.active.includes(id) && this.isDone(id) && this.claim(id)) collected++;
    }
    for (const id of m.daily) {
      m.active = m.active.filter((a) => a !== id);
      m.completed = m.completed.filter((c) => c !== id);
      delete m.progress[id];
      this.autoClaim.delete(id);
      this.lastShown.delete(id);
    }
    m.dailyDate = today;
    m.daily = pickDailies(
      this.game.data.dailyMissionPool.filter((id) => this.game.data.mission(id)?.chain === 'daily' && this.dailyFeasible(id)),
      today,
      DAILY_COUNT,
    );
    for (const id of m.daily) this.activate(id);
    this.rebuildIndex();
    if (collected > 0) this.game.toast("Yesterday's daily rewards were collected for you", 'reward', '📅');
  }
}

/**
 * ColonistSystem — generation (names, looks, traits, specialties, rarity), recruitment board,
 * survivor rescue, housing/bed assignment, job auto-assignment, needs & happiness, skills,
 * and lightweight movement AI (walk to workplace, work, eat, sleep at night, shelter during attacks).
 *
 * OWNER: colonists agent. Writes state.colonists and game.derived.{housing, happiness}.
 *
 * Implementation lives in `src/sim/colony/*`:
 *   generate.ts   names / looks / traits / rarity       layout.ts    building snapshot (homes, jobs, spots)
 *   housing.ts    bed assignment                        jobs.ts      worker slots, auto & manual assignment
 *   happiness.ts  happiness factors, productivity       skills.ts    xp / skill-ups
 *   ai.ts         daily-life AI and movement
 *
 * Cozy rules: nobody dies, nobody leaves, unhappy colonists just work at base speed (productivity >= 1).
 */
import { System } from './System';
import type { Game } from '../core/Game';
import type { ProfessionId, Rarity } from '../data/schema';
import type { Colonist, Id, RecruitCandidate } from '../core/state';
import { generateColonist, rollRarity } from './colony/generate';
import { Layout } from './colony/layout';
import { assignBeds } from './colony/housing';
import { assignManual, autoAssign as runAutoAssign } from './colony/jobs';
import { computeMood, emptyMood, happinessFactors, happinessTarget, productivityOf, type Mood } from './colony/happiness';
import { secondsToNextSkill } from './colony/skills';
import { ColonistAI } from './colony/ai';
import type { HappinessFactor } from './colony/types';

export type { HappinessFactor } from './colony/types';

/** Seconds between full structural refreshes (layout, beds, jobs) when nothing signalled a change. */
const REFRESH_INTERVAL = 2;
/** Fraction of the gap to the target happiness closed per second. */
const HAPPINESS_RATE = 0.25;

export class ColonistSystem extends System {
  private readonly layout = new Layout();
  private readonly ai: ColonistAI;
  private mood: Mood = emptyMood();
  private dirty = true;
  private secAcc = 0;
  private refreshAcc = 0;

  constructor(game: Game) {
    super(game);
    this.ai = new ColonistAI(game, this.layout);
  }

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    const bus = this.game.bus;
    bus.on('building:removed', ({ id }) => this.onBuildingRemoved(id));
    for (const e of ['building:completed', 'building:upgraded', 'building:moved', 'building:changed', 'research:completed'] as const) {
      bus.on(e, () => {
        this.dirty = true;
      });
    }
    for (const e of ['combat:warning', 'combat:started', 'combat:ended', 'time:nightfall', 'time:sunrise'] as const) {
      bus.on(e, () => this.ai.kick());
    }
  }

  override onLoad(fresh: boolean): void {
    this.ai.reset();
    for (const c of this.game.state.colonists.list) {
      if (!Number.isFinite(c.xp)) c.xp = 0;
      if (!Number.isFinite(c.happiness)) c.happiness = 60;
    }
    this.refresh();
    // Fresh game: create the initial candidate pool (recruiting still needs a recruitment building).
    this.refreshCandidates(fresh || this.game.state.colonists.candidates.length === 0);
    this.perSecond();
  }

  override update(dt: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.refreshAcc = 0;
      this.refresh();
    }
    this.refreshAcc += dt;
    if (this.refreshAcc >= REFRESH_INTERVAL) {
      this.refreshAcc = 0;
      this.refresh();
    }
    this.secAcc += dt;
    if (this.secAcc >= 1) {
      this.secAcc -= 1;
      this.perSecond();
    }
    this.ai.update(dt);
  }

  // ---------------------------------------------------------------- queries

  get(id: Id): Colonist | undefined {
    return this.game.state.colonists.list.find((c) => c.id === id);
  }

  all(): Colonist[] {
    return this.game.state.colonists.list;
  }

  /** Colonists in the colony right now (not away on an expedition). */
  present(): Colonist[] {
    return this.game.state.colonists.list.filter((c) => !c.away);
  }

  /**
   * Send colonists away on an expedition (sim/expeditions.ts): they drop their jobs (the automation refills the
   * slots), stop their routine and vanish from the world. They keep their beds.
   */
  sendAway(ids: readonly Id[]): void {
    let changed = false;
    for (const id of ids) {
      const c = this.get(id);
      if (!c || c.away) continue;
      c.away = true;
      c.activity = 'idle';
      this.ai.forget(c.id);
      changed = true;
    }
    if (changed) {
      this.refresh(); // vacated jobs go to whoever is idle
      this.game.sys.economy.markDirty(); // fewer mouths to feed
    }
  }

  /**
   * Welcome a colonist home at a world position. `work` is the job they left: they take it back when it still
   * exists (bumping an automatic stand-in if the slots filled up meanwhile), else the automation finds them one.
   * `work.keep`: colonists who are not stand-ins (squad mates back in the same moment who already took their own
   * jobs back) and are never bumped.
   */
  welcomeHome(id: Id, x: number, z: number, work: { building: Id | null; manual: boolean; keep?: ReadonlySet<Id> } = { building: null, manual: false }): void {
    const c = this.get(id);
    if (!c) return;
    c.away = false;
    c.x = c.tx = x;
    c.z = c.tz = z;
    c.activity = 'idle';
    const g = this.game;
    this.layout.rebuild(g);
    const p = work.building != null ? this.layout.byId.get(work.building) : undefined;
    if (p && p.usable && p.def.workers) {
      const list = g.state.colonists.list;
      const here = list.filter((o) => o.workplace === p.id && o !== c);
      let ok = here.length < p.def.workers.slots;
      if (!ok) {
        const bump = here.find((o) => !o.manual && !work.keep?.has(o.id));
        if (bump) {
          bump.workplace = null;
          g.bus.emit('colonist:assigned', { id: bump.id, workplace: null });
          ok = true;
        }
      }
      if (ok) {
        c.workplace = p.id;
        c.manual = work.manual;
        g.bus.emit('colonist:assigned', { id: c.id, workplace: p.id });
      }
    }
    this.refresh(); // sync worker lists, re-home anyone bumped
    this.ai.poke(c.id);
    g.sys.economy.markDirty();
  }

  /** Profession of the colonist's current workplace, or null when unemployed. */
  jobOf(c: Colonist): ProfessionId | null {
    this.syncLayout();
    return (c.workplace != null ? this.layout.byId.get(c.workplace)?.def.workers?.job : undefined) ?? null;
  }

  /** Colonists working at a building. */
  workersOf(buildingId: Id): Colonist[] {
    return this.game.state.colonists.list.filter((c) => c.workplace === buildingId);
  }

  /** Free worker slots at a building (0 if it has none or is not operational). */
  openSlots(buildingId: Id): number {
    this.syncLayout();
    const p = this.layout.byId.get(buildingId);
    if (!p || !p.usable || !p.def.workers) return 0;
    return Math.max(0, p.def.workers.slots - this.workersOf(buildingId).length);
  }

  /** Is this colonist a guard at a post (stands at the tower during attacks)? */
  isGuard(c: Colonist): boolean {
    return this.jobOf(c) === 'guard';
  }

  /** Seconds of work until the colonist's next skill star (Infinity at max). */
  secondsToSkillUp(c: Colonist): number {
    return secondsToNextSkill(c);
  }

  // ---------------------------------------------------------------- generation & recruitment

  /** Generate a colonist (not added to the colony). */
  generate(rarity: Rarity): Colonist {
    return generateColonist(this.game, rarity);
  }

  /** Add a generated colonist to the colony at a world position (defaults to near the core). */
  add(c: Colonist, x?: number, z?: number): Id {
    const g = this.game;
    const st = g.state.colonists;
    this.layout.rebuild(g);
    c.id = st.nextId++;
    if (x === undefined || z === undefined) {
      const s = this.spawnPoint();
      x = s.x;
      z = s.z;
    }
    c.x = c.tx = x;
    c.z = c.tz = z;
    c.rot = g.rng.next() * Math.PI * 2;
    c.activity = 'idle';
    c.workplace = null;
    c.bed = null;
    c.manual = false;
    if (!c.joinedAt) c.joinedAt = g.now();
    st.list.push(c);
    this.refresh(); // bed + job
    g.bus.emit('colonist:recruited', { id: c.id, rarity: c.rarity });
    const icon = g.data.profession(c.specialty)?.icon;
    g.toast(`${c.name} joined the colony!`, c.rarity === 'common' ? 'success' : 'reward', icon);
    g.bus.emit('ui:float', { text: `${c.name.split(' ')[0]} joined!`, x: c.x, z: c.z, color: '#ffd84a', big: true });
    g.bus.emit('sfx', { id: 'recruit', x: c.x, z: c.z });
    return c.id;
  }

  /**
   * Grant a new colonist of a rarity (rewards, packs, rescues). Never requires a bed — colonists without
   * one sleep around the campfire. Optional world position (e.g. the rescued survivor's camp).
   */
  grant(rarity: Rarity, x?: number, z?: number): Id {
    return this.add(this.generate(rarity), x, z);
  }

  /** Free beds available (beds minus colonists; colonists beyond the bed count sleep outside). */
  freeBeds(): number {
    this.syncLayout();
    return Math.max(0, this.layout.beds - this.game.state.colonists.list.length);
  }

  /** Is there an active building with the `recruit` flag (the recruitment board works)? */
  boardAvailable(): boolean {
    this.syncLayout();
    return this.layout.recruit !== null;
  }

  /** Non-mutating check the UI can use to enable/disable the Recruit button. */
  canRecruit(index: number): { ok: boolean; reason?: string } {
    const cand = this.game.state.colonists.candidates[index];
    if (!cand) return { ok: false, reason: 'No such candidate' };
    this.syncLayout();
    if (!this.layout.recruit) return { ok: false, reason: 'Build a recruitment building first' };
    if (this.freeBeds() <= 0) return { ok: false, reason: 'Build more beds to recruit' };
    if (!this.game.sys.economy.canAfford(cand.cost)) return { ok: false, reason: 'Not enough resources' };
    return { ok: true };
  }

  /**
   * Recruit the candidate at `index` (needs a recruitment building, a free bed and the cost). The vacated
   * board slot is immediately refilled with a fresh candidate so growth is never gated on a timer.
   */
  recruit(index: number): boolean {
    const g = this.game;
    const st = g.state.colonists;
    const cand = st.candidates[index];
    if (!cand) return false;
    this.syncLayout();
    const board = this.layout.recruit;
    if (!board) {
      this.refuse('Build a recruitment building first');
      return false;
    }
    if (this.freeBeds() <= 0) {
      this.refuse('Build more beds to recruit');
      return false;
    }
    if (!g.sys.economy.spend(cand.cost, 'recruit')) return false;
    st.candidates.splice(index, 1);
    this.add(cand.colonist, board.x + (g.rng.next() - 0.5) * 2, board.z + board.hd + 1.2);
    st.candidates.splice(index, 0, this.makeCandidate());
    return true;
  }

  /**
   * Refresh the candidate pool. Free when the timer elapsed; `force` (ads / Nova crystals) rerolls it now.
   * Pool size = balance.recruitCandidates x modifier('recruitSlots').
   */
  refreshCandidates(force: boolean): void {
    const g = this.game;
    const st = g.state.colonists;
    const now = g.now();
    if (!force && st.candidates.length > 0 && now < st.refreshAt) return;
    const hadPool = st.candidates.length > 0;
    st.candidates.length = 0;
    const n = this.poolSize();
    for (let i = 0; i < n; i++) st.candidates.push(this.makeCandidate());
    st.slots = n;
    st.refreshAt = now + g.data.balance.recruitRefreshMinutes * 60000;
    if (!force && hadPool && this.layout.recruit) g.toast('New survivors are waiting at the recruitment board', 'info');
  }

  /** Seconds until the free refresh (0 when due). */
  secondsToRefresh(): number {
    return Math.max(0, (this.game.state.colonists.refreshAt - this.game.now()) / 1000);
  }

  // ---------------------------------------------------------------- jobs

  /**
   * Assign to a workplace (or null to unassign). Manual choices are locked against auto-assign
   * (see `releaseManual`). A full building bumps a non-manual worker; false if impossible.
   */
  assign(colonistId: Id, buildingId: Id | null): boolean {
    const c = this.get(colonistId);
    if (!c) return false;
    const g = this.game;
    this.layout.rebuild(g);
    const list = g.state.colonists.list;
    const ok = assignManual(g, this.layout, list, c, buildingId);
    if (ok) {
      runAutoAssign(g, this.layout, list); // re-home anyone who was bumped
      this.ai.poke(c.id);
    }
    return ok;
  }

  /** Give a manually placed colonist back to the automation. */
  releaseManual(colonistId: Id): void {
    const c = this.get(colonistId);
    if (!c || !c.manual) return;
    c.manual = false;
    this.autoAssign();
  }

  /** Fill empty worker slots with idle colonists, preferring matching specialties. Returns changes made. */
  autoAssign(): number {
    const g = this.game;
    this.layout.rebuild(g);
    const n = runAutoAssign(g, this.layout, g.state.colonists.list);
    if (n > 0) this.ai.kick(0.3);
    return n;
  }

  /** Recompute beds, jobs and derived housing/happiness right now (also runs automatically). */
  refresh(): void {
    const g = this.game;
    const list = g.state.colonists.list;
    this.layout.rebuild(g);
    const before = this.jobsSignature(list);
    runAutoAssign(g, this.layout, list);
    const used = assignBeds(this.layout, list);
    const d = g.derived;
    d.housing.beds = this.layout.beds;
    d.housing.used = used;
    if (before !== this.jobsSignature(list)) this.ai.kick(0.3);
  }

  // ---------------------------------------------------------------- happiness & productivity

  /** Breakdown of what makes this colonist happy (label, points contributed, whether it is active). */
  happinessFactors(c: Colonist): HappinessFactor[] {
    this.syncLayout();
    return happinessFactors(this.game, this.layout, computeMood(this.game, this.layout), c);
  }

  /** The happiness value this colonist is drifting toward. */
  happinessTarget(c: Colonist): number {
    this.syncLayout();
    return happinessTarget(this.game, this.layout, computeMood(this.game, this.layout), c);
  }

  /** Productivity multiplier for a colonist at their workplace (>= 1 — cozy). */
  productivity(c: Colonist): number {
    this.syncLayout();
    return productivityOf(this.game, this.layout, c);
  }

  // ---------------------------------------------------------------- internals

  private syncLayout(): void {
    if (this.layout.isStale(this.game)) this.layout.rebuild(this.game);
  }

  private jobsSignature(list: Colonist[]): number {
    let h = 0;
    for (const c of list) h = (h * 31 + (c.workplace ?? -1) + 7 * (c.bed ?? -1)) | 0;
    return h;
  }

  private refuse(text: string): void {
    this.game.toast(text, 'warning');
    this.game.bus.emit('sfx', { id: 'ui_error' });
  }

  private poolSize(): number {
    return Math.max(1, Math.round(this.game.data.balance.recruitCandidates * this.game.sys.economy.modifier('recruitSlots')));
  }

  private makeCandidate(): RecruitCandidate {
    const g = this.game;
    const colonist = this.generate(rollRarity(g));
    return { colonist, cost: { ...g.data.balance.recruitCost[colonist.rarity] } };
  }

  /** A spot near the core where new arrivals appear. */
  private spawnPoint(): { x: number; z: number } {
    const core = this.layout.core;
    const rng = this.game.rng;
    const a = rng.next() * Math.PI * 2;
    const r = (core ? Math.hypot(core.hw, core.hd) : 3) + 1.5 + rng.next() * 2;
    return { x: (core?.x ?? 0) + Math.cos(a) * r, z: (core?.z ?? 0) + Math.sin(a) * r };
  }

  /** A building vanished: forget beds and jobs that pointed at it (the next refresh re-homes people). */
  private onBuildingRemoved(id: Id): void {
    const g = this.game;
    for (const c of g.state.colonists.list) {
      if (c.bed === id) c.bed = null;
      if (c.workplace === id) {
        c.workplace = null;
        c.manual = false;
        g.bus.emit('colonist:assigned', { id: c.id, workplace: null });
      }
    }
    this.dirty = true;
  }

  /** Once per second: happiness drift, derived averages, recruitment board upkeep, speed modifier. */
  private perSecond(): void {
    const g = this.game;
    this.syncLayout();
    const list = g.state.colonists.list;
    const mood = (this.mood = computeMood(g, this.layout));
    this.ai.speedMod = g.sys.economy.modifier('colonistSpeed');

    let sum = 0;
    let n = 0;
    for (const c of list) {
      if (c.away) continue; // mood is frozen while out exploring (and the colony average is about who is here)
      if (c.trip && g.now() >= c.trip.until) delete c.trip;
      const target = happinessTarget(g, this.layout, mood, c);
      const diff = target - c.happiness;
      c.happiness = Math.abs(diff) < 0.05 ? target : c.happiness + diff * HAPPINESS_RATE;
      sum += c.happiness;
      n++;
    }
    const avg = n ? sum / n : 50;
    g.derived.happiness.average = avg;
    g.derived.happiness.productivity = 1 + Math.max(0, avg - 50) / 100;

    // board upkeep: timed refresh, and top up when 'recruitSlots' grew (e.g. research)
    const st = g.state.colonists;
    if (g.now() >= st.refreshAt) this.refreshCandidates(false);
    const want = this.poolSize();
    const have = st.slots ?? st.candidates.length;
    if (want > have) {
      for (let i = have; i < want; i++) st.candidates.push(this.makeCandidate());
    }
    st.slots = Math.max(want, have);
  }
}

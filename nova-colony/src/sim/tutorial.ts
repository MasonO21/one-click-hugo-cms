/**
 * TutorialSystem — first-session guidance layered on the main mission chain: contextual hints,
 * guide-arrow targets (resolved to world positions / UI selectors), one-time popups,
 * and pacing safeguards (e.g. grant missing resources so nobody gets stuck).
 *
 * The guide target comes from the current main mission's `hint` + `guide` (data-driven — no mission
 * ids are hard-coded here):
 *   node       -> nearest live resource node of that def
 *   building   -> the player's building of that def (nearest), else the colony core
 *   build_menu -> `[data-build="<def>"]` while the build panel is open, else `#btn-build`
 *   ui         -> `#btn-<ref>`
 *   poi        -> nearest un-looted POI of that def (includes the spawned survivor camp)
 *   region     -> centre of the biome
 *
 * OWNER: meta agent. Writes state.tutorial.
 */
import { System } from './System';
import { footprintCenter, HALF_WORLD } from '../core/constants';
import { dist } from '../core/math';
import { bagIsEmpty } from '../core/bag';
import type { MissionDef, ResourceBag } from '../data/schema';

export interface GuideTarget {
  text: string;
  /** World position to point at (arrow in 3D) — or null. */
  world: { x: number; z: number } | null;
  /** CSS selector of a UI element to highlight — or null. */
  ui: string | null;
  /** Mission this guidance belongs to (additive field for the UI). */
  mission?: string;
  /** Which kind of target was resolved (additive field for the UI). */
  kind?: NonNullable<MissionDef['guide']>['kind'];
}

/** Seconds a build/tier step may be unaffordable before a supply drone helps out. */
export const SUPPLY_DRONE_AFTER = 60;
const REFRESH_INTERVAL = 0.25;

interface Candidate {
  key: string;
  x: number;
  z: number;
}

export class TutorialSystem extends System {
  private cache: GuideTarget | null = null;
  private cacheKey = '';
  private dirty = true;
  private sig = '';
  private refreshAcc = 0;
  /** Seconds the current step has been unaffordable. */
  private stuck = 0;
  private stuckMission = '';
  /** Last panel the UI opened (cleared when no panel is showing). */
  private openPanel: string | null = null;
  /** Hysteresis: keep pointing at the same world target while it stays reasonably close. */
  private sticky: { ref: string; key: string } | null = null;

  override init(): void {
    const bus = this.game.bus;
    bus.on('ui:open', (e) => {
      this.openPanel = e.panel;
      this.dirty = true;
    });
    bus.on('mission:claimed', (e) => this.onClaimed(e.id));
    bus.on('mission:completed', () => {
      this.dirty = true;
    });
  }

  override onLoad(_fresh: boolean): void {
    const t = this.game.state.tutorial;
    t.flags ??= {};
    // a loaded save that is already past the arc must not replay it
    if (!t.done && this.game.state.missions.completed.some((id) => this.endsArc(this.game.data.mission(id)))) t.done = true;
    this.refresh();
  }

  override update(dt: number): void {
    this.refreshAcc += dt;
    if (this.refreshAcc >= REFRESH_INTERVAL) {
      this.refreshAcc = 0;
      this.refresh();
    }
    this.pacing(dt);
  }

  // ---------------------------------------------------------------- public API

  /** Current guidance (null when there is nothing to show). Cheap: cached and refreshed at 4 Hz. */
  guide(): GuideTarget | null {
    const cur = this.game.sys.missions.current();
    if (this.dirty || this.cacheKey !== (cur?.id ?? '')) return this.refresh();
    return this.cache;
  }

  /** Free-form one-time flags (popups already shown, etc.). */
  flag(name: string): boolean {
    return !!this.game.state.tutorial.flags[name];
  }

  setFlag(name: string, value = true): void {
    this.game.state.tutorial.flags[name] = value;
  }

  /** UI hook: tell the tutorial which panel is open (null when closed). Optional — `ui:open` is also tracked. */
  notifyPanel(panel: string | null): void {
    this.openPanel = panel;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- guidance

  /** Recompute the guide and emit `tutorial:hint` when the target changes. */
  private refresh(): GuideTarget | null {
    const { missions } = this.game.sys;
    const cur = missions.current();
    let g: GuideTarget | null = null;
    if (cur && !missions.progress(cur.id).done && (cur.hint || cur.guide)) g = this.resolve(cur);
    this.cache = g;
    this.cacheKey = cur?.id ?? '';
    this.dirty = false;
    const sig = g ? `${g.mission}|${g.ui ?? ''}|${this.sticky?.key ?? ''}|${g.world ? 1 : 0}` : '';
    if (sig !== this.sig) {
      this.sig = sig;
      this.game.bus.emit('tutorial:hint', { mission: g?.mission ?? null });
    }
    return g;
  }

  private buildPanelOpen(): boolean {
    const v = this.game.view;
    return v.mode === 'build' || this.flag('buildPanelOpen') || (v.panelOpen && this.openPanel === 'build');
  }

  private resolve(def: MissionDef): GuideTarget {
    const text = def.hint ?? def.description;
    const base: GuideTarget = { text, world: null, ui: null, mission: def.id, kind: def.guide?.kind };
    const g = def.guide;
    if (!g) return base;
    const ref = g.ref ?? '';
    switch (g.kind) {
      case 'ui':
        base.ui = `#btn-${ref}`;
        break;
      case 'build_menu':
        if (this.game.view.mode === 'build' && this.game.view.build.def === ref) base.world = this.coreCenter();
        else base.ui = this.buildPanelOpen() ? `[data-build="${ref}"]` : '#btn-build';
        break;
      case 'node':
        base.world = this.pick(ref, this.nodeCandidates(ref));
        break;
      case 'building':
        base.world = this.pick(ref, this.buildingCandidates(ref)) ?? this.coreCenter();
        break;
      case 'poi':
        base.world = this.pick(ref, this.poiCandidates(ref));
        break;
      case 'region': {
        const b = this.game.data.biome(ref);
        if (b) {
          const a = (b.center.angle * Math.PI) / 180;
          base.world = { x: Math.cos(a) * b.center.dist * HALF_WORLD, z: Math.sin(a) * b.center.dist * HALF_WORLD };
        }
        break;
      }
    }
    return base;
  }

  private coreCenter(): { x: number; z: number } | null {
    const core = this.game.sys.buildings.core();
    const d = core && this.game.data.building(core.def);
    return core && d ? footprintCenter(core.x, core.z, d.size, core.rot) : { x: 0, z: 0 };
  }

  private nodeCandidates(ref: string): Candidate[] {
    const out: Candidate[] = [];
    const nodes = this.game.sys.world.gen?.nodes;
    if (!nodes) return out;
    const depleted = this.game.state.world.depleted;
    for (const n of nodes) if (n.def === ref && depleted[n.i] === undefined) out.push({ key: `node:${n.i}`, x: n.x, z: n.z });
    return out;
  }

  private buildingCandidates(ref: string): Candidate[] {
    const out: Candidate[] = [];
    const d = this.game.data.building(ref);
    if (!d) return out;
    for (const b of this.game.state.buildings.list) {
      if (b.def !== ref) continue;
      const c = footprintCenter(b.x, b.z, d.size, b.rot);
      out.push({ key: `building:${b.id}`, x: c.x, z: c.z });
    }
    return out;
  }

  private poiCandidates(ref: string): Candidate[] {
    const out: Candidate[] = [];
    const pois = this.game.sys.world.gen?.pois;
    if (!pois) return out;
    const st = this.game.state.world.pois;
    for (const p of pois) if (p.def === ref && !st[p.id]?.looted) out.push({ key: `poi:${p.id}`, x: p.x, z: p.z });
    return out;
  }

  /** Nearest candidate to the player, sticking with the previous pick unless another is clearly closer. */
  private pick(ref: string, cands: Candidate[]): { x: number; z: number } | null {
    if (cands.length === 0) {
      if (this.sticky?.ref === ref) this.sticky = null;
      return null;
    }
    const p = this.game.state.player;
    let best = cands[0];
    let bestD = dist(p.x, p.z, best.x, best.z);
    for (let i = 1; i < cands.length; i++) {
      const d = dist(p.x, p.z, cands[i].x, cands[i].z);
      if (d < bestD) {
        best = cands[i];
        bestD = d;
      }
    }
    if (this.sticky && this.sticky.ref === ref) {
      const cur = cands.find((c) => c.key === this.sticky!.key);
      if (cur && dist(p.x, p.z, cur.x, cur.z) <= bestD * 1.4 + 2) best = cur;
    }
    this.sticky = { ref, key: best.key };
    return { x: best.x, z: best.z };
  }

  // ---------------------------------------------------------------- arc completion

  /** The 15-minute arc ends when the first colony-tier step is claimed, or when the main chain ends. */
  private endsArc(def: MissionDef | undefined): boolean {
    return !!def && def.chain === 'main' && (def.type === 'tier' || !def.next || def.next.length === 0);
  }

  private onClaimed(id: string): void {
    const def = this.game.data.mission(id);
    this.stuck = 0;
    this.dirty = true;
    if (def && this.endsArc(def) && !this.game.state.tutorial.done) {
      this.game.state.tutorial.done = true;
      this.game.bus.emit('tutorial:hint', { mission: null });
    }
  }

  // ---------------------------------------------------------------- pacing safeguard

  /** What the current step needs the player to pay, or null if it is not a payable step. */
  private requirement(def: MissionDef): ResourceBag | null {
    const { buildings, progression } = this.game.sys;
    if (def.type === 'build' && def.target !== '*' && !def.target.startsWith('category:')) {
      if (!this.game.data.building(def.target) || !buildings.isUnlocked(def.target)) return null;
      if (buildings.countOf(def.target) > 0) return null; // already placed — it has been paid for
      return buildings.cost(def.target);
    }
    if (def.type === 'tier') {
      const next = progression.next();
      return next && next.researchDone ? next.cost : null;
    }
    return null;
  }

  /**
   * If the current main step is a purchase the player cannot afford for a full minute, a supply drone
   * drops the missing materials. Nobody gets stuck in the first 15 minutes.
   *
   * Only during the guided arc: the main chain goes on to the Titanium tier, and a drone that kept
   * covering every unaffordable build / colony-tier step would hand out whole tier upgrades for free.
   */
  private pacing(dt: number): void {
    const { missions, economy } = this.game.sys;
    const cur = missions.current();
    if (this.game.state.tutorial.done || !cur || missions.progress(cur.id).done) {
      this.stuck = 0;
      return;
    }
    if (cur.id !== this.stuckMission) {
      this.stuckMission = cur.id;
      this.stuck = 0;
    }
    const need = this.requirement(cur);
    if (!need || bagIsEmpty(need) || economy.canAfford(need)) {
      this.stuck = 0;
      return;
    }
    this.stuck += dt;
    if (this.stuck < SUPPLY_DRONE_AFTER) return;
    this.stuck = 0;
    const missing = economy.missing(need);
    if (bagIsEmpty(missing)) return;
    const p = this.game.state.player;
    this.game.grant({ resources: missing }, 'tutorial', p.x, p.z);
    this.setFlag(`supplyDrone:${cur.id}`);
    this.game.toast('📦 A supply drone dropped off materials!', 'reward');
    this.game.bus.emit('sfx', { id: 'collect' });
  }
}

/**
 * ResearchSystem — research points bank + instant unlocks ("easy to understand": spend RP to unlock).
 * RP come from research buildings (rate in derived.research.perMin), scientists, ruins, rewards.
 *
 * OWNER: economy agent. Writes state.research.
 */
import { System } from './System';
import type { ResearchDef, ResourceBag } from '../data/schema';

export type ResearchStatus = 'done' | 'available' | 'locked_prereq' | 'locked_tier';

/** Everything the research panel needs to explain one node. */
export interface ResearchRequirements {
  status: ResearchStatus;
  /** RP cost and current bank. */
  cost: number;
  points: number;
  /** Extra resource cost and what is still missing. */
  resources: ResourceBag;
  missing: ResourceBag;
  /** Prerequisites not yet researched. */
  missingPrereqs: string[];
  /** Colony tier required. */
  tier: number;
  /** All requirements met right now. */
  ready: boolean;
}

export class ResearchSystem extends System {
  /** Research ids already announced as "ready" this session (avoid repeated nudges). */
  private readonly announced = new Set<string>();
  private checkTimer = 0;

  override onLoad(): void {
    // Don't nudge about research that was already affordable when the session started.
    this.announced.clear();
    for (const d of this.available()) if (this.canResearch(d.id)) this.announced.add(d.id);
  }

  override update(dt: number): void {
    this.checkTimer += dt;
    if (this.checkTimer < 1) return;
    this.checkTimer = 0;
    // Gentle nudge the first time research becomes affordable (one toast per check).
    let first: ResearchDef | null = null;
    let count = 0;
    for (const d of this.game.data.research) {
      if (this.announced.has(d.id) || !this.canResearch(d.id)) continue;
      this.announced.add(d.id);
      first ??= d;
      count++;
    }
    if (first) this.game.toast(count === 1 ? `Ready to research: ${first.name}` : `${count} new research options ready!`, 'info', first.icon);
  }

  isDone(id: string): boolean {
    return this.game.state.research.completed.includes(id);
  }

  def(id: string): ResearchDef | undefined {
    return this.game.data.researchDef(id);
  }

  status(id: string): ResearchStatus {
    const def = this.def(id);
    if (!def) return 'locked_tier';
    if (this.isDone(id)) return 'done';
    if (def.tier > this.game.state.colony.tier) return 'locked_tier';
    for (const r of def.requires) if (!this.isDone(r)) return 'locked_prereq';
    return 'available';
  }

  /** All research whose prerequisites are met and is not done. */
  available(): ResearchDef[] {
    return this.game.data.research.filter((d) => this.status(d.id) === 'available');
  }

  canResearch(id: string): boolean {
    const def = this.def(id);
    if (!def || this.status(id) !== 'available') return false;
    if (this.game.state.research.points < def.cost) return false;
    return this.game.sys.economy.canAfford(def.resources);
  }

  /** Full requirement breakdown for UI tooltips. */
  requirements(id: string): ResearchRequirements | null {
    const def = this.def(id);
    if (!def) return null;
    const eco = this.game.sys.economy;
    return {
      status: this.status(id),
      cost: def.cost,
      points: this.game.state.research.points,
      resources: { ...(def.resources ?? {}) },
      missing: eco.missing(def.resources),
      missingPrereqs: def.requires.filter((r) => !this.isDone(r)),
      tier: def.tier,
      ready: this.canResearch(id),
    };
  }

  /** Spend RP (+resources) and complete instantly. */
  research(id: string): boolean {
    const def = this.def(id);
    if (!def || this.status(id) !== 'available') return false;
    const st = this.game.state.research;
    if (st.points < def.cost) {
      this.game.bus.emit('sfx', { id: 'ui_error' });
      return false;
    }
    const eco = this.game.sys.economy;
    if (def.resources && !eco.spend(def.resources, `research:${id}`)) return false;
    st.points -= def.cost;
    st.completed.push(id);
    eco.markDirty();

    const bus = this.game.bus;
    bus.emit('research:completed', { id });
    bus.emit('ui:celebrate', { title: 'Research Complete!', text: this.celebrateText(def), icon: def.icon });
    bus.emit('sfx', { id: 'research_done' });
    return true;
  }

  addPoints(n: number): void {
    if (!Number.isFinite(n) || n === 0) return;
    const st = this.game.state.research;
    st.points = Math.max(0, st.points + n);
    if (n > 0) this.game.bus.emit('research:points', { amount: n });
  }

  /** "Sharper Tools — Unlocks: Stone Axe, Logging Camp" style description. */
  private celebrateText(def: ResearchDef): string {
    const data = this.game.data;
    const names: string[] = [];
    for (const b of def.unlocks?.buildings ?? []) names.push(data.building(b)?.name ?? b);
    for (const r of def.unlocks?.recipes ?? []) names.push(data.recipe(r)?.name ?? r);
    for (const v of def.unlocks?.vehicles ?? []) names.push(data.vehicle(v)?.name ?? v);
    for (const r of def.unlocks?.regions ?? []) names.push(data.biome(r)?.name ?? r);
    // Tier research: mention the tier it opens up.
    const tier = data.tiers.find((t) => t.research === def.id);
    if (tier) names.push(`${tier.name} colony tier`);
    return names.length ? `${def.name} — Unlocks: ${names.join(', ')}` : def.name;
  }
}

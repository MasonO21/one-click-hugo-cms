/**
 * ResearchSystem — research points bank + instant unlocks ("easy to understand": spend RP to unlock).
 * RP come from research buildings (rate in derived.research.perMin), scientists, ruins, rewards.
 *
 * OWNER: economy agent. Writes state.research.
 */
import { System } from './System';
import type { ResearchDef, ResourceBag } from '../data/schema';
import { MASTERY_LINES } from '../data/mastery';
import { levelOf, masteryBonus, masteryCost, masteryLine, type MasteryLine } from './mastery';

declare module '../core/events' {
  interface GameEvents {
    /** A Research Mastery level was bought (sim/mastery.ts). */
    'research:mastered': { line: string; level: number };
  }
}

export type ResearchStatus = 'done' | 'available' | 'locked_prereq' | 'locked_tier';

/** One Mastery line as the research panel shows it. */
export interface MasteryInfo {
  line: MasteryLine;
  level: number;
  /** Open at this colony tier. */
  open: boolean;
  /** Total bonus now and after the next level (0.21 = +21%). */
  bonus: number;
  next: number;
  /** RP for the next level. */
  cost: number;
  ready: boolean;
}

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
    this.announceMastery();
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

  /**
   * The research to start now on the way to `id`: `id` itself when it is available, else the first open prerequisite
   * on its path. Null when it is done, or nothing on the path can be started at this colony tier.
   */
  nextStep(id: string): string | null {
    const seen = new Set<string>();
    const walk = (r: string): string | null => {
      if (seen.has(r)) return null;
      seen.add(r);
      const st = this.status(r);
      if (st === 'available') return r;
      if (st !== 'locked_prereq') return null;
      for (const p of this.def(r)?.requires ?? []) {
        const step = walk(p);
        if (step) return step;
      }
      return null;
    };
    return walk(id);
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

  // ---------------------------------------------------------------- Mastery (repeatable research)

  /** The colony tier Mastery opens at (its first line). */
  masteryTier(): number {
    return MASTERY_LINES.reduce((m, l) => Math.min(m, l.tier), Infinity);
  }

  masteryOpen(): boolean {
    return this.game.state.colony.tier >= this.masteryTier();
  }

  masteryLevel(id: string): number {
    return levelOf(this.game.state.research.mastery, id);
  }

  /** RP for the next level of a line (Infinity for an unknown line). */
  masteryCost(id: string): number {
    const line = masteryLine(id);
    return line ? masteryCost(line, this.masteryLevel(id) + 1) : Infinity;
  }

  canMaster(id: string): boolean {
    const line = masteryLine(id);
    if (!line || this.game.state.colony.tier < line.tier) return false;
    return this.game.state.research.points >= this.masteryCost(id);
  }

  masteryInfo(): MasteryInfo[] {
    const tier = this.game.state.colony.tier;
    return MASTERY_LINES.map((line) => {
      const level = this.masteryLevel(line.id);
      return {
        line,
        level,
        open: tier >= line.tier,
        bonus: masteryBonus(line, level),
        next: masteryBonus(line, level + 1),
        cost: masteryCost(line, level + 1),
        ready: this.canMaster(line.id),
      };
    });
  }

  /** Spend RP on the next level of a Mastery line. Repeatable; no cap. */
  master(id: string): boolean {
    const line = masteryLine(id);
    if (!line || !this.canMaster(id)) {
      this.game.bus.emit('sfx', { id: 'ui_error' });
      return false;
    }
    const st = this.game.state.research;
    st.points -= this.masteryCost(id);
    st.mastery ??= {};
    const level = this.masteryLevel(id) + 1;
    st.mastery[id] = level;
    this.game.sys.economy.markDirty();
    this.game.bus.emit('research:mastered', { line: id, level });
    this.game.bus.emit('sfx', { id: 'research_done' });
    return true;
  }

  /** Once per colony: a quiet note when Mastery opens (tapping it opens the Research panel). */
  private announceMastery(): void {
    const g = this.game;
    const flags = g.state.tutorial.flags;
    if (flags.masteryIntro || !this.masteryOpen()) return;
    flags.masteryIntro = true;
    g.toast('Mastery is open: spare research points now buy lasting colony bonuses', 'info', '🔬', 'research');
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

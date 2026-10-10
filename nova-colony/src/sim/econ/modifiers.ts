/**
 * ModifierTable — aggregates every stat modifier source into `(1 + Σadd) × Πmult`.
 *
 * Sources:
 *  - completed research `effects`
 *  - Research Mastery levels (sim/mastery.ts: repeatable research, +3% production per level ...)
 *  - mastered region surveys (sim/survey.ts perks: production of the region's goods, research)
 *  - equipped items (`ItemDef.stats`: gatherYield / gatherSpeed / moveSpeed as adds; armor hp is a flat
 *    add applied by PlayerSystem.maxHp and damage is handled by combat, so neither is a modifier here)
 *  - Colony Pass VIP (production add, offlineHours add)
 *  - active timed boosts (production / research / gather mults; same-kind boosts don't stack —
 *    the strongest active one applies)
 *  - colony happiness (`derived.happiness.productivity`, maintained by the colonists system) as a
 *    'production' mult
 *  - a Colony Spirit festival (sim/colony/spirit.ts) as a 'production' mult, online only like the boosts
 *
 * The table is rebuilt lazily by EconomySystem (on relevant events and at most once per second);
 * lookups are cached Map reads so other systems may call `modifier()` every frame.
 */
import type { Game } from '../../core/Game';
import type { Boost } from '../../core/state';
import { forEachMasteryAdd } from '../mastery';
import { festivalProductionMult } from '../colony/spiritRules';

export interface ModifierOptions {
  /** Include temporary boosts. Offline progress excludes them. */
  boosts: boolean;
}

/** Which modifier stat each boost kind multiplies ('drone' is a gameplay helper, not a stat). */
const BOOST_STAT: Partial<Record<Boost['kind'], string>> = {
  production: 'production',
  research: 'research',
  gather: 'gatherYield',
};

export class ModifierTable {
  private readonly adds = new Map<string, number>();
  private readonly mults = new Map<string, number>();
  private readonly cache = new Map<string, number>();
  /** Strongest active boost per stat (boosts of one kind don't stack multiplicatively). */
  private readonly boostMax = new Map<string, number>();

  rebuild(game: Game, opts: ModifierOptions): void {
    this.adds.clear();
    this.mults.clear();
    this.cache.clear();
    this.boostMax.clear();
    const { state, data } = game;

    // research effects ('offlineHours' adds are hours, shown as "Offline hours +2": a share of the base, like VIP's)
    const baseHours = data.balance.offlineHours;
    for (const id of state.research.completed) {
      const effects = data.researchDef(id)?.effects;
      if (!effects) continue;
      for (const m of effects) {
        if (m.add && m.stat === 'offlineHours') {
          if (baseHours > 0) this.add(m.stat, m.add / baseHours);
        } else if (m.add) this.add(m.stat, m.add);
        if (m.mult !== undefined && m.mult !== 1) this.mult(m.stat, m.mult);
      }
    }

    // Research Mastery (repeatable research)
    forEachMasteryAdd(state.research.mastery, (stat, v) => this.add(stat, v));
    // mastered regions (sim/survey.ts): +5% of the region's goods / research, for good
    for (const m of game.sys.survey?.perkModifiers() ?? []) this.add(m.stat, m.add);

    // equipment
    for (const itemId of Object.values(state.player.equip)) {
      if (!itemId) continue;
      const s = data.item(itemId)?.stats;
      if (!s) continue;
      if (s.gatherYield) this.add('gatherYield', s.gatherYield);
      if (s.gatherSpeed) this.add('gatherSpeed', s.gatherSpeed);
      if (s.moveSpeed) this.add('moveSpeed', s.moveSpeed);
    }

    const now = game.now();

    // Colony Pass VIP
    if (state.liveops.vip.until > now) {
      this.add('production', data.vip.productionBonus);
      if (data.balance.offlineHours > 0) this.add('offlineHours', data.vip.offlineHoursBonus / data.balance.offlineHours);
    }

    // timed boosts
    if (opts.boosts) {
      for (const b of state.liveops.boosts) {
        if (b.until <= now || !(b.mult > 0)) continue;
        const stat = BOOST_STAT[b.kind];
        if (stat) this.boostMax.set(stat, Math.max(this.boostMax.get(stat) ?? 1, b.mult));
      }
      for (const [stat, m] of this.boostMax) this.mult(stat, m);
      // a festival is a timed, online-only bonus too (it stacks with the ad boosts: a different source, like VIP)
      const fest = festivalProductionMult(state);
      if (fest !== 1) this.mult('production', fest);
    }

    // colony happiness -> production
    const productivity = game.derived.happiness?.productivity;
    if (productivity !== undefined && Number.isFinite(productivity) && productivity > 0 && productivity !== 1) {
      this.mult('production', productivity);
    }
  }

  /** Aggregated multiplier for a stat (1 when nothing applies). */
  get(stat: string): number {
    let v = this.cache.get(stat);
    if (v === undefined) {
      v = Math.max(0, 1 + (this.adds.get(stat) ?? 0)) * (this.mults.get(stat) ?? 1);
      this.cache.set(stat, v);
    }
    return v;
  }

  private add(stat: string, v: number): void {
    this.adds.set(stat, (this.adds.get(stat) ?? 0) + v);
  }

  private mult(stat: string, v: number): void {
    this.mults.set(stat, (this.mults.get(stat) ?? 1) * v);
  }
}

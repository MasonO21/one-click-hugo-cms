/**
 * Pure expedition rules: what a trip is worth, how long it takes, how the squad and a vehicle change it, the
 * deterministic haul roll, and the generated Frontier sites. No game state is written here (unit-testable and
 * shared by the sim, the UI preview and the balance test).
 * OWNER: expeditions (sim/expeditions.ts).
 */
import type { DataRegistry } from '../../data';
import type { ExpeditionDef, ExpeditionRules, ProfessionId, Rarity, Reward, VehicleDef, YieldKey } from '../../data/schema';
import type { FrontierSite } from '../../core/state';
import { Rng } from '../../core/rng';
import { hashString } from '../meta/util';

/** A trip normalised: a regional destination or a generated Frontier site. */
export interface TripSpec {
  /** ExpeditionDef id, or 'frontier'. */
  dest: string;
  name: string;
  /** Biome id (art, theme). */
  region: string;
  /** Seconds on foot. */
  duration: number;
  /** The tier the haul is valued at. */
  tier: number;
  match: ProfessionId[];
  yields: Partial<Record<YieldKey, number>>;
  finds: TripFind[];
  /** Frontier depth (charted sites + 1); 0 for regional trips. */
  depth: number;
  poi: string | null;
  icon: string;
}

export interface TripFind {
  chance: number;
  reward: Reward;
  /** Display name ("Titanium Crates"); regional finds are named from their reward. */
  label?: string;
}

/** What the planner needs to know about a squad member. */
export interface Member {
  specialty: string;
  skill: number;
}

export interface SquadInfo {
  size: number;
  matched: number;
  /** Haul multiplier from profession matches and skill stars (1 = nobody matches, one star each). */
  bonus: number;
  /** Haul factor from squad size (a lone explorer brings half a full squad's haul). */
  sizeFactor: number;
  /** Rare-find chance multiplier. */
  findMult: number;
}

export interface VehicleEffect {
  /** Trip time multiplier (≤ 1). */
  durMult: number;
  /** Haul multiplier (≥ 1). */
  haulMult: number;
}

export interface HaulPlan {
  /** Real seconds the trip takes (vehicle included). */
  seconds: number;
  /** Total haul value (wood-equivalents) for the trip. */
  value: number;
  /** Haul value per trip hour ÷ the reference colony's hourly value at the trip's tier (the balance band). */
  fraction: number;
  /** Expected units per resource (rounded for display) and research points. */
  resources: Record<string, number>;
  rp: number;
  /** Finds with the squad's chances. */
  finds: TripFind[];
  squad: SquadInfo;
  vehicle: VehicleEffect;
  /** Mood the squad will come home with. */
  mood: number;
}

// ---------------------------------------------------------------------------------------------- specs

export function regionalSpec(def: ExpeditionDef): TripSpec {
  return {
    dest: def.id,
    name: def.name,
    region: def.region,
    duration: def.duration,
    tier: def.tier,
    match: def.match,
    yields: def.yields,
    finds: (def.finds ?? []).map((f) => ({ chance: f.chance, reward: f.reward })),
    depth: 0,
    poi: def.poi,
    icon: def.icon,
  };
}

/** The Frontier finds available at a depth, with their escalated chances. */
export function frontierFinds(rules: ExpeditionRules, depth: number): TripFind[] {
  const out: TripFind[] = [];
  for (const f of rules.frontier.finds) {
    if (depth < f.from) continue;
    const grown = f.chance + (f.perSite ?? 0) * (depth - f.from);
    out.push({ chance: Math.min(f.max ?? f.chance, grown), reward: f.reward, label: f.label });
  }
  return out;
}

/** The next Frontier find that has not appeared yet (Star Chart: "Next discovery"). */
export function nextFrontierFind(rules: ExpeditionRules, depth: number): { from: number; label: string } | null {
  let best: { from: number; label: string } | null = null;
  for (const f of rules.frontier.finds) if (f.from > depth && (!best || f.from < best.from)) best = { from: f.from, label: f.label };
  return best;
}

export function frontierSpec(data: DataRegistry, site: FrontierSite): TripSpec {
  const rules = data.expeditionRules;
  const fl = rules.frontier.flavours.find((f) => f.biome === site.biome) ?? rules.frontier.flavours[0];
  return {
    dest: 'frontier',
    name: site.name,
    region: fl.biome,
    duration: site.duration,
    tier: rules.frontier.unlockTier,
    match: fl.match,
    yields: fl.yields,
    finds: frontierFinds(rules, site.depth),
    depth: site.depth,
    poi: null,
    icon: '🌌',
  };
}

/**
 * The Frontier signal board: one uncharted site per duration rung, generated from the colony seed and the board
 * generation (`signal`), so the same save always sees the same sites until one of them is visited.
 */
export function frontierSites(data: DataRegistry, seed: number, signal: number, charted: number): FrontierSite[] {
  const fr = data.expeditionRules.frontier;
  return fr.durations.map((duration, rung) => {
    const rng = new Rng(hashString(`nova-frontier:${seed}:${signal}:${rung}`));
    const flav = rng.pick(fr.flavours);
    const name = `${rng.pick(fr.adjectives)} ${rng.pick(flav.nouns)}`;
    return { id: `f${signal}-${rung}`, name, biome: flav.biome, duration, depth: charted + 1 };
  });
}

// ---------------------------------------------------------------------------------------------- squad & vehicle

export function isMatch(spec: Pick<TripSpec, 'match'>, m: Member): boolean {
  return spec.match.includes(m.specialty as ProfessionId);
}

/** One member's haul bonus: a profession match plus a little per skill star above the first. */
export function memberBonus(rules: ExpeditionRules, spec: Pick<TripSpec, 'match'>, m: Member): number {
  return (isMatch(spec, m) ? rules.matchBonus : 0) + Math.max(0, Math.min(5, m.skill) - 1) * rules.skillBonus;
}

export function squadInfo(rules: ExpeditionRules, spec: Pick<TripSpec, 'match'>, members: readonly Member[]): SquadInfo {
  const size = Math.min(members.length, rules.squadMax);
  const list = members.slice(0, size);
  const matched = list.filter((m) => isMatch(spec, m)).length;
  const bonus = size ? 1 + list.reduce((s, m) => s + memberBonus(rules, spec, m), 0) / size : 1;
  return {
    size,
    matched,
    bonus,
    sizeFactor: rules.squadSize[size] ?? 0,
    findMult: 1 + (rules.findMatchBonus * matched) / Math.max(1, rules.squadMax),
  };
}

export function vehicleEffect(rules: ExpeditionRules, v: VehicleDef | null | undefined): VehicleEffect {
  if (!v) return { durMult: 1, haulMult: 1 };
  const r = rules.vehicle;
  return {
    durMult: 1 - Math.min(r.speedMax, Math.max(0, v.speed - 1) * r.speedPer),
    haulMult: 1 + Math.min(r.haulMax, Math.max(0, v.storage) * r.haulPer),
  };
}

// ---------------------------------------------------------------------------------------------- value

/** Per-hour efficiency of a trip length (rungs of the ladder; in between: the nearest shorter rung). */
export function durationEfficiency(rules: ExpeditionRules, seconds: number): number {
  let eff = rules.durationEfficiency[0] ?? 1;
  rules.durations.forEach((d, i) => {
    if (seconds >= d) eff = rules.durationEfficiency[i] ?? eff;
  });
  return eff;
}

/** How much a good still matters to a colony at `tier` (1 = fully; older bulk goods fade, research never does). */
export function relevance(rules: ExpeditionRules, tier: number, key: string): number {
  if (key === 'rp') return 1;
  const r = rules.relevance;
  const age = tier - (rules.intro[key] ?? 0) - r.keep;
  return age <= 0 ? 1 : Math.max(r.floor, Math.pow(r.decay, age));
}

/** Worth of one unit of a good (or 'rp') to a colony at `tier`, in wood-equivalents. */
export function valueAt(rules: ExpeditionRules, tier: number, key: string): number {
  return (rules.value[key] ?? 0) * relevance(rules, tier, key);
}

/** Value of a bag of goods to a colony at `tier` (unknown keys count for nothing). */
export function bagValue(rules: ExpeditionRules, tier: number, bag: Readonly<Record<string, number | undefined>>): number {
  let v = 0;
  for (const [k, n] of Object.entries(bag)) v += (n ?? 0) * valueAt(rules, tier, k);
  return v;
}

/** The reference colony's output value per hour at a tier. */
export function referenceValuePerHour(rules: ExpeditionRules, tier: number): number {
  const t = Math.max(0, Math.min(rules.reference.length - 1, tier));
  return bagValue(rules, t, rules.reference[t] ?? {}) * 60;
}

/** Value of a reward to a colony at `tier` (resources inside crates count; colonists, Nova and cosmetics do not). */
export function rewardValue(data: DataRegistry, r: Reward, tier: number): number {
  const rules = data.expeditionRules;
  let v = bagValue(rules, tier, r.resources ?? {}) + (r.rp ?? 0) * valueAt(rules, tier, 'rp');
  for (const [id, n] of Object.entries(r.items ?? {})) {
    const use = data.item(id)?.use;
    if (use?.reward) v += n * rewardValue(data, use.reward, tier);
  }
  return v;
}

/** Expected haul of a trip for a squad (and optional vehicle). */
export function planHaul(data: DataRegistry, spec: TripSpec, members: readonly Member[], vehicle?: VehicleDef | null): HaulPlan {
  const rules = data.expeditionRules;
  const squad = squadInfo(rules, spec, members);
  const veh = vehicleEffect(rules, vehicle);
  const refHour = referenceValuePerHour(rules, spec.tier);
  const hours = spec.duration / 3600;
  const depth = spec.depth > 0 ? 1 + Math.min(rules.frontier.depthBonusMax, rules.frontier.depthBonus * (spec.depth - 1)) : 1;
  const value = refHour * rules.baseFraction * durationEfficiency(rules, spec.duration) * squad.bonus * squad.sizeFactor * veh.haulMult * depth * hours;
  const seconds = Math.round(spec.duration * veh.durMult);
  const resources: Record<string, number> = {};
  let rp = 0;
  const shares = Object.entries(spec.yields).filter(([, w]) => (w ?? 0) > 0) as [string, number][];
  const total = shares.reduce((s, [, w]) => s + w, 0) || 1;
  for (const [k, w] of shares) {
    const unit = valueAt(rules, spec.tier, k) || 1;
    const n = (value * (w / total)) / unit;
    if (k === 'rp') rp = niceAmount(n);
    else resources[k] = niceAmount(n);
  }
  const finds = squad.size ? spec.finds.map((f) => ({ ...f, chance: Math.min(0.95, f.chance * squad.findMult) })) : [];
  return {
    seconds,
    value,
    fraction: refHour > 0 && seconds > 0 ? value / (refHour * (seconds / 3600)) : 0,
    resources,
    rp,
    finds,
    squad,
    vehicle: veh,
    mood: tripMoodFor(rules, spec.duration, !!vehicle),
  };
}

/** Mood after a trip: a boost, except a long trip on foot leaves the squad a little tired. */
export function tripMoodFor(rules: ExpeditionRules, duration: number, vehicle: boolean): number {
  return duration >= rules.mood.wearyFrom && !vehicle ? rules.mood.weary : rules.mood.adventure;
}

/** Round a haul amount to something that reads well ("~1,250 Wood"). */
export function niceAmount(n: number): number {
  if (!(n > 0)) return 0;
  if (n < 20) return Math.max(1, Math.round(n));
  if (n < 200) return Math.round(n / 5) * 5;
  if (n < 2000) return Math.round(n / 10) * 10;
  if (n < 20000) return Math.round(n / 50) * 50;
  return Math.round(n / 500) * 500;
}

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export interface RolledHaul {
  reward: Reward;
  /** Names of what the rare finds were (for the Star Chart note / toasts). */
  found: string[];
}

/**
 * Roll the haul from its plan, deterministically from `seed`: each resource lands within ± variance of its expected
 * amount, each find rolls once. At most one survivor joins per trip (the rarest one rolled).
 */
export function rollHaul(data: DataRegistry, plan: HaulPlan, seed: number): RolledHaul {
  const rules = data.expeditionRules;
  const rng = new Rng(seed);
  const spread = (n: number) => niceAmount(n * (1 + rules.variance * (2 * rng.next() - 1)));
  const reward: Reward = {};
  const resources: Record<string, number> = {};
  for (const k of Object.keys(plan.resources).sort()) {
    const n = spread(plan.resources[k]);
    if (n > 0) resources[k] = n;
  }
  if (Object.keys(resources).length) reward.resources = resources;
  if (plan.rp > 0) reward.rp = spread(plan.rp);
  const found: string[] = [];
  for (const f of plan.finds) {
    if (!rng.chance(f.chance)) continue;
    const r = f.reward;
    if (r.colonist) {
      if (!reward.colonist || RARITY_RANK[r.colonist] > RARITY_RANK[reward.colonist]) reward.colonist = r.colonist;
    }
    if (r.items) {
      reward.items ??= {};
      for (const [id, n] of Object.entries(r.items)) reward.items[id] = (reward.items[id] ?? 0) + n;
    }
    if (r.nova) reward.nova = (reward.nova ?? 0) + r.nova;
    if (r.rp) reward.rp = (reward.rp ?? 0) + r.rp;
    if (r.resources) {
      reward.resources ??= {};
      for (const [k, n] of Object.entries(r.resources)) reward.resources[k] = (reward.resources[k] ?? 0) + (n ?? 0);
    }
    found.push(findLabel(data, f));
  }
  return { reward, found };
}

/** "Alloy Crate", "Rare survivor", "3 Nova" — a short name for a find. */
export function findLabel(data: DataRegistry, f: TripFind): string {
  if (f.label) return f.label;
  const r = f.reward;
  if (r.colonist) return `${r.colonist.charAt(0).toUpperCase()}${r.colonist.slice(1)} survivor`;
  const item = Object.entries(r.items ?? {})[0];
  if (item) return `${item[1] > 1 ? `${item[1]}× ` : ''}${data.item(item[0])?.name ?? item[0]}`;
  if (r.nova) return `${r.nova} Nova`;
  if (r.rp) return `${r.rp} RP`;
  return 'Something shiny';
}

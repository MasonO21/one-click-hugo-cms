/**
 * Human-readable descriptions of content definitions (building effects, lock reasons,
 * research modifiers) shared by the build menu, inspector and research panels.
 */
import type { BuildingDef, Modifier, ResourceBag } from '../../data/schema';
import type { DataRegistry } from '../../data';
import { fmt } from '../../core/format';
import { bagEntries } from '../../core/bag';
import { buildingArt, resourceArt, vehicleArt } from '../art';

export interface EffectTag {
  icon: string;
  /** Illustration for `icon` (resource tags) — the emoji is the fallback. */
  art?: string | null;
  text: string;
  tone?: 'good' | 'warn' | 'info';
}

/** Multiplier on numeric effects for a facility at `level` (BuildingDef.levelEffect). */
export function levelMult(def: BuildingDef, level: number): number {
  return 1 + (def.levelEffect ?? 0) * (Math.max(1, level) - 1);
}

function bagTags(bag: ResourceBag | undefined, data: DataRegistry, mult: number, sign: string, suffix: string, tone: 'good' | 'warn'): EffectTag[] {
  return bagEntries(bag).map(([id, v]) => ({ icon: data.resource(id)?.icon ?? '•', art: resourceArt(id), text: `${sign}${fmt(v * mult)}${suffix}`, tone }));
}

/** Effect chips for a building def at a given level. */
export function buildingEffects(def: BuildingDef, data: DataRegistry, level = 1): EffectTag[] {
  const m = levelMult(def, level);
  const out: EffectTag[] = [];
  if (def.housing) out.push({ icon: '🛏️', text: `${fmt(def.housing * m)} bed${def.housing * m === 1 ? '' : 's'}`, tone: 'good' });
  out.push(...bagTags(def.produces, data, m, '+', '/min', 'good'));
  out.push(...bagTags(def.consumes, data, 1, '−', '/min', 'warn'));
  if (def.power) out.push({ icon: '⚡', text: def.power > 0 ? `+${fmt(def.power * m)} power` : `−${fmt(-def.power)} power`, tone: def.power > 0 ? 'good' : 'warn' });
  if (def.storage) {
    const e = bagEntries(def.storage);
    if (e.length) {
      const icons = e.slice(0, 3).map(([id]) => data.resource(id)?.icon ?? '').join('');
      out.push({ icon: '📦', text: `+${fmt(e[0][1] * m)} ${icons}`, tone: 'info' });
    }
  }
  if (def.research_rate) out.push({ icon: '🔬', text: `+${fmt(def.research_rate * m)} RP/min`, tone: 'good' });
  const happy = (def.comfort ?? 0) + (def.entertainment ?? 0) + (def.medical ?? 0);
  if (happy) out.push({ icon: '😊', text: `+${fmt(happy * m)} comfort`, tone: 'good' });
  if (def.turret) {
    const t = def.turret;
    out.push({ icon: '🎯', text: `${fmt(t.damage * m)} dmg · ${t.range} range`, tone: 'info' });
    if (t.antiAir) out.push({ icon: '🛩️', text: 'Anti-air', tone: 'info' });
    if (t.splash) out.push({ icon: '💥', text: 'Splash', tone: 'info' });
  }
  if (def.trap) out.push({ icon: '📌', text: `${fmt(def.trap.dps * m)} dmg/s`, tone: 'info' });
  if (def.shield) out.push({ icon: '🛡️', text: `Shield ${fmt(def.shield.capacity * m)}`, tone: 'info' });
  if (def.repair) out.push({ icon: '🔧', text: `Repairs ${fmt(def.repair * m)}/s`, tone: 'good' });
  if (def.workers) out.push({ icon: '👷', text: `${def.workers.slots} worker${def.workers.slots === 1 ? '' : 's'}`, tone: 'info' });
  if (def.station) out.push({ icon: '🛠️', text: 'Crafting station', tone: 'info' });
  if (def.factory) out.push({ icon: '🏭', text: 'Auto-crafts', tone: 'info' });
  if (def.recruit) out.push({ icon: '🧑‍🤝‍🧑', text: 'Recruitment', tone: 'info' });
  if (def.garage) out.push({ icon: '🚙', text: 'Vehicles', tone: 'info' });
  if (def.teleporter) out.push({ icon: '🌀', text: 'Teleporter', tone: 'info' });
  if (def.spinWheel) out.push({ icon: '🎡', text: 'Daily spin', tone: 'good' });
  return out;
}

export interface LockInfo {
  locked: boolean;
  kind: 'tier' | 'research' | null;
  text: string | null;
}

/** Why a building cannot be built yet ("Requires Stone tier"). */
export function lockInfo(def: BuildingDef, data: DataRegistry, colonyTier: number, completedResearch: readonly string[]): LockInfo {
  if (def.unlockTier > colonyTier) {
    return { locked: true, kind: 'tier', text: `Requires ${data.tier(def.unlockTier).name} tier` };
  }
  if (def.research && !completedResearch.includes(def.research)) {
    const r = data.researchDef(def.research);
    return { locked: true, kind: 'research', text: `Requires research: ${r?.name ?? def.research}` };
  }
  return { locked: false, kind: null, text: null };
}

const STAT_LABEL: Record<string, string> = {
  production: 'Production',
  gatherYield: 'Gather yield',
  gatherSpeed: 'Gather speed',
  buildSpeed: 'Build speed',
  craftSpeed: 'Craft speed',
  research: 'Research speed',
  storage: 'Storage',
  power: 'Power output',
  turretDamage: 'Turret damage',
  turretRange: 'Turret range',
  structureHp: 'Structure HP',
  repairSpeed: 'Repair speed',
  happiness: 'Happiness',
  colonistSpeed: 'Colonist speed',
  moveSpeed: 'Move speed',
  playerDamage: 'Your damage',
  playerHp: 'Your health',
  offlineHours: 'Offline hours',
  recruitSlots: 'Recruit slots',
  invasionReward: 'Invasion rewards',
};

/** "Gather yield +25%" for a research / equipment modifier. */
export function modifierText(m: Modifier, data: DataRegistry): string {
  let label = STAT_LABEL[m.stat];
  if (!label && m.stat.startsWith('production:')) {
    const id = m.stat.slice('production:'.length);
    label = `${data.resource(id)?.name ?? id} production`;
  }
  label ??= m.stat;
  const flat = m.stat === 'offlineHours' || m.stat === 'recruitSlots';
  const parts: string[] = [];
  if (m.add) parts.push(flat ? `+${fmt(m.add)}` : `${m.add >= 0 ? '+' : '−'}${Math.round(Math.abs(m.add) * 100)}%`);
  if (m.mult && m.mult !== 1) parts.push(`×${fmt(m.mult)}`);
  return `${label} ${parts.join(' ')}`.trim();
}

/** A building or vehicle in an "Unlocks" / "Newly available" list: its rendered thumbnail, emoji fallback and name. */
export interface UnlockEntry {
  kind: 'building' | 'vehicle';
  id: string;
  icon: string;
  /** Thumbnail URL (null = show `icon`). */
  art: string | null;
  name: string;
  /** Name of the research that still has to be finished before this can be built / driven (unset = usable at once). */
  needs?: string;
}

export function buildingUnlock(data: DataRegistry, id: string): UnlockEntry {
  const d = data.building(id);
  return { kind: 'building', id, icon: d?.icon ?? '🏠', art: buildingArt(id), name: d?.name ?? id };
}

export function vehicleUnlock(data: DataRegistry, id: string): UnlockEntry {
  const d = data.vehicle(id);
  return { kind: 'vehicle', id, icon: d?.icon ?? '🚙', art: vehicleArt(id), name: d?.name ?? id };
}

/** A tier's building / vehicle with the id of the research gating it (null = none), in display order. */
function tierUnlockPairs(data: DataRegistry, tier: number): { entry: UnlockEntry; research: string | null }[] {
  const bs = data.buildings.filter((b) => b.unlockTier === tier && !b.piece && !b.core);
  const vs = data.vehicles.filter((v) => v.unlockTier === tier);
  const gated = (n: string | undefined): number => (n ? 1 : 0);
  return [
    ...[...bs].sort((a, z) => gated(a.research) - gated(z.research)).map((b) => ({ entry: buildingUnlock(data, b.id), research: b.research ?? null })),
    ...[...vs].sort((a, z) => gated(a.research) - gated(z.research)).map((v) => ({ entry: vehicleUnlock(data, v.id), research: v.research ?? null })),
  ];
}

/**
 * The facilities and vehicles that come with a colony tier (exactly that `unlockTier`; structure pieces and the
 * Command Center are not listed), those usable at once first. `freeOnly` keeps just the ones that need no research;
 * without it the colony panel previews the whole tier.
 */
export function tierUnlocks(data: DataRegistry, tier: number, freeOnly = false): UnlockEntry[] {
  return tierUnlockPairs(data, tier)
    .filter((p) => !freeOnly || !p.research)
    .map((p) => p.entry);
}

/** What a tier opens up, split by whether the player can use it right now. */
export interface TierUnlockGroups {
  /** Buildable / drivable at once (no research needed, or the research is already done): "Newly available". */
  ready: UnlockEntry[];
  /** Still behind research; each entry carries the research name in `needs`. */
  research: UnlockEntry[];
}

/**
 * The whole tier for the tier-up celebration: what is usable the moment the tier is reached (nothing gating it, or
 * its research is in `done`), then the research-gated rest, marked with the research each one needs.
 */
export function tierUnlockGroups(data: DataRegistry, tier: number, done: readonly string[] = []): TierUnlockGroups {
  const ready: UnlockEntry[] = [];
  const research: UnlockEntry[] = [];
  for (const { entry, research: need } of tierUnlockPairs(data, tier)) {
    if (!need || done.includes(need)) ready.push(entry);
    else research.push({ ...entry, needs: data.researchDef(need)?.name ?? need });
  }
  return { ready, research };
}

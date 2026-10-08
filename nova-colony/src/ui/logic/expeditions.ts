/**
 * Expedition presentation logic (pure, no DOM): destination groups per region, the squad picker order and labels,
 * the vehicle line, the HUD chip state and the Star Chart layout.
 */
import type { Game } from '../../core/Game';
import type { Colonist, Expedition } from '../../core/state';
import type { ExpeditionDef, ExpeditionRules, VehicleDef } from '../../data/schema';
import { isMatch, memberBonus, vehicleEffect, type TripSpec } from '../../sim/expedition/rules';

export interface DestinationEntry {
  def: ExpeditionDef;
  ok: boolean;
  reason: string | null;
}

export interface RegionGroup {
  biome: string;
  name: string;
  discovered: boolean;
  entries: DestinationEntry[];
  /** At least one destination here can be visited right now. */
  open: boolean;
}

/** Regional destinations grouped by biome, in the order the biomes are authored; open regions first. */
export function destinationGroups(game: Game): RegionGroup[] {
  const ex = game.sys.expeditions;
  const out: RegionGroup[] = [];
  for (const b of game.data.biomes) {
    const defs = game.data.expeditions.filter((d) => d.region === b.id);
    if (!defs.length) continue;
    const entries = defs.map((def) => ({ def, ...ex.destinationStatus(def) }));
    out.push({ biome: b.id, name: b.name, discovered: game.state.world.regionsDiscovered.includes(b.id), entries, open: entries.some((e) => e.ok) });
  }
  return out.sort((a, b) => Number(b.open) - Number(a.open));
}

export interface SquadRow {
  c: Colonist;
  match: boolean;
  /** This member's haul bonus in whole percent (profession + skill). */
  bonusPct: number;
}

/** Colonists at home for a trip: profession matches first, then skill, then whoever is idle. */
export function squadRows(game: Game, spec: Pick<TripSpec, 'match'>): SquadRow[] {
  const rules = game.data.expeditionRules;
  return game.sys.expeditions
    .candidates()
    .map((c) => ({ c, match: isMatch(spec, c), bonusPct: Math.round(memberBonus(rules, spec, c) * 100) }))
    .sort((a, b) => Number(b.match) - Number(a.match) || b.c.skill - a.c.skill || Number(a.c.workplace != null) - Number(b.c.workplace != null) || a.c.id - b.c.id);
}

/** "−8% time · +3% haul" for a vehicle option. */
export function vehicleLine(rules: ExpeditionRules, v: VehicleDef): string {
  const e = vehicleEffect(rules, v);
  const parts: string[] = [];
  const t = Math.round((1 - e.durMult) * 100);
  const hl = Math.round((e.haulMult - 1) * 100);
  if (t > 0) parts.push(`−${t}% time`);
  if (hl > 0) parts.push(`+${hl}% haul`);
  return parts.join(' · ') || 'Along for the ride';
}

/** "15 min", "1 h", "4 h 30 min". */
export function durationLabel(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export interface HudExpedition {
  /** 'ready' = a haul is waiting, 'out' = squads are away (countdown to the next one), null = nothing to show. */
  state: 'ready' | 'out' | null;
  ready: number;
  /** Seconds until the next squad is back (out only). */
  seconds: number;
}

export function hudExpedition(game: Game): HudExpedition {
  const ex = game.sys.expeditions;
  const ready = ex.ready().length;
  if (ready) return { state: 'ready', ready, seconds: 0 };
  const out = ex.out();
  if (!out.length) return { state: null, ready: 0, seconds: 0 };
  return { state: 'out', ready: 0, seconds: Math.min(...out.map((e) => ex.secondsLeft(e))) };
}

/**
 * The HUD chip's text for squads waiting to be collected. `compact`: a portrait phone, where the status row must fit
 * one line (the green chip and its compass already say what is ready).
 */
export function expeditionChipText(ready: number, compact: boolean): string {
  if (ready > 1) return compact ? `${ready} ready!` : `${ready} squads home!`;
  return compact ? 'Ready!' : 'Haul ready!';
}

/** Badge count: hauls waiting plus Star Chart milestones to claim. */
export function expeditionBadge(game: Game): number {
  const ex = game.sys.expeditions;
  return ex.ready().length + ex.claimableMilestones().length;
}

/** 0..1 progress of a trip that is out. */
export function tripProgress(game: Game, e: Expedition): number {
  if (e.status === 'back') return 1;
  const total = Math.max(1, e.endsAt - e.startedAt);
  return Math.max(0, Math.min(1, (game.now() - e.startedAt) / total));
}

/**
 * Star Chart positions (0..1 box, home at the centre). The journey spirals outward from home: each site sits about
 * the same step from the one before (an Archimedean spiral with a little deterministic wobble), so the trail reads
 * as one long road rather than a web. The layout is fixed in "chart space" and the view zooms out as it grows:
 * a site never moves relative to the others when a new one is charted.
 */
export function chartLayout(count: number): { x: number; y: number }[] {
  const raw: { x: number; y: number }[] = [];
  let reach = 1;
  for (let i = 0; i < count; i++) {
    const s = Math.sqrt(i + 1.5);
    const a = 2.4 * s - Math.PI / 2 + Math.sin(i * 12.9898) * 0.12;
    const r = 3 + 6 * s + Math.cos(i * 4.1414) * 0.9;
    raw.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    reach = Math.max(reach, r);
  }
  const k = 0.44 / (reach + 2);
  return raw.map((p) => ({ x: 0.5 + p.x * k, y: 0.5 + p.y * k }));
}

/**
 * The star a tap on the Star Chart picks: the nearest one within `reach` (chart units, the 0..1 box), else -1. On a
 * landscape phone the chart is drawn small (a star's own circle is under 30px there), so a tap near a star counts.
 */
export function pickStar(pts: readonly { x: number; y: number }[], x: number, y: number, reach: number): number {
  let best = -1;
  let bd = reach * reach;
  pts.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Percent text for a chance ("35%", "<1%"). */
export function chanceText(p: number): string {
  if (p > 0 && p < 0.01) return '<1%';
  return `${Math.round(p * 100)}%`;
}

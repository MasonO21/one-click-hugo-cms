/**
 * Expedition balance: every destination's hourly haul against what a colony at that tier makes per hour
 * (src/data/expeditions.ts `reference`, valued with `value`), the duration ladder, squad / vehicle effects, in-kind
 * sanity per resource, rare-find coverage and the Frontier's gentle escalation. Prints the destination table.
 */
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import type { ExpeditionDef, ProfessionId, VehicleDef } from '../src/data/schema';
import {
  frontierFinds,
  frontierSpec,
  planHaul,
  referenceValuePerHour,
  regionalSpec,
  rewardValue,
  vehicleEffect,
  type Member,
  type TripSpec,
} from '../src/sim/expedition/rules';

const data = createDataRegistry();
const rules = data.expeditionRules;
const BAND = { min: 0.25, max: 0.4 };
/** No resource comes home faster than this many hours of the reference colony's own output of it, per trip hour. */
const IN_KIND_MAX = 1.6;

const PROFS = data.professions.map((p) => p.id);
const nonMatch = (spec: TripSpec): ProfessionId => PROFS.find((p) => !spec.match.includes(p))!;

/** A full squad: two stars each, one of them knows the terrain. */
const standard = (spec: TripSpec): Member[] => [
  { specialty: spec.match[0], skill: 2 },
  { specialty: nonMatch(spec), skill: 2 },
  { specialty: nonMatch(spec), skill: 2 },
];
const worst = (spec: TripSpec): Member[] => [0, 1, 2].map(() => ({ specialty: nonMatch(spec), skill: 1 }));
const best = (spec: TripSpec): Member[] => [0, 1, 2].map((i) => ({ specialty: spec.match[i % spec.match.length], skill: 5 }));

/** The vehicle that helps most per hour among those available at a tier. */
function bestVehicle(tier: number): VehicleDef | null {
  let top: VehicleDef | null = null;
  let topK = 1;
  for (const v of data.vehicles) {
    if (v.unlockTier > tier) continue;
    const e = vehicleEffect(rules, v);
    const k = e.haulMult / e.durMult;
    if (k > topK) {
      topK = k;
      top = v;
    }
  }
  return top;
}

const fmtH = (s: number) => (s >= 3600 ? `${s / 3600}h` : `${s / 60}m`);

describe('expeditions.balance — hauls vs. the colony at that tier', () => {
  const rows: string[] = [];
  rows.push('destination                 tier  dur   std%   worst%  best%  value/h      haul (standard squad)');
  for (const def of data.expeditions) {
    const spec = regionalSpec(def);
    const std = planHaul(data, spec, standard(spec));
    const lo = planHaul(data, spec, worst(spec));
    const hi = planHaul(data, spec, best(spec), bestVehicle(def.tier));
    const haul = [...Object.entries(std.resources).map(([k, v]) => `${k}:${v}`), std.rp ? `rp:${std.rp}` : ''].filter(Boolean).join(' ');
    rows.push(`${def.name.padEnd(27)} T${def.tier}   ${fmtH(def.duration).padEnd(4)} ${(std.fraction * 100).toFixed(1).padStart(5)}  ${(lo.fraction * 100).toFixed(1).padStart(6)}  ${(hi.fraction * 100).toFixed(1).padStart(5)}  ${Math.round(std.value / (def.duration / 3600)).toString().padStart(9)}    ${haul}`);
  }
  for (let t = 2; t <= 6; t++) rows.push(`reference colony T${t}: ${Math.round(referenceValuePerHour(rules, t))} value/h`);
  console.log('\n' + rows.join('\n') + '\n');

  it('a standard full squad brings home 25–40% of the reference colony’s hourly value per trip hour', () => {
    for (const def of data.expeditions) {
      const spec = regionalSpec(def);
      const f = planHaul(data, spec, standard(spec)).fraction;
      expect(f, `${def.id} ${(f * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(BAND.min);
      expect(f, `${def.id} ${(f * 100).toFixed(1)}%`).toBeLessThanOrEqual(BAND.max);
    }
  });

  it('the weakest full squad and the very best one stay close to the band (complement, never replace)', () => {
    for (const def of data.expeditions) {
      const spec = regionalSpec(def);
      expect(planHaul(data, spec, worst(spec)).fraction, def.id).toBeGreaterThanOrEqual(0.22);
      expect(planHaul(data, spec, best(spec), bestVehicle(def.tier)).fraction, def.id).toBeLessThanOrEqual(0.6);
    }
  });

  it('rewards scale with tier and duration; longer rungs are a little more efficient per hour', () => {
    const byRegion = new Map<string, ExpeditionDef[]>();
    for (const d of data.expeditions) byRegion.set(d.region, [...(byRegion.get(d.region) ?? []), d]);
    for (const [region, defs] of byRegion) {
      for (let i = 1; i < defs.length; i++) {
        const a = defs[i - 1];
        const b = defs[i];
        expect(b.duration, `${region} durations rise`).toBeGreaterThanOrEqual(a.duration);
        expect(b.tier, `${region} tiers rise`).toBeGreaterThanOrEqual(a.tier);
        expect(planHaul(data, regionalSpec(b), standard(regionalSpec(b))).value, `${b.id} worth more than ${a.id}`).toBeGreaterThan(planHaul(data, regionalSpec(a), standard(regionalSpec(a))).value);
      }
    }
    for (let i = 1; i < rules.durationEfficiency.length; i++) expect(rules.durationEfficiency[i]).toBeGreaterThan(rules.durationEfficiency[i - 1]);
    for (let t = 3; t <= 6; t++) expect(referenceValuePerHour(rules, t)).toBeGreaterThan(referenceValuePerHour(rules, t - 1));
    // same destination, same squad: the haul grows with the squad's skill and profession match
    const spec = regionalSpec(data.expedition('rd_wreck')!);
    expect(planHaul(data, spec, best(spec)).value).toBeGreaterThan(planHaul(data, spec, standard(spec)).value);
    expect(planHaul(data, spec, standard(spec)).value).toBeGreaterThan(planHaul(data, spec, worst(spec)).value);
    expect(planHaul(data, spec, standard(spec).slice(0, 1)).value).toBeLessThan(planHaul(data, spec, standard(spec)).value);
  });

  it('no resource floods in: per trip hour at most 1.6 hours of the reference colony’s own output of it', () => {
    for (const def of data.expeditions) {
      const spec = regionalSpec(def);
      const plan = planHaul(data, spec, standard(spec));
      const ref = rules.reference[def.tier];
      const hours = def.duration / 3600;
      for (const [k, n] of [...Object.entries(plan.resources), ['rp', plan.rp] as [string, number]]) {
        if (!n) continue;
        const perHour = (ref[k] ?? 0) * 60;
        expect(perHour, `${def.id}: the T${def.tier} colony makes no ${k}`).toBeGreaterThan(0);
        expect(n / hours / perHour, `${def.id} ${k}: ${Math.round(n / hours)}/h vs colony ${Math.round(perHour)}/h`).toBeLessThanOrEqual(IN_KIND_MAX);
      }
    }
  });

  it('a standard haul fits the storage of a colony at that tier (the very best one fits the Welcome Back allowance)', () => {
    const allowance = data.balance.offlineStorageMult ?? 1;
    const check = (id: string, spec: TripSpec, tier: number) => {
      const cap = rules.referenceStorage[tier];
      const std = planHaul(data, spec, standard(spec));
      const top = planHaul(data, spec, best(spec), bestVehicle(tier));
      for (const [k, n] of Object.entries(std.resources)) expect(n, `${id} ${k} ${n} vs storage ${cap[k]}`).toBeLessThanOrEqual(cap[k] * 1.05);
      for (const [k, n] of Object.entries(top.resources)) expect(n, `${id} best ${k} ${n} vs storage ${cap[k]}`).toBeLessThanOrEqual(cap[k] * allowance);
    };
    for (const def of data.expeditions) check(def.id, regionalSpec(def), def.tier);
    for (const fl of rules.frontier.flavours) {
      for (const duration of rules.frontier.durations) {
        // deep into the Frontier (the haul bonus is capped), on the longest trips
        check(`frontier ${fl.biome}`, frontierSpec(data, { id: 'z', name: 'Z', biome: fl.biome, duration, depth: 500 }), rules.frontier.unlockTier);
      }
    }
  });

  it('the profession match raises the rare-find chances, and every find is real content', () => {
    for (const def of data.expeditions) {
      const spec = regionalSpec(def);
      const lo = planHaul(data, spec, worst(spec));
      const hi = planHaul(data, spec, best(spec));
      lo.finds.forEach((f, i) => expect(hi.finds[i].chance, def.id).toBeGreaterThan(f.chance));
      for (const f of def.finds ?? []) {
        for (const id of Object.keys(f.reward.items ?? {})) expect(data.item(id), `${def.id} find ${id}`).toBeTruthy();
        expect(f.chance).toBeGreaterThan(0);
        expect(f.chance).toBeLessThan(1);
      }
      // rare finds are a bonus on top: their expected value is small next to the haul itself
      const expected = (def.finds ?? []).reduce((s, f) => s + f.chance * rewardValue(data, f.reward, def.tier), 0);
      expect(expected, `${def.id} finds`).toBeLessThan(lo.value);
    }
  });

  it('the Frontier starts in the band and escalates gently (finds and haul) as the chart grows', () => {
    const site = (depth: number) => frontierSpec(data, { id: 'x', name: 'Test', biome: 'titanium_highlands', duration: 4 * 3600, depth });
    const f1 = planHaul(data, site(1), standard(site(1))).fraction;
    const f60 = planHaul(data, site(60), standard(site(60))).fraction;
    expect(f1).toBeGreaterThanOrEqual(BAND.min);
    expect(f1).toBeLessThanOrEqual(BAND.max);
    expect(f60).toBeGreaterThan(f1);
    expect(f60).toBeLessThanOrEqual(0.5);
    expect(frontierFinds(rules, 1).length).toBeLessThan(frontierFinds(rules, 40).length);
    const crate = (d: number) => frontierFinds(rules, d).find((f) => f.reward.items?.titan_crate)!.chance;
    expect(crate(30)).toBeGreaterThan(crate(1));
    expect(crate(500)).toBeLessThanOrEqual(0.5);
    for (const fl of rules.frontier.flavours) {
      expect(data.biome(fl.biome), fl.biome).toBeTruthy();
      const s = frontierSpec(data, { id: 'y', name: 'T', biome: fl.biome, duration: 3600, depth: 1 });
      const fr = planHaul(data, s, standard(s)).fraction;
      expect(fr, fl.biome).toBeGreaterThanOrEqual(BAND.min);
      expect(fr, fl.biome).toBeLessThanOrEqual(BAND.max);
    }
  });
});

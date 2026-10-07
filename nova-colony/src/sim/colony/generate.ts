/**
 * Colonist generation: names, bios, looks, traits, specialties and skill by rarity.
 * All randomness goes through `game.rng` so results are deterministic per seed.
 */
import type { Game } from '../../core/Game';
import type { Colonist } from '../../core/state';
import type { ProfessionId, Rarity, TraitDef } from '../../data/schema';

/** Recruitment board rarity table (percent). */
export const RARITY_WEIGHTS: { rarity: Rarity; weight: number }[] = [
  { rarity: 'common', weight: 70 },
  { rarity: 'rare', weight: 22 },
  { rarity: 'epic', weight: 7 },
  { rarity: 'legendary', weight: 1 },
];

/** Roll a rarity for a recruitment candidate. */
export function rollRarity(game: Game): Rarity {
  return game.rng.weighted(RARITY_WEIGHTS).rarity;
}

/** Every name currently in use (colonists + board candidates). */
function takenNames(game: Game): Set<string> {
  const s = new Set<string>();
  for (const c of game.state.colonists.list) s.add(c.name);
  for (const k of game.state.colonists.candidates) s.add(k.colonist.name);
  return s;
}

const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function pickName(game: Game): { first: string; full: string } {
  const { first, last } = game.data.names;
  const rng = game.rng;
  const taken = takenNames(game);
  let f = 'Survivor';
  let full = f;
  for (let i = 0; i < 40; i++) {
    f = rng.pick(first);
    full = `${f} ${rng.pick(last)}`;
    if (!taken.has(full)) return { first: f, full };
  }
  // Pools exhausted: add a numeral so names stay unique (very large colonies only).
  for (let n = 2; ; n++) {
    const candidate = `${full} ${ROMAN[n] ?? n}`;
    if (!taken.has(candidate)) return { first: f, full: candidate };
  }
}

function skillFor(game: Game, rarity: Rarity): number {
  switch (rarity) {
    case 'common':
      return 1;
    case 'rare':
      return 2;
    case 'epic':
      return 3;
    default:
      return game.rng.chance(0.4) ? 5 : 4;
  }
}

function traitScore(t: TraitDef): number {
  return (t.productivity ?? 0) * 100 + (t.happiness ?? 0) + (t.speed ?? 0) * 20;
}

/** Rarer colonists roll their trait several times and keep the best one. */
function pickTrait(game: Game, rarity: Rarity): string {
  const traits = game.data.traits;
  if (!traits.length) return '';
  const tries = rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : 1;
  let best = game.rng.pick(traits);
  for (let i = 1; i < tries; i++) {
    const t = game.rng.pick(traits);
    if (traitScore(t) > traitScore(best)) best = t;
  }
  return best.id;
}

/**
 * Specialty: any profession. Gatherers are common in the early game (that is who you need first), and
 * professions needed by buildings that already exist are twice as likely so recruits are useful.
 */
function pickSpecialty(game: Game): ProfessionId {
  const profs = game.data.professions;
  if (!profs.length) return 'gatherer';
  const demanded = new Set<string>();
  for (const b of game.state.buildings.list) {
    const w = game.data.building(b.def)?.workers;
    if (w) demanded.add(w.job);
  }
  const early = game.state.colony.tier <= 1;
  const weighted = profs.map((p) => ({
    id: p.id,
    weight: (p.id === 'gatherer' ? (early ? 6 : 1.5) : 1) * (demanded.has(p.id) ? 2 : 1),
  }));
  return game.rng.weighted(weighted).id;
}

/** Generate a colonist (not added to the colony; id is assigned by `ColonistSystem.add`). */
export function generateColonist(game: Game, rarity: Rarity): Colonist {
  const rng = game.rng;
  const { first, full } = pickName(game);
  const bios = game.data.names.bios;
  const bio = bios.length ? rng.pick(bios).replace(/\{name\}/g, first) : '';
  return {
    id: 0,
    name: full,
    bio,
    rarity,
    appearance: {
      skin: rng.int(0, 5),
      hair: rng.int(0, 7),
      hairColor: rng.int(0, 7),
      outfit: rng.int(0, 7),
      height: Math.round(rng.range(0.9, 1.1) * 1000) / 1000,
    },
    trait: pickTrait(game, rarity),
    specialty: pickSpecialty(game),
    skill: skillFor(game, rarity),
    xp: 0,
    happiness: 60,
    workplace: null,
    bed: null,
    x: 0,
    z: 0,
    rot: 0,
    activity: 'idle',
    tx: 0,
    tz: 0,
    joinedAt: game.now(),
  };
}

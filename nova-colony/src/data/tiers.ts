import type { TierDef } from './schema';
import { PACING, pace, scaleBag } from './pacing';

/**
 * As authored; the exported TIERS carry the paced tier-up and piece costs (data/pacing.ts). Raids come every
 * `invasionInterval` seconds of online play: a tier lasts days now, so later tiers space them out to about three a day
 * for an engaged player (five 20-minute sessions) instead of one every session.
 */
const AUTHORED: TierDef[] = [
  {
    index: 0, id: 'wood', name: 'Wood', description: 'A humble survival camp built from fresh-cut timber.',
    color: '#a8743f', accent: '#f2c46d', glow: 0.1, colonyRadius: 12, hpMult: 1,
    pieceCost: { wood: 4 }, upgradeCost: {}, research: null, invasionInterval: 900,
  },
  {
    index: 1, id: 'reinforced', name: 'Reinforced Wood', description: 'Lashed and braced timber — a real settlement takes shape.',
    color: '#8a5a32', accent: '#d9b26a', glow: 0.15, colonyRadius: 16, hpMult: 1.8,
    pieceCost: { wood: 6, fiber: 3 }, upgradeCost: { wood: 150, stone: 60, fiber: 60 }, research: 'tier_reinforced', invasionInterval: 900,
  },
  {
    index: 2, id: 'stone', name: 'Stone', description: 'Solid masonry. The colony starts to look permanent.',
    color: '#a6a39b', accent: '#e8d9a8', glow: 0.25, colonyRadius: 21, hpMult: 3,
    pieceCost: { stone: 8, wood: 2 }, upgradeCost: { wood: 1400, stone: 1400, fiber: 450, food: 450 }, research: 'tier_stone', invasionInterval: 1200,
  },
  {
    index: 3, id: 'steel', name: 'Steel', description: 'Riveted steel and humming power lines. Industry arrives.',
    color: '#7d8a99', accent: '#ffb347', glow: 0.45, colonyRadius: 27, hpMult: 5,
    pieceCost: { steel: 4, stone: 4 }, upgradeCost: { stone: 2100, iron: 1050, steel: 500, copper: 400 }, research: 'tier_steel', invasionInterval: 1500,
  },
  {
    index: 4, id: 'alloy', name: 'Advanced Alloy', description: 'Sleek crystal-infused alloy panels and automated logistics.',
    color: '#5e7f99', accent: '#58d0ff', glow: 0.65, colonyRadius: 33, hpMult: 8,
    pieceCost: { alloy: 3, steel: 4 }, upgradeCost: { steel: 3500, electronics: 1000, crystal: 600, alloy: 400 }, research: 'tier_alloy', invasionInterval: 1800,
  },
  {
    index: 5, id: 'nano', name: 'Nano-Tech', description: 'Self-repairing nano surfaces, drones and fusion light.',
    color: '#3d4f6b', accent: '#7af7ff', glow: 0.85, colonyRadius: 40, hpMult: 13,
    pieceCost: { nano: 2, alloy: 4 }, upgradeCost: { alloy: 4500, energy_cell: 1500, nano: 500, electronics: 2500 }, research: 'tier_nano', invasionInterval: 2100,
  },
  {
    index: 6, id: 'titanium', name: 'Titanium', description: 'A gleaming titanium fortress — the pinnacle of colony technology.',
    color: '#dfe6ee', accent: '#45f0ff', glow: 1, colonyRadius: 48, hpMult: 20,
    pieceCost: { titanium: 3, nano: 1 }, upgradeCost: { titanium: 7000, nano: 5000, energy_cell: 10500, alloy: 16500 }, research: 'tier_titanium', invasionInterval: 2400,
  },
];

export const TIERS: TierDef[] = AUTHORED.map((t) => ({
  ...t,
  upgradeCost: scaleBag(t.upgradeCost, pace(PACING.tierUp, t.index)),
  pieceCost: scaleBag(t.pieceCost, pace(PACING.piece, t.index)),
}));

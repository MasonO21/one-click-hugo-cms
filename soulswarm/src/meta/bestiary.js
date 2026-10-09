// The Bestiary (GDD §5.2): kills per foe across runs, an entry unlocked by its first kill, three milestones claimed in order.
// Profile block: p.bestiary = { kills: { [id]: n }, claimed: { [id]: tiers claimed, 0–3 } }. Tunables: BESTIARY (data.js).
// Claiming pays through economy.claimBestiary (it owns grant()).
import { BESTIARY } from '../game/data.js';

export const bestiaryGoals = (id) => BESTIARY.foes[id].goals || (BESTIARY.foes[id].rare ? BESTIARY.rareGoals : BESTIARY.goals);

/** One entry for the UI: kills, unlocked, tiers claimed, and each tier's goal, reward and state (claimed / ready). */
export function bestiaryEntry(p, id) {
  const kills = p.bestiary.kills[id] || 0, claimed = p.bestiary.claimed[id] || 0;
  const tiers = bestiaryGoals(id).map((goal, i) => ({ tier: i + 1, goal, rewards: BESTIARY.rewards[i], claimed: i < claimed, ready: i === claimed && kills >= goal }));
  return { id, ...BESTIARY.foes[id], kills, unlocked: kills > 0, claimed, ready: tiers.some((t) => t.ready), tiers };
}

/** How many entries have a milestone ready to claim (the dot on the Heroes tab and the BESTIARY sub-tab). */
export function bestiaryClaimable(p) {
  let n = 0;
  for (const id of BESTIARY.order) { const g = bestiaryGoals(id), c = p.bestiary.claimed[id] || 0; if (c < g.length && (p.bestiary.kills[id] || 0) >= g[c]) n++; }
  return n;
}

/** Adds a run's kills per foe (result.byType); unknown ids and junk values are ignored. */
export function addBestiaryKills(p, byType) {
  if (!byType || typeof byType !== 'object') return;
  for (const id of BESTIARY.order) {
    const n = Math.floor(+byType[id]);
    if (n > 0 && n < 1e7) p.bestiary.kills[id] = (p.bestiary.kills[id] || 0) + n;
  }
}

// Feats (FEATS in data.js, Update 14, GDD §20): lifetime goals in tiers, measured from what the profile already keeps
// (stats, records, the Bestiary, mastery, relics), so nothing new is tracked in a run and a returning player is credited
// at once. Profile block: p.feats = { claimed: { [family]: tiers claimed } }. Claiming pays through economy.claimFeat.
import { FEATS, CAMPAIGN_LENGTH, BESTIARY, BOSSES, HERO_ORDER, ENDLESS_ID } from '../game/data.js';
import { clearedOn } from './difficulty.js';
import { heroMastery } from './mastery.js';
import { reportFeat } from '../engine/platform.js';

const BOSS_IDS = Object.keys(BOSSES);
const cleared = (p, d) => { let n = 0; for (let c = 1; c <= CAMPAIGN_LENGTH; c++) if (clearedOn(p, c, d)) n++; return n; };

/** The number a family's goals are measured against. */
export function featValue(p, id) {
  const s = p.stats;
  switch (id) {
    case 'campaign': return cleared(p, 'normal');
    case 'nightmare': return cleared(p, 'nightmare');
    case 'torment': return cleared(p, 'torment');
    case 'bane': return BOSS_IDS.reduce((a, b) => a + (p.bestiary.kills[b] || 0), 0);
    case 'reaper': return s.kills;
    case 'souls': return s.raised;
    case 'legion': return s.bestLegion;
    case 'streak': return s.bestStreak || 0;
    case 'runs': return s.runs;
    case 'heroes': return HERO_ORDER.filter((h) => p.heroes[h] && p.heroes[h].owned).length;
    case 'mastery': return HERO_ORDER.reduce((a, h) => Math.max(a, p.heroes[h] && p.heroes[h].owned ? heroMastery(p, h).rank : 0), 0);
    case 'bestiary': return BESTIARY.order.filter((f) => (p.bestiary.kills[f] || 0) > 0).length;
    case 'abyss': { const b = p.chapter.best[ENDLESS_ID]; return (b && b.depth) || 0; }
    case 'rush': return p.rush.clears || 0;
    case 'trial': return p.trial.clears || 0;
    case 'relics': return p.relics.reduce((a, r) => Math.max(a, r.stars || 0), 0);
    case 'level': return p.level;
    default: return 0;
  }
}

/** One family for the UI: its value, tiers claimed and reached, and the next tier's goal, gems and state. */
export function featEntry(p, id) {
  const F = FEATS.families[id], value = featValue(p, id), claimed = Math.min(F.goals.length, (p.feats.claimed[id] || 0));
  const reached = F.goals.filter((g) => value >= g).length, done = claimed >= F.goals.length;
  const i = done ? F.goals.length - 1 : claimed;
  return { id, ...F, value, claimed, reached, done, tier: i + 1, goal: F.goals[i], reward: F.gems[i], ready: !done && value >= F.goals[i],
    desc: F.text.replace('{n}', F.goals[i].toLocaleString('en-US')).replace('{s}', F.goals[i] === 1 ? '' : 's').replace('{es}', F.goals[i] === 1 ? '' : 'es') };
}

/** How many families have a tier ready to claim (the dot on the Feats button). */
export const featsClaimable = (p) => FEATS.order.filter((id) => featEntry(p, id).ready).length;

/** Tiers reached and the total, for the panel's header. */
export function featsProgress(p) {
  let got = 0, all = 0;
  for (const id of FEATS.order) { const F = FEATS.families[id], v = featValue(p, id); all += F.goals.length; got += F.goals.filter((g) => v >= g).length; }
  return { got, all };
}

/** Tiers reached per family (a snapshot to diff after a run). */
export const featsReached = (p) => Object.fromEntries(FEATS.order.map((id) => { const v = featValue(p, id); return [id, FEATS.families[id].goals.filter((g) => v >= g).length]; }));
/** The tiers reached since `before` (featsReached), for the results screen: [{ id, name, tier }]. */
export function newFeats(p, before) {
  const now = featsReached(p), out = [];
  for (const id of FEATS.order) for (let t = (before[id] || 0) + 1; t <= now[id]; t++) out.push({ id, name: FEATS.families[id].name, tier: t, of: FEATS.families[id].goals.length });
  return out;
}

/** Reports every reached tier to the platform (Game Center / Play Games in store builds), once per session each (a
 *  bridge registered late, after a slow sign-in, gets them all at the next call). */
const reported = new Set();
export function reportFeats(p) {
  for (const id of FEATS.order) {
    const F = FEATS.families[id], v = featValue(p, id);
    F.goals.forEach((g, i) => { const key = `${id}_${i + 1}`; if (v >= g && !reported.has(key) && reportFeat(key)) reported.add(key); });
  }
}

/** Coerces a loaded block (save.js). */
export function sanitizeFeats(raw) {
  const out = { claimed: {} }, c = raw && typeof raw === 'object' && raw.claimed && typeof raw.claimed === 'object' ? raw.claimed : {};
  for (const id of FEATS.order) { const n = Math.floor(+c[id]); if (n > 0) out.claimed[id] = Math.min(n, FEATS.families[id].goals.length); }
  return out;
}

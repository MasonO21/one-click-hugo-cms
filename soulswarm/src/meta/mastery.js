// Hero Mastery (MASTERY in data.js, Update 9): every hero ranks 1 → 10 by being played. A run gives the hero who fought it
// the run's pass XP as mastery XP; each rank adds a perk (HP, damage, a shorter Rite, a head start for the signature
// weapon, the Ascended Rite at rank 5, the Soulbound aura at rank 10) and pays its reward once.
// The profile keeps each hero's lifetime XP and the highest rank already paid: p.mastery[id] = { xp, paid }.
import { MASTERY, HEROES } from '../game/data.js';

const EMPTY = { xp: 0, paid: 1 };
/** A hero's saved mastery block (a fresh one reads as rank 1, nothing paid). */
export const masteryOf = (p, id) => (p.mastery && p.mastery[id]) || EMPTY;

/** Rank and progress from lifetime mastery XP: { rank, into, need, max } (into / need: XP toward the next rank). */
export function masteryRank(xp) {
  let r = 1, left = Math.max(0, +xp || 0);
  while (r < MASTERY.max && left >= MASTERY.need[r]) { left -= MASTERY.need[r]; r++; }
  const max = r >= MASTERY.max;
  return { rank: r, into: max ? 0 : Math.floor(left), need: max ? 0 : MASTERY.need[r], max };
}
export const heroMastery = (p, id) => masteryRank(masteryOf(p, id).xp);

/** The perks a rank carries, cumulative: { rank, hp, dmg, riteCd, weaponLv, asc, aura }. */
export function masteryPerks(rank) {
  const out = { rank, hp: 0, dmg: 0, riteCd: 0, weaponLv: 0, asc: false, aura: false };
  for (let r = 2; r <= Math.min(rank, MASTERY.max); r++) {
    for (const [k, v] of Object.entries(MASTERY.ranks[r].perk)) out[k] = v === true ? true : out[k] + v;
  }
  return out;
}

/** The hero a result belongs to: the one it names if the profile owns it, else the selected hero. */
export const resultHero = (p, result) => (result.heroId && HEROES[result.heroId] && p.heroes[result.heroId]?.owned ? result.heroId : p.selectedHero);

/**
 * A finished run's mastery XP goes to its hero. Rank-ups pay their rewards once each (never twice, even if a save is
 * rolled back to a lower XP). Returns what the results screen shows, with `rewards` summed for the caller to grant:
 * { hero, gained, from, to, into, need, max, ranks: [rank…], rewards: { gold, gems, sigils } }.
 */
export function gainMastery(p, id, xp) {
  if (!HEROES[id]) return null;
  p.mastery = p.mastery || {};
  const M = p.mastery[id] = { ...EMPTY, ...p.mastery[id] };
  const gained = Math.max(0, Math.round(+xp || 0));
  const from = masteryRank(M.xp).rank;
  M.xp += gained;
  const now = masteryRank(M.xp), ranks = [], rewards = {};
  for (let r = Math.max(M.paid, 1) + 1; r <= now.rank; r++) {
    ranks.push(r);
    for (const [k, v] of Object.entries(MASTERY.ranks[r].reward)) rewards[k] = (rewards[k] || 0) + v;
  }
  M.paid = Math.max(M.paid, now.rank);
  return { hero: id, gained, from, to: now.rank, into: now.into, need: now.need, max: now.max, ranks, rewards };
}

/** Save repair: one { xp, paid } per known hero, as integers (paid 1–10; a paid rank above the XP's rank stays paid). */
export function sanitizeMastery(raw) {
  const out = {};
  for (const id of Object.keys(HEROES)) {
    const m = raw && typeof raw === 'object' ? raw[id] : null;
    if (!m || typeof m !== 'object') continue;
    out[id] = { xp: Math.min(1e7, Math.max(0, Math.floor(+m.xp) || 0)), paid: Math.min(MASTERY.max, Math.max(1, Math.floor(+m.paid) || 1)) };
  }
  return out;
}

// Nightmare and Torment (GDD §8.2): per-chapter unlocks, the remembered choice, records and the boss's hoard (relic) odds.
// Profile block: p.diff = { sel: { [chapter]: id }, best: { [chapter]: { [id]: { time, legion, kills, streak, cleared } } } }.
// Normal's clear flag stays in p.chapter.best (it drives chapter unlocks and the Daily Trial).
import { CHAPTERS, DIFFICULTY, DIFFICULTY_ORDER, RARITIES } from '../game/data.js';

/** The difficulty a run result was played on. Endless Abyss and the Daily Trial are always Normal. */
export const resultDifficulty = (r) => (!r.trial && !r.endless && DIFFICULTY[r.difficulty]) || DIFFICULTY.normal;

export const difficultyRecord = (p, ch, id) => (p.diff && p.diff.best[ch] && p.diff.best[ch][id]) || null;

export const clearedOn = (p, ch, id) => (id === 'normal' ? !!(p.chapter.best[ch] && p.chapter.best[ch].cleared) : !!(difficultyRecord(p, ch, id) || {}).cleared);

/** The hardest difficulty chapter ch was cleared on, or null. */
export function highestCleared(p, ch) {
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) if (clearedOn(p, ch, DIFFICULTY_ORDER[i])) return DIFFICULTY_ORDER[i];
  return null;
}

/** Normal is open on every unlocked chapter; each harder tier needs a clear of the one below (campaign chapters only). */
export function difficultyUnlocked(p, ch, id) {
  const c = CHAPTERS[ch - 1], i = DIFFICULTY_ORDER.indexOf(id);
  if (!c || i < 0 || ch > p.chapter.unlocked) return false;
  return i === 0 || (!c.endless && clearedOn(p, ch, DIFFICULTY_ORDER[i - 1]));
}

/** The remembered choice for chapter ch, stepped down to the hardest tier that is still open. */
export function selectedDifficulty(p, ch) {
  let id = (p.diff && p.diff.sel[ch]) || 'normal';
  while (id !== 'normal' && !difficultyUnlocked(p, ch, id)) id = DIFFICULTY_ORDER[Math.max(0, DIFFICULTY_ORDER.indexOf(id) - 1)];
  return id;
}
export function selectDifficulty(p, ch, id) {
  if (!difficultyUnlocked(p, ch, id)) return false;
  p.diff.sel[ch] = id;
  return true;
}

/** Keeps best time, legion, kills, kill streak and the cleared flag per chapter per difficulty. Returns true on a new best. */
export function recordDifficulty(p, ch, id, result) {
  const all = p.diff.best[ch] || (p.diff.best[ch] = {});
  const prev = all[id] || { time: 0, legion: 0, kills: 0, streak: 0, cleared: false };
  const cleared = !!(prev.cleared || result.victory || (id === 'normal' && clearedOn(p, ch, 'normal'))); // Normal's flag lives in p.chapter.best
  all[id] = { time: Math.max(prev.time, result.time), legion: Math.max(prev.legion || 0, result.bestLegion || 0), kills: Math.max(prev.kills || 0, result.kills || 0),
    streak: Math.max(prev.streak || 0, result.bestStreak || 0), cleared };
  return result.time > prev.time || (!!result.victory && !prev.cleared);
}

/** A rarity from an odds table such as { epic: 0.4, rare: 0.6 }, rolled from the top down. */
export function rollHoard(odds, r = Math.random()) {
  for (let i = RARITIES.length - 1; i >= 0; i--) if ((r -= odds[RARITIES[i]] || 0) < 0) return RARITIES[i];
  return RARITIES.find((k) => odds[k]) || 'common'; // rounding slack lands on the lowest listed rarity
}

/** Saves from before difficulties: fill the block and seed Normal records from the chapter records. */
export function migrateDifficulty(out) {
  const d = out.diff = { sel: {}, best: {}, ...(out.diff || {}) };
  d.sel = { ...(d.sel || {}) }; d.best = { ...(d.best || {}) };
  for (const [ch, b] of Object.entries(out.chapter.best || {})) {
    if (!b || (d.best[ch] && d.best[ch].normal)) continue;
    d.best[ch] = { ...(d.best[ch] || {}), normal: { time: b.time || 0, legion: 0, kills: b.kills || 0, streak: 0, cleared: !!b.cleared } };
  }
  return out;
}

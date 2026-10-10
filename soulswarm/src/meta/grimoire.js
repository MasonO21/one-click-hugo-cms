// The Grimoire (GRIMOIRE in data.js; GDD §4.9): pages unlocked by account goals, one inscribed before a run. The run
// folds the inscribed page into its modifiers (data.js mergeMutators); this module keeps the profile side.
import { GRIMOIRE } from '../game/data.js';

/** Progress toward a page's unlock: { have, need } (a chapter clear counts 0 / 1). */
export function pageProgress(p, id) {
  const u = GRIMOIRE.pages[id].unlock;
  if (u.clear) return { have: p.chapter.unlocked > u.clear ? 1 : 0, need: 1 };
  return { have: Math.min(u.n, Math.max(0, +p.stats[u.stat] || 0)), need: u.n };
}

export const pageUnlocked = (p, id) => !!GRIMOIRE.pages[id] && (({ have, need }) => have >= need)(pageProgress(p, id));

export const unlockedPages = (p) => GRIMOIRE.order.filter((id) => pageUnlocked(p, id));

/** The page a run would carry: the inscribed one while it is unlocked, else none. */
export const activePage = (p) => (p.grimoire.selected && pageUnlocked(p, p.grimoire.selected) ? p.grimoire.selected : null);

/** Inscribe a page ('' clears it). False for an unknown or locked page. */
export function inscribe(p, id) {
  if (id && !pageUnlocked(p, id)) return false;
  p.grimoire.selected = id || '';
  return true;
}

/** Unlocked pages the player has not opened the Grimoire to see yet (the chip's dot). */
export const newPages = (p) => unlockedPages(p).filter((id) => !p.grimoire.seen.includes(id));

export function markPagesSeen(p) {
  const fresh = newPages(p);
  if (fresh.length) p.grimoire.seen.push(...fresh);
  return fresh.length;
}

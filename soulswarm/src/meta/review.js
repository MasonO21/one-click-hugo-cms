// The store's review prompt (Update 14): asked only at a high point, a first Normal clear of Chapter 3, 10, 20 or 30 or a
// full Boss Rush clear, at most REVIEW.max times and REVIEW.gapDays apart, never to a child (restricted mode). The
// store build's in-app review plugin (engine/platform.js setReviewBridge) shows the sheet; the stores cap it again, and
// the web build has none. p.flags.review = { n: asks so far, at: the last ask }.
import { REVIEW } from '../game/data.js';
import { now as clockNow } from './clock.js';
import { canAskReview, askReview } from '../engine/platform.js';

/** Is this run's end a moment to ask? (A pure check: no state changes.) */
export function reviewMoment(p, result, outcome) {
  const band = p.privacy && p.privacy.band;
  if (!outcome || !result || !result.victory || (band !== 'adult' && band !== 'teen')) return false; // never a child, nor before the age gate
  const R = p.flags.review || { n: 0, at: 0 };
  if (R.n >= REVIEW.max || clockNow() - R.at < REVIEW.gapDays * 864e5) return false;
  if (outcome.rush) return !!outcome.cleared;
  return !!outcome.firstClear && outcome.difficulty === 'normal' && REVIEW.chapters.includes(+result.chapter);
}

/** Asks after `delay` ms (once the results have shown) when the moment is right and the platform can. `ok()` is checked
 *  again then (not over a new run); only a real ask counts, and `onAsk` saves it. Returns whether one is on its way. */
let pending = false;
export function maybeAskReview(p, result, outcome, { delay = REVIEW.delayMs, ok = () => true, onAsk } = {}) {
  if (pending || !canAskReview() || !reviewMoment(p, result, outcome)) return false;
  pending = true;
  setTimeout(() => {
    pending = false;
    if (!ok() || !reviewMoment(p, result, outcome)) return;
    const R = p.flags.review || (p.flags.review = { n: 0, at: 0 });
    R.n++; R.at = clockNow();
    askReview();
    if (onAsk) onAsk();
  }, delay);
  return true;
}

// Native bridges (Capacitor) with safe web fallbacks.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();
let enabled = true;
export const setHapticsEnabled = (on) => { enabled = !!on; };

/** kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' */
export function haptic(kind = 'light') {
  if (!enabled) return;
  try {
    if (isNative) {
      if (kind === 'success' || kind === 'warning') Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning });
      else Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'heavy' ? 40 : kind === 'medium' ? 20 : kind === 'success' ? [15, 40, 25] : 8);
    }
  } catch (e) { /* not supported */ }
}

// Game Center / Play Games (Feats, meta/feats.js): the store build registers its plugin call with setFeatBridge(fn), and
// each reached tier is reported as `${family}_${tier}` (the console's achievement ids). The web build has no bridge.
let featBridge = null;
export const setFeatBridge = (fn) => { featBridge = typeof fn === 'function' ? fn : null; };
/** Returns whether a bridge took it (with none, the tier is reported again once one is registered). */
export function reportFeat(id) {
  if (!featBridge) return false;
  try { Promise.resolve(featBridge(id)).catch(() => {}); return true; } catch (e) { return false; } // offline or signed out: the next session reports again
}

// The store's own review prompt (meta/review.js decides when): the store build registers its in-app review plugin with
// setReviewBridge(fn). The stores cap how often the sheet really shows. The web build has none.
let reviewBridge = null;
export const setReviewBridge = (fn) => { reviewBridge = typeof fn === 'function' ? fn : null; };
export const canAskReview = () => !!reviewBridge;
export function askReview() {
  if (!reviewBridge) return false;
  try { Promise.resolve(reviewBridge()).catch(() => {}); return true; } catch (e) { return false; }
}

// Game Center / Play Games leaderboards: the store build registers setScoreBridge((board, value) => …). Boards:
// endless_time (seconds survived in the Endless Abyss, higher is better), rush_hollow / rush_fallen (a full Boss Rush
// clear in seconds, lower is better). The web build has none.
let scoreBridge = null;
export const setScoreBridge = (fn) => { scoreBridge = typeof fn === 'function' ? fn : null; };
export function submitScore(board, value) {
  if (!scoreBridge || !(value > 0)) return false;
  try { Promise.resolve(scoreBridge(board, Math.round(value))).catch(() => {}); return true; } catch (e) { return false; }
}

// Local notifications (Settings → Reminders, meta/reminders.js): the store build registers
// setNotifyBridge({ permit: () => Promise<boolean>, schedule: (list) => Promise, cancel: () => Promise }). The web build
// has none, and the setting is hidden.
let notifyBridge = null;
export const setNotifyBridge = (b) => { notifyBridge = b && typeof b.schedule === 'function' ? b : null; };
export const canNotify = () => !!notifyBridge;
export async function notifyPermit() {
  if (!notifyBridge) return false;
  try { return notifyBridge.permit ? !!(await notifyBridge.permit()) : true; } catch (e) { return false; }
}
export function notifySchedule(list) { if (notifyBridge) try { Promise.resolve(notifyBridge.schedule(list)).catch(() => {}); } catch (e) { /* not supported */ } }
export function notifyCancel() { if (notifyBridge && notifyBridge.cancel) try { Promise.resolve(notifyBridge.cancel()).catch(() => {}); } catch (e) { /* not supported */ } }

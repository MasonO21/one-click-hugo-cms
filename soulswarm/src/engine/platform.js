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
export function reportFeat(id) {
  if (!featBridge) return;
  try { Promise.resolve(featBridge(id)).catch(() => {}); } catch (e) { /* offline or signed out: the next session reports again */ }
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

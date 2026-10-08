/**
 * Which game-event toasts show now, which wait, and which lose their tap target (DOM-free, see tests/ui.toasts.test.ts).
 *
 * A toast can open a panel when tapped ("Your squad is back… Collect" opens Expeditions, an achievement opens the
 * Journal). Over an open sheet such a toast hangs just under the header — right over the sheet's own buttons (QA6: the
 * squad toast sat on the Daily gift's Claim button for 3 s, so a tap meant for Claim opened Expeditions). So while any
 * panel is open a tappable toast waits (up to OPEN_TOAST_KEEP_MS) and follows once the screen is free; plain toasts
 * still show, and they never catch a touch (CSS: only `.toast.tappable` takes pointer events).
 */
import type { ToastKind } from '../ctx';

/** A held toast that opens a panel is still worth showing this long after it was raised. */
export const OPEN_TOAST_KEEP_MS = 90000;
/** ...a plain one this long. */
export const TOAST_KEEP_MS = 12000;

export interface HeldToast {
  text: string;
  kind: ToastKind;
  icon?: string;
  /** Panel opened by tapping the toast. */
  open?: string;
  /** performance.now() when it was held. */
  at: number;
  /** Raised by a tier-up during the base reveal: shown once its card closes however long it was read. */
  keep?: boolean;
}

export interface ToastScreen {
  /** A modal (celebration, reward card, Welcome Back…) is showing or queued. */
  modal: boolean;
  /** The tier-up reveal is running (its card is on the way). */
  revealing: boolean;
  /** Any panel is open: sheet, drawer, inspector or modal. */
  anyOpen: boolean;
  isOpen(panel: string): boolean;
}

/**
 * How a toast that is due now is shown:
 * - 'tap': with its tap target (nothing is open);
 * - 'plain': without one — it has none, the panel it would open is already the one open, or it is a warning that
 *   must be read now (the player is mid-action);
 * - 'defer': hold it until the panels close.
 */
export function toastRoute(kind: ToastKind, open: string | undefined, s: Pick<ToastScreen, 'anyOpen' | 'isOpen'>): 'tap' | 'plain' | 'defer' {
  if (!open) return 'plain';
  if (!s.anyOpen) return 'tap';
  if (s.isOpen(open)) return 'plain';
  return kind === 'warning' || kind === 'danger' ? 'plain' : 'defer';
}

/**
 * Held toasts at a flush (a panel changed, or the UI's 4 Hz tick): the ones to show now (the latest three) and the ones
 * that keep waiting. Nothing moves while a modal or the tier reveal is up. Expired toasts go, and so does one whose
 * panel the player has opened meanwhile (they are looking at it); a tappable toast keeps waiting while other panels
 * are open.
 */
export function planFlush(held: readonly HeldToast[], now: number, s: ToastScreen): { show: HeldToast[]; keep: HeldToast[] } {
  if (!held.length || s.modal || s.revealing) return { show: [], keep: [...held] };
  const live = held.filter((d) => (d.keep || now - d.at < (d.open ? OPEN_TOAST_KEEP_MS : TOAST_KEEP_MS)) && !(d.open && s.isOpen(d.open)));
  const keep = live.filter((d) => d.open && s.anyOpen);
  const show = live.filter((d) => !keep.includes(d)).slice(-3);
  return { show, keep };
}

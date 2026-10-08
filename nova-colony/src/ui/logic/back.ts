/**
 * What "back" does (Android back button / gesture, and Escape): undo the most specific thing on screen first.
 * 'none' means the game is at rest, so the platform may send the app to the background.
 */
export type BackAction = 'panel' | 'build' | 'selection' | 'none';

export interface BackState {
  /** Any panel, sheet or modal is open (a modal that can't be dismissed still swallows the press). */
  panelOpen: boolean;
  /**
   * A modal is about to appear: one queued behind a modal that is still closing, or the tier-up card during the
   * base's reveal. The press is swallowed rather than sending the app away a moment before it shows.
   */
  modalPending?: boolean;
  /** Build mode (placing, walls, moving, demolish). */
  buildActive: boolean;
  /** A world object is selected or its tooltip is up. */
  hasSelection: boolean;
}

export function backAction(s: BackState): BackAction {
  if (s.panelOpen || s.modalPending) return 'panel';
  if (s.buildActive) return 'build';
  if (s.hasSelection) return 'selection';
  return 'none';
}

/** One open panel, in the order they were opened. */
export interface BackStackEntry {
  kind: 'sheet' | 'drawer' | 'side' | 'modal';
  dismissable: boolean;
  closing: boolean;
}

/**
 * Which open panel a back press closes (index into `stack`), or -1 for none. Modals sit on their own layer above
 * every sheet, drawer and side card, so the newest modal is on top whatever opened after it; one that can't be
 * dismissed (Welcome Back, a raid's chest) keeps the press instead of a sheet hidden under it closing unseen.
 * Without a modal: the newest dismissable panel.
 */
export function backTarget(stack: readonly BackStackEntry[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (!e.closing && e.kind === 'modal') return e.dismissable ? i : -1;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (!e.closing && e.dismissable) return i;
  }
  return -1;
}

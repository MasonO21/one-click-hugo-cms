/**
 * What "back" does (Android back button / gesture, and Escape): undo the most specific thing on screen first.
 * 'none' means the game is at rest, so the platform may send the app to the background.
 */
export type BackAction = 'panel' | 'build' | 'selection' | 'none';

export interface BackState {
  /** Any panel, sheet or modal is open (a modal that can't be dismissed still swallows the press). */
  panelOpen: boolean;
  /** Build mode (placing, walls, moving, demolish). */
  buildActive: boolean;
  /** A world object is selected or its tooltip is up. */
  hasSelection: boolean;
}

export function backAction(s: BackState): BackAction {
  if (s.panelOpen) return 'panel';
  if (s.buildActive) return 'build';
  if (s.hasSelection) return 'selection';
  return 'none';
}

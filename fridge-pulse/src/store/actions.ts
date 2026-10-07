import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { daysBetween, todayISO } from '../lib/dates';
import type { LogEntry } from '../lib/foodLog';
import type { PantryItem } from '../lib/types';
import { useInventory } from './inventory';
import { loggedMessage, removeFromLog } from './logActions';
import { useSnackbar } from './snackbar';

/** Used in its last three days and not yet past its date. */
export function wouldRescue(item: Pick<PantryItem, 'expiresOn'>, today: string = todayISO()): boolean {
  const spare = daysBetween(today, item.expiresOn);
  return spare >= 0 && spare <= 3;
}

/** What the message bar says after items are used up or thrown out. */
export function resolveMessage(items: Pick<PantryItem, 'name' | 'expiresOn'>[], status: 'used' | 'wasted', mealTitle?: string, today: string = todayISO()): string {
  const n = items.length;
  const first = items[0]?.name.trim() || 'Item';
  if (status === 'wasted') return n === 1 ? `${first} thrown out` : `${n} items thrown out`;
  const rescued = items.filter((i) => wouldRescue(i, today)).length;
  if (mealTitle) return `${n} ${n === 1 ? 'item' : 'items'} used in ${mealTitle}${rescued > 0 ? `, ${rescued} rescued` : ''}`;
  if (n === 1) return rescued ? `Nice save! ${first} rescued` : `${first} marked as used`;
  return rescued > 0 ? `${n} items used, ${rescued} rescued` : `${n} items used`;
}

/**
 * Marks items as used or thrown out, with haptics and a message bar that offers Undo. Used by the
 * row check mark, swipes, item detail and "I made this" on a meal.
 */
/** Counts waste resolves, so an Undo can tell whether anything was thrown out after it. */
let wasteActions = 0;

export function resolveItems(items: PantryItem[], status: 'used' | 'wasted', opts: { mealTitle?: string; logged?: LogEntry } = {}): void {
  const inventory = useInventory.getState();
  const lastWastedBefore = inventory.lifetime.lastWastedOn;
  // The caller's copies can be stale (a dialog was open while a housemate's changes arrived): only
  // what this call actually changed goes into the message and the Undo.
  const byId = new Map(inventory.items.map((i) => [i.id, i]));
  const live = items.map((i) => byId.get(i.id)).filter((i): i is PantryItem => !!i && i.status === 'active' && inventory.resolveItem(i.id, status));
  if (live.length === 0) return;
  const action = status === 'wasted' ? ++wasteActions : wasteActions;

  const rescued = status === 'used' && live.some((i) => wouldRescue(i));
  if (Platform.OS !== 'web') {
    const kind = status === 'used' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
    Haptics.notificationAsync(kind).catch(() => {});
  }
  // "I made this" also logs a serving: the same message bar says so, and its Undo takes both back.
  const message = `${resolveMessage(live, status, opts.mealTitle)}${opts.logged ? `. ${loggedMessage(opts.logged)}` : ''}`;
  useSnackbar.getState().show({
    message,
    tone: status === 'wasted' ? 'waste' : rescued ? 'rescue' : 'plain',
    action: {
      label: 'Undo',
      onPress: () => {
        // The last-waste date goes back to what it was, unless something was thrown out after this.
        const lastWasted = status === 'wasted' && action === wasteActions ? lastWastedBefore : undefined;
        useInventory.getState().undoResolve(
          live.map((i) => i.id),
          status,
          lastWasted,
        );
        if (opts.logged) removeFromLog(opts.logged.id);
      },
    },
  });
}

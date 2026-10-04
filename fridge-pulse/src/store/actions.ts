import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Platform } from 'react-native';
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
export function resolveItems(items: PantryItem[], status: 'used' | 'wasted', opts: { mealTitle?: string; logged?: LogEntry } = {}): void {
  const live = items.filter((i) => i.status === 'active');
  if (live.length === 0) return;
  const inventory = useInventory.getState();
  for (const item of live) inventory.resolveItem(item.id, status);

  const rescued = status === 'used' && live.some((i) => wouldRescue(i));
  if (Platform.OS !== 'web') {
    const kind = status === 'used' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
    Haptics.notificationAsync(kind).catch(() => {});
  }
  // "I made this" also logs a serving: the same message bar says so, and its Undo takes both back.
  const message = `${resolveMessage(live, status, opts.mealTitle)}${opts.logged ? `. ${loggedMessage(opts.logged)}` : ''}`;
  AccessibilityInfo.announceForAccessibility?.(message);
  useSnackbar.getState().show({
    message,
    tone: status === 'wasted' ? 'waste' : rescued ? 'rescue' : 'plain',
    action: {
      label: 'Undo',
      onPress: () => {
        const store = useInventory.getState();
        for (const item of live) store.reactivateItem(item.id);
        if (opts.logged) removeFromLog(opts.logged.id);
      },
    },
  });
}

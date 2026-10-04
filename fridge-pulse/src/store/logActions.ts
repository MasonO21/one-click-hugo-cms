import { AccessibilityInfo } from 'react-native';
import { entryTotals, type LogEntry, type NewEntry } from '../lib/foodLog';
import { useFoodLog } from './foodLog';
import { useHealth } from './health';
import { useSnackbar } from './snackbar';

/** Writes an entry to the health store in the background and remembers the sample ids on it. */
function sendToHealth(entry: LogEntry): void {
  const totals = entryTotals(entry);
  void useHealth
    .getState()
    .saveFood({ title: entry.title, at: new Date(entry.at), ...totals })
    .then((ids) => {
      if (ids.length === 0) return;
      // The entry may have been removed (Undo) while the write was in flight.
      if (useFoodLog.getState().entries.some((e) => e.id === entry.id)) useFoodLog.getState().update(entry.id, { healthIds: ids });
      else void useHealth.getState().removeFood(ids);
    });
}

/** Adds to the food log (and the health store) without a message; returns the new entry. */
export function addToLog(entry: NewEntry): LogEntry {
  const id = useFoodLog.getState().add(entry);
  const saved = useFoodLog.getState().entries.find((e) => e.id === id)!;
  sendToHealth(saved);
  return saved;
}

/** Removes an entry, and its health samples. */
export function removeFromLog(id: string): LogEntry | undefined {
  const gone = useFoodLog.getState().remove(id);
  if (gone?.healthIds?.length) void useHealth.getState().removeFood(gone.healthIds);
  return gone;
}

/** "Logged 1 medium banana (105 kcal)". */
export function loggedMessage(entry: Pick<LogEntry, 'title' | 'perServing' | 'servings'>): string {
  return `Logged ${entry.title} (${entryTotals(entry).kcal} kcal)`;
}

/** Logs food from a button press, with a message bar that offers Undo. */
export function logWithUndo(entry: NewEntry): LogEntry {
  const saved = addToLog(entry);
  const message = loggedMessage(saved);
  AccessibilityInfo.announceForAccessibility?.(message);
  useSnackbar.getState().show({ message, tone: 'plain', action: { label: 'Undo', onPress: () => void removeFromLog(saved.id) } });
  return saved;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Changes servings at once; the health store gets the new figures once the taps stop. */
export function changeServings(id: string, servings: number): void {
  const before = useFoodLog.getState().entries.find((e) => e.id === id);
  if (!before) return;
  useFoodLog.getState().setServings(id, servings);
  if (useFoodLog.getState().entries.find((e) => e.id === id)?.servings === before.servings) return;
  clearTimeout(pending.get(id));
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      const entry = useFoodLog.getState().entries.find((e) => e.id === id);
      if (!entry) return;
      if (entry.healthIds?.length) {
        void useHealth.getState().removeFood(entry.healthIds);
        useFoodLog.getState().update(id, { healthIds: [] });
      }
      sendToHealth(entry);
    }, 800),
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { PantryItem } from '../lib/types';
import { useInventory } from '../store/inventory';
import { radius, useTheme } from '../theme';
import { Text } from './Text';

const VISIBLE_MS = 5000;

/**
 * Marks an item as used with a short-lived "Undo" snackbar, so an accidental tap on the
 * checkmark is recoverable. Render the returned node at the bottom of the screen.
 */
export function useMarkUsed(): [(item: PantryItem) => void, ReactNode] {
  const { c } = useTheme();
  const [last, setLast] = useState<PantryItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const mark = useCallback((item: PantryItem) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    useInventory.getState().resolveItem(item.id, 'used');
    setLast(item);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLast(null), VISIBLE_MS);
  }, []);

  const node = last ? (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: c.ink }]}>
        <Text variant="body" color={c.bg} style={{ flex: 1 }} numberOfLines={1}>
          {last.name} marked as used
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={10}
          onPress={() => {
            useInventory.getState().reactivateItem(last.id);
            setLast(null);
          }}
        >
          <Text variant="bodyStrong" color={c.primary}>
            Undo
          </Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  return [mark, node];
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%', maxWidth: 560, paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.md },
});

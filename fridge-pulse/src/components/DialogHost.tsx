import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useDialog } from '../store/dialog';
import { radius, useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

/** Renders the in-app dialog used on web. Mount once near the root. */
export function DialogHost() {
  const { c } = useTheme();
  const current = useDialog((s) => s.current);
  const answer = useDialog((s) => s.answer);
  if (!current) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => answer(false)}>
      <View style={styles.backdrop}>
        {/* Tapping outside behaves like cancel. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => answer(false)} accessibilityLabel="Dismiss" />
        <View
          testID="dialog"
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <Text variant="heading">{current.title}</Text>
          <Text muted>{current.message}</Text>
          <View style={styles.actions}>
            {current.cancelLabel ? (
              <Button testID="dialog-cancel" label={current.cancelLabel} variant="secondary" size="sm" onPress={() => answer(false)} />
            ) : null}
            <Button
              testID="dialog-confirm"
              label={current.confirmLabel}
              variant={current.destructive ? 'danger' : 'primary'}
              size="sm"
              onPress={() => answer(true)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { width: '100%', maxWidth: 360, borderRadius: radius.lg, borderWidth: 1, padding: 20, gap: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});

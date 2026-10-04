import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { goBack } from '../lib/nav';
import { useTheme } from '../theme';
import { Text } from './Text';

/** Title and a close button for screens that slide up over the tabs. */
export function ModalTop({ title, subtitle, onClose = goBack }: { title: string; subtitle?: string; onClose?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.top}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeHit}>
        <View style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="close" size={20} color={c.ink} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -4, marginTop: -4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

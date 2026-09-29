import { StyleSheet, View } from 'react-native';
import type { PulseSummary, Urgency } from '../lib/expiry';
import { useTheme } from '../theme';

const ORDER: Urgency[] = ['expired', 'today', 'soon', 'week', 'ok'];

/** Segmented bar showing how the inventory splits across urgency levels. */
export function PulseBar({ summary }: { summary: PulseSummary }) {
  const { c } = useTheme();
  if (summary.total === 0) return <View style={[styles.bar, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />;
  return (
    <View style={styles.bar} accessibilityRole="progressbar" accessibilityLabel="Expiry breakdown">
      {ORDER.filter((u) => summary.counts[u] > 0).map((u) => (
        <View key={u} style={{ flex: summary.counts[u], backgroundColor: c.urgency[u].solid }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
});

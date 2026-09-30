import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { PulseSummary, Urgency } from '../lib/expiry';
import { useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';

const ORDER: Urgency[] = ['expired', 'today', 'soon', 'week', 'ok'];

/** Segmented bar showing how the inventory splits across urgency levels. Grows in from the left. */
export function PulseBar({ summary }: { summary: PulseSummary }) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const grow = useAnimatedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) {
      grow.setValue(1);
      return;
    }
    const a = Animated.timing(grow, { toValue: 1, duration: 700, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [grow, still]);

  if (summary.total === 0) return <View style={[styles.bar, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />;
  const parts = ORDER.filter((u) => summary.counts[u] > 0);
  const label = parts.map((u) => `${summary.counts[u]} ${u === 'ok' ? 'fresh' : u === 'soon' ? 'due in 1 to 3 days' : u === 'week' ? 'due this week' : u === 'today' ? 'due today' : 'expired'}`).join(', ');
  return (
    <View style={[styles.bar, { backgroundColor: 'rgba(255,255,255,0.12)' }]} accessibilityRole="progressbar" accessibilityLabel={`Freshness: ${label}`}>
      <Animated.View style={[styles.fill, { transform: [{ scaleX: grow }] }]}>
        {parts.map((u) => (
          <View key={u} style={{ flex: summary.counts[u], backgroundColor: c.urgency[u].solid }} />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { flex: 1, flexDirection: 'row', gap: 2, transformOrigin: 'left' },
});

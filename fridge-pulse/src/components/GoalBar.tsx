import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';
import { Text } from './Text';

const fmt = (n: number) => Math.round(n).toLocaleString();

/**
 * Progress towards a daily target: "62 of 130 g protein" (label "g protein", unit "g"), with a bar that fills in. Going over a
 * calorie target is shown plainly, not as a failure.
 */
export function GoalBar({ label, value, target, unit, color, testID }: { label: string; value: number; target: number; unit: string; color: string; testID?: string }) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const share = target > 0 ? Math.min(1, value / target) : 0;
  const fill = useAnimatedValue(still ? share : 0);
  useEffect(() => {
    if (still) {
      fill.setValue(share);
      return;
    }
    const a = Animated.timing(fill, { toValue: share, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [fill, share, still]);
  const left = target - value;
  return (
    <View style={{ gap: 6 }} testID={testID} accessible accessibilityLabel={`${fmt(value)} of ${fmt(target)} ${label}`}>
      <View style={styles.head}>
        <Text variant="bodyStrong">
          {fmt(value)}
          <Text muted>{` of ${fmt(target)} ${label}`}</Text>
        </Text>
        <Text variant="caption" muted>
          {left > 0 ? `${fmt(left)} ${unit} to go` : 'Target reached'}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color, transform: [{ scaleX: fill }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left' },
});

import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { WeeklyScore } from '../lib/weekly';
import { radius, useTheme } from '../theme';
import { Card } from './Card';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';
import { Text } from './Text';

/** One part of the score: a label, the count behind it, and a bar that fills in. */
function PartBar({ label, detail, ratio, hint, color, index }: { label: string; detail: string; ratio: number | null; hint: string | null; color: string; index: number }) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const fill = useAnimatedValue(still ? (ratio ?? 0) : 0);
  useEffect(() => {
    if (still) {
      fill.setValue(ratio ?? 0);
      return;
    }
    const a = Animated.timing(fill, { toValue: ratio ?? 0, duration: 650, delay: 150 + index * 120, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [fill, ratio, still, index]);
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${ratio === null ? hint ?? detail : detail}`}>
      <View style={styles.partHead}>
        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
          {label}
        </Text>
        <Text variant="caption" muted>
          {ratio === null ? '' : detail}
        </Text>
      </View>
      {ratio === null ? (
        <Text variant="caption" faint>
          {hint}
        </Text>
      ) : (
        <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
          <Animated.View style={[styles.fill, { backgroundColor: color, transform: [{ scaleX: fill }] }]} />
        </View>
      )}
    </View>
  );
}

/** "This week": a score out of 100 from food rescued, protein days and active days. */
export function WeeklyScoreCard({ week }: { week: WeeklyScore }) {
  const { c } = useTheme();
  const colors = { food: c.urgency.ok.solid, protein: c.blue, active: c.primary };
  return (
    <Card style={{ gap: 14 }} testID="weekly-score">
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" muted>
            This week
          </Text>
          <Text variant="caption" muted style={{ fontSize: 14 }}>
            {week.message}
          </Text>
        </View>
        {week.score !== null ? (
          <View style={[styles.badge, { borderColor: c.primaryFill }]} accessible accessibilityLabel={`Weekly score ${week.score} out of 100`}>
            {/* Inside a fixed ring: scales a little with large text, then stops before it spills out (the ring is read as a whole). */}
            <Text variant="title" color={c.primary} testID="weekly-score-value" maxFontSizeMultiplier={1.2}>
              {week.score}
            </Text>
            <Text variant="caption" muted style={{ marginTop: -4 }} maxFontSizeMultiplier={1.2}>
              of 100
            </Text>
          </View>
        ) : null}
      </View>
      {week.parts.map((p, i) => (
        <PartBar key={p.key} label={p.label} detail={p.detail} ratio={p.ratio} hint={p.hint} color={colors[p.key]} index={i} />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  partHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left' },
});

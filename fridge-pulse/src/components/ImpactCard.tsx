import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { Impact } from '../lib/impact';
import { formatMoney, type MoneySummary } from '../lib/money';
import { radius, useTheme } from '../theme';
import { Card } from './Card';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';
import { Emoji, Text } from './Text';

const BAR_HEIGHT = 56;

/** One day's column: food used (lime) stacked on food thrown out (magenta). Rises into place. */
function DayColumn({ used, wasted, max, label, isToday, index }: { used: number; wasted: number; max: number; label: string; isToday: boolean; index: number }) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const grow = useAnimatedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) {
      grow.setValue(1);
      return;
    }
    const a = Animated.timing(grow, { toValue: 1, duration: 520, delay: 200 + index * 60, easing: Easing.out(Easing.back(1.4)), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [grow, index, still]);
  const total = used + wasted;
  const h = max === 0 ? 0 : Math.max(total > 0 ? 6 : 0, Math.round((total / max) * BAR_HEIGHT));
  const usedH = total === 0 ? 0 : Math.round((used / total) * h);
  return (
    <View style={styles.col}>
      <View style={[styles.track, { height: BAR_HEIGHT }]}>
        <Animated.View style={{ height: h, width: '100%', borderRadius: 6, overflow: 'hidden', transform: [{ scaleY: grow }], transformOrigin: 'bottom' }}>
          <View style={{ flex: h - usedH, backgroundColor: c.urgency.expired.solid }} />
          <View style={{ flex: usedH, backgroundColor: c.urgency.ok.solid }} />
        </Animated.View>
      </View>
      <Text variant="caption" muted style={isToday ? { fontWeight: '800', color: c.ink } : null}>
        {label}
      </Text>
    </View>
  );
}

/**
 * "Your impact": food rescued this month, the no-waste streak, the last seven days, and progress
 * to the next rescue milestone. Counts only; nothing here is estimated.
 */
export function ImpactCard({ impact, money }: { impact: Impact; money?: MoneySummary | null }) {
  const { c } = useTheme();
  const max = Math.max(1, ...impact.week.map((d) => d.used + d.wasted));
  const still = useReducedMotion();
  const progress = useAnimatedValue(still ? 1 : 0);
  const target = impact.nextMilestone ? impact.lifetimeRescued / impact.nextMilestone : 1;
  useEffect(() => {
    if (still) {
      progress.setValue(1);
      return;
    }
    const a = Animated.timing(progress, { toValue: 1, duration: 900, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [progress, target, still]);

  const weekText = impact.week.map((d) => `${d.label}: ${d.used} used${d.wasted ? `, ${d.wasted} thrown out` : ''}`).join('; ');
  const toGo = impact.nextMilestone ? impact.nextMilestone - impact.lifetimeRescued : 0;

  return (
    <Card style={{ gap: 14 }} testID="impact-card">
      <View style={styles.head}>
        <Text variant="label" muted>
          Your impact
        </Text>
        {impact.streakDays >= 1 ? (
          <View style={[styles.streak, { backgroundColor: c.urgency.today.tint }]} testID="streak">
            <Emoji size={14}>🔥</Emoji>
            <Text variant="caption" color={c.urgency.today.fg} style={{ fontWeight: '800' }}>
              {impact.streakDays}-day no-waste streak
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.bigRow}>
            <Text variant="display" color={c.primary} testID="rescued-count">
              {impact.rescuedRecently}
            </Text>
            <Emoji size={28}>🌱</Emoji>
          </View>
          <Text variant="bodyStrong">{impact.rescuedRecently === 1 ? 'item rescued' : 'items rescued'} in 30 days</Text>
          {/* Doubles as the chart's legend: each count sits beside its colour. */}
          <View style={styles.key}>
            <View style={[styles.keyDot, { backgroundColor: c.urgency.ok.solid }]} />
            <Text variant="caption" muted>
              {impact.usedRecently} used
            </Text>
            <View style={[styles.keyDot, { backgroundColor: c.urgency.expired.solid, marginLeft: 6 }]} />
            <Text variant="caption" muted>
              {impact.wastedRecently} thrown out
            </Text>
          </View>
        </View>
        <View style={styles.week} accessible accessibilityLabel={`Last 7 days. ${weekText}`}>
          {impact.week.map((d, i) => (
            <DayColumn key={d.day} used={d.used} wasted={d.wasted} max={max} label={d.label} isToday={i === impact.week.length - 1} index={i} />
          ))}
        </View>
      </View>

      {money ? (
        <View style={[styles.money, { borderColor: c.border }]} testID="money-month">
          <View style={styles.moneyCol}>
            <Text variant="heading" color={c.urgency.ok.fg}>
              {formatMoney(money.rescued, money.currency)}
            </Text>
            <Text variant="caption" muted>
              rescued this month
            </Text>
          </View>
          <View style={styles.moneyCol}>
            <Text variant="heading" color={c.urgency.expired.fg}>
              {formatMoney(money.wasted, money.currency)}
            </Text>
            <Text variant="caption" muted>
              thrown out this month
            </Text>
          </View>
        </View>
      ) : null}
      {money ? (
        <Text variant="caption" faint style={{ marginTop: -8 }}>
          {`From receipt prices on ${money.priced} ${money.priced === 1 ? 'item' : 'items'}.`}
        </Text>
      ) : null}

      {impact.nextMilestone ? (
        <View style={{ gap: 6 }}>
          <View style={[styles.meter, { backgroundColor: c.surfaceAlt }]}>
            <Animated.View
              style={[
                styles.meterFill,
                { backgroundColor: c.urgency.ok.solid, width: `${Math.round(target * 100)}%`, transform: [{ scaleX: progress }] },
              ]}
            />
          </View>
          <Text variant="caption" muted>
            {toGo} more {toGo === 1 ? 'rescue' : 'rescues'} to reach {impact.nextMilestone}
            {impact.lastMilestone ? ` · ${impact.lifetimeRescued} so far` : ''}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  week: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  col: { alignItems: 'center', gap: 4, width: 16 },
  track: { width: '100%', justifyContent: 'flex-end' },
  meter: { height: 8, borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4, transformOrigin: 'left' },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  money: { flexDirection: 'row', gap: 12, borderTopWidth: 1, paddingTop: 12 },
  moneyCol: { flex: 1, gap: 2 },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { dayTotals } from '../lib/foodLog';
import { targetsFor } from '../lib/goals';
import { useFoodLog } from '../store/foodLog';
import { getHealth, todayActivity, useHealth } from '../store/health';
import { useSettings } from '../store/settings';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { GoalBar } from './GoalBar';
import { PressableScale } from './motion';
import { Text } from './Text';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Today's eating against the person's targets, and their steps when a health app is connected. */
export function TodayCard({ today }: { today: string }) {
  const { c } = useTheme();
  const entries = useFoodLog((s) => s.entries);
  const profile = useSettings((s) => s.profile);
  const connected = useHealth((s) => s.connected);
  const days = useHealth((s) => s.days);
  const targets = targetsFor(profile);
  const totals = dayTotals(entries, today);
  const activity = connected ? todayActivity(days, today) : null;
  const health = getHealth();

  return (
    <Card style={{ gap: 12 }} testID="today-card">
      {/* Buttons cannot sit inside buttons on the web, so the link and the summary are pressed separately. */}
      <PressableScale
        accessibilityRole="button"
        // The label replaces what the card shows, so it carries the day's figures too.
        accessibilityLabel={`Today's food log: ${
          targets
            ? `${fmt(totals.protein)} of ${fmt(targets.protein)} g protein${targets.kcal !== null ? `, ${fmt(totals.kcal)} of ${fmt(targets.kcal)} kcal` : ''}`
            : totals.entries > 0
              ? `${fmt(totals.kcal)} kcal, ${fmt(totals.protein)} g protein so far`
              : 'nothing logged yet'
        }`}
        accessibilityHint="Opens your food log"
        testID="today-open-log"
        onPress={() => router.push('/log')}
        style={{ gap: 12 }}
      >
        <View style={styles.head}>
          <Text variant="label" color={c.primary}>
            Today
          </Text>
          <View style={styles.link}>
            <Text variant="bodyStrong" color={c.primary} style={{ fontSize: 14 }}>
              Food log
            </Text>
            <Ionicons name="arrow-forward" size={15} color={c.primary} />
          </View>
        </View>
        {targets ? (
          <View style={{ gap: 12 }}>
            <GoalBar testID="today-protein" label="g protein" unit="g" value={totals.protein} target={targets.protein} color={c.blue} />
            {targets.kcal !== null ? <GoalBar label="kcal" unit="kcal" value={totals.kcal} target={targets.kcal} color={c.urgency.soon.solid} /> : null}
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <Text variant="bodyStrong">{totals.entries > 0 ? `${fmt(totals.kcal)} kcal · ${fmt(totals.protein)} g protein so far` : 'Track what you eat, without the typing'}</Text>
            <Text variant="caption" muted style={{ fontSize: 14 }}>
              Set your protein goal from your weight, and meals you cook log themselves.
            </Text>
          </View>
        )}
      </PressableScale>
      {activity ? (
        <View style={styles.activity} testID="today-steps">
          <Ionicons name="walk-outline" size={18} color={c.inkMuted} />
          <Text variant="caption" muted style={{ fontSize: 14 }}>
            {`${fmt(activity.steps)} steps · ${fmt(activity.activeKcal)} active kcal`}
          </Text>
        </View>
      ) : !connected && health.kind !== 'none' ? (
        <Button
          testID="connect-health"
          label={`Connect ${health.name === 'Sample data' ? 'a health app' : health.name}`}
          icon="heart-outline"
          variant="secondary"
          size="sm"
          onPress={() => void useHealth.getState().connect()}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

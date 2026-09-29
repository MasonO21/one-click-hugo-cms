import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import { ItemRow } from '../../components/ItemRow';
import { Logo } from '../../components/Logo';
import { PulseBar } from '../../components/PulseBar';
import { Screen } from '../../components/Screen';
import { Emoji, Text } from '../../components/Text';
import { useMarkUsed } from '../../components/Undo';
import { addDays, todayISO } from '../../lib/dates';
import { active, sortByExpiry, summarize, wasteStats, type Urgency } from '../../lib/expiry';
import { localSuggestions } from '../../lib/meals';
import { useInventory } from '../../store/inventory';
import { useSettings } from '../../store/settings';
import { radius, useTheme } from '../../theme';

const LEGEND: { key: Urgency; label: string }[] = [
  { key: 'expired', label: 'Expired' },
  { key: 'today', label: 'Today' },
  { key: 'soon', label: '1-3 days' },
  { key: 'week', label: 'This week' },
  { key: 'ok', label: 'Fresh' },
];

export default function Pulse() {
  const { c } = useTheme();
  const items = useInventory((s) => s.items);
  const diet = useSettings((s) => s.diet);
  const servings = useSettings((s) => s.servings);
  const [markUsed, undo] = useMarkUsed();

  const now = new Date();
  const live = active(items);
  const summary = summarize(items, now);
  const attention = summary.counts.expired + summary.counts.today + summary.counts.soon;
  const upNext = sortByExpiry(live).slice(0, 5);
  const idea = localSuggestions(items, { diet, servings }, now, 1)[0];
  const stats = wasteStats(items, addDays(todayISO(now), -30));
  const today = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const headline =
    summary.total === 0
      ? { big: 'Nothing tracked yet', sub: 'Scan your fridge to get started.' }
      : attention > 0
        ? { big: `${attention} ${attention === 1 ? 'item needs' : 'items need'} using`, sub: `${summary.total} items tracked` }
        : { big: 'All fresh', sub: `${summary.total} items tracked, nothing expiring in the next 3 days` };

  return (
    <>
      <Screen>
        <Header title="Pulse" subtitle={today} right={<Logo size={40} />} />

        <View style={[styles.hero, { backgroundColor: c.hero }]}>
          <Text testID="hero-headline" variant="title" color={c.onHero}>
            {headline.big}
          </Text>
          <Text color="rgba(255,255,255,0.75)" style={{ marginTop: -6 }}>
            {headline.sub}
          </Text>
          <PulseBar summary={summary} />
          {summary.total > 0 ? (
            <View style={styles.legend}>
              {LEGEND.filter((l) => summary.counts[l.key] > 0).map((l) => (
                <View key={l.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: c.urgency[l.key].solid }]} />
                  <Text variant="caption" color="rgba(255,255,255,0.9)">
                    {summary.counts[l.key]} {l.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Button testID="scan-cta" label="Scan your fridge" icon="camera" onPress={() => router.push('/scan')} />

        {live.length === 0 ? (
          <EmptyState
            emoji="🧺"
            title="Your fridge is a blank slate"
            message="Take a photo of a shelf and Fridge Pulse will list what is there and when it needs eating."
          />
        ) : (
          <>
            <View style={styles.sectionHead}>
              <Text variant="heading">Use these first</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/inventory')} hitSlop={8}>
                <Text variant="bodyStrong" color={c.primary}>
                  See all
                </Text>
              </Pressable>
            </View>
            <View style={{ gap: 10 }}>
              {upNext.map((item) => (
                <ItemRow key={item.id} item={item} now={now} onPress={() => router.push(`/item/${item.id}`)} onUsed={() => markUsed(item)} />
              ))}
            </View>

            {idea ? (
              <Pressable accessibilityRole="button" testID="meal-teaser" onPress={() => router.push('/meals')}>
                <Card style={{ gap: 6, backgroundColor: c.primaryTint, borderColor: c.primaryTint }}>
                  <Text variant="label" color={c.primary}>
                    Cook this tonight
                  </Text>
                  <Text variant="heading">{idea.title}</Text>
                  <Text muted numberOfLines={2}>
                    Uses {idea.uses.slice(0, 3).join(', ')}
                    {idea.uses.length > 3 ? ` +${idea.uses.length - 3} more` : ''}
                  </Text>
                  <View style={styles.more}>
                    <Text variant="bodyStrong" color={c.primary}>
                      More meal ideas
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={c.primary} />
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {stats.used + stats.wasted > 0 ? (
              <Card style={styles.stats}>
                <Emoji size={30}>🌱</Emoji>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">
                    {stats.rescued} {stats.rescued === 1 ? 'item' : 'items'} rescued in the last 30 days
                  </Text>
                  <Text variant="caption" muted>
                    {stats.used} used, {stats.wasted} thrown out
                  </Text>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </Screen>
      {undo}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: 20, gap: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import { ImpactCard } from '../../components/ImpactCard';
import { ItemRow } from '../../components/ItemRow';
import { Logo } from '../../components/Logo';
import { FadeIn, PressableScale, stagger } from '../../components/motion';
import { PulseBar } from '../../components/PulseBar';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useToday } from '../../hooks/useToday';
import { isDemoMode } from '../../lib/api';
import { active, sortByExpiry, summarize, type Urgency } from '../../lib/expiry';
import { computeImpact } from '../../lib/impact';
import { localSuggestions, suggestionKey } from '../../lib/meals';
import { resolveItems } from '../../store/actions';
import { useInventory } from '../../store/inventory';
import { useMealsCache } from '../../store/mealsCache';
import { useScanDraft } from '../../store/scanDraft';
import { useSettings } from '../../store/settings';
import { radius, useTheme } from '../../theme';

const LEGEND: { key: Urgency; label: string }[] = [
  { key: 'expired', label: 'expired' },
  { key: 'today', label: 'due today' },
  { key: 'soon', label: 'due in 1-3 days' },
  { key: 'week', label: 'this week' },
  { key: 'ok', label: 'fresh' },
];

const items_ = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

export default function Pulse() {
  const { c } = useTheme();
  const items = useInventory((s) => s.items);
  const lifetime = useInventory((s) => s.lifetime);
  const diet = useSettings((s) => s.diet);
  const servings = useSettings((s) => s.servings);
  const aiConsent = useSettings((s) => s.aiConsent);
  const cache = useMealsCache();
  // Re-renders at midnight and on return to the app, so "today" never goes stale.
  const today = useToday();

  const now = useMemo(() => new Date(), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = active(items);
  const summary = summarize(items, now);
  const dueSoon = summary.counts.today + summary.counts.soon;
  const expired = summary.counts.expired;
  const upNext = sortByExpiry(live).slice(0, 5);
  const prefs = { diet, servings };
  // Prefer the AI's idea when it was made for exactly this fridge; otherwise a built-in one.
  const aiFresh = (isDemoMode || aiConsent) && cache.key === suggestionKey(items, prefs, now) && cache.meals.length > 0;
  const idea = aiFresh ? cache.meals[0] : localSuggestions(items, prefs, now, 1)[0];
  const impact = useMemo(() => computeImpact(items, lifetime, now), [items, lifetime, now]);
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const headline =
    summary.total === 0
      ? { big: 'Nothing tracked yet', sub: 'Scan your fridge to get started.' }
      : dueSoon > 0
        ? {
            big: `${items_(dueSoon)} ${dueSoon === 1 ? 'needs' : 'need'} using`,
            sub: expired > 0 ? `${expired} past ${expired === 1 ? 'its' : 'their'} date · ${items_(summary.total)} tracked` : `${items_(summary.total)} tracked`,
          }
        : expired > 0
          ? { big: `${items_(expired)} past ${expired === 1 ? 'its' : 'their'} date`, sub: 'Check them over and clear them out.' }
          : { big: 'All fresh', sub: `${items_(summary.total)} tracked, nothing due in the next 3 days` };

  return (
    <Screen>
      <Header title="Pulse" subtitle={dateLine} right={<Logo size={40} beat={summary.total === 0 ? undefined : dueSoon + expired > 0 ? 'quick' : 'calm'} />} />

      <FadeIn>
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
      </FadeIn>

      <FadeIn delay={80}>
        <Button testID="scan-cta" label="Scan your fridge" icon="camera" onPress={() => router.push('/scan')} />
      </FadeIn>

      {live.length === 0 ? (
        <FadeIn delay={140} style={{ gap: 8 }}>
          <EmptyState
            emoji="🧺"
            title="Your fridge is a blank slate"
            message="Take a photo of a shelf and Fridge Pulse will list what is there and when it needs eating."
          />
          <Button
            testID="add-by-hand"
            label="Add items by hand"
            variant="ghost"
            onPress={() => {
              useScanDraft.getState().start('fridge', [], null, 'manual');
              router.push('/review');
            }}
          />
        </FadeIn>
      ) : (
        <>
          <View style={styles.sectionHead}>
            <Text variant="heading">Use these first</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/inventory')} style={styles.seeAll}>
              <Text variant="bodyStrong" color={c.primary}>
                See all
              </Text>
            </Pressable>
          </View>
          <View style={{ gap: 10 }}>
            {upNext.map((item, i) => (
              <FadeIn key={item.id} delay={stagger(i)}>
                <ItemRow item={item} now={now} onPress={() => router.push(`/item/${item.id}`)} onResolve={(outcome) => resolveItems([item], outcome)} />
              </FadeIn>
            ))}
          </View>
          {lifetime.used + lifetime.wasted < 3 ? (
            <Text variant="caption" faint style={{ textAlign: 'center', marginTop: -4 }}>
              Swipe right when used, left if thrown out
            </Text>
          ) : null}

          {idea ? (
            <FadeIn delay={200}>
              <PressableScale accessibilityRole="button" testID="meal-teaser" onPress={() => router.push('/meals')}>
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
              </PressableScale>
            </FadeIn>
          ) : null}

          {lifetime.used + lifetime.wasted > 0 ? (
            <FadeIn delay={260}>
              <ImpactCard impact={impact} />
            </FadeIn>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: 20, gap: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  seeAll: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});

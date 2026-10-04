import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getProvider, useBilling } from '../../store/billing';
import { AiConsentModal } from '../../components/AiConsentModal';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import { MealCard } from '../../components/MealCard';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { FadeIn, stagger } from '../../components/motion';
import { useToday } from '../../hooks/useToday';
import { confirm } from '../../lib/dialogs';
import { resolveItems } from '../../store/actions';
import { useBurst } from '../../store/burst';
import { fetchMeals, friendlyError, isDemoMode } from '../../lib/api';
import { SCREENSHOT_MODE } from '../../lib/config';
import { filterForDiet, localSuggestions, matchTracked, plausibleMeal, rankMeals, suggestible, suggestionKey, uniqueUses } from '../../lib/meals';
import type { Meal, PantryItem } from '../../lib/types';
import { useInventory } from '../../store/inventory';
import { useMealsCache } from '../../store/mealsCache';
import { useSettings } from '../../store/settings';
import { useTheme } from '../../theme';

/** Built-in ideas per page, and the most worked out at once. */
const LOCAL_PAGE = 6;
const LOCAL_MAX = 120;

export default function Meals() {
  const { c } = useTheme();
  const items = useInventory((s) => s.items);
  const diet = useSettings((s) => s.diet);
  const servings = useSettings((s) => s.servings);
  const aiConsent = useSettings((s) => s.aiConsent);
  const [askConsent, setAskConsent] = useState(false);
  // Without agreement nothing is sent anywhere; ideas come from the built-in list.
  const aiAllowed = isDemoMode || aiConsent;
  const cache = useMealsCache();
  const [loading, setLoading] = useState(false);
  // An error belongs to the inventory it happened for; a different inventory deserves a fresh try.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const inFlight = useRef<string | null>(null);
  // Only the newest request may change what is shown; an older one arriving late is ignored.
  const latest = useRef<string | null>(null);
  const today = useToday();

  const prefs = useMemo(() => ({ diet, servings }), [diet, servings]);
  const now = useMemo(() => new Date(), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const pool = filterForDiet(suggestible(items, now), diet);
  const key = suggestionKey(items, prefs, now);
  const fresh = cache.key === key;
  const error = failure?.key === key ? failure.message : null;

  // Instant offline ideas so the tab is never empty while (or instead of) waiting on the AI.
  // Every built-in idea that fits, shown a page at a time.
  const allLocal = useMemo(() => localSuggestions(items, prefs, new Date(), LOCAL_MAX), [items, prefs]);
  const [localPages, setLocalPages] = useState({ key: '', pages: 1 });
  const pages = localPages.key === key ? localPages.pages : 1;
  const fallback = allLocal.slice(0, LOCAL_PAGE * pages);
  const meals: Meal[] = aiAllowed && fresh && cache.meals.length > 0 ? cache.meals : fallback;
  const showingFallback = !(aiAllowed && fresh && cache.meals.length > 0);

  const load = useCallback(
    async (more: boolean) => {
      const current = useInventory.getState().items;
      const candidates = filterForDiet(suggestible(current), prefs.diet);
      const requestKey = suggestionKey(current, prefs);
      if (candidates.length === 0 || inFlight.current === requestKey) return;
      if (!(isDemoMode || useSettings.getState().aiConsent)) return;
      inFlight.current = requestKey;
      latest.current = requestKey;
      setLoading(true);
      setFailure(null);
      try {
        const userId = await getProvider().getUserId();
        const exclude = more ? useMealsCache.getState().meals.map((m) => m.title) : [];
        const result = await fetchMeals({ userId, items: candidates, prefs, exclude });
        if (latest.current !== requestKey) return;
        const ranked = rankMeals(result.filter((m) => plausibleMeal(m, candidates)), candidates);
        if (ranked.length === 0) setFailure({ key: requestKey, message: 'No ideas came back. Try again in a moment.' });
        else useMealsCache.getState().setResult(requestKey, ranked);
      } catch (e) {
        if (latest.current !== requestKey) return;
        const { message, paywall } = friendlyError(e);
        setFailure({ key: requestKey, message });
        if (paywall) void useBilling.getState().refresh();
      } finally {
        if (inFlight.current === requestKey) inFlight.current = null;
        if (latest.current === requestKey) setLoading(false);
      }
    },
    [prefs],
  );

  // Fetch once per inventory/day/preferences change, then serve from cache.
  useFocusEffect(
    useCallback(() => {
      if (aiAllowed && !fresh && pool.length > 0 && !error) void load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiAllowed, fresh, pool.length, load]),
  );

  /** "I made this": the tracked ingredients it used are marked used, with a celebration. */
  async function cooked(meal: Meal, at?: { x: number; y: number }) {
    const live = useInventory.getState().items.filter((i) => i.status === 'active');
    const used = uniqueUses(meal.uses)
      .map((u) => matchTracked(u, live))
      .filter((i, n, all): i is PantryItem => !!i && all.findIndex((j) => j?.id === i.id) === n);
    if (used.length === 0) return;
    const ok = await confirm({
      title: `Made ${meal.title}?`,
      message: `This marks ${used.map((i) => i.name).join(', ')} as used.`,
      confirmLabel: 'Mark as used',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    if (at) useBurst.getState().emit(at.x, at.y);
    resolveItems(used, 'used', { mealTitle: meal.title });
  }

  return (
    <>
    <Screen>
      <Header title="Meals" subtitle={pool.length > 0 ? `Built from ${pool.length} items, soonest to expire first` : undefined} />

      {pool.length === 0 ? (
        <EmptyState
          emoji="🍳"
          title="Nothing to cook with yet"
          message="Add some items and Fridge Pulse will suggest meals that use them up. Items already past their date are left out."
        />
      ) : (
        <>
          {isDemoMode && !SCREENSHOT_MODE ? (
            <Text variant="caption" faint>
              Preview: ideas come from a built-in recipe list. With the scanning service connected, recipes are written by AI to fit your items.
            </Text>
          ) : null}

          {!aiAllowed ? (
            <Card style={{ gap: 8, backgroundColor: c.primaryTint, borderColor: c.primaryTint }}>
              <Text variant="bodyStrong">Want recipes written for exactly what you have?</Text>
              <Text muted>Turn on AI meal ideas. The names and dates of your items are sent to an AI service, never photos.</Text>
              <Button testID="enable-ai-meals" label="Turn on AI meal ideas" size="sm" onPress={() => setAskConsent(true)} style={{ alignSelf: 'flex-start' }} />
            </Card>
          ) : null}

          {loading && showingFallback ? (
            <View style={styles.loading} testID="meals-loading">
              <ActivityIndicator color={c.primary} />
              <Text muted>Finding meals for your ingredients...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={{ gap: 8 }}>
              <Text testID="meals-error" variant="caption" color={c.danger}>
                {error} {showingFallback ? 'Showing quick ideas instead.' : ''}
              </Text>
              <Button label="Try again" variant="secondary" size="sm" onPress={() => void load(false)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}

          {meals.length === 0 && !loading ? (
            <EmptyState
              emoji="🥣"
              title="No matching meals"
              message="Nothing on hand makes a complete meal yet. Add a few more staples like eggs, pasta or rice."
            />
          ) : (
            <View style={{ gap: 12 }}>
              {meals.map((meal, i) => (
                <FadeIn key={meal.id} delay={stagger(i, 70)}>
                  <MealCard meal={meal} defaultOpen={i === 0} onCooked={(at) => void cooked(meal, at)} />
                </FadeIn>
              ))}
            </View>
          )}

          {!showingFallback ? (
            <Button
              label="More ideas"
              variant="secondary"
              icon="refresh"
              loading={loading}
              onPress={() => void load(true)}
            />
          ) : allLocal.length > fallback.length ? (
            <Button
              testID="more-local-ideas"
              label="More ideas"
              variant="secondary"
              icon="add"
              onPress={() => setLocalPages({ key, pages: pages + 1 })}
            />
          ) : null}
        </>
      )}
    </Screen>
    <AiConsentModal
      visible={askConsent}
      onClose={() => setAskConsent(false)}
      onAgree={() => {
        setAskConsent(false);
        void load(false);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
});

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getProvider } from '../../store/billing';
import { AiConsentModal } from '../../components/AiConsentModal';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import { MealCard } from '../../components/MealCard';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { fetchMeals, friendlyError, isDemoMode } from '../../lib/api';
import { SCREENSHOT_MODE } from '../../lib/config';
import { filterForDiet, localSuggestions, rankMeals, suggestible, suggestionKey } from '../../lib/meals';
import type { Meal } from '../../lib/types';
import { useInventory } from '../../store/inventory';
import { useMealsCache } from '../../store/mealsCache';
import { useSettings } from '../../store/settings';
import { useTheme } from '../../theme';

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

  const prefs = useMemo(() => ({ diet, servings }), [diet, servings]);
  const now = new Date();
  const pool = filterForDiet(suggestible(items, now), diet);
  const key = suggestionKey(items, prefs, now);
  const fresh = cache.key === key;
  const error = failure?.key === key ? failure.message : null;

  // Instant offline ideas so the tab is never empty while (or instead of) waiting on the AI.
  const fallback = useMemo(() => localSuggestions(items, prefs, new Date()), [items, prefs]);
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
      setLoading(true);
      setFailure(null);
      try {
        const userId = await getProvider().getUserId();
        const exclude = more ? useMealsCache.getState().meals.map((m) => m.title) : [];
        const result = await fetchMeals({ userId, items: candidates, prefs, exclude });
        const ranked = rankMeals(result, candidates);
        if (ranked.length === 0) setFailure({ key: requestKey, message: 'No ideas came back. Try again in a moment.' });
        else useMealsCache.getState().setResult(requestKey, ranked);
      } catch (e) {
        setFailure({ key: requestKey, message: friendlyError(e).message });
      } finally {
        inFlight.current = null;
        setLoading(false);
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
                <MealCard key={meal.id} meal={meal} defaultOpen={i === 0} />
              ))}
            </View>
          )}

          {!showingFallback && !isDemoMode ? (
            <Button
              label="More ideas"
              variant="secondary"
              icon="refresh"
              loading={loading}
              onPress={() => void load(true)}
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

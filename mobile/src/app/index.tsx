import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EntryCard } from '@/components/EntryCard';
import { OutingPanel } from '@/components/OutingPanel';
import { useEntries } from '@/hooks/useEntries';
import { groupByDay } from '@/domain/group';
import { MOOD_LABELS, type MoodId } from '@/domain/moods';
import { useSettings } from '@/providers/SettingsProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { SearchField } from '@/ui/SearchField';
import { MIN_TOUCH, spacing, usePalette } from '@/ui/theme';
import { useTapGuard } from '@/ui/useTapGuard';
import { useToday } from '@/ui/useToday';

const BAR_HEIGHT = 96;

export default function LogScreen() {
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { settings, units } = useSettings();
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState<MoodId | null>(null);
  const { entries, moods, outings, total, loading, loadMore } = useEntries({ query, mood });
  const today = useToday();
  const guard = useTapGuard();

  const sections = useMemo(() => groupByDay(entries, today), [entries, today]);

  // Once every note is gone, a leftover search or mood filter would hide new notes.
  if (total === 0 && (query !== '' || mood !== null)) {
    setQuery('');
    setMood(null);
  }

  if (!settings.onboarded) return <Redirect href="/onboarding" />;

  const filtering = query.trim().length > 0 || mood !== null;
  // While a new search runs, keep showing the last answer instead of flashing a spinner.
  const showEmpty = total !== null && entries.length === 0;
  // Keep the selected mood visible even after its last note changed mood, so it is clear
  // what is filtering the list and how to clear it.
  const moodChips = mood !== null && !moods.includes(mood) ? [...moods, mood] : moods;

  const header = (
    <View style={styles.header}>
      <OutingPanel />
      {total !== null && total > 0 ? (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search your notes" />
          {moodChips.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <Chip value="All" selected={mood === null} onPress={() => setMood(null)} accessibilityLabel="Show all moods" />
              {moodChips.map((id) => (
                <Chip
                  key={id}
                  value={MOOD_LABELS[id]}
                  selected={mood === id}
                  onPress={() => setMood(mood === id ? null : id)}
                  accessibilityLabel={`Show ${MOOD_LABELS[id]} notes`}
                />
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={12}
              onPress={guard(() => router.push('/settings'))}
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={24} color={palette.primary} />
            </Pressable>
          ),
        }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(entry) => String(entry.id)}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <AppText variant="caption" tone="textMuted" accessibilityRole="header" style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </AppText>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <EntryCard entry={item} outing={item.outingId ? outings.get(item.outingId) : null} units={units} />
          </View>
        )}
        stickySectionHeadersEnabled={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: BAR_HEIGHT + insets.bottom + spacing.xl }}
        ListEmptyComponent={
          loading && total === null ? (
            <ActivityIndicator style={styles.loading} color={palette.primary} accessibilityLabel="Loading notes" />
          ) : showEmpty ? (
            filtering ? (
              <EmptyState
                title="Nothing found"
                message="Try a different word, or show all your notes again."
                actionLabel="Show all notes"
                onAction={() => {
                  setQuery('');
                  setMood(null);
                }}
              />
            ) : (
              <EmptyState
                title="No notes yet"
                message="Tap Record and say what you see, hear, or feel. Trail Notes adds the place, weather, and mood."
              />
            )
          ) : null
        }
      />

      <View
        pointerEvents="box-none"
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md), backgroundColor: palette.background, borderTopColor: palette.border }]}
      >
        <Button label="Record" icon="mic" onPress={() => router.push('/record')} style={styles.recordButton} accessibilityHint="Starts listening" />
        <Button label="Write" icon="create-outline" variant="secondary" onPress={() => router.push('/write')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, padding: spacing.lg },
  filters: { gap: spacing.sm, paddingVertical: spacing.xs },
  sectionTitle: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, letterSpacing: 0.8 },
  item: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  loading: { padding: spacing.xxl },
  settingsButton: { minWidth: MIN_TOUCH - 8, minHeight: MIN_TOUCH - 8, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  recordButton: { flex: 1 },
});

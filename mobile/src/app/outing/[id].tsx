import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { notifyDataChanged } from '@/db/events';
import { deleteOuting, renameOuting } from '@/db/repository';
import { formatDay, formatDuration, formatTime } from '@/domain/format';
import { formatDistance } from '@/domain/units';
import { EntryCard } from '@/components/EntryCard';
import { useOutingDetail } from '@/hooks/useOutingDetail';
import { useOuting } from '@/providers/OutingProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { useDatabase } from '@/providers/useDatabase';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { warning } from '@/ui/haptics';
import { goBack } from '@/ui/navigation';
import { useToday } from '@/ui/useToday';
import { Screen } from '@/ui/Screen';
import { fonts, radius, spacing, usePalette } from '@/ui/theme';

export default function OutingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const outingId = Number(id);
  const router = useRouter();
  const palette = usePalette();
  const db = useDatabase();
  const { units } = useSettings();
  const running = useOuting();
  const { outing, entries, loading } = useOutingDetail(outingId);
  const today = useToday();
  const [name, setName] = useState<string | null>(null);

  if (loading) return <Screen>{null}</Screen>;

  if (!outing) {
    return (
      <Screen>
        <EmptyState title="This outing is gone" message="It may have been deleted." actionLabel="Back to your notes" onAction={() => goBack(router)} />
      </Screen>
    );
  }

  const isActive = running.active?.id === outing.id;
  // An outing left open (not the one recording now) runs until its last route point or note.
  const lastSeen = Math.max(outing.startedAt, outing.track.at(-1)?.[2] ?? 0, ...entries.map((e) => e.createdAt));
  const seconds = isActive ? running.elapsedS : ((outing.endedAt ?? lastSeen) - outing.startedAt) / 1000;
  const meters = isActive ? running.distanceM : outing.distanceM;

  async function saveName() {
    const trimmed = (name ?? '').trim();
    if (!outing || !trimmed) {
      setName(outing?.name ?? '');
      return;
    }
    if (trimmed === outing.name) return;
    await renameOuting(db, outing.id, trimmed);
    notifyDataChanged();
  }

  function confirmDelete() {
    warning();
    Alert.alert('Delete this outing?', 'The route is deleted. Your notes stay in the log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteOuting(db, outingId);
          notifyDataChanged();
          goBack(router);
        },
      },
    ]);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <TextInput
              accessibilityLabel="Outing name"
              value={name ?? outing.name}
              onChangeText={setName}
              onBlur={saveName}
              onSubmitEditing={saveName}
              returnKeyType="done"
              maxLength={80}
              style={[
                styles.name,
                { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border, fontFamily: fonts.bold },
              ]}
            />
            <AppText tone="textMuted">
              {outing.kind === 'run' ? 'Run' : 'Hike'} {'·'} {formatDay(outing.startedAt, today, undefined, outing.timeZone)}, {formatTime(outing.startedAt, undefined, outing.timeZone)}
            </AppText>
          </View>

          <View style={styles.stats}>
            <Stat label="Time" value={formatDuration(seconds)} />
            <Stat label="Distance" value={formatDistance(meters, units.distance)} />
            <Stat label="Notes" value={String(outing.entryCount)} />
          </View>

          {isActive ? (
            <Button
              label="Finish outing"
              onPress={async () => {
                await running.finish();
              }}
            />
          ) : null}

          <View style={styles.section}>
            <AppText variant="heading" accessibilityRole="header">
              Notes from this outing
            </AppText>
            {entries.length === 0 ? (
              <AppText tone="textMuted">No notes yet. Record one while you are out and it will show up here.</AppText>
            ) : (
              entries.map((entry) => <EntryCard key={entry.id} entry={entry} units={units} />)
            )}
          </View>

          {!isActive ? <Button label="Delete outing" variant="danger" onPress={confirmDelete} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.stat, { backgroundColor: palette.surface, borderColor: palette.border }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="small" tone="textMuted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.md },
  name: { fontSize: 22, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, minHeight: 52 },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, alignItems: 'center', gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});

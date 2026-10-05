import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { notifyDataChanged } from '@/db/events';
import { deleteEntry, updateMood, updateTranscript } from '@/db/repository';
import { formatDay, formatTime } from '@/domain/format';
import { classifyMood, MOOD_IDS, MOOD_LABELS, type MoodId } from '@/domain/moods';
import { useEntry } from '@/hooks/useEntry';
import { useSettings } from '@/providers/SettingsProvider';
import { useDatabase } from '@/providers/useDatabase';
import { EntryTags, routeText, weatherText } from '@/components/EntryTags';
import { enrichers } from '@/services/enrichers';
import { enrichEntry } from '@/services/entries';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { success, warning } from '@/ui/haptics';
import { goBack } from '@/ui/navigation';
import { useConfirmLeave } from '@/ui/useConfirmLeave';
import { useToday } from '@/ui/useToday';
import { Screen } from '@/ui/Screen';
import { fonts, radius, spacing, usePalette } from '@/ui/theme';

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const router = useRouter();
  const palette = usePalette();
  const db = useDatabase();
  const { units } = useSettings();
  const { entry, outing, loading } = useEntry(entryId);

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [changingMood, setChangingMood] = useState(false);
  const today = useToday();
  const editedUnsaved = Boolean(entry && draft !== null && draft.trim() !== '' && draft.trim() !== entry.transcript);
  const leaveAllowed = useRef(false);
  useConfirmLeave(
    editedUnsaved,
    { title: 'Discard your changes?', message: 'Your edits to this note have not been saved.', keep: 'Keep editing', discard: 'Discard' },
    leaveAllowed,
  );

  if (loading) return <Screen>{null}</Screen>;

  if (!entry) {
    return (
      <Screen>
        <EmptyState title="This note is gone" message="It may have been deleted." actionLabel="Back to your notes" onAction={() => goBack(router)} />
      </Screen>
    );
  }

  const text = draft ?? entry.transcript;
  const trimmed = text.trim();
  const dirty = trimmed.length > 0 && trimmed !== entry.transcript;
  const hasLocation = entry.latitude !== null && entry.longitude !== null;
  const weather = weatherText(entry, units.temperature);
  // An empty place means the map service had no name for the spot, so there is nothing to retry.
  const missingTags = hasLocation && (!weather || entry.place === null);

  async function saveText() {
    if (!entry || !dirty) return;
    setSaving(true);
    try {
      const mood: MoodId | null | undefined = entry.moodSource === 'auto' ? classifyMood(trimmed).mood : undefined;
      await updateTranscript(db, entry.id, trimmed, mood);
      notifyDataChanged();
      success();
    } catch {
      Alert.alert('Could not save', 'Your changes could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseMood(mood: MoodId | null) {
    if (!entry) return;
    await updateMood(db, entry.id, mood, 'user');
    setChangingMood(false);
    notifyDataChanged();
  }

  async function addMissingTags() {
    if (!entry) return;
    setLookingUp(true);
    setLookupFailed(false);
    const result = await enrichEntry(db, entry.id, enrichers).catch(() => null);
    setLookingUp(false);
    setLookupFailed(!result || result.place === 'failed' || result.weather === 'failed');
  }

  function confirmDelete() {
    warning();
    Alert.alert('Delete this note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, entryId);
          notifyDataChanged();
          leaveAllowed.current = true;
          goBack(router);
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `${formatDay(entry.createdAt, today, undefined, entry.timeZone)}, ${formatTime(entry.createdAt, undefined, entry.timeZone)}` }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            accessibilityLabel="Note text"
            value={text}
            onChangeText={setDraft}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            style={[
              styles.input,
              { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border, fontFamily: fonts.regular },
            ]}
          />
          {dirty ? <Button label="Save changes" onPress={saveText} loading={saving} /> : null}

          <View style={styles.section}>
            <AppText variant="caption" tone="textMuted">
              TAGS
            </AppText>
            <EntryTags entry={entry} outing={outing} units={units} />
            {outing ? (
              <Button
                label={`Open ${routeText(outing, units.distance)}`}
                variant="ghost"
                onPress={() => router.push({ pathname: '/outing/[id]', params: { id: String(outing.id) } })}
              />
            ) : null}
            {!entry.mood && entry.moodSource === 'auto' ? (
              <AppText variant="small" tone="textMuted">No mood was picked up from this note.</AppText>
            ) : null}
          </View>

          <View style={styles.section}>
            <AppText variant="small" tone="textMuted">
              {entry.moodSource === 'user'
                ? entry.mood
                  ? 'You chose this mood.'
                  : 'You chose no mood for this note.'
                : 'The mood is estimated from your words.'}
            </AppText>
            {changingMood ? (
              <View style={styles.moods}>
                {MOOD_IDS.map((mood) => (
                  <Chip key={mood} value={MOOD_LABELS[mood]} selected={entry.mood === mood} onPress={() => chooseMood(mood)} />
                ))}
                <Chip value="No mood" selected={entry.mood === null} onPress={() => chooseMood(null)} />
                <Chip value="Cancel" onPress={() => setChangingMood(false)} accessibilityLabel="Keep the current mood" />
              </View>
            ) : (
              <Button label="Change mood" variant="secondary" onPress={() => setChangingMood(true)} />
            )}
          </View>

          {missingTags ? (
            <View style={styles.section}>
              <AppText variant="small" tone="textMuted">
                {lookupFailed
                  ? 'Could not reach the weather and place services. Check your connection and try again.'
                  : 'The place or weather is missing, usually because there was no signal.'}
              </AppText>
              <Button label="Add place and weather" variant="secondary" loading={lookingUp} onPress={addMissingTags} />
            </View>
          ) : null}
          {!hasLocation ? (
            <AppText variant="small" tone="textMuted">
              No location was saved with this note, so there is no place or weather.
            </AppText>
          ) : null}

          <Button label="Delete note" variant="danger" onPress={confirmDelete} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  input: { minHeight: 140, fontSize: 18, lineHeight: 27, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  section: { gap: spacing.md },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

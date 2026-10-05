import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useOuting } from '@/providers/OutingProvider';
import { useDatabase } from '@/providers/useDatabase';
import { enrichers } from '@/services/enrichers';
import { enrichEntry, saveNewEntry } from '@/services/entries';
import { getCurrentFix, promptForLocationOnce } from '@/services/location';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { success } from '@/ui/haptics';
import { goBack } from '@/ui/navigation';
import { useConfirmLeave } from '@/ui/useConfirmLeave';
import { Screen } from '@/ui/Screen';
import { fonts, radius, spacing, usePalette } from '@/ui/theme';

export default function WriteScreen() {
  const router = useRouter();
  const palette = usePalette();
  const db = useDatabase();
  const outing = useOuting();
  // A voice note that could not be saved arrives here as text, so it is not lost.
  const params = useLocalSearchParams<{ text?: string }>();
  const [text, setText] = useState(() => (typeof params.text === 'string' ? params.text : ''));
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const leaveAllowed = useRef(false);
  useConfirmLeave(
    text.trim().length > 0,
    { title: 'Discard this note?', message: 'What you typed has not been saved.', keep: 'Keep writing', discard: 'Discard' },
    leaveAllowed,
  );
  // Saving can wait a few seconds for GPS. If the person has left by then, the note is
  // still saved but the app must not close whatever screen they moved on to.
  const left = useRef(false);
  useEffect(
    () => () => {
      left.current = true;
    },
    [],
  );

  async function save() {
    const transcript = text.trim();
    if (!transcript || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await promptForLocationOnce().catch(() => undefined);
      // A failed location lookup must never stop the note from saving.
      const fix = outing.latestFix() ?? (await getCurrentFix(4000).catch(() => null));
      const entry = await saveNewEntry(db, {
        transcript,
        durationS: 0,
        fix,
        outingId: outing.active?.id ?? null,
      });
      enrichEntry(db, entry.id, enrichers).catch(() => undefined);
      success();
      leaveAllowed.current = true;
      if (!left.current) goBack(router);
    } catch {
      busy.current = false;
      setSaving(false);
      Alert.alert('Could not save', 'Your note could not be saved. Your text is still here, so try again.');
    }
  }

  return (
    <Screen>
      {/* A visible way out of the sheet, besides swiping it down. Unsaved text is confirmed first. */}
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12} onPress={() => goBack(router)} style={styles.cancel}>
              <AppText variant="bodyBold" style={{ color: palette.primary }}>
                Cancel
              </AppText>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText tone="textMuted">Write what you see, hear, or feel. The place, weather, and mood are added for you.</AppText>
          <TextInput
            accessibilityLabel="Your note"
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlignVertical="top"
            placeholder="What's it like out there?"
            placeholderTextColor={palette.textMuted}
            style={[
              styles.input,
              { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border, fontFamily: fonts.regular },
            ]}
          />
          <View>
            <Button label="Save note" onPress={save} loading={saving} disabled={!text.trim()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Phones inset the header's left button themselves; the browser build does not.
  cancel: { minHeight: 44, justifyContent: 'center', paddingRight: spacing.md, paddingLeft: Platform.OS === 'web' ? spacing.lg : 0 },
  fill: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg },
  input: { minHeight: 200, fontSize: 17, lineHeight: 25, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
});

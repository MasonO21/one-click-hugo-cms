import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useOuting } from '@/providers/OutingProvider';
import { useDatabase } from '@/providers/useDatabase';
import { enrichers } from '@/services/enrichers';
import { enrichEntry, saveNewEntry } from '@/services/entries';
import { getCurrentFix, promptForLocationOnce } from '@/services/location';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { success } from '@/ui/haptics';
import { goBack } from '@/ui/navigation';
import { Screen } from '@/ui/Screen';
import { fonts, radius, spacing, usePalette } from '@/ui/theme';

export default function WriteScreen() {
  const router = useRouter();
  const palette = usePalette();
  const db = useDatabase();
  const outing = useOuting();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const transcript = text.trim();
    if (!transcript || saving) return;
    setSaving(true);
    try {
      await promptForLocationOnce().catch(() => undefined);
      const fix = outing.latestFix() ?? (await getCurrentFix(4000));
      const entry = await saveNewEntry(db, {
        transcript,
        durationS: 0,
        fix,
        outingId: outing.active?.id ?? null,
      });
      enrichEntry(db, entry.id, enrichers).catch(() => undefined);
      success();
      goBack(router);
    } catch {
      setSaving(false);
      Alert.alert('Could not save', 'Your note could not be saved. Your text is still here, so try again.');
    }
  }

  return (
    <Screen>
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
  fill: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg },
  input: { minHeight: 200, fontSize: 17, lineHeight: 25, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
});

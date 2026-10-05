import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Entry, Outing } from '@/db/types';
import { formatTime } from '@/domain/format';
import type { DistanceUnit, TemperatureUnit } from '@/domain/units';
import { AppText } from '@/ui/AppText';
import { radius, spacing, usePalette } from '@/ui/theme';
import { useTapGuard } from '@/ui/useTapGuard';
import { EntryTags, tagsLabel } from './EntryTags';

interface Props {
  entry: Entry;
  outing?: Outing | null;
  units: { temperature: TemperatureUnit; distance: DistanceUnit };
}

// Ends the note with a full stop if it has none, so the tags read as their own sentence.
function asSentence(text: string): string {
  return /[.!?…]["'”’)]*$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

export function EntryCard({ entry, outing, units }: Props) {
  const router = useRouter();
  const palette = usePalette();
  const time = formatTime(entry.createdAt, undefined, entry.timeZone);
  const guard = useTapGuard();
  const tags = tagsLabel({ entry, outing, units });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tags ? `${time}. ${asSentence(entry.transcript)} ${tags}` : `${time}. ${entry.transcript}`}
      accessibilityHint="Opens the entry"
      onPress={guard(() => router.push({ pathname: '/entry/[id]', params: { id: String(entry.id) } }))}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <AppText variant="caption" tone="textMuted">
        {time}
      </AppText>
      <AppText numberOfLines={4}>{entry.transcript}</AppText>
      <View>
        <EntryTags entry={entry} outing={outing} units={units} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});

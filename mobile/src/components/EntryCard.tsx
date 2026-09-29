import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Entry, Outing } from '@/db/types';
import { formatTime } from '@/domain/format';
import type { DistanceUnit, TemperatureUnit } from '@/domain/units';
import { AppText } from '@/ui/AppText';
import { radius, spacing, usePalette } from '@/ui/theme';
import { EntryTags } from './EntryTags';

interface Props {
  entry: Entry;
  outing?: Outing | null;
  units: { temperature: TemperatureUnit; distance: DistanceUnit };
}

export function EntryCard({ entry, outing, units }: Props) {
  const router = useRouter();
  const palette = usePalette();
  const time = formatTime(entry.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${time}. ${entry.transcript}`}
      accessibilityHint="Opens the entry"
      onPress={() => router.push({ pathname: '/entry/[id]', params: { id: String(entry.id) } })}
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

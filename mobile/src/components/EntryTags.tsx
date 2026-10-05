import { StyleSheet, View } from 'react-native';
import type { Entry, Outing } from '@/db/types';
import { MOOD_LABELS } from '@/domain/moods';
import { formatDistance, formatTemperature, type DistanceUnit, type TemperatureUnit } from '@/domain/units';
import { weatherLabel } from '@/domain/weather';
import { Chip } from '@/ui/Chip';
import { spacing } from '@/ui/theme';

interface Props {
  entry: Entry;
  outing?: Pick<Outing, 'name' | 'distanceM'> | null;
  units: { temperature: TemperatureUnit; distance: DistanceUnit };
}

export function weatherText(entry: Pick<Entry, 'weatherCode' | 'tempC'>, unit: TemperatureUnit): string | null {
  const label = weatherLabel(entry.weatherCode);
  if (!label && entry.tempC === null) return null;
  const parts = [label, entry.tempC === null ? null : formatTemperature(entry.tempC, unit)].filter(Boolean);
  return parts.join(' · ');
}

export function routeText(outing: Pick<Outing, 'name' | 'distanceM'>, unit: DistanceUnit): string {
  return outing.distanceM >= 50 ? `${outing.name} · ${formatDistance(outing.distanceM, unit)}` : outing.name;
}

// The tags in words, for screen readers.
export function tagsLabel({ entry, outing, units }: Props): string {
  const weather = weatherText(entry, units.temperature);
  return [
    outing ? `Route: ${routeText(outing, units.distance)}` : null,
    entry.place ? `Place: ${entry.place}` : null,
    weather ? `Weather: ${weather}` : null,
    entry.mood ? `Mood: ${MOOD_LABELS[entry.mood]}` : null,
  ]
    .filter(Boolean)
    .join('. ');
}

export function EntryTags({ entry, outing, units }: Props) {
  const weather = weatherText(entry, units.temperature);
  return (
    <View style={styles.row}>
      {outing ? <Chip label="Route" value={routeText(outing, units.distance)} /> : null}
      {entry.place ? <Chip label="Place" value={entry.place} /> : null}
      {weather ? <Chip label="Weather" value={weather} /> : null}
      {entry.mood ? <Chip label="Mood" value={MOOD_LABELS[entry.mood]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

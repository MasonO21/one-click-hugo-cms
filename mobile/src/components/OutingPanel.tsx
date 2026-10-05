import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { OutingKind } from '@/domain/format';
import { formatDuration } from '@/domain/format';
import { formatDistance } from '@/domain/units';
import { useOuting, type StartResult } from '@/providers/OutingProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { radius, spacing, usePalette } from '@/ui/theme';

// Shows the outing controls at the top of the log: start one, follow the current one,
// or decide what to do with one that was left open.
export function OutingPanel() {
  const router = useRouter();
  const palette = usePalette();
  const { units } = useSettings();
  const outing = useOuting();

  async function begin(kind: OutingKind) {
    const result = await outing.start(kind);
    if (!result.ok) explain(result.reason);
  }

  async function continueRecovered() {
    const result = await outing.resume();
    if (!result.ok) explain(result.reason);
  }

  async function finish() {
    const id = await outing.finish();
    if (id !== null) router.push({ pathname: '/outing/[id]', params: { id: String(id) } });
  }

  const box = [styles.box, { backgroundColor: palette.surface, borderColor: palette.border }];

  if (outing.recovering) {
    return (
      <View style={box}>
        <AppText variant="heading">Outing still open</AppText>
        <AppText tone="textMuted">
          {outing.recovering.name} was still recording when Trail Notes closed. Continue it, or finish it now with the route
          saved so far.
        </AppText>
        <Button label="Continue outing" onPress={continueRecovered} />
        <Button label="Finish outing" variant="secondary" onPress={() => outing.endRecovered()} />
      </View>
    );
  }

  if (outing.active) {
    return (
      <View style={box}>
        <AppText variant="heading">{outing.active.name}</AppText>
        <AppText tone="textMuted">
          {formatDuration(outing.elapsedS)} {'·'} {formatDistance(outing.distanceM, units.distance)}
        </AppText>
        <AppText variant="small" tone="textMuted">
          Recording your route. Keep Trail Notes open while you are out.
        </AppText>
        <Button label="Finish outing" variant="secondary" onPress={finish} />
      </View>
    );
  }

  return (
    <View style={box}>
      <AppText variant="heading">Heading out?</AppText>
      <AppText tone="textMuted">Start an outing to save your route. Trail Notes tracks it while the app is open.</AppText>
      <View style={styles.row}>
        <Button label="Start hike" icon="walk-outline" variant="secondary" style={styles.flex} onPress={() => begin('hike')} />
        <Button label="Start run" icon="footsteps-outline" variant="secondary" style={styles.flex} onPress={() => begin('run')} />
      </View>
    </View>
  );
}

function explain(reason: Exclude<StartResult, { ok: true }>['reason']) {
  if (reason === 'blocked') {
    Alert.alert('Location is turned off', 'Turn on location for Trail Notes in Settings to record a route.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
  } else if (reason === 'denied') {
    Alert.alert('Location needed', 'Trail Notes needs your location to record a route. You can still write and record notes without it.');
  } else if (reason === 'services-off') {
    Alert.alert('Location Services are off', 'Turn on Location Services in your phone’s settings to record a route.');
  } else if (reason === 'approximate') {
    Alert.alert(
      'Precise location is off',
      'With approximate location, Trail Notes cannot measure your route. Turn on Precise Location for Trail Notes in Settings.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  } else {
    Alert.alert('Could not start', 'Something went wrong starting the outing. Please try again.');
  }
}

const styles = StyleSheet.create({
  box: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1, paddingHorizontal: spacing.md },
});

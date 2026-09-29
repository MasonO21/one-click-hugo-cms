import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/providers/SettingsProvider';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { spacing, usePalette } from '@/ui/theme';

const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: 'mic', title: 'Talk', text: 'Tap Record and speak while you hike or run.' },
  { icon: 'pricetags-outline', title: 'Auto-tag', text: 'Trail Notes adds the place, the weather, and the mood.' },
  { icon: 'search', title: 'Search', text: 'Find any day again by what you said.' },
];

export default function Onboarding() {
  const router = useRouter();
  const palette = usePalette();
  const { update } = useSettings();

  async function start() {
    await update('onboarded', true);
    router.replace('/');
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={require('../../assets/images/logo-mark.png')} style={styles.logo} accessibilityLabel="Trail Notes logo" />
        <AppText variant="title">Journal with your voice on the trail</AppText>

        <View style={styles.points}>
          {POINTS.map((point) => (
            <View key={point.title} style={styles.point}>
              <Ionicons name={point.icon} size={26} color={palette.primary} />
              <View style={styles.pointText}>
                <AppText variant="bodyBold">{point.title}</AppText>
                <AppText tone="textMuted">{point.text}</AppText>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.privacy, { backgroundColor: palette.surfaceAlt }]}>
          <AppText variant="bodyBold">Your notes stay on your phone</AppText>
          <AppText variant="small" tone="textMuted">
            Notes are stored only on this device. Your phone&apos;s speech recognition turns your voice into text, and on
            many phones that happens on the device. To add the weather, Trail Notes sends a rounded location (about 10 km)
            to a weather service.
          </AppText>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Get started" onPress={start} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, padding: spacing.xl, paddingTop: spacing.xxl },
  logo: { width: 64, height: 64, borderRadius: 16 },
  points: { gap: spacing.lg },
  point: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  pointText: { flex: 1 },
  privacy: { gap: spacing.xs, padding: spacing.lg, borderRadius: 12 },
  footer: { padding: spacing.xl },
});

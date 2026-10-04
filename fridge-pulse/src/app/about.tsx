import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Card } from '../components/Card';
import { Logo } from '../components/Logo';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { Wordmark } from '../components/Wordmark';
import { SUPPORT_EMAIL } from '../lib/config';
import { useTheme } from '../theme';

export default function About() {
  const { c } = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          About
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10} style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="close" size={20} color={c.ink} />
        </Pressable>
      </View>

      <View style={styles.brand}>
        <Logo size={88} beat="calm" />
        <Wordmark size={30} center />
        <Text variant="label" muted>
          Your kitchen&apos;s vital sign
        </Text>
        <Text variant="caption" muted>
          Version {version}
        </Text>
      </View>

      <Card style={{ gap: 8 }}>
        <Text variant="heading">Food safety</Text>
        <Text>
          Expiry dates in Fridge Pulse are estimates, and photo scanning can make mistakes. Always check the packaging and use
          your own judgement: how food looks, smells and was stored. When in doubt, throw it out.
        </Text>
        <Text muted>
          Meal ideas may not suit every allergy or diet. If you have an allergy, check every ingredient yourself.
        </Text>
      </Card>

      <Card style={{ gap: 8 }} testID="nutrition-credit">
        <Text variant="heading">Nutrition data</Text>
        <Text>
          Calories and macros are estimates for typical portions. Figures for foods and built-in recipes come from USDA FoodData
          Central (SR Legacy, public domain), as published in the TempoLife food database (tempolife.app) under the Creative
          Commons Attribution 4.0 licence.
        </Text>
        <Row label="About the licence" hint="creativecommons.org/licenses/by/4.0" onPress={() => void Linking.openURL('https://creativecommons.org/licenses/by/4.0/')} />
      </Card>

      <Card style={{ gap: 4 }}>
        <Row label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <Row label="Terms of Use" onPress={() => router.push('/legal/terms')} />
        {SUPPORT_EMAIL ? <Row label="Contact support" hint={SUPPORT_EMAIL} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Fridge%20Pulse%20${version}`)} /> : null}
      </Card>
    </Screen>
  );
}

function Row({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
});

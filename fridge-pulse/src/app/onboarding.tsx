import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { FadeIn } from '../components/motion';
import { Screen } from '../components/Screen';
import { Emoji, Text } from '../components/Text';
import { Wordmark } from '../components/Wordmark';
import { TRIAL_SPAN } from '../billing/trial';
import { useBilling } from '../store/billing';
import { useSettings } from '../store/settings';
import { BRAND, glow, useTheme } from '../theme';

const STEPS = [
  {
    ring: BRAND.blue,
    emoji: '📸',
    title: 'Snap your fridge',
    body: 'Take a photo of your fridge, freezer or pantry shelves. Fridge Pulse spots what is inside and estimates how long it will keep.',
  },
  {
    ring: BRAND.magenta,
    emoji: '⏰',
    title: 'Never miss a date',
    body: 'Get a gentle heads-up the day before things expire, so food gets eaten instead of binned.',
  },
  {
    ring: BRAND.orange,
    emoji: '🍳',
    title: 'Cook what is about to go',
    body: 'Get meal ideas built around the ingredients that need using up first.',
  },
];

export default function Onboarding() {
  const { c, scheme } = useTheme();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  // The store's localised price (the same one the paywall shows next), not a hard-coded one.
  const price = useBilling((b) => b.priceString);

  return (
    <Screen
      scroll={false}
      edges={['top', 'bottom']}
      contentStyle={styles.content}
      footer={
        <View style={styles.footerInner}>
          {last ? (
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              Free for {TRIAL_SPAN}, then {price}/month. Cancel anytime.
            </Text>
          ) : null}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === step ? c.primaryFill : c.border, width: i === step ? 22 : 8 }]} />
            ))}
          </View>
          <Button
            testID="onboarding-next"
            variant={last ? 'cta' : 'primary'}
            label={last ? 'Get started' : 'Next'}
            onPress={() => (last ? useSettings.getState().set({ onboarded: true }) : setStep(step + 1))}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      }
    >
      <View style={styles.brand}>
        <Logo size={64} beat="calm" />
        <Wordmark size={32} center />
        <Text variant="label" muted style={{ textAlign: 'center' }}>
          Your kitchen&apos;s vital sign
        </Text>
      </View>
      <FadeIn key={step} distance={16} style={styles.hero}>
        <View style={[styles.emojiWrap, { backgroundColor: c.surface, borderColor: s.ring }, scheme === 'dark' ? glow(s.ring, 26, 0.45) : null]}>
          <Emoji size={76}>{s.emoji}</Emoji>
        </View>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {s.title}
        </Text>
        <Text muted style={{ textAlign: 'center', fontSize: 17, lineHeight: 25, maxWidth: 360 }}>
          {s.body}
        </Text>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'space-between' },
  brand: { alignItems: 'center', gap: 6, paddingTop: 8 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emojiWrap: { width: 156, height: 156, borderRadius: 78, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  footerInner: { width: '100%', maxWidth: 600, gap: 20, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
});

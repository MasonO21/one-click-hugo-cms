import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { FadeIn } from '../components/motion';
import { Screen } from '../components/Screen';
import { Emoji, Text } from '../components/Text';
import { TRIAL_SPAN } from '../billing/trial';
import { useBilling } from '../store/billing';
import { useSettings } from '../store/settings';
import { useTheme } from '../theme';

const STEPS = [
  {
    emoji: '📸',
    title: 'Snap your fridge',
    body: 'Take a photo of your fridge, freezer or pantry shelves. Fridge Pulse spots what is inside and estimates how long it will keep.',
  },
  {
    emoji: '⏰',
    title: 'Never miss a date',
    body: 'Get a gentle heads-up the day before things expire, so food gets eaten instead of binned.',
  },
  {
    emoji: '🍳',
    title: 'Cook what is about to go',
    body: 'Get meal ideas built around the ingredients that need using up first.',
  },
];

export default function Onboarding() {
  const { c } = useTheme();
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
              <View key={i} style={[styles.dot, { backgroundColor: i === step ? c.primary : c.border, width: i === step ? 22 : 8 }]} />
            ))}
          </View>
          <Button
            testID="onboarding-next"
            label={last ? 'Get started' : 'Next'}
            onPress={() => (last ? useSettings.getState().set({ onboarded: true }) : setStep(step + 1))}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      }
    >
      <View style={styles.brand}>
        <Logo size={40} beat="calm" />
        <Text variant="heading">Fridge Pulse</Text>
      </View>
      <FadeIn key={step} distance={16} style={styles.hero}>
        <View style={[styles.emojiWrap, { backgroundColor: c.primaryTint }]}>
          <Emoji size={84}>{s.emoji}</Emoji>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emojiWrap: { width: 176, height: 176, borderRadius: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  footerInner: { width: '100%', maxWidth: 600, gap: 20, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
});

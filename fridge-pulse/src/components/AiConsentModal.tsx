import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSettings } from '../store/settings';
import { radius, useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

interface Props {
  visible: boolean;
  /** Called after the person agrees (consent is already saved). */
  onAgree: () => void;
  onClose: () => void;
}

/**
 * Asks before any photo or ingredient list leaves the phone. App Store guideline 5.1.2 requires
 * naming the third-party AI, saying what is shared, and getting explicit permission first.
 */
export function AiConsentModal({ visible, onAgree, onClose }: Props) {
  const { c } = useTheme();

  const agree = () => {
    useSettings.getState().set({ aiConsent: true, aiConsentAt: new Date().toISOString() });
    onAgree();
  };
  const readPolicy = () => {
    onClose();
    router.push('/legal/privacy');
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          testID="ai-consent"
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            <Text variant="heading">Use AI to read your food?</Text>
            <Text>
              To identify food in your photos, look up items it does not know and write meal ideas, Fridge Pulse sends them
              securely through our server to an AI service, Anthropic&apos;s Claude.
            </Text>
            <View style={{ gap: 8 }}>
              {[
                'Photos are sent only when you tap Analyze or Read receipt. For meal ideas, the names and dates of your tracked items are sent, with no photos.',
                'If a scan finds something unfamiliar, Claude searches the web for the exact product, and you confirm it from a picture.',
                'Fridge Pulse does not keep your photos.',
                'You can turn this off any time in Settings. Everything else keeps working.',
              ].map((line) => (
                <View key={line} style={styles.bullet}>
                  <Text muted>{'•'}</Text>
                  <Text style={{ flex: 1 }}>{line}</Text>
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="link" onPress={readPolicy} hitSlop={8}>
              <Text variant="bodyStrong" color={c.primary}>
                Read the Privacy Policy
              </Text>
            </Pressable>
          </ScrollView>
          <View style={styles.actions}>
            <Button testID="ai-consent-later" label="Not now" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button testID="ai-consent-agree" label="I agree" onPress={agree} style={{ flex: 1.2 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: radius.lg, borderWidth: 1, padding: 20, gap: 16 },
  bullet: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', gap: 10 },
});

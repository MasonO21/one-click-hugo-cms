import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Emoji, Text } from './Text';

/**
 * Shown by the root error boundary when a screen fails to render, instead of a blank or crashed
 * app. Items live on the device, so nothing is lost by trying again.
 */
export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]} testID="error-boundary">
      <Emoji size={44}>{'\u{1F914}'}</Emoji>
      <Text variant="heading">Something went wrong</Text>
      <Text muted style={{ textAlign: 'center', maxWidth: 320 }}>
        Fridge Pulse ran into a problem. Your items are safe on this device. Please try again.
      </Text>
      <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch', maxWidth: 320 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
});

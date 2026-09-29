import { Alert, Platform } from 'react-native';

/** One-button message. `Alert.alert` does nothing on web, so fall back to `window.alert`. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Two-button confirmation that resolves true/false. React Native's `Alert.alert` is a
 * no-op on web, so previews fall back to `window.confirm`; a hung promise there would
 * stall any flow that awaits the answer.
 */
export function confirm({ title, message, confirmLabel, cancelLabel = 'Cancel', destructive }: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      // Android lets people dismiss by tapping outside or pressing back; treat that as "no".
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

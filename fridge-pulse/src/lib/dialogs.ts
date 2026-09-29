import { Alert, Platform } from 'react-native';
import { useDialog } from '../store/dialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Two-button confirmation that resolves true/false. Native uses the system alert. On web,
 * `Alert.alert` is a no-op and `window.confirm` is unavailable in embedded viewers, so an
 * in-app dialog (see DialogHost) is shown instead. Never leaves the promise pending.
 */
export function confirm({ title, message, confirmLabel, cancelLabel = 'Cancel', destructive }: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return useDialog.getState().ask({ title, message, confirmLabel, cancelLabel, destructive: !!destructive });
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

/** One-button message. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    void useDialog.getState().ask({ title, message, confirmLabel: 'OK', cancelLabel: null, destructive: false });
    return;
  }
  Alert.alert(title, message);
}

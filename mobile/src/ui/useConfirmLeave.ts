import type { RefObject } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

interface Message {
  title: string;
  message: string;
  keep: string;
  discard: string;
}

// Asks before leaving a screen with unsaved words (back button, swipe, or Android back).
// Set `leaveAllowed.current = true` just before leaving on purpose, for example after
// saving, so no question is asked.
export function useConfirmLeave(unsaved: boolean, text: Message, leaveAllowed: RefObject<boolean>) {
  const navigation = useNavigation();

  usePreventRemove(unsaved, ({ data }) => {
    if (leaveAllowed.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(text.title, text.message, [
      { text: text.keep, style: 'cancel' },
      { text: text.discard, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}

import { Platform, StyleSheet, View } from 'react-native';
import { useAnnouncer } from '../store/announcer';
import { Text } from './Text';

/**
 * The web's spoken messages (see `announce`). A region already on the page is what screen readers
 * notice changing; one that appears together with its text is often not read. The same message twice
 * differs by a trailing space, so it is read again.
 */
export function Announcer() {
  const { message, seq } = useAnnouncer();
  if (Platform.OS !== 'web') return null;
  return (
    <View aria-live="polite" role="status" style={styles.offscreen}>
      <Text>{seq % 2 ? `${message} ` : message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' },
});

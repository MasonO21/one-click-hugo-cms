import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { spacing } from './theme';

interface Props {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      <AppText tone="textMuted" style={styles.center}>
        {message}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
      {secondaryLabel && onSecondary ? <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: spacing.lg, padding: spacing.xl },
  center: { textAlign: 'center' },
});

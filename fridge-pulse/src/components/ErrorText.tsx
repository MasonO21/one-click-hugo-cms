import { useEffect } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { announce } from '../store/announcer';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * A problem the person needs to know about, in the danger colour. It is read out when it appears or
 * changes, so nobody misses it by not looking at that part of the screen.
 */
export function ErrorText({ children, testID, style }: { children: string; testID?: string; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  useEffect(() => {
    announce(children);
  }, [children]);
  return (
    <Text testID={testID} variant="caption" color={c.danger} style={style}>
      {children}
    </Text>
  );
}

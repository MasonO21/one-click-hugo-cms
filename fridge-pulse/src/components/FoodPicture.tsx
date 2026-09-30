import { useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ImageResizeMode, type StyleProp, type ViewStyle } from 'react-native';
import { NATIVE_DRIVER, prefersReducedMotion, useAnimatedValue } from './motion';
import { Emoji } from './Text';

interface Props {
  /** Picture address; without one (or if it fails to load) the emoji shows instead. */
  uri: string | null | undefined;
  emoji: string;
  emojiSize: number;
  /** The box: size, corner radius, background. */
  style: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  /** Describes the picture for screen readers; omit for decorative thumbnails. */
  accessibilityLabel?: string;
  testID?: string;
}

/** A food's product picture, faded in once loaded, or its emoji. */
export function FoodPicture({ uri, emoji, emojiSize, style, resizeMode = 'cover', accessibilityLabel, testID }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = useAnimatedValue(0);
  const usable = !!uri && failed !== uri;

  const onLoad = () => {
    if (prefersReducedMotion()) shown.setValue(1);
    else Animated.timing(shown, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
  };

  return (
    <View style={[styles.box, style]} testID={testID}>
      {usable ? (
        <Animated.Image
          source={{ uri }}
          resizeMode={resizeMode}
          onLoad={onLoad}
          onError={() => setFailed(uri)}
          accessible={!!accessibilityLabel}
          accessibilityLabel={accessibilityLabel}
          style={[StyleSheet.absoluteFill, { opacity: shown }]}
        />
      ) : (
        <Emoji size={emojiSize}>{emoji}</Emoji>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

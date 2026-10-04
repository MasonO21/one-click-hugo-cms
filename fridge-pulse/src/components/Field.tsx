import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { brandFont, FONT, glow, radius, useTheme } from '../theme';

/** A text box that lights up with a neon outline while you type in it. */
export function Field({ style, ref, onFocus, onBlur, ...rest }: TextInputProps & { ref?: Ref<TextInput> }) {
  const { c, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  // Each weight is its own font family: a bold field picks the bold file.
  const weight = StyleSheet.flatten(style)?.fontWeight;
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.inkFaint}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        { color: c.ink, backgroundColor: c.surface, borderColor: focused ? c.glow : c.border },
        focused && scheme === 'dark' ? glow(c.glow, 10, 0.35) : null,
        style,
        weight ? { fontFamily: brandFont('body', weight), fontWeight: 'normal' } : null,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, fontFamily: FONT.body },
});

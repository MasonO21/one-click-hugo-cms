import type { Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { radius, useTheme } from '../theme';

export function Field({ style, ref, ...rest }: TextInputProps & { ref?: Ref<TextInput> }) {
  const { c } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.inkFaint}
      {...rest}
      style={[styles.input, { color: c.ink, backgroundColor: c.surface, borderColor: c.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 },
});

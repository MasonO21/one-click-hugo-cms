import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { radius, useTheme } from '../theme';

export function Field({ style, ...rest }: TextInputProps) {
  const { c } = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.inkFaint}
      {...rest}
      style={[styles.input, { color: c.ink, backgroundColor: c.surface, borderColor: c.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 },
});

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { DEVELOPER_NAME, SUPPORT_EMAIL } from '../../lib/config';
import { isLegalKey, legalDocument } from '../../legal/render';
import { useTheme } from '../../theme';

/** Bundled Privacy Policy and Terms of Use. Reachable before onboarding, on the paywall and in Settings. */
export default function LegalScreen() {
  const { c } = useTheme();
  const { doc: key } = useLocalSearchParams<{ doc: string }>();
  const valid = isLegalKey(key);
  const doc = valid ? legalDocument(key, { developer: DEVELOPER_NAME, email: SUPPORT_EMAIL }) : null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            {doc?.title ?? 'Not found'}
          </Text>
          {doc ? (
            <Text variant="caption" muted>
              Last updated {doc.updated}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10} style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="close" size={20} color={c.ink} />
        </Pressable>
      </View>

      {doc ? (
        <>
          <Text muted>{doc.intro}</Text>
          {doc.sections.map((s) => (
            <View key={s.heading} style={{ gap: 8 }}>
              <Text variant="heading" accessibilityRole="header">
                {s.heading}
              </Text>
              {s.paragraphs?.map((p, i) => (
                <Text key={i}>{p}</Text>
              ))}
              {s.bullets?.map((b, i) => (
                <View key={i} style={styles.bullet}>
                  <Text muted>{'•'}</Text>
                  <Text style={{ flex: 1 }}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : (
        <Text muted>That document does not exist.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bullet: { flexDirection: 'row', gap: 10, paddingRight: 4 },
});

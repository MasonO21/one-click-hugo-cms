import type { FontName } from './fonts';

/** The brand font files, bundled as app assets (one file per weight, so only the used ones ship). */
export const FONT_SOURCES: Record<FontName, number> = {
  Montserrat_700Bold: require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf'),
  Montserrat_800ExtraBold: require('@expo-google-fonts/montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf'),
  OpenSans_400Regular: require('@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf'),
  OpenSans_600SemiBold: require('@expo-google-fonts/open-sans/600SemiBold/OpenSans_600SemiBold.ttf'),
  OpenSans_700Bold: require('@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf'),
};

/** Where each file lives in node_modules, for the web preview build that inlines them. */
export const FONT_FILES: Record<FontName, string> = {
  Montserrat_700Bold: '@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf',
  Montserrat_800ExtraBold: '@expo-google-fonts/montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf',
  OpenSans_400Regular: '@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf',
  OpenSans_600SemiBold: '@expo-google-fonts/open-sans/600SemiBold/OpenSans_600SemiBold.ttf',
  OpenSans_700Bold: '@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf',
};

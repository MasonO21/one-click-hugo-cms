import { useFonts } from 'expo-font';
import { FONT_SOURCES } from '../theme/fontSources';

/**
 * Loads the brand fonts (bundled with the app). The app waits for them, since an unknown font
 * family is an error on iOS; if loading fails it carries on with the system font.
 */
export function useEmbeddedFonts(): boolean {
  const [loaded, error] = useFonts(FONT_SOURCES);
  return loaded || error != null;
}

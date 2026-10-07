import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell for Nova Colony (iOS + Android). Web assets come from `npm run build` (dist/).
 * Orientation is not configured here: both portrait and landscape are enabled in the native projects
 * (ios/App/App/Info.plist and android/app/src/main/AndroidManifest.xml). See docs/MOBILE.md.
 */
const BACKGROUND = '#1b2a3a';

const config: CapacitorConfig = {
  appId: 'com.novacolony.game',
  appName: 'Nova Colony',
  webDir: 'dist',
  backgroundColor: BACKGROUND,
  server: {
    // https scheme keeps localStorage/IndexedDB stable across Android WebView updates
    androidScheme: 'https',
  },
  ios: {
    // the game draws edge to edge under the notch; the UI handles safe-area insets itself
    contentInset: 'never',
    backgroundColor: BACKGROUND,
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  android: {
    backgroundColor: BACKGROUND,
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // hidden explicitly once the game is ready (src/platform/hooks.ts); the duration is only a safety net
      launchShowDuration: 2500,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: BACKGROUND,
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: BACKGROUND,
      overlaysWebView: true,
    },
  },
};

export default config;

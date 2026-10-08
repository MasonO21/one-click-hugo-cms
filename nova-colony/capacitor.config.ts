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
      // the default FIT_XY stretches the splash on tall phones
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: BACKGROUND,
      overlaysWebView: true,
    },
    // gentle reminders while away (src/platform/notifications.ts sets the same icon/colour on each notification)
    LocalNotifications: {
      // Android status-bar icon: res/drawable-*/ic_stat_nova.png (white glyph on transparency, art/generate.mjs)
      smallIcon: 'ic_stat_nova',
      // the UI's warm orange accent (--accent)
      iconColor: '#ff8a3d',
      // iOS: nothing pops up while the player is in the game (the app cancels pending reminders when it opens)
      presentationOptions: [],
    },
  },
};

export default config;

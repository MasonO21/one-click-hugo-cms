import type { ExpoConfig } from 'expo/config';

// Identifiers below are placeholders until the app is registered: change the iOS
// bundle identifier and Android package to ones you own before the first store build.
const IDENTIFIER = 'com.trailnotes.app';
// Before the first cloud build, paste your project id from expo.dev into the empty quotes
// at the end of the next line (or set the EAS_PROJECT_ID environment variable).
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '';
// Apple requires a privacy policy link inside the app, and Settings only shows it when the
// website address is set. Stop a store build on EAS that would ship without it.
if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PROFILE === 'production' && !process.env.EXPO_PUBLIC_SITE_URL) {
  throw new Error(
    'EXPO_PUBLIC_SITE_URL is not set. Add it to the production environment on expo.dev (or to the production profile in eas.json) so the app links to its privacy policy. See mobile/README.md.',
  );
}

const GREEN = '#1F6B4F';
const INK = '#0F1A15';

const config: ExpoConfig = {
  name: 'Trail Notes',
  slug: 'trail-notes',
  scheme: 'trailnotes',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: IDENTIFIER,
    supportsTablet: false,
    infoPlist: {
      // The app only uses the encryption built into the operating system (HTTPS).
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          // A location rounded to about 10 km is sent to the weather service.
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCoarseLocation',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
    },
  },
  android: {
    package: IDENTIFIER,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon-foreground.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: GREEN,
    },
    // Only what the app uses: microphone, location while open, internet, and vibration.
    // Notes are exported from the app's private cache, so no storage access is needed.
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: GREEN,
        dark: { image: './assets/splash-icon.png', backgroundColor: INK },
      },
    ],
    'expo-sqlite',
    'expo-localization',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Trail Notes uses your location to save where you were, add the weather to your notes, and record your route while the app is open.',
        // Location is only used while the app is open. Leave out the "Always" and motion
        // descriptions so the app does not ask for, or appear to ask for, more than it uses.
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Trail Notes uses the microphone to hear the notes you record.',
        speechRecognitionPermission: 'Trail Notes uses speech recognition to turn your voice into text.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  ...(EAS_PROJECT_ID ? { extra: { eas: { projectId: EAS_PROJECT_ID } } } : {}),
};

export default config;

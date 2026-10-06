// AdMob ids — the only file to edit when going live (see RELEASE.md).
// While any id below is one of Google's public TEST ids, the app runs in test mode: test ads, plus the
// Settings → "Ad testing" panel. `npm run release:check` refuses to pass until they are your own.
export const ADMOB_UNITS = {
  // Google's public test ad units (always fill, never pay). Replace with your units from the AdMob console.
  android: { interstitial: 'ca-app-pub-3940256099942544/1033173712', rewarded: 'ca-app-pub-3940256099942544/5224354917' },
  ios: { interstitial: 'ca-app-pub-3940256099942544/4411468910', rewarded: 'ca-app-pub-3940256099942544/1712485313' },
  testing: null,          // derived below: true while any id is one of Google's public test ids
  testingDevices: [],     // your phone's test-device id, to see real ads safely while testing
  maxAdContentRating: 'ParentalGuidance', // cartoon game: keep ads family-friendly
  childDirected: false,   // true if you target children (Google Play Families / COPPA)
};

export const GOOGLE_TEST_PUB = 'ca-app-pub-3940256099942544';
ADMOB_UNITS.testing = [ADMOB_UNITS.android, ADMOB_UNITS.ios].some(u => Object.values(u).some(id => id.startsWith(GOOGLE_TEST_PUB)));


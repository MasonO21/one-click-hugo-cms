import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps bundle the web app from dist-native (npm run build:native).
// Set VITE_SUNUP_API at build time to your server (e.g. https://sunup.example.com);
// without it, the apps run the on-device demo.
const config: CapacitorConfig = {
  // Change this to a reverse-DNS id you own before your first store upload (see README).
  appId: 'app.sunup.checkin',
  appName: 'Sunup',
  webDir: 'dist-native',
  backgroundColor: '#FFF6EC',
  plugins: {
    // Edge-to-edge on Android, with real env(safe-area-inset-*) values like iOS.
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
    // While the app is open it shows its own alerts (with sound), so don't double up with banners.
    PushNotifications: { presentationOptions: [] },
  },
};

export default config;

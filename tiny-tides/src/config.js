// Tiny Tides — release configuration. Edit these before submitting to the App Store.
export const VERSION = '1.0.0';

// Public URLs shown in Settings (and required by App Store Connect). Host the pages in /site anywhere
// (GitHub Pages, Netlify, your own domain) and update these three links.
export const LINKS = {
  privacy: 'https://masono21.github.io/tiny-tides/privacy.html',
  terms: 'https://masono21.github.io/tiny-tides/terms.html',
  support: 'https://masono21.github.io/tiny-tides/support.html',
};

// Plain-language privacy summary shown offline inside the app (kept in sync with site/privacy.html).
export const POLICY = [
  ['No accounts, no tracking', 'Tiny Tides has no sign-in, no ads, no analytics and no third-party SDKs. We do not collect, sell or share any personal data.'],
  ['Your game stays on your device', 'Your tidepool, creatures and settings are saved locally on your device and in your normal device backups. Deleting the app deletes the save.'],
  ['Purchases', 'Purchases are handled entirely by Apple. We never see your payment details. "Restore purchases" asks the App Store which items you already own.'],
  ['Notifications', 'Reminders are optional local notifications scheduled on your device. Nothing is sent from a server, and you can turn them off any time in Settings.'],
  ['Sharing pictures', 'When you tap Share, the picture is created on your device and handed to the iOS share sheet. You choose where it goes.'],
];

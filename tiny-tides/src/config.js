import { tk } from './i18n.js';

// Tiny Tides — release configuration. Edit these before submitting to the App Store.
export const VERSION = '1.0.0';

// Public pages. The address and the publisher's name come from legal/site.config.json when the app is built (see tools/build.mjs),
// so the app, the website and the App Store listing can't drift apart. Edit that file, not this one.
export const SITE = __SITE__;
export const LINKS = Object.fromEntries(['privacy', 'terms', 'support', 'rates', 'parents', 'licenses'].map((k) => [k, `${SITE.url}/${k}.html`]));
/** A public page in the player's language (the site has a folder per language; English is at the root). */
export const pageUrl = (k) => LINKS[k];
// Open-source licence texts, grouped by identical text: [{ license, text, items: [{ name, version, url, use }] }] (from tools/licenses.mjs)
export const LICENSES = __LICENSES__;

// Plain-language privacy summary shown offline inside the app (kept in sync with site/privacy.html).
export const POLICY = [
  [tk('No accounts, no tracking'), tk('Tiny Tides has no sign-in, no ads, no analytics and no third-party SDKs. We do not collect, sell or share any personal data.')],
  [tk('Your game stays on your device'), tk('Your tidepool, creatures and settings are saved locally on your device and in your normal device backups. Deleting the app deletes the save.')],
  [tk('Purchases'), tk('Purchases are handled entirely by Apple. We never see your payment details. "Restore purchases" asks the App Store which items you already own.')],
  [tk('Notifications'), tk('Reminders are optional local notifications scheduled on your device. Nothing is sent from a server, and you can turn them off any time in Settings.')],
  [tk('Capsule Machine'), tk('Capsule prizes are picked on your device using the published drop rates shown in the game. Nothing about your pulls is sent anywhere.')],
  [tk('Age check'), tk('Before the first Sea Glass capsule pull, the game checks whether you are 18 or older, using Apple\'s age range where available or a birth month and year. Only the answer (adult or under 18) is kept, on your device. The date is never stored or sent.')],
  [tk('Sharing pictures'), tk('When you tap Share, the picture is created on your device and handed to the iOS share sheet. You choose where it goes.')],
];

// Region switches for paid random items and set rewards live in regions.js (shared with the website generator).
export { NO_PAID_RANDOM, NO_SET_REWARDS } from './regions.js';

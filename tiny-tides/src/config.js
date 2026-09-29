// Tiny Tides — release configuration. Edit these before submitting to the App Store.
export const VERSION = '1.0.0';

// Public pages. The address and the publisher's name come from legal/site.config.json when the app is built (see tools/build.mjs),
// so the app, the website and the App Store listing can't drift apart. Edit that file, not this one.
export const SITE = __SITE__;
export const LINKS = Object.fromEntries(['privacy', 'terms', 'support', 'rates', 'parents', 'licenses'].map((k) => [k, `${SITE.url}/${k}.html`]));
// Open-source licence texts, grouped by identical text: [{ license, text, items: [{ name, version, url, use }] }] (from tools/licenses.mjs)
export const LICENSES = __LICENSES__;

// Plain-language privacy summary shown offline inside the app (kept in sync with site/privacy.html).
export const POLICY = [
  ['No accounts, no tracking', 'Tiny Tides has no sign-in, no ads, no analytics and no third-party SDKs. We do not collect, sell or share any personal data.'],
  ['Your game stays on your device', 'Your tidepool, creatures and settings are saved locally on your device and in your normal device backups. Deleting the app deletes the save.'],
  ['Purchases', 'Purchases are handled entirely by Apple. We never see your payment details. "Restore purchases" asks the App Store which items you already own.'],
  ['Notifications', 'Reminders are optional local notifications scheduled on your device. Nothing is sent from a server, and you can turn them off any time in Settings.'],
  ['Capsule Machine', 'Capsule prizes are picked on your device using the published drop rates shown in the game. Nothing about your pulls is sent anywhere.'],
  ['Sharing pictures', 'When you tap Share, the picture is created on your device and handed to the iOS share sheet. You choose where it goes.'],
];

// Countries where paid random items (Sea Glass capsule pulls) are switched off. Free pulls and Capsule Coins still work.
// Checked against BOTH the App Store storefront (Apple returns ISO alpha-3, e.g. "BEL") and the device region (alpha-2, e.g. "BE").
//  - Belgium: the Gaming Commission treats paid loot boxes as illegal gambling.
//  - Brazil: precaution — recent child-protection rules restrict paid random items in games that minors may play.
// Have a lawyer review this list for the countries you sell in (see legal/APP_STORE_ADMIN_CHECKLIST.md), or untick territories in App Store Connect.
export const NO_PAID_RANDOM = ['BE', 'BEL', 'BR', 'BRA'];

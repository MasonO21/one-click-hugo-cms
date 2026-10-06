// Privacy policy — shown in Options → Privacy policy, and written to dist/privacy.html by tools/build.mjs
// (host that page and use its URL in the Play Console / App Store Connect listings).
// Before release: replace CONTACT_EMAIL (tools/release-check.mjs refuses to pass while it is present).
export const PRIVACY_CONTACT = 'CONTACT_EMAIL';
export const PRIVACY_UPDATED = '6 October 2026';

export const PRIVACY_HTML = `
<h3>Privacy policy</h3>
<p><i>Last updated: ${PRIVACY_UPDATED}</i></p>
<p>Sizzle Flip is a single-player game. It has no accounts, no sign-in and no chat, and we (the developer) do not collect, store or sell any personal information.</p>
<h4>Your game progress</h4>
<p>Stars, unlocked levels, skins, trophies and settings are saved only on your device (in the app's local storage). They are never sent to us. Uninstalling the app or using <b>Reset progress</b> deletes them.</p>
<h4>Advertising</h4>
<p>The app shows ads from <b>Google AdMob</b>. To show and measure ads, and to prevent fraud, Google may collect and process information from your device, such as the advertising ID, IP address (used for approximate location), device and app information, and how you interact with ads. Google's use of this data is described in its policy: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">How Google uses information from sites or apps that use its services</a>.</p>
<ul>
<li>In the EEA, the UK and Switzerland you are asked for consent when the app first starts, and you can change your choice at any time in <b>Options → Privacy choices</b>.</li>
<li>On iPhone and iPad, you decide whether apps may track you (App Tracking Transparency). If you say no, ads are not personalised with your device's advertising identifier.</li>
<li>On Android you can reset or delete your advertising ID in your device settings (Settings → Privacy → Ads).</li>
</ul>
<p>Optional "reward" ads unlock hints, level skips and the long aim guide. Watching them is never required to play.</p>
<h4>Children</h4>
<p>Sizzle Flip is not directed at children under 13, and we do not knowingly collect information from them. Ads are limited to content rated suitable for general audiences with parental guidance.</p>
<h4>Changes and contact</h4>
<p>If this policy changes, the new version will be published here with a new date. Questions: <a href="mailto:${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a></p>
`;

// Privacy policy — shown in Options → Privacy policy, and written to dist/privacy.html by tools/build.mjs
// (host that page and use its URL in the Play Console / App Store Connect listings).
// Before release: replace CONTACT_EMAIL (tools/release-check.mjs refuses to pass while it is present).
export const PRIVACY_CONTACT = 'CONTACT_EMAIL';
export const PRIVACY_UPDATED = '7 October 2026';

// The text for one platform: inside the app only that platform's store and settings are named (App Review asks
// apps not to mention other mobile platforms); the hosted page ('web') covers both.
export function privacyHtml(platform = 'web') {
  const ios = platform !== 'android', android = platform !== 'ios';
  const store = platform === 'ios' ? 'the <b>App Store</b>' : platform === 'android' ? '<b>Google Play</b>' : '<b>Google Play</b> or the <b>App Store</b>';
  return `
<h3>Privacy policy</h3>
<p><i>Last updated: ${PRIVACY_UPDATED}</i></p>
<p>Sizzle Flip is a single-player game. It has no accounts, no sign-in and no chat, and we (the developer) do not collect, store or sell any personal information.</p>
<h4>Your game progress</h4>
<p>Stars, unlocked levels, skins, trophies and settings are saved only on your device (in the app's local storage). They are never sent to us. Uninstalling the app or using <b>Reset progress</b> deletes them.</p>
<h4>Advertising</h4>
<p>The app shows ads from <b>Google AdMob</b>. To show and measure ads, and to prevent fraud, Google may collect and process information from your device, such as the advertising ID, IP address (used for approximate location), device and app information, and how you interact with ads. Google's use of this data is described in its policy: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">How Google uses information from sites or apps that use its services</a>.</p>
<ul>
<li>In the EEA, the UK and Switzerland you are asked for consent when the app first starts, and you can change your choice at any time in <b>Options → Privacy choices</b>.</li>
${ios ? `<li>${android ? 'On iPhone and iPad, you' : 'You'} decide whether apps may track you (App Tracking Transparency). If you say no, ads are not personalised with your device's advertising identifier.</li>` : ''}
${android ? `<li>${ios ? 'On Android you' : 'You'} can reset or delete your advertising ID in your device settings (Settings → Privacy → Ads).</li>` : ''}
</ul>
<p>Optional "reward" ads unlock hints, level skips and the long aim guide. Watching them is never required to play.</p>
<h4>Purchases</h4>
<p>The Shop sells <b>Hot Dogs</b>, an in-game currency, as in-app purchases, and Hot Dogs unlock optional cosmetic characters. Payment is handled entirely by ${store} under its terms; we never see your card or payment details. The app asks the store about purchases that haven't been delivered yet, so that every purchase is credited exactly once.</p>
<p>Your Hot Dogs balance and your characters are stored on your device (and in your phone's own backup, if it makes one), not on our servers. They are kept through updates and a progress reset; deleting the app or its data can remove them.</p>
<h4>Children</h4>
<p>Sizzle Flip is not directed at children under 13, and we do not knowingly collect information from them. Ads are limited to content rated suitable for general audiences with parental guidance.</p>
<h4>Changes and contact</h4>
<p>If this policy changes, the new version will be published here with a new date. Questions: <a href="mailto:${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a></p>
`;
}

export const PRIVACY_HTML = privacyHtml('web');

// Support page — written to dist/support.html by tools/build.mjs. App Store Connect requires a Support URL
// (and Play a contact): host it next to privacy.html.
export const SUPPORT_HTML = `
<h3>Sizzle Flip — Help</h3>
<h4>How do I play?</h4>
<p>Drag back anywhere on the screen, aim with the dotted guide and let go to flip the sausage. Land it in the hot dog bun to finish the level. You can flip again from wherever it comes to rest. Land it within par for three stars.</p>
<h4>I'm stuck on a level</h4>
<p>After a few tries a 💡 hint appears that traces a route that works, and later a ⏭ button lets you skip the level and come back for the stars any time. <b>Pause → Long aim guide</b> shows more of your flip.</p>
<h4>I bought Hot Dogs but they didn't arrive</h4>
<p>Close the app completely and open it again: on start the game asks the App Store or Google Play about any purchase that hasn't been delivered yet and adds it, exactly once. If they still don't appear, write to us with the date of the purchase (your receipt email) and we'll sort it out.</p>
<h4>Do I keep my Hot Dogs and characters?</h4>
<p>Yes, through updates and through <b>Options → Reset progress</b>. They are stored on your device and in its own backup, not in an account, so deleting the app without a backup removes them.</p>
<h4>Ads and privacy</h4>
<p>You can change your ad choices any time in <b>Options → Privacy choices</b> (where it applies). The full privacy policy is on <a href="privacy.html">this page</a>.</p>
<h4>Contact</h4>
<p>Questions, bugs or ideas: <a href="mailto:${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a></p>
`;

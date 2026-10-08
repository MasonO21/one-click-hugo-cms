// Pre-release gate: fails while anything would make a store build wrong.  npm run release:check
// (Run after `npm run cap:sync`.)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { ADMOB_UNITS, GOOGLE_TEST_PUB } from '../src/ads-config.js';
import { PRIVACY_CONTACT } from '../src/privacy.js';
import { LEVELS } from '../src/levels/data.js';
import { makeSim } from './solver.mjs';
import { PHYS } from '../src/physics.js';
import { ITEMS } from '../src/art/items.js';
import { PACKS, SKIN_PRICE, HOTDOGS_PER_DOLLAR, bundlePrice } from '../src/shop-config.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return null; } };
const results = [];
const ok = (msg) => results.push(['PASS', msg]);
const fail = (msg) => results.push(['FAIL', msg]);
const warn = (msg) => results.push(['WARN', msg]);

// --- ads
const unitIds = [ADMOB_UNITS.android, ADMOB_UNITS.ios].flatMap(u => Object.values(u));
if (unitIds.some(id => id.startsWith(GOOGLE_TEST_PUB))) fail('AdMob ad unit ids are Google test ids — put your own in src/ads-config.js');
else ok('AdMob ad unit ids are your own');
const strings = read('android/app/src/main/res/values/strings.xml') || '';
const appId = (strings.match(/name="admob_app_id">([^<]+)</) || [])[1] || '';
if (!appId || appId.startsWith(GOOGLE_TEST_PUB)) fail('Android AdMob app id is the test id — set admob_app_id in android/app/src/main/res/values/strings.xml');
else ok(`Android AdMob app id ${appId}`);

// --- privacy
if (/CONTACT_EMAIL/.test(PRIVACY_CONTACT)) fail('Privacy policy contact is still CONTACT_EMAIL — set PRIVACY_CONTACT in src/privacy.js');
else ok(`Privacy policy contact ${PRIVACY_CONTACT}`);

// --- levels: 200 present, and every stored route wins with the game's launch rule (only when at rest)
const bad = [];
LEVELS.forEach((L, i) => {
  if (!L || !L.solution || !L.solution.length) { bad.push(`${i + 1}: missing`); return; }
  const sim = makeSim(L, Math.floor(i / 20));
  for (const [a, p, delay] of L.solution) {
    for (let s = 0; s < Math.round((delay || 0) / PHYS.DT) && sim.status === 'play'; s++) sim.step();
    if (!sim.canLaunch()) { bad.push(`${i + 1}: shot while not at rest`); return; }
    const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * p;
    sim.launch(Math.cos(a) * v, Math.sin(a) * v);
    const t0 = sim.t;
    while (sim.t - t0 < 7) { sim.step(); if (sim.status !== 'play') break; if (sim.t - t0 > 0.15 && sim.canLaunch()) break; }
    if (sim.status !== 'play') break;
  }
  if (sim.status !== 'win') bad.push(`${i + 1}: route ends ${sim.status}`);
});
if (LEVELS.length !== 200) fail(`expected 200 levels, found ${LEVELS.length}`);
if (bad.length) fail(`level routes: ${bad.join(', ')}`); else ok('all 200 level routes win under the game rules');

// --- shop: characters are bought with Hot Dogs; Hot Dogs are consumable store products (packs) — ids valid
// for both stores, $1 = 100 Hot Dogs, and the list handed to the store consoles matches the code
const packIds = PACKS.map(p => p.id);
const badPid = packIds.filter(p => !/^[a-z0-9][a-z0-9_.]{0,99}$/.test(p));
const noCat = ITEMS.filter(i => !i.cat).map(i => i.id);
const offRate = PACKS.filter(p => Math.abs(Math.round(+p.usd) * HOTDOGS_PER_DOLLAR - p.hotdogs) > 0 || p.title.length > 35 || p.description.length > 55).map(p => p.id);
if (new Set(packIds).size !== packIds.length || badPid.length || noCat.length || offRate.length || SKIN_PRICE !== HOTDOGS_PER_DOLLAR)
  fail(`shop: ${packIds.length} packs${badPid.length ? ', invalid ids: ' + badPid.join(' ') : ''}${noCat.length ? ', no tab: ' + noCat.join(' ') : ''}${offRate.length ? ', check price/rate/text: ' + offRate.join(' ') : ''}${SKIN_PRICE !== HOTDOGS_PER_DOLLAR ? `, a character costs ${SKIN_PRICE} but $1 buys ${HOTDOGS_PER_DOLLAR}` : ''}`);
else ok(`${PACKS.length} Hot Dog packs ($1 = ${HOTDOGS_PER_DOLLAR}), ${ITEMS.length} characters at ${SKIN_PRICE} each, bundles from ${bundlePrice(2)} to ${bundlePrice(ITEMS.length)}`);
const csv = (read('store/iap-products.csv') || '').split('\n').slice(1).filter(Boolean).map(l => l.split(',').slice(0, 4).join());
if (csv.join('|') !== PACKS.map(p => [p.id, 'consumable', p.hotdogs, p.usd].join()).join('|')) fail('store/iap-products.csv is out of date with src/shop-config.js — run node tools/create-store-products.mjs --csv');
else ok('store/iap-products.csv lists every pack');

// --- android project
const vars = read('android/variables.gradle') || '';
const target = +((vars.match(/targetSdkVersion\s*=\s*(\d+)/) || [])[1] || 0);
if (target < 36) fail(`targetSdkVersion ${target} — Google Play requires 36 (Android 16) for new apps and updates`); else ok(`targetSdkVersion ${target}`);
const gradle = read('android/app/build.gradle') || '';
const vc = (gradle.match(/versionCode\s+(\d+)/) || [])[1], vn = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
const pkg = JSON.parse(read('package.json'));
if (vn !== pkg.version) warn(`android versionName ${vn} ≠ package.json version ${pkg.version}`);
warn(`android versionCode ${vc}, versionName ${vn} — every Play upload needs a higher versionCode`);
const dist = read('dist/index.html'), shipped = read('android/app/src/main/assets/public/index.html');
const h = (s) => s && crypto.createHash('sha1').update(s).digest('hex');
if (!dist) fail('dist/ not built — run npm run build');
else if (/SMOKE SHOT|SELF-TEST/.test(dist)) fail('dist/ is a self-test build (--smoke) — run npm run cap:sync for a store build');
else if (!/androidBridge/.test(dist)) fail('dist/ does not include @capacitor/core — the app could not reach its native plugins (ads, purchases) on a phone');
else if (h(dist) !== h(shipped)) fail('android web assets differ from dist/ — run npm run cap:sync');
else ok('android web assets match the current build');
// the purchases plugin must leave transactions unfinished until the game has credited them (patches/)
const swift = read('node_modules/@capgo/native-purchases/ios/Sources/NativePurchasesPlugin/NativePurchasesPlugin.swift') || '';
if (!/Sizzle Flip patch/.test(swift) || /await transaction\.finish\(\)\s*\n\s*try\? await Task\.sleep/.test(swift) || pkg.scripts?.postinstall !== 'patch-package') fail('the purchases plugin patch is not applied — run npm install (postinstall: patch-package)');
else ok('purchases plugin patched: StoreKit transactions stay unfinished until the game credits them');
const plugins = read('android/capacitor.settings.gradle') || '';
const missingPlugins = ['capgo-native-purchases', 'capacitor-preferences', 'capacitor-community-admob'].filter(n => !plugins.includes(`':${n}'`));
if (missingPlugins.length) fail(`android is missing native plugins: ${missingPlugins.join(', ')} — run npm run cap:sync`); else ok('android has the store, storage and AdMob plugins');
if (!fs.existsSync(path.join(root, 'android/keystore.properties'))) warn('android/keystore.properties not found — release builds will be unsigned (see RELEASE.md)');
else ok('release signing configured (android/keystore.properties)');
try {
  const tracked = execSync('git ls-files', { cwd: root }).toString().split('\n').filter(f => /\.(jks|keystore)$|keystore\.properties$/.test(f));
  if (tracked.length) fail(`signing key files are committed to git: ${tracked.join(', ')}`); else ok('no signing keys in git');
} catch (e) { /* not a git checkout */ }

// --- iOS project (ios/, committed; RELEASE.md section 4)
const plist = read('ios/App/App/Info.plist');
if (plist === null) fail('ios/ is missing — the Xcode project is part of the repository (git checkout ios/)');
else {
  const val = (k) => { const m = plist.match(new RegExp(`<key>${k}</key>\\s*<(string|true|false)\\s*/?>([^<]*)`)); return m ? (m[1] === 'string' ? m[2] : m[1]) : null; };
  const arr = (k) => { const m = plist.match(new RegExp(`<key>${k.replace('~', '~')}</key>\\s*<array>([\\s\\S]*?)</array>`)); return m ? [...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map(x => x[1]) : []; };
  const gad = val('GADApplicationIdentifier') || '';
  if (!gad || gad.startsWith(GOOGLE_TEST_PUB)) fail('iOS AdMob app id is the test id — set GADApplicationIdentifier in ios/App/App/Info.plist');
  else ok(`iOS AdMob app id ${gad}`);
  if (!val('NSUserTrackingUsageDescription')) fail('ios Info.plist is missing NSUserTrackingUsageDescription (the tracking prompt text)'); else ok('iOS tracking prompt text set');
  const skan = (plist.match(/\.skadnetwork</g) || []).length;
  if (skan < 40) fail(`ios Info.plist lists ${skan} SKAdNetwork ids — use Google's full list (AdMob iOS quick-start)`); else ok(`iOS lists ${skan} SKAdNetwork ids`);
  if (val('ITSAppUsesNonExemptEncryption') !== 'false') warn('ios Info.plist: ITSAppUsesNonExemptEncryption not set — App Store Connect will ask about export compliance on every upload');
  else ok('iOS export compliance answered (no non-exempt encryption)');
  const phone = arr('UISupportedInterfaceOrientations'), pad = arr('UISupportedInterfaceOrientations~ipad');
  if (phone.join() !== 'UIInterfaceOrientationPortrait') fail(`iPhone orientations ${phone.join(', ')} — the game is portrait only (landscape shows "rotate your phone")`);
  else if (pad.length !== 4) fail('iPad must allow all four orientations (iPad multitasking), or App Store Connect rejects the upload');
  else ok('iPhone portrait only, iPad all orientations');
  if (plist.includes('SKIncludeConsumableInAppPurchaseHistory')) fail('ios Info.plist sets SKIncludeConsumableInAppPurchaseHistory — remove it (finished Hot Dog purchases would come back after a reinstall)');
  const manifest = read('ios/App/App/PrivacyInfo.xcprivacy') || '', pbx = read('ios/App/App.xcodeproj/project.pbxproj') || '';
  if (!manifest.includes('NSPrivacyAccessedAPICategoryUserDefaults') || !/PrivacyInfo\.xcprivacy in Resources \*\/,/.test(pbx)) fail('iOS privacy manifest missing or not in the app target (ios/App/App/PrivacyInfo.xcprivacy) — uploads without it are rejected');
  else ok('iOS privacy manifest in the app target (UserDefaults declared for the Preferences plugin)');
  const icon = (f) => { try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(root, f))).digest('hex'); } catch (e) { return null; } };
  if (icon('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png') !== icon('icons/ios-icon-1024.png')) fail('the iOS app icon is not the game icon — run node tools/render-icons.mjs');
  else ok('iOS app icon is the game icon');
  const mv = (pbx.match(/MARKETING_VERSION = ([^;]+);/) || [])[1], cv = (pbx.match(/CURRENT_PROJECT_VERSION = ([^;]+);/) || [])[1];
  warn(`iOS version ${mv} (build ${cv}) — every App Store Connect upload needs a higher build number`);
  const shippedIos = read('ios/App/App/public/index.html');
  if (dist && h(dist) !== h(shippedIos)) fail('iOS web assets differ from dist/ — run npm run cap:sync');
  else if (dist) ok('iOS web assets match the current build');
  const spm = read('ios/App/CapApp-SPM/Package.swift') || '';
  const missingIos = ['CapgoNativePurchases', 'CapacitorPreferences', 'CapacitorCommunityAdmob'].filter(n => !spm.includes(`"${n}"`));
  if (missingIos.length) fail(`iOS is missing native plugins: ${missingIos.join(', ')} — run npm run cap:sync`); else ok('iOS has the store, storage and AdMob plugins');
}

for (const [s, m] of results) console.log(`${s === 'PASS' ? '✔' : s === 'WARN' ? '•' : '✘'} ${s.padEnd(4)} ${m}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(failed ? `\n${failed} release blocker(s).` : '\nReady to build a release.');
process.exit(failed ? 1 : 0);

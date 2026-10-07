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
else if (h(dist) !== h(shipped)) fail('android web assets differ from dist/ — run npm run cap:sync');
else ok('android web assets match the current build');
const plugins = read('android/capacitor.settings.gradle') || '';
const missingPlugins = ['capgo-native-purchases', 'capacitor-preferences', 'capacitor-community-admob'].filter(n => !plugins.includes(`':${n}'`));
if (missingPlugins.length) fail(`android is missing native plugins: ${missingPlugins.join(', ')} — run npm run cap:sync`); else ok('android has the store, storage and AdMob plugins');
if (!fs.existsSync(path.join(root, 'android/keystore.properties'))) warn('android/keystore.properties not found — release builds will be unsigned (see RELEASE.md)');
else ok('release signing configured (android/keystore.properties)');
try {
  const tracked = execSync('git ls-files', { cwd: root }).toString().split('\n').filter(f => /\.(jks|keystore)$|keystore\.properties$/.test(f));
  if (tracked.length) fail(`signing key files are committed to git: ${tracked.join(', ')}`); else ok('no signing keys in git');
} catch (e) { /* not a git checkout */ }

// --- iOS (only once the Xcode project exists)
const plist = read('ios/App/App/Info.plist');
if (plist === null) warn('ios/ not created yet (npx cap add ios on a Mac) — see RELEASE.md');
else for (const k of ['GADApplicationIdentifier', 'NSUserTrackingUsageDescription', 'SKAdNetworkItems', 'SKIncludeConsumableInAppPurchaseHistory']) {
  if (!plist.includes(k)) fail(`ios Info.plist is missing ${k}`); else ok(`ios Info.plist has ${k}`);
}

for (const [s, m] of results) console.log(`${s === 'PASS' ? '✔' : s === 'WARN' ? '•' : '✘'} ${s.padEnd(4)} ${m}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(failed ? `\n${failed} release blocker(s).` : '\nReady to build a release.');
process.exit(failed ? 1 : 0);

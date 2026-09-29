// Change the bundle id everywhere in one go:  node tools/rename-bundle.mjs com.yourname.tinytides
// Updates src/data.js (APP_ID → all IAP product ids), capacitor.config.json, the Xcode project and legal/site.config.json, then regenerates the StoreKit file and the site.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];
if (!next || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(next)) { console.error('Usage: node tools/rename-bundle.mjs com.yourname.tinytides'); process.exit(1); }
const edit = (rel, fn) => { const p = path.join(root, rel); if (!fs.existsSync(p)) return; const a = fs.readFileSync(p, 'utf8'), b = fn(a); if (a !== b) { fs.writeFileSync(p, b); console.log('updated', rel); } };
edit('src/data.js', (s) => s.replace(/export const APP_ID = '[^']+';/, `export const APP_ID = '${next}';`));
edit('capacitor.config.json', (s) => s.replace(/"appId": "[^"]+"/, `"appId": "${next}"`));
edit('ios/App/App.xcodeproj/project.pbxproj', (s) => s.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${next};`));
edit('legal/site.config.json', (s) => s.replace(/"bundleId": "[^"]+"/, `"bundleId": "${next}"`));
execSync('node tools/gen-storekit.mjs', { cwd: root, stdio: 'inherit' });
execSync('node tools/site.mjs', { cwd: root, stdio: 'inherit' });
console.log(`\nBundle id is now ${next}. Create the same id in the Apple Developer portal, and create the IAPs listed in store/iap-products.md.`);

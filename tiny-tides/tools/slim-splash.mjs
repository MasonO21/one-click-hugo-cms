// `capacitor-assets` writes the same launch image six times (1x/2x/3x, light/dark), ~13 MB of duplicates in the app.
// The splash is one flat-colour picture that never changes with appearance, so keep a single copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ios/App/App/Assets.xcassets/Splash.imageset');
if (!fs.existsSync(dir)) { console.log('no Splash.imageset yet — run `npm run ios:add` and `npm run assets` first'); process.exit(0); }
const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
const keep = pngs.find((f) => f === 'Default.png') || pngs.find((f) => f.includes('@2x') && !f.includes('dark')) || pngs[0];
if (!keep) { console.log('splash: no images found'); process.exit(0); }
if (keep !== 'Default.png') fs.renameSync(path.join(dir, keep), path.join(dir, 'Default.png'));
for (const f of pngs) if (f !== keep && f !== 'Default.png') fs.rmSync(path.join(dir, f));
fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({
  images: [{ idiom: 'universal', filename: 'Default.png', scale: '1x' }, { idiom: 'universal', scale: '2x' }, { idiom: 'universal', scale: '3x' }],
  info: { version: 1, author: 'xcode' },
}, null, 2) + '\n');
console.log('splash: single image kept');

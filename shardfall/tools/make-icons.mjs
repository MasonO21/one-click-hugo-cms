#!/usr/bin/env node
// Generates every icon and splash image from code, using the game's own hero
// renderer (web/js/draw.js) in headless Chromium.
//
//   node tools/make-icons.mjs            -> web/assets/** (+ native projects if present)
//   node tools/make-icons.mjs --web-only -> skip copying into android/ and ios/
//   node tools/make-icons.mjs --only=icon-1024.png,splash-2732.png   (quick iteration)
//
// Art lives in tools/icon-art.js. Output is deterministic for a given Chromium.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG, encodeICO, pngInfo } from './lib/png.mjs';
import { launchChromium } from './lib/pw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');
const out = join(web, 'assets');
const args = process.argv.slice(2);
const webOnly = args.includes('--web-only');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

// name -> how to draw it. alpha:false writes an RGB PNG (required for the App Store icon).
const WEB_ASSETS = [
  { file: 'icon-1024.png', size: 1024, art: 'icon', alpha: false },             // iOS App Store / Xcode AppIcon
  { file: 'splash-2732.png', w: 2732, h: 2732, art: 'splash', alpha: false },   // iOS launch image, @capacitor/assets source
  { file: 'icons/icon-192.png', size: 192, art: 'roundedIcon' },               // PWA "any"
  { file: 'icons/icon-512.png', size: 512, art: 'roundedIcon' },
  { file: 'icons/icon-maskable-192.png', size: 192, art: 'icon', opts: { safe: 0.8 }, alpha: false },
  { file: 'icons/icon-maskable-512.png', size: 512, art: 'icon', opts: { safe: 0.8 }, alpha: false },
  { file: 'icons/apple-touch-icon.png', size: 180, art: 'icon', alpha: false },
  { file: 'icons/favicon-32.png', size: 32, art: 'favicon' },
  { file: 'icons/favicon-16.png', size: 16, art: 'favicon' },
  { file: 'icons/favicon-48.png', size: 48, art: 'favicon' },
  { file: 'android/ic_launcher_foreground.png', size: 432, art: 'adaptiveForeground' },
  { file: 'android/ic_launcher_background.png', size: 432, art: 'adaptiveBackground', alpha: false },
  { file: 'android/ic_launcher_monochrome.png', size: 432, art: 'adaptiveMonochrome' },
  { file: 'store/play-icon-512.png', size: 512, art: 'icon', alpha: false },       // Play Console listing icon
  { file: 'store/feature-graphic-1024x500.png', w: 1024, h: 500, art: 'splash', opts: { shards: true, hK: 0.62 }, alpha: false }
];

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const ANDROID_SPLASH = {
  'drawable': [480, 320],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920]
};
function nativeAssets() {
  const list = [];
  const res = join(root, 'android/app/src/main/res');
  if (existsSync(res)) {
    for (const [d, k] of Object.entries(DENSITIES)) {
      const dir = `${res}/mipmap-${d}`;
      list.push({ abs: `${dir}/ic_launcher.png`, size: 48 * k, art: 'roundedIcon' });
      list.push({ abs: `${dir}/ic_launcher_round.png`, size: 48 * k, art: 'roundedIcon', opts: { round: true } });
      list.push({ abs: `${dir}/ic_launcher_foreground.png`, size: 108 * k, art: 'adaptiveForeground' });
      list.push({ abs: `${dir}/ic_launcher_background.png`, size: 108 * k, art: 'adaptiveBackground', alpha: false });
      list.push({ abs: `${dir}/ic_launcher_monochrome.png`, size: 108 * k, art: 'adaptiveMonochrome' });
    }
    for (const [d, [w, h]] of Object.entries(ANDROID_SPLASH)) list.push({ abs: `${res}/${d}/splash.png`, w, h, art: 'splash', alpha: false });
  }
  const xc = join(root, 'ios/App/App/Assets.xcassets');
  if (existsSync(xc)) {
    list.push({ abs: `${xc}/AppIcon.appiconset/AppIcon-512@2x.png`, copyOf: 'icon-1024.png' });
    for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) list.push({ abs: `${xc}/Splash.imageset/${f}`, copyOf: 'splash-2732.png' });
  }
  return list;
}

async function main() {
  const browser = await launchChromium();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body style="margin:0;background:#0b1029"></body></html>');
  const fontB64 = readFileSync(join(root, 'tools/fonts/SairaCondensed-800-latin.woff2')).toString('base64');
  const fontOk = await page.evaluate(async b64 => {
    try {
      const f = new FontFace('Saira Condensed', `url(data:font/woff2;base64,${b64})`, { weight: '800', style: 'normal' });
      await f.load(); document.fonts.add(f); return true;
    } catch (e) { return false; }
  }, fontB64);
  if (!fontOk) console.warn('! Saira Condensed failed to load, using a system fallback font');
  for (const f of ['web/js/data.js', 'web/js/draw.js', 'tools/icon-art.js']) await page.addScriptTag({ path: join(root, f) });
  if (!(await page.evaluate(() => !!(window.SF && SF.drawHero && window.ART)))) throw new Error('art scripts failed to load');

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  async function render({ art, size, w, h, opts, alpha = true }) {
    w = w || size; h = h || size;
    const n = await page.evaluate(({ art, w, h, opts }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (art === 'splash') ART.splash(g, w, h, opts || {}); else ART[art](g, w, opts || {});
      window.__px = g.getImageData(0, 0, w, h).data;
      return window.__px.length;
    }, { art, w, h, opts });
    const data = Buffer.alloc(n);
    const CH = 1 << 22;
    for (let off = 0; off < n; off += CH) {
      const b64 = await page.evaluate(([off, CH]) => {
        const a = window.__px.subarray(off, off + CH);
        let s = '';
        for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
        return btoa(s);
      }, [off, CH]);
      Buffer.from(b64, 'base64').copy(data, off);
    }
    return encodePNG({ width: w, height: h, data, alpha });
  }

  const written = {};
  const write = (abs, buf) => { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, buf); };
  for (const a of WEB_ASSETS) {
    if (only.length && !only.includes(a.file)) continue;
    const png = await render(a);
    write(join(out, a.file), png);
    written[a.file] = png;
    const i = pngInfo(png);
    console.log(`  web/assets/${a.file}  ${i.width}x${i.height}  ${i.hasAlpha ? 'RGBA' : 'RGB'}  ${(png.length / 1024).toFixed(0)} KB`);
  }
  if (!only.length || only.includes('favicon.ico')) {
    const ico = encodeICO(['icons/favicon-16.png', 'icons/favicon-32.png', 'icons/favicon-48.png'].map(f => written[f] || readFileSync(join(out, f))));
    write(join(out, 'favicon.ico'), ico);
    console.log(`  web/assets/favicon.ico  16+32+48`);
  }

  if (!webOnly && !only.length) {
    const list = nativeAssets();
    for (const a of list) {
      const png = a.copyOf ? (written[a.copyOf] || readFileSync(join(out, a.copyOf))) : await render(a);
      write(a.abs, png);
    }
    if (list.length) console.log(`  ${list.length} native icon/splash files updated in android/ and ios/`);
    patchAndroidIconXml();
  }
  if (pageErrors.length) { console.error('page errors:', pageErrors); process.exitCode = 1; }
  await browser.close();
}

// Points the adaptive icon at the generated background + monochrome layers and
// removes the template's unused robot vectors.
function patchAndroidIconXml() {
  const res = join(root, 'android/app/src/main/res');
  if (!existsSync(res)) return;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) writeFileSync(join(res, 'mipmap-anydpi-v26', f), xml);
  writeFileSync(join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B1029</color>
</resources>
`);
  for (const f of ['drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml']) {
    if (existsSync(join(res, f))) rmSync(join(res, f));
  }
}

main().catch(e => { console.error(e); process.exit(1); });

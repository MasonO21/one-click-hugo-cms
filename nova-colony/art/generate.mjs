#!/usr/bin/env node
// Regenerates every Nova Colony release-art output from the SVG sources in this folder:
//
//   art/icon.svg             master app icon (sky + stars + hero); also the single source of the hero art
//   art/splash.template.svg  splash lockup (hero + path-drawn wordmark) -> composed into art/splash.svg
//   art/favicon.svg          tiny-size variant of the icon
//
// Outputs: Android launcher + adaptive icons + splash, iOS app icon + splash, web/PWA icons + manifest.
// Rasterised with headless Chromium at the exact pixel size (deviceScaleFactor 1).
//
//   node art/generate.mjs                  # from nova-colony/
//   CHROMIUM_PATH=/path/to/chrome node art/generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { decodePng, encodePng, flatten, enclosingCircle } from './png.mjs';

const ART = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(ART, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const IOS = path.join(ROOT, 'ios/App/App/Assets.xcassets');
const PUBLIC = path.join(ROOT, 'public');

const BG_TOP = '#24476b'; // same gradient as #boot in index.html
const BG_BOTTOM = '#1b2a3a'; // the game's dusk blue
const SKY_TOP = '#262b78';

// ---- layout constants -----------------------------------------------------------------------------
const MASTER_R = 384; // hero enclosing radius in the 1024 master (+ nudge below stays inside the 80% maskable safe circle)
const MASTER_DX = 26; // optical nudge: the pod pulls the enclosing circle to the right of the planet
const MASTER_DY = 8; // ...and the planet is bottom-heavy, so the circle centre sits a touch low
const FG_R = 304; // adaptive foreground: 66dp safe circle = radius 313 of a 1024 canvas
const BG_STARS_SCALE = 0.74; // adaptive background: pull the stars into the always-visible 72dp window
const SPLASH_HERO_R = 300; // hero enclosing radius, splash design units
const SPLASH_LOCKUP_W = 900; // lockup width in splash design units (the wordmark)
const SPLASH_FRAC_ANDROID = 0.6; // lockup width as a fraction of the SHORT screen side
const SPLASH_FRAC_IOS = 0.38; // lockup width as a fraction of the 2732 square (iPhone crops to ~46% of it)

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// Android splash sizes (match the files Capacitor ships so nothing in the native projects changes shape)
const SPLASH_PORT = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const SPLASH_LAND = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };

// ---- helpers ----------------------------------------------------------------------------------------
const read = (p) => fs.readFileSync(p, 'utf8');
const f = (n) => +n.toFixed(3);
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log('  wrote', path.relative(ROOT, file), Buffer.isBuffer(data) ? `(${(data.length / 1024).toFixed(1)} KB)` : '');
}
const between = (s, a, b) => {
  const i = s.indexOf(a);
  const j = s.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`markers ${a} / ${b} not found`);
  return s.slice(i + a.length, j);
};
const heroTransform = (c, targetR, cx = 512, cy = 512) =>
  `translate(${f(cx)} ${f(cy)}) scale(${f(targetR / c.r)}) translate(${f(-c.cx)} ${f(-c.cy)})`;

let browser;
let page;
async function launch() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  const executablePath = candidates.find((p) => fs.existsSync(p));
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  page = await browser.newPage({ deviceScaleFactor: 1 });
}

/** Rasterise an SVG string to an exact w x h PNG (RGBA). `shape` clips: 'circle' | number (corner radius px). */
async function render(svg, w, h, { shape = null, prep = null } = {}) {
  await page.setViewportSize({ width: w, height: h });
  let clip = '';
  if (shape === 'circle') clip = 'border-radius:50%;';
  else if (shape) clip = `border-radius:${shape}px;`;
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}` +
      `#c{width:${w}px;height:${h}px;overflow:hidden;${clip}}svg{display:block;width:100%;height:100%}</style></head>` +
      `<body><div id="c">${svg}</div></body></html>`,
  );
  if (prep) {
    await page.evaluate(({ hide, transforms }) => {
      for (const id of hide) document.getElementById(id).style.display = 'none';
      for (const [id, t] of Object.entries(transforms)) document.getElementById(id).setAttribute('transform', t);
    }, prep);
  }
  return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}

const opaque = (buf) => encodePng(flatten(decodePng(buf)));
const alpha = (buf) => encodePng(decodePng(buf)); // re-compressed, alpha kept

// ---- main -------------------------------------------------------------------------------------------
await launch();
try {
  let icon = read(path.join(ART, 'icon.svg'));

  // 1. measure the hero (planet + dome + pod) so every layout is computed, not eyeballed
  console.log('measuring hero');
  const raw = await render(icon, 1024, 1024, { prep: { hide: ['sky', 'stars', 'smoke'], transforms: { hero: 'translate(0 0)' } } });
  const hero = enclosingCircle(decodePng(raw));
  console.log(`  hero enclosing circle: centre (${f(hero.cx)}, ${f(hero.cy)}) r ${f(hero.r)}`);

  // keep icon.svg standalone-correct: bake the master transform into the file
  const masterT = heroTransform(hero, MASTER_R, 512 + MASTER_DX, 512 + MASTER_DY);
  icon = icon.replace(/<g id="hero" transform="[^"]*">/, `<g id="hero" transform="${masterT}">`);
  write(path.join(ART, 'icon.svg'), icon);

  // 2. app icon master + iOS
  console.log('master / iOS / web icons');
  const master = (size, opts) => render(icon, size, size, opts);
  write(path.join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'), opaque(await master(1024)));
  write(path.join(ART, 'icon-1024.png'), opaque(await master(1024)));

  // 3. web / PWA
  write(path.join(PUBLIC, 'icon-192.png'), opaque(await master(192)));
  write(path.join(PUBLIC, 'icon-512.png'), opaque(await master(512)));
  write(path.join(PUBLIC, 'apple-touch-icon.png'), opaque(await master(180)));
  write(path.join(PUBLIC, 'favicon.svg'), read(path.join(ART, 'favicon.svg')));
  write(
    path.join(PUBLIC, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'Nova Colony',
        short_name: 'Nova Colony',
        description: 'A cozy low-poly colony builder: grow a crashed escape pod into a gleaming titanium colony.',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'any',
        background_color: BG_BOTTOM,
        theme_color: BG_BOTTOM,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // the hero sits inside the 80% maskable safe zone, so the same art works masked
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      null,
      2,
    ) + '\n',
  );

  // 4. Android launcher icons
  console.log('Android launcher icons');
  const fgT = heroTransform(hero, FG_R);
  const starsT = `translate(512 512) scale(${BG_STARS_SCALE}) translate(-512 -512)`;
  for (const [d, k] of Object.entries(DENSITY)) {
    const dir = path.join(RES, `mipmap-${d}`);
    const legacy = 48 * k;
    const full = 108 * k;
    write(path.join(dir, 'ic_launcher.png'), alpha(await master(legacy, { shape: legacy * 0.18 })));
    write(path.join(dir, 'ic_launcher_round.png'), alpha(await master(legacy, { shape: 'circle' })));
    write(
      path.join(dir, 'ic_launcher_foreground.png'),
      alpha(await master(full, { prep: { hide: ['sky', 'stars'], transforms: { hero: fgT } } })),
    );
    write(
      path.join(dir, 'ic_launcher_background.png'),
      opaque(await master(full, { prep: { hide: ['hero'], transforms: { stars: starsT } } })),
    );
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  write(path.join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
  write(path.join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);
  // colour kept as the sky's top colour (fallback / tooling that reads the colour resource)
  write(
    path.join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${SKY_TOP}</color>\n</resources>\n`,
  );

  // 5. splash: compose splash.svg from the template + the hero in icon.svg
  console.log('splash');
  const heroDefs = between(icon, '<!-- hero-defs:begin -->', '<!-- hero-defs:end -->');
  const heroBody = between(icon, '<!-- hero:begin -->', '<!-- hero:end -->');
  const splash = read(path.join(ART, 'splash.template.svg'))
    .replace('<!--HERO_DEFS-->', heroDefs.trim())
    .replace('<!--HERO-->', heroBody.trim())
    .replaceAll('@HERO_CX@', f(hero.cx))
    .replaceAll('@HERO_CY@', f(hero.cy))
    .replaceAll('@HERO_K@', f(SPLASH_HERO_R / hero.r));
  write(path.join(ART, 'splash.svg'), splash);

  /** splash.svg re-framed for a w x h canvas: lockup centred, `frac` of min(w,h) wide, bg filling the frame. */
  const splashFor = (w, h, frac, minSide = Math.min(w, h)) => {
    const s = (frac * minSide) / SPLASH_LOCKUP_W;
    const vw = w / s;
    const vh = h / s;
    const x = -vw / 2;
    const y = -vh / 2;
    return splash
      .replace(/viewBox="[^"]*"/, `viewBox="${f(x)} ${f(y)} ${f(vw)} ${f(vh)}"`)
      .replace(/<rect id="bg"[^>]*\/>/, `<rect id="bg" x="${f(x)}" y="${f(y)}" width="${f(vw)}" height="${f(vh)}" fill="url(#gBg)"/>`);
  };
  const splashPng = async (w, h, frac) => opaque(await render(splashFor(w, h, frac), w, h));

  for (const [d, [w, h]] of Object.entries(SPLASH_PORT)) write(path.join(RES, `drawable-port-${d}/splash.png`), await splashPng(w, h, SPLASH_FRAC_ANDROID));
  for (const [d, [w, h]] of Object.entries(SPLASH_LAND)) write(path.join(RES, `drawable-land-${d}/splash.png`), await splashPng(w, h, SPLASH_FRAC_ANDROID));
  write(path.join(RES, 'drawable/splash.png'), await splashPng(480, 320, SPLASH_FRAC_ANDROID));

  const iosSplash = await splashPng(2732, 2732, SPLASH_FRAC_IOS);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    write(path.join(IOS, 'Splash.imageset', name), iosSplash);
  }

  console.log('done');
} finally {
  await browser.close();
}

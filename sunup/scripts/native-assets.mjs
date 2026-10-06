// Renders the Sunup icon and splash screens for the Android and iOS projects from public/icon.svg.
// Needs Playwright with Chromium available (not a project dependency): node scripts/native-assets.mjs
import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const svg = readFileSync(`${root}public/icon.svg`, 'utf8');
const square = svg.replace('rx="112"', 'rx="0"');
// Adaptive icons are cropped to a circle or squircle: shrink the sun into the 66/108 safe zone.
const foreground = square.replace(/(<g stroke[\s\S]*<\/svg>)/, (art) => `<g transform="translate(256 256) scale(0.7) translate(-256 -256)">${art.replace('</svg>', '')}</g></svg>`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();

async function render(path, width, height, html, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden">${html}</body>`);
  await page.screenshot({ path, omitBackground: transparent });
}

const sized = (art, size) => art.replace('<svg ', `<svg width="${size}" height="${size}" `);

// ---------------------------------------------------------------- Android
const res = `${root}android/app/src/main/res`;
if (existsSync(res)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const icon = Math.round(48 * scale);
    const fg = Math.round(108 * scale);
    await render(`${res}/mipmap-${name}/ic_launcher.png`, icon, icon, sized(svg, icon), true);
    await render(
      `${res}/mipmap-${name}/ic_launcher_round.png`,
      icon,
      icon,
      `<div style="width:${icon}px;height:${icon}px;border-radius:50%;overflow:hidden">${sized(square, icon)}</div>`,
      true,
    );
    await render(`${res}/mipmap-${name}/ic_launcher_foreground.png`, fg, fg, sized(foreground, fg));
  }
  // Splash screens (Android 11 and older): cream background, icon in the middle.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const file = `${res}/${dir}/splash.png`;
    if (!existsSync(file)) continue;
    const { width, height } = await page.evaluate(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.src = src;
        }),
      `data:image/png;base64,${readFileSync(file).toString('base64')}`,
    );
    const icon = Math.round(Math.min(width, height) * 0.3);
    await render(file, width, height, `<div style="width:100%;height:100%;background:#FFF6EC;display:grid;place-items:center">${sized(svg, icon)}</div>`);
  }
}

// ---------------------------------------------------------------- iOS
const assets = `${root}ios/App/App/Assets.xcassets`;
if (existsSync(assets)) {
  // App Store icons must be square and opaque; iOS rounds the corners.
  await render(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`, 1024, 1024, sized(square, 1024));
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await render(`${assets}/Splash.imageset/${name}`, 2732, 2732, `<div style="width:100%;height:100%;background:#FFF6EC;display:grid;place-items:center">${sized(svg, 560)}</div>`);
  }
}

await browser.close();
console.log('native icons and splash screens written');

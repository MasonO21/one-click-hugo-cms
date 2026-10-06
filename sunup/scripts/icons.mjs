// Renders public/icon.svg to the PNG sizes the manifest and iOS need.
// Needs Playwright with Chromium available (not a project dependency): node scripts/icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
// Rounded icons keep transparent corners; iOS and maskable icons are full-bleed
// squares (the OS applies its own mask, and the art sits inside the safe zone).
const targets = [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-180.png', 180, false],
  ['icon-maskable-512.png', 512, false],
];
for (const [name, size, rounded] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const art = (rounded ? svg : svg.replace('rx="112"', 'rx="0"')).replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<body style="margin:0;background:transparent">${art}</body>`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log('icons written');

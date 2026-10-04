#!/usr/bin/env node
/**
 * Writes the icon and splash sources (assets/source/*.svg) from one drawing of the brand mark, the
 * same neon fridge as src/components/Logo.tsx. Render them to PNG with:
 *
 *   node scripts/brand-assets.mjs && CHROMIUM_PATH=<chromium> node scripts/brand-assets.mjs --png
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'assets/source');
const C = { magenta: '#FF007F', blue: '#007FFF', orange: '#FF5F00', cyan: '#38D6FF', navy: '#0B1530', bg: '#070B16' };
const BEAT = '26,60 40,60 45.5,49 51.5,71 56.5,54 60.5,60 74,60';

/** The mark in a 100x100 box (kept in step with FridgeMark in Logo.tsx). */
function mark(id, { glow = true, mono = false } = {}) {
  if (mono) {
    // Android themed icons use only the shape: the fridge outline and the heartbeat.
    return `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
      <rect x="24" y="6" width="52" height="80" rx="11" stroke-width="5"/>
      <line x1="33" y1="87" x2="33" y2="94" stroke-width="5"/><line x1="67" y1="87" x2="67" y2="94" stroke-width="5"/>
      <line x1="37" y1="19" x2="37" y2="28" stroke-width="3.4"/><line x1="37" y1="40" x2="37" y2="50" stroke-width="3.4"/>
      <line x1="31" y1="34" x2="69" y2="34" stroke-width="3.4"/>
      <polyline points="${BEAT}" stroke-width="4.6"/></g>`;
  }
  return `<defs>
      <linearGradient id="frame-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.magenta}"/><stop offset="1" stop-color="${C.orange}"/></linearGradient>
      <linearGradient id="door-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.blue}"/></linearGradient>
      <filter id="blur-${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>
    </defs>
    ${glow ? `<g filter="url(#blur-${id})" opacity="0.9"><rect x="24" y="6" width="52" height="80" rx="11" fill="none" stroke="${C.magenta}" stroke-width="5"/><polyline points="${BEAT}" fill="none" stroke="${C.magenta}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="31" y="13" width="38" height="66" rx="6" fill="none" stroke="${C.cyan}" stroke-width="3"/></g>` : ''}
    <rect x="24" y="6" width="52" height="80" rx="11" fill="${C.navy}" stroke="url(#frame-${id})" stroke-width="4"/>
    <line x1="33" y1="87" x2="33" y2="94" stroke="${C.magenta}" stroke-width="4" stroke-linecap="round"/>
    <line x1="67" y1="87" x2="67" y2="94" stroke="${C.orange}" stroke-width="4" stroke-linecap="round"/>
    <rect x="31" y="13" width="38" height="66" rx="6" fill="none" stroke="url(#door-${id})" stroke-width="2.6"/>
    <line x1="31" y1="34" x2="69" y2="34" stroke="${C.cyan}" stroke-width="2.6"/>
    <line x1="37" y1="19" x2="37" y2="28" stroke="${C.cyan}" stroke-width="2.6" stroke-linecap="round"/>
    <line x1="37" y1="40" x2="37" y2="50" stroke="${C.cyan}" stroke-width="2.6" stroke-linecap="round"/>
    <polyline points="${BEAT}" fill="none" stroke="#FF3D9E" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The mark scaled to `size` px and centred in a 1024 canvas (nudged up a little to look centred). */
const placed = (size, id, opts) => `<g transform="translate(${512 - size / 2} ${502 - size / 2}) scale(${size / 100})">${mark(id, opts)}</g>`;

const tile = `<defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E8CFF"/><stop offset="0.5" stop-color="#7A5CE0"/><stop offset="1" stop-color="#FF6A1A"/></linearGradient>
    <radialGradient id="shine" cx="0.3" cy="0.2" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#tile)"/><rect width="1024" height="1024" fill="url(#shine)"/>
  <rect x="330" y="200" width="364" height="660" rx="90" fill="#000" opacity="0.35" filter="url(#drop)"/>`;

const svg = (body) => `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${body}</svg>\n`;

const files = {
  // iOS / store icon: full-bleed square, the system rounds the corners.
  'icon.svg': svg(`${tile}${placed(700, 'icon')}`),
  // Android adaptive icon: the gradient tile behind, the mark inside the safe zone in front.
  'android-background.svg': svg(tile.replace(/<rect x="330"[^>]+>/, '')),
  'foreground.svg': svg(placed(500, 'fg')),
  'monochrome.svg': svg(`<g transform="translate(${512 - 280} ${502 - 280}) scale(5.6)">${mark('mono', { mono: true })}</g>`),
  // Splash: the glowing mark on the app's dark background (the colour is set in app.json).
  'splash.svg': svg(placed(820, 'splash')),
  // The mark alone, for documents and the web.
  'logo.svg': `<svg width="512" height="512" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${mark('logo')}</svg>\n`,
};
for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(src, name), body);
console.log(`Wrote ${Object.keys(files).length} SVG sources to assets/source/`);

if (process.argv.includes('--png')) {
  const { chromium } = await import('playwright-core');
  const jobs = [
    ['icon.svg', 'icon.png', 1024, false],
    ['android-background.svg', 'android-icon-background.png', 1024, false],
    ['foreground.svg', 'android-icon-foreground.png', 1024, true],
    ['monochrome.svg', 'android-icon-monochrome.png', 1024, true],
    ['splash.svg', 'splash-icon.png', 1024, true],
    ['icon.svg', 'favicon.png', 48, false],
  ];
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [from, to, size, transparent] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const body = fs.readFileSync(path.join(src, from), 'utf8').replace('<svg ', `<svg style="width:${size}px;height:${size}px;display:block" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
    await page.screenshot({ path: path.join(root, 'assets', to), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
  console.log('Rendered PNGs to assets/');
}

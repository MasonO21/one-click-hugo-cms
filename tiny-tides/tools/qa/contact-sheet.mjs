// Renders every creature form to a PNG contact sheet for visual review.
// Usage: node tools/contact-sheet.mjs [outfile] [familyId] [--hat=partyhat]
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = args[0] || '/tmp/tt/sheet.png';
const only = args[1];
const hat = (process.argv.find((a) => a.startsWith('--hat=')) || '').slice(6) || null;
const hats = process.argv.includes('--hats');
fs.mkdirSync('/tmp/tt', { recursive: true });
const tmp = '/tmp/tt/sheet-bundle.js';
await build({ entryPoints: [path.join(root, 'tools/qa/sheet-entry.js')], bundle: true, format: 'iife', outfile: tmp, logLevel: 'error' });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.setContent('<!doctype html><body style="margin:0"><canvas id=c></canvas>');
await page.addScriptTag({ content: fs.readFileSync(tmp, 'utf8') });
const size = await page.evaluate(({ only, hat, hats }) => {
  const { FORMS, FAMILY_IDS, formsOfFamily, getSprite } = window.Sheet;
  const fams = FAMILY_IDS.filter((f) => !only || f === only);
  const cell = 170, cols = hats ? 9 : 7, cv = document.getElementById('c');
  cv.width = cols * cell; cv.height = fams.length * (cell + 6);
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, '#cdeffa'); g.addColorStop(1, '#a6dcf0');
  c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  fams.forEach((fid, row) => {
    const ids = formsOfFamily(fid); // base, then (b,m) pairs by trait
    const HATS = ['partyhat', 'crownhat', 'bow', 'shades', 'flowerhat', 'cap', 'halo', 'wizard', 'headphones'];
    const order = hats ? HATS.map(() => ids[0]) : [ids[0], ids[1], ids[3], ids[5], ids[2], ids[4], ids[6]];
    order.forEach((id, col) => {
      const s = getSprite(id, { hat: hats ? HATS[col] : hat, blink: false });
      c.drawImage(s.canvas, col * cell + 5, row * (cell + 6), cell - 10, cell - 10);
      c.fillStyle = '#2b1248'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
      c.fillText(hats ? HATS[col] : FORMS[id].name, col * cell + cell / 2, row * (cell + 6) + cell - 6);
    });
  });
  return [cv.width, cv.height];
}, { only, hat, hats });
const el = await page.$('#c');
await el.screenshot({ path: out });
await browser.close();
console.log('wrote', out, size.join('x'));

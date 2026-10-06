// Renders app/store icons from tools/icon.html (needs the dev server on :8123), then strips alpha where stores require it.
// node tools/render-icons.mjs
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
async function render(query, out) {
  await page.goto(`http://localhost:8123/tools/icon.html?${query}`);
  await page.waitForFunction(() => window.__done, null, { timeout: 15000 });
  const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', out);
}
// store icons: full-bleed, opaque (stores apply their own corner mask)
await render('size=512&maskable', 'icons/play-icon-512.png');
await render('size=1024&maskable', 'icons/ios-icon-1024.png');
await render('size=180&maskable', 'icons/apple-touch-icon.png');
// Android adaptive icon foregrounds (108dp at each density)
const dens = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [d, px] of Object.entries(dens)) await render(`size=${px}&fg`, `android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`);
await browser.close();
// no alpha channel for store uploads / iOS
execSync(`python3 -c "
from PIL import Image
for f in ['icons/play-icon-512.png','icons/ios-icon-1024.png','icons/apple-touch-icon.png','icons/feature-1024x500.png']:
    im=Image.open(f); bg=Image.new('RGB',im.size,(42,26,46)); bg.paste(im,mask=im.split()[3] if im.mode=='RGBA' else None); bg.save(f); print(f, bg.mode, bg.size)
"`, { stdio: 'inherit' });

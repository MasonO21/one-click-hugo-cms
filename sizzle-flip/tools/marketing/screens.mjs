// Store screenshots with captions, captured from the real game (needs the dev server on :8123):
//   node tools/marketing/screens.mjs [iphone|ipad|play ...] [--only 03-space]
//   → store/ios/   1290×2796  App Store, iPhone 6.9" (also used for 6.5")
//     store/ipad/  2064×2752  App Store, iPad 13"
//     store/play/  1080×1920  Google Play, phone
// Each scene plays a level along its verified route (tools/marketing/kit.mjs) and freezes at a chosen frame; the
// capture is then framed under a caption with tools/marketing/frame.html.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame, frames, untilDue } from './kit.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FORMATS = {
  iphone: { dir: 'store/ios', W: 1290, H: 2796, game: { width: 430, height: 932, dpr: 3 }, head: 124, sub: 46, capTop: 170 },
  ipad: { dir: 'store/ipad', W: 2064, H: 2752, game: { width: 1032, height: 1376, dpr: 2 }, head: 150, sub: 56, capTop: 150 },
  play: { dir: 'store/play', W: 1080, H: 1920, game: { width: 360, height: 640, dpr: 3 }, head: 92, sub: 36, capTop: 96 },
};

// shot = which flip of the route; frame = frames (1/30 s) after that flip; aim = freeze while aiming it
export const SCENES = [
  { id: '01-flip', level: 3, shot: 1, frame: 12, head: 'Flip the sausage.<br><em>Land the bun!</em>', sub: 'A squishy physics puzzler', colors: ['#ff8a4c', '#c9341f'] },
  { id: '02-aim', level: 101, shot: 1, aim: true, head: 'Drag back, aim…<br><em>FLIP!</em>', sub: 'One finger. Easy to learn, hard to master.', colors: ['#9ad8ff', '#3576c9'] },
  { id: '03-space', level: 168, shot: 0, frame: 21, head: '10 wild worlds,<br><em>even outer space</em>', sub: 'Lasers, UFOs and low gravity', colors: ['#6a46b5', '#1c1240'] },
  { id: '04-characters', cast: ['dragon', 'banana', 'rocket', 'dachshund', 'butter', 'shark', 'rubberchicken', 'narwhal', 'sausage', 'pickle', 'croc', 'corn'], head: 'Flip as a banana…<br><em>or a dragon!</em>', sub: 'Same bounce, brand-new look', colors: ['#ffa3cf', '#c4517f'], hl: '#fff3a3' },
  { id: '05-backyard', level: 50, shot: 2, frame: 18, head: 'Toasters, trampolines<br>& <em>a very good dog</em>', sub: 'Every level is a new contraption', colors: ['#86d86f', '#2f7d32'] },
  { id: '06-heaven', level: 182, shot: 2, frame: 18, head: 'Bounce your way to<br><em>Hot Dog Heaven</em>', sub: 'Clouds, fries and bouncy donuts', colors: ['#ffd9a8', '#f08a5d'] },
  { id: '07-stars', level: 182, win: true, head: '200 levels.<br><em>600 stars.</em>', sub: 'Beat par for three stars', colors: ['#ffd25e', '#df7d00'], hl: '#fff3a3' },
  { id: '08-shop', shop: 'critters', head: 'Collect <em>130</em><br>silly characters', sub: 'A dachshund, a shark, a longcat…', colors: ['#7bd45a', '#2c7a1c'] },
];

async function captureRaw(browser, fmt, sc, file) {
  if (sc.cast) return;                                     // drawn by the frame page itself
  const page = await openGame(browser, { ...fmt.game, save: { hotdogs: 500, stars: { 0: 3, 1: 3, 2: 3 } } });
  try {
    if (sc.shop) {
      await page.evaluate((tab) => { const a = window.__app; a.ui.shopTab = tab; a.ui.show('scr-shop'); }, sc.shop);
      await frames(page, 30, 33);
      await page.screenshot({ path: file });
      return;
    }
    await page.evaluate(([i, c]) => window.__mk.start(i, { character: c }), [sc.level, sc.character || 'sausage']);
    let shot = 0;
    while (await untilDue(page)) {
      for (let k = 1; k <= 8; k++) { await page.evaluate((k) => window.__mk.aim(k), k / 8); await page.clock.runFor(33); }
      if (!sc.win && shot === sc.shot && sc.aim) { await page.screenshot({ path: file }); return; }
      await page.evaluate(() => window.__mk.release());
      if (!sc.win && shot === sc.shot) { await frames(page, sc.frame, 33); await page.screenshot({ path: file }); return; }
      shot++;
    }
    if (!sc.win) throw new Error(`${sc.id}: the route ended before shot ${sc.shot + 1}`);
    await frames(page, 100, 33);
    await page.screenshot({ path: file });
  } finally { await page.close(); }
}

async function compose(browser, fmt, sc, rawFile, outFile) {
  const page = await browser.newPage({ viewport: { width: fmt.W, height: fmt.H }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8123/tools/marketing/frame.html');
  if (sc.cast) {
    await page.evaluate((o) => window.renderCast(o), { W: fmt.W, H: fmt.H, head: sc.head, sub: sc.sub, colors: sc.colors, hl: sc.hl, cast: sc.cast, cols: fmt.W / fmt.H > 0.7 ? 4 : 3, layout: { capTop: fmt.capTop, headSize: fmt.head, subSize: fmt.sub } });
    await page.screenshot({ path: outFile, type: 'jpeg', quality: 92 });
    await page.close();
    return;
  }
  const img = 'data:image/png;base64,' + fs.readFileSync(rawFile).toString('base64');
  const aspect = fmt.game.width / fmt.game.height;
  await page.evaluate(async ({ o, aspect, W, H }) => {
    await window.render({ ...o, layout: { ...o.layout, phoneW: 100, phoneH: 100, radius: 0, phoneGap: 0 } });
    // size the framed capture to the space under the caption; it runs a little off the bottom edge
    const u = W / 1290, cap = document.getElementById('cap').getBoundingClientRect();
    const gap = 64 * u, border = 12 * u, avail = H - cap.bottom - gap + 70 * u;
    const w = Math.min(W * 0.84, (avail - 2 * border) * aspect + 2 * border);
    const h = (w - 2 * border) / aspect + 2 * border;
    await window.render({ ...o, layout: { ...o.layout, phoneW: w, phoneH: h, radius: 70 * u, phoneGap: gap } });
  }, { o: { W: fmt.W, H: fmt.H, head: sc.head, sub: sc.sub, colors: sc.colors, hl: sc.hl, img, layout: { capTop: fmt.capTop, headSize: fmt.head, subSize: fmt.sub } }, aspect, W: fmt.W, H: fmt.H });
  await page.screenshot({ path: outFile, type: 'jpeg', quality: 92 });
  await page.close();
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const which = args.filter(a => FORMATS[a]);
const formats = which.length ? which : Object.keys(FORMATS);
const tmp = path.join('/tmp', 'sizzle-store-raw');
fs.mkdirSync(tmp, { recursive: true });
const browser = await launch();
for (const name of formats) {
  const fmt = FORMATS[name];
  const dir = path.join(root, fmt.dir);
  fs.mkdirSync(dir, { recursive: true });
  if (!only) for (const f of fs.readdirSync(dir)) if (/\.(jpe?g|png)$/.test(f)) fs.unlinkSync(path.join(dir, f));
  for (const sc of SCENES) {
    if (only && sc.id !== only) continue;
    const raw = path.join(tmp, `${name}-${sc.id}.png`);
    await captureRaw(browser, fmt, sc, raw);
    await compose(browser, fmt, sc, raw, path.join(dir, `${sc.id}.jpg`));
    console.log(`${fmt.dir}/${sc.id}.jpg  ${fmt.W}×${fmt.H}`);
  }
}
await browser.close();

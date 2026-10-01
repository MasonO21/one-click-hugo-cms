// Generates the App Store artwork with Playwright + the built game.
//   node tools/make_assets.js [icon|shots|all]
// icon  -> ios/NightPrecinct/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png  (1024x1024 PNG, no transparency)
// shots -> appstore/screenshots/{iphone-6.9,iphone-6.5,ipad-13}/NN-name.png
//   node tools/make_assets.js shots [--raw]
// The screenshots are rendered from the game in a browser at the exact pixel sizes App Store Connect accepts:
// a caption on top and the real game screen below. --raw writes plain full-screen captures instead.
// Replace them with captures from the iOS Simulator if you prefer (Xcode: Device > Screenshot).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const testsLib = path.join(ROOT, 'game', 'tests', 'lib.js');
const { launch } = require(testsLib);
const what = process.argv[2] || 'all';

async function icon(b) {
  const svg = fs.readFileSync(path.join(__dirname, 'assets', 'icon.svg'), 'utf8');
  const p = await (await b.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })).newPage();
  await p.setContent(`<!doctype html><body style="margin:0;background:#050818">${svg}</body>`);
  const out = path.join(ROOT, 'ios', 'NightPrecinct', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await p.screenshot({ path: out, omitBackground: false, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  // Flatten: a PNG from Chromium is RGBA. Apple rejects icons with an alpha channel, so convert with Python if PIL exists.
  try { execFileSync('python3', ['-c', `from PIL import Image;im=Image.open(${JSON.stringify(out)}).convert('RGB');im.save(${JSON.stringify(out)})`]); console.log('icon (RGB, no alpha):', out); }
  catch (e) { console.log('icon written (install Pillow to strip the alpha channel: pip install pillow):', out); }
  await p.context().close();
}

const SIZES = [
  { dir: 'iphone-6.9', w: 1320, h: 2868, vw: 440, vh: 956, dsf: 3 },
  { dir: 'iphone-6.5', w: 1284, h: 2778, vw: 428, vh: 926, dsf: 3 },
  { dir: 'ipad-13', w: 2064, h: 2752, vw: 1032, vh: 1376, dsf: 2 },
];

/* Each scene sets up a believable mid-game state through the debug hooks. The caption is two lines: a lead-in and an accent line.
   Keep captions true to the game (App Review 2.3): every claim here is something the screen below shows or the game does. */
const SCENES = [
  { name: '01-hq', world: 'police', tab: 'hq', big: true, cap: ['TAP. ARREST.', 'GET PAID.'], setup: `t.owned=[60,45,30,20,12,8,4,2,1,0,0,0,0,0,0,0]; t.funds=8.4e9; t.run=1.6e11; t.life=2.5e11; t.promos=4;` },
  { name: '02-roster', world: 'police', tab: 'roster', cap: ['HIRE A WHOLE', 'POLICE FORCE'], setup: `t.owned=[80,60,44,30,20,12,6,3,1,0,0,0,0,0,0,0]; t.funds=2.1e10; t.run=4e11; t.life=6e11; t.promos=5;` },
  { name: '03-upgrades', world: 'police', tab: 'upgrades', cap: ['GEAR UP FOR', 'BIGGER BUSTS'], setup: `t.owned=[70,50,36,22,14,8,4,2,0,0,0,0,0,0,0,0]; t.funds=1.6e9; t.run=8e10; t.life=1.2e11; t.promos=3;` },
  { name: '04-ops', world: 'police', tab: 'ops', cap: ['RUN CASES FOR', 'BADGES & CRATES'], setup: `t.owned=[70,50,36,22,14,8,4,2,0,0,0,0,0,0,0,0]; t.funds=3e9; t.run=8e10; t.life=1.2e11; t.promos=3; t.badges=340; t.crates.std=2; t.crates.elite=1;` },
  { name: '05-fire', world: 'fire', tab: 'hq', big: true, cap: ['THEN TAKE ON', 'THE FIRE STATION'], setup: `t.owned=[40,32,22,14,8,4,2,0,0,0,0,0,0,0,0,0]; t.funds=2.6e8; t.run=6e9; t.life=1e10; t.promos=3;` },
  { name: '06-ems', world: 'ems', tab: 'roster', cap: ['AND RACE THE', 'CLOCK IN EMS'], setup: `t.owned=[30,22,15,9,5,2,1,0,0,0,0,0,0,0,0,0]; t.funds=9e7; t.run=2e9; t.life=3e9; t.promos=2;` },
];
const ACCENT = { police: ['#ffc53d', '#1b2a7a', '#5a1230'], fire: ['#ff8a2b', '#5a1a08', '#2a0d05'], ems: ['#3ef0cf', '#0b3d38', '#06201d'] };
const RAW = process.argv.includes('--raw');

/* Puts a raw game capture under a caption, at the exact App Store size. */
async function compose(b, sz, sc, rawFile, outFile) {
  const fonts = path.join(ROOT, 'game', 'fonts'), [acc, c1, c2] = ACCENT[sc.world];
  const capH = Math.round(sz.h * (sz.dir === 'ipad-13' ? .17 : .19)), pad = Math.round(sz.h * .03);
  const shotH = sz.h - capH - pad, shotW = Math.round(shotH * sz.vw / sz.vh), r = Math.round(shotW * .075);
  const fs1 = Math.round(capH * .30), fs2 = Math.round(capH * .40);
  const html = `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:BSD;font-weight:900;src:url('file://${fonts}/big-shoulders-display-latin-900-normal.woff2')}
  @font-face{font-family:BSD;font-weight:800;src:url('file://${fonts}/big-shoulders-display-latin-800-normal.woff2')}
  html,body{margin:0;width:${sz.w}px;height:${sz.h}px;overflow:hidden}
  body{background:radial-gradient(ellipse at 50% 18%,${c1} 0%,#070a19 62%),#070a19;position:relative;font-family:BSD,Impact,sans-serif}
  .bar{position:absolute;left:0;right:0;top:0;height:${Math.round(sz.h * .006)}px;background:repeating-linear-gradient(90deg,#ff3d55 0 ${Math.round(sz.w / 16)}px,#3d8bff ${Math.round(sz.w / 16)}px ${Math.round(sz.w / 8)}px)}
  .cap{position:absolute;left:0;right:0;top:0;height:${capH}px;display:grid;align-content:center;justify-items:center;text-align:center;text-transform:uppercase;line-height:.92;white-space:nowrap}
  .l1{font-weight:800;font-size:${fs1}px;letter-spacing:.04em;color:#fff}
  .l2{font-weight:900;font-size:${fs2}px;letter-spacing:.02em;color:${acc};text-shadow:0 0 ${Math.round(fs2 * .5)}px ${acc}55}
  .glow{position:absolute;left:50%;top:${capH + shotH * .5}px;width:${shotW * 1.3}px;height:${shotH * .9}px;transform:translate(-50%,-50%);background:radial-gradient(ellipse,${c2} 0%,transparent 70%);opacity:.9}
  img{position:absolute;left:${Math.round((sz.w - shotW) / 2)}px;top:${capH}px;width:${shotW}px;height:${shotH}px;border-radius:${r}px;box-shadow:0 0 0 ${Math.max(4, Math.round(sz.w * .005))}px #1c2452,0 ${Math.round(sz.h * .012)}px ${Math.round(sz.h * .03)}px rgba(0,0,0,.7)}
  </style><div class="bar"></div><div class="glow"></div><div class="cap"><div class="l1">${sc.cap[0]}</div><div class="l2">${sc.cap[1].replace('&', '&amp;')}</div></div><img src="file://${rawFile}">`;
  const tmp = path.join(ROOT, 'game', 'tests', '.build', 'compose.html'); fs.writeFileSync(tmp, html);
  const p = await (await b.newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 1 })).newPage();
  await p.goto('file://' + tmp); await p.evaluate(() => document.fonts.ready);
  /* shrink a caption line that would not fit on one line */
  await p.evaluate(() => { for (const e of document.querySelectorAll('.l1,.l2')) { const max = innerWidth * .9; if (e.offsetWidth > max) e.style.fontSize = (parseFloat(getComputedStyle(e).fontSize) * max / e.offsetWidth) + 'px'; } });
  await p.waitForTimeout(150);
  await p.screenshot({ path: outFile });
  await p.context().close();
  execFileSync('python3', ['-c', `from PIL import Image;im=Image.open(${JSON.stringify(outFile)}).convert('RGB');im.save(${JSON.stringify(outFile)})`]);
}

async function shots(b) {
  execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--target', 'native', '--debug', '--out', path.join(ROOT, 'game', 'tests', '.build', 'index.html')], { stdio: 'inherit' });
  const url = 'file://' + path.join(ROOT, 'game', 'tests', '.build', 'index.html');
  for (const sz of SIZES) {
    const dir = path.join(ROOT, 'appstore', 'screenshots', sz.dir); fs.mkdirSync(dir, { recursive: true });
    for (const sc of SCENES) {
      const ctx = await b.newContext({ viewport: { width: sz.vw, height: sz.vh }, deviceScaleFactor: sz.dsf });
      const p = await ctx.newPage();
      await p.addInitScript(() => { try { localStorage.setItem('night-precinct-v2', JSON.stringify({ v: 3, sound: false, music: false, haptics: false, tut: 99 })); } catch (e) { } });
      await p.goto(url); await p.waitForTimeout(500);
      await p.evaluate(({ world, setup, tab, big }) => {
        const N = window.__np, s = N.S(); s.done.police = true; s.done.fire = true; if (s.world !== world) N.doTravel(world);
        const t = N.S(); s.sound = false; s.music = false; s.tut = 99; t.badges = Math.max(t.badges, 120); t.bigScene = !!big; N.applySceneSize();
        eval(setup); t.perm.auto = 2; N.recalc(); N.checkAch();
        const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = '';
        for (let i = 0; i < 40; i++) { N.tickGame(); }
        N.showTab(tab);
      }, sc);
      await p.waitForTimeout(1600);
      await p.evaluate(() => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; document.getElementById('toasts').innerHTML = ''; });
      await p.waitForTimeout(300);
      const file = path.join(dir, sc.name + '.png');
      if (RAW) await p.screenshot({ path: file });
      else { const raw = path.join(ROOT, 'game', 'tests', '.build', 'raw-' + sz.dir + '-' + sc.name + '.png'); await p.screenshot({ path: raw }); await compose(b, sz, sc, raw, file); }
      await ctx.close();
    }
    console.log(sz.dir, sz.w + 'x' + sz.h, SCENES.length, 'screenshots');
  }
}

(async () => {
  const b = await launch();
  if (what === 'icon' || what === 'all') await icon(b);
  if (what === 'shots' || what === 'all') await shots(b);
  await b.close();
})();

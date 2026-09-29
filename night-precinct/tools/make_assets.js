// Generates the App Store artwork with Playwright + the built game.
//   node tools/make_assets.js [icon|shots|all]
// icon  -> ios/NightPrecinct/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png  (1024x1024 PNG, no transparency)
// shots -> appstore/screenshots/{iphone-6.9,iphone-6.5,ipad-13}/NN-name.png
// The screenshots are rendered from the game in a browser at the exact pixel sizes App Store Connect accepts.
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

/* Each scene sets up a believable mid-game state through the debug hooks. */
const SCENES = [
  { name: '01-hq', world: 'police', tab: 'hq', setup: `t.owned=[60,45,30,20,12,8,4,2,1,0,0,0,0,0,0,0]; t.funds=8.4e9; t.run=1.6e11; t.life=2.5e11; t.promos=4;` },
  { name: '02-roster', world: 'police', tab: 'roster', setup: `t.owned=[80,60,44,30,20,12,6,3,1,0,0,0,0,0,0,0]; t.funds=2.1e10; t.run=4e11; t.life=6e11; t.promos=5;` },
  { name: '03-upgrades', world: 'police', tab: 'upgrades', setup: `t.owned=[70,50,36,22,14,8,4,2,0,0,0,0,0,0,0,0]; t.funds=1.6e9; t.run=8e10; t.life=1.2e11; t.promos=3;` },
  { name: '04-ops', world: 'police', tab: 'ops', setup: `t.owned=[70,50,36,22,14,8,4,2,0,0,0,0,0,0,0,0]; t.funds=3e9; t.run=8e10; t.life=1.2e11; t.promos=3; t.badges=340; t.crates.std=2; t.crates.elite=1;` },
  { name: '05-fire', world: 'fire', tab: 'hq', setup: `t.owned=[40,32,22,14,8,4,2,0,0,0,0,0,0,0,0,0]; t.funds=2.6e8; t.run=6e9; t.life=1e10; t.promos=3;` },
  { name: '06-ems', world: 'ems', tab: 'roster', setup: `t.owned=[30,22,15,9,5,2,1,0,0,0,0,0,0,0,0,0]; t.funds=9e7; t.run=2e9; t.life=3e9; t.promos=2;` },
];

async function shots(b) {
  execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--target', 'native', '--debug', '--out', path.join(ROOT, 'game', 'tests', '.build', 'index.html')], { stdio: 'inherit' });
  const url = 'file://' + path.join(ROOT, 'game', 'tests', '.build', 'index.html');
  for (const sz of SIZES) {
    const dir = path.join(ROOT, 'appstore', 'screenshots', sz.dir); fs.mkdirSync(dir, { recursive: true });
    for (const sc of SCENES) {
      const ctx = await b.newContext({ viewport: { width: sz.vw, height: sz.vh }, deviceScaleFactor: sz.dsf });
      const p = await ctx.newPage();
      await p.addInitScript(() => { try { localStorage.setItem('night-precinct-v2', JSON.stringify({ v: 3, sound: false, haptics: false, welcomed: true })); } catch (e) { } });
      await p.goto(url); await p.waitForTimeout(500);
      await p.evaluate(({ world, setup, tab }) => {
        const N = window.__np, s = N.S(); s.done.police = true; s.done.fire = true; if (s.world !== world) N.doTravel(world);
        const t = N.S(); s.sound = false; t.badges = Math.max(t.badges, 120);
        eval(setup); t.perm.auto = 2; N.recalc(); N.checkAch();
        const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = '';
        for (let i = 0; i < 40; i++) { N.tickGame(); }
        N.showTab(tab);
      }, sc);
      await p.waitForTimeout(1600);
      await p.evaluate(() => { const m = document.getElementById('modal-root'); m.classList.remove('on'); m.innerHTML = ''; document.getElementById('toasts').innerHTML = ''; });
      await p.waitForTimeout(300);
      const file = path.join(dir, sc.name + '.png');
      await p.screenshot({ path: file });
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

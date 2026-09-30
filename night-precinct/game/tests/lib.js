// Shared helpers for the test scripts. Run everything with:  cd game/tests && npm i && npm test
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.env.NP_BUILD_OUT ? path.resolve(process.env.NP_BUILD_OUT) : path.join(__dirname, '.build', 'index.html');

/** Build the native page WITH the debug hooks (window.__np) the tests drive. */
function build() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--target', 'native', '--debug', '--out', OUT], { stdio: 'inherit' });
  return OUT;
}

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { }
  try { return require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); } catch (e) { }
  throw new Error('playwright not found. Run `npm install` in game/tests first.');
}

async function launch() {
  const { chromium } = loadPlaywright();
  const opts = {};
  for (const p of ['/opt/pw-browsers/chromium']) if (fs.existsSync(p)) opts.executablePath = p;
  return chromium.launch(opts);
}

const url = () => 'file://' + OUT;
module.exports = { ROOT, OUT, build, launch, url };

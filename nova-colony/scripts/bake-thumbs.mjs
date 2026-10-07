// Bakes the build-menu thumbnails: public/art/buildings/<BuildingDef.id>.webp and
// public/art/vehicles/<VehicleDef.id>.webp (192², RGBA, transparent) from the game's own procedural
// models. Serves the dev page thumbs.html with Vite on port 5343, renders every model in headless
// Chromium (SwiftShader), then encodes the straight-alpha RGBA dumps to WebP with Pillow.
//
// Usage: npm run bake:thumbs [-- --only id,id,… --sheet <dir> --out <dir> --no-blob --quality 85]
//   --only    bake a subset (stale files are only pruned on a full bake)
//   --sheet   also write labelled contact sheets (light card + dark HUD) into <dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5343;
const SIZE = 192;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = flag('--only') ? new Set(flag('--only').split(',').filter(Boolean)) : null;
const sheet = flag('--sheet') ? path.resolve(flag('--sheet')) : null;
const out = path.resolve(flag('--out') ?? path.join(root, 'public', 'art'));
const quality = flag('--quality') ?? '85';
const blob = !argv.includes('--no-blob');

const chromiumCandidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].filter(Boolean);
const executablePath = chromiumCandidates.find((p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
});

const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn', server: { host: '127.0.0.1', port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-thumbs-'));
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text();
      if (!t.includes('GPU stall')) console.error(`[page ${m.type()}]`, t);
    }
  });
  await page.goto(`http://127.0.0.1:${PORT}/thumbs.html?bake=1&size=${SIZE}&blob=${blob ? 1 : 0}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__thumbs && window.__thumbs.ready, null, { timeout: 120000 });
  const list = (await page.evaluate(() => window.__thumbs.list())).filter((e) => !only || only.has(e.id));
  const t0 = Date.now();
  let n = 0;
  const flat = [];
  for (const { kind, id } of list) {
    const r = await page.evaluate(([k, i]) => window.__thumbs.render(k, i), [kind, id]);
    if (r.flat) flat.push(id);
    const bytes = Buffer.from(r.data, 'base64');
    if (bytes.length !== SIZE * SIZE * 4) throw new Error(`${id}: unexpected pixel count ${bytes.length}`);
    fs.writeFileSync(path.join(tmp, `${kind}__${id}.rgba`), bytes);
    n++;
    process.stdout.write(`\r  rendered ${n}/${list.length}  ${id.padEnd(28)}`);
  }
  process.stdout.write(`\r  rendered ${n} models in ${((Date.now() - t0) / 1000).toFixed(1)} s${' '.repeat(30)}\n`);
  if (flat.length) console.log(`  steep (flat-model) camera for: ${flat.join(', ')}`);

  const py = spawnSync('python3', ['-I', path.join(root, 'scripts', 'bake-thumbs-encode.py'), tmp, out, '--size', String(SIZE), '--quality', String(quality), ...(sheet ? ['--sheet', sheet] : [])], { stdio: 'inherit' });
  if (py.status !== 0) throw new Error(`encoder exited with ${py.status}`);

  if (!only) {
    // the folders must hold exactly one file per id (tests/art.thumbs.test.ts)
    for (const [kind, folder] of [['building', 'buildings'], ['vehicle', 'vehicles']]) {
      const dir = path.join(out, folder);
      const want = new Set(list.filter((e) => e.kind === kind).map((e) => `${e.id}.webp`));
      for (const f of fs.readdirSync(dir)) {
        if (!want.has(f)) {
          fs.rmSync(path.join(dir, f));
          console.log(`  pruned stale ${folder}/${f}`);
        }
      }
    }
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  await server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

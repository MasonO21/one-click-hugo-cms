// Bundles the game into www/ (what Capacitor ships inside the iOS app).
// Flags: --demo (simulated purchases, for the shareable web preview)  --debug (dev hooks)  --watch
import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const demo = args.has('--demo'), debug = args.has('--debug'), watch = args.has('--watch');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

const opts = {
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, outfile: path.join(out, 'app.js'), format: 'iife',
  target: ['safari15', 'chrome100'], minify: !debug, sourcemap: debug ? 'inline' : false, legalComments: 'none', logLevel: 'info',
  define: { __DEMO__: String(demo), __DEBUG__: String(debug) },
};
const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(out, to));
copy('src/web/index.html', 'index.html');
copy('src/web/app.css', 'app.css');
const fontDir = path.join(root, 'node_modules/@fontsource/fredoka/files');
copy(path.relative(root, path.join(fontDir, 'fredoka-latin-500-normal.woff2')), 'fonts/fredoka-500.woff2');
copy(path.relative(root, path.join(fontDir, 'fredoka-latin-700-normal.woff2')), 'fonts/fredoka-700.woff2');
for (const f of ['icon-180.png', 'icon-192.png', 'icon-512.png']) if (fs.existsSync(path.join(root, 'assets/web', f))) fs.copyFileSync(path.join(root, 'assets/web', f), path.join(out, f));
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Tiny Tides', short_name: 'Tiny Tides', description: 'An idle tidepool ecosystem you check on a few times a day.',
  start_url: './index.html', display: 'standalone', orientation: 'portrait', background_color: '#1b1145', theme_color: '#1b1145',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2));

const cfg = fs.readFileSync(path.join(root, 'src/config.js'), 'utf8');
if (!debug && /masono21\.github\.io/.test(cfg)) console.warn('\n⚠  src/config.js still points at the placeholder policy/support URLs — host /site and update LINKS before App Store submission.\n');

if (watch) { const ctx = await context(opts); await ctx.watch(); console.log('watching…'); }
else { await build(opts); const kb = (fs.statSync(path.join(out, 'app.js')).size / 1024).toFixed(0); console.log(`built www/ (${kb} KB js${demo ? ', demo' : ''}${debug ? ', debug' : ''})`); }

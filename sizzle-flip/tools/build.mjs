// Build: bundles the game into a single self-contained dist/index.html (+ PWA files).
// Usage: node tools/build.mjs [--artifact]   (artifact mode inlines icons and drops the SW/manifest links)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifact = process.argv.includes('--artifact');
const out = path.join(root, artifact ? 'dist-artifact' : 'dist');
fs.mkdirSync(out, { recursive: true });

const res = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, minify: true, format: 'esm', target: ['es2020', 'safari14'], write: false, legalComments: 'none',
});
const js = res.outputFiles[0].text;

let css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
css = css.replace(/url\('assets\/fonts\/([^']+)'\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'assets/fonts', f)).toString('base64')})`);
const cssMin = (await esbuild.transform(css, { loader: 'css', minify: true })).code;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${cssMin}</style>`);
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>`);
const hash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);

if (artifact) {
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icons/icon-64.png')).toString('base64');
  html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '');
  html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="${icon}">`);
  html = html.replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '');
} else {
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'icons'))) fs.copyFileSync(path.join(root, 'icons', f), path.join(out, 'icons', f));
  fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace("'sizzle-flip-dev'", `'sizzle-flip-${hash}'`));
}
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`built ${path.relative(root, out)}/index.html  ${(html.length / 1024).toFixed(0)} KB  (js ${(js.length / 1024).toFixed(0)} KB)  v${hash}`);

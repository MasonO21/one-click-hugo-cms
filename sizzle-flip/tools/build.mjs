// Build: bundles the game into a single self-contained dist/index.html (+ PWA files).
// Usage: node tools/build.mjs [--artifact] [--smoke]   (artifact mode inlines icons and drops the SW/manifest links;
// --smoke adds the on-device self-test, tools/device-smoke.js, for emulator/simulator runs — never ship it)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const artifact = process.argv.includes('--artifact');
const smoke = process.argv.includes('--smoke');
const out = path.join(root, artifact ? 'dist-artifact' : 'dist');
fs.mkdirSync(out, { recursive: true });

const res = await esbuild.build({
  entryPoints: [path.join(root, smoke ? 'tools/smoke-entry.js' : 'src/main.js')],
  bundle: true, minify: true, format: 'esm', target: ['es2020', 'safari14'], write: false, legalComments: 'none',
});
const js = res.outputFiles[0].text;

let css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
css = css.replace(/url\('assets\/fonts\/([^']+)'\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'assets/fonts', f)).toString('base64')})`);
const cssMin = (await esbuild.transform(css, { loader: 'css', minify: true })).code;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${cssMin}</style>`);
html = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, ''); // dev-server only (unbundled source)
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>`);
// cache version covers every shipped file (a change to only an icon or the manifest must still update the PWA)
const hasher = crypto.createHash('sha1').update(html);
for (const f of ['manifest.webmanifest', 'sw.js', ...fs.readdirSync(path.join(root, 'icons')).sort().map(f => 'icons/' + f)]) hasher.update(fs.readFileSync(path.join(root, f)));
const { PRIVACY_HTML, SUPPORT_HTML } = await import(path.join(root, 'src/privacy.js'));
hasher.update(PRIVACY_HTML);
const hash = hasher.digest('hex').slice(0, 10);

if (artifact) {
  // Artifact pages are wrapped in their own document skeleton: emit only title, styles and body content.
  const title = html.match(/<title>[^<]*<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = `${title}\n<meta name="theme-color" content="#ef4b3c">\n${style}\n<script>window.__ARTIFACT = true;</script>\n${body}`;
} else {
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'icons'))) fs.copyFileSync(path.join(root, 'icons', f), path.join(out, 'icons', f));
  fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  // standalone privacy policy page: host dist/ and use <your-site>/privacy.html as the store listings' privacy URL
  fs.writeFileSync(path.join(out, 'privacy.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sizzle Flip — Privacy policy</title>
<style>body{font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:24px 18px 48px;color:#3a2216;background:#fff4e0}h3{font-size:28px;margin:0 0 6px}h4{margin:22px 0 4px}a{color:#1f86c4}</style></head><body>${PRIVACY_HTML}</body></html>\n`);
  // support page: the App Store listing's Support URL (<your-site>/support.html)
  fs.writeFileSync(path.join(out, 'support.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sizzle Flip — Help</title>
<style>body{font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:24px 18px 48px;color:#3a2216;background:#fff4e0}h3{font-size:28px;margin:0 0 6px}h4{margin:22px 0 4px}a{color:#1f86c4}</style></head><body>${SUPPORT_HTML}</body></html>\n`);
  fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace("'sizzle-flip-dev'", `'sizzle-flip-${hash}'`));
}
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`built ${path.relative(root, out)}/index.html${smoke ? ' WITH THE SELF-TEST (not for the stores)' : ''}  ${(html.length / 1024).toFixed(0)} KB  (js ${(js.length / 1024).toFixed(0)} KB)  v${hash}`);

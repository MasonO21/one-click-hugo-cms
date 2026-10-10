// Turns a web build into a page fragment for hosts that supply their own <html>/<head>/<body> shell (title first, then
// fonts, styles, markup, script).
// usage: SINGLE=1 npm run build && node scripts/build-artifact.mjs           (one self-contained file)
//        ARTIFACT=1 npm run build && node scripts/build-artifact.mjs --multi (the page plus its assets/ files, listed in
//          dist-artifact/files.json as { "assets/x": "dist-artifact/assets/x" } for the host's upload)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';

const multi = process.argv.includes('--multi');
const dir = new URL(multi ? '../dist-artifact/' : '../dist-single/', import.meta.url);
const src = readFileSync(new URL('index.html', dir), 'utf8');

const between = (s, open, close, from = 0) => {
  const a = s.indexOf(open, from);
  if (a < 0) return null;
  const b = s.indexOf(close, a + open.length);
  return { start: a, end: b + close.length, inner: s.slice(a + open.length, b) };
};

const title = between(src, '<title>', '</title>').inner;
const fonts = (src.match(/<link rel="(?:preconnect|stylesheet)"[^>]*fonts\.g[^>]*>/g) || []).join('\n');
const styles = [];
for (let i = 0, m; (m = between(src, '<style', '</style>', i)); i = m.end) styles.push(src.slice(m.start, m.end));
const body = between(src, '<body>', '</body>').inner.replace(/<script[\s\S]*?<\/script>/g, '').trim();
let tail;
if (multi) { // the built script and stylesheet stay files: their asset URLs resolve beside them, in assets/
  const js = src.match(/<script type="module"[^>]*src="([^"]+)"/)[1], css = (src.match(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+)"/) || [])[1];
  if (css) styles.push(`<link rel="stylesheet" href="${css}">`);
  tail = `<script type="module" src="${js}"></script>`;
} else {
  const scriptOpen = src.indexOf('<script type="module"');
  const scriptStart = src.indexOf('>', scriptOpen) + 1;
  const scriptEnd = src.indexOf('</script>', scriptStart);
  tail = `<script type="module">${src.slice(scriptStart, scriptEnd)}</script>`;
}

const out = [
  '<meta charset="utf-8">', // the artifact host's skeleton declares UTF-8 too; this keeps ★ and · right when the file is opened on its own
  `<title>${title}</title>`,
  fonts,
  ...styles,
  body,
  tail,
].join('\n');

writeFileSync(new URL('soulswarm.html', dir), out);
if (multi) {
  const files = {}; let bytes = 0, big = 0;
  for (const f of readdirSync(new URL('assets/', dir))) { const n = statSync(new URL('assets/' + f, dir)).size; files['assets/' + f] = 'dist-artifact/assets/' + f; bytes += n; big = Math.max(big, n); }
  writeFileSync(new URL('files.json', dir), JSON.stringify(files, null, 1));
  console.log(`wrote dist-artifact/soulswarm.html (${(out.length / 1024).toFixed(0)} KB) and files.json: ${Object.keys(files).length} files, ${(bytes / 1048576).toFixed(1)} MB, the largest ${(big / 1048576).toFixed(2)} MB`);
} else console.log(`wrote dist-single/soulswarm.html (${(out.length / 1024).toFixed(0)} KB, ${styles.length} style blocks)`);

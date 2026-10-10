// Turns the single-file build (dist-single/index.html) into a page fragment for hosts that
// supply their own <html>/<head>/<body> shell (title first, then fonts, styles, markup, script).
// usage: SINGLE=1 npm run build && node scripts/build-artifact.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');

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
const scriptOpen = src.indexOf('<script type="module"');
const scriptStart = src.indexOf('>', scriptOpen) + 1;
const scriptEnd = src.indexOf('</script>', scriptStart);
const script = src.slice(scriptStart, scriptEnd);
const body = between(src, '<body>', '</body>').inner.replace(/<script[\s\S]*?<\/script>/g, '').trim();

const out = [
  '<meta charset="utf-8">', // the artifact host's skeleton declares UTF-8 too; this keeps ★ and · right when the file is opened on its own
  `<title>${title}</title>`,
  fonts,
  ...styles,
  body,
  `<script type="module">${script}</script>`,
].join('\n');

writeFileSync(new URL('../dist-single/soulswarm.html', import.meta.url), out);
console.log(`wrote dist-single/soulswarm.html (${(out.length / 1024).toFixed(0)} KB, ${styles.length} style blocks)`);

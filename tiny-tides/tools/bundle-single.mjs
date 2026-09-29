// Packs the demo build into ONE self-contained HTML file (fonts, CSS and JS inlined): dist/tiny-tides-demo.html
// Purchases in this build are simulated (no charge). Handy for sharing a playable preview.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execSync('node tools/build.mjs --demo', { cwd: root, stdio: 'inherit' });
const www = path.join(root, 'www');
const b64 = (f) => fs.readFileSync(path.join(www, f)).toString('base64');
const css = fs.readFileSync(path.join(www, 'app.css'), 'utf8')
  .replace(/url\(fonts\/(fredoka-\d+)\.woff2\)/g, (_, n) => `url(data:font/woff2;base64,${b64(`fonts/${n}.woff2`)})`);
const js = fs.readFileSync(path.join(www, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="app.js">')).trim();
const out = `<title>Tiny Tides</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>${css}</style>
${body}
<script>${js}</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const target = path.join(root, 'dist/tiny-tides-demo.html');
fs.writeFileSync(target, out);
console.log(`wrote dist/tiny-tides-demo.html (${(out.length / 1024).toFixed(0)} KB)`);

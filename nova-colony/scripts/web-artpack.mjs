// Web preview only: pack whole art folders of a built `dist/` into one script of data URLs (art.ts `packed()`),
// so a host with a file-count limit can serve the game. The native app never uses this.
// Usage: node scripts/web-artpack.mjs [dist] [folder ...]   (default folders: research items cosmetics)
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';
const folders = process.argv.length > 3 ? process.argv.slice(3) : ['research', 'items', 'cosmetics'];
const pack = {};
for (const f of folders) {
  const dir = path.join(dist, 'art', f);
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.webp')) continue;
    pack[`art/${f}/${file}`] = `data:image/webp;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
  }
}
const out = path.join(dist, 'artpack.js');
fs.writeFileSync(out, `window.__NOVA_ART_PACK__=${JSON.stringify(pack)};\n`);
console.log(`${Object.keys(pack).length} images -> ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);

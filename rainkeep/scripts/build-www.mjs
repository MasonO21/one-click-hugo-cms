#!/usr/bin/env node
/*
 * Copies the playable web files into www/ for Capacitor (`webDir: "www"`).
 * No dependencies. Run from anywhere: `npm run build` (or `node scripts/build-www.mjs`).
 *
 * Copied: top-level *.html, *.css, *.js, manifest.webmanifest, icon.svg, sw.js and the
 * icons/, fonts/, art/ (painted portraits, foes and backdrops), models/ (3D models) and vendor/ (three.js) folders.
 * Not copied: docs, package files, scripts/, native projects, node_modules.
 * sw.js gets its cache VERSION stamped with a hash of the build, so a web deploy of www/
 * always ships a fresh offline cache.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'www');
const REQUIRED = ['index.html', 'style.css', 'data.js', 'lore.js', 'audio.js', 'native.js', 'core.js', 'artmap.js', 'art2d.js', 'ui.js', 'art3d.js', 'town.js', 'town3d.js', 'events.js', 'keep.js', 'channels.js', 'bond.js', 'cloudrun.js', 'decor.js', 'story.js', 'forge.js', 'trials.js', 'patron.js', 'caravan.js', 'world.js', 'bloom.js', 'deepspring.js', 'crossing.js', 'companions.js', 'road.js', 'rivals.js', 'siege.js', 'intel.js', 'formation.js', 'heirloom.js', 'awaken.js', 'hall.js', 'outposts.js', 'trade.js', 'decrees.js', 'defense.js', 'ranks.js', 'clash.js', 'fishing.js', 'news.js', 'models3d.js', 'world3d.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'vendor/three.min.js', 'vendor/three-gltf.js'];
const EXTRA_FILES = new Set(['manifest.webmanifest', 'icon.svg']);
const DIRS = ['icons', 'fonts', 'vendor', 'art', 'models'];

if (relative(ROOT, OUT) !== 'www') throw new Error(`Refusing to clean unexpected path ${OUT}`);

const missing = REQUIRED.filter((f) => !existsSync(join(ROOT, f)));
if (missing.length) {
  console.error(`build-www: missing required file(s): ${missing.join(', ')}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const files = readdirSync(ROOT).filter((name) => {
  const p = join(ROOT, name);
  if (!statSync(p).isFile()) return false;
  return /\.(html|css|js)$/.test(name) || EXTRA_FILES.has(name);
}).sort();

const hash = createHash('sha256');
for (const name of files) {
  cpSync(join(ROOT, name), join(OUT, name));
  if (name !== 'sw.js') hash.update(name).update(readFileSync(join(ROOT, name)));
}
let dirCount = 0;
for (const dir of DIRS) {
  const src = join(ROOT, dir);
  if (!existsSync(src)) { console.warn(`build-www: ${dir}/ not found, skipped`); continue; }
  cpSync(src, join(OUT, dir), { recursive: true });
  for (const f of readdirSync(src, { recursive: true }).sort()) {
    const p = join(src, f);
    if (!statSync(p).isFile()) continue; // art/ and models/ have subfolders
    hash.update(`${dir}/${f}`).update(readFileSync(p));
    dirCount++;
  }
}

// Stamp the service worker cache version so returning web players get the new build.
const swPath = join(OUT, 'sw.js');
const version = `rainkeep-${hash.digest('hex').slice(0, 10)}`;
const sw = readFileSync(swPath, 'utf8');
const stamped = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
if (stamped === sw) console.warn('build-www: VERSION line not found in sw.js; cache version not stamped');
writeFileSync(swPath, stamped);

console.log(`build-www: copied ${files.length} files + ${dirCount} in ${DIRS.join(', ')}/ to www/ (sw cache ${version})`);
for (const f of files) console.log(`  ${f}`);

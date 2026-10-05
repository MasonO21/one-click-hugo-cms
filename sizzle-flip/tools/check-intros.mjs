// Lists levels whose tutorial mechanic is missing from the layout (or that are missing entirely).
// node tools/check-intros.mjs [cache.json]
import fs from 'node:fs';
import { RECIPES_EXPORT } from './generate.mjs';
import { WORLDS } from '../src/objects.js';
let LEVELS;
if (process.argv[2]) { const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); LEVELS = Array.from({ length: 200 }, (_, i) => c[i] || null); }
else LEVELS = (await import('../src/levels/data.js')).LEVELS;
const bad = [];
LEVELS.forEach((L, i) => {
  if (!L) { bad.push(i); return; }
  const w = WORLDS[Math.floor(i / 20)].id, k = i % 20;
  const intro = RECIPES_EXPORT[w].mechs.find(m => m.k === k && m.tip && m.kind !== 'note');
  if (intro && !L.objects.some(o => o.t === intro.t)) bad.push(i);
});
console.log(bad.join(','));

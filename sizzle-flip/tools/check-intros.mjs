// Lists levels whose tutorial mechanic is missing from the layout.
import { LEVELS } from '../src/levels/data.js';
import { RECIPES_EXPORT } from './generate.mjs';
import { WORLDS } from '../src/objects.js';
const bad = [];
LEVELS.forEach((L, i) => {
  if (!L) { bad.push(i); return; }
  const w = WORLDS[Math.floor(i / 20)].id, k = i % 20;
  const intro = RECIPES_EXPORT[w].mechs.find(m => m.k === k && m.tip && m.kind !== 'note');
  if (intro && !L.objects.some(o => o.t === intro.t)) bad.push(i);
});
console.log(bad.join(','));

// Dev gallery: ?world=<id>&debug=1&anim=0.5  — renders every object of a world in a grid (+ collision overlay) and its background.
import { OBJECTS, WORLDS } from '../src/objects.js';
import { drawObject, drawCollisionDebug, hasFront } from '../src/art/objects/index.js';
import { drawBackground } from '../src/art/backgrounds.js';
import { drawSausage, makeFaceState, SKINS } from '../src/art/sausage.js';

const p = new URLSearchParams(location.search);
const world = p.get('world') || 'kitchen';
const debug = p.has('debug');
const t = parseFloat(p.get('t') || '0.7');
const only = p.get('only');
await document.fonts.load('20px "Lilita One"').catch(() => {});
let list = Object.values(OBJECTS).filter(o => o.worlds.includes(world));
if (!p.has('shared')) list = list.filter(o => o.worlds.length < WORLDS.length || p.has('all'));
if (only) list = list.filter(o => only.split(',').includes(o.id));
const cols = 3, cell = 380;
const c = document.getElementById('c');
const rows = Math.ceil(list.length / cols);
c.width = cols * cell; c.height = rows * cell;
const ctx = c.getContext('2d');
list.forEach((o, i) => {
  const cx = (i % cols) * cell + cell / 2, cy = Math.floor(i / cols) * cell + cell / 2 + 10;
  ctx.save();
  ctx.strokeStyle = '#bbb'; ctx.strokeRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  ctx.fillStyle = '#333'; ctx.font = '18px Fredoka'; ctx.fillText(o.id + '  (' + o.role + ')', (i % cols) * cell + 8, Math.floor(i / cols) * cell + 22);
  const w = o.stretch ? (o.w || 200) : o.w, h = o.stretch ? (o.h || 100) : o.h;
  const sc = Math.min(1, (cell - 60) / Math.max(w, h + 80));
  ctx.translate(cx, cy); ctx.scale(sc, sc);
  const inst = { t: o.id, x: 0, y: 0, w: o.stretch ? w : undefined, h: o.stretch ? h : undefined, v: 1, move: o.role === 'rotor' ? { type: 'rotate', speed: 0.6 } : null };
  const st = { on: true, warn: 0, pop: 0, hit: 0 };
  drawObject(ctx, inst, t, st, 'draw');
  if (p.has('sausage') && o.land && o.land.length) {
    const [x1, x2, y] = o.land[0];
    const N = 10, px = new Float64Array(N), py = new Float64Array(N);
    for (let k = 0; k < N; k++) { px[k] = (x1 + x2) / 2 - 49.5 + k * 11; py[k] = y - 15; }
    const face = makeFaceState();
    drawSausage(ctx, px, py, { R: 15, skin: SKINS[0], face, t: 0 });
  }
  if (hasFront(inst)) drawObject(ctx, inst, t, st, 'front');
  if (debug) drawCollisionDebug(ctx, inst);
  ctx.restore();
});
// background preview
const bg = document.getElementById('bg');
const L = { h: 1100, seed: 7, objects: [] };
const box = { x0: -200, x1: 840, y0: -300, y1: 1350 };
bg.width = (box.x1 - box.x0) * 0.6; bg.height = (box.y1 - box.y0) * 0.6;
const b = bg.getContext('2d');
b.setTransform(0.6, 0, 0, 0.6, -box.x0 * 0.6, -box.y0 * 0.6);
drawBackground(b, L, world, box, 640);
window.__done = true;

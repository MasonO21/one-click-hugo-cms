// Static level thumbnails for world cards & celebrations.
import { Sim, PHYS } from './physics.js';
import { drawBackground } from './art/backgrounds.js';
import { drawObject } from './art/objects/index.js';
import { drawSausage, makeFaceState, SKINS } from './art/sausage.js';

export function renderLevelThumb(canvas, level, world) {
  if (!level) return;
  const ctx = canvas.getContext('2d');
  const W = PHYS.W;
  const sim = new Sim({ ...level, gravity: level.gravity ?? world.gravity, floor: level.floor ?? world.floor }, { events: false });
  sim.placeSausage(level.start[0], level.start[1], level.start[2] || 0);
  for (let i = 0; i < 60; i++) sim.step();
  // frame: bottom portion of the level
  const viewW = W + 80;
  const scale = canvas.width / viewW;
  const viewH = canvas.height / scale;
  const bottom = level.h + 70;
  const top = bottom - viewH;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, -(-40) * scale, -top * scale);
  const box = { x0: -60, x1: W + 60, y0: top - 20, y1: bottom + 40 };
  drawBackground(ctx, level, world.id, box, W);
  for (const b of sim.bodies) {
    if (!b.type) continue;
    ctx.save();
    ctx.translate(b.pwx, b.pwy); ctx.rotate(b.ang); ctx.translate(-b.pivotX, -b.pivotY);
    const s = b.inst.s || 1;
    ctx.scale((b.inst.flip ? -1 : 1) * s, s);
    drawObject(ctx, b.inst, 0, { on: true, warn: 0, pop: 0, hit: 0 }, 'draw');
    ctx.restore();
  }
  const face = makeFaceState(); face.expr = 'idle'; face.lookX = 1; face.lookY = -0.5;
  drawSausage(ctx, sim.px, sim.py, { R: PHYS.R, skin: SKINS[0], face, t: 0 });
  for (const b of sim.bodies) {
    if (!b.type) continue;
    ctx.save();
    ctx.translate(b.pwx, b.pwy); ctx.rotate(b.ang); ctx.translate(-b.pivotX, -b.pivotY);
    const s = b.inst.s || 1;
    ctx.scale((b.inst.flip ? -1 : 1) * s, s);
    drawObject(ctx, b.inst, 0, { on: true, warn: 0, pop: 0, hit: 0 }, 'front');
    ctx.restore();
  }
  ctx.restore();
}

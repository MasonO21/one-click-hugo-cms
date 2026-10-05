// QA viewer: renders whole levels with the solver's par path traced. ?src=preview|game&ids=0,1,2&scale=0.35
import { Sim, PHYS, simulateShot } from '../src/physics.js';
import { WORLDS } from '../src/objects.js';
import { drawBackground } from '../src/art/backgrounds.js';
import { drawObject, drawCollisionDebug } from '../src/art/objects/index.js';
import { drawSausage, makeFaceState, SKINS } from '../src/art/sausage.js';

const p = new URLSearchParams(location.search);
await document.fonts.load('20px "Lilita One"').catch(() => {});
let levels;
if (p.get('src') === 'game') levels = (await import('../src/levels/data.js')).LEVELS;
else levels = await (await fetch((p.get('file') || 'preview-levels.json') + '?' + Date.now())).json();
const ids = p.get('ids') ? p.get('ids').split(',').map(Number) : Object.keys(levels).map(Number);
const scale = parseFloat(p.get('scale') || '0.4');
const wrap = document.getElementById('wrap');
const valid = ids.filter(id => levels[id]);
const tops = valid.map(id => Math.min(0, ...levels[id].objects.map(o => o.y - 200)));
const maxH = Math.max(...valid.map((id, i) => levels[id].h + 110 - tops[i]));
const all = document.createElement('canvas');
all.id = 'all';
all.width = valid.length * 710 * scale; all.height = maxH * scale + 40;
wrap.appendChild(all);
const actx = all.getContext('2d');
actx.fillStyle = '#333'; actx.fillRect(0, 0, all.width, all.height);
for (const [vi, id] of valid.entries()) {
  const L = levels[id];
  const wi = p.has('world') ? +p.get('world') : Math.floor(id / 20);
  const world = WORLDS[wi];
  const top = tops[vi];
  const ctx = actx;
  ctx.save();
  ctx.translate(vi * 710 * scale, 0);
  ctx.fillStyle = '#fff'; ctx.font = '14px Fredoka';
  ctx.fillText(`#${id + 1} ${L.name} par ${L.par}`, 6, 16);
  ctx.save();
  ctx.translate(30 * scale, 30 - top * scale);
  ctx.scale(scale, scale);
  const box = { x0: -30, x1: 670, y0: top, y1: L.h + 110 };
  ctx.save(); ctx.beginPath(); ctx.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); ctx.clip();
  drawBackground(ctx, L, world.id, box, 640);
  const sim = new Sim({ ...L, gravity: L.gravity ?? world.gravity, floor: L.floor ?? world.floor }, { events: false });
  for (const b of sim.bodies) {
    if (!b.type) continue;
    ctx.save(); ctx.translate(b.pwx, b.pwy); ctx.rotate(b.ang); ctx.translate(-b.pivotX, -b.pivotY);
    const s = b.inst.s || 1; ctx.scale((b.inst.flip ? -1 : 1) * s, s);
    drawObject(ctx, b.inst, 0, { on: true, warn: 0, pop: 0, hit: 0 }, 'draw');
    drawObject(ctx, b.inst, 0, { on: true, warn: 0, pop: 0, hit: 0 }, 'front');
    if (p.has('debug')) drawCollisionDebug(ctx, b.inst);
    ctx.restore();
  }
  // trace solution
  sim.placeSausage(L.start[0], L.start[1], 0);
  for (let i = 0; i < 90; i++) sim.step();
  sim.t = 0; for (const b of sim.bodies) sim.updateBody(b, 0, true);
  for (let i = 0; i < 120 && !sim.canLaunch(); i++) sim.step();
  const face = makeFaceState();
  drawSausage(ctx, sim.px, sim.py, { R: 15, skin: SKINS[0], face, t: 0 });
  const colors = ['#ff3b3b', '#ff9f1c', '#2ec4b6', '#3a86ff', '#8338ec', '#ff006e', '#06d6a0'];
  (L.solution || []).forEach(([a, pw, delay], k) => {
    for (let i = 0; i < Math.round((delay || 0) / PHYS.DT); i++) sim.step();
    const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * pw;
    sim.launch(Math.cos(a) * v, Math.sin(a) * v);
    const pts = [];
    const t0 = sim.t;
    while (sim.t - t0 < 7) { sim.step(); pts.push(sim.com()); if (sim.status !== 'play') break; if (sim.t - t0 > 0.15 && sim.canLaunch()) break; }
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.lineWidth = 6; ctx.strokeStyle = colors[k % colors.length]; ctx.setLineDash([14, 10]); ctx.stroke(); ctx.setLineDash([]);
    const [ex, ey] = pts[pts.length - 1];
    ctx.font = '40px "Lilita One"'; ctx.fillStyle = colors[k % colors.length]; ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
    ctx.strokeText(String(k + 1), ex + 20, ey - 30); ctx.fillText(String(k + 1), ex + 20, ey - 30);
    if (sim.status === 'win') { ctx.fillText('WIN', ex - 40, ey - 80); }
    if (sim.status === 'fail') { ctx.fillText('FAIL ' + sim.failReason, ex - 40, ey - 80); }
  });
  ctx.restore();
  ctx.restore();
  ctx.restore();
}
window.__done = true;

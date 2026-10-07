// Shop characters, batch 2: 100 more (food, sweets, stuff, rides, critters, party, colour variants).
// Same rules as items.js: drawn by itemkit.js over the sausage's own physics body — u runs tail (0) → head (1,
// where the face sits), o is the offset across the body in R (negative = the top side in the resting pose).
import { INK, rgba, circlePath, ellipsePath } from './common.js';
import { TAU, sstep, capRound, capFlat, capPoint, round2, scatter, ink, leaf, wobble } from './itemkit.js';

const flat = (k) => (p, R) => Math.min(capFlat(p.d0, R, k), capFlat(p.d1, R, k));
const wavyLine = (g, o, u0, u1, w, c, f = 30, a = 0.12) => g.along(o, u0, u1, w, c, (u) => Math.sin(u * f) * a);

// ------------------------------------------------------------------ colour-variant factories
const crayon = (id, name, col, dark) => ({
  id, name, cat: 'colors', desc: `The ${name.toLowerCase()} one.`, lid: col, gloss: 0.4,
  prof: (p, R) => Math.min(capFlat(p.d0, R, 3), p.d1 < R * 1.5 ? 0.3 + 0.7 * (p.d1 / (R * 1.5)) : 1),
  paint(g) {
    g.fillAll(col);
    g.strip(0.1, 0.6, -1.5, 1.5, '#f4f1e6', { zig0: 0.008, zig1: 0.008 });
    g.strip(0.135, 0.165, -1.5, 1.5, dark); g.strip(0.535, 0.565, -1.5, 1.5, dark);
    g.along(0, 0.22, 0.48, 1.6, dark, (u) => Math.sin(u * 90) * 0.18);
  },
});
const glowstick = (id, name, col, core, cap) => ({
  id, name, cat: 'colors', desc: 'Crack it and flip it.', lid: col, gloss: 0.9,
  prof: flat(5),
  back(g) { g.glow(col, 0.11); },
  paint(g) { g.fillAll(col); g.along(0, 0.06, 0.94, g.R * 0.85, core); g.strip(-0.1, 0.06, -1.5, 1.5, cap); g.strip(0.94, 1.1, -1.5, 1.5, cap); },
});
const gummy = (id, name, stops) => ({
  id, name, cat: 'colors', desc: 'Sour, sweet, airborne.', lid: stops[0][1], gloss: 1.0,
  prof: (p, R) => round2(p, R) * (0.94 + 0.06 * Math.cos(Math.PI * 16 * p.u)),
  paint(g) {
    g.ctx.fillStyle = g.grad(0.1, 0.9, stops); g.ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
    for (let u = 0.03; u < 1; u += 0.0625) g.line(u, -1.2, u, 1.2, 1.4, 'rgba(255,255,255,0.28)');
    g.specks('su', 30, 41, 'rgba(255,255,255,0.8)', 0.8, 1.2);
  },
});
const icepop = (id, name, col, light) => ({
  id, name, cat: 'colors', desc: 'Brain freeze not included.', lid: col, gloss: 0.8,
  prof: flat(6),
  back(g) { g.local(0, (c, R) => { c.beginPath(); c.roundRect(-R * 0.6, -R * 0.3, R * 1.9, R * 0.6, R * 0.3); ink(c, '#e9cf98'); }); },
  paint(g) {
    g.fillAll(col); g.along(-0.45, 0.06, 0.94, g.R * 0.3, light);
    g.specks('fr', 10, 13, 'rgba(255,255,255,0.8)', 1, 1.3);
  },
});
const highlighter = (id, name, col, cap) => ({
  id, name, cat: 'colors', desc: 'Highlights your best flips.', lid: col, gloss: 0.7,
  prof: (p, R) => Math.min(capFlat(p.d0, R, 3), p.d1 < R * 1.1 ? 0.45 + 0.55 * (p.d1 / (R * 1.1)) : 1),
  paint(g) {
    g.fillAll(col); g.strip(-0.1, 0.3, -1.5, 1.5, cap); g.strip(0.3, 0.33, -1.5, 1.5, rgba(INK, 0.5));
    g.strip(0.91, 1.1, -1.5, 1.5, cap); g.along(-0.5, 0.36, 0.88, 2, 'rgba(255,255,255,0.45)');
  },
});

export const MORE_ITEMS = [
  // ================================================================ FOOD
  {
    id: 'fry', name: 'French Fry', cat: 'food', desc: 'One fry to rule them all.', lid: '#f6c84c', gloss: 0.3,
    prof: flat(2),
    paint(g) {
      g.fillAll('#f6c84c'); g.along(-0.55, 0.02, 0.98, 1.6, 'rgba(255,240,170,0.8)'); g.along(0.55, 0.02, 0.98, 1.6, 'rgba(200,140,30,0.5)');
      g.strip(-0.1, 0.04, -1.5, 1.5, '#d9962a'); g.strip(0.96, 1.1, -1.5, 1.5, '#d9962a');
      g.specks('s', 14, 61, '#ffffff', 0.8, 1.4);
    },
  },
  {
    id: 'mozz', name: 'Mozzarella Stick', cat: 'food', desc: 'Stretchiest landing ever.', lid: '#e0a24a', gloss: 0.3,
    prof: flat(5),
    paint(g) { g.fillAll('#e0a24a'); g.specks('c1', 40, 62, '#b8742a', 0.8, 1.8); g.specks('c2', 30, 63, '#f6cc7a', 0.8, 1.6); },
    front(g) {
      g.local(1, (c, R) => {
        const s = Math.sin(g.t * 2.5) * 0.12;
        c.beginPath(); c.moveTo(-R * 0.15, -R * 0.62); c.bezierCurveTo(R * 0.5, -R * 0.55, R * 0.55, -R * 0.1, R * (1.15 + s), R * 0.05);
        c.bezierCurveTo(R * (1.3 + s), R * 0.18, R * (1.1 + s), R * 0.34, R * 0.95, R * 0.22);
        c.bezierCurveTo(R * 0.6, R * 0.12, R * 0.45, R * 0.62, -R * 0.15, R * 0.6); c.closePath();
        ink(c, '#fff6cf', 2);
        c.beginPath(); c.moveTo(R * 0.1, -R * 0.3); c.quadraticCurveTo(R * 0.5, -R * 0.2, R * 0.85, R * 0.05); c.lineWidth = 1.4; c.strokeStyle = 'rgba(230,190,90,0.7)'; c.stroke();
      });
    },
  },
  {
    id: 'springroll', name: 'Spring Roll', cat: 'food', desc: 'Crispy, crunchy, catapulted.', lid: '#e9b45a', gloss: 0.5,
    prof: flat(7),
    paint(g) {
      g.fillAll('#e9b45a');
      for (const [u, o, r] of scatter(g.it, 'bl', 22, 64)) g.dot(0.05 + u * 0.9, o * 0.8, 1.4 + r * 2, '#f6d48a', 'rgba(170,100,30,0.5)', 1);
      g.line(0.08, -1.2, 0.16, 1.2, 1.6, 'rgba(150,90,30,0.55)'); g.line(0.86, -1.2, 0.94, 1.2, 1.6, 'rgba(150,90,30,0.55)');
    },
  },
  {
    id: 'asparagus', name: 'Asparagus', cat: 'food', desc: 'Fancy greens, flying.', lid: '#6fae3c', gloss: 0.5,
    prof: (p, R) => Math.min(capFlat(p.d0, R * 0.8, 2) * 0.8, p.d1 < R * 1.6 ? 0.25 + 0.75 * Math.pow(p.d1 / (R * 1.6), 0.7) : 1),
    paint(g) {
      g.ctx.fillStyle = g.grad(0, 0.5, [[0, '#e6efc0'], [1, '#6fae3c']]); g.ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
      for (let u = 0.25; u < 0.8; u += 0.11) g.shape(u, [[-0.03, -0.5], [0.05, -0.15], [0.03, -0.6]], '#5a8f2e', 1.4);
      g.strip(0.86, 1.1, -1.5, 1.5, '#5d7a3a'); g.stripes(0.03, 0.03, 1.4, 'rgba(80,60,120,0.6)', 0, 0.86, 1.05);
    },
  },
  {
    id: 'leek', name: 'Leek', cat: 'food', desc: 'Leeks great, flips better.', lid: '#cfe7a0', gloss: 0.45,
    prof: round2,
    paint(g) {
      g.ctx.fillStyle = g.grad(0.15, 0.85, [[0, '#f6f2e2'], [0.55, '#cfe7a0'], [1, '#6fae3c']]); g.ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
      for (const o of [-0.5, 0, 0.5]) g.along(o, 0.35, 0.98, 1.2, 'rgba(70,120,40,0.4)');
    },
    front(g) {
      g.local(1, (c, R) => { leaf(c, -R * 0.4, -R * 0.2, R * 1.6, -R * 0.9, R * 0.45, '#3f8a3a'); leaf(c, -R * 0.4, R * 0.2, R * 1.7, R * 0.6, R * 0.45, '#4f9a3a'); });
      g.local(0, (c, R) => { for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, k * R * 0.25); c.quadraticCurveTo(R * 0.4, k * R * 0.35 + 3, R * 0.6, k * R * 0.42); c.lineWidth = 1.6; c.strokeStyle = '#a89870'; c.stroke(); } });
    },
  },
  {
    id: 'celery', name: 'Celery Stick', cat: 'food', desc: 'Crunch time.', lid: '#a8d86a', gloss: 0.45,
    prof: flat(3),
    paint(g) {
      g.fillAll('#a8d86a');
      for (const o of [-0.62, -0.25, 0.12, 0.5]) { g.along(o, 0.02, 0.98, 2.2, 'rgba(90,150,50,0.5)'); g.along(o + 0.12, 0.02, 0.98, 1.4, 'rgba(230,250,190,0.7)'); }
      g.strip(-0.1, 0.02, -1.5, 1.5, '#e6f5c8');
    },
    front(g) { g.local(1, (c, R) => { leaf(c, -R * 0.2, 0, R * 1.2, -R * 0.7, R * 0.5, '#7ccf4a'); leaf(c, -R * 0.2, 0, R * 1.3, R * 0.5, R * 0.5, '#6fbf3a'); }); },
  },
  {
    id: 'cucumber', name: 'Cucumber', cat: 'food', desc: 'Cool as one.', lid: '#2f7a2f', gloss: 0.6,
    prof: round2,
    paint(g) {
      g.fillAll('#2f7a2f'); wavyLine(g, -0.4, 0.04, 0.96, 3, '#5aa64a', 22, 0.08); wavyLine(g, 0.35, 0.04, 0.96, 3, '#5aa64a', 18, 0.08);
      g.specks('d', 18, 65, 'rgba(200,240,170,0.7)', 0.8, 1.2);
    },
    front(g) { g.endSection(1, [[0.95, '#2f7a2f'], [0.82, '#d8f0b0'], [0.4, '#c4e49a']]); g.local(1, (c, R) => { for (const y of [-0.3, 0, 0.3]) { ellipsePath(c, -R * 0.02, y * R, R * 0.05, R * 0.08); c.fillStyle = '#f8fff0'; c.fill(); } }); },
  },
  {
    id: 'breadstick', name: 'Breadstick', cat: 'food', desc: 'Grissini, but make it gymnastics.', lid: '#e8b866', gloss: 0.3,
    prof: (p, R) => 0.8 * Math.min(capRound(p.d0, R * 0.8), capRound(p.d1, R * 0.8)),
    paint(g) {
      g.fillAll('#e8b866');
      for (const [u, o] of scatter(g.it, 'se', 26, 66)) g.at(0.05 + u * 0.9, o * 0.6, (c, R) => { ellipsePath(c, 0, 0, R * 0.12, R * 0.06, o * 2); c.fillStyle = '#fff6dc'; c.fill(); c.lineWidth = 0.8; c.strokeStyle = 'rgba(150,100,40,0.6)'; c.stroke(); });
    },
  },
  {
    id: 'pretzelrod', name: 'Pretzel Rod', cat: 'food', desc: 'Salty and acrobatic.', lid: '#7a3f12', gloss: 0.75,
    prof: round2,
    paint(g) {
      g.fillAll('#7a3f12');
      for (const [u, o, r] of scatter(g.it, 'sa', 22, 67)) g.at(0.05 + u * 0.9, o * 0.75, (c, R) => { c.beginPath(); c.rect(-R * 0.08, -R * 0.08, R * 0.16, R * 0.16); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 0.8; c.strokeStyle = 'rgba(80,40,10,0.6)'; c.stroke(); });
    },
  },
  {
    id: 'salami', name: 'Salami', cat: 'food', desc: 'The sausage\'s cool cousin.', lid: '#a8323a', gloss: 0.55,
    prof: round2,
    paint(g) {
      g.fillAll('#a8323a');
      for (const [u, o, r] of scatter(g.it, 'fa', 26, 68)) g.dot(0.04 + u * 0.92, o * 0.85, 1.2 + r * 1.8, '#f6e2dc');
      for (const u of [0.22, 0.47, 0.72]) { g.line(u, -1.3, u, 1.3, 3.4, INK, 'butt'); g.line(u, -1.3, u, 1.3, 1.8, '#e8d4a8', 'butt'); }
    },
    front(g) { g.local(0, (c, R) => { c.beginPath(); c.ellipse(R * 0.45, 0, R * 0.4, R * 0.22, 0, 0, TAU); c.lineWidth = 3.4; c.strokeStyle = INK; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = '#e8d4a8'; c.stroke(); }); },
  },
  {
    id: 'fishstick', name: 'Fish Stick', cat: 'food', desc: 'Crunchy, oceanic, rectangular.', lid: '#f0a03a', gloss: 0.3,
    prof: flat(4),
    paint(g) { g.fillAll('#f0a03a'); g.specks('cr', 46, 69, (r) => (r > 0.5 ? '#c8741f' : '#ffd08a'), 0.8, 1.6); },
    front(g) { g.local(1, (c, R) => { c.beginPath(); c.roundRect(-R * 0.14, -R * 0.7, R * 0.24, R * 1.4, 2); c.fillStyle = '#fbf6ea'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = 'rgba(150,100,40,0.6)'; c.stroke(); }); },
  },
  {
    id: 'tempura', name: 'Shrimp Tempura', cat: 'food', desc: 'Battered and bold.', lid: '#f3d08a', gloss: 0.35,
    prof: (p, R) => round2(p, R) * (0.92 + 0.08 * wobble(p.u, 9, 2)),
    back(g) { g.local(0, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-R * 0.3, 0); c.quadraticCurveTo(R * 0.7, s * R * 0.2, R * 1.1, s * R * 0.75); c.quadraticCurveTo(R * 0.6, s * R * 0.75, -R * 0.3, s * R * 0.3); c.closePath(); ink(c, '#ff6a3d', 2); } }); },
    paint(g) { g.fillAll('#f3d08a'); g.specks('ba', 40, 70, (r) => (r > 0.5 ? '#ffe9b0' : '#d9a24a'), 1, 2.4); },
  },
  {
    id: 'peapod', name: 'Pea Pod', cat: 'food', desc: 'Give peas a chance.', lid: '#7cc04a', gloss: 0.6,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.4, 0.2), capPoint(p.d1, R * 1.4, 0.2)),
    paint(g) {
      g.fillAll('#7cc04a');
      g.strip(0.12, 0.88, -1.5, -0.12, '#5a9a2f', { w0: (u) => -0.12 * Math.sin(Math.PI * (u - 0.12) / 0.76) });
      for (let k = 0; k < 5; k++) g.dot(0.2 + k * 0.13, -0.38, g.R * 0.36, '#a8e070', 'rgba(60,110,30,0.8)', 1.4);
      g.along(-0.98, 0.05, 0.95, 1.8, 'rgba(60,110,30,0.8)');
    },
    front(g) { g.local(0, (c, R) => { c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(R * 0.5, -R * 0.1, R * 0.7, -R * 0.45); c.lineWidth = 4.6; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = '#5a9a2f'; c.stroke(); }); },
  },
  {
    id: 'sugarcane', name: 'Sugarcane', cat: 'food', desc: 'Sweet stalk, sweeter flips.', lid: '#c6d65a', gloss: 0.5,
    prof: flat(3),
    paint(g) {
      g.fillAll('#c6d65a'); g.along(-0.45, 0.02, 0.98, g.R * 0.3, 'rgba(240,250,200,0.5)');
      for (const u of [0.16, 0.36, 0.56, 0.76]) { g.line(u, -1.3, u, 1.3, 4, '#8a7a2a', 'butt'); g.line(u + 0.012, -1.3, u + 0.012, 1.3, 1.4, '#efe9a8', 'butt'); }
      g.strip(-0.1, 0.02, -1.5, 1.5, '#f0ead0'); g.strip(0.98, 1.1, -1.5, 1.5, '#f0ead0');
    },
  },
  {
    id: 'sub', name: 'Sub Sandwich', cat: 'food', desc: 'A footlong of flips.', lid: '#e0a24a', gloss: 0.3,
    prof: round2,
    paint(g) {
      g.fillAll('#e0a24a');
      g.strip(-0.1, 1.1, -0.1, 0.48, '#f2a0a8', { w0: (u) => Math.sin(u * 40) * 0.04 });
      g.strip(-0.1, 1.1, 0.02, 0.2, '#ffd84a', { w0: (u) => Math.sin(u * 55) * 0.06 });
      g.strip(-0.1, 1.1, 0.18, 0.3, '#e8402a');
      g.strip(-0.1, 1.1, -0.18, 0.02, '#7cc84a', { w0: (u) => Math.sin(u * 70) * 0.09 });
      g.strip(-0.1, 1.1, 0.45, 1.5, '#d9963f');
      for (const [u, o] of scatter(g.it, 'ss', 16, 71)) g.dot(0.08 + u * 0.84, -0.45 - Math.abs(o) * 0.4, 1, '#fff3d6');
    },
  },
  // ================================================================ SWEETS
  ...[['licorice', 'Licorice Twist', '#d92b3a', 'A twist on flipping.'], ['blacklicorice', 'Black Licorice', '#2a2028', 'Love it or hate it.']].map(([id, name, col, desc]) => ({
    id, name, cat: 'sweets', desc, lid: col, gloss: 0.9,
    prof: flat(3),
    paint(g) { g.fillAll(col); g.stripes(0.07, 0.07, g.R * 0.22, 'rgba(0,0,0,0.35)'); g.stripes(0.07, 0.07, g.R * 0.08, 'rgba(255,255,255,0.35)', 0.022); },
    front(g) { for (const e of [0, 1]) g.local(e, (c, R) => { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; circlePath(c, -R * 0.05, Math.sin(a) * R * 0.55, R * 0.16); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill(); } }); },
  })),
  {
    id: 'chocostick', name: 'Choco Stick', cat: 'sweets', desc: 'Dipped and daring.', lid: '#5a2e1a', gloss: 0.7,
    prof: (p, R) => (p.u < 0.3 ? 0.55 * capFlat(p.d0, R * 0.55, 2) : p.u < 0.34 ? 0.55 + 0.25 * sstep((p.u - 0.3) / 0.04) : 0.8 * capRound(p.d1, R * 0.8)),
    paint(g) { g.fillAll('#e8c27a'); g.strip(0.31, 1.1, -1.5, 1.5, '#5a2e1a', { zig0: 0.012 }); g.specks('cs', 6, 72, 'rgba(255,255,255,0.4)', 0.8, 1, 0.4, 0.9); },
  },
  {
    id: 'cannoli', name: 'Cannoli', cat: 'sweets', desc: 'Leave the gun. Take the cannoli.', lid: '#d99a48', gloss: 0.4,
    prof: flat(4),
    paint(g) {
      g.fillAll('#d99a48'); g.specks('bu', 26, 73, 'rgba(240,190,110,0.9)', 1.2, 2.6, 0.12, 0.88);
      g.specks('su', 26, 74, 'rgba(255,255,255,0.85)', 0.7, 1.1, 0.1, 0.9);
    },
    front(g) {
      for (const e of [0, 1]) g.local(e, (c, R) => { ellipsePath(c, R * 0.15, 0, R * 0.42, R * 0.92); ink(c, '#fffaf0', 2); for (const y of [-0.45, 0.05, 0.5]) { circlePath(c, R * 0.25, y * R, R * 0.1); c.fillStyle = '#4a2414'; c.fill(); } });
    },
  },
  {
    id: 'dango', name: 'Dango', cat: 'sweets', desc: 'Three times the bounce.', lid: '#ffa6c0', gloss: 0.6,
    prof: (p, R) => { const u = Math.max(0, Math.min(1, (p.u - 0.03) / 0.94)), k = Math.min(2, Math.floor(u * 3)), f = u * 3 - k; return 0.25 + 0.75 * Math.sqrt(Math.max(0, Math.sin(Math.PI * f))); },
    back(g) { g.local(0, (c, R) => { c.beginPath(); c.rect(-R * 2, -R * 0.13, R * 3, R * 0.26); ink(c, '#e9cf98', 2); }); g.local(1, (c, R) => { c.beginPath(); c.rect(-R, -R * 0.13, R * 1.6, R * 0.26); ink(c, '#e9cf98', 2); }); },
    paint(g) { g.strip(-0.1, 0.343, -1.5, 1.5, '#9bd77a'); g.strip(0.343, 0.657, -1.5, 1.5, '#fff8f0'); g.strip(0.657, 1.1, -1.5, 1.5, '#ffa6c0'); },
  },
  {
    id: 'smores', name: 'Marshmallow Skewer', cat: 'sweets', desc: 'Toasted to perfection.', lid: '#fff6ea', gloss: 0.35,
    prof: (p, R) => { const u = Math.max(0, Math.min(1, (p.u - 0.03) / 0.94)), f = u * 3 - Math.min(2, Math.floor(u * 3)), e = Math.min(f, 1 - f); return 0.3 + 0.7 * Math.sqrt(Math.min(1, e * 16)); },
    back(g) { g.local(0, (c, R) => { c.beginPath(); c.rect(-R * 2, -R * 0.12, R * 3.2, R * 0.24); ink(c, '#b8865a', 2); }); },
    paint(g) {
      g.fillAll('#fff6ea');
      for (let k = 0; k < 3; k++) { const u0 = 0.03 + k * 0.313; g.strip(u0, u0 + 0.06, -1.5, 1.5, '#e8b060'); g.strip(u0 + 0.253, u0 + 0.313, -1.5, 1.5, '#d9963f'); g.strip(u0 + 0.05, u0 + 0.27, 0.55, 1.5, 'rgba(220,150,70,0.45)'); }
    },
  },
  {
    id: 'cottoncandy', name: 'Cotton Candy', cat: 'sweets', desc: 'Fluffy physics.', lid: '#ff9ccf', gloss: 0.2,
    prof: (p, R) => (p.u < 0.18 ? 0.35 : Math.min(1.08, capRound(p.d1, R) * (0.95 + 0.12 * Math.abs(wobble(p.u, 6, 4))) * sstep((p.u - 0.18) / 0.12) * 1.05 + 0.35 * (1 - sstep((p.u - 0.18) / 0.12)))),
    paint(g) {
      g.fillAll('#ff9ccf'); g.strip(-0.1, 0.2, -1.5, 1.5, '#f4f1e6');
      for (const [u, o, r] of scatter(g.it, 'fl', 18, 75)) g.at(0.25 + u * 0.7, o * 0.7, (c, R) => { c.beginPath(); c.arc(0, 0, R * (0.18 + r * 0.2), 0.2, 2.8); c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke(); });
      g.strip(0.48, 0.7, -1.5, 1.5, 'rgba(160,200,255,0.35)');
    },
  },
  {
    id: 'wafer', name: 'Wafer Roll', cat: 'sweets', desc: 'Crispy rolled-up chaos.', lid: '#f3dca0', gloss: 0.4,
    prof: flat(3),
    paint(g) { g.fillAll('#f3dca0'); g.stripes(0.06, 0.12, 1.4, 'rgba(180,130,60,0.55)'); g.stripes(0.06, -0.12, 1.4, 'rgba(180,130,60,0.55)'); },
    front(g) { g.endSection(1, [[0.95, '#f3dca0'], [0.7, '#5a2e1a']], '#c89a50'); },
  },
  {
    id: 'icsandwich', name: 'Ice Cream Sandwich', cat: 'sweets', desc: 'Chill between two cookies.', lid: '#3d2216', gloss: 0.4,
    prof: flat(3),
    paint(g) {
      g.fillAll('#3d2216'); g.strip(-0.1, 1.1, -0.32, 0.32, '#fff8ec', { w0: (u) => Math.sin(u * 60) * 0.03, w1: (u) => Math.sin(u * 50) * 0.03 });
      for (const [u, o] of scatter(g.it, 'ho', 16, 76)) g.dot(0.06 + u * 0.88, (o > 0 ? 0.65 : -0.65) + o * 0.1, 1.2, 'rgba(0,0,0,0.4)');
    },
  },
  {
    id: 'snackcake', name: 'Snack Cake', cat: 'sweets', desc: 'Survives anything. Even this.', lid: '#f5c25a', gloss: 0.45,
    prof: round2,
    paint(g) { g.fillAll('#f5c25a'); g.along(0.55, 0.1, 0.9, g.R * 0.4, 'rgba(210,140,40,0.35)'); for (const u of [0.3, 0.5, 0.7]) g.dot(u, 0.62, g.R * 0.14, '#fffaf0', 'rgba(180,120,40,0.7)', 1.2); },
  },
  {
    id: 'taffy', name: 'Taffy', cat: 'sweets', desc: 'Stretchy, chewy, flippy.', lid: '#ffb0c8', gloss: 0.6,
    prof: round2,
    paint(g) { g.fillAll('#ffb0c8'); g.stripes(0.12, 0.1, g.R * 0.25, 'rgba(255,255,255,0.7)'); },
    front(g) { for (const e of [0, 1]) g.local(e, (c, R) => { c.beginPath(); c.moveTo(-R * 0.1, -R * 0.3); c.lineTo(R * 0.9, -R * 0.85); c.lineTo(R * 0.75, 0); c.lineTo(R * 0.9, R * 0.85); c.lineTo(-R * 0.1, R * 0.3); c.closePath(); ink(c, 'rgba(255,255,255,0.85)', 2); }); },
  },
  {
    id: 'rockcandy', name: 'Rock Candy', cat: 'sweets', desc: 'Crystal clear landings.', lid: '#b48cf0', gloss: 0.9,
    prof: (p, R) => (p.u < 0.15 ? 0.3 : Math.min(capRound(p.d1, R), 0.88 + 0.12 * Math.abs(wobble(p.u, 13, 1)))),
    paint(g) {
      g.fillAll('#b48cf0'); g.strip(-0.1, 0.15, -1.5, 1.5, '#e9cf98');
      for (const [u, o, r] of scatter(g.it, 'cr', 24, 77)) g.at(0.17 + u * 0.8, o * 0.75, (c, R) => { c.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + r, rr = R * (0.18 + r * 0.12); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fillStyle = r > 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(120,70,200,0.35)'; c.fill(); });
    },
  },
  {
    id: 'swissroll', name: 'Swiss Roll', cat: 'sweets', desc: 'Rolls with every punch.', lid: '#f0c070', gloss: 0.35,
    prof: flat(3),
    paint(g) { g.fillAll('#f0c070'); g.specks('ps', 30, 78, 'rgba(255,255,255,0.75)', 0.7, 1.2); },
    front(g) { g.endSection(1, [[0.95, '#c8803a'], [0.85, '#f6d494']], '#fff6ea'); },
  },
  {
    id: 'waffle', name: 'Waffle Stick', cat: 'sweets', desc: 'Syrup-powered.', lid: '#e8b050', gloss: 0.45,
    prof: flat(4),
    paint(g) {
      g.fillAll('#e8b050');
      for (let u = 0.08; u < 0.95; u += 0.085) for (const o of [-0.55, 0, 0.55]) g.at(u, o, (c, R) => { c.beginPath(); c.rect(-R * 0.22, -R * 0.2, R * 0.44, R * 0.4); c.fillStyle = '#c8862e'; c.fill(); });
      wavyLine(g, -0.6, 0.15, 0.85, g.R * 0.25, 'rgba(140,60,10,0.75)', 25, 0.15);
    },
  },
  {
    id: 'crepe', name: 'Crêpe Roll', cat: 'sweets', desc: 'Thin, rolled and refined.', lid: '#f6dca8', gloss: 0.35,
    prof: flat(5),
    paint(g) {
      g.fillAll('#f6dca8'); g.specks('bs', 26, 79, 'rgba(180,110,40,0.5)', 1, 2.2);
      g.along(-0.3, 0.1, 0.9, 1.8, '#5a2e1a', (u) => Math.sin(u * 75) * 0.35);
    },
    front(g) { g.endSection(1, [[0.95, '#f6dca8'], [0.6, '#e8402a']], '#c89a50'); },
  },
  // ================================================================ STUFF
  {
    id: 'rubberchicken', name: 'Rubber Chicken', cat: 'stuff', desc: 'Squeak squeak.', lid: '#ffd23f', gloss: 0.7,
    prof: (p, R) => Math.min(capRound(p.d0, R * 0.8) * 0.85, capRound(p.d1, R)),
    back(g) { g.local(0, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, s * R * 0.25); c.lineTo(R * 0.9, s * R * 0.55); c.lineTo(R * 0.75, s * R * 0.25); c.lineTo(R * 1.05, s * R * 0.2); c.lineTo(R * 0.7, s * R * 0.05); c.lineWidth = 4.2; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = '#ff9a2e'; c.stroke(); } }); },
    paint(g) { g.fillAll('#ffd23f'); g.specks('pk', 16, 80, 'rgba(200,150,20,0.5)', 0.8, 1.2, 0.1, 0.7); },
    front(g) {
      g.local(1, (c, R) => {
        c.beginPath(); c.moveTo(-R * 0.3, -R * 0.2); c.lineTo(R * 0.6, 0); c.lineTo(-R * 0.3, R * 0.2); c.closePath(); ink(c, '#ff9a2e', 2);
        for (const [x, y] of [[-R * 0.55, -R * 0.95], [-R * 0.2, -R * 0.92], [-R * 0.85, -R * 0.85]]) { circlePath(c, x, y, R * 0.2); ink(c, '#e8253a', 1.8); }
        c.beginPath(); c.ellipse(-R * 0.2, R * 0.6, R * 0.14, R * 0.25, 0, 0, TAU); ink(c, '#e8253a', 1.8);
      });
    },
  },
  {
    id: 'poolnoodle', name: 'Pool Noodle', cat: 'stuff', desc: 'Summer\'s finest flipper.', lid: '#ff5aa8', gloss: 0.4,
    prof: flat(3),
    paint(g) { g.fillAll('#ff5aa8'); for (const o of [-0.7, -0.35, 0, 0.35, 0.7]) { g.along(o, 0, 1, 1.6, 'rgba(160,20,90,0.35)'); g.along(o - 0.12, 0, 1, 1.2, 'rgba(255,255,255,0.3)'); } },
    front(g) { g.endSection(1, [[0.95, '#ff5aa8'], [0.32, '#2a1a2e']]); },
  },
  {
    id: 'bat', name: 'Baseball Bat', cat: 'stuff', desc: 'Swing and a flip.', lid: '#e2b07a', gloss: 0.5,
    prof: (p, R) => (p.d0 < R * 0.45 ? 0.62 * capRound(p.d0, R * 0.45) : p.u < 0.5 ? 0.42 + 0.58 * sstep((p.u - 0.18) / 0.32) : capRound(p.d1, R)),
    paint(g) {
      g.fillAll('#e2b07a'); [-0.4, 0.1, 0.45].forEach((o, k) => g.along(o, 0.35, 0.96, 1.2, 'rgba(160,104,48,0.45)', (u) => Math.sin(u * 9 + k) * 0.05));
      g.strip(-0.1, 0.3, -1.5, 1.5, '#2b2b2b'); g.stripes(0.04, 0.03, 1.2, 'rgba(255,255,255,0.35)', 0, 0.02, 0.29);
    },
  },
  {
    id: 'flashlight', name: 'Flashlight', cat: 'stuff', desc: 'Lights the way to the bun.', lid: '#2b2b2b', gloss: 0.8,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2.5) * 0.85, p.u < 0.7 ? 0.85 : 0.85 + 0.15 * sstep((p.u - 0.7) / 0.12), capFlat(p.d1, R, 2)),
    back(g) { g.local(1, (c, R) => { const gr = c.createLinearGradient(0, 0, R * 3, 0); gr.addColorStop(0, 'rgba(255,240,150,0.55)'); gr.addColorStop(1, 'rgba(255,240,150,0)'); c.beginPath(); c.moveTo(0, -R * 0.8); c.lineTo(R * 3, -R * 1.8); c.lineTo(R * 3, R * 1.8); c.lineTo(0, R * 0.8); c.closePath(); c.fillStyle = gr; c.fill(); }); },
    paint(g) {
      g.fillAll('#2b2b2b'); g.strip(0.72, 1.1, -1.5, 1.5, '#c9ccd3'); g.strip(0.96, 1.1, -1.5, 1.5, '#fff6b0');
      g.at(0.45, -0.75, (c, R) => { c.beginPath(); c.roundRect(-R * 0.2, -R * 0.15, R * 0.4, R * 0.3, 3); c.fillStyle = '#e8402a'; c.fill(); });
      for (let u = 0.08; u < 0.62; u += 0.05) g.line(u, -1.2, u, 1.2, 1.2, 'rgba(255,255,255,0.12)');
    },
  },
  {
    id: 'paintbrush', name: 'Paintbrush', cat: 'stuff', desc: 'A masterpiece in motion.', lid: '#d9302a', gloss: 0.7,
    prof: (p, R) => (p.u < 0.62 ? 0.5 + 0.35 * sstep(p.u / 0.6) : p.u < 0.74 ? 0.85 : 0.85 * Math.min(1.1, 1.1 - 0.9 * sstep((p.u - 0.8) / 0.2)) + 0.05),
    paint(g) {
      g.fillAll('#d9302a'); g.strip(0.62, 0.75, -1.5, 1.5, '#c9ccd3'); g.rings([0.65, 0.72], 1.2, '#8d929c');
      g.strip(0.75, 1.1, -1.5, 1.5, '#d9b07a'); g.strip(0.9, 1.1, -1.5, 1.5, '#3f7fff', { zig0: 0.02 });
      for (const o of [-0.4, 0, 0.4]) g.along(o, 0.76, 0.98, 1, 'rgba(120,80,30,0.45)');
    },
  },
  {
    id: 'screwdriver', name: 'Screwdriver', cat: 'stuff', desc: 'Lefty loosey, flippy flippy.', lid: '#ffcc33', gloss: 0.85,
    prof: (p, R) => (p.u < 0.42 ? (p.d0 < R * 0.7 ? 0.32 * Math.max(0.5, p.d0 / (R * 0.7)) : 0.32) : p.u < 0.48 ? 0.32 + 0.68 * sstep((p.u - 0.42) / 0.06) : capRound(p.d1, R) * (0.92 + 0.08 * Math.cos(p.u * 90))),
    paint(g) { g.fillAll('#ffcc33'); g.strip(-0.1, 0.45, -1.5, 1.5, '#c9ccd3'); g.along(-0.12, 0, 0.42, 1.6, 'rgba(255,255,255,0.7)'); for (const o of [-0.5, 0, 0.5]) g.along(o, 0.52, 0.98, 2, 'rgba(180,120,10,0.45)'); },
  },
  {
    id: 'testtube', name: 'Test Tube', cat: 'stuff', desc: 'Experimental flipping.', lid: '#d8f0ff', gloss: 0.95,
    prof: (p, R) => Math.min(capRound(p.d0, R), capFlat(p.d1, R, 2)),
    paint(g) {
      g.fillAll('#e8f6ff'); g.strip(-0.1, 0.58, -1.5, 1.5, '#5dff8a', { zig1: 0.008 });
      for (const [u, o, r] of scatter(g.it, 'bu', 12, 81)) g.dot(0.08 + u * 0.48, o * 0.6, 1 + r * 2.2, null, 'rgba(255,255,255,0.9)', 1.2);
      g.strip(0.95, 1.1, -1.5, 1.5, '#c9e6f6');
    },
  },
  {
    id: 'thermometer', name: 'Thermometer', cat: 'stuff', desc: 'Things are heating up.', lid: '#f4f7fb', gloss: 0.85,
    prof: (p, R) => (p.u < 0.22 ? capRound(p.d0, R) : Math.min(0.72, capRound(p.d1, R * 0.72) * 0.72) + 0.28 * (1 - sstep((p.u - 0.22) / 0.06))),
    paint(g) {
      g.fillAll('#f4f7fb'); g.strip(-0.1, 0.22, -1.5, 1.5, '#e8253a'); g.along(0, 0.2, 0.7, g.R * 0.24, '#e8253a');
      for (let u = 0.3; u < 0.92; u += 0.05) g.line(u, -0.68, u, (Math.round(u * 20) % 2 ? -0.45 : -0.3), 1.1, 'rgba(60,60,80,0.6)');
    },
  },
  {
    id: 'lasersword', name: 'Laser Sword', cat: 'stuff', desc: 'An elegant flipper for a more civilized age.', lid: '#7af0ff', gloss: 0.9,
    prof: (p, R) => (p.u < 0.3 ? capFlat(p.d0, R, 2) * 0.8 : capRound(p.d1, R * 0.85) * 0.85),
    back(g) { g.ctx.save(); g.glow('#3fd0ff', 0.14); g.ctx.restore(); },
    paint(g) {
      g.fillAll('#7af0ff'); g.along(0, 0.32, 0.97, g.R * 0.75, '#f0fdff');
      g.strip(-0.1, 0.3, -1.5, 1.5, '#9aa0aa'); g.strip(0.06, 0.12, -1.5, 1.5, '#2b2b2b'); g.strip(0.26, 0.31, -1.5, 1.5, '#2b2b2b');
      g.dot(0.19, -0.45, 1.6, '#e8253a');
    },
  },
  {
    id: 'telescope', name: 'Telescope', cat: 'stuff', desc: 'Spots the bun from orbit.', lid: '#d9a845', gloss: 0.8,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2), capFlat(p.d1, R, 2)) * (p.u < 0.36 ? 0.68 : p.u < 0.68 ? 0.84 : 1),
    paint(g) {
      g.fillAll('#d9a845'); for (const u of [0.36, 0.68]) g.strip(u - 0.025, u + 0.01, -1.5, 1.5, '#8a5a1a');
      g.strip(0.68, 0.84, -1.5, 1.5, '#2f4a7a'); g.strip(0.97, 1.1, -1.5, 1.5, '#9fdcff');
    },
  },
  {
    id: 'ruler', name: 'Ruler', cat: 'stuff', desc: 'Measures every flip.', lid: '#f5d06a', gloss: 0.4,
    prof: flat(2),
    paint(g) {
      g.fillAll('#f5d06a');
      for (let k = 0; k <= 40; k++) { const u = 0.04 + k * 0.023; g.line(u, -1.2, u, k % 5 ? -0.75 : -0.4, 1.1, 'rgba(60,40,10,0.75)'); }
      g.dot(0.08, 0.35, g.R * 0.14, '#2a1a2e');
    },
  },
  {
    id: 'toothbrush', name: 'Toothbrush', cat: 'stuff', desc: 'Two minutes of flipping.', lid: '#3f9fff', gloss: 0.85,
    prof: (p, R) => Math.min(capRound(p.d0, R * 0.65) * 0.65, p.u < 0.72 ? 0.65 + 0.15 * sstep((p.u - 0.55) / 0.15) : capRound(p.d1, R * 0.8) * 0.8),
    back(g) { for (let k = 0; k < 6; k++) g.at(0.76 + k * 0.035, -0.75, (c, R) => { c.beginPath(); c.rect(-R * 0.08, -R * 0.8, R * 0.16, R * 0.8); ink(c, k % 2 ? '#ffffff' : '#9fdcff', 1.4); }); },
    paint(g) { g.fillAll('#3f9fff'); g.along(-0.3, 0.05, 0.95, g.R * 0.2, 'rgba(255,255,255,0.45)'); g.strip(0.25, 0.4, -1.5, 1.5, '#ffffff'); },
  },
  {
    id: 'newspaper', name: 'Rolled Newspaper', cat: 'stuff', desc: 'Extra! Extra! Flip all about it!', lid: '#ecebe6', gloss: 0.2,
    prof: flat(3),
    paint(g) {
      g.fillAll('#ecebe6');
      for (let r = -0.7; r <= 0.7; r += 0.18) for (const [u0, u1] of [[0.05, 0.3], [0.34, 0.46], [0.6, 0.95]]) g.line(u0, r, u1, r, 1.2, 'rgba(90,90,90,0.45)');
      g.strip(0.08, 0.28, -0.85, -0.35, 'rgba(60,60,60,0.55)'); g.strip(0.49, 0.56, -1.5, 1.5, '#e8402a');
    },
    front(g) { g.endSection(1, [[0.95, '#ecebe6']], 'rgba(90,90,90,0.6)'); },
  },
  {
    id: 'microphone', name: 'Microphone', cat: 'stuff', desc: 'Is this thing on?', lid: '#2b2b2b', gloss: 0.8,
    prof: (p, R) => (p.u < 0.68 ? Math.min(capRound(p.d0, R * 0.55), 1) * (0.55 + 0.25 * (p.u / 0.68)) : 0.8 + 0.25 * Math.sqrt(Math.max(0, 1 - ((p.u - 0.84) / 0.16) ** 2)) * 0 + 0.25 * capRound(p.d1, R) - 0.05),
    paint(g) {
      g.fillAll('#2b2b2b'); g.strip(0.68, 1.1, -1.5, 1.5, '#c9ccd3');
      for (let u = 0.7; u < 1; u += 0.04) g.line(u, -1.3, u, 1.3, 1, 'rgba(60,60,70,0.55)');
      g.along(0, 0.7, 1, 1, 'rgba(60,60,70,0.55)'); g.along(-0.5, 0.7, 1, 1, 'rgba(60,60,70,0.55)'); g.along(0.5, 0.7, 1, 1, 'rgba(60,60,70,0.55)');
      g.strip(0.64, 0.69, -1.5, 1.5, '#e8402a');
    },
  },
  {
    id: 'umbrella', name: 'Umbrella', cat: 'stuff', desc: 'Rain or shine, it flips.', lid: '#e8402a', gloss: 0.6,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.2, 0.08), capFlat(p.d1, R, 4)),
    paint(g) { g.fillAll('#e8402a'); g.stripes(0.16, 0.24, 1.6, 'rgba(120,10,10,0.5)'); g.strip(0.55, 0.6, -1.5, 1.5, '#2b2b2b'); },
    front(g) { g.local(1, (c, R) => { c.beginPath(); c.moveTo(-R * 0.2, 0); c.lineTo(R * 0.7, 0); c.arc(R * 0.7, R * 0.45, R * 0.45, -Math.PI / 2, Math.PI / 2, false); c.lineWidth = R * 0.42; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = R * 0.26; c.strokeStyle = '#8a5a2a'; c.stroke(); }); },
  },
  {
    id: 'flute', name: 'Flute', cat: 'stuff', desc: 'Toot toot, flip flip.', lid: '#d9dee6', gloss: 0.95,
    prof: flat(2),
    paint(g) {
      g.fillAll('#d9dee6'); g.rings([0.32, 0.6], 2, 'rgba(120,130,150,0.8)');
      for (const u of [0.38, 0.45, 0.52, 0.66, 0.73]) g.dot(u, -0.35, g.R * 0.17, '#bfc6d2', INK, 1.4);
      g.dot(0.88, -0.35, g.R * 0.2, '#2a1a2e');
    },
  },
  {
    id: 'sock', name: 'Tube Sock', cat: 'stuff', desc: 'Lost in the wash. Found in the pan.', lid: '#fbfbf7', gloss: 0.15,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 3), capRound(p.d1, R)),
    paint(g) {
      g.fillAll('#fbfbf7'); for (let u = 0.02; u < 0.3; u += 0.025) g.line(u, -1.3, u, 1.3, 1, 'rgba(160,160,150,0.45)');
      g.strip(0.08, 0.13, -1.5, 1.5, '#e8402a'); g.strip(0.17, 0.22, -1.5, 1.5, '#2f7de1');
      g.strip(0.88, 1.1, -1.5, 1.5, '#cfd2da'); g.strip(0.62, 0.78, 0.45, 1.5, '#cfd2da');
    },
  },
  {
    id: 'scarf', name: 'Knitted Scarf', cat: 'stuff', desc: 'Cozy and catapulted.', lid: '#e8402a', gloss: 0.15,
    prof: flat(3),
    paint(g) {
      ['#e8402a', '#fbf6ea', '#3fae4a', '#fbf6ea'].forEach((c, k, a) => { for (let u = k * 0.0625; u < 1; u += 0.25) g.strip(u, u + 0.0625, -1.5, 1.5, c); });
      for (let u = 0.03; u < 1; u += 0.04) for (const o of [-0.5, 0, 0.5]) g.at(u, o, (c, R) => { c.beginPath(); c.moveTo(-R * 0.08, -R * 0.1); c.lineTo(0, R * 0.08); c.lineTo(R * 0.08, -R * 0.1); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.18)'; c.stroke(); });
    },
    front(g) { g.fringe(0, ['#e8402a', '#fbf6ea', '#3fae4a'], 6, 0.75, 0.25, 2.4); g.fringe(1, ['#e8402a', '#fbf6ea', '#3fae4a'], 6, 0.75, 0.25, 2.4); },
  },
  {
    id: 'rope', name: 'Rope', cat: 'stuff', desc: 'Knot your average flipper.', lid: '#d6b37a', gloss: 0.3,
    prof: flat(4),
    paint(g) { g.fillAll('#d6b37a'); g.stripes(0.08, 0.16, g.R * 0.3, 'rgba(140,100,40,0.55)'); g.stripes(0.08, 0.16, g.R * 0.08, 'rgba(255,240,200,0.6)', 0.025); },
    front(g) { g.fringe(0, ['#d6b37a', '#c49a5a'], 7, 0.55, 0.15, 1.8); g.fringe(1, ['#d6b37a', '#c49a5a'], 7, 0.55, 0.15, 1.8); },
  },
  {
    id: 'hose', name: 'Garden Hose', cat: 'stuff', desc: 'Sprays and flips.', lid: '#3fa84a', gloss: 0.85,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 3), capFlat(p.d1, R, 3)) * (p.u > 0.86 ? 0.7 : 0.85),
    paint(g) { g.fillAll('#3fa84a'); g.along(-0.35, 0.03, 0.86, 2, '#ffd84a'); g.strip(-0.1, 0.07, -1.5, 1.5, '#d9a845'); g.strip(0.86, 1.1, -1.5, 1.5, '#d9a845'); g.rings([0.9, 0.95], 1.2, '#8a6a1a'); },
    front(g) { g.local(1, (c, R) => { for (const [x, y, r] of [[R * 0.6, -R * 0.2, 2.2], [R * 1.0, R * 0.25, 1.8], [R * 1.4, -R * 0.1, 1.6]]) { circlePath(c, x + Math.sin(g.t * 9 + x) * 2, y, r); ink(c, '#9fdcff', 1.2); } }); },
  },
  {
    id: 'pen', name: 'Ballpoint Pen', cat: 'stuff', desc: 'Clicks into action.', lid: '#2f6fd6', gloss: 0.85,
    prof: (p, R) => Math.min(capRound(p.d0, R * 0.8) * 0.8, p.d1 < R * 1.6 ? 0.12 + 0.68 * (p.d1 / (R * 1.6)) : 0.8),
    back(g) { g.local(0, (c, R) => { c.beginPath(); c.roundRect(-R * 0.1, -R * 0.25, R * 0.5, R * 0.5, 2); ink(c, '#c9ccd3', 2); }); },
    paint(g) { g.fillAll('#2f6fd6'); g.strip(0.86, 1.1, -1.5, 1.5, '#c9ccd3'); g.along(-0.35, 0.05, 0.85, g.R * 0.18, 'rgba(255,255,255,0.4)'); },
    front(g) { g.at(0.24, -0.82, (c, R) => { c.beginPath(); c.roundRect(-R * 0.9, -R * 0.15, R * 1.4, R * 0.3, R * 0.15); ink(c, '#c9ccd3', 2); }); },
  },
  {
    id: 'papertowel', name: 'Paper Towel', cat: 'stuff', desc: 'Cleans up after every crash.', lid: '#fbfbf7', gloss: 0.2,
    prof: flat(2),
    paint(g) {
      g.fillAll('#fbfbf7'); g.rings([0.2, 0.4, 0.6, 0.8], 1.2, 'rgba(150,150,140,0.55)');
      for (let u = 0.05; u < 1; u += 0.05) for (let o = -0.7; o <= 0.7; o += 0.35) g.dot(u, o, 0.9, 'rgba(160,190,220,0.6)');
    },
    front(g) { g.endSection(1, [[0.95, '#fbfbf7'], [0.38, '#c8955a'], [0.28, '#2a1a2e']]); },
  },
  // ================================================================ RIDES
  {
    id: 'surfboard', name: 'Surfboard', cat: 'rides', desc: 'Catch a wave, land a bun.', lid: '#fbf6ea', gloss: 0.8,
    prof: (p, R) => Math.min(capRound(p.d0, R) * 0.82, capPoint(p.d1, R * 2.2, 0.08) * 0.82),
    back(g) { g.at(0.14, 0.75, (c, R) => { c.beginPath(); c.moveTo(-R * 0.5, 0); c.quadraticCurveTo(-R * 0.4, R * 0.75, R * 0.2, R * 0.85); c.lineTo(R * 0.4, 0); c.closePath(); ink(c, '#2f7de1'); }); },
    paint(g) { g.fillAll('#fbf6ea'); g.strip(-0.1, 1.1, -0.3, 0.3, '#ff8a2b'); g.strip(-0.1, 1.1, -0.12, 0.12, '#e8402a'); g.along(0, 0.03, 0.97, 1, '#8a5a2a'); },
  },
  {
    id: 'submarine', name: 'Submarine', cat: 'rides', desc: 'Dives deep, flips high.', lid: '#ffd23f', gloss: 0.7,
    prof: round2,
    back(g) {
      g.at(0.48, -0.85, (c, R) => { c.beginPath(); c.roundRect(-R * 0.55, -R * 0.75, R * 1.1, R * 0.85, 4); ink(c, '#f2b81f'); c.beginPath(); c.moveTo(R * 0.2, -R * 0.75); c.lineTo(R * 0.2, -R * 1.25); c.lineTo(R * 0.55, -R * 1.25); c.lineWidth = 4.6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = '#8d929c'; c.stroke(); });
      g.local(0, (c, R) => { c.save(); c.rotate(g.t * 12); for (const s of [-1, 1]) { ellipsePath(c, R * 0.2, s * R * 0.4, R * 0.18, R * 0.42); ink(c, '#c9ccd3', 1.8); } c.restore(); });
    },
    paint(g) { g.fillAll('#ffd23f'); for (const u of [0.22, 0.38]) g.dot(u, -0.1, g.R * 0.24, '#9fdcff', '#8d929c', 2.4); g.along(0.6, 0.06, 0.94, 2, 'rgba(170,110,10,0.6)'); },
  },
  {
    id: 'blimp', name: 'Blimp', cat: 'rides', desc: 'Floats like a blimp, flips like a frank.', lid: '#c9ced6', gloss: 0.75,
    prof: (p, R) => 0.15 + 0.92 * Math.pow(Math.sin(Math.PI * Math.max(0.001, Math.min(0.999, p.u))), 0.55),
    back(g) {
      for (const s of [-1, 1]) g.at(0.1, s * 0.4, (c, R) => { c.beginPath(); c.moveTo(R * 0.8, 0); c.lineTo(-R * 0.5, s * R * 0.95); c.lineTo(-R * 0.9, s * R * 0.9); c.lineTo(-R * 0.6, 0); c.closePath(); ink(c, '#e8402a'); });
      g.at(0.5, 0.85, (c, R) => { c.beginPath(); c.roundRect(-R * 0.6, 0, R * 1.2, R * 0.55, 4); ink(c, '#8d929c'); for (const x of [-0.35, 0, 0.35]) { c.beginPath(); c.rect(x * R - 3, R * 0.15, 6, R * 0.22); c.fillStyle = '#9fdcff'; c.fill(); } });
    },
    paint(g) { g.fillAll('#c9ced6'); g.strip(0.3, 0.7, -0.15, 0.15, '#e8402a'); g.rings([0.25, 0.75], 1.2, 'rgba(90,100,120,0.45)'); },
  },
  {
    id: 'jet', name: 'Jumbo Jet', cat: 'rides', desc: 'Now boarding: flight to the bun.', lid: '#f4f6fa', gloss: 0.8,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.4, 0.35), capRound(p.d1, R)),
    back(g) {
      g.at(0.1, -0.7, (c, R) => { c.beginPath(); c.moveTo(R * 0.6, 0); c.lineTo(-R * 0.3, -R * 1.1); c.lineTo(-R * 0.75, -R * 1.1); c.lineTo(-R * 0.6, 0); c.closePath(); ink(c, '#2f7de1'); });
      g.at(0.5, 0.2, (c, R) => { c.beginPath(); c.moveTo(R * 0.6, 0); c.lineTo(-R * 0.6, R * 1.3); c.lineTo(-R * 1.1, R * 1.3); c.lineTo(-R * 0.5, 0); c.closePath(); ink(c, '#c9ced6'); });
    },
    paint(g) { g.fillAll('#f4f6fa'); for (let u = 0.2; u < 0.6; u += 0.06) g.dot(u, -0.3, 1.6, '#2f7de1'); g.strip(-0.1, 1.1, 0.3, 0.42, '#2f7de1'); g.strip(0.92, 1.1, -1.5, 1.5, '#2f4a7a'); },
  },
  {
    id: 'bus', name: 'School Bus', cat: 'rides', desc: 'Next stop: the bun.', lid: '#ffc21a', gloss: 0.6,
    prof: flat(4),
    back(g) { g.wheel(0.22, 0.85, 0.42); g.wheel(0.78, 0.85, 0.42); },
    paint(g) {
      g.fillAll('#ffc21a'); for (let u = 0.1; u < 0.6; u += 0.1) g.at(u, -0.4, (c, R) => { c.beginPath(); c.roundRect(-R * 0.35, -R * 0.32, R * 0.7, R * 0.6, 3); c.fillStyle = '#2f4a7a'; c.fill(); });
      g.strip(-0.1, 1.1, 0.25, 0.36, '#2b2b2b'); g.dot(0.97, 0.45, g.R * 0.16, '#fff6b0', INK, 1.2);
    },
  },
  {
    id: 'train', name: 'Steam Train', cat: 'rides', desc: 'Choo choo, flip flip.', lid: '#d9302a', gloss: 0.7,
    prof: flat(3),
    back(g) {
      for (const u of [0.18, 0.42, 0.66, 0.86]) g.wheel(u, 0.85, 0.36, '#d9302a', '#2b2b2b');
      g.at(0.82, -0.85, (c, R) => { c.beginPath(); c.moveTo(-R * 0.25, 0); c.lineTo(-R * 0.35, -R * 0.75); c.lineTo(R * 0.35, -R * 0.75); c.lineTo(R * 0.25, 0); c.closePath(); ink(c, '#2b2b2b'); });
      for (let k = 0; k < 3; k++) { const f = (g.t * 0.8 + k / 3) % 1; g.at(0.8 - f * 0.25, -1.9 - f * 1.4, (c, R) => { circlePath(c, 0, 0, R * (0.3 + f * 0.5)); c.fillStyle = `rgba(255,255,255,${0.85 * (1 - f)})`; c.fill(); }); }
    },
    paint(g) { g.fillAll('#d9302a'); g.strip(0.5, 1.1, -1.5, 1.5, '#2b2b2b'); g.at(0.2, -0.3, (c, R) => { c.beginPath(); c.roundRect(-R * 0.4, -R * 0.4, R * 0.8, R * 0.6, 3); c.fillStyle = '#ffe08a'; c.fill(); }); g.rings([0.62, 0.78], 2, '#d9a845'); },
  },
  {
    id: 'skateboard', name: 'Skateboard', cat: 'rides', desc: 'Kickflip? Sausage-flip.', lid: '#2f7de1', gloss: 0.6,
    prof: (p, R) => Math.min(capRound(p.d0, R * 0.6), capRound(p.d1, R * 0.6)) * 0.6,
    back(g) { g.wheel(0.2, 0.55, 0.32, '#ffd23f', '#c9ccd3'); g.wheel(0.8, 0.55, 0.32, '#ffd23f', '#c9ccd3'); },
    paint(g) { g.fillAll('#2f7de1'); g.strip(-0.1, 1.1, -1.5, -0.3, '#2b2b2b'); g.stripes(0.2, 0.1, 3, '#ff8a2b', 0.05, 0.1, 0.9); },
  },
  {
    id: 'canoe', name: 'Canoe', cat: 'rides', desc: 'Paddle not included.', lid: '#d9302a', gloss: 0.7,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.8, 0.1), capPoint(p.d1, R * 1.8, 0.1)),
    paint(g) { g.fillAll('#d9302a'); g.strip(-0.1, 1.1, -1.5, -0.6, '#8a5a2a'); g.rings([0.35, 0.65], 2, 'rgba(120,60,20,0.6)'); g.along(0.3, 0.1, 0.9, 1.4, 'rgba(255,255,255,0.3)'); },
  },
  // ================================================================ CRITTERS
  {
    id: 'snake', name: 'Snake', cat: 'critters', desc: 'Sssso flippy.', lid: '#4caf3a', gloss: 0.7,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.4, 0.1), capRound(p.d1, R)),
    paint(g) {
      g.fillAll('#4caf3a'); g.strip(-0.1, 1.1, 0.35, 1.5, '#e6f0a0');
      for (let u = 0.08; u < 0.95; u += 0.085) g.shape(u, [[-0.035, -0.25], [0, -0.75], [0.035, -0.25], [0, 0.15]], '#2f7a24', 1.2);
      for (let u = 0.05; u < 1; u += 0.04) g.line(u, 0.4, u, 1.1, 1, 'rgba(120,140,40,0.45)');
    },
    front(g) { g.local(1, (c, R) => { const k = Math.sin(g.t * 8) > 0 ? 1 : 0.6; c.beginPath(); c.moveTo(0, 0); c.lineTo(R * 0.7 * k, 0); c.lineTo(R * 0.95 * k, -R * 0.2); c.moveTo(R * 0.7 * k, 0); c.lineTo(R * 0.95 * k, R * 0.2); c.lineWidth = 2; c.strokeStyle = '#e8253a'; c.lineCap = 'round'; c.stroke(); }); },
  },
  {
    id: 'earthworm', name: 'Earthworm', cat: 'critters', desc: 'Wiggles with purpose.', lid: '#f0a0a8', gloss: 0.7,
    prof: round2,
    paint(g) { g.fillAll('#f0a0a8'); for (let u = 0.04; u < 1; u += 0.045) g.line(u, -1.2, u, 1.2, 1.2, 'rgba(170,70,90,0.45)'); g.strip(0.3, 0.42, -1.5, 1.5, '#e07888'); },
  },
  {
    id: 'eel', name: 'Eel', cat: 'critters', desc: 'Slippery and shocking.', lid: '#3a4a3a', gloss: 0.9,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.2, 0.15), capRound(p.d1, R)),
    back(g) { g.ctx.save(); for (let u = 0.08; u < 0.75; u += 0.06) g.shape(u, [[-0.03, -0.85], [0.0, -1.35 + Math.sin(g.t * 5 + u * 20) * 0.08], [0.03, -0.85]], '#5a6a3a', 1.6); g.ctx.restore(); },
    paint(g) { g.fillAll('#3a4a3a'); g.strip(-0.1, 1.1, 0.4, 1.5, '#b8c47a'); g.specks('sp', 14, 82, 'rgba(160,200,120,0.5)', 1, 2, 0.1, 0.9, 0.4); },
  },
  {
    id: 'centipede', name: 'Centipede', cat: 'critters', desc: 'A hundred legs, one flip.', lid: '#b8462a', gloss: 0.6,
    prof: (p, R) => round2(p, R) * (0.9 + 0.1 * Math.abs(Math.cos(Math.PI * 10 * p.u))),
    back(g) { g.legs(Array.from({ length: 10 }, (_, k) => 0.06 + k * 0.095), 0.45, '#5a2410', 2); },
    paint(g) { for (let k = 0; k < 10; k++) g.strip(k / 10 - (k ? 0 : 0.1), (k + 1) / 10 + (k === 9 ? 0.1 : 0), -1.5, 1.5, k % 2 ? '#b8462a' : '#d25a34'); for (let k = 1; k < 10; k++) g.line(k / 10, -1.2, k / 10, 1.2, 1.4, 'rgba(70,20,10,0.55)'); },
    front(g) { g.local(1, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-R * 0.3, s * R * 0.4); c.quadraticCurveTo(R * 0.6, s * R * 0.5, R * 0.9, s * R * 1.1); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(); } }); },
  },
  {
    id: 'dachshund', name: 'Dachshund', cat: 'critters', desc: 'The original wiener dog.', lid: '#a8622a', gloss: 0.4,
    prof: (p, R) => Math.min(capRound(p.d0, R * 0.9) * 0.9, capRound(p.d1, R)),
    back(g) {
      g.legs([0.18, 0.28, 0.72, 0.82], 0.55, '#8a4a1a', 4.2);
      g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.2, -R * 0.2); c.quadraticCurveTo(R * 0.6, -R * 0.4, R * 0.75, -R * 1.0 + Math.sin(g.t * 14) * 3); c.lineWidth = 4.8; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 2.8; c.strokeStyle = '#a8622a'; c.stroke(); });
    },
    paint(g) { g.fillAll('#a8622a'); g.strip(-0.1, 1.1, 0.5, 1.5, '#c8844a'); },
    front(g) {
      g.local(1, (c, R) => { circlePath(c, R * 0.15, 0, R * 0.2); ink(c, '#2a1a1a', 1.6); });
      g.at(0.66, -0.55, (c, R) => { c.beginPath(); c.ellipse(0, R * 0.35, R * 0.28, R * 0.6, -0.3, 0, TAU); ink(c, '#6a3612', 2); });
    },
  },
  {
    id: 'ferret', name: 'Ferret', cat: 'critters', desc: 'Business in the front, flip in the back.', lid: '#f3e2c4', gloss: 0.35,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.6, 0.35), capRound(p.d1, R)),
    back(g) { g.legs([0.2, 0.3, 0.7, 0.8], 0.45, '#5a4030', 4); },
    paint(g) { g.fillAll('#f3e2c4'); g.strip(-0.1, 0.22, -1.5, 1.5, '#5a4030', { zig1: 0.02 }); g.strip(0.86, 1.1, -0.6, 0.6, '#5a4030'); },
    front(g) { g.at(0.8, -0.85, (c, R) => { circlePath(c, 0, 0, R * 0.26); ink(c, '#f3e2c4', 1.8); }); g.local(1, (c, R) => { circlePath(c, R * 0.12, 0, R * 0.16); ink(c, '#ff9aa8', 1.4); }); },
  },
  {
    id: 'croc', name: 'Crocodile', cat: 'critters', desc: 'Snap, crackle, flop.', lid: '#4f8a3a', gloss: 0.5,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.2, 0.12), capFlat(p.d1, R, 6) * (p.u > 0.82 ? 0.78 : 1)),
    back(g) { for (let u = 0.08; u < 0.8; u += 0.07) g.shape(u, [[-0.025, -0.85], [0, -1.2], [0.025, -0.85]], '#3f7a2a', 1.4); g.legs([0.25, 0.6], 0.55, '#3f7a2a', 5); },
    paint(g) { g.fillAll('#4f8a3a'); g.strip(-0.1, 1.1, 0.5, 1.5, '#cfe39a'); g.specks('bu', 24, 83, 'rgba(40,80,20,0.5)', 1.2, 2.4, 0.05, 0.8, 0.5); },
    front(g) { g.at(0.92, 0.2, (c, R) => { c.beginPath(); for (let k = 0; k <= 6; k++) c.lineTo(-R * 0.9 + k * R * 0.3, k % 2 ? R * 0.2 : 0); c.lineWidth = 1.6; c.strokeStyle = INK; c.fillStyle = '#ffffff'; c.fill(); c.stroke(); }); },
  },
  {
    id: 'shark', name: 'Shark', cat: 'critters', desc: 'Jaws, but friendlier.', lid: '#6f8fa8', gloss: 0.7,
    prof: (p, R) => Math.min(0.45 + 0.55 * sstep(p.d0 / (R * 1.6)), capPoint(p.d1, R * 1.3, 0.45)),
    back(g) {
      g.at(0.48, -0.8, (c, R) => { c.beginPath(); c.moveTo(-R * 0.7, 0); c.quadraticCurveTo(R * 0.1, -R * 0.4, R * 0.25, -R * 1.25); c.quadraticCurveTo(R * 0.4, -R * 0.4, R * 0.6, 0); c.closePath(); ink(c, '#5f7f98'); });
      g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.25, 0); c.lineTo(R * 1.0, -R * 1.25); c.quadraticCurveTo(R * 0.6, 0, R * 0.9, R * 0.9); c.closePath(); ink(c, '#5f7f98'); });
    },
    paint(g) { g.fillAll('#6f8fa8'); g.strip(-0.1, 1.1, 0.2, 1.5, '#f4f7fb', { w0: (u) => Math.sin(u * 14) * 0.05 }); for (const u of [0.58, 0.62, 0.66]) g.line(u, -0.3, u + 0.01, 0.3, 1.4, 'rgba(40,60,80,0.6)'); },
  },
  {
    id: 'tentacle', name: 'Tentacle', cat: 'critters', desc: 'Grabby. Flippy.', lid: '#9a4fc0', gloss: 0.9,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.8, 0.08), capRound(p.d1, R)),
    paint(g) { g.fillAll('#9a4fc0'); for (let u = 0.1; u < 0.95; u += 0.075) g.dot(u, 0.62, g.R * (0.12 + 0.12 * u), '#f6b8e0', 'rgba(110,40,140,0.8)', 1.2); },
  },
  {
    id: 'snail', name: 'Snail', cat: 'critters', desc: 'Slow and steady flips the bun.', lid: '#c9b08a', gloss: 0.6,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.6, 0.25), capRound(p.d1, R)) * 0.85,
    back(g) {
      g.at(0.4, -1.25, (c, R) => {
        circlePath(c, 0, 0, R * 1.4); ink(c, '#c86a2a');
        c.beginPath(); for (let a = 0; a < 13; a += 0.2) { const r = R * 1.28 * (1 - a / 14); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.lineWidth = 2.6; c.strokeStyle = '#8a3f12'; c.stroke();
        circlePath(c, -R * 0.45, -R * 0.5, R * 0.25); c.fillStyle = 'rgba(255,220,170,0.45)'; c.fill();
      });
    },
    paint(g) { g.fillAll('#c9b08a'); g.specks('sl', 10, 84, 'rgba(255,255,255,0.4)', 1, 1.6); },
    front(g) { g.local(1, (c, R) => { for (const [x1, y1] of [[R * 0.55, -R * 1.25], [R * 0.95, -R * 0.85]]) { c.beginPath(); c.moveTo(-R * 0.35, -R * 0.45); c.quadraticCurveTo(x1 * 0.4, y1 * 0.9, x1, y1); c.lineWidth = 4; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = '#c9b08a'; c.stroke(); circlePath(c, x1, y1, R * 0.16); ink(c, '#c9b08a', 1.6); } }); },
  },
  {
    id: 'gecko', name: 'Gecko', cat: 'critters', desc: 'Sticks the landing. Literally.', lid: '#8ad13f', gloss: 0.7,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.4, 0.12), capRound(p.d1, R)),
    back(g) { for (const u of [0.32, 0.72]) g.at(u, 0.75, (c, R) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(-R * 0.3, R * 0.6); c.lineWidth = 6.4; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#8ad13f'; c.stroke(); for (const d of [-1, 0, 1]) { circlePath(c, -R * 0.3 + d * R * 0.22, R * 0.75, R * 0.12); ink(c, '#8ad13f', 1.4); } }); },
    paint(g) { g.fillAll('#8ad13f'); g.specks('sp', 14, 85, '#ff9a2e', 1.4, 2.6, 0.1, 0.9, 0.55); },
  },
  {
    id: 'narwhal', name: 'Narwhal', cat: 'critters', desc: 'The unicorn of the sea.', lid: '#8fa6c0', gloss: 0.7,
    prof: (p, R) => Math.min(0.5 + 0.5 * sstep(p.d0 / (R * 1.6)), capRound(p.d1, R)),
    back(g) { g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.2, 0); c.quadraticCurveTo(R * 0.6, -R * 0.2, R * 1.0, -R * 0.85); c.quadraticCurveTo(R * 0.7, 0, R * 1.0, R * 0.85); c.quadraticCurveTo(R * 0.6, R * 0.2, -R * 0.2, 0); ink(c, '#7a92ae'); }); },
    paint(g) { g.fillAll('#8fa6c0'); g.strip(-0.1, 1.1, 0.3, 1.5, '#e8eef6'); g.specks('mo', 14, 86, 'rgba(60,80,110,0.4)', 1.4, 2.6, 0.1, 0.9, 0.3); },
    front(g) { g.local(1, (c, R) => { c.beginPath(); c.moveTo(-R * 0.1, -R * 0.15); c.lineTo(R * 1.9, -R * 0.02); c.lineTo(-R * 0.1, R * 0.15); c.closePath(); ink(c, '#f6f0dc', 2); for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(k * R * 0.32, -R * 0.13 + k * R * 0.02); c.lineTo(k * R * 0.32 + R * 0.12, R * 0.12 - k * R * 0.02); c.lineWidth = 1; c.strokeStyle = 'rgba(150,130,90,0.7)'; c.stroke(); } }); },
  },
  {
    id: 'koi', name: 'Koi', cat: 'critters', desc: 'Good luck in fish form.', lid: '#fbf6f0', gloss: 0.8,
    prof: (p, R) => Math.min(0.42 + 0.58 * sstep(p.d0 / (R * 1.5)), capRound(p.d1, R * 1.1)),
    back(g) { g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.25, 0); c.quadraticCurveTo(R * 0.8, -R * 1.3, R * 1.3, -R * 0.9); c.quadraticCurveTo(R * 0.7, 0, R * 1.3, R * 0.9); c.quadraticCurveTo(R * 0.8, R * 1.3, -R * 0.25, 0); ink(c, 'rgba(255,150,80,0.9)'); }); },
    paint(g) { g.fillAll('#fbf6f0'); for (const [u, o, r] of [[0.3, -0.3, 0.7], [0.55, 0.3, 0.55], [0.85, -0.2, 0.6]]) g.dot(u, o, g.R * r, '#ff6a2a'); g.dot(0.15, 0.2, g.R * 0.35, '#2a1a1a'); },
    front(g) { g.local(1, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-R * 0.1, s * R * 0.25); c.quadraticCurveTo(R * 0.5, s * R * 0.5, R * 0.4, s * R * 0.95); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke(); } }); },
  },
  {
    id: 'longcat', name: 'Long Cat', cat: 'critters', desc: 'Is long. Flips anyway.', lid: '#fbfbf8', gloss: 0.3,
    prof: round2,
    back(g) { g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.2, 0); c.quadraticCurveTo(R * 1.1, R * 0.1, R * 1.0, -R * 1.0 + Math.sin(g.t * 3) * 3); c.lineWidth = 6.8; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 4.6; c.strokeStyle = '#fbfbf8'; c.stroke(); }); g.legs([0.15, 0.25, 0.75, 0.85], 0.4, '#fbfbf8', 4.6); },
    paint(g) { g.fillAll('#fbfbf8'); g.along(0.5, 0.1, 0.9, g.R * 0.35, 'rgba(200,200,210,0.4)'); },
    front(g) { for (const du of [0.83, 0.95]) g.at(du, -0.8, (c, R) => { c.beginPath(); c.moveTo(-R * 0.25, R * 0.15); c.lineTo(0, -R * 0.55); c.lineTo(R * 0.25, R * 0.15); c.closePath(); ink(c, '#fbfbf8', 2); c.beginPath(); c.moveTo(-R * 0.12, R * 0.08); c.lineTo(0, -R * 0.3); c.lineTo(R * 0.12, R * 0.08); c.closePath(); c.fillStyle = '#ffb0c0'; c.fill(); }); },
  },
  {
    id: 'spaceslug', name: 'Space Slug', cat: 'critters', desc: 'Visiting from a galaxy far, far away.', lid: '#7ae05a', gloss: 0.9,
    prof: round2,
    back(g) { g.glow('#7ae05a', 0.1, [3.2, 2.6]); },
    paint(g) { g.fillAll('#7ae05a'); g.specks('sp', 14, 87, 'rgba(40,110,40,0.6)', 1.6, 3.2); g.along(-0.4, 0.1, 0.9, g.R * 0.25, 'rgba(230,255,200,0.6)'); },
    front(g) { g.local(1, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-R * 0.5, s * R * 0.5); c.quadraticCurveTo(R * 0.2, s * R * 0.9, R * 0.5, s * R * 1.25); c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke(); circlePath(c, R * 0.5, s * R * 1.25, R * 0.18 * (1 + 0.15 * Math.sin(g.t * 6 + s))); ink(c, '#fff6a0', 1.6); } }); },
  },
  // ================================================================ PARTY
  {
    id: 'mummy', name: 'Mummy', cat: 'party', desc: 'Unwrapped and unstoppable.', lid: '#e8e0cc', gloss: 0.2,
    prof: round2,
    paint(g) { g.fillAll('#e8e0cc'); g.stripes(0.07, 0.09, g.R * 0.12, 'rgba(150,130,100,0.55)'); g.stripes(0.13, -0.11, g.R * 0.1, 'rgba(150,130,100,0.45)', 0.03); },
    front(g) { g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.3, R * 0.3); c.bezierCurveTo(R * 0.5, R * 0.6, R * 0.8, -R * 0.2 + Math.sin(g.t * 5) * 4, R * 1.5, R * 0.3); c.lineWidth = R * 0.42; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = R * 0.28; c.strokeStyle = '#e8e0cc'; c.stroke(); }); },
  },
  {
    id: 'broom', name: 'Witch\'s Broom', cat: 'party', desc: 'Flies. Flips. Spooks.', lid: '#8a5a2a', gloss: 0.4,
    prof: (p, R) => (p.u < 0.32 ? Math.min(1.08, 0.7 + 0.4 * (1 - p.u / 0.32)) * Math.min(1, 0.6 + p.d0 / (R * 0.8)) : 0.62 * Math.min(1, capRound(p.d1, R * 0.62))),
    paint(g) {
      g.fillAll('#8a5a2a'); g.along(-0.25, 0.32, 0.98, 1.2, 'rgba(255,220,160,0.35)');
      g.strip(-0.1, 0.32, -1.5, 1.5, '#e6c25a'); for (let o = -0.9; o <= 0.9; o += 0.15) g.line(-0.05, o * 1.1, 0.3, o * 0.75, 1, 'rgba(160,120,30,0.7)');
      g.strip(0.29, 0.34, -1.5, 1.5, '#7a2fa0');
    },
  },
  {
    id: 'cracker', name: 'Christmas Cracker', cat: 'party', desc: 'Pull for a surprise flip.', lid: '#d9302a', gloss: 0.7,
    prof: (p, R) => { const d = Math.min(p.u, 1 - p.u); return d < 0.16 ? (d < 0.08 ? 0.95 * Math.min(1, 0.4 + Math.min(p.d0, p.d1) / (R * 0.5)) : 0.95 - 0.5 * Math.sin(Math.PI * (d - 0.08) / 0.16)) : d < 0.2 ? 0.45 + 0.55 * sstep((d - 0.16) / 0.04) : 1; },
    paint(g) { g.fillAll('#d9302a'); g.strip(-0.1, 0.16, -1.5, 1.5, '#3fae4a'); g.strip(0.84, 1.1, -1.5, 1.5, '#3fae4a'); g.rings([0.28, 0.72], 3, '#f2c14e'); for (const u of [0.38, 0.5, 0.62]) g.sparkle(u, 0, g.R * 0.28, '#f2c14e', u * 9); },
  },
  {
    id: 'yulelog', name: 'Yule Log', cat: 'party', desc: 'A festive, flippable cake.', lid: '#5a3220', gloss: 0.4,
    prof: flat(5),
    paint(g) { g.fillAll('#5a3220'); [-0.6, -0.2, 0.2, 0.55].forEach((o, k) => wavyLine(g, o, 0.04, 0.96, 1.6, 'rgba(30,15,5,0.6)', 12 + k * 3, 0.1)); g.specks('sn', 22, 88, '#ffffff', 0.8, 1.6, 0.05, 0.95, 0.5); g.strip(-0.1, 1.1, -1.5, -0.7, 'rgba(255,255,255,0.75)', { w1: (u) => Math.sin(u * 30) * 0.08 }); },
    front(g) { g.endSection(0, [[0.95, '#5a3220'], [0.8, '#8a5a3a']], '#fff6ea'); g.at(0.5, -0.9, (c, R) => { leaf(c, -R * 0.1, 0, -R * 0.9, -R * 0.45, R * 0.25, '#2f7a2f'); leaf(c, R * 0.1, 0, R * 0.9, -R * 0.45, R * 0.25, '#2f7a2f'); for (const x of [-0.12, 0.12, 0]) { circlePath(c, x * R, -R * 0.12 - (x ? 0 : R * 0.18), R * 0.15); ink(c, '#e8253a', 1.4); } }); },
  },
  {
    id: 'lights', name: 'Christmas Lights', cat: 'party', desc: 'Merry and bright.', lid: '#1f4a2a', gloss: 0.6,
    prof: round2,
    back(g) { const cols = ['#ff4d6d', '#ffe14d', '#3fa7ff', '#5fd35f']; for (let k = 0; k < 8; k++) { const on = Math.sin(g.t * 3 + k * 1.7) > -0.3; if (on) g.dot(0.08 + k * 0.12, 0, g.R * 0.9, rgba(cols[k % 4], 0.22)); } },
    paint(g) { g.fillAll('#1f4a2a'); const cols = ['#ff4d6d', '#ffe14d', '#3fa7ff', '#5fd35f']; for (let k = 0; k < 8; k++) { const on = Math.sin(g.t * 3 + k * 1.7) > -0.3; g.at(0.08 + k * 0.12, 0, (c, R) => { ellipsePath(c, 0, 0, R * 0.22, R * 0.36); c.fillStyle = on ? cols[k % 4] : '#5a5a5a'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke(); circlePath(c, -R * 0.06, -R * 0.12, R * 0.07); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill(); }); } },
  },
  {
    id: 'present', name: 'Wrapped Present', cat: 'party', desc: 'The gift of flipping.', lid: '#3f7fff', gloss: 0.6,
    prof: flat(2),
    paint(g) { g.fillAll('#3f7fff'); for (const [u, o] of scatter(g.it, 'pd', 24, 89)) g.dot(0.04 + u * 0.92, o * 0.85, 2, '#ffffff'); g.strip(0.46, 0.54, -1.5, 1.5, '#e8253a'); g.strip(-0.1, 1.1, -0.15, 0.15, '#e8253a'); },
    front(g) { g.at(0.5, -0.9, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * R * 0.45, -R * 0.3, R * 0.45, R * 0.28, s * 0.5, 0, TAU); ink(c, '#e8253a', 2); } circlePath(c, 0, -R * 0.05, R * 0.2); ink(c, '#c8102e', 2); }); },
  },
  {
    id: 'partyhorn', name: 'Party Horn', cat: 'party', desc: 'Toot your own horn.', lid: '#ff7ab8', gloss: 0.6,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2) * 0.6, 1) * (p.u < 0.12 ? 1 : 0.6 + 0.4 * sstep((p.u - 0.12) / 0.7)) * (p.u < 0.12 ? 1 : 1) + (p.u < 0.12 ? 0 : 0),
    paint(g) { g.fillAll('#ff7ab8'); g.stripes(0.1, 0.18, g.R * 0.35, '#ffe14d'); g.strip(-0.1, 0.12, -1.5, 1.5, '#fbfbf7'); },
    front(g) { g.fringe(1, ['#ff4d6d', '#ffe14d', '#3fa7ff', '#5fd35f', '#b48cf0'], 7, 1.0, 0.55, 2.4); },
  },
  {
    id: 'firework', name: 'Firework', cat: 'party', desc: 'Lights up the sky.', lid: '#e8253a', gloss: 0.7,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2), p.d1 < R * 1.6 ? 0.1 + 0.9 * (p.d1 / (R * 1.6)) : 1),
    paint(g) { g.fillAll('#e8253a'); g.strip(0.86, 1.1, -1.5, 1.5, '#f2c14e'); g.strip(0.3, 0.38, -1.5, 1.5, '#fbfbf7'); for (const u of [0.15, 0.52, 0.68]) g.sparkle(u, 0, g.R * 0.3, '#f2c14e', u * 7); },
    front(g) { g.local(0, (c, R) => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(R * 0.4, -R * 0.4, R * 0.5, R * 0.4, R * 0.9, 0); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + g.t * 9; c.beginPath(); c.moveTo(R * 0.9, 0); c.lineTo(R * 0.9 + Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35); c.lineWidth = 1.6; c.strokeStyle = k % 2 ? '#ffe14d' : '#ff9a2e'; c.stroke(); } }); },
  },
  {
    id: 'wand', name: 'Magic Wand', cat: 'party', desc: 'Abraca-flip!', lid: '#2a2228', gloss: 0.95,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2), capFlat(p.d1, R, 2)) * 0.75,
    paint(g) { g.fillAll('#2a2228'); g.strip(-0.1, 0.1, -1.5, 1.5, '#fbfbf7'); g.strip(0.9, 1.1, -1.5, 1.5, '#fbfbf7'); },
    front(g) { for (const [u, o, s] of [[1.08, -0.6, 0.45], [1.18, 0.4, 0.35], [0.98, 1.2, 0.3], [1.25, -1.1, 0.25]]) g.sparkle(u, o, g.R * s, '#fff6a0', u * 11); },
  },
  {
    id: 'treasuremap', name: 'Treasure Map', cat: 'party', desc: 'X marks the bun.', lid: '#ecd9a8', gloss: 0.2,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 3), capFlat(p.d1, R, 3)) * (p.u < 0.12 || p.u > 0.88 ? 1 : 0.88),
    paint(g) {
      g.fillAll('#ecd9a8'); g.strip(-0.1, 0.12, -1.5, 1.5, '#d8c08a'); g.strip(0.88, 1.1, -1.5, 1.5, '#d8c08a');
      g.along(0.1, 0.2, 0.7, 1.8, '#8a5a2a', (u) => Math.sin(u * 20) * 0.35); g.line(0.72, -0.35, 0.8, 0.35, 2.4, '#e8253a'); g.line(0.72, 0.35, 0.8, -0.35, 2.4, '#e8253a');
      g.strip(0.46, 0.5, -1.5, 1.5, '#c8102e');
    },
  },
  {
    id: 'tinsel', name: 'Tinsel', cat: 'party', desc: 'Sparkly, fluffy, festive.', lid: '#f2c14e', gloss: 0.9,
    prof: (p, R) => round2(p, R) * (0.9 + 0.12 * Math.abs(wobble(p.u, 17, 3))),
    paint(g) { g.fillAll('#f2c14e'); for (const [u, o, r] of scatter(g.it, 'st', 60, 90)) g.line(0.03 + u * 0.94, o * 0.9, 0.03 + u * 0.94 + 0.02, o * 0.9 + 0.35, 1.2, r > 0.5 ? 'rgba(255,255,220,0.85)' : 'rgba(170,110,10,0.6)'); },
    front(g) { for (const u of [0.2, 0.5, 0.85]) g.sparkle(u, -0.6, g.R * 0.25, '#ffffff', u * 13); },
  },
  {
    id: 'dragon', name: 'Dragon', cat: 'party', desc: 'Legendary. Fire not included (mostly).', lid: '#d9302a', gloss: 0.7,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 2.2, 0.12), capRound(p.d1, R)),
    back(g) {
      const flap = Math.sin(g.t * 6) * 0.35;
      g.at(0.5, -0.7, (c, R) => {
        const tip = [R * 0.3, -R * (2.3 + flap)], a = [-R * 1.9, -R * (1.5 + flap * 0.8)], b = [-R * 0.7, -R * (1.25 + flap * 0.7)];
        c.beginPath(); c.moveTo(R * 0.7, 0); c.lineTo(...tip); c.quadraticCurveTo(-R * 0.9, -R * (2.2 + flap), a[0], a[1]);
        c.quadraticCurveTo(-R * 1.2, -R * (1.1 + flap * 0.5), b[0], b[1]); c.quadraticCurveTo(-R * 0.9, -R * 0.5, -R * 0.8, 0); c.closePath();
        ink(c, '#8a1a12');
        for (const [x, y] of [a, b]) { c.beginPath(); c.moveTo(R * 0.3, -R * 0.1); c.lineTo(x, y); c.lineWidth = 1.8; c.strokeStyle = 'rgba(40,5,0,0.7)'; c.stroke(); }
        c.beginPath(); c.moveTo(R * 0.3, -R * 0.1); c.lineTo(...tip); c.lineWidth = 3; c.strokeStyle = '#5a0f08'; c.stroke();
      });
      for (let u = 0.1; u < 0.85; u += 0.08) g.shape(u, [[-0.025, -0.85], [0, -1.25], [0.025, -0.85]], '#f2c14e', 1.4);
      g.local(0, (c, R) => { c.beginPath(); c.moveTo(-R * 0.2, 0); c.lineTo(R * 0.7, -R * 0.45); c.lineTo(R * 0.45, 0); c.lineTo(R * 0.7, R * 0.45); c.closePath(); ink(c, '#8a1a12'); });
    },
    paint(g) {
      g.fillAll('#d9302a'); g.strip(-0.1, 1.1, 0.4, 1.5, '#f2c14e');
      for (let u = 0.05; u < 0.95; u += 0.05) g.line(u, 0.45, u, 1.2, 1.2, 'rgba(160,90,10,0.6)');
      for (let u = 0.1; u < 0.9; u += 0.07) for (const o of [-0.5, -0.05]) g.at(u + (o < -0.2 ? 0.035 : 0), o, (c, R) => { c.beginPath(); c.arc(0, 0, R * 0.18, 0.4, 2.7); c.lineWidth = 1.2; c.strokeStyle = 'rgba(90,10,5,0.55)'; c.stroke(); });
    },
    front(g) { g.at(0.9, -0.85, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * R * 0.25, 0); c.quadraticCurveTo(s * R * 0.4, -R * 0.5, s * R * 0.1, -R * 0.75); c.lineTo(s * R * 0.05, 0); c.closePath(); ink(c, '#f6f0dc', 1.8); } }); },
  },
  // ================================================================ COLORS
  crayon('crayonred', 'Red Crayon', '#e8402a', '#9a2214'), crayon('crayongreen', 'Green Crayon', '#3fae4a', '#22702a'),
  crayon('crayonpurple', 'Purple Crayon', '#8a4fd0', '#5a2a96'), crayon('crayonorange', 'Orange Crayon', '#ff8a2b', '#b8560f'),
  glowstick('glowpink', 'Pink Glow Stick', '#ff5ad0', '#ffe0f6', '#a82a86'), glowstick('glowblue', 'Blue Glow Stick', '#3fd0ff', '#e0f8ff', '#1f7aa8'),
  glowstick('gloworange', 'Orange Glow Stick', '#ffa23a', '#fff0d8', '#b8620f'),
  gummy('gummyblue', 'Blue Raspberry Worm', [[0, '#3f7fff'], [0.48, '#3f7fff'], [0.52, '#f4f7ff'], [1, '#9fdcff']]),
  gummy('gummygrape', 'Grape Worm', [[0, '#8a4fd0'], [0.48, '#8a4fd0'], [0.52, '#ffa6d6'], [1, '#ff6aa8']]),
  icepop('icelime', 'Lime Ice Pop', '#7ae05a', 'rgba(230,255,210,0.55)'), icepop('icegrape', 'Grape Ice Pop', '#8a4fd0', 'rgba(230,210,255,0.5)'),
  highlighter('hiyellow', 'Yellow Highlighter', '#f6ff3a', '#2b2b2b'), highlighter('hipink', 'Pink Highlighter', '#ff6ad5', '#2b2b2b'),
];

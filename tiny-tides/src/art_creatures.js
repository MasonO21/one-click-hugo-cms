// Tiny Tides — procedural creature art. Everything is drawn with Canvas 2D (no image assets),
// in a "sticker" style: thick plum outline, glossy highlights, big shiny eyes.
import { FORMS, FAMILIES } from './data.js';

const TAU = Math.PI * 2;
export const OUT = '#3b1d5e';
export const CELL = 200;           // design-space size of one sprite cell
const SPRITE_SCALE = 1.8;          // pixels per design unit in the cached bitmaps

// ------------------------------------------------------------------ helpers
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ellipse = (c, cx, cy, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(cx, cy, rx, ry, rot, 0, TAU); };
const vgrad = (c, y0, y1, a, b) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
function fillShape(c, fill, lw = 6) {
  c.fillStyle = fill; c.fill();
  if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
/** Union of several sub-shapes with one continuous outline (outline pass first, fill pass second). */
function blob(c, builders, fill, lw = 6) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = OUT; c.lineWidth = lw * 2;
  for (const b of builders) { c.beginPath(); b(c); c.stroke(); }
  c.fillStyle = fill;
  for (const b of builders) { c.beginPath(); b(c); c.fill(); }
  c.restore();
}
/** Tube along a path; segs = [{ build, w }] drawn outline-first for a seamless silhouette. */
function tube(c, segs, fill, lw = 6) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = OUT;
  for (const s of segs) { c.beginPath(); s.build(c); c.lineWidth = s.w + lw * 2; c.stroke(); }
  c.strokeStyle = fill;
  for (const s of segs) { c.beginPath(); s.build(c); c.lineWidth = s.w; c.stroke(); }
  c.restore();
}
function gloss(c, cx, cy, rx, ry, a = 0.55) {
  c.save(); c.globalAlpha = a; c.fillStyle = '#fff';
  c.beginPath(); c.ellipse(cx - rx * 0.38, cy - ry * 0.52, rx * 0.26, ry * 0.13, -0.55, 0, TAU); c.fill();
  c.beginPath(); c.arc(cx - rx * 0.62, cy - ry * 0.2, Math.max(2, rx * 0.05), 0, TAU); c.fill();
  c.restore();
}
function eyes(c, cx, cy, gap, r, blink, o = {}) {
  for (const sd of [-1, 1]) {
    const x = cx + sd * gap / 2, y = cy;
    if (blink) {
      c.save(); c.strokeStyle = OUT; c.lineWidth = 4.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - r * 0.9, y); c.quadraticCurveTo(x, y + r * 0.9, x + r * 0.9, y); c.stroke(); c.restore();
    } else {
      c.fillStyle = '#2b1248'; ellipse(c, x, y, r * 0.86, r, 0); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - r * 0.28 + (o.look || 0), y - r * 0.36, r * 0.36, 0, TAU); c.fill();
      c.beginPath(); c.arc(x + r * 0.3 + (o.look || 0), y + r * 0.34, r * 0.17, 0, TAU); c.fill();
    }
  }
}
function cheeks(c, cx, cy, gap, r, col = '#ff8fb7') {
  c.save(); c.globalAlpha = 0.55; c.fillStyle = col;
  for (const sd of [-1, 1]) { ellipse(c, cx + sd * gap / 2, cy, r, r * 0.66); c.fill(); }
  c.restore();
}
function mouth(c, cx, cy, w, open = false) {
  c.save(); c.strokeStyle = OUT; c.lineWidth = 3.8; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  if (open) { c.moveTo(cx - w / 2, cy); c.quadraticCurveTo(cx, cy + w * 0.9, cx + w / 2, cy); c.closePath(); c.fillStyle = '#ff6f8f'; c.fill(); c.stroke(); }
  else { c.moveTo(cx - w / 2, cy); c.quadraticCurveTo(cx - w / 4, cy + w * 0.42, cx, cy); c.quadraticCurveTo(cx + w / 4, cy + w * 0.42, cx + w / 2, cy); c.stroke(); }
  c.restore();
}
function leaf(c, x, y, ang, len, wid, fill, vein = true) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -wid, len, 0); c.quadraticCurveTo(len * 0.5, wid, 0, 0);
  fillShape(c, fill, 3.4);
  if (vein) { c.strokeStyle = 'rgba(59,29,94,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(len * 0.1, 0); c.lineTo(len * 0.85, 0); c.stroke(); }
  c.restore();
}
function sparkle(c, x, y, r, fill = '#fff', rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a + Math.PI / 4) * r * 0.3, Math.sin(a + Math.PI / 4) * r * 0.3); }
  c.closePath(); c.fill(); c.restore();
}
function glowDot(c, x, y, r, col = '#ffe46b') {
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.28, col); g.addColorStop(1, 'rgba(255,230,120,0)');
  c.save(); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill(); c.restore();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill();
}
const bodyGrad = (c, pal, y0, y1) => vgrad(c, y0, y1, shade(pal.body, 0.28), pal.body);

// ------------------------------------------------------------------ family drawers
// draw(c, P): body + limbs. face(c, P): eyes/cheeks/mouth (after decorations). geom drives decorations & hats.
const FAM = {};

FAM.crab = {
  facing: 'c',
  geom: { cx: 100, cy: 122, rx: 60, ry: 42, hat: { x: 100, y: 52, s: 0.85, rot: 0, w: 40 }, eye: { x: 100, y: 68, gap: 44 } },
  draw(c, { pal }) {
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = 132 + i * 9;
      tube(c, [{ w: 8, build: (k) => { k.moveTo(100 + sd * 46, y); k.quadraticCurveTo(100 + sd * 72, y + 4, 100 + sd * (76 + i * 3), y + 24); } }], pal.accent, 4.5);
    }
    for (const sd of [-1, 1]) {
      tube(c, [{ w: 9, build: (k) => { k.moveTo(100 + sd * 54, 116); k.quadraticCurveTo(100 + sd * 72, 108, 100 + sd * 72, 90); } }], pal.body, 5);
      const x = 100 + sd * 74, y = 72;
      c.save(); ellipse(c, x, y, 20, 19); fillShape(c, vgrad(c, y - 20, y + 20, shade(pal.accent, 0.3), pal.accent), 5.5);
      c.clip(); c.fillStyle = OUT; c.beginPath(); c.moveTo(x - 9 - sd * 2, y - 26); c.lineTo(x - sd * 2, y - 3); c.lineTo(x + 9 - sd * 2, y - 26); c.closePath(); c.fill(); c.restore();
      ellipse(c, x, y, 20, 19); c.lineWidth = 5.5; c.strokeStyle = OUT; c.stroke();
      gloss(c, x, y, 17, 15, 0.5);
    }
    c.save();
    ellipse(c, 100, 122, 62, 44); fillShape(c, bodyGrad(c, pal, 80, 166), 6);
    ellipse(c, 100, 136, 38, 22); c.fillStyle = pal.belly; c.globalAlpha = 0.75; c.fill();
    c.restore();
    gloss(c, 100, 122, 60, 44, 0.5);
  },
  face(c, { pal, blink }) {
    for (const sd of [-1, 1]) {
      const x = 100 + sd * 22;
      tube(c, [{ w: 5, build: (k) => { k.moveTo(x, 90); k.lineTo(x, 74); } }], pal.body, 4);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, 66, 14, 0, TAU); c.fill(); c.lineWidth = 4.5; c.strokeStyle = OUT; c.stroke();
      if (blink) { c.beginPath(); c.moveTo(x - 9, 68); c.quadraticCurveTo(x, 76, x + 9, 68); c.stroke(); }
      else { c.fillStyle = '#2b1248'; c.beginPath(); c.arc(x, 68, 8, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 2.5, 65, 3, 0, TAU); c.fill(); }
    }
    cheeks(c, 100, 118, 66, 9); mouth(c, 100, 122, 16, true);
  },
};

FAM.snail = {
  facing: 'r',
  geom: { cx: 84, cy: 108, rx: 50, ry: 50, hat: { x: 82, y: 58, s: 0.9, rot: -0.18, w: 34 }, eye: { x: 154, y: 128, gap: 24 } },
  draw(c, { pal }) {
    blob(c, [(k) => k.ellipse(92, 152, 76, 24, 0, 0, TAU), (k) => k.arc(154, 128, 28, 0, TAU)], vgrad(c, 100, 176, shade(pal.body, 0.2), pal.body), 6);
    ellipse(c, 100, 165, 56, 9); c.fillStyle = pal.belly; c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
    // antennae
    for (const [x0, x1, y1] of [[144, 134, 84], [162, 172, 86]]) {
      tube(c, [{ w: 4, build: (k) => { k.moveTo(x0 + (x1 > x0 ? 2 : 0), 108); k.quadraticCurveTo((x0 + x1) / 2, 92, x1, y1); } }], pal.body, 3.6);
      c.fillStyle = pal.accent; c.beginPath(); c.arc(x1, y1 - 2, 7, 0, TAU); fillShape(c, pal.accent, 4);
    }
    // shell
    c.beginPath(); c.arc(84, 108, 54, 0, TAU); fillShape(c, vgrad(c, 54, 162, shade(pal.accent, 0.3), pal.accent), 6.5);
    c.save(); c.beginPath(); c.arc(84, 108, 54, 0, TAU); c.clip();
    c.strokeStyle = shade(pal.accent, -0.22); c.lineWidth = 7; c.lineCap = 'round'; c.beginPath();
    for (let a = 0; a <= 3.9 * Math.PI; a += 0.12) { const r = 4 + a * 4.15; const x = 84 + Math.cos(a - 1) * r, y = 108 + Math.sin(a - 1) * r; a ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.strokeStyle = pal.belly; c.lineWidth = 3; c.globalAlpha = 0.8; c.beginPath();
    for (let a = 0.2; a <= 3.7 * Math.PI; a += 0.12) { const r = 4 + a * 4.15 + 5.5; const x = 84 + Math.cos(a - 1) * r, y = 108 + Math.sin(a - 1) * r; a > 0.2 ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke(); c.restore();
    c.beginPath(); c.arc(84, 108, 54, 0, TAU); c.lineWidth = 6.5; c.strokeStyle = OUT; c.stroke();
    gloss(c, 84, 108, 52, 52, 0.55);
  },
  face(c, { blink }) {
    eyes(c, 154, 128, 24, 7.5, blink); cheeks(c, 154, 141, 34, 6.5); mouth(c, 154, 143, 11);
  },
};

FAM.star = {
  facing: 'c',
  geom: { cx: 100, cy: 108, rx: 44, ry: 44, hat: { x: 100, y: 46, s: 0.78, rot: 0, w: 30 }, eye: { x: 100, y: 108, gap: 28 } },
  draw(c, { pal }) {
    const cx = 100, cy = 110, R = 76, r = 42;
    const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    const build = (k) => { pts.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))); k.closePath(); };
    c.save(); c.lineJoin = 'round';
    c.beginPath(); build(c); c.lineWidth = 26; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); build(c); c.lineWidth = 14; c.strokeStyle = pal.body; c.stroke();
    c.beginPath(); build(c); c.fillStyle = vgrad(c, 34, 186, shade(pal.body, 0.3), pal.body); c.fill();
    c.restore();
    // arm ridges & dots
    c.strokeStyle = pal.accent; c.fillStyle = pal.accent;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TAU / 5;
      for (let k = 1; k <= 3; k++) { const rr = 26 + k * 13; c.globalAlpha = 0.75; c.beginPath(); c.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3.6 - k * 0.5, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    ellipse(c, cx, cy + 2, 30, 26); c.fillStyle = pal.belly; c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
    gloss(c, cx, cy, 56, 56, 0.5);
  },
  face(c, { blink }) { eyes(c, 100, 108, 28, 8.5, blink); cheeks(c, 100, 121, 46, 7.5); mouth(c, 100, 122, 13, true); },
};

FAM.horse = {
  facing: 'r',
  geom: { cx: 96, cy: 108, rx: 30, ry: 52, hat: { x: 100, y: 34, s: 0.85, rot: 0.12, w: 26 }, eye: { x: 108, y: 58, gap: 0 } },
  draw(c, { pal }) {
    // fins
    c.save();
    for (let i = 0; i < 3; i++) leaf(c, 78, 96 + i * 16, Math.PI * 0.95 + i * 0.12, 26 - i * 3, 9, pal.accent, false);
    c.restore();
    for (let i = 0; i < 3; i++) { const a = -2.1 + i * 0.3; leaf(c, 100 + Math.cos(a) * 10, 44 + Math.sin(a) * 6, a - 0.2, 22, 8, pal.accent, false); }
    const spine = (k) => { k.moveTo(108, 62); k.bezierCurveTo(96, 96, 112, 118, 96, 140); };
    const lower = (k) => { k.moveTo(96, 140); k.bezierCurveTo(88, 160, 70, 170, 78, 184); };
    tube(c, [
      { w: 42, build: (k) => { k.moveTo(106, 66); k.quadraticCurveTo(102, 84, 100, 96); } },
      { w: 36, build: (k) => { k.moveTo(100, 96); k.bezierCurveTo(112, 112, 108, 122, 100, 138); } },
      { w: 24, build: (k) => { k.moveTo(100, 138); k.bezierCurveTo(92, 156, 76, 156, 74, 174); } },
      { w: 13, build: (k) => { k.moveTo(74, 174); k.bezierCurveTo(72, 190, 96, 192, 100, 178); } },
    ], pal.body, 6);
    // belly stripes
    c.save(); c.strokeStyle = pal.belly; c.lineWidth = 4.5; c.lineCap = 'round'; c.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) { const y = 92 + i * 12; c.beginPath(); c.moveTo(102 + (i % 2) * 2, y); c.quadraticCurveTo(114, y + 4, 112 - i * 1.2, y + 8); c.stroke(); }
    c.restore();
    // head + snout
    blob(c, [(k) => k.arc(106, 60, 27, 0, TAU), (k) => k.ellipse(138, 70, 22, 10, 0.25, 0, TAU)], vgrad(c, 34, 90, shade(pal.body, 0.28), pal.body), 6);
    ellipse(c, 142, 76, 14, 4.5, 0.2); c.fillStyle = pal.belly; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
    gloss(c, 106, 60, 26, 26, 0.55);
  },
  face(c, { blink }) {
    eyes(c, 108, 56, 0, 8, blink); cheeks(c, 116, 70, 0, 7); c.fillStyle = OUT; c.beginPath(); c.arc(153, 68, 1.8, 0, TAU); c.fill();
  },
};

FAM.jelly = {
  facing: 'c',
  geom: { cx: 100, cy: 92, rx: 62, ry: 50, hat: { x: 100, y: 44, s: 0.95, rot: 0, w: 46 }, eye: { x: 100, y: 100, gap: 40 } },
  draw(c, { pal }) {
    // tentacles behind
    for (let i = 0; i < 5; i++) {
      const x = 58 + i * 21, len = 66 + (i % 2) * 14;
      tube(c, [{ w: 8, build: (k) => { k.moveTo(x, 112); k.bezierCurveTo(x - 12, 112 + len * 0.35, x + 12, 112 + len * 0.7, x - 2 + (i - 2) * 3, 112 + len); } }], shade(pal.accent, 0.1), 4.5);
    }
    tube(c, [{ w: 14, build: (k) => { k.moveTo(86, 108); k.bezierCurveTo(78, 130, 96, 148, 86, 168); } }, { w: 14, build: (k) => { k.moveTo(114, 108); k.bezierCurveTo(122, 130, 104, 148, 114, 168); } }], pal.belly, 5);
    // dome
    const dome = (k) => { k.moveTo(38, 112); k.bezierCurveTo(30, 40, 170, 40, 162, 112); k.quadraticCurveTo(150, 124, 138, 112); k.quadraticCurveTo(124, 126, 112, 113); k.quadraticCurveTo(100, 126, 88, 113); k.quadraticCurveTo(76, 126, 62, 112); k.quadraticCurveTo(50, 124, 38, 112); k.closePath(); };
    c.beginPath(); dome(c); fillShape(c, vgrad(c, 34, 126, shade(pal.body, 0.38), pal.body), 6.5);
    c.save(); c.beginPath(); dome(c); c.clip();
    c.fillStyle = pal.accent; c.globalAlpha = 0.28; ellipse(c, 100, 122, 70, 26); c.fill(); c.restore();
    gloss(c, 100, 88, 62, 50, 0.6);
  },
  face(c, { blink }) { eyes(c, 100, 98, 40, 9.5, blink); cheeks(c, 100, 108, 66, 9); mouth(c, 100, 110, 14); },
};

FAM.octo = {
  facing: 'c',
  geom: { cx: 100, cy: 92, rx: 54, ry: 50, hat: { x: 100, y: 46, s: 0.95, rot: 0, w: 40 }, eye: { x: 100, y: 96, gap: 38 } },
  draw(c, { pal }) {
    const arms = [[-52, 10], [-34, 22], [-14, 28], [14, 28], [34, 22], [52, 10]];
    for (const [dx, k] of arms) {
      const x0 = 100 + dx * 0.72, curl = dx < 0 ? -1 : 1;
      tube(c, [
        { w: 17, build: (p) => { p.moveTo(x0, 118); p.quadraticCurveTo(x0 + dx * 0.5, 150, x0 + dx * 0.6, 160 + k * 0.3); } },
        { w: 10, build: (p) => { p.moveTo(x0 + dx * 0.6, 160 + k * 0.3); p.quadraticCurveTo(x0 + dx * 0.7 + curl * 10, 176 + k * 0.2, x0 + dx * 0.5 + curl * 16, 168 + k * 0.1); } },
      ], pal.body, 5.5);
      c.fillStyle = pal.belly; c.globalAlpha = 0.9;
      for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(x0 + dx * (0.2 + 0.2 * i), 132 + i * 14, 2.6, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
    ellipse(c, 100, 92, 56, 52); fillShape(c, vgrad(c, 40, 146, shade(pal.body, 0.3), pal.body), 6.5);
    gloss(c, 100, 92, 56, 52, 0.55);
  },
  face(c, { blink }) { eyes(c, 100, 98, 38, 9.5, blink); cheeks(c, 100, 110, 64, 9); mouth(c, 100, 112, 15, true); },
};

FAM.angler = {
  facing: 'r',
  geom: { cx: 96, cy: 118, rx: 60, ry: 50, hat: { x: 82, y: 76, s: 0.9, rot: -0.2, w: 34 }, eye: { x: 122, y: 108, gap: 0 } },
  draw(c, { pal }) {
    // tail + fins
    blob(c, [(k) => { k.moveTo(46, 118); k.lineTo(12, 88); k.quadraticCurveTo(4, 118, 12, 148); k.closePath(); }], shade(pal.body, -0.08), 6);
    blob(c, [(k) => { k.moveTo(80, 76); k.quadraticCurveTo(96, 50, 114, 74); k.closePath(); }], shade(pal.body, -0.08), 5);
    blob(c, [(k) => { k.moveTo(84, 158); k.quadraticCurveTo(100, 184, 116, 158); k.closePath(); }], shade(pal.body, -0.08), 5);
    // lure
    tube(c, [{ w: 4.5, build: (k) => { k.moveTo(116, 74); k.bezierCurveTo(130, 30, 160, 26, 164, 52); } }], pal.body, 3.6);
    glowDot(c, 164, 58, 9, pal.accent);
    // body
    ellipse(c, 96, 118, 62, 50); fillShape(c, vgrad(c, 68, 168, shade(pal.body, 0.3), pal.body), 6.5);
    ellipse(c, 100, 142, 42, 20); c.fillStyle = pal.belly; c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
    // toothy grin
    c.save(); c.beginPath(); c.moveTo(102, 128); c.quadraticCurveTo(140, 150, 156, 126); c.quadraticCurveTo(140, 168, 102, 138); c.closePath();
    c.fillStyle = '#2b1248'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(); c.clip();
    c.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) { const x = 112 + i * 11; c.beginPath(); c.moveTo(x - 4, 128 + i * 2); c.lineTo(x, 140 + Math.sin(i) * 2); c.lineTo(x + 4, 130 + i * 1.5); c.closePath(); c.fill(); }
    c.restore();
    gloss(c, 96, 118, 60, 50, 0.5);
  },
  face(c, { blink }) { eyes(c, 122, 106, 0, 12, blink); cheeks(c, 108, 124, 0, 8); },
};

FAM.naut = {
  facing: 'r',
  geom: { cx: 90, cy: 100, rx: 54, ry: 54, hat: { x: 88, y: 48, s: 0.9, rot: -0.1, w: 34 }, eye: { x: 142, y: 130, gap: 22 } },
  draw(c, { pal }) {
    // tentacles
    for (let i = 0; i < 4; i++) {
      const y = 150 + i * 7;
      tube(c, [{ w: 7, build: (k) => { k.moveTo(140, y - 6); k.quadraticCurveTo(160, y + 8, 178 - i * 4, y + 4 + i * 4); } }], pal.belly, 4.5);
    }
    // hood / head
    blob(c, [(k) => k.ellipse(140, 128, 30, 28, 0, 0, TAU)], vgrad(c, 100, 160, shade(pal.belly, 0.2), pal.belly), 6);
    // shell
    c.beginPath(); c.arc(90, 104, 58, 0, TAU); fillShape(c, vgrad(c, 46, 162, shade(pal.body, 0.25), pal.body), 6.5);
    c.save(); c.beginPath(); c.arc(90, 104, 58, 0, TAU); c.clip();
    c.strokeStyle = pal.accent; c.lineWidth = 9; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -0.6 + i * 0.5; c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(90 + Math.cos(a) * 8, 104 + Math.sin(a) * 8); c.quadraticCurveTo(90 + Math.cos(a + 0.5) * 34, 104 + Math.sin(a + 0.5) * 34, 90 + Math.cos(a + 0.9) * 62, 104 + Math.sin(a + 0.9) * 62); c.stroke();
    }
    c.globalAlpha = 1; c.strokeStyle = shade(pal.body, -0.25); c.lineWidth = 4;
    c.beginPath(); for (let a = 0; a <= 3.6 * Math.PI; a += 0.12) { const r = 3 + a * 4.6; const x = 90 + Math.cos(a) * r, y = 104 + Math.sin(a) * r; a ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    c.restore();
    c.beginPath(); c.arc(90, 104, 58, 0, TAU); c.lineWidth = 6.5; c.strokeStyle = OUT; c.stroke();
    gloss(c, 90, 104, 56, 56, 0.55);
  },
  face(c, { blink }) { eyes(c, 142, 126, 22, 7.5, blink); cheeks(c, 142, 139, 34, 6); mouth(c, 142, 141, 10); },
};

FAM.manta = {
  facing: 'c',
  geom: { cx: 100, cy: 108, rx: 70, ry: 42, hat: { x: 100, y: 60, s: 0.9, rot: 0, w: 40 }, eye: { x: 100, y: 108, gap: 36 } },
  draw(c, { pal }) {
    tube(c, [{ w: 6, build: (k) => { k.moveTo(100, 150); k.bezierCurveTo(92, 168, 110, 180, 100, 196); } }], pal.accent, 4.5);
    const wing = (k) => { k.moveTo(100, 56); k.bezierCurveTo(140, 62, 170, 96, 190, 122); k.bezierCurveTo(160, 118, 132, 128, 100, 158); k.bezierCurveTo(68, 128, 40, 118, 10, 122); k.bezierCurveTo(30, 96, 60, 62, 100, 56); k.closePath(); };
    c.beginPath(); wing(c); fillShape(c, vgrad(c, 54, 160, shade(pal.body, 0.3), pal.body), 6.5);
    c.save(); c.beginPath(); wing(c); c.clip();
    ellipse(c, 100, 128, 46, 34); c.fillStyle = pal.belly; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
    c.fillStyle = pal.accent; c.globalAlpha = 0.55;
    for (const [x, y, r] of [[52, 110, 4], [64, 96, 3.2], [148, 110, 4], [136, 96, 3.2], [40, 118, 2.6], [160, 118, 2.6]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.restore();
    for (const sd of [-1, 1]) blob(c, [(k) => { k.moveTo(100 + sd * 12, 64); k.quadraticCurveTo(100 + sd * 24, 48, 100 + sd * 32, 62); k.quadraticCurveTo(100 + sd * 22, 68, 100 + sd * 12, 64); }], pal.accent, 4.5);
    gloss(c, 100, 100, 70, 44, 0.55);
  },
  face(c, { blink }) { eyes(c, 100, 104, 36, 8.5, blink); cheeks(c, 100, 116, 62, 8); mouth(c, 100, 118, 12); },
};

FAM.drake = {
  facing: 'l',
  geom: { cx: 92, cy: 112, rx: 54, ry: 26, hat: { x: 148, y: 60, s: 0.8, rot: 0.2, w: 24 }, eye: { x: 150, y: 80, gap: 0 } },
  draw(c, { pal }) {
    // leafy appendages (behind)
    const L = [[120, 96, -1.3, 34], [96, 100, -1.5, 40], [72, 110, -1.7, 38], [50, 122, -1.9, 32], [112, 124, 1.1, 26], [84, 134, 1.4, 28], [58, 140, 1.6, 24]];
    for (const [x, y, a, len] of L) leaf(c, x, y, a, len, 13, shade(pal.accent, 0.1));
    tube(c, [
      { w: 38, build: (k) => { k.moveTo(146, 88); k.quadraticCurveTo(130, 104, 112, 108); } },
      { w: 32, build: (k) => { k.moveTo(112, 108); k.bezierCurveTo(96, 116, 78, 124, 62, 128); } },
      { w: 20, build: (k) => { k.moveTo(62, 128); k.bezierCurveTo(40, 132, 26, 124, 26, 106); } },
      { w: 11, build: (k) => { k.moveTo(26, 106); k.bezierCurveTo(26, 90, 40, 84, 46, 92); } },
    ], pal.body, 6);
    c.save(); c.strokeStyle = pal.belly; c.lineWidth = 4.5; c.lineCap = 'round'; c.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) { const x = 108 - i * 13; c.beginPath(); c.moveTo(x, 118 + i * 3); c.quadraticCurveTo(x - 4, 126 + i * 3, x - 10, 127 + i * 3.5); c.stroke(); }
    c.restore();
    blob(c, [(k) => k.arc(150, 80, 25, 0, TAU), (k) => k.ellipse(174, 90, 18, 9, 0.35, 0, TAU)], vgrad(c, 54, 106, shade(pal.body, 0.28), pal.body), 6);
    for (let i = 0; i < 3; i++) leaf(c, 134 + i * 8, 58 + i * 1, -1.9 + i * 0.35, 20, 7.5, pal.accent, false);
    gloss(c, 150, 80, 24, 24, 0.55);
  },
  face(c, { blink }) { eyes(c, 152, 76, 0, 8, blink); cheeks(c, 160, 90, 0, 6.5); c.fillStyle = OUT; c.beginPath(); c.arc(181, 88, 1.8, 0, TAU); c.fill(); },
};

export const FAMILY_ART = FAM;

// ------------------------------------------------------------------ decorations
const DECO_LAYER = { aura: 'back', rays: 'back' };
function decoPoints(g, rnd, n, top = false) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = top ? -Math.PI * (0.12 + rnd() * 0.76) : rnd() * TAU;
    const k = top ? 0.75 + rnd() * 0.2 : Math.sqrt(rnd()) * 0.75;
    pts.push([g.cx + Math.cos(a) * g.rx * k, g.cy + Math.sin(a) * g.ry * k, a]);
  }
  return pts;
}
const DECO = {
  aura(c, g, pal) {
    const gr = c.createRadialGradient(g.cx, g.cy, 10, g.cx, g.cy, 96);
    gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.35, shade(pal.accent, 0.4).replace('rgb', 'rgba').replace(')', ',.55)')); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(g.cx, g.cy, 98, 0, TAU); c.fill();
  },
  rays(c, g, pal) {
    c.save(); c.translate(g.cx, g.cy); c.fillStyle = shade(pal.accent, 0.35);
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(-6, -70); c.lineTo(0, -92); c.lineTo(6, -70); c.closePath(); c.fill(); }
    c.restore();
  },
  moss(c, g, pal, rnd) {
    for (const [x, y] of decoPoints(g, rnd, 6, true)) { c.beginPath(); c.arc(x, y, 7 + rnd() * 5, 0, TAU); fillShape(c, '#5ecb7a', 3.2); }
    c.fillStyle = 'rgba(255,255,255,.4)'; for (const [x, y] of decoPoints(g, rnd, 5, true)) { c.beginPath(); c.arc(x - 2, y - 2, 2.4, 0, TAU); c.fill(); }
  },
  rocks(c, g, pal, rnd) {
    for (const [x, y] of decoPoints(g, rnd, 4, true)) {
      const r = 8 + rnd() * 6; c.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + rnd() * 0.4, rr = r * (0.75 + rnd() * 0.35); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85); }
      c.closePath(); fillShape(c, vgrad(c, y - r, y + r, '#c9d0e6', '#8a94b8'), 3.4);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.35, r * 0.3, r * 0.15, -0.5, 0, TAU); c.fill();
    }
  },
  lava(c, g, pal, rnd) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 3; k++) {
      const x0 = g.cx - g.rx * 0.6 + k * g.rx * 0.6, y0 = g.cy - g.ry * 0.4;
      c.beginPath(); c.moveTo(x0, y0);
      for (let i = 1; i < 4; i++) c.lineTo(x0 + (rnd() - 0.5) * 22, y0 + i * g.ry * 0.28);
      c.strokeStyle = 'rgba(255,90,60,.55)'; c.lineWidth = 8; c.stroke();
      c.strokeStyle = '#ffe27a'; c.lineWidth = 3.4; c.stroke();
    }
    c.restore();
    for (const [x, y] of decoPoints(g, rnd, 3, true)) glowDot(c, x, y - 6, 3.2, '#ff9d4d');
  },
  leaves(c, g, pal, rnd) {
    const pts = decoPoints(g, rnd, 3, true);
    pts.forEach(([x, y, a], i) => leaf(c, x, y, a - 0.3 + (i - 1) * 0.35, 26, 10, i % 2 ? '#5ecb7a' : '#7be08f'));
  },
  glowdots(c, g, pal, rnd) { for (const [x, y] of decoPoints(g, rnd, 6)) glowDot(c, x, y, 3.2 + rnd() * 2, '#ffe46b'); },
  bubbles(c, g, pal, rnd) {
    for (const [x, y] of decoPoints(g, rnd, 5)) {
      const r = 5 + rnd() * 6; c.save(); c.globalAlpha = 0.65; c.fillStyle = '#eafcff'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.lineWidth = 2.6; c.strokeStyle = 'rgba(59,29,94,.55)'; c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU); c.fill(); c.restore();
    }
  },
  stars(c, g, pal, rnd) { for (const [x, y] of decoPoints(g, rnd, 5)) sparkle(c, x, y, 5 + rnd() * 4, rnd() > 0.5 ? '#fff' : '#ffe46b', rnd()); },
  crystals(c, g, pal, rnd) {
    for (const [x, y, a] of decoPoints(g, rnd, 4, true)) {
      c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2); const h = 14 + rnd() * 8;
      c.beginPath(); c.moveTo(-5, 2); c.lineTo(0, -h); c.lineTo(5, 2); c.closePath();
      fillShape(c, vgrad(c, -h, 2, '#f4e6ff', '#c69bff'), 3.2);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(-2, -2); c.lineTo(0, -h + 3); c.lineTo(-0.5, -2); c.fill(); c.restore();
    }
  },
  stripes(c, g, pal) {
    c.save(); c.strokeStyle = pal.accent; c.globalAlpha = 0.5; c.lineWidth = 5; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(g.cx, g.cy + 40, g.rx * (0.55 + i * 0.16), Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
    c.restore();
  },
  spots(c, g, pal, rnd) { c.fillStyle = pal.accent; c.globalAlpha = 0.6; for (const [x, y] of decoPoints(g, rnd, 6)) { c.beginPath(); c.arc(x, y, 3 + rnd() * 3, 0, TAU); c.fill(); } c.globalAlpha = 1; },
};

// ------------------------------------------------------------------ hats
export const HAT_ART = {
  partyhat(c) {
    c.beginPath(); c.moveTo(-15, 0); c.lineTo(0, -40); c.lineTo(15, 0); c.closePath(); fillShape(c, vgrad(c, -40, 0, '#ff8ed4', '#ff5ec0'), 4.5);
    c.save(); c.clip(); c.strokeStyle = '#ffe66d'; c.lineWidth = 5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-18, -6 - i * 12); c.lineTo(18, -16 - i * 12); c.stroke(); } c.restore();
    c.beginPath(); c.arc(0, -42, 5.5, 0, TAU); fillShape(c, '#ffe66d', 3.4);
  },
  crownhat(c) {
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(-22, -26); c.lineTo(-10, -14); c.lineTo(0, -32); c.lineTo(10, -14); c.lineTo(22, -26); c.lineTo(20, 0); c.closePath();
    fillShape(c, vgrad(c, -32, 0, '#ffe98a', '#ffc21f'), 4.5);
    for (const [x, y, col] of [[-10, -6, '#ff5ea8'], [0, -8, '#5ec8ff'], [10, -6, '#ff5ea8']]) { c.beginPath(); c.arc(x, y, 3.2, 0, TAU); fillShape(c, col, 2); }
  },
  bow(c) {
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(0, -4); c.quadraticCurveTo(sd * 18, -26, sd * 26, -10); c.quadraticCurveTo(sd * 22, 8, 0, -2); c.closePath(); fillShape(c, vgrad(c, -26, 8, '#ffb1d6', '#ff7fb8'), 4); }
    c.beginPath(); c.arc(0, -4, 6, 0, TAU); fillShape(c, '#ff5fa6', 3.6);
  },
  shades(c, g) {
    c.save(); c.fillStyle = '#231044';
    for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * 15, 0, 13, 10, 0, 0, TAU); fillShape(c, '#231044', 4); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(sd * 15 - 3, -3, 4, 2.2, -0.5, 0, TAU); c.fill(); }
    c.strokeStyle = OUT; c.lineWidth = 4; c.beginPath(); c.moveTo(-3, -1); c.lineTo(3, -1); c.stroke(); c.restore();
  },
  flowerhat(c) {
    for (let i = 0; i < 6; i++) { c.save(); c.rotate(i * TAU / 6); c.beginPath(); c.ellipse(0, -12, 6.5, 10, 0, 0, TAU); fillShape(c, '#fff', 3.4); c.restore(); }
    c.beginPath(); c.arc(0, 0, 7, 0, TAU); fillShape(c, '#ffd23f', 3.4);
  },
  cap(c) {
    c.beginPath(); c.moveTo(-18, 0); c.bezierCurveTo(-18, -26, 18, -26, 18, 0); c.closePath(); fillShape(c, vgrad(c, -24, 0, '#7fe3ff', '#3fb8ee'), 4.5);
    c.beginPath(); c.ellipse(12, 1, 22, 6, 0.08, 0, TAU); fillShape(c, '#2fa4de', 4);
    c.beginPath(); c.arc(0, -25, 3.6, 0, TAU); fillShape(c, '#ffe66d', 3);
  },
  halo(c) {
    c.beginPath(); c.ellipse(0, -12, 20, 6.5, 0, 0, TAU); c.lineWidth = 11; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 5.5; c.strokeStyle = '#ffe98a'; c.stroke();
    glowDot(c, -12, -15, 2.4, '#fff3a6');
  },
  wizard(c) {
    c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(-6, -24, 8, -50); c.quadraticCurveTo(14, -24, 18, 0); c.closePath(); fillShape(c, vgrad(c, -50, 0, '#a98bff', '#6a4ce0'), 4.5);
    c.beginPath(); c.ellipse(0, 0, 26, 6, 0, 0, TAU); fillShape(c, '#5a3fd0', 4.5);
    sparkle(c, -2, -22, 5, '#ffe66d'); sparkle(c, 8, -10, 3, '#fff');
  },
  headphones(c, g) {
    const w = (g.hat.w || 34) + 2;
    c.beginPath(); c.arc(0, 8, w, Math.PI * 1.05, Math.PI * 1.95); c.lineWidth = 12; c.strokeStyle = OUT; c.lineCap = 'round'; c.stroke(); c.lineWidth = 5.5; c.strokeStyle = '#ff5ec0'; c.stroke();
    for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * w, 10, 8, 12, 0, 0, TAU); fillShape(c, '#2fe6d6', 4); }
  },
};

// ------------------------------------------------------------------ public: form sprites
const spriteCache = new Map();
/** Draw a form into ctx at design-space (0..CELL). */
export function paintForm(c, formId, { blink = false, hat = null, plain = false } = {}) {
  const f = FORMS[formId], art = FAM[f.fam], g = art.geom, pal = f.pal, rnd = rng(hash(formId));
  const P = { pal, blink };
  // back decorations
  if (!plain) for (const d of f.deco) if (DECO_LAYER[d] === 'back' && DECO[d]) DECO[d](c, g, pal, rnd);
  art.draw(c, P);
  for (const d of f.deco) if (!DECO_LAYER[d] && d !== 'crown' && DECO[d]) DECO[d](c, g, pal, rnd);
  art.face(c, P);
  const h = hat || (f.deco.includes('crown') ? '__crown' : null);
  if (h) {
    c.save(); c.translate(g.hat.x, g.hat.y); c.rotate(g.hat.rot || 0); c.scale(g.hat.s, g.hat.s);
    if (h === '__crown') HAT_ART.crownhat(c, g);
    else if (h === 'shades') { c.setTransform(1, 0, 0, 1, 0, 0); }
    if (h === 'shades') {
      c.restore(); c.save(); c.translate(g.eye.x, g.eye.y - 1); c.scale(Math.max(0.7, (g.eye.gap || 34) / 34), 1); HAT_ART.shades(c, g);
    } else if (h !== '__crown') HAT_ART[h]?.(c, g);
    c.restore();
  }
  if (f.stage === 3 && !plain) { const r = rng(hash(formId + 'sp')); for (let i = 0; i < 4; i++) sparkle(c, 20 + r() * 160, 22 + r() * 120, 4 + r() * 4, '#fff', r()); }
}
/** Cached bitmap sprite. Returns { canvas, w, h } in design units (canvas is SPRITE_SCALE times larger). */
export function getSprite(formId, opts = {}) {
  const key = `${formId}|${opts.blink ? 1 : 0}|${opts.hat || ''}`;
  let s = spriteCache.get(key);
  if (s) return s;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(CELL * SPRITE_SCALE);
  const c = cv.getContext('2d');
  c.scale(SPRITE_SCALE, SPRITE_SCALE);
  paintForm(c, formId, opts);
  s = { canvas: cv, size: CELL };
  spriteCache.set(key, s);
  return s;
}
export const facingOf = (formId) => FAM[FORMS[formId].fam].facing;
export const geomOf = (formId) => FAM[FORMS[formId].fam].geom;
/** A flat dark silhouette (undiscovered dex entries). */
export function getSilhouette(formId) {
  const key = `${formId}|sil`;
  let s = spriteCache.get(key);
  if (s) return s;
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(CELL * SPRITE_SCALE);
  const c = cv.getContext('2d');
  c.scale(SPRITE_SCALE, SPRITE_SCALE);
  paintForm(c, formId, { plain: true });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-in'; c.fillStyle = '#5a4a8c'; c.fillRect(0, 0, cv.width, cv.height);
  s = { canvas: cv, size: CELL };
  spriteCache.set(key, s);
  return s;
}
export function drawSprite(c, formId, x, y, size, o = {}) {
  const s = o.silhouette ? getSilhouette(formId) : getSprite(formId, o);
  c.drawImage(s.canvas, x - size / 2, y - size * 0.62, size, size);
}
export const FAMILY_LIST = Object.keys(FAMILIES);

// ------------------------------------------------------------------ capsule-machine hats
Object.assign(HAT_ART, {
  catears(c) {
    for (const sd of [-1, 1]) {
      c.beginPath(); c.moveTo(sd * 6, 2); c.lineTo(sd * 14, -26); c.lineTo(sd * 26, -2); c.closePath(); fillShape(c, vgrad(c, -26, 2, '#ffc0dc', '#ff8ac0'), 4.2);
      c.beginPath(); c.moveTo(sd * 12, -3); c.lineTo(sd * 15, -17); c.lineTo(sd * 21, -4); c.closePath(); c.fillStyle = '#ffe0ef'; c.fill();
    }
  },
  chef(c) {
    for (const [x, y, r] of [[-11, -22, 12], [11, -22, 12], [0, -30, 14]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); fillShape(c, vgrad(c, y - r, y + r, '#ffffff', '#e6ecff'), 4); }
    c.beginPath(); c.rect(-16, -14, 32, 15); fillShape(c, vgrad(c, -14, 1, '#ffffff', '#dfe6fb'), 4.2);
    c.strokeStyle = 'rgba(59,29,94,.25)'; c.lineWidth = 2; for (const x of [-7, 0, 7]) { c.beginPath(); c.moveTo(x, -12); c.lineTo(x, -1); c.stroke(); }
  },
  antenna(c) {
    c.strokeStyle = OUT; c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(-6, -16, 4, -30); c.stroke();
    c.strokeStyle = '#8ff3ff'; c.lineWidth = 4; c.stroke();
    c.beginPath(); c.arc(4, -36, 11, 0, TAU); fillShape(c, vgrad(c, -47, -25, '#ffffff', '#ff8ac0'), 4.2);
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(0, -40, 3.5, 2, -0.7, 0, TAU); c.fill();
  },
  tophat(c) {
    c.beginPath(); c.ellipse(0, 0, 26, 7, 0, 0, TAU); fillShape(c, '#3a2a5e', 4.2);
    c.beginPath(); c.rect(-15, -34, 30, 34); fillShape(c, vgrad(c, -34, 0, '#5a4690', '#33245a'), 4.2);
    c.beginPath(); c.rect(-15, -12, 30, 8); c.fillStyle = '#ff6fa8'; c.fill(); c.lineWidth = 2.6; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.ellipse(0, -34, 15, 4.5, 0, 0, TAU); fillShape(c, '#4a3a7a', 3.4);
    c.save(); c.globalAlpha = 0.5; c.fillStyle = '#fff'; c.fillRect(-11, -30, 4, 16); c.restore();
  },
  pirate(c) {
    c.beginPath(); c.moveTo(-30, 2); c.quadraticCurveTo(-22, -34, 0, -32); c.quadraticCurveTo(22, -34, 30, 2); c.quadraticCurveTo(0, -6, -30, 2); c.closePath(); fillShape(c, vgrad(c, -34, 2, '#4a3f78', '#241a48'), 4.4);
    c.beginPath(); c.moveTo(-30, 2); c.quadraticCurveTo(0, -6, 30, 2); c.strokeStyle = '#ffd23f'; c.lineWidth = 3.2; c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -16, 6.5, 0, TAU); c.fill(); c.fillRect(-3.5, -12, 7, 6);
    c.fillStyle = '#241a48'; c.beginPath(); c.arc(-2.4, -17, 1.6, 0, TAU); c.arc(2.4, -17, 1.6, 0, TAU); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-10, -8); c.lineTo(10, -22); c.moveTo(10, -8); c.lineTo(-10, -22); c.stroke();
  },
  starclip(c) {
    c.save(); c.rotate(-0.25); c.translate(-14, -6);
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 16; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); fillShape(c, vgrad(c, -16, 16, '#fff3a6', '#ffb02e'), 3.6);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-3, -4, 2.4, 0, TAU); c.fill(); c.restore();
    sparkle(c, 12, -22, 5, '#fff'); sparkle(c, 22, -8, 3.4, '#ffe66d');
  },
  unicorn(c) {
    c.save(); c.rotate(0.06);
    c.beginPath(); c.moveTo(-9, 2); c.lineTo(0, -44); c.lineTo(9, 2); c.closePath(); fillShape(c, vgrad(c, -44, 2, '#fff', '#f4c8ff'), 4.2);
    c.save(); c.clip(); c.strokeStyle = '#ff8ad8'; c.lineWidth = 4.4; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-14, -6 - i * 9); c.lineTo(14, -14 - i * 9); c.stroke(); } c.restore();
    c.restore();
    sparkle(c, -14, -34, 5, '#fff'); sparkle(c, 15, -28, 4, '#ffe66d');
    for (const [x, col] of [[-14, '#ff8ad8'], [14, '#8ff3ff']]) { c.beginPath(); c.arc(x, -2, 6, 0, TAU); fillShape(c, col, 3.2); }
  },
  goldcrown(c) {
    c.beginPath(); c.moveTo(-26, 2); c.lineTo(-30, -34); c.lineTo(-14, -16); c.lineTo(-7, -42); c.lineTo(0, -18); c.lineTo(7, -42); c.lineTo(14, -16); c.lineTo(30, -34); c.lineTo(26, 2); c.closePath();
    fillShape(c, vgrad(c, -42, 2, '#fff7b8', '#f5a90f'), 4.6);
    for (const [x, y, col] of [[-14, -6, '#ff5ea8'], [0, -9, '#5ec8ff'], [14, -6, '#7be3a3']]) { c.beginPath(); c.arc(x, y, 4.2, 0, TAU); fillShape(c, col, 2.2); }
    for (const [x, y] of [[-30, -36], [-7, -44], [7, -44], [30, -36]]) { c.beginPath(); c.arc(x, y, 3.6, 0, TAU); fillShape(c, '#fff', 2.4); }
    sparkle(c, -22, -20, 5, '#fff'); sparkle(c, 20, -24, 4, '#fff');
  },
});

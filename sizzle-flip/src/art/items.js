// Shop characters: 30 things to flip instead of the sausage.
// Purely cosmetic — every item is drawn over the SAME soft-body particle chain (same hitbox, mass and
// bounce), so levels play identically. Each item is a width profile along the body's centreline plus
// painted details, small attachments (stems, sticks, flames, fins) and the usual face.
import { INK, rgba, darken, lighten, circlePath, ellipsePath } from './common.js';
import { centreline, sampleAt, squashPoints, drawFace } from './sausage.js';

const TAU = Math.PI * 2;
const M = 96; // samples along the body
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// cap profiles: d = distance from that end (px), result = fraction of R
const capRound = (d, r) => (d >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - d) / r) ** 2)));
const capFlat = (d, R, k) => (d >= k ? 1 : (1 - k / R) + (k / R) * Math.sqrt(Math.max(0, 1 - ((k - d) / k) ** 2)));
const capPoint = (d, len, tip = 0.14) => (d >= len ? 1 : tip + (1 - tip) * Math.pow(d / len, 0.8));
const round2 = (p, R) => Math.min(capRound(p.d0, R), capRound(p.d1, R));

// deterministic scatter (cached per item) so speckles don't shimmer
function scatter(it, key, n, seed) {
  it._s = it._s || {};
  if (!it._s[key]) {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    it._s[key] = Array.from({ length: n }, () => [r(), r() * 2 - 1, r()]);
  }
  return it._s[key];
}

// ------------------------------------------------------------------ spine + toolkit
// The body's centreline extended by R at both ends (where the round caps of the physics capsule are),
// resampled uniformly: u = 0 at the tail tip, u = 1 at the head tip (the face end).
function makeSpine(cl, R) {
  const a = sampleAt(cl, 0), b = sampleAt(cl, 1);
  const L = cl.len + 2 * R;
  const pts = [];
  for (let i = 0; i <= M; i++) {
    const d = (i / M) * L - R;
    let p;
    if (d <= 0) p = { x: a.x + a.tx * d, y: a.y + a.ty * d, tx: a.tx, ty: a.ty };
    else if (d >= cl.len) { const e = d - cl.len; p = { x: b.x + b.tx * e, y: b.y + b.ty * e, tx: b.tx, ty: b.ty }; }
    else { const s = sampleAt(cl, d / cl.len); p = { x: s.x, y: s.y, tx: s.tx, ty: s.ty }; }
    p.nx = -p.ty; p.ny = p.tx; p.u = i / M; p.d0 = (i / M) * L; p.d1 = L - p.d0;
    pts.push(p);
  }
  return { pts, L };
}

function spAt(sp, u) {
  const f = clamp01(u) * M, i = Math.min(M - 1, Math.floor(f)), k = f - i;
  const a = sp.pts[i], b = sp.pts[i + 1];
  const tx = a.tx + (b.tx - a.tx) * k, ty = a.ty + (b.ty - a.ty) * k, l = Math.hypot(tx, ty) || 1;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx: tx / l, ty: ty / l, nx: -ty / l, ny: tx / l };
}

function kit(ctx, sp, R, t, it) {
  const P = (u, o = 0) => {
    // beyond the ends, keep going straight along the end tangent
    const uu = clamp01(u), p = spAt(sp, uu), ex = (u - uu) * sp.L;
    return [p.x + p.tx * ex + p.nx * o * R, p.y + p.ty * ex + p.ny * o * R];
  };
  const range = (u0, u1, n = Math.max(2, Math.ceil(Math.abs(u1 - u0) * M))) => Array.from({ length: n + 1 }, (_, k) => u0 + (u1 - u0) * k / n);
  const g = {
    ctx, R, t, it, sp, P,
    fillAll(c) { ctx.fillStyle = c; ctx.fillRect(-1e5, -1e5, 2e5, 2e5); },
    // region between u0..u1 (along) and o0..o1 (across, in R). zig*: jagged ends; w*: wavy long edges
    strip(u0, u1, o0, o1, fill, o = {}) {
      ctx.beginPath();
      const A = range(u0, u1).map(u => P(u, o0 + (o.w0 ? o.w0(u) : 0)));
      const B = range(u1, u0).map(u => P(u, o1 + (o.w1 ? o.w1(u) : 0)));
      ctx.moveTo(...A[0]);
      A.forEach(p => ctx.lineTo(...p));
      const K = 10;
      for (let k = 1; k < K; k++) { const oo = o0 + (o1 - o0) * k / K; ctx.lineTo(...P(u1 + (o.zig1 ? (k % 2 ? o.zig1 : -o.zig1) : 0), oo)); }
      B.forEach(p => ctx.lineTo(...p));
      for (let k = 1; k < K; k++) { const oo = o1 + (o0 - o1) * k / K; ctx.lineTo(...P(u0 + (o.zig0 ? (k % 2 ? o.zig0 : -o.zig0) : 0), oo)); }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    },
    // straight-ish line in body coordinates (follows the bend)
    line(u0, o0, u1, o1, w, c, cap = 'round') {
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) { const p = P(u0 + (u1 - u0) * k / 8, o0 + (o1 - o0) * k / 8); k ? ctx.lineTo(...p) : ctx.moveTo(...p); }
      ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = cap; ctx.stroke();
    },
    // line running along the body at offset o
    along(o, u0, u1, w, c, wave) {
      ctx.beginPath();
      range(u0, u1).forEach((u, k) => { const p = P(u, o + (wave ? wave(u) : 0)); k ? ctx.lineTo(...p) : ctx.moveTo(...p); });
      ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    },
    dot(u, o, r, fill, stroke, lw = 1.4) {
      const [x, y] = P(u, o); circlePath(ctx, x, y, r);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
    },
    grad(u0, u1, stops) {
      const [x0, y0] = P(u0), [x1, y1] = P(u1);
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      stops.forEach(([s, c]) => gr.addColorStop(s, c));
      return gr;
    },
    // screen-space offset copy of the spine (lighting from the top-left, like the sausage)
    offsetLine(ox, oy, u0 = 0, u1 = 1) {
      ctx.beginPath();
      range(u0, u1).forEach((u, k) => { const p = P(u); k ? ctx.lineTo(p[0] + ox, p[1] + oy) : ctx.moveTo(p[0] + ox, p[1] + oy); });
    },
    // draw in an end's local frame: x points outward along the body, y along the body normal
    local(end, fn) {
      const u = end ? 1 : 0, p = spAt(sp, u), [x, y] = P(u), s = end ? 1 : -1;
      ctx.save();
      ctx.transform(p.tx * s, p.ty * s, p.nx, p.ny, x, y);
      fn(ctx, R);
      ctx.restore();
    },
    // local frame at any point along the body (x along +tangent, y along normal)
    at(u, o, fn) {
      const p = spAt(sp, u), [x, y] = P(u, o);
      ctx.save(); ctx.transform(p.tx, p.ty, p.nx, p.ny, x, y); fn(ctx, R); ctx.restore();
    },
  };
  return g;
}

function profilePath(ctx, sp, R, prof, grow) {
  const L = [], Rr = [];
  for (const p of sp.pts) {
    const h = Math.max(0, prof(p, R)) * R + grow;
    L.push([p.x + p.nx * h, p.y + p.ny * h]);
    Rr.push([p.x - p.nx * h, p.y - p.ny * h]);
  }
  ctx.beginPath();
  ctx.moveTo(...L[0]);
  for (let i = 1; i < L.length; i++) ctx.lineTo(...L[i]);
  for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(...Rr[i]);
  ctx.closePath();
}

function shade(g, gloss = 0.6) {
  const { ctx, R } = g;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  g.offsetLine(R * 0.62, R * 0.86); ctx.lineWidth = R * 1.05; ctx.strokeStyle = 'rgba(40,14,4,0.30)'; ctx.stroke();
  g.offsetLine(R * 0.95, R * 1.25); ctx.lineWidth = R * 0.9; ctx.strokeStyle = 'rgba(40,14,4,0.18)'; ctx.stroke();
  g.offsetLine(-R * 0.24, -R * 0.42, 0.04, 0.96); ctx.lineWidth = R * 0.8; ctx.strokeStyle = `rgba(255,255,255,${0.08 + 0.14 * gloss})`; ctx.stroke();
  g.offsetLine(R * 0.62, R * 0.86, 0.1, 0.9); ctx.lineWidth = R * 0.18; ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.12 * gloss})`; ctx.stroke();
  if (gloss > 0.15) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.92, 0.25 + 0.5 * gloss)})`; ctx.lineWidth = R * 0.2;
    g.offsetLine(-R * 0.34, -R * 0.56, 0.18, 0.58); ctx.stroke();
    g.offsetLine(-R * 0.34, -R * 0.56, 0.64, 0.7); ctx.stroke();
  }
}

// outlined shape helper for attachments (local coordinates)
function ink(ctx, fill, lw = 2.4) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
function leaf(ctx, x0, y0, x1, y1, w, fill) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1); ctx.quadraticCurveTo(mx - nx, my - ny, x0, y0); ctx.closePath();
  ink(ctx, fill, 2.2);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + dx * 0.2, my + dy * 0.2); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(INK, 0.45); ctx.stroke();
}

// ------------------------------------------------------------------ the 30 items
export const ITEMS = [
  {
    id: 'butter', name: 'Stick of Butter', desc: 'Slippery when wet. And always.', lid: '#ffe27a', gloss: 0.45,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 4), capFlat(p.d1, R, 4)),
    paint(g) {
      g.fillAll('#ffe27a');
      g.along(-0.56, 0.43, 0.99, 1.6, 'rgba(255,255,255,0.55)'); g.along(0.56, 0.43, 0.99, 1.6, 'rgba(176,128,20,0.35)');
      g.strip(-0.1, 0.42, -1.4, 1.4, '#fffbf0', { zig1: 0.012 });
      g.strip(0.0, 0.4, -0.32, 0.02, '#3f78d8'); g.along(0.5, 0.0, 0.4, 1.6, '#e0b13a'); g.along(-0.62, 0.0, 0.4, 1.6, '#e0b13a');
    },
  },
  {
    id: 'banana', name: 'Banana', desc: 'Peel-good physics.', lid: '#ffd84a', gloss: 0.55,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.6, 0.3), capPoint(p.d1, R * 1.25, 0.32)),
    paint(g) {
      g.fillAll('#ffd84a');
      g.along(0.5, 0.06, 0.94, 1.4, 'rgba(201,154,18,0.55)'); g.along(-0.42, 0.06, 0.94, 1.4, 'rgba(201,154,18,0.45)');
      for (const [u, o, r] of scatter(g.it, 'sp', 9, 7)) g.dot(0.12 + u * 0.7, o * 0.7, 0.8 + r * 1.4, 'rgba(110,70,20,0.7)');
      g.strip(-0.1, 0.035, -1.6, 1.6, '#6b4a1f'); g.strip(0.975, 1.1, -1.6, 1.6, '#3b2a14');
    },
    front(g) {
      g.local(0, (c, R) => { c.beginPath(); c.moveTo(-1, -R * 0.2); c.lineTo(R * 0.75, -R * 0.15); c.lineTo(R * 0.8, R * 0.18); c.lineTo(-1, R * 0.22); c.closePath(); ink(c, '#8a7a33'); });
    },
  },
  {
    id: 'carrot', name: 'Carrot', desc: 'Packed with vitamin A-erodynamics.', lid: '#ff8a2b', gloss: 0.45,
    prof: (p, R) => Math.min(0.2 + 0.8 * sstep(p.u / 0.5), capRound(p.d1, R)),
    paint(g) {
      g.fillAll('#ff8a2b');
      for (let k = 0; k < 9; k++) { const u = 0.12 + k * 0.09, s = k % 2 ? 1 : -1; g.line(u, 0.25 * s, u + 0.012, 0.85 * s, 1.8, 'rgba(182,80,12,0.75)'); }
    },
    front(g) {
      g.local(1, (c, R) => {
        leaf(c, -R * 0.2, 0, R * 1.35, -R * 0.75, R * 0.32, '#5fbf3a');
        leaf(c, -R * 0.2, 0, R * 1.35, R * 0.75, R * 0.32, '#5fbf3a');
        leaf(c, -R * 0.2, 0, R * 1.6, 0, R * 0.36, '#74d14a');
      });
    },
  },
  {
    id: 'pickle', name: 'Pickle', desc: 'Kind of a big dill.', lid: '#6fae3c', gloss: 0.75,
    prof: round2,
    paint(g) {
      g.fillAll('#6fae3c');
      g.along(0.55, 0.05, 0.95, 3, 'rgba(63,110,29,0.4)'); g.along(-0.5, 0.05, 0.95, 3, 'rgba(63,110,29,0.4)');
      for (const [u, o] of scatter(g.it, 'b', 22, 11)) g.dot(0.07 + u * 0.86, o * 0.82, g.R * 0.11, '#9ad15f', 'rgba(52,96,22,0.85)', 1.2);
    },
  },
  {
    id: 'baguette', name: 'Baguette', desc: 'Oui oui. Flip flip.', lid: '#e3a64a', gloss: 0.2,
    prof: (p, R) => Math.min(capPoint(p.d0, R * 1.3, 0.38), capPoint(p.d1, R * 1.3, 0.38)),
    paint(g) {
      g.fillAll('#e3a64a');
      for (const u of [0.2, 0.36, 0.52, 0.86]) { g.line(u - 0.045, -0.55, u + 0.045, 0.55, g.R * 0.42, '#9a5f1c'); g.line(u - 0.042, -0.48, u + 0.042, 0.48, g.R * 0.22, '#f7e2b0'); }
      for (const [u, o, r] of scatter(g.it, 'f', 26, 5)) g.dot(0.06 + u * 0.88, o * 0.85, 0.6 + r, 'rgba(255,255,255,0.55)');
    },
  },
  {
    id: 'corn', name: 'Corn on the Cob', desc: 'All ears for a good landing.', lid: '#f2b81f', gloss: 0.45,
    prof: round2,
    paint(g) {
      g.fillAll('#d99a14');
      let row = 0;
      for (let u = 0.12; u < 0.97; u += 0.058, row++) for (const o of [-0.72, -0.24, 0.24, 0.72]) {
        const oo = o + (row % 2 ? 0.12 : -0.12);
        g.at(u, oo, (c, R) => { ellipsePath(c, 0, 0, R * 0.2, R * 0.21); c.fillStyle = '#ffd84a'; c.fill(); circlePath(c, -R * 0.06, -R * 0.07, R * 0.06); c.fillStyle = '#fff3a8'; c.fill(); });
      }
    },
    front(g) {
      g.local(0, (c, R) => {
        leaf(c, R * 0.55, -R * 0.05, -R * 1.7, -R * 0.78, R * 0.42, '#7cbf45');
        leaf(c, R * 0.55, R * 0.05, -R * 1.7, R * 0.78, R * 0.42, '#6aa83a');
        leaf(c, R * 0.7, 0, -R * 0.6, 0, R * 0.4, '#8fd056');
      });
    },
  },
  {
    id: 'pencil', name: 'Pencil', desc: 'Sharp moves only.', lid: '#ffcc33', gloss: 0.45,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2.5), p.d1 < R * 1.9 ? 0.07 + 0.93 * (p.d1 / (R * 1.9)) : 1),
    paint(g) {
      g.fillAll('#ffcc33');
      g.along(0.36, 0.13, 0.86, 1.3, 'rgba(201,146,18,0.6)'); g.along(-0.36, 0.13, 0.86, 1.3, 'rgba(201,146,18,0.6)');
      g.strip(-0.1, 0.07, -1.5, 1.5, '#ff8fa3');
      g.strip(0.07, 0.135, -1.5, 1.5, '#c9ccd3');
      for (const u of [0.085, 0.102, 0.119]) g.line(u, -1.2, u, 1.2, 1.2, '#8d929c');
      g.strip(0.85, 1.1, -1.5, 1.5, '#f3cf98', { zig0: 0.012 });
      g.strip(0.955, 1.1, -1.5, 1.5, '#47474d');
    },
  },
  {
    id: 'crayon', name: 'Crayon', desc: 'Stays inside the lines. Mostly.', lid: '#3f7fff', gloss: 0.4,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 3), p.d1 < R * 1.5 ? 0.3 + 0.7 * (p.d1 / (R * 1.5)) : 1),
    paint(g) {
      g.fillAll('#3f7fff');
      g.strip(0.1, 0.6, -1.5, 1.5, '#f4f1e6', { zig0: 0.008, zig1: 0.008 });
      g.strip(0.135, 0.165, -1.5, 1.5, '#2350b8'); g.strip(0.535, 0.565, -1.5, 1.5, '#2350b8');
      g.along(0, 0.22, 0.48, 1.6, '#2350b8', (u) => Math.sin(u * 90) * 0.18);
      g.line(0.93, -0.6, 0.97, 0.6, 1.4, 'rgba(255,255,255,0.35)');
    },
  },
  {
    id: 'candle', name: 'Candle', desc: 'Lights up any level.', lid: '#f6e6c8', gloss: 0.35,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 3), capFlat(p.d1, R, 3)),
    paint(g) {
      g.fillAll('#f6e6c8');
      g.strip(0.86, 1.1, -1.5, 1.5, '#fffaf0', { zig0: 0.035 });
      g.strip(0.28, 0.33, -1.5, 1.5, '#e8423a'); g.strip(0.37, 0.39, -1.5, 1.5, '#e8423a');
    },
    front(g) {
      const f = 1 + Math.sin(g.t * 19) * 0.08 + Math.sin(g.t * 7.3) * 0.05;
      g.local(1, (c, R) => {
        c.beginPath(); c.moveTo(-1, 0); c.lineTo(R * 0.5, 0); c.lineWidth = 2.6; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
        const glow = c.createRadialGradient(R * 1.1, 0, 0, R * 1.1, 0, R * 1.6);
        glow.addColorStop(0, 'rgba(255,214,90,0.45)'); glow.addColorStop(1, 'rgba(255,214,90,0)');
        c.fillStyle = glow; c.beginPath(); c.arc(R * 1.1, 0, R * 1.6, 0, TAU); c.fill();
        c.save(); c.translate(R * 0.45, 0); c.scale(f * 1.3, 1.2);
        c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(R * 0.15, -R * 0.55, R * 0.9, -R * 0.35, R * 1.35, 0); c.bezierCurveTo(R * 0.9, R * 0.35, R * 0.15, R * 0.55, 0, 0);
        ink(c, '#ffb02e', 2.2);
        c.beginPath(); c.moveTo(R * 0.1, 0); c.bezierCurveTo(R * 0.2, -R * 0.25, R * 0.6, -R * 0.18, R * 0.85, 0); c.bezierCurveTo(R * 0.6, R * 0.18, R * 0.2, R * 0.25, R * 0.1, 0);
        c.fillStyle = '#fff3a0'; c.fill();
        c.restore();
      });
    },
  },
  {
    id: 'churro', name: 'Churro', desc: 'Sugar-coated chaos.', lid: '#c9803a', gloss: 0.3,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 5), capFlat(p.d1, R, 5)),
    paint(g) {
      g.fillAll('#c9803a');
      for (const o of [-0.68, -0.34, 0, 0.34, 0.68]) { g.along(o, 0, 1, 2.2, '#8a4f1c'); g.along(o + 0.1, 0, 1, 1.4, '#e7a95f'); }
      for (const [u, o, r] of scatter(g.it, 's', 46, 3)) g.dot(0.03 + u * 0.94, o * 0.9, 0.7 + r * 0.8, 'rgba(255,255,255,0.85)');
    },
  },
  {
    id: 'eclair', name: 'Éclair', desc: 'Fancy. Flippable. French.', lid: '#e8b56a', gloss: 0.6,
    prof: round2,
    paint(g) {
      g.fillAll('#e8b56a');
      g.strip(0.05, 0.95, 0.12, -1.5, '#5a2e1a', { w0: (u) => Math.sin(u * 46) * 0.1 });
      g.along(-0.55, 0.12, 0.88, 1.8, 'rgba(255,255,255,0.9)', (u) => Math.sin(u * 70) * 0.25);
    },
  },
  {
    id: 'icepop', name: 'Ice Pop', desc: 'Cool under pressure.', lid: '#ff3b4e', gloss: 0.8,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 6), capFlat(p.d1, R, 6)),
    back(g) {
      g.local(0, (c, R) => { c.beginPath(); c.roundRect(-R * 0.6, -R * 0.3, R * 1.9, R * 0.6, R * 0.3); ink(c, '#e9cf98'); });
    },
    paint(g) {
      g.fillAll('#3f7fff');
      g.strip(0.34, 0.66, -1.5, 1.5, '#f6f6ff', { zig0: 0.01 });
      g.strip(0.66, 1.1, -1.5, 1.5, '#ff3b4e', { zig0: 0.01 });
      for (const [u, o] of scatter(g.it, 'fr', 10, 13)) g.dot(0.05 + u * 0.9, o * 0.75, 1.1, 'rgba(255,255,255,0.8)');
    },
  },
  {
    id: 'candycane', name: 'Candy Cane', desc: 'Peppermint-powered.', lid: '#fff7f7', gloss: 0.95,
    prof: round2,
    paint(g) {
      g.fillAll('#fff7f7');
      for (let u = -0.1; u < 1.12; u += 0.075) {
        g.line(u - 0.035, -1.3, u + 0.035, 1.3, g.R * 0.34, '#e8253a', 'butt');
        g.line(u - 0.035 + 0.026, -1.3, u + 0.035 + 0.026, 1.3, g.R * 0.08, '#2fa84f', 'butt');
      }
    },
  },
  {
    id: 'glowstick', name: 'Glow Stick', desc: 'Party in the pan.', lid: '#5dff3a', gloss: 0.9,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 5), capFlat(p.d1, R, 5)),
    back(g) {
      const { ctx, R } = g, pulse = 0.75 + 0.25 * Math.sin(g.t * 4);
      ctx.lineCap = 'round';
      for (const [w, a] of [[R * 4.2, 0.07], [R * 3.2, 0.1], [R * 2.6, 0.14]]) { g.along(0, 0.02, 0.98, w, `rgba(93,255,58,${a * pulse})`); }
    },
    paint(g) {
      g.fillAll('#5dff3a');
      g.along(0, 0.06, 0.94, g.R * 0.85, '#e8ffd8');
      g.strip(-0.1, 0.06, -1.5, 1.5, '#2c8a1c'); g.strip(0.94, 1.1, -1.5, 1.5, '#2c8a1c');
    },
  },
  {
    id: 'toothpaste', name: 'Toothpaste', desc: 'Minty fresh landings.', lid: '#f5f7fb', gloss: 0.6,
    prof: (p, R) => {
      if (p.d1 < R * 1.1) return Math.min(0.58, capFlat(p.d1, R * 0.58, 2.5) * 0.58);
      if (p.d1 < R * 1.6) return 0.58 + 0.42 * sstep((p.d1 - R * 1.1) / (R * 0.5));
      return p.d0 < R * 0.75 ? Math.min(1.1, capFlat(p.d0, R * 1.1, 2) * 1.1) : 1;
    },
    paint(g) {
      g.fillAll('#f5f7fb');
      g.strip(0.26, 0.33, -1.5, 1.5, '#2f7de1'); g.strip(0.345, 0.37, -1.5, 1.5, '#e8253a');
      for (let u = 0.01; u < 0.075; u += 0.013) g.line(u, -1.3, u, 1.3, 1.1, 'rgba(120,130,150,0.8)');
      g.strip(0.9, 1.1, -1.5, 1.5, '#2f7de1');
      for (let u = 0.915; u < 1; u += 0.017) g.line(u, -0.8, u, 0.8, 1.1, '#1f5fb0');
    },
  },
  {
    id: 'eggplant', name: 'Eggplant', desc: 'Purple, proud and bouncy.', lid: '#6b3fa0', gloss: 1.1,
    prof: (p, R) => Math.min(capRound(p.d0, R * 1.1) * (1.1 - 0.28 * p.u), capRound(p.d1, R * 0.8) * (1.1 - 0.28 * p.u)),
    paint(g) { g.fillAll('#6b3fa0'); g.along(-0.45, 0.1, 0.8, g.R * 0.25, 'rgba(154,111,208,0.55)'); },
    front(g) {
      g.local(1, (c, R) => {
        c.beginPath(); c.roundRect(R * 0.15, -R * 0.18, R * 0.75, R * 0.36, R * 0.12); ink(c, '#4f8a2a');
        for (const [a, l] of [[-1, 1], [1, 1], [-0.45, 1.25], [0.45, 1.25]]) {
          c.beginPath(); c.moveTo(R * 0.25, a * R * 0.25); c.quadraticCurveTo(-R * 0.2, a * R * 0.9, -R * l, a * R * 0.55); c.quadraticCurveTo(-R * 0.3, a * R * 0.35, R * 0.25, a * R * 0.05); c.closePath();
          ink(c, '#5fa832', 2);
        }
        ellipsePath(c, R * 0.12, 0, R * 0.3, R * 0.62); ink(c, '#6dbb3c', 2);
      });
    },
  },
  {
    id: 'rollingpin', name: 'Rolling Pin', desc: 'Rolls with the punches.', lid: '#e6b27a', gloss: 0.35,
    prof: (p, R) => {
      const d = Math.min(p.d0, p.d1);
      if (d < R * 0.5) return 0.44 * capRound(d, R * 0.5);
      if (d < R * 1.25) return 0.36;
      return 0.36 + 0.64 * sstep((d - R * 1.25) / (R * 0.3));
    },
    paint(g) {
      g.fillAll('#e6b27a');
      [-0.62, -0.22, 0.24, 0.58].forEach((o, k) => g.along(o, 0.1, 0.9, 1.3, 'rgba(160,104,48,0.5)', (u) => Math.sin(u * 13 + k * 2) * 0.06));
      g.strip(-0.1, 0.1, -1.5, 1.5, '#c98f55'); g.strip(0.9, 1.1, -1.5, 1.5, '#c98f55');
    },
  },
  {
    id: 'chocobar', name: 'Chocolate Bar', desc: 'Snap, crackle, flip.', lid: '#5a2e1a', gloss: 0.45,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 3), capFlat(p.d1, R, 3)),
    paint(g) {
      g.fillAll('#5a2e1a');
      for (let u = 0.43; u < 1; u += 0.093) { g.line(u, -1.3, u, 1.3, 2.4, '#341a0c', 'butt'); g.line(u + 0.012, -1.3, u + 0.012, 1.3, 1.4, '#7a4428', 'butt'); }
      g.along(0.02, 0.4, 1, 2.4, '#341a0c'); g.along(0.12, 0.4, 1, 1.3, '#7a4428');
      g.strip(-0.1, 0.42, -1.5, 1.5, '#d9dde3', { zig1: 0.014 });
      g.strip(-0.1, 0.37, -1.5, 1.5, '#c8102e');
      g.strip(0.05, 0.11, -1.5, 1.5, '#f2c14e'); g.strip(0.26, 0.3, -1.5, 1.5, '#f2c14e');
    },
  },
  {
    id: 'sushi', name: 'Sushi Roll', desc: 'Rolled for maximum roll.', lid: '#1f3a2c', gloss: 0.35,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2.5), capFlat(p.d1, R, 2.5)),
    paint(g) {
      g.fillAll('#1f3a2c');
      for (let u = 0.03; u < 1; u += 0.05) g.line(u, -1.2, u + 0.02, 1.2, 1, 'rgba(255,255,255,0.06)');
      g.along(0.6, 0.05, 0.95, 1.2, 'rgba(120,200,140,0.18)');
    },
    front(g) {
      for (const end of [0, 1]) g.local(end, (c, R) => {
        ellipsePath(c, -R * 0.02, 0, R * 0.32, R * 1.02); ink(c, '#1f3a2c', 2.2);
        ellipsePath(c, -R * 0.02, 0, R * 0.25, R * 0.84); c.fillStyle = '#fbfbf4'; c.fill();
        ellipsePath(c, -R * 0.02, -R * 0.2, R * 0.1, R * 0.26); c.fillStyle = '#ff8a5c'; c.fill();
        ellipsePath(c, -R * 0.02, R * 0.25, R * 0.08, R * 0.2); c.fillStyle = '#7ccf5a'; c.fill();
        ellipsePath(c, -R * 0.02, R * 0.02, R * 0.06, R * 0.12); c.fillStyle = '#ffe07a'; c.fill();
      });
    },
  },
  {
    id: 'burrito', name: 'Burrito', desc: 'Wrapped and ready to roll.', lid: '#f0d29a', gloss: 0.25,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 8), capRound(p.d1, R)),
    paint(g) {
      g.fillAll('#f0d29a');
      for (const [u, o, r] of scatter(g.it, 't', 12, 21)) g.dot(0.4 + u * 0.55, o * 0.75, 1.2 + r * 2.2, 'rgba(176,112,40,0.5)');
      g.strip(-0.1, 0.36, -1.5, 1.5, '#d9dde3', { zig1: 0.012 });
      for (const [u, o, r] of scatter(g.it, 'cr', 14, 31)) g.line(u * 0.34, o * 0.9, u * 0.34 + 0.02, o * 0.9 + (r - 0.5) * 0.4, 1.2, r > 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(120,128,140,0.6)');
      g.line(0.45, -1.2, 0.6, 1.2, 1.4, 'rgba(176,120,50,0.45)');
    },
    front(g) {
      g.local(1, (c, R) => {
        for (const [y, r, col] of [[-R * 0.45, R * 0.22, '#7ccf5a'], [R * 0.05, R * 0.24, '#8a4a2b'], [R * 0.48, R * 0.2, '#e8402a'], [-R * 0.05, R * 0.17, '#fffbe8']]) {
          circlePath(c, -R * 0.12, y, r); ink(c, col, 1.6);
        }
      });
    },
  },
  {
    id: 'chili', name: 'Hot Chili', desc: 'Handle with oven mitts.', lid: '#e8251a', gloss: 1.05,
    prof: (p, R) => Math.min(0.06 + 0.94 * sstep(p.d0 / (R * 2.4)), capRound(p.d1, R)),
    paint(g) { g.fillAll('#e8251a'); g.along(-0.42, 0.15, 0.85, g.R * 0.22, 'rgba(255,140,120,0.5)'); },
    front(g) {
      g.local(1, (c, R) => {
        c.beginPath(); c.moveTo(R * 0.15, 0); c.quadraticCurveTo(R * 0.9, -R * 0.1, R * 1.25, -R * 0.75);
        c.lineWidth = R * 0.42; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
        c.lineWidth = R * 0.26; c.strokeStyle = '#4f9a2a'; c.stroke();
        c.beginPath(); c.moveTo(-R * 0.45, -R * 0.96); c.quadraticCurveTo(R * 0.45, -R * 0.9, R * 0.35, 0); c.quadraticCurveTo(R * 0.45, R * 0.9, -R * 0.45, R * 0.96);
        c.quadraticCurveTo(-R * 0.15, 0, -R * 0.45, -R * 0.96); c.closePath();
        ink(c, '#3f9a2a', 2.2);
      });
    },
  },
  {
    id: 'fish', name: 'Sardine', desc: 'Fresh out of the ocean world.', lid: '#9cc4e4', gloss: 0.85,
    prof: (p, R) => Math.min(0.42 + 0.58 * sstep(p.d0 / (R * 1.5)), capRound(p.d1, R * 1.1)),
    back(g) {
      g.local(0, (c, R) => {
        c.beginPath(); c.moveTo(-R * 0.25, 0); c.lineTo(R * 1.35, -R * 1.0); c.quadraticCurveTo(R * 0.85, 0, R * 1.35, R * 1.0); c.closePath();
        ink(c, '#5f8fb8');
      });
      g.at(0.46, -0.75, (c, R) => { c.beginPath(); c.moveTo(-R * 0.75, 0); c.quadraticCurveTo(-R * 0.1, -R * 1.05, R * 0.55, -R * 0.25); c.lineTo(R * 0.45, 0); c.closePath(); ink(c, '#5f8fb8'); });
    },
    paint(g) {
      g.fillAll('#c9e1f2');
      g.strip(-0.1, 1.1, -0.05, -1.5, '#7fa9cf', { w0: (u) => Math.sin(u * 20) * 0.06 });
      for (let u = 0.12; u < 0.78; u += 0.07) for (const o of [-0.45, 0.05, 0.55]) g.at(u + (o > 0 ? 0.035 : 0), o, (c, R) => { c.beginPath(); c.arc(0, 0, R * 0.2, -1.1, 1.1); c.lineWidth = 1.1; c.strokeStyle = 'rgba(40,70,100,0.4)'; c.stroke(); });
      g.at(0.83, 0, (c, R) => { c.beginPath(); c.arc(-R * 0.6, 0, R * 0.95, -0.9, 0.9); c.lineWidth = 2; c.strokeStyle = 'rgba(40,70,100,0.55)'; c.stroke(); });
    },
  },
  {
    id: 'caterpillar', name: 'Caterpillar', desc: 'Very hungry. Very bouncy.', lid: '#7ccf3a', gloss: 0.6,
    prof: (p, R) => round2(p, R) * (0.88 + 0.12 * Math.abs(Math.cos(Math.PI * 7 * p.u))),
    back(g) {
      for (let k = 0; k < 7; k++) g.at((k + 0.5) / 7, 0.8, (c, R) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(-R * 0.08, R * 0.55); c.lineWidth = 4.6; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = '#3f7a1c'; c.stroke(); });
    },
    paint(g) {
      for (let k = 0; k < 7; k++) g.strip(k / 7 - (k ? 0 : 0.1), (k + 1) / 7 + (k === 6 ? 0.1 : 0), -1.5, 1.5, k % 2 ? '#6cc232' : '#86d84a');
      for (let k = 1; k < 7; k++) g.line(k / 7, -1.2, k / 7, 1.2, 1.6, 'rgba(46,90,18,0.55)');
      for (let k = 0; k < 6; k++) g.dot((k + 0.5) / 7, -0.48, g.R * 0.13, '#ffe14d', 'rgba(46,90,18,0.6)', 1);
    },
    front(g) {
      g.local(1, (c, R) => {
        for (const s of [-1, 1]) {
          c.beginPath(); c.moveTo(-R * 0.4, s * R * 0.3); c.quadraticCurveTo(R * 0.4, s * R * 0.4, R * 0.8, s * R * 0.95);
          c.lineWidth = 2.4; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
          circlePath(c, R * 0.8, s * R * 0.95, R * 0.16); ink(c, '#ffe14d', 1.8);
        }
      });
    },
  },
  {
    id: 'battery', name: 'Battery', desc: 'Fully charged. Fully flipped.', lid: '#e08a2a', gloss: 0.7,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2.5), capFlat(p.d1, R, 2.5)),
    paint(g) {
      g.fillAll('#2b2b2b');
      g.strip(0.62, 1.1, -1.5, 1.5, '#e08a2a');
      g.strip(-0.1, 0.03, -1.5, 1.5, '#c9ccd3'); g.strip(0.97, 1.1, -1.5, 1.5, '#c9ccd3');
      g.line(0.24, 0, 0.36, 0, 2.6, '#ffffff'); g.line(0.3, -0.42, 0.3, 0.42, 2.6, '#ffffff');
      g.line(0.45, -0.3, 0.53, -0.3, 2.2, '#9a9a9a');
    },
    front(g) { g.local(1, (c, R) => { c.beginPath(); c.roundRect(-2, -R * 0.36, R * 0.42, R * 0.72, 2); ink(c, '#c9ccd3'); }); },
  },
  {
    id: 'rocket', name: 'Rocket', desc: 'Built for the space world.', lid: '#f2f4f8', gloss: 0.7,
    prof: (p, R) => Math.min(capFlat(p.d0, R, 2), p.d1 < R * 2 ? Math.sqrt(p.d1 / (R * 2)) : 1),
    back(g) {
      const f = 1 + Math.sin(g.t * 23) * 0.12;
      g.local(0, (c, R) => {
        c.save(); c.scale(f, 1);
        c.beginPath(); c.moveTo(-2, -R * 0.55); c.quadraticCurveTo(R * 0.9, -R * 0.35, R * 1.55, 0); c.quadraticCurveTo(R * 0.9, R * 0.35, -2, R * 0.55); c.closePath(); ink(c, '#ff9a2e', 2);
        c.beginPath(); c.moveTo(-2, -R * 0.3); c.quadraticCurveTo(R * 0.5, -R * 0.2, R * 0.95, 0); c.quadraticCurveTo(R * 0.5, R * 0.2, -2, R * 0.3); c.closePath(); c.fillStyle = '#fff1a0'; c.fill();
        c.restore();
      });
      for (const s of [-1, 1]) g.at(0.12, s * 0.7, (c, R) => {
        c.beginPath(); c.moveTo(R * 0.9, 0); c.lineTo(-R * 0.75, s * R * 1.05); c.lineTo(-R * 1.05, s * R * 0.85); c.lineTo(-R * 0.9, 0); c.closePath(); ink(c, '#e8253a');
      });
    },
    paint(g) {
      g.fillAll('#f2f4f8');
      g.strip(0.85, 1.1, -1.5, 1.5, '#e8253a', { w0: () => 0 });
      g.strip(0.2, 0.26, -1.5, 1.5, '#2f7de1');
      for (const o of [-0.6, 0, 0.6]) g.dot(0.23, o, 1.3, '#c9d6ea');
    },
  },
  {
    id: 'gummyworm', name: 'Gummy Worm', desc: 'Sour on the outside, sweet on the landing.', lid: '#ff3b6b', gloss: 1.0,
    prof: (p, R) => round2(p, R) * (0.94 + 0.06 * Math.cos(Math.PI * 16 * p.u)),
    paint(g) {
      g.ctx.fillStyle = g.grad(0.1, 0.9, [[0, '#ff3b6b'], [0.48, '#ff3b6b'], [0.52, '#ffd93b'], [1, '#9be15d']]); g.ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
      for (let u = 0.03; u < 1; u += 0.0625) g.line(u, -1.2, u, 1.2, 1.4, 'rgba(255,255,255,0.28)');
      for (const [u, o] of scatter(g.it, 'su', 30, 41)) g.dot(0.04 + u * 0.92, o * 0.85, 1, 'rgba(255,255,255,0.8)');
    },
  },
  {
    id: 'bone', name: 'Dog Bone', desc: 'The good boy special.', lid: '#f4e9d5', gloss: 0.4,
    prof: (p, R) => { const d = Math.min(p.d0, p.d1); return d < R * 0.7 ? 0.95 * capRound(d, R * 0.7) : 0.7 + 0.25 * (1 - sstep((d - R * 0.7) / (R * 0.8))); },
    back(g) {
      for (const end of [0, 1]) g.local(end, (c, R) => { for (const s of [-1, 1]) { circlePath(c, -R * 0.42, s * R * 0.62, R * 0.58); ink(c, '#efe2c8'); } });
    },
    paint(g) { g.fillAll('#f4e9d5'); g.along(0.38, 0.15, 0.85, 1.2, 'rgba(180,150,110,0.35)'); g.along(-0.4, 0.2, 0.8, 1.6, 'rgba(255,255,255,0.6)'); },
    front(g) {
      for (const end of [0, 1]) g.local(end, (c, R) => { for (const s of [-1, 1]) { c.beginPath(); c.arc(-R * 0.42, s * R * 0.62, R * 0.58, s > 0 ? -1.2 : 0.2, s > 0 ? -0.2 : 1.2); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke(); } });
    },
  },
  {
    id: 'kebab', name: 'Kebab', desc: 'Skewered for speed.', lid: '#8a4a2b', gloss: 0.5,
    prof: (p, R) => round2(p, R) * (0.76 + 0.24 * Math.pow(Math.abs(Math.sin(Math.PI * 6 * Math.max(0, Math.min(1, (p.u - 0.04) / 0.92)))), 0.35)),
    back(g) {
      g.local(0, (c, R) => { c.beginPath(); c.rect(-R, -R * 0.13, R * 1.85, R * 0.26); ink(c, '#e9cf98', 2); });
      g.local(1, (c, R) => { c.beginPath(); c.moveTo(-R, -R * 0.13); c.lineTo(R * 0.9, -R * 0.13); c.lineTo(R * 1.35, 0); c.lineTo(R * 0.9, R * 0.13); c.lineTo(-R, R * 0.13); c.closePath(); ink(c, '#e9cf98', 2); });
    },
    paint(g) {
      const cols = ['#8a4a2b', '#4caf3a', '#8a4a2b', '#f1e0f5', '#8a4a2b', '#e8402a'];
      cols.forEach((c, k) => g.strip(0.04 + k * 0.92 / 6 - (k ? 0 : 0.2), 0.04 + (k + 1) * 0.92 / 6 + (k === 5 ? 0.2 : 0), -1.5, 1.5, c));
      [0, 2, 4].forEach(k => { const u = 0.04 + (k + 0.5) * 0.92 / 6; g.line(u - 0.03, -0.6, u + 0.01, 0.6, 2.2, '#4a2414'); g.line(u + 0.02, -0.6, u + 0.06, 0.6, 2.2, '#4a2414'); });
      g.along(0.55, 0.04 + 3 * 0.92 / 6, 0.04 + 4 * 0.92 / 6, 1.6, '#a05bb5');
    },
  },
  {
    id: 'croissant', name: 'Croissant', desc: 'Buttery, flaky, airborne.', lid: '#e8a54a', gloss: 0.6,
    prof: (p, R) => Math.min(capRound(p.d0, R * 0.5), capRound(p.d1, R * 0.5)) * (0.4 + 0.68 * Math.sin(Math.PI * p.u)),
    paint(g) {
      g.fillAll('#e8a54a');
      for (const u of [0.16, 0.3, 0.44, 0.58, 0.72, 0.86]) { g.line(u - 0.05, -1.2, u + 0.05, 1.2, g.R * 0.24, '#a5641f'); g.line(u - 0.035, -1.2, u + 0.065, 1.2, g.R * 0.1, '#f7cf8a'); }
    },
  },
  {
    id: 'match', name: 'Matchstick', desc: 'Strike a pose.', lid: '#d8302a', gloss: 0.5,
    prof: (p, R) => (p.u < 0.56 ? 0.58 * capFlat(p.d0, R * 0.58, 2) : p.u < 0.66 ? 0.58 + 0.47 * sstep((p.u - 0.56) / 0.1) : 1.05 * capRound(p.d1, R * 1.05)),
    paint(g) {
      g.fillAll('#f0c47e');
      g.along(0.2, 0, 0.6, 1, 'rgba(176,120,50,0.5)'); g.along(-0.25, 0, 0.6, 1, 'rgba(176,120,50,0.4)');
      g.strip(0.57, 1.1, -1.5, 1.5, '#d8302a', { zig0: 0.008 });
      for (const [u, o] of scatter(g.it, 'm', 12, 51)) g.dot(0.62 + u * 0.35, o * 0.8, 1, 'rgba(120,10,10,0.5)');
    },
  },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

// Main draw — same signature as drawSausage. opts: {R, item, face, t, squash}
export function drawItem(ctx, px, py, opts) {
  const it = opts.item;
  const k = opts.squash || 0;
  let R = opts.R, X = px, Y = py;
  if (k > 0) { [X, Y] = squashPoints(px, py, k * 0.16); R = R * (1 + k * 0.12); }
  const cl = centreline(X, Y);
  const sp = makeSpine(cl, R);
  const g = kit(ctx, sp, R, opts.t || 0, it);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (it.back) { ctx.save(); it.back(g); ctx.restore(); }
  profilePath(ctx, sp, R, it.prof, 2.2);
  ctx.fillStyle = INK; ctx.fill();
  ctx.save();
  profilePath(ctx, sp, R, it.prof, 0);
  ctx.clip();
  it.paint(g);
  shade(g, it.gloss);
  ctx.restore();
  if (it.front) { ctx.save(); it.front(g); ctx.restore(); }
  ctx.restore();
  if (opts.face) drawFace(ctx, cl, R, opts.face, { base: it.lid }, opts.t || 0);
}

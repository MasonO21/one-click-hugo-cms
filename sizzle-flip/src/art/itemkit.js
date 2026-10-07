// Drawing engine for the shop characters (definitions in items.js / items-more.js).
// Purely cosmetic — every item is drawn over the SAME soft-body particle chain as the sausage (same hitbox,
// mass and bounce), so levels play identically. An item is a width profile along the body's centreline
// (u = 0 tail … 1 head, where the face sits), painted details inside it, attachments behind/in front, and the face.
import { INK, rgba, darken, lighten, circlePath, ellipsePath } from './common.js';
import { centreline, sampleAt, squashPoints, drawFace } from './sausage.js';

export const TAU = Math.PI * 2;
const M = 96; // samples along the body
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const sstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// cap profiles: d = distance from that end (px), result = fraction of R
export const capRound = (d, r) => (d >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - d) / r) ** 2)));
export const capFlat = (d, R, k) => (d >= k ? 1 : (1 - k / R) + (k / R) * Math.sqrt(Math.max(0, 1 - ((k - d) / k) ** 2)));
export const capPoint = (d, len, tip = 0.14) => (d >= len ? 1 : tip + (1 - tip) * Math.pow(d / len, 0.8));
export const round2 = (p, R) => Math.min(capRound(p.d0, R), capRound(p.d1, R));

// deterministic scatter (cached per item) so speckles don't shimmer
export function scatter(it, key, n, seed) {
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
    // ---- shared building blocks
    // diagonal stripes across the body (twists, candy, wraps)
    stripes(period, slant, w, c, phase = 0, u0 = -0.15, u1 = 1.15, cap = 'butt') {
      for (let u = u0 + phase; u < u1; u += period) this.line(u - slant / 2, -1.35, u + slant / 2, 1.35, w, c, cap);
    },
    rings(us, w, c) { for (const u of us) this.line(u, -1.35, u, 1.35, w, c, 'butt'); },
    specks(key, n, seed, c, rmin, rmax, u0 = 0.04, u1 = 0.96, omax = 0.85) {
      for (const [u, o, r] of scatter(it, key, n, seed)) this.dot(u0 + u * (u1 - u0), o * omax, rmin + r * (rmax - rmin), typeof c === 'function' ? c(r) : c);
    },
    // cross-section seen at an end: concentric rings (outer → inner), optional spiral
    endSection(end, rings, spiral) {
      this.local(end, (c, R) => {
        rings.forEach(([k, col], i) => { ellipsePath(c, -R * 0.02, 0, R * 0.32 * k, R * 1.0 * k); if (i === 0) ink(c, col, 2.2); else { c.fillStyle = col; c.fill(); } });
        if (spiral) {
          c.beginPath();
          for (let a = 0; a < 15; a += 0.25) { const r = a / 15 * 0.85; const x = -R * 0.02 + Math.cos(a) * R * 0.3 * r, y = Math.sin(a) * R * 0.95 * r; a ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.lineWidth = 1.6; c.strokeStyle = spiral; c.stroke();
        }
      });
    },
    // tassels / frayed fibres / bristles fanning out of an end
    fringe(end, colors, n = 7, len = 0.9, spread = 0.8, lw = 2.6) {
      this.local(end, (c, R) => {
        for (let k = 0; k < n; k++) {
          const f = n > 1 ? k / (n - 1) * 2 - 1 : 0, y0 = f * R * 0.7, y1 = f * R * (0.7 + spread), x1 = R * len * (1 - 0.15 * Math.abs(f));
          c.beginPath(); c.moveTo(-R * 0.1, y0); c.quadraticCurveTo(x1 * 0.5, (y0 + y1) / 2 + Math.sin(t * 6 + k) * 1.5, x1, y1);
          c.lineCap = 'round'; c.lineWidth = lw + 2; c.strokeStyle = INK; c.stroke();
          c.lineWidth = lw; c.strokeStyle = colors[k % colors.length]; c.stroke();
        }
      });
    },
    wheel(u, o, r, rim = '#2b2b2b', hub = '#c9ccd3') {
      this.at(u, o, (c, R) => { circlePath(c, 0, 0, R * r); ink(c, rim); circlePath(c, 0, 0, R * r * 0.45); c.fillStyle = hub; c.fill(); });
    },
    glow(col, a = 0.12, widths = [4.2, 3.2, 2.6], pulse = true) {
      const k = pulse ? 0.75 + 0.25 * Math.sin(t * 4) : 1;
      for (const w of widths) this.along(0, 0.02, 0.98, R * w, rgba(col, a * k));
    },
    sparkle(u, o, size, col = '#fff6a0', phase = 0) {
      const s = size * (0.6 + 0.4 * Math.abs(Math.sin(t * 3 + phase)));
      this.at(u, o, (c) => {
        c.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? s * 0.35 : s; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 1.2; c.strokeStyle = INK; c.stroke();
      });
    },
    // little legs under the body (+o side)
    legs(us, len = 0.5, col = '#3a2216', w = 3.2) {
      for (const u of us) this.at(u, 0.8, (c, R) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(-R * 0.05, R * len); c.lineCap = 'round'; c.lineWidth = w + 2.4; c.strokeStyle = INK; c.stroke(); c.lineWidth = w; c.strokeStyle = col; c.stroke(); });
    },
    // a fin/spike/wing polygon in body coordinates (points as [du, o] pairs relative to (u, 0))
    shape(u, pts, fill, lw = 2.4) {
      ctx.beginPath(); pts.forEach(([du, o], k) => { const p = P(u + du, o); k ? ctx.lineTo(...p) : ctx.moveTo(...p); }); ctx.closePath(); ink(ctx, fill, lw);
    },
  };
  return g;
}

// bumpy outline helper: deterministic wobble in [-1, 1] along the body
export const wobble = (u, f = 11, seed = 0) => 0.6 * Math.sin(u * f * 6.283 + seed) + 0.4 * Math.sin(u * f * 2.7 * 6.283 + seed * 1.7);

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
export function ink(ctx, fill, lw = 2.4) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
export function leaf(ctx, x0, y0, x1, y1, w, fill) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1); ctx.quadraticCurveTo(mx - nx, my - ny, x0, y0); ctx.closePath();
  ink(ctx, fill, 2.2);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + dx * 0.2, my + dy * 0.2); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(INK, 0.45); ctx.stroke();
}

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

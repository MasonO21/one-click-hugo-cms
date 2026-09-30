// Tiny Tides trailer — drawing kit: easing, seeded randomness, kinetic sticker type, bubbles, rays, sparkles and
// analytic (stateless) particles. Everything here is a pure function of time so any frame can be rendered on its own.
import { paintForm, OUT } from '../../src/art_creatures.js';

export const TAU = Math.PI * 2;
export const PLUM = OUT, PLUM_DK = '#22103c';
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0..1 progress of v through [a, b]. */
export const prog = (a, b, v) => clamp((v - a) / (b - a));
export const E = {
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inCubic: (k) => k * k * k,
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outQuint: (k) => 1 - Math.pow(1 - k, 5),
  inQuad: (k) => k * k,
  outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
  inBack: (k, s = 1.70158) => (s + 1) * k * k * k - s * k * k,
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inExpo: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
  smooth: (k) => k * k * (3 - 2 * k),
};
/** Damped spring 0 -> 1 (overshoots ~25%, settles in ~0.45 s). */
export const spring = (u, k = 7.5, w = 19) => (u <= 0 ? 0 : 1 - Math.exp(-k * u) * Math.cos(w * u));
/** Squash-and-stretch amount that accompanies a spring. */
export const wobble = (u, amt = 0.28, k = 6.5, w = 19) => (u <= 0 ? 0 : amt * Math.exp(-k * u) * Math.sin(w * u));
/** Decaying pulse after an event (0 before it). */
export const pulse = (u, decay = 9) => (u < 0 ? 0 : Math.exp(-u * decay));
/** Sum of decaying pulses for a list of event times. */
export const pulses = (t, times, decay = 9) => times.reduce((a, e) => a + pulse(t - e, decay), 0);

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Run fn with Math.random temporarily replaced (the game's renderer and capsule physics use Math.random). */
export function withRng(r, fn) { const old = Math.random; Math.random = r; try { return fn(); } finally { Math.random = old; } }
/** Smooth deterministic shake offset. */
export const shakeXY = (t, amp) => [amp * (Math.sin(t * 91) * 0.6 + Math.sin(t * 137 + 1.3) * 0.4), amp * (Math.cos(t * 83 + 0.4) * 0.6 + Math.sin(t * 121 + 2.1) * 0.4)];

// ------------------------------------------------------------------ creatures (vector, crisp at any size)
/** Draw a creature form with the game's own painter. (x, y) = feet anchor like drawSprite, size = cell size. */
export function creature(c, form, x, y, size, o = {}) {
  const sx = o.sx ?? 1, sy = o.sy ?? 1;
  c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); c.scale(sx * (o.flip ? -1 : 1), sy);
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.translate(-size / 2, -size * 0.62); c.scale(size / 200, size / 200);
  paintForm(c, form, { blink: !!o.blink, hat: o.hat || null });
  c.restore();
}
/** Deterministic blink: returns true for ~0.12 s every few seconds. */
export const blinkAt = (t, seed = 0) => ((t + seed * 1.37) % (2.6 + (seed % 3) * 0.7)) < 0.12;

// ------------------------------------------------------------------ type
export const font = (size, w = 700) => `${w} ${size}px Fredoka, ui-rounded, sans-serif`;
const FILLS = {
  white: ['#ffffff', '#ffffff', '#ffe6f6'],
  gold: ['#fffbd0', '#ffe066', '#ffab1a'],
  aqua: ['#f4ffff', '#bff7ff', '#7fe3ff'],
  pink: ['#fff0fa', '#ffc2e6', '#ff8fd0'],
  mint: ['#f4fff8', '#c4ffdf', '#7eeab0'],
  lemon: ['#fffde8', '#fff3a3', '#ffd84a'],
};
/**
 * Chunky sticker word: white (or gradient) fill, thick plum outline, dark drop shadow, per-letter springy pop-in.
 * o.u = seconds since the word started popping in; o.out = seconds since it started popping out (optional).
 */
export function word(c, str, x, y, size, o = {}) {
  const u = o.u ?? 99, stg = o.stagger ?? 0.03, out = o.out ?? -1;
  c.save();
  c.font = font(size, o.weight || 700); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  let fit = 1; const full = c.measureText(str).width + (str.length - 1) * (o.track || 0);
  if (o.maxW && full > o.maxW) fit = o.maxW / full;
  const chars = [...str];
  const letters = chars.map((ch, i) => ({ ch, x: c.measureText(str.slice(0, i)).width + i * (o.track || 0), w: c.measureText(ch).width }));
  c.translate(x, y); c.rotate(o.rot || 0); c.scale(fit * (o.scale ?? 1), fit * (o.scale ?? 1));
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  const ex = out >= 0 ? Math.max(0, 1 - E.inBack(clamp(out / (o.outDur || 0.14)), 2.4)) : 1;
  const cap = size * 0.35;
  const tr = letters.map((L, i) => {
    const ui = u - i * stg, s = (o.noPop ? 1 : spring(ui, o.k || 8, o.w || 20)) * ex, q = o.noPop ? 0 : wobble(ui, o.sq ?? 0.3);
    const wave = o.wave ? Math.sin((o.time || 0) * 7 - i * 0.6) * size * o.wave : 0;
    return { s, sx: s * (1 - q), sy: s * (1 + q), cx: L.x + L.w / 2 - full / 2, dy: wave - (o.noPop ? 0 : Math.max(0, 1 - clamp(ui * 5)) * size * 0.4) };
  });
  const pass = (fn) => letters.forEach((L, i) => { const k = tr[i]; if (k.s <= 0.002) return; c.save(); c.translate(k.cx, k.dy); c.scale(k.sx, k.sy); fn(L); c.restore(); });
  c.lineJoin = 'round'; c.lineCap = 'round'; c.miterLimit = 2;
  const lw = size * (o.lw ?? 0.2);
  if (o.rim) pass((L) => { c.strokeStyle = o.rim; c.lineWidth = lw * 2.1; c.strokeText(L.ch, -L.w / 2, cap + size * 0.09); });
  if (o.shadow !== false) pass((L) => { c.fillStyle = c.strokeStyle = o.shadowCol || PLUM_DK; c.lineWidth = lw; c.strokeText(L.ch, -L.w / 2, cap + size * 0.09); c.fillText(L.ch, -L.w / 2, cap + size * 0.09); });
  pass((L) => { c.strokeStyle = o.outline || PLUM; c.lineWidth = lw; c.strokeText(L.ch, -L.w / 2, cap); });
  const fc = FILLS[o.fill || 'white'] || [o.fill, o.fill, o.fill];
  pass((L) => {
    const g = c.createLinearGradient(0, cap - size * 0.75, 0, cap); g.addColorStop(0, fc[0]); g.addColorStop(0.5, fc[1]); g.addColorStop(1, fc[2]);
    c.fillStyle = g; c.fillText(L.ch, -L.w / 2, cap);
  });
  if (o.gloss !== false) pass((L) => { c.save(); c.globalAlpha = 0.9; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(-L.w * 0.18, -size * 0.2, Math.max(2, L.w * 0.09), size * 0.045, -0.5, 0, TAU); c.fill(); c.restore(); });
  c.restore();
  return full * fit * (o.scale ?? 1);
}
/** Rounded pill label with plum outline. Returns its width. */
export function pill(c, str, x, y, size, o = {}) {
  const u = o.u ?? 99, s = (o.noPop ? 1 : spring(u, 8, 18)) * (o.out >= 0 ? Math.max(0, 1 - E.inBack(clamp(o.out / 0.14), 2.4)) : 1);
  if (s <= 0.002) return 0;
  c.save(); c.font = font(size, o.weight || 700);
  const tw = c.measureText(str).width, padX = size * (o.padX ?? 0.75), h = size * (o.h ?? 1.65), w = tw + padX * 2 + (o.icon ? size * 1.1 : 0);
  const q = wobble(u, 0.18);
  c.translate(x, y); c.rotate(o.rot || 0); c.scale(s * (1 + q), s * (1 - q));
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  const lw = Math.max(3, size * (o.lw ?? 0.14));
  c.beginPath(); c.roundRect(-w / 2, -h / 2 + size * 0.1, w, h, h / 2); c.fillStyle = PLUM_DK; c.fill();
  c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, h / 2);
  const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, o.bg || '#ffffff'); g.addColorStop(1, o.bg2 || o.bg || '#f3ecff'); c.fillStyle = g; c.fill();
  c.lineWidth = lw; c.strokeStyle = PLUM; c.stroke();
  c.fillStyle = o.color || PLUM; c.textBaseline = 'middle'; c.textAlign = 'left';
  let tx = -w / 2 + padX;
  if (o.icon) { o.icon(c, tx + size * 0.4, size * 0.02, size * 0.5); tx += size * 1.1; }
  c.fillText(str, tx, size * 0.04);
  c.restore();
  return w * s;
}

// ------------------------------------------------------------------ shapes
export function sparkle(c, x, y, r, col = '#fff', rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28); }
  c.closePath(); c.fill(); c.restore();
}
export function heart(c, x, y, s, col = '#ff8fc4') {
  c.beginPath(); c.moveTo(x, y + s * 0.35); c.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.5, y - s, x, y - s * 0.4); c.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
  c.fillStyle = col; c.fill(); c.lineWidth = Math.max(2, s * 0.14); c.strokeStyle = PLUM; c.lineJoin = 'round'; c.stroke();
}
/** The game's pearl bubble look (glassy bubble with a pearl inside). */
export function bubble(c, x, y, r, o = {}) {
  c.save(); if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(190,240,255,.55)'); gr.addColorStop(1, 'rgba(170,190,255,.6)');
  c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.lineWidth = Math.max(2, r * (o.lw ?? 0.09)); c.strokeStyle = PLUM; c.globalAlpha *= 0.9; c.stroke(); c.globalAlpha /= 0.9;
  if (o.pearl) {
    const pr = r * 0.5, pg = c.createRadialGradient(x - pr * 0.35, y - pr * 0.35, 1, x, y, pr);
    pg.addColorStop(0, '#fff'); pg.addColorStop(0.6, '#ffe6f7'); pg.addColorStop(1, '#f0b6e6');
    c.fillStyle = pg; c.beginPath(); c.arc(x, y, pr, 0, TAU); c.fill(); c.lineWidth = Math.max(1.5, r * 0.06); c.strokeStyle = 'rgba(59,29,94,.6)'; c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.2, r * 0.12, -0.6, 0, TAU); c.fill();
  c.restore();
}
/** Thin background bubble ring (the game's "Rising Bubbles" ambient look). */
export function ring(c, x, y, r, a = 0.55, col = '#fff') {
  c.save(); c.globalAlpha *= a; c.strokeStyle = col; c.lineWidth = Math.max(1.5, r * 0.12); c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.16)'; c.fill(); c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, TAU); c.fill(); c.restore();
}
/** Radial wedge rays. */
export function rays(c, cx, cy, n, rot, len, col, alpha = 0.2, width = 0.5, inner = 0) {
  c.save(); c.translate(cx, cy); c.rotate(rot); c.globalAlpha *= alpha; c.fillStyle = col;
  const a = TAU / n;
  c.beginPath();
  for (let i = 0; i < n; i++) { const a0 = i * a, a1 = a0 + a * width; c.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner); c.lineTo(Math.cos(a0) * len, Math.sin(a0) * len); c.lineTo(Math.cos(a1) * len, Math.sin(a1) * len); c.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner); c.closePath(); }
  c.fill(); c.restore();
}
export function glow(c, x, y, r, col, a = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.save(); c.globalAlpha *= a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}
export function vgrad(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
export function bg(c, W, H, stops) { c.fillStyle = vgrad(c, 0, H, stops); c.fillRect(0, 0, W, H); }

/** Anime speed lines converging on (cx, cy). */
export function speedLines(c, W, H, t, amt, cx = W / 2, cy = H / 2, col = '#fff') {
  if (amt <= 0.01) return;
  const r = mulberry(Math.floor(t * 30) * 7919 + 13);
  c.save(); c.globalAlpha *= clamp(amt); c.fillStyle = col;
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, w = 0.004 + r() * 0.012, r0 = 520 + r() * 420 * (1.2 - clamp(amt)), r1 = 1500;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    c.lineTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1); c.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1); c.closePath(); c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ analytic particles
const CONF = ['#ff8fc4', '#ffe66d', '#7cf0ff', '#8be9c8', '#b590ff', '#ffffff', '#ff7a59'];
/** Confetti burst from (x, y) at time t0. Stateless: position is computed from elapsed time. */
export function confetti(c, t, t0, n, seed, o = {}) {
  const u = t - t0, life = o.life || 2.4; if (u < 0 || u > life) return;
  const r = mulberry(seed);
  c.save();
  for (let i = 0; i < n; i++) {
    const a = (o.a ?? -Math.PI / 2) + (r() - 0.5) * (o.spread ?? 2.2), sp = (o.speed || 1500) * (0.45 + r() * 0.75);
    const drag = 1.6, k = (1 - Math.exp(-drag * u)) / drag;
    const x = (o.x ?? 540) + (o.w ? (r() - 0.5) * o.w : 0) + Math.cos(a) * sp * k + Math.sin(u * 3 + i) * 30 * u;
    const y = (o.y ?? 960) + Math.sin(a) * sp * k + 0.5 * (o.g ?? 900) * u * u;
    const rot = r() * TAU + u * (r() - 0.5) * 14, s = (o.size || 26) * (0.6 + r() * 0.7), flip = Math.cos(u * (6 + r() * 8) + i);
    const fade = clamp((life - u) / 0.5);
    c.save(); c.globalAlpha = fade; c.translate(x, y); c.rotate(rot); c.scale(1, flip);
    c.fillStyle = CONF[i % CONF.length];
    if (i % 3 === 0) { sparkle(c, 0, 0, s * 0.7, CONF[(i + 2) % CONF.length]); } else c.fillRect(-s / 2, -s / 4, s, s / 2);
    c.restore();
  }
  c.restore();
}
/** Sparkle/spark burst (4-point stars flying out and fading). */
export function burst(c, t, t0, x, y, n, seed, o = {}) {
  const u = t - t0, life = o.life || 0.8; if (u < 0 || u > life) return;
  const r = mulberry(seed), cols = o.colors || ['#fff', '#ffe66d', '#7cf0ff', '#ff8fc4'];
  c.save();
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, sp = (o.speed || 700) * (0.35 + r() * 0.8), ml = life * (0.6 + r() * 0.4); if (u > ml) { r(); r(); continue; }
    const k = E.outCubic(u / ml);
    const px = x + Math.cos(a) * sp * k * ml, py = y + Math.sin(a) * sp * k * ml + (o.g || 0) * u * u;
    const s = (o.size || 22) * (0.5 + r() * 0.8) * (1 - (u / ml) * 0.6);
    c.globalAlpha = 1 - Math.pow(u / ml, 2);
    if (o.kind === 'heart') heart(c, px, py, s, cols[i % cols.length]);
    else if (o.kind === 'pearl') { c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, s * 0.55, 0, TAU); c.fill(); c.lineWidth = s * 0.14; c.strokeStyle = '#f0b6e6'; c.stroke(); }
    else if (o.kind === 'drop') { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.arc(px, py, s * 0.45, 0, TAU); c.fill(); }
    else sparkle(c, px, py, s, cols[i % cols.length], r() * 2 + u * 3);
  }
  c.restore();
}
/** Expanding shock ring. */
export function shock(c, t, t0, x, y, r0, r1, col = '#fff', life = 0.45, lw = 18) {
  const u = t - t0; if (u < 0 || u > life) return;
  const k = E.outCubic(u / life);
  c.save(); c.globalAlpha = 1 - u / life; c.strokeStyle = col; c.lineWidth = lw * (1 - k) + 1; c.beginPath(); c.arc(x, y, lerp(r0, r1, k), 0, TAU); c.stroke(); c.restore();
}
/** Field of bubbles rising (stateless). */
export function risingBubbles(c, W, H, t, n, seed, o = {}) {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, sp = (o.speed || 160) * (0.5 + r()), rad = (o.size || 16) * (0.4 + r()), ph = r() * 10, off = r() * (H + 200);
    const y = H + 100 - ((t * sp + off) % (H + 200));
    const x = x0 + Math.sin(t * 1.3 + ph) * 22;
    if (o.pearl) bubble(c, x, y, rad, { alpha: o.alpha ?? 0.9, pearl: i % 3 === 0 });
    else ring(c, x, y, rad, o.alpha ?? 0.5, o.col);
  }
}

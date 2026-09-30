// Tiny Tides — Capsule Machine art: figurines, item pictures for reveals, the machine itself and its capsule physics.
import * as D from './data.js';
import { OUT, shade, getSprite, drawSprite, CELL } from './art_creatures.js';
import { PROP_ART, capsuleStyle, drawCapsule } from './art_world.js';

const TAU = Math.PI * 2;
export const TIER_COLOR = Object.fromEntries(D.GACHA.tiers.map((t) => [t.id, t.color]));

// ------------------------------------------------------------------ figurines
const figCache = new Map();
/** Creature sprite, optionally gold-plated (keeps the dark outline by using the 'color' blend, then re-masks to the silhouette). */
function figBitmap(formId, gold) {
  const key = `${formId}|${gold ? 'g' : 'n'}`;
  let cv = figCache.get(key);
  if (cv) return cv;
  const src = getSprite(formId).canvas;
  cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const c = cv.getContext('2d');
  c.drawImage(src, 0, 0);
  if (gold) {
    // grey it, lift the darks (so dark-blue and purple creatures still come out gold, not brown), then tint with gold
    const W = cv.width, H = cv.height;
    c.globalCompositeOperation = 'saturation'; c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'screen'; c.fillStyle = '#6a6a6a'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'multiply';
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffc526'); g.addColorStop(1, '#f09a00');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-atop';                  // a soft diagonal shine
    const sh = c.createLinearGradient(0, 0, W, H); sh.addColorStop(0.28, 'rgba(255,255,255,0)'); sh.addColorStop(0.4, 'rgba(255,255,240,.45)'); sh.addColorStop(0.52, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-in'; c.drawImage(src, 0, 0);
  }
  figCache.set(key, cv);
  return cv;
}
/** A collectible toy: the creature standing on the bottom half of a capsule. (x, y) = ground centre, s = tile size. */
export function drawFigure(c, formId, x, y, s, t, o = {}) {
  const gold = !!o.gold, st = capsuleStyle(gold ? 'rare' : (o.tier || 'common'), 330);
  const r = s * 0.27;
  c.save(); c.fillStyle = 'rgba(40,10,80,.22)'; c.beginPath(); c.ellipse(x, y + s * 0.02, r * 1.05, r * 0.3, 0, 0, TAU); c.fill(); c.restore();
  // half-capsule pedestal
  c.save(); c.translate(x, y - r * 0.05);
  c.beginPath(); c.arc(0, -r * 0.1, r, 0, Math.PI); c.closePath();
  const g = c.createLinearGradient(0, -r * 0.1, 0, r); g.addColorStop(0, gold ? '#fff2a0' : st.bottom); g.addColorStop(1, gold ? '#e8a410' : shade(st.ring, 0.55)); c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(2.2, s * 0.035); c.lineJoin = 'round'; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.ellipse(0, -r * 0.1, r, r * 0.3, 0, 0, TAU); c.fillStyle = gold ? '#ffd84a' : st.top; c.fill(); c.stroke();
  c.save(); c.globalAlpha = 0.55; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(-r * 0.4, r * 0.32, r * 0.18, r * 0.09, -0.6, 0, TAU); c.fill(); c.restore();
  c.restore();
  // the creature
  const size = s * 0.78, bob = Math.sin(t * 2 + (o.seed || 0)) * s * 0.012;
  c.drawImage(figBitmap(formId, gold), x - size / 2, y - r * 0.15 - size * 0.86 + bob, size, size);
  if (gold) {
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.7 + i / 3) % 1), px = x + Math.sin(i * 2.4 + t) * s * 0.28, py = y - s * (0.2 + k * 0.6);
      c.save(); c.globalAlpha = Math.sin(k * Math.PI); c.fillStyle = '#fff'; c.beginPath();
      for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2; c.lineTo(px + Math.cos(a) * s * 0.06, py + Math.sin(a) * s * 0.06); c.lineTo(px + Math.cos(a + 0.78) * s * 0.018, py + Math.sin(a + 0.78) * s * 0.018); }
      c.fill(); c.restore();
    }
  }
}
/** Draw any placed decor prop (regular props and figurines). */
export function drawProp(c, id, x, y, s, t, night) {
  const d = D.DECOR[id];
  if (d?.fig) return drawFigure(c, d.fig, x, y, s, t, { gold: d.gold, tier: d.gacha, seed: id.length });
  PROP_ART[id]?.(c, x, y, s, t, night);
}

// ------------------------------------------------------------------ item pictures (reveal, toybox, prize counter, rates)
export function drawSkinChip(c, key, x, y, size) {
  const k = D.SKINS[key]; if (!k) return;
  const u = size / 120, rr = (px, py, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x + px * u, y + py * u, w * u, h * u, r * u) : c.rect(x + px * u, y + py * u, w * u, h * u); };
  rr(6, 10, 108, 100, 24); c.fillStyle = k.slab; c.fill();
  rr(10, 10, 100, 88, 22); c.fillStyle = k.sand; c.fill();
  for (const [r0, col] of [[32, k.wet], [27, k.shallow], [15, k.deep]]) {
    let fill = col;
    if (k.prism && r0 === 27) {                          // Holo Prism: a rainbow ring, like its shimmering water
      fill = c.createConicGradient ? c.createConicGradient(0, x + 60 * u, y + 54 * u) : col;
      if (fill !== col) ['#ffc4ec', '#fff3b0', '#c4ffd6', '#a6fff0', '#b9a8ff', '#ffc4ec'].forEach((cc, i, a) => fill.addColorStop(i / (a.length - 1), cc));
    }
    c.beginPath(); c.arc(x + 60 * u, y + 54 * u, r0 * u, 0, TAU); c.fillStyle = fill; c.fill();
  }
  rr(10, 10, 100, 88, 22); c.strokeStyle = OUT; c.lineWidth = Math.max(2, 5 * u); c.stroke();
}
function heart(c, x, y, s, col) { c.beginPath(); c.moveTo(x, y + s * 0.35); c.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.5, y - s, x, y - s * 0.4); c.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.3, x, y + s * 0.35); c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1.6, s * 0.12); c.strokeStyle = OUT; c.stroke(); }
function star4(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.lineTo(x + Math.cos(a + 0.78) * r * 0.3, y + Math.sin(a + 0.78) * r * 0.3); } c.fill(); }
function fillerIcon(c, reward, x, y, size, t) {
  const r = size * 0.32;
  c.save(); c.translate(x, y);
  if (reward.coins || reward.glass || reward.tokens) { /* fallthrough below */ }
  if (reward.coins) {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#fff3a6'); g.addColorStop(1, '#ffb02e'); c.fillStyle = g; c.fill(); c.lineWidth = Math.max(2.4, size * 0.04); c.strokeStyle = OUT; c.stroke();
    drawCapsule(c, 0, 0, r * 0.5, capsuleStyle('common', 330), { rot: 0.5 });
    if (reward.coins > 1) { c.font = `700 ${size * 0.22}px Fredoka, sans-serif`; c.textAlign = 'center'; c.lineWidth = size * 0.06; c.strokeStyle = OUT; c.strokeText(`×${reward.coins}`, r * 0.9, r * 1.05); c.fillStyle = '#fff'; c.fillText(`×${reward.coins}`, r * 0.9, r * 1.05); }
  } else if (reward.glass) {
    c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.9, -r * 0.3); c.lineTo(r * 0.6, r * 0.9); c.lineTo(-r * 0.6, r * 0.9); c.lineTo(-r * 0.9, -r * 0.3); c.closePath();
    const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#b9fff0'); g.addColorStop(0.6, '#4de6cf'); g.addColorStop(1, '#1fb0c9'); c.fillStyle = g; c.fill(); c.lineWidth = Math.max(2.4, size * 0.04); c.lineJoin = 'round'; c.strokeStyle = OUT; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = size * 0.02; c.beginPath(); c.moveTo(-r * 0.4, -r * 0.3); c.lineTo(r * 0.4, -r * 0.3); c.moveTo(0, -r); c.lineTo(-r * 0.4, -r * 0.3); c.moveTo(0, -r); c.lineTo(r * 0.4, -r * 0.3); c.stroke();
    if (reward.glass > 1) { c.font = `700 ${size * 0.22}px Fredoka, sans-serif`; c.textAlign = 'center'; c.lineWidth = size * 0.06; c.strokeStyle = OUT; c.strokeText(`×${reward.glass}`, r * 0.9, r * 1.05); c.fillStyle = '#fff'; c.fillText(`×${reward.glass}`, r * 0.9, r * 1.05); }
  } else if (reward.tokens) {
    c.beginPath(); c.moveTo(-r * 0.7, -r); c.lineTo(r * 0.7, -r); c.lineTo(r * 0.1, 0); c.lineTo(r * 0.7, r); c.lineTo(-r * 0.7, r); c.lineTo(-r * 0.1, 0); c.closePath();
    const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#fff4a8'); g.addColorStop(1, '#ffbf2f'); c.fillStyle = g; c.fill(); c.lineWidth = Math.max(2.4, size * 0.045); c.lineJoin = 'round'; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.moveTo(-r * 0.9, -r); c.lineTo(r * 0.9, -r); c.moveTo(-r * 0.9, r); c.lineTo(r * 0.9, r); c.lineWidth = size * 0.07; c.lineCap = 'round'; c.stroke();
  } else {
    const rr = r * (reward.pearlsHours > 3 ? 1.05 : 0.85);
    c.beginPath(); c.arc(0, 0, rr, 0, TAU); const g = c.createRadialGradient(-rr * 0.3, -rr * 0.35, 2, 0, 0, rr); g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#ffe6f7'); g.addColorStop(1, '#f2a9e0'); c.fillStyle = g; c.fill(); c.lineWidth = Math.max(2.4, size * 0.04); c.strokeStyle = OUT; c.stroke();
    if (reward.pearlsHours > 3) { for (const [dx, dy] of [[-1.1, 0.5], [1.1, 0.6]]) { c.beginPath(); c.arc(dx * rr, dy * rr, rr * 0.45, 0, TAU); c.fillStyle = '#ffe6f7'; c.fill(); c.stroke(); } }
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(-rr * 0.35, -rr * 0.4, rr * 0.2, 0, TAU); c.fill();
  }
  c.restore(); void t;
}
/** Any capsule prize, centred at (x, y) within a `size` square. */
export function drawItemArt(c, id, x, y, size, t = 0) {
  const it = D.POOL_BY_ID[id]; if (!it) return;
  if (it.filler) return fillerIcon(c, it.reward, x, y, size, t);
  if (it.kind === 'fig') return drawFigure(c, it.fig, x, y + size * 0.4, size * 1.1, t, { gold: it.gold, tier: it.tier });
  if (it.kind === 'hat') { c.save(); c.translate(x, y + size * 0.1); drawSprite(c, 'crab.0', 0, 0, size * 1.15, { hat: id }); c.restore(); return; }
  if (it.kind === 'prop') return PROP_ART[id]?.(c, x, y + size * 0.42, size, t, false);
  if (it.kind === 'skin') return drawSkinChip(c, id, x - size / 2, y - size / 2, size);
  if (it.kind === 'fx') {
    if (id === 'hearts') { heart(c, x - size * 0.2, y + size * 0.05, size * 0.3, '#ff8fc4'); heart(c, x + size * 0.2, y - size * 0.12, size * 0.24, '#ff6fa8'); heart(c, x + size * 0.02, y + size * 0.28, size * 0.2, '#ffb1d6'); }
    else { const cols = ['#ff6f8f', '#ffb02e', '#ffe66d', '#6fe3a0', '#5fd6ff', '#b590ff']; c.save(); c.lineCap = 'round'; cols.forEach((col, i) => { c.beginPath(); c.arc(x, y + size * 0.3, size * (0.42 - i * 0.05), Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = col; c.lineWidth = size * 0.06; c.stroke(); }); c.restore(); star4(c, x + size * 0.32, y - size * 0.1, size * 0.1, '#fff'); star4(c, x - size * 0.34, y + size * 0.02, size * 0.07, '#ffe66d'); }
  }
}

// ------------------------------------------------------------------ the machine
export const MW = 360, MH = 470;                    // design-space size of the machine canvas
const GLOBE = { x: 180, y: 148, r: 116 };
const CHUTE = { x: 180, y: 392 };
const TRAY_Y = 436;

export function newMachine() {
  const caps = [];
  const hues = [330, 190, 48, 120, 260, 12, 300, 160];
  for (let i = 0; i < 17; i++) {
    const a = (i / 17) * TAU, rr = 40 + (i % 4) * 14;
    caps.push({ x: GLOBE.x + Math.cos(a) * rr, y: GLOBE.y + 30 + Math.sin(a) * rr * 0.6, vx: 0, vy: 0, r: 19, hue: hues[i % hues.length], rot: i, vr: 0 });
  }
  return { caps, crank: 0, crankV: 0, shake: 0, shine: 0, out: [], view: 'machine', flash: 0, time: 0 };
}
/** Capsule physics inside the globe. `shake` (0..1) makes them tumble. */
export function stepMachine(m, dt) {
  m.time += dt; m.flash = Math.max(0, m.flash - dt * 2.4); m.shake = Math.max(0, m.shake - dt * 0.6);
  m.crank += m.crankV * dt; m.crankV *= Math.pow(0.02, dt);
  const sub = 2, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const p of m.caps) {
      p.vy += 900 * h;
      if (m.shake > 0.02) { p.vx += (Math.random() - 0.5) * 2600 * m.shake * h * 4; p.vy -= Math.random() * 3400 * m.shake * h * 3; p.vr += (Math.random() - 0.5) * 60 * m.shake * h; }
      p.x += p.vx * h; p.y += p.vy * h; p.rot += p.vr * h; p.vr *= 0.995;
      const dx = p.x - GLOBE.x, dy = p.y - GLOBE.y, d = Math.hypot(dx, dy), lim = GLOBE.r - p.r - 3;
      if (d > lim) { const nx = dx / d, ny = dy / d; p.x = GLOBE.x + nx * lim; p.y = GLOBE.y + ny * lim; const vn = p.vx * nx + p.vy * ny; if (vn > 0) { p.vx -= (1 + 0.42) * vn * nx; p.vy -= (1 + 0.42) * vn * ny; p.vx *= 0.985; p.vr += -nx * 1.5; } }
    }
    for (let i = 0; i < m.caps.length; i++) for (let j = i + 1; j < m.caps.length; j++) {
      const a = m.caps[i], b = m.caps[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = a.r + b.r;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (min - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { const j2 = -(1 + 0.3) * rel / 2; a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny; }
      }
    }
  }
  // dropped capsules fall to the tray
  for (const o of m.out) {
    if (o.t0 > m.time) continue;
    if (!o.landed) {
      o.vy += 1500 * dt; o.y += o.vy * dt; o.x += (o.tx - o.x) * Math.min(1, dt * 6); o.rot += o.vr * dt;
      if (o.y >= o.ty) { o.y = o.ty; if (Math.abs(o.vy) > 260) { o.vy *= -0.38; o.vr *= 0.4; if (!o.bounced) { o.bounced = true; o.onLand?.(); } } else { o.vy = 0; o.landed = true; o.vr = 0; o.onSettle?.(); } }
    } else o.wob = (o.wob || 0) + dt;
  }
}
const OUTLINE = (c, w) => { c.lineWidth = w; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; };
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

/** Draw the whole machine (design space MW×MH; caller applies the scale). */
export function drawMachine(c, m, t, o = {}) {
  const hover = o.hover || 0;
  // cabinet
  c.save();
  const shk = m.shake > 0.05 ? Math.sin(t * 60) * m.shake * 2.2 : 0; c.translate(shk, 0);
  c.fillStyle = 'rgba(40,10,80,.28)'; c.beginPath(); c.ellipse(180, 452, 150, 16, 0, 0, TAU); c.fill();
  rrect(c, 34, 262, 292, 184, 34); let g = c.createLinearGradient(0, 262, 0, 446); g.addColorStop(0, '#ff9bd0'); g.addColorStop(0.55, '#ff6fb5'); g.addColorStop(1, '#d93f92'); c.fillStyle = g; c.fill(); OUTLINE(c, 7); c.stroke();
  c.save(); rrect(c, 34, 262, 292, 184, 34); c.clip(); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(34, 262, 292, 26); c.fillStyle = 'rgba(0,0,0,.10)'; c.fillRect(34, 410, 292, 40);
  for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,0)'; c.fillRect(34 + i * 36, 262, 18, 184); }
  c.restore();
  // marquee
  rrect(c, 62, 272, 236, 40, 20); c.fillStyle = '#fff7d6'; c.fill(); OUTLINE(c, 5); c.stroke();
  c.font = '700 22px Fredoka, ui-rounded, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3b1d5e'; c.fillText('TIDE CAPSULES', 180, 293);
  for (let i = 0; i < 9; i++) { const on = Math.floor(t * 3 + i) % 2; c.beginPath(); c.arc(74 + i * 26.5, 322, 3.2, 0, TAU); c.fillStyle = on ? '#fff3a6' : '#ffb1d8'; c.fill(); }
  // coin slot plate
  c.beginPath(); c.arc(98, 372, 26, 0, TAU); g = c.createLinearGradient(0, 346, 0, 398); g.addColorStop(0, '#f2e8ff'); g.addColorStop(1, '#b8a4e8'); c.fillStyle = g; c.fill(); OUTLINE(c, 5); c.stroke();
  rrect(c, 90, 362, 16, 6, 3); c.fillStyle = '#3b1d5e'; c.fill(); c.font = '700 11px Fredoka, sans-serif'; c.fillStyle = '#3b1d5e'; c.fillText('COIN', 98, 383);
  // crank
  const cx = 262, cy = 372;
  c.beginPath(); c.arc(cx, cy, 36, 0, TAU); g = c.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 38); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#ffc93f'); c.fillStyle = g; c.fill(); OUTLINE(c, 6); c.stroke();
  c.save(); c.translate(cx, cy); c.rotate(m.crank + Math.sin(t * 2.4) * 0.06 * (1 + hover));
  c.beginPath(); c.roundRect ? c.roundRect(-30, -9, 60, 18, 9) : c.rect(-30, -9, 60, 18); c.fillStyle = '#ff6f8f'; c.fill(); OUTLINE(c, 5); c.stroke();
  c.beginPath(); c.arc(-24, 0, 12, 0, TAU); c.fillStyle = '#ff9bb8'; c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.stroke();
  c.restore();
  if (hover > 0 && !m.crankV) { const k = 0.5 + 0.5 * Math.sin(t * 6); c.beginPath(); c.arc(cx, cy, 44 + k * 3, 0, TAU); c.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * k})`; c.lineWidth = 3; c.stroke(); }
  // chute
  rrect(c, 132, 364, 96, 56, 18); c.fillStyle = '#4a1f5c'; c.fill(); OUTLINE(c, 6); c.stroke();
  rrect(c, 138, 370, 84, 44, 14); g = c.createLinearGradient(0, 370, 0, 414); g.addColorStop(0, '#2a1140'); g.addColorStop(1, '#5a2a70'); c.fillStyle = g; c.fill();
  c.restore();
  // globe base ring
  c.beginPath(); c.ellipse(180, 262, 100, 16, 0, 0, TAU); g = c.createLinearGradient(0, 246, 0, 278); g.addColorStop(0, '#f6efff'); g.addColorStop(1, '#a894dc'); c.fillStyle = g; c.fill(); OUTLINE(c, 6); c.stroke();
  // capsules inside the globe
  c.save(); c.beginPath(); c.arc(GLOBE.x, GLOBE.y, GLOBE.r, 0, TAU); c.clip();
  const bg = c.createRadialGradient(GLOBE.x, GLOBE.y - 30, 10, GLOBE.x, GLOBE.y, GLOBE.r); bg.addColorStop(0, '#f3fbff'); bg.addColorStop(1, '#bfe4ff'); c.fillStyle = bg; c.fillRect(0, 0, MW, MH);
  for (const p of m.caps.slice().sort((a, b) => a.y - b.y)) drawCapsule(c, p.x, p.y, p.r, capsuleStyle('common', p.hue), { rot: p.rot });
  c.restore();
  // glass
  c.beginPath(); c.arc(GLOBE.x, GLOBE.y, GLOBE.r, 0, TAU); c.fillStyle = 'rgba(255,255,255,.12)'; c.fill(); OUTLINE(c, 7); c.stroke();
  c.save(); c.globalAlpha = 0.65; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(GLOBE.x - 60, GLOBE.y - 66, 34, 13, -0.75, 0, TAU); c.fill(); c.beginPath(); c.arc(GLOBE.x - 92, GLOBE.y - 20, 5, 0, TAU); c.fill(); c.restore();
  // globe cap
  rrect(c, 148, 18, 64, 20, 10); c.fillStyle = '#ffe66d'; c.fill(); OUTLINE(c, 5); c.stroke();
  // stickers
  c.save(); c.translate(56, 416); c.rotate(-0.2); heart(c, 0, 0, 13, '#ffe66d'); c.restore();
  c.save(); c.translate(304, 420); c.rotate(0.25); star4(c, 0, 0, 13, '#fff'); c.restore();
}
/** Dropped capsules (and the reveal-ready tray) are drawn separately so they can sit in front of the cabinet. */
export function drawDropped(c, m, t, o = {}) {
  for (const p of m.out) {
    if (p.t0 > m.time || p.hidden || p === o.skip) continue;
    const st = capsuleStyle(p.tier, p.hue || 330), wob = p.landed ? Math.sin((p.wob || 0) * 5) * 0.09 * Math.exp(-(p.wob || 0) * 0.6) + (p.ready ? Math.sin(t * 6 + p.i) * 0.06 : 0) : 0;
    const hi = o.hi === p.i;
    drawCapsule(c, p.x, p.y, p.r * (hi ? 1.08 : 1), st, { rot: p.rot + wob, glow: p.landed ? 0.55 : 0, t, open: p.open || 0 });
    if (p.landed && p.ready && !p.opened) { const k = 0.5 + 0.5 * Math.sin(t * 5 + p.i); c.save(); c.globalAlpha = 0.4 + 0.5 * k; star4(c, p.x + p.r * 0.85, p.y - p.r * 0.85, p.r * 0.32, '#fff'); c.restore(); }
  }
}
export { CHUTE, TRAY_Y, GLOBE, CELL };

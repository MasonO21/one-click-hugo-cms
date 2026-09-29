// Tiny Tides — procedural art for rocks, plants, decor props, eggs & cocoons.
// All functions draw centred on (x, y) = tile centre, scaled by `s` (tile size in px).
import { OUT, shade, rng, hash } from './art_creatures.js';
import { FAMILIES } from './data.js';

const TAU = Math.PI * 2;
const lw = (s, k = 0.045) => Math.max(1.6, s * k);

function shadow(c, x, y, rx, ry, a = 0.22) { c.save(); c.fillStyle = `rgba(30,10,60,${a})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); c.restore(); }
function fillOut(c, fill, w) { c.fillStyle = fill; c.fill(); c.lineWidth = w; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function vg(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function glow(c, x, y, r, col, a = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.save(); c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}
function rock(c, x, y, s, w, h, top, bot, seed = 1) {
  const r = rng(seed * 7919);
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;                 // upper half-ish
    pts.push([x + Math.cos(a) * w * (0.92 + r() * 0.12), y - Math.sin(-a) * h * (0.9 + r() * 0.16) * -1]);
  }
  c.beginPath();
  c.moveTo(x - w, y);
  c.bezierCurveTo(x - w * 1.02, y - h * 0.9, x - w * 0.5, y - h * 1.12, x - w * 0.05, y - h);
  c.bezierCurveTo(x + w * 0.5, y - h * 1.1, x + w * 1.05, y - h * 0.8, x + w, y);
  c.quadraticCurveTo(x, y + h * 0.28, x - w, y);
  c.closePath();
  fillOut(c, vg(c, y - h, y + h * 0.2, top, bot), lw(s));
  c.save(); c.globalAlpha = 0.5; c.fillStyle = '#fff';
  c.beginPath(); c.ellipse(x - w * 0.35, y - h * 0.62, w * 0.24, h * 0.11, -0.55, 0, TAU); c.fill(); c.restore();
}

export const PIECE_ART = {
  granite(c, x, y, s, t, seed) {
    shadow(c, x, y + s * 0.03, s * 0.36, s * 0.1);
    rock(c, x + s * 0.16, y, s, s * 0.17, s * 0.15, '#d9def0', '#9aa4c6', seed + 3);
    rock(c, x - s * 0.06, y + s * 0.02, s, s * 0.3, s * 0.3, '#d3d9ee', '#8792b8', seed);
  },
  mossy(c, x, y, s, t, seed) {
    PIECE_ART.granite(c, x, y, s, t, seed);
    const r = rng(seed * 31 + 5);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * (0.2 + r() * 0.6), rr = s * (0.16 + r() * 0.12);
      c.beginPath(); c.arc(x - s * 0.06 + Math.cos(a) * s * 0.2, y - s * 0.26 + Math.sin(a) * s * 0.08, rr * 0.55, 0, TAU); fillOut(c, i % 2 ? '#5ecb7a' : '#7de394', lw(s, 0.03));
    }
  },
  ember(c, x, y, s, t, seed) {
    shadow(c, x, y + s * 0.03, s * 0.36, s * 0.1);
    rock(c, x, y, s, s * 0.32, s * 0.3, '#8a5a78', '#4b2b52', seed);
    const p = 0.6 + Math.sin(t * 2.2 + seed) * 0.4;
    glow(c, x, y - s * 0.16, s * 0.4, 'rgba(255,140,60,.75)', 0.5 + p * 0.4);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [dx, k] of [[-0.12, 1], [0.08, -1], [0.02, 1]]) {
      c.beginPath(); c.moveTo(x + dx * s, y - s * 0.34); c.lineTo(x + dx * s + k * s * 0.06, y - s * 0.22); c.lineTo(x + dx * s - k * s * 0.03, y - s * 0.12); c.lineTo(x + dx * s + k * s * 0.05, y - s * 0.03);
      c.strokeStyle = 'rgba(255,90,50,.6)'; c.lineWidth = s * 0.075; c.stroke(); c.strokeStyle = '#ffe27a'; c.lineWidth = s * 0.03; c.stroke();
    }
    c.restore();
  },
  pearlite(c, x, y, s, t, seed) {
    shadow(c, x, y + s * 0.03, s * 0.36, s * 0.1);
    rock(c, x, y, s, s * 0.32, s * 0.3, '#f4e3ff', '#b9a2e6', seed);
    const p = 0.7 + Math.sin(t * 2 + seed) * 0.3;
    glow(c, x, y - s * 0.2, s * 0.42, 'rgba(255,230,255,.95)', 0.45 * p + 0.2);
    c.beginPath(); c.arc(x + s * 0.02, y - s * 0.2, s * 0.09, 0, TAU); fillOut(c, vg(c, y - s * 0.3, y - s * 0.1, '#ffffff', '#ffd1f4'), lw(s, 0.03));
    const tw = (t * 1.6 + seed) % 2;
    if (tw < 1) { c.save(); c.globalAlpha = 1 - tw; c.fillStyle = '#fff'; const px = x - s * 0.14, py = y - s * 0.4 - tw * s * 0.06; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(px + Math.cos(a) * s * 0.07, py + Math.sin(a) * s * 0.07); c.lineTo(px + Math.cos(a + 0.78) * s * 0.02, py + Math.sin(a + 0.78) * s * 0.02); } c.fill(); c.restore(); }
  },
  basalt(c, x, y, s, t, seed) {
    shadow(c, x, y + s * 0.04, s * 0.36, s * 0.1, 0.3);
    for (const [dx, h] of [[-0.19, 0.3], [0.19, 0.24], [0, 0.42]]) {
      const w = s * 0.13, top = y - s * h;
      c.beginPath(); c.moveTo(x + dx * s - w, y); c.lineTo(x + dx * s - w, top + s * 0.03); c.lineTo(x + dx * s, top - s * 0.04); c.lineTo(x + dx * s + w, top + s * 0.03); c.lineTo(x + dx * s + w, y); c.closePath();
      fillOut(c, vg(c, top, y, '#6f7ab5', '#2f3468'), lw(s, 0.04));
      c.beginPath(); c.moveTo(x + dx * s - w, top + s * 0.03); c.lineTo(x + dx * s, top - s * 0.04); c.lineTo(x + dx * s + w, top + s * 0.03); c.lineTo(x + dx * s, top + s * 0.07); c.closePath(); c.fillStyle = '#9aa6e6'; c.fill();
    }
  },
  glowstone(c, x, y, s, t, seed) {
    shadow(c, x, y + s * 0.04, s * 0.34, s * 0.09, 0.3);
    const p = 0.7 + Math.sin(t * 2.4 + seed) * 0.3;
    glow(c, x, y - s * 0.22, s * 0.55, 'rgba(120,255,240,.9)', 0.35 + p * 0.3);
    for (const [dx, h, w, col] of [[-0.17, 0.3, 0.1, '#7ef0ff'], [0.17, 0.24, 0.09, '#b98cff'], [0, 0.44, 0.13, '#9df7ff']]) {
      const top = y - s * h;
      c.beginPath(); c.moveTo(x + dx * s - s * w, y); c.lineTo(x + dx * s - s * w * 0.7, top + s * 0.08); c.lineTo(x + dx * s, top - s * 0.02); c.lineTo(x + dx * s + s * w * 0.7, top + s * 0.08); c.lineTo(x + dx * s + s * w, y); c.closePath();
      fillOut(c, vg(c, top, y, '#e9ffff', col), lw(s, 0.04));
    }
  },
  vent(c, x, y, s, t, seed) {
    shadow(c, x, y + s * 0.04, s * 0.36, s * 0.1, 0.3);
    c.beginPath(); c.moveTo(x - s * 0.3, y); c.quadraticCurveTo(x - s * 0.2, y - s * 0.28, x - s * 0.08, y - s * 0.34); c.lineTo(x + s * 0.08, y - s * 0.34); c.quadraticCurveTo(x + s * 0.2, y - s * 0.28, x + s * 0.3, y); c.closePath();
    fillOut(c, vg(c, y - s * 0.34, y, '#7b5c8f', '#3a2a55'), lw(s));
    glow(c, x, y - s * 0.34, s * 0.3, 'rgba(255,150,70,.9)', 0.6);
    c.beginPath(); c.ellipse(x, y - s * 0.34, s * 0.09, s * 0.035, 0, 0, TAU); c.fillStyle = '#ffb35c'; c.fill();
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.6 + i / 4 + seed * 0.13) % 1);
      c.save(); c.globalAlpha = (1 - k) * 0.85; c.fillStyle = '#e8fbff'; c.beginPath(); c.arc(x + Math.sin(k * 6 + i) * s * 0.07, y - s * 0.38 - k * s * 0.5, s * (0.03 + 0.03 * (1 - k)), 0, TAU); c.fill(); c.restore();
    }
  },
  kelp(c, x, y, s, t, seed, o = {}) {
    const cols = o.cols || ['#3fbf78', '#5ed58f', '#86e8a8'];
    shadow(c, x, y + s * 0.03, s * 0.25, s * 0.07, 0.18);
    [[-0.14, 0.62, 0], [0.13, 0.5, 1.7], [0, 0.78, 3.1]].forEach(([dx, h, ph], i) => {
      const sw = Math.sin(t * 1.7 + ph + seed) * s * 0.07, bx = x + dx * s;
      const build = () => { c.beginPath(); c.moveTo(bx, y); c.bezierCurveTo(bx + sw * 0.3 - s * 0.05, y - s * h * 0.4, bx + sw * 1.2 + s * 0.06, y - s * h * 0.7, bx + sw * 1.6, y - s * h); };
      c.lineCap = 'round'; c.lineJoin = 'round';
      build(); c.lineWidth = s * 0.13 + lw(s) * 2; c.strokeStyle = OUT; c.stroke();
      build(); c.lineWidth = s * 0.13; c.strokeStyle = cols[i]; c.stroke();
      if (o.glowDots) { const k = 0.35 + i * 0.2; c.save(); glow(c, bx + sw * 1.2 * k, y - s * h * k, s * 0.09, 'rgba(255,250,150,1)', 0.9); c.restore(); }
    });
  },
  biokelp(c, x, y, s, t, seed) { PIECE_ART.kelp(c, x, y, s, t, seed, { cols: ['#20b6a8', '#3fd6c4', '#7cf0dc'], glowDots: true }); },
};

// ------------------------------------------------------------------ decor props
function pole(c, x, y0, y1, w, col = '#c98f5a') { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.lineCap = 'round'; c.lineWidth = w + lw(w * 8) * 0.6; c.strokeStyle = OUT; c.stroke(); c.lineWidth = w; c.strokeStyle = col; c.stroke(); }
export const PROP_ART = {
  sandcastle(c, x, y, s) {
    shadow(c, x, y + s * 0.03, s * 0.36, s * 0.09);
    const tw = (dx, w, h) => { c.beginPath(); c.rect(x + dx * s - w * s / 2, y - h * s, w * s, h * s); fillOut(c, vg(c, y - h * s, y, '#ffe9b0', '#f0c67a'), lw(s, 0.035)); for (let i = 0; i < 3; i++) { c.beginPath(); c.rect(x + dx * s - w * s / 2 + i * w * s / 3 + 1, y - h * s - s * 0.05, w * s / 3 - 2, s * 0.06); fillOut(c, '#f0c67a', lw(s, 0.03)); } };
    tw(0, 0.3, 0.34); tw(-0.24, 0.18, 0.22); tw(0.24, 0.18, 0.2);
    pole(c, x, y - s * 0.34, y - s * 0.56, s * 0.02, '#fff');
    c.beginPath(); c.moveTo(x, y - s * 0.56); c.lineTo(x + s * 0.16, y - s * 0.5); c.lineTo(x, y - s * 0.44); c.closePath(); fillOut(c, '#ff6fa8', lw(s, 0.03));
    c.beginPath(); c.arc(x, y - s * 0.08, s * 0.05, Math.PI, 0); c.lineWidth = lw(s, 0.03); c.strokeStyle = OUT; c.stroke();
  },
  umbrella(c, x, y, s, t) {
    shadow(c, x + s * 0.06, y + s * 0.03, s * 0.3, s * 0.08);
    pole(c, x, y, y - s * 0.62, s * 0.035, '#fff');
    const cols = ['#ff6fa8', '#fff', '#ff6fa8', '#fff', '#ff6fa8'];
    const cy = y - s * 0.58, R = s * 0.42;
    cols.forEach((col, i) => { const a0 = Math.PI + i * Math.PI / 5, a1 = a0 + Math.PI / 5; c.beginPath(); c.moveTo(x, cy + s * 0.02); c.arc(x, cy + s * 0.02, R, a0, a1); c.closePath(); c.fillStyle = col; c.fill(); });
    c.beginPath(); c.arc(x, cy + s * 0.02, R, Math.PI, 0); c.closePath(); c.lineWidth = lw(s, 0.04); c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
  },
  sign(c, x, y, s) {
    shadow(c, x, y + s * 0.03, s * 0.2, s * 0.06);
    pole(c, x, y, y - s * 0.6, s * 0.06);
    c.beginPath(); c.moveTo(x - s * 0.3, y - s * 0.56); c.lineTo(x + s * 0.24, y - s * 0.56); c.lineTo(x + s * 0.36, y - s * 0.46); c.lineTo(x + s * 0.24, y - s * 0.36); c.lineTo(x - s * 0.3, y - s * 0.36); c.closePath(); fillOut(c, '#ffd9a0', lw(s, 0.04));
    c.strokeStyle = '#2fa4de'; c.lineWidth = lw(s, 0.03); c.lineCap = 'round'; c.beginPath(); c.moveTo(x - s * 0.2, y - s * 0.46); c.quadraticCurveTo(x - s * 0.13, y - s * 0.54, x - s * 0.06, y - s * 0.46); c.quadraticCurveTo(x + s * 0.01, y - s * 0.38, x + s * 0.08, y - s * 0.46); c.quadraticCurveTo(x + s * 0.13, y - s * 0.52, x + s * 0.18, y - s * 0.47); c.stroke();
  },
  surfboard(c, x, y, s) {
    shadow(c, x, y + s * 0.03, s * 0.2, s * 0.06);
    c.save(); c.translate(x, y - s * 0.34); c.rotate(0.12);
    c.beginPath(); c.ellipse(0, 0, s * 0.13, s * 0.4, 0, 0, TAU); fillOut(c, vg(c, -s * 0.4, s * 0.4, '#8ff3ff', '#3fb8ee'), lw(s, 0.04));
    c.beginPath(); c.moveTo(0, -s * 0.36); c.lineTo(0, s * 0.36); c.strokeStyle = '#fff'; c.lineWidth = s * 0.03; c.stroke();
    c.beginPath(); c.ellipse(0, s * 0.08, s * 0.13, s * 0.05, 0, 0, Math.PI); c.fillStyle = '#ff6fa8'; c.fill(); c.restore();
  },
  lantern(c, x, y, s, t, night) {
    shadow(c, x, y + s * 0.03, s * 0.16, s * 0.05);
    pole(c, x, y, y - s * 0.5, s * 0.05);
    const p = 0.75 + Math.sin(t * 3) * 0.1;
    glow(c, x, y - s * 0.6, s * (night ? 0.75 : 0.45), 'rgba(255,220,120,.95)', night ? p : 0.4);
    c.beginPath(); c.roundRect ? c.roundRect(x - s * 0.1, y - s * 0.74, s * 0.2, s * 0.24, s * 0.05) : c.rect(x - s * 0.1, y - s * 0.74, s * 0.2, s * 0.24); fillOut(c, '#ffe98a', lw(s, 0.04));
    c.beginPath(); c.moveTo(x - s * 0.12, y - s * 0.74); c.lineTo(x, y - s * 0.82); c.lineTo(x + s * 0.12, y - s * 0.74); c.closePath(); fillOut(c, '#ff8a5c', lw(s, 0.035));
  },
  lighthouse(c, x, y, s, t, night) {
    shadow(c, x, y + s * 0.03, s * 0.24, s * 0.07);
    c.beginPath(); c.moveTo(x - s * 0.17, y); c.lineTo(x - s * 0.11, y - s * 0.66); c.lineTo(x + s * 0.11, y - s * 0.66); c.lineTo(x + s * 0.17, y); c.closePath();
    fillOut(c, '#fff', lw(s, 0.04));
    c.save(); c.clip();
    c.fillStyle = '#ff6f8f'; for (let i = 0; i < 3; i++) c.fillRect(x - s * 0.2, y - s * (0.14 + i * 0.22), s * 0.4, s * 0.1);
    c.restore();
    c.beginPath(); c.moveTo(x - s * 0.17, y); c.lineTo(x - s * 0.11, y - s * 0.66); c.lineTo(x + s * 0.11, y - s * 0.66); c.lineTo(x + s * 0.17, y); c.closePath(); c.lineWidth = lw(s, 0.04); c.strokeStyle = OUT; c.stroke();
    const p = 0.7 + Math.sin(t * 2.5) * 0.3;
    glow(c, x, y - s * 0.78, s * (night ? 1.0 : 0.5), 'rgba(255,240,150,1)', night ? p : 0.35);
    c.beginPath(); c.rect(x - s * 0.09, y - s * 0.8, s * 0.18, s * 0.14); fillOut(c, '#fff3a6', lw(s, 0.035));
    c.beginPath(); c.moveTo(x - s * 0.13, y - s * 0.8); c.lineTo(x, y - s * 0.92); c.lineTo(x + s * 0.13, y - s * 0.8); c.closePath(); fillOut(c, '#ff6f8f', lw(s, 0.035));
  },
  treasure(c, x, y, s, t) {
    shadow(c, x, y + s * 0.03, s * 0.3, s * 0.08);
    c.beginPath(); c.rect(x - s * 0.24, y - s * 0.2, s * 0.48, s * 0.2); fillOut(c, vg(c, y - s * 0.2, y, '#d08a4a', '#a5642c'), lw(s, 0.04));
    c.beginPath(); c.moveTo(x - s * 0.24, y - s * 0.2); c.quadraticCurveTo(x, y - s * 0.46, x + s * 0.24, y - s * 0.2); c.closePath(); fillOut(c, vg(c, y - s * 0.4, y - s * 0.2, '#e6a15f', '#c07a3b'), lw(s, 0.04));
    c.beginPath(); c.rect(x - s * 0.04, y - s * 0.26, s * 0.08, s * 0.12); fillOut(c, '#ffe066', lw(s, 0.03));
    const k = (t * 0.8) % 1.6; if (k < 1) { c.save(); c.globalAlpha = 1 - k; c.fillStyle = '#fff'; const px = x + s * 0.14, py = y - s * 0.34; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(px + Math.cos(a) * s * 0.08 * (0.5 + k), py + Math.sin(a) * s * 0.08 * (0.5 + k)); c.lineTo(px + Math.cos(a + 0.78) * s * 0.02, py + Math.sin(a + 0.78) * s * 0.02); } c.fill(); c.restore(); }
  },
  duck(c, x, y, s, t) {
    const b = Math.sin(t * 2) * s * 0.02;
    c.save(); c.globalAlpha = 0.35; c.strokeStyle = '#fff'; c.lineWidth = lw(s, 0.03); c.beginPath(); c.ellipse(x, y + s * 0.02, s * 0.3 + Math.sin(t * 2) * s * 0.01, s * 0.09, 0, 0, TAU); c.stroke(); c.restore();
    y += b;
    c.beginPath(); c.ellipse(x, y - s * 0.12, s * 0.24, s * 0.16, 0, 0, TAU); fillOut(c, vg(c, y - s * 0.28, y, '#fff07a', '#ffd23f'), lw(s, 0.04));
    c.beginPath(); c.arc(x + s * 0.1, y - s * 0.32, s * 0.13, 0, TAU); fillOut(c, vg(c, y - s * 0.45, y - s * 0.2, '#fff07a', '#ffd23f'), lw(s, 0.04));
    c.beginPath(); c.ellipse(x + s * 0.25, y - s * 0.3, s * 0.07, s * 0.035, 0, 0, TAU); fillOut(c, '#ff9f43', lw(s, 0.03));
    c.fillStyle = OUT; c.beginPath(); c.arc(x + s * 0.13, y - s * 0.35, s * 0.02, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(x - s * 0.06, y - s * 0.12, s * 0.09, s * 0.06, -0.4, 0, TAU); c.fillStyle = 'rgba(255,190,40,.9)'; c.fill();
  },
  lilypad(c, x, y, s, t) {
    const b = Math.sin(t * 1.5) * s * 0.01; y += b;
    c.beginPath(); c.ellipse(x, y - s * 0.04, s * 0.32, s * 0.15, 0, 0.35, TAU - 0.05); c.lineTo(x, y - s * 0.04); c.closePath(); fillOut(c, vg(c, y - s * 0.2, y + s * 0.1, '#7be08f', '#3fbf78'), lw(s, 0.04));
    for (let i = 0; i < 6; i++) { c.save(); c.translate(x + s * 0.06, y - s * 0.1); c.rotate(i * TAU / 6); c.beginPath(); c.ellipse(0, -s * 0.07, s * 0.04, s * 0.08, 0, 0, TAU); fillOut(c, i % 2 ? '#ffb1d6' : '#ff8fc4', lw(s, 0.025)); c.restore(); }
    c.beginPath(); c.arc(x + s * 0.06, y - s * 0.1, s * 0.03, 0, TAU); c.fillStyle = '#ffe066'; c.fill();
  },
  flamingo(c, x, y, s, t) {
    const b = Math.sin(t * 1.8) * s * 0.02; y += b;
    c.beginPath(); c.ellipse(x, y - s * 0.06, s * 0.34, s * 0.14, 0, 0, TAU); c.lineWidth = s * 0.14 + lw(s) * 2; c.strokeStyle = OUT; c.stroke(); c.lineWidth = s * 0.14; c.strokeStyle = '#ff8fc4'; c.stroke();
    c.lineCap = 'round'; c.beginPath(); c.moveTo(x - s * 0.12, y - s * 0.16); c.bezierCurveTo(x - s * 0.24, y - s * 0.44, x + s * 0.06, y - s * 0.5, x - s * 0.02, y - s * 0.7);
    c.lineWidth = s * 0.08 + lw(s) * 2; c.strokeStyle = OUT; c.stroke(); c.lineWidth = s * 0.08; c.strokeStyle = '#ff8fc4'; c.stroke();
    c.beginPath(); c.arc(x - s * 0.02, y - s * 0.72, s * 0.07, 0, TAU); fillOut(c, '#ff8fc4', lw(s, 0.035));
    c.beginPath(); c.moveTo(x + s * 0.03, y - s * 0.72); c.lineTo(x + s * 0.15, y - s * 0.68); c.lineTo(x + s * 0.03, y - s * 0.66); c.closePath(); fillOut(c, '#3b1d5e', lw(s, 0.02));
  },
  boombox(c, x, y, s, t) {
    shadow(c, x, y + s * 0.03, s * 0.3, s * 0.08);
    c.beginPath(); c.rect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.3); fillOut(c, vg(c, y - s * 0.3, y, '#ff8fc4', '#e2559f'), lw(s, 0.04));
    for (const sd of [-1, 1]) { c.beginPath(); c.arc(x + sd * s * 0.16, y - s * 0.15, s * 0.1, 0, TAU); fillOut(c, '#3b1d5e', lw(s, 0.03)); const p = 1 + Math.sin(t * 8) * 0.12; c.beginPath(); c.arc(x + sd * s * 0.16, y - s * 0.15, s * 0.05 * p, 0, TAU); c.fillStyle = '#ffe98a'; c.fill(); }
    c.beginPath(); c.moveTo(x - s * 0.18, y - s * 0.3); c.quadraticCurveTo(x, y - s * 0.44, x + s * 0.18, y - s * 0.3); c.lineWidth = lw(s, 0.04); c.strokeStyle = OUT; c.stroke();
    for (let i = 0; i < 2; i++) { const k = ((t * 0.5 + i * 0.5) % 1); c.save(); c.globalAlpha = 1 - k; c.fillStyle = '#fff'; c.font = `bold ${s * 0.22}px sans-serif`; c.fillText('♪', x + s * (0.12 + i * 0.16), y - s * (0.42 + k * 0.4)); c.restore(); }
  },
  sakuratree(c, x, y, s, t) {
    shadow(c, x, y + s * 0.03, s * 0.28, s * 0.08);
    c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - s * 0.04, y - s * 0.3, x + s * 0.02, y - s * 0.5); c.lineWidth = s * 0.1 + lw(s) * 2; c.strokeStyle = OUT; c.stroke(); c.lineWidth = s * 0.1; c.strokeStyle = '#a5643c'; c.stroke();
    for (const [dx, dy, r] of [[-0.2, -0.62, 0.2], [0.2, -0.6, 0.19], [0, -0.78, 0.24], [0, -0.58, 0.22]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, TAU); fillOut(c, vg(c, y + (dy - r) * s, y + (dy + r) * s, '#ffd2e4', '#ff9fc6'), lw(s, 0.035)); }
    for (let i = 0; i < 4; i++) { const k = ((t * 0.3 + i / 4) % 1); c.save(); c.globalAlpha = 1 - k; c.fillStyle = '#ffc0da'; c.beginPath(); c.ellipse(x + Math.sin(k * 5 + i * 2) * s * 0.3, y - s * 0.5 + k * s * 0.5, s * 0.03, s * 0.018, k * 6, 0, TAU); c.fill(); c.restore(); }
  },
  paperlantern(c, x, y, s, t, night) {
    shadow(c, x, y + s * 0.03, s * 0.16, s * 0.05);
    pole(c, x, y, y - s * 0.52, s * 0.04);
    glow(c, x, y - s * 0.62, s * (night ? 0.7 : 0.4), 'rgba(255,150,170,.95)', night ? 0.8 : 0.35);
    c.beginPath(); c.ellipse(x, y - s * 0.62, s * 0.15, s * 0.19, 0, 0, TAU); fillOut(c, vg(c, y - s * 0.8, y - s * 0.44, '#ff8aa8', '#e2496d'), lw(s, 0.04));
    c.strokeStyle = 'rgba(255,230,180,.8)'; c.lineWidth = lw(s, 0.025); for (const k of [-0.6, 0, 0.6]) { c.beginPath(); c.ellipse(x, y - s * 0.62, s * 0.15 * Math.abs(k) + 0.1, s * 0.19, 0, -Math.PI / 2, Math.PI / 2); c.stroke(); }
  },
  neonpalm(c, x, y, s, t, night) {
    shadow(c, x, y + s * 0.03, s * 0.22, s * 0.06);
    const p = 0.8 + Math.sin(t * 4) * 0.15;
    glow(c, x, y - s * 0.6, s * 0.7, 'rgba(255,80,220,.9)', 0.35 * p);
    c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + s * 0.06, y - s * 0.3, x, y - s * 0.56); c.lineWidth = s * 0.08 + lw(s) * 2; c.strokeStyle = OUT; c.stroke(); c.lineWidth = s * 0.08; c.strokeStyle = '#2fe6d6'; c.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI * (0.05 + i * 0.225); c.beginPath(); c.moveTo(x, y - s * 0.56); c.quadraticCurveTo(x + Math.cos(a) * s * 0.22, y - s * 0.56 + Math.sin(a) * s * 0.3 - s * 0.04, x + Math.cos(a) * s * 0.36, y - s * 0.56 + Math.sin(a) * s * 0.12 + s * 0.14); c.lineWidth = s * 0.07 + lw(s) * 2; c.strokeStyle = OUT; c.stroke(); c.lineWidth = s * 0.07; c.strokeStyle = i % 2 ? '#ff5ec0' : '#7cf0ff'; c.stroke(); }
  },
  arcade(c, x, y, s, t) {
    shadow(c, x, y + s * 0.03, s * 0.26, s * 0.07);
    c.beginPath(); c.moveTo(x - s * 0.2, y); c.lineTo(x - s * 0.2, y - s * 0.56); c.lineTo(x - s * 0.1, y - s * 0.68); c.lineTo(x + s * 0.1, y - s * 0.68); c.lineTo(x + s * 0.2, y - s * 0.56); c.lineTo(x + s * 0.2, y); c.closePath(); fillOut(c, vg(c, y - s * 0.68, y, '#7b3dff', '#3d1fa8'), lw(s, 0.04));
    const p = 0.7 + Math.sin(t * 5) * 0.15;
    glow(c, x, y - s * 0.44, s * 0.4, 'rgba(120,255,240,.9)', 0.4 * p);
    c.beginPath(); c.rect(x - s * 0.13, y - s * 0.56, s * 0.26, s * 0.2); fillOut(c, '#1cf0e0', lw(s, 0.03));
    c.fillStyle = '#ff5ec0'; c.beginPath(); c.arc(x - s * 0.06, y - s * 0.45, s * 0.03, 0, TAU); c.fill(); c.fillStyle = '#ffe66d'; c.fillRect(x + s * 0.02, y - s * 0.48, s * 0.06, s * 0.06);
    c.fillStyle = '#ff5ec0'; c.beginPath(); c.arc(x - s * 0.08, y - s * 0.24, s * 0.035, 0, TAU); c.fill(); c.fillStyle = '#7cf0ff'; c.beginPath(); c.arc(x + s * 0.06, y - s * 0.24, s * 0.03, 0, TAU); c.fill();
  },
};

// ------------------------------------------------------------------ eggs & cocoons
export function drawEgg(c, fam, x, y, s, t, o = {}) {
  const pal = FAMILIES[fam].pal, ready = !!o.ready, cracks = o.cracks || 0;
  const wob = ready ? Math.sin(t * 9) * 0.1 * (0.5 + 0.5 * Math.sin(t * 1.6)) : Math.sin(t * 1.4) * 0.03;
  shadow(c, x, y + s * 0.03, s * 0.2, s * 0.06);
  c.save(); c.translate(x, y); c.rotate(wob); c.scale(o.pop || 1, o.pop || 1);
  const w = s * 0.2, h = s * 0.27;
  c.beginPath(); c.moveTo(0, -h * 2); c.bezierCurveTo(w * 1.5, -h * 1.9, w * 1.15, 0, 0, 0); c.bezierCurveTo(-w * 1.15, 0, -w * 1.5, -h * 1.9, 0, -h * 2); c.closePath();
  c.translate(0, 0);
  fillOut(c, vg(c, -h * 2, 0, shade(pal.belly, 0.5), pal.belly), lw(s, 0.045));
  c.save(); c.clip(); c.fillStyle = pal.accent; c.globalAlpha = 0.7;
  for (const [dx, dy, r] of [[-0.35, -1.2, 0.13], [0.3, -0.9, 0.1], [0.05, -1.55, 0.09], [-0.2, -0.5, 0.08], [0.42, -1.4, 0.07]]) { c.beginPath(); c.arc(dx * w * 1.5, dy * h, r * s, 0, TAU); c.fill(); }
  c.restore();
  c.save(); c.globalAlpha = 0.6; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(-w * 0.5, -h * 1.45, w * 0.18, h * 0.32, 0.3, 0, TAU); c.fill(); c.restore();
  if (cracks) { c.strokeStyle = OUT; c.lineWidth = lw(s, 0.03); c.lineCap = 'round'; c.beginPath(); c.moveTo(-w * 0.5, -h * 1.2); c.lineTo(-w * 0.1, -h * 1.0); c.lineTo(w * 0.1, -h * 1.25); if (cracks > 1) { c.lineTo(w * 0.4, -h * 1.05); c.moveTo(-w * 0.1, -h * 1.0); c.lineTo(-w * 0.2, -h * 0.7); } c.stroke(); }
  c.restore();
  if (ready) { const k = (t * 1.2) % 2; if (k < 1) { c.save(); c.globalAlpha = 1 - k; c.fillStyle = '#fff'; const px = x + s * 0.2, py = y - s * 0.45 - k * s * 0.1; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(px + Math.cos(a) * s * 0.09, py + Math.sin(a) * s * 0.09); c.lineTo(px + Math.cos(a + 0.78) * s * 0.025, py + Math.sin(a + 0.78) * s * 0.025); } c.fill(); c.restore(); } }
}
export function drawCocoon(c, x, y, s, t, progress) {
  const p = 0.5 + Math.sin(t * 2.4) * 0.5;
  shadow(c, x, y + s * 0.03, s * 0.24, s * 0.07);
  glow(c, x, y - s * 0.3, s * 0.6, 'rgba(200,150,255,.9)', 0.35 + p * 0.25);
  c.beginPath(); c.ellipse(x, y - s * 0.3, s * 0.24, s * 0.33, 0, 0, TAU);
  c.fillStyle = vg(c, y - s * 0.62, y, 'rgba(255,255,255,.75)', 'rgba(190,150,255,.65)'); c.fill(); c.lineWidth = lw(s, 0.04); c.strokeStyle = OUT; c.stroke();
  c.save(); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = lw(s, 0.03); c.lineCap = 'round';
  for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x, y - s * 0.3, s * 0.22, s * (0.06 + i * 0.07), 0, Math.PI * (0.1 + i * 0.05), Math.PI * (0.9 - i * 0.05)); c.stroke(); }
  c.restore();
  c.beginPath(); c.arc(x, y - s * 0.3, s * 0.36, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, progress)); c.lineWidth = lw(s, 0.05); c.strokeStyle = '#ffe66d'; c.lineCap = 'round'; c.stroke();
  for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; c.save(); c.globalAlpha = 1 - k; c.fillStyle = '#fff'; c.beginPath(); c.arc(x + Math.sin(k * 7 + i * 2) * s * 0.2, y - s * 0.1 - k * s * 0.55, s * 0.025, 0, TAU); c.fill(); c.restore(); }
}

// Living room props — cozy chunky-cartoon furniture & critters.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, smoothPath, vgrad, hgrad, rgrad, toonBox, toonCircle, rod, gloss, rng, text, mirrored,
} from '../common.js';
import { woodGrain } from './shared.js';
import { motionAt } from '../../physics.js';

const TAU = Math.PI * 2;
const pick = (arr, v) => arr[(((v || 0) % arr.length) + arr.length) % arr.length];
const BOOK_COLORS = ['#e05a47', '#3e8ed0', '#f2b134', '#5bb072', '#8d6cc4', '#e57fb0', '#2fb3a8', '#f08a4b'];

// ---------------------------------------------------------------- helpers
export function sparkle(ctx, x, y, s, color = '#ffffff', a = 1) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= a;
  ctx.beginPath(); ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

function dashed(ctx, color, lw = 1.6, dash = [5, 4]) {
  ctx.save(); ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
}

// Layered cartoon flame tongues rising from yBase (shared with the backyard grill).
export function fireTongues(ctx, cx, halfW, yBase, hMax, t, k = 1, seed = 0) {
  if (k <= 0.01) return;
  const layers = [['#e8431c', 1, 1], ['#ff8c1f', 0.8, 0.8], ['#ffcb3c', 0.58, 0.58], ['#fff4c4', 0.32, 0.34]];
  for (let L = 0; L < layers.length; L++) {
    const [col, ws, hs] = layers[L];
    const hw = halfW * ws;
    const n = Math.max(2, Math.round(hw * 2 / 24));
    ctx.beginPath();
    ctx.moveTo(cx - hw, yBase);
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, um = (u0 + u1) / 2;
      const xa = cx - hw + u0 * hw * 2, xb = cx - hw + u1 * hw * 2, xm = cx - hw + um * hw * 2;
      const env = Math.pow(Math.sin(Math.PI * (0.12 + um * 0.76)), 0.8);
      const fl = 0.78 + 0.2 * Math.sin(t * 11 + i * 2.1 + seed + L * 0.7) + 0.1 * Math.sin(t * 23 + i * 5.3 + seed);
      const h = hMax * hs * k * env * fl;
      const sway = Math.sin(t * 7 + i * 1.3 + seed) * 4 * k;
      ctx.quadraticCurveTo(xa + (xm - xa) * 0.15, yBase - h * 0.6, xm + sway, yBase - h);
      ctx.quadraticCurveTo(xb - (xb - xm) * 0.15, yBase - h * 0.6, xb, yBase - (i < n - 1 ? h * 0.28 : 0));
    }
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (L === 0) strokeOnly(ctx, 3, rgba('#8a2408', 0.75));
  }
}

// ---------------------------------------------------------------- upholstery pieces
function backPillow(ctx, cx, y0, y1, w, col, buttons = 2) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const path = () => {
  ctx.beginPath();
  ctx.moveTo(x0 + 10, y1);
  ctx.quadraticCurveTo(x0 - 3, y1, x0, y1 - 14);
  ctx.lineTo(x0 + 1, y0 + 14);
  ctx.quadraticCurveTo(x0 + 2, y0 - 1, x0 + 18, y0 + 1);
  ctx.quadraticCurveTo(cx, y0 - 5, x1 - 18, y0 + 1);
  ctx.quadraticCurveTo(x1 - 2, y0 - 1, x1 - 1, y0 + 14);
  ctx.lineTo(x1, y1 - 14);
  ctx.quadraticCurveTo(x1 + 3, y1, x1 - 10, y1);
  ctx.closePath();
  };
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = rgba(lighten(col, 0.6), 0.28);
  ellipsePath(ctx, cx - w * 0.12, y0 + 10, w * 0.36, 7); ctx.fill();
  ctx.fillStyle = rgba(darken(col, 0.5), 0.22); ctx.fillRect(x0 - 5, y0 + (y1 - y0) * 0.7, w + 10, 40);
  ctx.restore();
  path(); strokeOnly(ctx, 3.5);
  // tufting buttons with creases
  const by = y0 + (y1 - y0) * 0.45;
  for (let i = 0; i < buttons; i++) {
    const bx = cx + (i - (buttons - 1) / 2) * (w / (buttons + 0.6));
    ctx.strokeStyle = rgba(darken(col, 0.55), 0.45); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(bx - 9, by - 7); ctx.lineTo(bx, by); ctx.lineTo(bx + 9, by - 7); ctx.moveTo(bx - 9, by + 7); ctx.lineTo(bx, by); ctx.lineTo(bx + 9, by + 7); ctx.stroke();
    circlePath(ctx, bx, by, 3.4); fillStroke(ctx, darken(col, 0.25), 1.8);
  }
}

function seatCushion(ctx, cx, cy, w, h, col) {
  toonBox(ctx, cx, cy, w, h, 12, col, { hi: 0.4, shadeAt: 0.66, shade: 0.22 });
  // piping along the front top edge + stitching
  ctx.beginPath(); ctx.moveTo(cx - w / 2 + 9, cy - h / 2 + 7); ctx.lineTo(cx + w / 2 - 9, cy - h / 2 + 7);
  dashed(ctx, rgba(lighten(col, 0.75), 0.7), 1.8, [5, 4]);
  ctx.beginPath(); ctx.moveTo(cx - w / 2 + 9, cy + h / 2 - 6); ctx.lineTo(cx + w / 2 - 9, cy + h / 2 - 6);
  dashed(ctx, rgba(darken(col, 0.5), 0.35), 1.6, [5, 4]);
}

function rolledArm(ctx, cx, cy, w, h, col, side) {
  toonBox(ctx, cx, cy, w, h, 16, col, { shadeAt: 0.7 });
  // scroll face
  const sy = cy - h / 2 + 17;
  circlePath(ctx, cx, sy, w / 2 - 6); ctx.fillStyle = lighten(col, 0.12); ctx.fill(); strokeOnly(ctx, 3);
  ctx.beginPath(); ctx.arc(cx, sy, w / 2 - 13, -Math.PI * 0.2, Math.PI * 1.35);
  ctx.lineWidth = 2; ctx.strokeStyle = rgba(darken(col, 0.5), 0.45); ctx.stroke();
  circlePath(ctx, cx, sy, 3); ctx.fillStyle = darken(col, 0.3); ctx.fill();
  // pleats below the scroll
  ctx.strokeStyle = rgba(darken(col, 0.55), 0.3); ctx.lineWidth = 1.6;
  for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cx + dx, sy + w / 2 - 2); ctx.lineTo(cx + dx * 0.8, cy + h / 2 - 8); ctx.stroke(); }
  gloss(ctx, cx - w / 2 + 6 + (side > 0 ? 0 : 0), sy + 18, 4, h * 0.35, 0.3);
}

function woodFoot(ctx, x, y0, y1, w = 12) {
  ctx.beginPath(); ctx.moveTo(x - w / 2, y0); ctx.lineTo(x + w / 2, y0); ctx.lineTo(x + w / 2 - 3, y1); ctx.lineTo(x - w / 2 + 3, y1); ctx.closePath();
  fillStroke(ctx, '#7a4a2a', 3);
}

const SOFA_COLS = ['#e0765c', '#3f9aa6', '#e8a93c', '#8c62a8'];
const CHAIR_COLS = ['#5b8fd1', '#d9a441', '#c95f7e', '#4fa37a'];

// Fireplace column stones, laid out once per side: [dx, y, w, h, colour].
const STONES = {};
function stoneLayout(side) {
  if (STONES[side]) return STONES[side];
  const r = rng(side > 0 ? 11 : 23);
  const out = [];
  const base = '#b9ad9e';
  let y = -96;
  while (y < 114) {
    const sh = Math.min(22 + r() * 12, 115 - y);
    const split = -12 + r() * 24;
    for (const [x0, x1] of [[-25, split], [split, 25]]) {
      const c = mix(base, pick(['#d6cbbd', '#a3968a', '#c9b9a3', '#9b948b'], Math.floor(r() * 4)), 0.6);
      if (sh > 6) out.push([x0 + 1.5, y + 1.5, x1 - x0 - 3, sh - 3, c]);
    }
    y += sh;
  }
  return (STONES[side] = out);
}

// Static-art sprite cache: renders a callback once into an offscreen canvas at high resolution
// so heavy, never-changing parts of animated props cost a single drawImage per frame.
const SPRITES = {};
const SPRITE_RES = 3;
export function drawSprite(ctx, key, x, y, w, h, paint) {
  let c = SPRITES[key];
  if (c === undefined) {
    c = null;
    try {
      const cw = Math.ceil(w * SPRITE_RES), ch = Math.ceil(h * SPRITE_RES);
      c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(cw, ch);
      c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.setTransform(SPRITE_RES, 0, 0, SPRITE_RES, -x * SPRITE_RES, -y * SPRITE_RES);
      paint(g);
    } catch (e) { c = null; }
    SPRITES[key] = c;
  }
  if (c) ctx.drawImage(c, x, y, w, h);
  else paint(ctx);
}

function fireboxStatic(ctx) {
  rrPath(ctx, -72, -96, 144, 212, 8);
  ctx.fillStyle = vgrad(ctx, -96, 115, [[0, '#1d1210'], [0.6, '#3a1d14'], [1, '#5a2a16']]); ctx.fill();
  ctx.save(); rrPath(ctx, -72, -96, 144, 212, 8); ctx.clip();
  ctx.strokeStyle = 'rgba(160,70,40,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath();
  let row = 0;
  for (let y = -90; y < 112; y += 16, row++) {
    ctx.moveTo(-72, y); ctx.lineTo(72, y);
    for (let x = -72 + (row % 2) * 18; x < 72; x += 36) { ctx.moveTo(x, y); ctx.lineTo(x, y + 16); }
  }
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, -96, -40, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(-72, -96, 144, 60);
  ctx.restore();
}

function fireLogs(ctx) {
  ctx.save();
  ctx.translate(0, 104);
  for (const [a, lx] of [[0.12, -18], [-0.14, 18]]) {
    ctx.save(); ctx.translate(lx, 0); ctx.rotate(a);
    rrc(ctx, 0, 0, 84, 16, 8); fillStroke(ctx, '#7a4a2a', 3);
    ctx.strokeStyle = rgba('#3a2216', 0.5); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-30, -3); ctx.lineTo(20, -3); ctx.moveTo(-20, 3); ctx.lineTo(28, 3); ctx.stroke();
    ellipsePath(ctx, a > 0 ? -40 : 40, 0, 5, 7.5); fillStroke(ctx, '#e8c48a', 2.5);
    ctx.restore();
  }
  ctx.restore();
  rod(ctx, -58, 112, -58, 98, 4, '#3a3637');
  rod(ctx, 58, 112, 58, 98, 4, '#3a3637');
}

function fireplaceFrame(ctx) {
  const stone = '#b9ad9e';
  for (const s of [-1, 1]) {
    const cx = s * 95;
    rrPath(ctx, cx - 25, -96, 50, 211, 3); ctx.fillStyle = stone; ctx.fill();
    const stones = stoneLayout(s);
    for (const st of stones) { rrPath(ctx, cx + st[0], st[1], st[2], st[3], 6); ctx.fillStyle = st[4]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.35); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const st of stones) ctx.fillRect(cx + st[0] + 3.5, st[1] + 2.5, st[2] * 0.5, 2.5);
    rrPath(ctx, cx - 25, -96, 50, 211, 3); strokeOnly(ctx);
  }
  const wood = '#9c5b34';
  toonBox(ctx, 0, -105, 240, 20, 4, wood);
  woodGrain(ctx, -118, -113, 236, 16, wood, 5);
  rrc(ctx, 0, -105, 240, 20, 4); strokeOnly(ctx);
  // capital blocks where the columns meet the mantel
  for (const s of [-1, 1]) {
    rrc(ctx, s * 95, -90, 46, 9, 2); fillStroke(ctx, '#d6cbbd', 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(s * 95 - 20, -93, 40, 2);
  }
}

// ---------------------------------------------------------------- props
export const LIVING_ART = {
  couch: {
    draw(ctx, o) {
      const col = pick(SOFA_COLS, o.v);
      const back = darken(col, 0.12);
      // back frame (decorative — sits behind the seat)
      rrc(ctx, 0, -38, 238, 60, 20); fillStroke(ctx, darken(col, 0.28));
      backPillow(ctx, -57, -68, -10, 112, back, 2);
      backPillow(ctx, 57, -68, -10, 112, back, 2);
      // throw pillow tucked into the corner
      ctx.save(); ctx.translate(-88, -36); ctx.rotate(-0.22);
      const pc = col === '#e8a93c' ? '#3f9aa6' : '#f3e3c2';
      rrc(ctx, 0, 0, 44, 40, 12); fillStroke(ctx, pc, 3.5);
      ctx.save(); rrc(ctx, 0, 0, 44, 40, 12); ctx.clip();
      ctx.fillStyle = rgba(darken(pc, 0.35), 0.35);
      for (let k = -2; k <= 2; k++) ctx.fillRect(k * 10 - 2, -22, 4, 44);
      ctx.restore();
      rrc(ctx, 0, 0, 44, 40, 12); strokeOnly(ctx, 3.5);
      ctx.restore();
      // base / skirt
      toonBox(ctx, 0, 40, 310, 50, 10, darken(col, 0.18), { shadeAt: 0.5 });
      ctx.beginPath(); ctx.moveTo(-146, 24); ctx.lineTo(146, 24); dashed(ctx, rgba(lighten(col, 0.6), 0.5), 1.8, [6, 5]);
      for (const fx of [-128, 128]) woodFoot(ctx, fx, 64, 75, 16);
      // seat cushions (the bouncy bit)
      seatCushion(ctx, -57.5, 0, 115, 32, lighten(col, 0.06));
      seatCushion(ctx, 57.5, 0, 115, 32, lighten(col, 0.06));
      // arms
      rolledArm(ctx, -138, -8, 44, 86, col, -1);
      rolledArm(ctx, 138, -8, 44, 86, col, 1);
    },
  },

  armchair: {
    draw(ctx, o) {
      const col = pick(CHAIR_COLS, o.v);
      // wingback (decorative)
      const wing = () => {
      ctx.beginPath();
      ctx.moveTo(-56, -8); ctx.lineTo(-58, -48);
      ctx.bezierCurveTo(-58, -66, -40, -70, -24, -64);
      ctx.quadraticCurveTo(0, -74, 24, -64);
      ctx.bezierCurveTo(40, -70, 58, -66, 58, -48);
      ctx.lineTo(56, -8); ctx.closePath();
      };
      wing(); ctx.fillStyle = darken(col, 0.12); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(lighten(col, 0.6), 0.25); ellipsePath(ctx, -8, -58, 36, 6); ctx.fill();
      ctx.restore();
      wing(); strokeOnly(ctx);
      // diamond tufting
      ctx.strokeStyle = rgba(darken(col, 0.55), 0.35); ctx.lineWidth = 1.6;
      for (const [bx, by] of [[-22, -48], [0, -48], [22, -48], [-11, -32], [11, -32]]) {
        ctx.beginPath(); ctx.moveTo(bx - 8, by - 6); ctx.lineTo(bx, by); ctx.lineTo(bx + 8, by - 6); ctx.stroke();
        circlePath(ctx, bx, by, 3); fillStroke(ctx, darken(col, 0.3), 1.6);
      }
      // base + turned legs
      for (const lx of [-70, 70]) {
        ctx.beginPath(); ctx.moveTo(lx - 7, 58); ctx.lineTo(lx + 7, 58); ctx.lineTo(lx + 4, 70); ctx.lineTo(lx - 4, 70); ctx.closePath();
        fillStroke(ctx, '#7a4a2a', 3);
      }
      toonBox(ctx, 0, 36, 170, 48, 10, darken(col, 0.18), { shadeAt: 0.5 });
      ctx.beginPath(); ctx.moveTo(-76, 20); ctx.lineTo(76, 20); dashed(ctx, rgba(lighten(col, 0.6), 0.5), 1.8, [6, 5]);
      // little fringe skirt
      ctx.fillStyle = rgba(darken(col, 0.45), 0.35);
      for (let x = -78; x <= 78; x += 6) ctx.fillRect(x, 54, 2, 4);
      // seat
      seatCushion(ctx, 0, 0, 100, 30, lighten(col, 0.06));
      // arms
      rolledArm(ctx, -68, -6, 38, 80, col, -1);
      rolledArm(ctx, 68, -6, 38, 80, col, 1);
    },
  },

  tv: {
    draw(ctx, o) {
      // rabbit-ear antenna (decorative)
      rod(ctx, 14, -54, -18, -90, 3, '#cfd6dc');
      rod(ctx, 26, -54, 60, -86, 3, '#cfd6dc');
      toonCircle(ctx, -18, -90, 5, '#e05a47', { lw: 2.5, spec: false });
      toonCircle(ctx, 60, -86, 5, '#e05a47', { lw: 2.5, spec: false });
      ctx.beginPath(); ctx.ellipse(20, -50, 15, 9, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#3a3d42', 3);
      // walnut case
      const wood = '#a8643a';
      toonBox(ctx, 0, 10, 170, 120, 14, wood, { shadeAt: 0.8 });
      woodGrain(ctx, -80, -46, 160, 112, wood, 21);
      rrc(ctx, 0, 10, 170, 120, 14); strokeOnly(ctx);
      // bezel
      rrc(ctx, -21, 11, 118, 100, 14); fillStroke(ctx, '#efe4cc', 3.5);
      // screen (CRT bulge)
      const sx = -21, sy = 11, sw = 100, sh = 82;
      rrc(ctx, sx, sy, sw, sh, 22); ctx.fillStyle = '#1d2630'; ctx.fill();
      ctx.save(); rrc(ctx, sx, sy, sw - 4, sh - 4, 20); ctx.clip();
      const show = (o.v || 0) % 2;
      if (show === 0) {
        // cartoon: Frank waving on a sunny hill
        ctx.fillStyle = vgrad(ctx, sy - sh / 2, sy + sh / 2, [[0, '#6fc8ff'], [1, '#c9efff']]); ctx.fillRect(sx - 60, sy - 50, 120, 100);
        circlePath(ctx, sx + 30, sy - 22, 10); ctx.fillStyle = '#ffe066'; ctx.fill();
        ctx.fillStyle = '#7fcf5c'; ctx.beginPath(); ctx.ellipse(sx, sy + 46, 70, 30, 0, 0, TAU); ctx.fill();
        ctx.lineCap = 'round';
        ctx.lineWidth = 16; ctx.strokeStyle = '#7a2f1c';
        ctx.beginPath(); ctx.moveTo(sx - 26, sy + 6); ctx.quadraticCurveTo(sx - 4, sy - 8, sx + 18, sy + 4); ctx.stroke();
        ctx.lineWidth = 11; ctx.strokeStyle = '#e0603f'; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = rgba('#ffd2b8', 0.8);
        ctx.beginPath(); ctx.moveTo(sx - 20, sy); ctx.quadraticCurveTo(sx - 6, sy - 8, sx + 8, sy - 3); ctx.stroke();
        circlePath(ctx, sx + 6, sy - 2, 2.4); ctx.fillStyle = '#fff'; ctx.fill();
        circlePath(ctx, sx + 6.5, sy - 2, 1.3); ctx.fillStyle = INK; ctx.fill();
        circlePath(ctx, sx + 12, sy, 2.4); ctx.fillStyle = '#fff'; ctx.fill();
        circlePath(ctx, sx + 12.5, sy, 1.3); ctx.fillStyle = INK; ctx.fill();
      } else {
        // colour bars test card
        const bars = ['#f2f2f2', '#f6e04b', '#55d6e6', '#5bd65b', '#e35be3', '#e84a4a', '#4a5ee8'];
        const bw = sw / bars.length;
        bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(sx - sw / 2 + i * bw, sy - sh / 2, bw + 1, sh * 0.68); });
        ctx.fillStyle = '#20232a'; ctx.fillRect(sx - sw / 2, sy + sh * 0.18, sw, sh);
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(sx - 30, sy + sh * 0.24, 22, 14);
        circlePath(ctx, sx, sy - 4, 15); ctx.fillStyle = 'rgba(30,30,30,0.85)'; ctx.fill();
        text(ctx, 'ON AIR', sx, sy - 4, 8, '#ff5a4a');
      }
      // scanlines + vignette + glare
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = sy - sh / 2; y < sy + sh / 2; y += 4) ctx.fillRect(sx - sw / 2, y, sw, 1.6);
      ctx.fillStyle = rgrad(ctx, sx, sy, sw * 0.3, sw * 0.62, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,10,20,0.5)']]);
      ctx.fillRect(sx - sw / 2, sy - sh / 2, sw, sh);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(sx - 46, sy - 40); ctx.lineTo(sx - 10, sy - 40); ctx.lineTo(sx - 40, sy + 10); ctx.lineTo(sx - 52, sy + 4); ctx.closePath(); ctx.fill();
      ctx.restore();
      rrc(ctx, sx, sy, sw, sh, 22); strokeOnly(ctx, 3.5);
      gloss(ctx, sx - 40, sy - 34, 22, 5, 0.5);
      // control panel
      rrc(ctx, 61, 11, 34, 100, 8); fillStroke(ctx, '#e6dac0', 3);
      for (const [ky, kc] of [[-22, '#3a3d42'], [6, '#3a3d42']]) {
        toonCircle(ctx, 61, ky, 10, kc, { lw: 3 });
        ctx.beginPath(); ctx.moveTo(61, ky); ctx.lineTo(61 + 6, ky - 6); ctx.lineWidth = 2.4; ctx.strokeStyle = '#f2f2f2'; ctx.stroke();
      }
      ctx.strokeStyle = rgba(INK, 0.55); ctx.lineWidth = 2;
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(51, 30 + k * 6); ctx.lineTo(71, 30 + k * 6); ctx.stroke(); }
      circlePath(ctx, 61, 56, 3); ctx.fillStyle = '#ff5a4a'; ctx.fill();
    },
  },

  lamp: {
    draw(ctx, o) {
      const shade = pick(['#f2c14e', '#ef8a6f', '#83c3ae', '#f3e6cf'], o.v);
      // warm glow under the shade
      ctx.fillStyle = rgrad(ctx, 0, -80, 0, 110, [[0, 'rgba(255,214,120,0.45)'], [0.5, 'rgba(255,200,100,0.15)'], [1, 'rgba(255,200,100,0)']]);
      ctx.beginPath(); ctx.moveTo(-50, -95); ctx.lineTo(50, -95); ctx.lineTo(110, 30); ctx.lineTo(-110, 30); ctx.closePath(); ctx.fill();
      // base
      ctx.beginPath(); ctx.moveTo(-40, 160); ctx.lineTo(-36, 148); ctx.quadraticCurveTo(0, 136, 36, 148); ctx.lineTo(40, 160); ctx.closePath();
      ctx.fillStyle = hgrad(ctx, -40, 40, [[0, '#b8862f'], [0.35, '#f7d77a'], [0.6, '#d9a441'], [1, '#9a6c22']]); ctx.fill(); strokeOnly(ctx);
      // pole
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(0, 146);
      ctx.lineWidth = 12 + LW * 1.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 12; ctx.strokeStyle = hgrad(ctx, -6, 6, [[0, '#b8862f'], [0.4, '#ffe39a'], [1, '#a8781f']]); ctx.stroke();
      for (const ky of [-10, 70]) { rrc(ctx, 0, ky, 22, 10, 5); fillStroke(ctx, '#e0ad4a', 3); }
      // bulb peeking out
      ctx.beginPath(); ctx.arc(0, -96, 15, 0, Math.PI); ctx.fillStyle = '#fff6cf'; ctx.fill(); strokeOnly(ctx, 2.5);
      // pull chain
      ctx.strokeStyle = '#c9a046'; ctx.lineWidth = 2; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(24, -95); ctx.lineTo(24, -66); ctx.stroke(); ctx.setLineDash([]);
      circlePath(ctx, 24, -63, 3.5); fillStroke(ctx, '#e0ad4a', 2);
      // shade
      const pts = [[-34, -160], [34, -160], [55, -95], [-55, -95]];
      polyPath(ctx, pts); ctx.fillStyle = shade; ctx.fill();
      ctx.save(); polyPath(ctx, pts); ctx.clip();
      // pleats
      ctx.strokeStyle = rgba(darken(shade, 0.5), 0.25); ctx.lineWidth = 2;
      for (let k = -6; k <= 6; k++) { ctx.beginPath(); ctx.moveTo(k * 5.6, -160); ctx.lineTo(k * 9, -95); ctx.stroke(); }
      // lit from within
      ctx.fillStyle = rgrad(ctx, 0, -110, 4, 60, [[0, 'rgba(255,250,220,0.5)'], [1, 'rgba(255,250,220,0)']]); ctx.fillRect(-60, -165, 120, 75);
      ctx.fillStyle = rgba(darken(shade, 0.5), 0.2); ctx.fillRect(-60, -160, 14, 70);
      ctx.restore();
      polyPath(ctx, pts); strokeOnly(ctx);
      // trims
      rrc(ctx, 0, -158, 70, 8, 3); fillStroke(ctx, darken(shade, 0.25), 3);
      // scalloped fringe
      ctx.beginPath(); ctx.moveTo(-56, -97);
      for (let k = 0; k < 10; k++) { const x0 = -56 + k * 11.2; ctx.quadraticCurveTo(x0 + 5.6, -86, x0 + 11.2, -97); }
      ctx.closePath(); fillStroke(ctx, darken(shade, 0.25), 3);
      gloss(ctx, -26, -152, 6, 44, 0.35);
    },
  },

  bookshelf: {
    draw(ctx, o) {
      const wood = pick(['#a8673a', '#8e5b3a', '#c18850'], o.v);
      const r = rng((o.v || 0) * 31 + 7);
      toonBox(ctx, 0, 0, 190, 320, 4, wood, { shade: 0.15 });
      woodGrain(ctx, -93, -158, 186, 316, wood, 77);
      const comps = [[-146, -84], [-76, -14], [-6, 56], [64, 126]];
      const back = darken(wood, 0.5);
      comps.forEach(([y0, y1], ci) => {
        rrPath(ctx, -80, y0, 160, y1 - y0, 2); ctx.fillStyle = back; ctx.fill();
        ctx.save(); rrPath(ctx, -80, y0, 160, y1 - y0, 2); ctx.clip();
        // back boards
        ctx.strokeStyle = rgba('#000000', 0.15); ctx.lineWidth = 2;
        for (let x = -80; x < 80; x += 32) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
        // contents
        let x = -76;
        const hc = y1 - y0;
        const deco = (ci + (o.v || 0)) % 4;
        const decoAt = r() < 0.5 ? 'left' : 'right';
        const drawDeco = (dx) => {
          if (deco === 0) { // succulent pot
            ctx.fillStyle = '#6cae5a';
            for (let k = -2; k <= 2; k++) { ellipsePath(ctx, dx + k * 5, y1 - 26 - Math.abs(k) * -2, 4, 10, k * 0.4); fillStroke(ctx, k % 2 ? '#7cc06a' : '#5a9a4a', 2); }
            ctx.beginPath(); ctx.moveTo(dx - 13, y1 - 20); ctx.lineTo(dx + 13, y1 - 20); ctx.lineTo(dx + 10, y1); ctx.lineTo(dx - 10, y1); ctx.closePath(); fillStroke(ctx, '#e07c55', 2.5);
          } else if (deco === 1) { // framed photo
            rrc(ctx, dx, y1 - 22, 30, 38, 2); fillStroke(ctx, '#e6b65a', 2.5);
            rrc(ctx, dx, y1 - 22, 20, 28, 1); ctx.fillStyle = '#9fd3f0'; ctx.fill();
            ctx.lineCap = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#d9573b';
            ctx.beginPath(); ctx.moveTo(dx - 6, y1 - 20); ctx.quadraticCurveTo(dx, y1 - 26, dx + 6, y1 - 20); ctx.stroke();
          } else if (deco === 2) { // trophy
            ctx.beginPath(); ctx.moveTo(dx - 11, y1 - 40); ctx.lineTo(dx + 11, y1 - 40); ctx.quadraticCurveTo(dx + 11, y1 - 22, dx, y1 - 20); ctx.quadraticCurveTo(dx - 11, y1 - 22, dx - 11, y1 - 40); ctx.closePath();
            fillStroke(ctx, '#f2c14e', 2.5);
            rrc(ctx, dx, y1 - 14, 6, 10, 1); fillStroke(ctx, '#e0ad4a', 2);
            rrc(ctx, dx, y1 - 4, 20, 8, 2); fillStroke(ctx, '#6b4a2a', 2);
            sparkle(ctx, dx - 4, y1 - 33, 4, '#fff');
          } else { // vase
            ctx.beginPath(); ctx.moveTo(dx - 5, y1 - 40); ctx.lineTo(dx + 5, y1 - 40); ctx.quadraticCurveTo(dx + 4, y1 - 30, dx + 11, y1 - 18); ctx.quadraticCurveTo(dx + 12, y1, dx, y1); ctx.quadraticCurveTo(dx - 12, y1, dx - 11, y1 - 18); ctx.quadraticCurveTo(dx - 4, y1 - 30, dx - 5, y1 - 40); ctx.closePath();
            fillStroke(ctx, '#5fb3c9', 2.5);
            ctx.fillStyle = rgba('#ffffff', 0.35); ctx.fillRect(dx - 7, y1 - 20, 3, 12);
          }
        };
        if (decoAt === 'left') { drawDeco(-62); x = -44; }
        const xEnd = decoAt === 'right' ? 42 : 76;
        let leaned = false;
        while (x < xEnd - 8) {
          const bw = 9 + Math.floor(r() * 8);
          const bh = hc * (0.62 + r() * 0.3);
          const c = BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)];
          if (!leaned && r() < 0.18 && x > -60 && x < xEnd - 30) {
            // a leaning book
            ctx.save(); ctx.translate(x, y1); ctx.rotate(0.32);
            rrPath(ctx, 0, -bh, bw, bh, 2); fillStroke(ctx, c, 2.5);
            ctx.fillStyle = rgba('#fff3c2', 0.7); ctx.fillRect(2, -bh + 6, bw - 4, 3);
            ctx.restore();
            x += bh * Math.sin(0.32) + bw * 0.9;
            leaned = true;
            continue;
          }
          if (x + bw > xEnd) break;
          rrPath(ctx, x, y1 - bh, bw, bh, 2); fillStroke(ctx, c, 2.5);
          ctx.fillStyle = rgba(lighten(c, 0.7), 0.55);
          ctx.fillRect(x + 2, y1 - bh + 6, bw - 4, 3); ctx.fillRect(x + 2, y1 - 10, bw - 4, 3);
          if (bw > 12) { ctx.fillStyle = rgba(darken(c, 0.5), 0.4); ctx.fillRect(x + 3, y1 - bh * 0.6, bw - 6, bh * 0.18); }
          x += bw + 1;
        }
        if (decoAt === 'right') drawDeco(62);
        // shelf shadow
        ctx.fillStyle = vgrad(ctx, y0, y0 + 14, [[0, 'rgba(20,8,0,0.45)'], [1, 'rgba(20,8,0,0)']]); ctx.fillRect(-80, y0, 160, 14);
        ctx.restore();
        rrPath(ctx, -80, y0, 160, y1 - y0, 2); strokeOnly(ctx, 3);
      });
      // shelf board highlights
      for (const y of [-84, -14, 56, 126]) { ctx.fillStyle = rgba(lighten(wood, 0.6), 0.35); ctx.fillRect(-80, y + 1, 160, 2.5); }
      // crown + plinth
      toonBox(ctx, 0, -153, 190, 14, 4, lighten(wood, 0.08));
      toonBox(ctx, 0, 146, 176, 22, 3, darken(wood, 0.12));
      rrc(ctx, 0, 144, 40, 7, 3); fillStroke(ctx, '#e0ad4a', 2);
    },
  },

  cat: {
    draw(ctx, o, t) {
      const pal = pick([
        { fur: '#f2a65a', stripe: '#c46a2a', belly: '#ffe2bf' },
        { fur: '#9aa3ad', stripe: '#6b737d', belly: '#e9edf1' },
        { fur: '#3f3b44', stripe: '#2a2730', belly: '#f2f0ee' },
        { fur: '#f7f1e8', stripe: '#e39446', belly: '#ffffff', calico: true },
      ], o.v);
      const breath = Math.sin(t * 2.3);
      ctx.save();
      // breathing: gentle squash anchored at the floor line
      ctx.translate(0, 32); ctx.scale(1 - breath * 0.012, 1 + breath * 0.035); ctx.translate(0, -32);
      // body loaf (= hazard box)
      rrc(ctx, 0, 6, 120, 52, 24);
      ctx.fillStyle = pal.fur; ctx.fill();
      ctx.save(); rrc(ctx, 0, 6, 120, 52, 24); ctx.clip();
      ctx.fillStyle = rgba(pal.belly, 0.9); ellipsePath(ctx, -6, 34, 52, 14); ctx.fill();
      if (pal.calico) {
        ctx.fillStyle = '#e39446'; ellipsePath(ctx, -30, -10, 26, 16, 0.3); ctx.fill();
        ctx.fillStyle = '#3f3b44'; ellipsePath(ctx, 6, -14, 18, 10, -0.2); ctx.fill();
      } else {
        ctx.strokeStyle = pal.stripe; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (const sx of [-40, -26, -12, 2]) { ctx.beginPath(); ctx.moveTo(sx - 4, -22); ctx.quadraticCurveTo(sx + 4, -10, sx - 2, 2); ctx.stroke(); }
      }
      ctx.fillStyle = rgba('#000000', 0.12); ctx.fillRect(-70, 20, 140, 20);
      ctx.restore();
      rrc(ctx, 0, 6, 120, 52, 24); strokeOnly(ctx);
      // tail wrapped along the front, tip swishing
      const sw = Math.sin(t * 2.6) * 0.5 + Math.sin(t * 5.1) * 0.15;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-54, 14);
      ctx.quadraticCurveTo(-50, 26, -24, 24);
      const tx = -4, ty = 22;
      ctx.quadraticCurveTo(tx - 8, ty + 2, tx, ty);
      ctx.quadraticCurveTo(tx + 10 + sw * 4, ty - 4 - sw * 6, tx + 14 + sw * 2, ty - 12 - sw * 8);
      ctx.lineWidth = 13 + LW * 1.6; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 13; ctx.strokeStyle = pal.fur; ctx.stroke();
      // tail tip
      circlePath(ctx, tx + 14 + sw * 2, ty - 12 - sw * 8, 5); ctx.fillStyle = pal.calico ? '#3f3b44' : pal.stripe; ctx.fill();
      // head resting on the paws
      const hx = 34, hy = 4;
      // ears
      for (const [ex, dir] of [[hx - 14, -1], [hx + 12, 1]]) {
        ctx.beginPath(); ctx.moveTo(ex - 10, hy - 14); ctx.lineTo(ex + dir * 3, hy - 34); ctx.lineTo(ex + 10, hy - 16); ctx.closePath();
        fillStroke(ctx, pal.calico && dir < 0 ? '#e39446' : pal.fur, 3.5);
        ctx.beginPath(); ctx.moveTo(ex - 5, hy - 16); ctx.lineTo(ex + dir * 2.5, hy - 28); ctx.lineTo(ex + 5, hy - 17); ctx.closePath();
        ctx.fillStyle = '#f7a8b8'; ctx.fill();
      }
      ellipsePath(ctx, hx, hy, 26, 21); ctx.fillStyle = pal.fur; ctx.fill();
      ctx.save(); ellipsePath(ctx, hx, hy, 26, 21); ctx.clip();
      ctx.fillStyle = pal.belly; ellipsePath(ctx, hx + 2, hy + 12, 16, 11); ctx.fill();
      if (!pal.calico) {
        ctx.strokeStyle = pal.stripe; ctx.lineWidth = 3.5;
        for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(hx + dx, hy - 21); ctx.lineTo(hx + dx * 0.8, hy - 13); ctx.stroke(); }
      }
      ctx.restore();
      ellipsePath(ctx, hx, hy, 26, 21); strokeOnly(ctx);
      // face: sleepy eyes (one peeks open now and then — danger!)
      const cyc = (t + (o.v || 0) * 1.7) % 5.5;
      const peek = cyc > 4.1 && cyc < 4.9;
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(hx - 10, hy - 1, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      if (peek) {
        ellipsePath(ctx, hx + 11, hy - 1, 5.5, 4); fillStroke(ctx, '#ffd23f', 2.2);
        ellipsePath(ctx, hx + 11, hy - 1, 1.2, 3.4); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx + 4, hy - 8); ctx.lineTo(hx + 17, hy - 6); ctx.lineWidth = 2.4; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(hx + 11, hy - 1, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(hx - 2, hy + 6); ctx.lineTo(hx + 4, hy + 6); ctx.lineTo(hx + 1, hy + 9); ctx.closePath(); ctx.fillStyle = '#f07b93'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx + 1, hy + 9); ctx.quadraticCurveTo(hx - 2, hy + 13, hx - 5, hy + 11); ctx.moveTo(hx + 1, hy + 9); ctx.quadraticCurveTo(hx + 4, hy + 13, hx + 7, hy + 11);
      ctx.lineWidth = 2; ctx.stroke();
      // tiny fang (it's a hazard after all)
      ctx.beginPath(); ctx.moveTo(hx + 4, hy + 11.5); ctx.lineTo(hx + 5.5, hy + 15); ctx.lineTo(hx + 6.5, hy + 11.2); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = rgba(INK, 0.55); ctx.lineWidth = 1.4;
      for (const [s, dy] of [[1, -1], [1, 3], [-1, -1], [-1, 3]]) {
        ctx.beginPath(); ctx.moveTo(hx + s * 12, hy + 7 + dy * 0.6); ctx.lineTo(hx + s * 30, hy + 4 + dy * 1.6); ctx.stroke();
      }
      ctx.fillStyle = rgba('#ff7a8a', 0.35); ellipsePath(ctx, hx - 15, hy + 6, 5, 3); ctx.fill(); ellipsePath(ctx, hx + 17, hy + 6, 5, 3); ctx.fill();
      // front paws with claws peeking
      for (const px of [hx - 10, hx + 10]) {
        ellipsePath(ctx, px, 24, 10, 6); fillStroke(ctx, pal.calico ? '#ffffff' : lighten(pal.fur, 0.25), 3);
        ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(px - 3, 21); ctx.lineTo(px - 3, 26); ctx.moveTo(px + 3, 21); ctx.lineTo(px + 3, 26); ctx.stroke();
      }
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      for (const cx of [hx - 4, hx + 1, hx + 16, hx + 21]) {
        ctx.beginPath(); ctx.moveTo(cx - 1.5, 29); ctx.lineTo(cx, 33); ctx.lineTo(cx + 1.5, 29); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      // Zzz
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1;
        const a = Math.sin(ph * Math.PI);
        ctx.save(); ctx.globalAlpha = a * 0.95;
        text(ctx, 'z', hx + 14 + ph * 34 + Math.sin(ph * 7) * 3, hy - 26 - ph * 30, 11 + ph * 12, '#cfe6ff', { stroke: 4.5, ink: INK });
        ctx.restore();
      }
    },
  },

  fishbowl: {
    draw(ctx, o, t) {
      // glass back + interior
      const bowl = () => {
        ctx.beginPath();
        ctx.moveTo(-50, -40);
        ctx.quadraticCurveTo(-60, 6, -59, 46);
        ctx.quadraticCurveTo(-58, 55, -48, 55);
        ctx.lineTo(48, 55);
        ctx.quadraticCurveTo(58, 55, 59, 46);
        ctx.quadraticCurveTo(60, 6, 50, -40);
        ctx.closePath();
      };
      bowl(); ctx.fillStyle = 'rgba(205,236,248,0.45)'; ctx.fill();
      // water
      ctx.save(); bowl(); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -22, 50, [[0, 'rgba(104,196,236,0.85)'], [1, 'rgba(40,128,196,0.9)']]);
      ctx.beginPath(); ctx.moveTo(-70, 60);
      for (let x = -70; x <= 70; x += 7) ctx.lineTo(x, -21 + Math.sin(x * 0.11 + t * 3) * 1.6);
      ctx.lineTo(70, 60); ctx.closePath(); ctx.fill();
      // light caustics
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-40 + k * 30, -10); ctx.quadraticCurveTo(-30 + k * 30 + Math.sin(t * 2 + k) * 6, 10, -36 + k * 30, 30); ctx.stroke(); }
      // gravel
      const r = rng(5);
      for (let i = 0; i < 26; i++) {
        const gx = -52 + (i % 13) * 8.6 + r() * 3, gy = 47 - Math.floor(i / 13) * 5 - r() * 2;
        ellipsePath(ctx, gx, gy, 5, 3.6); fillStroke(ctx, pick(['#f2a65a', '#e57fb0', '#7cc8f0', '#f7e27a', '#ffffff'], i), 1.4);
      }
      // swaying weed
      for (const [wx, wh, ph] of [[-34, 46, 0], [-26, 34, 1.4], [34, 40, 2.2]]) {
        ctx.beginPath(); ctx.moveTo(wx, 44);
        for (let k = 1; k <= 6; k++) ctx.lineTo(wx + Math.sin(t * 1.8 + ph + k * 0.8) * (k * 0.9), 44 - k * wh / 6);
        ctx.lineWidth = 6; ctx.strokeStyle = '#3e9a4a'; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#7fd36a'; ctx.stroke();
      }
      // tiny castle
      ctx.fillStyle = '#c7b6d9'; ctx.strokeStyle = rgba(INK, 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, 44); ctx.lineTo(8, 24); ctx.lineTo(12, 24); ctx.lineTo(12, 28); ctx.lineTo(16, 28); ctx.lineTo(16, 24); ctx.lineTo(20, 24); ctx.lineTo(20, 28); ctx.lineTo(24, 28); ctx.lineTo(24, 24); ctx.lineTo(28, 24); ctx.lineTo(28, 44); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(18, 44, 4, Math.PI, 0); ctx.fillStyle = '#4a3a5a'; ctx.fill();
      // bubbles
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.55 + i * 0.27) % 1;
        const bx = 22 + Math.sin(t * 3 + i * 2) * 3 + (i % 2) * 6, by = 22 - ph * 40;
        circlePath(ctx, bx, by, 2 + ph * 2); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
      }
      // goldfish
      const sp = 0.8;
      const fxp = Math.sin(t * sp + (o.v || 0)) * 24;
      const dir = Math.cos(t * sp + (o.v || 0)) >= 0 ? 1 : -1;
      const fy = 8 + Math.sin(t * 1.7) * 6;
      ctx.save(); ctx.translate(fxp, fy); ctx.scale(dir, 1);
      const wag = Math.sin(t * 12) * 0.35;
      ctx.save(); ctx.translate(-12, 0); ctx.rotate(wag);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-10, -12, -16, -9); ctx.quadraticCurveTo(-10, 0, -16, 9); ctx.quadraticCurveTo(-10, 12, 0, 0); ctx.closePath();
      fillStroke(ctx, '#ffb347', 2.5);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-2, -8); ctx.quadraticCurveTo(2, -16, 8, -9); ctx.closePath(); fillStroke(ctx, '#ffb347', 2.2);
      ellipsePath(ctx, 0, 0, 15, 10); fillStroke(ctx, '#ff8a1f', 3);
      ctx.save(); ellipsePath(ctx, 0, 0, 15, 10); ctx.clip();
      ctx.fillStyle = 'rgba(255,240,180,0.6)'; ellipsePath(ctx, 1, 5, 11, 4); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-2, 2); ctx.quadraticCurveTo(-6, 9, 2, 8); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
      circlePath(ctx, 7, -2, 3.2); ctx.fillStyle = '#fff'; ctx.fill();
      circlePath(ctx, 7.8, -2, 1.8); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.arc(13, 3, 2, 0.2, Math.PI * 0.9); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      ctx.restore();
      // water surface sheen + back rim
      ellipsePath(ctx, 0, -21, 47, 4); ctx.fillStyle = 'rgba(200,240,255,0.55)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -40, 51, 6, 0, Math.PI, TAU); ctx.lineWidth = 7 + LW; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#dff4fb'; ctx.stroke();
    },
    front(ctx, o, t) {
      const bowl = () => {
        ctx.beginPath();
        ctx.moveTo(-50, -40);
        ctx.quadraticCurveTo(-60, 6, -59, 46);
        ctx.quadraticCurveTo(-58, 55, -48, 55);
        ctx.lineTo(48, 55);
        ctx.quadraticCurveTo(58, 55, 59, 46);
        ctx.quadraticCurveTo(60, 6, 50, -40);
      };
      // front water tint (over the sausage)
      ctx.save(); bowl(); ctx.closePath(); ctx.clip();
      ctx.fillStyle = 'rgba(80,170,225,0.28)';
      ctx.beginPath(); ctx.moveTo(-70, 60);
      for (let x = -70; x <= 70; x += 7) ctx.lineTo(x, -19 + Math.sin(x * 0.11 + t * 3 + 1) * 1.6);
      ctx.lineTo(70, 60); ctx.closePath(); ctx.fill();
      ctx.restore();
      // glass outline
      bowl(); strokeOnly(ctx, LW);
      // glass gloss
      ctx.beginPath(); ctx.moveTo(-42, -26); ctx.quadraticCurveTo(-50, 8, -46, 40);
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-34, -28); ctx.quadraticCurveTo(-38, -16, -37, -6);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(46, 10); ctx.quadraticCurveTo(48, 28, 46, 42);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
      // front rim lip
      ctx.beginPath(); ctx.ellipse(0, -40, 51, 6, 0, 0, Math.PI); ctx.lineWidth = 7 + LW; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#e9f8fd'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -40, 51, 6, 0, 0.4, 1.2); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      sparkle(ctx, -36, -32, 5, '#ffffff', 0.9);
    },
  },

  clock: {
    draw(ctx, o, t) {
      // ----- face (counter-rotated so it stays upright)
      const m = motionAt(o.move, t, {});
      const A = (o.a || 0) + m.da;
      ctx.save();
      if (o.flip) { ctx.rotate(A); ctx.scale(-1, 1); } else ctx.rotate(-A);
      const R = 92;
      // pendulum-less wall clock: wooden rim
      circlePath(ctx, 0, 0, R); ctx.fillStyle = hgrad(ctx, -R, R, [[0, '#8a4f2a'], [0.5, '#c27c45'], [1, '#7a4424']]); ctx.fill(); strokeOnly(ctx);
      circlePath(ctx, 0, 0, R - 12); ctx.fillStyle = rgrad(ctx, -20, -24, 10, R, [[0, '#fffaf0'], [1, '#f1e4c8']]); ctx.fill(); strokeOnly(ctx, 3);
      // ticks
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * TAU, big = i % 5 === 0;
        const r0 = R - 18, r1 = big ? R - 27 : R - 22;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineWidth = big ? 3.4 : 1.4; ctx.strokeStyle = big ? INK : rgba(INK, 0.5); ctx.stroke();
      }
      const rev = mirrored(ctx); // a mirrored clock keeps 3 on the right
      for (const [n, a0] of [['12', -Math.PI / 2], ['3', 0], ['6', Math.PI / 2], ['9', Math.PI]]) {
        const a = rev ? Math.PI - a0 : a0;
        text(ctx, n, Math.cos(a) * (R - 40), Math.sin(a) * (R - 40) + 1, 18, '#3a2216');
      }
      text(ctx, 'TICK·TOCK', 0, 26, 8, rgba(INK, 0.55), { font: 'Fredoka, sans-serif', weight: 700 });
      // decorative hour hand (slowly creeps)
      const ha = -Math.PI / 2 + 1.9 + t * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-Math.cos(ha) * 8, -Math.sin(ha) * 8); ctx.lineTo(Math.cos(ha) * 44, Math.sin(ha) * 44);
      ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#5a4a3a'; ctx.stroke();
      gloss(ctx, -60, -40, 10, 30, 0.35);
      ctx.restore();
      // ----- the minute hand (collision bar, rotates with the body)
      const hand = '#2f3746';
      rrc(ctx, 60, 0, 240, 22, 10);
      ctx.fillStyle = vgrad(ctx, -11, 11, [[0, '#4a5568'], [0.5, hand], [1, '#1f2530']]); ctx.fill();
      strokeOnly(ctx);
      // brass inlay + spade tip ornament
      ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(132, 0); ctx.lineWidth = 3; ctx.strokeStyle = '#e8b84a'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(140, 0); ctx.lineTo(156, -6); ctx.lineTo(174, 0); ctx.lineTo(156, 6); ctx.closePath(); fillStroke(ctx, '#e8b84a', 2);
      circlePath(ctx, -44, 0, 6); fillStroke(ctx, '#e8b84a', 2);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; rrc(ctx, 60, -6, 224, 3, 1.5); ctx.fill();
      // hub
      toonCircle(ctx, 0, 0, 12, '#e8b84a', { lw: 3 });
      circlePath(ctx, 0, 0, 3); ctx.fillStyle = INK; ctx.fill();
    },
  },

  piano: {
    draw(ctx, o) {
      const black = (o.v || 0) % 2 === 0;
      const body = black ? '#2c2422' : '#8a4630';
      toonBox(ctx, 0, 0, 230, 190, 6, body, { hi: 0.15, shade: 0.25 });
      if (!black) woodGrain(ctx, -112, -92, 224, 184, body, 9);
      // lid
      rrc(ctx, 0, -88, 230, 14, 5); fillStroke(ctx, lighten(body, 0.1), 3.5);
      gloss(ctx, -100, -92, 120, 3, 0.35);
      // upper panel with music rack
      rrc(ctx, 0, -50, 200, 52, 8); fillStroke(ctx, lighten(body, 0.06), 3);
      rrc(ctx, 0, -50, 186, 40, 6); strokeOnly(ctx, 2, rgba('#e8b84a', 0.6));
      // sheet music
      ctx.save(); ctx.translate(0, -50); ctx.rotate(-0.03);
      rrc(ctx, -20, 0, 44, 34, 2); fillStroke(ctx, '#fffaf0', 2.5);
      rrc(ctx, 22, 0, 44, 34, 2); fillStroke(ctx, '#fffaf0', 2.5);
      ctx.strokeStyle = rgba(INK, 0.45); ctx.lineWidth = 1;
      for (const sx of [-20, 22]) for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(sx - 18, -9 + k * 4); ctx.lineTo(sx + 18, -9 + k * 4); ctx.stroke(); }
      ctx.fillStyle = INK;
      for (const [nx, ny] of [[-30, -3], [-22, -7], [-12, -1], [12, -5], [22, 1], [32, -9]]) {
        ellipsePath(ctx, nx, ny, 2.4, 1.8, -0.4); ctx.fill();
        ctx.fillRect(nx + 1.6, ny - 10, 1.2, 10);
      }
      ctx.restore();
      rrc(ctx, 0, -28, 110, 6, 2); fillStroke(ctx, darken(body, 0.2), 2.5);
      // fallboard with brand
      rrc(ctx, 0, -12, 220, 16, 4); fillStroke(ctx, lighten(body, 0.04), 3);
      text(ctx, 'SIZZLEWAY', 0, -12, 10, '#f0c75a');
      // keys
      const kx0 = -104, kw = 208, n = 22, w1 = kw / n, ky0 = -4, kh = 26;
      rrPath(ctx, kx0, ky0, kw, kh, 3); fillStroke(ctx, '#fbf7ee', 3);
      ctx.save(); rrPath(ctx, kx0, ky0, kw, kh, 3); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(kx0, ky0 + kh - 5, kw, 5);
      ctx.strokeStyle = rgba(INK, 0.55); ctx.lineWidth = 1.4;
      for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(kx0 + i * w1, ky0); ctx.lineTo(kx0 + i * w1, ky0 + kh); ctx.stroke(); }
      ctx.fillStyle = '#1d1716';
      for (let i = 0; i < n - 1; i++) {
        const m7 = i % 7;
        if (m7 === 2 || m7 === 6) continue;
        rrPath(ctx, kx0 + (i + 1) * w1 - 3, ky0 - 2, 6, 16, 1.5); ctx.fill();
      }
      ctx.restore();
      // cheeks
      for (const s of [-1, 1]) { rrc(ctx, s * 109, 6, 12, 36, 4); fillStroke(ctx, lighten(body, 0.08), 3); }
      rrc(ctx, 0, 26, 222, 10, 3); fillStroke(ctx, darken(body, 0.1), 3);
      // lower panels
      for (const s of [-1, 1]) {
        rrc(ctx, s * 52, 56, 90, 40, 6); strokeOnly(ctx, 2.5, rgba(lighten(body, 0.5), 0.35));
        rrc(ctx, s * 52, 56, 74, 26, 4); strokeOnly(ctx, 1.6, rgba('#e8b84a', 0.45));
      }
      // pedals & toe blocks
      for (const px of [-16, 0, 16]) { rrc(ctx, px, 84, 10, 7, 2); fillStroke(ctx, '#e8b84a', 2); }
      for (const s of [-1, 1]) { rrc(ctx, s * 100, 86, 30, 18, 4); fillStroke(ctx, darken(body, 0.15), 3); }
      gloss(ctx, -100, -66, 5, 36, black ? 0.25 : 0.2);
      gloss(ctx, 92, 40, 4, 40, black ? 0.2 : 0.15);
    },
  },

  globe: {
    draw(ctx, o) {
      // stand
      ctx.beginPath(); ctx.moveTo(-35, 67); ctx.lineTo(-30, 55); ctx.quadraticCurveTo(0, 48, 30, 55); ctx.lineTo(35, 67); ctx.closePath();
      fillStroke(ctx, '#7a4a2a');
      ctx.fillStyle = rgba('#ffffff', 0.25); ctx.fillRect(-26, 55, 52, 3);
      rod(ctx, 0, 22, 0, 54, 10, '#e0ad4a');
      // meridian ring (back half)
      const tilt = 0.4;
      ctx.save(); ctx.translate(0, -20); ctx.rotate(tilt);
      ctx.beginPath(); ctx.arc(0, 0, 52, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineWidth = 6 + LW * 1.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#d9a441'; ctx.stroke();
      ctx.restore();
      // sphere
      circlePath(ctx, 0, -20, 46); ctx.fillStyle = vgrad(ctx, -66, 26, [[0, '#6cc6f2'], [1, '#2f86c9']]); ctx.fill();
      ctx.save(); circlePath(ctx, 0, -20, 46); ctx.clip();
      ctx.translate(0, -20); ctx.rotate(tilt);
      // latitude lines
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5;
      for (const ly of [-30, -15, 0, 15, 30]) { ctx.beginPath(); ctx.ellipse(0, ly, Math.sqrt(46 * 46 - ly * ly), 4, 0, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 46, 0, 0, TAU); ctx.stroke();
      // continents
      const land = (pts, c) => { smoothPath(ctx, pts, true, 0.7); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba('#2f6a2a', 0.6); ctx.stroke(); };
      land([[-34, -30], [-14, -36], [-8, -24], [-18, -14], [-14, -4], [-24, 0], [-30, -12], [-40, -18]], '#8fd16a');
      land([[-18, 4], [-6, 6], [-4, 18], [-12, 34], [-18, 28], [-22, 14]], '#a8dc6e');
      land([[6, -32], [24, -36], [40, -26], [34, -16], [20, -14], [8, -20]], '#f2c96a');
      land([[10, -10], [24, -8], [28, 6], [18, 24], [10, 12], [6, 0]], '#8fd16a');
      land([[28, 18], [40, 14], [42, 26], [32, 30]], '#f2c96a');
      ctx.restore();
      // shade + gloss
      ctx.save(); circlePath(ctx, 0, -20, 46); ctx.clip();
      ctx.beginPath(); ctx.arc(0, -20, 48, 0, TAU); ctx.arc(-10, -30, 46, 0, TAU, true); ctx.fillStyle = 'rgba(10,30,60,0.28)'; ctx.fill('evenodd');
      ctx.restore();
      ellipsePath(ctx, -18, -42, 12, 7, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      circlePath(ctx, 0, -20, 46); strokeOnly(ctx);
      // meridian ring (front half) + pivots
      ctx.save(); ctx.translate(0, -20); ctx.rotate(tilt);
      ctx.beginPath(); ctx.arc(0, 0, 52, -Math.PI / 2, Math.PI / 2);
      ctx.lineWidth = 6 + LW * 1.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#e8b84a'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,240,190,0.8)'; ctx.beginPath(); ctx.arc(0, 0, 52, -1.2, -0.3); ctx.stroke();
      toonCircle(ctx, 0, -52, 4.5, '#e8b84a', { lw: 2.5, spec: false });
      toonCircle(ctx, 0, 52, 4.5, '#e8b84a', { lw: 2.5, spec: false });
      ctx.restore();
    },
  },

  plant: {
    draw(ctx, o) {
      const v = o.v || 0;
      const pot = pick(['#d9774b', '#f1ede6', '#4aa3a2', '#e8b04a'], v);
      // foliage (decorative, above the pot)
      if (v % 2 === 0) {
        // monstera
        const leaves = [[-0.85, 44, 44, '#4a9a46'], [0.88, 40, 44, '#4a9a46'], [-0.32, 52, 46, '#55a84e'], [0.36, 50, 46, '#5cb052'], [0.02, 36, 40, '#6cc25e']];
        const stemEnd = (a, len) => [Math.sin(a) * len, 12 - Math.cos(a) * len];
        for (const [a, len] of leaves) {
          const [ex, ey] = stemEnd(a, len);
          ctx.beginPath(); ctx.moveTo(0, 14); ctx.quadraticCurveTo(ex * 0.15, ey * 0.5 + 8, ex, ey);
          ctx.lineWidth = 4 + LW * 1.4; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
          ctx.lineWidth = 4; ctx.strokeStyle = '#4f8f3a'; ctx.stroke();
        }
        for (const [a, len, L, col] of leaves) {
          const [ex, ey] = stemEnd(a, len);
          const W = L * 0.56;
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(a * 0.75);
          const leafPath = () => {
            ctx.beginPath();
            ctx.moveTo(0, -0.1 * L);
            ctx.quadraticCurveTo(0.25 * W, 0.1 * L, 0.6 * W, 0.04 * L);
            ctx.quadraticCurveTo(1.0 * W, -0.05 * L, 1.0 * W, -0.3 * L);
            ctx.lineTo(0.34 * W, -0.36 * L);
            ctx.lineTo(0.98 * W, -0.46 * L);
            ctx.quadraticCurveTo(0.95 * W, -0.58 * L, 0.82 * W, -0.64 * L);
            ctx.lineTo(0.3 * W, -0.67 * L);
            ctx.lineTo(0.66 * W, -0.8 * L);
            ctx.quadraticCurveTo(0.42 * W, -0.98 * L, 0, -L);
            ctx.quadraticCurveTo(-0.42 * W, -0.98 * L, -0.66 * W, -0.8 * L);
            ctx.lineTo(-0.3 * W, -0.67 * L);
            ctx.lineTo(-0.82 * W, -0.64 * L);
            ctx.quadraticCurveTo(-0.95 * W, -0.58 * L, -0.98 * W, -0.46 * L);
            ctx.lineTo(-0.34 * W, -0.36 * L);
            ctx.lineTo(-1.0 * W, -0.3 * L);
            ctx.quadraticCurveTo(-1.0 * W, -0.05 * L, -0.6 * W, 0.04 * L);
            ctx.quadraticCurveTo(-0.25 * W, 0.1 * L, 0, -0.1 * L);
            ctx.closePath();
          };
          leafPath(); ctx.fillStyle = col; ctx.fill();
          ctx.save(); ctx.clip();
          ctx.fillStyle = rgba(darken(col, 0.5), 0.25); ctx.fillRect(0, -L, W + 4, L * 1.2);
          ctx.fillStyle = rgba('#ffffff', 0.25); ellipsePath(ctx, -W * 0.45, -L * 0.55, W * 0.18, L * 0.22, 0.15); ctx.fill();
          ctx.restore();
          leafPath(); strokeOnly(ctx, 3);
          ctx.strokeStyle = rgba('#1f4a1a', 0.5); ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, -0.08 * L); ctx.lineTo(0, -0.9 * L); ctx.stroke();
          ctx.lineWidth = 1.4;
          for (const f of [0.2, 0.52, 0.78]) for (const sd of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(0, -f * L); ctx.lineTo(sd * W * (f < 0.6 ? 0.62 : 0.4), -f * L - 0.06 * L); ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        // snake plant
        const blades = [[-26, -60, -0.16], [-12, -86, -0.06], [2, -96, 0.02], [16, -78, 0.1], [28, -56, 0.2], [-4, -64, -0.02]];
        for (const [bx, bh, a] of blades) {
          ctx.save(); ctx.translate(bx * 0.6, 12); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-12, bh * 0.5, 0, bh); ctx.quadraticCurveTo(12, bh * 0.5, 9, 0); ctx.closePath();
          fillStroke(ctx, '#e6d35a', 3.5);
          ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-8, bh * 0.5, 0, bh + 6); ctx.quadraticCurveTo(8, bh * 0.5, 6, 0); ctx.closePath();
          ctx.fillStyle = '#3f8a3a'; ctx.fill();
          ctx.save(); ctx.clip();
          ctx.strokeStyle = 'rgba(160,220,120,0.55)'; ctx.lineWidth = 2;
          for (let k = 1; k < 7; k++) { const yy = bh * k / 7; ctx.beginPath(); ctx.moveTo(-8, yy + 3); ctx.quadraticCurveTo(0, yy - 3, 8, yy + 3); ctx.stroke(); }
          ctx.restore();
          ctx.restore();
        }
      }
      // pot (collision box 80×70, top at y=10)
      ctx.beginPath(); ctx.moveTo(-38, 22); ctx.lineTo(38, 22); ctx.lineTo(35, 80); ctx.lineTo(-35, 80); ctx.closePath();
      ctx.fillStyle = pot; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(darken(pot, 0.55), 0.28); ctx.fillRect(-40, 58, 80, 30);
      ctx.fillStyle = rgba(darken(pot, 0.55), 0.18); ctx.fillRect(18, 20, 22, 70);
      if (v % 4 === 1) { // blue folk pattern on the white pot
        ctx.strokeStyle = '#3e7cc9'; ctx.lineWidth = 2.5;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 14 - 6, 44); ctx.quadraticCurveTo(k * 14, 34, k * 14 + 6, 44); ctx.quadraticCurveTo(k * 14, 54, k * 14 - 6, 44); ctx.stroke(); }
      } else {
        ctx.fillStyle = rgba(lighten(pot, 0.6), 0.5);
        for (let k = -2; k <= 2; k++) { circlePath(ctx, k * 14, 46, 3); ctx.fill(); }
      }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-38, 22); ctx.lineTo(38, 22); ctx.lineTo(35, 80); ctx.lineTo(-35, 80); ctx.closePath(); strokeOnly(ctx);
      gloss(ctx, -30, 28, 5, 40, 0.35);
      // rim band (landing surface)
      toonBox(ctx, 0, 17, 82, 14, 5, lighten(pot, 0.06));
      ellipsePath(ctx, 0, 12.5, 34, 3); ctx.fillStyle = '#5a3a24'; ctx.fill();
    },
  },

  cushion: {
    draw(ctx, o) {
      const v = (o.v || 0) % 4;
      const col = ['#f07fa8', '#3fb6b0', '#f5c045', '#8f6cd0'][v];
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(-58, -18);
        ctx.bezierCurveTo(-30, -24, 30, -24, 58, -18);
        ctx.bezierCurveTo(63, -6, 63, 6, 58, 18);
        ctx.bezierCurveTo(30, 24, -30, 24, -58, 18);
        ctx.bezierCurveTo(-63, 6, -63, -6, -58, -18);
        ctx.closePath();
      };
      // corner tassels
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.save(); ctx.translate(sx * 58, sy * 18); ctx.rotate(Math.atan2(sy, sx) - Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.lineTo(4.5, 10); ctx.lineTo(-4.5, 10); ctx.closePath();
        fillStroke(ctx, '#ffe39a', 2.2);
        circlePath(ctx, 0, 1, 2.6); fillStroke(ctx, '#f5c045', 1.6);
        ctx.restore();
      }
      path(); ctx.fillStyle = col; ctx.fill();
      ctx.save(); path(); ctx.clip();
      if (v === 0) { // hearts
        for (const [hx, hy] of [[-38, -6], [-14, 8], [14, -6], [38, 8]]) {
          ctx.save(); ctx.translate(hx, hy); ctx.scale(0.55, 0.55);
          ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-14, -2, -8, -14, 0, -6); ctx.bezierCurveTo(8, -14, 14, -2, 0, 8); ctx.fillStyle = rgba('#ffffff', 0.55); ctx.fill();
          ctx.restore();
        }
      } else if (v === 1) { // stripes
        ctx.fillStyle = rgba('#ffffff', 0.35);
        for (let x = -70; x < 70; x += 18) ctx.fillRect(x, -30, 7, 60);
      } else if (v === 2) { // polka dots
        ctx.fillStyle = rgba('#ffffff', 0.55);
        for (let x = -50; x <= 50; x += 20) for (const y of [-10, 10]) { circlePath(ctx, x + (y > 0 ? 10 : 0), y, 3.6); ctx.fill(); }
      } else { // stars
        for (const [sx, sy] of [[-34, -4], [0, 6], [34, -4]]) sparkle(ctx, sx, sy, 7, rgba('#ffe39a', 0.85));
      }
      ctx.fillStyle = rgrad(ctx, 0, -6, 20, 70, [[0, 'rgba(255,255,255,0)'], [1, rgba(darken(col, 0.6), 0.35)]]); ctx.fillRect(-70, -30, 140, 60);
      ctx.fillStyle = rgba(darken(col, 0.55), 0.18); ctx.fillRect(-70, 10, 140, 30);
      ctx.fillStyle = rgba('#ffffff', 0.4); ellipsePath(ctx, -14, -13, 34, 4.5); ctx.fill();
      ctx.restore();
      path(); strokeOnly(ctx);
      // piping + centre button
      ctx.beginPath(); ctx.moveTo(-52, -16); ctx.quadraticCurveTo(0, -19, 52, -16); dashed(ctx, rgba('#ffffff', 0.6), 1.6, [4, 4]);
      ctx.strokeStyle = rgba(darken(col, 0.6), 0.35); ctx.lineWidth = 1.6;
      for (const a of [0.5, 2.6, 3.7, 5.8]) { ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(Math.cos(a) * 14, 2 + Math.sin(a) * 8); ctx.stroke(); }
      circlePath(ctx, 0, 2, 4); fillStroke(ctx, darken(col, 0.2), 2);
    },
  },

  beanbag: {
    draw(ctx, o, t) {
      const fab = pick(['#6c5bb3', '#2f9e9a', '#e0763e'], o.v);
      const top = [[-75, 48], [-70, 10], [-40, -30], [0, -46], [40, -30], [70, 10], [75, 48]];
      const shape = () => { smoothPath(ctx, top, false, 0.55); ctx.closePath(); };
      shape(); ctx.fillStyle = fab; ctx.fill();
      ctx.save(); shape(); ctx.clip();
      // panel seams
      ctx.strokeStyle = rgba(darken(fab, 0.55), 0.4); ctx.lineWidth = 2.2;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 6, -44); ctx.bezierCurveTo(s * 34, -20, s * 44, 20, s * 40, 48); ctx.stroke(); }
      ctx.fillStyle = rgba(darken(fab, 0.55), 0.28); ctx.fillRect(-80, 22, 160, 30);
      ctx.fillStyle = rgba(lighten(fab, 0.6), 0.25); ellipsePath(ctx, -34, -2, 16, 28, 0.5); ctx.fill();
      // slouchy creases
      ctx.strokeStyle = rgba(darken(fab, 0.6), 0.45); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (const [x0, y0, x1, y1, cx, cy] of [[-62, 20, -44, 26, -52, 18], [50, 14, 64, 26, 60, 16], [-20, 36, 4, 38, -8, 32], [22, 30, 40, 40, 34, 30]]) {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
      }
      ctx.restore();
      shape(); strokeOnly(ctx);
      // sticky bubblegum goo on top (the landing surface)
      const goo = '#ff7fc0';
      ctx.beginPath();
      ctx.moveTo(-44, -26);
      ctx.quadraticCurveTo(-20, -44, 0, -46);
      ctx.quadraticCurveTo(22, -44, 46, -26);
      // drip right
      ctx.quadraticCurveTo(50, -18, 46, -14);
      ctx.quadraticCurveTo(44, -8 + Math.sin(t * 1.5) * 1.5, 41, 2 + Math.sin(t * 1.5) * 2);
      ctx.quadraticCurveTo(37, 6, 36, -2);
      ctx.quadraticCurveTo(34, -16, 24, -20);
      // drip centre
      ctx.quadraticCurveTo(12, -24, 8, -18);
      ctx.quadraticCurveTo(6, -6, 2, -6);
      ctx.quadraticCurveTo(-2, -6, -4, -18);
      ctx.quadraticCurveTo(-14, -26, -26, -20);
      // drip left
      ctx.quadraticCurveTo(-34, -16, -36, -8);
      ctx.quadraticCurveTo(-37, 0, -41, -2);
      ctx.quadraticCurveTo(-46, -4, -46, -18);
      ctx.closePath();
      fillStroke(ctx, goo, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ellipsePath(ctx, -14, -38, 12, 3, -0.2); ctx.fill();
      circlePath(ctx, 20, -34, 3); ctx.fill();
      circlePath(ctx, 1, -12, 1.8); ctx.fill();
      // goo bubbles
      const ph = (t * 0.6) % 1;
      circlePath(ctx, 14, -38 - ph * 2, 3 + ph * 2); ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - ph)); ctx.lineWidth = 1.6; ctx.stroke();
      circlePath(ctx, -26, -30, 2.6); fillStroke(ctx, lighten(goo, 0.4), 1.4);
      // a hanging drop
      const dp = (t * 0.35) % 1;
      circlePath(ctx, 41, 4 + dp * 10, 2.5 + dp * 1.5); ctx.fillStyle = rgba(goo, 1 - dp); ctx.fill();
      // tag
      rrc(ctx, 48, 30, 16, 10, 2); fillStroke(ctx, '#fff3d6', 2);
    },
  },

  fireplace: {
    draw(ctx, o, t) {
      const fl = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
      // static firebox interior (cached)
      drawSprite(ctx, 'fp-box', -74, -98, 148, 216, fireboxStatic);
      // fire glow
      ctx.save(); rrPath(ctx, -72, -96, 144, 212, 8); ctx.clip();
      ctx.fillStyle = rgrad(ctx, 0, 100, 10, 150 * fl, [[0, 'rgba(255,190,80,0.7)'], [0.45, 'rgba(255,110,30,0.3)'], [1, 'rgba(255,90,20,0)']]);
      ctx.fillRect(-72, -96, 144, 212);
      ctx.restore();
      // flames (hazard zone)
      fireTongues(ctx, 0, 62, 102, 92, t, 1, 0.5);
      // logs (cached) + glowing embers
      drawSprite(ctx, 'fp-logs', -66, 90, 132, 28, fireLogs);
      for (let i = 0; i < 7; i++) {
        const g = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.9);
        ellipsePath(ctx, -48 + i * 16, 113, 7, 3.5); ctx.fillStyle = g > 0.5 ? '#ffd36a' : '#ff7a2a'; ctx.globalAlpha = 0.55 + 0.45 * Math.abs(g - 0.5) * 2; ctx.fill();
      }
      ctx.globalAlpha = 1;
      // sparks
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.7 + i * 0.173) % 1;
        const sx = -40 + i * 16 + Math.sin(t * 3 + i * 2) * 10 * ph, sy = 60 - ph * 140;
        if (sy < -90) continue;
        circlePath(ctx, sx, sy, 2.4 * (1 - ph) + 0.6); ctx.fillStyle = rgba('#ffd36a', 1 - ph); ctx.fill();
      }
      // stone columns + mantel (cached)
      drawSprite(ctx, 'fp-frame', -124, -119, 248, 238, fireplaceFrame);
      // flickering firelight on the inner faces of the columns
      for (const s of [-1, 1]) {
        ctx.fillStyle = hgrad(ctx, s * 70, s * 92, [[0, `rgba(255,150,60,${0.34 * fl})`], [1, 'rgba(255,150,60,0)']]);
        ctx.fillRect(s > 0 ? 72 : -92, -93, 20, 205);
      }
    },
  },
};

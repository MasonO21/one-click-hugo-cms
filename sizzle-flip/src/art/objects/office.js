// Office props ("The Office").
import {
  INK, rgba, lighten, darken, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, vgrad, hgrad, toonBox, toonCircle, rod, gloss, rng, text,
} from '../common.js';
import { woodGrain } from './shared.js';
import { motionAt } from '../../physics.js';

const TAU = Math.PI * 2;
const _m = {};

const chromeH = (ctx, x0, x1) => hgrad(ctx, x0, x1, [[0, '#86919c'], [0.22, '#eef3f7'], [0.48, '#aeb9c3'], [0.76, '#f7fafc'], [1, '#808b96']]);

function sparkle(ctx, x, y, s, color = '#ffffff') {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.16, y - s * 0.16, x + s, y);
  ctx.quadraticCurveTo(x + s * 0.16, y + s * 0.16, x, y + s);
  ctx.quadraticCurveTo(x - s * 0.16, y + s * 0.16, x - s, y);
  ctx.quadraticCurveTo(x - s * 0.16, y - s * 0.16, x, y - s);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

// Horizontal wind streaks inside a sensor rectangle (moves +x).
function windStreaks(ctx, t, x0, x1, y0, y1, n, rgb, alpha) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = hgrad(ctx, x0, x1, [[0, `rgba(${rgb},${alpha})`], [0.4, `rgba(${rgb},${alpha * 0.55})`], [1, `rgba(${rgb},0)`]]);
  for (let k = 0; k < n; k++) {
    const yy = y0 + (k + 0.5) * (y1 - y0) / n;
    ctx.setLineDash([34 + (k % 3) * 10, 30 + (k % 2) * 16]);
    ctx.lineDashOffset = -(t * 560 + k * 47);
    ctx.lineWidth = k % 2 ? 2.4 : 3.4;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) {
      const y = yy + Math.sin(x * 0.03 - t * 7 + k * 1.9) * (2 + (x - x0) * 0.012);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function screw(ctx, x, y, r = 2.6) {
  circlePath(ctx, x, y, r); ctx.fillStyle = '#c9d0d6'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(INK, 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6); ctx.stroke();
}

// ---------------------------------------------------------------- vending machine snacks
function chipsBag(ctx, x, y, col, label) {
  ctx.beginPath();
  ctx.moveTo(x - 13, y - 14); ctx.lineTo(x + 13, y - 14); ctx.quadraticCurveTo(x + 16, y, x + 13, y + 14);
  ctx.lineTo(x - 13, y + 14); ctx.quadraticCurveTo(x - 16, y, x - 13, y - 14); ctx.closePath();
  fillStroke(ctx, col, 2.4);
  ctx.beginPath(); for (let k = -12; k <= 12; k += 4) { ctx.moveTo(x + k, y - 14); ctx.lineTo(x + k + 2, y - 11); } ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(INK, 0.4); ctx.stroke();
  circlePath(ctx, x, y + 2, 6.5); ctx.fillStyle = '#fff3c4'; ctx.fill();
  text(ctx, label, x, y + 2.5, 7, darken(col, 0.3));
  gloss(ctx, x - 10, y - 9, 3, 16, 0.5);
}
function candyBar(ctx, x, y, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08);
  rrc(ctx, 0, 0, 12, 30, 2); fillStroke(ctx, col, 2.4);
  ctx.fillStyle = '#fff'; ctx.fillRect(-6, -4, 12, 6);
  ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(6, -15); ctx.moveTo(-6, 15); ctx.lineTo(6, 15); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(INK, 0.45); ctx.stroke();
  ctx.restore();
}
function sodaCan(ctx, x, y, col) {
  rrc(ctx, x, y + 1, 16, 28, 4); fillStroke(ctx, col, 2.4);
  ctx.fillStyle = hgrad(ctx, x - 8, x + 8, [[0, 'rgba(0,0,0,0.15)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(0,0,0,0.2)']]);
  rrc(ctx, x, y + 1, 14, 26, 3); ctx.fill();
  rrc(ctx, x, y - 12, 12, 4, 2); ctx.fillStyle = '#d7dee4'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y + 3); ctx.quadraticCurveTo(x, y - 2, x + 5, y + 3); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
}
function donut(ctx, x, y) {
  ellipsePath(ctx, x, y + 4, 14, 9); fillStroke(ctx, '#e1a35a', 2.4);
  ellipsePath(ctx, x, y + 2, 12, 7); ctx.fillStyle = '#ff9ec4'; ctx.fill();
  ellipsePath(ctx, x, y + 2, 4, 2.4); ctx.fillStyle = '#b06c2c'; ctx.fill();
  for (const [sx, sy, c] of [[-7, 0, '#fff27a'], [6, -1, '#7ad9ff'], [2, 5, '#ffffff'], [-3, 5, '#8ee07a']]) { ctx.fillStyle = c; ctx.fillRect(x + sx, y + sy, 3, 1.4); }
}
function miniHotdog(ctx, x, y) {
  rrc(ctx, x, y + 6, 30, 12, 6); fillStroke(ctx, '#e9a54f', 2.2);
  rrc(ctx, x, y + 1, 34, 9, 4.5); fillStroke(ctx, '#d9573b', 2.2);
  ctx.beginPath(); ctx.moveTo(x - 12, y + 1); for (let k = -12; k <= 12; k += 6) ctx.lineTo(x + k + 3, y + (k % 12 ? -1 : 2)); ctx.lineWidth = 1.8; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
}

export const OFFICE_ART = {
  // ===================================================================== DESK
  desk: {
    draw(ctx, o) {
      const w = o.w || 320, h = o.h || 210;
      const v = (o.v || 0) % 3;
      const top = ['#c98a4b', '#9a5b34', '#ebe6dc'][v];
      const body = ['#b7773f', '#80492a', '#d9d3c7'][v];
      const metal = '#5b616b';
      const y0 = -h / 2;
      // right leg (metal panel) + foot
      toonBox(ctx, w / 2 - 12, 11, 16, h - 22, 3, metal);
      gloss(ctx, w / 2 - 17, y0 + 30, 3, h - 60, 0.35);
      rrc(ctx, w / 2 - 12, h / 2 - 3, 24, 7, 3); fillStroke(ctx, '#33373d', 2.5);
      // left drawer pedestal
      const px = -w / 2 + 45;
      toonBox(ctx, px, 11, 90, h - 22, 4, body, { shade: 0.18 });
      if (v < 2) woodGrain(ctx, px - 42, y0 + 26, 84, h - 34, body, w * 3 + h);
      const a0 = y0 + 28, a1 = h / 2 - 14;
      const avail = a1 - a0;
      const fr = avail > 140 ? [0.27, 0.27, 0.46] : avail > 70 ? [0.4, 0.6] : [1];
      let yy = a0;
      fr.forEach((f, i) => {
        const dh = avail * f - 5;
        const cy = yy + dh / 2;
        rrc(ctx, px, cy, 78, dh, 4); fillStroke(ctx, lighten(body, 0.12), 3);
        rrc(ctx, px, cy, 78, dh, 4);
        ctx.save(); ctx.clip(); ctx.fillStyle = rgba(darken(body, 0.5), 0.15); ctx.fillRect(px - 40, cy + dh / 2 - 6, 80, 6); ctx.restore();
        const hy = i === fr.length - 1 && fr.length > 1 ? cy - dh / 2 + 16 : cy;
        rod(ctx, px - 14, hy, px + 14, hy, 4.5, '#d8dee3');
        if (i === fr.length - 1 && fr.length > 1 && dh > 50) {
          rrc(ctx, px, hy + 16, 30, 13, 2); fillStroke(ctx, '#f6f1e4', 2);
          ctx.beginPath(); ctx.moveTo(px - 9, hy + 16); ctx.lineTo(px + 9, hy + 16); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba('#3e6fc0', 0.7); ctx.stroke();
        }
        if (i === 0) { circlePath(ctx, px + 30, cy - dh / 2 + 9, 2.6); ctx.fillStyle = '#d8b54a'; ctx.fill(); strokeOnly(ctx, 1.4, rgba(INK, 0.6)); }
        yy += avail * f;
      });
      ctx.fillStyle = rgba(INK, 0.3); ctx.fillRect(px - 41, h / 2 - 11, 82, 8);
      // desktop
      toonBox(ctx, 0, y0 + 11, w, 22, 4, top);
      if (v < 2) woodGrain(ctx, -w / 2 + 3, y0 + 2, w - 6, 15, top, w + h);
      else {
        ctx.save(); rrc(ctx, 0, y0 + 11, w, 22, 4); ctx.clip();
        ctx.fillStyle = '#c98a4b'; ctx.fillRect(-w / 2, y0 + 15, w, 7);
        ctx.restore();
        rrc(ctx, 0, y0 + 11, w, 22, 4); strokeOnly(ctx);
      }
      gloss(ctx, -w / 2 + 12, y0 + 4, w * 0.4, 3, 0.45);
    },
  },

  // ===================================================================== MONITOR
  monitor: {
    draw(ctx, o) {
      const v = (o.v || 0) % 2;
      // stand
      toonBox(ctx, 0, 68, 80, 12, 5, '#3a3f47', { hi: 0.4 });
      toonBox(ctx, 0, 50, 20, 34, 3, '#4a5059');
      // bezel
      toonBox(ctx, 0, -20, 170, 110, 8, '#2d3139', { hi: 0.18, shade: 0.2 });
      // screen
      const sx = 0, sy = -25, sw = 154, sh = 86;
      ctx.save();
      rrc(ctx, sx, sy, sw, sh, 4); ctx.clip();
      if (v === 0) {
        ctx.fillStyle = vgrad(ctx, sy - sh / 2, sy + sh / 2, [[0, '#59c2f0'], [1, '#2b7fc9']]); ctx.fillRect(-90, -80, 180, 100);
        ctx.fillStyle = '#7ccf6a';
        ctx.beginPath(); ctx.moveTo(-80, 20); ctx.quadraticCurveTo(-30, -14, 20, 8); ctx.quadraticCurveTo(50, -6, 80, 4); ctx.lineTo(80, 20); ctx.fill();
        // desktop icons
        for (let k = 0; k < 3; k++) { rrc(ctx, -66, -56 + k * 18, 10, 10, 2); ctx.fillStyle = ['#ffd23f', '#ffffff', '#ff8f7a'][k]; ctx.fill(); }
        // chart window
        rrc(ctx, 10, -24, 112, 70, 4); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
        ctx.fillStyle = '#dfe6ee'; ctx.fillRect(-46, -59, 112, 10);
        for (let k = 0; k < 3; k++) { circlePath(ctx, -40 + k * 6, -54, 2); ctx.fillStyle = ['#ff6b6b', '#ffd23f', '#5bd17a'][k]; ctx.fill(); }
        const bars = [10, 18, 14, 26, 34];
        bars.forEach((bh, k) => { ctx.fillStyle = ['#5aa9e6', '#5aa9e6', '#f2b134', '#5bb072', '#e05a47'][k]; ctx.fillRect(-36 + k * 18, 6 - bh, 12, bh); });
        ctx.beginPath(); ctx.moveTo(-36, -6); ctx.lineTo(-10, -12); ctx.lineTo(14, -14); ctx.lineTo(48, -36);
        ctx.lineWidth = 3; ctx.strokeStyle = '#2d3139'; ctx.lineCap = 'round'; ctx.stroke();
        polyPath(ctx, [[52, -40], [42, -38], [49, -31]]); ctx.fillStyle = '#2d3139'; ctx.fill();
        ctx.fillStyle = rgba(INK, 0.5); ctx.fillRect(-42, 6, 100, 1.5);
      } else {
        ctx.fillStyle = vgrad(ctx, sy - sh / 2, sy + sh / 2, [[0, '#1b2350'], [1, '#3a2a6e']]); ctx.fillRect(-90, -80, 180, 100);
        const r = rng(5);
        for (let k = 0; k < 26; k++) { circlePath(ctx, -76 + r() * 152, -66 + r() * 84, 0.6 + r() * 1.3); ctx.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; ctx.fill(); }
        // bouncing hot dog screensaver
        ctx.save(); ctx.translate(-10, -30); ctx.rotate(-0.25);
        rrc(ctx, 0, 6, 64, 20, 10); fillStroke(ctx, '#e9a54f', 3);
        rrc(ctx, 0, 0, 70, 16, 8); fillStroke(ctx, '#d9573b', 3);
        ctx.beginPath(); ctx.moveTo(-24, 0); for (let k = -24; k <= 24; k += 8) ctx.lineTo(k + 4, k % 16 ? -3 : 3); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
        ctx.restore();
        text(ctx, 'BRB', 40, -2, 16, '#ffd23f');
      }
      // glare
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(-77, 18); ctx.lineTo(-50, 18); ctx.lineTo(-6, -68); ctx.lineTo(-33, -68); ctx.closePath(); ctx.fill();
      ctx.restore();
      rrc(ctx, sx, sy, sw, sh, 4); strokeOnly(ctx, 2.5, '#16181d');
      // webcam, logo, power LED
      circlePath(ctx, 0, -72, 2.2); ctx.fillStyle = '#5b6370'; ctx.fill();
      rrc(ctx, 0, 26, 16, 4, 2); ctx.fillStyle = '#7b8290'; ctx.fill();
      circlePath(ctx, 72, 26, 2.4); ctx.fillStyle = '#6dff8a'; ctx.fill();
      // sticky note on the bezel
      ctx.save(); ctx.translate(64, -60); ctx.rotate(0.14);
      rrc(ctx, 0, 0, 24, 22, 1.5); fillStroke(ctx, '#ffe95e', 2);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(-12, -11, 24, 5);
      text(ctx, '!!', 0, 2, 11, '#e05a47');
      ctx.restore();
    },
  },

  // ===================================================================== OFFICE CHAIR
  officechair: {
    draw(ctx, o, t) {
      const col = ['#3e5c8a', '#3a3c44', '#2f9e8a', '#7a5cc0'][(o.v || 0) % 4];
      const frame = '#2a2c31';
      const m = motionAt(o.move, t, _m);
      const spin = (m.ox || 0) / 6 + (m.oy || 0) / 12;
      // casters
      for (const [cx, back] of [[0, true], [-46, false], [46, false]]) {
        const cy = 90;
        rod(ctx, cx, 82, cx + (back ? 0 : -3), cy - 2, 3, back ? '#4a4d55' : '#5d616a');
        circlePath(ctx, cx, cy, back ? 5.5 : 7); ctx.fillStyle = back ? '#2a2c31' : '#33363d'; ctx.fill(); strokeOnly(ctx, 3);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(spin) * 4.5, cy + Math.sin(spin) * 4.5);
        ctx.lineWidth = 2; ctx.strokeStyle = '#9aa1ab'; ctx.stroke();
      }
      // star base
      polyPath(ctx, [[-55, 82], [-12, 73], [12, 73], [55, 82], [55, 87], [-55, 87]]);
      ctx.fillStyle = vgrad(ctx, 73, 87, [[0, '#4a4e57'], [1, '#22242a']]); ctx.fill(); strokeOnly(ctx, 3.5);
      gloss(ctx, -40, 79, 30, 2, 0.35);
      // gas lift
      rrc(ctx, 0, 52, 12, 40, 5); ctx.fillStyle = hgrad(ctx, -6, 6, [[0, '#7f8a94'], [0.4, '#f1f5f8'], [1, '#77828c']]); ctx.fill(); strokeOnly(ctx, 3);
      rrc(ctx, 0, 28, 16, 34, 5); fillStroke(ctx, frame, 3);
      // tilt mechanism + lever
      rrc(ctx, 6, 16, 44, 9, 3); fillStroke(ctx, frame, 3);
      rod(ctx, 26, 18, 40, 24, 3, '#4a4e57');
      // backrest support (J-bar)
      ctx.beginPath(); ctx.moveTo(-48, -14); ctx.quadraticCurveTo(-46, 14, -18, 16);
      ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = '#3c3f46'; ctx.stroke();
      // backrest
      toonBox(ctx, -48, -50, 22, 80, 9, col, { hi: 0.4 });
      ctx.beginPath(); ctx.moveTo(-48, -82); ctx.lineTo(-48, -18); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(darken(col, 0.5), 0.4); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      // seat cushion
      toonBox(ctx, 0, 0, 120, 24, 10, col, { hi: 0.45 });
      ctx.beginPath(); ctx.moveTo(-50, 2); ctx.lineTo(50, 2); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(darken(col, 0.5), 0.4); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      gloss(ctx, -44, -8, 60, 3, 0.4);
    },
  },

  // ===================================================================== PRINTER
  printer: {
    draw(ctx, o) {
      const col = ['#e8eaee', '#f1ece2', '#d6dde6'][(o.v || 0) % 3];
      // feet
      for (const fx of [-64, 64]) { rrc(ctx, fx, 46, 16, 6, 2); fillStroke(ctx, '#3a3d44', 2.5); }
      toonBox(ctx, 0, 0, 170, 90, 8, col, { shade: 0.16 });
      // scanner lid band
      ctx.save(); rrc(ctx, 0, 0, 170, 90, 8); ctx.clip();
      ctx.fillStyle = darken(col, 0.06); ctx.fillRect(-90, -45, 180, 14);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-84, -31); ctx.lineTo(84, -31); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.55); ctx.stroke();
      rrc(ctx, 0, -31, 30, 4, 2); ctx.fillStyle = rgba(INK, 0.35); ctx.fill();
      text(ctx, 'PRINTO', -56, -38, 9, rgba(INK, 0.45));
      gloss(ctx, -70, -43, 90, 3, 0.6);
      // output slot + printed page
      rrc(ctx, -18, -19, 112, 8, 3); fillStroke(ctx, '#3b3f46', 2.5);
      ctx.beginPath(); ctx.moveTo(-68, -19); ctx.lineTo(32, -19); ctx.lineTo(36, 8); ctx.lineTo(-72, 8); ctx.closePath();
      fillStroke(ctx, '#ffffff', 2.5);
      ctx.strokeStyle = rgba('#5a6b80', 0.5); ctx.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-62, -12 + k * 5); ctx.lineTo(-10 - (k % 2) * 14, -12 + k * 5); ctx.stroke(); }
      // tiny printed sausage doodle
      ctx.beginPath(); ctx.moveTo(2, -4); ctx.quadraticCurveTo(14, -12, 26, -4); ctx.lineWidth = 5; ctx.strokeStyle = '#e06a4a'; ctx.lineCap = 'round'; ctx.stroke();
      // control panel
      rrc(ctx, 62, -10, 34, 30, 4); fillStroke(ctx, '#3b3f46', 2.5);
      rrc(ctx, 62, -18, 26, 9, 2); ctx.fillStyle = '#a8e6a1'; ctx.fill();
      text(ctx, 'JAM?', 62, -17.5, 7, '#2a5a2a', { font: 'monospace' });
      circlePath(ctx, 54, -2, 3.4); ctx.fillStyle = '#5bd17a'; ctx.fill();
      circlePath(ctx, 62, -2, 3.4); ctx.fillStyle = '#ff6b6b'; ctx.fill();
      circlePath(ctx, 70, -2, 3.4); ctx.fillStyle = '#d7dde3'; ctx.fill();
      // paper tray
      rrc(ctx, -8, 27, 146, 24, 4); fillStroke(ctx, lighten(col, 0.4), 3);
      rrc(ctx, -8, 23, 36, 6, 3); ctx.fillStyle = rgba(INK, 0.35); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-74, 33, 132, 3);
      ctx.fillStyle = rgba(INK, 0.15); ctx.fillRect(-74, 36, 132, 1.5);
    },
  },

  // ===================================================================== STAPLER
  stapler: {
    draw(ctx, o) {
      const col = ['#e0463a', '#3e8ed0', '#2f3238', '#f2b134'][(o.v || 0) % 4];
      // base
      rrc(ctx, 0, 15, 120, 10, 5); fillStroke(ctx, '#2f3238', 3.5);
      rrc(ctx, 46, 12, 22, 4, 2); ctx.fillStyle = chromeH(ctx, 35, 57); ctx.fill(); strokeOnly(ctx, 1.6);
      // staple peeking at the nose
      ctx.beginPath(); ctx.moveTo(48, 11); ctx.lineTo(48, 8); ctx.lineTo(54, 8); ctx.lineTo(54, 11); ctx.lineWidth = 1.6; ctx.strokeStyle = '#9aa5ae'; ctx.stroke();
      // top arm
      ctx.beginPath();
      ctx.moveTo(-58, 9); ctx.lineTo(-58, 0); ctx.quadraticCurveTo(-58, -8, -48, -8);
      ctx.lineTo(42, -8); ctx.quadraticCurveTo(58, -8, 59, 2);
      ctx.lineTo(59, 4); ctx.quadraticCurveTo(58, 9, 52, 9); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(darken(col, 0.55), 0.3); ctx.fillRect(-60, 3, 120, 8);
      ctx.restore();
      strokeOnly(ctx);
      // chrome top strip
      rrc(ctx, 0, -4, 86, 4, 2); ctx.fillStyle = chromeH(ctx, -43, 43); ctx.fill(); strokeOnly(ctx, 1.4, rgba(INK, 0.5));
      text(ctx, 'STAPLR', -10, 3, 8, rgba('#ffffff', 0.85));
      // hinge
      toonCircle(ctx, -50, 7, 5, '#d7dee4', { lw: 2.5 });
      gloss(ctx, 40, -6, 12, 2.4, 0.6);
    },
  },

  // ===================================================================== DESK FAN
  deskfan: {
    draw(ctx, o, t) {
      const col = ['#7fd1b9', '#f3dfb6', '#8ec5ef', '#ff9a8b'][(o.v || 0) % 4];
      // airflow inside the wind sensor (x 50..450, y -75..35)
      windStreaks(ctx, t, 58, 440, -66, 26, 5, '255,255,255', 0.85);
      // base + neck
      toonBox(ctx, 0, 52, 70, 16, 6, col, { hi: 0.5 });
      for (let k = 0; k < 3; k++) { rrc(ctx, -16 + k * 11, 47 + (k === 1 ? 1 : 0), 8, 4, 1.5); ctx.fillStyle = k === 1 ? '#ffffff' : rgba(darken(col, 0.5), 0.6); ctx.fill(); }
      rod(ctx, 0, 24, 0, 44, 8, lighten(col, 0.2));
      toonCircle(ctx, 0, 26, 6, darken(col, 0.1), { lw: 3 });
      // motor housing peeking from behind
      rrc(ctx, -40, -20, 26, 30, 10); fillStroke(ctx, darken(col, 0.08), 3.5);
      // cage back + blades
      circlePath(ctx, 0, -20, 44); ctx.fillStyle = 'rgba(220,236,244,0.85)'; ctx.fill();
      ctx.save();
      circlePath(ctx, 0, -20, 42); ctx.clip();
      ctx.translate(0, -20);
      const a = t * 24;
      for (const [off, al] of [[-0.32, 0.25], [-0.16, 0.4], [0, 0.95]]) {
        for (let b = 0; b < 4; b++) {
          ctx.save(); ctx.rotate(a + off + b * TAU / 4);
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.bezierCurveTo(14, -10, 36, -12, 37, 0); ctx.bezierCurveTo(34, 10, 14, 8, 0, 4); ctx.closePath();
          ctx.fillStyle = rgba(lighten(col, 0.15), al); ctx.fill();
          if (off === 0) { ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.7); ctx.stroke(); }
          ctx.restore();
        }
      }
      ctx.restore();
      // cage wires
      ctx.save();
      ctx.strokeStyle = 'rgba(120,132,144,0.9)'; ctx.lineWidth = 1.4;
      for (const rr of [14, 26, 36]) { circlePath(ctx, 0, -20, rr); ctx.stroke(); }
      for (let k = 0; k < 16; k++) {
        const an = k / 16 * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(an) * 9, -20 + Math.sin(an) * 9); ctx.lineTo(Math.cos(an) * 42, -20 + Math.sin(an) * 42); ctx.stroke();
      }
      ctx.restore();
      // rim + hub badge
      circlePath(ctx, 0, -20, 42); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 4.5; ctx.strokeStyle = '#dfe6eb'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -20, 42, Math.PI * 1.1, Math.PI * 1.45); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      toonCircle(ctx, 0, -20, 9, col, { lw: 3 });
      circlePath(ctx, 0, -20, 3.2); ctx.fillStyle = '#ffffff'; ctx.fill();
    },
  },

  // ===================================================================== WATER COOLER
  watercooler: {
    draw(ctx) {
      // body
      toonBox(ctx, 0, 40, 100, 180, 6, '#eef1f4', { shade: 0.15 });
      // tap recess
      rrc(ctx, 0, -10, 72, 56, 8); fillStroke(ctx, '#d3dae1', 3);
      ctx.save(); rrc(ctx, 0, -10, 72, 56, 8); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-40, -40, 80, 8);
      ctx.restore();
      for (const [tx, tc] of [[-16, '#3e8ed0'], [16, '#e05a47']]) {
        rrc(ctx, tx, -24, 18, 16, 4); fillStroke(ctx, tc, 3);
        rrc(ctx, tx, -13, 8, 8, 2); fillStroke(ctx, '#e8eef2', 2.5);
        gloss(ctx, tx - 6, -29, 3, 8, 0.6);
      }
      // drip tray grille
      rrc(ctx, 0, 11, 56, 8, 3); fillStroke(ctx, '#9aa4ae', 2.5);
      ctx.strokeStyle = rgba(INK, 0.4); ctx.lineWidth = 1.4;
      for (let x = -22; x <= 22; x += 6) { ctx.beginPath(); ctx.moveTo(x, 8.5); ctx.lineTo(x, 13.5); ctx.stroke(); }
      // little paper cup
      ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.lineTo(4, 7); ctx.lineTo(-4, 7); ctx.closePath(); fillStroke(ctx, '#ffffff', 2);
      // label + vents
      circlePath(ctx, 0, 48, 14); ctx.fillStyle = '#d9ecfa'; ctx.fill(); strokeOnly(ctx, 2, rgba(INK, 0.4));
      ctx.beginPath(); ctx.moveTo(0, 38); ctx.quadraticCurveTo(8, 48, 6, 52); ctx.arc(0, 52, 6, 0, Math.PI); ctx.quadraticCurveTo(-8, 48, 0, 38);
      ctx.fillStyle = '#3e8ed0'; ctx.fill();
      rrc(ctx, 0, 96, 70, 50, 5); strokeOnly(ctx, 2.5, rgba(INK, 0.35));
      ctx.fillStyle = rgba(INK, 0.22);
      for (let k = 0; k < 5; k++) rrc(ctx, 0, 80 + k * 8, 46, 3, 1.5), ctx.fill();
      gloss(ctx, -42, -40, 4, 150, 0.5);
      // bottle (inverted jug)
      ctx.save();
      rrc(ctx, 0, -85, 76, 80, 30);
      ctx.fillStyle = 'rgba(175,220,250,0.55)'; ctx.fill();
      ctx.clip();
      ctx.fillStyle = vgrad(ctx, -110, -45, [[0, 'rgba(90,175,240,0.75)'], [1, 'rgba(40,130,210,0.85)']]);
      ctx.beginPath(); ctx.moveTo(-40, -109);
      for (let x = -40; x <= 40; x += 8) ctx.lineTo(x, -109 + Math.sin(x * 0.2) * 1.5);
      ctx.lineTo(40, -40); ctx.lineTo(-40, -40); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-40, -108); for (let x = -40; x <= 40; x += 8) ctx.lineTo(x, -108 + Math.sin(x * 0.2) * 1.5);
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
      // ridges
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      for (const ry of [-96, -72]) { ctx.beginPath(); ctx.moveTo(-37, ry); ctx.quadraticCurveTo(0, ry + 5, 37, ry); ctx.stroke(); }
      // bubbles rising inside
      for (const [bx, by, br] of [[10, -56, 4], [16, -70, 3], [6, -84, 2.5], [14, -98, 3.5], [-14, -66, 2]]) {
        circlePath(ctx, bx, by, br); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      }
      ctx.restore();
      rrc(ctx, 0, -85, 76, 80, 30); strokeOnly(ctx);
      gloss(ctx, -28, -110, 7, 52, 0.7);
      gloss(ctx, -16, -116, 4, 14, 0.5);
      // neck & cap into the collar
      rrc(ctx, 0, -46, 28, 8, 3); fillStroke(ctx, '#3e8ed0', 3);
      rrc(ctx, 0, -50, 64, 7, 3); fillStroke(ctx, '#cfd6dd', 3);
    },
  },

  // ===================================================================== FILING CABINET
  filingcabinet: {
    draw(ctx, o) {
      const col = ['#9aa5ad', '#bdb391', '#7f9cb5', '#93aa8f'][(o.v || 0) % 4];
      toonBox(ctx, 0, 0, 120, 220, 4, col, { shade: 0.18 });
      // top lip (landing surface)
      toonBox(ctx, 0, -105, 120, 10, 3, lighten(col, 0.18), { hi: 0.6 });
      const labels = ['A–F', 'G–P', 'Q–Z'];
      for (let i = 0; i < 3; i++) {
        const cy = -66 + i * 67;
        rrc(ctx, 0, cy, 106, 62, 4); fillStroke(ctx, lighten(col, 0.1), 3);
        ctx.save(); rrc(ctx, 0, cy, 106, 62, 4); ctx.clip();
        ctx.fillStyle = rgba(darken(col, 0.5), 0.18); ctx.fillRect(-55, cy + 22, 110, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-55, cy - 31, 110, 5);
        ctx.restore();
        // label holder
        rrc(ctx, 0, cy - 14, 36, 14, 2); fillStroke(ctx, '#e8edf1', 2.2);
        rrc(ctx, 0, cy - 14, 28, 9, 1); ctx.fillStyle = '#fffaf0'; ctx.fill();
        text(ctx, labels[i], 0, cy - 13.5, 8, '#3e5c8a');
        // pull handle
        rrc(ctx, 0, cy + 6, 44, 10, 5); ctx.fillStyle = rgba(INK, 0.45); ctx.fill();
        rod(ctx, -18, cy + 4, 18, cy + 4, 5, '#dfe6eb');
      }
      // lock
      circlePath(ctx, 44, -91, 4.4); ctx.fillStyle = chromeH(ctx, 40, 48); ctx.fill(); strokeOnly(ctx, 2);
      ctx.fillStyle = INK; ctx.fillRect(43.2, -93, 1.6, 4);
      // folder tabs peeking from the ajar top drawer
      for (const [fx, fc] of [[-30, '#f2b134'], [-12, '#e05a47'], [10, '#5bb072']]) {
        rrc(ctx, fx, -98.5, 14, 4, 1.5); ctx.fillStyle = fc; ctx.fill();
      }
      // fridge-magnet style sticker
      ctx.save(); ctx.translate(-30, 84); ctx.rotate(-0.1);
      rrc(ctx, 0, 0, 46, 14, 2); fillStroke(ctx, '#e05a47', 2);
      text(ctx, 'TOP SECRET', 0, 0.5, 7, '#ffffff', { font: '"Fredoka", sans-serif', weight: 700 });
      ctx.restore();
      gloss(ctx, -54, -90, 4, 180, 0.35);
      ctx.fillStyle = rgba(INK, 0.3); ctx.fillRect(-56, 104, 112, 5);
    },
  },

  // ===================================================================== SHREDDER
  shredder: {
    draw(ctx, o, t) {
      // bin (smoked window shows confetti)
      rrc(ctx, 0, 29, 116, 62, 6); fillStroke(ctx, '#4a4f58');
      ctx.save();
      rrc(ctx, 0, 30, 96, 48, 5); ctx.fillStyle = 'rgba(160,190,215,0.55)'; ctx.fill();
      ctx.clip();
      // pile
      const r = rng(17);
      for (let k = 0; k < 40; k++) {
        const x = -46 + r() * 92, y = 46 + r() * 12 - Math.cos(x / 50) * 8;
        ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 2);
        ctx.fillStyle = ['#ffffff', '#f7f1d8', '#dfe8f5', '#ffe7a0'][k % 4]; ctx.fillRect(-1.5, -6, 3, 12);
        ctx.restore();
      }
      // falling strips
      for (let i = 0; i < 6; i++) {
        const ph = (t * 1.7 + i * 0.29) % 1;
        const x = -36 + i * 14 + Math.sin(t * 6 + i) * 2;
        const y = 4 + ph * 44;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 9 + i * 2) * 0.4);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#fff6d8'; ctx.fillRect(-1.5, -7, 3, 14);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(-44, 54); ctx.lineTo(-34, 54); ctx.lineTo(-12, 6); ctx.lineTo(-22, 6); ctx.fill();
      ctx.restore();
      rrc(ctx, 0, 30, 96, 48, 5); strokeOnly(ctx, 2.5);
      // cutter head
      toonBox(ctx, 0, -16, 120, 28, 6, '#363a42', { hi: 0.25 });
      // hazard stripes
      ctx.save(); rrc(ctx, -12, -12, 80, 9, 2); ctx.clip();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-60, -18, 100, 14);
      ctx.fillStyle = '#26282d';
      for (let x = -60; x < 40; x += 12) { ctx.beginPath(); ctx.moveTo(x, -3); ctx.lineTo(x + 6, -3); ctx.lineTo(x + 12, -17); ctx.lineTo(x + 6, -17); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      rrc(ctx, -12, -12, 80, 9, 2); strokeOnly(ctx, 2);
      // power LED (blinks)
      const on = (t * 2) % 1 < 0.6;
      circlePath(ctx, 44, -11, 4); ctx.fillStyle = on ? '#ff4d3a' : '#7a2a24'; ctx.fill(); strokeOnly(ctx, 2);
      if (on) { circlePath(ctx, 44, -11, 8); ctx.fillStyle = 'rgba(255,90,60,0.25)'; ctx.fill(); }
      // slot
      rrc(ctx, 0, -31, 96, 7, 3.5); fillStroke(ctx, '#111216', 3);
      // spinning cutter teeth poking out of the slot
      ctx.save();
      ctx.beginPath(); ctx.rect(-47, -50, 94, 19); ctx.clip();
      const off = (t * 50) % 12;
      ctx.beginPath();
      ctx.moveTo(-52, -30);
      for (let x = -64 + off; x < 58; x += 12) { ctx.lineTo(x + 1, -30); ctx.lineTo(x + 6, -44); ctx.lineTo(x + 11, -30); }
      ctx.lineTo(52, -30); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -44, -30, [[0, '#ffffff'], [0.45, '#d5dce2'], [1, '#8d98a2']]); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      // sheet being devoured
      ctx.save();
      ctx.translate(-14, -32); ctx.rotate(-0.12);
      const bite = Math.sin(t * 7) * 1.5;
      ctx.beginPath();
      ctx.moveTo(-14, bite); ctx.lineTo(-15, -24); ctx.lineTo(13, -26); ctx.lineTo(14, bite);
      for (let x = 14; x >= -14; x -= 4) ctx.lineTo(x - 2, bite + (x % 8 ? -4 : 0));
      ctx.closePath();
      fillStroke(ctx, '#ffffff', 2.4);
      ctx.strokeStyle = rgba('#5a6b80', 0.5); ctx.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-10, -20 + k * 5); ctx.lineTo(8 - (k % 2) * 6, -20 + k * 5); ctx.stroke(); }
      text(ctx, 'TPS', 0, -6, 6, '#e05a47');
      ctx.restore();
      // flying confetti
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.3 + i * 0.33) % 1;
        const x = 6 + i * 12 + ph * 16, y = -36 - Math.sin(ph * Math.PI) * 14;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 8 + i);
        ctx.globalAlpha = 1 - ph;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-1.2, -4, 2.4, 8);
        ctx.restore();
      }
    },
  },

  // ===================================================================== PAPERS
  papers: {
    draw(ctx, o) {
      const r = rng((o.v || 0) * 31 + 7);
      // sticky note poking out
      ctx.save(); ctx.translate(64, -6); ctx.rotate(0.18);
      rrc(ctx, 0, 0, 16, 12, 1.5); fillStroke(ctx, '#ffe95e', 2);
      ctx.restore();
      // ream package (bottom)
      toonBox(ctx, 0, 15, 130, 26, 2, '#f6f3ec', { shade: 0.15 });
      ctx.save(); rrc(ctx, 0, 15, 130, 26, 2); ctx.clip();
      ctx.fillStyle = '#3e8ed0'; ctx.fillRect(-65, 8, 130, 6);
      ctx.restore();
      rrc(ctx, 0, 15, 130, 26, 2); strokeOnly(ctx, 3);
      rrc(ctx, -20, 15, 44, 14, 2); fillStroke(ctx, '#ffffff', 2);
      text(ctx, 'A4·500', -20, 15.5, 8, '#3e8ed0');
      // URGENT stamp
      ctx.save(); ctx.translate(34, 16); ctx.rotate(-0.14);
      rrc(ctx, 0, 0, 40, 12, 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(224,70,58,0.85)'; ctx.stroke();
      text(ctx, 'URGENT', 0, 0.5, 8, 'rgba(224,70,58,0.9)');
      ctx.restore();
      // loose sheets
      const sheetCols = ['#ffffff', '#fbf8ef', '#ffffff', '#fde9ef', '#ffffff', '#eaf3fb', '#fff7d6'];
      for (let k = 0; k < 6; k++) {
        const y = 0 - k * 4.6;
        const off = (r() - 0.5) * 4;
        const wv = 126 - r() * 4;
        rrc(ctx, off, y - 2.3, wv, 4.6, 1.5);
        ctx.fillStyle = sheetCols[(k + (o.v || 0)) % sheetCols.length]; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(INK, 0.45); ctx.stroke();
      }
      // top sheet + clip
      rrc(ctx, 0, -25.4, 130, 5.2, 1.6); fillStroke(ctx, '#ffffff', 2.6);
      ctx.beginPath(); ctx.moveTo(-63, -28); ctx.lineTo(-63, 2); ctx.moveTo(63, -28); ctx.lineTo(63, 2); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      // paper clip on the stack's corner
      ctx.save(); ctx.translate(-44, -20);
      ctx.beginPath();
      ctx.moveTo(4, 10); ctx.lineTo(4, -6); ctx.arc(0, -6, 4, 0, Math.PI, true); ctx.lineTo(-4, 12); ctx.arc(1, 12, 5, Math.PI, 0, true); ctx.lineTo(6, -9); ctx.arc(-0.5, -9, 6.5, 0, Math.PI, true); ctx.lineTo(-7, 6);
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#e05a47'; ctx.stroke();
      ctx.restore();
    },
  },

  // ===================================================================== VENDING MACHINE
  vending: {
    draw(ctx, o) {
      const col = ['#d94545', '#2f6fc0', '#2e3138', '#2f9e6a'][(o.v || 0) % 4];
      // feet
      for (const fx of [-64, 64]) { rrc(ctx, fx, 166, 22, 8, 3); fillStroke(ctx, '#2a2c31', 2.5); }
      toonBox(ctx, 0, 0, 170, 330, 8, col, { shade: 0.2 });
      gloss(ctx, -80, -150, 5, 300, 0.3);
      // glowing header sign
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      rrc(ctx, 0, -146, 170, 50, 16); ctx.fillStyle = 'rgba(255,240,180,0.18)'; ctx.fill();
      ctx.restore();
      rrc(ctx, 0, -146, 150, 26, 6);
      ctx.fillStyle = vgrad(ctx, -159, -133, [[0, '#fffbe8'], [1, '#ffe7a0']]); ctx.fill(); strokeOnly(ctx, 3);
      text(ctx, 'SNACKS', 0, -145, 19, col, { stroke: 0 });
      // window
      const wx = -22, wy = -18, ww = 110, wh = 208;
      rrc(ctx, wx, wy, ww + 10, wh + 10, 7); fillStroke(ctx, darken(col, 0.35), 3);
      ctx.save();
      rrc(ctx, wx, wy, ww, wh, 4);
      ctx.fillStyle = vgrad(ctx, wy - wh / 2, wy + wh / 2, [[0, '#fffaf0'], [1, '#f2e2c4']]); ctx.fill();
      ctx.clip();
      // back light glow
      ctx.fillStyle = vgrad(ctx, wy - wh / 2, wy - wh / 2 + 40, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, 40);
      const rowsY = [-98, -58, -18, 22, 62];
      const xs = [-58, -22, 14];
      const chipCols = ['#f2b134', '#e05a47', '#5bb072', '#8d6cc4', '#3e8ed0'];
      rowsY.forEach((ry, ri) => {
        xs.forEach((ix, ci) => {
          const k = ri * 3 + ci;
          if (ri === 0) chipsBag(ctx, ix, ry, chipCols[(k + 1) % 5], ['YUM', 'POP', 'ZAP'][ci]);
          else if (ri === 1) { candyBar(ctx, ix - 5, ry + 2, chipCols[(k + 2) % 5]); candyBar(ctx, ix + 6, ry + 2, chipCols[(k + 2) % 5]); }
          else if (ri === 2) sodaCan(ctx, ix, ry + 2, ['#e05a47', '#3e8ed0', '#5bb072'][ci]);
          else if (ri === 3) donut(ctx, ix, ry + 2);
          else if (ci === 1) miniHotdog(ctx, ix, ry + 2);
          else chipsBag(ctx, ix, ry, chipCols[(k + 3) % 5], ci ? 'NOM' : 'WOW');
          // spiral coil
          ctx.beginPath();
          for (let s = -12; s <= 12; s += 4) { ctx.moveTo(ix + s, ry + 22); ctx.lineTo(ix + s + 2.5, ry + 17); }
          ctx.lineWidth = 1.6; ctx.strokeStyle = '#8a949e'; ctx.stroke();
        });
        // shelf lip + price tags
        ctx.fillStyle = '#c3ccd4'; ctx.fillRect(wx - ww / 2, ry + 21, ww, 5);
        ctx.fillStyle = rgba(INK, 0.35); ctx.fillRect(wx - ww / 2, ry + 26, ww, 1.5);
        xs.forEach((ix, ci) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(ix - 6, ry + 21.5, 12, 4); ctx.fillStyle = col; ctx.fillRect(ix - 3, ry + 22.8, 6, 1.4); });
      });
      // warm interior glow over the snacks
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = vgrad(ctx, wy - wh / 2, wy + wh / 2, [[0, 'rgba(255,230,160,0.14)'], [1, 'rgba(255,200,120,0.04)']]);
      ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
      ctx.restore();
      // glass glare
      ctx.fillStyle = 'rgba(200,235,255,0.10)'; ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath(); ctx.moveTo(-70, 86); ctx.lineTo(-48, 86); ctx.lineTo(20, -122); ctx.lineTo(-2, -122); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(-36, 86); ctx.lineTo(-28, 86); ctx.lineTo(40, -122); ctx.lineTo(32, -122); ctx.closePath(); ctx.fill();
      ctx.restore();
      rrc(ctx, wx, wy, ww, wh, 4); strokeOnly(ctx, 3);
      // light tube
      rrc(ctx, wx, wy - wh / 2 + 4, ww - 12, 5, 2.5); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      rrc(ctx, wx, wy - wh / 2 + 6, ww - 4, 16, 8); ctx.fillStyle = 'rgba(255,240,190,0.35)'; ctx.fill();
      ctx.restore();
      // side panel: display, keypad, coin + bill slots
      const px = 59;
      rrc(ctx, px, -18, 34, 208, 5); fillStroke(ctx, darken(col, 0.2), 3);
      rrc(ctx, px, -108, 28, 14, 3); fillStroke(ctx, '#173018', 2.5);
      text(ctx, '1.50', px, -107.5, 10, '#7dff9a', { font: 'monospace' });
      for (let r2 = 0; r2 < 4; r2++) for (let c2 = 0; c2 < 3; c2++) {
        rrc(ctx, px - 9 + c2 * 9, -86 + r2 * 10, 7, 7, 1.5); fillStroke(ctx, '#e8edf1', 1.6);
      }
      rrc(ctx, px, -26, 16, 22, 3); fillStroke(ctx, '#c9d0d6', 2.5);
      ctx.fillStyle = '#25272c'; ctx.fillRect(px - 1.2, -33, 2.4, 14);
      rrc(ctx, px, 6, 24, 10, 2); fillStroke(ctx, '#c9d0d6', 2.5);
      ctx.fillStyle = '#25272c'; ctx.fillRect(px - 9, 5, 18, 2);
      rrc(ctx, px, 54, 18, 16, 3); fillStroke(ctx, '#25272c', 2.5);
      // pickup flap
      rrc(ctx, wx, 122, ww, 30, 4); fillStroke(ctx, '#202227', 3);
      text(ctx, 'PUSH', wx, 123, 11, 'rgba(255,255,255,0.75)');
      gloss(ctx, wx - 48, 110, 96, 2.5, 0.25);
    },
  },
};

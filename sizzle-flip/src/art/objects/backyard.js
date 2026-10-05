// Backyard BBQ props — sunny suburban yard: grill, garden gnome, good boy & co.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, smoothPath, vgrad, hgrad, rgrad, toonBox, toonCircle, rod, gloss, rng, text,
} from '../common.js';
import { woodGrain } from './shared.js';
import { motionAt } from '../../physics.js';
import { fireTongues, sparkle } from './living.js';

const TAU = Math.PI * 2;
const pick = (arr, v) => arr[(((v || 0) % arr.length) + arr.length) % arr.length];

// Vertical wood grain for upright boards.
function vGrain(ctx, x, y, w, h, color, seed = 1) {
  const r = rng(seed);
  ctx.save();
  rrPath(ctx, x, y, w, h, 3); ctx.clip();
  ctx.strokeStyle = rgba(darken(color, 0.5), 0.22); ctx.lineWidth = 1.5;
  const n = Math.max(2, Math.floor(w / 7));
  for (let i = 0; i < n; i++) {
    const xx = x + (i + 0.5) * w / n + (r() - 0.5) * 2;
    ctx.beginPath(); ctx.moveTo(xx, y - 2);
    const segs = Math.max(2, Math.floor(h / 50));
    for (let k = 1; k <= segs; k++) ctx.lineTo(xx + (r() - 0.5) * 3, y + k * h / segs);
    ctx.stroke();
  }
  if (h > 80 && w > 14) { ellipsePath(ctx, x + w * (0.3 + r() * 0.4), y + h * (0.2 + r() * 0.6), 2.5, 6); ctx.stroke(); }
  ctx.restore();
}

function grassTuft(ctx, x, y, s = 1, col = '#5cb85c') {
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y);
  ctx.quadraticCurveTo(x - 9 * s, y - 8 * s, x - 13 * s, y - 15 * s);
  ctx.quadraticCurveTo(x - 4 * s, y - 9 * s, x - 3 * s, y - 4 * s);
  ctx.quadraticCurveTo(x - 2 * s, y - 14 * s, x + 1 * s, y - 20 * s);
  ctx.quadraticCurveTo(x + 4 * s, y - 12 * s, x + 3 * s, y - 4 * s);
  ctx.quadraticCurveTo(x + 7 * s, y - 10 * s, x + 13 * s, y - 13 * s);
  ctx.quadraticCurveTo(x + 9 * s, y - 6 * s, x + 10 * s, y);
  ctx.closePath();
  fillStroke(ctx, col, 2.5);
}

function leaf(ctx, x, y, a, len, col = '#5bb072', lw = 2.5) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0); ctx.closePath();
  fillStroke(ctx, col, lw);
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.8, 0); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(darken(col, 0.5), 0.6); ctx.stroke();
  ctx.restore();
}

export const BACKYARD_ART = {
  grill: {
    draw(ctx, o, t, st) {
      const on = st ? !!st.on : true;
      const warn = st ? (st.warn || 0) : 0;
      const col = pick(['#d8412f', '#2f3540', '#d8412f', '#2d7f5e'], o.v);
      // legs + wheel
      rod(ctx, -40, 26, -60, 84, 7, '#4a4f57');
      rod(ctx, 40, 26, 60, 86, 7, '#4a4f57');
      rod(ctx, -50, 58, 50, 58, 4, '#4a4f57');
      toonCircle(ctx, -60, 82, 9, '#2b2b2b', { lw: 3, spec: false });
      circlePath(ctx, -60, 82, 3.5); ctx.fillStyle = '#9aa3ab'; ctx.fill();
      rrc(ctx, 60, 87, 14, 6, 3); fillStroke(ctx, '#2b2b2b', 2.5);
      // side handles
      for (const s of [-1, 1]) { rrc(ctx, s * 86, -20, 16, 9, 4); fillStroke(ctx, '#7a4a2a', 3); }
      // kettle bowl
      const bowl = () => {
        ctx.beginPath(); ctx.moveTo(-80, -32); ctx.lineTo(80, -32); ctx.lineTo(58, 22);
        ctx.quadraticCurveTo(55, 30, 46, 30); ctx.lineTo(-46, 30); ctx.quadraticCurveTo(-55, 30, -58, 22); ctx.closePath();
      };
      bowl(); ctx.fillStyle = vgrad(ctx, -32, 30, [[0, lighten(col, 0.1)], [1, darken(col, 0.25)]]); ctx.fill();
      ctx.save(); bowl(); ctx.clip();
      ctx.fillStyle = rgba(lighten(col, 0.7), 0.35); ctx.fillRect(-70, -28, 120, 6);
      ctx.beginPath(); ctx.moveTo(-60, -24); ctx.lineTo(-48, -24); ctx.lineTo(-38, 26); ctx.lineTo(-48, 26); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
      ctx.restore();
      bowl(); strokeOnly(ctx);
      // vents + badge
      for (const vx of [-20, 0, 20]) { circlePath(ctx, vx, 16, 3.4); ctx.fillStyle = '#1d1716'; ctx.fill(); }
      rrc(ctx, 0, -6, 46, 16, 8); fillStroke(ctx, '#f2c14e', 2.5);
      text(ctx, 'BBQ', 0, -5.5, 11, '#7a2a18');
      // grate (landing surface) with glowing coals beneath
      const glowK = on ? 1 : warn > 0 ? 0.35 + 0.65 * warn * (0.6 + 0.4 * Math.sin(t * 30)) : 0.22;
      toonBox(ctx, 0, -40, 160, 16, 4, '#3a3d42', { hi: 0.25 });
      ctx.save(); rrc(ctx, 0, -40, 152, 10, 3); ctx.clip();
      for (let x = -72; x <= 72; x += 10) {
        const g = 0.5 + 0.5 * Math.sin(t * 6 + x * 0.3);
        ctx.fillStyle = mix('#7a1d08', mix('#ff6a1f', '#ffd36a', g), glowK);
        ctx.fillRect(x - 2.5, -45, 5, 10);
      }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-76, -47); ctx.lineTo(76, -47); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
      // flames / tells / smoke above the grate
      if (on) {
        ctx.fillStyle = rgrad(ctx, 0, -50, 10, 110, [[0, 'rgba(255,170,60,0.45)'], [1, 'rgba(255,120,40,0)']]);
        ctx.fillRect(-110, -150, 220, 110);
        fireTongues(ctx, 0, 70, -46, 66, t, 1, 1.3);
      } else if (warn > 0) {
        const fl = 0.78 + 0.22 * Math.sin(t * 34);
        ctx.fillStyle = rgrad(ctx, 0, -48, 6, 90, [[0, `rgba(255,110,30,${0.75 * warn * fl})`], [1, 'rgba(255,110,30,0)']]);
        ctx.fillRect(-100, -130, 200, 90);
        fireTongues(ctx, 0, 64, -46, 56, t * 1.5, (0.22 + 0.45 * warn) * fl, 2.1);
        for (let i = 0; i < 4; i++) {
          const ph = (t * 1.7 + i * 0.25) % 1;
          circlePath(ctx, -45 + i * 30 + Math.sin(t * 9 + i) * 6, -50 - ph * 50, 2.2 * (1 - ph) + 0.8); ctx.fillStyle = rgba('#ffd36a', (1 - ph) * warn); ctx.fill();
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.32 + i / 3) % 1;
          const sx = -36 + i * 36 + Math.sin(ph * 5 + i) * 9, sy = -54 - ph * 70;
          circlePath(ctx, sx, sy, 6 + ph * 12); ctx.fillStyle = `rgba(215,215,222,${0.55 * (1 - ph)})`; ctx.fill();
        }
      }
    },
  },

  picnictable: {
    draw(ctx, o) {
      const w = o.w || 300, h = o.h || 160;
      const wood = '#c98a4b';
      const ty = -h / 2;
      // A-frame legs
      for (const [lx, a] of [[-w / 2 + 40, 0.15], [w / 2 - 40, -0.15]]) {
        ctx.save(); ctx.translate(lx, 10); ctx.rotate(a);
        toonBox(ctx, 0, 0, 18, h - 20, 3, darken(wood, 0.12));
        vGrain(ctx, -7, -(h - 20) / 2 + 3, 14, h - 26, darken(wood, 0.12), lx | 0);
        circlePath(ctx, 0, -(h - 20) / 2 + 12, 2.6); ctx.fillStyle = '#5a5552'; ctx.fill();
        ctx.restore();
      }
      // tabletop
      toonBox(ctx, 0, ty + 10, w, 20, 4, wood);
      woodGrain(ctx, -w / 2 + 3, ty + 2, w - 6, 16, wood, w + h);
      rrc(ctx, 0, ty + 10, w, 20, 4); strokeOnly(ctx);
      // gingham tablecloth
      const cw = w - 36;
      const cloth = pick(['#e0453a', '#3e8ed0', '#e0453a', '#4fa37a'], o.v);
      const hem = ty + 30;
      const clothPath = () => {
        ctx.beginPath();
        ctx.moveTo(-cw / 2, ty - 1); ctx.lineTo(cw / 2, ty - 1);
        ctx.quadraticCurveTo(cw / 2 + 4, ty + 14, cw / 2 + 6, hem + 4);
        const n = Math.max(4, Math.round(cw / 34));
        for (let i = 0; i < n; i++) {
          const x0 = cw / 2 + 6 - (i + 1) * (cw + 12) / n;
          ctx.quadraticCurveTo(x0 + (cw + 12) / n / 2, hem + (i % 2 ? 9 : 2), x0, hem + 4);
        }
        ctx.quadraticCurveTo(-cw / 2 - 4, ty + 14, -cw / 2, ty - 1);
        ctx.closePath();
      };
      clothPath(); ctx.fillStyle = '#fffaf2'; ctx.fill();
      ctx.save(); clothPath(); ctx.clip();
      ctx.fillStyle = rgba(cloth, 0.45);
      for (let x = -cw / 2 - 10; x < cw / 2 + 10; x += 16) ctx.fillRect(x, ty - 4, 8, 50);
      for (let y = ty + 2; y < hem + 14; y += 16) ctx.fillRect(-cw / 2 - 10, y, cw + 20, 8);
      ctx.fillStyle = rgba(darken(cloth, 0.6), 0.18); ctx.fillRect(-cw / 2 - 10, hem - 6, cw + 20, 20);
      ctx.strokeStyle = rgba(darken(cloth, 0.6), 0.25); ctx.lineWidth = 2;
      for (let k = -2; k <= 2; k++) { if (!k) continue; const fx = k * cw / 6; ctx.beginPath(); ctx.moveTo(fx, ty + 6); ctx.quadraticCurveTo(fx + 3, ty + 20, fx - 2, hem + 4); ctx.stroke(); }
      ctx.restore();
      clothPath(); strokeOnly(ctx, 3.5);
    },
  },

  lawnchair: {
    draw(ctx, o) {
      const frame = '#c9d2da';
      const web = pick([['#2fa6a0', '#ffffff', '#f2b134'], ['#e0453a', '#ffffff', '#3e8ed0'], ['#5bb072', '#ffffff', '#f2b134']], o.v);
      // legs
      rod(ctx, -50, 4, -60, 56, 7, frame);
      rod(ctx, 50, 4, 60, 56, 7, frame);
      for (const s of [-1, 1]) { rrc(ctx, s * 61, 59, 14, 7, 3); fillStroke(ctx, '#2b2b2b', 2.5); }
      // backrest frame + webbing
      const bx0 = -55, by0 = 0, bx1 = -40, by1 = -55;
      const ang = Math.atan2(by1 - by0, bx1 - bx0), len = Math.hypot(bx1 - bx0, by1 - by0);
      ctx.save(); ctx.translate(bx0, by0); ctx.rotate(ang);
      rrPath(ctx, -4, -6, len + 8, 12, 6); ctx.fillStyle = web[0]; ctx.fill();
      ctx.save(); rrPath(ctx, -4, -6, len + 8, 12, 6); ctx.clip();
      for (let k = 0; k < 6; k++) { ctx.fillStyle = web[1 + (k % 2)]; ctx.fillRect(2 + k * 10, -7, 5, 14); }
      ctx.restore();
      rrPath(ctx, -4, -6, len + 8, 12, 6); strokeOnly(ctx, 3.5);
      ctx.restore();
      // seat webbing (bouncy)
      rrPath(ctx, -56, -7, 112, 14, 5); ctx.fillStyle = web[0]; ctx.fill();
      ctx.save(); rrPath(ctx, -56, -7, 112, 14, 5); ctx.clip();
      for (let k = 0; k < 10; k++) { ctx.fillStyle = web[1 + (k % 2)]; ctx.fillRect(-50 + k * 11, -8, 6, 16); }
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(-60, 2, 120, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-60, -6, 120, 2.5);
      ctx.restore();
      rrPath(ctx, -56, -7, 112, 14, 5); strokeOnly(ctx);
      for (const s of [-1, 1]) { circlePath(ctx, s * 50, 0, 2.6); ctx.fillStyle = '#7d868e'; ctx.fill(); }
    },
  },

  gnome: {
    draw(ctx, o) {
      const v = (o.v || 0) % 3;
      const hat = ['#e0453a', '#3e8ed0', '#e0453a'][v];
      const coat = ['#3e8ed0', '#e0453a', '#5bb072'][v];
      // boots
      for (const s of [-1, 1]) { ellipsePath(ctx, s * 14, 49, 15, 6.5); fillStroke(ctx, '#4a3326', 3); }
      // coat
      ctx.beginPath(); ctx.moveTo(-26, 4); ctx.lineTo(26, 4); ctx.quadraticCurveTo(31, 26, 30, 44); ctx.quadraticCurveTo(0, 50, -30, 44); ctx.quadraticCurveTo(-31, 26, -26, 4); ctx.closePath();
      fillStroke(ctx, coat);
      rrc(ctx, 0, 34, 58, 7, 2); fillStroke(ctx, '#6b4a2a', 2.5);
      rrc(ctx, 0, 34, 11, 9, 2); fillStroke(ctx, '#f2c14e', 2);
      // mittens
      for (const s of [-1, 1]) { toonCircle(ctx, s * 24, 25, 6, '#f2c14e', { lw: 2.5, spec: false }); }
      // face
      circlePath(ctx, 0, 6, 14); fillStroke(ctx, '#f6c7a1', 3);
      // beard
      ctx.beginPath(); ctx.moveTo(-17, 6);
      ctx.quadraticCurveTo(-24, 22, -12, 34); ctx.quadraticCurveTo(-8, 42, 0, 44); ctx.quadraticCurveTo(8, 42, 12, 34); ctx.quadraticCurveTo(24, 22, 17, 6);
      ctx.quadraticCurveTo(8, 14, 0, 12); ctx.quadraticCurveTo(-8, 14, -17, 6); ctx.closePath();
      fillStroke(ctx, '#fbf7ee', 3);
      ctx.strokeStyle = rgba(INK, 0.25); ctx.lineWidth = 1.6;
      for (const bx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(bx, 18); ctx.quadraticCurveTo(bx + 2, 28, bx * 0.6, 38); ctx.stroke(); }
      // moustache + nose
      for (const s of [-1, 1]) { ellipsePath(ctx, s * 7, 13, 8, 4, s * 0.3); fillStroke(ctx, '#fbf7ee', 2.4); }
      toonCircle(ctx, 0, 8, 6.5, '#f48b7a', { lw: 2.6 });
      // happy closed eyes + cheeks
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 8, 3, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      // hat (matches the pointed collision)
      ctx.beginPath(); ctx.moveTo(-31, 1); ctx.quadraticCurveTo(-16, -26, 0, -55); ctx.quadraticCurveTo(14, -28, 31, 1); ctx.quadraticCurveTo(0, -6, -31, 1); ctx.closePath();
      ctx.fillStyle = hat; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(darken(hat, 0.5), 0.28); ctx.beginPath(); ctx.moveTo(4, -50); ctx.lineTo(34, 4); ctx.lineTo(10, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(lighten(hat, 0.6), 0.4); ctx.beginPath(); ctx.moveTo(-3, -46); ctx.lineTo(-14, -14); ctx.lineTo(-9, -14); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-31, 1); ctx.quadraticCurveTo(-16, -26, 0, -55); ctx.quadraticCurveTo(14, -28, 31, 1); ctx.quadraticCurveTo(0, -6, -31, 1); ctx.closePath();
      strokeOnly(ctx);
      // little ceramic gloss
      sparkle(ctx, -10, -24, 4, '#ffffff', 0.85);
    },
  },

  birdbath: {
    draw(ctx, o, t) {
      const stone = '#b8b2a6';
      // plinth + pedestal
      toonBox(ctx, 0, 69, 80, 14, 5, darken(stone, 0.08));
      ctx.beginPath(); ctx.moveTo(-24, 63); ctx.quadraticCurveTo(-15, 56, -15, 46); ctx.lineTo(-15, -12); ctx.quadraticCurveTo(-15, -20, -24, -23);
      ctx.lineTo(24, -23); ctx.quadraticCurveTo(15, -20, 15, -12); ctx.lineTo(15, 46); ctx.quadraticCurveTo(15, 56, 24, 63); ctx.closePath();
      ctx.fillStyle = hgrad(ctx, -24, 24, [[0, darken(stone, 0.12)], [0.35, lighten(stone, 0.25)], [1, darken(stone, 0.2)]]); ctx.fill(); strokeOnly(ctx);
      rrc(ctx, 0, 12, 36, 8, 4); fillStroke(ctx, lighten(stone, 0.1), 3);
      // moss
      ctx.fillStyle = rgba('#6aa84f', 0.7); ellipsePath(ctx, -8, 58, 10, 3); ctx.fill(); ellipsePath(ctx, 10, 30, 3, 6); ctx.fill();
      // basin interior + water
      ctx.beginPath(); ctx.moveTo(-50, -68); ctx.lineTo(-57, -37); ctx.lineTo(57, -37); ctx.lineTo(50, -68); ctx.closePath();
      ctx.fillStyle = darken(stone, 0.35); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -63, -37, [[0, '#8fd8f2'], [1, '#3f9fd0']]);
      ctx.beginPath(); ctx.moveTo(-60, -36);
      for (let x = -60; x <= 60; x += 6) ctx.lineTo(x, -62 + Math.sin(x * 0.15 + t * 2) * 1.2);
      ctx.lineTo(60, -36); ctx.closePath(); ctx.fill();
      ctx.restore();
      // basin stone (U-shape)
      const basin = () => {
        ctx.beginPath();
        ctx.moveTo(-50, -68);
        ctx.quadraticCurveTo(-57, -76, -66, -71);
        ctx.lineTo(-74, -34);
        ctx.quadraticCurveTo(-73, -23, -60, -23);
        ctx.lineTo(60, -23);
        ctx.quadraticCurveTo(73, -23, 74, -34);
        ctx.lineTo(66, -71);
        ctx.quadraticCurveTo(57, -76, 50, -68);
        ctx.lineTo(57, -37); ctx.lineTo(-57, -37);
        ctx.closePath();
      };
      basin(); ctx.fillStyle = stone; ctx.fill();
      ctx.save(); basin(); ctx.clip();
      ctx.fillStyle = rgba(darken(stone, 0.5), 0.25); ctx.fillRect(-80, -32, 160, 12);
      ctx.fillStyle = rgba('#ffffff', 0.3); ctx.fillRect(-70, -40, 140, 2.5);
      ctx.fillStyle = rgba('#6aa84f', 0.6); ellipsePath(ctx, -64, -30, 9, 4); ctx.fill();
      ctx.restore();
      basin(); strokeOnly(ctx);
      // scalloped trim on the bowl underside
      ctx.strokeStyle = rgba(INK, 0.3); ctx.lineWidth = 1.8;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(k * 18, -30, 7, 0, Math.PI); ctx.stroke(); }
      // little bluebird on the rim
      ctx.save(); ctx.translate(60, -74);
      ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(18, -16); ctx.lineTo(14, -4); ctx.closePath(); fillStroke(ctx, '#3e7cc9', 2.5);
      ellipsePath(ctx, 2, -8, 11, 8); fillStroke(ctx, '#5aa9e6', 3);
      ellipsePath(ctx, 0, -5, 7, 4); ctx.fillStyle = '#ffd9b0'; ctx.fill();
      const peck = Math.max(0, Math.sin(t * 2.4)) * 0;
      toonCircle(ctx, -7, -16 + peck, 6.5, '#5aa9e6', { lw: 3, spec: false });
      ctx.beginPath(); ctx.moveTo(-12, -17); ctx.lineTo(-19, -14); ctx.lineTo(-12, -13); ctx.closePath(); fillStroke(ctx, '#f2b134', 1.8);
      circlePath(ctx, -8, -18, 1.6); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, -9); ctx.quadraticCurveTo(10, -4, 6, 0); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(INK, 0.6); ctx.stroke();
      ctx.restore();
    },
    front(ctx, o, t) {
      // water veil over anything that falls in
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-50, -68); ctx.lineTo(-57, -37); ctx.lineTo(57, -37); ctx.lineTo(50, -68); ctx.closePath(); ctx.clip();
      ctx.fillStyle = 'rgba(90,180,230,0.42)';
      ctx.beginPath(); ctx.moveTo(-60, -36);
      for (let x = -60; x <= 60; x += 6) ctx.lineTo(x, -59 + Math.sin(x * 0.15 + t * 2 + 1) * 1.2);
      ctx.lineTo(60, -36); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-60, -59); for (let x = -60; x <= 60; x += 6) ctx.lineTo(x, -59 + Math.sin(x * 0.15 + t * 2 + 1) * 1.2);
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(230,250,255,0.85)'; ctx.stroke();
      ctx.restore();
      // front lips
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 50, -68); ctx.quadraticCurveTo(s * 57, -76, s * 66, -71); ctx.lineTo(s * 74, -34); ctx.lineTo(s * 57, -37); ctx.closePath();
        fillStroke(ctx, '#b8b2a6');
        ctx.beginPath(); ctx.moveTo(s * 66, -71); ctx.lineTo(s * 74, -34); strokeOnly(ctx);
      }
      sparkle(ctx, -28, -62, 4.5, '#ffffff', 0.9);
      sparkle(ctx, 30, -60, 3.5, '#ffffff', 0.7);
    },
  },

  trampoline: {
    draw(ctx, o, t, st) {
      const pad = pick(['#3e8ed0', '#e0453a', '#5bb072'], o.v);
      const pad2 = '#f5c045';
      // legs (W-shaped tubes) — collision capsules at x=±90
      for (const s of [-1, 1]) {
        rod(ctx, s * 90, -20, s * 90, 32, 8, '#9aa3ab');
        rrc(ctx, s * 90, 35, 18, 7, 3); fillStroke(ctx, '#2b2b2b', 2.5);
      }
      // mat underside + springs
      ctx.beginPath(); ctx.moveTo(-82, -20); ctx.quadraticCurveTo(0, 2, 82, -20); ctx.closePath();
      fillStroke(ctx, '#2b2f36', 3);
      ctx.strokeStyle = '#c9d2da'; ctx.lineWidth = 2;
      for (let x = -76; x <= 76; x += 12) {
        const yb = -20 + (1 - (x / 82) ** 2) * 9;
        ctx.beginPath();
        for (let k = 0; k <= 4; k++) ctx.lineTo(x + (k % 2 ? 3 : -3), -20 + (yb + 20) * k / 4);
        ctx.stroke();
      }
      // padded frame (landing surface)
      rrPath(ctx, -100, -30, 200, 12, 6); ctx.fillStyle = pad; ctx.fill();
      ctx.save(); rrPath(ctx, -100, -30, 200, 12, 6); ctx.clip();
      for (let x = -100; x < 100; x += 40) { ctx.fillStyle = pad2; ctx.fillRect(x + 20, -32, 20, 16); }
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-100, -29, 200, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-100, -22, 200, 5);
      ctx.restore();
      rrPath(ctx, -100, -30, 200, 12, 6); strokeOnly(ctx);
      for (const sx of [-60, -20, 20, 60]) sparkle(ctx, sx + 10, -24, 3.2, '#ffffff', 0.9);
      // boing lines when recently bounced
      const hit = st && st.hit ? st.hit : 0;
      if (hit > 0.05) {
        ctx.strokeStyle = rgba('#ffffff', hit); ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 110, -30, 10, s > 0 ? -1 : Math.PI - 0.4, s > 0 ? 0.4 : Math.PI + 1); ctx.stroke(); }
      }
    },
  },

  swing: {
    draw(ctx, o, t) {
      // ropes up to the pivot (0,-260)
      const ropes = [[-48, -2, -5, -252], [48, -2, 5, -252]];
      ctx.lineCap = 'round';
      for (const [x0, y0, x1, y1] of ropes) {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.lineWidth = 5 + LW * 1.2; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = '#d9b87a'; ctx.stroke();
        ctx.save(); ctx.setLineDash([3, 5]); ctx.lineWidth = 5; ctx.strokeStyle = rgba('#8a6a3a', 0.55); ctx.stroke(); ctx.restore();
      }
      // top: ring + hook, and a leafy tuft that stays put (counter-rotated)
      const m = motionAt(o.move, t, {});
      const A = (o.a || 0) + m.da;
      ctx.save(); ctx.translate(0, -260);
      if (o.flip) { ctx.rotate(A); ctx.scale(-1, 1); } else ctx.rotate(-A);
      const tuft = [[-34, -10, 18, '#4f9a45'], [32, -12, 18, '#4f9a45'], [-14, -22, 22, '#5cb052'], [14, -24, 21, '#5cb052'], [0, -12, 22, '#6cc25e']];
      for (const [lx, ly, lr, lc] of tuft) { circlePath(ctx, lx, ly, lr); fillStroke(ctx, lc, 3.5); }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ellipsePath(ctx, -6, -30, 12, 5, -0.2); ctx.fill();
      rrc(ctx, 0, -2, 22, 12, 6); fillStroke(ctx, '#8a5a36', 3);
      for (const [lx, ly, a] of [[-44, 2, 2.5], [42, 0, 0.6], [-20, 6, 1.9], [20, 6, 1.2]]) leaf(ctx, lx, ly, a, 15, '#6cc25e', 2.2);
      ctx.restore();
      circlePath(ctx, 0, -254, 6); ctx.lineWidth = 3 + LW; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#c9d2da'; ctx.stroke();
      // seat
      const col = pick(['#e0533d', '#3e8ed0', '#f2b134'], o.v);
      toonBox(ctx, 0, 0, 120, 16, 5, col);
      ctx.save(); rrc(ctx, 0, 0, 120, 16, 5); ctx.clip();
      ctx.fillStyle = rgba('#ffffff', 0.85);
      for (const sx of [-20, 0, 20]) { circlePath(ctx, sx, 1, 2.6); ctx.fill(); }
      ctx.restore();
      // rope wraps around the seat ends
      for (const s of [-1, 1]) {
        rrc(ctx, s * 48, 0, 9, 22, 3); fillStroke(ctx, '#d9b87a', 3);
        ctx.strokeStyle = rgba('#8a6a3a', 0.7); ctx.lineWidth = 1.5;
        for (const dy of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(s * 48 - 4, dy - 2); ctx.lineTo(s * 48 + 4, dy + 2); ctx.stroke(); }
      }
    },
  },

  fence: {
    draw(ctx, o) {
      const w = o.w || 40, h = o.h || 240;
      const paint = pick(['#f4efe6', '#c9874c', '#f4efe6', '#9fc8e0'], o.v);
      const shape = () => polyPath(ctx, [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2 + 14], [0, -h / 2], [-w / 2, -h / 2 + 14]]);
      shape(); ctx.fillStyle = paint; ctx.fill();
      ctx.save(); shape(); ctx.clip();
      const n = Math.max(1, Math.round(w / 40));
      const pw = w / n;
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + i * pw;
        vGrain(ctx, x0 + 2, -h / 2, pw - 4, h, paint, i * 7 + h);
        if (i > 0) { ctx.beginPath(); ctx.moveTo(x0, -h / 2); ctx.lineTo(x0, h / 2); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.45); ctx.stroke(); }
        // nails where the (hidden) rails are
        for (const ny of [-h / 4, h / 4]) {
          for (const nx of [x0 + pw * 0.3, x0 + pw * 0.7]) { circlePath(ctx, nx, ny, 2.2); ctx.fillStyle = '#7d7470'; ctx.fill(); }
        }
      }
      // weathering: shade on one side + chipped paint
      ctx.fillStyle = rgba(darken(paint, 0.5), 0.16); ctx.fillRect(w / 2 - Math.min(10, w * 0.25), -h, 20, h * 2);
      ctx.fillStyle = rgba(darken(paint, 0.5), 0.2); ctx.fillRect(-w, h / 2 - 30, w * 2, 30);
      ctx.fillStyle = rgba('#ffffff', 0.35); ctx.fillRect(-w / 2 + 3, -h / 2, 3, h);
      if (paint === '#f4efe6' || paint === '#9fc8e0') {
        ctx.fillStyle = '#b98252';
        const r = rng(h + w);
        for (let k = 0; k < 3; k++) { ellipsePath(ctx, -w / 2 + 6 + r() * (w - 12), -h / 2 + 30 + r() * (h - 60), 3 + r() * 2, 1.6 + r()); ctx.fill(); }
      }
      ctx.restore();
      shape(); strokeOnly(ctx);
      // grass tufts at the foot
      grassTuft(ctx, -w / 2 + 2, h / 2 + 1, 0.9, '#5cb85c');
      grassTuft(ctx, w / 2 - 4, h / 2 + 1, 0.75, '#6cc56a');
    },
  },

  cooler: {
    draw(ctx, o) {
      const body = pick(['#e0453a', '#3577c9', '#2fa6a0'], o.v);
      // body
      rrPath(ctx, -70, -30, 140, 78, 10); ctx.fillStyle = body; ctx.fill();
      ctx.save(); rrPath(ctx, -70, -30, 140, 78, 10); ctx.clip();
      ctx.fillStyle = rgba(darken(body, 0.55), 0.3); ctx.fillRect(-70, 26, 140, 30);
      ctx.fillStyle = rgba(lighten(body, 0.6), 0.35); ctx.fillRect(-64, -22, 128, 5);
      // ridges
      ctx.fillStyle = rgba(darken(body, 0.5), 0.25); ctx.fillRect(-70, 36, 140, 3);
      ctx.restore();
      rrPath(ctx, -70, -30, 140, 78, 10); strokeOnly(ctx);
      // recessed grips
      for (const s of [-1, 1]) { rrc(ctx, s * 56, 0, 12, 22, 5); fillStroke(ctx, darken(body, 0.35), 2.5); }
      // label
      rrc(ctx, 0, 10, 62, 26, 6); fillStroke(ctx, '#ffffff', 3);
      ctx.save(); ctx.translate(-18, 10);
      ctx.strokeStyle = '#5ab4e6'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -8, Math.sin(a) * -8); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke(); }
      ctx.restore();
      text(ctx, 'ICE', 9, 5, 10, '#3577c9');
      text(ctx, 'COLD', 9, 16, 9, '#3577c9');
      // drain plug + condensation
      circlePath(ctx, 54, 36, 4); fillStroke(ctx, '#f4f4f0', 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [dx, dy] of [[-44, 24], [-38, 34], [36, -14], [28, 28]]) { ellipsePath(ctx, dx, dy, 2, 3); ctx.fill(); }
      // lid (landing surface)
      toonBox(ctx, 0, -38, 140, 22, 8, '#f4f4f0');
      rrc(ctx, 0, -27, 26, 12, 4); fillStroke(ctx, '#f4f4f0', 3);
      ctx.beginPath(); ctx.moveTo(-50, -45); ctx.lineTo(50, -45); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    },
  },

  leafblower: {
    draw(ctx, o, t) {
      const shell = pick(['#f08a24', '#e0453a', '#f2b134'], o.v);
      const j = Math.sin(t * 70) * 0.6;
      // wind stream (subtle — particles do the heavy lifting)
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const yy = -6 + (i - 2) * 14;
        const off = ((t * 520 + i * 90) % 260);
        const x0 = 60 + off, len = 40 + (i % 2) * 24;
        const a = 0.42 * Math.sin(Math.min(1, off / 260) * Math.PI);
        ctx.beginPath(); ctx.moveTo(x0, yy - off * 0.06); ctx.quadraticCurveTo(x0 + len * 0.5, yy - off * 0.06 - 4, x0 + len, yy - (off + len) * 0.06);
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i * 0.33) % 1;
        const lx = 64 + ph * 300, ly = -14 + i * 12 - ph * 26 + Math.sin(t * 6 + i) * 6;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
        leaf(ctx, lx, ly, t * 8 + i * 2, 12, pick(['#e8a33a', '#d9573b', '#8cc63f'], i), 2);
      }
      ctx.restore();
      ctx.save(); ctx.translate(j, 0);
      // nozzle tube
      ctx.beginPath(); ctx.moveTo(20, -8); ctx.lineTo(56, -6); ctx.lineTo(56, 12); ctx.lineTo(20, 16); ctx.closePath();
      fillStroke(ctx, '#3a3d42');
      rrc(ctx, 56, 3, 8, 22, 3); fillStroke(ctx, shell, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(24, -5, 28, 3);
      // handle loop on top
      ctx.beginPath(); ctx.moveTo(-36, -18); ctx.quadraticCurveTo(-34, -30, -16, -30); ctx.lineTo(4, -30); ctx.quadraticCurveTo(16, -30, 16, -18);
      ctx.lineWidth = 8 + LW * 1.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = '#2f3237'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(8, -23); ctx.lineWidth = 5; ctx.strokeStyle = '#e0453a'; ctx.stroke();
      // engine housing (collision body)
      toonBox(ctx, -10, 0, 80, 46, 12, shell);
      // cooling fins
      ctx.strokeStyle = rgba(darken(shell, 0.6), 0.45); ctx.lineWidth = 2.4;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(4 + k * 6, -14); ctx.lineTo(4 + k * 6, 12); ctx.stroke(); }
      // spinning intake fan
      toonCircle(ctx, -28, 2, 14, '#2f3237', { lw: 3, spec: false });
      ctx.save(); ctx.translate(-28, 2); ctx.rotate(t * 40);
      ctx.fillStyle = '#9aa3ab';
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(8, -3, 10, 2); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      circlePath(ctx, -28, 2, 3); ctx.fillStyle = '#e0453a'; ctx.fill();
      // fuel cap + pull cord
      rrc(ctx, -4, -24, 12, 6, 2); fillStroke(ctx, '#2f3237', 2.5);
      rrc(ctx, -46, 18, 6, 12, 2); fillStroke(ctx, '#2f3237', 2.5);
      text(ctx, 'WHOOSH', -2, 14, 8, '#ffffff', { stroke: 3 });
      ctx.restore();
    },
  },

  stump: {
    draw(ctx, o) {
      const bark = '#8b5a35';
      // root flare
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(-64, -38);
        ctx.lineTo(-63, 20);
        ctx.quadraticCurveTo(-66, 38, -72, 45);
        ctx.lineTo(-40, 45); ctx.quadraticCurveTo(-34, 38, -26, 45);
        ctx.lineTo(24, 45); ctx.quadraticCurveTo(34, 36, 42, 45);
        ctx.lineTo(72, 45);
        ctx.quadraticCurveTo(66, 38, 63, 20);
        ctx.lineTo(64, -38);
        ctx.closePath();
      };
      body(); ctx.fillStyle = bark; ctx.fill();
      ctx.save(); body(); ctx.clip();
      ctx.strokeStyle = rgba(darken(bark, 0.55), 0.55); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      const r = rng(17 + (o.v || 0));
      for (let k = 0; k < 9; k++) {
        const x = -56 + k * 14 + (r() - 0.5) * 4;
        ctx.beginPath(); ctx.moveTo(x, -30);
        ctx.bezierCurveTo(x + (r() - 0.5) * 8, -6, x + (r() - 0.5) * 8, 14, x + (r() - 0.5) * 6, 44); ctx.stroke();
      }
      ctx.fillStyle = rgba(darken(bark, 0.5), 0.3); ctx.fillRect(30, -40, 40, 90);
      ctx.fillStyle = rgba(lighten(bark, 0.5), 0.25); ctx.fillRect(-58, -40, 10, 90);
      // moss patch
      ctx.fillStyle = '#7cb342';
      ellipsePath(ctx, -50, 30, 14, 7); ctx.fill(); ellipsePath(ctx, -40, 36, 10, 6); ctx.fill();
      ctx.restore();
      body(); strokeOnly(ctx);
      // knot hole
      ellipsePath(ctx, 22, 4, 7, 10); fillStroke(ctx, '#4a2e1c', 3);
      // cut top with growth rings (landing surface)
      ellipsePath(ctx, 0, -35, 65, 10); fillStroke(ctx, '#e8c48a');
      ctx.save(); ellipsePath(ctx, 0, -35, 65, 10); ctx.clip();
      ctx.strokeStyle = rgba('#a8763e', 0.6); ctx.lineWidth = 1.6;
      for (const k of [0.82, 0.62, 0.44, 0.26]) { ellipsePath(ctx, 3, -35, 65 * k, 10 * k); ctx.stroke(); }
      circlePath(ctx, 3, -35, 2); ctx.fillStyle = '#a8763e'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -35); ctx.lineTo(40, -30); ctx.stroke();
      ctx.restore();
      ellipsePath(ctx, 0, -35, 65, 10); strokeOnly(ctx);
      // mushroom
      rrc(ctx, 52, 24, 6, 12, 2); fillStroke(ctx, '#fbf4e2', 2.4);
      ctx.beginPath(); ctx.moveTo(42, 20); ctx.quadraticCurveTo(52, 6, 62, 20); ctx.closePath(); fillStroke(ctx, '#e0453a', 2.4);
      circlePath(ctx, 49, 15, 1.8); ctx.fillStyle = '#fff'; ctx.fill(); circlePath(ctx, 55, 17, 1.4); ctx.fill();
    },
  },

  sprinkler: {
    draw(ctx, o, t) {
      // water jet straight up the wind column, fanning out at the top (subtle — particles add spray)
      ctx.save();
      const top = -340;
      ctx.beginPath(); ctx.moveTo(-3, -14);
      ctx.quadraticCurveTo(-6 + Math.sin(t * 9) * 1.5, -180, -14, top);
      ctx.lineTo(14, top);
      ctx.quadraticCurveTo(6 + Math.sin(t * 9 + 1) * 1.5, -180, 3, -14);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -14, top, [[0, 'rgba(120,200,240,0.55)'], [1, 'rgba(160,220,250,0.12)']]); ctx.fill();
      // rushing streaks
      ctx.save(); ctx.setLineDash([14, 22]); ctx.lineDashOffset = t * 520;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(-2, -180, -4, top + 10);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineDashOffset = t * 520 + 17;
      ctx.beginPath(); ctx.moveTo(1, -16); ctx.quadraticCurveTo(4, -180, 6, top + 10); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      // spray fan at the top: droplets arcing outward
      for (let i = 0; i < 10; i++) {
        const ph = (t * 1.1 + i * 0.1) % 1;
        const s = i % 2 ? 1 : -1;
        const spread = 8 + (i % 5) * 7;
        const dx = s * spread * ph * 1.6, dy = top - 18 * Math.sin(ph * Math.PI) + ph * ph * 30;
        circlePath(ctx, dx, dy, 2.6 * (1 - ph * 0.5)); ctx.fillStyle = `rgba(150,215,250,${0.7 * (1 - ph)})`; ctx.fill();
      }
      // mist bubbles along the jet
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.8 + i * 0.2) % 1;
        circlePath(ctx, Math.sin(t * 3 + i * 2) * (4 + ph * 8), -20 - ph * 300, 1.6 + ph * 2); ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`; ctx.fill();
      }
      ctx.restore();
      // nozzle turret
      rrc(ctx, 0, -9, 16, 14, 4); fillStroke(ctx, '#f5c542', 3);
      ctx.save(); ctx.translate(0, -15); ctx.scale(Math.cos(t * 14), 1);
      rrc(ctx, 0, 0, 22, 5, 2); fillStroke(ctx, '#e0a52a', 2);
      ctx.restore();
      // base (collision)
      ctx.beginPath(); ctx.moveTo(-35, 15); ctx.lineTo(-30, -2); ctx.quadraticCurveTo(-28, -5, -22, -5); ctx.lineTo(22, -5); ctx.quadraticCurveTo(28, -5, 30, -2); ctx.lineTo(35, 15); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -5, 15, [[0, '#56c46c'], [1, '#2f8f48']]); ctx.fill(); strokeOnly(ctx);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-24, -2, 40, 2.5);
      for (const s of [-1, 1]) { circlePath(ctx, s * 20, 7, 3); ctx.fillStyle = '#2a6e38'; ctx.fill(); }
      // hose stub
      ctx.beginPath(); ctx.moveTo(35, 10); ctx.quadraticCurveTo(46, 12, 52, 16); ctx.lineWidth = 7 + LW; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 7; ctx.strokeStyle = '#3f9e4f'; ctx.stroke();
    },
  },

  dog: {
    draw(ctx, o, t) {
      const pal = pick([
        { fur: '#e3a857', light: '#fbe3b8', ear: '#c27c35' },
        { fur: '#b9783f', light: '#ffffff', ear: '#4a3326', beagle: true },
        { fur: '#3f3a3c', light: '#6a6264', ear: '#2a2627' },
        { fur: '#ffffff', light: '#ffffff', ear: '#2a2627', spots: true },
      ], o.v);
      const wag = Math.sin(t * 16);
      // wagging tail (behind)
      ctx.save(); ctx.translate(34, 38); ctx.rotate(-0.9 + wag * 0.55);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(14, -6, 26, -2);
      ctx.lineWidth = 9 + LW * 1.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 9; ctx.strokeStyle = pal.beagle ? '#ffffff' : pal.fur; ctx.stroke();
      ctx.restore();
      // wag motion lines
      ctx.strokeStyle = rgba(INK, 0.35); ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const k of [0, 1]) { ctx.beginPath(); ctx.arc(36, 36, 34 + k * 6, -1.7, -0.9); ctx.stroke(); }
      // body + haunches
      const body = () => { ctx.beginPath(); ctx.moveTo(-26, 10); ctx.quadraticCurveTo(-42, 30, -40, 55); ctx.lineTo(40, 55); ctx.quadraticCurveTo(42, 30, 26, 10); ctx.closePath(); };
      body(); ctx.fillStyle = pal.fur; ctx.fill();
      ctx.save(); body(); ctx.clip();
      ctx.fillStyle = pal.beagle ? '#ffffff' : pal.light; ellipsePath(ctx, 0, 38, 16, 22); ctx.fill();
      if (pal.spots) { ctx.fillStyle = '#2a2627'; for (const [sx, sy, sr] of [[-26, 30, 5], [24, 42, 4], [-14, 48, 3], [30, 24, 3]]) { circlePath(ctx, sx, sy, sr); ctx.fill(); } }
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(-50, 44, 100, 12);
      ctx.restore();
      body(); strokeOnly(ctx);
      for (const s of [-1, 1]) { ellipsePath(ctx, s * 34, 46, 12, 10); fillStroke(ctx, pal.fur, 3.5); }
      // front paws
      for (const s of [-1, 1]) {
        ellipsePath(ctx, s * 13, 50, 11, 6.5); fillStroke(ctx, pal.beagle ? '#ffffff' : lighten(pal.fur, 0.15), 3);
        ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(s * 13 - 3, 47); ctx.lineTo(s * 13 - 3, 53); ctx.moveTo(s * 13 + 3, 47); ctx.lineTo(s * 13 + 3, 53); ctx.stroke();
      }
      // collar + tag
      ctx.beginPath(); ctx.moveTo(-24, 14); ctx.quadraticCurveTo(0, 24, 24, 14); ctx.lineWidth = 7 + LW; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = '#e0453a'; ctx.stroke();
      ctx.save(); ctx.translate(0, 26); ctx.rotate(Math.sin(t * 8) * 0.2);
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.arc(-6, -2, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.lineTo(6, -5); ctx.arc(6, -2, 3, -Math.PI * 0.5, Math.PI * 0.5); ctx.closePath();
      fillStroke(ctx, '#f2c14e', 2);
      ctx.restore();
      // ears (floppy, bobbing)
      const bob = Math.sin(t * 16 + 0.5) * 0.06;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * 26, -30); ctx.rotate(s * (0.25 + bob));
        ctx.beginPath(); ctx.moveTo(-8 * s, 0); ctx.quadraticCurveTo(14 * s, -4, 14 * s, 20); ctx.quadraticCurveTo(14 * s, 36, 2 * s, 34); ctx.quadraticCurveTo(-6 * s, 30, -8 * s, 0); ctx.closePath();
        fillStroke(ctx, pal.ear, 3.5);
        ctx.restore();
      }
      // head
      ellipsePath(ctx, 0, -6, 34, 28); ctx.fillStyle = pal.fur; ctx.fill();
      ctx.save(); ellipsePath(ctx, 0, -6, 34, 28); ctx.clip();
      if (pal.beagle) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-5, -34); ctx.lineTo(5, -34); ctx.lineTo(12, 0); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fill(); }
      if (pal.spots) { ctx.fillStyle = '#2a2627'; circlePath(ctx, -22, -28, 5); ctx.fill(); circlePath(ctx, 25, 2, 4); ctx.fill(); circlePath(ctx, 10, -30, 3); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ellipsePath(ctx, -10, -24, 16, 6, -0.2); ctx.fill();
      ctx.restore();
      ellipsePath(ctx, 0, -6, 34, 28); strokeOnly(ctx);
      // muzzle
      ellipsePath(ctx, 0, 6, 17, 12); fillStroke(ctx, pal.beagle ? '#ffffff' : pal.light, 3);
      // mouth open, tongue panting
      const pant = Math.sin(t * 9);
      ctx.beginPath(); ctx.moveTo(-9, 8); ctx.quadraticCurveTo(0, 22, 9, 8); ctx.closePath(); ctx.fillStyle = '#7a2a2a'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
      const tl = 13 + pant * 3;
      ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(-6, 12 + tl - 5); ctx.quadraticCurveTo(-6, 12 + tl + 2, 0, 12 + tl + 2); ctx.quadraticCurveTo(6, 12 + tl + 2, 6, 12 + tl - 5); ctx.lineTo(6, 12); ctx.closePath();
      fillStroke(ctx, '#f47a8f', 2.4);
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, 12 + tl - 3); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
      // drool drop
      const dp = (t * 0.6) % 1;
      if (dp > 0.5) { ellipsePath(ctx, 8, 24 + (dp - 0.5) * 30, 2.2, 3); ctx.fillStyle = 'rgba(190,230,255,0.9)'; ctx.fill(); }
      // nose
      ctx.beginPath(); ctx.moveTo(-7, -2); ctx.quadraticCurveTo(0, -6, 7, -2); ctx.quadraticCurveTo(6, 5, 0, 6); ctx.quadraticCurveTo(-6, 5, -7, -2); ctx.closePath();
      fillStroke(ctx, '#2a2223', 2.4);
      ellipsePath(ctx, -2, -1.5, 2.5, 1.4); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      // eyes (eager, with blink)
      const blink = ((t + (o.v || 0)) % 3.7) < 0.12;
      for (const s of [-1, 1]) {
        const ex = s * 13, ey = -14;
        if (blink) { ctx.beginPath(); ctx.moveTo(ex - 5, ey); ctx.lineTo(ex + 5, ey); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke(); continue; }
        ellipsePath(ctx, ex, ey, 6, 7); fillStroke(ctx, '#ffffff', 2.4);
        circlePath(ctx, ex + 1, ey + 1, 4); ctx.fillStyle = '#2a1a12'; ctx.fill();
        circlePath(ctx, ex + 2.5, ey - 1.5, 1.6); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(ex - 6, ey - 12 + s * 0); ctx.quadraticCurveTo(ex, ey - 16, ex + 6, ey - 12); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,120,120,0.3)'; ellipsePath(ctx, -22, 2, 5, 3); ctx.fill(); ellipsePath(ctx, 22, 2, 5, 3); ctx.fill();
    },
  },

  branch: {
    draw(ctx, o) {
      const w = o.w || 240;
      const bark = '#8a5a36';
      // hanging leaves (decorative, below)
      for (const [fx, a, l] of [[-w / 2 + 34, 1.9, 22], [-w / 2 + 48, 1.3, 18], [w / 2 - 44, 1.7, 22], [w / 2 - 30, 1.15, 18], [-10, 1.6, 16]]) {
        leaf(ctx, fx, 9, a, l, '#5cb052', 2.4);
      }
      // twig poking down-right
      ctx.beginPath(); ctx.moveTo(w / 2 - 70, 6); ctx.quadraticCurveTo(w / 2 - 58, 24, w / 2 - 50, 30);
      ctx.lineWidth = 5 + LW * 1.2; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = bark; ctx.stroke();
      leaf(ctx, w / 2 - 50, 30, 0.6, 18, '#6cc25e', 2.2);
      leaf(ctx, w / 2 - 54, 28, 2.2, 15, '#5cb052', 2.2);
      // bark body
      rrc(ctx, 0, 0, w, 22, 10); ctx.fillStyle = bark; ctx.fill();
      ctx.save(); rrc(ctx, 0, 0, w, 22, 10); ctx.clip();
      ctx.fillStyle = rgba(lighten(bark, 0.5), 0.3); ctx.fillRect(-w / 2, -11, w, 5);
      ctx.fillStyle = rgba(darken(bark, 0.5), 0.3); ctx.fillRect(-w / 2, 4, w, 8);
      const r = rng(w);
      ctx.strokeStyle = rgba(darken(bark, 0.6), 0.5); ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let x = -w / 2 + 14; x < w / 2 - 14; x += 18 + r() * 14) {
        const y = -4 + r() * 8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y + (r() - 0.5) * 4, x + 16 + r() * 10, y); ctx.stroke();
      }
      // moss on top
      ctx.fillStyle = '#7cb342';
      for (let x = -w / 2 + 30; x < w / 2 - 30; x += 50 + r() * 30) { ellipsePath(ctx, x, -10, 10 + r() * 6, 3.5); ctx.fill(); }
      ctx.restore();
      rrc(ctx, 0, 0, w, 22, 10); strokeOnly(ctx);
      // knot + cut end
      ellipsePath(ctx, -w * 0.18, 2, 5, 4); fillStroke(ctx, darken(bark, 0.35), 2.4);
      ellipsePath(ctx, w / 2 - 7, 0, 5, 9); fillStroke(ctx, '#e8c48a', 2.6);
      ellipsePath(ctx, w / 2 - 7, 0, 2.2, 4.5); ctx.strokeStyle = rgba('#a8763e', 0.8); ctx.lineWidth = 1.2; ctx.stroke();
      // tiny sprout on top
      ctx.beginPath(); ctx.moveTo(-w / 2 + 22, -10); ctx.quadraticCurveTo(-w / 2 + 20, -18, -w / 2 + 16, -22); ctx.lineWidth = 2.5; ctx.strokeStyle = '#4f8f3a'; ctx.stroke();
      leaf(ctx, -w / 2 + 16, -22, -2.4, 10, '#7cc45e', 1.8);
    },
  },
};

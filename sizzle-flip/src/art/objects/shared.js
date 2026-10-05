// Shared props: frying pan, hot dog bun, stove, generic supports.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, vgrad, hgrad, toonBox, toonCircle, rod, gloss, rng,
} from '../common.js';

const WOOD = '#c98a4b';

export function woodGrain(ctx, x, y, w, h, color, seed = 1) {
  const r = rng(seed);
  ctx.save();
  rrPath(ctx, x, y, w, h, 3); ctx.clip();
  ctx.strokeStyle = rgba(darken(color, 0.5), 0.22);
  ctx.lineWidth = 1.6;
  const n = Math.max(2, Math.floor(h / 7));
  for (let i = 0; i < n; i++) {
    const yy = y + (i + 0.5) * h / n + (r() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 2, yy);
    const segs = Math.max(2, Math.floor(w / 60));
    for (let k = 1; k <= segs; k++) {
      ctx.lineTo(x + k * w / segs, yy + (r() - 0.5) * 4);
    }
    ctx.stroke();
  }
  // a knot
  if (w > 80 && h > 14) {
    ellipsePath(ctx, x + w * (0.2 + r() * 0.6), y + h * (0.3 + r() * 0.4), 6, 3);
    ctx.stroke();
  }
  ctx.restore();
}

export const SHARED_ART = {
  pan: {
    draw(ctx) {
      // handle
      ctx.save();
      ctx.translate(112, -3); ctx.rotate(-0.12);
      rrc(ctx, 6, 0, 84, 14, 7); fillStroke(ctx, '#2b2626');
      rrc(ctx, 22, 0, 52, 12, 6); fillStroke(ctx, '#7a3b1e', 3);
      gloss(ctx, -2, -5, 60, 3, 0.25);
      circlePath(ctx, 44, 0, 3); ctx.fillStyle = INK; ctx.fill();
      ctx.restore();
      // body (outer)
      const body = [[-162, -20], [72, -20], [58, 25], [-148, 25]];
      polyPath(ctx, body);
      ctx.fillStyle = vgrad(ctx, -20, 25, [[0, '#4a4446'], [1, '#1e1b1c']]); ctx.fill();
      strokeOnly(ctx);
      // inner cooking surface (3/4 view)
      ellipsePath(ctx, -45, -16, 112, 11);
      ctx.fillStyle = vgrad(ctx, -27, -5, [[0, '#2a2627'], [1, '#575153']]); ctx.fill();
      // sheen
      ellipsePath(ctx, -70, -16, 40, 4); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      // oil glisten
      ellipsePath(ctx, -10, -13, 30, 3.4); ctx.fillStyle = 'rgba(255,214,120,0.25)'; ctx.fill();
      ellipsePath(ctx, -45, -16, 112, 11); strokeOnly(ctx, 3);
      // body highlight
      ctx.beginPath(); ctx.moveTo(-150, -8); ctx.lineTo(-144, 16); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
    },
    front(ctx) {
      // front rim lip — overlaps the bottom of the sausage
      ctx.beginPath();
      ctx.ellipse(-45, -16, 112, 11, 0, 0.05, Math.PI - 0.05);
      ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = '#3a3536'; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-45, -16, 112, 11, 0, 0.5, Math.PI - 0.6);
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke();
    },
  },

  stove: {
    draw(ctx) {
      // body
      toonBox(ctx, 0, 0, 240, 150, 8, '#f3ece0');
      // cooktop
      rrc(ctx, 0, -70, 246, 14, 4); fillStroke(ctx, '#3a3637');
      // burner grate
      ctx.lineWidth = 3; ctx.strokeStyle = '#1b1818';
      for (const gx of [-60, 60]) {
        ctx.beginPath(); ctx.moveTo(gx - 46, -77); ctx.lineTo(gx + 46, -77); ctx.stroke();
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(gx + k * 20, -81); ctx.lineTo(gx + k * 20, -76); ctx.stroke(); }
      }
      // knob panel
      rrc(ctx, 0, -46, 220, 22, 5); fillStroke(ctx, '#d9d0c2', 3);
      for (let k = 0; k < 4; k++) {
        const kx = -78 + k * 52;
        toonCircle(ctx, kx, -46, 8, '#2d2a2b', { lw: 2.5 });
        ctx.beginPath(); ctx.moveTo(kx, -46); ctx.lineTo(kx + Math.cos(-1 + k) * 6, -46 + Math.sin(-1 + k) * 6);
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      // oven door
      rrc(ctx, 0, 18, 200, 92, 8); fillStroke(ctx, '#e7dfd0', 3);
      rrc(ctx, 0, 24, 160, 54, 6); fillStroke(ctx, '#2b2224', 3);
      ctx.save(); rrc(ctx, 0, 24, 160, 54, 6); ctx.clip();
      ctx.fillStyle = 'rgba(255,140,40,0.25)'; ctx.fillRect(-80, 30, 160, 30);
      ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-30, 0); ctx.lineTo(-70, 60); ctx.lineTo(-100, 60); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.restore();
      rod(ctx, -70, -18, 70, -18, 6, '#c9c2b5');
    },
  },

  bun: {
    draw(ctx) {
      // plate
      ellipsePath(ctx, 0, 29, 128, 9); fillStroke(ctx, '#f7f4ee', 3.5);
      ellipsePath(ctx, 0, 27, 104, 5); ctx.fillStyle = '#e6e0d4'; ctx.fill();
      // back half of bun (behind sausage)
      ctx.beginPath();
      ctx.moveTo(-112, 4);
      ctx.bezierCurveTo(-118, -26, -96, -36, -70, -34);
      ctx.lineTo(70, -34);
      ctx.bezierCurveTo(96, -36, 118, -26, 112, 4);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -36, 4, [[0, '#e7a457'], [0.6, '#cf8335'], [1, '#b56c27']]);
      ctx.fill(); strokeOnly(ctx);
      // crumb edge of back half
      ctx.beginPath(); ctx.moveTo(-98, -6); ctx.bezierCurveTo(-90, -24, -70, -24, -60, -24); ctx.lineTo(60, -24); ctx.bezierCurveTo(70, -24, 90, -24, 98, -6);
      ctx.lineWidth = 7; ctx.strokeStyle = '#f6dcae'; ctx.stroke();
      // crust gloss
      ctx.beginPath(); ctx.moveTo(-70, -30); ctx.lineTo(40, -30); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.stroke();
    },
    front(ctx) {
      // front half of bun (over the sausage's bottom)
      ctx.beginPath();
      ctx.moveTo(-114, -10);
      ctx.bezierCurveTo(-112, -22, -100, -24, -94, -12);
      ctx.bezierCurveTo(-60, -2, 60, -2, 94, -12);
      ctx.bezierCurveTo(100, -24, 112, -22, 114, -10);
      ctx.bezierCurveTo(118, 18, 100, 27, 80, 27);
      ctx.lineTo(-80, 27);
      ctx.bezierCurveTo(-100, 27, -118, 18, -114, -10);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -20, 27, [[0, '#eeb064'], [0.5, '#d88b3c'], [1, '#b8692a']]);
      ctx.fill(); strokeOnly(ctx);
      // crumb lip
      ctx.beginPath();
      ctx.moveTo(-96, -10); ctx.bezierCurveTo(-60, 1, 60, 1, 96, -10);
      ctx.lineWidth = 6; ctx.strokeStyle = '#f8e2b8'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
      // crust highlight
      ctx.beginPath(); ctx.moveTo(-80, 10); ctx.bezierCurveTo(-30, 14, 30, 14, 70, 10);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,236,190,0.45)'; ctx.stroke();
    },
  },

  shelf: {
    draw(ctx, o) {
      const w = o.w || 200;
      // brackets
      for (const bx of [-w / 2 + 30, w / 2 - 30]) {
        polyPath(ctx, [[bx - 5, 8], [bx + 5, 8], [bx + 5, 44], [bx - 5, 14]]);
        polyPath(ctx, [[bx - 4, 8], [bx + 4, 8], [bx + 4, 46], [bx - 20, 8]]);
        fillStroke(ctx, '#55504d', 3);
      }
      toonBox(ctx, 0, 0, w, 18, 3, o.color || WOOD);
      woodGrain(ctx, -w / 2 + 2, -7, w - 4, 14, o.color || WOOD, Math.round(w));
    },
  },

  table: {
    draw(ctx, o) {
      const w = o.w || 260, h = o.h || 200;
      const col = o.color || '#b8773f';
      for (const lx of [-w / 2 + 18, w / 2 - 18]) toonBox(ctx, lx, 10, 16, h - 20, 3, darken(col, 0.15));
      // apron
      toonBox(ctx, 0, -h / 2 + 30, w - 30, 18, 3, darken(col, 0.1));
      toonBox(ctx, 0, -h / 2 + 10, w, 20, 4, col);
      woodGrain(ctx, -w / 2 + 3, -h / 2 + 2, w - 6, 15, col, w + h);
    },
  },

  cabinet: {
    draw(ctx, o) {
      const w = o.w || 260, h = o.h || 240;
      const col = o.color || '#9fc2b4';
      toonBox(ctx, 0, 0, w, h, 4, col);
      const doors = Math.max(1, Math.round(w / 120));
      const dw = (w - 24) / doors;
      for (let i = 0; i < doors; i++) {
        const dx = -w / 2 + 12 + dw * i + dw / 2;
        rrc(ctx, dx, 8, dw - 10, h - 40, 6); fillStroke(ctx, lighten(col, 0.12), 3);
        rrc(ctx, dx, 8, dw - 34, h - 64, 4); strokeOnly(ctx, 2, rgba(INK, 0.35));
        toonCircle(ctx, dx + (i % 2 ? -1 : 1) * (dw / 2 - 18), -h / 2 + 46, 5, '#e8c766', { lw: 2.5 });
      }
      // toe kick shadow
      ctx.fillStyle = rgba(INK, 0.25); ctx.fillRect(-w / 2 + 4, h / 2 - 12, w - 8, 9);
    },
  },

  pillar: {
    draw(ctx, o) {
      const w = o.w || 60, h = o.h || 300;
      const col = o.color || '#b37a45';
      toonBox(ctx, 0, 0, w, h, 4, col);
      woodGrain(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, col, h);
      toonBox(ctx, 0, -h / 2 + 8, w + 12, 16, 4, darken(col, 0.1));
    },
  },

  wall: {
    draw(ctx, o) {
      const w = o.w || 30, h = o.h || 300;
      const col = o.color || '#c58b52';
      toonBox(ctx, 0, 0, w, h, 4, col);
      woodGrain(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, col, h * 3);
      for (let y = -h / 2 + 24; y < h / 2 - 10; y += 60) {
        circlePath(ctx, 0, y, 2.6); ctx.fillStyle = '#6f6a66'; ctx.fill();
      }
    },
  },
};

// Kitchen props.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, smoothPath, vgrad, hgrad, rgrad, toonBox, toonCircle, toonPoly, rod, gloss, rng, text,
} from '../common.js';
import { woodGrain } from './shared.js';

const BOOK_COLORS = ['#e05a47', '#3e8ed0', '#f2b134', '#5bb072', '#8d6cc4', '#e57fb0', '#2fb3a8'];

export const KITCHEN_ART = {
  counter: {
    draw(ctx, o) {
      const w = o.w || 300, h = o.h || 260;
      const col = o.color || '#86b8a8';
      // cabinet body
      toonBox(ctx, 0, 12, w, h - 24, 4, col);
      const doors = Math.max(1, Math.round(w / 110));
      const dw = (w - 20) / doors;
      for (let i = 0; i < doors; i++) {
        const dx = -w / 2 + 10 + dw * i + dw / 2;
        const top = -h / 2 + 34;
        // drawer
        rrc(ctx, dx, top + 14, dw - 10, 30, 5); fillStroke(ctx, lighten(col, 0.1), 3);
        rod(ctx, dx - 14, top + 14, dx + 14, top + 14, 4, '#d9d2c4');
        // door
        const dh = h - 24 - 70;
        rrc(ctx, dx, top + 40 + dh / 2, dw - 10, dh - 6, 6); fillStroke(ctx, lighten(col, 0.1), 3);
        rrc(ctx, dx, top + 40 + dh / 2, dw - 30, dh - 28, 4); strokeOnly(ctx, 2, rgba(INK, 0.3));
        rod(ctx, dx + (i % 2 ? -1 : 1) * (dw / 2 - 18), top + 52, dx + (i % 2 ? -1 : 1) * (dw / 2 - 18), top + 78, 4, '#d9d2c4');
      }
      ctx.fillStyle = rgba(INK, 0.28); ctx.fillRect(-w / 2 + 4, h / 2 - 12, w - 8, 9);
      // countertop (butcher block)
      toonBox(ctx, 0, -h / 2 + 12, w + 16, 24, 5, '#d8a868');
      woodGrain(ctx, -w / 2 - 5, -h / 2 + 3, w + 10, 18, '#d8a868', w);
    },
  },

  toaster: {
    draw(ctx, o, t, st) {
      const pop = st && st.pop ? st.pop : 0;
      // toast slices (peek up, jump when launching)
      for (const tx of [-34, 34]) {
        const ty = -30 - pop * 30;
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(pop * (tx > 0 ? 0.4 : -0.4));
        rrc(ctx, 0, 0, 48, 46, 12); fillStroke(ctx, '#e9b46a', 3.5);
        rrc(ctx, 0, 3, 38, 36, 9); ctx.fillStyle = '#f7dca6'; ctx.fill();
        ctx.restore();
      }
      // chrome body
      rrc(ctx, 0, 12, 156, 72, 18);
      ctx.fillStyle = hgrad(ctx, -78, 78, [[0, '#9aa3ab'], [0.25, '#eef3f6'], [0.5, '#b8c1c8'], [0.8, '#f7fafc'], [1, '#8a939b']]);
      ctx.fill(); strokeOnly(ctx);
      // slot top
      rrc(ctx, 0, -20, 142, 12, 6); fillStroke(ctx, '#3a3d42', 3);
      // lever
      rrc(ctx, 83, 0 + pop * 14, 14, 12, 3); fillStroke(ctx, '#2c2c2c', 3);
      // dial + spring arrows hint
      toonCircle(ctx, -48, 26, 8, '#e05a47', { lw: 3 });
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#e05a47';
      ctx.beginPath(); ctx.moveTo(10, 30); ctx.lineTo(22, 16); ctx.lineTo(34, 30); ctx.closePath(); ctx.fill();
      ctx.restore();
      // reflection stripes
      gloss(ctx, -60, -6, 6, 36, 0.5);
      gloss(ctx, 18, -6, 4, 36, 0.35);
      // feet
      rrc(ctx, -52, 50, 18, 8, 3); fillStroke(ctx, '#2c2c2c', 2.5);
      rrc(ctx, 52, 50, 18, 8, 3); fillStroke(ctx, '#2c2c2c', 2.5);
    },
  },

  teapot: {
    draw(ctx) {
      const col = '#5fb3c9';
      // spout
      ctx.beginPath(); ctx.moveTo(40, 10); ctx.quadraticCurveTo(70, 8, 66, -24); ctx.lineTo(56, -22); ctx.quadraticCurveTo(58, 0, 40, 30); ctx.closePath();
      fillStroke(ctx, col);
      // handle
      ctx.beginPath(); ctx.arc(-54, 16, 20, Math.PI * 0.5, Math.PI * 1.5); ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = col; ctx.stroke();
      toonBox(ctx, 0, 18, 104, 74, 32, col);
      // pattern band
      ctx.save(); rrc(ctx, 0, 18, 104, 74, 32); ctx.clip();
      ctx.fillStyle = '#f5f1e8'; ctx.fillRect(-60, 8, 120, 16);
      for (let i = -4; i <= 4; i++) { circlePath(ctx, i * 13, 16, 3.5); ctx.fillStyle = '#e05a47'; ctx.fill(); }
      ctx.restore();
      rrc(ctx, 0, 18, 104, 74, 32); strokeOnly(ctx);
      toonBox(ctx, 0, -26, 58, 16, 7, lighten(col, 0.1));
      toonCircle(ctx, 0, -40, 8, '#f5f1e8', { lw: 3 });
    },
  },

  mug: {
    draw(ctx, o) {
      const col = o.color || ['#e05a47', '#f2b134', '#3e8ed0', '#5bb072'][(o.v || 0) % 4];
      // handle
      ctx.beginPath(); ctx.arc(40, 2, 18, -Math.PI / 2, Math.PI / 2); ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.stroke();
      // inside back wall
      rrc(ctx, 0, 0, 74, 84, 8); fillStroke(ctx, darken(col, 0.35));
      ellipsePath(ctx, 0, -40, 36, 6); ctx.fillStyle = darken(col, 0.55); ctx.fill();
    },
    front(ctx, o) {
      const col = o.color || ['#e05a47', '#f2b134', '#3e8ed0', '#5bb072'][(o.v || 0) % 4];
      ctx.save();
      rrPath(ctx, -37, -10, 74, 52, 8);
      ctx.fillStyle = col; ctx.fill(); strokeOnly(ctx);
      ctx.fillStyle = rgba(darken(col, 0.5), 0.25); ctx.fillRect(-35, 18, 70, 22);
      text(ctx, '♥', 0, 12, 22, '#fff4e6');
      gloss(ctx, -30, -6, 5, 34, 0.4);
      ctx.restore();
      // rim
      ctx.beginPath(); ctx.moveTo(-37, -40); ctx.lineTo(-37, -10); ctx.moveTo(37, -40); ctx.lineTo(37, -10);
      ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
    },
  },

  cuttingboard: {
    draw(ctx) {
      toonBox(ctx, 0, 0, 210, 22, 9, '#d9a35e');
      woodGrain(ctx, -102, -8, 204, 16, '#d9a35e', 7);
      circlePath(ctx, -88, 0, 4); ctx.fillStyle = INK; ctx.fill();
      // a few veggie bits
      toonCircle(ctx, 50, -15, 6, '#5bb072', { lw: 2.5, spec: false });
      toonCircle(ctx, 66, -14, 5, '#e05a47', { lw: 2.5, spec: false });
    },
  },

  books: {
    draw(ctx, o) {
      const r = rng((o.v || 0) * 13 + 5);
      const heights = [22, 28, 30];
      let y = 40;
      heights.forEach((bh, i) => {
        const col = BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)];
        const off = (r() - 0.5) * 12;
        const bw = 160 - i * 6 - r() * 8;
        const cy = y - bh / 2;
        // pages
        rrc(ctx, off + 4, cy, bw - 4, bh - 6, 2); fillStroke(ctx, '#fbf4e2', 2.5);
        ctx.save(); rrc(ctx, off + 4, cy, bw - 4, bh - 6, 2); ctx.clip();
        ctx.strokeStyle = rgba(INK, 0.15); ctx.lineWidth = 1;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(off - bw / 2, cy + k * 3); ctx.lineTo(off + bw / 2, cy + k * 3); ctx.stroke(); }
        ctx.restore();
        // cover (spine side)
        ctx.beginPath();
        rrPath(ctx, off - bw / 2, cy - bh / 2, bw, bh, 4);
        ctx.save(); ctx.clip();
        ctx.fillStyle = col; ctx.fillRect(off - bw / 2, cy - bh / 2, 22, bh);
        ctx.fillRect(off - bw / 2, cy - bh / 2, bw, 5);
        ctx.fillRect(off - bw / 2, cy + bh / 2 - 5, bw, 5);
        ctx.fillStyle = rgba('#ffe9a8', 0.8); ctx.fillRect(off - bw / 2 + 6, cy - 2, 10, 4);
        ctx.restore();
        rrPath(ctx, off - bw / 2, cy - bh / 2, bw, bh, 4); strokeOnly(ctx, 3.5);
        y -= bh;
      });
    },
  },

  knifeblock: {
    draw(ctx) {
      // knife handles (the danger zone) — blades gleam above
      const knives = [[-26, -0.25, '#2f2a28'], [-6, -0.08, '#7a3b1e'], [14, 0.08, '#2f2a28'], [30, 0.22, '#7a3b1e']];
      for (const [kx, a, col] of knives) {
        ctx.save(); ctx.translate(kx, -10); ctx.rotate(a);
        // blade
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, -48); ctx.quadraticCurveTo(0, -62, 7, -50); ctx.lineTo(6, 0); ctx.closePath();
        ctx.fillStyle = hgrad(ctx, -6, 7, [[0, '#d7dee4'], [0.5, '#ffffff'], [1, '#9aa5ae']]); ctx.fill(); strokeOnly(ctx, 3);
        ctx.restore();
      }
      // block
      ctx.save(); ctx.translate(0, 25); ctx.rotate(-0.06);
      toonBox(ctx, 0, 0, 90, 82, 8, '#a8673a');
      woodGrain(ctx, -42, -38, 84, 76, '#a8673a', 3);
      for (const kx of [-26, -6, 14, 30]) { rrc(ctx, kx, -36, 12, 5, 2); ctx.fillStyle = INK; ctx.fill(); }
      ctx.restore();
      // sparkle
      ctx.save(); ctx.translate(-4, -58);
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(2, -2); ctx.lineTo(8, 0); ctx.lineTo(2, 2); ctx.lineTo(0, 8); ctx.lineTo(-2, 2); ctx.lineTo(-8, 0); ctx.lineTo(-2, -2); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
    },
  },

  blender: {
    draw(ctx, o, t) {
      // base
      toonBox(ctx, 0, 65, 92, 40, 10, '#e05a47');
      toonCircle(ctx, 0, 66, 9, '#f5f1e8', { lw: 3 });
      // jar back
      ctx.beginPath(); ctx.moveTo(-45, -66); ctx.lineTo(45, -66); ctx.lineTo(38, 45); ctx.lineTo(-38, 45); ctx.closePath();
      ctx.fillStyle = 'rgba(200,232,245,0.35)'; ctx.fill();
      // smoothie inside
      ctx.beginPath(); ctx.moveTo(-41, 0); ctx.lineTo(41, 0); ctx.lineTo(38, 45); ctx.lineTo(-38, 45); ctx.closePath();
      ctx.fillStyle = 'rgba(240,120,160,0.7)'; ctx.fill();
      // spinning blades
      ctx.save(); ctx.translate(0, 36);
      const a = t * 30;
      ctx.scale(Math.cos(a), 1);
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.lineWidth = 5; ctx.strokeStyle = '#cfd6dc'; ctx.stroke();
      ctx.restore();
    },
    front(ctx) {
      ctx.beginPath(); ctx.moveTo(-45, -66); ctx.lineTo(45, -66); ctx.lineTo(38, 45); ctx.lineTo(-38, 45); ctx.closePath();
      ctx.fillStyle = 'rgba(220,240,250,0.18)'; ctx.fill(); strokeOnly(ctx, 3.5);
      gloss(ctx, -34, -56, 6, 80, 0.45);
      gloss(ctx, -22, -56, 3, 50, 0.3);
      // measuring marks
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(26, -40 + k * 20); ctx.lineTo(36, -40 + k * 20); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke(); }
      // handle
      ctx.beginPath(); ctx.moveTo(44, -50); ctx.quadraticCurveTo(70, -40, 66, 0); ctx.quadraticCurveTo(64, 20, 40, 26);
      ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#e8eef2'; ctx.stroke();
    },
  },

  pot: {
    draw(ctx, o, t) {
      // back interior
      rrc(ctx, 0, 5, 168, 104, 10); fillStroke(ctx, '#4b5157');
      // boiling water
      ctx.save(); rrc(ctx, 0, 5, 160, 100, 8); ctx.clip();
      ctx.fillStyle = '#7cc6e8';
      ctx.beginPath(); ctx.moveTo(-84, 60);
      for (let x = -84; x <= 84; x += 8) ctx.lineTo(x, -14 + Math.sin(x * 0.12 + t * 6) * 3);
      ctx.lineTo(84, 60); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const bx = -60 + i * 24, ph = (t * 1.3 + i * 0.37) % 1;
        circlePath(ctx, bx + Math.sin(i * 5) * 6, 30 - ph * 44, 3 + ph * 4);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      }
      ctx.restore();
    },
    front(ctx) {
      // front wall (lower part)
      ctx.save();
      rrPath(ctx, -86, -2, 172, 64, 10);
      ctx.fillStyle = hgrad(ctx, -86, 86, [[0, '#7d868e'], [0.3, '#dfe6ec'], [0.6, '#a9b3bb'], [1, '#6f7880']]);
      ctx.fill(); strokeOnly(ctx);
      ctx.restore();
      // handles
      for (const s of [-1, 1]) { rrc(ctx, s * 96, 4, 22, 10, 4); fillStroke(ctx, '#2f2a28', 3); }
      // rim
      ctx.beginPath(); ctx.moveTo(-84, -47); ctx.lineTo(-84, -2); ctx.moveTo(84, -47); ctx.lineTo(84, -2);
      ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = '#c3ccd3'; ctx.stroke();
    },
  },

  burner: {
    draw(ctx, o, t, st) {
      const on = st ? st.on : true;
      const warn = st ? st.warn : 0;
      toonBox(ctx, 0, 6, 120, 18, 5, '#3a3637');
      ctx.lineWidth = 3; ctx.strokeStyle = '#1b1818';
      ctx.beginPath(); ctx.moveTo(-50, -4); ctx.lineTo(50, -4); ctx.stroke();
      // flames
      const n = 7;
      for (let i = 0; i < n; i++) {
        const fx = -42 + i * 14;
        let fh = on ? 34 + Math.sin(t * 22 + i * 1.7) * 9 : (warn > 0 ? 8 + Math.sin(t * 30 + i) * 3 : 4);
        ctx.beginPath(); ctx.moveTo(fx - 6, -2); ctx.quadraticCurveTo(fx - 7, -fh * 0.5, fx, -fh); ctx.quadraticCurveTo(fx + 7, -fh * 0.5, fx + 6, -2); ctx.closePath();
        ctx.fillStyle = on ? 'rgba(80,150,255,0.85)' : 'rgba(80,150,255,0.6)'; ctx.fill();
        if (on) {
          ctx.beginPath(); ctx.moveTo(fx - 3, -2); ctx.quadraticCurveTo(fx - 3, -fh * 0.35, fx, -fh * 0.6); ctx.quadraticCurveTo(fx + 3, -fh * 0.35, fx + 3, -2); ctx.closePath();
          ctx.fillStyle = 'rgba(220,240,255,0.9)'; ctx.fill();
        }
      }
    },
  },

  fridge: {
    draw(ctx, o) {
      const col = o.color || '#f1ede6';
      toonBox(ctx, 0, 0, 170, 360, 16, col);
      // door split
      ctx.beginPath(); ctx.moveTo(-82, -60); ctx.lineTo(82, -60); strokeOnly(ctx, 3.5);
      rod(ctx, -64, -140, -64, -86, 6, '#c7c2ba');
      rod(ctx, -64, -36, -64, 40, 6, '#c7c2ba');
      gloss(ctx, 56, -165, 8, 90, 0.5);
      gloss(ctx, 56, -40, 8, 180, 0.4);
      // magnets & drawing
      toonCircle(ctx, 20, -130, 8, '#e05a47', { lw: 2.5 });
      toonCircle(ctx, 46, -110, 7, '#3e8ed0', { lw: 2.5 });
      ctx.save(); ctx.translate(10, 20); ctx.rotate(0.06);
      rrc(ctx, 0, 0, 62, 74, 2); fillStroke(ctx, '#fffdf6', 2.5);
      // child's drawing of a sausage
      ctx.beginPath(); ctx.moveTo(-18, 6); ctx.quadraticCurveTo(0, -6, 18, 6); ctx.lineWidth = 9; ctx.strokeStyle = '#e06a4a'; ctx.lineCap = 'round'; ctx.stroke();
      circlePath(ctx, 10, 1, 1.6); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.arc(-14, -20, 7, 0, Math.PI * 2); ctx.fillStyle = '#f2c94c'; ctx.fill();
      ctx.restore();
      toonCircle(ctx, 10, -12, 6, '#5bb072', { lw: 2.5 });
      // feet shadow
      ctx.fillStyle = rgba(INK, 0.3); ctx.fillRect(-76, 168, 152, 8);
    },
  },

  jar: {
    draw(ctx) {
      // glass
      rrc(ctx, 0, 6, 74, 88, 14); ctx.fillStyle = 'rgba(190,230,200,0.55)'; ctx.fill();
      // pickles inside
      ctx.save(); rrc(ctx, 0, 6, 74, 88, 14); ctx.clip();
      ctx.fillStyle = 'rgba(200,220,120,0.55)'; ctx.fillRect(-40, -20, 80, 70);
      for (const [px, py, a] of [[-14, 10, 0.3], [12, 22, -0.4], [-6, 36, 0.1], [16, -4, 0.6]]) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(a);
        rrc(ctx, 0, 0, 16, 34, 8); fillStroke(ctx, '#6f9a2f', 2.5);
        ctx.restore();
      }
      ctx.restore();
      rrc(ctx, 0, 6, 74, 88, 14); strokeOnly(ctx);
      gloss(ctx, -28, -24, 6, 52, 0.5);
      // label
      rrc(ctx, 0, 14, 60, 26, 3); fillStroke(ctx, '#fff3d6', 2.5);
      text(ctx, 'DILL', 0, 15, 13, '#5bb072');
      // lid
      toonBox(ctx, 0, -42, 66, 18, 4, '#e05a47');
      ctx.strokeStyle = rgba(INK, 0.35); ctx.lineWidth = 1.5;
      for (let k = -28; k <= 28; k += 6) { ctx.beginPath(); ctx.moveTo(k, -48); ctx.lineTo(k, -36); ctx.stroke(); }
    },
  },

  butter: {
    draw(ctx) {
      // dish
      ctx.beginPath(); ctx.ellipse(0, 18, 72, 9, 0, 0, Math.PI * 2); fillStroke(ctx, '#f7f4ee', 3.5);
      ellipsePath(ctx, 0, 16, 58, 4); ctx.fillStyle = '#e6e0d4'; ctx.fill();
      // butter block
      toonBox(ctx, 0, -6, 100, 28, 6, '#ffe27a');
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      rrc(ctx, -16, -16, 50, 5, 2); ctx.fill();
      // melty drip
      ctx.beginPath(); ctx.moveTo(40, 6); ctx.quadraticCurveTo(46, 14, 40, 16); ctx.quadraticCurveTo(34, 12, 36, 6); ctx.fillStyle = '#ffe27a'; ctx.fill();
      // shine sparkles hint slipperiness
      for (const [sx, sy] of [[-32, -12], [22, -14]]) {
        ctx.save(); ctx.translate(sx, sy);
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(1.5, -1.5); ctx.lineTo(6, 0); ctx.lineTo(1.5, 1.5); ctx.lineTo(0, 6); ctx.lineTo(-1.5, 1.5); ctx.lineTo(-6, 0); ctx.lineTo(-1.5, -1.5); ctx.closePath();
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      }
    },
  },

  cereal: {
    draw(ctx, o) {
      const col = ['#f2b134', '#e05a47', '#3e8ed0'][(o.v || 0) % 3];
      toonBox(ctx, 0, 0, 90, 130, 3, col);
      ctx.save(); rrc(ctx, 0, 0, 90, 130, 3); ctx.clip();
      ctx.fillStyle = darken(col, 0.25); ctx.fillRect(28, -65, 20, 130);
      ctx.restore();
      rrc(ctx, 0, 0, 90, 130, 3); strokeOnly(ctx);
      text(ctx, 'CRUNCH', -8, -34, 17, '#fff', { stroke: 5 });
      text(ctx, 'O\'S', -8, -14, 20, '#fff4c2', { stroke: 5 });
      // bowl
      ctx.beginPath(); ctx.arc(-8, 22, 24, 0, Math.PI); ctx.closePath(); fillStroke(ctx, '#fffaf0', 3);
      for (let i = 0; i < 5; i++) { circlePath(ctx, -24 + i * 8, 20 - (i % 2) * 4, 4); fillStroke(ctx, '#f7c25a', 2); }
    },
  },

  microwave: {
    draw(ctx) {
      toonBox(ctx, 0, 0, 180, 104, 10, '#e9e4dc');
      rrc(ctx, -20, 2, 116, 78, 6); fillStroke(ctx, '#29313a', 3.5);
      ctx.save(); rrc(ctx, -20, 2, 116, 78, 6); ctx.clip();
      ctx.fillStyle = 'rgba(255,230,140,0.18)'; ctx.fillRect(-78, 10, 116, 40);
      ctx.beginPath(); ctx.moveTo(-60, -40); ctx.lineTo(-36, -40); ctx.lineTo(-74, 40); ctx.lineTo(-98, 40); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.restore();
      // panel
      rrc(ctx, 62, -20, 38, 18, 3); fillStroke(ctx, '#1d2a22', 2.5);
      text(ctx, '0:42', 62, -20, 12, '#7dff9a', { font: 'monospace' });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { rrc(ctx, 52 + c * 20, 6 + r * 14, 14, 9, 2); fillStroke(ctx, '#cfc8bd', 1.8); }
      rod(ctx, 36, -36, 36, 40, 4, '#bdb6aa');
    },
  },

  watermelon: {
    draw(ctx) {
      polyPath(ctx, [[-75, 40], [75, 40], [64, 4], [40, -26], [0, -40], [-40, -26], [-64, 4]]);
      ctx.beginPath();
      ctx.moveTo(-76, 40); ctx.bezierCurveTo(-76, -50, 76, -50, 76, 40); ctx.closePath();
      fillStroke(ctx, '#3f8f3a');
      // stripes
      ctx.save(); ctx.clip();
      ctx.strokeStyle = '#2b6b2a'; ctx.lineWidth = 7;
      for (let k = -60; k <= 60; k += 22) { ctx.beginPath(); ctx.moveTo(k, 40); ctx.quadraticCurveTo(k * 0.7, -10, k * 0.3, -40); ctx.stroke(); }
      ctx.restore();
      // cut face (flat bottom slice towards viewer)
      ctx.beginPath(); ctx.moveTo(-64, 40); ctx.bezierCurveTo(-64, -34, 64, -34, 64, 40); ctx.closePath();
      ctx.fillStyle = '#ff5a6b'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-70, 40); ctx.bezierCurveTo(-70, -40, 70, -40, 70, 40);
      ctx.lineWidth = 6; ctx.strokeStyle = '#e9ffd8'; ctx.stroke();
      for (const [sx, sy] of [[-30, 10], [-10, -6], [12, 4], [32, 16], [-2, 22], [22, -14], [-36, 26]]) {
        ellipsePath(ctx, sx, sy, 3, 5, 0.3); ctx.fillStyle = '#2b1a14'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-76, 40); ctx.bezierCurveTo(-76, -50, 76, -50, 76, 40); ctx.closePath(); strokeOnly(ctx);
    },
  },

  plate: {
    draw(ctx) {
      ellipsePath(ctx, 0, 0, 92, 11); fillStroke(ctx, '#f7f4ee', 3.5);
      ellipsePath(ctx, 0, -2, 70, 6); ctx.fillStyle = '#e8e2d6'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, 86, 8, 0, 0.2, Math.PI - 0.2); ctx.lineWidth = 2; ctx.strokeStyle = '#7db7d8'; ctx.stroke();
    },
  },
};

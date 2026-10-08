// Bathroom props ("Splish Splash").
import {
  INK, rgba, lighten, darken, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, smoothPath, vgrad, hgrad, toonBox, toonCircle, rod, gloss, rng, text,
  mirrored,
} from '../common.js';

const PORCELAIN = '#f8f6f1';
const PASTELS = ['#f6a9bd', '#8fd6c4', '#94c8f0', '#ffd27a'];
const WATER_TOP = '#86d8f6';
const WATER_BOT = '#3a95d4';
const TAU = Math.PI * 2;

const chromeH = (ctx, x0, x1) => hgrad(ctx, x0, x1, [[0, '#86919c'], [0.22, '#eef3f7'], [0.48, '#aeb9c3'], [0.76, '#f7fafc'], [1, '#808b96']]);
const chromeV = (ctx, y0, y1) => vgrad(ctx, y0, y1, [[0, '#f5f9fb'], [0.4, '#c3ccd4'], [0.62, '#eef3f6'], [1, '#7e8993']]);

// 4-point twinkle.
function sparkle(ctx, x, y, s, color = '#ffffff', a = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.16, -s * 0.16, s, 0);
  ctx.quadraticCurveTo(s * 0.16, s * 0.16, 0, s);
  ctx.quadraticCurveTo(-s * 0.16, s * 0.16, -s, 0);
  ctx.quadraticCurveTo(-s * 0.16, -s * 0.16, 0, -s);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

// Transparent floating soap bubble.
function soapBubble(ctx, x, y, r, a = 1) {
  ctx.lineCap = 'round';
  circlePath(ctx, x, y, r);
  ctx.fillStyle = `rgba(225,246,255,${0.22 * a})`; ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.14); ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0.35, 1.25);
  ctx.lineWidth = Math.max(1, r * 0.14); ctx.strokeStyle = `rgba(255,160,215,${0.55 * a})`; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.66, -2.55, -1.75);
  ctx.lineWidth = Math.max(1, r * 0.16); ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`; ctx.stroke();
}

// Opaque foam bubble (bubble bath).
function foam(ctx, x, y, r, rim = 'rgba(70,140,195,0.55)') {
  circlePath(ctx, x, y, r);
  ctx.fillStyle = '#d3e9f7'; ctx.fill();
  circlePath(ctx, x - r * 0.14, y - r * 0.18, r * 0.84);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  circlePath(ctx, x, y, r);
  ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
  circlePath(ctx, x - r * 0.38, y - r * 0.38, r * 0.2);
  ctx.fillStyle = 'rgba(205,235,255,0.95)'; ctx.fill();
}

function drip(ctx, x, y, s, col = '#7fd0f5') {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.5);
  ctx.quadraticCurveTo(x + s, y - s * 0.2, x + s * 0.9, y + s * 0.3);
  ctx.arc(x, y + s * 0.3, s * 0.9, 0, Math.PI);
  ctx.quadraticCurveTo(x - s, y - s * 0.2, x, y - s * 1.5);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(30,110,170,0.8)'; ctx.stroke();
  circlePath(ctx, x - s * 0.3, y + s * 0.1, s * 0.25); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
}

// ---------------------------------------------------------------- bathtub geometry
const TUB_IN = 136, TUB_FLOOR = 44, TUB_WATER = -25, TUB_FRONT = 4, TUB_RB = 46;

function tubCavity(ctx) {
  ctx.beginPath();
  ctx.moveTo(-TUB_IN, -75); ctx.lineTo(TUB_IN, -75);
  ctx.lineTo(TUB_IN, TUB_FLOOR - 20); ctx.quadraticCurveTo(TUB_IN, TUB_FLOOR, TUB_IN - 20, TUB_FLOOR);
  ctx.lineTo(-TUB_IN + 20, TUB_FLOOR); ctx.quadraticCurveTo(-TUB_IN, TUB_FLOOR, -TUB_IN, TUB_FLOOR - 20);
  ctx.closePath();
}

// U-shaped shell (walls + bottom) around the cavity.
function tubShell(ctx) {
  ctx.beginPath();
  ctx.moveTo(-TUB_IN, -69);
  ctx.quadraticCurveTo(-TUB_IN, -75, -TUB_IN - 6, -75);
  ctx.lineTo(-150, -75); ctx.quadraticCurveTo(-160, -75, -160, -65);
  ctx.lineTo(-160, 70 - TUB_RB); ctx.quadraticCurveTo(-160, 70, -160 + TUB_RB, 70);
  ctx.lineTo(160 - TUB_RB, 70); ctx.quadraticCurveTo(160, 70, 160, 70 - TUB_RB);
  ctx.lineTo(160, -65); ctx.quadraticCurveTo(160, -75, 150, -75);
  ctx.lineTo(TUB_IN + 6, -75); ctx.quadraticCurveTo(TUB_IN, -75, TUB_IN, -69);
  ctx.lineTo(TUB_IN, TUB_FLOOR - 20); ctx.quadraticCurveTo(TUB_IN, TUB_FLOOR, TUB_IN - 20, TUB_FLOOR);
  ctx.lineTo(-TUB_IN + 20, TUB_FLOOR); ctx.quadraticCurveTo(-TUB_IN, TUB_FLOOR, -TUB_IN, TUB_FLOOR - 20);
  ctx.closePath();
}

function tubSurface(x, t) { return TUB_WATER + Math.sin(x * 0.055 + t * 3.1) * 2 + Math.sin(x * 0.13 - t * 2.3) * 1; }

const TUB_FOAM_BACK = (() => {
  const r = rng(77), a = [];
  for (const [cx, n, hgt] of [[-96, 7, 16], [8, 9, 22], [100, 6, 14]]) {
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const lift = (1 - u * u) * hgt;
      a.push([cx + u * (14 + n * 3) + (r() - 0.5) * 6, -28 - lift - r() * 4, 6 + (1 - Math.abs(u)) * 6 + r() * 3, r() * TAU]);
    }
  }
  return a;
})();
const TUB_FOAM_FRONT = (() => {
  const r = rng(91), a = [];
  for (const [cx, n] of [[-96, 4], [8, 5], [100, 3]]) {
    for (let i = 0; i < n; i++) a.push([cx + ((i / Math.max(1, n - 1)) * 2 - 1) * (10 + n * 5) + (r() - 0.5) * 6, -21 - r() * 5, 5 + r() * 4, r() * TAU]);
  }
  return a;
})();

function clawFoot(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s * 1.3, 1.3);
  ctx.beginPath();
  ctx.moveTo(-9, -6); ctx.quadraticCurveTo(-2, 3, -14, 8); ctx.lineTo(14, 8); ctx.quadraticCurveTo(4, 2, 11, -6); ctx.closePath();
  fillStroke(ctx, '#e7b543', 3);
  for (const tx of [-11, 0, 11]) { circlePath(ctx, tx, 10, 4.6); fillStroke(ctx, '#f4cd5f', 2.5); }
  circlePath(ctx, -12.5, 8.6, 1.4); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- toilet geometry
function bowlBody(ctx) {
  ctx.beginPath();
  ctx.moveTo(-30, 20);
  ctx.lineTo(70, 20);
  ctx.bezierCurveTo(72, 44, 50, 46, 45, 62);
  ctx.lineTo(45, 88);
  ctx.quadraticCurveTo(46, 96, 53, 100);
  ctx.lineTo(-23, 100);
  ctx.quadraticCurveTo(-16, 96, -15, 88);
  ctx.lineTo(-15, 58);
  ctx.bezierCurveTo(-18, 44, -30, 40, -30, 20);
  ctx.closePath();
}

const SEAT = { x: 20, y: 15, rx: 52, ry: 11, ix: 23, iy: 14, irx: 38, iry: 6.6 };

function toiletWater(ctx) {
  ellipsePath(ctx, SEAT.ix, SEAT.iy, SEAT.irx, SEAT.iry);
  ctx.fillStyle = vgrad(ctx, SEAT.iy - SEAT.iry, SEAT.iy + SEAT.iry, [[0, '#1f6fae'], [0.5, '#3fa6e0'], [1, '#9be3fb']]); ctx.fill();
  strokeOnly(ctx, 2.5);
  ellipsePath(ctx, SEAT.ix + 8, SEAT.iy + 1.5, 10, 1.6); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
}

// ceramic back of the bowl that rises up to meet the tank
function bowlBack(ctx) {
  ctx.beginPath();
  ctx.moveTo(-46, -32); ctx.lineTo(-2, -32);
  ctx.bezierCurveTo(-2, -14, -16, -8, -14, 12);
  ctx.lineTo(-34, 12);
  ctx.bezierCurveTo(-32, -4, -46, -12, -46, -32);
  ctx.closePath();
}

// ---------------------------------------------------------------- sink geometry
const SINK_FRONT = -73;
function sinkBasin(ctx) {
  ctx.beginPath();
  ctx.moveTo(-79, -100); ctx.lineTo(79, -100); ctx.quadraticCurveTo(85, -100, 85, -94);
  ctx.lineTo(85, -59); ctx.quadraticCurveTo(85, -39, 65, -39);
  ctx.lineTo(-65, -39); ctx.quadraticCurveTo(-85, -39, -85, -59);
  ctx.lineTo(-85, -94); ctx.quadraticCurveTo(-85, -100, -79, -100);
  ctx.closePath();
}
function sinkPedestal(ctx) {
  ctx.beginPath();
  ctx.moveTo(-25, -42); ctx.lineTo(25, -42);
  ctx.bezierCurveTo(22, 10, 22, 60, 26, 84);
  ctx.quadraticCurveTo(30, 96, 36, 100);
  ctx.lineTo(-36, 100);
  ctx.quadraticCurveTo(-30, 96, -26, 84);
  ctx.bezierCurveTo(-22, 60, -22, 10, -25, -42);
  ctx.closePath();
}

export const BATHROOM_ART = {
  // ===================================================================== BATHTUB
  bathtub: {
    draw(ctx, o, t) {
      const col = PASTELS[(o.v || 0) % 4];
      for (const s of [-1, 1]) clawFoot(ctx, s * 104, 59.6, s);
      // interior back wall + water
      ctx.save();
      tubCavity(ctx);
      ctx.fillStyle = vgrad(ctx, -75, TUB_FLOOR, [[0, '#c6d3dd'], [0.22, '#e8eef2'], [1, '#f9fbfc']]);
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(-96, -75); ctx.lineTo(-76, -75); ctx.lineTo(-112, 40); ctx.lineTo(-132, 40); ctx.closePath(); ctx.fill();
      // water body
      ctx.beginPath(); ctx.moveTo(-140, 60);
      for (let x = -140; x <= 140; x += 10) ctx.lineTo(x, tubSurface(x, t));
      ctx.lineTo(140, 60); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -30, TUB_FLOOR, [[0, WATER_TOP], [1, WATER_BOT]]); ctx.fill();
      ctx.beginPath();
      for (let x = -140; x <= 140; x += 10) { const y = tubSurface(x, t) + 3.5; if (x === -140) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      // glints & caustics
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 6; i++) {
        const gx = -120 + i * 47 + Math.sin(t * 1.3 + i) * 6;
        rrc(ctx, gx, -12 + (i % 3) * 5, 16 - (i % 2) * 6, 3, 1.5); ctx.fill();
      }
      ctx.restore();
      // soft back-rim edge
      ctx.beginPath(); ctx.moveTo(-TUB_IN, -74); ctx.lineTo(TUB_IN, -74);
      ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.32); ctx.stroke();
      // gooseneck faucet on the back rim
      const fx = -104;
      rod(ctx, fx, -72, fx, -100, 7, '#dfe6eb');
      ctx.beginPath(); ctx.arc(fx + 12, -100, 12, Math.PI, 0);
      ctx.lineWidth = 7 + 6.4; ctx.strokeStyle = INK; ctx.lineCap = 'butt'; ctx.stroke();
      ctx.lineWidth = 7; ctx.strokeStyle = '#dfe6eb'; ctx.stroke();
      ctx.lineCap = 'round';
      rrc(ctx, fx + 24, -96, 9, 10, 2); fillStroke(ctx, '#c5ced6', 3);
      for (const [hx, hc] of [[fx - 16, '#ff7b7b'], [fx + 16, '#6fb8ff']]) {
        rod(ctx, hx, -72, hx, -82, 4, '#d6dde3');
        rrc(ctx, hx, -84, 14, 5, 2); fillStroke(ctx, '#e8eef2', 2.5);
        circlePath(ctx, hx, -84, 2.2); ctx.fillStyle = hc; ctx.fill();
      }
      // back foam heaps
      for (const [bx, by, br, ph] of TUB_FOAM_BACK) foam(ctx, bx, by + Math.sin(t * 2 + ph) * 1.4, br);
      // shell (walls + bottom)
      ctx.save();
      tubShell(ctx); ctx.fillStyle = col; ctx.fill();
      ctx.clip();
      ctx.fillStyle = rgba(lighten(col, 0.7), 0.45);
      ctx.fillRect(-156, -70, 8, 70); ctx.fillRect(140, -70, 4, 70);
      ctx.fillStyle = rgba(darken(col, 0.5), 0.18); ctx.fillRect(-TUB_IN - 8, -75, 8, 120); ctx.fillRect(TUB_IN, -75, 8, 120);
      ctx.restore();
      tubShell(ctx); strokeOnly(ctx);
      // rolled rim caps on the wall tops (landing spots)
      for (const s of [-1, 1]) {
        rrc(ctx, s * 148, -70, 28, 12, 6); fillStroke(ctx, PORCELAIN, 3.5);
        gloss(ctx, s * 148 - 9, -74, 14, 3, 0.8);
      }
      // rising soap bubbles
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.32 + i * 0.173) % 1;
        const bx = -100 + i * 40 + Math.sin(t * 1.7 + i * 2.1) * 7;
        const by = -42 - ph * 100;
        soapBubble(ctx, bx, by, 3.5 + (i % 3) * 2.2, Math.min(1, (1 - ph) * 1.6));
      }
    },
    front(ctx, o, t) {
      const col = PASTELS[(o.v || 0) % 4];
      // translucent water in front (submerges whatever dips in)
      ctx.save();
      tubCavity(ctx); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-140, TUB_FRONT + 4);
      for (let x = -140; x <= 140; x += 10) ctx.lineTo(x, tubSurface(x, t) + 2);
      ctx.lineTo(140, TUB_FRONT + 4); ctx.closePath();
      ctx.fillStyle = 'rgba(70,170,230,0.42)'; ctx.fill();
      ctx.restore();
      for (const [bx, by, br, ph] of TUB_FOAM_FRONT) foam(ctx, bx, by + Math.sin(t * 2.4 + ph) * 1.2, br);
      // front wall
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-160, TUB_FRONT); ctx.lineTo(160, TUB_FRONT);
      ctx.lineTo(160, 70 - TUB_RB); ctx.quadraticCurveTo(160, 70, 160 - TUB_RB, 70);
      ctx.lineTo(-160 + TUB_RB, 70); ctx.quadraticCurveTo(-160, 70, -160, 70 - TUB_RB);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.clip();
      ctx.fillStyle = rgba(darken(col, 0.55), 0.22); ctx.fillRect(-170, 46, 340, 40);
      ctx.fillStyle = rgba(lighten(col, 0.75), 0.4); ctx.fillRect(-170, TUB_FRONT + 5, 340, 8);
      // gold pinstripe + scallops
      ctx.strokeStyle = '#e7b543'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-150, 24); ctx.lineTo(150, 24); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -130; x < 130; x += 20) { ctx.moveTo(x, 29); ctx.quadraticCurveTo(x + 10, 38, x + 20, 29); }
      ctx.stroke();
      // painted bubble motif
      for (const [bx, by, br] of [[96, 46, 7], [112, 38, 4.5], [84, 34, 3.5], [-104, 46, 6], [-90, 39, 3.5]]) {
        circlePath(ctx, bx, by, br); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      }
      gloss(ctx, -150, TUB_FRONT + 14, 6, 44, 0.45);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-160, TUB_FRONT); ctx.lineTo(-160, 70 - TUB_RB); ctx.quadraticCurveTo(-160, 70, -160 + TUB_RB, 70);
      ctx.lineTo(160 - TUB_RB, 70); ctx.quadraticCurveTo(160, 70, 160, 70 - TUB_RB); ctx.lineTo(160, TUB_FRONT);
      strokeOnly(ctx);
      // rolled front rim
      rrc(ctx, 0, TUB_FRONT, 322, 9, 4.5); fillStroke(ctx, lighten(col, 0.55), 3.5);
      gloss(ctx, -140, TUB_FRONT - 2.5, 200, 2.4, 0.9);
    },
  },

  // ===================================================================== TOILET
  toilet: {
    draw(ctx, o) {
      const seat = PASTELS[((o.v || 0) + 2) % 4];
      // tank -> bowl back
      bowlBack(ctx); ctx.fillStyle = hgrad(ctx, -46, -2, [[0, '#e4e0d8'], [0.5, PORCELAIN], [1, '#dcd7ce']]); ctx.fill();
      strokeOnly(ctx);
      // bowl + pedestal
      bowlBody(ctx); ctx.fillStyle = PORCELAIN; ctx.fill();
      ctx.save(); bowlBody(ctx); ctx.clip();
      ctx.fillStyle = 'rgba(120,110,100,0.16)'; ctx.fillRect(28, 20, 60, 90);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-8, 40, 6, 52);
      ctx.restore();
      bowlBody(ctx); strokeOnly(ctx);
      toonBox(ctx, 20, 22, 100, 16, 8, PORCELAIN, { hi: 0.2 });
      // seat ring + water
      ellipsePath(ctx, SEAT.x, SEAT.y, SEAT.rx, SEAT.ry); fillStroke(ctx, seat, 3.5);
      toiletWater(ctx);
      ctx.beginPath(); ctx.ellipse(SEAT.x - 2, SEAT.y - 1, SEAT.rx - 7, SEAT.ry - 4, 0, Math.PI * 1.1, Math.PI * 1.75);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
      // hinge
      rrc(ctx, -27, 12, 8, 7, 2); fillStroke(ctx, '#cfd7de', 2.5);
      // tank
      toonBox(ctx, -30, -62, 86, 64, 8, PORCELAIN);
      rrc(ctx, -30, -58, 66, 40, 6); strokeOnly(ctx, 2, rgba(INK, 0.18));
      gloss(ctx, -66, -82, 5, 40, 0.75);
      // little duck decal
      ctx.save(); ctx.translate(-40, -54); ctx.scale(0.42, 0.42);
      circlePath(ctx, 6, -10, 9); ctx.fillStyle = '#ffd23f'; ctx.fill();
      rrc(ctx, 0, 4, 30, 14, 7); ctx.fill();
      polyPath(ctx, [[14, -12], [22, -9], [14, -6]]); ctx.fillStyle = '#ff9a2e'; ctx.fill();
      ctx.restore();
      // tank lid (landing spot)
      toonBox(ctx, -30, -94, 96, 13, 6, PORCELAIN, { hi: 0.5 });
      // flush lever
      rod(ctx, 3, -80, -15, -76, 4.5, '#dfe6eb');
      circlePath(ctx, 4, -80, 5.5); ctx.fillStyle = chromeH(ctx, -2, 10); ctx.fill(); strokeOnly(ctx, 3);
    },
    front(ctx, o, t) {
      const seat = PASTELS[((o.v || 0) + 2) % 4];
      // bowl rim + body (in front of anything dipping into the bowl)
      bowlBody(ctx); ctx.fillStyle = PORCELAIN; ctx.fill();
      ctx.save(); bowlBody(ctx); ctx.clip();
      ctx.fillStyle = 'rgba(120,110,100,0.16)'; ctx.fillRect(28, 20, 60, 90);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-8, 40, 6, 52);
      ctx.restore();
      bowlBody(ctx); strokeOnly(ctx);
      toonBox(ctx, 20, 22, 100, 16, 8, PORCELAIN, { hi: 0.2 });
      // water in the bowl with an animated flush swirl
      toiletWater(ctx);
      ctx.save();
      ellipsePath(ctx, SEAT.ix, SEAT.iy, SEAT.irx - 1, SEAT.iry - 0.6); ctx.clip();
      ctx.translate(SEAT.ix, SEAT.iy); ctx.scale(1, SEAT.iry / SEAT.irx);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const a0 = -t * 5 + k * TAU / 3;
        ctx.beginPath(); ctx.arc(0, 0, 10 + k * 9, a0, a0 + 1.4); ctx.stroke();
      }
      ctx.restore();
      // front half of the seat ring
      ctx.beginPath();
      ctx.ellipse(SEAT.x, SEAT.y, SEAT.rx, SEAT.ry, 0, 0, Math.PI);
      ctx.ellipse(SEAT.ix, SEAT.iy, SEAT.irx, SEAT.iry, 0, Math.PI, 0, true);
      ctx.closePath();
      fillStroke(ctx, seat, 3.5);
      ctx.beginPath(); ctx.ellipse(SEAT.x, SEAT.y + 1, SEAT.rx - 6, SEAT.ry - 3, 0, 0.5, 1.4);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      // splash droplets
      const ph = (t * 0.9) % 1;
      if (ph < 0.6) {
        const k = ph / 0.6;
        for (const [dx, dv] of [[-10, -1], [8, 1], [26, 0.6]]) {
          const x = SEAT.ix + dx + dv * k * 14, y = SEAT.iy - 4 - Math.sin(k * Math.PI) * 18;
          drip(ctx, x, y, 2.6);
        }
      }
    },
  },

  // ===================================================================== SINK
  sink: {
    draw(ctx, o) {
      const col = [PORCELAIN, '#f9d3dc', '#cdeee4', '#d3e8f8'][(o.v || 0) % 4];
      // pedestal
      sinkPedestal(ctx); ctx.fillStyle = hgrad(ctx, -30, 30, [[0, darken(col, 0.06)], [0.3, '#ffffff'], [1, darken(col, 0.14)]]); ctx.fill();
      strokeOnly(ctx);
      // faucet & taps on the back rim
      rod(ctx, 0, -100, 0, -120, 8, '#dfe6eb');
      ctx.beginPath(); ctx.arc(11, -120, 11, Math.PI, 0);
      ctx.lineCap = 'butt';
      ctx.lineWidth = 8 + 6.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = '#dfe6eb'; ctx.stroke();
      ctx.lineCap = 'round';
      rrc(ctx, 22, -116, 10, 9, 2); fillStroke(ctx, '#c5ced6', 3);
      drip(ctx, 22, -104, 2.8);
      for (const [hx, hc] of [[-30, '#ff6f6f'], [30, '#5aaeff']]) {
        rod(ctx, hx, -100, hx, -108, 5, '#d6dde3');
        toonCircle(ctx, hx, -110, 6, '#eef3f6', { lw: 3 });
        circlePath(ctx, hx, -110, 2.6); ctx.fillStyle = hc; ctx.fill();
      }
      // basin body
      sinkBasin(ctx); fillStroke(ctx, col);
      // interior
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-65, -100); ctx.lineTo(65, -100); ctx.lineTo(65, -72); ctx.quadraticCurveTo(65, -61, 54, -61);
      ctx.lineTo(-54, -61); ctx.quadraticCurveTo(-65, -61, -65, -72); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -100, -61, [[0, '#b9c8d3'], [0.35, '#e2eaef'], [1, '#f6f9fb']]); ctx.fill();
      strokeOnly(ctx, 3);
      ctx.clip();
      ellipsePath(ctx, 0, -63, 10, 2.6); ctx.fillStyle = '#7d8b96'; ctx.fill();
      ellipsePath(ctx, 0, -63.5, 6, 1.4); ctx.fillStyle = '#4c5862'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-65, -99); ctx.lineTo(65, -99); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.3); ctx.stroke();
      // rim tops
      for (const s of [-1, 1]) gloss(ctx, s * 75 - 6, -97, 12, 3, 0.85);
      soapBubble(ctx, 48, -78, 4.5); soapBubble(ctx, 40, -86, 2.8);
    },
    front(ctx, o) {
      const col = [PORCELAIN, '#f9d3dc', '#cdeee4', '#d3e8f8'][(o.v || 0) % 4];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-85, SINK_FRONT); ctx.lineTo(85, SINK_FRONT); ctx.lineTo(85, -59); ctx.quadraticCurveTo(85, -39, 65, -39);
      ctx.lineTo(-65, -39); ctx.quadraticCurveTo(-85, -39, -85, -59); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.clip();
      ctx.fillStyle = rgba(darken(col, 0.55), 0.2); ctx.fillRect(-90, -54, 180, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-90, SINK_FRONT + 3, 180, 5);
      gloss(ctx, -76, SINK_FRONT + 8, 5, 16, 0.7);
      // little embossed scallop detail
      ctx.strokeStyle = rgba(darken(col, 0.4), 0.3); ctx.lineWidth = 2;
      ctx.beginPath(); for (let x = -60; x < 60; x += 20) { ctx.moveTo(x, -60); ctx.quadraticCurveTo(x + 10, -52, x + 20, -60); } ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-85, SINK_FRONT); ctx.lineTo(-85, -59); ctx.quadraticCurveTo(-85, -39, -65, -39);
      ctx.lineTo(65, -39); ctx.quadraticCurveTo(85, -39, 85, -59); ctx.lineTo(85, SINK_FRONT);
      strokeOnly(ctx);
      // side walls rising to the rim
      for (const s of [-1, 1]) {
        rrPath(ctx, s * 75 - 10, -100, 20, 100 + SINK_FRONT + 4, 6); ctx.fillStyle = col; ctx.fill(); strokeOnly(ctx, 3.5);
        gloss(ctx, s * 75 - 6, -97, 12, 3, 0.85);
      }
      // front rim lip
      rrc(ctx, 0, SINK_FRONT, 172, 9, 4.5); fillStroke(ctx, lighten(col, 0.45), 3.5);
      gloss(ctx, -60, SINK_FRONT - 2.5, 90, 2.2, 0.9);
    },
  },

  // ===================================================================== SOAP
  soap: {
    draw(ctx, o, t) {
      const col = ['#ff9ec4', '#c3a6f2', '#93e0c4', '#ffd98a'][(o.v || 0) % 4];
      // dish
      rrc(ctx, 0, 14, 110, 14, 6);
      ctx.fillStyle = vgrad(ctx, 7, 21, [[0, '#e6f6fb'], [1, '#9fd2e6']]); ctx.fill(); strokeOnly(ctx);
      ctx.beginPath(); ctx.moveTo(-50, 10.5); ctx.lineTo(50, 10.5); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      for (let x = -44; x <= 44; x += 11) { circlePath(ctx, x, 16, 1.7); ctx.fillStyle = 'rgba(60,120,150,0.35)'; ctx.fill(); }
      // suds puddle under the bar
      for (const [sx, sy, sr] of [[-42, 6, 5], [-35, 4, 3.5], [40, 6, 5.5], [47, 3, 3], [33, 5, 3]]) foam(ctx, sx, sy, sr, 'rgba(90,150,200,0.5)');
      // soap bar
      toonBox(ctx, 0, -6, 80, 28, 12, col, { hi: 0.5 });
      // embossed word
      rrc(ctx, 0, -5, 52, 14, 6); ctx.lineWidth = 2; ctx.strokeStyle = rgba(darken(col, 0.4), 0.35); ctx.stroke();
      text(ctx, 'SOAP', 0, -4.5, 11, rgba(darken(col, 0.35), 0.55));
      text(ctx, 'SOAP', -0.8, -5.5, 11, 'rgba(255,255,255,0.6)');
      gloss(ctx, -32, -16, 22, 4, 0.85);
      gloss(ctx, 26, -14, 6, 3, 0.7);
      // slippery sparkles
      const tw = 0.6 + 0.4 * Math.sin(t * 5);
      sparkle(ctx, -30, -21, 9 * tw);
      sparkle(ctx, 33, -27, 7 * (1.6 - tw));
      sparkle(ctx, 16, 0, 4);
      soapBubble(ctx, 48, -26, 5.5); soapBubble(ctx, 56, -38, 3.5); soapBubble(ctx, -48, -14, 3.2);
    },
  },

  // ===================================================================== RUBBER DUCK
  rubberduck: {
    draw(ctx, o, t, st) {
      const Y = '#ffd23f';
      const hit = st && st.hit ? st.hit : 0;
      // tail
      ctx.beginPath(); ctx.moveTo(-34, 6); ctx.quadraticCurveTo(-48, 0, -50, -15); ctx.quadraticCurveTo(-38, -8, -24, -1); ctx.closePath();
      fillStroke(ctx, Y);
      // body
      toonBox(ctx, 0, 18, 86, 40, 18, Y, { shade: 0.22, shadeAt: 0.66, hi: 0.45 });
      // wing
      ctx.beginPath(); ctx.moveTo(-28, 8); ctx.bezierCurveTo(-20, -3, 4, -3, 13, 8);
      ctx.quadraticCurveTo(8, 19, -1, 16); ctx.quadraticCurveTo(-7, 23, -15, 18); ctx.quadraticCurveTo(-24, 21, -28, 8); ctx.closePath();
      fillStroke(ctx, '#ffc21f', 3);
      ctx.beginPath(); ctx.moveTo(-18, 10); ctx.quadraticCurveTo(-8, 6, 4, 9); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.3); ctx.stroke();
      gloss(ctx, -30, 4, 18, 4, 0.6);
      // head
      toonCircle(ctx, 18, -18, 22, Y, { shade: 0.22 });
      // hair curl
      ctx.beginPath(); ctx.moveTo(14, -39); ctx.quadraticCurveTo(10, -50, 18, -50); ctx.quadraticCurveTo(24, -49, 20, -44);
      ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = Y; ctx.stroke();
      // beak
      smoothPath(ctx, [[33, -25], [48, -26], [57, -18], [50, -11], [35, -11]]);
      fillStroke(ctx, '#ff9a2e', 3.5);
      ctx.beginPath(); ctx.moveTo(38, -18); ctx.quadraticCurveTo(48, -16, 55, -18); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.6); ctx.stroke();
      gloss(ctx, 38, -24, 10, 2.6, 0.6);
      // eye (blinks, squints when bopped)
      const blink = (t % 3.7) < 0.12 || hit > 0.35;
      if (blink) {
        ctx.beginPath(); ctx.moveTo(19, -24); ctx.quadraticCurveTo(23.5, -20, 28, -24);
        ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
      } else {
        ellipsePath(ctx, 24, -24, 4, 5.4); ctx.fillStyle = INK; ctx.fill();
        circlePath(ctx, 22.6, -26, 1.7); ctx.fillStyle = '#fff'; ctx.fill();
      }
      ellipsePath(ctx, 30, -12, 5, 3); ctx.fillStyle = 'rgba(255,120,120,0.45)'; ctx.fill();
    },
  },

  // ===================================================================== TOWEL RACK
  towelrack: {
    draw(ctx, o) {
      const v = (o.v || 0) % 4;
      const col = ['#ff8fa3', '#5ec8c0', '#ffc857', '#9e8cff'][v];
      const stripe = ['#ffffff', '#ffffff', '#ff8f5a', '#ffffff'][v];
      // wall plates + rod
      for (const s of [-1, 1]) {
        circlePath(ctx, s * 97, -18, 10); ctx.fillStyle = chromeH(ctx, s * 97 - 10, s * 97 + 10); ctx.fill(); strokeOnly(ctx, 3);
      }
      rod(ctx, -96, -18, 96, -18, 7, '#dfe6eb');
      // back layer of the towel (peeks below the front)
      ctx.beginPath();
      ctx.moveTo(-84, -12); ctx.lineTo(-80, 27); ctx.quadraticCurveTo(0, 31, 80, 27); ctx.lineTo(84, -12); ctx.closePath();
      fillStroke(ctx, darken(col, 0.25), 3);
      // front hanging flap
      const hem = (c) => {
        c.moveTo(-87, -12); c.lineTo(-85, 21);
        c.quadraticCurveTo(-64, 25, -42, 21); c.quadraticCurveTo(-21, 17, 0, 21);
        c.quadraticCurveTo(21, 25, 42, 21); c.quadraticCurveTo(64, 17, 85, 21);
        c.lineTo(87, -12);
      };
      ctx.save();
      ctx.beginPath(); hem(ctx); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -12, 24, [[0, darken(col, 0.18)], [0.25, col], [1, darken(col, 0.08)]]); ctx.fill();
      ctx.clip();
      ctx.fillStyle = stripe; ctx.fillRect(-90, 5, 180, 4.5); ctx.fillRect(-90, 12, 180, 2.5);
      // drape folds
      ctx.strokeStyle = rgba(darken(col, 0.5), 0.22); ctx.lineWidth = 3;
      for (const fx of [-60, -22, 20, 58]) { ctx.beginPath(); ctx.moveTo(fx, -8); ctx.quadraticCurveTo(fx + 4, 6, fx - 2, 24); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (const fx of [-44, -4, 38, 74]) { ctx.fillRect(fx, -8, 5, 32); }
      ctx.restore();
      ctx.beginPath(); hem(ctx); strokeOnly(ctx, 3.5);
      // fringe
      ctx.strokeStyle = darken(col, 0.2); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let x = -80; x <= 80; x += 6) { const by = 21 + Math.sin((x + 85) / 42 * Math.PI) * -2; ctx.moveTo(x, by + 3); ctx.lineTo(x + 0.6, by + 8); }
      ctx.stroke();
      // embroidered heart
      ctx.save(); ctx.translate(56, -1); ctx.scale(0.55, 0.55);
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, -4, -8, -16, 0, -8); ctx.bezierCurveTo(8, -16, 14, -4, 0, 6); ctx.closePath();
      ctx.fillStyle = '#fff7e8'; ctx.fill();
      ctx.restore();
      // plush folded roll over the rod (the soft landing spot)
      ctx.save();
      rrc(ctx, 0, -18, 180, 20, 10);
      ctx.fillStyle = vgrad(ctx, -28, -8, [[0, lighten(col, 0.3)], [0.5, col], [1, darken(col, 0.2)]]); ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let x = -88; x < 90; x += 6) for (let y = -25; y < -10; y += 5) { circlePath(ctx, x + ((y + 25) / 5 % 2) * 3, y, 1.1); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; rrc(ctx, -6, -24.5, 150, 3.5, 1.75); ctx.fill();
      ctx.restore();
      rrc(ctx, 0, -18, 180, 20, 10); strokeOnly(ctx);
      // rod caps
      for (const s of [-1, 1]) toonCircle(ctx, s * 97, -18, 5, '#eef3f6', { lw: 3 });
    },
  },

  // ===================================================================== SHOWER HEAD
  showerhead: {
    draw(ctx, o, t) {
      // water curtain inside the wind sensor (x -40..40, y 10..350)
      ctx.save();
      ctx.fillStyle = vgrad(ctx, 4, 350, [[0, 'rgba(110,190,240,0.34)'], [0.55, 'rgba(110,190,240,0.16)'], [1, 'rgba(110,190,240,0)']]);
      ctx.beginPath(); ctx.moveTo(-30, 4); ctx.lineTo(30, 4); ctx.lineTo(39, 350); ctx.lineTo(-39, 350); ctx.closePath(); ctx.fill();
      ctx.lineCap = 'round';
      const edge = vgrad(ctx, 4, 350, [[0, 'rgba(40,130,200,0.55)'], [0.6, 'rgba(40,130,200,0.22)'], [1, 'rgba(40,130,200,0)']]);
      const core = vgrad(ctx, 4, 350, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(240,250,255,0.7)'], [1, 'rgba(240,250,255,0)']]);
      for (let i = 0; i < 9; i++) {
        const fx = -28 + i * 7;
        const sp = 1 + (i % 3) * 0.18;
        ctx.setLineDash([26 + (i % 2) * 8, 18]);
        ctx.lineDashOffset = -(t * 640 * sp + i * 17);
        const w = i % 2 ? 2.2 : 3;
        ctx.beginPath(); ctx.moveTo(fx, 6); ctx.lineTo(fx * 1.3, 350);
        ctx.lineWidth = w + 2.4; ctx.strokeStyle = edge; ctx.stroke();
        ctx.lineWidth = w; ctx.strokeStyle = core; ctx.stroke();
      }
      ctx.setLineDash([]);
      // droplets
      for (let i = 0; i < 8; i++) {
        const ph = (t * 1.5 + i * 0.37) % 1;
        const dx = Math.sin(i * 12.9) * 30 * (1 + ph * 0.25);
        ellipsePath(ctx, dx, 12 + ph * 330, 2.4, 5);
        ctx.fillStyle = `rgba(255,255,255,${0.95 * (1 - ph)})`; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(40,130,200,${0.5 * (1 - ph)})`; ctx.stroke();
      }
      ctx.restore();
      // wall arm + flange
      rod(ctx, -60, -48, -2, -34, 7, '#dfe6eb');
      ellipsePath(ctx, -62, -48, 5, 11); ctx.fillStyle = chromeH(ctx, -67, -57); ctx.fill(); strokeOnly(ctx, 3);
      toonCircle(ctx, 0, -31, 7, '#e6ecf0', { lw: 3.5 });
      // head
      ctx.beginPath();
      ctx.moveTo(-27, -23); ctx.lineTo(27, -23); ctx.quadraticCurveTo(33, -23, 35, -13); ctx.lineTo(35, -3);
      ctx.quadraticCurveTo(35, 3, 29, 3); ctx.lineTo(-29, 3); ctx.quadraticCurveTo(-35, 3, -35, -3);
      ctx.lineTo(-35, -13); ctx.quadraticCurveTo(-33, -23, -27, -23); ctx.closePath();
      ctx.fillStyle = chromeH(ctx, -35, 35); ctx.fill(); strokeOnly(ctx);
      ctx.beginPath(); ctx.moveTo(-31, -10); ctx.lineTo(31, -10); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.3); ctx.stroke();
      gloss(ctx, -24, -20, 30, 3.5, 0.9);
      // face plate with nozzles
      ellipsePath(ctx, 0, 3, 33, 3.5); ctx.fillStyle = '#cfd9e0'; ctx.fill(); strokeOnly(ctx, 2.5);
      ctx.fillStyle = '#5d6a74';
      for (let x = -24; x <= 24; x += 6) { circlePath(ctx, x, 3 + (x % 12 ? 0.8 : -0.6), 1.1); ctx.fill(); }
    },
  },

  // ===================================================================== SCALE
  scale: {
    draw(ctx, o, t, st) {
      const col = ['#8fd6c4', '#f6a9bd', '#94c8f0', '#ffd27a'][(o.v || 0) % 4];
      const hit = st && st.hit ? st.hit : 0;
      // springy coil feet
      for (const s of [-1, 1]) {
        const fx = s * 40;
        rod(ctx, fx, 14, fx, 27, 3, '#9aa4ad');
        for (let k = 0; k < 4; k++) {
          const y = 17 + k * 3.2;
          ctx.beginPath(); ctx.ellipse(fx, y, 7.5, 2.4, -0.12, 0, TAU);
          ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
        }
        for (let k = 0; k < 4; k++) {
          const y = 17 + k * 3.2;
          ctx.beginPath(); ctx.ellipse(fx, y, 7.5, 2.4, -0.12, Math.PI * 0.05, Math.PI * 0.95);
          ctx.lineWidth = 2.4; ctx.strokeStyle = '#eef3f6'; ctx.stroke();
        }
        rrc(ctx, fx, 29, 20, 6, 3); fillStroke(ctx, '#5a5f66', 2.5);
      }
      toonBox(ctx, 0, 0, 120, 32, 8, col, { hi: 0.5 });
      // rubber top mat
      rrc(ctx, 0, -11, 110, 6, 3); ctx.fillStyle = '#ffffff'; ctx.fill(); strokeOnly(ctx, 2, rgba(INK, 0.45));
      ctx.fillStyle = rgba(INK, 0.18);
      for (let x = -50; x <= 50; x += 7) { ctx.fillRect(x - 1, -13, 2, 4); }
      // dial window
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 15, 17, Math.PI, 0); ctx.closePath();
      ctx.fillStyle = '#fffdf6'; ctx.fill(); strokeOnly(ctx, 3);
      ctx.clip();
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI + k / 10 * Math.PI;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, 15 + Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * (k % 5 ? 11 : 9), 15 + Math.sin(a) * (k % 5 ? 11 : 9));
        ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(INK, 0.6); ctx.stroke();
      }
      const na = Math.PI + 0.35 + hit * 2.4 * Math.abs(Math.sin(hit * 9)) + Math.sin(t * 2) * 0.03;
      ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(Math.cos(na) * 13, 15 + Math.sin(na) * 13);
      ctx.lineWidth = 2.4; ctx.strokeStyle = '#e8402e'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
      circlePath(ctx, 0, 15, 2.6); ctx.fillStyle = INK; ctx.fill();
      // footprints decal
      for (const s of [-1, 1]) {
        ellipsePath(ctx, s * 36, 5, 7, 4.2, s * 0.15); ctx.fillStyle = rgba(lighten(col, 0.6), 0.9); ctx.fill();
        for (let k = 0; k < 3; k++) { circlePath(ctx, s * 36 + (k - 1) * 4.6, -1.4 + Math.abs(k - 1) * 0.8, 1.6); ctx.fill(); }
      }
      gloss(ctx, -54, -4, 4, 14, 0.5);
      // boing lines when bopped
      if (hit > 0.05) {
        ctx.save(); ctx.globalAlpha = Math.min(1, hit * 1.5);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 66, -14); ctx.lineTo(s * 76, -22); ctx.moveTo(s * 68, -2); ctx.lineTo(s * 80, -4); ctx.stroke(); }
        ctx.restore();
      }
    },
  },

  // ===================================================================== TOILET PAPER
  toiletpaper: {
    draw(ctx, o) {
      const tint = ['#fbf8f1', '#fdecf1', '#eaf5fb', '#fbf8f1'][(o.v || 0) % 4];
      const roll = (x, y) => {
        toonCircle(ctx, x, y, 27, tint, { shade: 0.16, spec: false });
        ctx.save(); circlePath(ctx, x, y, 25); ctx.clip();
        ctx.strokeStyle = 'rgba(160,140,120,0.28)'; ctx.lineWidth = 1.4;
        for (const rr of [21, 17]) { circlePath(ctx, x, y, rr); ctx.stroke(); }
        ctx.fillStyle = 'rgba(170,150,130,0.22)';
        for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + 0.3; circlePath(ctx, x + Math.cos(a) * 23, y + Math.sin(a) * 23, 1); ctx.fill(); }
        ctx.restore();
        circlePath(ctx, x, y, 11); fillStroke(ctx, '#d6aa6c', 3);
        circlePath(ctx, x + 1, y + 1, 7); ctx.fillStyle = '#6e4a2a'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 9, Math.PI * 1.05, Math.PI * 1.6); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,240,210,0.8)'; ctx.stroke();
        ellipsePath(ctx, x - 12, y - 14, 6, 3, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      };
      // unrolled sheet dangling from the right roll
      ctx.beginPath();
      ctx.moveTo(42, 28); ctx.lineTo(57, 28); ctx.quadraticCurveTo(59, 46, 57, 64);
      ctx.lineTo(53, 62); ctx.lineTo(49, 65); ctx.lineTo(45, 62); ctx.lineTo(41, 64);
      ctx.quadraticCurveTo(43, 46, 42, 28);
      ctx.closePath();
      fillStroke(ctx, tint, 3);
      ctx.setLineDash([2.5, 3]);
      ctx.beginPath(); ctx.moveTo(43, 56); ctx.lineTo(57, 56); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(150,130,110,0.7)'; ctx.stroke();
      ctx.setLineDash([]);
      roll(-30, 28); roll(30, 28); roll(0, -26);
      sparkle(ctx, 30, -44, 6);
      sparkle(ctx, 40, -34, 3);
    },
  },

  // ===================================================================== MIRROR CABINET
  mirrorcab: {
    draw(ctx, o) {
      const col = [PORCELAIN, '#9fd8c8', '#f4b9c7', '#d6a86c'][(o.v || 0) % 4];
      toonBox(ctx, 0, 0, 160, 190, 6, col, { shade: 0.18 });
      // crown (top landing surface)
      toonBox(ctx, 0, -89, 160, 12, 4, lighten(col, 0.3), { hi: 0.6 });
      // mirror door
      const mx = 0, my = 6, mw = 132, mh = 160;
      rrc(ctx, mx, my, mw + 8, mh + 8, 6); ctx.fillStyle = darken(col, 0.12); ctx.fill(); strokeOnly(ctx, 3);
      ctx.save();
      rrc(ctx, mx, my, mw, mh, 4);
      ctx.fillStyle = vgrad(ctx, my - mh / 2, my + mh / 2, [[0, '#e3f6fd'], [0.55, '#b9e2f3'], [1, '#9dd2ea']]); ctx.fill();
      ctx.clip();
      // reflection bands
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(-60, 86); ctx.lineTo(-36, 86); ctx.lineTo(30, -74); ctx.lineTo(6, -74); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(-24, 86); ctx.lineTo(-16, 86); ctx.lineTo(50, -74); ctx.lineTo(42, -74); ctx.closePath(); ctx.fill();
      // fogged steam patch with a finger-drawn smiley
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      smoothPath(ctx, [[-56, 86], [-60, 48], [-34, 30], [0, 34], [30, 24], [60, 40], [62, 86]]); ctx.fill();
      ctx.strokeStyle = 'rgba(140,200,228,0.95)'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      if (mirrored(ctx)) { ctx.translate(-5, 0); ctx.scale(-1, 1); ctx.translate(5, 0); } // a mirrored cabinet still says "Hi"
      circlePath(ctx, 14, 60, 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, 55); ctx.lineTo(8, 57); ctx.moveTo(20, 55); ctx.lineTo(20, 57); ctx.stroke();
      ctx.beginPath(); ctx.arc(14, 62, 8, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-40, 52); ctx.lineTo(-40, 72); ctx.moveTo(-40, 62); ctx.lineTo(-30, 62); ctx.moveTo(-30, 52); ctx.lineTo(-30, 72); ctx.moveTo(-22, 58); ctx.lineTo(-22, 72); ctx.stroke();
      circlePath(ctx, -22, 52, 1.6); ctx.fillStyle = 'rgba(140,200,228,0.95)'; ctx.fill();
      ctx.restore();
      rrc(ctx, mx, my, mw, mh, 4); strokeOnly(ctx, 2.5, rgba(INK, 0.6));
      // sticky note
      ctx.save(); ctx.translate(-42, -52); ctx.rotate(-0.12);
      rrc(ctx, 0, 0, 34, 32, 2); fillStroke(ctx, '#fff07a', 2.5);
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(-17, -16, 34, 7);
      ctx.strokeStyle = rgba('#3e6fc0', 0.75); ctx.lineWidth = 1.8;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-11, -3 + k * 7); ctx.lineTo(9 - (k % 2) * 6, -3 + k * 7); ctx.stroke(); }
      ctx.restore();
      // hinges & knob
      for (const hy of [-56, 68]) { rrc(ctx, -71, hy, 6, 16, 2); fillStroke(ctx, '#cfd7de', 2); }
      toonCircle(ctx, 58, 8, 5.5, '#eef3f6', { lw: 3 });
      // twinkles on the glass
      sparkle(ctx, 40, -50, 7); sparkle(ctx, 50, -36, 3.5); sparkle(ctx, -50, 20, 4);
    },
  },

  // ===================================================================== HAIR DRYER
  hairdryer: {
    draw(ctx, o, t) {
      const col = ['#ff8fb1', '#4fc3c8', '#b49cf0', '#ffb347'][(o.v || 0) % 4];
      // hot-air shimmer (inside the wind sensor x 50..450, y -60..30)
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = hgrad(ctx, 58, 440, [[0, 'rgba(255,190,120,0.85)'], [0.35, 'rgba(255,220,170,0.45)'], [1, 'rgba(255,230,190,0)']]);
      for (let k = 0; k < 5; k++) {
        const y0 = -48 + k * 17;
        ctx.setLineDash([30 + k * 4, 22]);
        ctx.lineDashOffset = -(t * 520 + k * 31);
        ctx.lineWidth = k % 2 ? 2.4 : 3.4;
        ctx.beginPath();
        for (let x = 60; x <= 440; x += 14) {
          const a = 2 + (x - 60) * 0.016;
          const y = y0 + (y0 + 15) * (x - 60) * 0.0006 + Math.sin(x * 0.05 - t * 11 + k * 1.7) * a;
          if (x === 60) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      // cord
      ctx.beginPath(); ctx.moveTo(4, 44); ctx.bezierCurveTo(0, 56, -22, 50, -26, 42); ctx.bezierCurveTo(-30, 34, -42, 38, -40, 48);
      ctx.lineWidth = 7.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 3.4; ctx.strokeStyle = '#5b5f66'; ctx.stroke();
      // handle
      ctx.save(); ctx.translate(8, 24); ctx.rotate(0.2);
      toonBox(ctx, 0, 0, 24, 46, 10, darken(col, 0.08));
      rrc(ctx, 0, -6, 8, 16, 3); fillStroke(ctx, '#ffffff', 2.5);
      rrc(ctx, 0, -10 + Math.round((t * 0.5) % 1) * 0, 6, 6, 2); ctx.fillStyle = '#e8402e'; ctx.fill();
      rrc(ctx, 0, 24, 14, 8, 3); fillStroke(ctx, '#4a4e55', 2.5);
      ctx.restore();
      // nozzle (concentrator) with heat glow
      ctx.beginPath(); ctx.moveTo(38, -32); ctx.lineTo(58, -28); ctx.lineTo(58, -2); ctx.lineTo(38, 2); ctx.closePath();
      fillStroke(ctx, '#3d4149');
      const glow = 0.65 + 0.35 * Math.sin(t * 9);
      rrc(ctx, 56, -15, 4, 22, 2); ctx.fillStyle = `rgba(255,${120 + glow * 60},40,${0.6 + glow * 0.4})`; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ellipsePath(ctx, 62, -15, 9, 15); ctx.fillStyle = `rgba(255,140,40,${0.25 * glow})`; ctx.fill();
      ctx.restore();
      // barrel
      toonBox(ctx, 0, -15, 90, 46, 20, col, { hi: 0.5 });
      // rear intake grill
      ellipsePath(ctx, -34, -15, 7, 17); fillStroke(ctx, '#4a4e55', 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.6;
      for (const gy of [-24, -18, -12, -6]) { ctx.beginPath(); ctx.moveTo(-37, gy); ctx.lineTo(-31, gy); ctx.stroke(); }
      // chrome band
      ctx.save(); rrc(ctx, 0, -15, 90, 46, 20); ctx.clip();
      ctx.fillStyle = chromeH(ctx, 16, 28); ctx.fillRect(16, -40, 12, 50);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(16, -37); ctx.lineTo(16, 7); ctx.moveTo(28, -37); ctx.lineTo(28, 7); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
      rrc(ctx, 0, -15, 90, 46, 20); strokeOnly(ctx);
      // heat setting dots
      for (let k = 0; k < 3; k++) { circlePath(ctx, -14 + k * 8, -4, 2.4); ctx.fillStyle = k < 2 ? '#ffe9a8' : 'rgba(255,255,255,0.45)'; ctx.fill(); }
      gloss(ctx, -22, -32, 34, 5, 0.75);
    },
  },
};

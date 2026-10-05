// Hot Dog Heaven background: pastel golden sky, god rays, distant cloud castles, tiny winged hot dogs,
// a pearly gate silhouette, and a bottom band that is a soft sea of clouds.
import { rgba, lighten, darken, mix, rrc, ellipsePath, circlePath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { bgStroke } from './common.js';
import { softCloud } from './beach.js';

const TAU = Math.PI * 2;
const HINK = 'rgba(150,100,140,0.22)';

function godRays(ctx, sx, sy, box, r) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const len = box.y1 - sy;
  for (let i = 0; i < 11; i++) {
    const a = Math.PI / 2 + (i - 5) * 0.13 + (r() - 0.5) * 0.05;
    const w = 0.018 + r() * 0.03;
    const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    const al = 0.035 + r() * 0.045;
    g.addColorStop(0, `rgba(255,246,210,${al})`); g.addColorStop(0.75, `rgba(255,240,200,${al * 0.5})`); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len);
    ctx.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function cloudCastle(ctx, x, y, s, r) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.globalAlpha = 0.75;
  const wall = '#fff4f6', roof = '#ffd88a', win = 'rgba(255,200,120,0.65)';
  // towers
  const towers = [[-70, 120, 30], [-24, 170, 36], [26, 140, 32], [72, 104, 26]];
  for (const [tx, th, tw] of towers) {
    rrc(ctx, tx, -th / 2, tw, th, 6); ctx.fillStyle = wall; ctx.fill(); bgStroke(ctx, 2, HINK);
    // cone roof
    ctx.beginPath(); ctx.moveTo(tx - tw / 2 - 6, -th + 2); ctx.quadraticCurveTo(tx, -th - 10, tx, -th - 44); ctx.quadraticCurveTo(tx, -th - 10, tx + tw / 2 + 6, -th + 2); ctx.closePath();
    ctx.fillStyle = roof; ctx.fill(); bgStroke(ctx, 2, HINK);
    // pennant
    ctx.beginPath(); ctx.moveTo(tx, -th - 44); ctx.lineTo(tx, -th - 62); bgStroke(ctx, 2, 'rgba(150,100,140,0.35)');
    ctx.beginPath(); ctx.moveTo(tx, -th - 62); ctx.lineTo(tx + 16, -th - 57); ctx.lineTo(tx, -th - 52); ctx.closePath(); ctx.fillStyle = 'rgba(255,140,170,0.7)'; ctx.fill();
    // windows
    ctx.fillStyle = win;
    ctx.beginPath(); ctx.moveTo(tx - 5, -th * 0.55); ctx.lineTo(tx - 5, -th * 0.55 - 10); ctx.arc(tx, -th * 0.55 - 10, 5, Math.PI, 0); ctx.lineTo(tx + 5, -th * 0.55); ctx.closePath(); ctx.fill();
  }
  // gate wall
  rrc(ctx, 0, -40, 150, 80, 8); ctx.fillStyle = wall; ctx.fill(); bgStroke(ctx, 2, HINK);
  ctx.fillStyle = 'rgba(255,200,120,0.5)';
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-16, -30); ctx.arc(0, -30, 16, Math.PI, 0); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  // clouds wrapping the base
  softCloud(ctx, x - 40 * s, y + 4 * s, 0.9 * s, r, '#f0c6e0', 0.95);
  softCloud(ctx, x + 60 * s, y + 10 * s, 0.75 * s, r, '#f0c6e0', 0.95);
}

function angelDog(ctx, x, y, s, a, flap) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  // wings
  for (const [wx, sc, al] of [[-4, 1, 0.75], [6, 0.85, 0.95]]) {
    ctx.save(); ctx.translate(wx, -6); ctx.rotate(-0.3 + flap * 0.4); ctx.scale(1, sc);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-6, -26, -30, -30, -36, -18); ctx.bezierCurveTo(-26, -16, -28, -8, -20, -6);
    ctx.bezierCurveTo(-24, 0, -14, 4, 0, 0); ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${al})`; ctx.fill(); bgStroke(ctx, 1.6, HINK);
    ctx.restore();
  }
  // sausage body
  ctx.beginPath(); ctx.moveTo(-24, 2); ctx.quadraticCurveTo(0, -8, 24, 2);
  ctx.lineCap = 'round'; ctx.lineWidth = 17; ctx.strokeStyle = 'rgba(150,70,60,0.35)'; ctx.stroke();
  ctx.lineWidth = 14; ctx.strokeStyle = '#ec8a6e'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(0, -9, 16, -3); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,210,0.6)'; ctx.stroke();
  // face
  circlePath(ctx, 14, -1, 1.8); ctx.fillStyle = 'rgba(60,30,30,0.8)'; ctx.fill();
  circlePath(ctx, 19, 0, 1.8); ctx.fill();
  ctx.beginPath(); ctx.arc(17, 2, 2.2, 0.2, Math.PI - 0.2); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(60,30,30,0.7)'; ctx.stroke();
  // halo
  ctx.beginPath(); ctx.ellipse(14, -16, 9, 3, -0.1, 0, TAU); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.stroke();
  ctx.restore();
}

function pearlyGate(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // golden glow behind
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, 0, -120, 10, 220, [[0, 'rgba(255,236,170,0.45)'], [1, 'rgba(255,236,170,0)']]);
  ctx.fillRect(-240, -340, 480, 440);
  ctx.restore();
  const P = 'rgba(255,252,244,0.82)';
  // pillars with orb tops
  for (const sx of [-1, 1]) {
    rrc(ctx, sx * 112, -95, 34, 190, 4); ctx.fillStyle = P; ctx.fill(); bgStroke(ctx, 2, HINK);
    rrc(ctx, sx * 112, -192, 46, 14, 4); ctx.fillStyle = P; ctx.fill(); bgStroke(ctx, 2, HINK);
    circlePath(ctx, sx * 112, -214, 16); ctx.fillStyle = 'rgba(255,240,250,0.95)'; ctx.fill(); bgStroke(ctx, 2, HINK);
    circlePath(ctx, sx * 112 - 5, -219, 5); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,190,0.25)'; ctx.lineWidth = 2;
    for (const k of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(sx * 112 + k, -178); ctx.lineTo(sx * 112 + k, -6); ctx.stroke(); }
  }
  // arched gate bars (two leaves, slightly ajar)
  for (const sx of [-1, 1]) {
    ctx.save(); ctx.translate(sx * 95, 0); ctx.scale(sx * 0.92, 1);
    ctx.strokeStyle = 'rgba(255,214,120,0.75)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i <= 5; i++) {
      const bx = -i * 16, top = -150 - Math.sin((i / 5) * Math.PI / 2) * 50;
      ctx.beginPath(); ctx.moveTo(bx, -4); ctx.lineTo(bx, top); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, top - 4, 3.5, 0, TAU); ctx.fillStyle = 'rgba(255,214,120,0.85)'; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(0, -150); ctx.quadraticCurveTo(-50, -190, -84, -200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(-84, -60); ctx.moveTo(0, -110); ctx.lineTo(-84, -110); ctx.stroke();
    // scroll ornaments
    for (const [cx, cy] of [[-24, -85], [-58, -85], [-41, -135]]) { ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU * 0.8); ctx.lineWidth = 2.5; ctx.stroke(); }
    ctx.restore();
  }
  // golden "HD" crest atop
  circlePath(ctx, 0, -236, 22); ctx.fillStyle = 'rgba(255,224,140,0.85)'; ctx.fill(); bgStroke(ctx, 2, HINK);
  ctx.beginPath(); ctx.moveTo(-12, -238); ctx.quadraticCurveTo(0, -228, 12, -238); ctx.lineCap = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(230,120,100,0.85)'; ctx.stroke();
  ctx.restore();
}

// One row of the cloud sea: a union of big puffs whose tops sit near y.
function cloudRow(ctx, x0, x1, y, rmin, rmax, fill, shade, r, depth) {
  const puffs = [];
  for (let x = x0 - 40; x < x1 + 60; x += rmin * 1.1 + r() * (rmax - rmin) * 0.9) {
    const rr = rmin + r() * (rmax - rmin);
    puffs.push([x, y + rr * 0.55 + (r() - 0.5) * 10, rr]);
  }
  const path = () => {
    ctx.beginPath();
    for (const [px, py, pr] of puffs) { ctx.moveTo(px + pr, py); ctx.arc(px, py, pr, 0, TAU); }
    ctx.rect(x0 - 60, y + rmax * 0.6, x1 - x0 + 120, depth);
  };
  // soft shadow cast on the row behind
  ctx.save(); ctx.translate(0, -6);
  path(); ctx.fillStyle = 'rgba(150,120,200,0.18)'; ctx.fill();
  ctx.restore();
  path(); ctx.fillStyle = fill; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = vgrad(ctx, y, y + rmax * 1.3, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0)'], [1, shade]]);
  ctx.fillRect(x0 - 60, y - rmax, x1 - x0 + 120, rmax * 1.6 + depth);
  // soft re-lit puff tops (volume) + a warm rim
  for (const [px, py, pr] of puffs) {
    circlePath(ctx, px - pr * 0.12, py - pr * 0.18, pr * 0.78); ctx.fillStyle = rgba(fill, 0.7); ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, pr - 2, Math.PI * 1.2, Math.PI * 1.7);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,232,170,0.4)'; ctx.stroke();
  }
  ctx.restore();
}

export function drawHeavenBG(ctx, L, box, W) {
  const r = rng(L.seed || 1);
  const H = L.h;
  // ---- pastel golden sky
  ctx.fillStyle = vgrad(ctx, H - 2400, H, [[0, '#c9b6f2'], [0.35, '#f4c3de'], [0.68, '#ffd6b4'], [1, '#fff0bd']]);
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, H - box.y0 + 2);
  // radiant glow
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, W / 2, H - 1250, 0, 950, [[0, 'rgba(255,240,190,0.22)'], [0.5, 'rgba(255,230,180,0.08)'], [1, 'rgba(255,230,180,0)']]);
  ctx.fillRect(W / 2 - 950, H - 2200, 1900, 1900);
  ctx.restore();
  godRays(ctx, W * 0.5, Math.min(box.y0, H - 1700) - 200, box, r);
  // tiny twinkles
  for (let i = 0; i < 90; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (H - box.y0 - 300);
    const s = 2 + r() * 4;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y); ctx.closePath();
    ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.25); ctx.closePath(); ctx.fill();
  }
  // ---- distant cloud castles low in the sky (sides), far ones higher
  const left = r() < 0.5;
  cloudCastle(ctx, left ? -30 : W + 30, H - 260, 1.05, r);
  cloudCastle(ctx, left ? W + 70 : -70, H - 520, 0.6, r);
  // ---- decor spread upward
  const items = ['dogs', 'cloud', 'castle', 'dogs', 'cloud', 'sparkles', 'dogs', 'cloud'];
  let k = Math.floor(r() * items.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = H - 700; y > box.y0 + 60; y -= 300 + r() * 120) {
    const kind = items[k++ % items.length];
    side = -side;
    const x = W / 2 + side * (110 + r() * 230);
    if (kind === 'dogs') {
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) angelDog(ctx, x + (r() - 0.5) * 160, y + (r() - 0.5) * 100, 1.1 + r() * 0.5, (r() - 0.5) * 0.5, r());
    } else if (kind === 'cloud') softCloud(ctx, x, y, 0.8 + r() * 0.5, r, '#f0c0dc', 0.92);
    else if (kind === 'castle') cloudCastle(ctx, x + side * 120, y, 0.45, r);
    else if (kind === 'sparkles') {
      // a little drift of cloudlets and twinkles
      softCloud(ctx, x, y, 0.45, r, '#f0c0dc', 0.85);
      softCloud(ctx, x + 70, y + 40, 0.35, r, '#f0c0dc', 0.8);
      for (let i = 0; i < 6; i++) {
        const sx = x + (r() - 0.5) * 180, sy = y + (r() - 0.5) * 120, ss = 4 + r() * 6;
        ctx.fillStyle = 'rgba(255,248,210,0.85)';
        ctx.beginPath(); ctx.moveTo(sx, sy - ss); ctx.lineTo(sx + ss * 0.25, sy); ctx.lineTo(sx, sy + ss); ctx.lineTo(sx - ss * 0.25, sy); ctx.closePath();
        ctx.moveTo(sx - ss, sy); ctx.lineTo(sx, sy + ss * 0.25); ctx.lineTo(sx + ss, sy); ctx.lineTo(sx, sy - ss * 0.25); ctx.closePath(); ctx.fill();
      }
    }
    if (r() < 0.5) softCloud(ctx, W / 2 - side * (250 + r() * 220), y - 150 - r() * 60, 0.55 + r() * 0.3, r, '#f0c0dc', 0.75);
  }
  // ---- pearly gate standing on the cloud sea
  pearlyGate(ctx, left ? W * 0.74 : W * 0.26, H + 6, 0.95);
  // ---- bottom band: sea of clouds
  const D = box.y1 - H;
  ctx.fillStyle = vgrad(ctx, H, box.y1, [[0, '#f6dff0'], [1, '#c8b4ec']]);
  ctx.fillRect(box.x0, H + 20, box.x1 - box.x0, D);
  cloudRow(ctx, box.x0, box.x1, H - 14, 34, 62, '#fffafc', 'rgba(232,196,232,0.85)', r, D);
  cloudRow(ctx, box.x0, box.x1, H + 50, 40, 70, '#fbeef8', 'rgba(205,180,236,0.9)', r, D);
  cloudRow(ctx, box.x0, box.x1, H + 130, 46, 80, '#f1e2f6', 'rgba(185,165,230,0.95)', r, D);
  cloudRow(ctx, box.x0, box.x1, H + 220, 50, 90, '#e6d8f4', 'rgba(170,150,222,1)', r, D);
  // sparkles in the cloud sea
  for (let i = 0; i < 40; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), y = H + 10 + r() * (D - 20), s = 3 + r() * 4;
    ctx.fillStyle = 'rgba(255,250,220,0.7)';
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y); ctx.closePath();
    ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.25); ctx.closePath(); ctx.fill();
  }
}

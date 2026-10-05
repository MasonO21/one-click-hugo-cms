// Living room background: sage damask wallpaper, painted wainscoting, framed art,
// dusky evening windows, warm lamp glows, bookcase silhouettes and a rug on a wood floor.
import { rgba, lighten, darken, mix, rrc, rrPath, ellipsePath, circlePath, polyPath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { bgStroke, wallFill, baseboard, floorBand, windowFrame, curtains, frame, plantPot, lightRays } from './common.js';

const TAU = Math.PI * 2;

function wallpaper(ctx, box, yTo) {
  const sx = 70, sy = 88;
  // faint diamond lattice
  ctx.strokeStyle = 'rgba(255,255,240,0.08)'; ctx.lineWidth = 2;
  for (let j = Math.floor(box.y0 / sy); j * sy < yTo; j++) {
    const y = j * sy, off = (j & 1) ? sx / 2 : 0;
    ctx.beginPath();
    for (let x = Math.floor(box.x0 / sx) * sx + off - sx; x < box.x1 + sx; x += sx) {
      ctx.moveTo(x, y - sy / 2 + 26); ctx.lineTo(x + sx / 2 - 16, y); ctx.lineTo(x, y + sy / 2 - 26); ctx.lineTo(x - sx / 2 + 16, y); ctx.closePath();
    }
    ctx.stroke();
  }
  // damask motifs
  for (let j = Math.floor(box.y0 / sy); j * sy < yTo; j++) {
    const y = j * sy;
    const off = (j & 1) ? sx / 2 : 0;
    for (let x = Math.floor(box.x0 / sx) * sx + off - sx; x < box.x1 + sx; x += sx) {
      ctx.fillStyle = 'rgba(255,253,235,0.16)';
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        ellipsePath(ctx, x + Math.cos(a) * 7, y + Math.sin(a) * 9, k % 2 ? 6 : 4, k % 2 ? 4 : 7);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(120,140,100,0.16)';
      circlePath(ctx, x, y, 2.6); ctx.fill();
      ctx.fillStyle = 'rgba(255,253,235,0.10)';
      ellipsePath(ctx, x, y - 20, 2, 6); ctx.fill();
      ellipsePath(ctx, x, y + 20, 2, 6); ctx.fill();
    }
  }
}

function wainscot(ctx, box, yTop, yBot) {
  ctx.fillStyle = vgrad(ctx, yTop, yBot, [[0, '#efe6d0'], [1, '#e2d5b8']]);
  ctx.fillRect(box.x0, yTop, box.x1 - box.x0, yBot - yTop);
  const pw = 128;
  for (let x = Math.floor(box.x0 / pw) * pw; x < box.x1; x += pw) {
    rrc(ctx, x + pw / 2, (yTop + yBot) / 2 + 6, pw - 26, yBot - yTop - 56, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(); bgStroke(ctx, 2, 'rgba(110,80,50,0.22)');
    rrc(ctx, x + pw / 2, (yTop + yBot) / 2 + 6, pw - 40, yBot - yTop - 70, 3);
    bgStroke(ctx, 1.5, 'rgba(110,80,50,0.12)');
  }
  // chair rail
  ctx.fillStyle = '#d9c7a4'; ctx.fillRect(box.x0, yTop - 12, box.x1 - box.x0, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(box.x0, yTop - 12, box.x1 - box.x0, 3);
  ctx.fillStyle = 'rgba(60,40,20,0.15)'; ctx.fillRect(box.x0, yTop + 2, box.x1 - box.x0, 5);
}

function duskScene(ctx, x, y, w, h) {
  const r = rng(Math.round(x * 3 + y));
  // stars + moon
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 9; i++) { circlePath(ctx, x + r() * w, y + r() * h * 0.45, 0.8 + r() * 1.4); ctx.fill(); }
  circlePath(ctx, x + w * 0.74, y + h * 0.22, 13); ctx.fillStyle = '#fff4d0'; ctx.fill();
  circlePath(ctx, x + w * 0.74 + 6, y + h * 0.22 - 4, 12); ctx.fillStyle = '#5a4f92'; ctx.fill();
  // setting sun glow on the horizon
  ctx.fillStyle = rgrad(ctx, x + w * 0.3, y + h * 0.82, 4, w * 0.6, [[0, 'rgba(255,214,140,0.9)'], [1, 'rgba(255,160,110,0)']]);
  ctx.fillRect(x, y, w, h);
  // rooftops with lit windows
  ctx.fillStyle = '#4b3a63';
  ctx.beginPath(); ctx.moveTo(x, y + h);
  const roofs = [[0, 0.7], [0.12, 0.62], [0.22, 0.7], [0.3, 0.66], [0.44, 0.74], [0.56, 0.6], [0.68, 0.68], [0.8, 0.64], [0.92, 0.72], [1, 0.7]];
  for (const [fx, fy] of roofs) ctx.lineTo(x + fx * w, y + fy * h);
  ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,214,120,0.9)';
  for (let i = 0; i < 6; i++) ctx.fillRect(x + (0.06 + i * 0.16) * w, y + h * (0.8 + (i % 2) * 0.06), 6, 7);
  // tree silhouette
  ctx.fillStyle = '#3a2e52';
  circlePath(ctx, x + w * 0.12, y + h * 0.58, 18); ctx.fill();
  circlePath(ctx, x + w * 0.2, y + h * 0.66, 14); ctx.fill();
}

function windowWithDusk(ctx, x, y, r) {
  ctx.save();
  // warm light spilling from the evening window
  lightRays(ctx, x, y - 70, 190, 460, 0.09);
  windowFrame(ctx, x, y, 160, 170, { sky: ['#3c3f86', '#f6a374'], frame: '#f4ead6', scene: duskScene });
  curtains(ctx, x, y, 160, 170, r() < 0.5 ? '#b8545a' : '#d9a84a');
  // tie-backs
  ctx.fillStyle = 'rgba(240,210,140,0.9)';
  for (const s of [-1, 1]) { rrc(ctx, x + s * 92, y + 10, 30, 8, 4); ctx.fill(); }
  ctx.restore();
}

function sunsetPainting(ctx, x, y, w, h) {
  ctx.fillStyle = vgrad(ctx, y - h / 2, y + h / 2, [[0, '#f7c58a'], [0.6, '#f29a7a'], [1, '#c96f7a']]); ctx.fillRect(x - w / 2, y - h / 2, w, h);
  circlePath(ctx, x + w * 0.15, y + h * 0.05, h * 0.18); ctx.fillStyle = '#fff1c8'; ctx.fill();
  ctx.fillStyle = '#8f9d6a';
  ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2); ctx.quadraticCurveTo(x - w * 0.2, y, x + w * 0.1, y + h * 0.2); ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.1, x + w / 2, y + h * 0.25); ctx.lineTo(x + w / 2, y + h / 2); ctx.fill();
  ctx.fillStyle = '#6f7f52';
  ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2); ctx.quadraticCurveTo(x, y + h * 0.18, x + w / 2, y + h * 0.4); ctx.lineTo(x + w / 2, y + h / 2); ctx.fill();
}

function franksPortrait(ctx, x, y, w, h) {
  ctx.fillStyle = '#cfe3d4'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.lineCap = 'round';
  ctx.lineWidth = 16; ctx.strokeStyle = '#c95a3e';
  ctx.beginPath(); ctx.moveTo(x - w * 0.28, y + 8); ctx.quadraticCurveTo(x, y - 10, x + w * 0.28, y + 8); ctx.stroke();
  ctx.fillStyle = '#3a2216';
  circlePath(ctx, x + w * 0.08, y - 1, 2); ctx.fill(); circlePath(ctx, x + w * 0.17, y + 1, 2); ctx.fill();
  // tiny moustache = distinguished ancestor
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#3a2216';
  ctx.beginPath(); ctx.moveTo(x + w * 0.06, y + 6); ctx.quadraticCurveTo(x + w * 0.13, y + 3, x + w * 0.2, y + 7); ctx.stroke();
}

function abstractArt(ctx, x, y, w, h) {
  ctx.fillStyle = '#f6efe0'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  circlePath(ctx, x - w * 0.12, y - h * 0.1, w * 0.22); ctx.fillStyle = '#e9a26a'; ctx.fill();
  ctx.fillStyle = '#7fb1a8'; ctx.fillRect(x - w * 0.05, y - h * 0.05, w * 0.4, h * 0.42);
  ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - w * 0.4, y + h * 0.3); ctx.quadraticCurveTo(x, y - h * 0.4, x + w * 0.4, y + h * 0.1); ctx.stroke();
}

function galleryWall(ctx, x, y, r) {
  const wood = ['#b9875a', '#d4b06a', '#8c6a4f'];
  // picture wire hooks are implied; soft drop shadows
  const items = [
    [x - 70, y - 10, 120, 92, wood[0], sunsetPainting],
    [x + 58, y - 34, 70, 84, wood[1], franksPortrait],
    [x + 54, y + 50, 76, 58, wood[2], abstractArt],
  ];
  for (const [fx, fy, fw, fh, fc, inner] of items) {
    ctx.fillStyle = 'rgba(40,30,20,0.12)'; ctx.fillRect(fx - fw / 2 + 5, fy - fh / 2 + 6, fw, fh);
    frame(ctx, fx, fy, fw, fh, fc, inner);
  }
}

function wallShelf(ctx, x, y, r) {
  const cols = ['#c97b63', '#7f9fb8', '#d8b25e', '#8fae7c', '#a888b8', '#e0a37a'];
  // books (muted silhouettes)
  let bx = x - 84;
  for (let i = 0; i < 9; i++) {
    const bw = 9 + Math.floor(r() * 7), bh = 34 + r() * 22;
    rrPath(ctx, bx, y - bh, bw, bh, 2); ctx.fillStyle = mix(cols[Math.floor(r() * cols.length)], '#c9cfb2', 0.35); ctx.fill(); bgStroke(ctx, 1.5);
    bx += bw + 1;
  }
  // vase + candle
  ctx.beginPath(); ctx.moveTo(x + 30, y); ctx.quadraticCurveTo(x + 18, y - 22, x + 30, y - 38); ctx.lineTo(x + 40, y - 38); ctx.quadraticCurveTo(x + 52, y - 22, x + 40, y); ctx.closePath();
  ctx.fillStyle = '#9cc4c4'; ctx.fill(); bgStroke(ctx, 2);
  ctx.strokeStyle = 'rgba(90,130,80,0.6)'; ctx.lineWidth = 2;
  for (const a of [-0.5, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(x + 35, y - 36); ctx.lineTo(x + 35 + Math.sin(a) * 26, y - 36 - Math.cos(a) * 26); ctx.stroke(); circlePath(ctx, x + 35 + Math.sin(a) * 27, y - 36 - Math.cos(a) * 27, 4); ctx.fillStyle = '#f2c0c0'; ctx.fill(); }
  rrc(ctx, x + 72, y - 14, 12, 28, 3); ctx.fillStyle = '#fbf3e0'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.fillStyle = rgrad(ctx, x + 72, y - 34, 1, 26, [[0, 'rgba(255,220,140,0.6)'], [1, 'rgba(255,220,140,0)']]); ctx.fillRect(x + 46, y - 60, 52, 52);
  ellipsePath(ctx, x + 72, y - 34, 3, 6); ctx.fillStyle = '#ffd36a'; ctx.fill();
  // the shelf board + brackets
  rrc(ctx, x, y + 5, 200, 8, 3); ctx.fillStyle = mix('#b48a62', '#b9c3a2', 0.45); ctx.fill(); bgStroke(ctx, 1.5, 'rgba(58,34,22,0.18)');
  ctx.fillStyle = 'rgba(40,30,20,0.12)'; ctx.fillRect(x - 100, y + 10, 200, 8);
}

function sconces(ctx, x, y) {
  for (const s of [-1, 1]) {
    const sx = x + s * 70;
    ctx.fillStyle = rgrad(ctx, sx, y - 10, 4, 110, [[0, 'rgba(255,214,140,0.45)'], [0.5, 'rgba(255,200,120,0.14)'], [1, 'rgba(255,200,120,0)']]);
    ctx.fillRect(sx - 110, y - 120, 220, 230);
    rrc(ctx, sx, y + 18, 12, 22, 4); ctx.fillStyle = '#c9a25a'; ctx.fill(); bgStroke(ctx, 1.5);
    ctx.beginPath(); ctx.moveTo(sx - 16, y - 18); ctx.lineTo(sx + 16, y - 18); ctx.lineTo(sx + 22, y + 8); ctx.lineTo(sx - 22, y + 8); ctx.closePath();
    ctx.fillStyle = '#f7e2b4'; ctx.fill(); bgStroke(ctx, 1.8);
  }
  // little mirror between them
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); ctx.lineTo(x + Math.cos(a) * 46, y + Math.sin(a) * 46);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(214,170,80,0.75)'; ctx.stroke();
  }
  circlePath(ctx, x, y, 30); ctx.fillStyle = '#d6a650'; ctx.fill(); bgStroke(ctx, 1.5);
  circlePath(ctx, x, y, 24); ctx.fillStyle = vgrad(ctx, y - 24, y + 24, [[0, '#e9f2f2'], [1, '#b9cfd4']]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(x - 14, y + 10); ctx.lineTo(x - 4, y + 18); ctx.lineTo(x + 12, y - 16); ctx.lineTo(x + 2, y - 22); ctx.fill();
  ctx.restore();
}

function pendulumClock(ctx, x, y) {
  const wood = '#a8784e';
  ctx.fillStyle = 'rgba(40,30,20,0.12)'; ctx.fillRect(x - 32, y - 60, 72, 176);
  // case
  ctx.beginPath(); ctx.moveTo(x - 34, y - 30); ctx.quadraticCurveTo(x - 34, y - 74, x, y - 76); ctx.quadraticCurveTo(x + 34, y - 74, x + 34, y - 30);
  ctx.lineTo(x + 30, y + 100); ctx.lineTo(x - 30, y + 100); ctx.closePath();
  ctx.fillStyle = wood; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, x, y + 106, 74, 12, 3); ctx.fillStyle = darken(wood, 0.1); ctx.fill(); bgStroke(ctx, 1.5);
  // face
  circlePath(ctx, x, y - 34, 25); ctx.fillStyle = '#fbf3df'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = 'rgba(58,34,22,0.45)';
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; circlePath(ctx, x + Math.cos(a) * 19, y - 34 + Math.sin(a) * 19, 1.5); ctx.fill(); }
  ctx.strokeStyle = 'rgba(58,34,22,0.6)'; ctx.lineCap = 'round';
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x + 9, y - 40); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x - 3, y - 51); ctx.stroke();
  // pendulum window
  rrc(ctx, x, y + 44, 38, 92, 6); ctx.fillStyle = 'rgba(60,40,30,0.35)'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.strokeStyle = '#d9b25e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + 6, y + 66); ctx.stroke();
  circlePath(ctx, x + 6, y + 72, 10); ctx.fillStyle = '#e3bc62'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x - 14, y + 2, 5, 84);
}

function builtinShelves(ctx, x, y, w, h, seed) {
  const r = rng(seed);
  const wood = '#a98462';
  rrc(ctx, x, y - h / 2, w, h, 4); ctx.fillStyle = mix(wood, '#b9c3a2', 0.7); ctx.fill(); bgStroke(ctx, 1.5, 'rgba(58,34,22,0.16)');
  const rows = Math.floor(h / 92);
  for (let i = 0; i < rows; i++) {
    const y1 = y - 14 - i * 92, y0 = y1 - 76;
    ctx.fillStyle = 'rgba(70,60,40,0.16)'; ctx.fillRect(x - w / 2 + 12, y0, w - 24, 76);
    let bx = x - w / 2 + 16;
    while (bx < x + w / 2 - 26) {
      const bw = 10 + Math.floor(r() * 9), bh = 44 + r() * 28;
      if (r() < 0.12) { bx += 14; continue; }
      rrPath(ctx, bx, y1 - bh, bw, bh, 2);
      ctx.fillStyle = mix(['#c97b63', '#7f9fb8', '#d8b25e', '#8fae7c', '#a888b8'][Math.floor(r() * 5)], '#b9c0a0', 0.72);
      ctx.fill(); bgStroke(ctx, 1, 'rgba(58,34,22,0.14)');
      bx += bw + 1;
    }
    ctx.fillStyle = mix(wood, '#b9c3a2', 0.4); ctx.fillRect(x - w / 2 + 6, y1, w - 12, 8);
  }
}

function rug(ctx, x0, x1, y0, y1) {
  const inset = 22;
  const path = () => { ctx.beginPath(); ctx.moveTo(x0 + inset, y0); ctx.lineTo(x1 - inset, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath(); };
  // fringe
  ctx.strokeStyle = 'rgba(245,232,205,0.85)'; ctx.lineWidth = 2;
  for (const [xa, xb, sgn] of [[x0 + inset, x0, -1], [x1 - inset, x1, 1]]) {
    for (let k = 0; k <= 12; k++) {
      const f = k / 12, px = xa + (xb - xa) * f, py = y0 + (y1 - y0) * f;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + sgn * 10, py + 1); ctx.stroke();
    }
  }
  path(); ctx.fillStyle = '#a8454a'; ctx.fill();
  ctx.save(); path(); ctx.clip();
  // border
  ctx.strokeStyle = '#e9cf98'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x0 + inset + 14, y0 + 10); ctx.lineTo(x1 - inset - 14, y0 + 10); ctx.lineTo(x1 - 16, y1 - 12); ctx.lineTo(x0 + 16, y1 - 12); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,40,80,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 + inset + 24, y0 + 18); ctx.lineTo(x1 - inset - 24, y0 + 18); ctx.lineTo(x1 - 28, y1 - 20); ctx.lineTo(x0 + 28, y1 - 20); ctx.closePath(); ctx.stroke();
  // diamond medallions
  const cy = (y0 + y1) / 2 + 2;
  for (let x = x0 + 80; x < x1 - 60; x += 90) {
    const dh = (y1 - y0) * 0.26;
    ctx.beginPath(); ctx.moveTo(x, cy - dh); ctx.lineTo(x + 30, cy); ctx.lineTo(x, cy + dh); ctx.lineTo(x - 30, cy); ctx.closePath();
    ctx.fillStyle = '#2f5d73'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, cy - dh * 0.55); ctx.lineTo(x + 16, cy); ctx.lineTo(x, cy + dh * 0.55); ctx.lineTo(x - 16, cy); ctx.closePath();
    ctx.fillStyle = '#e9cf98'; ctx.fill();
    circlePath(ctx, x, cy, 3); ctx.fillStyle = '#a8454a'; ctx.fill();
  }
  ctx.fillStyle = vgrad(ctx, y0, y1, [[0, 'rgba(255,255,255,0.08)'], [1, 'rgba(0,0,0,0.18)']]); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
  path(); bgStroke(ctx, 2);
}

export function drawLivingBG(ctx, L, box, W) {
  const r = rng((L.seed || 1) * 7 + 3);
  const floorY = L.h;
  // wall: sage damask, a touch warmer towards the lamp-lit floor
  ctx.fillStyle = vgrad(ctx, Math.min(box.y0, floorY - 1600), floorY, [[0, '#9fb08f'], [0.6, '#b6c29f'], [1, '#c7c9a4']]);
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, floorY - box.y0);
  wallpaper(ctx, box, floorY - 190);
  // warm evening light pooling low on the wall
  ctx.fillStyle = rgrad(ctx, W / 2, floorY - 60, 40, 760, [[0, 'rgba(255,196,120,0.22)'], [1, 'rgba(255,196,120,0)']]);
  ctx.fillRect(box.x0, floorY - 820, box.x1 - box.x0, 820);
  // crown moulding when the top of the room is in view
  // (tall levels just keep going up the wall)
  // decor spread up the wall
  const kinds = ['window', 'gallery', 'shelf', 'clock', 'sconces', 'window', 'builtin'];
  let k = Math.floor(r() * kinds.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = floorY - 440; y > box.y0 + 80; y -= 300 + r() * 120) {
    const kind = kinds[k++ % kinds.length];
    side = -side;
    const x = W / 2 + side * (80 + r() * 110);
    if (kind === 'window') windowWithDusk(ctx, x, y, r);
    else if (kind === 'gallery') galleryWall(ctx, x, y, r);
    else if (kind === 'shelf') wallShelf(ctx, x, y + 30, r);
    else if (kind === 'sconces') sconces(ctx, x, y);
    else if (kind === 'clock') pendulumClock(ctx, x, y);
    else if (kind === 'builtin') builtinShelves(ctx, x, y + 120, 170, 290, (L.seed || 1) + y);
  }
  // painted wainscoting
  wainscot(ctx, box, floorY - 190, floorY);
  // bookcase silhouettes & a floor lamp glow beyond the play column (wide screens)
  for (const [bx, sd] of [[-200, 1], [W + 200, 2]]) {
    builtinShelves(ctx, bx, floorY, 200, 470, sd * 31 + (L.seed || 1));
  }
  for (const lx of [-40, W + 40]) {
    ctx.fillStyle = rgrad(ctx, lx, floorY - 330, 6, 170, [[0, 'rgba(255,214,140,0.5)'], [1, 'rgba(255,214,140,0)']]);
    ctx.fillRect(lx - 170, floorY - 500, 340, 340);
  }
  // potted palm in the corners near the floor
  plantPot(ctx, -110, floorY - 30, 1.1, '#c98a62');
  plantPot(ctx, W + 110, floorY - 30, 1.1, '#7fa7b0');
  baseboard(ctx, box.x0, box.x1, floorY, 16, '#e7dcc4');
  // warm oak floor + rug
  floorBand(ctx, box.x0, box.x1, floorY, box.y1 - floorY, '#b98556', 'rgba(110,64,30,0.55)', 'planks');
  ctx.fillStyle = 'rgba(255,220,170,0.08)'; ctx.fillRect(box.x0, floorY + 4, box.x1 - box.x0, 10);
  rug(ctx, 30, W - 30, floorY + 16, Math.min(box.y1 - 30, floorY + 130));
}

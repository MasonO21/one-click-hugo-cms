// Backyard background: sunny blue sky & fluffy clouds, leafy trees over a wooden privacy fence,
// house siding framing both sides, party string lights and a striped lawn (where the dog lives).
import { rgba, lighten, darken, mix, rrc, rrPath, ellipsePath, circlePath, polyPath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { bgStroke } from './common.js';

const TAU = Math.PI * 2;

function cloud(ctx, x, y, s, a = 0.95) {
  const puffs = [[-46, 6, 22], [-22, -8, 30], [10, -16, 34], [40, -4, 26], [62, 8, 18], [8, 10, 26], [-30, 12, 20], [34, 12, 22]];
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // soft blue underside
  ctx.fillStyle = `rgba(190,220,245,${a})`;
  for (const [px, py, pr] of puffs) { circlePath(ctx, px, py + 6, pr); ctx.fill(); }
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  for (const [px, py, pr] of puffs) { circlePath(ctx, px, py, pr); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  circlePath(ctx, 0, -22, 14); ctx.fill();
  ctx.restore();
}

function birds(ctx, x, y, r) {
  ctx.strokeStyle = 'rgba(60,70,100,0.45)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const bx = x + i * 34 + r() * 10, by = y + (i % 2) * 18 + r() * 8, s = 0.8 + r() * 0.5;
    ctx.beginPath(); ctx.moveTo(bx - 10 * s, by - 4 * s); ctx.quadraticCurveTo(bx - 4 * s, by - 7 * s, bx, by); ctx.quadraticCurveTo(bx + 4 * s, by - 7 * s, bx + 10 * s, by - 4 * s); ctx.stroke();
  }
}

function kite(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.25);
  ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(26, 0); ctx.lineTo(0, 54); ctx.lineTo(-26, 0); ctx.closePath();
  ctx.fillStyle = '#f2a65a'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(26, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#ef7d6b'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 54); ctx.lineTo(-26, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#7cc4e8'; ctx.fill();
  ctx.strokeStyle = 'rgba(58,34,22,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, 54); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke();
  // tail with bows
  ctx.beginPath(); ctx.moveTo(0, 54); ctx.bezierCurveTo(-20, 90, 24, 110, 0, 150); ctx.strokeStyle = 'rgba(58,34,22,0.35)'; ctx.stroke();
  for (const [bx, by] of [[-6, 78], [6, 104], [-2, 130]]) {
    ctx.fillStyle = '#ef7d6b';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 8, by - 5); ctx.lineTo(bx - 8, by + 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 8, by - 5); ctx.lineTo(bx + 8, by + 5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // string trailing off-screen down
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x - 4, y + 10); ctx.quadraticCurveTo(x - 60, y + 200, x - 140, y + 420); ctx.stroke();
}

function balloon(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  const cols = ['#ef7d6b', '#ffd36a', '#7cc4e8', '#9ed27c'];
  ellipsePath(ctx, 0, 0, 46, 54); ctx.fillStyle = '#ef7d6b'; ctx.fill();
  ctx.save(); ellipsePath(ctx, 0, 0, 46, 54); ctx.clip();
  for (let i = 0; i < 4; i++) { ellipsePath(ctx, -30 + i * 20, 0, 9, 56); ctx.fillStyle = cols[(i + 1) % 4]; ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ellipsePath(ctx, -18, -24, 10, 18, -0.3); ctx.fill();
  ctx.restore();
  ellipsePath(ctx, 0, 0, 46, 54); bgStroke(ctx, 2);
  ctx.strokeStyle = 'rgba(58,34,22,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-26, 44); ctx.lineTo(-10, 76); ctx.moveTo(26, 44); ctx.lineTo(10, 76); ctx.stroke();
  rrc(ctx, 0, 84, 26, 18, 4); ctx.fillStyle = '#b98252'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.restore();
}

function plane(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y);
  // banner
  ctx.strokeStyle = 'rgba(58,34,22,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-56, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-56, -12); ctx.quadraticCurveTo(-110, -18, -170, -10); ctx.lineTo(-170, 14); ctx.quadraticCurveTo(-110, 6, -56, 12); ctx.closePath();
  ctx.fillStyle = 'rgba(255,250,235,0.92)'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.save(); ctx.font = '15px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(217,87,59,0.9)';
  ctx.fillText('BBQ TODAY!', -112, 0); ctx.restore();
  // little plane
  rrc(ctx, 0, 0, 64, 16, 8); ctx.fillStyle = '#f2f2f2'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, -20); ctx.lineTo(16, -20); ctx.lineTo(10, 0); ctx.closePath(); ctx.fillStyle = '#e05a47'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-30, -2); ctx.lineTo(-24, -14); ctx.lineTo(-18, -14); ctx.lineTo(-20, -2); ctx.closePath(); ctx.fillStyle = '#e05a47'; ctx.fill();
  ctx.fillStyle = '#7cc4e8'; rrc(ctx, 18, -3, 10, 6, 2); ctx.fill();
  ctx.restore();
}

function tree(ctx, x, groundY, h, s, seed) {
  const r = rng(seed);
  // trunk
  ctx.fillStyle = '#9a7356';
  ctx.beginPath(); ctx.moveTo(x - 14 * s, groundY); ctx.quadraticCurveTo(x - 8 * s, groundY - h * 0.4, x - 6 * s, groundY - h * 0.7);
  ctx.lineTo(x + 6 * s, groundY - h * 0.7); ctx.quadraticCurveTo(x + 8 * s, groundY - h * 0.4, x + 14 * s, groundY); ctx.closePath(); ctx.fill(); bgStroke(ctx, 2);
  // canopy blobs
  const cy = groundY - h * 0.78;
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([x + (r() - 0.5) * 150 * s, cy + (r() - 0.5) * 90 * s, (44 + r() * 30) * s]);
  ctx.fillStyle = '#7fb26a';
  for (const [bx, by, br] of blobs) { circlePath(ctx, bx, by + 8, br); ctx.fill(); }
  ctx.fillStyle = '#93c47a';
  for (const [bx, by, br] of blobs) { circlePath(ctx, bx, by, br * 0.92); ctx.fill(); }
  ctx.fillStyle = 'rgba(220,245,190,0.35)';
  for (const [bx, by, br] of blobs.slice(0, 4)) { circlePath(ctx, bx - br * 0.25, by - br * 0.35, br * 0.4); ctx.fill(); }
}

function sidingWall(ctx, x0, x1, yTop, yBot, base, trimX, trimW, opts = {}) {
  ctx.fillStyle = base; ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  // lap boards
  for (let y = yBot - 22; y > yTop; y -= 22) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(x0, y, x1 - x0, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y + 5, x1 - x0, 2);
  }
  // soft shade under the eave
  ctx.fillStyle = vgrad(ctx, yTop, yTop + 60, [[0, 'rgba(40,40,60,0.22)'], [1, 'rgba(40,40,60,0)']]); ctx.fillRect(x0, yTop, x1 - x0, 60);
  // corner trim board
  ctx.fillStyle = '#f7f3ea'; ctx.fillRect(trimX - trimW / 2, yTop, trimW, yBot - yTop);
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(trimX + trimW / 2 - 3, yTop, 3, yBot - yTop);
  // eave / gutter + roof edge
  ctx.fillStyle = opts.roof || '#8a6f6a';
  ctx.beginPath(); ctx.moveTo(x0, yTop - 40); ctx.lineTo(x1 + (opts.roofDir || 0) * 30, yTop - 40); ctx.lineTo(x1 + (opts.roofDir || 0) * 30, yTop - 8); ctx.lineTo(x0, yTop - 8); ctx.closePath(); ctx.fill();
  const gx0 = Math.min(x0, x1 + (opts.roofDir || 0) * 30), gw = Math.abs(x1 - x0) + Math.abs(opts.roofDir || 0) * 30;
  ctx.fillStyle = '#f2efe8'; ctx.fillRect(gx0, yTop - 10, gw, 12);
  ctx.strokeStyle = 'rgba(58,34,22,0.2)'; ctx.lineWidth = 2; ctx.strokeRect(gx0, yTop - 10, gw, 12);
  // shingles hint
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = Math.ceil(x0 / 30) * 30; x < x1 - 2; x += 30) ctx.fillRect(x, yTop - 40, 2, 30);
}

function houseWindow(ctx, x, y, w, h, shutter) {
  for (const s of [-1, 1]) {
    rrc(ctx, x + s * (w / 2 + 16), y, 24, h + 10, 3); ctx.fillStyle = shutter; ctx.fill(); bgStroke(ctx, 1.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
    for (let k = -h / 2 + 8; k < h / 2; k += 9) { ctx.beginPath(); ctx.moveTo(x + s * (w / 2 + 16) - 8, y + k); ctx.lineTo(x + s * (w / 2 + 16) + 8, y + k); ctx.stroke(); }
  }
  rrc(ctx, x, y, w + 14, h + 14, 3); ctx.fillStyle = '#fbf8f0'; ctx.fill(); bgStroke(ctx, 1.5);
  rrc(ctx, x, y, w, h, 2); ctx.fillStyle = vgrad(ctx, y - h / 2, y + h / 2, [[0, '#a9d8f2'], [1, '#e2f4ff']]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 8, y + h / 2); ctx.lineTo(x - w / 2 + 26, y + h / 2); ctx.lineTo(x - w / 2 + 50, y - h / 2); ctx.lineTo(x - w / 2 + 32, y - h / 2); ctx.fill();
  ctx.fillStyle = '#fbf8f0'; ctx.fillRect(x - 3, y - h / 2, 6, h); ctx.fillRect(x - w / 2, y - 3, w, 6);
  // flower box
  rrc(ctx, x, y + h / 2 + 14, w + 20, 16, 3); ctx.fillStyle = '#b98252'; ctx.fill(); bgStroke(ctx, 1.5);
  const fc = ['#ef7d6b', '#ffd36a', '#f2a6c8', '#ffffff'];
  for (let i = 0; i < 7; i++) {
    const fx = x - w / 2 + i * w / 6;
    circlePath(ctx, fx, y + h / 2 + 2 - (i % 2) * 4, 8); ctx.fillStyle = '#7fb26a'; ctx.fill();
    circlePath(ctx, fx + 2, y + h / 2 - (i % 2) * 4, 4.5); ctx.fillStyle = fc[i % 4]; ctx.fill();
  }
}

function stringLights(ctx, x0, y0, x1, y1, sag, t0 = 0) {
  const cols = ['#ffd36a', '#ef7d6b', '#7cc4e8', '#9ed27c', '#f2a6c8'];
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  ctx.strokeStyle = 'rgba(58,44,40,0.45)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my + sag, x1, y1); ctx.stroke();
  const n = Math.max(6, Math.round((x1 - x0) / 46));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const px = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * mx + u * u * x1;
    const py = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * (my + sag) + u * u * y1;
    const c = cols[(i + t0) % cols.length];
    ctx.fillStyle = rgba(c, 0.25); circlePath(ctx, px, py + 10, 12); ctx.fill();
    ctx.fillStyle = 'rgba(70,60,60,0.6)'; ctx.fillRect(px - 2.5, py, 5, 4);
    ctx.fillStyle = c; ellipsePath(ctx, px, py + 10, 5, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; circlePath(ctx, px - 1.5, py + 7, 1.6); ctx.fill();
  }
}

function privacyFence(ctx, x0, x1, groundY, h) {
  const pw = 30;
  const top = groundY - h;
  for (let x = Math.floor(x0 / pw) * pw; x < x1; x += pw) {
    const ph = h + ((x / pw) & 1 ? 0 : 6);
    ctx.beginPath(); ctx.moveTo(x + 1, groundY); ctx.lineTo(x + 1, groundY - ph + 10); ctx.lineTo(x + pw / 2, groundY - ph); ctx.lineTo(x + pw - 1, groundY - ph + 10); ctx.lineTo(x + pw - 1, groundY); ctx.closePath();
    const shade = ((x / pw) * 7919) % 5;
    ctx.fillStyle = mix('#e2bf8f', '#d4ad7a', shade / 5); ctx.fill();
    bgStroke(ctx, 1.5, 'rgba(110,70,40,0.3)');
  }
  // rails peeking through
  ctx.fillStyle = 'rgba(120,80,45,0.18)';
  ctx.fillRect(x0, top + 30, x1 - x0, 7); ctx.fillRect(x0, groundY - 50, x1 - x0, 7);
  // posts
  for (let x = Math.floor(x0 / 240) * 240; x < x1; x += 240) {
    rrc(ctx, x, groundY - h / 2 - 6, 16, h + 22, 3); ctx.fillStyle = '#c99c66'; ctx.fill(); bgStroke(ctx, 1.5, 'rgba(110,70,40,0.35)');
    rrc(ctx, x, groundY - h - 16, 22, 8, 2); ctx.fillStyle = '#b88a56'; ctx.fill();
  }
}

function bushesAndFlowers(ctx, x0, x1, y, seed) {
  const r = rng(seed);
  for (let x = x0; x < x1; x += 70 + r() * 70) {
    const bw = 40 + r() * 34;
    ctx.fillStyle = '#6fa75a';
    for (let k = -1; k <= 1; k++) { circlePath(ctx, x + k * bw * 0.45, y - 18 - (k === 0 ? 12 : 0), bw * 0.42); ctx.fill(); }
    ctx.fillStyle = 'rgba(200,240,170,0.3)'; circlePath(ctx, x - bw * 0.12, y - 36, bw * 0.18); ctx.fill();
    if (r() < 0.7) {
      const fc = ['#ef7d6b', '#ffd36a', '#f2a6c8', '#ffffff', '#b99ae6'][Math.floor(r() * 5)];
      for (let k = 0; k < 5; k++) { circlePath(ctx, x - bw * 0.5 + r() * bw, y - 10 - r() * 34, 4.5); ctx.fillStyle = fc; ctx.fill(); }
    }
  }
}

function doghouse(ctx, x, y) {
  // y = ground line under the doghouse
  ctx.fillStyle = 'rgba(30,60,20,0.25)'; ellipsePath(ctx, x, y, 90, 12); ctx.fill();
  rrPath(ctx, x - 70, y - 100, 140, 100, 3); ctx.fillStyle = '#d9785a'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; for (let yy = y - 90; yy < y; yy += 16) ctx.fillRect(x - 70, yy, 140, 3);
  ctx.beginPath(); ctx.moveTo(x - 84, y - 96); ctx.lineTo(x, y - 160); ctx.lineTo(x + 84, y - 96); ctx.closePath(); ctx.fillStyle = '#6f5a7a'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.moveTo(x - 34, y); ctx.lineTo(x - 34, y - 52); ctx.arc(x, y - 52, 34, Math.PI, 0); ctx.lineTo(x + 34, y); ctx.closePath(); ctx.fillStyle = '#3a2a2a'; ctx.fill();
  rrc(ctx, x, y - 118, 56, 18, 4); ctx.fillStyle = '#fbf3df'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.save(); ctx.font = '14px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#b8453a'; ctx.fillText('REX', x, y - 117); ctx.restore();
}

function lawn(ctx, box, y, W, seed) {
  const r = rng(seed);
  const depth = box.y1 - y;
  ctx.fillStyle = vgrad(ctx, y, box.y1, [[0, '#7cc45e'], [1, '#5aa646']]);
  ctx.fillRect(box.x0, y, box.x1 - box.x0, depth);
  // mowing stripes (diagonal, perspective-ish)
  ctx.save(); ctx.beginPath(); ctx.rect(box.x0, y, box.x1 - box.x0, depth); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = Math.floor(box.x0 / 120) * 120 - 240; x < box.x1 + 240; x += 120) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y); ctx.lineTo(x + 60 + (x + 30 - W / 2) * 0.5, box.y1); ctx.lineTo(x + (x + 30 - W / 2) * 0.5, box.y1); ctx.closePath(); ctx.fill();
  }
  // clover / dandelions / paw prints
  for (let i = 0; i < 70; i++) {
    const fx = box.x0 + r() * (box.x1 - box.x0), fy = y + 18 + r() * (depth - 20);
    const kind = r();
    if (kind < 0.5) { ctx.fillStyle = 'rgba(60,120,40,0.35)'; ctx.fillRect(fx, fy, 9, 3); }
    else if (kind < 0.75) { circlePath(ctx, fx, fy, 3.2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); circlePath(ctx, fx, fy, 1.4); ctx.fillStyle = '#ffd36a'; ctx.fill(); }
    else if (kind < 0.9) { circlePath(ctx, fx, fy, 3.4); ctx.fillStyle = '#ffd36a'; ctx.fill(); }
    else {
      ctx.fillStyle = 'rgba(60,90,30,0.25)';
      ellipsePath(ctx, fx, fy, 5, 4); ctx.fill();
      for (let k = -1; k <= 1; k++) { circlePath(ctx, fx + k * 4.5, fy - 6 + Math.abs(k) * 2, 2); ctx.fill(); }
    }
  }
  ctx.fillStyle = vgrad(ctx, y, box.y1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,40,0,0.22)']]); ctx.fillRect(box.x0, y, box.x1 - box.x0, depth);
  ctx.restore();
  // grass fringe along the top edge
  ctx.fillStyle = '#6cb852';
  ctx.beginPath(); ctx.moveTo(box.x0, y + 8);
  for (let x = box.x0; x < box.x1; x += 9) {
    const h = 10 + r() * 14;
    ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 4 + (r() - 0.5) * 4, y - h); ctx.lineTo(x + 7, y + 2);
  }
  ctx.lineTo(box.x1, y + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(30,70,20,0.25)'; ctx.fillRect(box.x0, y + 4, box.x1 - box.x0, 4);
}

export function drawBackyardBG(ctx, L, box, W) {
  const r = rng((L.seed || 1) * 13 + 5);
  const g = L.h;
  // sky
  ctx.fillStyle = vgrad(ctx, Math.min(box.y0, g - 1800), g, [[0, '#3f9fe6'], [0.55, '#78c3f2'], [0.85, '#b4e2fb'], [1, '#e2f5ff']]);
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, g - box.y0);
  // sun
  const sx = W * 0.78, sy = g - 980;
  if (sy > box.y0 - 200) {
    ctx.fillStyle = rgrad(ctx, sx, sy, 20, 260, [[0, 'rgba(255,248,200,0.75)'], [0.35, 'rgba(255,240,170,0.25)'], [1, 'rgba(255,240,170,0)']]);
    ctx.fillRect(sx - 260, sy - 260, 520, 520);
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(255,240,170,0.28)';
    for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(-10, -70); ctx.lineTo(10, -70); ctx.lineTo(0, -150); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    circlePath(ctx, sx, sy, 52); ctx.fillStyle = '#fff1a8'; ctx.fill();
    circlePath(ctx, sx, sy, 42); ctx.fillStyle = '#ffe680'; ctx.fill();
  }
  // decor up the sky
  const kinds = ['cloud', 'birds', 'cloud', 'kite', 'cloud', 'balloon', 'cloud', 'plane', 'birds'];
  let k = Math.floor(r() * kinds.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = g - 640; y > box.y0 + 40; y -= 280 + r() * 140) {
    const kind = kinds[k++ % kinds.length];
    side = -side;
    const x = W / 2 + side * (60 + r() * 200);
    if (kind === 'cloud') { cloud(ctx, x, y, 0.8 + r() * 0.6); if (r() < 0.6) cloud(ctx, x - side * (180 + r() * 120), y + 60 + r() * 60, 0.5 + r() * 0.3, 0.8); }
    else if (kind === 'birds') birds(ctx, x - 40, y, r);
    else if (kind === 'kite') kite(ctx, x, y);
    else if (kind === 'balloon') { cloud(ctx, x - side * 160, y + 70, 0.6, 0.85); balloon(ctx, x, y); }
    else if (kind === 'plane') plane(ctx, x + 60, y, r);
  }
  // wide-screen clouds beyond the column
  for (let y = g - 520; y > box.y0; y -= 520) { cloud(ctx, -260 + (y % 90), y, 0.9, 0.8); cloud(ctx, W + 250 - (y % 70), y - 220, 0.8, 0.8); }
  const fenceH = 170;
  // a neighbour's house peeking over the fence (gable end)
  {
    const hx = 250 + r() * 140, wallTop = g - fenceH - 70;
    ctx.fillStyle = '#e9dcc8'; ctx.fillRect(hx - 70, wallTop, 140, 80);
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let yy = wallTop + 14; yy < wallTop + 80; yy += 14) ctx.fillRect(hx - 70, yy, 140, 3);
    rrc(ctx, hx, wallTop + 40, 34, 30, 2); ctx.fillStyle = '#a9d0e6'; ctx.fill(); bgStroke(ctx, 1.5);
    ctx.fillStyle = '#f7f3ea'; ctx.fillRect(hx - 1.5, wallTop + 25, 3, 30);
    ctx.fillStyle = '#c27f6a';
    ctx.fillRect(hx + 30, wallTop - 70, 18, 40);
    ctx.beginPath(); ctx.moveTo(hx - 84, wallTop + 4); ctx.lineTo(hx, wallTop - 62); ctx.lineTo(hx + 84, wallTop + 4); ctx.closePath(); ctx.fill(); bgStroke(ctx, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(hx - 84, wallTop + 4); ctx.lineTo(hx, wallTop - 62); ctx.lineTo(hx - 6, wallTop - 52); ctx.lineTo(hx - 72, wallTop + 4); ctx.closePath(); ctx.fill();
  }
  // treeline behind the fence
  for (const [tx, th, ts, sd] of [[-140, 470, 1.25, 1], [120, 400, 1.0, 2], [330, 440, 1.15, 3], [560, 380, 1.0, 4], [790, 460, 1.2, 5]]) {
    tree(ctx, tx + (r() - 0.5) * 40, g - fenceH + 30, th, ts, sd + (L.seed || 1) * 10);
  }
  privacyFence(ctx, box.x0, box.x1, g, fenceH);
  bushesAndFlowers(ctx, box.x0 + 20, box.x1, g + 2, (L.seed || 1) * 3 + 1);
  // house siding framing both sides of the yard
  const hTop = g - 760, nTop = g - 620;
  sidingWall(ctx, box.x0, 16, Math.max(box.y0 - 60, hTop), g, '#f3e2a6', 8, 16, { roof: '#7d6b78', roofDir: 0 });
  houseWindow(ctx, -150, g - 420, 110, 120, '#5d8fb8');
  // back door + steps
  rrc(ctx, -310, g - 110, 86, 200, 4); ctx.fillStyle = '#fbf8f0'; ctx.fill(); bgStroke(ctx, 1.5);
  rrc(ctx, -310, g - 108, 70, 186, 3); ctx.fillStyle = '#e07a5f'; ctx.fill();
  rrc(ctx, -310, g - 150, 40, 60, 3); ctx.fillStyle = '#bfe3f5'; ctx.fill();
  circlePath(ctx, -284, g - 100, 4); ctx.fillStyle = '#e3bc62'; ctx.fill();
  sidingWall(ctx, W - 16, box.x1, Math.max(box.y0 - 60, nTop), g, '#bcd3de', W - 8, 16, { roof: '#8a6f6a', roofDir: 0 });
  houseWindow(ctx, W + 170, g - 360, 110, 110, '#e07a5f');
  // downspouts
  for (const dx of [-30, W + 30]) { ctx.fillStyle = '#e9e6df'; ctx.fillRect(dx - 5, Math.max(box.y0, (dx < 0 ? hTop : nTop)), 10, g - (dx < 0 ? hTop : nTop)); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(dx + 2, Math.max(box.y0, (dx < 0 ? hTop : nTop)), 3, g - (dx < 0 ? hTop : nTop)); }
  // party string lights between the houses
  stringLights(ctx, 16, g - 560, W - 16, g - 500, 34, 0);
  stringLights(ctx, 16, g - 330, W - 16, g - 360, 26, 2);
  // the doghouse (wide screens) and lawn
  lawn(ctx, box, g, W, (L.seed || 1) * 5 + 2);
  doghouse(ctx, W + 190, g + 36);
  // dog bowl & bone on the lawn edge
  ctx.save();
  ellipsePath(ctx, 70, g + 40, 26, 9); ctx.fillStyle = '#d9573b'; ctx.fill(); bgStroke(ctx, 1.5);
  ellipsePath(ctx, 70, g + 36, 20, 5); ctx.fillStyle = '#8a5a3a'; ctx.fill();
  ctx.translate(W - 90, g + 70); ctx.rotate(-0.3);
  ctx.fillStyle = '#fbf3df';
  rrc(ctx, 0, 0, 34, 8, 4); ctx.fill();
  for (const s of [-1, 1]) { circlePath(ctx, s * 17, -4, 5.5); ctx.fill(); circlePath(ctx, s * 17, 4, 5.5); ctx.fill(); }
  ctx.restore();
}

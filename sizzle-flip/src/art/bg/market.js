// Supermarket background: bright store wall with department lettering, hanging aisle signs,
// fluorescent fixtures, sale banners, background shelves packed with products, and a glossy tiled floor.
import { rgba, lighten, darken, mix, rrc, rrPath, ellipsePath, circlePath, polyPath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { wallFill, baseboard, wallClock, bgStroke } from './common.js';

const PROD = ['#f19a8e', '#8fb9ea', '#f6d06e', '#93cf9e', '#f5ad70', '#c2a3e3', '#f3a9c6', '#83d0c6', '#f4f1ea'];
const BRAND_R = '#e8615a', BRAND_G = '#5cb98a';

function label(ctx, str, x, y, size, color, opts = {}) {
  ctx.save();
  ctx.font = `${size}px "Lilita One", "Fredoka", sans-serif`;
  ctx.textAlign = opts.align || 'center'; ctx.textBaseline = 'middle';
  if (opts.stroke) { ctx.lineWidth = opts.stroke; ctx.strokeStyle = opts.ink || 'rgba(58,34,22,0.35)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.restore();
}

function star(ctx, x, y, R, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r : R, a = -Math.PI / 2 + i * Math.PI / n;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// ---------- background shelving ----------
function bgProduct(ctx, kind, x, by, w, h, col) {
  const top = by - h;
  if (kind === 0) { // box
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x - w / 2, top + h * 0.25, w, h * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + w * 0.2, top, w * 0.3, h);
  } else if (kind === 1) { // can
    rrPath(ctx, x - w / 2, top, w, h, 3); ctx.fillStyle = '#d9dee2'; ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, top + 4, w, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - w * 0.3, top + 4, 3, h - 8);
  } else if (kind === 2) { // bottle
    rrPath(ctx, x - w / 2, top + h * 0.35, w, h * 0.65, 4); ctx.fillStyle = col; ctx.fill();
    ctx.fillRect(x - w * 0.18, top + 4, w * 0.36, h * 0.4);
    ctx.fillStyle = darken(col, 0.25); ctx.fillRect(x - w * 0.22, top, w * 0.44, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - w / 2, top + h * 0.62, w, h * 0.16);
  } else { // jar
    rrPath(ctx, x - w / 2, top + 5, w, h - 5, 5); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = '#f1e2b8'; ctx.fillRect(x - w / 2 - 1, top, w + 2, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x - w / 2, top + h * 0.45, w, h * 0.25);
  }
}

function shelving(ctx, x0, x1, top, bottom, seed) {
  const r = rng(seed);
  // back panel
  ctx.fillStyle = '#e9edea'; ctx.fillRect(x0, top, x1 - x0, bottom - top);
  // header strip
  ctx.fillStyle = BRAND_G; ctx.fillRect(x0, top - 34, x1 - x0, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x0, top - 34, x1 - x0, 6);
  const words = ['GROCERY', 'SNACKS', 'BREAKFAST', 'DRINKS', 'PANTRY', 'CANNED GOODS'];
  let wi = Math.floor(r() * words.length);
  for (let x = Math.floor(x0 / 240) * 240 + 120; x < x1; x += 240) label(ctx, words[wi++ % words.length], x, top - 16, 18, '#ffffff');
  const levels = 4, lh = (bottom - top) / levels;
  for (let i = 0; i < levels; i++) {
    const sy = top + lh * (i + 1);
    ctx.fillStyle = 'rgba(40,40,40,0.07)'; ctx.fillRect(x0, sy - lh, x1 - x0, 10);
    let x = x0 + 4;
    while (x < x1) {
      const kind = Math.floor(r() * 4), col = PROD[Math.floor(r() * PROD.length)];
      const w = kind === 0 ? 24 + r() * 10 : kind === 1 ? 16 + r() * 4 : kind === 2 ? 15 + r() * 4 : 18 + r() * 4;
      const h = Math.min(lh - 12, kind === 0 ? lh * (0.6 + r() * 0.3) : kind === 1 ? 24 + r() * 8 : kind === 2 ? lh * (0.55 + r() * 0.3) : 26 + r() * 6);
      const reps = 2 + Math.floor(r() * 3);
      for (let k = 0; k < reps && x < x1; k++) { bgProduct(ctx, kind, x + w / 2, sy - 4, w, h, col); x += w + 2; }
      x += 4;
    }
    // shelf lip + price strip
    ctx.fillStyle = '#cdd4d8'; ctx.fillRect(x0, sy - 5, x1 - x0, 6);
    ctx.fillStyle = '#fff6c9'; ctx.fillRect(x0, sy + 1, x1 - x0, 6);
    for (let px = x0 + 20 + r() * 30; px < x1; px += 60 + r() * 40) { ctx.fillStyle = r() < 0.25 ? BRAND_R : '#ffffff'; ctx.fillRect(px, sy + 1, 14, 6); }
  }
  // uprights
  for (let x = Math.floor(x0 / 240) * 240; x <= x1; x += 240) {
    ctx.fillStyle = '#b9c2c8'; ctx.fillRect(x - 5, top - 34, 10, bottom - top + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 5, top - 34, 3, bottom - top + 34);
  }
  // soft depth wash so it sits behind gameplay
  ctx.fillStyle = 'rgba(235,242,240,0.28)'; ctx.fillRect(x0, top - 34, x1 - x0, bottom - top + 34);
  ctx.fillStyle = 'rgba(58,34,22,0.12)'; ctx.fillRect(x0, top - 36, x1 - x0, 2);
}

// ---------- hanging & wall decor ----------
function chains(ctx, x, y, len, dx) {
  ctx.strokeStyle = 'rgba(58,34,22,0.3)'; ctx.lineWidth = 2;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * dx, y); ctx.lineTo(x + s * dx, y - len); ctx.stroke(); }
}

function aisleSign(ctx, x, y, num, lines) {
  chains(ctx, x, y - 40, 120, 70);
  rrc(ctx, x, y, 210, 82, 10); ctx.fillStyle = '#3f86c6'; ctx.fill(); bgStroke(ctx, 2.5);
  rrc(ctx, x, y, 200, 72, 7); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  circlePath(ctx, x - 66, y, 28); ctx.fillStyle = '#ffffff'; ctx.fill();
  label(ctx, 'AISLE', x - 66, y - 14, 10, '#3f86c6');
  label(ctx, String(num), x - 66, y + 7, 30, '#3f86c6');
  lines.forEach((t, i) => label(ctx, t, x + 34, y - 20 + i * 20, 16, '#ffffff'));
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (const dy of [-10, 10]) ctx.fillRect(x - 4, y + dy - 1, 76, 2);
}

function fluoro(ctx, x, y, w) {
  // glow
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = vgrad(ctx, y, y + 240, [[0, 'rgba(255,255,240,0.09)'], [1, 'rgba(255,255,240,0)']]);
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 + 60, y + 240); ctx.lineTo(x - w / 2 - 60, y + 240); ctx.closePath(); ctx.fill();
  ctx.restore();
  chains(ctx, x, y - 6, 90, w / 2 - 30);
  rrc(ctx, x, y - 4, w, 16, 6); ctx.fillStyle = '#e4e8ea'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, x, y + 7, w - 16, 8, 4); ctx.fillStyle = '#fffff2'; ctx.fill();
  ctx.save(); ctx.shadowColor = 'rgba(255,255,220,0.9)'; ctx.shadowBlur = 18;
  rrc(ctx, x, y + 7, w - 24, 4, 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
}

function saleBanner(ctx, x, y, w) {
  // string of pennants + a big starburst
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + 30, x + w / 2, y);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(58,34,22,0.3)'; ctx.stroke();
  const n = Math.round(w / 30), cols = [BRAND_R, '#f6d06e', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n, px = x - w / 2 + s * w, py = y + 2 * s * (1 - s) * 30;
    polyPath(ctx, [[px - 11, py], [px + 11, py], [px, py + 24]]); ctx.fillStyle = cols[i % 3]; ctx.fill(); bgStroke(ctx, 1.5);
  }
  const bx = x, by = y + 84;
  ctx.strokeStyle = 'rgba(58,34,22,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, y + 15); ctx.lineTo(bx, by - 50); ctx.stroke();
  star(ctx, bx, by, 60, 48, 16); ctx.fillStyle = '#f6d06e'; ctx.fill(); bgStroke(ctx, 2.5);
  circlePath(ctx, bx, by, 42); ctx.fillStyle = BRAND_R; ctx.fill();
  label(ctx, 'SALE', bx, by - 12, 20, '#ffffff');
  label(ctx, '50% OFF', bx, by + 12, 15, '#fff2b0');
}

function deptSign(ctx, x, y, kind) {
  const words = { produce: 'FRESH PRODUCE', bakery: 'BAKERY', deli: 'DELI', dairy: 'DAIRY' };
  const cols = { produce: BRAND_G, bakery: '#d99a5b', deli: BRAND_R, dairy: '#5aa0dd' };
  const c = cols[kind];
  const w = kind === 'produce' ? 300 : 210;
  rrc(ctx, x, y, w, 70, 35); ctx.fillStyle = rgba(c, 0.92); ctx.fill(); bgStroke(ctx, 2.5);
  rrc(ctx, x, y, w - 12, 58, 29); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  label(ctx, words[kind], x + 24, y + 2, 28, '#ffffff');
  // icon badge
  const ix = x - w / 2 + 6;
  circlePath(ctx, ix, y, 40); ctx.fillStyle = '#fffaf0'; ctx.fill(); bgStroke(ctx, 2.5);
  if (kind === 'produce') {
    circlePath(ctx, ix - 2, y + 4, 20); ctx.fillStyle = '#f07b6c'; ctx.fill();
    ellipsePath(ctx, ix + 8, y - 20, 9, 5, -0.5); ctx.fillStyle = '#6fbf73'; ctx.fill();
    ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ix - 2, y - 14); ctx.lineTo(ix, y - 22); ctx.stroke();
  } else if (kind === 'bakery') {
    ellipsePath(ctx, ix, y + 4, 26, 15); ctx.fillStyle = '#e3a462'; ctx.fill();
    ctx.strokeStyle = '#f6d6a6'; ctx.lineWidth = 3;
    for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(ix + k * 12 - 4, y - 4); ctx.lineTo(ix + k * 12 + 4, y + 10); ctx.stroke(); }
  } else if (kind === 'deli') {
    ctx.beginPath(); ctx.moveTo(ix - 22, y + 6); ctx.quadraticCurveTo(ix, y - 14, ix + 22, y + 6);
    ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.strokeStyle = '#e06a4a'; ctx.stroke();
    circlePath(ctx, ix + 10, y - 2, 2); ctx.fillStyle = '#3a2216'; ctx.fill();
    ctx.beginPath(); ctx.arc(ix + 6, y + 2, 4, 0.2, Math.PI - 0.2); ctx.lineWidth = 1.6; ctx.strokeStyle = '#3a2216'; ctx.stroke();
  } else {
    polyPath(ctx, [[ix - 14, y - 6], [ix, y - 22], [ix + 14, y - 6], [ix + 14, y + 22], [ix - 14, y + 22]]); ctx.fillStyle = '#ffffff'; ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = '#5aa0dd'; ctx.fillRect(ix - 14, y + 2, 28, 10);
  }
}

function promoPoster(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  rrc(ctx, 0, 0, 150, 190, 6); ctx.fillStyle = '#fff4d6'; ctx.fill(); bgStroke(ctx, 2.5);
  ctx.fillStyle = BRAND_R; ctx.fillRect(-75, -95, 150, 46);
  label(ctx, 'HOT DOG', 0, -82, 22, '#ffffff');
  label(ctx, 'DAYS!', 0, -60, 18, '#fff2b0');
  // bun + sausage illustration
  ellipsePath(ctx, 0, 22, 56, 22); ctx.fillStyle = '#e6a75c'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-50, 10); ctx.quadraticCurveTo(0, -6, 50, 10); ctx.lineWidth = 20; ctx.lineCap = 'round'; ctx.strokeStyle = '#df6a4c'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-40, 6); ctx.bezierCurveTo(-26, 0, -20, 12, -6, 4); ctx.bezierCurveTo(8, -2, 14, 10, 28, 4); ctx.lineWidth = 4; ctx.strokeStyle = '#f6d04e'; ctx.stroke();
  ellipsePath(ctx, 0, 30, 54, 14); ctx.fillStyle = '#efb56c'; ctx.fill();
  label(ctx, '2 for $3', 0, 70, 20, BRAND_R);
  ctx.restore();
}

function secCam(ctx, x, y) {
  rrc(ctx, x, y - 30, 30, 10, 3); ctx.fillStyle = '#d9dde0'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.arc(x, y - 25, 22, 0, Math.PI); ctx.fillStyle = 'rgba(70,80,95,0.55)'; ctx.fill(); bgStroke(ctx, 2);
  circlePath(ctx, x + 4, y - 14, 4); ctx.fillStyle = 'rgba(255,90,80,0.8)'; ctx.fill();
  rrc(ctx, x, y + 40, 110, 40, 5); ctx.fillStyle = '#fffaf0'; ctx.fill(); bgStroke(ctx, 2);
  label(ctx, 'SMILE! :)', x, y + 41, 17, '#5aa0dd');
}

function cardboardStack(ctx, x, floorY, seed) {
  const r = rng(seed);
  // pallet
  rrc(ctx, x, floorY - 8, 200, 16, 2); ctx.fillStyle = '#c9a678'; ctx.fill(); bgStroke(ctx, 2);
  let y = floorY - 16;
  for (let row = 0; row < 4; row++) {
    const n = row < 2 ? 2 : 1, bw = row < 2 ? 92 : 110, bh = 60 + r() * 10;
    for (let i = 0; i < n; i++) {
      const bx = x + (n === 1 ? (r() - 0.5) * 20 : (i - 0.5) * 96);
      rrc(ctx, bx, y - bh / 2, bw, bh, 3); ctx.fillStyle = '#d9b07a'; ctx.fill(); bgStroke(ctx, 2);
      ctx.fillStyle = 'rgba(160,110,60,0.3)'; ctx.fillRect(bx - 6, y - bh, 12, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(bx - bw / 2 + 10, y - bh / 2 - 6, 26, 12);
    }
    y -= bh + 2;
  }
}

function basketStack(ctx, x, floorY) {
  for (let i = 0; i < 6; i++) {
    const y = floorY - 20 - i * 14;
    polyPath(ctx, [[x - 60, y - 34], [x + 60, y - 34], [x + 50, y], [x - 50, y]]); ctx.fillStyle = i === 5 ? '#ef7b72' : '#e8615a'; ctx.fill(); bgStroke(ctx, 2);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  const ty = floorY - 20 - 5 * 14;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 14, ty - 30); ctx.lineTo(x + k * 12, ty - 4); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(x, ty - 34, 40, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 6; ctx.strokeStyle = '#3a3d42'; ctx.stroke();
  rrc(ctx, x, floorY - 160, 76, 30, 5); ctx.fillStyle = '#fffaf0'; ctx.fill(); bgStroke(ctx, 2);
  label(ctx, 'BASKETS', x, floorY - 159, 15, '#e8615a');
}

// ---------- floor: glossy perspective tiles ----------
function tileFloor(ctx, box, y, depth, W) {
  ctx.fillStyle = '#eceee8'; ctx.fillRect(box.x0, y, box.x1 - box.x0, depth);
  const P = (u, d) => [W / 2 + (u - W / 2) * (1 + 0.7 * d), y + depth * Math.pow(d, 1.3)];
  const rowsD = [0, 0.1, 0.24, 0.42, 0.66, 1.0];
  const T = 80;
  const uMin = Math.floor((box.x0 - W / 2) / T) * T + W / 2 - T * 2, uMax = box.x1 + T * 2;
  for (let ri = 0; ri < rowsD.length - 1; ri++) {
    let ci = 0;
    for (let u = uMin; u < uMax; u += T, ci++) {
      if ((ri + ci) % 2) continue;
      const a = P(u, rowsD[ri]), b = P(u + T, rowsD[ri]), c = P(u + T, rowsD[ri + 1]), d = P(u, rowsD[ri + 1]);
      polyPath(ctx, [a, b, c, d]); ctx.fillStyle = '#d6dcdc'; ctx.fill();
    }
  }
  // grout lines
  ctx.strokeStyle = 'rgba(120,130,130,0.25)'; ctx.lineWidth = 1.5;
  for (const d of rowsD) { const [, yy] = P(0, d); ctx.beginPath(); ctx.moveTo(box.x0, yy); ctx.lineTo(box.x1, yy); ctx.stroke(); }
  for (let u = uMin; u < uMax; u += T) { const a = P(u, 0), b = P(u, 1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // light reflections
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const u of [W / 2 - 260, W / 2, W / 2 + 260]) {
    const a = P(u - 40, 0), b = P(u + 40, 0), c = P(u + 60, 1), d = P(u - 60, 1);
    ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
    polyPath(ctx, [a, b, c, d]); ctx.fill();
  }
  ctx.restore();
  // shading + contact line
  ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, 'rgba(0,20,30,0.04)'], [1, 'rgba(0,20,30,0.22)']]);
  ctx.fillRect(box.x0, y, box.x1 - box.x0, depth);
  ctx.fillStyle = 'rgba(40,20,10,0.3)'; ctx.fillRect(box.x0, y, box.x1 - box.x0, 3);
}

function wetFloorSign(ctx, x, y) {
  polyPath(ctx, [[x - 22, y], [x - 12, y - 64], [x + 12, y - 64], [x + 22, y]]); ctx.fillStyle = '#f6d04e'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = 'rgba(58,34,22,0.55)';
  polyPath(ctx, [[x, y - 50], [x + 9, y - 34], [x - 9, y - 34]]); ctx.fill();
  label(ctx, 'WET', x, y - 18, 11, 'rgba(58,34,22,0.65)');
}

export function drawMarketBG(ctx, L, box, W) {
  ctx.save();
  const r = rng((((L.seed || 1) * 2654435761) >>> 0) || 1); r(); r();
  // clean, bright store wall
  wallFill(ctx, box, '#dcefe8', '#f6f4ea');
  // large wall panels
  ctx.strokeStyle = 'rgba(120,150,140,0.14)'; ctx.lineWidth = 3;
  for (let x = Math.floor(box.x0 / 200) * 200; x < box.x1; x += 200) { ctx.beginPath(); ctx.moveTo(x, box.y0); ctx.lineTo(x, L.h - 380); ctx.stroke(); }
  for (let y = L.h - 380 - 260; y > box.y0; y -= 260) { ctx.beginPath(); ctx.moveTo(box.x0, y); ctx.lineTo(box.x1, y); ctx.stroke(); }
  // faint store-brand icon pattern
  const ic = rng(99);
  let row = Math.floor(box.y0 / 150);
  for (let y = row * 150; y < L.h - 420; y += 150, row++) {
    for (let x = Math.floor(box.x0 / 170) * 170 + (Math.abs(row) % 2) * 85; x < box.x1; x += 170) {
      const kind = Math.floor(ic() * 4);
      ctx.save(); ctx.translate(x, y); ctx.rotate((ic() - 0.5) * 0.5);
      ctx.fillStyle = 'rgba(80,150,130,0.09)';
      if (kind === 0) { polyPath(ctx, [[-14, -8], [8, -8], [16, 0], [8, 8], [-14, 8]]); ctx.fill(); }
      else if (kind === 1) { circlePath(ctx, 0, 2, 10); ctx.fill(); ellipsePath(ctx, 5, -10, 5, 3, -0.5); ctx.fill(); }
      else if (kind === 2) { star(ctx, 0, 0, 11, 5, 5); ctx.fill(); }
      else { rrc(ctx, 0, 0, 14, 20, 3); ctx.fill(); }
      ctx.restore();
    }
  }
  // brand stripes above the background shelving
  const shTop = L.h - 300;
  ctx.fillStyle = BRAND_R; ctx.fillRect(box.x0, shTop - 70, box.x1 - box.x0, 14);
  ctx.fillStyle = '#f6d06e'; ctx.fillRect(box.x0, shTop - 56, box.x1 - box.x0, 6);
  // decor up the wall
  const kinds = ['aisle', 'dept', 'sale', 'lights', 'promo', 'clock', 'aisle', 'dept', 'cam', 'lights'];
  const depts = ['produce', 'bakery', 'deli', 'dairy'];
  const aisles = [['SNACKS', 'CEREAL', 'SODA'], ['CANNED', 'PASTA', 'SAUCES'], ['DAIRY', 'EGGS', 'CHEESE'], ['BUNS', 'BREAD', 'KETCHUP']];
  let k = Math.floor(r() * kinds.length), di = Math.floor(r() * 4), ai = Math.floor(r() * 4);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = L.h - 470; y > box.y0 + 80; y -= 300 + r() * 120) {
    const kind = kinds[k++ % kinds.length];
    side = -side;
    const x = W / 2 + side * (110 + r() * 190);
    if (kind === 'aisle') { aisleSign(ctx, x, y, 1 + ((ai * 3 + 2) % 9), aisles[ai % 4]); ai++; }
    else if (kind === 'dept') deptSign(ctx, W / 2 + side * (90 + r() * 120), y, depts[di++ % 4]);
    else if (kind === 'sale') saleBanner(ctx, W / 2 + side * 70, y - 50, 360);
    else if (kind === 'lights') { fluoro(ctx, W / 2 - 170, y - 60, 220); fluoro(ctx, W / 2 + 170, y - 60, 220); }
    else if (kind === 'promo') promoPoster(ctx, x, y, (r() - 0.5) * 0.08);
    else if (kind === 'clock') wallClock(ctx, x, y, 46);
    else if (kind === 'cam') secCam(ctx, x, y);
  }
  // background shelving along the bottom of the wall
  shelving(ctx, box.x0, box.x1, shTop, L.h - 14, (L.seed || 1) * 17 + 5);
  // wide-screen decor
  cardboardStack(ctx, -240, L.h - 14, (L.seed || 1) + 11);
  basketStack(ctx, W + 230, L.h - 14);
  baseboard(ctx, box.x0, box.x1, L.h, 14, '#9aa5ad');
  tileFloor(ctx, box, L.h, box.y1 - L.h, W);
  wetFloorSign(ctx, W + 120, L.h + 70);
  ctx.restore();
}

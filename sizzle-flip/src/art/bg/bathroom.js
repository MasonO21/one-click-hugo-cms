// Bathroom background: bright pastel tiles, mirror, shower curtain, little window, towel hooks, tiled floor.
import { rgba, lighten, darken, rrc, rrPath, ellipsePath, circlePath, polyPath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { wallFill, subwayTiles, windowFrame, lightRays, plantPot, frame, bgStroke } from './common.js';

const TILE = 52;

// Square wall tiles with a few accent tiles and a soft sheen.
function squareTiles(ctx, x0, x1, y0, y1, seed) {
  const gx0 = Math.floor(x0 / TILE) * TILE, gy0 = Math.floor(y0 / TILE) * TILE;
  // accent tiles
  const accents = ['rgba(255,255,255,0.45)', 'rgba(150,215,205,0.35)', 'rgba(250,190,205,0.35)'];
  for (let y = gy0; y < y1; y += TILE) {
    for (let x = gx0; x < x1; x += TILE) {
      const h = ((Math.imul((x / TILE) | 0, 73856093) ^ Math.imul((y / TILE) | 0, 19349663) ^ seed) >>> 0) % 100;
      if (h < 9) {
        ctx.fillStyle = accents[h % 3];
        ctx.fillRect(x, Math.max(y, y0), TILE, Math.min(TILE, y1 - Math.max(y, y0)));
      }
    }
  }
  // sheen on every tile (one path)
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  for (let y = gy0; y < y1 - 10; y += TILE) for (let x = gx0; x < x1; x += TILE) {
    if (y + 6 < y0) continue;
    ctx.rect(x + 6, y + 6, TILE * 0.42, 4);
    ctx.rect(x + 6, y + 10, 4, TILE * 0.3);
  }
  ctx.fill();
  // grout
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = gx0; x <= x1; x += TILE) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = gy0; y <= y1; y += TILE) { if (y < y0) continue; ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,130,135,0.12)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = gx0; x <= x1; x += TILE) { ctx.moveTo(x + 2, y0); ctx.lineTo(x + 2, y1); }
  for (let y = gy0; y <= y1; y += TILE) { if (y < y0) continue; ctx.moveTo(x0, y + 2); ctx.lineTo(x1, y + 2); }
  ctx.stroke();
}

function bubble(ctx, x, y, r, a = 0.6) {
  circlePath(ctx, x, y, r);
  ctx.fillStyle = `rgba(255,255,255,${0.12 * a})`; ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.strokeStyle = `rgba(255,255,255,${0.75 * a})`; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.7, -2.6, -1.7); ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0.4, 1.3); ctx.strokeStyle = `rgba(255,170,220,${0.45 * a})`; ctx.stroke();
}

function roundMirror(ctx, x, y, r) {
  // frame
  circlePath(ctx, x, y, r + 12); ctx.fillStyle = '#e8c57e'; ctx.fill(); bgStroke(ctx, 3);
  circlePath(ctx, x, y, r + 5); ctx.fillStyle = '#d9ad5e'; ctx.fill();
  circlePath(ctx, x, y, r);
  ctx.fillStyle = vgrad(ctx, y - r, y + r, [[0, '#eaf8fc'], [1, '#bfe3ef']]); ctx.fill();
  ctx.save(); circlePath(ctx, x, y, r); ctx.clip();
  // faint reflection of the tiles behind
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x - r, y + k * 26 + 10); ctx.lineTo(x + r, y + k * 26 - 10); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + r); ctx.lineTo(x - r * 0.35, y + r); ctx.lineTo(x + r * 0.5, y - r); ctx.lineTo(x + r * 0.15, y - r); ctx.fill();
  ctx.restore();
  circlePath(ctx, x, y, r); bgStroke(ctx, 2);
  // little shelf with toothbrush cup + soap pump
  const sy = y + r + 34;
  rrc(ctx, x, sy, r * 1.7, 9, 4); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, x - 26, sy - 18, 22, 26, 5); ctx.fillStyle = '#9fd3e8'; ctx.fill(); bgStroke(ctx, 2);
  ctx.lineCap = 'round';
  for (const [dx, c] of [[-4, '#f6a9bd'], [4, '#ffd27a']]) {
    ctx.beginPath(); ctx.moveTo(x - 26 + dx, sy - 26); ctx.lineTo(x - 26 + dx * 1.8, sy - 50); ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.stroke();
    rrc(ctx, x - 26 + dx * 1.8, sy - 53, 6, 8, 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  rrc(ctx, x + 28, sy - 20, 22, 30, 7); ctx.fillStyle = '#f6a9bd'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = '#e9eef2'; ctx.fillRect(x + 25, sy - 44, 6, 10); ctx.fillRect(x + 25, sy - 44, 14, 4);
  rrc(ctx, x + 28, sy - 18, 12, 10, 2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
}

function showerCurtain(ctx, x, y, w, h, col) {
  const top = y - h / 2, bot = y + h / 2;
  // shower alcove: darker mosaic + wall shower head between the panels
  ctx.save();
  rrPath(ctx, x - w / 2 + 6, top - 20, w - 12, h + 20, 10); ctx.clip();
  ctx.fillStyle = 'rgba(80,150,170,0.14)'; ctx.fillRect(x - w / 2, top - 20, w, h + 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let xx = x - w / 2; xx < x + w / 2; xx += 18) { ctx.moveTo(xx, top - 20); ctx.lineTo(xx, bot + 10); }
  for (let yy = top - 20; yy < bot + 10; yy += 18) { ctx.moveTo(x - w / 2, yy); ctx.lineTo(x + w / 2, yy); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(205,214,222,0.95)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, top + 120); ctx.lineTo(x, top + 40); ctx.quadraticCurveTo(x, top + 26, x + 14, top + 30); ctx.stroke();
  ctx.save(); ctx.translate(x + 22, top + 36); ctx.rotate(0.5);
  rrc(ctx, 0, 0, 34, 12, 5); ctx.fillStyle = '#dfe6eb'; ctx.fill(); bgStroke(ctx, 2);
  ctx.restore();
  circlePath(ctx, x, top + 130, 12); ctx.fillStyle = '#dfe6eb'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, x, top + 130, 20, 5, 2.5); ctx.fillStyle = '#b9c3cb'; ctx.fill();
  // rod
  ctx.fillStyle = '#d5dde3'; ctx.fillRect(x - w / 2 - 20, top - 6, w + 40, 8);
  circlePath(ctx, x - w / 2 - 20, top - 2, 7); ctx.fill(); circlePath(ctx, x + w / 2 + 20, top - 2, 7); ctx.fill();
  const r = rng(Math.round(x * 3 + y));
  for (const s of [-1, 1]) {
    const pw = w * 0.44;
    const ox = x + s * (w / 2 - pw / 2);
    const tieY = y + h * 0.08;
    const tx = ox + s * pw * 0.2, pinch = pw * 0.17;
    const L0 = ox - pw / 2, R0 = ox + pw / 2;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(L0, top);
      for (let k = 1; k <= 5; k++) ctx.quadraticCurveTo(L0 + (k - 0.5) * pw / 5, top + 7, L0 + k * pw / 5, top);
      ctx.quadraticCurveTo(R0 - (s < 0 ? pw * 0.1 : 0), y - h * 0.2, tx + pinch, tieY);
      ctx.quadraticCurveTo(R0 + (s > 0 ? 6 : -pw * 0.1), bot - h * 0.2, R0 + (s > 0 ? 4 : -6), bot);
      const bl = L0 + (s < 0 ? -4 : 6), br = R0 + (s > 0 ? 4 : -6);
      for (let k = 1; k <= 5; k++) ctx.quadraticCurveTo(br - (k - 0.5) * (br - bl) / 5, bot + 7, br - k * (br - bl) / 5, bot);
      ctx.quadraticCurveTo(L0 + (s > 0 ? pw * 0.1 : -6), bot - h * 0.2, tx - pinch, tieY);
      ctx.quadraticCurveTo(L0 + (s > 0 ? pw * 0.1 : 0), y - h * 0.2, L0, top);
      ctx.closePath();
    };
    path(); ctx.fillStyle = col; ctx.fill();
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let yy = top + 18; yy < bot; yy += 28) for (let xx = L0 - 10 + ((yy / 28) % 2) * 14; xx < R0 + 10; xx += 28) { circlePath(ctx, xx, yy, 4.5); ctx.fill(); }
    for (let k = 0; k < 2; k++) {
      const dx = tx - 14 + (r() - 0.5) * 20, dy = k ? bot - 70 - r() * 30 : top + 50 + r() * 30;
      ctx.fillStyle = 'rgba(255,214,80,0.8)';
      circlePath(ctx, dx + 7, dy - 7, 6); ctx.fill(); rrc(ctx, dx, dy + 2, 22, 11, 5.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,150,60,0.85)'; polyPath(ctx, [[dx + 12, dy - 9], [dx + 18, dy - 7], [dx + 12, dy - 5]]); ctx.fill();
    }
    ctx.strokeStyle = rgba(darken(col, 0.45), 0.18); ctx.lineWidth = 5;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath(); ctx.moveTo(ox + k * pw / 5, top + 4); ctx.quadraticCurveTo(tx + k * 3, tieY, ox + k * pw / 4.4, bot); ctx.stroke();
    }
    ctx.restore();
    path(); bgStroke(ctx, 2.5);
    rrc(ctx, tx, tieY, pinch * 2 + 12, 10, 5); ctx.fillStyle = darken(col, 0.2); ctx.fill(); bgStroke(ctx, 2);
    for (let k = 0; k <= 5; k++) { circlePath(ctx, L0 + k * pw / 5, top - 1, 5); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(160,170,180,0.9)'; ctx.stroke(); }
  }
}

function towelHooks(ctx, x, y, r) {
  rrc(ctx, x, y, 230, 22, 6); ctx.fillStyle = '#e9cfa6'; ctx.fill(); bgStroke(ctx, 2);
  const cols = ['#ff9fb2', '#7fd3c8', '#ffd27a', '#b3a4f5'];
  for (let k = 0; k < 3; k++) {
    const hx = x - 70 + k * 70;
    circlePath(ctx, hx, y, 6); ctx.fillStyle = '#d5dde3'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx, y); ctx.quadraticCurveTo(hx + 2, y + 16, hx - 6, y + 18); ctx.lineWidth = 4; ctx.strokeStyle = '#c3ccd3'; ctx.lineCap = 'round'; ctx.stroke();
    const c = cols[Math.floor(r() * cols.length)];
    const th = 90 + r() * 40, tw = 46 + r() * 10;
    // hanging towel
    ctx.beginPath();
    ctx.moveTo(hx - 4, y + 16);
    ctx.quadraticCurveTo(hx - tw * 0.6, y + 26, hx - tw / 2, y + 16 + th);
    ctx.lineTo(hx + tw / 2, y + 16 + th + 6);
    ctx.quadraticCurveTo(hx + tw * 0.55, y + 30, hx - 4, y + 16);
    ctx.closePath();
    ctx.fillStyle = c; ctx.fill(); bgStroke(ctx, 2);
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(hx - tw, y + th - 12, tw * 2, 6);
    ctx.fillStyle = rgba(darken(c, 0.4), 0.15); ctx.fillRect(hx - 2, y + 20, 6, th);
    ctx.restore();
  }
}

function glassShelf(ctx, x, y, r) {
  // brackets
  for (const s of [-1, 1]) { ctx.fillStyle = 'rgba(200,210,218,0.9)'; ctx.fillRect(x + s * 80 - 3, y, 6, 16); }
  rrc(ctx, x, y, 220, 8, 3); ctx.fillStyle = 'rgba(200,236,240,0.85)'; ctx.fill(); bgStroke(ctx, 2);
  const items = [
    () => { rrc(ctx, 0, -32, 26, 56, 8); ctx.fillStyle = '#7fc8e8'; ctx.fill(); bgStroke(ctx, 2); rrc(ctx, 0, -64, 12, 10, 3); ctx.fillStyle = '#ffffff'; ctx.fill(); bgStroke(ctx, 1.5); rrc(ctx, 0, -30, 18, 18, 3); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill(); },
    () => { rrc(ctx, 0, -24, 24, 40, 6); ctx.fillStyle = '#f6a9bd'; ctx.fill(); bgStroke(ctx, 2); rrc(ctx, 0, -50, 10, 12, 2); ctx.fillStyle = '#e8eef2'; ctx.fill(); },
    () => { rrc(ctx, 0, -14, 30, 24, 4); ctx.fillStyle = '#fff3e0'; ctx.fill(); bgStroke(ctx, 2); ctx.fillStyle = '#ffb347'; ellipsePath(ctx, 0, -32, 4, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,240,160,0.35)'; circlePath(ctx, 0, -32, 14); ctx.fill(); },
    () => { for (let k = 0; k < 3; k++) { rrc(ctx, 0, -8 - k * 15, 44 - k * 4, 14, 7); ctx.fillStyle = ['#7fd3c8', '#ffd27a', '#b3a4f5'][k]; ctx.fill(); bgStroke(ctx, 1.8); } },
    () => { rrc(ctx, 0, -20, 20, 32, 4); ctx.fillStyle = '#ffd27a'; ctx.fill(); bgStroke(ctx, 2); circlePath(ctx, 0, -42, 8); ctx.fillStyle = '#9fe3c9'; ctx.fill(); bgStroke(ctx, 1.5); },
  ];
  let ix = x - 74;
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.translate(ix, y - 4); ctx.scale(1.25, 1.25);
    items[Math.floor(r() * items.length)]();
    ctx.restore();
    ix += 40 + r() * 12;
  }
}

function duckPicture(ctx, x, y, w, h) {
  ctx.fillStyle = '#bfe9f7'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#8fd0ee';
  ctx.beginPath(); ctx.moveTo(x - w / 2, y + 10);
  for (let k = 0; k <= 8; k++) ctx.quadraticCurveTo(x - w / 2 + (k + 0.5) * w / 8, y + (k % 2 ? 4 : 16), x - w / 2 + (k + 1) * w / 8, y + 10);
  ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  rrc(ctx, x - 4, y + 2, 40, 20, 10); ctx.fill();
  circlePath(ctx, x + 8, y - 14, 11); ctx.fill();
  ctx.fillStyle = '#ff9a2e'; polyPath(ctx, [[x + 18, y - 16], [x + 28, y - 13], [x + 18, y - 9]]); ctx.fill();
  ctx.fillStyle = '#3a2216'; circlePath(ctx, x + 11, y - 17, 1.8); ctx.fill();
}

function bathWindow(ctx, x, y, r) {
  windowFrame(ctx, x, y, 140, 130, { frame: '#ffffff', sky: ['#9fdcff', '#e3f6ff'] });
  // frosted lower half
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x - 70, y + 4, 140, 61);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = 0; k < 6; k++) { circlePath(ctx, x - 55 + k * 22, y + 20 + (k % 2) * 18, 5); ctx.fill(); }
  lightRays(ctx, x, y - 40, 150, 380, 0.07);
  plantPot(ctx, x + 40, y + 62, 0.45, '#f6a9bd');
  rrc(ctx, x - 36, y + 70, 30, 14, 5); ctx.fillStyle = '#ffd27a'; ctx.fill(); bgStroke(ctx, 1.5);
}

function towelLadder(ctx, x, y) {
  ctx.strokeStyle = 'rgba(210,218,224,0.95)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 40, y); ctx.lineTo(x - 40, y - 240); ctx.moveTo(x + 40, y); ctx.lineTo(x + 40, y - 240); ctx.stroke();
  ctx.lineWidth = 5;
  for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x - 40, y - 20 - k * 40); ctx.lineTo(x + 40, y - 20 - k * 40); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x - 46, y - 140); ctx.lineTo(x + 46, y - 140); ctx.lineTo(x + 42, y - 60); ctx.lineTo(x - 42, y - 64); ctx.closePath();
  ctx.fillStyle = '#7fd3c8'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 42, y - 78, 84, 5);
}

// Perspective tile floor.
function tileFloor(ctx, x0, x1, y, depth, W) {
  const vx = W / 2, vy = y - 900;
  ctx.fillStyle = '#eef6f7'; ctx.fillRect(x0, y, x1 - x0, depth);
  const rows = [0];
  let rh = 16;
  while (rows[rows.length - 1] < depth) { rows.push(rows[rows.length - 1] + rh); rh *= 1.32; }
  const tw = 70;
  const xAt = (xt, yy) => vx + (xt - vx) * (yy - vy) / (y - vy);
  const c0 = Math.floor((x0 - 400) / tw), c1 = Math.ceil((x1 + 400) / tw);
  ctx.fillStyle = '#c9e6ea';
  ctx.beginPath();
  for (let i = 0; i < rows.length - 1; i++) {
    const ya = y + rows[i], yb = y + rows[i + 1];
    for (let c = c0; c < c1; c++) {
      if ((c + i) % 2) continue;
      const xa = c * tw, xb = xa + tw;
      ctx.moveTo(xAt(xa, ya), ya); ctx.lineTo(xAt(xb, ya), ya); ctx.lineTo(xAt(xb, yb), yb); ctx.lineTo(xAt(xa, yb), yb); ctx.closePath();
    }
  }
  ctx.fill();
  // grout
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (const rr of rows) { ctx.moveTo(x0, y + rr); ctx.lineTo(x1, y + rr); }
  for (let c = c0; c < c1; c++) { ctx.moveTo(xAt(c * tw, y), y); ctx.lineTo(xAt(c * tw, y + depth), y + depth); }
  ctx.stroke();
  // fluffy bath mat
  const mx = W * 0.32, my = y + 30;
  rrc(ctx, mx, my, 210, 34, 16); ctx.fillStyle = '#f9b8c6'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, mx, my, 180, 18, 9); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
  ctx.strokeStyle = 'rgba(240,150,170,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let fx = mx - 100; fx <= mx + 100; fx += 6) { ctx.moveTo(fx, my + 17); ctx.lineTo(fx, my + 22); } ctx.stroke();
  // puddle
  ellipsePath(ctx, W * 0.78, y + 46, 54, 9); ctx.fillStyle = 'rgba(150,210,240,0.45)'; ctx.fill();
  ellipsePath(ctx, W * 0.78 - 14, y + 44, 18, 3); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  // shading + contact line
  ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, 'rgba(0,40,60,0.0)'], [1, 'rgba(0,40,60,0.22)']]);
  ctx.fillRect(x0, y, x1 - x0, depth);
  ctx.fillStyle = 'rgba(40,70,80,0.3)'; ctx.fillRect(x0, y, x1 - x0, 3);
}

// Small wall fillers between the main decor pieces.
function filler(ctx, x, y, kind) {
  if (kind === 0) { // round extractor vent
    circlePath(ctx, x, y, 22); ctx.fillStyle = '#f4f8f9'; ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = 'rgba(100,140,150,0.3)';
    for (let k = -2; k <= 2; k++) ctx.fillRect(x - 15 + Math.abs(k) * 2, y + k * 6 - 1.5, 30 - Math.abs(k) * 4, 3);
  } else if (kind === 1) { // toilet-roll holder
    ctx.fillStyle = '#d5dde3'; ctx.fillRect(x - 24, y - 3, 48, 6);
    circlePath(ctx, x, y + 14, 16); ctx.fillStyle = '#fbf8f1'; ctx.fill(); bgStroke(ctx, 2);
    circlePath(ctx, x, y + 14, 6); ctx.fillStyle = '#d9b07c'; ctx.fill();
    ctx.fillStyle = '#fbf8f1'; ctx.fillRect(x + 6, y + 14, 10, 30); ctx.strokeStyle = 'rgba(58,34,22,0.2)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 6, y + 14, 10, 30);
  } else if (kind === 2) { // single hook with a little wash mitt
    circlePath(ctx, x, y, 5); ctx.fillStyle = '#d5dde3'; ctx.fill();
    rrc(ctx, x, y + 30, 30, 42, 12); ctx.fillStyle = '#ffd27a'; ctx.fill(); bgStroke(ctx, 2);
    rrc(ctx, x + 14, y + 26, 12, 20, 6); ctx.fillStyle = '#ffd27a'; ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 15, y + 42, 30, 4);
  } else { // starfish & shell tiles
    ctx.fillStyle = 'rgba(255,170,140,0.75)';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 7 : 17; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); bgStroke(ctx, 1.5);
    ctx.fillStyle = 'rgba(255,220,200,0.85)';
    ctx.beginPath(); ctx.moveTo(x + 40, y + 12); ctx.arc(x + 40, y + 12, 14, Math.PI, 0); ctx.closePath(); ctx.fill(); bgStroke(ctx, 1.5);
  }
}

export function drawBathroomBG(ctx, L, box, W) {
  const r = rng(L.seed || 1);
  const wain = L.h - 250;
  wallFill(ctx, box, '#e6f6f4', '#d3eeec');
  squareTiles(ctx, box.x0, box.x1, box.y0, wain, (L.seed || 1) * 7919);
  // wainscot of pink subway tiles with a mosaic border
  subwayTiles(ctx, box.x0, box.x1, wain, L.h, '#f9dde3', 'rgba(205,140,158,0.35)');
  ctx.fillStyle = '#a7dcd3'; ctx.fillRect(box.x0, wain - 16, box.x1 - box.x0, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  for (let x = Math.floor(box.x0 / 18) * 18; x < box.x1; x += 18) { ctx.moveTo(x, wain - 7); ctx.lineTo(x + 6, wain - 13); ctx.lineTo(x + 12, wain - 7); ctx.lineTo(x + 6, wain - 1); ctx.closePath(); }
  ctx.fill();
  ctx.fillStyle = 'rgba(80,140,140,0.25)'; ctx.fillRect(box.x0, wain, box.x1 - box.x0, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(box.x0, wain - 18, box.x1 - box.x0, 3);
  // floating soap bubbles (very soft)
  for (let i = 0; i < Math.ceil((L.h - box.y0) / 90); i++) {
    const bx = box.x0 + r() * (box.x1 - box.x0), by = box.y0 + r() * (wain - box.y0 - 40);
    bubble(ctx, bx, by, 6 + r() * 16, 0.7);
  }
  // decor spread vertically
  const items = ['mirror', 'curtain', 'hooks', 'window', 'shelf', 'picture', 'curtain', 'window'];
  let k = Math.floor(r() * items.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = L.h - 430; y > box.y0 + 60; y -= 300 + r() * 120) {
    const kind = items[k++ % items.length];
    side = -side;
    const x = W / 2 + side * (130 + r() * 200);
    if (kind === 'mirror') roundMirror(ctx, x, y - 30, 70);
    else if (kind === 'curtain') showerCurtain(ctx, x, y, 250, 330, ['#9fd8f0', '#f9b8c6', '#b8e6c9', '#d2c4f7'][Math.floor(r() * 4)]);
    else if (kind === 'hooks') towelHooks(ctx, x, y - 60, r);
    else if (kind === 'window') bathWindow(ctx, x, y, r);
    else if (kind === 'shelf') glassShelf(ctx, x, y, r);
    else if (kind === 'picture') frame(ctx, x, y, 120, 100, '#f6a9bd', duckPicture);
    if (r() < 0.6) filler(ctx, W / 2 - side * (170 + r() * 120), y - 140 - r() * 60, Math.floor(r() * 4));
  }
  // far-side decor beyond the play column (wide screens)
  towelLadder(ctx, -230, L.h - 40);
  plantPot(ctx, W + 230, L.h - 30, 1.2, '#7fc8e8');
  // cove tile skirting
  ctx.fillStyle = '#a7dcd3'; ctx.fillRect(box.x0, L.h - 16, box.x1 - box.x0, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(box.x0, L.h - 16, box.x1 - box.x0, 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let x = Math.floor(box.x0 / 52) * 52; x < box.x1; x += 52) { ctx.moveTo(x, L.h - 16); ctx.lineTo(x, L.h); } ctx.stroke();
  tileFloor(ctx, box.x0, box.x1, L.h, box.y1 - L.h, W);
}

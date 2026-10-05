// Toy room background: a kid's bedroom — star & cloud wallpaper, toy shelves, posters, crayon drawings,
// bunting, a night window, a moon night-light, and a carpet with a road play-mat.
import { rgba, lighten, darken, mix, rrc, rrPath, ellipsePath, circlePath, polyPath, vgrad, rgrad, rng } from '../common.js';
import { wallFill, baseboard, windowFrame, curtains, bgStroke, lightRays } from './common.js';

const PAST = ['#f59a8f', '#f7cf6a', '#8fd0a0', '#8ab8ec', '#c4a2e6', '#f6a8c8', '#7fd3cc', '#f8b878'];

function star5(ctx, x, y, R, r, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r : R, a = rot + i * Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function cloud(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, y + 10 * s);
  ctx.arc(x - 20 * s, y + 2 * s, 11 * s, Math.PI * 0.6, Math.PI * 1.5);
  ctx.arc(x - 2 * s, y - 6 * s, 15 * s, Math.PI * 1.1, Math.PI * 1.9);
  ctx.arc(x + 18 * s, y + 1 * s, 12 * s, Math.PI * 1.35, Math.PI * 0.35);
  ctx.closePath();
}

function tape(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(255,250,225,0.75)'; ctx.fillRect(-12, -5, 24, 10);
  ctx.restore();
}

// ---------- decor pieces ----------
function toyShelf(ctx, x, y, r) {
  // items standing on the board
  // stacked blocks
  const bc = ['#f59a8f', '#8ab8ec', '#f7cf6a'];
  [[-82, 0], [-60, 0], [-71, -22]].forEach(([dx, dy], i) => {
    rrc(ctx, x + dx, y - 11 + dy, 21, 21, 3); ctx.fillStyle = bc[i]; ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '14px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ABC'[i], x + dx, y - 10 + dy);
  });
  // bunny plush
  const bx = x - 18;
  for (const s of [-1, 1]) { ellipsePath(ctx, bx + s * 7, y - 58, 5, 15, s * 0.15); ctx.fillStyle = '#f7f1f4'; ctx.fill(); bgStroke(ctx, 2); }
  ellipsePath(ctx, bx, y - 14, 17, 15); ctx.fillStyle = '#f7f1f4'; ctx.fill(); bgStroke(ctx, 2);
  circlePath(ctx, bx, y - 38, 14); ctx.fillStyle = '#f7f1f4'; ctx.fill(); bgStroke(ctx, 2);
  for (const s of [-1, 1]) { circlePath(ctx, bx + s * 5, y - 40, 1.8); ctx.fillStyle = 'rgba(58,34,22,0.55)'; ctx.fill(); }
  circlePath(ctx, bx, y - 35, 2); ctx.fillStyle = '#f6a8c8'; ctx.fill();
  // robot
  const rx = x + 26;
  rrc(ctx, rx, y - 18, 26, 28, 4); ctx.fillStyle = '#a9c4d8'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, rx, y - 44, 22, 18, 4); ctx.fillStyle = '#bcd3e3'; ctx.fill(); bgStroke(ctx, 2);
  ctx.strokeStyle = 'rgba(58,34,22,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, y - 53); ctx.lineTo(rx, y - 62); ctx.stroke();
  circlePath(ctx, rx, y - 63, 3); ctx.fillStyle = '#f59a8f'; ctx.fill();
  for (const s of [-1, 1]) { circlePath(ctx, rx + s * 5, y - 45, 3); ctx.fillStyle = '#fff7c8'; ctx.fill(); }
  rrc(ctx, rx, y - 18, 12, 8, 2); ctx.fillStyle = '#f7cf6a'; ctx.fill();
  // ball
  circlePath(ctx, x + 70, y - 15, 15); ctx.fillStyle = '#f6a8c8'; ctx.fill(); bgStroke(ctx, 2);
  ctx.save(); circlePath(ctx, x + 70, y - 15, 15); ctx.clip();
  ctx.fillStyle = '#fff3c4'; ctx.fillRect(x + 55, y - 19, 30, 7); ctx.restore();
  circlePath(ctx, x + 64, y - 21, 4); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  // board + brackets
  for (const dx of [-70, 70]) {
    polyPath(ctx, [[x + dx - 4, y + 6], [x + dx + 4, y + 6], [x + dx + 4, y + 30]]); ctx.fillStyle = '#e4cfae'; ctx.fill(); bgStroke(ctx, 2);
  }
  rrc(ctx, x, y + 3, 220, 12, 3); ctx.fillStyle = '#f2e2c4'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - 108, y - 2, 216, 3);
}

function poster(ctx, x, y, kind, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const w = 120, h = 156;
  ctx.fillStyle = 'rgba(40,30,60,0.08)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
  if (kind === 'rocket') {
    rrc(ctx, 0, 0, w, h, 3); ctx.fillStyle = '#5b6fb8'; ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [sx, sy] of [[-40, -60], [30, -50], [-30, 10], [42, 20], [-10, -36], [36, -12], [-44, 40]]) { star5(ctx, sx, sy, 4, 1.8); ctx.fill(); }
    circlePath(ctx, 34, -58, 12); ctx.fillStyle = '#f7cf6a'; ctx.fill();
    // rocket
    ctx.save(); ctx.translate(-4, 6); ctx.rotate(0.35);
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.quadraticCurveTo(18, -26, 14, 22); ctx.lineTo(-14, 22); ctx.quadraticCurveTo(-18, -26, 0, -48); ctx.closePath();
    ctx.fillStyle = '#f4f1ec'; ctx.fill(); bgStroke(ctx, 2);
    circlePath(ctx, 0, -14, 7); ctx.fillStyle = '#8ab8ec'; ctx.fill(); bgStroke(ctx, 2);
    for (const s of [-1, 1]) { polyPath(ctx, [[s * 14, 4], [s * 26, 28], [s * 12, 22]]); ctx.fillStyle = '#f59a8f'; ctx.fill(); bgStroke(ctx, 2); }
    ctx.beginPath(); ctx.moveTo(-9, 24); ctx.quadraticCurveTo(0, 54, 9, 24); ctx.fillStyle = '#f8b878'; ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff3c4'; ctx.font = '15px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TO THE MOON!', 0, 66);
  } else if (kind === 'dino') {
    rrc(ctx, 0, 0, w, h, 3); ctx.fillStyle = '#fff1b8'; ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = '#9ad7a5';
    ctx.beginPath(); ctx.moveTo(-46, 40); ctx.quadraticCurveTo(-30, 0, -2, 6); ctx.quadraticCurveTo(10, -40, 26, -44);
    ctx.quadraticCurveTo(46, -46, 44, -32); ctx.quadraticCurveTo(40, -24, 24, -26); ctx.quadraticCurveTo(22, 4, 30, 40); ctx.lineTo(16, 40); ctx.lineTo(12, 22); ctx.lineTo(-10, 24); ctx.lineTo(-14, 40); ctx.closePath();
    ctx.fill(); bgStroke(ctx, 2);
    ctx.fillStyle = '#f7a88f';
    for (const [px, py] of [[-12, 4], [0, -2], [12, -16], [18, -32]]) { polyPath(ctx, [[px - 5, py + 3], [px, py - 8], [px + 5, py + 3]]); ctx.fill(); }
    circlePath(ctx, 34, -38, 2.2); ctx.fillStyle = 'rgba(58,34,22,0.6)'; ctx.fill();
    ctx.fillStyle = '#7fbf86'; ctx.fillRect(-60, 40, 120, 38);
    ctx.fillStyle = '#5b7f62'; ctx.font = '17px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RAWR!', 0, 62);
  } else {
    rrc(ctx, 0, 0, w, h, 3); ctx.fillStyle = '#ffffff'; ctx.fill(); bgStroke(ctx, 2);
    const L = ['A', 'B', 'C', '1', '2', '3'];
    L.forEach((ch, i) => {
      const cx = -30 + (i % 3) * 30, cy = -40 + Math.floor(i / 3) * 50;
      rrc(ctx, cx, cy, 26, 26, 4); ctx.fillStyle = PAST[i]; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '20px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, cx, cy + 1);
    });
    ctx.fillStyle = '#8ab8ec'; ctx.font = '16px "Lilita One", sans-serif'; ctx.fillText('LET\'S LEARN', 0, 56);
  }
  ctx.restore();
  tape(ctx, x - 52 * Math.cos(a) + 78 * Math.sin(a), y - 78 * Math.cos(a) - 52 * Math.sin(a), -0.6 + a);
  tape(ctx, x + 52 * Math.cos(a) + 78 * Math.sin(a), y - 78 * Math.cos(a) + 52 * Math.sin(a), 0.6 + a);
}

function crayonLine(ctx, pts, col, w = 4) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

function drawing(ctx, x, y, kind, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  rrc(ctx, 0, 0, 104, 80, 2); ctx.fillStyle = '#fffdf6'; ctx.fill(); bgStroke(ctx, 1.6);
  if (kind === 0) {
    // sun + house
    circlePath(ctx, -32, -20, 10); ctx.fillStyle = '#f7cf6a'; ctx.fill();
    for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4; crayonLine(ctx, [[-32 + Math.cos(q) * 14, -20 + Math.sin(q) * 14], [-32 + Math.cos(q) * 20, -20 + Math.sin(q) * 20]], '#f7c24a', 2.5); }
    crayonLine(ctx, [[2, 26], [2, 0], [34, 0], [34, 26], [2, 26]], '#f59a8f', 3);
    crayonLine(ctx, [[-2, 2], [18, -18], [38, 2]], '#c48ad6', 3);
    crayonLine(ctx, [[14, 26], [14, 12], [22, 12], [22, 26]], '#8ab8ec', 3);
    crayonLine(ctx, [[-50, 32], [-20, 30], [10, 33], [50, 31]], '#8fd0a0', 4);
  } else if (kind === 1) {
    // rainbow
    ['#f59a8f', '#f8b878', '#f7cf6a', '#8fd0a0', '#8ab8ec', '#c4a2e6'].forEach((c, i) => {
      ctx.beginPath(); ctx.arc(0, 26, 38 - i * 5, Math.PI, 0); ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.stroke();
    });
    for (const s of [-1, 1]) { circlePath(ctx, s * 34, 26, 9); ctx.fillStyle = '#eef2f8'; ctx.fill(); }
  } else {
    // the sausage family
    for (const [sx, s] of [[-24, 1], [16, 0.8]]) {
      ctx.beginPath(); ctx.moveTo(sx - 16 * s, 0); ctx.quadraticCurveTo(sx, -12 * s, sx + 16 * s, 0);
      ctx.lineWidth = 11 * s; ctx.strokeStyle = '#e8846a'; ctx.lineCap = 'round'; ctx.stroke();
      circlePath(ctx, sx + 6 * s, -4 * s, 1.6); ctx.fillStyle = '#3a2216'; ctx.fill();
      crayonLine(ctx, [[sx - 6 * s, 2], [sx - 9 * s, 24]], '#5a4036', 2.5);
      crayonLine(ctx, [[sx + 6 * s, 2], [sx + 9 * s, 24]], '#5a4036', 2.5);
    }
    ctx.fillStyle = '#f59a8f'; ctx.beginPath(); ctx.moveTo(44, -22); ctx.bezierCurveTo(36, -30, 30, -20, 44, -10); ctx.bezierCurveTo(58, -20, 52, -30, 44, -22); ctx.fill();
    crayonLine(ctx, [[-46, 30], [46, 30]], '#8fd0a0', 3);
  }
  ctx.restore();
  tape(ctx, x + 40 * Math.sin(a), y - 40 * Math.cos(a), a + 0.1);
}

function nightWindow(ctx, x, y) {
  windowFrame(ctx, x, y, 170, 150, {
    frame: '#fbf6ee',
    sky: ['#3f4f99', '#7a7fcf'],
    scene: (c, x0, y0, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      const r = rng(Math.round(x0 * 3 + y0));
      for (let i = 0; i < 14; i++) { circlePath(c, x0 + r() * w, y0 + r() * h * 0.7, 1 + r() * 1.6); c.fill(); }
      c.beginPath(); c.arc(x0 + w * 0.7, y0 + h * 0.3, 18, 0, Math.PI * 2); c.arc(x0 + w * 0.7 + 9, y0 + h * 0.3 - 5, 16, 0, Math.PI * 2, true);
      c.fillStyle = '#fff3c4'; c.fill('evenodd');
      c.fillStyle = '#5560a8';
      c.beginPath(); c.moveTo(x0, y0 + h);
      c.quadraticCurveTo(x0 + w * 0.25, y0 + h * 0.72, x0 + w * 0.5, y0 + h * 0.84); c.quadraticCurveTo(x0 + w * 0.75, y0 + h * 0.7, x0 + w, y0 + h * 0.8);
      c.lineTo(x0 + w, y0 + h); c.fill();
    },
  });
  curtains(ctx, x, y, 170, 150, '#c4b4ea');
  ctx.fillStyle = 'rgba(255,248,210,0.7)';
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { star5(ctx, x + s * 91 + (k % 2) * 8 - 4, y - 70 + k * 46, 5, 2.2); ctx.fill(); }
}

function bunting(ctx, x, y, w) {
  const n = Math.round(w / 34);
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + 34, x + w / 2, y);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(58,34,22,0.35)'; ctx.stroke();
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n, px = x - w / 2 + s * w, py = y + 2 * s * (1 - s) * 34;
    polyPath(ctx, [[px - 12, py], [px + 12, py], [px, py + 28]]); ctx.fillStyle = PAST[i % PAST.length]; ctx.fill(); bgStroke(ctx, 1.6);
  }
  for (const s of [-1, 1]) { circlePath(ctx, x + s * w / 2, y, 4); ctx.fillStyle = 'rgba(58,34,22,0.3)'; ctx.fill(); }
}

function mobile(ctx, x, y) {
  ctx.strokeStyle = 'rgba(58,34,22,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 90); ctx.lineTo(x, y - 40); ctx.moveTo(x - 70, y - 30); ctx.quadraticCurveTo(x, y - 46, x + 70, y - 30); ctx.stroke();
  const items = [[-70, 30, 'moon'], [-24, 55, 'star'], [24, 40, 'planet'], [70, 22, 'star']];
  for (const [dx, len, kind] of items) {
    const ax = x + dx, ay = y - 30 - (dx === 0 ? 8 : 0) - (Math.abs(dx) < 50 ? 8 : 0);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + len); ctx.stroke();
    const cy = ay + len + 14;
    if (kind === 'star') { star5(ctx, ax, cy, 15, 7); ctx.fillStyle = '#f7cf6a'; ctx.fill(); bgStroke(ctx, 2); }
    else if (kind === 'moon') { ctx.beginPath(); ctx.arc(ax, cy, 14, 0, Math.PI * 2); ctx.arc(ax + 7, cy - 4, 12, 0, Math.PI * 2, true); ctx.fillStyle = '#fff1b8'; ctx.fill('evenodd'); }
    else {
      circlePath(ctx, ax, cy, 13); ctx.fillStyle = '#f6a8c8'; ctx.fill(); bgStroke(ctx, 2);
      ellipsePath(ctx, ax, cy, 22, 5, -0.3); ctx.lineWidth = 3; ctx.strokeStyle = '#c4a2e6'; ctx.stroke();
    }
  }
  circlePath(ctx, x, y - 92, 5); ctx.fillStyle = 'rgba(58,34,22,0.3)'; ctx.fill();
}

function growthChart(ctx, x, y) {
  rrc(ctx, x, y, 44, 300, 6); ctx.fillStyle = '#fff4c8'; ctx.fill(); bgStroke(ctx, 2);
  ctx.fillStyle = 'rgba(240,180,90,0.5)';
  for (let k = 0; k < 7; k++) { ellipsePath(ctx, x + (k % 2 ? 8 : -8), y - 120 + k * 40, 7, 5, 0.4); ctx.fill(); }
  ctx.strokeStyle = 'rgba(58,34,22,0.35)'; ctx.lineWidth = 2;
  for (let k = 0; k <= 14; k++) { const yy = y - 140 + k * 20; ctx.beginPath(); ctx.moveTo(x + 22, yy); ctx.lineTo(x + (k % 2 ? 14 : 8), yy); ctx.stroke(); }
  // giraffe head on top
  ellipsePath(ctx, x + 6, y - 160, 20, 15, -0.3); ctx.fillStyle = '#f7d27a'; ctx.fill(); bgStroke(ctx, 2);
  for (const dx of [-6, 6]) { ctx.beginPath(); ctx.moveTo(x + dx, y - 170); ctx.lineTo(x + dx - 2, y - 184); ctx.stroke(); circlePath(ctx, x + dx - 2, y - 186, 3); ctx.fillStyle = '#c99a5a'; ctx.fill(); }
  circlePath(ctx, x + 10, y - 164, 2); ctx.fillStyle = 'rgba(58,34,22,0.6)'; ctx.fill();
}

function kite(ctx, x, y) {
  polyPath(ctx, [[x, y - 50], [x + 34, y], [x, y + 56], [x - 34, y]]); ctx.fillStyle = '#f59a8f'; ctx.fill(); bgStroke(ctx, 2);
  polyPath(ctx, [[x, y - 50], [x + 34, y], [x, y]]); ctx.fillStyle = '#f7cf6a'; ctx.fill();
  polyPath(ctx, [[x, y + 56], [x - 34, y], [x, y]]); ctx.fillStyle = '#f7cf6a'; ctx.fill();
  ctx.strokeStyle = 'rgba(58,34,22,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 50); ctx.lineTo(x, y + 56); ctx.moveTo(x - 34, y); ctx.lineTo(x + 34, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + 56); ctx.bezierCurveTo(x + 30, y + 90, x - 30, y + 120, x + 10, y + 160); ctx.stroke();
  for (const [bx, by, c] of [[x + 6, y + 84, '#8ab8ec'], [x - 4, y + 116, '#8fd0a0'], [x + 6, y + 146, '#c4a2e6']]) {
    polyPath(ctx, [[bx - 9, by - 6], [bx + 9, by + 6], [bx + 9, by - 6], [bx - 9, by + 6]]); ctx.fillStyle = c; ctx.fill();
  }
}

function nightLight(ctx, x, y) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, 0, 120, [[0, 'rgba(255,230,150,0.4)'], [0.4, 'rgba(255,220,140,0.14)'], [1, 'rgba(255,220,140,0)']]);
  ctx.fillRect(x - 120, y - 120, 240, 240);
  ctx.restore();
  rrc(ctx, x, y + 4, 34, 46, 6); ctx.fillStyle = '#fbf6ee'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.arc(x + 9, y - 5, 14, 0, Math.PI * 2, true);
  ctx.fillStyle = '#fff1a8'; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(200,150,40,0.4)'; ctx.lineWidth = 1.6; ctx.stroke();
  circlePath(ctx, x - 8, y + 2, 1.6); ctx.fillStyle = 'rgba(58,34,22,0.5)'; ctx.fill();
}

function teepee(ctx, x, floorY) {
  const top = floorY - 330;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 6, top - 30); ctx.lineTo(x - s * 26, top + 30); ctx.lineWidth = 6; ctx.strokeStyle = '#d2b48a'; ctx.stroke(); }
  polyPath(ctx, [[x, top], [x + 120, floorY], [x - 120, floorY]]); ctx.fillStyle = '#f3e6cf'; ctx.fill(); bgStroke(ctx, 2.5);
  ctx.save(); polyPath(ctx, [[x, top], [x + 120, floorY], [x - 120, floorY]]); ctx.clip();
  [['#f59a8f', 0.45], ['#8ab8ec', 0.62], ['#f7cf6a', 0.78]].forEach(([c, f]) => { ctx.fillStyle = c; ctx.fillRect(x - 130, top + (floorY - top) * f, 260, 12); });
  polyPath(ctx, [[x, top + 120], [x + 50, floorY], [x - 50, floorY]]); ctx.fillStyle = 'rgba(80,60,90,0.35)'; ctx.fill();
  ctx.restore();
  polyPath(ctx, [[x + 6, top - 30], [x + 34, top - 22], [x + 6, top - 14]]); ctx.fillStyle = '#f59a8f'; ctx.fill();
}

function plushGiraffe(ctx, x, floorY) {
  const c = '#f7d27a';
  rrc(ctx, x, floorY - 50, 70, 90, 30); ctx.fillStyle = c; ctx.fill(); bgStroke(ctx, 2.5);
  rrc(ctx, x + 14, floorY - 140, 26, 120, 13); ctx.fillStyle = c; ctx.fill(); bgStroke(ctx, 2.5);
  ellipsePath(ctx, x + 26, floorY - 196, 30, 22, -0.25); ctx.fillStyle = c; ctx.fill(); bgStroke(ctx, 2.5);
  ctx.fillStyle = 'rgba(210,140,60,0.45)';
  for (const [dx, dy, r] of [[-14, -60, 9], [12, -40, 7], [16, -110, 6], [10, -150, 5], [-6, -30, 6]]) { circlePath(ctx, x + dx, floorY + dy, r); ctx.fill(); }
  circlePath(ctx, x + 32, floorY - 202, 3); ctx.fillStyle = 'rgba(58,34,22,0.6)'; ctx.fill();
  for (const dx of [10, 22]) { ctx.beginPath(); ctx.moveTo(x + dx, floorY - 214); ctx.lineTo(x + dx - 4, floorY - 232); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(160,110,60,0.6)'; ctx.stroke(); }
}

// ---------- floor: carpet + road play mat ----------
function playMatFloor(ctx, box, y, depth, W, seed) {
  const r = rng(seed * 7 + 3);
  // carpet
  ctx.fillStyle = '#b8a6dc'; ctx.fillRect(box.x0, y, box.x1 - box.x0, depth);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 260; i++) ctx.fillRect(box.x0 + r() * (box.x1 - box.x0), y + r() * depth, 3, 2);
  // perspective mapping: u = x on the back edge, d = 0..1 depth
  const P = (u, d) => [W / 2 + (u - W / 2) * (1 + 0.55 * d), y + depth * Math.pow(d, 1.25)];
  const quad = (u0, u1, d0, d1) => { const a = P(u0, d0), b = P(u1, d0), c = P(u1, d1), e = P(u0, d1); polyPath(ctx, [a, b, c, e]); };
  // the mat
  quad(-60, W + 60, 0.08, 0.98); ctx.fillStyle = '#9fd49a'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#7fbf86'; ctx.stroke();
  // printed scenery: pond, trees, houses
  const pond = P(90, 0.72); ellipsePath(ctx, pond[0], pond[1], 70, 16); ctx.fillStyle = '#8fc6ef'; ctx.fill();
  for (const [u, d] of [[30, 0.2], [540, 0.22], [620, 0.75], [250, 0.85], [-20, 0.5]]) {
    const [tx, ty] = P(u, d), s = 0.8 + d * 0.5;
    ellipsePath(ctx, tx, ty, 16 * s, 7 * s); ctx.fillStyle = '#6fae6e'; ctx.fill();
  }
  for (const [u, d, c] of [[130, 0.18, '#f59a8f'], [480, 0.82, '#8ab8ec'], [600, 0.2, '#f7cf6a']]) {
    const [hx, hy] = P(u, d), s = 0.8 + d * 0.5;
    ctx.fillStyle = c; ctx.fillRect(hx - 16 * s, hy - 5 * s, 32 * s, 12 * s);
    polyPath(ctx, [[hx - 20 * s, hy - 5 * s], [hx, hy - 12 * s], [hx + 20 * s, hy - 5 * s]]); ctx.fillStyle = darken(c, 0.2); ctx.fill();
  }
  // roads
  quad(-60, W + 60, 0.36, 0.52); ctx.fillStyle = '#8e8f99'; ctx.fill();
  quad(360, 430, 0.08, 0.98); ctx.fillStyle = '#8e8f99'; ctx.fill();
  // dashes
  ctx.fillStyle = '#ffe58a';
  for (let u = -40; u < W + 60; u += 52) { if (u > 330 && u < 440) continue; quad(u, u + 26, 0.435, 0.445); ctx.fill(); }
  for (let d = 0.12; d < 0.95; d += 0.12) { if (d > 0.32 && d < 0.56) continue; quad(392, 398, d, d + 0.05); ctx.fill(); }
  // zebra crossing
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 5; k++) { quad(364 + k * 14, 371 + k * 14, 0.6, 0.68); ctx.fill(); }
  // toy car on the road
  const [cx, cy] = P(170, 0.44);
  rrc(ctx, cx, cy - 12, 52, 16, 6); ctx.fillStyle = '#f59a8f'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, cx - 4, cy - 23, 28, 12, 5); ctx.fillStyle = '#cfe8ff'; ctx.fill(); bgStroke(ctx, 2);
  for (const s of [-1, 1]) { circlePath(ctx, cx + s * 16, cy - 3, 6); ctx.fillStyle = '#5b5a66'; ctx.fill(); }
  // floor shading + contact line
  ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, 'rgba(40,20,60,0.08)'], [1, 'rgba(40,20,60,0.3)']]);
  ctx.fillRect(box.x0, y, box.x1 - box.x0, depth);
  ctx.fillStyle = 'rgba(40,20,10,0.3)'; ctx.fillRect(box.x0, y, box.x1 - box.x0, 3);
}

export function drawToyroomBG(ctx, L, box, W) {
  ctx.save();
  const r = rng((((L.seed || 1) * 2654435761) >>> 0) || 1); r(); r();
  // soft sky-blue wallpaper
  wallFill(ctx, box, '#c8dcf6', '#e2ecfb');
  // star & cloud pattern
  const wainTop = L.h - 200;
  const step = 120;
  // faint wide stripes
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let x = Math.floor(box.x0 / 140) * 140; x < box.x1; x += 140) ctx.fillRect(x, box.y0, 70, wainTop - box.y0);
  let row = Math.floor(box.y0 / step);
  for (let y = row * step; y < wainTop - 30; y += step, row++) {
    let col = Math.floor(box.x0 / 140);
    for (let x = col * 140 + (Math.abs(row) % 2) * 70; x < box.x1; x += 140, col++) {
      if (Math.abs(col + row) % 2 === 0) { cloud(ctx, x, y, 0.8); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill(); }
      else { star5(ctx, x, y + 4, 9, 4, -Math.PI / 2 + ((col * 7 + row * 3) % 5) * 0.2); ctx.fillStyle = 'rgba(255,230,140,0.75)'; ctx.fill(); }
    }
  }
  // wainscot panel + alphabet border
  ctx.fillStyle = '#f6efe2'; ctx.fillRect(box.x0, wainTop, box.x1 - box.x0, L.h - wainTop);
  ctx.strokeStyle = 'rgba(160,130,100,0.18)'; ctx.lineWidth = 2;
  for (let x = Math.floor(box.x0 / 28) * 28; x < box.x1; x += 28) { ctx.beginPath(); ctx.moveTo(x, wainTop + 40); ctx.lineTo(x, L.h); ctx.stroke(); }
  ctx.fillStyle = '#fff8ea'; ctx.fillRect(box.x0, wainTop, box.x1 - box.x0, 40);
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  ctx.font = '20px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let li = 0;
  for (let x = Math.floor(box.x0 / 40) * 40; x < box.x1; x += 40, li++) {
    const c = PAST[((li % 8) + 8) % 8];
    rrc(ctx, x + 20, wainTop + 20, 30, 28, 5); ctx.fillStyle = rgba(c, 0.75); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(ABC[((Math.round(x / 40) % 26) + 26) % 26], x + 20, wainTop + 21);
  }
  ctx.fillStyle = '#dcc7a6'; ctx.fillRect(box.x0, wainTop - 4, box.x1 - box.x0, 5); ctx.fillRect(box.x0, wainTop + 40, box.x1 - box.x0, 4);

  // decor spread up the wall, alternating sides
  const kinds = ['shelf', 'poster', 'window', 'drawings', 'bunting', 'mobile', 'kite', 'growth', 'poster2', 'shelf'];
  let k = Math.floor(r() * kinds.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = L.h - 430; y > box.y0 + 80; y -= 300 + r() * 120) {
    const kind = kinds[k++ % kinds.length];
    side = -side;
    const x = W / 2 + side * (110 + r() * 200);
    if (kind === 'shelf') toyShelf(ctx, x, y + 40, r);
    else if (kind === 'poster') poster(ctx, x, y, ['rocket', 'dino', 'abc'][Math.floor(r() * 3)], (r() - 0.5) * 0.12);
    else if (kind === 'poster2') poster(ctx, x, y, 'abc', (r() - 0.5) * 0.1);
    else if (kind === 'window') { nightWindow(ctx, x, y); lightRays(ctx, x, y - 60, 160, 380, 0.05); }
    else if (kind === 'drawings') {
      drawing(ctx, x - 62, y - 10, Math.floor(r() * 3), -0.08);
      drawing(ctx, x + 60, y + 16, Math.floor(r() * 3), 0.07);
    }
    else if (kind === 'bunting') bunting(ctx, W / 2 + side * 60, y - 40, 420);
    else if (kind === 'mobile') mobile(ctx, x, y);
    else if (kind === 'kite') kite(ctx, x, y - 40);
    else if (kind === 'growth') growthChart(ctx, x, y);
  }
  // wide-screen decor beyond the play column
  teepee(ctx, -230, L.h);
  plushGiraffe(ctx, W + 210, L.h);
  // night light on the wainscot
  nightLight(ctx, W / 2 + (r() < 0.5 ? -1 : 1) * (150 + r() * 100), L.h - 70);
  baseboard(ctx, box.x0, box.x1, L.h, 16, '#f3ead9');
  playMatFloor(ctx, box, L.h, box.y1 - L.h, W, L.seed || 1);
  ctx.restore();
}

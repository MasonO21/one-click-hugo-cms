// Office background: open-plan office with skyline windows, cubicle partitions, motivational posters,
// hanging ceiling lights and a carpet floor.
import { rgba, lighten, darken, rrc, rrPath, ellipsePath, circlePath, polyPath, vgrad, hgrad, rng } from '../common.js';
import { wallFill, wallClock, plantPot, bgStroke } from './common.js';

const FONT = '"Lilita One", "Fredoka", system-ui, sans-serif';

function label(ctx, str, x, y, size, color, align = 'center') {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

// City skyline seen through a window (x,y = top-left of glass).
function skyline(ctx, x, y, w, h, seed) {
  const r = rng(seed);
  ctx.fillStyle = vgrad(ctx, y, y + h, [[0, '#8ccff5'], [0.7, '#d4eefa'], [1, '#f2f8f0']]);
  ctx.fillRect(x, y, w, h);
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 2; i++) {
    const cx = x + r() * w, cy = y + 18 + r() * h * 0.25;
    for (let k = 0; k < 4; k++) { circlePath(ctx, cx + k * 13 - 20, cy + (k % 2) * 3, 9 + (k % 2) * 4); ctx.fill(); }
  }
  // far towers
  let bx = x - 10;
  while (bx < x + w) {
    const bw = 18 + r() * 26, bh = h * (0.35 + r() * 0.35);
    ctx.fillStyle = '#b4cbe0'; ctx.fillRect(bx, y + h - bh, bw, bh);
    if (r() < 0.3) { ctx.fillRect(bx + bw / 2 - 1, y + h - bh - 14, 2, 14); }
    bx += bw + 2;
  }
  // near towers with window grids
  bx = x - 6;
  while (bx < x + w) {
    const bw = 26 + r() * 34, bh = h * (0.22 + r() * 0.35);
    const top = y + h - bh;
    const col = ['#7f9cbc', '#8aa7c4', '#7690b0', '#94aec8'][Math.floor(r() * 4)];
    ctx.fillStyle = col; ctx.fillRect(bx, top, bw, bh);
    if (r() < 0.35) { ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx + bw / 2, top - 12); ctx.lineTo(bx + bw, top); ctx.fill(); }
    ctx.fillStyle = 'rgba(235,245,255,0.55)';
    for (let wy = top + 6; wy < y + h - 4; wy += 9) for (let wx = bx + 4; wx < bx + bw - 5; wx += 8) {
      if (r() < 0.75) ctx.fillRect(wx, wy, 4, 5);
    }
    bx += bw + 3;
  }
}

function officeWindow(ctx, x, y, w, h, seed, blinds) {
  rrc(ctx, x, y, w + 20, h + 20, 4); ctx.fillStyle = '#d9e0e7'; ctx.fill(); bgStroke(ctx, 2.5);
  ctx.save();
  rrc(ctx, x, y, w, h, 2); ctx.clip();
  skyline(ctx, x - w / 2, y - h / 2, w, h, seed);
  // glare
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 20, y + h / 2); ctx.lineTo(x - w / 2 + 60, y + h / 2); ctx.lineTo(x - w / 2 + 140, y - h / 2); ctx.lineTo(x - w / 2 + 100, y - h / 2); ctx.fill();
  // venetian blinds partially lowered
  const bh = h * blinds;
  for (let yy = y - h / 2; yy < y - h / 2 + bh; yy += 9) {
    ctx.fillStyle = '#eef2f5'; ctx.fillRect(x - w / 2, yy, w, 7);
    ctx.fillStyle = 'rgba(80,100,120,0.18)'; ctx.fillRect(x - w / 2, yy + 5, w, 2);
  }
  ctx.restore();
  // mullions
  ctx.fillStyle = '#d9e0e7';
  ctx.fillRect(x - w / 6 - 3, y - h / 2, 6, h); ctx.fillRect(x + w / 6 - 3, y - h / 2, 6, h);
  // blind cords + bottom rail
  ctx.fillStyle = '#c9d2da'; ctx.fillRect(x - w / 2, y - h / 2 + bh - 2, w, 6);
  ctx.strokeStyle = 'rgba(120,130,140,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + w / 2 - 14, y - h / 2); ctx.lineTo(x + w / 2 - 14, y - h / 2 + bh + 50); ctx.stroke();
  circlePath(ctx, x + w / 2 - 14, y - h / 2 + bh + 52, 3); ctx.fillStyle = '#c9d2da'; ctx.fill();
  // sill
  rrc(ctx, x, y + h / 2 + 14, w + 36, 10, 3); ctx.fillStyle = '#e3e8ed'; ctx.fill(); bgStroke(ctx, 2);
}

// A hanging linear pendant light with a soft cone of light.
function pendantLight(ctx, x, y, w) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, y, 0, y + 320);
  g.addColorStop(0, 'rgba(255,248,215,0.07)'); g.addColorStop(1, 'rgba(255,248,215,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y + 8); ctx.lineTo(x + w / 2, y + 8); ctx.lineTo(x + w / 2 + 90, y + 320); ctx.lineTo(x - w / 2 - 90, y + 320); ctx.closePath(); ctx.fill();
  ctx.restore();
  // cables fading upward
  for (const s of [-1, 1]) {
    const cx = x + s * (w / 2 - 20);
    const cg = ctx.createLinearGradient(0, y - 200, 0, y);
    cg.addColorStop(0, 'rgba(90,100,110,0)'); cg.addColorStop(1, 'rgba(90,100,110,0.6)');
    ctx.strokeStyle = cg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, y - 200); ctx.lineTo(cx, y); ctx.stroke();
  }
  rrc(ctx, x, y, w, 14, 6); ctx.fillStyle = '#5d6772'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, x, y + 7, w - 12, 5, 2.5); ctx.fillStyle = '#fffbe6'; ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  rrc(ctx, x, y + 9, w + 10, 16, 8); ctx.fillStyle = 'rgba(255,245,200,0.25)'; ctx.fill();
  ctx.restore();
}

// Motivational poster featuring our hero.
function poster(ctx, x, y, kind) {
  const w = 130, h = 170;
  rrc(ctx, x, y, w, h, 3); ctx.fillStyle = '#5d6678'; ctx.fill(); bgStroke(ctx, 2.5);
  const iw = w - 20, ih = 104, iy = y - h / 2 + 10 + ih / 2;
  ctx.save();
  rrc(ctx, x, iy, iw, ih, 2); ctx.clip();
  const sausage = (sx, sy, len, ang) => {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    rrc(ctx, 0, 0, len, 18, 9); ctx.fillStyle = '#e07a5a'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; rrc(ctx, -len * 0.1, -4, len * 0.6, 3, 1.5); ctx.fill();
    ctx.fillStyle = '#3a2216'; circlePath(ctx, len * 0.22, -2, 1.8); ctx.fill(); circlePath(ctx, len * 0.32, -2, 1.8); ctx.fill();
    ctx.restore();
  };
  if (kind === 0) { // HANG IN THERE
    ctx.fillStyle = vgrad(ctx, iy - ih / 2, iy + ih / 2, [[0, '#9fd2f2'], [1, '#e2f3fb']]); ctx.fillRect(x - iw / 2, iy - ih / 2, iw, ih);
    ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - iw / 2, iy - 34); ctx.quadraticCurveTo(x, iy - 40, x + iw / 2, iy - 30); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,40,30,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 4, iy - 37); ctx.lineTo(x + 4, iy - 18); ctx.stroke();
    sausage(x + 4, iy + 6, 52, Math.PI / 2);
    ctx.fillStyle = '#7cbf6a'; ellipsePath(ctx, x - 30, iy - 40, 10, 5, -0.4); ctx.fill(); ellipsePath(ctx, x + 36, iy - 36, 10, 5, 0.3); ctx.fill();
  } else if (kind === 1) { // TEAMWORK
    ctx.fillStyle = vgrad(ctx, iy - ih / 2, iy + ih / 2, [[0, '#ffe3a8'], [1, '#ffc98a']]); ctx.fillRect(x - iw / 2, iy - ih / 2, iw, ih);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x, iy); ctx.arc(x, iy, 90, a, a + 0.25); ctx.fill(); }
    rrc(ctx, x, iy + 14, 76, 22, 11); ctx.fillStyle = '#e9b46a'; ctx.fill();
    sausage(x, iy + 4, 70, 0);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 26, iy + 4); for (let k = -26; k <= 26; k += 8) ctx.lineTo(x + k + 4, iy + 4 + (k % 16 ? -3 : 3)); ctx.stroke();
    ctx.fillStyle = '#ff6b8a';
    ctx.beginPath(); ctx.moveTo(x, iy - 22); ctx.bezierCurveTo(x - 16, iy - 34, x - 8, iy - 46, x, iy - 36); ctx.bezierCurveTo(x + 8, iy - 46, x + 16, iy - 34, x, iy - 22); ctx.fill();
  } else if (kind === 2) { // BELIEVE
    ctx.fillStyle = vgrad(ctx, iy - ih / 2, iy + ih / 2, [[0, '#6a7fd9'], [1, '#b9a6f0']]); ctx.fillRect(x - iw / 2, iy - ih / 2, iw, ih);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 12; k++) { circlePath(ctx, x - iw / 2 + ((k * 37) % iw), iy - ih / 2 + ((k * 23) % ih), 1.4); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 4; k++) { circlePath(ctx, x - 30 + k * 18, iy + 40, 12); ctx.fill(); }
    sausage(x + 6, iy - 6, 58, -0.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 40, iy + 4 + k * 8); ctx.lineTo(x - 20, iy - 4 + k * 8); ctx.stroke(); }
  } else { // SYNERGY
    ctx.fillStyle = vgrad(ctx, iy - ih / 2, iy + ih / 2, [[0, '#9fe0c4'], [1, '#d9f5e6']]); ctx.fillRect(x - iw / 2, iy - ih / 2, iw, ih);
    for (const [bx, c, a] of [[-22, '#e05a47', -0.35], [22, '#f2c230', 0.35]]) {
      ctx.save(); ctx.translate(x + bx, iy + 14); ctx.rotate(a);
      rrc(ctx, 0, 0, 24, 52, 8); ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-12, -6, 24, 10);
      polyPath(ctx, [[-6, -26], [6, -26], [2, -40], [-2, -40]]); ctx.fillStyle = c; ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; ctx.fillRect(x + Math.cos(a) * 12 - 1.5, iy - 30 + Math.sin(a) * 12 - 1.5, 3, 3); }
  }
  ctx.restore();
  const cap = ['HANG IN THERE', 'TEAMWORK', 'BELIEVE', 'SYNERGY'][kind];
  label(ctx, cap, x, y + h / 2 - 40, cap.length > 10 ? 13 : 17, '#f4efe4');
  const sub = ['it’s only Monday', 'buns + franks', 'you can flip it', 'ketchup + mustard'][kind];
  ctx.font = `10px "Fredoka", sans-serif`; ctx.fillStyle = 'rgba(244,239,228,0.7)'; ctx.textAlign = 'center'; ctx.fillText(sub, x, y + h / 2 - 22);
}

function whiteboard(ctx, x, y, r) {
  const w = 250, h = 150;
  rrc(ctx, x, y, w + 12, h + 12, 4); ctx.fillStyle = '#c9d0d7'; ctx.fill(); bgStroke(ctx, 2.5);
  rrc(ctx, x, y, w, h, 2); ctx.fillStyle = '#fbfcfd'; ctx.fill();
  // doodles
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  label(ctx, 'Q3 GOALS', x - w / 2 + 16, y - h / 2 + 22, 18, 'rgba(62,111,192,0.8)', 'left');
  ctx.strokeStyle = 'rgba(62,111,192,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 16, y - h / 2 + 34); ctx.lineTo(x - w / 2 + 104, y - h / 2 + 34); ctx.stroke();
  // rising chart
  const cx = x + 20, cy = y + 50;
  ctx.strokeStyle = 'rgba(60,60,70,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - 90); ctx.lineTo(cx, cy); ctx.lineTo(cx + 100, cy); ctx.stroke();
  ctx.strokeStyle = 'rgba(224,90,71,0.75)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx + 6, cy - 12); ctx.lineTo(cx + 30, cy - 30); ctx.lineTo(cx + 50, cy - 22); ctx.lineTo(cx + 88, cy - 76); ctx.stroke();
  polyPath(ctx, [[cx + 94, cy - 84], [cx + 80, cy - 78], [cx + 92, cy - 70]]); ctx.fillStyle = 'rgba(224,90,71,0.75)'; ctx.fill();
  // checklist
  ctx.strokeStyle = 'rgba(40,140,80,0.7)'; ctx.lineWidth = 2.5;
  for (let k = 0; k < 3; k++) {
    const ly = y - 14 + k * 24;
    ctx.strokeRect(x - w / 2 + 18, ly - 7, 12, 12);
    if (k < 2) { ctx.beginPath(); ctx.moveTo(x - w / 2 + 20, ly - 1); ctx.lineTo(x - w / 2 + 24, ly + 3); ctx.lineTo(x - w / 2 + 32, ly - 9); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(60,60,70,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 38, ly); ctx.lineTo(x - w / 2 + 80 + r() * 20, ly); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,140,80,0.7)'; ctx.lineWidth = 2.5;
  }
  // sticky notes
  for (const [sx, sy, c, a] of [[x + w / 2 - 26, y - h / 2 + 24, '#ffe95e', 0.1], [x + w / 2 - 56, y - h / 2 + 30, '#ff9ec4', -0.12]]) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    ctx.fillStyle = c; ctx.fillRect(-14, -14, 28, 28);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(-14, -14, 28, 6);
    ctx.restore();
  }
  // tray + markers
  rrc(ctx, x, y + h / 2 + 10, w * 0.7, 7, 3); ctx.fillStyle = '#b9c1c9'; ctx.fill(); bgStroke(ctx, 1.5);
  for (const [mx, c] of [[-40, '#3e6fc0'], [-18, '#e05a47'], [6, '#2e9e5a']]) { rrc(ctx, x + mx, y + h / 2 + 4, 18, 5, 2.5); ctx.fillStyle = c; ctx.fill(); }
}

function corkboard(ctx, x, y, r) {
  const w = 180, h = 130;
  rrc(ctx, x, y, w + 12, h + 12, 4); ctx.fillStyle = '#b98a5a'; ctx.fill(); bgStroke(ctx, 2.5);
  rrc(ctx, x, y, w, h, 2); ctx.fillStyle = '#d9b07c'; ctx.fill();
  ctx.fillStyle = 'rgba(140,90,40,0.25)';
  for (let k = 0; k < 60; k++) { ctx.fillRect(x - w / 2 + r() * w, y - h / 2 + r() * h, 2, 2); }
  const notes = [['#ffffff', -50, -26, -0.08, 54, 40], ['#ffe95e', 18, -30, 0.1, 40, 40], ['#cfe8ff', 54, 10, -0.12, 46, 52], ['#ffffff', -18, 26, 0.05, 66, 46], ['#ff9ec4', -62, 30, 0.14, 34, 34]];
  for (const [c, dx, dy, a, nw, nh] of notes) {
    ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(a);
    ctx.fillStyle = c; ctx.fillRect(-nw / 2, -nh / 2, nw, nh);
    ctx.strokeStyle = 'rgba(90,100,120,0.35)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-nw / 2 + 6, -nh / 2 + 12 + k * 8); ctx.lineTo(nw / 2 - 8 - (k % 2) * 8, -nh / 2 + 12 + k * 8); ctx.stroke(); }
    circlePath(ctx, 0, -nh / 2 + 4, 3.2); ctx.fillStyle = ['#e05a47', '#3e8ed0', '#2e9e5a'][Math.floor(r() * 3)]; ctx.fill();
    ctx.restore();
  }
}

function employeeOfMonth(ctx, x, y) {
  rrc(ctx, x, y, 110, 136, 3); ctx.fillStyle = '#d8b25a'; ctx.fill(); bgStroke(ctx, 2.5);
  rrc(ctx, x, y - 10, 86, 90, 2); ctx.fillStyle = '#e8f1fa'; ctx.fill();
  // portrait of the hero with a tie
  ctx.save(); ctx.translate(x, y - 6);
  rrc(ctx, 0, 0, 28, 64, 14); ctx.fillStyle = '#e07a5a'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; rrc(ctx, -6, -10, 5, 30, 2.5); ctx.fill();
  ctx.fillStyle = '#3a2216'; circlePath(ctx, -5, -14, 2.2); ctx.fill(); circlePath(ctx, 5, -14, 2.2); ctx.fill();
  ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -8, 4, 0.3, Math.PI - 0.3); ctx.stroke();
  polyPath(ctx, [[-4, 2], [4, 2], [6, 22], [0, 28], [-6, 22]]); ctx.fillStyle = '#3e6fc0'; ctx.fill();
  ctx.restore();
  rrc(ctx, x, y + 50, 90, 22, 2); ctx.fillStyle = '#f7ecd0'; ctx.fill();
  label(ctx, 'EMPLOYEE', x, y + 45, 9, 'rgba(90,70,40,0.85)');
  label(ctx, 'OF THE MONTH', x, y + 55, 8, 'rgba(90,70,40,0.75)');
}

function exitSign(ctx, x, y) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  rrc(ctx, x, y, 110, 54, 16); ctx.fillStyle = 'rgba(120,255,160,0.12)'; ctx.fill();
  ctx.restore();
  rrc(ctx, x, y, 84, 32, 4); ctx.fillStyle = '#2e9e5a'; ctx.fill(); bgStroke(ctx, 2);
  label(ctx, 'EXIT', x - 8, y + 1, 18, '#e9fff0');
  polyPath(ctx, [[x + 22, y - 6], [x + 32, y + 1], [x + 22, y + 8]]); ctx.fillStyle = '#e9fff0'; ctx.fill();
}

function shelfMugs(ctx, x, y, r) {
  rrc(ctx, x, y, 190, 10, 3); ctx.fillStyle = '#c9ccd2'; ctx.fill(); bgStroke(ctx, 2);
  for (const s of [-1, 1]) { ctx.fillStyle = '#b4b9c0'; polyPath(ctx, [[x + s * 70 - 4, y + 5], [x + s * 70 + 4, y + 5], [x + s * 70 + 4, y + 26]]); ctx.fill(); }
  // coffee machine
  rrc(ctx, x - 50, y - 36, 50, 62, 6); ctx.fillStyle = '#4a4f58'; ctx.fill(); bgStroke(ctx, 2);
  rrc(ctx, x - 50, y - 50, 40, 12, 3); ctx.fillStyle = '#6c737e'; ctx.fill();
  rrc(ctx, x - 50, y - 18, 22, 6, 2); ctx.fillStyle = '#2b2f36'; ctx.fill();
  rrc(ctx, x - 50, y - 6, 16, 14, 3); ctx.fillStyle = '#ffffff'; ctx.fill();
  circlePath(ctx, x - 36, y - 40, 3); ctx.fillStyle = '#7dff9a'; ctx.fill();
  // mugs
  const cols = ['#e05a47', '#3e8ed0', '#f2b134', '#5bb072', '#8d6cc4'];
  for (let k = 0; k < 3; k++) {
    const mx = x + 4 + k * 26, c = cols[Math.floor(r() * cols.length)];
    ctx.beginPath(); ctx.arc(mx + 10, y - 13, 6, -Math.PI / 2, Math.PI / 2); ctx.lineWidth = 3; ctx.strokeStyle = c; ctx.stroke();
    rrc(ctx, mx, y - 13, 18, 22, 3); ctx.fillStyle = c; ctx.fill(); bgStroke(ctx, 1.5);
  }
}

function cubicles(ctx, x0, x1, floorY, W, r) {
  const ph = 150, top = floorY - ph;
  // things peeking over the partitions
  for (let x = Math.floor(x0 / 210) * 210 + 40; x < x1; x += 210) {
    const kind = Math.floor(Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 4);
    if (kind === 0) { // monitor backs
      rrc(ctx, x + 30, top - 26, 78, 52, 4); ctx.fillStyle = '#4b525c'; ctx.fill(); bgStroke(ctx, 2);
      rrc(ctx, x + 120, top - 20, 60, 42, 4); ctx.fillStyle = '#555c66'; ctx.fill(); bgStroke(ctx, 2);
    } else if (kind === 1) { // plant
      ctx.fillStyle = '#7cbf6a';
      for (let k = 0; k < 6; k++) { ellipsePath(ctx, x + 80 + (k - 2.5) * 10, top - 22 - (k % 2) * 10, 7, 20, (k - 2.5) * 0.3); ctx.fill(); }
    } else if (kind === 2) { // desk lamp
      ctx.strokeStyle = '#7d8590'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 60, top + 4); ctx.lineTo(x + 76, top - 34); ctx.lineTo(x + 104, top - 26); ctx.stroke();
      ctx.save(); ctx.translate(x + 108, top - 22); ctx.rotate(0.6);
      ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(12, -6); ctx.lineTo(16, 10); ctx.lineTo(-16, 10); ctx.closePath(); ctx.fillStyle = '#f2b134'; ctx.fill(); bgStroke(ctx, 2);
      ctx.restore();
    } else { // coworker's head + headphones (silhouette-ish)
      circlePath(ctx, x + 100, top - 16, 22); ctx.fillStyle = '#c99a7a'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + 100, top - 22, 24, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 5; ctx.strokeStyle = '#3b3f48'; ctx.stroke();
      ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.arc(x + 100, top - 22, 21, Math.PI, Math.PI * 2); ctx.fill();
    }
  }
  // partition panels
  ctx.fillStyle = '#9fb0c2'; ctx.fillRect(x0, top, x1 - x0, ph);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let y = top + 10; y < floorY; y += 6) ctx.fillRect(x0, y, x1 - x0, 2);
  ctx.fillStyle = vgrad(ctx, top, floorY, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,20,40,0.15)']]); ctx.fillRect(x0, top, x1 - x0, ph);
  // posts + top rail
  for (let x = Math.floor(x0 / 210) * 210; x < x1; x += 210) {
    ctx.fillStyle = '#c3ccd5'; ctx.fillRect(x - 5, top, 10, ph);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 3, top, 2, ph);
    // pinned paper on the fabric
    if (Math.abs(Math.sin(x * 3.1)) > 0.4) {
      ctx.save(); ctx.translate(x + 60 + Math.sin(x) * 30, top + 46); ctx.rotate(Math.sin(x * 7) * 0.1);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-16, -20, 32, 40);
      ctx.fillStyle = 'rgba(224,90,71,0.8)'; circlePath(ctx, 0, -16, 2.5); ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#d3dbe2'; ctx.fillRect(x0, top - 6, x1 - x0, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x0, top - 6, x1 - x0, 3);
  ctx.fillStyle = 'rgba(58,34,22,0.15)'; ctx.fillRect(x0, top + 4, x1 - x0, 2);
}

function carpet(ctx, x0, x1, y, depth, W) {
  ctx.fillStyle = '#7f90a6'; ctx.fillRect(x0, y, x1 - x0, depth);
  // carpet tiles in perspective (subtle alternating pile direction)
  const vx = W / 2, vy = y - 1000;
  const xAt = (xt, yy) => vx + (xt - vx) * (yy - vy) / (y - vy);
  const rows = [0]; let rh = 22;
  while (rows[rows.length - 1] < depth) { rows.push(rows[rows.length - 1] + rh); rh *= 1.35; }
  const tw = 90, c0 = Math.floor((x0 - 400) / tw), c1 = Math.ceil((x1 + 400) / tw);
  ctx.fillStyle = '#7889a0';
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
  // speckle texture
  const r = rng(99);
  for (let i = 0; i < (x1 - x0) * depth / 260; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(20,30,50,0.10)';
    ctx.fillRect(x0 + r() * (x1 - x0), y + r() * depth, 2, 2);
  }
  ctx.strokeStyle = 'rgba(40,55,75,0.18)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const rr of rows) { ctx.moveTo(x0, y + rr); ctx.lineTo(x1, y + rr); }
  for (let c = c0; c < c1; c++) { ctx.moveTo(xAt(c * tw, y), y); ctx.lineTo(xAt(c * tw, y + depth), y + depth); }
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,15,30,0.28)']]);
  ctx.fillRect(x0, y, x1 - x0, depth);
  ctx.fillStyle = 'rgba(30,30,40,0.35)'; ctx.fillRect(x0, y, x1 - x0, 3);
}

// Small wall fillers between the main decor pieces.
function filler(ctx, x, y, kind) {
  if (kind === 0) { // light switch + outlet
    rrc(ctx, x, y, 22, 34, 3); ctx.fillStyle = '#f4f6f8'; ctx.fill(); bgStroke(ctx, 1.5);
    rrc(ctx, x, y, 6, 12, 2); ctx.fillStyle = '#d5dbe1'; ctx.fill();
  } else if (kind === 1) { // thermostat
    rrc(ctx, x, y, 40, 30, 6); ctx.fillStyle = '#f4f6f8'; ctx.fill(); bgStroke(ctx, 1.5);
    rrc(ctx, x, y, 26, 14, 3); ctx.fillStyle = '#b8e3c8'; ctx.fill();
    label(ctx, '21°', x, y + 1, 10, 'rgba(40,90,60,0.8)');
  } else if (kind === 2) { // framed certificate
    rrc(ctx, x, y, 70, 52, 2); ctx.fillStyle = '#c99a5a'; ctx.fill(); bgStroke(ctx, 1.5);
    rrc(ctx, x, y, 58, 40, 1); ctx.fillStyle = '#fbf6ea'; ctx.fill();
    ctx.fillStyle = 'rgba(90,70,40,0.35)'; ctx.fillRect(x - 20, y - 12, 40, 3); ctx.fillRect(x - 14, y - 4, 28, 2); ctx.fillRect(x - 16, y + 2, 32, 2);
    circlePath(ctx, x + 16, y + 11, 5); ctx.fillStyle = '#e05a47'; ctx.fill();
  } else { // air vent
    rrc(ctx, x, y, 70, 30, 3); ctx.fillStyle = '#eef1f4'; ctx.fill(); bgStroke(ctx, 1.5);
    ctx.fillStyle = 'rgba(90,100,115,0.3)';
    for (let k = 0; k < 4; k++) ctx.fillRect(x - 28, y - 10 + k * 6, 56, 2.5);
  }
}

export function drawOfficeBG(ctx, L, box, W) {
  const r = rng(L.seed || 1);
  wallFill(ctx, box, '#e4eaf1', '#d5dde7');
  // large acoustic wall panels with soft seams
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let x = Math.floor(box.x0 / 24) * 24; x < box.x1; x += 24) ctx.fillRect(x, box.y0, 2, L.h - box.y0);
  ctx.strokeStyle = 'rgba(90,110,135,0.12)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = Math.floor(box.x0 / 320) * 320 + 160; x < box.x1; x += 320) { ctx.moveTo(x, box.y0); ctx.lineTo(x, L.h); }
  for (let y = L.h - 360; y > box.y0; y -= 480) { ctx.moveTo(box.x0, y); ctx.lineTo(box.x1, y); }
  ctx.stroke();
  // accent band + company logo above the cubicles
  const by = L.h - 330;
  ctx.fillStyle = '#b9cadb'; ctx.fillRect(box.x0, by, box.x1 - box.x0, 150);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(box.x0, by, box.x1 - box.x0, 4);
  ctx.fillStyle = '#e8a33d'; ctx.fillRect(box.x0, by - 10, box.x1 - box.x0, 10);
  ctx.save(); ctx.globalAlpha = 0.55;
  ctx.font = `46px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillText('FRANK & CO.', W / 2, by + 58);
  ctx.font = `16px "Fredoka", sans-serif`; ctx.fillText('QUALITY  LINKS  SINCE  1887', W / 2, by + 92);
  ctx.restore();
  for (const cx of [-150, W + 150]) {
    ctx.fillStyle = '#d3dae2'; ctx.fillRect(cx - 40, box.y0, 80, L.h - box.y0);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(cx - 40, box.y0, 8, L.h - box.y0);
    ctx.fillStyle = 'rgba(40,50,70,0.08)'; ctx.fillRect(cx + 30, box.y0, 10, L.h - box.y0);
  }
  // decor spread vertically
  const items = ['window', 'poster', 'lamp', 'whiteboard', 'window', 'clock', 'cork', 'window', 'poster', 'lamp', 'employee', 'window', 'mugs', 'exit'];
  let k = Math.floor(r() * items.length);
  let side = r() < 0.5 ? -1 : 1;
  let posterKind = Math.floor(r() * 4);
  for (let y = L.h - 520; y > box.y0 + 60; y -= 300 + r() * 120) {
    const kind = items[k++ % items.length];
    side = -side;
    const x = W / 2 + side * (130 + r() * 190);
    if (kind === 'window') officeWindow(ctx, W / 2 + side * (100 + r() * 70), y, 340, 220, Math.round(y * 7 + 3), 0.15 + r() * 0.3);
    else if (kind === 'poster') poster(ctx, x, y, posterKind++ % 4);
    else if (kind === 'lamp') pendantLight(ctx, W / 2 + side * (60 + r() * 120), y - 80, 200);
    else if (kind === 'whiteboard') whiteboard(ctx, x, y, r);
    else if (kind === 'clock') { wallClock(ctx, x, y, 40); }
    else if (kind === 'cork') corkboard(ctx, x, y, r);
    else if (kind === 'employee') employeeOfMonth(ctx, x, y);
    else if (kind === 'mugs') shelfMugs(ctx, x, y, r);
    else if (kind === 'exit') exitSign(ctx, x, y);
    if (r() < 0.6) filler(ctx, W / 2 - side * (180 + r() * 110), y - 130 - r() * 60, Math.floor(r() * 4));
  }
  // far-side decor beyond the play column
  wallClock(ctx, W + 240, L.h - 520, 36);
  cubicles(ctx, box.x0, box.x1, L.h, W, r);
  plantPot(ctx, -250, L.h - 34, 1.4, '#e9ecef');
  // skirting
  ctx.fillStyle = '#5d6772'; ctx.fillRect(box.x0, L.h - 10, box.x1 - box.x0, 10);
  carpet(ctx, box.x0, box.x1, L.h, box.y1 - L.h, W);
}

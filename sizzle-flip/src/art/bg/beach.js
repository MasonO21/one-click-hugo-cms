// Beach background: sunny sky, sun, distant sea horizon, sand spit with boardwalk + palm silhouettes,
// shallow lagoon, and a foreground band of ocean water (the splash zone) at L.h.
import { rgba, lighten, darken, mix, rrc, ellipsePath, circlePath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { bgStroke, BG_INK } from './common.js';

const TAU = Math.PI * 2;

// Union of circles as one path so translucent fills don't double up.
function blobPath(ctx, puffs, x, y, s) {
  ctx.beginPath();
  for (const [px, py, pr] of puffs) { ctx.moveTo(x + (px + pr) * s, y + py * s); ctx.arc(x + px * s, y + py * s, pr * s, 0, TAU); }
}

export function softCloud(ctx, x, y, s, r, tint = '#b9d8f2', alpha = 0.95) {
  const n = 5 + Math.floor(r() * 3);
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    puffs.push([k * 150, -Math.cos(k * Math.PI) * 18 + (r() - 0.5) * 8, 22 + Math.cos(k * Math.PI) * 18 + r() * 8]);
  }
  ctx.save();
  // soft outline: a slightly larger tinted union behind the cloud
  blobPath(ctx, puffs.map(([a, b, c]) => [a, b + 1, c + 2.2 / s]), x, y, s);
  ctx.fillStyle = rgba('#5a7fa8', 0.16 * alpha); ctx.fill();
  blobPath(ctx, puffs, x, y, s);
  ctx.fillStyle = rgba('#ffffff', alpha); ctx.fill();
  ctx.save(); blobPath(ctx, puffs, x, y, s); ctx.clip();
  // shaded underside following the puffs
  blobPath(ctx, puffs.map(([a, b, c]) => [a + 4, b + 12, c]), x, y, s);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = rgba(tint, 0.5 * alpha);
  ctx.fillRect(x - 140 * s, y - 60 * s, 280 * s, 140 * s);
  ctx.globalCompositeOperation = 'source-over';
  blobPath(ctx, puffs, x, y, s);
  ctx.restore();
  // re-light the tops
  ctx.save(); blobPath(ctx, puffs, x, y, s); ctx.clip();
  blobPath(ctx, puffs.map(([a, b, c]) => [a - 3, b - 6, c * 0.92]), x, y, s);
  ctx.fillStyle = rgba('#ffffff', alpha); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function sun(ctx, x, y) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgrad(ctx, x, y, 0, 420, [[0, 'rgba(255,240,180,0.55)'], [0.25, 'rgba(255,230,160,0.22)'], [1, 'rgba(255,230,160,0)']]);
  ctx.fillRect(x - 420, y - 420, 840, 840);
  // soft rays
  ctx.translate(x, y);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(TAU / 12);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, 330); ctx.lineTo(30, 330); ctx.closePath();
    ctx.fillStyle = rgrad(ctx, 0, 0, 60, 330, [[0, 'rgba(255,245,200,0.07)'], [1, 'rgba(255,245,200,0)']]); ctx.fill();
  }
  ctx.restore();
  circlePath(ctx, x, y, 66); ctx.fillStyle = '#fff3b8'; ctx.fill();
  circlePath(ctx, x, y, 54); ctx.fillStyle = '#ffe680'; ctx.fill();
  circlePath(ctx, x - 16, y - 18, 16); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
}

function kite(ctx, x, y, r) {
  const cols = [['#ff6b6b', '#ffd93b'], ['#5ec8f0', '#ff8fc7'], ['#8a6cf0', '#7ee0a0']][Math.floor(r() * 3)];
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25 + r() * 0.5);
  // string
  ctx.beginPath(); ctx.moveTo(0, 46); ctx.quadraticCurveTo(40, 200, -20, 420); bgStroke(ctx, 1.5, 'rgba(70,60,60,0.25)');
  // tail with bows
  ctx.beginPath(); ctx.moveTo(0, 46);
  for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(i * 1.3) * 12, 46 + i * 18);
  bgStroke(ctx, 2, 'rgba(70,60,60,0.3)');
  for (let i = 1; i <= 5; i++) {
    const bx = Math.sin(i * 1.3) * 12, by = 46 + i * 18;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 7, by - 4); ctx.lineTo(bx - 7, by + 4); ctx.closePath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + 7, by - 4); ctx.lineTo(bx + 7, by + 4); ctx.closePath();
    ctx.fillStyle = rgba(cols[i % 2], 0.75); ctx.fill();
  }
  // kite body
  ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(32, -6); ctx.lineTo(0, 46); ctx.lineTo(-32, -6); ctx.closePath();
  ctx.fillStyle = rgba(cols[0], 0.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(32, -6); ctx.lineTo(0, -6); ctx.closePath();
  ctx.moveTo(0, -6); ctx.lineTo(-32, -6); ctx.lineTo(0, 46); ctx.closePath();
  ctx.fillStyle = rgba(cols[1], 0.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(32, -6); ctx.lineTo(0, 46); ctx.lineTo(-32, -6); ctx.closePath();
  bgStroke(ctx, 2);
  ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, 46); ctx.moveTo(-32, -6); ctx.lineTo(32, -6); bgStroke(ctx, 1.5);
  ctx.restore();
}

function bannerPlane(ctx, x, y, dir) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  // banner (behind the plane)
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-70, 0); bgStroke(ctx, 1.5, 'rgba(70,60,60,0.35)');
  ctx.beginPath(); ctx.moveTo(-70, -16);
  for (let i = 0; i <= 10; i++) ctx.lineTo(-70 - i * 22, -16 + Math.sin(i * 0.9) * 4);
  for (let i = 10; i >= 0; i--) ctx.lineTo(-70 - i * 22, 16 + Math.sin(i * 0.9) * 4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,250,236,0.9)'; ctx.fill(); bgStroke(ctx, 2);
  ctx.save(); ctx.scale(dir, 1);
  ctx.font = '22px "Lilita One", "Fredoka", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(230,90,70,0.85)'; ctx.fillText('HOT DOGS 4 ALL!', dir * -180, 1);
  ctx.restore();
  // little plane
  ctx.beginPath(); ctx.ellipse(-8, 0, 36, 11, 0, 0, TAU); ctx.fillStyle = 'rgba(255,120,100,0.9)'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-20, -26); ctx.lineTo(-6, -26); ctx.lineTo(12, -2); ctx.closePath();
  ctx.fillStyle = 'rgba(255,240,220,0.95)'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.moveTo(-40, -2); ctx.lineTo(-48, -18); ctx.lineTo(-38, -18); ctx.lineTo(-30, -2); ctx.closePath();
  ctx.fillStyle = 'rgba(255,120,100,0.9)'; ctx.fill(); bgStroke(ctx, 2);
  circlePath(ctx, 10, -3, 5); ctx.fillStyle = 'rgba(150,210,240,0.9)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(30, -12); ctx.lineTo(30, 12); bgStroke(ctx, 3, 'rgba(70,60,60,0.3)');
  ctx.restore();
}

function gulls(ctx, x, y, r) {
  ctx.strokeStyle = 'rgba(60,70,90,0.35)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const gx = x + (r() - 0.5) * 160, gy = y + (r() - 0.5) * 70, s = 0.7 + r() * 0.6;
    ctx.beginPath(); ctx.moveTo(gx - 16 * s, gy - 4 * s); ctx.quadraticCurveTo(gx - 7 * s, gy - 12 * s, gx, gy);
    ctx.quadraticCurveTo(gx + 7 * s, gy - 12 * s, gx + 16 * s, gy - 4 * s); ctx.stroke();
  }
}

function hotAirBalloon(ctx, x, y, r) {
  const cols = ['#ff7a6b', '#ffd36b', '#7fd0f0', '#b48cf0'];
  const a = cols[Math.floor(r() * 4)], b = '#fff4e0';
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = 0.85;
  for (const sx of [-14, 14]) { ctx.beginPath(); ctx.moveTo(sx * 1.6, 40); ctx.lineTo(sx * 0.7, 74); bgStroke(ctx, 1.5, 'rgba(70,60,60,0.35)'); }
  rrc(ctx, 0, 82, 26, 18, 4); ctx.fillStyle = '#c9925a'; ctx.fill(); bgStroke(ctx, 2);
  ctx.beginPath(); ctx.moveTo(0, -60); ctx.bezierCurveTo(56, -60, 58, 10, 18, 44); ctx.lineTo(-18, 44); ctx.bezierCurveTo(-58, 10, -56, -60, 0, -60); ctx.closePath();
  ctx.fillStyle = a; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = b;
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 22, -6, 9, 60, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-24, -26, 10, 24, 0.3, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(0, -60); ctx.bezierCurveTo(56, -60, 58, 10, 18, 44); ctx.lineTo(-18, 44); ctx.bezierCurveTo(-58, 10, -56, -60, 0, -60); ctx.closePath();
  bgStroke(ctx, 2);
  ctx.restore();
}

function palmSilhouette(ctx, x, y, h, lean, col) {
  ctx.save(); ctx.translate(x, y);
  const tx = lean * h, ty = -h;
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(lean * h * 0.2 - 6, -h * 0.5, tx - 4, ty);
  ctx.lineTo(tx + 4, ty); ctx.quadraticCurveTo(lean * h * 0.2 + 6, -h * 0.5, 7, 0); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  // fronds
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + i * Math.PI / 6 + 0.12;
    const L = h * (0.42 + (i % 2) * 0.1);
    const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.55 + L * 0.28;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.55, ty + Math.sin(a) * L * 0.6 - 14, ex, ey);
    ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.35, tx, ty + 6);
    ctx.fillStyle = col; ctx.fill();
  }
  ctx.restore();
}

function beachHut(ctx, x, y, col) {
  ctx.save(); ctx.translate(x, y);
  rrc(ctx, 0, -26, 44, 52, 2); ctx.fillStyle = 'rgba(255,248,232,0.85)'; ctx.fill(); bgStroke(ctx, 1.5);
  ctx.save(); rrc(ctx, 0, -26, 44, 52, 2); ctx.clip();
  ctx.fillStyle = rgba(col, 0.7);
  for (let k = -22; k < 22; k += 11) ctx.fillRect(k, -52, 5.5, 52);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(-30, -50); ctx.lineTo(0, -72); ctx.lineTo(30, -50); ctx.closePath(); ctx.fillStyle = rgba(col, 0.85); ctx.fill(); bgStroke(ctx, 1.5);
  rrc(ctx, 0, -16, 14, 30, 2); ctx.fillStyle = 'rgba(90,70,60,0.35)'; ctx.fill();
  ctx.restore();
}

function waveLine(ctx, x0, x1, y, amp, len, ph) {
  ctx.beginPath();
  ctx.moveTo(x0, y);
  for (let x = x0; x <= x1 + 10; x += 10) ctx.lineTo(x, y + Math.sin(x / len * TAU + ph) * amp);
}

// Foreground ocean band (the fail zone): bright crest with foam, deepening water below.
function oceanBand(ctx, x0, x1, y, depth, r) {
  const crest = x => y - 4 + Math.sin(x * 0.03) * 5 + Math.sin(x * 0.011 + 1.3) * 4;
  // back swell (a little above the line)
  ctx.beginPath(); ctx.moveTo(x0, y + 40);
  for (let x = x0; x <= x1 + 12; x += 12) ctx.lineTo(x, crest(x + 40) - 9);
  ctx.lineTo(x1, y + 40); ctx.closePath();
  ctx.fillStyle = 'rgba(120,220,240,0.7)'; ctx.fill();
  // main body of water
  ctx.beginPath(); ctx.moveTo(x0, y + depth);
  for (let x = x0; x <= x1 + 8; x += 8) ctx.lineTo(x, crest(x));
  ctx.lineTo(x1, y + depth); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, y - 10, y + depth, [[0, '#3ccbe6'], [0.18, '#22acd8'], [0.6, '#1688bf'], [1, '#0d5f94']]);
  ctx.fill();
  // foam crest
  ctx.beginPath();
  for (let x = x0; x <= x1 + 8; x += 8) (x === x0 ? ctx.moveTo(x, crest(x)) : ctx.lineTo(x, crest(x)));
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let x = x0; x < x1; x += 14 + r() * 18) {
    const rr = 3 + r() * 6;
    circlePath(ctx, x, crest(x) + 2 + r() * 3, rr); ctx.fill();
  }
  // curling wave tips along the crest
  for (let x = x0 + r() * 80; x < x1; x += 140 + r() * 80) {
    const cy = crest(x);
    ctx.beginPath(); ctx.moveTo(x - 30, cy + 2); ctx.quadraticCurveTo(x - 6, cy - 22, x + 16, cy - 8);
    ctx.quadraticCurveTo(x + 6, cy - 14, x - 2, cy - 4); ctx.quadraticCurveTo(x - 12, cy + 4, x - 30, cy + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  }
  // foam lace under the crest
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2.5;
  for (let x = x0; x < x1; x += 36) {
    const cy = crest(x) + 14 + r() * 6;
    ctx.beginPath(); ctx.arc(x, cy, 10 + r() * 6, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  }
  // deeper wave bands
  for (let i = 0; i < 4; i++) {
    const yy = y + 60 + i * 55;
    if (yy > y + depth) break;
    waveLine(ctx, x0, x1, yy, 5 + i, 150 + i * 30, i * 1.7);
    ctx.lineWidth = 4 - i * 0.6; ctx.strokeStyle = `rgba(255,255,255,${0.32 - i * 0.06})`; ctx.stroke();
    waveLine(ctx, x0, x1, yy + 8, 5 + i, 150 + i * 30, i * 1.7);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,60,110,0.12)'; ctx.stroke();
  }
  // sparkles + bubbles
  for (let i = 0; i < 70; i++) {
    const sx = x0 + r() * (x1 - x0), sy = y + 24 + r() * (depth - 30);
    if (r() < 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(sx - 7, sy); ctx.lineTo(sx, sy - 2); ctx.lineTo(sx + 7, sy); ctx.lineTo(sx, sy + 2); ctx.closePath(); ctx.fill();
    } else {
      circlePath(ctx, sx, sy, 2 + r() * 3); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    }
  }
}

export function drawBeachBG(ctx, L, box, W) {
  const r = rng(L.seed || 1);
  const H = L.h;
  const hz = H - 330;          // sea horizon
  const shore = H - 240;       // sand spit with the boardwalk
  // ---- sky
  ctx.fillStyle = vgrad(ctx, hz - 1700, hz, [[0, '#3a9de0'], [0.45, '#6cc4f2'], [0.85, '#bfe9fb'], [1, '#fff1d2']]);
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, hz - box.y0 + 2);
  sun(ctx, W * 0.8, hz - 560);
  // far haze clouds near the horizon
  for (let i = 0; i < 5; i++) softCloud(ctx, box.x0 + (i + r() * 0.6) * (box.x1 - box.x0) / 5, hz - 30 - r() * 60, 0.7 + r() * 0.4, r, '#f4d8c8', 0.55);
  // ---- decor spread up the sky
  const items = ['cloud', 'kite', 'gulls', 'cloud', 'plane', 'balloon', 'cloud', 'gulls'];
  let k = Math.floor(r() * items.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = hz - 260; y > box.y0 + 60; y -= 300 + r() * 120) {
    const kind = items[k++ % items.length];
    side = -side;
    const x = W / 2 + side * (110 + r() * 250);
    if (kind === 'cloud') softCloud(ctx, x, y, 0.8 + r() * 0.5, r);
    else if (kind === 'kite') kite(ctx, x, y, r);
    else if (kind === 'gulls') gulls(ctx, x, y, r);
    else if (kind === 'plane') bannerPlane(ctx, x, y, side);
    else if (kind === 'balloon') hotAirBalloon(ctx, x, y, r);
    // a second, faint cloud on the far side for depth
    if (r() < 0.6) softCloud(ctx, W / 2 - side * (260 + r() * 220), y - 140 - r() * 80, 0.5 + r() * 0.3, r, '#b9d8f2', 0.6);
  }
  // ---- distant sea
  ctx.fillStyle = vgrad(ctx, hz, shore, [[0, '#4fb7d9'], [1, '#2f9cc7']]);
  ctx.fillRect(box.x0, hz, box.x1 - box.x0, shore - hz + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(box.x0, hz, box.x1 - box.x0, 2);
  for (let i = 0; i < 40; i++) {
    const sx = box.x0 + r() * (box.x1 - box.x0), sy = hz + 8 + r() * (shore - hz - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx, sy, 10 + r() * 22, 2);
  }
  // sun glitter path on the sea
  for (let i = 0; i < 14; i++) {
    const sy = hz + 6 + i * 6, w = 14 + i * 5;
    ctx.fillStyle = 'rgba(255,245,200,0.4)'; ctx.fillRect(W * 0.8 - w / 2 + (r() - 0.5) * 20, sy, w * (0.4 + r() * 0.6), 2);
  }
  // distant island + lighthouse + sailboat
  const ix = r() < 0.5 ? -120 : W + 120;
  ctx.beginPath(); ctx.moveTo(ix - 170, hz + 2); ctx.quadraticCurveTo(ix - 60, hz - 46, ix + 40, hz - 30); ctx.quadraticCurveTo(ix + 120, hz - 20, ix + 170, hz + 2); ctx.closePath();
  ctx.fillStyle = 'rgba(90,160,150,0.55)'; ctx.fill();
  palmSilhouette(ctx, ix - 40, hz - 34, 50, 0.25, 'rgba(70,140,130,0.6)');
  palmSilhouette(ctx, ix + 10, hz - 36, 64, -0.18, 'rgba(70,140,130,0.6)');
  const lx = W - ix + (ix < 0 ? -80 : 80);
  ctx.fillStyle = 'rgba(255,250,240,0.75)';
  ctx.beginPath(); ctx.moveTo(lx - 10, hz + 2); ctx.lineTo(lx - 6, hz - 60); ctx.lineTo(lx + 6, hz - 60); ctx.lineTo(lx + 10, hz + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(240,110,100,0.7)'; ctx.fillRect(lx - 8, hz - 40, 16, 9); ctx.fillRect(lx - 7, hz - 22, 15, 9);
  ctx.fillStyle = 'rgba(240,110,100,0.8)'; ctx.beginPath(); ctx.moveTo(lx - 9, hz - 60); ctx.lineTo(lx, hz - 72); ctx.lineTo(lx + 9, hz - 60); ctx.closePath(); ctx.fill();
  const bx = W * 0.3 + r() * 120, by = hz + 22;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx, by - 44); ctx.lineTo(bx + 24, by - 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,140,120,0.75)'; ctx.beginPath(); ctx.moveTo(bx - 3, by - 6); ctx.lineTo(bx - 3, by - 34); ctx.lineTo(bx - 18, by - 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(120,90,80,0.55)'; ctx.beginPath(); ctx.moveTo(bx - 22, by - 5); ctx.lineTo(bx + 28, by - 5); ctx.lineTo(bx + 20, by + 2); ctx.lineTo(bx - 16, by + 2); ctx.closePath(); ctx.fill();
  // ---- sand spit with palms, huts and the boardwalk
  for (const px of [-300, -190, 40, 380, 610, 760, 900]) {
    if (r() < 0.25) continue;
    palmSilhouette(ctx, px + (r() - 0.5) * 60, shore + 4, 110 + r() * 90, (r() - 0.5) * 0.5, 'rgba(46,130,120,0.42)');
  }
  ctx.beginPath(); ctx.moveTo(box.x0, shore + 26);
  for (let x = box.x0; x <= box.x1 + 20; x += 20) ctx.lineTo(x, shore + Math.sin(x * 0.006) * 5);
  ctx.lineTo(box.x1, shore + 40); ctx.lineTo(box.x0, shore + 40); ctx.closePath();
  ctx.fillStyle = '#f6dca5'; ctx.fill();
  ctx.fillStyle = 'rgba(200,150,90,0.25)'; ctx.fillRect(box.x0, shore + 16, box.x1 - box.x0, 24);
  for (const hx of [-280, 780, 900]) beachHut(ctx, hx, shore + 6, ['#ff7a6b', '#5ec8f0', '#ffc94a'][Math.floor(r() * 3)]);
  // boardwalk (distant pier along the sand)
  const deck = shore + 12;
  ctx.fillStyle = 'rgba(150,105,70,0.55)';
  for (let x = Math.floor(box.x0 / 70) * 70; x < box.x1; x += 70) ctx.fillRect(x - 3, deck, 6, 30);
  ctx.fillStyle = '#d7ad7c'; ctx.fillRect(box.x0, deck - 6, box.x1 - box.x0, 9);
  ctx.fillStyle = 'rgba(120,80,50,0.35)'; ctx.fillRect(box.x0, deck + 1, box.x1 - box.x0, 2);
  ctx.fillStyle = 'rgba(150,105,70,0.6)';
  for (let x = Math.floor(box.x0 / 35) * 35; x < box.x1; x += 35) ctx.fillRect(x - 1.5, deck - 26, 3, 20);
  ctx.fillRect(box.x0, deck - 28, box.x1 - box.x0, 4);
  // lamp posts on the boardwalk
  for (let x = Math.floor(box.x0 / 280) * 280 + 100; x < box.x1; x += 280) {
    ctx.fillStyle = 'rgba(90,90,110,0.45)'; ctx.fillRect(x - 2, deck - 70, 4, 64);
    circlePath(ctx, x, deck - 72, 6); ctx.fillStyle = 'rgba(255,240,190,0.85)'; ctx.fill();
  }
  // ---- shallow lagoon between the spit and the foreground
  ctx.fillStyle = vgrad(ctx, shore + 30, H, [[0, '#7fdbe6'], [1, '#4cc3df']]);
  ctx.fillRect(box.x0, shore + 30, box.x1 - box.x0, H - shore - 20);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(box.x0, shore + 30, box.x1 - box.x0, 3);
  for (let i = 0; i < 3; i++) {
    waveLine(ctx, box.x0, box.x1, shore + 70 + i * 50, 3, 120 + i * 40, i * 2);
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const sx = box.x0 + r() * (box.x1 - box.x0), sy = shore + 40 + r() * (H - shore - 60);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx, sy, 8 + r() * 14, 2);
  }
  // ---- foreground ocean (the splash zone)
  oceanBand(ctx, box.x0, box.x1, H, box.y1 - H, r);
}

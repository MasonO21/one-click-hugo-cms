import { rgba, lighten, darken, rrc, ellipsePath, circlePath, vgrad, rng } from '../common.js';
import { wallFill, stripes, subwayTiles, floorBand, baseboard, windowFrame, curtains, frame, wallClock, plantPot, lightRays, bgStroke } from './common.js';

function hangingPans(ctx, x, y) {
  ctx.fillStyle = '#b9a58a'; ctx.fillRect(x - 130, y - 4, 260, 8);
  [[-90, 26, '#d07a4a'], [-20, 34, '#7a868f'], [55, 22, '#d07a4a']].forEach(([dx, r, c]) => {
    ctx.strokeStyle = 'rgba(58,34,22,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x + dx, y + 18); ctx.stroke();
    ctx.fillStyle = c; ctx.fillRect(x + dx - 4, y + 18, 8, 34);
    circlePath(ctx, x + dx, y + 52 + r, r); ctx.fillStyle = c; ctx.fill(); bgStroke(ctx);
    circlePath(ctx, x + dx - r * 0.25, y + 52 + r * 0.8, r * 0.55); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
  });
}

function spiceShelf(ctx, x, y) {
  ctx.fillStyle = '#c99a62'; ctx.fillRect(x - 90, y, 180, 10);
  const cols = ['#e05a47', '#f2b134', '#5bb072', '#8d6cc4', '#e57f4f'];
  for (let i = 0; i < 5; i++) {
    const jx = x - 70 + i * 35;
    rrc(ctx, jx, y - 20, 24, 40, 5); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill(); bgStroke(ctx, 2);
    rrc(ctx, jx, y - 14, 20, 26, 3); ctx.fillStyle = cols[i]; ctx.fill();
    rrc(ctx, jx, y - 43, 24, 8, 2); ctx.fillStyle = '#6f6a66'; ctx.fill();
  }
}

function utensilCrock(ctx, x, y) {
  ctx.strokeStyle = 'rgba(58,34,22,0.45)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  [[-14, -70], [0, -84], [14, -74]].forEach(([dx, h]) => { ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x + dx * 1.6, y + h); ctx.stroke(); });
  rrc(ctx, x, y + 20, 50, 50, 8); ctx.fillStyle = '#7fb3c8'; ctx.fill(); bgStroke(ctx);
}

function sausagePortrait(ctx, x, y, w, h) {
  ctx.fillStyle = '#ffe6b8'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.lineCap = 'round';
  ctx.lineWidth = 18; ctx.strokeStyle = '#d9573b';
  ctx.beginPath(); ctx.moveTo(x - w * 0.3, y + 6); ctx.quadraticCurveTo(x, y - 8, x + w * 0.3, y + 6); ctx.stroke();
  ctx.fillStyle = '#3a2216'; circlePath(ctx, x + w * 0.12, y - 2, 2.2); ctx.fill(); circlePath(ctx, x + w * 0.2, y, 2.2); ctx.fill();
  ctx.fillStyle = '#e9b24a'; ctx.fillRect(x - w / 2, y + h / 2 - 10, w, 10);
}

export function drawKitchenBG(ctx, L, box, W) {
  const r = rng(L.seed || 1);
  wallFill(ctx, box, '#fdf3dc', '#f4dfb8');
  stripes(ctx, box, L.h, 'rgba(255,255,255,0.28)', 34, 34);
  // dado rail / backsplash near floor
  subwayTiles(ctx, box.x0, box.x1, L.h - 230, L.h, '#e4f0eb', 'rgba(120,150,140,0.35)');
  ctx.fillStyle = '#cfa36d'; ctx.fillRect(box.x0, L.h - 236, box.x1 - box.x0, 8);
  // decor spread vertically
  const items = ['window', 'clock', 'pans', 'spice', 'portrait', 'plant', 'window'];
  let k = Math.floor(r() * items.length);
  for (let y = L.h - 420; y > box.y0 + 60; y -= 300 + r() * 120) {
    const kind = items[k++ % items.length];
    const side = r() < 0.5 ? -1 : 1;
    const x = W / 2 + side * (120 + r() * 260);
    if (kind === 'window') {
      windowFrame(ctx, x, y, 170, 150);
      curtains(ctx, x, y, 170, 150, r() < 0.5 ? '#f08a7a' : '#8ccfb4');
      lightRays(ctx, x, y - 60, 180, 420, 0.07);
    } else if (kind === 'clock') wallClock(ctx, x, y, 44);
    else if (kind === 'pans') hangingPans(ctx, x, y - 40);
    else if (kind === 'spice') spiceShelf(ctx, x, y);
    else if (kind === 'portrait') frame(ctx, x, y, 120, 96, '#c78f4f', sausagePortrait);
    else if (kind === 'plant') { ctx.fillStyle = '#c99a62'; ctx.fillRect(x - 60, y + 30, 120, 10); plantPot(ctx, x, y, 0.9); }
  }
  // far-side decor beyond the play column (wide screens)
  for (const ox of [-220, W + 220]) {
    utensilCrock(ctx, ox, L.h - 280);
  }
  baseboard(ctx, box.x0, box.x1, L.h, 18, '#cfa36d');
  floorBand(ctx, box.x0, box.x1, L.h, box.y1 - L.h, '#f1e8d8', '#d8c6aa', 'checker');
}

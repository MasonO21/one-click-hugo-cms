// Background helpers. Background art is deliberately softer than gameplay props:
// thin/low-contrast outlines and lighter values so the playable objects always read first.
import { rgba, lighten, darken, mix, rrPath, rrc, ellipsePath, circlePath, polyPath, vgrad, hgrad, rgrad, rng } from '../common.js';

export const BG_INK = 'rgba(58,34,22,0.28)';

export function bgStroke(ctx, w = 2.5, c = BG_INK) {
  ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

export function wallFill(ctx, box, top, bottom) {
  ctx.fillStyle = vgrad(ctx, box.y0, box.y1, [[0, top], [1, bottom]]);
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
}

export function stripes(ctx, box, yTo, color, width = 40, gap = 40) {
  ctx.fillStyle = color;
  for (let x = Math.floor(box.x0 / (width + gap)) * (width + gap); x < box.x1; x += width + gap) {
    ctx.fillRect(x, box.y0, width, yTo - box.y0);
  }
}

export function dots(ctx, box, yTo, color, step = 46, r = 3, seed = 3) {
  ctx.fillStyle = color;
  let row = 0;
  for (let y = box.y0; y < yTo; y += step, row++) {
    for (let x = box.x0 + (row % 2) * step / 2; x < box.x1; x += step) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function subwayTiles(ctx, x0, x1, y0, y1, base, grout) {
  ctx.fillStyle = base; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = grout; ctx.lineWidth = 2;
  const th = 26, tw = 56;
  let row = 0;
  for (let y = y0; y < y1; y += th, row++) {
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    for (let x = x0 + (row % 2) * tw / 2; x < x1; x += tw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + th, y1)); ctx.stroke(); }
  }
  // soft sheen
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let y = y0 + 4; y < y1; y += th) ctx.fillRect(x0, y, x1 - x0, 5);
}

// Side-view floor band with gentle perspective rows.
export function floorBand(ctx, x0, x1, y, depth, a, b, kind = 'checker') {
  ctx.fillStyle = a; ctx.fillRect(x0, y, x1 - x0, depth);
  if (kind === 'checker') {
    let rowH = 16, yy = y, row = 0;
    while (yy < y + depth) {
      const tw = 60 + row * 10;
      for (let x = x0 + (row % 2 ? tw : 0) - 2 * tw; x < x1; x += tw * 2) {
        ctx.fillStyle = b; ctx.fillRect(x, yy, tw, rowH);
      }
      yy += rowH; rowH *= 1.35; row++;
    }
  } else if (kind === 'planks') {
    let rowH = 14, yy = y, row = 0;
    ctx.strokeStyle = b; ctx.lineWidth = 2;
    while (yy < y + depth) {
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
      const pl = 180 + row * 30;
      for (let x = x0 + ((row * 97) % pl); x < x1; x += pl) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x, yy + rowH); ctx.stroke(); }
      yy += rowH; rowH *= 1.3; row++;
    }
  } else if (kind === 'grass') {
    const r = rng(9);
    ctx.fillStyle = b;
    for (let x = x0; x < x1; x += 7) {
      const h = 8 + r() * 14;
      ctx.beginPath(); ctx.moveTo(x - 4, y + 6); ctx.lineTo(x + r() * 4 - 2, y - h); ctx.lineTo(x + 4, y + 6); ctx.fill();
    }
    for (let i = 0; i < 80; i++) { ctx.fillStyle = rgba(b, 0.5); ctx.fillRect(x0 + r() * (x1 - x0), y + 10 + r() * depth, 10, 3); }
  }
  // shading
  ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, 'rgba(0,0,0,0.0)'], [1, 'rgba(0,0,0,0.25)']]);
  ctx.fillRect(x0, y, x1 - x0, depth);
  // contact line
  ctx.fillStyle = 'rgba(40,20,10,0.35)'; ctx.fillRect(x0, y, x1 - x0, 3);
}

export function baseboard(ctx, x0, x1, y, h, color) {
  ctx.fillStyle = color; ctx.fillRect(x0, y - h, x1 - x0, h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x0, y - h, x1 - x0, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x0, y - 5, x1 - x0, 5);
}

export function windowFrame(ctx, x, y, w, h, opts = {}) {
  const sky = opts.sky || ['#8fd3ff', '#d9f2ff'];
  // frame
  rrc(ctx, x, y, w + 24, h + 24, 6); ctx.fillStyle = opts.frame || '#f7f1e6'; ctx.fill(); bgStroke(ctx);
  rrc(ctx, x, y, w, h, 3);
  ctx.fillStyle = vgrad(ctx, y - h / 2, y + h / 2, [[0, sky[0]], [1, sky[1]]]); ctx.fill();
  ctx.save(); rrc(ctx, x, y, w, h, 3); ctx.clip();
  if (opts.scene) opts.scene(ctx, x - w / 2, y - h / 2, w, h);
  else {
    // clouds + hills
    const r = rng(Math.round(x * 7 + y));
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 3; i++) {
      const cx = x - w / 2 + r() * w, cy = y - h / 2 + 20 + r() * h * 0.4;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + k * 14 - 20, cy + (k % 2) * 4, 12 + (k % 2) * 5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = '#9ed27c';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2);
    ctx.quadraticCurveTo(x - w / 4, y + h / 6, x, y + h / 3); ctx.quadraticCurveTo(x + w / 4, y + h / 6, x + w / 2, y + h / 3);
    ctx.lineTo(x + w / 2, y + h / 2); ctx.fill();
  }
  // glare
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 10, y + h / 2); ctx.lineTo(x - w / 2 + 40, y + h / 2); ctx.lineTo(x - w / 2 + 90, y - h / 2); ctx.lineTo(x - w / 2 + 60, y - h / 2); ctx.fill();
  ctx.restore();
  // mullions
  ctx.fillStyle = opts.frame || '#f7f1e6';
  ctx.fillRect(x - 4, y - h / 2, 8, h); ctx.fillRect(x - w / 2, y - 4, w, 8);
  // sill
  rrc(ctx, x, y + h / 2 + 16, w + 50, 12, 4); ctx.fillStyle = opts.frame || '#f7f1e6'; ctx.fill(); bgStroke(ctx);
}

export function curtains(ctx, x, y, w, h, color) {
  for (const s of [-1, 1]) {
    ctx.beginPath();
    const cx = x + s * (w / 2 + 6);
    ctx.moveTo(cx - 34, y - h / 2 - 24);
    ctx.lineTo(cx + 34, y - h / 2 - 24);
    ctx.quadraticCurveTo(cx + 10 * s, y, cx + 26, y + h / 2 + 30);
    ctx.lineTo(cx - 26, y + h / 2 + 30);
    ctx.quadraticCurveTo(cx - 10 * s, y, cx - 34, y - h / 2 - 24);
    ctx.fillStyle = color; ctx.fill(); bgStroke(ctx);
    ctx.strokeStyle = rgba(darken(color, 0.4), 0.3); ctx.lineWidth = 2;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 14, y - h / 2 - 20); ctx.quadraticCurveTo(cx + k * 8, y, cx + k * 16, y + h / 2 + 26); ctx.stroke(); }
  }
  ctx.fillStyle = '#8a6a4a'; ctx.fillRect(x - w / 2 - 50, y - h / 2 - 30, w + 100, 7);
}

export function frame(ctx, x, y, w, h, color, inner) {
  rrc(ctx, x, y, w, h, 3); ctx.fillStyle = color; ctx.fill(); bgStroke(ctx);
  rrc(ctx, x, y, w - 14, h - 14, 2); ctx.fillStyle = '#fff8ea'; ctx.fill();
  ctx.save(); rrc(ctx, x, y, w - 22, h - 22, 2); ctx.clip();
  if (inner) inner(ctx, x, y, w - 22, h - 22);
  ctx.restore();
}

export function wallClock(ctx, x, y, r, t = 0) {
  circlePath(ctx, x, y, r); ctx.fillStyle = '#fff8ea'; ctx.fill(); bgStroke(ctx, 5, 'rgba(58,34,22,0.4)');
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    ctx.fillStyle = 'rgba(58,34,22,0.4)';
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(58,34,22,0.55)'; ctx.lineCap = 'round';
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y - r * 0.2); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r * 0.1, y - r * 0.65); ctx.stroke();
}

export function plantPot(ctx, x, y, s = 1, potColor = '#d9805a') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#6cae5a';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.38;
    ctx.save(); ctx.rotate(a + Math.PI / 2);
    ctx.beginPath(); ctx.ellipse(0, -38, 9, 30, 0, 0, Math.PI * 2); ctx.fillStyle = i % 2 ? '#6cae5a' : '#5a9a4a'; ctx.fill(); bgStroke(ctx, 2);
    ctx.restore();
  }
  ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(26, -6); ctx.lineTo(20, 30); ctx.lineTo(-20, 30); ctx.closePath();
  ctx.fillStyle = potColor; ctx.fill(); bgStroke(ctx);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-28, -10, 56, 8);
  ctx.restore();
}

export function lightRays(ctx, x, y, w, h, alpha = 0.08) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, `rgba(255,240,200,${alpha})`);
  g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.9, y + h); ctx.lineTo(x - w * 0.1, y + h); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Out-of-bounds shading so the play column edges read clearly on wide screens.
export function playBounds(ctx, box, W) {
  for (const [x0, x1, dir] of [[box.x0, 0, -1], [W, box.x1, 1]]) {
    if (x1 <= x0) continue;
    const g = ctx.createLinearGradient(dir < 0 ? 0 : W, 0, dir < 0 ? -160 : W + 160, 0);
    g.addColorStop(0, 'rgba(20,10,30,0.28)');
    g.addColorStop(1, 'rgba(20,10,30,0.5)');
    ctx.fillStyle = g; ctx.fillRect(x0, box.y0, x1 - x0, box.y1 - box.y0);
  }
  ctx.fillStyle = 'rgba(20,10,30,0.35)';
  ctx.fillRect(-4, box.y0, 4, box.y1 - box.y0);
  ctx.fillRect(W, box.y0, 4, box.y1 - box.y0);
}

export function vignette(ctx, box) {
  const cx = (box.x0 + box.x1) / 2;
  const g = ctx.createLinearGradient(0, box.y0, 0, box.y1);
  g.addColorStop(0, 'rgba(255,250,235,0.10)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(30,10,0,0.12)');
  ctx.fillStyle = g; ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
}

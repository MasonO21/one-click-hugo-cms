// Space background: deep starfield with nebula, a ringed planet, distant space-station trusses at the
// sides, drifting decor, and a bottom band of deep void with a faint warning energy field at L.h.
import { rgba, lighten, darken, mix, rrc, ellipsePath, circlePath, vgrad, hgrad, rgrad, rng } from '../common.js';
import { bgStroke } from './common.js';

const TAU = Math.PI * 2;
const SINK = 'rgba(160,190,255,0.22)'; // soft outline for space decor

function nebula(ctx, x, y, r, col, a) {
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [[0, rgba(col, a)], [0.5, rgba(col, a * 0.45)], [1, rgba(col, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function starfield(ctx, box, yTo, r) {
  const area = (box.x1 - box.x0) * (yTo - box.y0);
  const n = Math.min(2600, Math.floor(area / 2600));
  const cols = ['#ffffff', '#cfe0ff', '#fff2c8', '#ffd0e8', '#bff6ff'];
  for (let i = 0; i < n; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (yTo - box.y0);
    const s = r();
    const rad = s < 0.8 ? 0.6 + r() * 0.9 : 1.4 + r() * 1.2;
    ctx.fillStyle = rgba(cols[Math.floor(r() * cols.length)], 0.35 + r() * 0.55);
    circlePath(ctx, x, y, rad); ctx.fill();
  }
  // a few twinkle stars
  for (let i = 0; i < n / 60; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (yTo - box.y0), s = 4 + r() * 7;
    ctx.fillStyle = rgba('#ffffff', 0.25 + r() * 0.3);
    circlePath(ctx, x, y, s * 1.4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.moveTo(x, y - s * 2.2); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s * 2.2, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
    ctx.lineTo(x, y + s * 2.2); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s * 2.2, y); ctx.lineTo(x - s * 0.25, y - s * 0.25); ctx.closePath(); ctx.fill();
  }
}

function ringedPlanet(ctx, x, y, R, c1, c2, ringCol) {
  // back half of the ring
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.32);
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.9, R * 0.42, 0, Math.PI, TAU); ctx.lineWidth = R * 0.16; ctx.strokeStyle = rgba(ringCol, 0.45); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.62, R * 0.34, 0, Math.PI, TAU); ctx.lineWidth = R * 0.06; ctx.strokeStyle = rgba(ringCol, 0.3); ctx.stroke();
  ctx.restore();
  // planet
  circlePath(ctx, x, y, R); ctx.fillStyle = rgrad(ctx, x - R * 0.35, y - R * 0.35, R * 0.1, R * 1.25, [[0, c1], [1, c2]]); ctx.fill();
  ctx.save(); circlePath(ctx, x, y, R); ctx.clip();
  ctx.globalAlpha = 0.35;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.ellipse(x, y + i * R * 0.26, R * 1.2, R * 0.07 + (i % 2 ? R * 0.03 : 0), -0.12, 0, TAU);
    ctx.fillStyle = i % 2 ? lighten(c1, 0.3) : darken(c2, 0.2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(x, y, R + 4, 0, TAU); ctx.arc(x - R * 0.35, y - R * 0.3, R * 1.05, 0, TAU, true);
  ctx.fillStyle = 'rgba(5,5,25,0.5)'; ctx.fill('evenodd');
  ctx.restore();
  circlePath(ctx, x, y, R); bgStroke(ctx, 2, SINK);
  // atmosphere rim
  ctx.beginPath(); ctx.arc(x, y, R + 3, Math.PI * 0.95, Math.PI * 1.6); ctx.lineWidth = 5; ctx.strokeStyle = rgba(lighten(c1, 0.5), 0.35); ctx.stroke();
  // front half of the ring
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.32);
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.9, R * 0.42, 0, 0, Math.PI); ctx.lineWidth = R * 0.16; ctx.strokeStyle = rgba(ringCol, 0.6); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.62, R * 0.34, 0, 0, Math.PI); ctx.lineWidth = R * 0.06; ctx.strokeStyle = rgba(ringCol, 0.4); ctx.stroke();
  ctx.restore();
}

function moon(ctx, x, y, R) {
  circlePath(ctx, x, y, R); ctx.fillStyle = rgrad(ctx, x - R * 0.3, y - R * 0.3, 1, R * 1.2, [[0, '#d9d6e8'], [1, '#6f6c8a']]); ctx.fill();
  ctx.fillStyle = 'rgba(80,75,110,0.35)';
  for (const [dx, dy, rr] of [[-0.3, -0.1, 0.22], [0.25, 0.3, 0.16], [0.2, -0.35, 0.1]]) { circlePath(ctx, x + dx * R, y + dy * R, rr * R); ctx.fill(); }
  circlePath(ctx, x, y, R); bgStroke(ctx, 1.5, SINK);
}

// Vertical lattice girder with modules — distant station structure at the screen sides.
function truss(ctx, x, w, y0, y1, r, side) {
  const c = 'rgba(120,140,200,0.32)', cd = 'rgba(70,85,140,0.5)';
  ctx.fillStyle = cd; ctx.fillRect(x - w / 2, y0, 5, y1 - y0); ctx.fillRect(x + w / 2 - 5, y0, 5, y1 - y0);
  ctx.strokeStyle = c; ctx.lineWidth = 3;
  const step = w * 1.1;
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y);
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y + step);
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x - w / 2, y + step);
    ctx.stroke();
  }
  // modules hung on the truss every so often
  for (let y = y1 - 260 - r() * 200; y > y0; y -= 380 + r() * 260) {
    const kind = r();
    const mx = x - side * (w / 2 + 40);
    if (kind < 0.45) {
      // habitat cylinder with lit windows
      ctx.fillStyle = 'rgba(70,82,130,0.8)'; ctx.fillRect(Math.min(x, mx), y - 6, Math.abs(x - mx), 12);
      rrc(ctx, mx, y, 88, 150, 30); ctx.fillStyle = 'rgba(70,82,130,0.72)'; ctx.fill(); bgStroke(ctx, 2, SINK);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(mx - 30, y - 64, 12, 128);
      for (let k = -2; k <= 2; k++) {
        rrc(ctx, mx, y + k * 26, 30, 12, 5); ctx.fillStyle = r() < 0.75 ? 'rgba(255,214,120,0.75)' : 'rgba(120,200,255,0.6)'; ctx.fill();
      }
    } else if (kind < 0.75) {
      // solar wings
      ctx.fillStyle = 'rgba(70,82,130,0.6)'; ctx.fillRect(Math.min(x, mx - side * 120), y - 4, Math.abs(x - (mx - side * 120)), 8);
      for (const dy of [-34, 34]) {
        ctx.save(); ctx.translate(mx - side * 40, y + dy);
        rrc(ctx, 0, 0, 150, 40, 3); ctx.fillStyle = 'rgba(60,90,190,0.6)'; ctx.fill(); bgStroke(ctx, 1.5, SINK);
        ctx.strokeStyle = 'rgba(150,190,255,0.3)'; ctx.lineWidth = 1.5;
        for (let k = -60; k <= 60; k += 20) { ctx.beginPath(); ctx.moveTo(k, -20); ctx.lineTo(k, 20); ctx.stroke(); }
        ctx.restore();
      }
    } else {
      // round porthole hub with a blinking beacon
      circlePath(ctx, mx, y, 56); ctx.fillStyle = 'rgba(70,82,130,0.72)'; ctx.fill(); bgStroke(ctx, 2, SINK);
      circlePath(ctx, mx, y, 30); ctx.fillStyle = 'rgba(20,30,70,0.8)'; ctx.fill();
      circlePath(ctx, mx - 8, y - 8, 14); ctx.fillStyle = 'rgba(140,220,255,0.28)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(mx, y - 56); ctx.lineTo(mx, y - 96); bgStroke(ctx, 3, 'rgba(120,140,200,0.4)');
      circlePath(ctx, mx, y - 98, 9); ctx.fillStyle = 'rgba(255,90,110,0.35)'; ctx.fill();
      circlePath(ctx, mx, y - 98, 4); ctx.fillStyle = 'rgba(255,120,130,0.9)'; ctx.fill();
    }
  }
  // running lights along the girder
  for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
    circlePath(ctx, x + w / 2 - 2, y, 2.4); ctx.fillStyle = 'rgba(120,255,200,0.55)'; ctx.fill();
  }
}

function tinySatellite(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(70,110,210,0.6)'; ctx.fillRect(-44, -6, 30, 12); ctx.fillRect(14, -6, 30, 12);
  ctx.fillStyle = 'rgba(220,180,90,0.7)'; rrc(ctx, 0, 0, 22, 22, 3); ctx.fill(); bgStroke(ctx, 1.5, SINK);
  ctx.fillStyle = 'rgba(160,170,190,0.6)'; ctx.fillRect(-14, -1, 28, 2);
  ctx.restore();
}

function comet(ctx, x, y, a, len) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 0, -len, 0);
  g.addColorStop(0, 'rgba(180,240,255,0.55)'); g.addColorStop(1, 'rgba(180,240,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-len, -1); ctx.lineTo(-len, 1); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
  circlePath(ctx, 0, 0, 5); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  ctx.restore();
}

function galaxy(ctx, x, y, s, r) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s * 0.55); ctx.rotate(r() * TAU);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 160; i++) {
    const k = i / 160, arm = i % 2 ? 0 : Math.PI;
    const a = arm + k * 5, rr = 6 + k * 70;
    circlePath(ctx, Math.cos(a) * rr + (r() - 0.5) * 8, Math.sin(a) * rr + (r() - 0.5) * 8, 1.5 + r() * 1.5);
    ctx.fillStyle = `rgba(${200 + Math.floor(r() * 55)},${170 + Math.floor(r() * 60)},255,${0.35 * (1 - k) + 0.1})`; ctx.fill();
  }
  ctx.fillStyle = rgrad(ctx, 0, 0, 0, 26, [[0, 'rgba(255,240,220,0.6)'], [1, 'rgba(255,240,220,0)']]);
  ctx.fillRect(-26, -26, 52, 52);
  ctx.restore();
}

function astroDog(ctx, x, y, a) {
  // a little floating hot dog astronaut (soft, decorative)
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(-40, 6); ctx.quadraticCurveTo(0, -8, 40, 6);
  ctx.lineCap = 'round'; ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(40,30,60,0.35)'; ctx.stroke();
  ctx.lineWidth = 18; ctx.strokeStyle = '#d9735a'; ctx.stroke();
  // helmet bubble
  circlePath(ctx, 30, 0, 20); ctx.fillStyle = 'rgba(180,230,255,0.25)'; ctx.fill(); bgStroke(ctx, 2.5, 'rgba(220,240,255,0.6)');
  circlePath(ctx, 24, -7, 5); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  circlePath(ctx, 33, -1, 2.2); ctx.fillStyle = 'rgba(40,20,20,0.8)'; ctx.fill();
  circlePath(ctx, 40, 1, 2.2); ctx.fill();
  // tether
  ctx.beginPath(); ctx.moveTo(-40, 6); ctx.bezierCurveTo(-80, 30, -60, 70, -110, 80); bgStroke(ctx, 2, 'rgba(200,210,255,0.35)');
  ctx.restore();
}

export function drawSpaceBG(ctx, L, box, W) {
  const r = rng(L.seed || 1);
  const H = L.h;
  // ---- deep space base
  ctx.fillStyle = vgrad(ctx, box.y0, H, [[0, '#0a0b24'], [0.6, '#141a46'], [1, '#1d1f52']]);
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, H - box.y0 + 2);
  // ---- nebula clouds
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const NC = ['#7a3cff', '#ff4fa8', '#2fd0ff', '#5b4bff'];
  for (let y = H - 200; y > box.y0 - 300; y -= 520 + r() * 200) {
    const x = box.x0 + r() * (box.x1 - box.x0);
    const c = NC[Math.floor(r() * NC.length)];
    nebula(ctx, x, y, 320 + r() * 260, c, 0.16 + r() * 0.08);
    nebula(ctx, x + (r() - 0.5) * 300, y + (r() - 0.5) * 200, 200 + r() * 160, NC[Math.floor(r() * NC.length)], 0.12);
    nebula(ctx, x + (r() - 0.5) * 200, y + (r() - 0.5) * 120, 90 + r() * 60, '#ffffff', 0.05);
  }
  ctx.restore();
  starfield(ctx, box, H, r);
  // ---- big ringed planet + moon near the bottom of the view
  const left = r() < 0.5;
  ctx.save(); ctx.globalAlpha = 0.88;
  ringedPlanet(ctx, left ? 30 : W - 30, H - 600, 120, '#f2a978', '#7a3c74', '#f2d6b6');
  ctx.restore();
  moon(ctx, left ? W - 120 : 140, H - 860, 34);
  // ---- decor spread up the column
  const items = ['sat', 'comet', 'galaxy', 'dog', 'planetoid', 'sat', 'comet'];
  let k = Math.floor(r() * items.length);
  let side = r() < 0.5 ? -1 : 1;
  for (let y = H - 1050; y > box.y0 + 60; y -= 300 + r() * 120) {
    const kind = items[k++ % items.length];
    side = -side;
    const x = W / 2 + side * (100 + r() * 220);
    if (kind === 'sat') tinySatellite(ctx, x, y, r() * TAU);
    else if (kind === 'comet') comet(ctx, x, y, 0.4 + r() * 0.5, 160 + r() * 120);
    else if (kind === 'galaxy') galaxy(ctx, x, y, 1 + r() * 0.6, r);
    else if (kind === 'dog') astroDog(ctx, x, y, (r() - 0.5) * 0.8);
    else if (kind === 'planetoid') {
      const cols = [['#7fe0c0', '#2a5a7a'], ['#ff8fb8', '#6a2a6a'], ['#9fb8ff', '#3a3a8a']][Math.floor(r() * 3)];
      circlePath(ctx, x, y, 30 + r() * 26);
      ctx.fillStyle = rgrad(ctx, x - 12, y - 12, 2, 60, [[0, cols[0]], [1, cols[1]]]); ctx.fill(); bgStroke(ctx, 1.5, SINK);
    }
  }
  // ---- station trusses at both sides (outside the play column)
  truss(ctx, -110, 46, box.y0, H + 40, r, -1);
  truss(ctx, W + 110, 46, box.y0, H + 40, r, 1);
  // ---- bottom band: the void with a faint warning energy field
  const D = box.y1 - H;
  ctx.fillStyle = vgrad(ctx, H, box.y1, [[0, '#1a0f33'], [0.35, '#0a0618'], [1, '#020205']]);
  ctx.fillRect(box.x0, H, box.x1 - box.x0, D + 2);
  // hex grid of the energy field fading downward
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x0, H, box.x1 - box.x0, Math.min(D, 220)); ctx.clip();
  const hs = 26;
  for (let row = 0, y = H + 8; y < H + 220; y += hs * 0.87, row++) {
    const a = 0.16 * (1 - (y - H) / 220);
    ctx.strokeStyle = `rgba(255,70,140,${a})`; ctx.lineWidth = 1.5;
    for (let x = box.x0 + (row % 2) * hs * 0.75; x < box.x1; x += hs * 1.5) {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const ang = i * TAU / 6; const px = x + Math.cos(ang) * hs * 0.5, py = y + Math.sin(ang) * hs * 0.5; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
    }
  }
  ctx.restore();
  // glowing barrier edge at L.h
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = vgrad(ctx, H - 70, H, [[0, 'rgba(255,60,130,0)'], [1, 'rgba(255,60,130,0.28)']]);
  ctx.fillRect(box.x0, H - 70, box.x1 - box.x0, 70);
  ctx.fillStyle = vgrad(ctx, H, H + 120, [[0, 'rgba(255,60,130,0.35)'], [1, 'rgba(255,60,130,0)']]);
  ctx.fillRect(box.x0, H, box.x1 - box.x0, 120);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(box.x0, H);
  for (let x = box.x0; x <= box.x1; x += 16) ctx.lineTo(x, H + Math.sin(x * 0.05) * 1.5 + (r() - 0.5) * 2);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,140,190,0.85)'; ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
  // faint hazard striping just under the barrier
  ctx.fillStyle = 'rgba(255,90,150,0.18)';
  for (let x = Math.floor(box.x0 / 28) * 28; x < box.x1; x += 28) {
    ctx.beginPath(); ctx.moveTo(x, H + 8); ctx.lineTo(x + 12, H + 8); ctx.lineTo(x + 4, H + 20); ctx.lineTo(x - 8, H + 20); ctx.closePath(); ctx.fill();
  }
  // sparks drifting in the field + distant stars sinking into the dark
  for (let i = 0; i < 60; i++) {
    const x = box.x0 + r() * (box.x1 - box.x0), y = H + 6 + r() * D * 0.9;
    const a = 0.6 * (1 - (y - H) / D);
    circlePath(ctx, x, y, 0.8 + r() * 1.6); ctx.fillStyle = r() < 0.4 ? `rgba(255,140,200,${a})` : `rgba(200,210,255,${a * 0.7})`; ctx.fill();
  }
}

// Supermarket props: store shelving, shopping cart, checkout conveyor, soup-can pyramid, produce crate,
// cash register, chest freezer, milk carton, deli slicer, lobster tank.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, vgrad, hgrad, rgrad, toonBox, toonCircle, rod, gloss, rng, text,
} from '../common.js';
import { woodGrain } from './shared.js';

const RED = '#e8483f', BLUE = '#3f86d8', YEL = '#f7c53b', GRN = '#4fb56a', ORA = '#f39236', PUR = '#8f63c9', PINK = '#ef7fae', TEAL = '#2db2a6';
const STEEL = '#dfe5ea', STEEL_D = '#8d98a2';
const PRODUCT_COLS = [RED, BLUE, YEL, GRN, ORA, PUR, PINK, TEAL, '#ffffff'];

function sparkle(ctx, x, y, s, a = 0.95) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25); ctx.closePath();
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
}

const chrome = (ctx, x0, x1) => hgrad(ctx, x0, x1, [[0, '#8f99a2'], [0.28, '#f4f7f9'], [0.55, '#bcc6cd'], [0.8, '#eef2f5'], [1, '#7f8890']]);

// ---------- grocery products (drawn bottom-centred at (x, by)) ----------
function drawProduct(ctx, kind, x, by, w, h, col, r) {
  const lw = 2.5;
  const top = by - h;
  if (kind === 'box') {
    rrPath(ctx, x - w / 2, top, w, h, 2); ctx.fillStyle = col; ctx.fill();
    ctx.save(); rrPath(ctx, x - w / 2, top, w, h, 2); ctx.clip();
    ctx.fillStyle = rgba(darken(col, 0.5), 0.25); ctx.fillRect(x + w * 0.2, top, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - w / 2, top + h * 0.22, w, h * 0.16);
    circlePath(ctx, x - w * 0.05, top + h * 0.62, Math.min(w, h) * 0.2); ctx.fillStyle = r() < 0.5 ? YEL : '#fff4d6'; ctx.fill();
    ctx.restore();
    rrPath(ctx, x - w / 2, top, w, h, 2); strokeOnly(ctx, lw);
  } else if (kind === 'can') {
    rrPath(ctx, x - w / 2, top, w, h, 3); ctx.fillStyle = chrome(ctx, x - w / 2, x + w / 2); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, top + 4, w, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x - w / 2, top + h * 0.5, w, h * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - w * 0.3, top + 4, w * 0.12, h - 8);
    rrPath(ctx, x - w / 2, top, w, h, 3); strokeOnly(ctx, lw);
  } else if (kind === 'bottle') {
    const nh = h * 0.32, bw = w, nw = w * 0.38;
    ctx.beginPath();
    ctx.moveTo(x - nw / 2, top + 5); ctx.lineTo(x - nw / 2, top + nh * 0.6);
    ctx.quadraticCurveTo(x - bw / 2, top + nh * 0.75, x - bw / 2, top + nh + 6);
    ctx.lineTo(x - bw / 2, by - 3); ctx.quadraticCurveTo(x - bw / 2, by, x - bw / 2 + 3, by);
    ctx.lineTo(x + bw / 2 - 3, by); ctx.quadraticCurveTo(x + bw / 2, by, x + bw / 2, by - 3);
    ctx.lineTo(x + bw / 2, top + nh + 6); ctx.quadraticCurveTo(x + bw / 2, top + nh * 0.75, x + nw / 2, top + nh * 0.6);
    ctx.lineTo(x + nw / 2, top + 5); ctx.closePath();
    ctx.fillStyle = mix(col, '#ffffff', 0.2); ctx.fill(); strokeOnly(ctx, lw);
    rrc(ctx, x, by - h * 0.32, bw - 2, h * 0.26, 2); ctx.fillStyle = '#fff6e2'; ctx.fill();
    gloss(ctx, x - bw / 2 + 3, top + nh + 4, 3, h * 0.35, 0.5);
    rrc(ctx, x, top + 3, nw + 3, 7, 2); fillStroke(ctx, darken(col, 0.3), 2);
  } else if (kind === 'jar') {
    rrPath(ctx, x - w / 2, top + 6, w, h - 6, 6); ctx.fillStyle = col; ctx.fill(); strokeOnly(ctx, lw);
    rrc(ctx, x, by - h * 0.4, w - 4, h * 0.34, 2); ctx.fillStyle = '#fff6e2'; ctx.fill();
    gloss(ctx, x - w / 2 + 3, top + 10, 3, h * 0.4, 0.5);
    rrc(ctx, x, top + 4, w + 2, 9, 2); fillStroke(ctx, r() < 0.5 ? RED : '#e8c35a', 2);
  } else if (kind === 'bag') {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top + 4);
    for (let k = 0; k <= 4; k++) ctx.lineTo(x - w / 2 + k * w / 4, top + (k % 2 ? 0 : 5));
    ctx.quadraticCurveTo(x + w / 2 + 3, by - h / 2, x + w / 2, by); ctx.lineTo(x - w / 2, by);
    ctx.quadraticCurveTo(x - w / 2 - 3, by - h / 2, x - w / 2, top + 4);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); strokeOnly(ctx, lw);
    circlePath(ctx, x, by - h * 0.45, w * 0.26); ctx.fillStyle = '#ffe48a'; ctx.fill();
    gloss(ctx, x - w / 2 + 4, top + 9, 3, h * 0.5, 0.45);
  }
}

// ---------- soup can for the pyramid ----------
const SOUP = [
  { lab: RED, band: '#ffffff', txt: '#ffffff', word: 'SOUP' },
  { lab: GRN, band: '#fff3c4', txt: '#ffffff', word: 'PEAS' },
  { lab: BLUE, band: YEL, txt: '#ffffff', word: 'BEANS' },
  { lab: ORA, band: '#ffffff', txt: '#ffffff', word: 'CORN' },
];
function soupCan(ctx, cx, by, w, h, s, back = false) {
  const top = by - h;
  rrPath(ctx, cx - w / 2, top, w, h, 4);
  ctx.fillStyle = chrome(ctx, cx - w / 2, cx + w / 2); ctx.fill();
  ctx.save(); rrPath(ctx, cx - w / 2, top, w, h, 4); ctx.clip();
  ctx.fillStyle = s.lab; ctx.fillRect(cx - w / 2, top + 6, w, h * 0.42);
  ctx.fillStyle = s.band; ctx.fillRect(cx - w / 2, top + 6 + h * 0.42, w, h - 12 - h * 0.42);
  ctx.fillStyle = '#ffd24a'; circlePath(ctx, cx, top + 6 + h * 0.42 + 6, 4.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx - w * 0.32, top + 6, w * 0.1, h - 12);
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(cx + w * 0.22, top, w, h);
  if (back) { ctx.fillStyle = 'rgba(40,20,10,0.18)'; ctx.fillRect(cx - w / 2, top, w, h); }
  ctx.restore();
  // rims
  ctx.strokeStyle = rgba(INK, 0.4); ctx.lineWidth = 1.6;
  for (const yy of [top + 5, by - 5]) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + 1, yy); ctx.lineTo(cx + w / 2 - 1, yy); ctx.stroke(); }
  text(ctx, s.word, cx, top + 6 + h * 0.21, s.word.length > 4 ? 8.5 : 10, s.txt, { stroke: 2.5 });
  rrPath(ctx, cx - w / 2, top, w, h, 4); strokeOnly(ctx, 3);
}

// ---------- shopping cart geometry ----------
// Walls are 10-wide boxes tilted ±0.12 rad around (±82, -20), height 90.
const CW_TOP = 64.7, CW_BOT = 24.7, CW_XT = 87.4, CW_XB = 76.6;
function cartMesh(ctx, alpha, lw, inset) {
  // trapezoid basket outline (inner)
  const pts = [[-CW_XT + inset, -CW_TOP + 3], [CW_XT - inset, -CW_TOP + 3], [CW_XB - inset, 19], [-CW_XB + inset, 19]];
  ctx.save(); polyPath(ctx, pts); ctx.clip();
  ctx.lineCap = 'round';
  const lines = [];
  for (let x = -72; x <= 72; x += 18) lines.push([x, -66, x * 0.9, 20]);
  for (let y = -44; y <= 14; y += 20) lines.push([-95, y, 95, y]);
  ctx.strokeStyle = rgba(INK, alpha); ctx.lineWidth = lw + 2.2;
  for (const [a, b, c, d] of lines) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  ctx.strokeStyle = `rgba(232,238,242,${Math.min(1, alpha + 0.25)})`; ctx.lineWidth = lw;
  for (const [a, b, c, d] of lines) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  ctx.restore();
}

export const MARKET_ART = {
  // ======================= gondola shelving unit (support, stretch) =======================
  storeshelf: {
    draw(ctx, o) {
      const w = o.w || 300, h = o.h || 260;
      const x0 = -w / 2, y0 = -h / 2;
      const r = rng((Math.round(w) * 31 + Math.round(h) * 7 + (o.v || 0) * 101) | 0);
      // back panel (pegboard)
      rrPath(ctx, x0 + 4, y0 + 10, w - 8, h - 20, 3); ctx.fillStyle = '#e9eeea'; ctx.fill();
      ctx.save(); rrPath(ctx, x0 + 4, y0 + 10, w - 8, h - 20, 3); ctx.clip();
      ctx.fillStyle = 'rgba(120,140,135,0.22)';
      for (let yy = y0 + 22; yy < h / 2; yy += 14) for (let xx = x0 + 18 + ((yy / 14) % 2) * 7; xx < w / 2 - 12; xx += 14) { circlePath(ctx, xx, yy, 1.6); ctx.fill(); }
      ctx.fillStyle = vgrad(ctx, y0, h / 2, [[0, 'rgba(40,30,20,0.18)'], [0.25, 'rgba(40,30,20,0)']]);
      ctx.fillRect(x0, y0, w, h);
      // shelves + products
      const iTop = y0 + 16, iBot = h / 2 - 16;
      const n = Math.max(1, Math.round((iBot - iTop) / 84));
      const gh = (iBot - iTop) / n;
      const kinds = ['box', 'can', 'bottle', 'jar', 'bag', 'box', 'can'];
      for (let i = 0; i < n; i++) {
        const sy = iTop + gh * (i + 1) - (i < n - 1 ? 5 : 0);
        const maxH = gh - 14;
        let x = x0 + 16;
        // a shadow line at the back of each shelf
        ctx.fillStyle = 'rgba(40,30,20,0.12)'; ctx.fillRect(x0, sy - 10, w, 10);
        while (x < w / 2 - 22) {
          const kind = kinds[Math.floor(r() * kinds.length)];
          const col = PRODUCT_COLS[Math.floor(r() * PRODUCT_COLS.length)];
          let pw, ph;
          if (kind === 'box') { pw = 26 + r() * 10; ph = maxH * (0.75 + r() * 0.25); }
          else if (kind === 'can') { pw = 18 + r() * 4; ph = Math.min(maxH, 26 + r() * 6); }
          else if (kind === 'bottle') { pw = 18 + r() * 4; ph = maxH * (0.8 + r() * 0.2); }
          else if (kind === 'jar') { pw = 22 + r() * 4; ph = Math.min(maxH, 30 + r() * 8); }
          else { pw = 26 + r() * 6; ph = maxH * (0.6 + r() * 0.2); }
          if (x + pw > w / 2 - 14) break;
          // facings: repeat the same product 1-3 times
          const reps = 1 + Math.floor(r() * 3);
          for (let k = 0; k < reps && x + pw <= w / 2 - 14; k++) {
            drawProduct(ctx, kind, x + pw / 2, sy, pw, ph, col, r);
            x += pw + 2;
          }
          x += 3;
        }
        if (i < n - 1) {
          // shelf board with price strip
          rrc(ctx, 0, sy + 2, w - 16, 7, 2); ctx.fillStyle = '#c9d1d7'; ctx.fill(); strokeOnly(ctx, 2.5);
          rrc(ctx, 0, sy + 8, w - 16, 7, 2); ctx.fillStyle = '#fff3b0'; ctx.fill(); strokeOnly(ctx, 2.5);
          for (let px = x0 + 30; px < w / 2 - 30; px += 52 + r() * 20) {
            rrc(ctx, px, sy + 8, 18, 6, 1); ctx.fillStyle = r() < 0.3 ? RED : '#ffffff'; ctx.fill();
          }
        }
      }
      ctx.restore();
      rrPath(ctx, x0 + 4, y0 + 10, w - 8, h - 20, 3); strokeOnly(ctx, 3);
      // uprights
      for (const s of [-1, 1]) {
        const ux = s * (w / 2 - 6);
        toonBox(ctx, ux, 0, 12, h, 3, STEEL_D);
        ctx.fillStyle = rgba('#2b3036', 0.55);
        for (let yy = y0 + 26; yy < h / 2 - 22; yy += 12) { rrc(ctx, ux, yy, 3, 6, 1.5); ctx.fill(); }
      }
      // kick plate
      toonBox(ctx, 0, h / 2 - 8, w, 16, 3, '#5e6871');
      ctx.fillStyle = rgba(RED, 0.9); ctx.fillRect(x0 + 14, h / 2 - 10, w - 28, 3);
      // top cap (landing surface)
      toonBox(ctx, 0, y0 + 8, w, 16, 3, RED);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let px = x0 + 20; px < w / 2 - 20; px += 34) { rrc(ctx, px, y0 + 9, 14, 4, 2); ctx.fill(); }
    },
  },

  // ======================= shopping cart (mover) =======================
  cart: {
    draw(ctx, o, t) {
      const spin = t * 7;
      // handle (push bar) at the back-left
      for (const dy of [0, 7]) rod(ctx, -86, -60 + dy, -104, -70 + dy, 4, '#c3ccd3');
      rrc(ctx, -106, -66, 14, 20, 6); fillStroke(ctx, RED, 3.5);
      gloss(ctx, -110, -73, 3, 12, 0.5);
      // undercarriage
      rod(ctx, -64, 46, 64, 46, 4, '#c3ccd3');
      for (const s of [-1, 1]) {
        rod(ctx, s * 60, 30, s * 60, 56, 6, '#aeb8c0');
        rrc(ctx, s * 60, 56, 16, 8, 3); fillStroke(ctx, '#5b636b', 3);
        const wx = s * 60, wy = 64;
        circlePath(ctx, wx, wy, 9); fillStroke(ctx, '#2f3338', 3.5);
        circlePath(ctx, wx, wy, 4.5); ctx.fillStyle = '#c7cfd6'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(wx + Math.cos(spin) * 3.5, wy + Math.sin(spin) * 3.5); ctx.lineTo(wx - Math.cos(spin) * 3.5, wy - Math.sin(spin) * 3.5);
        ctx.lineWidth = 2; ctx.strokeStyle = '#5b636b'; ctx.stroke();
      }
      // back mesh (far side of the basket)
      polyPath(ctx, [[-CW_XT, -CW_TOP], [CW_XT, -CW_TOP], [CW_XB, 20], [-CW_XB, 20]]);
      ctx.fillStyle = 'rgba(160,175,185,0.18)'; ctx.fill();
      ctx.save(); ctx.translate(6, -5); cartMesh(ctx, 0.16, 1.5, 4); ctx.restore();
      // back rim
      rod(ctx, -CW_XT + 6, -CW_TOP - 2, CW_XT - 2, -CW_TOP - 2, 3, '#b7c1c9');
    },
    front(ctx, o, t) {
      // front mesh
      cartMesh(ctx, 0.38, 2, 5);
      // floor bar
      rrc(ctx, 0, 25, 170, 12, 5); ctx.fillStyle = chrome(ctx, -85, 85); ctx.fill(); strokeOnly(ctx);
      // side walls
      for (const s of [-1, 1]) rod(ctx, s * CW_XB, CW_BOT, s * CW_XT, -CW_TOP, 6, '#d5dde3');
      // top rim with red plastic trim
      rod(ctx, -CW_XT, -CW_TOP, CW_XT, -CW_TOP, 7, RED);
      gloss(ctx, -70, -CW_TOP - 2.5, 120, 2, 0.45);
      // badge plate
      rrc(ctx, -48, -36, 30, 18, 4); fillStroke(ctx, RED, 3);
      text(ctx, '★', -48, -35, 13, '#fff6c8');
      // corner joints
      for (const s of [-1, 1]) { circlePath(ctx, s * CW_XT, -CW_TOP, 4.5); fillStroke(ctx, '#f2f5f7', 2.5); }
    },
  },

  // ======================= checkout conveyor belt (plat, stretch) =======================
  conveyor: {
    draw(ctx, o, t) {
      const w = o.w || 300;
      const sp = o.speed || 160;
      const R = 20;
      // little feet
      for (const s of [-1, 1]) { rrc(ctx, s * (w / 2 - 36), 23, 14, 8, 3); fillStroke(ctx, '#4b525a', 3); }
      // belt loop (dark rubber)
      rrc(ctx, 0, 0, w, 40, 18); ctx.fillStyle = '#34313a'; ctx.fill();
      ctx.save(); rrc(ctx, 0, 0, w, 40, 18); ctx.clip();
      // ribs on the top run (move with the surface) and bottom run (move opposite)
      const gap = 16;
      const off = ((sp * t) % gap + gap) % gap;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      for (let x = -w / 2 - gap + off; x < w / 2 + gap; x += gap) { ctx.moveTo(x, -19); ctx.lineTo(x - 3, -13); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      for (let x = -w / 2 - gap - off + gap; x < w / 2 + gap; x += gap) { ctx.moveTo(x, 13); ctx.lineTo(x + 3, 19); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(-w / 2, -19, w, 2);
      ctx.restore();
      rrc(ctx, 0, 0, w, 40, 18); strokeOnly(ctx);
      // rollers at the ends
      const ra = sp * t / 14;
      for (const s of [-1, 1]) {
        const cx = s * (w / 2 - R);
        circlePath(ctx, cx, 0, 12); ctx.fillStyle = chrome(ctx, cx - 12, cx + 12); ctx.fill(); strokeOnly(ctx, 3);
        ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(INK, 0.55);
        for (let k = 0; k < 3; k++) {
          const q = ra + k * Math.PI * 2 / 3;
          ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx + Math.cos(q) * 9, Math.sin(q) * 9); ctx.stroke();
        }
        circlePath(ctx, cx, 0, 3.2); fillStroke(ctx, '#ffffff', 2);
      }
      // side frame panel with direction chevrons
      const pw = w - 2 * R - 22;
      if (pw > 20) {
        rrc(ctx, 0, 0, pw, 20, 6); ctx.fillStyle = chrome(ctx, -pw / 2, pw / 2); ctx.fill(); strokeOnly(ctx, 3);
        ctx.save(); rrc(ctx, 0, 0, pw - 6, 14, 4); ctx.clip();
        ctx.fillStyle = RED; ctx.fillRect(-pw / 2, -7, pw, 14);
        const d = sp >= 0 ? 1 : -1, cg = 22;
        const coff = (((t * Math.abs(sp) * 0.35) % cg) + cg) % cg * d;
        ctx.beginPath();
        for (let x = -pw / 2 - cg * 2 + coff; x < pw / 2 + cg * 2; x += cg) {
          ctx.moveTo(x - 4 * d, -5); ctx.lineTo(x + 3 * d, 0); ctx.lineTo(x - 4 * d, 5);
        }
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff3c4'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
        rrc(ctx, 0, 0, pw - 6, 14, 4); strokeOnly(ctx, 2);
      }
    },
  },

  // ======================= soup-can pyramid =======================
  cans: {
    draw(ctx, o) {
      const v = Math.abs(o.v || 0);
      const pick = (i) => SOUP[(i + v) % SOUP.length];
      const W = 36, H = 40;
      // bottom row
      [-54, -18, 18, 54].forEach((x, i) => soupCan(ctx, x, 60, W, H, pick(i % 2 ? 0 : 1)));
      // middle row
      [-47.25, -15.75, 15.75, 47.25].forEach((x, i) => soupCan(ctx, x, 20, 31.5, H, pick(i % 2 ? 2 : 3)));
      // top row (landing surface)
      [-36, 0, 36].forEach((x, i) => soupCan(ctx, x, -20, W, H, pick(i === 1 ? 3 : 1)));
      for (const x of [-36, 0, 36]) {
        ellipsePath(ctx, x, -59, 15, 2.6); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      }
      // sale card
      ctx.save(); ctx.translate(-30, 50); ctx.rotate(-0.08);
      rrc(ctx, 0, 0, 46, 20, 3); fillStroke(ctx, YEL, 3);
      text(ctx, '3 FOR $1', 0, 1, 9.5, RED);
      ctx.restore();
    },
  },

  // ======================= produce crate =======================
  crate: {
    draw(ctx, o) {
      const v = Math.abs(o.v || 0);
      const fruit = [['#f39236', 'ORANGES'], ['#e8483f', 'APPLES'], ['#f7d23b', 'LEMONS'], ['#8fcf4a', 'LIMES']][v % 4];
      const wood = '#d9a35e';
      // dark interior
      rrc(ctx, 0, 0, 150, 100, 4); fillStroke(ctx, '#5a3a22');
      // fruit peeking through the gaps
      ctx.save(); rrc(ctx, 0, 0, 146, 96, 4); ctx.clip();
      for (let i = 0; i < 9; i++) {
        const fx = -62 + i * 15.5, fy = (i % 2) ? -14 : -18;
        toonCircle(ctx, fx, fy, 11, fruit[0], { lw: 2.5 });
        toonCircle(ctx, fx + 7, fy + 32, 11, fruit[0], { lw: 2.5 });
      }
      ctx.restore();
      // slats
      const slat = (y, hh) => {
        toonBox(ctx, 0, y, 146, hh, 3, wood, { lw: 3 });
        woodGrain(ctx, -71, y - hh / 2 + 2, 142, hh - 4, wood, Math.round(y + 50));
      };
      slat(-40, 18);
      slat(2, 20);
      slat(40, 18);
      // corner posts
      for (const s of [-1, 1]) {
        toonBox(ctx, s * 66, 0, 18, 100, 3, darken(wood, 0.12), { lw: 3.5 });
        for (const ny of [-40, 2, 40]) { circlePath(ctx, s * 66, ny, 2.2); ctx.fillStyle = '#6f6a66'; ctx.fill(); }
      }
      // label
      rrc(ctx, 0, 2, 70, 18, 2); fillStroke(ctx, '#fff6e0', 2.5);
      toonCircle(ctx, -26, 2, 6, fruit[0], { lw: 2 });
      ctx.beginPath(); ctx.moveTo(-26, -4); ctx.quadraticCurveTo(-22, -9, -18, -7); ctx.lineWidth = 2; ctx.strokeStyle = '#4fa34a'; ctx.stroke();
      text(ctx, fruit[1], 7, 3, 10.5, '#7a4a2a');
      rrc(ctx, 0, 0, 150, 100, 4); strokeOnly(ctx);
    },
  },

  // ======================= cash register =======================
  register: {
    draw(ctx, o, t) {
      const body = '#f2ece0', acc = TEAL;
      // receipt curling out of the display
      ctx.beginPath(); ctx.moveTo(44, -54); ctx.quadraticCurveTo(44, -70, 56, -74); ctx.lineTo(64, -66); ctx.quadraticCurveTo(54, -64, 56, -54); ctx.closePath();
      fillStroke(ctx, '#ffffff', 2.5);
      ctx.strokeStyle = rgba(INK, 0.3); ctx.lineWidth = 1.2;
      for (const k of [0, 1]) { ctx.beginPath(); ctx.moveTo(47 + k * 2, -60 - k * 5); ctx.lineTo(55 + k * 2, -62 - k * 5); ctx.stroke(); }
      // display tower
      toonBox(ctx, 30, -35, 70, 40, 6, acc);
      rrc(ctx, 30, -36, 56, 24, 4); fillStroke(ctx, '#1d2b24', 3);
      ctx.save(); rrc(ctx, 30, -36, 56, 24, 4); ctx.clip();
      ctx.fillStyle = 'rgba(120,255,160,0.12)'; ctx.fillRect(0, -48, 60, 24);
      ctx.restore();
      text(ctx, '$3.99', 30, -35, 15, '#86ffaa', { font: '"Lilita One", monospace' });
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(6, -24); ctx.lineTo(16, -48); ctx.lineTo(22, -48); ctx.lineTo(12, -24); ctx.fill();
      // base body
      toonBox(ctx, 0, 20, 150, 70, 7, body);
      // keypad panel
      rrc(ctx, -32, 4, 74, 30, 5); fillStroke(ctx, '#d8d0c0', 3);
      const keyCols = ['#ffffff', '#ffffff', '#ffffff', YEL, '#ffffff', '#ffffff', '#ffffff', RED, '#ffffff', '#ffffff', '#ffffff', GRN];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
        const kx = -57 + c * 10, ky = -3 + r * 12;
        const kc = c === 5 ? (r ? GRN : RED) : '#ffffff';
        rrc(ctx, kx + 5, ky + 2, 8, 8, 2); ctx.fillStyle = darken(kc, 0.3); ctx.fill();
        rrc(ctx, kx + 5, ky, 8, 8, 2); fillStroke(ctx, kc, 1.8);
      }
      // card reader / brand
      rrc(ctx, 40, 4, 44, 30, 5); fillStroke(ctx, acc, 3);
      text(ctx, 'THANK', 40, -1, 9, '#ffffff');
      text(ctx, 'YOU!', 40, 10, 11, '#fff3b0');
      // cash drawer
      rrc(ctx, 0, 42, 136, 20, 4); fillStroke(ctx, '#e3dacb', 3);
      rod(ctx, -18, 42, 18, 42, 4, '#9aa5ae');
      circlePath(ctx, 54, 42, 4); fillStroke(ctx, YEL, 2);
      // status light
      const blink = (t % 1.6) < 0.8;
      circlePath(ctx, 58, -51, 3); ctx.fillStyle = blink ? '#7dff9a' : '#2c6a3a'; ctx.fill();
      // landing-side highlight
      gloss(ctx, -68, -12, 56, 3, 0.5);
    },
  },

  // ======================= chest freezer (icy, slippery top) =======================
  freezer: {
    draw(ctx) {
      // body
      toonBox(ctx, 0, 6, 260, 138, 10, '#e9f3f8');
      // glass window showing frozen goodies
      rrc(ctx, 0, -6, 228, 70, 8); fillStroke(ctx, '#2e5e86', 3.5);
      ctx.save(); rrc(ctx, 0, -6, 228, 70, 8); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -40, 30, [[0, '#4f8fbf'], [1, '#2a5378']]); ctx.fillRect(-114, -41, 228, 70);
      const goods = [[-92, PINK], [-64, '#ffffff'], [-36, YEL], [-8, '#8fd1ff'], [20, PINK], [48, GRN], [76, '#ffffff'], [100, ORA]];
      for (const [gx, gc] of goods) {
        rrc(ctx, gx, 14, 24, 26, 4); fillStroke(ctx, gc, 2.5);
        rrc(ctx, gx, 4, 26, 6, 2); fillStroke(ctx, darken(gc, 0.15), 2);
        circlePath(ctx, gx, 17, 5); ctx.fillStyle = rgba(RED, 0.6); ctx.fill();
      }
      // popsicles
      for (const [px, pc] of [[-80, RED], [-50, ORA], [34, PUR], [62, TEAL]]) {
        rrc(ctx, px, -13, 3, 14, 1.5); ctx.fillStyle = '#e3c08a'; ctx.fill();
        rrc(ctx, px, -26, 14, 20, 6); fillStroke(ctx, pc, 2.2);
      }
      // frost
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const [fx, fy, fr] of [[-114, -41, 26], [114, -41, 22], [-114, 29, 18], [114, 29, 26]]) { circlePath(ctx, fx, fy, fr); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(-70, -41); ctx.lineTo(-40, -41); ctx.lineTo(-90, 29); ctx.lineTo(-120, 29); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-22, -41); ctx.lineTo(-12, -41); ctx.lineTo(-62, 29); ctx.lineTo(-72, 29); ctx.fill();
      ctx.restore();
      rrc(ctx, 0, -6, 228, 70, 8); strokeOnly(ctx, 3.5);
      // lower panel: sign + vents
      rrc(ctx, -60, 50, 104, 22, 5); fillStroke(ctx, '#3f86d8', 3);
      text(ctx, '❄ FROZEN', -60, 51, 13, '#ffffff');
      ctx.strokeStyle = rgba(INK, 0.35); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(30 + k * 14, 44); ctx.lineTo(30 + k * 14, 58); ctx.stroke(); }
      ctx.fillStyle = rgba(INK, 0.25); ctx.fillRect(-124, 66, 248, 6);
      // icy lid (slippery landing surface)
      rrPath(ctx, -130, -75, 260, 22, 10); ctx.fillStyle = '#bfe8fb'; ctx.fill();
      ctx.save(); rrPath(ctx, -130, -75, 260, 22, 10); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-130, -75, 260, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = -5; k <= 5; k++) { ctx.beginPath(); ctx.moveTo(k * 26, -69); ctx.lineTo(k * 26 + 12, -69); ctx.lineTo(k * 26 + 2, -53); ctx.lineTo(k * 26 - 10, -53); ctx.fill(); }
      ctx.restore();
      rrPath(ctx, -130, -75, 260, 22, 10); strokeOnly(ctx);
      // icicles dripping over the front
      ctx.beginPath();
      ctx.moveTo(-120, -55);
      const drips = [[-108, 8], [-96, 4], [-70, 12], [-52, 5], [-20, 9], [8, 4], [36, 13], [62, 6], [90, 10], [110, 5]];
      let px = -120;
      for (const [dx, dl] of drips) {
        ctx.lineTo(dx - 5, -55); ctx.quadraticCurveTo(dx - 3, -55 + dl, dx, -53 + dl); ctx.quadraticCurveTo(dx + 3, -55 + dl, dx + 5, -55); px = dx + 5;
      }
      ctx.lineTo(120, -55); ctx.lineTo(120, -58); ctx.lineTo(-120, -58); ctx.closePath();
      ctx.fillStyle = '#f4fcff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(70,130,170,0.6)'; ctx.stroke();
      // sparkles = slippery
      sparkle(ctx, -88, -66, 7); sparkle(ctx, -20, -68, 5); sparkle(ctx, 52, -66, 7); sparkle(ctx, 104, -68, 4.5);
      sparkle(ctx, -40, -10, 5, 0.7); sparkle(ctx, 80, 6, 4, 0.6);
    },
  },

  // ======================= milk carton =======================
  milk: {
    draw(ctx, o) {
      const v = Math.abs(o.v || 0);
      const [band, word, accent] = [[BLUE, 'MILK', '#9fd2ff'], ['#8a5a3a', 'CHOCO', '#d9a77a'], [PINK, 'BERRY', '#ffc4dc'], [ORA, 'O.J.', '#ffd08a']][v % 4];
      // top fin
      rrc(ctx, 0, -72, 8, 8, 1.5); fillStroke(ctx, '#f4f2ee', 3);
      // gable roof
      polyPath(ctx, [[-35, -50], [0, -70], [35, -50]]); fillStroke(ctx, '#ffffff');
      ctx.save(); polyPath(ctx, [[-35, -50], [0, -70], [35, -50]]); ctx.clip();
      ctx.fillStyle = rgba(band, 0.85); ctx.beginPath(); ctx.moveTo(-35, -50); ctx.lineTo(0, -70); ctx.lineTo(0, -60); ctx.lineTo(-20, -50); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(35, -50); ctx.lineTo(0, -50); ctx.fill();
      ctx.restore();
      polyPath(ctx, [[-35, -50], [0, -70], [35, -50]]); strokeOnly(ctx);
      // body
      toonBox(ctx, 0, 10, 70, 120, 4, '#ffffff', { shade: 0.12 });
      ctx.save(); rrc(ctx, 0, 10, 70, 120, 4); ctx.clip();
      // cow spots
      ctx.fillStyle = '#2f2a2b';
      for (const [sx, sy, rx, ry] of [[-26, -40, 10, 7], [22, -34, 8, 6], [-6, -28, 5, 4], [30, 52, 9, 7]]) { ellipsePath(ctx, sx, sy, rx, ry, 0.3); ctx.fill(); }
      // label band
      ctx.fillStyle = band; ctx.fillRect(-35, -18, 70, 34);
      ctx.fillStyle = accent; ctx.fillRect(-35, 16, 70, 5);
      // grass + bottom wave
      ctx.fillStyle = vgrad(ctx, 40, 70, [[0, rgba(band, 0.25)], [1, rgba(band, 0.55)]]); ctx.fillRect(-35, 40, 70, 30);
      ctx.restore();
      rrc(ctx, 0, 10, 70, 120, 4); strokeOnly(ctx);
      text(ctx, word, 0, -1, word.length > 4 ? 15 : 19, '#ffffff', { stroke: 4.5 });
      // cow face
      ctx.save(); ctx.translate(-2, 36);
      for (const s of [-1, 1]) { ellipsePath(ctx, s * 13, -6, 6, 3.5, s * 0.4); fillStroke(ctx, '#ffffff', 2.2); }
      ellipsePath(ctx, 0, 0, 12, 13); fillStroke(ctx, '#ffffff', 2.5);
      ellipsePath(ctx, 0, 7, 10, 6); fillStroke(ctx, '#f6b7b9', 2.2);
      for (const s of [-1, 1]) {
        circlePath(ctx, s * 3.5, 7, 1.4); ctx.fillStyle = INK; ctx.fill();
        circlePath(ctx, s * 5, -3, 1.8); ctx.fill();
      }
      ctx.restore();
      gloss(ctx, -30, -46, 4, 100, 0.4);
    },
  },

  // ======================= deli slicer (hazard) =======================
  slicer: {
    draw(ctx, o, t) {
      const a = t * 16;
      const bx = -10, by = -20, R = 44;
      // support column behind the blade
      rrc(ctx, bx + 4, -2, 30, 30, 6); fillStroke(ctx, '#c9d1d7', 3.5);
      // base
      toonBox(ctx, 0, 35, 160, 60, 9, '#f1ece2');
      ctx.save(); rrc(ctx, 0, 35, 160, 60, 9); ctx.clip();
      ctx.fillStyle = RED; ctx.fillRect(-80, 44, 160, 10);
      ctx.restore();
      rrc(ctx, 0, 35, 160, 60, 9); strokeOnly(ctx);
      // carriage tray with a salami log
      rrc(ctx, 50, 24, 50, 14, 4); fillStroke(ctx, '#d7dde3', 3);
      rrc(ctx, 50, 16, 40, 12, 6); fillStroke(ctx, '#c4473f', 3);
      for (const [sx, sy] of [[40, 14], [50, 18], [60, 14], [46, 20]]) { circlePath(ctx, sx, sy, 1.6); ctx.fillStyle = '#f7d8c8'; ctx.fill(); }
      ellipsePath(ctx, 30, 16, 4, 6); fillStroke(ctx, '#f09a8f', 2.5);
      // knob + power light
      toonCircle(ctx, 62, 49, 6, '#3a3d42', { lw: 2.5 });
      const led = (t % 0.8) < 0.4;
      circlePath(ctx, 40, 49, 3.2); ctx.fillStyle = led ? '#ff5146' : '#8a2a26'; ctx.fill(); strokeOnly(ctx, 1.6);
      text(ctx, 'DELI', -40, 49, 12, '#ffffff', { stroke: 3 });
      // feet
      for (const s of [-1, 1]) { rrc(ctx, s * 58, 66, 22, 6, 3); fillStroke(ctx, '#3a3d42', 2.5); }
      // ---- the spinning blade (hazard) ----
      // motion streaks
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        const q = a * 0.5 + k * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(bx, by, R + 6, q, q + 0.7); ctx.stroke();
      }
      ctx.restore();
      // serrated outline
      const teeth = 26;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const q0 = a + i / teeth * Math.PI * 2, q1 = a + (i + 0.62) / teeth * Math.PI * 2;
        ctx.lineTo(bx + Math.cos(q0) * (R - 3), by + Math.sin(q0) * (R - 3));
        ctx.lineTo(bx + Math.cos(q1) * (R + 2), by + Math.sin(q1) * (R + 2));
      }
      ctx.closePath();
      ctx.fillStyle = '#eef3f6'; ctx.fill(); strokeOnly(ctx, 3);
      // disc face
      circlePath(ctx, bx, by, R - 7);
      ctx.fillStyle = rgrad(ctx, bx - 12, by - 14, 4, R, [[0, '#ffffff'], [0.5, '#c8d1d8'], [1, '#8d98a2']]); ctx.fill();
      strokeOnly(ctx, 2.5, rgba(INK, 0.6));
      // sharp edge ring
      ctx.beginPath(); ctx.arc(bx, by, R - 4, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      // rotating lightening holes
      for (let k = 0; k < 4; k++) {
        const q = a + k * Math.PI / 2;
        circlePath(ctx, bx + Math.cos(q) * 22, by + Math.sin(q) * 22, 5); fillStroke(ctx, '#7b858e', 2.2);
      }
      // static glints
      ctx.save(); circlePath(ctx, bx, by, R - 7); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(bx - 40, by - 4); ctx.lineTo(bx - 4, by - 40); ctx.lineTo(bx + 6, by - 32); ctx.lineTo(bx - 32, by + 6); ctx.fill();
      ctx.restore();
      // hub
      toonCircle(ctx, bx, by, 10, RED, { lw: 3 });
      circlePath(ctx, bx, by, 3); ctx.fillStyle = '#fff'; ctx.fill();
      sparkle(ctx, bx - 30, by - 34, 8); sparkle(ctx, bx + 38, by + 2, 6);
    },
  },

  // ======================= lobster tank (water hazard) =======================
  fishtank: {
    draw(ctx, o, t) {
      // back glass + water
      ctx.fillStyle = 'rgba(210,240,250,0.35)'; ctx.fillRect(-90, -70, 180, 30);
      ctx.fillStyle = vgrad(ctx, -40, 60, [[0, '#6fd0ef'], [1, '#2a86bf']]);
      ctx.beginPath(); ctx.moveTo(-90, 60); ctx.lineTo(-90, -40);
      for (let x = -90; x <= 90; x += 10) ctx.lineTo(x, -40 + Math.sin(x * 0.09 + t * 3) * 2.2);
      ctx.lineTo(90, 60); ctx.closePath(); ctx.fill();
      // light caustics
      ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const x = -70 + k * 36 + Math.sin(t * 0.8 + k) * 6;
        ctx.beginPath(); ctx.moveTo(x, -36); ctx.lineTo(x - 18, 40); ctx.stroke();
      }
      ctx.restore();
      // seaweed
      for (const [sx, h, c] of [[-72, 54, '#3aa86a'], [-62, 40, '#58c77f'], [70, 60, '#3aa86a'], [80, 42, '#58c77f']]) {
        ctx.beginPath(); ctx.moveTo(sx, 52);
        for (let k = 1; k <= 4; k++) ctx.lineTo(sx + Math.sin(t * 2 + k + sx) * 5 * k / 4, 52 - h * k / 4);
        ctx.lineWidth = 9; ctx.strokeStyle = rgba(INK, 0.5); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.lineWidth = 6; ctx.strokeStyle = c; ctx.stroke();
      }
      // gravel
      ctx.fillStyle = '#e9d7b0'; ctx.fillRect(-90, 46, 180, 14);
      const gcol = ['#f3a6b8', '#ffffff', '#9fd2ff', '#f7d26a'];
      for (let g = 0; g < 4; g++) {
        ctx.beginPath();
        for (let i = g; i < 26; i += 4) { const gx = -86 + i * 6.9, gy = 48 + (i % 3) * 3; ctx.moveTo(gx + 3.2, gy); ctx.arc(gx, gy, 3.2, 0, Math.PI * 2); }
        ctx.fillStyle = gcol[g]; ctx.fill();
      }
      // lobster
      const wav = Math.sin(t * 3);
      ctx.save(); ctx.translate(4, 30);
      const LC = '#ff4a3a';
      // antennae
      ctx.beginPath(); ctx.moveTo(14, -10); ctx.quadraticCurveTo(30, -40, 50 + wav * 4, -46);
      ctx.moveTo(10, -10); ctx.quadraticCurveTo(18, -44, 30 + wav * 5, -58);
      ctx.lineWidth = 2.2; ctx.strokeStyle = darken(LC, 0.3); ctx.stroke();
      // legs
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-6 + k * 9, 4); ctx.lineTo(-10 + k * 9, 16); strokeOnly(ctx, 2.5, darken(LC, 0.3)); }
      // tail segments
      for (let k = 0; k < 4; k++) { ellipsePath(ctx, -20 - k * 10, 4 + k * 2, 8 - k, 7 - k * 0.6); fillStroke(ctx, k % 2 ? LC : lighten(LC, 0.1), 2.5); }
      polyPath(ctx, [[-56, 8], [-66, 0], [-66, 18]]); fillStroke(ctx, LC, 2.5);
      // body
      ellipsePath(ctx, 4, 0, 18, 11); fillStroke(ctx, LC, 3);
      // claws (raised, snapping)
      const snap = Math.max(0, Math.sin(t * 4)) * 0.35;
      for (const [cx, cy, s] of [[26, -16, 1], [12, -24, 0.85]]) {
        ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(cx - 6, cy + 6); strokeOnly(ctx, 6, INK);
        ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(cx - 6, cy + 6); strokeOnly(ctx, 3, LC);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.rotate(-0.6);
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); fillStroke(ctx, LC, 3);
        ctx.save(); ctx.rotate(-snap);
        ctx.beginPath(); ctx.moveTo(4, -2); ctx.quadraticCurveTo(14, -10, 18, -4); ctx.quadraticCurveTo(12, -3, 6, 1); ctx.closePath(); fillStroke(ctx, LC, 2.5);
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(4, 2); ctx.quadraticCurveTo(14, 8, 18, 2); ctx.quadraticCurveTo(12, 1, 6, 0); ctx.closePath(); fillStroke(ctx, LC, 2.5);
        // rubber band
        ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(2, 6); ctx.lineWidth = 2.5; ctx.strokeStyle = YEL; ctx.stroke();
        ctx.restore();
      }
      // eyes
      for (const ex of [14, 20]) {
        ctx.beginPath(); ctx.moveTo(ex - 2, -8); ctx.lineTo(ex, -15); strokeOnly(ctx, 2, darken(LC, 0.3));
        circlePath(ctx, ex, -16, 3); fillStroke(ctx, '#ffffff', 1.5);
        circlePath(ctx, ex + 0.8, -16, 1.4); ctx.fillStyle = INK; ctx.fill();
      }
      ctx.restore();
      // bubbles from the air stone
      rrc(ctx, -40, 50, 14, 6, 3); ctx.fillStyle = '#7b858e'; ctx.fill();
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.6 + i / 5) % 1;
        const bxx = -40 + Math.sin(ph * 12 + i) * 4, byy = 46 - ph * 84;
        circlePath(ctx, bxx, byy, 2.5 + ph * 2.5); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      }
      // back frame rim
      ctx.fillStyle = rgba('#2b3036', 0.5); ctx.fillRect(-90, -70, 180, 3);
    },
    front(ctx, o, t) {
      // water tint over whatever falls in
      ctx.beginPath(); ctx.moveTo(-90, 60); ctx.lineTo(-90, -40);
      for (let x = -90; x <= 90; x += 10) ctx.lineTo(x, -40 + Math.sin(x * 0.09 + t * 3) * 2.2);
      ctx.lineTo(90, 60); ctx.closePath();
      ctx.fillStyle = 'rgba(70,170,225,0.28)'; ctx.fill();
      // surface line
      ctx.beginPath();
      for (let x = -90; x <= 90; x += 10) ctx.lineTo(x, -40 + Math.sin(x * 0.09 + t * 3) * 2.2);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      // glass sheen
      ctx.fillStyle = 'rgba(220,245,255,0.12)'; ctx.fillRect(-90, -70, 180, 130);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.moveTo(-70, -66); ctx.lineTo(-52, -66); ctx.lineTo(-84, 56); ctx.lineTo(-90, 56); ctx.lineTo(-90, 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-40, -66); ctx.lineTo(-34, -66); ctx.lineTo(-64, 56); ctx.lineTo(-70, 56); ctx.fill();
      // frame posts + base
      for (const s of [-1, 1]) {
        toonBox(ctx, s * 95, 0, 10, 140, 3, '#3a4048');
        rrc(ctx, s * 95, -69, 14, 6, 2); fillStroke(ctx, '#c9d1d7', 2.5);
      }
      toonBox(ctx, 0, 65, 200, 10, 3, '#3a4048');
      // "LIVE LOBSTER" sticker
      ctx.save(); ctx.translate(-52, -54); ctx.rotate(-0.05);
      rrc(ctx, 0, 0, 58, 22, 4); fillStroke(ctx, RED, 3);
      text(ctx, 'LIVE', 0, -4, 9, '#fff3c4');
      text(ctx, 'LOBSTER', 0, 5, 8.5, '#ffffff');
      ctx.restore();
    },
  },
};

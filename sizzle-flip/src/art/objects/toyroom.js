// Toy room props: wooden blocks, toy train, teddy, drum, xylophone, jack-in-the-box,
// balloon gondola, pinwheel, toy chest, rocking horse.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, vgrad, hgrad, rgrad, toonBox, toonCircle, rod, gloss, text,
} from '../common.js';
import { woodGrain } from './shared.js';
import { motionAt } from '../../physics.js';

const RED = '#ee5a4f', BLUE = '#3f8fe0', YEL = '#f7c53b', GRN = '#5cbf6a', PUR = '#9a6ad6', PINK = '#f27fb2', ORA = '#f5953a', TEAL = '#2fb8b0';
const TOY = [RED, BLUE, GRN, YEL, PUR, ORA, PINK, TEAL];
const WOODL = '#f0cf98';

// ---------- little helpers ----------
function roundPoly(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  const a = pts[n - 1], b = pts[0];
  ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n];
    ctx.arcTo(p1[0], p1[1], p2[0], p2[1], r);
  }
  ctx.closePath();
}

// Scalloped "plush" circle outline.
function fuzzPath(ctx, x, y, r, n = 22, amp = 1.6, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = rot + i / n * Math.PI * 2, a1 = rot + (i + 0.5) / n * Math.PI * 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    const a2 = rot + (i + 1) / n * Math.PI * 2;
    ctx.quadraticCurveTo(x + Math.cos(a1) * (r + amp * 2), y + Math.sin(a1) * (r + amp * 2), x + Math.cos(a2) * r, y + Math.sin(a2) * r);
  }
  ctx.closePath();
}

function star(ctx, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r : R, a = rot + i * Math.PI / n;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function sparkle(ctx, x, y, s, a = 0.95) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25); ctx.closePath();
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
}

function stitches(ctx, path, color = rgba(INK, 0.45), lw = 1.8) {
  ctx.save(); ctx.setLineDash([4, 4]); path(); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke(); ctx.restore();
}

function toyWheel(ctx, x, y, r, a, col, hub = YEL) {
  circlePath(ctx, x, y, r); fillStroke(ctx, col, 3.5);
  circlePath(ctx, x, y, r * 0.66); ctx.fillStyle = lighten(col, 0.18); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.16); ctx.strokeStyle = darken(col, 0.35); ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const q = a + k * Math.PI * 2 / 3;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(q) * r * 0.25, y + Math.sin(q) * r * 0.25); ctx.lineTo(x + Math.cos(q) * r * 0.66, y + Math.sin(q) * r * 0.66); ctx.stroke();
  }
  circlePath(ctx, x, y, r * 0.3); fillStroke(ctx, hub, 2.5);
  // tyre glint
  ctx.beginPath(); ctx.arc(x, y, r * 0.82, -2.6, -1.9); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
}

// ---------- clown for the jack-in-the-box ----------
function clownHead(ctx, x, y, t) {
  // ruff collar
  const ruffCols = [RED, YEL, BLUE, GRN];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * 0.05 + i / 9 * Math.PI * 0.9;
    ellipsePath(ctx, x + Math.cos(a) * 18, y + 14 + Math.sin(a) * 7, 9, 6, a);
    fillStroke(ctx, ruffCols[i % 4], 2.5);
  }
  // hair tufts
  for (const s of [-1, 1]) {
    for (const [dx, dy, r] of [[19, -6, 8], [24, 3, 7], [17, 8, 6]]) { circlePath(ctx, x + s * dx, y + dy, r); fillStroke(ctx, ORA, 2.5); }
  }
  // face
  circlePath(ctx, x, y, 19); fillStroke(ctx, '#fff3e6', 3.5);
  // hat
  polyPath(ctx, [[x - 15, y - 13], [x + 15, y - 13], [x + 4, y - 44]]); fillStroke(ctx, PUR, 3);
  ctx.save(); polyPath(ctx, [[x - 15, y - 13], [x + 15, y - 13], [x + 4, y - 44]]); ctx.clip();
  ctx.fillStyle = YEL; for (let k = 0; k < 3; k++) { circlePath(ctx, x - 4 + k * 5, y - 20 - k * 8, 3); ctx.fill(); }
  ctx.restore();
  circlePath(ctx, x + 4, y - 45, 5.5); fillStroke(ctx, YEL, 2.5);
  // eyes (diamond paint + eyes)
  for (const s of [-1, 1]) {
    polyPath(ctx, [[x + s * 7, y - 12], [x + s * 10, y - 6], [x + s * 7, y], [x + s * 4, y - 6]]); ctx.fillStyle = rgba(BLUE, 0.7); ctx.fill();
    ellipsePath(ctx, x + s * 7, y - 6, 2.4, 3.4); ctx.fillStyle = INK; ctx.fill();
  }
  // cheeks
  for (const s of [-1, 1]) { circlePath(ctx, x + s * 12, y + 4, 3.6); ctx.fillStyle = 'rgba(255,110,120,0.45)'; ctx.fill(); }
  // big grin
  ctx.beginPath(); ctx.moveTo(x - 10, y + 4); ctx.quadraticCurveTo(x, y + 18, x + 10, y + 4); ctx.quadraticCurveTo(x, y + 9, x - 10, y + 4);
  fillStroke(ctx, '#d8343c', 2.5);
  // nose
  toonCircle(ctx, x, y + 1, 5.5, RED, { lw: 2.5 });
}

// ---------- palettes ----------
const TRAIN = [[RED, BLUE, YEL], [GRN, RED, YEL], [BLUE, YEL, RED], [PUR, TEAL, YEL]];
const TEDDY = ['#c8894f', '#e3ac62', '#e99aa9', '#b79a7e'];
const DRUM = [[RED, BLUE], [BLUE, YEL], [GRN, RED], [PUR, YEL]];
const BALLOON = [[RED, YEL], [BLUE, '#ffffff'], [PUR, PINK], [GRN, YEL], [ORA, '#ffffff']];
const CHEST = [[BLUE, YEL, RED], [RED, GRN, YEL], [GRN, ORA, BLUE], [PUR, PINK, YEL]];
const HORSE = [
  { coat: '#f6ead6', dap: 'rgba(170,150,130,0.25)', mane: '#f29a3a', saddle: RED, cloth: BLUE, rocker: '#d65b3a' },
  { coat: '#d39a5e', dap: 'rgba(255,240,220,0.35)', mane: '#5a3a2a', saddle: BLUE, cloth: YEL, rocker: '#5aa7d6' },
  { coat: '#fafafa', dap: 'rgba(120,140,170,0.25)', mane: '#f27fb2', saddle: PUR, cloth: TEAL, rocker: '#f2b134' },
];

export const TOYROOM_ART = {
  // ======================= wooden ABC block =======================
  block: {
    draw(ctx, o) {
      const v = Math.abs(o.v || 0);
      const col = TOY[(v * 3) % TOY.length];
      const glyph = 'ABCDEFGHJKMN123'[(v * 7) % 15];
      toonBox(ctx, 0, 0, 74, 74, 7, WOODL);
      woodGrain(ctx, -33, -33, 66, 66, WOODL, v + 3);
      // carved groove border
      rrc(ctx, 0, 0, 62, 62, 5); strokeOnly(ctx, 2, rgba(darken(WOODL, 0.5), 0.35));
      // raised painted panel
      rrc(ctx, 0, 1, 52, 52, 7); ctx.fillStyle = col; ctx.fill();
      ctx.save(); rrc(ctx, 0, 1, 52, 52, 7); ctx.clip();
      ctx.fillStyle = rgba(lighten(col, 0.65), 0.5); ctx.fillRect(-26, -25, 52, 6);
      ctx.fillStyle = rgba(darken(col, 0.5), 0.28); ctx.fillRect(-26, 13, 52, 16);
      ctx.restore();
      rrc(ctx, 0, 1, 52, 52, 7); strokeOnly(ctx, 3);
      text(ctx, glyph, 0, 5, 40, '#ffffff', { stroke: 7 });
      // corner chamfer ticks
      ctx.strokeStyle = rgba(darken(WOODL, 0.5), 0.4); ctx.lineWidth = 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath(); ctx.moveTo(sx * 31, sy * 31); ctx.lineTo(sx * 35, sy * 35); ctx.stroke();
      }
    },
  },

  // ======================= toy train (mover) =======================
  toytrain: {
    draw(ctx, o, t) {
      const [cBoil, cCab, cTrim] = TRAIN[Math.abs(o.v || 0) % TRAIN.length];
      const spin = t * 6;
      // smoke puffs drifting back
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.7 + i / 3) % 1;
        const sx = 80 - ph * 64, sy = -52 - ph * 40, sr = 6 + ph * 11;
        circlePath(ctx, sx, sy, sr);
        ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - ph)})`; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(58,34,22,${0.22 * (1 - ph)})`; ctx.stroke();
      }
      // chimney (short funnel at the very front)
      polyPath(ctx, [[74, -22], [75, -36], [70, -44], [92, -44], [87, -36], [88, -22]]); fillStroke(ctx, '#3b3542', 3.5);
      rrc(ctx, 81, -45, 26, 7, 3); fillStroke(ctx, cTrim, 3);
      // cow catcher
      polyPath(ctx, [[86, 14], [108, 42], [84, 42]]); fillStroke(ctx, cTrim, 3.5);
      ctx.strokeStyle = rgba(INK, 0.5); ctx.lineWidth = 2;
      for (const k of [0.35, 0.65]) { ctx.beginPath(); ctx.moveTo(86, 14 + 28 * k); ctx.lineTo(86 + 22 * k, 14 + 28 * k); ctx.stroke(); }
      // chassis
      rrc(ctx, 10, 24, 170, 22, 8); fillStroke(ctx, '#3b3542');
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-70, 16, 160, 3);
      // boiler
      rrPath(ctx, -44, -25, 139, 44, 12); ctx.fillStyle = cBoil; ctx.fill();
      ctx.save(); rrPath(ctx, -44, -25, 139, 44, 12); ctx.clip();
      ctx.fillStyle = rgba(darken(cBoil, 0.55), 0.28); ctx.fillRect(-44, 4, 140, 20);
      ctx.fillStyle = rgba(lighten(cBoil, 0.7), 0.4); rrPath(ctx, -40, -21, 128, 7, 3.5); ctx.fill();
      // smokebox front
      ctx.fillStyle = '#4a4352'; ctx.fillRect(82, -26, 14, 46);
      // gold bands
      for (const bx of [-6, 44]) {
        ctx.fillStyle = cTrim; ctx.fillRect(bx - 4, -26, 8, 46);
        ctx.strokeStyle = rgba(INK, 0.5); ctx.lineWidth = 2; ctx.strokeRect(bx - 4, -27, 8, 48);
      }
      ctx.restore();
      rrPath(ctx, -44, -25, 139, 44, 12); strokeOnly(ctx);
      ctx.beginPath(); ctx.moveTo(82, -24); ctx.lineTo(82, 18); strokeOnly(ctx, 2.5);
      // rivets on smokebox
      for (const ry of [-14, -2, 10]) { circlePath(ctx, 89, ry, 1.8); ctx.fillStyle = rgba('#ffffff', 0.5); ctx.fill(); }
      // star sticker on boiler side
      star(ctx, 19, -4, 12, 5.5, 5); fillStroke(ctx, '#fff6d8', 2.5);
      // headlamp
      ctx.beginPath(); ctx.arc(96, -8, 6, -Math.PI / 2, Math.PI / 2); ctx.closePath(); fillStroke(ctx, '#fff1a8', 2.5);
      // cab
      rrPath(ctx, -77, -55, 38, 72, 5); ctx.fillStyle = cCab; ctx.fill();
      ctx.save(); rrPath(ctx, -77, -55, 38, 72, 5); ctx.clip();
      ctx.fillStyle = rgba(darken(cCab, 0.55), 0.28); ctx.fillRect(-80, -2, 44, 30);
      ctx.restore();
      rrPath(ctx, -77, -55, 38, 72, 5); strokeOnly(ctx);
      // roof
      rrc(ctx, -58, -54, 46, 9, 4); fillStroke(ctx, darken(cCab, 0.3), 3.5);
      gloss(ctx, -76, -57, 30, 3, 0.35);
      // window
      rrc(ctx, -58, -33, 22, 18, 5); fillStroke(ctx, '#bfe8ff', 3);
      ctx.save(); rrc(ctx, -58, -33, 22, 18, 5); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(-66, -24); ctx.lineTo(-58, -42); ctx.lineTo(-53, -42); ctx.lineTo(-61, -24); ctx.fill();
      ctx.restore();
      // number badge
      toonCircle(ctx, -58, 2, 9, cTrim, { lw: 3, spec: false });
      text(ctx, '1', -58, 3, 13, '#fff', { stroke: 3 });
      // little piston cylinder
      rrc(ctx, 26, 27, 18, 12, 3); fillStroke(ctx, '#c9cfd6', 3);
      // wheels
      toyWheel(ctx, -48, 30, 15, spin, RED);
      toyWheel(ctx, -10, 30, 15, spin, RED);
      toyWheel(ctx, 44, 34, 11, spin * 1.36, RED);
      toyWheel(ctx, 70, 34, 11, spin * 1.36, RED);
      // coupling rod
      const px = Math.cos(spin) * 8, py = Math.sin(spin) * 8;
      rod(ctx, -48 + px, 30 + py, -10 + px, 30 + py, 3.5, '#d7dde3');
      rod(ctx, -10 + px, 30 + py, 26, 27, 3, '#d7dde3');
      for (const wx of [-48, -10]) { circlePath(ctx, wx + px, 30 + py, 2.6); fillStroke(ctx, '#ffffff', 2); }
      // rear coupler
      rrc(ctx, -80, 24, 10, 7, 2); fillStroke(ctx, '#3b3542', 2.5);
    },
  },

  // ======================= teddy bear (bouncer) =======================
  teddy: {
    draw(ctx, o, t) {
      const fur = TEDDY[Math.abs(o.v || 0) % TEDDY.length];
      const light = lighten(fur, 0.55), dark = darken(fur, 0.3);
      // ears
      for (const s of [-1, 1]) {
        fuzzPath(ctx, s * 27, -67, 13, 10, 1.2); fillStroke(ctx, fur);
        circlePath(ctx, s * 27, -66, 7); ctx.fillStyle = '#f4b2a6'; ctx.fill();
      }
      // body
      fuzzPath(ctx, 0, 30, 49, 26, 1.4); ctx.fillStyle = fur; ctx.fill();
      ctx.save(); fuzzPath(ctx, 0, 30, 49, 26, 1.4); ctx.clip();
      ctx.beginPath(); ctx.arc(0, 30, 54, 0, Math.PI * 2); ctx.arc(-11, 16, 50, 0, Math.PI * 2, true);
      ctx.fillStyle = rgba(darken(fur, 0.5), 0.3); ctx.fill('evenodd');
      // belly
      ellipsePath(ctx, 0, 40, 28, 27); ctx.fillStyle = light; ctx.fill();
      ctx.restore();
      stitches(ctx, () => ellipsePath(ctx, 0, 40, 23, 22));
      // sewn heart patch
      ctx.save(); ctx.translate(12, 46); ctx.rotate(0.15);
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.bezierCurveTo(-12, -1, -7, -11, 0, -4); ctx.bezierCurveTo(7, -11, 12, -1, 0, 7); ctx.closePath();
      fillStroke(ctx, '#ff7f9e', 2.2);
      ctx.restore();
      fuzzPath(ctx, 0, 30, 49, 26, 1.4); strokeOnly(ctx);
      // arms
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * 37, 22); ctx.rotate(s * -0.5);
        ellipsePath(ctx, 0, 0, 12, 21); fillStroke(ctx, fur, 3.5);
        ellipsePath(ctx, 0, 11, 7, 7); ctx.fillStyle = light; ctx.fill();
        ctx.restore();
      }
      // feet
      for (const s of [-1, 1]) {
        ellipsePath(ctx, s * 26, 65, 17, 15); fillStroke(ctx, fur);
        ellipsePath(ctx, s * 28, 67, 10, 9); ctx.fillStyle = light; ctx.fill();
        for (const k of [-1, 0, 1]) { circlePath(ctx, s * 28 + k * 6, 57.5 + Math.abs(k) * 1.5, 2.4); ctx.fillStyle = light; ctx.fill(); }
      }
      // head
      fuzzPath(ctx, 0, -40, 35, 22, 1.3, 0.2); ctx.fillStyle = fur; ctx.fill();
      ctx.save(); fuzzPath(ctx, 0, -40, 35, 22, 1.3, 0.2); ctx.clip();
      ctx.beginPath(); ctx.arc(0, -40, 40, 0, Math.PI * 2); ctx.arc(-8, -50, 36, 0, Math.PI * 2, true);
      ctx.fillStyle = rgba(darken(fur, 0.5), 0.25); ctx.fill('evenodd');
      ctx.restore();
      fuzzPath(ctx, 0, -40, 35, 22, 1.3, 0.2); strokeOnly(ctx);
      stitches(ctx, () => { ctx.beginPath(); ctx.moveTo(0, -74); ctx.lineTo(0, -60); });
      // muzzle
      ellipsePath(ctx, 0, -28, 17, 12.5); fillStroke(ctx, light, 3);
      ellipsePath(ctx, 0, -33, 6.5, 4.5); ctx.fillStyle = INK; ctx.fill();
      ellipsePath(ctx, -2, -34.5, 2.2, 1.2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, -25);
      ctx.moveTo(-6, -24); ctx.quadraticCurveTo(-3, -21, 0, -25); ctx.quadraticCurveTo(3, -21, 6, -24);
      strokeOnly(ctx, 2.2);
      // eyes (blink every few seconds)
      const blink = (t % 4.3) < 0.13;
      for (const s of [-1, 1]) {
        if (blink) { ctx.beginPath(); ctx.moveTo(s * 13 - 4, -47); ctx.quadraticCurveTo(s * 13, -44, s * 13 + 4, -47); strokeOnly(ctx, 2.5); }
        else {
          ellipsePath(ctx, s * 13, -47, 4.4, 5.2); ctx.fillStyle = INK; ctx.fill();
          circlePath(ctx, s * 13 - 1.4, -49, 1.6); ctx.fillStyle = '#fff'; ctx.fill();
        }
        circlePath(ctx, s * 22, -34, 5); ctx.fillStyle = 'rgba(255,120,130,0.35)'; ctx.fill();
      }
      // bow tie
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(s * 10, -17, s * 19, -13); ctx.quadraticCurveTo(s * 22, -6, s * 19, 1); ctx.quadraticCurveTo(s * 10, 3, 0, -7); ctx.closePath();
        fillStroke(ctx, RED, 3);
        circlePath(ctx, s * 13, -8, 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      }
      rrc(ctx, 0, -7, 9, 10, 3); fillStroke(ctx, darken(RED, 0.15), 2.5);
    },
  },

  // ======================= toy drum (bouncer) =======================
  drum: {
    draw(ctx, o, t, st) {
      const [shell, hoop] = DRUM[Math.abs(o.v || 0) % DRUM.length];
      const RX = 65, RY = 6, TOP = -39, BOT = 39, HB = 12;
      const bodyPath = () => {
        ctx.beginPath(); ctx.moveTo(-RX, TOP); ctx.lineTo(-RX, BOT);
        ctx.ellipse(0, BOT, RX, RY, 0, Math.PI, 0, true);
        ctx.lineTo(RX, TOP);
        ctx.ellipse(0, TOP, RX, RY, 0, 0, Math.PI, true);
        ctx.closePath();
      };
      const band = (y0, y1) => {
        ctx.beginPath(); ctx.moveTo(-RX, y0);
        ctx.ellipse(0, y0, RX, RY, 0, Math.PI, 0, true);
        ctx.lineTo(RX, y1);
        ctx.ellipse(0, y1, RX, RY, 0, 0, Math.PI, false);
        ctx.closePath();
      };
      bodyPath(); ctx.fillStyle = shell; ctx.fill();
      ctx.save(); bodyPath(); ctx.clip();
      ctx.fillStyle = hgrad(ctx, -RX, RX, [[0, 'rgba(0,0,0,0.18)'], [0.3, 'rgba(255,255,255,0.18)'], [0.55, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.25)']]);
      ctx.fillRect(-RX, TOP, RX * 2, BOT - TOP + RY);
      ctx.restore();
      // zig-zag cords between the hoops
      const n = 6, yT = TOP + HB, yB = BOT - HB;
      const pt = (k, y, sgn) => { const th = Math.PI - (k / n) * Math.PI; const x = RX * 0.97 * Math.cos(th); return [x, y + RY * Math.sin(th) * sgn]; };
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const [x, y] = k % 2 ? pt(k, yB, 1) : pt(k, yT, 1);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff6dc'; ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const [x, y] = k % 2 ? pt(k, yT, 1) : pt(k, yB, 1);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff6dc'; ctx.stroke();
      // hoops
      band(TOP, TOP + HB); fillStroke(ctx, hoop, 3);
      band(BOT - HB, BOT); fillStroke(ctx, hoop, 3);
      for (const y0 of [TOP, BOT - HB]) {
        ctx.save(); band(y0, y0 + HB); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-RX, y0 + 1, RX * 2, 3);
        ctx.restore();
      }
      // gold tacks on the hoops
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const [x1, y1] = pt(k, TOP + HB / 2, 1), [x2, y2] = pt(k, BOT - HB / 2, 1);
        for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.moveTo(x + 2.6, y); ctx.arc(x, y, 2.6, 0, Math.PI * 2); }
      }
      fillStroke(ctx, '#ffd75a', 1.6);
      // drum skin (top)
      ellipsePath(ctx, 0, TOP, RX, RY); fillStroke(ctx, hoop, 3);
      ellipsePath(ctx, 0, TOP + 0.5, RX - 6, RY - 2.2); ctx.fillStyle = '#fff7e6'; ctx.fill();
      ellipsePath(ctx, -18, TOP - 0.5, 26, 1.4); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      bodyPath(); strokeOnly(ctx);
      // boing! vibration arcs after a bounce
      const hit = st ? st.hit || 0 : 0;
      if (hit > 0.05) {
        ctx.save(); ctx.globalAlpha = Math.min(1, hit * 1.4);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const [dx, r] of [[-30, 12], [0, 16], [30, 12]]) {
          ctx.beginPath(); ctx.arc(dx, TOP - 6, r + (1 - hit) * 10, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
        }
        ctx.restore();
      }
    },
  },

  // ======================= rainbow xylophone =======================
  xylophone: {
    draw(ctx) {
      const cols = [RED, ORA, YEL, GRN, TEAL, BLUE, PUR, PINK];
      // pull-along wheels
      for (const wx of [-80, 80]) toyWheel(ctx, wx, 23, 9, wx * 0.1, BLUE, YEL);
      // frame
      toonBox(ctx, 0, 0, 220, 50, 9, '#e6b77d');
      woodGrain(ctx, -106, -20, 212, 42, '#e6b77d', 11);
      // bars, top-aligned to the landing surface, getting shorter to the right
      const bw = 23, gap = 3, x0 = -(8 * bw + 7 * gap) / 2;
      for (let i = 0; i < 8; i++) {
        const x = x0 + i * (bw + gap), b = 21 - i * 3.2;
        const h = b + 25, col = cols[i];
        rrPath(ctx, x, -25, bw, h, 5); ctx.fillStyle = col; ctx.fill();
        ctx.save(); rrPath(ctx, x, -25, bw, h, 5); ctx.clip();
        ctx.fillStyle = rgba(lighten(col, 0.7), 0.5); ctx.fillRect(x, -23, bw, 5);
        ctx.fillStyle = rgba(darken(col, 0.55), 0.25); ctx.fillRect(x, -25 + h * 0.62, bw, h);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 4, -16, 3, h - 18);
        ctx.restore();
        rrPath(ctx, x, -25, bw, h, 5); strokeOnly(ctx, 3);
        for (const ny of [-17, b - 7]) {
          circlePath(ctx, x + bw / 2, ny, 2.8); fillStroke(ctx, '#e8edf2', 1.6);
        }
      }
      // mallet resting on the frame
      rod(ctx, 18, 16, 84, 12, 4, '#f3d6a6');
      toonCircle(ctx, 92, 11, 7.5, RED, { lw: 3 });
      rrPath(ctx, -110, -25, 220, 50, 9); strokeOnly(ctx);
    },
  },

  // ======================= jack-in-the-box (launcher) =======================
  jackbox: {
    draw(ctx, o, t, st) {
      const pop = st && st.pop ? st.pop : 0;
      const col = [RED, BLUE, GRN, PUR][Math.abs(o.v || 0) % 4];
      const open = Math.min(1, pop * 4);
      const ext = Math.min(1, pop * 2.2);
      const peek = pop > 0 ? 0 : Math.pow(Math.max(0, Math.sin(t * 1.3)), 14);
      // crank on the right side
      const ca = t * 2.4 + pop * 12;
      rod(ctx, 46, 20, 58, 20, 5, '#c9cfd6');
      const kx = 58 + Math.cos(ca) * 3, ky = 20 + Math.sin(ca) * 14;
      rod(ctx, 58, 20, kx, ky, 4, '#c9cfd6');
      toonCircle(ctx, kx + 4, ky, 5.5, YEL, { lw: 3 });
      // box body
      toonBox(ctx, 0, 24, 100, 82, 5, col);
      // decorated panel
      rrc(ctx, 0, 26, 76, 60, 6); fillStroke(ctx, '#fff4dc', 3);
      ctx.save(); rrc(ctx, 0, 26, 76, 60, 6); ctx.clip();
      ctx.fillStyle = rgba(YEL, 0.55);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { circlePath(ctx, -32 + c * 16 + (r % 2) * 8, 2 + r * 16, 3); ctx.fill(); }
      ctx.restore();
      star(ctx, 0, 27, 21, 9.5); fillStroke(ctx, YEL, 3);
      circlePath(ctx, 0, 28, 5); ctx.fillStyle = col; ctx.fill();
      text(ctx, '?', 0, 29, 14, '#fff', { stroke: 3 });
      // corner caps
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath(); ctx.arc(sx * 44, 24 + sy * 35, 5, 0, Math.PI * 2); fillStroke(ctx, '#ffd75a', 2.2);
      }
      // peeking eyes when the lid wiggles
      if (peek > 0.02) {
        for (const s of [-1, 1]) {
          ellipsePath(ctx, 24 + s * 6, -19, 4, 3.4); fillStroke(ctx, '#fff', 1.8);
          circlePath(ctx, 25 + s * 6, -18.5, 1.8); ctx.fillStyle = INK; ctx.fill();
        }
      }
      // spring + clown
      if (ext > 0.01) {
        const SL = 8 + 76 * ext + Math.sin(pop * 34) * 8 * pop;
        const top = -24 - SL, coils = 7;
        ctx.beginPath(); ctx.moveTo(0, -22);
        for (let k = 1; k <= coils * 2; k++) ctx.lineTo((k % 2 ? 1 : -1) * 13, -22 - SL * k / (coils * 2));
        ctx.lineTo(0, top);
        ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.lineWidth = 4.5; ctx.strokeStyle = '#dfe5ea'; ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        const wob = Math.sin(pop * 26) * 0.18 * pop;
        ctx.save(); ctx.translate(0, top - 14); ctx.rotate(wob);
        clownHead(ctx, 0, -6, t);
        ctx.restore();
      }
      // lid (hinged on the left)
      ctx.save(); ctx.translate(-51, -21);
      ctx.rotate(-open * 2.2 - peek * 0.13);
      rrc(ctx, 51, 0, 104, 10, 3); fillStroke(ctx, darken(col, 0.12));
      gloss(ctx, 6, -3, 70, 3, 0.35);
      rrc(ctx, 92, 7, 10, 6, 2); fillStroke(ctx, '#ffd75a', 2.2);
      ctx.restore();
      // hinge
      circlePath(ctx, -51, -21, 3.5); fillStroke(ctx, '#ffd75a', 2);
    },
  },

  // ======================= hot-air balloon gondola (mover) =======================
  gondola: {
    draw(ctx, o, t) {
      const [c1, c2] = BALLOON[Math.abs(o.v || 0) % BALLOON.length];
      const bob = Math.sin(t * 1.6) * 1.5;
      // ropes
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 13, -62 + bob); ctx.lineTo(s * 55, -18);
        ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#e3c08a'; ctx.stroke();
      }
      // burner flame
      const fl = 9 + Math.sin(t * 19) * 2.5 + Math.sin(t * 31) * 1.5;
      ctx.beginPath(); ctx.moveTo(-5, -56 + bob); ctx.quadraticCurveTo(-6, -58 - fl * 0.5 + bob, 0, -58 - fl + bob); ctx.quadraticCurveTo(6, -58 - fl * 0.5 + bob, 5, -56 + bob); ctx.closePath();
      ctx.fillStyle = '#ffb648'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2.5, -56 + bob); ctx.quadraticCurveTo(0, -58 - fl * 0.7 + bob, 2.5, -56 + bob); ctx.closePath(); ctx.fillStyle = '#fff3b0'; ctx.fill();
      rrc(ctx, 0, -55 + bob, 16, 6, 2); fillStroke(ctx, '#5b5560', 2.5);
      // envelope
      ctx.save(); ctx.translate(0, bob);
      const env = () => {
        ctx.beginPath();
        ctx.moveTo(-14, -64);
        ctx.bezierCurveTo(-34, -82, -54, -98, -54, -124);
        ctx.bezierCurveTo(-54, -166, 54, -166, 54, -124);
        ctx.bezierCurveTo(54, -98, 34, -82, 14, -64);
        ctx.closePath();
      };
      env(); ctx.fillStyle = c1; ctx.fill();
      ctx.save(); env(); ctx.clip();
      ctx.fillStyle = c2;
      for (const rx of [40, 14]) {
        ellipsePath(ctx, 0, -110, rx, 70); ctx.fill();
        ellipsePath(ctx, 0, -110, rx * 0.55, 70); ctx.fillStyle = c1; ctx.fill(); ctx.fillStyle = c2;
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(INK, 0.25);
      for (const rx of [40, 22, 14, 7.7]) { ellipsePath(ctx, 0, -110, rx, 70); ctx.stroke(); }
      // shading
      ctx.fillStyle = hgrad(ctx, -54, 54, [[0, 'rgba(255,255,255,0.12)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(40,10,30,0.28)']]);
      ctx.fillRect(-60, -170, 120, 110);
      ctx.restore();
      env(); strokeOnly(ctx);
      ellipsePath(ctx, -30, -136, 7, 15, 0.45); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      // cute face
      for (const s of [-1, 1]) {
        ellipsePath(ctx, s * 11, -112, 3.6, 4.6); ctx.fillStyle = INK; ctx.fill();
        circlePath(ctx, s * 11 - 1.2, -113.6, 1.3); ctx.fillStyle = '#fff'; ctx.fill();
        ellipsePath(ctx, s * 20, -103, 5, 3); ctx.fillStyle = 'rgba(255,110,130,0.55)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -106, 6, 0.2, Math.PI - 0.2); strokeOnly(ctx, 2.6);
      // skirt
      rrc(ctx, 0, -64, 32, 8, 3); fillStroke(ctx, '#d9a462', 3);
      ctx.restore();
      // corner posts
      for (const s of [-1, 1]) {
        rrc(ctx, s * 55, 5, 10, 50, 4); fillStroke(ctx, '#a8703f', 3);
        ctx.strokeStyle = rgba(INK, 0.35); ctx.lineWidth = 1.6;
        for (let y = -14; y < 28; y += 6) { ctx.beginPath(); ctx.moveTo(s * 55 - 4, y); ctx.lineTo(s * 55 + 4, y + 3); ctx.stroke(); }
      }
      // inner back wall (shadowed interior)
      rrc(ctx, 0, 14, 104, 36, 4); fillStroke(ctx, '#8a5a31', 3);
      ctx.save(); rrc(ctx, 0, 14, 104, 36, 4); ctx.clip();
      ctx.strokeStyle = 'rgba(40,20,8,0.35)'; ctx.lineWidth = 2;
      for (let y = 0; y < 34; y += 6) { ctx.beginPath(); ctx.moveTo(-52, y); ctx.lineTo(52, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(30,12,4,0.3)'; ctx.fillRect(-52, -4, 104, 10);
      ctx.restore();
      rrc(ctx, 0, -3, 108, 7, 3.5); fillStroke(ctx, '#7a4a2a', 3);
    },
    front(ctx) {
      // front wicker wall
      const wall = () => rrPath(ctx, -60, 4, 120, 29, 7);
      wall(); ctx.fillStyle = '#d39a55'; ctx.fill();
      ctx.save(); wall(); ctx.clip();
      const all = new Path2D();
      for (const par of [0, 1]) {
        const p = new Path2D();
        for (let r = 0; r < 4; r++) for (let c = -6; c <= 6; c++) {
          if (Math.abs(r + c) % 2 !== par) continue;
          const x = c * 10 + (r % 2) * 5, y = 9 + r * 7;
          p.moveTo(x + 5.6, y); p.ellipse(x, y, 5.6, 3.4, 0, 0, Math.PI * 2);
          all.moveTo(x + 5.6, y); all.ellipse(x, y, 5.6, 3.4, 0, 0, Math.PI * 2);
        }
        ctx.fillStyle = par ? '#e2ad68' : '#c98d4a'; ctx.fill(p);
      }
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(80,40,10,0.35)'; ctx.stroke(all);
      ctx.fillStyle = 'rgba(60,25,5,0.22)'; ctx.fillRect(-60, 22, 120, 12);
      ctx.restore();
      wall(); strokeOnly(ctx);
      // padded rim
      rrc(ctx, 0, 5, 124, 9, 4.5); fillStroke(ctx, '#8b5531', 3.5);
      gloss(ctx, -50, 2.5, 80, 2.2, 0.35);
      // post tops in front of the rim
      for (const s of [-1, 1]) {
        rrc(ctx, s * 55, -8, 10, 26, 4); fillStroke(ctx, '#a8703f', 3);
        circlePath(ctx, s * 55, -18, 3); ctx.fillStyle = '#e3c08a'; ctx.fill();
      }
      // sandbags
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 60, 8); ctx.lineTo(s * 66, 14); strokeOnly(ctx, 2);
        ellipsePath(ctx, s * 67, 21, 6, 8); fillStroke(ctx, '#e8d6ae', 2.5);
        ctx.beginPath(); ctx.moveTo(s * 67 - 3, 14); ctx.lineTo(s * 67 + 3, 14); strokeOnly(ctx, 2);
      }
    },
  },

  // ======================= pinwheel (rotor) =======================
  pinwheel: {
    draw(ctx, o, t) {
      const m = motionAt(o.move, t, {});
      const dir = o.move && o.move.speed < 0 ? -1 : 1;
      // stick stays upright (counter-rotate the spin)
      ctx.save(); ctx.rotate(-m.da);
      rod(ctx, 0, 14, 0, 176, 9, '#e0b071');
      ctx.beginPath(); ctx.moveTo(-1, 40); ctx.quadraticCurveTo(-18, 52, -12, 70); ctx.moveTo(1, 40); ctx.quadraticCurveTo(16, 56, 22, 66);
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.5; ctx.strokeStyle = PINK; ctx.stroke();
      rrc(ctx, 0, 40, 10, 8, 3); fillStroke(ctx, PINK, 2.5);
      ctx.restore();
      const cols = [RED, YEL, BLUE, GRN];
      // motion-blur fans trailing each blade
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(0, 0, 126, a - dir * 0.08, a - dir * 0.6, dir > 0);
        ctx.arc(0, 0, 26, a - dir * 0.6, a - dir * 0.08, dir < 0);
        ctx.closePath();
        ctx.fillStyle = rgba(cols[k], 0.13); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, 118, a - dir * 0.14, a - dir * 0.48, dir > 0);
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
      }
      for (let k = 0; k < 4; k++) {
        const col = cols[k];
        ctx.save(); ctx.rotate(k * Math.PI / 2);
        const arm = () => rrPath(ctx, 8, -10, 122, 20, 9);
        arm(); ctx.fillStyle = col; ctx.fill();
        ctx.save(); arm(); ctx.clip();
        // folded-paper sail: diagonal two-tone
        ctx.beginPath(); ctx.moveTo(8, -10 * dir); ctx.lineTo(132, -10 * dir); ctx.lineTo(132, 11 * dir); ctx.closePath();
        ctx.fillStyle = rgba(lighten(col, 0.6), 0.45); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, 11 * dir); ctx.lineTo(132, 11 * dir); ctx.lineTo(8, -10 * dir); ctx.closePath();
        ctx.fillStyle = rgba(darken(col, 0.45), 0.18); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, -10 * dir); ctx.lineTo(132, 11 * dir); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.3); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const [dx, dy] of [[50, -5], [80, -4], [108, -3], [96, 4]]) { circlePath(ctx, dx, dy * dir, 2.6); ctx.fill(); }
        // curled tip
        ctx.beginPath(); ctx.moveTo(131, 10 * dir); ctx.lineTo(131, -2 * dir); ctx.quadraticCurveTo(121, 2 * dir, 116, 10 * dir); ctx.closePath();
        ctx.fillStyle = lighten(col, 0.5); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.55); ctx.stroke();
        ctx.restore();
        arm(); strokeOnly(ctx);
        ctx.restore();
      }
      // hub flower
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        circlePath(ctx, Math.cos(a) * 13, Math.sin(a) * 13, 8.5); fillStroke(ctx, '#ffffff', 3);
      }
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        circlePath(ctx, Math.cos(a) * 13, Math.sin(a) * 13, 6); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      toonCircle(ctx, 0, 0, 10, PINK, { lw: 3 });
      circlePath(ctx, 0, 0, 3); ctx.fillStyle = '#fff'; ctx.fill();
    },
  },

  // ======================= toy chest =======================
  toybox: {
    draw(ctx, o) {
      const [body, lid, trim] = CHEST[Math.abs(o.v || 0) % CHEST.length];
      // rope handles on the sides
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(s * 90, 2, 9, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5);
        ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = '#e3c08a'; ctx.stroke();
      }
      toonBox(ctx, 0, 12, 180, 96, 6, body);
      // vertical plank lines
      ctx.save(); rrc(ctx, 0, 12, 180, 96, 6); ctx.clip();
      ctx.strokeStyle = rgba(darken(body, 0.5), 0.25); ctx.lineWidth = 2;
      for (const x of [-60, -30, 0, 30, 60]) { ctx.beginPath(); ctx.moveTo(x, -36); ctx.lineTo(x, 60); ctx.stroke(); }
      ctx.restore();
      // trim band with brass studs
      rrc(ctx, 0, 50, 180, 9, 2); fillStroke(ctx, trim, 3);
      for (let k = -3; k <= 3; k++) { circlePath(ctx, k * 26, 50, 2.3); ctx.fillStyle = '#fff3c4'; ctx.fill(); }
      for (const s of [-1, 1]) {
        polyPath(ctx, [[s * 88, -34], [s * 70, -34], [s * 88, -16]]); fillStroke(ctx, '#ffd75a', 2.5);
      }
      // T O Y S
      const L = 'TOYS', lc = [RED, YEL, GRN, BLUE].map(c => c === body ? '#ffffff' : c);
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.translate(-48 + i * 32, 18 + (i % 2 ? 2 : -2)); ctx.rotate((i % 2 ? 1 : -1) * 0.1);
        text(ctx, L[i], 0, 0, 34, lc[i], { stroke: 7 });
        ctx.restore();
      }
      star(ctx, -70, -18, 8, 3.6); fillStroke(ctx, '#fff6d0', 2);
      star(ctx, 72, 26, 7, 3.2); fillStroke(ctx, '#fff6d0', 2);
      // striped sock dangling out under the lid
      ctx.save(); ctx.translate(-64, -38); ctx.rotate(0.06);
      const sock = () => { ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(7, 22); ctx.quadraticCurveTo(7, 28, 14, 28); ctx.lineTo(16, 28); ctx.quadraticCurveTo(22, 30, 18, 36); ctx.lineTo(-2, 36); ctx.quadraticCurveTo(-7, 34, -7, 26); ctx.closePath(); };
      sock(); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.save(); sock(); ctx.clip(); ctx.fillStyle = RED; for (let y = 3; y < 36; y += 8) ctx.fillRect(-10, y, 34, 4); ctx.restore();
      sock(); strokeOnly(ctx, 3);
      ctx.restore();
      // plush ear peeking out
      ctx.save(); ctx.translate(52, -36); ctx.rotate(0.35);
      ellipsePath(ctx, 0, 8, 6, 12); fillStroke(ctx, '#fbe3e8', 3);
      ellipsePath(ctx, 0, 9, 3, 8); ctx.fillStyle = '#f6a6b9'; ctx.fill();
      ctx.restore();
      // lid
      toonBox(ctx, 0, -48, 184, 24, 6, lid);
      ctx.strokeStyle = rgba(darken(lid, 0.5), 0.3); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-88, -41); ctx.lineTo(88, -41); ctx.stroke();
      for (let k = 0; k < 7; k++) { circlePath(ctx, -72 + k * 24, -49, 3); ctx.fillStyle = rgba('#ffffff', 0.55); ctx.fill(); }
      // latch
      rrc(ctx, 0, -36, 18, 14, 4); fillStroke(ctx, '#ffd75a', 3);
      circlePath(ctx, 0, -34, 2.5); ctx.fillStyle = INK; ctx.fill();
    },
  },

  // ======================= rocking horse =======================
  rocking: {
    draw(ctx, o) {
      const H = HORSE[Math.abs(o.v || 0) % HORSE.length];
      const body = [[-80, -20], [60, -40], [70, 0], [-70, 20]];
      const rockY = (x) => { const s = (x + 98) / 196; return 48 * (1 - s) * (1 - s) + 2 * s * (1 - s) * 88 + 48 * s * s; };
      const leg = (x1, y1, x2, col) => {
        const y2 = rockY(x2) - 4;
        rod(ctx, x1, y1, x2, y2 - 8, 12, col);
        rrc(ctx, x2, y2 - 4, 16, 10, 3); fillStroke(ctx, '#5a4036', 3);
      };
      // far legs
      leg(-40, 12, -50, darken(H.coat, 0.18));
      leg(56, 0, 64, darken(H.coat, 0.18));
      // rocker
      ctx.beginPath(); ctx.moveTo(-100, 46); ctx.quadraticCurveTo(0, 90, 100, 46);
      ctx.lineCap = 'round'; ctx.lineWidth = 17; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 10; ctx.strokeStyle = H.rocker; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = rgba(lighten(H.rocker, 0.7), 0.6);
      ctx.beginPath(); ctx.moveTo(-94, 46); ctx.quadraticCurveTo(0, 86, 94, 46); ctx.stroke();
      for (const x of [-100, 100]) { circlePath(ctx, x, 46, 6); fillStroke(ctx, H.rocker, 3); }
      // tail
      ctx.save(); ctx.lineCap = 'round';
      for (const [dx, dy, c] of [[-18, 30, 0], [-26, 22, 1], [-10, 36, 0]]) {
        ctx.beginPath(); ctx.moveTo(-76, -18); ctx.quadraticCurveTo(-96 + dx * 0.2, -18, -82 + dx, 6 + dy);
        ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 7; ctx.strokeStyle = c ? lighten(H.mane, 0.25) : H.mane; ctx.stroke();
      }
      ctx.restore();
      // near legs
      leg(-58, 14, -72, H.coat);
      leg(42, 4, 50, H.coat);
      // torso + head as one silhouette (outline first, fill over it)
      roundPoly(ctx, body, 12); ctx.lineWidth = LW * 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
      circlePath(ctx, 70, -50, 26); ctx.stroke();
      // ears
      for (const [ex, ey, a] of [[58, -70, -0.35], [72, -73, 0.05]]) {
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-7, 4); ctx.quadraticCurveTo(-6, -12, 0, -17); ctx.quadraticCurveTo(6, -12, 7, 4); ctx.closePath();
        fillStroke(ctx, H.coat, 3.5);
        ctx.beginPath(); ctx.moveTo(-3, 2); ctx.quadraticCurveTo(-2, -8, 0, -11); ctx.quadraticCurveTo(2, -8, 3, 2); ctx.closePath();
        ctx.fillStyle = '#f4b2a6'; ctx.fill();
        ctx.restore();
      }
      roundPoly(ctx, body, 12); ctx.fillStyle = H.coat; ctx.fill();
      circlePath(ctx, 70, -50, 26); ctx.fill();
      // shading + dapples
      ctx.save();
      ctx.beginPath(); roundPoly(ctx, body, 12); ctx.clip();
      ctx.fillStyle = rgba(darken(H.coat, 0.55), 0.2);
      ctx.beginPath(); ctx.moveTo(-90, 6); ctx.lineTo(80, -14); ctx.lineTo(80, 40); ctx.lineTo(-90, 40); ctx.fill();
      ctx.fillStyle = H.dap;
      for (const [dx, dy, r] of [[-56, -6, 6], [-40, 4, 4.5], [-60, 8, 3.5], [30, -18, 5], [44, -8, 4], [24, -4, 3.5], [-24, 6, 3]]) { circlePath(ctx, dx, dy, r); ctx.fill(); }
      ctx.restore();
      // muzzle (lower-right part of the head)
      ctx.save(); circlePath(ctx, 70, -50, 26); ctx.clip();
      ellipsePath(ctx, 86, -37, 17, 13.5, 0.6); ctx.fillStyle = mix(H.coat, '#eaa08e', 0.5); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.55); ctx.stroke();
      ctx.restore();
      ellipsePath(ctx, 89, -40, 2.6, 3.8, 0.5); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.moveTo(77, -30); ctx.quadraticCurveTo(83, -26, 88, -31); strokeOnly(ctx, 2.2);
      // bridle: cheek strap + noseband + rein back to the saddle
      ctx.save(); circlePath(ctx, 70, -50, 27); ctx.clip();
      ctx.beginPath(); ctx.moveTo(70, -78); ctx.quadraticCurveTo(76, -60, 76, -44);
      ctx.moveTo(73, -50); ctx.quadraticCurveTo(82, -56, 96, -50);
      ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 3.2; ctx.strokeStyle = H.saddle; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(76, -45); ctx.quadraticCurveTo(46, -14, 14, -31);
      ctx.lineWidth = 5.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = H.saddle; ctx.stroke();
      circlePath(ctx, 76, -46, 3.6); fillStroke(ctx, '#ffd75a', 2);
      // eye
      ellipsePath(ctx, 64, -56, 4.4, 5.8); ctx.fillStyle = INK; ctx.fill();
      circlePath(ctx, 62.6, -58, 1.7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(59.5, -60); ctx.lineTo(55.5, -62.5); ctx.moveTo(61, -62); ctx.lineTo(58, -66); strokeOnly(ctx, 1.8);
      circlePath(ctx, 68, -43, 4.2); ctx.fillStyle = 'rgba(255,120,130,0.35)'; ctx.fill();
      // mane along the back of the head & neck
      const mtufts = [[52, -70, 8], [46, -60, 8.5], [42, -49, 8], [40, -39, 7], [60, -77, 7], [67, -77, 5.5]];
      for (const [mx, my, r] of mtufts) { circlePath(ctx, mx, my, r); fillStroke(ctx, H.mane, 3); }
      for (const [mx, my, r] of mtufts) { circlePath(ctx, mx + 1, my + 1, r - 2.5); ctx.fillStyle = H.mane; ctx.fill(); }
      for (const [mx, my, r] of mtufts) { ctx.beginPath(); ctx.arc(mx - 1, my - 1, r * 0.55, 3.6, 5.0); ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke(); }
      // saddle blanket + saddle
      const topY = (x) => -20 - (x + 80) * (20 / 140);
      ctx.beginPath(); ctx.moveTo(-30, topY(-30) + 2); ctx.lineTo(22, topY(22) + 2); ctx.lineTo(24, topY(22) + 30); ctx.lineTo(-28, topY(-30) + 32); ctx.closePath();
      fillStroke(ctx, H.cloth, 3);
      ctx.beginPath(); ctx.moveTo(24, topY(22) + 27); ctx.lineTo(-28, topY(-30) + 29); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd75a'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-24, topY(-24)); ctx.quadraticCurveTo(-26, topY(-26) - 6, -20, topY(-20) - 4);
      ctx.lineTo(10, topY(10) - 1); ctx.quadraticCurveTo(16, topY(16) - 5, 18, topY(18) - 1);
      ctx.lineTo(16, topY(16) + 12); ctx.lineTo(-22, topY(-22) + 14); ctx.closePath();
      fillStroke(ctx, H.saddle, 3.5);
      gloss(ctx, -16, topY(-16) - 1, 22, 3, 0.4);
      // stirrup
      ctx.beginPath(); ctx.moveTo(-4, topY(-4) + 12); ctx.lineTo(-4, 16); strokeOnly(ctx, 2.5);
      ctx.beginPath(); ctx.moveTo(-9, 16); ctx.lineTo(1, 16); ctx.lineTo(-1, 22); ctx.lineTo(-7, 22); ctx.closePath(); fillStroke(ctx, '#ffd75a', 2.5);
    },
  },
};

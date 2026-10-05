// Hot Dog Heaven props: cloud, ketchup, mustard, burger, fries, soda, donut, cotton candy, pickle, fork, fryer.
import {
  INK, LW, rgba, lighten, darken, mix, rrPath, rrc, fillStroke, strokeOnly, ellipsePath, circlePath,
  polyPath, smoothPath, vgrad, hgrad, rgrad, toonBox, toonCircle, toonPoly, rod, gloss, rng, text,
} from '../common.js';

const TAU = Math.PI * 2;

// Text that stays readable when the prop is mirrored (inst.flip).
function label(ctx, o, str, x, y, size, color, opts) {
  if (o && o.flip) { ctx.save(); ctx.scale(-1, 1); text(ctx, str, -x, y, size, color, opts); ctx.restore(); }
  else text(ctx, str, x, y, size, color, opts);
}

function sparkle(ctx, x, y, s, a = 1, col = '#ffffff') {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.22, -s * 0.22); ctx.lineTo(s, 0); ctx.lineTo(s * 0.22, s * 0.22);
  ctx.lineTo(0, s); ctx.lineTo(-s * 0.22, s * 0.22); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.22, -s * 0.22); ctx.closePath();
  ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill();
  ctx.restore();
}

// Union of shapes drawn with a single clean outer outline: stroke (2×LW) first, then fill on top.
function unionOutlined(ctx, path, fill, lw = LW) {
  path(); ctx.lineWidth = lw * 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  path(); ctx.fillStyle = fill; ctx.fill();
}

// Condiment squeeze bottle body (collision box (0,25,80,180,r24): x ±40, y -65..115).
function bottleBody(ctx, o, col, name, labelCol, icon) {
  const body = () => rrPath(ctx, -40, -65, 80, 180, 24);
  body(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = hgrad(ctx, -40, 40, [[0, rgba(darken(col, 0.5), 0.35)], [0.22, 'rgba(255,255,255,0.0)'], [0.32, 'rgba(255,255,255,0.35)'], [0.42, 'rgba(255,255,255,0)'], [0.85, rgba(darken(col, 0.5), 0.2)], [1, rgba(darken(col, 0.6), 0.45)]]);
  ctx.fillRect(-40, -65, 80, 180);
  // squeeze ridges near the bottom
  ctx.strokeStyle = rgba(darken(col, 0.5), 0.35); ctx.lineWidth = 2;
  for (const y of [96, 104]) { ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(40, y); ctx.stroke(); }
  ctx.restore();
  body(); strokeOnly(ctx);
  // label
  rrc(ctx, 0, 30, 64, 70, 12); fillStroke(ctx, '#fff8e8', 3);
  ctx.save(); rrc(ctx, 0, 30, 64, 70, 12); ctx.clip();
  ctx.fillStyle = rgba(labelCol, 0.18); ctx.fillRect(-32, 50, 64, 20);
  ctx.restore();
  icon(0, 16);
  label(ctx, o, name, 0, 50, name.length > 6 ? 11.5 : 13, labelCol, { stroke: 0 });
  // gloss streaks
  gloss(ctx, -30, -50, 7, 120, 0.5);
  gloss(ctx, -19, -52, 3, 40, 0.4);
  sparkle(ctx, 26, -40, 6, 0.9);
}

export const HEAVEN_ART = {
  // ======================= Cloud (stretchable support) =======================
  cloud: {
    draw(ctx, o, t) {
      const w = o.w || 240;
      const hw = w / 2;
      const r = rng(Math.round(w) * 7 + (o.v || 0));
      // The union path is inset ~2 from the collision pill (y -25..25, r24) because its outline is
      // stroked outside; top scallops rise ≤2 above the flat top so the landing edge stays true.
      const bottom = [], tops = [];
      const nb = Math.max(2, Math.round((w - 30) / 36));
      for (let i = 0; i < nb; i++) {
        const x = -hw + 26 + (i + 0.5) * (w - 52) / nb;
        bottom.push([x, 13 + r() * 5, 18 + r() * 6]);
      }
      const nt = Math.max(2, Math.round((w - 40) / 34));
      for (let i = 0; i < nt; i++) tops.push([-hw + 24 + (i + 0.5) * (w - 48) / nt, -9, 16]);
      const path = () => {
        rrPath(ctx, -hw + 2, -23, w - 4, 46, 22);
        for (const [x, y, rr] of bottom) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
        for (const [x, y, rr] of tops) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
        ctx.moveTo(-hw + 26 + 21, 5); ctx.arc(-hw + 26, 5, 21, 0, TAU);
        ctx.moveTo(hw - 26 + 21, 5); ctx.arc(hw - 26, 5, 21, 0, TAU);
      };
      unionOutlined(ctx, path, '#ffffff');
      ctx.save(); path(); ctx.clip();
      // lavender underside shading
      ctx.fillStyle = vgrad(ctx, -25, 42, [[0, 'rgba(255,255,255,0)'], [0.4, 'rgba(214,204,248,0.3)'], [1, 'rgba(165,145,230,0.85)']]);
      ctx.fillRect(-hw - 10, -30, w + 20, 75);
      // re-lit puffs (gives each bottom bump its own soft volume)
      for (const [x, y, rr] of bottom) {
        circlePath(ctx, x - 2, y - 7, rr * 0.82); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rr - 1.5, 0.15 * Math.PI, 0.75 * Math.PI);
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(140,120,210,0.35)'; ctx.stroke();
      }
      // golden rim light along the top + gloss
      ctx.fillStyle = 'rgba(255,232,160,0.6)'; ctx.fillRect(-hw, -30, w, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      rrc(ctx, -hw * 0.3, -14, Math.max(30, w * 0.36), 6, 3); ctx.fill();
      circlePath(ctx, -hw * 0.3 + Math.max(30, w * 0.36) / 2 + 9, -14, 3); ctx.fill();
      ctx.restore();
      // sleepy happy face on bigger clouds
      if (w >= 170) {
        const fx = (o.v || 0) % 2 ? hw * 0.3 : 0;
        ctx.lineWidth = 3; ctx.strokeStyle = rgba(INK, 0.75); ctx.lineCap = 'round';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(fx + s * 14, 4, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(fx, 8, 4.5, 0.25, Math.PI - 0.25); ctx.stroke();
        ctx.fillStyle = 'rgba(255,150,180,0.5)';
        ellipsePath(ctx, fx - 25, 11, 7, 3.5); ctx.fill(); ellipsePath(ctx, fx + 25, 11, 7, 3.5); ctx.fill();
      }
      sparkle(ctx, hw - 30, -16, 5, 0.6 + 0.4 * Math.sin((t || 0) * 3 + w));
    },
  },

  // ======================= Ketchup bottle (blocker) =======================
  ketchup: {
    draw(ctx, o) {
      const RED = '#e8322a';
      bottleBody(ctx, o, RED, 'KETCHUP', '#c9241c', (x, y) => {
        // tomato icon
        circlePath(ctx, x, y + 2, 12); fillStroke(ctx, '#ff4a3a', 2.5);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; ctx.lineTo(x + Math.cos(a) * 7, y - 9 + Math.sin(a) * 3.5); ctx.lineTo(x + Math.cos(a + 0.6) * 2.5, y - 9 + Math.sin(a + 0.6) * 1.2); }
        ctx.closePath(); fillStroke(ctx, '#4caf50', 1.8);
        circlePath(ctx, x - 4, y - 2, 2.6); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      });
      // cap (collision 40×40 at y -105..-65)
      rrc(ctx, 0, -68, 54, 12, 5); fillStroke(ctx, '#f6f2ea', 3);
      toonBox(ctx, 0, -86, 40, 38, 6, '#f6f2ea');
      ctx.strokeStyle = rgba(INK, 0.25); ctx.lineWidth = 1.6;
      for (let x = -14; x <= 14; x += 5) { ctx.beginPath(); ctx.moveTo(x, -80); ctx.lineTo(x, -70); ctx.stroke(); }
      // flip-top hinge line + nozzle hole on top
      ctx.beginPath(); ctx.moveTo(-20, -96); ctx.lineTo(20, -96); strokeOnly(ctx, 2.5);
      rrc(ctx, 6, -101, 10, 4, 2); ctx.fillStyle = '#c9241c'; ctx.fill();
      // glossy ketchup drip running down the shoulder
      ctx.beginPath(); ctx.moveTo(6, -66); ctx.quadraticCurveTo(18, -66, 17, -54); ctx.lineTo(17, -40);
      ctx.arc(13.5, -40, 3.5, 0, Math.PI); ctx.lineTo(10, -54); ctx.quadraticCurveTo(10, -60, 4, -62); ctx.closePath();
      fillStroke(ctx, '#b81c16', 2.4);
      circlePath(ctx, 12.4, -41, 1.3); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    },
  },

  // ======================= Mustard bottle (blocker) =======================
  mustard: {
    draw(ctx, o) {
      const Y = '#ffc81f';
      // pointed nozzle (collision poly: [-20,-65] [20,-65] [4,-115] [-4,-115])
      ctx.beginPath(); ctx.moveTo(-20, -65); ctx.lineTo(20, -65); ctx.lineTo(4.5, -112); ctx.quadraticCurveTo(0, -117, -4.5, -112); ctx.closePath();
      ctx.fillStyle = hgrad(ctx, -20, 20, [[0, '#e8322a'], [0.35, '#ff7a6a'], [0.55, '#e8322a'], [1, '#a81e18']]); ctx.fill();
      strokeOnly(ctx);
      ctx.strokeStyle = rgba(INK, 0.3); ctx.lineWidth = 1.6;
      for (const y of [-74, -82]) { const hw = 20 - (y + 65) * -0.32; ctx.beginPath(); ctx.moveTo(-hw + 3, y); ctx.lineTo(hw - 3, y); ctx.stroke(); }
      // blob of mustard on the tip
      ctx.beginPath(); ctx.arc(0, -114, 4.5, Math.PI, 0); ctx.quadraticCurveTo(5, -106, 1, -104); ctx.quadraticCurveTo(-5, -108, -4.5, -114); ctx.closePath();
      fillStroke(ctx, Y, 2.2);
      rrc(ctx, 0, -68, 54, 12, 5); fillStroke(ctx, '#e8322a', 3);
      bottleBody(ctx, o, Y, 'MUSTARD', '#c98a00', (x, y) => {
        // mini hot dog icon
        ctx.save(); ctx.translate(x, y + 2);
        ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(0, -10, 18, -2); ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 5.5; ctx.strokeStyle = '#d9573b'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-18, 3); ctx.quadraticCurveTo(0, 12, 18, 3); ctx.quadraticCurveTo(0, 3, -18, 3); ctx.closePath();
        fillStroke(ctx, '#e9a54f', 2);
        ctx.beginPath(); ctx.moveTo(-12, -6); for (let i = 0; i <= 6; i++) ctx.lineTo(-12 + i * 4, -6 + (i % 2 ? -2 : 1)); ctx.lineWidth = 1.8; ctx.strokeStyle = '#ffe14a'; ctx.stroke();
        ctx.restore();
      });
    },
  },

  // ======================= Burger (bouncer) =======================
  burger: {
    draw(ctx) {
      // bottom bun (collision box 170×50 r18, y 5..55 — the patty sits in its upper half)
      const bot = () => { ctx.beginPath(); ctx.moveTo(-85, 30); ctx.lineTo(85, 30); ctx.lineTo(85, 37); ctx.quadraticCurveTo(85, 55, 67, 55); ctx.lineTo(-67, 55); ctx.quadraticCurveTo(-85, 55, -85, 37); ctx.closePath(); };
      bot(); ctx.fillStyle = vgrad(ctx, 30, 55, [[0, '#f0b05a'], [1, '#c97a2c']]); ctx.fill();
      ctx.fillStyle = '#ffe2a8'; ctx.fillRect(-82, 29, 164, 5);
      bot(); strokeOnly(ctx);
      // patty
      const r = rng(9);
      ctx.beginPath(); ctx.moveTo(-86, 14);
      for (let x = -80; x <= 80; x += 10) ctx.lineTo(x, 5 + (r() - 0.5) * 3);
      ctx.quadraticCurveTo(90, 6, 88, 18); ctx.quadraticCurveTo(90, 32, 78, 32);
      for (let x = 70; x >= -70; x -= 10) ctx.lineTo(x, 32 + (r() - 0.5) * 3);
      ctx.quadraticCurveTo(-90, 32, -88, 18); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, 5, 32, [[0, '#8a4a26'], [1, '#5b2e16']]); ctx.fill(); strokeOnly(ctx);
      ctx.strokeStyle = 'rgba(40,15,5,0.5)'; ctx.lineWidth = 2.5;
      for (let x = -70; x <= 70; x += 22) { ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x + 10, 24); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,200,150,0.3)'; ctx.fillRect(-76, 9, 120, 3);
      // tomato slice peeking
      rrc(ctx, 30, 3, 70, 10, 5); fillStroke(ctx, '#ff4a3a', 2.5);
      // lettuce frill
      ctx.beginPath(); ctx.moveTo(-94, -4);
      for (let x = -94; x <= 94; x += 9) ctx.quadraticCurveTo(x + 4.5, 10 + (x % 2 ? 2 : 0), x + 9, -2);
      ctx.lineTo(90, -6); ctx.lineTo(-90, -6); ctx.closePath();
      fillStroke(ctx, '#6ccf4a', 2.8);
      // cheese slice with drips
      ctx.beginPath(); ctx.moveTo(-82, -7); ctx.lineTo(82, -7); ctx.lineTo(92, 2); ctx.lineTo(70, 2);
      ctx.quadraticCurveTo(66, 16, 60, 2); ctx.lineTo(-20, 2); ctx.quadraticCurveTo(-26, 18, -32, 2); ctx.lineTo(-74, 2); ctx.lineTo(-92, 8); ctx.closePath();
      fillStroke(ctx, '#ffcc33', 3);
      // top bun (collision poly; corners rounded inside by ≤2.5)
      const top = () => {
        ctx.beginPath();
        ctx.moveTo(-90, -5);
        ctx.arcTo(-70, -45, -30, -60, 30);
        ctx.arcTo(-30, -60, 30, -60, 40);
        ctx.arcTo(30, -60, 70, -45, 40);
        ctx.arcTo(70, -45, 90, -5, 30);
        ctx.lineTo(90, -5);
        ctx.quadraticCurveTo(0, 2, -90, -5);
        ctx.closePath();
      };
      top(); ctx.fillStyle = vgrad(ctx, -60, -5, [[0, '#f6b860'], [0.6, '#e08d36'], [1, '#c4702a']]); ctx.fill();
      ctx.save(); top(); ctx.clip();
      ctx.fillStyle = 'rgba(255,240,200,0.55)';
      ctx.beginPath(); ctx.ellipse(-30, -46, 40, 9, -0.12, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(-38, -49, 14, 3.5, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(120,50,10,0.18)'; ctx.fillRect(-95, -16, 190, 14);
      ctx.restore();
      top(); strokeOnly(ctx);
      // sesame seeds
      for (const [sx, sy, a] of [[-50, -36, -0.4], [-20, -50, 0.2], [10, -44, -0.3], [40, -50, 0.5], [58, -32, -0.6], [-66, -22, 0.4], [-8, -28, 0.1], [28, -26, -0.2], [70, -18, 0.3]]) {
        ellipsePath(ctx, sx, sy, 5, 2.8, a); ctx.fillStyle = '#fff4d6'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(INK, 0.5); ctx.stroke();
      }
    },
  },

  // ======================= Fries (platform) =======================
  fries: {
    draw(ctx) {
      // fries (collision box (0,-48,100,52): tops at -74)
      const r = rng(21);
      const fry = (x, top, a, col) => {
        ctx.save(); ctx.translate(x, -20); ctx.rotate(a);
        const h = -20 - top;
        rrPath(ctx, -5.5, -h, 11, h + 10, 3);
        ctx.fillStyle = col; ctx.fill(); strokeOnly(ctx, 2.6);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.5, -h + 3, 2.5, h * 0.7);
        ctx.fillStyle = 'rgba(160,80,10,0.35)'; ctx.fillRect(-5.5, -h, 11, 3);
        ctx.restore();
      };
      for (let i = 0; i < 9; i++) fry(-44 + i * 11, -72 + r() * 2, (r() - 0.5) * 0.12, '#e8a93a');
      for (let i = 0; i < 8; i++) fry(-38 + i * 11, -74 + r() * 3, (r() - 0.5) * 0.16, '#ffd25c');
      // salt sparkles
      for (const [sx, sy] of [[-30, -60], [8, -66], [30, -52], [-12, -46]]) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy, 2.5, 2.5); }
      // carton (collision poly)
      const carton = () => {
        ctx.beginPath();
        ctx.moveTo(-55, -20); ctx.quadraticCurveTo(0, -6, 55, -20);
        ctx.lineTo(40, 80); ctx.lineTo(-40, 80); ctx.closePath();
      };
      carton(); ctx.fillStyle = '#e8322a'; ctx.fill();
      ctx.save(); carton(); ctx.clip();
      ctx.fillStyle = hgrad(ctx, -55, 55, [[0, 'rgba(255,255,255,0)'], [0.25, 'rgba(255,255,255,0.28)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(80,0,0,0.3)']]);
      ctx.fillRect(-60, -30, 120, 120);
      ctx.fillStyle = 'rgba(80,0,0,0.25)'; ctx.fillRect(-60, 58, 120, 30);
      // white band + gold trim
      ctx.fillStyle = '#ffd25c';
      ctx.beginPath(); ctx.moveTo(-60, -20); ctx.quadraticCurveTo(0, -6, 60, -20); ctx.lineTo(60, -12); ctx.quadraticCurveTo(0, 2, -60, -12); ctx.closePath(); ctx.fill();
      ctx.restore();
      carton(); strokeOnly(ctx);
      // emblem: little smiling hot dog in a star
      ctx.save(); ctx.translate(0, 30);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 11 : 24; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); fillStroke(ctx, '#ffd25c', 3);
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -5, 10, 0); ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 4.5; ctx.strokeStyle = '#d9573b'; ctx.stroke();
      ctx.restore();
    },
  },

  // ======================= Soda cup (cup) =======================
  soda: {
    draw(ctx) {
      // interior back wall between the (slightly tapered) walls
      const inner = [[-34, -69.5], [34, -69.5], [44, 72], [-44, 72]];
      polyPath(ctx, inner); fillStroke(ctx, '#7a1d22');
      ctx.save(); polyPath(ctx, inner); ctx.clip();
      // cola + fizz
      ctx.fillStyle = vgrad(ctx, -52, 72, [[0, '#6b3416'], [1, '#2b1208']]); ctx.fillRect(-50, -52, 100, 130);
      ctx.fillStyle = '#c98a5a'; ctx.fillRect(-50, -54, 100, 4);
      ctx.fillStyle = 'rgba(255,240,220,0.7)';
      for (const [bx, by, br] of [[-24, -58, 3], [-14, -60, 2], [-2, -57, 2.5], [18, -59, 2], [26, -56, 3]]) { circlePath(ctx, bx, by, br); ctx.fill(); }
      // ice cubes
      for (const [ix, iy, a] of [[-18, -56, 0.3], [6, -58, -0.2]]) {
        ctx.save(); ctx.translate(ix, iy); ctx.rotate(a);
        rrc(ctx, 0, 0, 16, 14, 3); ctx.fillStyle = 'rgba(220,245,255,0.85)'; ctx.fill(); strokeOnly(ctx, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-5, -4, 4, 3);
        ctx.restore();
      }
      ctx.restore();
      // straw (collision capsule (10,-70)→(40,-40) r4), with a bendy tip
      const sr = () => { ctx.beginPath(); ctx.moveTo(4, -80); ctx.quadraticCurveTo(6, -74, 10, -70); ctx.lineTo(48, -32); };
      sr(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 8 + LW * 1.6; ctx.strokeStyle = INK; ctx.stroke();
      sr(); ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.save(); sr(); ctx.lineWidth = 8; ctx.setLineDash([6, 6]); ctx.strokeStyle = '#ff4a6a'; ctx.lineCap = 'butt'; ctx.stroke(); ctx.restore();
    },
    front(ctx, o) {
      // outer wall line x at height y: (-44.1,-70.2) → (-53.9,69.5)
      const xl = y => -44.1 - (y + 70.2) * (9.8 / 139.7);
      const top = -40;
      const face = () => {
        ctx.beginPath();
        ctx.moveTo(xl(top), top); ctx.lineTo(-xl(top), top);
        ctx.lineTo(53.9, 69.5); ctx.quadraticCurveTo(52, 81, 40, 81);
        ctx.lineTo(-40, 81); ctx.quadraticCurveTo(-52, 81, -53.9, 69.5);
        ctx.closePath();
      };
      face(); ctx.fillStyle = '#fff8ee'; ctx.fill();
      ctx.save(); face(); ctx.clip();
      // red candy stripes leaning with the walls
      ctx.fillStyle = '#e8322a';
      for (let k = -4; k <= 4; k += 2) {
        const x0 = k * 11;
        ctx.beginPath(); ctx.moveTo(x0 - 5, top - 2); ctx.lineTo(x0 + 5, top - 2); ctx.lineTo(x0 * 1.2 + 6, 84); ctx.lineTo(x0 * 1.2 - 6, 84); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(80,0,10,0.18)'; ctx.fillRect(-60, 52, 120, 40);
      ctx.fillStyle = hgrad(ctx, -54, 54, [[0, 'rgba(0,0,0,0.15)'], [0.25, 'rgba(255,255,255,0.35)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.2)']]);
      ctx.fillRect(-60, top - 2, 120, 130);
      ctx.restore();
      face(); strokeOnly(ctx);
      // badge
      circlePath(ctx, 0, 18, 22); fillStroke(ctx, '#ffd25c', 3);
      circlePath(ctx, 0, 18, 16); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.35); ctx.stroke();
      label(ctx, o, 'FIZZ', 0, 19, 13, '#e8322a', { stroke: 0 });
      sparkle(ctx, -30, 48, 5, 0.9);
      // top band of the face
      ctx.beginPath(); ctx.moveTo(xl(top) - 1, top); ctx.lineTo(-xl(top) + 1, top);
      ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      // wall rims above the face
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 39.1, -69.8); ctx.lineTo(s * (-xl(top) - 5), top);
        ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }
    },
  },

  // ======================= Donut (bouncer) =======================
  donut: {
    draw(ctx, o) {
      const frost = ['#ff8fc7', '#8a5232', '#8fd8ff', '#c9a6ff'][(o.v || 0) % 4];
      const R = 64, HR = 19;
      // dough ring
      circlePath(ctx, 0, 0, R); ctx.fillStyle = vgrad(ctx, -R, R, [[0, '#f2b766'], [1, '#c8812f']]); ctx.fill();
      // frosting (wavy outer edge with drips)
      const fr = () => {
        ctx.beginPath();
        const N = 64;
        for (let i = 0; i <= N; i++) {
          const a = i / N * TAU;
          const drip = Math.max(0, Math.sin(a * 5 + 0.8)) ** 3 * 6 * (Math.sin(a) > -0.3 ? 1 : 0.4);
          const rr = 52 + Math.sin(a * 9) * 2 + drip;
          i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr - 3) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr - 3);
        }
        ctx.closePath();
        ctx.moveTo(HR + 7, -3); ctx.arc(0, -3, HR + 7, 0, TAU, true);
      };
      fr(); ctx.fillStyle = frost; ctx.fill();
      ctx.save(); fr(); ctx.clip();
      ctx.beginPath(); ctx.arc(0, 0, R + 2, 0, TAU); ctx.arc(-8, -12, R, 0, TAU, true);
      ctx.fillStyle = rgba(darken(frost, 0.5), 0.25); ctx.fill('evenodd');
      ctx.restore();
      fr(); strokeOnly(ctx, 3);
      // sprinkles
      const r = rng(17 + (o.v || 0));
      const SC = ['#ffffff', '#ffd23a', '#5ec8f0', '#7be06a', '#ff5a6b', '#b48cff'];
      for (let i = 0; i < 34; i++) {
        const a = r() * TAU, rr = HR + 12 + r() * 22;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr - 3;
        ctx.save(); ctx.translate(x, y); ctx.rotate(r() * TAU);
        rrc(ctx, 0, 0, 9, 3.4, 1.7); ctx.fillStyle = SC[i % SC.length]; ctx.fill();
        ctx.restore();
      }
      // glossy highlight arc on the frosting
      ctx.beginPath(); ctx.arc(0, -3, 42, Math.PI * 1.08, Math.PI * 1.42);
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineCap = 'round'; ctx.stroke();
      circlePath(ctx, -34, -24, 3); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      // the hole: inner dough wall (solid, not see-through)
      circlePath(ctx, 0, -1, HR);
      ctx.fillStyle = vgrad(ctx, -HR, HR, [[0, '#7a4a1e'], [0.55, '#b9772e'], [1, '#e6a95a']]); ctx.fill();
      strokeOnly(ctx, 3);
      ellipsePath(ctx, 0, 6, 10, 4); ctx.fillStyle = 'rgba(255,220,160,0.35)'; ctx.fill();
      // outer outline
      circlePath(ctx, 0, 0, R); strokeOnly(ctx);
    },
  },

  // ======================= Cotton candy (sticky platform) =======================
  cottoncandy: {
    draw(ctx, o, t) {
      const pink = ['#ff9fd2', '#b9a4ff', '#9fe0ff'][(o.v || 0) % 3];
      const blue = ['#a8dcff', '#ffb3e0', '#ffc6f0'][(o.v || 0) % 3];
      // stick (collision capsule (0,0)→(0,100) r5)
      rod(ctx, 0, 0, 0, 100, 10, '#f7f0e2');
      ctx.save(); ctx.beginPath(); ctx.rect(-6, 0, 12, 106); ctx.clip();
      ctx.fillStyle = '#ff6fae';
      for (let y = 4; y < 104; y += 16) { ctx.beginPath(); ctx.moveTo(-6, y); ctx.lineTo(6, y - 6); ctx.lineTo(6, y + 1); ctx.lineTo(-6, y + 7); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      // gooey sticky drips hanging off the bottom of the fluff
      const goo = (x, len) => {
        ctx.beginPath(); ctx.moveTo(x - 7, 4); ctx.quadraticCurveTo(x - 4, 6 + len * 0.6, x - 4, 6 + len);
        ctx.arc(x, 6 + len, 4, Math.PI, 0, true); ctx.quadraticCurveTo(x + 4, 6 + len * 0.6, x + 7, 4); ctx.closePath();
        fillStroke(ctx, darken(pink, 0.08), 2.5);
        circlePath(ctx, x - 1.5, 2 + len, 1.6); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      };
      const wob = Math.sin((t || 0) * 2) * 2;
      goo(-26, 9 + wob); goo(20, 13 - wob);
      // fluff (collision circle (0,-40) r60) — bumps reach the circle, valleys sit ≤2.5 inside
      const N = 14;
      const fluff = () => {
        ctx.beginPath();
        ctx.moveTo(56, -40); ctx.arc(0, -40, 55.5, 0, TAU);
        for (let i = 0; i < N; i++) {
          const a = i / N * TAU + 0.2;
          const cx = Math.cos(a) * 46, cy = -40 + Math.sin(a) * 46;
          ctx.moveTo(cx + 12, cy); ctx.arc(cx, cy, 12, 0, TAU);
        }
      };
      unionOutlined(ctx, fluff, pink);
      ctx.save(); fluff(); ctx.clip();
      // swirl patches of a second colour
      ctx.fillStyle = rgba(blue, 0.85);
      ctx.beginPath(); ctx.ellipse(18, -20, 30, 16, -0.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-26, -58, 22, 12, 0.5, 0, TAU); ctx.fill();
      // wispy strands
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 14, -40 + Math.sin(a) * 10, 18 + i * 4, a, a + 1.6); ctx.stroke();
      }
      // shading + highlight
      ctx.beginPath(); ctx.arc(0, -40, 64, 0, TAU); ctx.arc(-10, -54, 60, 0, TAU, true);
      ctx.fillStyle = rgba(darken(pink, 0.45), 0.25); ctx.fill('evenodd');
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-22, -78, 16, 7, -0.4, 0, TAU); ctx.fill();
      ctx.restore();
      // glossy sticky blobs
      for (const [gx, gy, gr] of [[30, -66, 5], [-38, -24, 4], [8, -10, 4.5]]) {
        circlePath(ctx, gx, gy, gr); ctx.fillStyle = rgba(lighten(pink, 0.4), 0.95); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(INK, 0.4); ctx.stroke();
        circlePath(ctx, gx - gr * 0.35, gy - gr * 0.35, gr * 0.35); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      // paper cone where the stick meets the fluff
      ctx.beginPath(); ctx.moveTo(-15, 8); ctx.lineTo(15, 8); ctx.lineTo(5, 34); ctx.lineTo(-5, 34); ctx.closePath();
      fillStroke(ctx, '#fff8ee', 3);
      ctx.fillStyle = '#ff6fae'; ctx.fillRect(-11, 15, 22, 4);
      sparkle(ctx, 40, -86, 6, 0.6 + 0.4 * Math.sin((t || 0) * 4));
    },
  },

  // ======================= Pickle (slippery platform) =======================
  pickle: {
    draw(ctx, o, t) {
      const G = '#6aa83a';
      const pill = () => rrPath(ctx, -103, -28, 206, 56, 28);
      pill(); ctx.fillStyle = vgrad(ctx, -28, 28, [[0, '#8cc84f'], [0.55, G], [1, '#4a7f26']]); ctx.fill();
      ctx.save(); pill(); ctx.clip();
      // longitudinal ridges
      ctx.strokeStyle = 'rgba(40,80,20,0.35)'; ctx.lineWidth = 2.5;
      for (const y of [-14, 0, 14]) { ctx.beginPath(); ctx.moveTo(-110, y); ctx.quadraticCurveTo(0, y + (y > 0 ? 4 : y < 0 ? -4 : 0), 110, y); ctx.stroke(); }
      // warts
      const r = rng(5);
      for (let i = 0; i < 26; i++) {
        const x = -90 + r() * 180, y = -18 + r() * 36;
        circlePath(ctx, x, y, 2.4 + r() * 1.6); ctx.fillStyle = '#a6dc6a'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0.3, Math.PI - 0.3); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(40,80,20,0.45)'; ctx.stroke();
      }
      // glossy wet shine
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; rrc(ctx, -10, -18, 150, 6, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; rrc(ctx, -70, -12, 30, 4, 2); ctx.fill();
      ctx.restore();
      pill(); strokeOnly(ctx);
      // stem nub on the end
      ctx.beginPath(); ctx.moveTo(-102, -4); ctx.quadraticCurveTo(-110, -2, -108, 6); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#4a7f26'; ctx.stroke();
      // brine drip + slippery sparkles
      const ph = ((t || 0) * 0.8) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.moveTo(40, 26 + ph * 20); ctx.quadraticCurveTo(44, 34 + ph * 20, 40, 36 + ph * 20); ctx.quadraticCurveTo(36, 34 + ph * 20, 40, 26 + ph * 20);
      ctx.fillStyle = '#d9f59a'; ctx.fill();
      ctx.globalAlpha = 1;
      sparkle(ctx, -52, -20, 7, 0.95);
      sparkle(ctx, 66, -16, 5, 0.6 + 0.4 * Math.sin((t || 0) * 5));
      sparkle(ctx, 10, -22, 4, 0.8);
    },
  },

  // ======================= Giant fork (hazard: tines up) =======================
  fork: {
    draw(ctx, o, t) {
      const steel = (x0, x1) => hgrad(ctx, x0, x1, [[0, '#8e99a4'], [0.3, '#f4f8fb'], [0.55, '#bcc6cf'], [0.8, '#ffffff'], [1, '#7f8a95']]);
      // handle (collision 22×200 r8, y -50..150)
      rrPath(ctx, -11, -50, 22, 200, 8);
      ctx.fillStyle = steel(-11, 11); ctx.fill(); strokeOnly(ctx);
      // engraved handle end
      ctx.beginPath(); ctx.ellipse(0, 122, 6, 16, 0, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.35); ctx.stroke();
      circlePath(ctx, 0, 122, 3); ctx.fillStyle = '#ffd25c'; ctx.fill();
      // head: shoulder (crossbar 90×20 at y -65..-45) + four sharp tines up to -145
      const head = () => {
        ctx.beginPath();
        ctx.moveTo(-11, -38);
        ctx.quadraticCurveTo(-14, -45, -38, -47);
        ctx.quadraticCurveTo(-45, -48, -45, -56);
        // tines left to right
        const tw = 18, gap = 6;
        for (let i = 0; i < 4; i++) {
          const x0 = -45 + i * (tw + gap), x1 = x0 + tw;
          ctx.lineTo(x0, -118);
          ctx.quadraticCurveTo(x0 + 2, -132, x0 + tw / 2, -146);
          ctx.quadraticCurveTo(x1 - 2, -132, x1, -118);
          if (i < 3) { ctx.lineTo(x1, -70); ctx.quadraticCurveTo(x1 + gap / 2, -64, x1 + gap, -70); }
        }
        ctx.lineTo(45, -56);
        ctx.quadraticCurveTo(45, -48, 38, -47);
        ctx.quadraticCurveTo(14, -45, 11, -38);
        ctx.closePath();
      };
      head(); ctx.fillStyle = steel(-45, 45); ctx.fill();
      ctx.save(); head(); ctx.clip();
      ctx.fillStyle = 'rgba(40,50,70,0.18)'; ctx.fillRect(-50, -60, 100, 24);
      for (let i = 0; i < 4; i++) { const x0 = -45 + i * 24; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x0 + 4, -122, 3, 50); }
      ctx.restore();
      head(); strokeOnly(ctx);
      // menacing glints on the tips
      for (let i = 0; i < 4; i++) {
        const tx = -36 + i * 24;
        const tw = 0.5 + 0.5 * Math.sin((t || 0) * 4 + i * 1.7);
        sparkle(ctx, tx + 1, -140, 5 + tw * 4, 0.6 + 0.4 * tw);
      }
    },
  },

  // ======================= Deep fryer (hazard, bubbling oil) =======================
  fryer: {
    draw(ctx, o, t) {
      // back wall of the basin
      rrPath(ctx, -92, -70, 184, 132, 6); fillStroke(ctx, '#59616b');
      ctx.save(); rrPath(ctx, -84, -70, 168, 128, 4); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -70, -30, [[0, '#3b4148'], [1, '#6b737c']]); ctx.fillRect(-90, -70, 180, 40);
      // basket hook on the back wall
      ctx.fillStyle = '#8e99a4'; ctx.fillRect(-6, -66, 12, 8);
      // hot oil (surface at ~-38, wavy)
      const surf = x => -46 + Math.sin(x * 0.09 + t * 5) * 2 + Math.sin(x * 0.21 - t * 7) * 1.2;
      ctx.beginPath(); ctx.moveTo(-90, 60);
      for (let x = -90; x <= 90; x += 6) ctx.lineTo(x, surf(x));
      ctx.lineTo(90, 60); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -48, 50, [[0, '#ffd24a'], [0.2, '#f2a51e'], [1, '#b8560c']]); ctx.fill();
      // glowing surface line
      ctx.beginPath(); for (let x = -90; x <= 90; x += 6) (x === -90 ? ctx.moveTo(x, surf(x)) : ctx.lineTo(x, surf(x)));
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff1a8'; ctx.stroke();
      // rising bubbles
      for (let i = 0; i < 12; i++) {
        const ph = (t * (1.1 + (i % 4) * 0.25) + i * 0.173) % 1;
        const bx = -72 + ((i * 37) % 144) + Math.sin(t * 6 + i) * 2;
        const by = 40 - ph * 76;
        const br = 2 + (i % 3) * 1.5 + ph * 2;
        circlePath(ctx, bx, by, br); ctx.fillStyle = 'rgba(255,245,190,0.55)'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(150,70,0,0.45)'; ctx.stroke();
      }
      // popping bubbles on the surface
      for (let i = 0; i < 6; i++) {
        const ph = (t * 1.6 + i * 0.29) % 1;
        const bx = -66 + i * 26 + Math.sin(i * 3) * 6;
        const by = surf(bx);
        ctx.beginPath(); ctx.arc(bx, by, 3 + ph * 6, Math.PI, 0);
        ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255,250,210,${1 - ph})`; ctx.stroke();
      }
      ctx.restore();
      // oil splatter droplets jumping out
      for (let i = 0; i < 4; i++) {
        const ph = (t * 1.3 + i * 0.25) % 1;
        const sx = -50 + i * 34 + ph * (i % 2 ? 10 : -10);
        const sy = -40 - Math.sin(ph * Math.PI) * 26;
        circlePath(ctx, sx, sy, 2.6); ctx.fillStyle = `rgba(255,200,60,${1 - ph * 0.6})`; ctx.fill();
      }
      // hot glow above the oil
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = vgrad(ctx, -90, -40, [[0, 'rgba(255,140,40,0)'], [1, `rgba(255,150,50,${0.28 + 0.06 * Math.sin(t * 9)})`]]);
      ctx.fillRect(-84, -90, 168, 50);
      ctx.restore();
      // heat shimmer / steam wisps
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.45 + i * 0.25) % 1;
        const sx = -54 + i * 36, sy = -46 - ph * 60;
        ctx.beginPath(); ctx.moveTo(sx, sy + 18);
        ctx.bezierCurveTo(sx - 9, sy + 10, sx + 9, sy + 4, sx, sy - 6);
        ctx.lineWidth = 5; ctx.strokeStyle = `rgba(255,255,255,${0.45 * Math.sin(ph * Math.PI)})`; ctx.stroke();
      }
    },
    front(ctx, o, t) {
      const top = -24;
      // front steel panel
      rrPath(ctx, -100, top, 200, 70 - top, 6);
      ctx.fillStyle = hgrad(ctx, -100, 100, [[0, '#7d868e'], [0.25, '#dfe6ec'], [0.5, '#a9b3bb'], [0.75, '#e8eef2'], [1, '#6f7880']]);
      ctx.fill();
      ctx.save(); rrPath(ctx, -100, top, 200, 70 - top, 6); ctx.clip();
      ctx.fillStyle = 'rgba(30,30,40,0.22)'; ctx.fillRect(-100, 40, 200, 32);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-100, top + 3, 200, 3);
      ctx.restore();
      rrPath(ctx, -100, top, 200, 70 - top, 6); strokeOnly(ctx);
      // warning label
      rrc(ctx, -38, 12, 70, 34, 6); fillStroke(ctx, '#ffcf3a', 3);
      ctx.beginPath(); ctx.moveTo(-62, 24); ctx.quadraticCurveTo(-68, 10, -58, 0); ctx.quadraticCurveTo(-58, 10, -52, 12); ctx.quadraticCurveTo(-52, 2, -56, -4);
      ctx.quadraticCurveTo(-44, 6, -46, 18); ctx.quadraticCurveTo(-48, 26, -55, 26); ctx.closePath();
      fillStroke(ctx, '#ff5a2a', 2);
      label(ctx, o, 'HOT!', -24, 13, 15, '#e8322a', { stroke: 0 });
      // temperature dial
      circlePath(ctx, 52, 12, 16); fillStroke(ctx, '#2f343b', 3);
      ctx.beginPath(); ctx.arc(52, 12, 11, Math.PI * 0.8, Math.PI * 2.2); ctx.lineWidth = 3; ctx.strokeStyle = '#4a525b'; ctx.stroke();
      ctx.beginPath(); ctx.arc(52, 12, 11, Math.PI * 1.75, Math.PI * 2.2); ctx.strokeStyle = '#ff4a3a'; ctx.stroke();
      const na = Math.PI * 2.05 + Math.sin(t * 9) * 0.05;
      ctx.beginPath(); ctx.moveTo(52, 12); ctx.lineTo(52 + Math.cos(na) * 10, 12 + Math.sin(na) * 10); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      // blinking indicator
      const on = Math.sin(t * 6) > 0;
      if (on) { circlePath(ctx, 82, 0, 9); ctx.fillStyle = 'rgba(255,80,60,0.35)'; ctx.fill(); }
      circlePath(ctx, 82, 0, 4.5); fillStroke(ctx, on ? '#ff5a3a' : '#8a2a1e', 2.2);
      // feet shadow line + rivets
      ctx.fillStyle = rgba(INK, 0.3); ctx.fillRect(-94, 66, 188, 4);
      for (const x of [-88, 88]) { circlePath(ctx, x, 50, 2.4); ctx.fillStyle = '#5b636c'; ctx.fill(); }
      // rim band across the front + side wall rims up to the wall tops (-70)
      ctx.beginPath(); ctx.moveTo(-96, top); ctx.lineTo(96, top);
      ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#d6dde3'; ctx.stroke();
      for (const s of [-1, 1]) {
        rrPath(ctx, s > 0 ? 84 : -100, -70, 16, 70 + top + 2, 4);
        ctx.fillStyle = hgrad(ctx, s > 0 ? 84 : -100, s > 0 ? 100 : -84, [[0, '#a9b3bb'], [0.5, '#eef3f6'], [1, '#8a939b']]);
        ctx.fill(); strokeOnly(ctx);
      }
    },
  },
};

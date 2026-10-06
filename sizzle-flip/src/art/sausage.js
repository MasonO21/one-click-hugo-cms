// The hero: a squishy, expressive sausage drawn from the physics particle chain.
import { INK, rgba, lighten, darken, mix, circlePath, ellipsePath } from './common.js';

const TAU = Math.PI * 2;

export const SKINS = [
  { id: 'classic', name: 'Classic Frank', stars: 0, base: '#d9573b', dark: '#93301f', light: '#f2885c', spec: '#ffe0c4' },
  { id: 'brat', name: 'Bratwurst', stars: 15, base: '#ddae82', dark: '#a87447', light: '#f2d2ac', spec: '#fff3e2', pattern: 'herbs' },
  { id: 'chorizo', name: 'Chorizo', stars: 40, base: '#b42f26', dark: '#6e1712', light: '#d9533f', spec: '#ffb7a0', pattern: 'fat' },
  { id: 'veggie', name: 'Veggie Dog', stars: 70, base: '#8dbb4c', dark: '#567a26', light: '#b6dc78', spec: '#efffd2' },
  { id: 'corndog', name: 'Corn Dog', stars: 100, base: '#e0a13a', dark: '#a8681a', light: '#f5c869', spec: '#fff0c4', pattern: 'batter', stick: true },
  { id: 'deluxe', name: 'Mustard Deluxe', stars: 140, base: '#d9573b', dark: '#93301f', light: '#f2885c', spec: '#ffe0c4', pattern: 'mustard' },
  { id: 'weiss', name: 'Weisswurst', stars: 180, base: '#efe0d2', dark: '#c4a994', light: '#fff7ef', spec: '#ffffff', pattern: 'parsley' },
  { id: 'spicy', name: 'Ghost Pepper', stars: 220, base: '#e8331c', dark: '#8a1205', light: '#ff7a3d', spec: '#ffe08a', pattern: 'flames' },
  { id: 'galaxy', name: 'Cosmic Wiener', stars: 280, base: '#3b2a78', dark: '#1a1240', light: '#6a52c9', spec: '#d9ccff', pattern: 'stars' },
  { id: 'rainbow', name: 'Rainbow Link', stars: 360, base: '#e94f6b', dark: '#7a2140', light: '#ffa0b4', spec: '#ffffff', pattern: 'rainbow' },
  { id: 'gold', name: 'Golden Wiener', stars: 450, base: '#f2b822', dark: '#a8700a', light: '#ffe27a', spec: '#ffffff', pattern: 'gold' },
  { id: 'legend', name: 'The Legend', stars: 560, base: '#232323', dark: '#0b0b0b', light: '#4a4a4a', spec: '#ffd23f', pattern: 'legend' },
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));

// Build a smooth centreline (Catmull-Rom) through the particle chain.
function centreline(px, py, sub = 4) {
  const n = px.length;
  const out = [];
  const P = i => [px[Math.max(0, Math.min(n - 1, i))], py[Math.max(0, Math.min(n - 1, i))]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push(P(n - 1));
  // tangents, normals, arclength
  const m = out.length;
  const tx = new Float64Array(m), ty = new Float64Array(m), s = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(m - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
    if (i > 0) s[i] = s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
  }
  return { pts: out, tx, ty, s, len: s[m - 1] };
}

function sampleAt(cl, f) {
  const target = f * cl.len;
  const { pts, s } = cl;
  let i = 1;
  while (i < pts.length - 1 && s[i] < target) i++;
  const s0 = s[i - 1], s1 = s[i];
  const u = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
  const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u;
  const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u;
  const tx = cl.tx[i - 1] + (cl.tx[i] - cl.tx[i - 1]) * u, ty = cl.ty[i - 1] + (cl.ty[i] - cl.ty[i - 1]) * u;
  const l = Math.hypot(tx, ty) || 1;
  return { x, y, tx: tx / l, ty: ty / l, nx: -ty / l, ny: tx / l };
}

function bodyPath(ctx, cl, R) {
  const { pts, tx, ty } = cl;
  const m = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] - ty[0] * R, pts[0][1] + tx[0] * R);
  for (let i = 1; i < m; i++) ctx.lineTo(pts[i][0] - ty[i] * R, pts[i][1] + tx[i] * R);
  const ae = Math.atan2(ty[m - 1], tx[m - 1]);
  ctx.arc(pts[m - 1][0], pts[m - 1][1], R, ae + Math.PI / 2, ae - Math.PI / 2, true);
  for (let i = m - 1; i >= 0; i--) ctx.lineTo(pts[i][0] + ty[i] * R, pts[i][1] - tx[i] * R);
  const as = Math.atan2(ty[0], tx[0]);
  ctx.arc(pts[0][0], pts[0][1], R, as - Math.PI / 2, as - Math.PI * 1.5, true);
  ctx.closePath();
}

function strokeLine(ctx, cl, ox, oy, f0 = 0, f1 = 1) {
  const { pts, s, len } = cl;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pts.length; i++) {
    const f = s[i] / len;
    if (f < f0 || f > f1) continue;
    if (!started) { ctx.moveTo(pts[i][0] + ox, pts[i][1] + oy); started = true; }
    else ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
  }
}

// Visual squash: compress along main axis around the centre (aim anticipation).
export function squashPoints(px, py, k) {
  const n = px.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += px[i]; cy += py[i]; }
  cx /= n; cy /= n;
  let ax = px[n - 1] - px[0], ay = py[n - 1] - py[0];
  const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
  const ox = new Float64Array(n), oy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = px[i] - cx, dy = py[i] - cy;
    const along = dx * ax + dy * ay;
    const perp = -dx * ay + dy * ax;
    const a2 = along * (1 - k);
    // slight crouch: bow the middle down-ish relative to the body
    const bow = (1 - Math.pow((i / (n - 1)) * 2 - 1, 2)) * k * 10;
    ox[i] = cx + ax * a2 - ay * (perp + bow);
    oy[i] = cy + ay * a2 + ax * (perp + bow);
  }
  return [ox, oy];
}

export function makeFaceState() {
  return { side: null, blinkT: 2.5, blink: 0, expr: 'idle', exprT: 0, lookX: 1, lookY: 0, power: 0, sweat: 0 };
}

export function updateFace(face, dt, cl) {
  face.blinkT -= dt;
  if (face.blinkT <= 0) { face.blink = 0.14; face.blinkT = 1.8 + Math.random() * 3.5; }
  if (face.blink > 0) face.blink -= dt;
  if (face.exprT > 0) face.exprT -= dt;
}

// Main draw. px/py: particle positions. opts: {R, skin, face, t, squash}
export function drawSausage(ctx, px, py, opts) {
  const skin = opts.skin || SKINS[0];
  const k = opts.squash || 0;
  let R = opts.R;
  let X = px, Y = py;
  if (k > 0) { [X, Y] = squashPoints(px, py, k * 0.16); R = R * (1 + k * 0.12); }
  const cl = centreline(X, Y);
  const face = opts.face;
  const t = opts.t || 0;

  // corn dog stick (behind)
  if (skin.stick) {
    const e = sampleAt(cl, 0);
    const sx = e.x - e.tx * (R + 26), sy = e.y - e.ty * (R + 26);
    ctx.lineCap = 'round';
    ctx.lineWidth = 9; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(sx, sy); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = '#e9cf98';
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(sx, sy); ctx.stroke();
  }

  // casing twist nubs at both ends
  for (const end of [0, 1]) {
    const e = sampleAt(cl, end);
    const dir = end ? 1 : -1;
    if (skin.stick && end === 0) continue;
    const nx = e.x + e.tx * dir * (R + 1.5), ny = e.y + e.ty * dir * (R + 1.5);
    ctx.save();
    ctx.translate(nx, ny); ctx.rotate(Math.atan2(e.ty * dir, e.tx * dir));
    ctx.beginPath();
    ctx.moveTo(-2, -4.2); ctx.quadraticCurveTo(6, -4, 7.5, 0); ctx.quadraticCurveTo(6, 4, -2, 4.2); ctx.closePath();
    ctx.fillStyle = skin.dark; ctx.fill();
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }

  // outline
  bodyPath(ctx, cl, R + 2.2);
  ctx.fillStyle = INK; ctx.fill();

  ctx.save();
  bodyPath(ctx, cl, R);
  ctx.clip();
  // base dark (shadow side)
  ctx.fillStyle = skin.dark;
  ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (skin.pattern === 'rainbow') {
    const a = sampleAt(cl, 0), b = sampleAt(cl, 1);
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    ['#ff4d6d', '#ff9f1c', '#ffe14d', '#5fd35f', '#3fa7ff', '#9b5cff'].forEach((c, i, arr) => g.addColorStop(i / (arr.length - 1), c));
    strokeLine(ctx, cl, -R * 0.12, -R * 0.2);
    ctx.lineWidth = R * 1.75; ctx.strokeStyle = g; ctx.stroke();
  } else {
    // main body tone
    strokeLine(ctx, cl, -R * 0.12, -R * 0.22);
    ctx.lineWidth = R * 1.75; ctx.strokeStyle = skin.base; ctx.stroke();
    // light band
    strokeLine(ctx, cl, -R * 0.24, -R * 0.42);
    ctx.lineWidth = R * 0.95; ctx.strokeStyle = skin.light; ctx.stroke();
  }
  // pattern layers
  drawPattern(ctx, cl, R, skin, t);
  // rim light on shadow side
  strokeLine(ctx, cl, R * 0.62, R * 0.86, 0.05, 0.95);
  ctx.lineWidth = R * 0.18; ctx.strokeStyle = rgba(lighten(skin.base, 0.25), 0.35); ctx.stroke();
  // specular
  strokeLine(ctx, cl, -R * 0.34, -R * 0.56, 0.12, 0.62);
  ctx.lineWidth = R * 0.2; ctx.strokeStyle = rgba(skin.spec, 0.75); ctx.stroke();
  strokeLine(ctx, cl, -R * 0.34, -R * 0.56, 0.68, 0.74);
  ctx.stroke();
  ctx.restore();

  // face
  if (face) drawFace(ctx, cl, R, face, skin, t);
}

function drawPattern(ctx, cl, R, skin, t) {
  const p = skin.pattern;
  // grill marks for meaty skins
  if (!p || p === 'mustard' || p === 'herbs' || p === 'fat' || p === 'flames') {
    ctx.lineCap = 'round';
    for (const f of [0.14, 0.29, 0.44, 0.58]) {
      const s = sampleAt(cl, f);
      const ang = 0.55;
      const dx = s.nx * Math.cos(ang) + s.tx * Math.sin(ang), dy = s.ny * Math.cos(ang) + s.ty * Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(s.x - dx * R * 0.85, s.y - dy * R * 0.85);
      ctx.lineTo(s.x + dx * R * 0.85, s.y + dy * R * 0.85);
      ctx.lineWidth = R * 0.26; ctx.strokeStyle = rgba(darken(skin.dark, 0.45), 0.6); ctx.stroke();
    }
  }
  if (p === 'herbs' || p === 'parsley') {
    const col = p === 'herbs' ? '#5d6e2a' : '#4f9a3a';
    for (let i = 0; i < 14; i++) {
      const s = sampleAt(cl, 0.06 + (i * 0.618) % 0.88);
      const o = ((i * 0.37) % 1 - 0.5) * 1.4 * R;
      circlePath(ctx, s.x + s.nx * o, s.y + s.ny * o, R * 0.09 + (i % 3) * 0.6);
      ctx.fillStyle = col; ctx.fill();
    }
  }
  if (p === 'fat') {
    for (let i = 0; i < 16; i++) {
      const s = sampleAt(cl, 0.05 + (i * 0.618) % 0.9);
      const o = ((i * 0.43) % 1 - 0.5) * 1.5 * R;
      ellipsePath(ctx, s.x + s.nx * o, s.y + s.ny * o, R * 0.13, R * 0.09, i);
      ctx.fillStyle = 'rgba(255,226,210,0.8)'; ctx.fill();
    }
  }
  if (p === 'batter') {
    for (let i = 0; i < 18; i++) {
      const s = sampleAt(cl, 0.04 + (i * 0.618) % 0.92);
      const o = ((i * 0.29) % 1 - 0.5) * 1.6 * R;
      circlePath(ctx, s.x + s.nx * o, s.y + s.ny * o, R * 0.16);
      ctx.fillStyle = rgba(darken(skin.base, 0.25), 0.45); ctx.fill();
    }
  }
  if (p === 'mustard') {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const f = 0.08 + (i / 40) * 0.56;
      const s = sampleAt(cl, f);
      const o = Math.sin(i * 1.15) * R * 0.45 - R * 0.15;
      const x = s.x + s.nx * o, y = s.y + s.ny * o;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = R * 0.34; ctx.strokeStyle = '#7a5a00'; ctx.stroke();
    ctx.lineWidth = R * 0.22; ctx.strokeStyle = '#ffd21f'; ctx.stroke();
  }
  if (p === 'flames') {
    for (let i = 0; i < 4; i++) {
      const s = sampleAt(cl, 0.1 + i * 0.14);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.ty, s.tx));
      ctx.beginPath(); ctx.moveTo(-6, R * 0.6); ctx.quadraticCurveTo(-8, 0, 0, -R * 0.7); ctx.quadraticCurveTo(8, 0, 6, R * 0.6); ctx.closePath();
      ctx.fillStyle = 'rgba(255,214,61,0.75)'; ctx.fill();
      ctx.restore();
    }
  }
  if (p === 'stars') {
    for (let i = 0; i < 12; i++) {
      const s = sampleAt(cl, 0.05 + (i * 0.618) % 0.9);
      const o = ((i * 0.41) % 1 - 0.5) * 1.5 * R;
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 2);
      circlePath(ctx, s.x + s.nx * o, s.y + s.ny * o, (0.6 + (i % 3) * 0.5) * tw);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
  }
  if (p === 'gold' || p === 'legend') {
    const sh = (t * 0.5) % 1.6 - 0.3;
    const s = sampleAt(cl, Math.max(0, Math.min(1, sh)));
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.ty, s.tx) + 0.5);
    const g = ctx.createLinearGradient(-14, 0, 14, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, p === 'gold' ? 'rgba(255,255,255,0.75)' : 'rgba(255,210,63,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-14, -R * 2, 28, R * 4);
    ctx.restore();
    if (p === 'legend') {
      // flame stripe
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const s2 = sampleAt(cl, 0.05 + i / 30 * 0.6);
        const o = R * 0.35 + Math.sin(i * 1.7 + t * 6) * R * 0.12;
        if (i === 0) ctx.moveTo(s2.x + s2.nx * o, s2.y + s2.ny * o); else ctx.lineTo(s2.x + s2.nx * o, s2.y + s2.ny * o);
      }
      ctx.lineWidth = R * 0.3; ctx.strokeStyle = '#ff5a1f'; ctx.stroke();
      ctx.lineWidth = R * 0.12; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    }
  }
}

export function drawFace(ctx, cl, R, face, skin, t) {
  // face sits near the head end (particle N-1)
  const e1 = sampleAt(cl, 0.70), e2 = sampleAt(cl, 0.86), mid = sampleAt(cl, 0.78);
  // choose which side is "up" — smoothed sign keeps the face upright-ish
  const target = mid.ny < -0.3 ? 1 : mid.ny > 0.3 ? -1 : (face.side == null ? (mid.ny <= 0 ? 1 : -1) : Math.sign(face.side) || 1);
  if (face.side == null) face.side = target;
  else face.side += (target - face.side) * 0.18;
  const side = face.side;
  const squishY = Math.min(1, Math.abs(side) * 1.15);
  if (squishY < 0.15) return;
  const sgn = Math.sign(side) || 1;
  // "up" normal for face = n * sgn ( n = (-ty, tx) ). n points to screen-up when ny<0.
  const up = (s) => [s.nx * sgn, s.ny * sgn];
  const ux = up(mid)[0], uy = up(mid)[1];
  const ang = Math.atan2(ux, -uy); // rotation so local -y aligns with up
  const expr = face.expr;
  const er = R * 0.47;
  const eyeOff = R * 0.18;
  const eyes = [e1, e2].map(s => [s.x + up(s)[0] * eyeOff, s.y + up(s)[1] * eyeOff]);
  const blink = face.blink > 0;

  ctx.save();
  // blush
  for (const [i, s] of [[0, e1], [1, e2]]) {
    const off = i === 0 ? -1 : 1;
    const bx = s.x - up(s)[0] * R * 0.38 + s.tx * off * R * 0.25, by = s.y - up(s)[1] * R * 0.38 + s.ty * off * R * 0.25;
    ellipsePath(ctx, bx, by, R * 0.26, R * 0.14 * squishY, Math.atan2(s.ty, s.tx));
    ctx.fillStyle = expr === 'win' ? 'rgba(255,90,110,0.55)' : 'rgba(255,110,120,0.32)'; ctx.fill();
  }

  // eyes
  let eyeKind = 'open';
  if (expr === 'win' || expr === 'happy') eyeKind = 'happy';
  else if (expr === 'fail') eyeKind = 'x';
  else if (expr === 'dizzy') eyeKind = 'spiral';
  else if (expr === 'wide' || expr === 'scared') eyeKind = 'wide';
  else if (expr === 'aim' && face.power > 0.55) eyeKind = 'squint';
  if (blink && (eyeKind === 'open' || eyeKind === 'wide' || eyeKind === 'squint')) eyeKind = 'closed';

  const look = [face.lookX, face.lookY];
  const ll = Math.hypot(look[0], look[1]) || 1;
  const lx = look[0] / ll, ly = look[1] / ll;

  eyes.forEach(([x, y], idx) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1, squishY);
    const r = eyeKind === 'wide' ? er * 1.15 : er;
    if (eyeKind === 'open' || eyeKind === 'wide' || eyeKind === 'squint') {
      circlePath(ctx, 0, 0, r);
      ctx.fillStyle = '#fffaf2'; ctx.fill();
      ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
      // pupil (look direction is in world space; undo rotation)
      const ca = Math.cos(-ang), sa = Math.sin(-ang);
      const plx = (lx * ca - ly * sa), ply = (lx * sa + ly * ca) / squishY;
      const pr = eyeKind === 'wide' ? r * 0.38 : r * 0.55;
      const pm = r - pr - 0.8;
      circlePath(ctx, plx * pm, Math.max(-pm, Math.min(pm, ply * pm)), pr);
      ctx.fillStyle = '#1d120c'; ctx.fill();
      circlePath(ctx, plx * pm - pr * 0.35, Math.max(-pm, Math.min(pm, ply * pm)) - pr * 0.4, pr * 0.32);
      ctx.fillStyle = '#fff'; ctx.fill();
      if (eyeKind === 'squint') {
        // heavy lid
        ctx.beginPath(); ctx.rect(-r - 2, -r - 2, r * 2 + 4, r * 0.95);
        ctx.fillStyle = skin.base; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r, -r * 0.08); ctx.lineTo(r, -r * 0.08);
        ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
      }
    } else if (eyeKind === 'closed') {
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.quadraticCurveTo(0, r * 0.45, r * 0.8, 0);
      ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    } else if (eyeKind === 'happy') {
      ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.25); ctx.quadraticCurveTo(0, -r * 0.9, r * 0.8, r * 0.25);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    } else if (eyeKind === 'x') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
      ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    } else if (eyeKind === 'spiral') {
      circlePath(ctx, 0, 0, r); ctx.fillStyle = '#fffaf2'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath();
      for (let a = 0; a < 12; a += 0.3) {
        const rr = a / 12 * r * 0.85;
        const aa = a + t * 9 * (idx ? -1 : 1);
        if (a === 0) ctx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); else ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      ctx.lineWidth = 1.6; ctx.stroke();
    }
    // brows
    if (expr === 'aim' || expr === 'scared') {
      const dir = idx === 0 ? 1 : -1; // inner side toward the other eye
      const tilt = expr === 'aim' ? 0.45 : -0.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 1.25 - dir * tilt * r * 0.5);
      ctx.lineTo(r * 0.9, -r * 1.25 + dir * tilt * r * 0.5);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();
  });

  // mouth
  const m = sampleAt(cl, 0.78);
  const mx = m.x - up(m)[0] * R * 0.42, my = m.y - up(m)[1] * R * 0.42;
  ctx.save();
  ctx.translate(mx, my); ctx.rotate(ang); ctx.scale(1, squishY);
  const mw = R * 0.42;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let mouth = 'smile';
  if (expr === 'aim') mouth = face.power > 0.55 ? 'teeth' : 'flat';
  else if (expr === 'wide') mouth = 'open';
  else if (expr === 'scared' || expr === 'fail') mouth = 'wavy';
  else if (expr === 'win' || expr === 'happy') mouth = 'grin';
  else if (expr === 'dizzy') mouth = 'wavy';
  if (mouth === 'smile') {
    ctx.beginPath(); ctx.moveTo(-mw, -1); ctx.quadraticCurveTo(0, mw * 0.9, mw, -1);
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  } else if (mouth === 'flat') {
    ctx.beginPath(); ctx.moveTo(-mw * 0.7, 1); ctx.lineTo(mw * 0.7, 0);
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  } else if (mouth === 'teeth') {
    ctx.beginPath(); ctx.rect(-mw * 0.8, -mw * 0.35, mw * 1.6, mw * 0.7);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-mw * 0.8, 0); ctx.lineTo(mw * 0.8, 0);
    for (let i = -1; i <= 1; i++) { ctx.moveTo(i * mw * 0.4, -mw * 0.35); ctx.lineTo(i * mw * 0.4, mw * 0.35); }
    ctx.lineWidth = 1.2; ctx.stroke();
  } else if (mouth === 'open' || mouth === 'grin') {
    ctx.beginPath();
    if (mouth === 'open') ctx.ellipse(0, mw * 0.2, mw * 0.55, mw * 0.65, 0, 0, TAU);
    else { ctx.moveTo(-mw * 1.05, -mw * 0.15); ctx.quadraticCurveTo(0, mw * 1.6, mw * 1.05, -mw * 0.15); ctx.closePath(); }
    ctx.fillStyle = '#5a1414'; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.clip();
    ellipsePath(ctx, 0, mw * 0.8, mw * 0.6, mw * 0.4); ctx.fillStyle = '#ff7a8a'; ctx.fill();
    ctx.restore();
  } else if (mouth === 'wavy') {
    ctx.beginPath(); ctx.moveTo(-mw, mw * 0.2);
    for (let i = 1; i <= 6; i++) ctx.lineTo(-mw + i * mw / 3, mw * 0.2 + (i % 2 ? -1 : 1) * mw * 0.22);
    ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();

  // sweat drop when straining
  if (expr === 'aim' && face.power > 0.85) {
    const s = sampleAt(cl, 0.95);
    const x = s.x + up(s)[0] * R * 1.25, y = s.y + up(s)[1] * R * 1.25;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(5, 2, 0, 5); ctx.quadraticCurveTo(-5, 2, 0, -6);
    ctx.fillStyle = '#9fdcff'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Ground shadow under the sausage, projected to the surface below.
export function drawSausageShadow(ctx, cx, cy, groundY, len) {
  if (groundY == null) return;
  const h = groundY - cy;
  if (h < 0 || h > 900) return;
  const a = Math.max(0, 0.32 * (1 - h / 900));
  const w = len * 0.55 * (1 + h / 900);
  const g = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, w);
  g.addColorStop(0, `rgba(30,12,4,${a})`);
  g.addColorStop(1, 'rgba(30,12,4,0)');
  ctx.save();
  ctx.translate(cx, groundY); ctx.scale(1, 0.22); ctx.translate(-cx, -groundY);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, groundY, w, 0, TAU); ctx.fill();
  ctx.restore();
}

export { centreline, sampleAt };

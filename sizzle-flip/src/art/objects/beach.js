// Beach props: umbrella, sandcastle, beach ball, crab, surfboard, lifeguard chair, seagull, bucket, palm, buoy.
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

// 4-point sparkle star.
function sparkle(ctx, x, y, s, a = 1, col = '#ffffff') {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.25, -s * 0.25); ctx.lineTo(s, 0); ctx.lineTo(s * 0.25, s * 0.25);
  ctx.lineTo(0, s); ctx.lineTo(-s * 0.25, s * 0.25); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.25, -s * 0.25); ctx.closePath();
  ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill();
  ctx.restore();
}

// Little five-armed starfish.
function starfish(ctx, x, y, r, rot, col = '#ff8a3d', lw = 2.5) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  fillStroke(ctx, col, lw);
  ctx.fillStyle = rgba('#fff3d0', 0.8);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * TAU / 5;
    circlePath(ctx, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, Math.max(0.8, r * 0.09)); ctx.fill();
  }
  ctx.restore();
}

// Scallop seashell (fan shape).
function shell(ctx, x, y, s, rot, col = '#ffb3c1') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-14, 2, -12, -10, 0, -11);
  ctx.bezierCurveTo(12, -10, 14, 2, 0, 8);
  ctx.closePath();
  fillStroke(ctx, col, 2.2 / s);
  ctx.strokeStyle = rgba(darken(col, 0.4), 0.7); ctx.lineWidth = 1.3 / s;
  for (const k of [-0.9, -0.45, 0, 0.45, 0.9]) {
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(Math.sin(k) * 11, -Math.cos(k) * 9); ctx.stroke();
  }
  rrc(ctx, 0, 8, 8, 4, 2); fillStroke(ctx, darken(col, 0.1), 1.8 / s);
  ctx.restore();
}

// Sand speckles inside the current clip.
function speckle(ctx, x0, y0, w, h, n, seed, col) {
  const r = rng(seed);
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const px = x0 + r() * w, py = y0 + r() * h, s = 0.8 + r() * 1.6;
    ctx.fillRect(px, py, s, s);
  }
}

// ---------------------------------------------------------------------------
// Beach ball: a real 3D-projected 6 panel ball (pole tilted toward the viewer).
// ---------------------------------------------------------------------------
const BALL_COLS = ['#ff4b4b', '#fffaf0', '#2e8cff', '#ffd23a', '#fffaf0', '#3fcf6a'];
function ballPoint(R, th, ph, ax, az) {
  // sphere point, pole at top (y=-1), z toward the viewer
  let x = Math.sin(th) * Math.cos(ph), y = -Math.cos(th), z = Math.sin(th) * Math.sin(ph);
  // tilt the pole toward the viewer
  const y1 = y * Math.cos(ax) - z * Math.sin(ax), z1 = y * Math.sin(ax) + z * Math.cos(ax);
  y = y1; z = z1;
  const x2 = x * Math.cos(az) - y * Math.sin(az), y2 = x * Math.sin(az) + y * Math.cos(az);
  return [x2 * R, y2 * R, z];
}
function ballUnproject(x, y, z, ax, az) {
  const x1 = x * Math.cos(az) + y * Math.sin(az), y1 = -x * Math.sin(az) + y * Math.cos(az);
  return [x1, y1 * Math.cos(ax) + z * Math.sin(ax), -y1 * Math.sin(ax) + z * Math.cos(ax)];
}
function drawBeachBall(ctx, R, spin = 0, cols = BALL_COLS) {
  const ax = -0.62, az = -0.42;
  const N = 6, S = 28;
  // visible part of a meridian (pole -> limb crossing) + the limb angle where it leaves
  const meridian = (ph) => {
    const pts = [];
    let prev = null;
    for (let k = 0; k <= S; k++) {
      const th = k / S * Math.PI;
      const p = ballPoint(R, th, ph, ax, az);
      if (p[2] < 0) {
        // bisect for the crossing
        let lo = (k - 1) / S * Math.PI, hi = th;
        for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (ballPoint(R, mid, ph, ax, az)[2] >= 0) lo = mid; else hi = mid; }
        const c = ballPoint(R, lo, ph, ax, az);
        pts.push([c[0], c[1]]);
        return { pts, a: Math.atan2(c[1], c[0]) };
      }
      pts.push([p[0], p[1]]); prev = p;
    }
    return { pts, a: Math.atan2(prev[1], prev[0]) };
  };
  const norm = a => ((a % TAU) + TAU) % TAU;
  ctx.save();
  circlePath(ctx, 0, 0, R); ctx.fillStyle = cols[1]; ctx.fill();
  circlePath(ctx, 0, 0, R); ctx.clip();
  const mers = [];
  for (let i = 0; i <= N; i++) mers.push(meridian(spin + i * TAU / N));
  for (let i = 0; i < N; i++) {
    const m1 = mers[i], m2 = mers[i + 1];
    const p1 = spin + i * TAU / N, span = TAU / N;
    // pick the limb arc direction whose midpoint lies inside this lune
    let a1 = m1.a, a2 = m2.a;
    let up = a2; while (up < a1) up += TAU;
    const mid = (a1 + up) / 2;
    const q = ballUnproject(Math.cos(mid), Math.sin(mid), 0, ax, az);
    const lon = Math.atan2(q[2], q[0]);
    const inside = norm(lon - p1) < span;
    ctx.beginPath();
    m1.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.arc(0, 0, R + 1, a1, a2, !inside);
    for (let k = m2.pts.length - 1; k >= 0; k--) ctx.lineTo(m2.pts[k][0], m2.pts[k][1]);
    ctx.closePath();
    ctx.fillStyle = cols[i % cols.length]; ctx.fill();
  }
  // seams
  ctx.strokeStyle = rgba(INK, 0.5); ctx.lineWidth = 1.8;
  for (let i = 0; i < N; i++) {
    ctx.beginPath();
    mers[i].pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  // pole cap
  ctx.beginPath();
  for (let k = 0; k <= 24; k++) {
    const [x, y] = ballPoint(R, 0.3, k / 24 * TAU, ax, az);
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = '#fffaf0'; ctx.fill(); strokeOnly(ctx, 2.2);
  const [vx, vy] = ballPoint(R, 0, 0, ax, az);
  ellipsePath(ctx, vx, vy, 3.2, 2.2, az); ctx.fillStyle = '#e8e0d0'; ctx.fill(); strokeOnly(ctx, 1.5);
  // shading crescent
  ctx.beginPath();
  ctx.arc(0, 0, R + 3, 0, TAU);
  ctx.arc(-R * 0.2, -R * 0.26, R * 0.96, 0, TAU, true);
  ctx.fillStyle = 'rgba(40,20,60,0.22)'; ctx.fill('evenodd');
  // rim light
  ctx.beginPath(); ctx.arc(0, 0, R - 4, 0.15, 1.35); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  ctx.restore();
  // speculars
  ellipsePath(ctx, -R * 0.42, -R * 0.36, R * 0.2, R * 0.11, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
  circlePath(ctx, -R * 0.2, -R * 0.58, R * 0.05); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
  circlePath(ctx, 0, 0, R); strokeOnly(ctx);
}

// ---------------------------------------------------------------------------
// Crab claw: palm at origin, pincers pointing along +x.
// ---------------------------------------------------------------------------
function crabClaw(ctx, x, y, ang, open, col, mirror) {
  ctx.save(); ctx.translate(x, y); ctx.scale(mirror ? -1 : 1, 1); ctx.rotate(ang);
  const dark = darken(col, 0.2);
  // lower (moving) pincer
  ctx.save(); ctx.translate(6, 2); ctx.rotate(open);
  ctx.beginPath(); ctx.moveTo(-2, -1); ctx.bezierCurveTo(6, 10, 18, 9, 22, 0); ctx.bezierCurveTo(14, 3, 6, 1, 2, -4); ctx.closePath();
  fillStroke(ctx, dark, 3);
  ctx.restore();
  // upper pincer
  ctx.save(); ctx.translate(6, -2); ctx.rotate(-open * 0.35);
  ctx.beginPath(); ctx.moveTo(-4, 4); ctx.bezierCurveTo(2, -14, 20, -14, 26, -1); ctx.bezierCurveTo(18, -4, 8, -2, 2, 6); ctx.closePath();
  fillStroke(ctx, col, 3);
  // teeth
  ctx.fillStyle = '#fff6ea';
  for (const tx of [10, 16]) { ctx.beginPath(); ctx.moveTo(tx - 2, -3.6); ctx.lineTo(tx, 0.5); ctx.lineTo(tx + 2, -3.8); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // palm
  ellipsePath(ctx, 0, 0, 12, 10, 0); fillStroke(ctx, col, 3);
  ellipsePath(ctx, -3, -4, 4, 2.4, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Palm fronds.
// ---------------------------------------------------------------------------
function leaflet(ctx, x, y, ang, len, wid, col, lw = 2.2) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -wid / 2);
  ctx.quadraticCurveTo(len * 0.5, -wid * 0.75, len, 0);
  ctx.quadraticCurveTo(len * 0.5, wid * 0.75, 0, wid / 2);
  ctx.closePath();
  fillStroke(ctx, col, lw);
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.8, 0);
  ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(230,255,170,0.45)'; ctx.stroke();
  ctx.restore();
}

// Bouncy frond pad in pad-local space: x from -60 (crown end) to +60 (outer end),
// collision top edge at y=-9, bottom at y=+9.
function frondPad(ctx, t, seed) {
  const r = rng(seed);
  for (let row = 0; row < 2; row++) {
    const n = row ? 9 : 10;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const x = -50 + k * 106 + row * 6;
      const len = (48 - k * 18 + r() * 6) * (row ? 0.78 : 1);
      const ang = 1.25 - k * 0.5 + (row ? 0.18 : 0) + Math.sin(t * 2.4 + i * 0.6 + row) * 0.05;
      leaflet(ctx, x, 3, ang, len, 14, row ? '#4cc055' : '#2c9440', 2.4);
    }
  }
  // blade
  const blade = () => {
    ctx.beginPath();
    ctx.moveTo(-62, -9);
    ctx.lineTo(54, -9);
    ctx.quadraticCurveTo(68, -9, 78, -17);       // springy up-curled tip
    ctx.quadraticCurveTo(74, -1, 58, 7);
    ctx.quadraticCurveTo(10, 12, -62, 9);
    ctx.closePath();
  };
  blade(); ctx.fillStyle = '#45b84e'; ctx.fill();
  ctx.save(); blade(); ctx.clip();
  ctx.fillStyle = 'rgba(20,90,40,0.35)'; ctx.fillRect(-70, 3, 150, 12);
  ctx.fillStyle = '#8fdc5c'; ctx.fillRect(-70, -10, 150, 6);
  ctx.strokeStyle = 'rgba(20,80,30,0.35)'; ctx.lineWidth = 1.6;
  for (let x = -54; x < 60; x += 9) { ctx.beginPath(); ctx.moveTo(x, -3); ctx.lineTo(x + 6, 10); ctx.stroke(); }
  ctx.restore();
  blade(); strokeOnly(ctx);
  // midrib
  ctx.beginPath(); ctx.moveTo(-60, -5); ctx.quadraticCurveTo(24, -5, 72, -13);
  ctx.lineWidth = 2.6; ctx.strokeStyle = '#e4f59a'; ctx.stroke();
}

// A big drooping decorative frond: an arching spine with a bold serrated leaflet fringe.
function featherFrond(ctx, x0, y0, cx, cy, x1, y1, depth, col, colHi) {
  const N = 16;
  const pt = k => [(1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * cx + k * k * x1, (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * cy + k * k * y1];
  const dir = x1 > x0 ? 1 : -1;
  const up = [], low = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const [px, py] = pt(k), [qx, qy] = pt(Math.min(1, k + 0.01)), [ox, oy] = pt(Math.max(0, k - 0.01));
    let tx = qx - ox, ty = qy - oy; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = dir * -ty, ny = dir * tx;  // normal toward the lower side
    const d = depth * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, k * 1.1 + 0.06)));
    const tooth = i % 2 ? 1 : 0.32, lean = i % 2 ? 9 : 0;
    low.push([px + nx * d * tooth + tx * lean, py + ny * d * tooth + ty * lean]);
    up.push([px - nx * d * 0.62 * tooth + tx * lean, py - ny * d * 0.62 * tooth + ty * lean]);
  }
  const path = () => {
    ctx.beginPath();
    up.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = low.length - 1; i >= 0; i--) ctx.lineTo(low[i][0], low[i][1]);
    ctx.closePath();
  };
  path(); ctx.fillStyle = col; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.strokeStyle = rgba(colHi, 0.8); ctx.lineWidth = 2;
  for (let i = 1; i < N; i += 2) {
    const [px, py] = pt(i / N);
    ctx.beginPath(); ctx.moveTo(low[i][0], low[i][1]); ctx.lineTo(px, py); ctx.lineTo(up[i][0], up[i][1]); ctx.stroke();
  }
  ctx.restore();
  path(); strokeOnly(ctx, 3);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = 3; ctx.strokeStyle = '#b6e27a'; ctx.lineCap = 'round'; ctx.stroke();
}

export const BEACH_ART = {
  // ======================= Umbrella (bouncy canopy) =======================
  umbrella: {
    draw(ctx, o) {
      const pals = [['#ff5a5f', '#fff7ec'], ['#2fb8cf', '#fff7ec'], ['#ffb12e', '#fff7ec'], ['#9b6cf0', '#fff7ec']];
      const [ca, cb] = pals[(o.v || 0) % pals.length];
      // sand mound at the base
      ellipsePath(ctx, 0, 130, 34, 8); fillStroke(ctx, '#f0d08f', 3);
      ellipsePath(ctx, -8, 127, 14, 3); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      // pole with candy stripes
      rod(ctx, 0, -100, 0, 128, 10, '#fbf4e6');
      ctx.save();
      ctx.beginPath(); ctx.rect(-5, -100, 10, 228); ctx.clip();
      ctx.fillStyle = ca;
      for (let y = -96; y < 130; y += 22) {
        ctx.beginPath(); ctx.moveTo(-6, y); ctx.lineTo(6, y - 6); ctx.lineTo(6, y + 3); ctx.lineTo(-6, y + 9); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-3.5, -100, 2.4, 228);
      ctx.restore();
      // tilt joint + collar
      rrc(ctx, 0, 4, 14, 12, 3); fillStroke(ctx, '#c9ced3', 3);
      rrc(ctx, 0, -50, 16, 9, 3); fillStroke(ctx, '#c9ced3', 3);
      // ribs under the canopy
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        for (const rx of [52, 98]) {
          ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(s * rx, -70 + (rx > 60 ? 0 : -2));
          ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = '#d7dce0'; ctx.stroke();
        }
      }
      // canopy shape: taut panels between ribs on top, scalloped hem below
      const canopy = () => {
        ctx.beginPath();
        ctx.moveTo(-115, -70);
        ctx.quadraticCurveTo(-86, -91, -60, -115);
        ctx.quadraticCurveTo(-29, -121, 0, -130);
        ctx.quadraticCurveTo(29, -121, 60, -115);
        ctx.quadraticCurveTo(86, -91, 115, -70);
        const n = 6;
        for (let i = n - 1; i >= 0; i--) {
          const xa = -115 + (i + 1) * 230 / n, xb = -115 + i * 230 / n;
          ctx.quadraticCurveTo((xa + xb) / 2, -56, xb, -70);
        }
        ctx.closePath();
      };
      canopy(); ctx.fillStyle = cb; ctx.fill();
      ctx.save(); canopy(); ctx.clip();
      // wedge panels
      const xs = [-115, -76.7, -38.3, 0, 38.3, 76.7, 115];
      for (let i = 0; i < 6; i++) {
        if (i % 2) continue;
        const a = xs[i], b = xs[i + 1];
        ctx.beginPath();
        ctx.moveTo(0, -136);
        ctx.quadraticCurveTo(a * 0.82, -130 + Math.abs(a) * 0.12, a * 1.25, -50);
        ctx.lineTo(b * 1.25, -50);
        ctx.quadraticCurveTo(b * 0.82, -130 + Math.abs(b) * 0.12, 0, -136);
        ctx.closePath();
        ctx.fillStyle = ca; ctx.fill();
      }
      // seams
      ctx.strokeStyle = rgba(INK, 0.35); ctx.lineWidth = 1.6;
      for (const a of xs.slice(1, -1)) {
        ctx.beginPath(); ctx.moveTo(0, -132); ctx.quadraticCurveTo(a * 0.82, -130 + Math.abs(a) * 0.12, a * 1.25, -50); ctx.stroke();
      }
      // underside shade + top highlight
      ctx.fillStyle = vgrad(ctx, -100, -56, [[0, 'rgba(60,20,40,0)'], [1, 'rgba(60,20,40,0.32)']]);
      ctx.fillRect(-120, -100, 240, 50);
      ctx.beginPath(); ctx.moveTo(-96, -82); ctx.quadraticCurveTo(-60, -112, -10, -122);
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
      // hem trim
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const xa = -115 + i * 230 / 6, xb = xa + 230 / 6;
        ctx.moveTo(xa, -70); ctx.quadraticCurveTo((xa + xb) / 2, -56, xb, -70);
      }
      ctx.lineWidth = 5; ctx.strokeStyle = rgba(darken(ca, 0.15), 0.9); ctx.stroke();
      ctx.restore();
      canopy(); strokeOnly(ctx);
      // rib tips
      for (const x of [-115, 115]) { circlePath(ctx, x, -70, 3.5); fillStroke(ctx, '#d7dce0', 2); }
      // finial
      toonCircle(ctx, 0, -134, 5, '#e8b56d', { lw: 3, spec: false });
    },
  },

  // ======================= Sandcastle =======================
  sandcastle: {
    draw(ctx, o) {
      const SAND = '#f1cd86', SD = '#d6a85c', SL = '#fbe3ad';
      // flag on the outer side of the right tower
      ctx.save(); ctx.translate(92, -46); ctx.rotate(0.42);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -46); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8c58a'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -46); ctx.quadraticCurveTo(12, -44, 22, -38); ctx.quadraticCurveTo(12, -36, 1, -32); ctx.closePath();
      fillStroke(ctx, '#ff5a5f', 2.5);
      ctx.restore();
      // base (collision box: -100..100, -5..75)
      const base = () => rrPath(ctx, -100, -5, 200, 80, 6);
      base(); ctx.fillStyle = SAND; ctx.fill();
      ctx.save(); base(); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -5, 75, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(160,110,40,0.12)'], [1, 'rgba(120,80,30,0.38)']]);
      ctx.fillRect(-100, -5, 200, 80);
      // mold ridges
      ctx.strokeStyle = rgba(darken(SAND, 0.4), 0.28); ctx.lineWidth = 2;
      for (const y of [18, 44]) { ctx.beginPath(); ctx.moveTo(-100, y); for (let x = -100; x <= 100; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.2) * 1.5); ctx.stroke(); }
      speckle(ctx, -100, -5, 200, 80, 90, 11, rgba(darken(SAND, 0.45), 0.35));
      speckle(ctx, -100, -5, 200, 80, 40, 12, 'rgba(255,255,255,0.55)');
      // wet sand at the bottom
      ctx.fillStyle = rgba('#b8874a', 0.45);
      ctx.beginPath(); ctx.moveTo(-100, 62);
      for (let x = -100; x <= 100; x += 10) ctx.lineTo(x, 62 + Math.sin(x * 0.3) * 2.5);
      ctx.lineTo(100, 80); ctx.lineTo(-100, 80); ctx.closePath(); ctx.fill();
      // top highlight
      ctx.fillStyle = rgba(SL, 0.9); ctx.fillRect(-100, -5, 200, 6);
      ctx.restore();
      base(); strokeOnly(ctx);
      // gate arch in the middle
      ctx.beginPath(); ctx.moveTo(-17, 75); ctx.lineTo(-17, 36); ctx.arc(0, 36, 17, Math.PI, 0); ctx.lineTo(17, 75); ctx.closePath();
      ctx.fillStyle = '#8a5a2c'; ctx.fill(); strokeOnly(ctx, 3.5);
      ctx.beginPath(); ctx.moveTo(-12, 75); ctx.lineTo(-12, 38); ctx.arc(0, 38, 12, Math.PI, 0); ctx.lineTo(12, 75); ctx.closePath();
      ctx.fillStyle = '#5b3a1c'; ctx.fill();
      ctx.strokeStyle = rgba('#2a160a', 0.6); ctx.lineWidth = 1.5;
      for (const gx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(gx, 28); ctx.lineTo(gx, 75); ctx.stroke(); }
      // seashells & starfish on the walls
      shell(ctx, -62, 30, 1.0, -0.25, '#ffb3c1');
      shell(ctx, 58, 50, 0.85, 0.3, '#fff0d8');
      starfish(ctx, 62, 18, 9, 0.3, '#ff8a3d');
      starfish(ctx, -40, 56, 7, -0.2, '#ffcf3a');
      circlePath(ctx, -82, 52, 3); fillStroke(ctx, '#a99a8a', 1.8);
      circlePath(ctx, 34, 60, 2.5); fillStroke(ctx, '#c7b8a5', 1.8);
      // towers (collision boxes: x ±30..±90, y -70..0)
      for (const s of [-1, 1]) {
        const cx = s * 60;
        const tower = () => {
          ctx.beginPath();
          ctx.moveTo(cx - 30, -70); ctx.lineTo(cx + 30, -70);
          ctx.lineTo(cx + 30, -58); ctx.lineTo(cx + 27, -54);
          ctx.lineTo(cx + 29, -4); ctx.quadraticCurveTo(cx + 31, 0, cx + 34, 0);
          ctx.lineTo(cx - 34, 0); ctx.quadraticCurveTo(cx - 31, 0, cx - 29, -4);
          ctx.lineTo(cx - 27, -54); ctx.lineTo(cx - 30, -58);
          ctx.closePath();
        };
        tower(); ctx.fillStyle = SAND; ctx.fill();
        ctx.save(); tower(); ctx.clip();
        ctx.fillStyle = hgrad(ctx, cx - 30, cx + 30, [[0, 'rgba(255,255,255,0.18)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(120,80,30,0.25)']]);
        ctx.fillRect(cx - 32, -72, 64, 74);
        ctx.fillStyle = rgba(darken(SAND, 0.3), 0.3); ctx.fillRect(cx - 32, -58, 64, 4);
        // battlement blocks on the rim band
        ctx.fillStyle = rgba(SL, 0.9); ctx.fillRect(cx - 32, -70, 64, 4);
        ctx.strokeStyle = rgba(darken(SAND, 0.45), 0.4); ctx.lineWidth = 2;
        for (const k of [-10, 10]) { ctx.beginPath(); ctx.moveTo(cx + k, -66); ctx.lineTo(cx + k, -58); ctx.stroke(); }
        speckle(ctx, cx - 30, -70, 60, 70, 34, 20 + s, rgba(darken(SAND, 0.45), 0.35));
        // drips from the rim
        ctx.fillStyle = rgba(SD, 0.55);
        for (const [dx, dl] of [[-18, 10], [-4, 16], [14, 8]]) {
          ctx.beginPath(); ctx.moveTo(cx + dx - 4, -54); ctx.quadraticCurveTo(cx + dx - 3, -54 + dl, cx + dx, -54 + dl + 2);
          ctx.quadraticCurveTo(cx + dx + 3, -54 + dl, cx + dx + 4, -54); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        tower(); strokeOnly(ctx);
        // arched window
        ctx.beginPath(); ctx.moveTo(cx - 6, -16); ctx.lineTo(cx - 6, -32); ctx.arc(cx, -32, 6, Math.PI, 0); ctx.lineTo(cx + 6, -16); ctx.closePath();
        ctx.fillStyle = '#6b4321'; ctx.fill(); strokeOnly(ctx, 2.5);
      }
      shell(ctx, 60, -42, 0.7, 0.1, '#ffd0a8');
      shell(ctx, -60, -42, 0.7, -0.1, '#c9e8ff');
    },
  },

  // ======================= Beach ball =======================
  beachball: {
    draw(ctx, o) {
      drawBeachBall(ctx, 50, (o.v || 0) * 0.7);
    },
  },

  // ======================= Crab (hazard) =======================
  crab: {
    draw(ctx, o, t) {
      const col = '#ff5a3a', dark = darken(col, 0.25);
      const sc = t * 14;
      // legs (scuttling)
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const ph = sc + i * 2.1 + (s > 0 ? Math.PI : 0);
          const lift = Math.max(0, Math.sin(ph)) * 4;
          const sx = s * (22 + i * 6), sy = 14 + i * 2;
          const kx = s * (38 + i * 4) + Math.cos(ph) * 2, ky = 8 + i * 4 - lift;
          const fx = s * (44 + i * 3) + Math.cos(ph) * 3.5, fy = 30 - lift;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
          ctx.lineWidth = 4.5; ctx.strokeStyle = dark; ctx.stroke();
        }
      }
      // arms + claws (snapping)
      const open = 0.08 + 0.42 * Math.pow(0.5 + 0.5 * Math.sin(t * 7), 2);
      for (const s of [-1, 1]) {
        const ex = s * 40, ey = -12;
        ctx.beginPath(); ctx.moveTo(s * 26, 0); ctx.quadraticCurveTo(s * 38, 2, ex, ey);
        ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke();
        crabClaw(ctx, ex, ey, -0.95, s > 0 ? open : 0.08 + 0.42 * Math.pow(0.5 + 0.5 * Math.sin(t * 7 + 1.4), 2), col, s < 0);
      }
      // eye stalks
      for (const s of [-1, 1]) {
        rod(ctx, s * 9, -6, s * 12, -20, 4, col);
      }
      // shell body
      ellipsePath(ctx, 0, 7, 38, 19);
      ctx.fillStyle = col; ctx.fill();
      ctx.save(); ellipsePath(ctx, 0, 7, 38, 19); ctx.clip();
      ctx.fillStyle = rgba(darken(col, 0.5), 0.28); ctx.fillRect(-40, 14, 80, 20);
      ctx.fillStyle = rgba(lighten(col, 0.6), 0.45);
      ellipsePath(ctx, -6, -4, 24, 6); ctx.fill();
      // shell spots
      ctx.fillStyle = rgba(lighten(col, 0.5), 0.7);
      for (const [px, py, pr] of [[-24, 4, 3], [22, 2, 3.5], [-14, -4, 2], [28, 12, 2]]) { circlePath(ctx, px, py, pr); ctx.fill(); }
      ctx.restore();
      ellipsePath(ctx, 0, 7, 38, 19); strokeOnly(ctx);
      // grumpy mouth
      ctx.beginPath(); ctx.moveTo(-8, 15); ctx.quadraticCurveTo(0, 10, 8, 15);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 12.6); ctx.lineTo(5, 16); ctx.lineTo(6.5, 13.5); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
      // blush
      ctx.fillStyle = 'rgba(255,190,190,0.6)';
      ellipsePath(ctx, -20, 10, 5, 2.6); ctx.fill(); ellipsePath(ctx, 20, 10, 5, 2.6); ctx.fill();
      // eyes
      const blink = (t * 0.6) % 1 > 0.94 ? 0.2 : 1;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * 12, -24); ctx.scale(1, blink);
        circlePath(ctx, 0, 0, 7); fillStroke(ctx, '#ffffff', 3);
        circlePath(ctx, s * -1.5 + 1, 1.5, 3.4); ctx.fillStyle = INK; ctx.fill();
        circlePath(ctx, s * -1.5 + 2.2, 0.2, 1.1); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.restore();
        // angry brows
        ctx.beginPath(); ctx.moveTo(s * 5, -33); ctx.lineTo(s * 18, -29);
        ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
      }
    },
  },

  // ======================= Surfboard =======================
  surfboard: {
    draw(ctx, o, t) {
      const pals = [['#ffe066', '#ff6b4a', '#2fb8cf'], ['#5ed3e6', '#ffffff', '#ff7aa8'], ['#ff8fb1', '#fff3c4', '#5b6cff'], ['#f7f3ea', '#2fb8cf', '#ff5a5f']];
      const [base, stripe, accent] = pals[(o.v || 0) % pals.length];
      // fin + leash (decor, under the board)
      ctx.beginPath(); ctx.moveTo(-104, 10); ctx.quadraticCurveTo(-110, 24, -118, 30); ctx.quadraticCurveTo(-100, 26, -88, 10); ctx.closePath();
      fillStroke(ctx, darken(accent, 0.1), 3);
      ctx.beginPath(); ctx.moveTo(-124, 2); ctx.bezierCurveTo(-136, 8, -128, 18, -138, 22); ctx.bezierCurveTo(-146, 26, -136, 34, -146, 38);
      ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#3c3c46'; ctx.stroke();
      const board = () => {
        ctx.beginPath();
        ctx.moveTo(-113, -12);
        ctx.lineTo(92, -12);
        ctx.bezierCurveTo(110, -12, 122, -9, 127, -3);
        ctx.bezierCurveTo(124, 6, 112, 12, 96, 12);
        ctx.lineTo(-113, 12);
        ctx.quadraticCurveTo(-125, 12, -125, 0);
        ctx.quadraticCurveTo(-125, -12, -113, -12);
        ctx.closePath();
      };
      board(); ctx.fillStyle = base; ctx.fill();
      ctx.save(); board(); ctx.clip();
      // racing stripes along the rail
      ctx.fillStyle = stripe; ctx.fillRect(-130, -3, 260, 6);
      ctx.fillStyle = accent; ctx.fillRect(-130, 4, 260, 2.5);
      // shade + highlight
      ctx.fillStyle = rgba(darken(base, 0.55), 0.25); ctx.fillRect(-130, 5, 260, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; rrc(ctx, -10, -8.5, 200, 3.5, 2); ctx.fill();
      // traction pad at the tail
      rrPath(ctx, -118, -10, 34, 20, 4); ctx.fillStyle = '#3a3a44'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.4;
      for (let x = -116; x < -86; x += 5) { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 4, 10); ctx.stroke(); }
      // moving glint
      const gx = ((t * 0.45) % 1.6) * 360 - 200;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(gx, -14); ctx.lineTo(gx + 10, -14); ctx.lineTo(gx - 4, 14); ctx.lineTo(gx - 14, 14); ctx.closePath(); ctx.fill();
      ctx.restore();
      board(); strokeOnly(ctx);
      // hibiscus decal
      ctx.save(); ctx.translate(30, 0);
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 - Math.PI / 2;
        ellipsePath(ctx, Math.cos(a) * 5.5, Math.sin(a) * 5.5, 5.5, 3.6, a); ctx.fillStyle = accent; ctx.fill();
      }
      circlePath(ctx, 0, 0, 2.6); ctx.fillStyle = '#fff3a0'; ctx.fill();
      ctx.restore();
      label(ctx, o, 'SIZZLE', 72, 0.5, 9.5, '#ffffff', { stroke: 3 });
      // dripping water drops
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i * 0.37) % 1;
        const dx = -40 + i * 52;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.moveTo(dx, 13 + ph * 26 - 4); ctx.quadraticCurveTo(dx + 3, 13 + ph * 26 + 2, dx, 13 + ph * 26 + 3); ctx.quadraticCurveTo(dx - 3, 13 + ph * 26 + 2, dx, 13 + ph * 26 - 4);
        ctx.fillStyle = '#8fe3ff'; ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
  },

  // ======================= Lifeguard chair =======================
  lifeguard: {
    draw(ctx, o) {
      const WHITE = '#f6f1e6', RED = '#ff5a4a', WOOD = '#e2a85e';
      // sand mounds at the feet
      for (const s of [-1, 1]) { ellipsePath(ctx, s * 90, 174, 26, 7); fillStroke(ctx, '#f0d08f', 3); }
      // cross braces (behind the legs)
      for (const [a, b] of [[[-74, -40], [84, 120]], [[74, -40], [-84, 120]]]) {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = darken(WHITE, 0.12); ctx.stroke();
      }
      circlePath(ctx, 0, 37, 5); fillStroke(ctx, '#c9ced3', 2.5);
      // legs (collision capsules)
      for (const s of [-1, 1]) {
        rod(ctx, s * 70, -110, s * 90, 170, 16, WHITE);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(s * 70, -110); ctx.lineTo(s * 90, 170); ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(0,0,0,0)';
        ctx.restore();
        // red bands on the legs
        for (const k of [0.25, 0.55, 0.85]) {
          const x = s * (70 + 20 * k), y = -110 + 280 * k;
          ctx.save(); ctx.translate(x, y); ctx.rotate(-s * Math.atan2(20, 280));
          rrc(ctx, 0, 0, 16, 10, 2); ctx.fillStyle = RED; ctx.fill();
          ctx.restore();
        }
        // knots / bolts
        circlePath(ctx, s * 72, -96, 2.6); ctx.fillStyle = '#8a8f96'; ctx.fill();
      }
      // seat supports (decor between the seat and the platform)
      for (const s of [-1, 1]) { rrc(ctx, s * 52, -139, 10, 22, 2); fillStroke(ctx, WHITE, 3); }
      // platform / sign board (collision: -100..100, -130..-110)
      toonBox(ctx, 0, -120, 200, 20, 3, RED);
      label(ctx, o, 'LIFEGUARD', 0, -119.5, 15, '#ffffff', { stroke: 4 });
      // seat (collision: -75..75, -168..-148)
      toonBox(ctx, 0, -158, 150, 20, 4, WOOD);
      ctx.strokeStyle = rgba(darken(WOOD, 0.5), 0.35); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-72, -158); ctx.lineTo(72, -158); ctx.stroke();
      for (const x of [-60, 60]) { circlePath(ctx, x, -153, 2); ctx.fillStyle = rgba(INK, 0.5); ctx.fill(); }
      // lifebuoy ring hanging on the right leg
      ctx.save(); ctx.translate(84, -10);
      ctx.beginPath(); ctx.moveTo(-6, -36); ctx.lineTo(0, -16); ctx.lineWidth = 3; ctx.strokeStyle = '#7a5a3a'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.arc(0, 0, 8, 0, TAU, true);
      ctx.fillStyle = '#fff6ea'; ctx.fill('evenodd');
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.arc(0, 0, 8, 0, TAU, true); ctx.clip('evenodd');
      ctx.fillStyle = RED;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 18, i * Math.PI / 2 + 0.3, i * Math.PI / 2 + 1.05); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      circlePath(ctx, 0, 0, 17); strokeOnly(ctx, 3); circlePath(ctx, 0, 0, 8); strokeOnly(ctx, 3);
      ctx.restore();
      // whistle on a lanyard hanging off the seat
      ctx.beginPath(); ctx.moveTo(-40, -148); ctx.quadraticCurveTo(-36, -136, -30, -134); ctx.lineWidth = 2; ctx.strokeStyle = '#2f7fd8'; ctx.stroke();
    },
  },

  // ======================= Seagull (hazard) =======================
  seagull: {
    draw(ctx, o, t) {
      const ph = t * 11 + (o.v || 0);
      // wing in body space: root on the back, raised along -y; sy squashes/flips it as it flaps
      const wing = (sy, col, tip, x0) => {
        const P = (x, y) => [x0 + x, -6 + y * sy];
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(...P(12, 2));
          ctx.quadraticCurveTo(...P(8, -22), ...P(-4, -36));
          ctx.quadraticCurveTo(...P(-22, -54), ...P(-50, -60));
          ctx.lineTo(...P(-42, -50)); ctx.lineTo(...P(-47, -45)); ctx.lineTo(...P(-36, -40));
          ctx.lineTo(...P(-40, -33)); ctx.lineTo(...P(-29, -30));
          ctx.quadraticCurveTo(...P(-22, -14), ...P(-20, 2));
          ctx.closePath();
        };
        path(); ctx.fillStyle = col; ctx.fill();
        ctx.save(); path(); ctx.clip();
        // black wing tip
        ctx.beginPath(); ctx.moveTo(...P(-60, -66)); ctx.lineTo(...P(-26, -54)); ctx.lineTo(...P(-30, -38)); ctx.lineTo(...P(-60, -30)); ctx.closePath();
        ctx.fillStyle = tip; ctx.fill();
        // light leading edge
        ctx.beginPath(); ctx.moveTo(...P(10, 0)); ctx.quadraticCurveTo(...P(6, -22), ...P(-4, -34));
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
        ctx.restore();
        path(); strokeOnly(ctx, 3);
      };
      // far wing (slightly out of phase, darker)
      wing(0.15 + 0.85 * Math.sin(ph + 0.5), '#9fabb7', '#34343e', 8);
      // tail
      ctx.beginPath(); ctx.moveTo(-28, -5); ctx.lineTo(-56, -8); ctx.lineTo(-50, 2); ctx.lineTo(-56, 11); ctx.lineTo(-26, 11); ctx.closePath();
      fillStroke(ctx, '#e9eef2', 3);
      ctx.save(); ctx.beginPath(); ctx.moveTo(-28, -5); ctx.lineTo(-56, -8); ctx.lineTo(-50, 2); ctx.lineTo(-56, 11); ctx.lineTo(-26, 11); ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#34343e'; ctx.fillRect(-60, -10, 10, 24);
      ctx.restore();
      // feet tucked
      for (const fx of [-8, 4]) {
        ctx.beginPath(); ctx.moveTo(fx, 16); ctx.lineTo(fx - 7, 27); ctx.lineTo(fx + 1, 25); ctx.lineTo(fx + 4, 29); ctx.lineTo(fx + 5, 16);
        ctx.closePath(); fillStroke(ctx, '#ff9b3a', 2.5);
      }
      // body
      const body = () => ellipsePath(ctx, -4, 3, 37, 17);
      body(); ctx.fillStyle = '#fbfbf7'; ctx.fill();
      ctx.save(); body(); ctx.clip();
      ctx.fillStyle = '#bcc7d1'; ctx.beginPath(); ctx.ellipse(-12, -10, 30, 12, 0.08, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(80,90,120,0.18)'; ctx.fillRect(-42, 11, 80, 12);
      ctx.restore();
      body(); strokeOnly(ctx);
      // head
      circlePath(ctx, 25, -6, 14.5); ctx.fillStyle = '#fbfbf7'; ctx.fill(); strokeOnly(ctx);
      ctx.beginPath(); ctx.ellipse(-4, 3, 34, 14, 0, -0.95, -0.25); ctx.lineWidth = 5; ctx.strokeStyle = '#fbfbf7'; ctx.stroke();
      // beak (snapping)
      const bo = 0.1 + 0.28 * Math.max(0, Math.sin(t * 7));
      ctx.save(); ctx.translate(36, -3);
      ctx.save(); ctx.rotate(bo);
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(15, 2); ctx.lineTo(-1, 5); ctx.closePath(); fillStroke(ctx, '#ffad2a', 2.5);
      ctx.restore();
      ctx.save(); ctx.rotate(-bo * 0.4);
      ctx.beginPath(); ctx.moveTo(-1, -5); ctx.quadraticCurveTo(12, -6, 20, 2); ctx.quadraticCurveTo(12, 0.5, -1, 1); ctx.closePath(); fillStroke(ctx, '#ffc93a', 2.5);
      circlePath(ctx, 14, -0.5, 1.8); ctx.fillStyle = '#ff3b3b'; ctx.fill();
      ctx.restore();
      ctx.restore();
      // mean eye
      circlePath(ctx, 28, -10, 5); fillStroke(ctx, '#ffffff', 2.2);
      circlePath(ctx, 29.6, -9.4, 2.4); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.moveTo(20, -18); ctx.lineTo(35, -13); ctx.lineWidth = 3.8; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      // near wing
      wing(Math.sin(ph), '#cdd6de', '#2c2c36', -4);
    },
  },

  // ======================= Bucket (cup) — a castle-mould sand pail =======================
  bucket: {
    draw(ctx, o) {
      const col = ['#3ec1e6', '#ff6b9a', '#ffcf3a', '#6ed36e'][(o.v || 0) % 4];
      // interior back wall (between the walls)
      // wire handle tipped back behind the pail
      ctx.beginPath(); ctx.moveTo(-36, -38); ctx.bezierCurveTo(-30, -70, 30, -70, 36, -38);
      ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = 2.8; ctx.strokeStyle = '#f4f0e8'; ctx.stroke();
      const inner = [[-37, -45], [37, -45], [48, 44], [-48, 44]];
      polyPath(ctx, inner); fillStroke(ctx, darken(col, 0.42));
      ctx.save(); polyPath(ctx, inner); ctx.clip();
      ctx.fillStyle = vgrad(ctx, -45, 10, [[0, rgba(darken(col, 0.75), 0.55)], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(-60, -46, 120, 60);
      ctx.strokeStyle = rgba(darken(col, 0.7), 0.3); ctx.lineWidth = 2;
      for (const y of [-20, 5]) { ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(50, y); ctx.stroke(); }
      // sand inside
      ctx.fillStyle = '#e8c27a';
      ctx.beginPath(); ctx.moveTo(-50, 36); ctx.quadraticCurveTo(-20, 27, 0, 31); ctx.quadraticCurveTo(24, 26, 50, 36); ctx.lineTo(50, 46); ctx.lineTo(-50, 46); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    front(ctx, o) {
      const col = ['#3ec1e6', '#ff6b9a', '#ffcf3a', '#6ed36e'][(o.v || 0) % 4];
      const light = lighten(col, 0.3), dark = darken(col, 0.25);
      // outer wall edge x at height y (left side): from (-39.6,-45.3) to (-50.35,44.1)
      const xl = y => -39.6 - (y + 45.3) * (10.75 / 89.4);
      const top = -22;
      // front face with castle crenellations on its top edge
      const face = () => {
        ctx.beginPath();
        ctx.moveTo(xl(top), top);
        const x0 = xl(top), x1 = -x0, mw = (x1 - x0) / 5;
        for (let i = 0; i < 5; i++) {
          const a = x0 + i * mw, b = a + mw;
          if (i % 2 === 0) { ctx.lineTo(a, top - 9); ctx.lineTo(b, top - 9); ctx.lineTo(b, top); }
          else ctx.lineTo(b, top);
        }
        ctx.lineTo(50.35, 44); ctx.quadraticCurveTo(50, 46.5, 46, 46.5);
        ctx.lineTo(-46, 46.5); ctx.quadraticCurveTo(-50, 46.5, -50.35, 44);
        ctx.closePath();
      };
      face(); ctx.fillStyle = col; ctx.fill();
      ctx.save(); face(); ctx.clip();
      ctx.fillStyle = rgba(darken(col, 0.55), 0.24); ctx.fillRect(-60, 22, 120, 30);
      ctx.fillStyle = rgba(lighten(col, 0.6), 0.5); ctx.fillRect(-60, top - 10, 120, 5);
      // embossed bricks
      ctx.strokeStyle = rgba(darken(col, 0.5), 0.35); ctx.lineWidth = 1.8;
      for (let row = 0, y = -8; y < 44; y += 11, row++) {
        ctx.beginPath(); ctx.moveTo(-60, y); ctx.lineTo(60, y); ctx.stroke();
        for (let x = -60 + (row % 2) * 10; x < 60; x += 20) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 11); ctx.stroke(); }
      }
      // embossed arched door
      ctx.beginPath(); ctx.moveTo(-10, 47); ctx.lineTo(-10, 28); ctx.arc(0, 28, 10, Math.PI, 0); ctx.lineTo(10, 47); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(INK, 0.6); ctx.stroke();
      gloss(ctx, -40, -12, 6, 44, 0.45);
      ctx.restore();
      face(); strokeOnly(ctx);
      starfish(ctx, 28, 8, 8, 0.3, '#ff8a3d', 2.2);
      shell(ctx, -27, 10, 0.7, -0.3, '#fff3e0');
      // wall rims above the face (side walls seen edge-on)
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 34.8, -44.4); ctx.lineTo(s * (-xl(top) - 4.6), top - 6);
        ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineWidth = 6.5; ctx.strokeStyle = light; ctx.stroke();
      }
    },
  },

  // ======================= Palm tree (bouncy fronds) =======================
  palm: {
    draw(ctx, o, t) {
      // sand mound
      ellipsePath(ctx, -20, 214, 46, 11); fillStroke(ctx, '#f0d08f', 3);
      ellipsePath(ctx, -32, 210, 18, 4); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      // drooping background fronds
      const sw = Math.sin(t * 1.6) * 3;
      featherFrond(ctx, 0, -176, -92, -206, -160, -84 + sw, 40, '#23803a', '#45ad52');
      featherFrond(ctx, 18, -176, 112, -206, 172, -78 - sw, 40, '#23803a', '#45ad52');
      featherFrond(ctx, 4, -170, -50, -178, -88, -44, 32, '#1d6e31', '#36983f');
      featherFrond(ctx, 14, -170, 66, -178, 102, -40, 32, '#1d6e31', '#36983f');
      // trunk (capsule (10,-170)→(-20,210) r16)
      const ang = Math.atan2(-20 - 10, 210 + 170);
      ctx.save(); ctx.translate(10, -170); ctx.rotate(-ang);
      // here the trunk runs along +y from 0 to L
      const L = Math.hypot(30, 380);
      rrPath(ctx, -16, -16, 32, L + 32, 16);
      ctx.fillStyle = '#c08a52'; ctx.fill();
      ctx.save(); rrPath(ctx, -16, -16, 32, L + 32, 16); ctx.clip();
      ctx.fillStyle = 'rgba(90,50,20,0.28)'; ctx.fillRect(4, -20, 14, L + 40);
      ctx.fillStyle = 'rgba(255,230,190,0.35)'; ctx.fillRect(-12, -20, 6, L + 40);
      for (let y = 6; y < L + 10; y += 21) {
        ctx.beginPath(); ctx.moveTo(-18, y - 4); ctx.quadraticCurveTo(0, y + 6, 18, y - 4);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(100,60,25,0.55)'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-18, y - 1); ctx.quadraticCurveTo(0, y + 9, 18, y - 1);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.stroke();
      }
      ctx.restore();
      rrPath(ctx, -16, -16, 32, L + 32, 16); strokeOnly(ctx);
      ctx.restore();
      // coconuts under the crown
      toonCircle(ctx, -4, -158, 10, '#7a4a26', { lw: 3 });
      toonCircle(ctx, 18, -156, 10, '#8a5630', { lw: 3 });
      toonCircle(ctx, 7, -146, 9.5, '#6e4220', { lw: 3 });
      // springy frond pads (the bouncy colliders)
      for (const [cx, cy, dir, seed] of [[-70, -185, -1, 3], [80, -185, 1, 7]]) {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(dir, 1); ctx.rotate(-0.18);
        frondPad(ctx, t, seed);
        ctx.restore();
      }
      // crown tuft
      ctx.beginPath();
      ctx.moveTo(-12, -178); ctx.quadraticCurveTo(4, -194, 26, -180); ctx.quadraticCurveTo(8, -172, -12, -178); ctx.closePath();
      fillStroke(ctx, '#4bbf55', 3);
    },
  },

  // ======================= Buoy (bobbing mover) =======================
  buoy: {
    draw(ctx, o, t) {
      const RED = '#ff4b3e', WHITE = '#fff7ee';
      const bob = Math.sin(t * 3);
      // tether rope dangling below
      ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(6 + bob * 3, 30, 0, 44);
      ctx.lineWidth = 3; ctx.strokeStyle = rgba('#8a6a4a', 0.8); ctx.stroke();
      // water drips
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.1 + i * 0.33) % 1;
        const dx = -30 + i * 30, dy = 20 + ph * 22;
        ctx.globalAlpha = (1 - ph) * 0.9;
        ctx.beginPath(); ctx.moveTo(dx, dy - 5); ctx.quadraticCurveTo(dx + 3, dy + 1, dx, dy + 2); ctx.quadraticCurveTo(dx - 3, dy + 1, dx, dy - 5);
        ctx.fillStyle = '#8fe3ff'; ctx.fill();
      }
      ctx.globalAlpha = 1;
      // beacon lamp on the right shoulder (blinks)
      const on = Math.sin(t * 5) > 0.2;
      rrc(ctx, 44, -21, 10, 8, 2); fillStroke(ctx, '#4a4f57', 2.5);
      if (on) { circlePath(ctx, 44, -29, 12); ctx.fillStyle = 'rgba(255,230,120,0.35)'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(44, -25, 5, Math.PI, 0); ctx.closePath(); fillStroke(ctx, on ? '#fff07a' : '#c9b56a', 2.5);
      // body (collision: 110×40, r18)
      const body = () => rrPath(ctx, -55, -20, 110, 40, 18);
      body(); ctx.fillStyle = RED; ctx.fill();
      ctx.save(); body(); ctx.clip();
      ctx.fillStyle = WHITE;
      for (const x of [-30, 14]) ctx.fillRect(x, -22, 16, 44);
      ctx.fillStyle = 'rgba(80,10,10,0.22)'; ctx.fillRect(-60, 6, 120, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; rrc(ctx, 0, -14, 90, 5, 2.5); ctx.fill();
      ctx.restore();
      body(); strokeOnly(ctx);
      // rope loops along the side
      ctx.beginPath();
      ctx.moveTo(-44, 0);
      ctx.quadraticCurveTo(-31, 12, -16, 2);
      ctx.quadraticCurveTo(0, 12, 16, 2);
      ctx.quadraticCurveTo(31, 12, 44, 0);
      ctx.lineWidth = 5.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 2.6; ctx.strokeStyle = '#f2dcae'; ctx.stroke();
      for (const x of [-44, -16, 16, 44]) { circlePath(ctx, x, x === -44 || x === 44 ? 0 : 2, 3); fillStroke(ctx, '#c9ced3', 2); }
      // splash ring under the buoy (bobbing in water)
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      for (let x = -52; x <= 52; x += 4) ctx.lineTo(x, 22 + Math.sin(x * 0.25 + t * 6) * 1.6 + bob);
      ctx.lineWidth = 3; ctx.strokeStyle = '#bff0ff'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
      sparkle(ctx, -36, -10, 4, 0.6 + 0.4 * Math.sin(t * 4));
    },
  },
};

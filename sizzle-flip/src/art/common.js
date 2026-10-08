// Shared drawing helpers & palette for the chunky outlined cartoon style.
// Every object is drawn in its own local space (y-down, origin at bounding-box centre).

export const INK = '#3a2216';
export const LW = 4; // standard outline width in world units

export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
export function mix(a, b, t) {
  const A = hexToRgb(a), Bc = hexToRgb(b);
  return rgbToHex(A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t, A[2] + (Bc[2] - A[2]) * t);
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#1a0d08', t);
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function rrPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Centered rounded rect path.
export function rrc(ctx, cx, cy, w, h, r) { rrPath(ctx, cx - w / 2, cy - h / 2, w, h, r); }

export function fillStroke(ctx, fill, lw = LW, stroke = INK) {
  ctx.fillStyle = fill; ctx.fill();
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}

export function strokeOnly(ctx, lw = LW, stroke = INK) {
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

export function ellipsePath(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
}
export function circlePath(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2); }

export function polyPath(ctx, pts, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

// A smooth closed blob through points (Catmull-Rom → Bezier).
export function smoothPath(ctx, pts, close = true, tension = 0.5) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  const get = i => close ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) * tension / 3, c1y = p1[1] + (p2[1] - p0[1]) * tension / 3;
    const c2x = p2[0] - (p3[0] - p1[0]) * tension / 3, c2y = p2[1] - (p3[1] - p1[1]) * tension / 3;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  if (close) ctx.closePath();
}

export function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
export function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
export function rgrad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

// The house "toon box": rounded rect with outline, top highlight band, bottom shade.
export function toonBox(ctx, cx, cy, w, h, r, color, opts = {}) {
  const x = cx - w / 2, y = cy - h / 2;
  const lw = opts.lw ?? LW;
  rrPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color; ctx.fill();
  ctx.save();
  rrPath(ctx, x, y, w, h, r); ctx.clip();
  // bottom shade
  ctx.fillStyle = rgba(darken(color, 0.55), opts.shade ?? 0.28);
  ctx.fillRect(x, y + h * (opts.shadeAt ?? 0.62), w, h);
  // top highlight
  ctx.fillStyle = rgba(lighten(color, 0.7), opts.hi ?? 0.35);
  rrPath(ctx, x + lw * 0.9, y + lw * 0.9, w - lw * 1.8, Math.min(h * 0.22, 14), Math.min(r, 8));
  ctx.fill();
  ctx.restore();
  rrPath(ctx, x, y, w, h, r);
  if (lw > 0) strokeOnly(ctx, lw, opts.ink || INK);
}

// Toon circle with shading crescent + specular dot.
export function toonCircle(ctx, x, y, r, color, opts = {}) {
  circlePath(ctx, x, y, r);
  ctx.fillStyle = color; ctx.fill();
  ctx.save();
  circlePath(ctx, x, y, r); ctx.clip();
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.arc(x - r * 0.22, y - r * 0.28, r * 0.98, 0, Math.PI * 2, true);
  ctx.fillStyle = rgba(darken(color, 0.5), opts.shade ?? 0.3);
  ctx.fill('evenodd');
  ctx.restore();
  if (opts.spec !== false) {
    ellipsePath(ctx, x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.14, -0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  }
  circlePath(ctx, x, y, r);
  if ((opts.lw ?? LW) > 0) strokeOnly(ctx, opts.lw ?? LW, opts.ink || INK);
}

// Generic polygon in toon style
export function toonPoly(ctx, pts, color, opts = {}) {
  polyPath(ctx, pts);
  ctx.fillStyle = color; ctx.fill();
  let miny = Infinity, maxy = -Infinity;
  for (const p of pts) { miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  ctx.save(); polyPath(ctx, pts); ctx.clip();
  ctx.fillStyle = rgba(darken(color, 0.55), opts.shade ?? 0.25);
  ctx.fillRect(-9999, miny + (maxy - miny) * 0.62, 99999, 9999);
  ctx.restore();
  polyPath(ctx, pts);
  if ((opts.lw ?? LW) > 0) strokeOnly(ctx, opts.lw ?? LW, opts.ink || INK);
}

// Soft contact shadow (drawn on the background layer under objects).
export function softShadow(ctx, x, y, rx, ry, alpha = 0.22) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(30,12,4,${alpha})`);
  g.addColorStop(1, 'rgba(30,12,4,0)');
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Deterministic pseudo random for decorative variation.
export function rng(seed) {
  let s = (Math.imul((seed >>> 0) + 0x9e3779b9, 2654435761) >>> 0) || 1;
  for (let i = 0; i < 3; i++) { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; }
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Little gloss streak (glass / plastic).
export function gloss(ctx, x, y, w, h, a = 0.45) {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  rrPath(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
  ctx.restore();
}

// Rounded thick line (for poles, handles, legs).
export function rod(ctx, x1, y1, x2, y2, w, color, ink = INK) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.lineWidth = w + LW * 1.6; ctx.strokeStyle = ink; ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.3); ctx.strokeStyle = rgba(lighten(color, 0.7), 0.5);
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
  const ox = -dy / l * w * 0.2, oy = dx / l * w * 0.2;
  ctx.beginPath(); ctx.moveTo(x1 - ox, y1 - oy); ctx.lineTo(x2 - ox, y2 - oy); ctx.stroke();
}

// Is the canvas currently mirrored (a prop placed flipped in a level)?
export function mirrored(ctx) {
  const m = ctx.getTransform ? ctx.getTransform() : null;
  return !!m && m.a * m.d - m.b * m.c < 0;
}

export function text(ctx, str, x, y, size, color, opts = {}) {
  ctx.save();
  ctx.font = `${opts.weight || ''} ${size}px ${opts.font || '"Lilita One", "Fredoka", system-ui, sans-serif'}`;
  let align = opts.align || 'center';
  // A prop placed mirrored in a level (inst.flip) mirrors its art; its labels ("TOYS", "SNACKS") must still read
  // the right way round: un-mirror the letters around their anchor (left/right alignment swaps to keep the spot).
  if (mirrored(ctx)) {
    ctx.translate(x, y); ctx.scale(-1, 1); x = 0; y = 0;
    align = align === 'left' ? 'right' : align === 'right' ? 'left' : align === 'start' ? 'end' : align === 'end' ? 'start' : align;
  }
  ctx.textAlign = align;
  ctx.textBaseline = opts.baseline || 'middle';
  if (opts.stroke) { ctx.lineWidth = opts.stroke; ctx.strokeStyle = opts.ink || INK; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.restore();
}

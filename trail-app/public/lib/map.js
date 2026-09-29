// Canvas renderers: a tile-less trail map (works fully offline) and an elevation profile.

import { boundingBox, buildPath, pointAtDistance, toLocal } from './geo.js';

const KIND_STYLE = {
  water: { color: '#2b7bd6', glyph: 'W' },
  view: { color: '#8a5cd6', glyph: 'V' },
  hazard: { color: '#d64545', glyph: '!' },
  photo: { color: '#d68a1f', glyph: 'P' },
  note: { color: '#5b6b60', glyph: 'N' },
  junction: { color: '#2a9d8f', glyph: 'Y' },
};

const MIN_SIZE = 60;

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  // Hidden, collapsed or mid-resize canvases report ~0 size: drawing then is meaningless, and a
  // negative scale would make the grid loops below run forever.
  if (w < MIN_SIZE || h < MIN_SIZE) return null;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(canvas);
  const c = (name, fb) => css.getPropertyValue(name).trim() || fb;
  return {
    ctx,
    w,
    h,
    colors: {
      bg: c('--map-bg', '#eef2ea'),
      line: c('--trail', '#1f7a4d'),
      done: c('--trail-done', '#9db3a5'),
      you: c('--you', '#0a66ff'),
      text: c('--text', '#1b241e'),
    },
  };
}

/**
 * @param canvas
 * @param opts.points   trail points [{lat,lng}]
 * @param opts.waypoints
 * @param opts.position {lat,lng} current position (optional)
 * @param opts.heading  degrees the user faces (optional)
 * @param opts.along    metres travelled along the trail (colours the finished part)
 * @param opts.follow   metres: zoom to a window this wide around `position` instead of fitting the trail
 * @param opts.breadcrumb points recorded so far (record view)
 */
export function drawMap(canvas, opts) {
  const env = setup(canvas);
  if (!env) return;
  const { ctx, w, h, colors } = env;
  const { points = [], waypoints = [], position, heading, along, follow, breadcrumb } = opts;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  const all = [...points, ...(breadcrumb ?? []), ...(position ? [position] : [])];
  if (all.length === 0) return;

  let origin;
  let scale;
  const pad = 22;
  if (follow && position) {
    origin = position;
    scale = Math.min(w, h) / 2 / follow; // px per metre; `follow` is the half-window in metres
  } else {
    const b = boundingBox(all);
    origin = { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
    const sw = toLocal(origin, { lat: b.minLat, lng: b.minLng });
    const ne = toLocal(origin, { lat: b.maxLat, lng: b.maxLng });
    const spanX = Math.max(30, ne.x - sw.x);
    const spanY = Math.max(30, ne.y - sw.y);
    scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  }
  if (!(scale > 0) || !Number.isFinite(scale)) return;
  const P = (p) => {
    const l = toLocal(origin, p);
    return { x: w / 2 + l.x * scale, y: h / 2 - l.y * scale };
  };

  // faint grid gives a sense of scale without needing map tiles
  const gridM = scale * 100 > 18 ? 100 : 500;
  const step = gridM * scale;
  if (Number.isFinite(step) && step >= 8) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = (w / 2) % step; gx < w; gx += step) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
    }
    for (let gy = (h / 2) % step; gy < h; gy += step) {
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
    }
    ctx.stroke();
  }

  const strokePath = (pts, color, width) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = P(p);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  };

  if (points.length > 1) {
    const path = buildPath(points);
    // white casing then colour: readable on any background
    strokePath(points, 'rgba(255,255,255,0.9)', 7);
    if (along != null && along > 0) {
      const split = pointAtDistance(path, along);
      const donePts = [...points.slice(0, split.index + 1), split];
      const todoPts = [split, ...points.slice(split.index + 1)];
      strokePath(donePts, colors.done, 4);
      strokePath(todoPts, colors.line, 4);
    } else {
      strokePath(points, colors.line, 4);
    }
    // start (green) / end (dark) markers
    const dot = (p, fill) => {
      const q = P(p);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(q.x, q.y, 7, 0, 7);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4.5, 0, 7);
      ctx.fill();
    };
    dot(points[0], '#1f9d55');
    dot(points[points.length - 1], '#222');
  }
  if (breadcrumb?.length > 1) strokePath(breadcrumb, colors.line, 4);

  for (const wp of waypoints) {
    const s = KIND_STYLE[wp.kind] ?? KIND_STYLE.note;
    const q = P(wp);
    if (q.x < -10 || q.y < -10 || q.x > w + 10 || q.y > h + 10) continue;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 9, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.glyph, q.x, q.y + 0.5);
  }

  if (position) {
    const q = P(position);
    if (heading != null) {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate((heading * Math.PI) / 180);
      const g = ctx.createLinearGradient(0, 0, 0, -34);
      g.addColorStop(0, 'rgba(10,102,255,0.45)');
      g.addColorStop(1, 'rgba(10,102,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-15, -34);
      ctx.lineTo(15, -34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(q.x, q.y, 9, 0, 7);
    ctx.fill();
    ctx.fillStyle = colors.you;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 6, 0, 7);
    ctx.fill();
  }

  // north indicator + scale bar
  ctx.fillStyle = colors.text;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('N ↑', 10, 18);
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000].find((m) => m * scale >= 50) ?? 5000;
  const barPx = nice * scale;
  ctx.fillRect(10, h - 14, barPx, 2);
  ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 10, h - 20);
}

export function drawElevation(canvas, points) {
  const env = setup(canvas);
  if (!env) return;
  const { ctx, w, h, colors } = env;
  const eles = points.map((p) => p.ele);
  if (points.length < 2 || eles.some((e) => e == null)) {
    ctx.fillStyle = colors.text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No elevation data', w / 2, h / 2);
    return;
  }
  const path = buildPath(points);
  const lo = Math.min(...eles);
  const hi = Math.max(...eles);
  const range = Math.max(20, hi - lo);
  ctx.font = '11px system-ui, sans-serif';
  const padL = Math.ceil(Math.max(ctx.measureText(`${Math.round(hi)} m`).width, ctx.measureText(`${Math.round(lo)} m`).width)) + 12;
  const padB = 16;
  const X = (d) => padL + (d / path.total) * (w - padL - 8);
  const Y = (e) => h - padB - ((e - lo) / range) * (h - padB - 10);

  ctx.beginPath();
  ctx.moveTo(X(0), h - padB);
  points.forEach((p, i) => ctx.lineTo(X(path.cum[i]), Y(p.ele)));
  ctx.lineTo(X(path.total), h - padB);
  ctx.closePath();
  ctx.fillStyle = 'rgba(31,122,77,0.18)';
  ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(X(path.cum[i]), Y(p.ele)) : ctx.moveTo(X(0), Y(p.ele))));
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = colors.text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(hi)} m`, padL - 6, 16);
  ctx.fillText(`${Math.round(lo)} m`, padL - 6, h - padB);
  ctx.textAlign = 'left';
  ctx.fillText('0', padL, h - 3);
  ctx.textAlign = 'right';
  ctx.fillText(`${(path.total / 1000).toFixed(1)} km`, w - 8, h - 3);
}

// Object art registry. Each entry: { draw(ctx, inst, t, state), front?(ctx, inst, t, state) }
// drawn in the object's local (unscaled, unflipped) space.
import { OBJECTS } from '../../objects.js';
import { INK, rgba, lighten, darken, polyPath, circlePath, rrc, fillStroke, toonBox, toonCircle, toonPoly } from '../common.js';
import { SHARED_ART } from './shared.js';
import { KITCHEN_ART } from './kitchen.js';
import { LIVING_ART } from './living.js';
import { BACKYARD_ART } from './backyard.js';
import { BATHROOM_ART } from './bathroom.js';
import { OFFICE_ART } from './office.js';
import { TOYROOM_ART } from './toyroom.js';
import { MARKET_ART } from './market.js';
import { BEACH_ART } from './beach.js';
import { SPACE_ART } from './space.js';
import { HEAVEN_ART } from './heaven.js';

export const ART = {
  ...SHARED_ART, ...KITCHEN_ART, ...LIVING_ART, ...BACKYARD_ART, ...BATHROOM_ART, ...OFFICE_ART,
  ...TOYROOM_ART, ...MARKET_ART, ...BEACH_ART, ...SPACE_ART, ...HEAVEN_ART,
};

const MAT_COLORS = {
  wood: '#c98a4b', metal: '#a9b4bd', soft: '#e58fa3', plastic: '#5aa9e6', glass: '#bfe6f2', ceramic: '#f2efe8',
  food: '#e9a54f', stone: '#9b948b', slick: '#ffe27a', sticky: '#ff8fc7', rubber: '#ffcf3a', sand: '#e8cf91',
  cloud: '#ffffff', piano: '#3b302b', drum: '#e05a47', xylo: '#7bc96f', ice: '#cdefff',
};

// Fallback: draw the collision shapes in toon style so nothing is ever invisible.
export function drawFallback(ctx, inst) {
  const type = OBJECTS[inst.t];
  const shapes = type.build ? type.build(inst) : type.shapes;
  for (const s of shapes) {
    if (s.sensor) continue;
    const col = s.hazard ? '#ff4d4d' : (MAT_COLORS[s.mat || type.mat] || '#cccccc');
    if (s.type === 'box') {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a || 0);
      toonBox(ctx, 0, 0, s.w, s.h, s.r || 3, col);
      ctx.restore();
    } else if (s.type === 'circle') toonCircle(ctx, s.x, s.y, s.r, col);
    else if (s.type === 'poly') toonPoly(ctx, s.pts, col);
    else if (s.type === 'capsule') {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
      ctx.lineWidth = s.r * 2 + 8; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = s.r * 2; ctx.strokeStyle = col; ctx.stroke();
    }
  }
}

export function drawObject(ctx, inst, t, state, layer = 'draw') {
  const art = ART[inst.t];
  if (!art) { if (layer === 'draw') drawFallback(ctx, inst); return; }
  const fn = art[layer];
  if (fn) fn(ctx, inst, t, state);
}

export function hasFront(inst) {
  const art = ART[inst.t];
  return !!(art && art.front);
}

// Debug: outline actual collision shapes.
export function drawCollisionDebug(ctx, inst) {
  const type = OBJECTS[inst.t];
  const shapes = type.build ? type.build(inst) : type.shapes;
  ctx.save();
  ctx.lineWidth = 2;
  for (const s of shapes) {
    ctx.strokeStyle = s.sensor ? 'rgba(0,160,255,0.9)' : s.hazard ? 'rgba(255,0,0,0.9)' : 'rgba(0,255,90,0.9)';
    if (s.type === 'box') {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a || 0);
      ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h); ctx.restore();
    } else if (s.type === 'circle') { circlePath(ctx, s.x, s.y, s.r); ctx.stroke(); }
    else if (s.type === 'poly') { polyPath(ctx, s.pts); ctx.stroke(); }
    else if (s.type === 'capsule') {
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.lineWidth = s.r * 2; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 2;
    }
  }
  ctx.restore();
}

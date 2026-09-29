// Tiny Tides — scene renderer (Canvas 2D). Reads game state, never mutates it.
import * as D from './data.js';
import * as S from './sim.js';
import { drawSprite, facingOf, OUT, shade, rng, hash } from './art_creatures.js';
import { PIECE_ART, PROP_ART, drawEgg, drawCocoon } from './art_world.js';

const TAU = Math.PI * 2;
const { FORMS, FAMILIES, SKINS } = D;

// ------------------------------------------------------------------ colour helpers
const hex2rgb = (h) => { if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number); const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; };
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ sky
const SKY = {
  night: ['#120a3a', '#2d1b69'], dawn: ['#7e6cf0', '#ffb59e'], day: ['#59c6ff', '#d2f5ff'], dusk: ['#5a3fc8', '#ff9a7d'],
};
const SKY_KEYS = [[0, 'night'], [5, 'night'], [6.6, 'dawn'], [8.2, 'day'], [16.8, 'day'], [18.4, 'dusk'], [20.2, 'night'], [24, 'night']];
export function skyAt(hour, force) {
  if (force) return { top: SKY[force][0], bot: SKY[force][1], night: force === 'night' ? 1 : 0, key: force };
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1][0]) i++;
  const [h0, k0] = SKY_KEYS[i], [h1, k1] = SKY_KEYS[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (hour - h0) / (h1 - h0))));
  const n0 = k0 === 'night' ? 1 : 0, n1 = k1 === 'night' ? 1 : 0;
  return { top: mix(SKY[k0][0], SKY[k1][0], t), bot: mix(SKY[k0][1], SKY[k1][1], t), night: lerp(n0, n1, t), key: t < 0.5 ? k0 : k1 };
}
export const localHour = (now) => { const d = new Date(now); return d.getHours() + d.getMinutes() / 60; };

// ------------------------------------------------------------------ geometry: blobby water paths
function roundedRectPath(p, x, y, w, h, r) { // r = [tl,tr,br,bl]
  p.moveTo(x + r[0], y);
  p.lineTo(x + w - r[1], y); if (r[1]) p.arcTo(x + w, y, x + w, y + r[1], r[1]); else p.lineTo(x + w, y);
  p.lineTo(x + w, y + h - r[2]); if (r[2]) p.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]); else p.lineTo(x + w, y + h);
  p.lineTo(x + r[3], y + h); if (r[3]) p.arcTo(x, y + h, x, y + h - r[3], r[3]); else p.lineTo(x, y + h);
  p.lineTo(x, y + r[0]); if (r[0]) p.arcTo(x, y, x + r[0], y, r[0]); else p.lineTo(x, y);
  p.closePath();
}
function fillet(p, vx, vy, dx, dy, r) {
  const cx = vx + dx * r, cy = vy + dy * r;
  const a0 = Math.atan2(-dy, 0), a1 = Math.atan2(0, -dx);
  let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
  p.moveTo(vx, vy); p.lineTo(vx + dx * r, vy); p.arc(cx, cy, r, a0, a1, d < 0); p.closePath();
}
/** Union of all tiles with water level >= L, corners rounded like a puddle. */
export function waterPath(pool, L, ts, ox, oy, rad = 0.46) {
  const p = new Path2D(), r = ts * rad;
  const has = (x, y) => { const t = S.tileAt(pool, x, y); return !!t && t.w >= L; };
  for (let y = 0; y < pool.h; y++) for (let x = 0; x < pool.w; x++) {
    if (!has(x, y)) continue;
    const L0 = has(x - 1, y), R0 = has(x + 1, y), U0 = has(x, y - 1), D0 = has(x, y + 1);
    roundedRectPath(p, ox + x * ts, oy + y * ts, ts, ts, [!L0 && !U0 ? r : 0, !R0 && !U0 ? r : 0, !R0 && !D0 ? r : 0, !L0 && !D0 ? r : 0]);
    if (R0 && D0 && !has(x + 1, y + 1)) fillet(p, ox + (x + 1) * ts, oy + (y + 1) * ts, 1, 1, r);
    if (L0 && D0 && !has(x - 1, y + 1)) fillet(p, ox + x * ts, oy + (y + 1) * ts, -1, 1, r);
    if (R0 && U0 && !has(x + 1, y - 1)) fillet(p, ox + (x + 1) * ts, oy + y * ts, 1, -1, r);
    if (L0 && U0 && !has(x - 1, y - 1)) fillet(p, ox + x * ts, oy + y * ts, -1, -1, r);
  }
  return p;
}

// ------------------------------------------------------------------ scene
export function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const sc = {
    canvas, ctx, W: 0, H: 0, dpr: 1, ts: 48, ox: 0, oy: 0, insets: { top: 120, bottom: 110 },
    state: null, biome: 'tide', views: new Map(), parts: [], texts: [], pops: new Map(),
    hintTiles: [], selected: null, hover: null, buildMode: false, toolTint: '#fff', shake: 0,
    reduceMotion: false, battery: false, skyForce: null, time: 0, _base: null, _baseKey: '', _paths: null, _pathKey: '',
  };

  sc.resize = (W, H, dpr, insets) => {
    sc.W = W; sc.H = H; sc.dpr = Math.min(dpr || 1, sc.battery ? 1.5 : 2.5);
    if (insets) sc.insets = insets;
    canvas.width = Math.round(W * sc.dpr); canvas.height = Math.round(H * sc.dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    sc._baseKey = '';
  };
  sc.layoutFor = (pool, W, H, insets) => {
    // slab = grid + 0.22 padding each side + 0.34 of depth underneath
    const availW = W - 22, availH = H - insets.top - insets.bottom - 10;
    const ts = Math.max(28, Math.min(availW / (pool.w + 0.5), availH / (pool.h + 0.5 + 0.34), W >= 700 ? 130 : 92));
    const gw = ts * pool.w, gh = ts * pool.h;
    return { ts, ox: (W - gw) / 2, oy: insets.top + 5 + (availH - (gh + ts * (0.44 + 0.34))) / 2 + ts * 0.22 };
  };
  sc.setInsets = (ins) => { sc.insets = ins; sc.relayout(); };
  sc.relayout = () => {
    const pool = sc.pool();
    if (!pool) return;
    const l = sc.layoutFor(pool, sc.W, sc.H, sc.insets);
    if (l.ts !== sc.ts || l.ox !== sc.ox || l.oy !== sc.oy) { sc.ts = l.ts; sc.ox = l.ox; sc.oy = l.oy; sc._baseKey = ''; }
  };
  sc.pool = () => sc.state?.pools[sc.biome];
  sc.setBiome = (b) => { sc.biome = b; sc.views.clear(); sc._baseKey = ''; sc.pops.clear(); };
  const tc = (tx, ty) => [sc.ox + (tx + 0.5) * sc.ts, sc.oy + (ty + 0.5) * sc.ts];
  sc.tileCenter = tc;
  sc.screenToTile = (px, py) => {
    const pool = sc.pool(); if (!pool) return null;
    const tx = Math.floor((px - sc.ox) / sc.ts), ty = Math.floor((py - sc.oy) / sc.ts);
    return S.inb(pool, tx, ty) ? { x: tx, y: ty } : null;
  };

  // ------------------------------------------------ effects API
  sc.burst = (tx, ty, kind = 'spark', n = 12, o = {}) => {
    const [x, y] = o.px ? [o.px, o.py] : tc(tx, ty);
    for (let i = 0; i < n && sc.parts.length < 400; i++) {
      const a = Math.random() * TAU, sp = (o.speed || 90) * (0.4 + Math.random() * 0.8);
      const colors = o.colors || ['#fff', '#ffe66d', '#7cf0ff', '#ff8fc4'];
      sc.parts.push({ kind, x, y: y - (o.lift || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 30), g: o.g ?? 60, life: 0, max: (o.life || 0.9) * (0.7 + Math.random() * 0.6), size: (o.size || 6) * (0.6 + Math.random() * 0.8), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, color: colors[i % colors.length] });
    }
  };
  sc.ring = (tx, ty, color = '#fff', o = {}) => { const [x, y] = o.px ? [o.px, o.py] : tc(tx, ty); sc.parts.push({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: o.life || 0.6, size: o.size || sc.ts * 0.7, rot: 0, vr: 0, color }); };
  sc.text = (tx, ty, str, color = '#fff', o = {}) => { const [x, y] = o.px ? [o.px, o.py] : tc(tx, ty); sc.texts.push({ x, y: y - sc.ts * 0.5, str, color, life: 0, max: o.life || 1.1, size: o.size || 15 }); };
  sc.pop = (idx) => sc.pops.set(idx, sc.time);
  sc.confetti = (n = 60) => { for (let i = 0; i < n && sc.parts.length < 500; i++) sc.parts.push({ kind: 'confetti', x: Math.random() * sc.W, y: -10 - Math.random() * 80, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120, g: 40, life: 0, max: 2.6 + Math.random(), size: 6 + Math.random() * 5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9, color: ['#ff8fc4', '#ffe66d', '#7cf0ff', '#8be9c8', '#b590ff'][i % 5] }); };
  sc.tap = (id) => { const v = sc.views.get(id); if (v) v.squash = 1; };

  // ------------------------------------------------ per-creature view state
  function viewFor(item, isEgg) {
    let v = sc.views.get(item.id);
    if (!v) {
      v = { x: item.x, y: item.y, tx: item.x, ty: item.y, phase: Math.random() * 10, next: sc.time + 1 + Math.random() * 3, face: 1, squash: 0, blink: 0, nextBlink: sc.time + 1 + Math.random() * 4, hop: 0, born: sc.time, taps: 0 };
      sc.views.set(item.id, v);
    }
    return v;
  }
  function updateViews(dt) {
    const pool = sc.pool(); if (!pool) return;
    const alive = new Set();
    for (const c of pool.creatures) {
      alive.add(c.id);
      const v = viewFor(c), fam = FAMILIES[FORMS[c.form].fam];
      // home moved (relocation)? snap
      if (Math.abs(v.hx - c.x) + Math.abs(v.hy - c.y) > 0 && v.hx !== undefined) { v.x = c.x; v.y = c.y; v.tx = c.x; v.ty = c.y; }
      v.hx = c.x; v.hy = c.y;
      if (!c.evo && sc.time >= v.next) {
        const opts = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = c.x + dx, ny = c.y + dy;
          if (S.canStand(pool, fam, nx, ny) && (!S.occupantAt(pool, nx, ny) || (nx === c.x && ny === c.y))) opts.push([nx, ny]);
        }
        const o = opts[Math.floor(Math.random() * opts.length)] || [c.x, c.y];
        v.tx = o[0] + (Math.random() - 0.5) * 0.3; v.ty = o[1] + (Math.random() - 0.5) * 0.3;
        v.next = sc.time + 2.5 + Math.random() * 5;
      }
      const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
      if (d > 0.02) { const sp = Math.min(d, 0.55 * dt); v.x += dx / d * sp; v.y += dy / d * sp; if (Math.abs(dx) > 0.03) v.face = dx > 0 ? 1 : -1; v.hop = (v.hop + dt * 9) % TAU; v.moving = true; } else v.moving = false;
      v.squash = Math.max(0, v.squash - dt * 2.4);
      if (sc.time >= v.nextBlink) { v.blink = 0.14; v.nextBlink = sc.time + 2 + Math.random() * 4; }
      v.blink = Math.max(0, v.blink - dt);
    }
    for (const e of pool.eggs) { alive.add(e.id); viewFor(e, true); const v = sc.views.get(e.id); v.x = e.x; v.y = e.y; v.squash = Math.max(0, v.squash - dt * 2.4); }
    for (const id of [...sc.views.keys()]) if (!alive.has(id)) sc.views.delete(id);
  }

  // ------------------------------------------------ hit testing
  const bubbleGeom = (c, v) => {
    const st = sc.state, pool = sc.pool();
    if (c.evo || c.stored < 2) return null;
    const cap = S.bubbleCap(st, pool, c, sc.lastNow || Date.now());
    const fill = Math.min(1, c.stored / Math.max(1, cap));
    const [x, y] = tc(v.x, v.y);
    const size = sc.ts * creatureScale(c);
    const r = sc.ts * (0.17 + 0.13 * fill);
    return { x: x + size * 0.27, y: y - size * 0.74 - Math.sin(sc.time * 2 + v.phase) * 2, r, fill };
  };
  sc.bubblePos = (id) => { const pool = sc.pool(), c = pool?.creatures.find((k) => k.id === id), v = sc.views.get(id); const g = c && v && bubbleGeom(c, v); return g ? { x: g.x, y: g.y } : null; };
  sc.hit = (px, py) => {
    const pool = sc.pool(); if (!pool) return null;
    let best = null;
    for (const c of pool.creatures) {
      const v = sc.views.get(c.id); if (!v) continue;
      const g = bubbleGeom(c, v);
      if (g) { const d = Math.hypot(px - g.x, py - g.y); if (d <= Math.max(24, g.r + 10) && (!best || d < best.d)) best = { type: 'bubble', id: c.id, d }; }
    }
    if (best) return best;
    let bestC = null;
    for (const c of pool.creatures) {
      const v = sc.views.get(c.id); if (!v) continue;
      const [x, y] = tc(v.x, v.y);
      const size = sc.ts * creatureScale(c);
      const dx = px - x, dy = py - (y - size * 0.22);
      const d = Math.hypot(dx / (size * 0.42), dy / (size * 0.42));
      if (d <= 1 && (!bestC || d < bestC.d)) bestC = { type: 'creature', id: c.id, d };
    }
    if (bestC) return bestC;
    for (const e of pool.eggs) {
      const v = sc.views.get(e.id); if (!v) continue;
      const [x, y] = tc(v.x, v.y);
      if (Math.hypot(px - x, py - (y - sc.ts * 0.15)) < sc.ts * 0.5) return { type: 'egg', id: e.id };
    }
    const t = sc.screenToTile(px, py);
    return t ? { type: 'tile', ...t } : null;
  };
  const creatureScale = (c) => { const st = FORMS[c.form].stage; return st === 1 ? 1.22 : st === 2 ? 1.34 : 1.5; };

  // ------------------------------------------------ cached base layer (slab, sand, water shapes)
  function skinFor(st, biome) { return biome === 'deep' ? SKINS.abyss : SKINS[st.equip.skin] || SKINS.aqua; }
  function buildBase(st, pool, ts, ox, oy, W, H, nightMix, skin) {
    const cv = document.createElement('canvas'); const dpr = sc.dpr;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const night = (col) => (nightMix > 0.01 ? mix(col, '#1a1250', nightMix * 0.45) : col);
    const gw = ts * pool.w, gh = ts * pool.h, pad = ts * 0.22, dep = ts * 0.34, R = ts * 0.55;
    const sx = ox - pad, sy = oy - pad, sw = gw + pad * 2, sh = gh + pad * 2;
    // soft ground shadow
    c.save(); const g = c.createRadialGradient(ox + gw / 2, sy + sh + dep + ts * 0.25, 4, ox + gw / 2, sy + sh + dep + ts * 0.25, sw * 0.62);
    g.addColorStop(0, 'rgba(30,10,80,.32)'); g.addColorStop(1, 'rgba(30,10,80,0)');
    c.translate(0, 0); c.fillStyle = g; c.beginPath(); c.ellipse(ox + gw / 2, sy + sh + dep + ts * 0.25, sw * 0.62, ts * 0.55, 0, 0, TAU); c.fill(); c.restore();
    // slab side
    const rr = (x, y, w, h, r) => { const p = new Path2D(); roundedRectPath(p, x, y, w, h, [r, r, r, r]); return p; };
    c.fillStyle = night(skin.slabDk); c.fill(rr(sx, sy + dep, sw, sh, R));
    c.fillStyle = night(skin.slab);
    c.fill(rr(sx, sy + dep * 0.5, sw, sh, R));
    c.lineWidth = Math.max(2, ts * 0.05); c.strokeStyle = OUT; c.globalAlpha = 0.9; c.stroke(rr(sx, sy + dep, sw, sh, R)); c.globalAlpha = 1;
    // strata lines on the side
    c.save(); c.clip(rr(sx, sy + dep, sw, sh, R)); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2;
    for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(sx, sy + sh + dep * (0.35 + i * 0.22)); c.lineTo(sx + sw, sy + sh + dep * (0.35 + i * 0.22)); c.stroke(); } c.restore();
    // sand top
    const top = rr(sx, sy, sw, sh, R);
    const sg = c.createLinearGradient(0, sy, 0, sy + sh); sg.addColorStop(0, night(skin.sand)); sg.addColorStop(1, night(mix(skin.sand, skin.sandDk, 0.45)));
    c.fillStyle = sg; c.fill(top); c.lineWidth = Math.max(2.4, ts * 0.06); c.strokeStyle = OUT; c.stroke(top);
    c.save(); c.clip(top);
    // checker + speckles
    const r = rng(hash(pool.biome + pool.w + 'x' + pool.h));
    for (let y = 0; y < pool.h; y++) for (let x = 0; x < pool.w; x++) {
      if ((x + y) % 2) { c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(ox + x * ts, oy + y * ts, ts, ts); }
      for (let k = 0; k < 3; k++) { c.fillStyle = r() > 0.5 ? 'rgba(120,70,20,.14)' : 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(ox + (x + r()) * ts, oy + (y + r()) * ts, 1 + r() * 1.6, 0, TAU); c.fill(); }
    }
    // inner rim highlight
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = ts * 0.08; c.stroke(rr(sx + ts * 0.05, sy + ts * 0.05, sw - ts * 0.1, sh - ts * 0.1, R * 0.9));
    // water: wet rim, then layers
    const paths = [null];
    for (let L = 1; L <= 3; L++) paths[L] = waterPath(pool, L, ts, ox, oy);
    const colsFor = [null, [skin.shallow, skin.shallow2], [skin.deep, skin.deep2], [skin.trench, skin.trench]];
    if (pool.tiles.some((t) => t.w >= 1)) {
      c.lineJoin = 'round';
      c.strokeStyle = night(skin.wet); c.lineWidth = ts * 0.22; c.stroke(paths[1]);
      c.strokeStyle = night(skin.sandDk); c.lineWidth = ts * 0.12; c.stroke(paths[1]);
      for (let L = 1; L <= 3; L++) {
        if (!pool.tiles.some((t) => t.w >= L)) break;
        const cols = colsFor[L];
        const wg = c.createLinearGradient(0, oy, 0, oy + gh); wg.addColorStop(0, night(cols[0])); wg.addColorStop(1, night(cols[1]));
        c.fillStyle = wg; c.fill(paths[L]);
        // edge-only strips (never along shared tile edges, so no grid lines inside a puddle)
        const has = (x, y) => { const t = S.tileAt(pool, x, y); return !!t && t.w >= L; };
        const strip = (side, X, Y, wd, col, a0) => {
          let g, rx, ry, rw, rh;
          if (side === 'T') { g = c.createLinearGradient(0, Y, 0, Y + wd); rx = X; ry = Y; rw = ts; rh = wd; }
          else if (side === 'B') { g = c.createLinearGradient(0, Y, 0, Y - wd); rx = X; ry = Y - wd; rw = ts; rh = wd; }
          else if (side === 'L') { g = c.createLinearGradient(X, 0, X + wd, 0); rx = X; ry = Y; rw = wd; rh = ts; }
          else { g = c.createLinearGradient(X, 0, X - wd, 0); rx = X - wd; ry = Y; rw = wd; rh = ts; }
          g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.globalAlpha = a0; c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
        };
        c.save(); c.clip(paths[L]);
        for (let y = 0; y < pool.h; y++) for (let x = 0; x < pool.w; x++) {
          if (!has(x, y)) continue;
          const X = ox + x * ts, Y = oy + y * ts, sides = [[!has(x, y - 1), 'T', X, Y], [!has(x, y + 1), 'B', X, Y + ts], [!has(x - 1, y), 'L', X, Y], [!has(x + 1, y), 'R', X + ts, Y]];
          for (const [edge, side, ex, ey] of sides) {
            if (!edge) continue;
            if (L > 1) strip(side, ex, ey, ts * 0.42, night(colsFor[L - 1][1]), 0.6);
            if (side === 'T' || side === 'L') strip(side, ex + (side === 'L' ? ts * 0.03 : 0), ey + (side === 'T' ? ts * 0.03 : 0), ts * 0.1, '#ffffff', 0.4);
          }
        }
        c.globalAlpha = 1; c.restore();
      }
    }
    c.restore();
    return { cv, paths, geom: { sx, sy, sw, sh, dep } };
  }

  // ------------------------------------------------ frame
  sc.frame = (dt, nowMs) => {
    const st = sc.state; if (!st) return;
    dt = Math.min(dt, 0.1);
    sc.time += dt; sc.lastNow = nowMs;
    const pool = sc.pool(); if (!pool) return;
    sc.relayout();
    updateViews(dt);
    for (const p of sc.parts) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
    sc.parts = sc.parts.filter((p) => p.life < p.max);
    for (const t of sc.texts) t.life += dt;
    sc.texts = sc.texts.filter((t) => t.life < t.max);
    sc.shake = Math.max(0, sc.shake - dt * 3);
    draw(ctx, sc.W, sc.H, sc.dpr, nowMs, sc.time, { live: true });
  };

  function drawSky(c, W, H, sky, t, nowMs, fx) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // sun / moon glow
    const hour = localHour(nowMs);
    const night = sky.night;
    if (night > 0.3) {
      const r = rng(4242);
      for (let i = 0; i < 46; i++) { const x = r() * W, y = r() * H * 0.7, tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + r()) + i)); c.globalAlpha = night * tw * 0.9; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 0.6 + r() * 1.4, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      const mx = W * 0.82, my = H * 0.11, ph = S.moonPhase(nowMs);
      const mg = c.createRadialGradient(mx, my, 4, mx, my, 70); mg.addColorStop(0, 'rgba(255,245,200,.55)'); mg.addColorStop(1, 'rgba(255,245,200,0)');
      c.globalAlpha = night; c.fillStyle = mg; c.beginPath(); c.arc(mx, my, 70, 0, TAU); c.fill();
      c.fillStyle = '#fff6cc'; c.beginPath(); c.arc(mx, my, 17, 0, TAU); c.fill();
      // phase: slide a dark disc across the moon (waxing lights the right side, waning the left)
      const shift = 34 * (ph < 0.5 ? ph * 2 : (ph - 1) * 2);
      c.save(); c.beginPath(); c.arc(mx, my, 17, 0, TAU); c.clip();
      c.globalAlpha = night * 0.94; c.fillStyle = mix(sky.top, '#0c0630', 0.55); c.beginPath(); c.arc(mx - shift, my, 17.5, 0, TAU); c.fill();
      c.restore(); c.globalAlpha = 1;
    } else {
      const sx = W * (0.2 + 0.6 * Math.min(1, Math.max(0, (hour - 6) / 13))), sy = H * (0.16 - 0.06 * Math.sin(Math.min(1, Math.max(0, (hour - 6) / 13)) * Math.PI));
      const sg = c.createRadialGradient(sx, sy, 6, sx, sy, 110); sg.addColorStop(0, 'rgba(255,250,210,.9)'); sg.addColorStop(1, 'rgba(255,250,210,0)');
      c.globalAlpha = 1 - night; c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, 110, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
    // clouds
    const cr = rng(99);
    c.fillStyle = night > 0.5 ? 'rgba(160,140,255,.18)' : 'rgba(255,255,255,.55)';
    for (let i = 0; i < 5; i++) {
      const sp = 6 + cr() * 8, w = 70 + cr() * 60, x = ((cr() * (W + 200) + t * sp) % (W + 200)) - 100, y = H * (0.06 + cr() * 0.5);
      for (const [ex, ey, rx, ry] of [[x, y, w * 0.5, w * 0.16], [x - w * 0.22, y + w * 0.04, w * 0.3, w * 0.12], [x + w * 0.24, y + w * 0.05, w * 0.32, w * 0.13]]) { c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); c.fill(); }
    }
  }
  function drawDeepBg(c, W, H, t) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b4fb0'); g.addColorStop(0.45, '#12307e'); g.addColorStop(1, '#070d3a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x0 = W * (0.1 + i * 0.2) + Math.sin(t * 0.25 + i * 1.7) * 26, w = 40 + (i % 3) * 22;
      const rg = c.createLinearGradient(0, 0, 0, H * 0.75); rg.addColorStop(0, 'rgba(140,220,255,.22)'); rg.addColorStop(1, 'rgba(140,220,255,0)');
      c.fillStyle = rg; c.beginPath(); c.moveTo(x0 - w * 0.2, 0); c.lineTo(x0 + w * 0.2, 0); c.lineTo(x0 + w * 1.4, H * 0.75); c.lineTo(x0 - w * 1.1, H * 0.75); c.closePath(); c.fill();
    }
    c.restore();
    const r = rng(77);
    for (let i = 0; i < 40; i++) { const x = (r() * W + Math.sin(t * 0.3 + i) * 10), y = ((r() * H + t * (4 + r() * 8)) % H); c.globalAlpha = 0.25 + 0.4 * r(); c.fillStyle = '#cfefff'; c.beginPath(); c.arc(x, y, 0.8 + r() * 1.6, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
  function drawFx(c, W, H, fx, t, night, reduce) {
    if (reduce || fx === 'nofx') return;
    const n = sc.battery ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const r = rng(i * 977 + 13), a = r(), b = r(), sp = 10 + r() * 22, ph = r() * 10;
      if (fx === 'bubbles') {
        const y = H - ((t * sp + a * H) % (H + 40)) + 20, x = b * W + Math.sin(t * 0.8 + ph) * 14, rad = 3 + r() * 6;
        c.globalAlpha = 0.5; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,255,255,.16)'; c.fill(); c.globalAlpha = 1;
      } else if (fx === 'fireflies') {
        const x = b * W + Math.sin(t * 0.5 + ph) * 40, y = H * (0.2 + a * 0.65) + Math.cos(t * 0.6 + ph * 2) * 30, p = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + ph));
        const g = c.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, `rgba(255,250,150,${0.9 * p * (0.35 + night)})`); g.addColorStop(1, 'rgba(255,250,150,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 16, 0, TAU); c.fill();
      } else if (fx === 'stardust' || fx === 'stars') {
        const x = b * W, y = a * H, p = Math.abs(Math.sin(t * 1.4 + ph)); c.save(); c.globalAlpha = p * 0.9; c.translate(x, y); c.rotate(t * 0.3 + ph); c.fillStyle = fx === 'stars' ? (i % 2 ? '#7cf0ff' : '#ff8ae0') : '#fff6b0'; const s = 3 + p * 5;
        c.beginPath(); for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; c.lineTo(Math.cos(an) * s, Math.sin(an) * s); c.lineTo(Math.cos(an + 0.78) * s * 0.3, Math.sin(an + 0.78) * s * 0.3); } c.fill(); c.restore();
      } else if (fx === 'petals') {
        const y = ((t * sp * 0.8 + a * H) % (H + 30)) - 15, x = b * W + Math.sin(t * 0.9 + ph) * 30; c.save(); c.translate(x, y); c.rotate(t * 1.2 + ph); c.fillStyle = i % 2 ? '#ffc4dc' : '#ffa6c9'; c.globalAlpha = 0.9; c.beginPath(); c.ellipse(0, 0, 5, 3, 0, 0, TAU); c.fill(); c.restore();
      } else if (fx === 'confetti') {
        const y = ((t * sp * 1.4 + a * H) % (H + 30)) - 15, x = b * W + Math.sin(t + ph) * 20; c.save(); c.translate(x, y); c.rotate(t * 2 + ph); c.fillStyle = ['#ff8fc4', '#ffe66d', '#7cf0ff', '#8be9c8', '#b590ff'][i % 5]; c.fillRect(-3, -1.6, 6, 3.2); c.restore();
      }
    }
  }

  function drawCreatureShadow(c, x, y, size, water) {
    c.save(); c.fillStyle = water ? 'rgba(20,50,120,.20)' : 'rgba(60,30,90,.24)';
    c.beginPath(); c.ellipse(x, y + size * 0.04, size * 0.3, size * 0.075, 0, 0, TAU); c.fill(); c.restore();
  }
  function drawBubble(c, g, t, ready) {
    const { x, y, r } = g;
    c.save();
    const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(190,240,255,.55)'); gr.addColorStop(1, 'rgba(170,190,255,.55)');
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.lineWidth = 2.4; c.strokeStyle = OUT; c.globalAlpha = 0.85; c.stroke(); c.globalAlpha = 1;
    // pearl
    const pr = r * 0.5, pg = c.createRadialGradient(x - pr * 0.35, y - pr * 0.35, 1, x, y, pr);
    pg.addColorStop(0, '#fff'); pg.addColorStop(0.6, '#ffe6f7'); pg.addColorStop(1, '#f0b6e6');
    c.fillStyle = pg; c.beginPath(); c.arc(x, y, pr, 0, TAU); c.fill(); c.lineWidth = 1.6; c.strokeStyle = 'rgba(59,29,94,.6)'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.42, r * 0.16, 0, TAU); c.fill();
    if (ready) { const k = 0.5 + 0.5 * Math.sin(t * 5); c.strokeStyle = `rgba(255,240,140,${0.4 + 0.5 * k})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + 3 + k * 2, 0, TAU); c.stroke(); }
    c.restore();
  }

  function draw(c, W, H, dpr, nowMs, t, o = {}) {
    const st = sc.state, pool = st.pools[sc.biome];
    const { ts, ox, oy } = o.layout || sc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const skin = skinFor(st, sc.biome);
    const forced = sc.biome === 'deep' ? 'night' : (skin.sky || sc.skyForce);
    const sky = skyAt(localHour(nowMs), forced);
    const night = sky.night;
    // ---- background
    if (sc.biome === 'deep') drawDeepBg(c, W, H, t); else drawSky(c, W, H, sky, t, nowMs);
    drawFx(c, W, H, st.equip.fx, t, night, sc.reduceMotion);
    // ---- base (cached)
    const nb = sc.biome === 'deep' ? 1 : Math.round(night * 6);
    const key = `${sc.biome}|${skin === SKINS[st.equip.skin] ? st.equip.skin : 'x'}|${pool.w}x${pool.h}|${ts.toFixed(2)}|${ox.toFixed(1)}|${oy.toFixed(1)}|${nb}|${pool.ver}|${dpr}|${W}x${H}`;
    let base;
    if (o.live) {
      if (sc._baseKey !== key) { sc._base = buildBase(st, pool, ts, ox, oy, W, H, nb / 6, skin); sc._baseKey = key; }
      base = sc._base;
    } else base = buildBase(st, pool, ts, ox, oy, W, H, nb / 6, skin);
    const shake = sc.shake > 0 && !sc.reduceMotion ? [Math.sin(t * 60) * sc.shake * 3, Math.cos(t * 50) * sc.shake * 2] : [0, 0];
    c.save(); c.translate(shake[0], shake[1]);
    c.setTransform(1, 0, 0, 1, shake[0] * dpr, shake[1] * dpr); c.drawImage(base.cv, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, shake[0] * dpr, shake[1] * dpr);
    // ---- water shimmer
    if (!sc.battery && pool.tiles.some((tl) => tl.w >= 1)) {
      c.save(); c.clip(base.paths[1]);
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = Math.max(1.5, ts * 0.04); c.lineCap = 'round';
      const rows = Math.ceil(pool.h * 2.2);
      for (let i = 0; i < rows; i++) {
        const y0 = oy + (i + 0.5) * ts * 0.46; c.beginPath();
        for (let x = 0; x <= pool.w * ts; x += 8) { const yy = y0 + Math.sin(x * 0.06 + t * 1.3 + i * 1.7) * ts * 0.06; x ? c.lineTo(ox + x, yy) : c.moveTo(ox + x, yy); }
        c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.7 + i); c.stroke();
      }
      c.globalAlpha = 1;
      c.restore();
    }
    // ---- build grid
    if (sc.buildMode && o.live) {
      c.save(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.setLineDash([4, 5]); c.lineWidth = 1.4;
      for (let x = 1; x < pool.w; x++) { c.beginPath(); c.moveTo(ox + x * ts, oy); c.lineTo(ox + x * ts, oy + pool.h * ts); c.stroke(); }
      for (let y = 1; y < pool.h; y++) { c.beginPath(); c.moveTo(ox, oy + y * ts); c.lineTo(ox + pool.w * ts, oy + y * ts); c.stroke(); }
      c.restore();
    }
    // ---- habitat overlay for the selected creature
    if (sc.selected && o.live) {
      const cr = pool.creatures.find((k) => k.id === sc.selected);
      if (cr) {
        c.save();
        for (const [dx, dy, w] of D.KERNEL) { const tx = cr.x + dx, ty = cr.y + dy; if (!S.inb(pool, tx, ty)) continue; c.fillStyle = `rgba(255,255,255,${0.08 + w * 0.12})`; c.beginPath(); const p = new Path2D(); roundedRectPath(p, ox + tx * ts + 2, oy + ty * ts + 2, ts - 4, ts - 4, [ts * 0.2, ts * 0.2, ts * 0.2, ts * 0.2]); c.fill(p); }
        c.restore();
      }
    }
    // ---- objects (depth sorted)
    const items = [];
    const glows = [];
    for (let y = 0; y < pool.h; y++) for (let x = 0; x < pool.w; x++) {
      const tl = pool.tiles[y * pool.w + x], idx = y * pool.w + x;
      if (tl.p) items.push({ y: y + 0.6, f: () => {
        const pop = sc.pops.get(idx), k = pop === undefined ? 1 : Math.min(1, (t - pop) / 0.35);
        const sq = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k) * 0.5 : 1;
        const [cx, cy] = [ox + (x + 0.5) * ts, oy + (y + 0.5) * ts + ts * 0.3];
        c.save(); c.translate(cx, cy); c.scale(1 / Math.max(0.3, sq) * (k < 1 ? 1 : 1), Math.max(0.2, sq)); c.translate(-cx, -cy);
        if (tl.w >= 1) { c.save(); c.globalAlpha = 0.5; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cy + 2, ts * 0.38 + Math.sin(t * 2 + x) * 1.5, ts * 0.11, 0, 0, TAU); c.stroke(); c.restore(); }
        PIECE_ART[tl.p](c, cx, cy, ts, t, x * 7 + y * 13);
        c.restore();
      } });
      if (tl.d && !tl.p) items.push({ y: y + 0.62, f: () => { const cx = ox + (x + 0.5) * ts, cy = oy + (y + 0.5) * ts + ts * 0.32; PROP_ART[tl.d](c, cx, cy, ts, t, night > 0.4); } });
    }
    for (const e of pool.eggs) {
      const v = sc.views.get(e.id); if (!v) continue;
      items.push({ y: v.y + 0.6, f: () => { const [x, y] = tc(v.x, v.y); const ready = nowMs >= e.ready; drawEgg(c, e.fam, x, y + ts * 0.3, ts * 1.1, t + v.phase, { ready, cracks: v.taps, pop: 1 + v.squash * 0.15 }); } });
    }
    for (const cr of pool.creatures) {
      const v = sc.views.get(cr.id); if (!v) continue;
      items.push({ y: v.y + 0.7, f: () => {
        const [x, y0] = tc(v.x, v.y), size = ts * creatureScale(cr), form = FORMS[cr.form], fam = FAMILIES[form.fam];
        const water = fam.med === 'water', y = y0 + ts * 0.18;
        if (cr.evo) {
          const prog = 1 - Math.max(0, cr.evo.end - nowMs) / Math.max(1, cr.evo.end - cr.evo.start);
          drawCocoon(c, x, y, ts * 1.25, t + v.phase, prog);
          return;
        }
        drawCreatureShadow(c, x, y, size, water);
        if (sc.selected === cr.id) { c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([6, 6]); c.lineDashOffset = -t * 20; c.beginPath(); c.ellipse(x, y + size * 0.04, size * 0.38, size * 0.12, 0, 0, TAU); c.stroke(); c.restore(); }
        const bob = water ? Math.sin(t * 1.7 + v.phase) * ts * 0.07 : (v.moving ? -Math.abs(Math.sin(v.hop)) * ts * 0.1 : Math.sin(t * 1.6 + v.phase) * ts * 0.012);
        const sq = v.squash, breathe = 1 + Math.sin(t * 2.1 + v.phase) * 0.018;
        const sx = 1 + Math.sin(sq * Math.PI * 3) * 0.16 * sq + (breathe - 1), sy = 1 - Math.sin(sq * Math.PI * 3) * 0.16 * sq - (breathe - 1);
        const facing = facingOf(cr.form), flip = facing === 'c' ? false : (facing === 'r' ? v.face < 0 : v.face > 0);
        const bright = form.stage === 3 ? 1 : 1;
        c.save(); c.translate(x, y + bob); c.scale(sx * (flip ? -1 : 1), sy);
        drawSprite(c, cr.form, 0, 0, size, { blink: v.blink > 0, hat: cr.hat });
        c.restore();
        if (form.deco.includes('glowdots') || form.deco.includes('lava')) glows.push({ x, y: y + bob - size * 0.3, r: size * 0.7, col: form.deco.includes('lava') ? 'rgba(255,140,60,.55)' : 'rgba(255,240,140,.5)' });
      } });
    }
    items.sort((a, b) => a.y - b.y).forEach((it) => it.f());
    // ---- night glows (additive)
    if (night > 0.25) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const g of glows) { const gr = c.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r); gr.addColorStop(0, g.col); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.globalAlpha = night * 0.8; c.fillStyle = gr; c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.fill(); }
      c.restore();
    }
    // ---- bubbles (always on top)
    if (o.live) for (const cr of pool.creatures) {
      const v = sc.views.get(cr.id); if (!v) continue;
      const g = bubbleGeom(cr, v); if (g) drawBubble(c, g, t + v.phase, g.fill > 0.97);
    }
    // ---- tutorial hints & hover
    if (o.live) {
      for (const h of sc.hintTiles) { const k = 0.5 + 0.5 * Math.sin(t * 5); c.save(); c.strokeStyle = `rgba(255,240,120,${0.6 + 0.4 * k})`; c.lineWidth = 3 + k * 2; const p = new Path2D(); roundedRectPath(p, ox + h.x * ts + 3, oy + h.y * ts + 3, ts - 6, ts - 6, [ts * 0.25, ts * 0.25, ts * 0.25, ts * 0.25]); c.stroke(p); c.fillStyle = `rgba(255,240,120,${0.10 + 0.12 * k})`; c.fill(p); c.restore(); }
      if (sc.hover && sc.buildMode) { const p = new Path2D(); roundedRectPath(p, ox + sc.hover.x * ts + 2, oy + sc.hover.y * ts + 2, ts - 4, ts - 4, [ts * 0.22, ts * 0.22, ts * 0.22, ts * 0.22]); c.save(); c.fillStyle = 'rgba(255,255,255,.28)'; c.fill(p); c.strokeStyle = sc.toolTint; c.lineWidth = 3; c.stroke(p); c.restore(); }
    }
    // ---- particles + floating text
    for (const p of sc.parts) {
      const k = p.life / p.max, a = 1 - k * k;
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(p.x, p.y); c.rotate(p.rot);
      if (p.kind === 'spark') { c.fillStyle = p.color; const s = p.size; c.beginPath(); for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; c.lineTo(Math.cos(an) * s, Math.sin(an) * s); c.lineTo(Math.cos(an + 0.78) * s * 0.3, Math.sin(an + 0.78) * s * 0.3); } c.fill(); }
      else if (p.kind === 'bubble') { c.strokeStyle = p.color; c.lineWidth = 1.8; c.beginPath(); c.arc(0, 0, p.size * (0.6 + k * 0.6), 0, TAU); c.stroke(); }
      else if (p.kind === 'pearl') { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, p.size * 0.6, 0, TAU); c.fill(); c.strokeStyle = '#f0b6e6'; c.lineWidth = 1.6; c.stroke(); }
      else if (p.kind === 'heart') { c.fillStyle = p.color; const s = p.size; c.beginPath(); c.moveTo(0, s * 0.35); c.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s, 0, -s * 0.4); c.bezierCurveTo(s * 0.5, -s, s, -s * 0.3, 0, s * 0.35); c.fill(); }
      else if (p.kind === 'confetti') { c.fillStyle = p.color; c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else if (p.kind === 'ring') { c.strokeStyle = p.color; c.lineWidth = 4 * (1 - k); c.beginPath(); c.arc(0, 0, p.size * (0.2 + k * 0.9), 0, TAU); c.stroke(); }
      c.restore();
    }
    for (const tx of sc.texts) {
      const k = tx.life / tx.max; c.save(); c.globalAlpha = Math.min(1, (1 - k) * 2.2); c.font = `700 ${tx.size}px Fredoka, ui-rounded, system-ui, sans-serif`; c.textAlign = 'center';
      c.lineWidth = 4; c.strokeStyle = 'rgba(59,29,94,.85)'; c.lineJoin = 'round'; c.strokeText(tx.str, tx.x, tx.y - k * 34); c.fillStyle = tx.color; c.fillText(tx.str, tx.x, tx.y - k * 34); c.restore();
    }
    c.restore();
  }
  sc.drawTo = draw;
  /** Render a shareable picture of the current pool. Returns a canvas. */
  sc.snapshot = (nowMs, size = [1080, 1350]) => {
    const [W, H] = size, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const pool = sc.pool(), ins = { top: H * 0.1, bottom: H * 0.12 };
    const lay = sc.layoutFor(pool, W, H, ins);
    const keep = { dpr: sc.dpr };
    sc.dpr = 1;
    const c = cv.getContext('2d');
    draw(c, W, H, 1, nowMs, sc.time, { live: false, layout: lay });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = '700 54px Fredoka, ui-rounded, system-ui, sans-serif'; c.textAlign = 'center';
    c.lineWidth = 10; c.strokeStyle = 'rgba(59,29,94,.9)'; c.lineJoin = 'round'; c.strokeText('Tiny Tides', W / 2, H * 0.075); c.fillStyle = '#fff'; c.fillText('Tiny Tides', W / 2, H * 0.075);
    c.font = '600 28px Fredoka, ui-rounded, system-ui, sans-serif'; c.strokeText(`${S.dexCount(sc.state)} / ${D.FORM_IDS.length} creatures discovered`, W / 2, H * 0.955); c.fillText(`${S.dexCount(sc.state)} / ${D.FORM_IDS.length} creatures discovered`, W / 2, H * 0.955);
    sc.dpr = keep.dpr;
    return cv;
  };
  return sc;
}

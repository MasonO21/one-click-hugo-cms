/**
 * Photo frames (Wardrobe › Frames), drawn procedurally on the photo's 2D canvas by compose.ts. Each one is clearly
 * its own thing:
 *
 *  - frame_cozy_knit   a hand-knitted border: rows of V stitches in rust and cream bands, a running stitch round
 *                      the photo, wooden buttons and a ball of yarn
 *  - frame_sakura      blush paper with blossom branches reaching round the photo's corners, petals drifting
 *  - frame_starry      a night sky: stars, glowing twinkles, a crescent moon, a shooting star and a constellation
 *  - frame_honey_gold  golden honeycomb with honey dripping over the top of the photo and two busy bees
 *  - frame_crystal     pastel shimmer with crystal clusters and gem-petal flowers blooming in the corners
 *
 * `drawFrameBack` paints the border (before the photo), `drawFrameFront` the rim and whatever reaches over the photo's
 * edges (after it); `framePlate` styles the caption plate. Everything scales with the border width, and the
 * scatter comes from a seeded generator, so a frame looks the same on every photo. Drawing happens once per shot.
 */
import type { FrameLayout } from '../logic/photo';

/** The frames this module can draw (the photo_frame cosmetics). */
export const DRAWN_FRAMES = ['frame_cozy_knit', 'frame_sakura', 'frame_starry', 'frame_honey_gold', 'frame_crystal'] as const;
export type DrawnFrame = (typeof DRAWN_FRAMES)[number];

export function isDrawnFrame(id: string | null | undefined): id is DrawnFrame {
  return !!id && (DRAWN_FRAMES as readonly string[]).includes(id);
}

export interface FramePlate {
  fill: string;
  stroke: string;
  /** Dashed stroke (stitching). */
  dash: boolean;
  title: string;
  line: string;
  star: string;
  mark: string;
}

const PLATES: Record<DrawnFrame, FramePlate> = {
  frame_cozy_knit: { fill: '#fbf0d9', stroke: '#b35a4a', dash: true, title: '#3a2350', line: '#8a5a2b', star: '#c46a5a', mark: '#8a5a2b' },
  frame_sakura: { fill: '#fff8fa', stroke: '#ff9fb6', dash: false, title: '#5a2a48', line: '#b0577a', star: '#ff6f91', mark: '#b0577a' },
  frame_starry: { fill: 'rgba(24,27,74,0.92)', stroke: '#ffe08a', dash: false, title: '#fff3c8', line: '#ffd98a', star: '#ffe08a', mark: '#ffe9b0' },
  frame_honey_gold: { fill: '#fff6d6', stroke: '#c48a3a', dash: false, title: '#5a3a10', line: '#9a6418', star: '#e0a020', mark: '#9a6418' },
  frame_crystal: { fill: '#fbf7ff', stroke: '#b49cff', dash: false, title: '#3d2a6a', line: '#6a5aa8', star: '#6ac8ff', mark: '#6a5aa8' },
};

export function framePlate(id: DrawnFrame): FramePlate {
  return PLATES[id];
}

type C = CanvasRenderingContext2D;

/** Small seeded generator (mulberry32): the same frame scatters its petals and stars the same way every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from (x, y) to the photo rectangle (0 inside). */
function outside(L: FrameLayout, x: number, y: number): number {
  const dx = Math.max(L.px - x, 0, x - (L.px + L.pw));
  const dy = Math.max(L.py - y, 0, y - (L.py + L.ph));
  return Math.hypot(dx, dy);
}

/** A random point in the border (not on the photo), at least `margin` from the photo. */
function borderPoint(L: FrameLayout, r: () => number, margin = 0): [number, number] {
  for (let i = 0; i < 40; i++) {
    const x = r() * L.w;
    const y = r() * L.h;
    if (outside(L, x, y) > margin) return [x, y];
  }
  return [r() * L.w, r() * L.py];
}

function roundRect(c: C, x: number, y: number, w: number, h: number, rad: number): void {
  const rr = Math.min(rad, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** The photo's four corners, each with the direction pointing away from the photo (for corner decorations). */
function corners(L: FrameLayout): { x: number; y: number; sx: number; sy: number }[] {
  return [
    { x: L.px, y: L.py, sx: -1, sy: -1 },
    { x: L.px + L.pw, y: L.py, sx: 1, sy: -1 },
    { x: L.px + L.pw, y: L.py + L.ph, sx: 1, sy: 1 },
    { x: L.px, y: L.py + L.ph, sx: -1, sy: 1 },
  ];
}

/** A four-pointed twinkle with a soft glow. */
function twinkle(c: C, x: number, y: number, r: number, color: string, glow = true): void {
  if (glow) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, 'rgba(255,250,220,0.55)');
    g.addColorStop(1, 'rgba(255,250,220,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r * 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + r * 0.14, y - r * 0.14, x + r, y);
  c.quadraticCurveTo(x + r * 0.14, y + r * 0.14, x, y + r);
  c.quadraticCurveTo(x - r * 0.14, y + r * 0.14, x - r, y);
  c.quadraticCurveTo(x - r * 0.14, y - r * 0.14, x, y - r);
  c.closePath();
  c.fill();
}

/** A rim round the photo: `widths` from the outside in, each with its colour. */
function rim(c: C, L: FrameLayout, layers: [number, string][]): void {
  let grow = layers.reduce((s, [w]) => s + w, 0);
  for (const [w, color] of layers) {
    c.lineWidth = w;
    c.strokeStyle = color;
    const o = grow - w / 2;
    roundRect(c, L.px - o, L.py - o, L.pw + o * 2, L.ph + o * 2, L.radius + o);
    c.stroke();
    grow -= w;
  }
}

// ================================================================================== knit

function knitBack(c: C, L: FrameLayout): void {
  const u = L.px;
  const base = '#c46a5a';
  const cream = '#f6e2c0';
  c.fillStyle = '#a9543f';
  c.fillRect(0, 0, L.w, L.h);
  const sw = Math.max(6, u * 0.27);
  const sh = sw * 1.05;
  const rowStep = sh * 0.78;
  const outline = 'rgba(80,30,20,0.28)';
  const shine = 'rgba(255,255,255,0.22)';
  const leaf = (x: number, y: number, rot: number, color: string) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.beginPath();
    c.ellipse(0, 0, sw * 0.27, sh * 0.5, 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.lineWidth = Math.max(1, sw * 0.07);
    c.strokeStyle = outline;
    c.stroke();
    c.beginPath();
    c.ellipse(-sw * 0.05, -sh * 0.12, sw * 0.07, sh * 0.22, 0, 0, Math.PI * 2);
    c.fillStyle = shine;
    c.fill();
    c.restore();
  };
  let row = 0;
  for (let y = -sh * 0.5; y < L.h + sh; y += rowStep, row++) {
    let col = 0;
    for (let x = sw * 0.5 * (row % 2 ? 0 : 0); x < L.w + sw; x += sw, col++) {
      const d = outside(L, x, y);
      if (d <= 0) continue;
      const ring = Math.floor(d / rowStep);
      const edge = Math.min(x, y, L.w - x, L.h - y) < rowStep * 0.9;
      // bands from the photo out: cream ribbing, rust, a Fair Isle row of cream diamonds, rust…, a cream hem
      let color = base;
      if (edge || ring === 0) color = cream;
      else if (ring === 2) color = (col + row) % 4 === 0 || (col - row + 400) % 4 === 0 ? cream : base;
      else if (ring >= 4 && ring % 4 === 0) color = '#d98a62';
      leaf(x - sw * 0.2, y, 0.5, color);
      leaf(x + sw * 0.2, y, -0.5, color);
    }
  }
}

function knitFront(c: C, L: FrameLayout): void {
  const u = L.px;
  rim(c, L, [
    [Math.max(1, u * 0.03), 'rgba(120,50,30,0.45)'],
    [Math.max(3, u * 0.17), '#f6e2c0'],
  ]);
  // a running stitch in rust thread along the cream rim
  c.save();
  c.setLineDash([u * 0.16, u * 0.11]);
  c.lineCap = 'round';
  c.lineWidth = Math.max(1.5, u * 0.045);
  c.strokeStyle = '#b35a4a';
  const o = u * 0.085;
  roundRect(c, L.px - o, L.py - o, L.pw + o * 2, L.ph + o * 2, L.radius + o);
  c.stroke();
  c.restore();
  // wooden buttons at the top corners
  for (const k of corners(L).slice(0, 2)) {
    const x = k.x + k.sx * u * 0.5;
    const y = k.y + k.sy * u * 0.5;
    const r = u * 0.42;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#e8b47a');
    g.addColorStop(1, '#a8703c');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = Math.max(1, r * 0.12);
    c.strokeStyle = '#7a4a22';
    c.stroke();
    c.fillStyle = '#6a3a18';
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      c.beginPath();
      c.arc(x + dx * r * 0.28, y + dy * r * 0.28, r * 0.11, 0, Math.PI * 2);
      c.fill();
    }
  }
  // a ball of yarn with two needles, sitting on the photo's bottom-right corner
  const k = corners(L)[2];
  const R = u * 1.25;
  const bx = k.x - R * 0.25;
  const by = k.y - R * 0.72;
  c.save();
  c.shadowColor = 'rgba(60,20,10,0.35)';
  c.shadowBlur = R * 0.3;
  c.shadowOffsetY = R * 0.12;
  c.fillStyle = '#e88a9a';
  c.beginPath();
  c.arc(bx, by, R, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.arc(bx, by, R, 0, Math.PI * 2);
  c.clip();
  c.lineWidth = Math.max(1, R * 0.07);
  c.strokeStyle = 'rgba(160,50,70,0.55)';
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.ellipse(bx + i * R * 0.18, by, R * 0.35, R * 1.2, 0.6, 0, Math.PI * 2);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.ellipse(bx, by + i * R * 0.2, R * 1.2, R * 0.3, -0.5, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
  // needles
  c.lineCap = 'round';
  for (const [a, len] of [[-2.2, 2.3], [-1.75, 2.1]] as const) {
    const x1 = bx + Math.cos(a) * R * 0.2;
    const y1 = by + Math.sin(a) * R * 0.2;
    const x2 = bx + Math.cos(a) * R * len;
    const y2 = by + Math.sin(a) * R * len;
    c.lineWidth = Math.max(2, R * 0.13);
    c.strokeStyle = '#d9c3a0';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.fillStyle = '#ff9a5a';
    c.beginPath();
    c.arc(x2, y2, R * 0.16, 0, Math.PI * 2);
    c.fill();
  }
  // a loose strand of yarn trailing down the border
  c.lineWidth = Math.max(1.5, R * 0.08);
  c.strokeStyle = '#e88a9a';
  c.beginPath();
  c.moveTo(bx + R * 0.7, by + R * 0.6);
  c.bezierCurveTo(bx + R * 1.4, by + R * 1.6, L.w - u * 0.2, by + R * 1.2, L.w - u * 0.35, Math.min(L.h - u * 0.2, by + R * 2.4));
  c.stroke();
}

// ================================================================================== sakura

function petalPath(c: C, r: number): void {
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(-r * 0.62, -r * 0.22, -r * 0.62, -r * 0.88, -r * 0.2, -r);
  c.lineTo(0, -r * 0.8);
  c.lineTo(r * 0.2, -r);
  c.bezierCurveTo(r * 0.62, -r * 0.88, r * 0.62, -r * 0.22, 0, 0);
  c.closePath();
}

function blossom(c: C, x: number, y: number, r: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.shadowColor = 'rgba(180,60,100,0.25)';
  c.shadowBlur = r * 0.25;
  c.shadowOffsetY = r * 0.06;
  const g = c.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ff8fb0');
  g.addColorStop(0.35, '#ffc2d3');
  g.addColorStop(1, '#fff0f4');
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate((i * Math.PI * 2) / 5);
    petalPath(c, r);
    c.fillStyle = g;
    c.fill();
    c.restore();
  }
  c.shadowColor = 'transparent';
  c.lineWidth = Math.max(1, r * 0.05);
  c.strokeStyle = 'rgba(230,110,150,0.45)';
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate((i * Math.PI * 2) / 5);
    petalPath(c, r);
    c.stroke();
    c.restore();
  }
  // stamens
  c.strokeStyle = '#e0507a';
  c.lineWidth = Math.max(1, r * 0.04);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
    c.stroke();
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.arc(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, r * 0.05, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#ff6f91';
  c.beginPath();
  c.arc(0, 0, r * 0.12, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function looseP(c: C, x: number, y: number, r: number, rot: number, alpha: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.globalAlpha = alpha;
  petalPath(c, r);
  const g = c.createLinearGradient(0, 0, 0, -r);
  g.addColorStop(0, '#ff9fb6');
  g.addColorStop(1, '#ffe3ea');
  c.fillStyle = g;
  c.fill();
  c.restore();
}

function sakuraBack(c: C, L: FrameLayout): void {
  const r = rng(0x5a4c);
  const g = c.createLinearGradient(0, 0, L.w * 0.3, L.h);
  g.addColorStop(0, '#ffeef3');
  g.addColorStop(0.5, '#ffdbe5');
  g.addColorStop(1, '#ffe9f0');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  // soft light blooms
  for (let i = 0; i < 9; i++) {
    const [x, y] = borderPoint(L, r);
    const rad = L.px * (1.5 + r() * 2);
    const rg = c.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, 'rgba(255,255,255,0.55)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const n = Math.round(((L.w + L.h) / L.px) * 3.2);
  for (let i = 0; i < n; i++) {
    const [x, y] = borderPoint(L, r);
    looseP(c, x, y, L.px * (0.16 + r() * 0.18), r() * Math.PI * 2, 0.35 + r() * 0.4);
  }
}

/** A tapering branch from (x0,y0) curving through (cx,cy) to (x1,y1). */
function branch(c: C, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 26;
  c.lineCap = 'round';
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    c.strokeStyle = '#7a4a3a';
    c.lineWidth = Math.max(1, w * (1 - t * 0.75));
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(x, y);
    c.stroke();
    pts.push([x, y]);
    px = x;
    py = y;
  }
  return pts;
}

function sakuraFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x5ac0);
  rim(c, L, [
    [Math.max(2, u * 0.09), '#ffffff'],
    [Math.max(1, u * 0.04), '#ffb7c5'],
  ]);
  const reach = Math.min(L.pw, L.ph) * 0.34;
  for (const k of corners(L)) {
    // a branch along the edge from the corner, sprouting blossoms over the photo's corner
    const horizontal = k.sy < 0; // top corners reach along the top edge, bottom ones up the sides
    // (the bottom ones start a little above the corner: the caption plate sits right under the photo)
    const x0 = k.x + k.sx * u * (horizontal ? 0.55 : 0.4);
    const y0 = horizontal ? k.y + k.sy * u * 0.55 : k.y - u * 0.45;
    const x1 = horizontal ? k.x - k.sx * reach : k.x - k.sx * u * 0.1;
    const y1 = horizontal ? k.y - k.sy * u * 0.1 : k.y - k.sy * reach;
    const cx = horizontal ? k.x - k.sx * reach * 0.4 : k.x + k.sx * u * 0.3;
    const cy = horizontal ? k.y + k.sy * u * 0.3 : k.y - k.sy * reach * 0.4;
    const pts = branch(c, x0, y0, cx, cy, x1, y1, u * 0.3);
    // twigs
    for (const t of [0.35, 0.7]) {
      const [bx, by] = pts[Math.floor(t * (pts.length - 1))];
      branch(c, bx, by, bx + (horizontal ? 0 : -k.sx * u * 0.5), by + (horizontal ? -k.sy * u * 0.5 : 0), bx + (horizontal ? -k.sx * u * 0.4 : -k.sx * u * 1.1), by + (horizontal ? -k.sy * u * 1.1 : -k.sy * u * 0.4), u * 0.13);
    }
    // blossoms and buds along it, the biggest at the corner
    blossom(c, x0 - k.sx * u * 0.1, y0 - k.sy * u * 0.1, u * (horizontal ? 1.05 : 0.9), r() * 6);
    for (const t of [0.18, 0.4, 0.62, 0.84]) {
      const [bx, by] = pts[Math.floor(t * (pts.length - 1))];
      const off = (r() - 0.5) * u * 0.6;
      blossom(c, bx + (horizontal ? 0 : off), by + (horizontal ? off : 0), u * (0.85 - t * 0.35 + r() * 0.1), r() * 6);
    }
    for (const t of [0.95, 0.55]) {
      const [bx, by] = pts[Math.floor(t * (pts.length - 1))];
      c.fillStyle = '#ff7fa0';
      c.beginPath();
      c.ellipse(bx + k.sx * u * 0.18, by + k.sy * u * 0.18, u * 0.15, u * 0.22, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  // a few petals drifting over the photo's edges
  for (let i = 0; i < 16; i++) {
    const k = corners(L)[i % 4];
    const x = k.x - k.sx * r() * reach * 1.2;
    const y = k.y - k.sy * r() * reach * 0.6;
    looseP(c, x, y, u * (0.2 + r() * 0.14), r() * 6, 0.85);
  }
}

// ================================================================================== starry night

function starryBack(c: C, L: FrameLayout): void {
  const r = rng(0x57a2);
  const g = c.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#171b4d');
  g.addColorStop(0.55, '#2c3278');
  g.addColorStop(1, '#4a3f8f');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  // a milky band of soft clouds
  for (let i = 0; i < 10; i++) {
    const [x, y] = borderPoint(L, r);
    const rad = L.px * (1.2 + r() * 2.2);
    const rg = c.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, i % 2 ? 'rgba(180,140,255,0.22)' : 'rgba(120,200,255,0.16)');
    rg.addColorStop(1, 'rgba(120,120,255,0)');
    c.fillStyle = rg;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // dust of tiny stars
  const n = Math.round(((L.w + L.h) / L.px) * 14);
  for (let i = 0; i < n; i++) {
    const [x, y] = borderPoint(L, r);
    c.globalAlpha = 0.35 + r() * 0.65;
    c.fillStyle = r() < 0.25 ? '#ffe9a8' : '#ffffff';
    c.beginPath();
    c.arc(x, y, L.px * (0.015 + r() * 0.035), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  // twinkles
  const t = Math.round(((L.w + L.h) / L.px) * 0.9);
  for (let i = 0; i < t; i++) {
    const [x, y] = borderPoint(L, r, L.px * 0.15);
    twinkle(c, x, y, L.px * (0.12 + r() * 0.22), r() < 0.5 ? '#fff6cf' : '#ffe08a');
  }
}

function starryFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x57f0);
  rim(c, L, [
    [Math.max(2, u * 0.07), '#ffe08a'],
    [Math.max(1, u * 0.04), '#1b1f55'],
    [Math.max(1, u * 0.03), 'rgba(255,224,138,0.8)'],
  ]);
  // crescent moon over the top-right corner
  const k = corners(L)[1];
  const R = u * 1.45;
  const mx = k.x - R * 0.2;
  const my = k.y + R * 0.1;
  const glow = c.createRadialGradient(mx, my, R * 0.6, mx, my, R * 2);
  glow.addColorStop(0, 'rgba(255,240,180,0.45)');
  glow.addColorStop(1, 'rgba(255,240,180,0)');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(mx, my, R * 2, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(mx, my, R, 0, Math.PI * 2);
  c.clip();
  c.beginPath();
  c.rect(mx - R * 2, my - R * 2, R * 4, R * 4);
  c.arc(mx + R * 0.48, my - R * 0.3, R * 0.88, 0, Math.PI * 2, true);
  const mg = c.createLinearGradient(mx - R, my - R, mx + R, my + R);
  mg.addColorStop(0, '#fff8d8');
  mg.addColorStop(1, '#ffd36a');
  c.fillStyle = mg;
  c.fill('evenodd');
  c.restore();
  // a sleepy face on the moon
  c.strokeStyle = '#c9902a';
  c.lineWidth = Math.max(1, R * 0.05);
  c.lineCap = 'round';
  c.beginPath();
  c.arc(mx - R * 0.5, my - R * 0.05, R * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  c.fillStyle = 'rgba(255,140,140,0.5)';
  c.beginPath();
  c.arc(mx - R * 0.45, my + R * 0.25, R * 0.09, 0, Math.PI * 2);
  c.fill();
  // a shooting star across the top-left corner
  const s = corners(L)[0];
  const sx = s.x + u * 1.6;
  const sy = s.y - u * 0.45;
  const tail = c.createLinearGradient(sx, sy, sx - u * 2.6, sy - u * 0.25);
  tail.addColorStop(0, 'rgba(255,248,210,0.95)');
  tail.addColorStop(1, 'rgba(255,248,210,0)');
  c.strokeStyle = tail;
  c.lineWidth = u * 0.1;
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(sx - u * 2.6, sy - u * 0.25);
  c.stroke();
  twinkle(c, sx, sy, u * 0.32, '#fffbe6');
  // a little constellation in the bottom-left border
  const b = corners(L)[3];
  const pts: [number, number][] = [
    [b.x - u * 0.55, b.y - u * 2.2],
    [b.x - u * 0.35, b.y - u * 1.1],
    [b.x - u * 0.6, b.y - u * 0.1],
    [b.x + u * 0.5, b.y + u * 0.35],
  ];
  c.strokeStyle = 'rgba(255,233,168,0.6)';
  c.lineWidth = Math.max(1, u * 0.025);
  c.setLineDash([u * 0.08, u * 0.06]);
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.setLineDash([]);
  for (const [x, y] of pts) twinkle(c, x, y, u * (0.17 + r() * 0.08), '#ffe9a8');
  // twinkles sparkling on the photo's edges
  for (let i = 0; i < 8; i++) {
    const kk = corners(L)[i % 4];
    twinkle(c, kk.x - kk.sx * r() * u * 3, kk.y - kk.sy * r() * u * 0.4, u * (0.14 + r() * 0.16), '#fff6cf');
  }
}

// ================================================================================== honey

function hexPath(c: C, x: number, y: number, rad: number): void {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = x + rad * Math.cos(a);
    const py = y + rad * Math.sin(a);
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
}

function honeyBack(c: C, L: FrameLayout): void {
  const g = c.createLinearGradient(0, 0, L.w, L.h);
  g.addColorStop(0, '#ffd75a');
  g.addColorStop(0.5, '#f7bd3a');
  g.addColorStop(1, '#e9a42a');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  const rad = Math.max(6, L.px * 0.3);
  const dx = rad * 1.5;
  const dy = rad * Math.sqrt(3);
  let col = 0;
  for (let x = 0; x < L.w + dx; x += dx, col++) {
    for (let y = col % 2 ? dy / 2 : 0; y < L.h + dy; y += dy) {
      if (outside(L, x, y) <= rad * 0.2) continue;
      hexPath(c, x, y, rad * 0.9);
      const hg = c.createLinearGradient(x, y - rad, x, y + rad);
      hg.addColorStop(0, 'rgba(255,240,170,0.55)');
      hg.addColorStop(1, 'rgba(255,200,60,0.05)');
      c.fillStyle = hg;
      c.fill();
      c.lineWidth = Math.max(1, rad * 0.14);
      c.strokeStyle = 'rgba(176,112,24,0.55)';
      c.stroke();
    }
  }
}

function bee(c: C, x: number, y: number, s: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  // wings
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.strokeStyle = 'rgba(120,140,170,0.7)';
  c.lineWidth = Math.max(1, s * 0.05);
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * s * 0.25, -s * 0.55, s * 0.28, s * 0.42, sx * 0.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  // body
  c.beginPath();
  c.ellipse(0, 0, s * 0.72, s * 0.5, 0, 0, Math.PI * 2);
  c.fillStyle = '#ffd23a';
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#4a3220';
  for (const sx of [-0.1, 0.3]) c.fillRect(sx * s, -s, s * 0.2, s * 2);
  c.restore();
  c.lineWidth = Math.max(1, s * 0.07);
  c.strokeStyle = '#4a3220';
  c.beginPath();
  c.ellipse(0, 0, s * 0.72, s * 0.5, 0, 0, Math.PI * 2);
  c.stroke();
  // face
  c.fillStyle = '#4a3220';
  c.beginPath();
  c.arc(-s * 0.45, -s * 0.1, s * 0.07, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,120,120,0.6)';
  c.beginPath();
  c.arc(-s * 0.5, s * 0.15, s * 0.08, 0, Math.PI * 2);
  c.fill();
  // stinger
  c.fillStyle = '#4a3220';
  c.beginPath();
  c.moveTo(s * 0.7, -s * 0.06);
  c.lineTo(s * 0.92, 0);
  c.lineTo(s * 0.7, s * 0.06);
  c.fill();
  c.restore();
}

function honeyFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x4b0e);
  rim(c, L, [
    [Math.max(2, u * 0.08), '#c48a3a'],
    [Math.max(1, u * 0.05), '#ffe7a0'],
  ]);
  const honey = c.createLinearGradient(0, L.py - u * 0.4, 0, L.py + u * 2.2);
  honey.addColorStop(0, '#ffcf3a');
  honey.addColorStop(1, '#e89a1a');
  // a thick ribbon of honey along the top of the photo, wavy where it spills over the edge
  const top = L.py - u * 0.35;
  c.beginPath();
  c.moveTo(L.px - u * 0.3, top);
  c.lineTo(L.px + L.pw + u * 0.3, top);
  const waves = Math.max(6, Math.round(L.pw / (u * 0.9)));
  for (let i = waves; i >= 0; i--) {
    const x = L.px - u * 0.3 + ((L.pw + u * 0.6) * i) / waves;
    const y = L.py + u * (0.12 + 0.12 * Math.sin(i * 1.7));
    c.lineTo(x, y);
  }
  c.closePath();
  c.fillStyle = honey;
  c.fill();
  // drips of different lengths running down over the photo
  const drips = Math.max(5, Math.round(L.pw / (u * 1.3)));
  for (let i = 0; i < drips; i++) {
    const x = L.px + ((i + 0.3 + r() * 0.4) / drips) * L.pw;
    const w = u * (0.22 + r() * 0.16);
    const len = u * (0.5 + r() * (i % 3 === 1 ? 2.2 : 1.1));
    const y0 = L.py + u * 0.05;
    c.fillStyle = honey;
    c.beginPath();
    c.moveTo(x - w / 2, y0);
    c.lineTo(x - w / 2, y0 + len);
    c.arc(x, y0 + len, w * 0.62, Math.PI, 0, true);
    c.lineTo(x + w / 2, y0);
    c.closePath();
    c.fill();
    // a bead at the tip and a shine down the side
    c.beginPath();
    c.arc(x, y0 + len + w * 0.05, w * 0.62, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = Math.max(1, w * 0.16);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - w * 0.18, y0 + u * 0.2);
    c.lineTo(x - w * 0.18, y0 + len - w * 0.1);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.arc(x - w * 0.2, y0 + len - w * 0.05, w * 0.14, 0, Math.PI * 2);
    c.fill();
  }
  // the ribbon's gloss
  c.strokeStyle = 'rgba(255,250,220,0.6)';
  c.lineWidth = Math.max(1, u * 0.06);
  c.beginPath();
  c.moveTo(L.px, top + u * 0.15);
  c.lineTo(L.px + L.pw, top + u * 0.15);
  c.stroke();
  // two busy bees
  const k0 = corners(L)[0];
  bee(c, k0.x + u * 0.25, k0.y - u * 0.35, u * 0.85, -0.25);
  const k2 = corners(L)[2];
  bee(c, k2.x - u * 0.35, k2.y - u * 0.1, u * 0.8, 0.3);
  // a dotted flight path
  c.strokeStyle = 'rgba(120,70,10,0.45)';
  c.lineWidth = Math.max(1, u * 0.03);
  c.setLineDash([u * 0.06, u * 0.08]);
  c.beginPath();
  c.moveTo(k2.x - u * 0.7, k2.y + u * 0.15);
  c.bezierCurveTo(k2.x - u * 1.6, k2.y - u * 0.9, k2.x - u * 2.4, k2.y + u * 0.6, k2.x - u * 3.2, k2.y - u * 0.3);
  c.stroke();
  c.setLineDash([]);
}

// ================================================================================== crystal flowers

function prism(c: C, x: number, y: number, ang: number, w: number, hgt: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, 0, 0, -hgt);
  g.addColorStop(0, '#9ae6ff');
  g.addColorStop(1, '#d6c2ff');
  // left facet
  c.beginPath();
  c.moveTo(-w / 2, 0);
  c.lineTo(-w / 2, -hgt * 0.72);
  c.lineTo(0, -hgt);
  c.lineTo(0, 0);
  c.closePath();
  c.fillStyle = g;
  c.fill();
  // right facet, a shade deeper
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -hgt);
  c.lineTo(w / 2, -hgt * 0.72);
  c.lineTo(w / 2, 0);
  c.closePath();
  c.fillStyle = 'rgba(140,110,230,0.55)';
  c.fill();
  c.fillStyle = 'rgba(120,200,255,0.25)';
  c.fill();
  // edges and a highlight
  c.lineWidth = Math.max(1, w * 0.06);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.beginPath();
  c.moveTo(-w / 2, 0);
  c.lineTo(-w / 2, -hgt * 0.72);
  c.lineTo(0, -hgt);
  c.lineTo(w / 2, -hgt * 0.72);
  c.lineTo(w / 2, 0);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.moveTo(-w * 0.28, -hgt * 0.1);
  c.lineTo(-w * 0.28, -hgt * 0.62);
  c.stroke();
  c.restore();
}

function gemFlower(c: C, x: number, y: number, rad: number, rot: number, hue: 'lilac' | 'aqua' | 'pink'): void {
  const tone = hue === 'lilac' ? ['#f3eaff', '#b49cff'] : hue === 'aqua' ? ['#eafcff', '#6ad0f0'] : ['#fff0f8', '#ff9ad8'];
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.shadowColor = 'rgba(90,60,160,0.3)';
  c.shadowBlur = rad * 0.3;
  for (let i = 0; i < 6; i++) {
    c.save();
    c.rotate((i * Math.PI) / 3);
    const g = c.createLinearGradient(0, 0, 0, -rad);
    g.addColorStop(0, tone[1]);
    g.addColorStop(1, tone[0]);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(rad * 0.3, -rad * 0.5);
    c.lineTo(0, -rad);
    c.lineTo(-rad * 0.3, -rad * 0.5);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.restore();
  }
  c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = Math.max(1, rad * 0.04);
  for (let i = 0; i < 6; i++) {
    c.save();
    c.rotate((i * Math.PI) / 3);
    c.beginPath();
    c.moveTo(0, -rad * 0.15);
    c.lineTo(0, -rad * 0.92);
    c.stroke();
    c.restore();
  }
  // gem in the middle
  const gg = c.createRadialGradient(-rad * 0.06, -rad * 0.06, rad * 0.02, 0, 0, rad * 0.24);
  gg.addColorStop(0, '#ffffff');
  gg.addColorStop(1, hue === 'aqua' ? '#b49cff' : '#7ad8ff');
  c.fillStyle = gg;
  c.beginPath();
  c.arc(0, 0, rad * 0.22, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function crystalBack(c: C, L: FrameLayout): void {
  const r = rng(0xc4f1);
  const g = c.createLinearGradient(0, 0, L.w, L.h);
  g.addColorStop(0, '#efe4ff');
  g.addColorStop(0.5, '#e2f4ff');
  g.addColorStop(1, '#f6e6ff');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  // faint facets: big soft triangles catching the light
  for (let i = 0; i < 26; i++) {
    const [x, y] = borderPoint(L, r);
    const s = L.px * (0.8 + r() * 1.6);
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s * 0.8, y + s * 0.5);
    c.lineTo(x - s * 0.8, y + s * 0.4);
    c.closePath();
    c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(180,156,255,0.12)';
    c.fill();
  }
  const n = Math.round(((L.w + L.h) / L.px) * 1.6);
  for (let i = 0; i < n; i++) {
    const [x, y] = borderPoint(L, r);
    twinkle(c, x, y, L.px * (0.05 + r() * 0.08), r() < 0.5 ? '#ffffff' : '#c8b4ff', false);
  }
}

function crystalFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0xc4a5);
  rim(c, L, [
    [Math.max(2, u * 0.08), '#ffffff'],
    [Math.max(1, u * 0.04), '#b49cff'],
  ]);
  const hues = ['lilac', 'aqua', 'pink'] as const;
  corners(L).forEach((k, ci) => {
    // a cluster of prisms fanning out of the border at the corner
    const out = Math.atan2(k.sy, k.sx) + Math.PI / 2; // "up" in prism space points away from the photo
    const bx = k.x + k.sx * u * 0.35;
    const by = k.sy < 0 ? k.y + k.sy * u * 0.35 : k.y - u * 0.15;
    for (let i = 0; i < 5; i++) {
      const a = out + Math.PI + (i - 2) * 0.32 + (r() - 0.5) * 0.15;
      prism(c, bx, by, a, u * (0.45 + r() * 0.2), u * (1.3 + r() * 1.1) * (i === 2 ? 1.35 : 1));
    }
    // crystal flowers blooming over the photo's corner
    const lift = k.sy > 0 ? u * 0.35 : 0; // keep clear of the caption plate under the photo
    gemFlower(c, k.x - k.sx * u * 0.25, k.y - k.sy * u * 0.25 - lift, u * 0.95, r() * 2, hues[ci % 3]);
    gemFlower(c, k.x - k.sx * u * 1.6, k.y + k.sy * u * 0.05 - lift, u * 0.55, r() * 2, hues[(ci + 1) % 3]);
    gemFlower(c, k.x + k.sx * u * 0.05, k.y - k.sy * u * 1.65, u * 0.5, r() * 2, hues[(ci + 2) % 3]);
    twinkle(c, k.x - k.sx * u * 1.3, k.y - k.sy * u * 1.2, u * 0.22, '#ffffff');
  });
  // small blooms half-way along the long sides
  const midY = L.py + L.ph / 2;
  gemFlower(c, L.px - u * 0.05, midY, u * 0.55, 0.3, 'aqua');
  gemFlower(c, L.px + L.pw + u * 0.05, midY + u * 0.6, u * 0.55, 0.8, 'lilac');
}

// ================================================================================== entry points

const BACK: Record<DrawnFrame, (c: C, L: FrameLayout) => void> = {
  frame_cozy_knit: knitBack,
  frame_sakura: sakuraBack,
  frame_starry: starryBack,
  frame_honey_gold: honeyBack,
  frame_crystal: crystalBack,
};
const FRONT: Record<DrawnFrame, (c: C, L: FrameLayout) => void> = {
  frame_cozy_knit: knitFront,
  frame_sakura: sakuraFront,
  frame_starry: starryFront,
  frame_honey_gold: honeyFront,
  frame_crystal: crystalFront,
};

/** Paint the frame's border (call before drawing the photo). */
export function drawFrameBack(c: C, L: FrameLayout, id: DrawnFrame): void {
  c.save();
  BACK[id](c, L);
  c.restore();
}

/** Paint the rim and whatever reaches over the photo's edges (call after drawing the photo). */
export function drawFrameFront(c: C, L: FrameLayout, id: DrawnFrame): void {
  c.save();
  FRONT[id](c, L);
  c.restore();
}

/** The caption plate under the photo, in the frame's colours (text is drawn on it by compose.ts). */
export function drawPlate(c: C, L: FrameLayout, id: DrawnFrame): void {
  const p = L.plate;
  if (!p) return;
  const s = PLATES[id];
  const rad = Math.min(p.h * 0.32, L.radius * 1.4);
  c.save();
  c.shadowColor = 'rgba(40,20,40,0.28)';
  c.shadowBlur = p.h * 0.12;
  c.shadowOffsetY = p.h * 0.04;
  roundRect(c, p.x, p.y, p.w, p.h, rad);
  c.fillStyle = s.fill;
  c.fill();
  c.restore();
  c.save();
  const lw = Math.max(1.5, p.h * 0.035);
  c.lineWidth = lw;
  c.strokeStyle = s.stroke;
  if (s.dash) {
    c.setLineDash([lw * 3, lw * 2.2]);
    c.lineCap = 'round';
    roundRect(c, p.x + lw * 2, p.y + lw * 2, p.w - lw * 4, p.h - lw * 4, Math.max(1, rad - lw * 2));
  } else roundRect(c, p.x + lw / 2, p.y + lw / 2, p.w - lw, p.h - lw, rad);
  c.stroke();
  c.restore();
}

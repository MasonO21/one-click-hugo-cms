/**
 * Photo frames (Wardrobe › Frames), drawn procedurally on the photo's 2D canvas by compose.ts. Warm but grown-up
 * frontier gear, each clearly its own thing:
 *
 *  - frame_journal     Field Journal: a stitched leather cover, an aged paper mat with a deckled edge, the print
 *                      held by masking-tape corners, map coordinates pressed into the leather
 *  - frame_blossom     Blossom Branch: a mitred pale-wood frame (grain follows each piece) with two slender
 *                      blossom branches across opposite corners and a few loose petals
 *  - frame_star_chart  Star Chart: navy chart paper with a faint grid, fine gold constellations, degree ticks round
 *                      the photo and a compass rose over one corner
 *  - frame_brass       Brass & Glass: a brushed, bevelled brass frame with rivets, two small gauges and a glint of
 *                      glass across the print
 *  - frame_geode       Crystal Geode: the photo set in a split geode, rough rind, banded agate, amethyst crystals
 *                      pointing in toward the picture
 *
 * `drawFrameBack` paints the border (before the photo), `drawFrameFront` the rim and whatever reaches over the photo's
 * edges (after it); `drawPlate` the caption plate. Everything scales with the border width, and the scatter comes
 * from a seeded generator, so a frame looks the same on every photo. Drawing happens once per shot.
 */
import type { FrameLayout } from '../logic/photo';

/** The frames this module can draw (the photo_frame cosmetics). */
export const DRAWN_FRAMES = ['frame_journal', 'frame_blossom', 'frame_star_chart', 'frame_brass', 'frame_geode'] as const;
export type DrawnFrame = (typeof DRAWN_FRAMES)[number];

export function isDrawnFrame(id: string | null | undefined): id is DrawnFrame {
  return !!id && (DRAWN_FRAMES as readonly string[]).includes(id);
}

export interface FramePlate {
  fill: string;
  stroke: string;
  /** Dashed stroke (stitching). */
  dash: boolean;
  /** Brass nameplate: a metal sheen and a screw in each corner. */
  metal?: boolean;
  title: string;
  line: string;
  star: string;
  mark: string;
}

const PLATES: Record<DrawnFrame, FramePlate> = {
  frame_journal: { fill: '#efe4c8', stroke: '#8a5f3f', dash: true, title: '#3a2a1c', line: '#7a5534', star: '#9a6a3a', mark: '#7a5534' },
  frame_blossom: { fill: '#fbf6ef', stroke: '#c9a98c', dash: false, title: '#4a3428', line: '#8a5a48', star: '#b8576a', mark: '#8a5a48' },
  frame_star_chart: { fill: 'rgba(22,29,62,0.94)', stroke: '#d8b45a', dash: false, title: '#f3e6c0', line: '#d8c08a', star: '#d8b45a', mark: '#e6d4a4' },
  frame_brass: { fill: '#d9b86c', stroke: '#6a4a1f', dash: false, metal: true, title: '#33240f', line: '#4f3816', star: '#6a4a1f', mark: '#4f3816' },
  frame_geode: { fill: '#f4f0f8', stroke: '#7a5ab8', dash: false, title: '#2e2045', line: '#5a4a80', star: '#7a5ab8', mark: '#5a4a80' },
};

export function framePlate(id: DrawnFrame): FramePlate {
  return PLATES[id];
}

type C = CanvasRenderingContext2D;

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace';
const TAU = Math.PI * 2;

/** Small seeded generator (mulberry32): the same frame scatters its grain and stars the same way every time. */
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
  const rr = Math.max(0, Math.min(rad, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** The photo's rounded outline grown by `off`. */
function photoOutline(c: C, L: FrameLayout, off: number): void {
  roundRect(c, L.px - off, L.py - off, L.pw + off * 2, L.ph + off * 2, L.radius + off);
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

/** A rim round the photo: `layers` from the outside in, each [width, colour]. */
function rim(c: C, L: FrameLayout, layers: [number, string][]): void {
  let grow = layers.reduce((s, [w]) => s + w, 0);
  for (const [w, color] of layers) {
    c.lineWidth = w;
    c.strokeStyle = color;
    photoOutline(c, L, grow - w / 2);
    c.stroke();
    grow -= w;
  }
}

/** A small four-pointed glint. */
function glint(c: C, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
  c.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
  c.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
  c.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
  c.closePath();
  c.fill();
}

interface Around {
  x: number;
  y: number;
  /** Outward normal. */
  nx: number;
  ny: number;
}

/**
 * A point `t` (0..1) of the way round the photo's outline grown by `off`, clockwise from the top-left, with its
 * outward normal. Corners are arcs round the photo's own corner centres.
 */
function around(L: FrameLayout, t: number, off: number): Around {
  const r0 = Math.min(L.radius, L.pw / 2, L.ph / 2);
  const R = Math.max(0, r0 + off);
  const w = L.pw - 2 * r0;
  const hh = L.ph - 2 * r0;
  const arc = (Math.PI / 2) * R;
  const total = 2 * w + 2 * hh + 4 * arc;
  let d = (((t % 1) + 1) % 1) * total;
  const x0 = L.px + r0;
  const x1 = L.px + L.pw - r0;
  const y0 = L.py + r0;
  const y1 = L.py + L.ph - r0;
  const onArc = (cx: number, cy: number, a0: number, s: number): Around => {
    const a = a0 + (R > 0 ? s / R : 0);
    return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, nx: Math.cos(a), ny: Math.sin(a) };
  };
  if (d < w) return { x: x0 + d, y: L.py - off, nx: 0, ny: -1 };
  d -= w;
  if (d < arc) return onArc(x1, y0, -Math.PI / 2, d);
  d -= arc;
  if (d < hh) return { x: L.px + L.pw + off, y: y0 + d, nx: 1, ny: 0 };
  d -= hh;
  if (d < arc) return onArc(x1, y1, 0, d);
  d -= arc;
  if (d < w) return { x: x1 - d, y: L.py + L.ph + off, nx: 0, ny: 1 };
  d -= w;
  if (d < arc) return onArc(x0, y1, Math.PI / 2, d);
  d -= arc;
  if (d < hh) return { x: L.px - off, y: y1 - d, nx: -1, ny: 0 };
  d -= hh;
  return onArc(x0, y0, Math.PI, Math.min(d, arc));
}

/** Length of the outline grown by `off`. */
function perimeter(L: FrameLayout, off: number): number {
  const r0 = Math.min(L.radius, L.pw / 2, L.ph / 2);
  return 2 * (L.pw - 2 * r0) + 2 * (L.ph - 2 * r0) + TAU * Math.max(0, r0 + off);
}

/** A smooth, closed wobble (integer frequencies so it meets itself): returns f(t) in about -1..1. */
function wobbler(r: () => number): (t: number) => number {
  const waves = [3, 7, 13, 23, 37].map((f, i) => ({ f, a: 1 / (i + 1.3), p: r() * TAU }));
  const norm = waves.reduce((s, w) => s + w.a, 0);
  return (t) => waves.reduce((s, w) => s + w.a * Math.sin(TAU * w.f * t + w.p), 0) / norm;
}

/** A closed path round the photo at `off`, wobbling by up to `amp` (rough stone, deckled paper). */
function ringPath(c: C, L: FrameLayout, off: number, amp: number, wob: (t: number) => number, steps = 260): void {
  c.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const o = off + amp * wob(t);
    const p = around(L, t, o);
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  }
  c.closePath();
}

/** Fine specks (grain, dust, paper fibre) over the border. */
function specks(c: C, L: FrameLayout, r: () => number, n: number, size: number, colors: string[]): void {
  for (let i = 0; i < n; i++) {
    const [x, y] = borderPoint(L, r);
    c.fillStyle = colors[i % colors.length];
    const s = size * (0.4 + r());
    c.fillRect(x, y, s, s * (0.6 + r() * 0.8));
  }
}

// ================================================================================== field journal

function journalBack(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x10a7);
  // leather
  const g = c.createLinearGradient(0, 0, L.w, L.h);
  g.addColorStop(0, '#6b4429');
  g.addColorStop(0.5, '#7d5233');
  g.addColorStop(1, '#5c3a23');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  specks(c, L, r, Math.round(((L.w + L.h) / u) * 60), u * 0.03, ['rgba(40,22,10,0.22)', 'rgba(255,225,180,0.07)', 'rgba(30,15,5,0.15)']);
  // a few soft scuffs
  c.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const [x, y] = borderPoint(L, r, u * 0.4);
    const a = r() * TAU;
    const len = u * (0.3 + r() * 0.8);
    c.strokeStyle = `rgba(255,228,190,${0.05 + r() * 0.05})`;
    c.lineWidth = Math.max(1, u * 0.015);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + u * 0.05, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  // worn, darker edges
  const vg = c.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.w, L.h) * 0.45, L.w / 2, L.h / 2, Math.hypot(L.w, L.h) * 0.58);
  vg.addColorStop(0, 'rgba(20,10,4,0)');
  vg.addColorStop(1, 'rgba(20,10,4,0.38)');
  c.fillStyle = vg;
  c.fillRect(0, 0, L.w, L.h);
  // saddle stitching round the cover
  const inset = u * 0.24;
  c.save();
  c.setLineDash([u * 0.13, u * 0.09]);
  c.lineCap = 'round';
  c.lineWidth = Math.max(1.5, u * 0.045);
  c.strokeStyle = 'rgba(20,10,4,0.35)';
  roundRect(c, inset, inset + u * 0.02, L.w - inset * 2, L.h - inset * 2, u * 0.35);
  c.stroke();
  c.strokeStyle = '#e3cfa2';
  roundRect(c, inset, inset, L.w - inset * 2, L.h - inset * 2, u * 0.35);
  c.stroke();
  c.restore();
  // map coordinates pressed into the leather (debossed: a dark line with a light edge under it)
  const deboss = (text: string, x: number, y: number, rot: number, px: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.font = `600 ${px}px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,230,190,0.18)';
    c.fillText(text, 0, px * 0.07);
    c.fillStyle = 'rgba(222,196,150,0.88)';
    c.fillText(text, 0, 0);
    c.restore();
  };
  const fpx = Math.max(8, u * 0.17);
  deboss("47°12'N · 122°38'W", L.w / 2, L.py * 0.42, 0, fpx);
  deboss('GRID 7-C · ELEV 312 M', L.px * 0.42, L.py + L.ph / 2, -Math.PI / 2, fpx * 0.95);
  deboss('FIELD NOTES · VOL. II', L.w - L.px * 0.42, L.py + L.ph / 2, Math.PI / 2, fpx * 0.95);
  // the aged paper page the print is taped onto (deckled edge, foxing)
  const wob = wobbler(r);
  c.save();
  c.shadowColor = 'rgba(20,10,4,0.45)';
  c.shadowBlur = u * 0.18;
  c.shadowOffsetY = u * 0.05;
  ringPath(c, L, u * 0.4, u * 0.022, wob, 360);
  const pg = c.createLinearGradient(0, L.py, 0, L.py + L.ph);
  pg.addColorStop(0, '#efe3c6');
  pg.addColorStop(1, '#e4d3ae');
  c.fillStyle = pg;
  c.fill();
  c.restore();
  c.save();
  ringPath(c, L, u * 0.4, u * 0.022, wob, 360);
  c.clip();
  for (let i = 0; i < 9; i++) {
    const p = around(L, r(), u * (0.05 + r() * 0.2));
    const rad = u * (0.12 + r() * 0.25);
    const fg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
    fg.addColorStop(0, 'rgba(150,100,50,0.16)');
    fg.addColorStop(1, 'rgba(150,100,50,0)');
    c.fillStyle = fg;
    c.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2);
  }
  c.restore();
  c.save();
  ringPath(c, L, u * 0.4, u * 0.022, wob, 360);
  c.clip();
  c.strokeStyle = 'rgba(110,130,160,0.16)';
  c.lineWidth = Math.max(0.5, u * 0.01);
  for (let y = L.py - u * 0.4 + u * 0.12; y < L.py + L.ph + u * 0.4; y += u * 0.16) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(L.w, y);
    c.stroke();
  }
  c.restore();
  ringPath(c, L, u * 0.4, u * 0.022, wob, 360);
  c.lineWidth = Math.max(1, u * 0.02);
  c.strokeStyle = 'rgba(120,85,45,0.45)';
  c.stroke();
}

/** A strip of masking tape across a corner, with torn ends. */
function tape(c: C, x: number, y: number, ang: number, len: number, wid: number, r: () => number): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const teeth = 6;
  c.beginPath();
  c.moveTo(-len / 2, -wid / 2);
  c.lineTo(len / 2, -wid / 2);
  for (let i = 1; i <= teeth; i++) c.lineTo(len / 2 + (i % 2 ? wid * 0.06 : -wid * 0.02) * (0.5 + r()), -wid / 2 + (wid * i) / teeth);
  c.lineTo(-len / 2, wid / 2);
  for (let i = 1; i <= teeth; i++) c.lineTo(-len / 2 + (i % 2 ? -wid * 0.06 : wid * 0.02) * (0.5 + r()), wid / 2 - (wid * i) / teeth);
  c.closePath();
  c.shadowColor = 'rgba(40,25,10,0.25)';
  c.shadowBlur = wid * 0.18;
  c.shadowOffsetY = wid * 0.05;
  c.fillStyle = 'rgba(224,206,160,0.9)';
  c.fill();
  c.shadowColor = 'transparent';
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = Math.max(1, wid * 0.04);
  for (let i = 0; i < 5; i++) {
    const yy = -wid / 2 + wid * (0.15 + i * 0.18);
    c.beginPath();
    c.moveTo(-len / 2, yy);
    c.lineTo(len / 2, yy + wid * 0.04);
    c.stroke();
  }
  c.restore();
}

function journalFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x10f2);
  // a printed photo: a thin white border and a hairline
  rim(c, L, [
    [Math.max(1, u * 0.02), 'rgba(90,60,30,0.35)'],
    [Math.max(2, u * 0.08), '#fbf7ee'],
  ]);
  for (const k of corners(L)) {
    const ang = (k.sx * k.sy > 0 ? -1 : 1) * Math.PI / 4 + (r() - 0.5) * 0.12;
    tape(c, k.x + k.sx * u * 0.02, k.y + k.sy * u * 0.02, ang, u * 1.8, u * 0.5, r);
  }
}

// ================================================================================== blossom branch

/** Pale wood grain inside a polygon, running along `dir` ('h' or 'v'). */
function woodPiece(c: C, poly: [number, number][], dir: 'h' | 'v', L: FrameLayout, r: () => number): void {
  const u = L.px;
  c.save();
  c.beginPath();
  poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.clip();
  const span = dir === 'h' ? L.h : L.w;
  const len = dir === 'h' ? L.w : L.h;
  const step = Math.max(2, u * 0.055);
  for (let s = 0; s < span; s += step * (0.6 + r() * 0.8)) {
    c.strokeStyle = `rgba(${130 + Math.round(r() * 30)},${90 + Math.round(r() * 20)},${55},${0.05 + r() * 0.12})`;
    c.lineWidth = Math.max(0.6, u * (0.008 + r() * 0.02));
    const ph = r() * TAU;
    const amp = u * (0.02 + r() * 0.06);
    const freq = (1.5 + r() * 2.5) / len;
    c.beginPath();
    for (let q = 0; q <= len; q += u * 0.2) {
      const off = s + Math.sin(q * freq * TAU + ph) * amp;
      if (dir === 'h') {
        if (q === 0) c.moveTo(q, off);
        else c.lineTo(q, off);
      } else if (q === 0) c.moveTo(off, q);
      else c.lineTo(off, q);
    }
    c.stroke();
  }
  c.restore();
}

function blossomBack(c: C, L: FrameLayout): void {
  const r = rng(0xb105);
  const g = c.createLinearGradient(0, 0, L.w, L.h);
  g.addColorStop(0, '#ece0cd');
  g.addColorStop(0.5, '#e3d3bb');
  g.addColorStop(1, '#dccab0');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  const x0 = L.px;
  const x1 = L.px + L.pw;
  const y0 = L.py;
  const y1 = L.py + L.ph;
  // mitred frame: top and bottom pieces run across, the sides run down
  woodPiece(c, [[0, 0], [L.w, 0], [x1, y0], [x0, y0]], 'h', L, r);
  woodPiece(c, [[0, L.h], [L.w, L.h], [x1, y1], [x0, y1]], 'h', L, r);
  woodPiece(c, [[0, 0], [x0, y0], [x0, y1], [0, L.h]], 'v', L, r);
  woodPiece(c, [[L.w, 0], [x1, y0], [x1, y1], [L.w, L.h]], 'v', L, r);
  // the mitre joints
  c.strokeStyle = 'rgba(120,85,50,0.28)';
  c.lineWidth = Math.max(1, L.px * 0.02);
  for (const [a, b] of [[[0, 0], [x0, y0]], [[L.w, 0], [x1, y0]], [[0, L.h], [x0, y1]], [[L.w, L.h], [x1, y1]]] as [number, number][][]) {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
  }
  // a soft bevel on the outer edge
  c.lineWidth = Math.max(1, L.px * 0.05);
  c.strokeStyle = 'rgba(255,250,240,0.55)';
  c.strokeRect(L.px * 0.03, L.px * 0.03, L.w - L.px * 0.06, L.h - L.px * 0.06);
  c.lineWidth = Math.max(1, L.px * 0.025);
  c.strokeStyle = 'rgba(110,75,40,0.3)';
  c.strokeRect(L.px * 0.09, L.px * 0.09, L.w - L.px * 0.18, L.h - L.px * 0.18);
}

function petalPath(c: C, r: number): void {
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(-r * 0.58, -r * 0.2, -r * 0.6, -r * 0.86, -r * 0.16, -r);
  c.quadraticCurveTo(0, -r * 0.9, r * 0.16, -r);
  c.bezierCurveTo(r * 0.6, -r * 0.86, r * 0.58, -r * 0.2, 0, 0);
  c.closePath();
}

function blossomFlower(c: C, x: number, y: number, r: number, rot: number, open = 1): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.shadowColor = 'rgba(90,40,40,0.22)';
  c.shadowBlur = r * 0.25;
  c.shadowOffsetY = r * 0.06;
  const g = c.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
  g.addColorStop(0, '#c8798a');
  g.addColorStop(0.32, '#e9bcc3');
  g.addColorStop(1, '#f7e6e4');
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate((i * TAU) / 5);
    c.scale(open, 1);
    petalPath(c, r);
    c.fillStyle = g;
    c.fill();
    c.restore();
  }
  c.shadowColor = 'transparent';
  c.lineWidth = Math.max(0.6, r * 0.035);
  c.strokeStyle = 'rgba(160,80,95,0.35)';
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate((i * TAU) / 5);
    c.scale(open, 1);
    petalPath(c, r);
    c.stroke();
    c.restore();
  }
  // fine stamens with pale-gold tips
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const len = r * (0.3 + (i % 3) * 0.05);
    c.strokeStyle = '#8a3a4a';
    c.lineWidth = Math.max(0.5, r * 0.025);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    c.stroke();
    c.fillStyle = '#e8cf8a';
    c.beginPath();
    c.arc(Math.cos(a) * len, Math.sin(a) * len, r * 0.04, 0, TAU);
    c.fill();
  }
  c.fillStyle = '#a8485e';
  c.beginPath();
  c.arc(0, 0, r * 0.09, 0, TAU);
  c.fill();
  c.restore();
}

function bud(c: C, x: number, y: number, r: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = '#5e7a4a';
  c.beginPath();
  c.ellipse(0, r * 0.5, r * 0.35, r * 0.45, 0, 0, TAU);
  c.fill();
  const g = c.createLinearGradient(0, -r, 0, r * 0.4);
  g.addColorStop(0, '#f2d3d6');
  g.addColorStop(1, '#c47a88');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, -r * 0.1, r * 0.42, r * 0.7, 0, 0, TAU);
  c.fill();
  c.restore();
}

/** A slender tapering branch along a quadratic curve. Returns points along it. */
function branch(c: C, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 30;
  c.lineCap = 'round';
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    c.strokeStyle = '#4a3428';
    c.lineWidth = Math.max(1, w * (1 - t * 0.8));
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

function loosePetal(c: C, x: number, y: number, r: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.globalAlpha = 0.85;
  petalPath(c, r);
  const g = c.createLinearGradient(0, 0, 0, -r);
  g.addColorStop(0, '#d99aa6');
  g.addColorStop(1, '#f5e2e2');
  c.fillStyle = g;
  c.fill();
  c.restore();
}

function blossomFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0xb1f0);
  rim(c, L, [
    [Math.max(1, u * 0.025), 'rgba(110,75,40,0.45)'],
    [Math.max(2, u * 0.06), '#fbf6ee'],
  ]);
  const reach = Math.min(L.pw * 0.42, L.ph * 0.3);
  // two corners only: top-left and bottom-right, each branch reaching along an edge with a twig down the side
  for (const k of [corners(L)[0], corners(L)[2]]) {
    const top = k.sy < 0;
    const x0 = k.x + k.sx * u * 0.75;
    const y0 = k.y + k.sy * u * (top ? 0.5 : 0.15);
    const x1 = k.x - k.sx * reach;
    const y1 = k.y + k.sy * u * (top ? 0.05 : -0.25);
    const pts = branch(c, x0, y0, k.x - k.sx * reach * 0.35, k.y + k.sy * u * (top ? 0.45 : 0.05), x1, y1, u * 0.2);
    const twig = branch(c, pts[3][0], pts[3][1], k.x + k.sx * u * 0.1, k.y - k.sy * reach * 0.3, k.x - k.sx * u * 0.15, k.y - k.sy * reach * 0.55, u * 0.1);
    const small = branch(c, pts[16][0], pts[16][1], pts[16][0] - k.sx * u * 0.2, pts[16][1] - k.sy * u * 0.5, pts[16][0] - k.sx * u * 0.55, pts[16][1] - k.sy * u * 0.7, u * 0.07);
    // sparse blossoms: a few open flowers and buds along the wood
    blossomFlower(c, pts[5][0], pts[5][1], u * 0.62, r() * TAU);
    blossomFlower(c, pts[14][0], pts[14][1] + k.sy * u * 0.05, u * 0.5, r() * TAU, 0.92);
    blossomFlower(c, twig[18][0], twig[18][1], u * 0.44, r() * TAU);
    blossomFlower(c, small[29][0], small[29][1], u * 0.36, r() * TAU, 0.85);
    bud(c, pts[24][0], pts[24][1] - k.sy * u * 0.12, u * 0.18, -k.sx * 0.6);
    bud(c, pts[29][0], pts[29][1], u * 0.15, -k.sx * 1.4);
    bud(c, twig[29][0], twig[29][1], u * 0.15, k.sy * 0.4);
    // a couple of petals let go
    for (let i = 0; i < 3; i++) loosePetal(c, k.x - k.sx * (u * 0.6 + r() * reach * 0.8), k.y - k.sy * (u * 0.4 + r() * u * 1.6), u * (0.16 + r() * 0.08), r() * TAU);
  }
}

// ================================================================================== star chart

function starChartBack(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x57c4);
  const g = c.createLinearGradient(0, 0, L.w * 0.4, L.h);
  g.addColorStop(0, '#1a2246');
  g.addColorStop(0.6, '#222c56');
  g.addColorStop(1, '#2a315c');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  specks(c, L, r, Math.round(((L.w + L.h) / u) * 40), u * 0.02, ['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.12)']);
  // the chart's grid
  c.save();
  c.beginPath();
  c.rect(0, 0, L.w, L.h);
  photoOutline(c, L, 0);
  c.clip('evenodd');
  c.strokeStyle = 'rgba(216,180,90,0.13)';
  c.lineWidth = Math.max(0.6, u * 0.012);
  const step = u * 0.5;
  for (let x = (L.px % step); x < L.w; x += step) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, L.h);
    c.stroke();
  }
  for (let y = (L.py % step); y < L.h; y += step) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(L.w, y);
    c.stroke();
  }
  // faint field stars
  const n = Math.round(((L.w + L.h) / u) * 5);
  for (let i = 0; i < n; i++) {
    const [x, y] = borderPoint(L, r);
    c.globalAlpha = 0.25 + r() * 0.45;
    c.fillStyle = r() < 0.3 ? '#f3e1a8' : '#e8ecff';
    c.beginPath();
    c.arc(x, y, u * (0.008 + r() * 0.02), 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
  // a double gold rule round the sheet
  c.strokeStyle = 'rgba(216,180,90,0.75)';
  c.lineWidth = Math.max(1, u * 0.025);
  c.strokeRect(u * 0.14, u * 0.14, L.w - u * 0.28, L.h - u * 0.28);
  c.lineWidth = Math.max(0.6, u * 0.012);
  c.strokeRect(u * 0.22, u * 0.22, L.w - u * 0.44, L.h - u * 0.44);
  // constellations: thin gold lines between small stars, in the side and top borders (offsets in border widths)
  const groups: { x: number; y: number; pts: [number, number][] }[] = [
    { x: u * 0.55, y: L.py + L.ph * 0.32, pts: [[-0.15, -1.8], [0.2, -1.0], [-0.1, -0.2], [0.25, 0.5], [-0.05, 1.3], [0.2, 2.0]] },
    { x: L.w - u * 0.55, y: L.py + L.ph * 0.66, pts: [[0.1, -1.5], [-0.2, -0.6], [0.15, 0.1], [-0.15, 0.9], [0.2, 1.6]] },
    { x: L.px + L.pw * 0.3, y: u * 0.55, pts: [[-1.8, 0.1], [-0.9, -0.15], [0, 0.12], [0.8, -0.12], [1.6, 0.15]] },
  ];
  for (const grp of groups) {
    const pts = grp.pts.map(([a, b]) => [grp.x + a * u, grp.y + b * u] as [number, number]);
    c.strokeStyle = 'rgba(216,180,90,0.7)';
    c.lineWidth = Math.max(0.6, u * 0.016);
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
    pts.forEach(([x, y], i) => {
      const s = u * (i === 1 ? 0.07 : 0.045);
      const sg = c.createRadialGradient(x, y, 0, x, y, s * 3);
      sg.addColorStop(0, 'rgba(255,240,200,0.5)');
      sg.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = sg;
      c.beginPath();
      c.arc(x, y, s * 3, 0, TAU);
      c.fill();
      c.fillStyle = '#f6e7b8';
      c.beginPath();
      c.arc(x, y, s, 0, TAU);
      c.fill();
    });
  }
}

function compassRose(c: C, x: number, y: number, R: number): void {
  c.save();
  c.translate(x, y);
  // a navy disc so it reads over the photo
  c.shadowColor = 'rgba(8,10,30,0.45)';
  c.shadowBlur = R * 0.2;
  c.fillStyle = 'rgba(26,34,70,0.9)';
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = '#d8b45a';
  c.lineWidth = Math.max(1, R * 0.035);
  c.beginPath();
  c.arc(0, 0, R * 0.94, 0, TAU);
  c.stroke();
  c.lineWidth = Math.max(0.6, R * 0.015);
  c.beginPath();
  c.arc(0, 0, R * 0.78, 0, TAU);
  c.stroke();
  // degree ticks
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    const inner = i % 9 === 0 ? R * 0.7 : i % 3 === 0 ? R * 0.74 : R * 0.76;
    c.lineWidth = Math.max(0.5, R * (i % 9 === 0 ? 0.02 : 0.01));
    c.beginPath();
    c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    c.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
    c.stroke();
  }
  // eight points: long cardinal, short intercardinal, each in two tones
  const point = (a: number, len: number, wid: number) => {
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    const px = -sy;
    const py = cx;
    c.fillStyle = '#f0d68a';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(cx * len, sy * len);
    c.lineTo(px * wid, py * wid);
    c.closePath();
    c.fill();
    c.fillStyle = '#a8822e';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(cx * len, sy * len);
    c.lineTo(-px * wid, -py * wid);
    c.closePath();
    c.fill();
  };
  for (let i = 0; i < 4; i++) point(Math.PI / 4 + (i * Math.PI) / 2, R * 0.45, R * 0.08);
  for (let i = 0; i < 4; i++) point(-Math.PI / 2 + (i * Math.PI) / 2, R * 0.68, R * 0.12);
  c.fillStyle = '#1a2246';
  c.beginPath();
  c.arc(0, 0, R * 0.06, 0, TAU);
  c.fill();
  c.strokeStyle = '#f0d68a';
  c.lineWidth = Math.max(0.6, R * 0.02);
  c.stroke();
  c.fillStyle = '#f3e6c0';
  c.font = `700 ${Math.max(7, R * 0.2)}px ${MONO}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('N', 0, -R * 0.86 + R * 0.01);
  c.restore();
}

function starChartFront(c: C, L: FrameLayout): void {
  const u = L.px;
  rim(c, L, [
    [Math.max(1, u * 0.02), '#d8b45a'],
    [Math.max(1, u * 0.04), '#1a2246'],
    [Math.max(1, u * 0.02), 'rgba(216,180,90,0.85)'],
  ]);
  // degree ticks round the photo, labelled along the top and left like a chart's margin
  c.strokeStyle = 'rgba(216,180,90,0.8)';
  c.fillStyle = 'rgba(232,212,160,0.85)';
  c.font = `600 ${Math.max(7, u * 0.13)}px ${MONO}`;
  c.textBaseline = 'middle';
  const off = u * 0.1;
  const P = perimeter(L, off);
  const n = Math.max(24, Math.round(P / (u * 0.25)));
  for (let i = 0; i < n; i++) {
    const p = around(L, i / n, off);
    const major = i % 4 === 0;
    const len = u * (major ? 0.18 : 0.09);
    c.lineWidth = Math.max(0.5, u * (major ? 0.018 : 0.01));
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x + p.nx * len, p.y + p.ny * len);
    c.stroke();
    if (major && (p.ny < -0.9 || p.nx < -0.9) && i % 8 === 0) {
      const deg = String(Math.round((i / n) * 360)).padStart(3, '0') + '°';
      c.textAlign = p.ny < -0.9 ? 'center' : 'right';
      if (p.ny < -0.9) c.fillText(deg, p.x, p.y - len - u * 0.12);
      else {
        c.save();
        c.translate(p.x - len - u * 0.12, p.y);
        c.rotate(-Math.PI / 2);
        c.textAlign = 'center';
        c.fillText(deg, 0, 0);
        c.restore();
      }
    }
  }
  // the compass rose over the top-right corner
  const k = corners(L)[1];
  compassRose(c, k.x - u * 0.25, k.y + u * 0.25, u * 0.95);
  glint(c, corners(L)[3].x + u * 0.45, corners(L)[3].y - u * 1.4, u * 0.14, '#f6e7b8');
}

// ================================================================================== brass & glass

function brassGradient(c: C, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#7a5526');
  g.addColorStop(0.18, '#c99b4a');
  g.addColorStop(0.32, '#f0d48a');
  g.addColorStop(0.5, '#b8893f');
  g.addColorStop(0.68, '#d9b468');
  g.addColorStop(0.85, '#8a6430');
  g.addColorStop(1, '#c49448');
  return g;
}

function rivet(c: C, x: number, y: number, s: number): void {
  c.fillStyle = 'rgba(40,25,5,0.35)';
  c.beginPath();
  c.arc(x + s * 0.18, y + s * 0.22, s, 0, TAU);
  c.fill();
  const g = c.createRadialGradient(x - s * 0.35, y - s * 0.4, s * 0.1, x, y, s);
  g.addColorStop(0, '#fff3c8');
  g.addColorStop(0.45, '#d6a650');
  g.addColorStop(1, '#6a4618');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, s, 0, TAU);
  c.fill();
}

function brassBack(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0xb7a5);
  c.fillStyle = brassGradient(c, 0, 0, L.w, L.h);
  c.fillRect(0, 0, L.w, L.h);
  // brushed metal
  c.lineWidth = Math.max(0.5, u * 0.008);
  for (let i = 0; i < Math.round(L.h / (u * 0.03)); i++) {
    const y = r() * L.h;
    c.strokeStyle = r() < 0.5 ? `rgba(255,240,200,${0.04 + r() * 0.06})` : `rgba(60,35,5,${0.04 + r() * 0.06})`;
    c.beginPath();
    const x = r() * L.w;
    c.moveTo(x, y);
    c.lineTo(x + u * (1 + r() * 4), y);
    c.stroke();
  }
  // outer bevel: light top-left, shadow bottom-right
  const b = u * 0.08;
  c.lineWidth = b;
  c.strokeStyle = 'rgba(255,244,210,0.55)';
  c.beginPath();
  c.moveTo(b / 2, L.h - b / 2);
  c.lineTo(b / 2, b / 2);
  c.lineTo(L.w - b / 2, b / 2);
  c.stroke();
  c.strokeStyle = 'rgba(50,30,5,0.5)';
  c.beginPath();
  c.moveTo(L.w - b / 2, b / 2);
  c.lineTo(L.w - b / 2, L.h - b / 2);
  c.lineTo(b / 2, L.h - b / 2);
  c.stroke();
  // a raised inner band and the groove the photo sits in
  c.lineWidth = Math.max(1, u * 0.05);
  c.strokeStyle = 'rgba(255,240,200,0.4)';
  photoOutline(c, L, u * 0.38);
  c.stroke();
  c.strokeStyle = 'rgba(60,35,5,0.45)';
  photoOutline(c, L, u * 0.33);
  c.stroke();
  // rivets along the band
  const off = u * 0.62;
  const P = perimeter(L, off);
  const n = Math.max(12, Math.round(P / (u * 0.95)));
  for (let i = 0; i < n; i++) {
    const p = around(L, (i + 0.5) / n, off);
    rivet(c, p.x, p.y, u * 0.085);
  }
}

function gauge(c: C, x: number, y: number, R: number, needle: number, label: string): void {
  c.save();
  c.translate(x, y);
  // bezel
  c.shadowColor = 'rgba(30,18,4,0.45)';
  c.shadowBlur = R * 0.25;
  c.shadowOffsetY = R * 0.08;
  c.fillStyle = brassGradient(c, -R, -R, R, R);
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(50,30,5,0.6)';
  c.lineWidth = Math.max(1, R * 0.04);
  c.stroke();
  // face
  const fr = R * 0.8;
  const fg = c.createRadialGradient(-fr * 0.2, -fr * 0.3, fr * 0.1, 0, 0, fr);
  fg.addColorStop(0, '#fbf5e4');
  fg.addColorStop(1, '#e6dbbd');
  c.fillStyle = fg;
  c.beginPath();
  c.arc(0, 0, fr, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(60,40,10,0.55)';
  c.lineWidth = Math.max(0.8, R * 0.03);
  c.stroke();
  // scale: 270° sweep, a red band at the top end
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  c.strokeStyle = 'rgba(176,56,40,0.75)';
  c.lineWidth = R * 0.08;
  c.beginPath();
  c.arc(0, 0, fr * 0.78, a1 - (a1 - a0) * 0.18, a1);
  c.stroke();
  c.strokeStyle = '#3a2a12';
  for (let i = 0; i <= 20; i++) {
    const a = a0 + ((a1 - a0) * i) / 20;
    const major = i % 5 === 0;
    c.lineWidth = Math.max(0.5, R * (major ? 0.035 : 0.018));
    c.beginPath();
    c.moveTo(Math.cos(a) * fr * (major ? 0.62 : 0.7), Math.sin(a) * fr * (major ? 0.62 : 0.7));
    c.lineTo(Math.cos(a) * fr * 0.84, Math.sin(a) * fr * 0.84);
    c.stroke();
  }
  c.fillStyle = '#5a4a30';
  c.font = `700 ${Math.max(6, R * 0.2)}px ${MONO}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, 0, fr * 0.42);
  // needle
  const na = a0 + (a1 - a0) * needle;
  c.strokeStyle = '#a8321f';
  c.lineWidth = Math.max(1, R * 0.05);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-Math.cos(na) * fr * 0.15, -Math.sin(na) * fr * 0.15);
  c.lineTo(Math.cos(na) * fr * 0.72, Math.sin(na) * fr * 0.72);
  c.stroke();
  c.fillStyle = brassGradient(c, -R * 0.1, -R * 0.1, R * 0.1, R * 0.1);
  c.beginPath();
  c.arc(0, 0, R * 0.1, 0, TAU);
  c.fill();
  // glass: a curved highlight
  c.save();
  c.beginPath();
  c.arc(0, 0, fr, 0, TAU);
  c.clip();
  const gl = c.createLinearGradient(-fr, -fr, fr * 0.3, fr * 0.3);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl;
  c.beginPath();
  c.ellipse(-fr * 0.25, -fr * 0.35, fr * 0.85, fr * 0.5, -0.6, 0, TAU);
  c.fill();
  c.restore();
  c.restore();
}

function brassFront(c: C, L: FrameLayout): void {
  const u = L.px;
  rim(c, L, [
    [Math.max(1, u * 0.03), 'rgba(255,240,200,0.6)'],
    [Math.max(2, u * 0.07), '#4a3215'],
  ]);
  // glass over the print: two soft diagonal glints near the top-left
  c.save();
  photoOutline(c, L, 0);
  c.clip();
  const s = Math.min(L.pw, L.ph);
  const band = (from: number, width: number, alpha: number) => {
    const g = c.createLinearGradient(L.px + s * from, L.py, L.px + s * (from + width), L.py + s * width * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(L.px + s * from, L.py);
    c.lineTo(L.px + s * (from + width), L.py);
    c.lineTo(L.px, L.py + s * (from + width) * 1.4);
    c.lineTo(L.px, L.py + s * from * 1.4);
    c.closePath();
    c.fill();
  };
  band(0.12, 0.16, 0.16);
  band(0.33, 0.05, 0.12);
  c.restore();
  // two small gauges over the top corners
  const [tl, tr] = corners(L);
  gauge(c, tl.x + u * 0.12, tl.y + u * 0.12, u * 0.62, 0.62, 'PSI');
  gauge(c, tr.x - u * 0.12, tr.y + u * 0.12, u * 0.62, 0.34, 'ATM');
}

// ================================================================================== crystal geode

function geodeBack(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x9e0d);
  // rough rind
  const g = c.createLinearGradient(0, 0, L.w, L.h);
  g.addColorStop(0, '#5e544b');
  g.addColorStop(0.5, '#4a423b');
  g.addColorStop(1, '#615549');
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
  specks(c, L, r, Math.round(((L.w + L.h) / u) * 70), u * 0.05, ['rgba(20,15,10,0.25)', 'rgba(210,195,175,0.12)', 'rgba(140,120,100,0.18)']);
  // agate bands: wavy rings stepping in toward the crystals (grey, milky white, smoky lavender)
  const wob = wobbler(r);
  ringPath(c, L, u * 0.94, u * 0.07, wob);
  c.fillStyle = '#cfc6d3';
  c.fill();
  const bands: [number, string, number][] = [
    [0.9, '#8f8496', 0.05],
    [0.84, '#e9e3ec', 0.06],
    [0.77, '#a493bb', 0.04],
    [0.71, '#f1edf4', 0.05],
    [0.65, '#7e6a9e', 0.05],
  ];
  for (const [off, col, w] of bands) {
    c.strokeStyle = col;
    c.lineWidth = u * w;
    ringPath(c, L, u * off, u * 0.06, wob);
    c.stroke();
  }
  // the crystal bed, with a dusting of druzy sparkle
  ringPath(c, L, u * 0.6, u * 0.04, wob);
  const bed = c.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.pw, L.ph) * 0.45, L.w / 2, L.h / 2, Math.hypot(L.pw, L.ph) * 0.55);
  bed.addColorStop(0, '#2c1a4a');
  bed.addColorStop(1, '#4a2c78');
  c.fillStyle = bed;
  c.fill();
  for (let i = 0; i < Math.round(((L.w + L.h) / u) * 8); i++) {
    const p = around(L, r(), u * (0.1 + r() * 0.45));
    c.fillStyle = `rgba(230,215,255,${0.2 + r() * 0.4})`;
    c.fillRect(p.x, p.y, u * 0.025, u * 0.025);
  }
}

function crystal(c: C, bx: number, by: number, dx: number, dy: number, len: number, wid: number, lean: number, tone: number): void {
  const tx = -dy;
  const ty = dx;
  const tipX = bx + dx * len + tx * lean;
  const tipY = by + dy * len + ty * lean;
  const lx = bx - tx * wid / 2;
  const ly = by - ty * wid / 2;
  const rx = bx + tx * wid / 2;
  const ry = by + ty * wid / 2;
  const g = c.createLinearGradient(bx, by, tipX, tipY);
  const deep = ['#4a2a86', '#5a3a94', '#6a4aa8'][Math.min(2, Math.floor(tone * 3))];
  const pale = ['#c4aeee', '#d6c6f6', '#e6dcfa'][Math.min(2, Math.floor(tone * 3))];
  g.addColorStop(0, deep);
  g.addColorStop(1, pale);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(lx, ly);
  c.lineTo(tipX, tipY);
  c.lineTo(bx, by);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(bx, by);
  c.lineTo(tipX, tipY);
  c.lineTo(rx, ry);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(30,12,64,0.42)';
  c.fill();
  c.strokeStyle = 'rgba(240,230,255,0.55)';
  c.lineWidth = Math.max(0.5, wid * 0.06);
  c.beginPath();
  c.moveTo(lx, ly);
  c.lineTo(tipX, tipY);
  c.lineTo(rx, ry);
  c.stroke();
}

function geodeFront(c: C, L: FrameLayout): void {
  const u = L.px;
  const r = rng(0x9e77);
  // a dark seat for the print
  c.strokeStyle = 'rgba(30,15,55,0.8)';
  c.lineWidth = Math.max(1, u * 0.06);
  photoOutline(c, L, u * 0.02);
  c.stroke();
  // amethyst points all round, pointing in; longer and denser at the corners
  const base = u * 0.52;
  const P = perimeter(L, base);
  const n = Math.round(P / (u * 0.24));
  const list: { t: number; len: number; wid: number; lean: number; tone: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + r() * 0.6) / n;
    const p = around(L, t, base);
    const corner = Math.abs(p.nx) > 0.2 && Math.abs(p.ny) > 0.2;
    list.push({ t, len: u * ((corner ? 0.52 : 0.3) + r() * (corner ? 0.25 : 0.2)), wid: u * (0.3 + r() * 0.16), lean: (r() - 0.5) * u * 0.16, tone: r() });
  }
  list.sort((a, b) => b.len - a.len);
  for (const k of list) {
    const p = around(L, k.t, base + u * 0.02);
    crystal(c, p.x, p.y, -p.nx, -p.ny, k.len, k.wid, k.lean, k.tone);
  }
  // a cluster of big points in each corner, leaning in toward the photo
  for (const k of corners(L)) {
    const bx = k.x + k.sx * u * 0.42;
    const by = k.y + k.sy * u * (k.sy < 0 ? 0.42 : 0.28);
    const base = Math.atan2(-k.sy, -k.sx);
    for (const [da, len, wid] of [[-0.5, 0.78, 0.4], [0.5, 0.74, 0.38], [0.05, 1.0, 0.5]] as const) {
      const a = base + da + (r() - 0.5) * 0.12;
      crystal(c, bx, by, Math.cos(a), Math.sin(a), u * len, u * wid, (r() - 0.5) * u * 0.08, r());
    }
  }
  // a few glints
  for (let i = 0; i < 9; i++) {
    const p = around(L, r(), u * (0.05 + r() * 0.2));
    glint(c, p.x, p.y, u * (0.07 + r() * 0.07), 'rgba(255,250,255,0.9)');
  }
}

// ================================================================================== entry points

const BACK: Record<DrawnFrame, (c: C, L: FrameLayout) => void> = {
  frame_journal: journalBack,
  frame_blossom: blossomBack,
  frame_star_chart: starChartBack,
  frame_brass: brassBack,
  frame_geode: geodeBack,
};
const FRONT: Record<DrawnFrame, (c: C, L: FrameLayout) => void> = {
  frame_journal: journalFront,
  frame_blossom: blossomFront,
  frame_star_chart: starChartFront,
  frame_brass: brassFront,
  frame_geode: geodeFront,
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
  c.shadowColor = 'rgba(30,15,10,0.32)';
  c.shadowBlur = p.h * 0.12;
  c.shadowOffsetY = p.h * 0.04;
  roundRect(c, p.x, p.y, p.w, p.h, rad);
  c.fillStyle = s.metal ? brassGradient(c, p.x, p.y, p.x + p.w * 0.6, p.y + p.h * 2) : s.fill;
  c.fill();
  c.restore();
  if (s.metal) {
    // a soft sheen across the top and a screw in each corner
    c.save();
    roundRect(c, p.x, p.y, p.w, p.h, rad);
    c.clip();
    const sh = c.createLinearGradient(0, p.y, 0, p.y + p.h);
    sh.addColorStop(0, 'rgba(255,248,220,0.45)');
    sh.addColorStop(0.5, 'rgba(255,248,220,0.05)');
    sh.addColorStop(1, 'rgba(60,35,5,0.12)');
    c.fillStyle = sh;
    c.fillRect(p.x, p.y, p.w, p.h);
    c.restore();
    const sr = Math.max(2, p.h * 0.07);
    for (const [x, y] of [[p.x + sr * 2.4, p.y + sr * 2.4], [p.x + p.w - sr * 2.4, p.y + sr * 2.4], [p.x + sr * 2.4, p.y + p.h - sr * 2.4], [p.x + p.w - sr * 2.4, p.y + p.h - sr * 2.4]]) {
      rivet(c, x, y, sr);
      c.strokeStyle = 'rgba(50,30,5,0.6)';
      c.lineWidth = Math.max(0.6, sr * 0.25);
      c.beginPath();
      c.moveTo(x - sr * 0.6, y - sr * 0.3);
      c.lineTo(x + sr * 0.6, y + sr * 0.3);
      c.stroke();
    }
  }
  c.save();
  const lw = Math.max(1.5, p.h * 0.03);
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

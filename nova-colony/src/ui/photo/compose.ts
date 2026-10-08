/**
 * The finished photo: the renderer's still in a painted frame, drawn on a 2D canvas.
 *
 * Cream paper all round (the menus' paper texture, faintly), the photo with softly rounded corners, a thin gold rim
 * and a soft inner shadow, and a caption strip under it: the colony's name, "✦ Titanium tier · Day 42", and on the
 * right the app icon with a small "Nova Colony" wordmark. Layout numbers come from `frameLayout` (logic/photo.ts).
 *
 * With a photo frame from the Wardrobe (`frame`: a photo_frame cosmetic id) the border is that frame's own pattern
 * and decorations (frames.ts), and the caption sits on a plate in its colours. No frame: the classic paper print.
 */
import { frameLayout, type PhotoCaption } from '../logic/photo';
import paperUrl from '../styles/tex/paper.webp';
import { drawFrameBack, drawFrameFront, drawPlate, framePlate, isDrawnFrame } from './frames';

const FONT = 'ui-rounded, "SF Pro Rounded", Nunito, "Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PAPER = '#fbf0d9';
const INK = '#3a2350';
const INK_WARM = '#8a5a2b';
const GOLD = '#f3cd84';
const GOLD_D = '#c99a4e';
/** The app icon (public/icon-192.png), served next to index.html on the web and in the native shell. */
const ICON_URL = 'icon-192.png';

export interface FrameAssets {
  paper: HTMLImageElement | null;
  icon: HTMLImageElement | null;
}

function loadImage(src: string, timeoutMs = 2500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    const t = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.decoding = 'async';
    img.src = src;
  });
}

let assets: Promise<FrameAssets> | null = null;
/** The paper texture and the app icon, loaded once (a missing one just leaves it out). */
export function frameAssets(): Promise<FrameAssets> {
  assets ??= Promise.all([loadImage(paperUrl), loadImage(ICON_URL)]).then(([paper, icon]) => ({ paper, icon }));
  return assets;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** Shrink the font until `text` fits `maxW`, then ellipsize. Returns the text to draw (font left set on `c`). */
function fitText(c: CanvasRenderingContext2D, text: string, weight: number, px: number, maxW: number, minPx: number): string {
  let size = px;
  c.font = `${weight} ${size}px ${FONT}`;
  while (c.measureText(text).width > maxW && size > minPx) {
    size = Math.max(minPx, Math.floor(size * 0.92));
    c.font = `${weight} ${size}px ${FONT}`;
  }
  if (c.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/**
 * Draw the framed photo. `shot` is the renderer's still (its pixel size sets the frame's); `frame` the equipped
 * photo_frame cosmetic (null / unknown: the classic paper frame).
 */
export function composePhoto(shot: HTMLCanvasElement, cap: PhotoCaption, a: FrameAssets, frame: string | null = null): HTMLCanvasElement {
  const deco = isDrawnFrame(frame) ? frame : null;
  const L = frameLayout(shot.width, shot.height, !!deco);
  const out = document.createElement('canvas');
  out.width = L.w;
  out.height = L.h;
  const c = out.getContext('2d');
  if (!c) return shot;
  c.imageSmoothingQuality = 'high';

  // ---- paper (or the frame's own border)
  c.fillStyle = PAPER;
  c.fillRect(0, 0, L.w, L.h);
  if (deco) drawFrameBack(c, L, deco);
  else if (a.paper) {
    const pat = c.createPattern(a.paper, 'repeat');
    if (pat) {
      // the texture at roughly the size the menus show it on a phone, whatever the photo's resolution
      const k = Math.max(1, Math.min(L.w, L.h) / 900);
      pat.setTransform?.(new DOMMatrix().scale(k, k));
      c.globalAlpha = 0.55;
      c.fillStyle = pat;
      c.fillRect(0, 0, L.w, L.h);
      c.globalAlpha = 1;
    }
  }
  // warm vignette toward the edges, like an old print
  if (!deco) {
    const vg = c.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.w, L.h) * 0.35, L.w / 2, L.h / 2, Math.hypot(L.w, L.h) * 0.6);
    vg.addColorStop(0, 'rgba(200,150,80,0)');
    vg.addColorStop(1, 'rgba(170,110,40,0.16)');
    c.fillStyle = vg;
    c.fillRect(0, 0, L.w, L.h);
  }

  // ---- photo: a soft drop shadow, the picture, a gold rim and an inner hairline
  c.save();
  c.shadowColor = 'rgba(90,55,15,0.28)';
  c.shadowBlur = L.rim * 4;
  c.shadowOffsetY = L.rim * 1.2;
  roundRect(c, L.px, L.py, L.pw, L.ph, L.radius);
  c.fillStyle = '#1b2a3a';
  c.fill();
  c.restore();
  c.save();
  roundRect(c, L.px, L.py, L.pw, L.ph, L.radius);
  c.clip();
  c.drawImage(shot, L.px, L.py, L.pw, L.ph);
  // a breath of inner shade at the edges so the picture sits in the paper
  const edge = Math.max(4, L.rim * 5);
  const ig = c.createLinearGradient(0, L.py, 0, L.py + edge);
  ig.addColorStop(0, 'rgba(40,20,10,0.18)');
  ig.addColorStop(1, 'rgba(40,20,10,0)');
  c.fillStyle = ig;
  c.fillRect(L.px, L.py, L.pw, edge);
  c.restore();
  if (deco) {
    // the plate first: the frame's corner decorations may sit on it like stickers
    drawPlate(c, L, deco);
    drawFrameFront(c, L, deco);
  } else drawGoldRim(c, L);

  // ---- caption strip (on the frame's plate when there is one)
  const ink = deco ? framePlate(deco) : null;
  const plate = L.plate;
  const midY = plate ? plate.y + plate.h / 2 : L.stripY + L.stripH / 2;
  const left = plate ? plate.x + plate.h * 0.32 : L.px + L.rim;
  const right = plate ? plate.x + plate.w - plate.h * 0.3 : L.px + L.pw - L.rim;
  drawCaption(c, L, cap, a, { midY, left, right, title: ink?.title ?? INK, line: ink?.line ?? INK_WARM, star: ink?.star ?? GOLD_D, mark: ink?.mark ?? INK_WARM });
  return out;
}

/** The classic frame's gold rim and inner hairline round the photo. */
function drawGoldRim(c: CanvasRenderingContext2D, L: ReturnType<typeof frameLayout>): void {
  const rimG = c.createLinearGradient(0, L.py, 0, L.py + L.ph);
  rimG.addColorStop(0, GOLD);
  rimG.addColorStop(1, GOLD_D);
  c.lineWidth = L.rim;
  c.strokeStyle = rimG;
  roundRect(c, L.px - L.rim / 2, L.py - L.rim / 2, L.pw + L.rim, L.ph + L.rim, L.radius + L.rim / 2);
  c.stroke();
  c.lineWidth = Math.max(1, L.rim * 0.35);
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  roundRect(c, L.px + L.rim * 0.2, L.py + L.rim * 0.2, L.pw - L.rim * 0.4, L.ph - L.rim * 0.4, Math.max(1, L.radius - L.rim * 0.2));
  c.stroke();
}

interface CaptionPlace {
  midY: number;
  left: number;
  right: number;
  title: string;
  line: string;
  star: string;
  mark: string;
}

/** Colony name and "✦ tier · day" on the left, the app icon and wordmark on the right. */
function drawCaption(c: CanvasRenderingContext2D, L: ReturnType<typeof frameLayout>, cap: PhotoCaption, a: FrameAssets, p: CaptionPlace): void {
  const { midY, left, right } = p;

  // wordmark: app icon + "Nova Colony", right-aligned
  c.font = `800 ${L.markPx}px ${FONT}`;
  const markW = c.measureText(cap.mark).width;
  const gap = Math.round(L.iconPx * 0.3);
  const iconW = a.icon ? L.iconPx : 0;
  const markBlock = markW + (iconW ? iconW + gap : 0);
  let mx = right - markBlock;
  if (a.icon) {
    const iy = midY - L.iconPx / 2;
    c.save();
    c.shadowColor = 'rgba(90,55,15,0.3)';
    c.shadowBlur = L.iconPx * 0.12;
    c.shadowOffsetY = L.iconPx * 0.05;
    roundRect(c, mx, iy, L.iconPx, L.iconPx, L.iconPx * 0.24);
    c.fillStyle = '#fff';
    c.fill();
    c.restore();
    c.save();
    roundRect(c, mx, iy, L.iconPx, L.iconPx, L.iconPx * 0.24);
    c.clip();
    c.drawImage(a.icon, mx, iy, L.iconPx, L.iconPx);
    c.restore();
    c.lineWidth = Math.max(1, L.iconPx * 0.05);
    c.strokeStyle = GOLD;
    roundRect(c, mx, iy, L.iconPx, L.iconPx, L.iconPx * 0.24);
    c.stroke();
    mx += L.iconPx + gap;
  }
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.font = `800 ${L.markPx}px ${FONT}`;
  c.fillStyle = p.mark;
  c.globalAlpha = 0.85;
  c.fillText(cap.mark, mx, midY + L.markPx * 0.04);
  c.globalAlpha = 1;

  // colony name and "✦ tier · day", left
  const textMax = Math.max(40, right - markBlock - gap * 2 - left);
  const title = fitText(c, cap.title, 900, L.titlePx, textMax, Math.round(L.titlePx * 0.7));
  const titleY = midY - L.linePx * 0.62;
  c.fillStyle = p.title;
  c.textBaseline = 'middle';
  c.fillText(title, left, titleY);
  const star = '✦ ';
  c.font = `800 ${L.linePx}px ${FONT}`;
  const starW = c.measureText(star).width;
  const lineY = midY + L.titlePx * 0.62;
  c.fillStyle = p.star;
  c.fillText(star, left, lineY);
  const line = fitText(c, cap.line, 800, L.linePx, textMax - starW, Math.round(L.linePx * 0.8));
  c.fillStyle = p.line;
  c.fillText(line, left + starW, lineY);
}

/** JPEG of the canvas (null if the browser cannot encode it). */
export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((b) => resolve(b), type, quality);
        return;
      }
      const url = canvas.toDataURL(type, quality);
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type }));
    } catch (e) {
      console.warn('[photo] encoding failed', e);
      resolve(null);
    }
  });
}

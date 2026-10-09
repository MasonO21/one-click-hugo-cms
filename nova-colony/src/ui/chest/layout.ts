/**
 * Where things sit in the chest scene (pure, unit-tested): the chest on its backdrop's pedestal, and the reward cards
 * in a tidy grid in the sky above it (portrait) or in two wings beside it (landscape).
 *
 * The backdrop is a portrait painting drawn with `background-size: cover` and `background-position: 50% <pedestal>`:
 * a percentage position lines the painting's pedestal point up with the same fraction of the screen, whatever gets
 * cropped, so the chest is placed at `pedestal × height` on every screen shape.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneLayout {
  landscape: boolean;
  /** The chest box (its art is square; the feet sit near the bottom edge). */
  chest: Rect;
  /** Where the chest's mouth is (cards and the burst come out of it). */
  mouth: { x: number; y: number };
  /** One box per card, in reveal order. */
  cards: Rect[];
  /** How far the chest moves down (px) once the cards come out, to make room for them… */
  shift: number;
  /** …and how much it shrinks then (scaled about its feet), as if stepping back. */
  settle: number;
  /** The mouth once the chest has settled (the cards fly out of it). */
  mouthCards: { x: number; y: number };
  /** The action row (Collect / Open another). */
  actions: Rect;
}

export interface LayoutInput {
  w: number;
  h: number;
  /** Safe-area insets (notch, home bar). */
  safe?: { t: number; r: number; b: number; l: number };
  cards: number;
  /** The pedestal's height in the backdrop, 0..1 (PEDESTAL). */
  pedestal: number;
  /** Chest size factor (a crate is drawn smaller). */
  scale?: number;
}

/** Each backdrop's pedestal (fraction of its height): the meadow, the pond stone, the lantern-hill stage, the canyon basin, the floating island. */
export const PEDESTAL: Record<string, number> = {
  chest_supply: 0.64,
  chest_explorer: 0.62,
  chest_prospector: 0.615,
  chest_relic: 0.6,
  chest_nova: 0.515,
};

/** Card height / width. */
export const CARD_RATIO = 1.36;
/** The cache's size once it has stepped back for the cards (portrait); smaller for the big caches' 6 and 7 cards. */
export const SETTLE = 0.86;
export const SETTLE_MANY = 0.76;
export const SETTLE_MOST = 0.66;
/** Its feet: the point it squashes and settles about (fraction of its box). */
export const FEET = 0.94;
const GAP = 8;

/** The biggest card width that fits `n` cards in `area`, and the column count that gives it. */
export function fitGrid(n: number, area: { w: number; h: number }, maxW: number): { cols: number; rows: number; w: number } {
  let best = { cols: 1, rows: Math.max(1, n), w: 0 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min(maxW, (area.w - (cols - 1) * GAP) / cols, (area.h - (rows - 1) * GAP) / rows / CARD_RATIO);
    if (w > best.w + 0.5) best = { cols, rows, w };
  }
  best.w = Math.max(0, Math.floor(best.w));
  return best;
}

/** Card boxes for `n` cards in `area`: rows centred, the grid centred vertically. */
export function placeGrid(n: number, area: Rect, maxW: number): Rect[] {
  if (n <= 0) return [];
  const { cols, rows, w } = fitGrid(n, area, maxW);
  const h = Math.floor(w * CARD_RATIO);
  const gridH = rows * h + (rows - 1) * GAP;
  const top = area.y + Math.max(0, (area.h - gridH) / 2);
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const col = i - row * cols;
    const rowW = inRow * w + (inRow - 1) * GAP;
    out.push({ x: Math.round(area.x + (area.w - rowW) / 2 + col * (w + GAP)), y: Math.round(top + row * (h + GAP)), w, h });
  }
  return out;
}

export function sceneLayout(o: LayoutInput): SceneLayout {
  const { w, h } = o;
  const safe = o.safe ?? { t: 0, r: 0, b: 0, l: 0 };
  const scale = o.scale ?? 1;
  const landscape = w > h;
  const n = Math.max(0, o.cards);
  const ground = o.pedestal * h;

  if (!landscape) {
    const size = Math.round(Math.min(w * 0.56, h * 0.29, 250) * scale);
    const actionsH = 64;
    const actions: Rect = { x: 16 + safe.l, y: h - safe.b - actionsH - 14, w: w - 32 - safe.l - safe.r, h: actionsH };
    const chestAt = (shift: number): Rect => ({ x: Math.round(w / 2 - size / 2), y: Math.round(ground + size * 0.06 - size + shift), w: size, h: size });
    const top = safe.t + 74;
    const settle = n >= 7 ? SETTLE_MOST : n >= 6 ? SETTLE_MANY : SETTLE;
    // the settled chest's top: it shrinks about its feet, then moves down
    const settledTop = (shift: number): number => chestAt(shift).y + size * FEET * (1 - settle);
    const areaFor = (shift: number): Rect => ({ x: 12 + safe.l, y: top, w: w - 24 - safe.l - safe.r, h: Math.max(60, settledTop(shift) + size * 0.1 * settle - 10 - top) });
    // room for the cards: let the cache step down (never into the buttons, at most a third of the screen) when they
    // would be small
    const maxShift = Math.max(0, Math.min(h * 0.32, actions.y - 8 - (ground + size * 0.06)));
    const want = 116;
    let shift = 0;
    if (n > 0 && fitGrid(n, areaFor(0), 132).w < want) {
      shift = maxShift;
      for (let s = 0; s <= maxShift; s += 8) {
        if (fitGrid(n, areaFor(s), 132).w >= want) {
          shift = s;
          break;
        }
      }
    }
    const chest = chestAt(0);
    const feet = chest.y + size * FEET;
    const mouthY = chest.y + size * 0.42;
    return {
      landscape,
      chest,
      mouth: { x: w / 2, y: mouthY },
      cards: placeGrid(n, areaFor(shift), 132),
      shift,
      settle,
      mouthCards: { x: w / 2, y: feet + shift - (feet - mouthY) * settle },
      actions,
    };
  }

  // landscape: the chest on its pedestal in the middle, the cards in two wings
  const size = Math.round(Math.min(h * 0.46, w * 0.24, 220) * scale);
  const chest: Rect = { x: Math.round(w / 2 - size / 2), y: Math.round(Math.min(ground + size * 0.06, h - safe.b - 76) - size), w: size, h: size };
  const actionsH = 56;
  const aw = Math.min(w - 32, Math.max(size + 100, 300));
  const actions: Rect = { x: Math.round(w / 2 - aw / 2), y: h - safe.b - actionsH - 8, w: aw, h: actionsH };
  const top = safe.t + 56;
  // a wing that reaches over the buttons stops above them
  const leftX = safe.l + 14;
  const leftW = chest.x - 18 - leftX;
  const rightX = chest.x + size + 18;
  const rightW = w - safe.r - 14 - rightX;
  const under = (x: number, ww: number) => x < actions.x + actions.w && actions.x < x + ww;
  const bottomOf = (x: number, ww: number) => (under(x, ww) ? actions.y - 8 : h - safe.b - 12);
  const left: Rect = { x: leftX, y: top, w: leftW, h: bottomOf(leftX, leftW) - top };
  const right: Rect = { x: rightX, y: top, w: rightW, h: bottomOf(rightX, rightW) - top };
  const nl = Math.ceil(n / 2);
  const L = placeGrid(nl, left, 128);
  const R = placeGrid(n - nl, right, 128);
  // alternate wings so the reveal hops left, right, left…
  const cards: Rect[] = [];
  for (let i = 0; i < n; i++) cards.push(i % 2 === 0 ? L[i / 2] : R[(i - 1) / 2]);
  const mouth = { x: w / 2, y: chest.y + size * 0.42 };
  return { landscape, chest, mouth, cards, shift: 0, settle: 1, mouthCards: mouth, actions };
}

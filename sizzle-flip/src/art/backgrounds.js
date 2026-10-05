// Background dispatch per world.
import { drawKitchenBG } from './bg/kitchen.js';
import { BG_WORLDS } from './bg/worlds.js';
import { playBounds, vignette } from './bg/common.js';

const BG = { kitchen: drawKitchenBG, ...BG_WORLDS };

export function drawBackground(ctx, L, worldId, box, W) {
  const fn = BG[worldId] || drawKitchenBG;
  fn(ctx, L, box, W);
  vignette(ctx, box);
  playBounds(ctx, box, W);
}

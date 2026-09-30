// Tiny Tides trailer — browser entry. Bundled by tools/trailer/make.mjs and driven from headless Chromium.
import * as Shots from './shots.js';
import { renderMusic } from './music.js';
import { W, H, FPS, FRAMES, DUR } from './timeline.js';

let canvas;
window.Trailer = {
  W, H, FPS, FRAMES, DUR,
  init() { canvas = document.getElementById('c'); Shots.init(canvas); return true; },
  setDebug(v) { Shots.setDebug(!!v); },
  /** Deterministic: draws the whole frame for time t (seconds) and returns it encoded. */
  frame(t, type = 'image/jpeg', q = 0.95) { Shots.renderFrame(t); return canvas.toDataURL(type, q); },
  async audio() { const dyn = Shots.dynamicEvents(); const r = await renderMusic(dyn); return { ...r, dyn }; },
};

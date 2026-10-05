// Hand-authored tutorial levels (index -> level). Same conventions as the generator.
const H = 1100;
const stovePan = (x, flip = false) => [{ t: 'stove', x, y: H - 75 }, { t: 'pan', x: x + (flip ? -45 : 45), y: H - 178, flip }];

export const HANDMADE = {
  0: {
    h: H, seed: 11, par: 1, start: [150, H - 190], tip: 'Drag back anywhere, aim, and release to <b>flip</b>!',
    objects: [
      ...stovePan(150),
      { t: 'counter', x: 462, y: H - 100, w: 320, h: 200, color: '#86b8a8' },
      { t: 'bun', x: 428, y: H - 233 },
      { t: 'jar', x: 584, y: H - 250 },
      { t: 'shelf', x: 470, y: 640, w: 220, color: '#c98a4b' },
      { t: 'microwave', x: 470, y: 640 - 9 - 52 },
    ],
  },
  1: {
    h: H, seed: 12, par: 2, start: [150, H - 190], tip: 'Land on things, then <b>flip again</b> from there.',
    objects: [
      ...stovePan(150),
      { t: 'counter', x: 480, y: H - 130, w: 270, h: 260, color: '#e8a87c' },
      { t: 'books', x: 445, y: H - 300, v: 2 },
      { t: 'shelf', x: 190, y: 560, w: 240, color: '#c98a4b' },
      { t: 'bun', x: 190, y: 518 },
      { t: 'mug', x: 576, y: H - 302 },
    ],
  },
};

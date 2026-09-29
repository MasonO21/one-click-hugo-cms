import fs from 'node:fs';
import path from 'node:path';

const STORE = path.resolve(__dirname, '..', 'store');

/** Reads width/height from a PNG header or a JPEG start-of-frame marker, without any image library. */
function dimensions(file: string): { w: number; h: number; type: 'png' | 'jpeg'; alpha: boolean } {
  const b = fs.readFileSync(file);
  if (b.subarray(1, 4).toString('ascii') === 'PNG') {
    const colorType = b[25]!;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: 'png', alpha: colorType === 4 || colorType === 6 };
  }
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xc3) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), type: 'jpeg', alpha: false };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`Not a readable image: ${file}`);
}

const list = (dir: string, ext: RegExp) => fs.readdirSync(path.join(STORE, dir)).filter((f) => ext.test(f)).sort();

describe('store assets have the exact sizes the stores require', () => {
  it('App Store 6.9-inch iPhone screenshots are 1290x2796 with no alpha channel', () => {
    const files = list('screenshots/ios-6.9in', /\.jpg$/);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      const d = dimensions(path.join(STORE, 'screenshots/ios-6.9in', f));
      expect([f, d.w, d.h, d.alpha]).toEqual([f, 1290, 2796, false]);
    }
  });

  it('Google Play phone screenshots are 1080x1920 (9:16)', () => {
    const files = list('screenshots/android-phone', /\.jpg$/);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const d = dimensions(path.join(STORE, 'screenshots/android-phone', f));
      expect([f, d.w, d.h]).toEqual([f, 1080, 1920]);
    }
  });

  it('icons and the feature graphic are the right size', () => {
    const icon = dimensions(path.join(STORE, 'graphics/app-store-icon-1024.png'));
    expect([icon.w, icon.h, icon.alpha]).toEqual([1024, 1024, false]); // the App Store rejects icons with transparency
    const play = dimensions(path.join(STORE, 'graphics/play-icon-512.png'));
    expect([play.w, play.h]).toEqual([512, 512]);
    const feature = dimensions(path.join(STORE, 'graphics/play-feature-graphic-1024x500.jpg'));
    expect([feature.w, feature.h]).toEqual([1024, 500]);
  });

  it('the subscription review screenshot is a full-size paywall capture', () => {
    const d = dimensions(path.join(STORE, 'screenshots/subscription-review-paywall.png'));
    expect([d.w, d.h]).toEqual([1290, 2796]);
  });
});

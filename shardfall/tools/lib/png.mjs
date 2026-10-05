// Minimal PNG and ICO writers (no dependencies). Used by make-icons.mjs so the
// output is byte-for-byte reproducible and so App Store icons can be written
// without an alpha channel (Apple rejects 1024px icons that have one).
import { deflateSync, crc32 } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

// Adaptive per-row filtering (the same heuristic libpng uses: minimum sum of
// absolute differences), which keeps gradients small.
function filterRows(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y ? raw.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        const cc = prev && i >= bpp ? prev[i - bpp] : 0;
        let v;
        switch (f) {
          case 0: v = row[i]; break;
          case 1: v = row[i] - a; break;
          case 2: v = row[i] - b; break;
          case 3: v = row[i] - ((a + b) >> 1); break;
          default: {
            const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
            v = row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
          }
        }
        v &= 0xff;
        c[i] = v;
        sum += v < 128 ? v : 256 - v;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    // Recompute the winner fully (the loop above may have stopped early).
    const o = y * (stride + 1);
    out[o] = best;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const cc = prev && i >= bpp ? prev[i - bpp] : 0;
      let v;
      switch (best) {
        case 0: v = row[i]; break;
        case 1: v = row[i] - a; break;
        case 2: v = row[i] - b; break;
        case 3: v = row[i] - ((a + b) >> 1); break;
        default: {
          const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
          v = row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
        }
      }
      out[o + 1 + i] = v & 0xff;
    }
  }
  return out;
}

/**
 * Encodes RGBA pixels as a PNG.
 * @param {{width:number,height:number,data:Uint8Array|Buffer,alpha?:boolean}} img
 *   alpha=false drops the alpha channel (color type 2, flattened onto black where
 *   pixels are not opaque, so draw an opaque background first).
 */
export function encodePNG({ width, height, data, alpha = true }) {
  const bpp = alpha ? 4 : 3;
  let raw;
  if (alpha) raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  else {
    raw = Buffer.alloc(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      const a = data[i + 3] / 255;
      raw[j] = Math.round(data[i] * a);
      raw[j + 1] = Math.round(data[i + 1] * a);
      raw[j + 2] = Math.round(data[i + 2] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // color type: RGBA or RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(filterRows(raw, width, height, bpp), { level: 9 });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Reads width, height, color type and whether a PNG has an alpha channel. */
export function pngInfo(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const colorType = buf[25];
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType, hasAlpha: colorType === 4 || colorType === 6 };
}

/** Packs PNG images (each <= 256px) into a .ico file. */
export function encodeICO(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((png, i) => {
    const { width, height } = pngInfo(png);
    const o = i * 16;
    dir[o] = width >= 256 ? 0 : width;
    dir[o + 1] = height >= 256 ? 0 : height;
    dir[o + 2] = 0; dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...pngs]);
}

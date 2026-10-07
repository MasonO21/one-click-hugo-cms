// Tiny PNG codec (8-bit, non-interlaced) used by generate.mjs to post-process Chromium screenshots:
// strips the alpha channel from opaque outputs (App Store icons must not have one) and re-compresses
// with per-row filter selection. No dependencies beyond node:zlib.
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decode an 8-bit RGB/RGBA PNG into { width, height, channels, data } (raw, unfiltered). */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colorType = data[9];
      if (depth !== 8 || data[12] !== 0) throw new Error('unsupported PNG (need 8-bit, non-interlaced)');
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
      if (!channels) throw new Error('unsupported PNG color type ' + colorType);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[dst + x - channels] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= channels && y > 0 ? out[dst - stride + x - channels] : 0;
      const v = raw[src + x];
      out[dst + x] =
        ft === 0 ? v : ft === 1 ? v + a : ft === 2 ? v + b : ft === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c);
    }
  }
  return { width, height, channels, data: out };
}

/** Encode raw 8-bit pixels (3 = RGB, 4 = RGBA channels) into a PNG. */
export function encodePng({ width, height, channels, data }) {
  const stride = width * channels;
  const rows = [];
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  const zero = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : zero;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      cand[0][x] = cur[x];
      cand[1][x] = cur[x] - a;
      cand[2][x] = cur[x] - b;
      cand[3][x] = cur[x] - paeth(a, b, c);
    }
    // minimum sum of absolute (signed) residuals heuristic
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 4; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const v = cand[f][x];
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    // Filter types: 0 none, 1 sub, 2 up, 4 paeth (cand[3])
    rows.push(Buffer.from([best === 3 ? 4 : best]), Buffer.from(cand[best]));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** RGBA -> RGB. Any partially transparent pixel is composited over `bg` ([r,g,b]). */
export function flatten(img, bg = [27, 42, 58]) {
  if (img.channels === 3) return img;
  const { width, height, data } = img;
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    out[j] = Math.round(data[i] * a + bg[0] * (1 - a));
    out[j + 1] = Math.round(data[i + 1] * a + bg[1] * (1 - a));
    out[j + 2] = Math.round(data[i + 2] * a + bg[2] * (1 - a));
  }
  return { width, height, channels: 3, data: out };
}

/** Smallest circle enclosing every opaque-ish pixel (alpha >= threshold); returns { cx, cy, r }. */
export function enclosingCircle(img, threshold = 96) {
  const { width, height, channels, data } = img;
  const pts = [];
  for (let y = 0; y < height; y++) {
    let minX = -1;
    let maxX = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + (channels - 1)] >= threshold) {
        if (minX < 0) minX = x;
        maxX = x;
      }
    }
    if (minX >= 0) pts.push([minX, y + 0.5], [maxX + 1, y + 0.5]);
  }
  if (!pts.length) throw new Error('empty image');
  let cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  let cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  // Badoiu-Clarkson iteration for the minimum enclosing ball
  for (let i = 1; i <= 4000; i++) {
    let far = pts[0];
    let fd = -1;
    for (const p of pts) {
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d > fd) {
        fd = d;
        far = p;
      }
    }
    cx += (far[0] - cx) / (i + 1);
    cy += (far[1] - cy) / (i + 1);
  }
  const r = Math.sqrt(Math.max(...pts.map((p) => (p[0] - cx) ** 2 + (p[1] - cy) ** 2)));
  return { cx, cy, r };
}

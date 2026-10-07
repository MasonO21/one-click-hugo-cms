/**
 * Build-menu thumbnails baked from the game's own models (`npm run bake:thumbs`, scripts/bake-thumbs.mjs):
 * every building and vehicle id has exactly one 192² RGBA WebP under public/art/{buildings,vehicles},
 * nothing else lives there, and the whole set stays light.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDataRegistry } from '../src/data';

const data = createDataRegistry();
const ART = path.resolve(__dirname, '..', 'public', 'art');
const SIZE = 192;

/** Dimensions and alpha flag from a WebP header (VP8X extended, VP8L lossless or plain VP8 lossy). */
function webpInfo(buf: Buffer): { w: number; h: number; alpha: boolean; chunk: string } {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { w, h, alpha: (buf[20] & 0x10) !== 0, chunk };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1, chunk };
  }
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, alpha: false, chunk };
}

function check(folder: string, ids: string[]): number {
  const dir = path.join(ART, folder);
  const files = fs.readdirSync(dir).sort();
  expect(files, `${folder}: one file per id, no extras`).toEqual(ids.map((id) => `${id}.webp`).sort());
  let bytes = 0;
  for (const id of ids) {
    const buf = fs.readFileSync(path.join(dir, `${id}.webp`));
    const info = webpInfo(buf);
    expect([info.w, info.h], `${folder}/${id} size`).toEqual([SIZE, SIZE]);
    expect(info.alpha, `${folder}/${id} has an alpha channel (${info.chunk})`).toBe(true);
    expect(buf.length, `${folder}/${id} is not empty`).toBeGreaterThan(200);
    bytes += buf.length;
  }
  return bytes;
}

describe('build-menu thumbnails', () => {
  it('every building has a 192² transparent WebP thumbnail and public/art/buildings holds nothing else', () => {
    expect(data.buildings.length).toBeGreaterThan(100);
    check('buildings', data.buildings.map((b) => b.id));
  });

  it('every vehicle has a 192² transparent WebP thumbnail and public/art/vehicles holds nothing else', () => {
    expect(data.vehicles.length).toBeGreaterThan(0);
    check('vehicles', data.vehicles.map((v) => v.id));
  });

  it('the whole set stays light (the UI preloads the build menu)', () => {
    const total = check('buildings', data.buildings.map((b) => b.id)) + check('vehicles', data.vehicles.map((v) => v.id));
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });
});

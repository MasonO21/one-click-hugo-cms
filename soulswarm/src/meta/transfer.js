// Save transfer (Update 14): the whole profile as a code to copy to another device or keep as a backup, until cloud
// save arrives with the backend (PRODUCTION_ROADMAP.md §7). A code is "SS1." + base64url(deflate(JSON)) + "." + a CRC-32
// of the payload, so a mistyped or truncated code is refused rather than half-restored; a restored profile goes through
// the same repairs as any loaded save (save.js sanitizeProfile).
import { sanitizeProfile } from './save.js';

const PREFIX = 'SS1';
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (s) => { let c = 0xffffffff; for (let i = 0; i < s.length; i++) c = CRC[(c ^ s.charCodeAt(i)) & 255] ^ (c >>> 8); return ((c ^ 0xffffffff) >>> 0).toString(36); };
const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };

async function pipe(bytes, Stream, kind) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream(kind));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const deflate = (bytes) => (typeof CompressionStream === 'function' ? pipe(bytes, CompressionStream, 'deflate-raw') : Promise.resolve(null));
const inflate = (bytes) => pipe(bytes, DecompressionStream, 'deflate-raw');

/** The profile as a transfer code. */
export async function exportCode(p) {
  const json = new TextEncoder().encode(JSON.stringify(p));
  const z = await deflate(json);
  const body = z ? 'z' + b64u(z) : 'j' + b64u(json); // 'j': a browser without CompressionStream
  return `${PREFIX}.${body}.${crc32(body)}`;
}

/** A code back to a repaired profile, or { error: 'format' | 'checksum' | 'data' }. */
export async function importCode(code) {
  const c = String(code || '').replace(/\s+/g, '');
  const m = c.match(/^SS1\.([zj][A-Za-z0-9_-]+)\.([0-9a-z]+)$/);
  if (!m) return { error: 'format' };
  if (crc32(m[1]) !== m[2]) return { error: 'checksum' };
  try {
    const raw = unb64u(m[1].slice(1)), bytes = m[1][0] === 'z' ? await inflate(raw) : raw;
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || typeof obj !== 'object' || !obj.heroes || !obj.chapter) return { error: 'data' };
    return { profile: sanitizeProfile(obj) };
  } catch (e) {
    return { error: 'data' };
  }
}

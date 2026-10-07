/**
 * Save encodings.
 *
 *  - Local save envelope  "NCS1:<crc32 hex>:<json>"   (checksummed so a torn/partial write is detected;
 *                          legacy raw-JSON saves are still accepted)
 *  - Recovery code        "NC1-<crc32 hex>-<base64url(deflate-raw(json))>"  (CompressionStream)
 *                          "NC0-<crc32 hex>-<base64url(json)>"               (no compression available)
 *
 * Recovery codes are plain ASCII, safe to paste into a message/notes app, tolerant of added
 * whitespace/line breaks, and carry a checksum so typos are caught instead of loading garbage.
 * OWNER: meta agent.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

let table: Uint32Array | null = null;

/** CRC-32 over UTF-16 code units (stable regardless of string encoding). */
export function crc32(s: string): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < s.length; i++) crc = table[(crc ^ s.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function crcHex(s: string): string {
  return crc32(s).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ base64url

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ------------------------------------------------------------------ compression

export function canCompress(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined';
}

async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  w.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

// ------------------------------------------------------------------ local save envelope

const ENVELOPE = 'NCS1:';

/** Wrap serialized state for local storage (checksummed). */
export function wrapSave(json: string): string {
  return `${ENVELOPE}${crcHex(json)}:${json}`;
}

/** Verify and unwrap a local save. Legacy raw JSON (starts with "{") is accepted unchecked. */
export function unwrapSave(raw: string): { json: string } | { error: string } {
  if (raw.startsWith(ENVELOPE)) {
    const sum = raw.slice(ENVELOPE.length, ENVELOPE.length + 8);
    if (raw[ENVELOPE.length + 8] !== ':') return { error: 'malformed save header' };
    const json = raw.slice(ENVELOPE.length + 9);
    if (crcHex(json) !== sum) return { error: 'save checksum mismatch (corrupt or truncated)' };
    return { json };
  }
  if (raw.trimStart().startsWith('{')) return { json: raw };
  return { error: 'unrecognised save format' };
}

// ------------------------------------------------------------------ recovery codes

/** Encode serialized state as a recovery code (compressed when the runtime supports it). */
export async function encodeRecovery(json: string): Promise<string> {
  const raw = enc.encode(json);
  if (canCompress()) {
    try {
      const body = bytesToBase64Url(await pipe(raw, new CompressionStream('deflate-raw') as never));
      return `NC1-${crcHex(body)}-${body}`;
    } catch {
      /* fall through to the uncompressed form */
    }
  }
  const body = bytesToBase64Url(raw);
  return `NC0-${crcHex(body)}-${body}`;
}

/** Decode a recovery code back to serialized state JSON. Throws an Error with a player-readable message. */
export async function decodeRecovery(code: string): Promise<string> {
  const clean = code.replace(/\s+/g, '');
  const m = /^(NC[01])-([0-9a-f]{8})-([A-Za-z0-9_-]+)$/.exec(clean);
  if (!m) throw new Error('That does not look like a Nova Colony recovery code');
  const [, kind, sum, body] = m;
  if (crcHex(body) !== sum) throw new Error('The recovery code is damaged — check it was copied completely');
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(body);
  } catch {
    throw new Error('The recovery code is damaged — check it was copied completely');
  }
  if (kind === 'NC1') {
    if (!canCompress()) throw new Error('This device cannot unpack compressed recovery codes');
    try {
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw') as never);
    } catch {
      throw new Error('The recovery code could not be unpacked');
    }
  }
  return dec.decode(bytes);
}

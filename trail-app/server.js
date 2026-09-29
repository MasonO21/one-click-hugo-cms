// Waypath server: serves the app and a tiny trail-sharing API. Zero dependencies.
//
//   GET    /api/health
//   GET    /api/trails?lat=&lng=&radiusKm=&limit=   nearby trail summaries, closest first
//   GET    /api/trails/:id                          full trail (geometry + waypoints)
//   POST   /api/trails                              publish a trail -> { id, deleteToken }
//   DELETE /api/trails/:id   (X-Delete-Token)       unpublish
//
// Storage is one JSON file per trail under DATA_DIR. That's deliberately simple for a
// prototype; swap `TrailStore` for a real database (PostGIS gives you the nearby query for free).

import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversine } from './public/lib/geo.js';
import { toSummary, validateTrail } from './public/lib/trail.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  // Trail names, notes and photos are written by strangers: keep the page from executing anything inline.
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; " +
    "style-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha256 = (s) => createHash('sha256').update(s).digest();

/** File-backed trail store with an in-memory summary index for the nearby query. */
export class TrailStore {
  constructor(dir) {
    this.dir = dir;
    this.index = new Map(); // id -> { summary, tokenHash }
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(await readFile(join(this.dir, f), 'utf8'));
        this.index.set(rec.trail.id, { summary: toSummary(rec.trail), tokenHash: rec.tokenHash });
      } catch (err) {
        console.warn(`skipping unreadable trail file ${f}: ${err.message}`);
      }
    }
    return this;
  }

  #file(id) {
    if (!ID_RE.test(id)) throw new HttpError(404, 'Trail not found');
    return join(this.dir, `${id}.json`);
  }

  async create(trail) {
    const id = randomUUID();
    const deleteToken = randomBytes(24).toString('base64url');
    const stored = { ...trail, id, publishedAt: new Date().toISOString() };
    const tokenHash = sha256(deleteToken).toString('hex');
    const file = this.#file(id);
    // write-then-rename so a crash can't leave a half-written trail
    await writeFile(`${file}.tmp`, JSON.stringify({ trail: stored, tokenHash }));
    await rename(`${file}.tmp`, file);
    this.index.set(id, { summary: toSummary(stored), tokenHash });
    return { id, deleteToken };
  }

  async get(id) {
    let raw;
    try {
      raw = await readFile(this.#file(id), 'utf8');
    } catch (err) {
      if (err instanceof HttpError || err.code === 'ENOENT') throw new HttpError(404, 'Trail not found');
      throw err;
    }
    return JSON.parse(raw).trail;
  }

  async remove(id, token) {
    const entry = this.index.get(id);
    if (!entry) throw new HttpError(404, 'Trail not found');
    const given = sha256(String(token ?? ''));
    if (!timingSafeEqual(given, Buffer.from(entry.tokenHash, 'hex'))) throw new HttpError(403, 'Bad delete token');
    await unlink(this.#file(id));
    this.index.delete(id);
  }

  nearby({ lat, lng, radiusKm, limit }) {
    const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    let rows = [...this.index.values()].map((e) => ({
      e,
      d: origin ? haversine(origin, e.summary.start) : null,
    }));
    if (origin) rows = rows.filter((r) => r.d <= radiusKm * 1000);
    rows.sort((a, b) => (origin ? a.d - b.d : b.e.summary.createdAt.localeCompare(a.e.summary.createdAt)));
    return rows
      .slice(0, limit)
      .map((r) => (r.d == null ? r.e.summary : { ...r.e.summary, distanceFromUserM: Math.round(r.d) }));
  }
}

/** Sliding-window limiter, in memory: enough to stop one client flooding uploads. */
function makeLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

async function readBody(req) {
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Upload too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Upload too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(payload);
}

async function serveStatic(publicDir, pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolve(publicDir, normalize(`.${sep}${rel}`));
  if (file !== publicDir && !file.startsWith(publicDir + sep)) throw new HttpError(403, 'Forbidden');
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  if (!info.isFile()) throw new HttpError(404, 'Not found');
  const body = await readFile(file);
  const ext = extname(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // the service worker owns offline caching; make sure it can always see updates
    'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
  });
  res.end(body);
}

export async function createApp({ dataDir = join(HERE, 'data', 'trails'), publicDir = join(HERE, 'public'), uploadsPerHour = 30 } = {}) {
  const store = await new TrailStore(dataDir).init();
  const root = resolve(publicDir);
  const allowUpload = makeLimiter(uploadsPerHour, 3600_000);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      const path = url.pathname;

      if (path === '/api/health') return send(res, 200, { ok: true, trails: store.index.size });

      if (path === '/api/trails' && req.method === 'GET') {
        const num = (k) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : NaN);
        const rows = store.nearby({
          lat: num('lat'),
          lng: num('lng'),
          radiusKm: Math.min(500, Math.max(0.1, num('radiusKm') || 50)),
          limit: Math.min(100, Math.max(1, num('limit') || 30)),
        });
        return send(res, 200, { trails: rows }, { 'Cache-Control': 'no-store' });
      }

      if (path === '/api/trails' && req.method === 'POST') {
        if (!allowUpload(req.socket.remoteAddress)) throw new HttpError(429, 'Too many uploads, try again later');
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
          throw new HttpError(415, 'Content-Type must be application/json');
        let trail;
        try {
          trail = validateTrail(await readBody(req));
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(422, err.message);
        }
        return send(res, 201, await store.create(trail));
      }

      const m = /^\/api\/trails\/([^/]+)$/.exec(path);
      if (m && req.method === 'GET') return send(res, 200, await store.get(m[1]), { 'Cache-Control': 'no-store' });
      if (m && req.method === 'DELETE') {
        await store.remove(m[1], req.headers['x-delete-token']);
        return send(res, 200, { ok: true });
      }

      if (path.startsWith('/api/')) throw new HttpError(404, 'Unknown API route');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      return await serveStatic(root, path, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof URIError ? 400 : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'Internal error' : err.message });
    }
  });

  return { server, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST || '127.0.0.1';
  const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : undefined;
  const { server, store } = await createApp({ dataDir });
  server.listen(port, host, () => {
    console.log(`Waypath running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (${store.index.size} trails stored)`);
  });
}

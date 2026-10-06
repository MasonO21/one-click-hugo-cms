import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Action } from '../src/shared/service';
import { buildSnapshot } from '../src/shared/snapshot';
import { SunupError, firstName } from '../src/shared/util';
import type { Id } from '../src/shared/types';
import { Store } from './store';
import { createNotifier, type Notifier } from './notify';

export interface AppOptions {
  dataDir: string;
  publicUrl: string;
  /** Where the built web app lives; skipped if missing (e.g. in tests or dev). */
  staticDir?: string;
  tickMs?: number;
  twilio?: { sid?: string; token?: string; from?: string };
  vapidSubject?: string;
  log?: (line: string) => void;
}

const STATUS: Record<string, number> = { unauthorized: 401, forbidden: 403, not_found: 404, rate_limited: 429 };

/** A tiny fixed-window rate limiter keyed by IP or user. */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return true;
    }
    entry.count++;
    return entry.count <= max;
  };
}

export function createApp(options: AppOptions) {
  const log = options.log ?? ((line: string) => console.log(line));
  const store = new Store(options.dataDir, options.publicUrl);
  const service = store.service;
  const notifier: Notifier = createNotifier(store, {
    twilioSid: options.twilio?.sid,
    twilioToken: options.twilio?.token,
    twilioFrom: options.twilio?.from,
    vapidSubject: options.vapidSubject ?? 'mailto:alerts@example.com',
    log,
  });
  const signupLimit = limiter(20, 60 * 60_000);
  const actionLimit = limiter(120, 60_000);
  const lookupLimit = limiter(60, 60_000);

  function flushOutbox() {
    const messages = service.drain();
    store.save();
    if (messages.length) void notifier.deliver(messages);
  }

  function tick() {
    try {
      service.tick(Date.now());
      flushOutbox();
    } catch (e) {
      log(`[tick] ${String(e)}`);
    }
  }
  const timer = setInterval(tick, options.tickMs ?? 15_000);

  const snapshotFor = (userId: Id) => buildSnapshot(service, userId, Date.now(), { photo: (c) => `/api/photos/${c.id}` });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use('/api', express.json({ limit: '600kb' }));

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
    const userId = token && store.userForToken(token);
    if (!userId) {
      res.status(401).json({ code: 'unauthorized', message: 'Please sign in again.' });
      return;
    }
    res.locals.userId = userId;
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, sunup: true, twilio: notifier.twilio });
  });

  app.post('/api/signup', (req, res) => {
    if (!signupLimit(req.ip ?? 'unknown')) throw new SunupError('rate_limited', 'Too many sign-ups from this network. Try again later.');
    const user = service.createUser({ name: req.body?.name, phone: req.body?.phone, timezone: req.body?.timezone }, Date.now());
    const token = store.issueToken(user.id);
    store.save();
    res.status(201).json({ token, snapshot: snapshotFor(user.id) });
  });

  app.get('/api/state', auth, (_req, res) => {
    res.json(snapshotFor(res.locals.userId));
  });

  app.post('/api/action', auth, (req, res) => {
    const userId: Id = res.locals.userId;
    if (!actionLimit(userId)) throw new SunupError('rate_limited', 'Slow down a little and try again.');
    service.dispatch(userId, req.body as Action, Date.now());
    service.tick(Date.now());
    flushOutbox();
    res.json(snapshotFor(userId));
  });

  app.get('/api/invite/:code', (req, res) => {
    if (!lookupLimit(req.ip ?? 'unknown')) throw new SunupError('rate_limited', 'Too many requests. Try again in a minute.');
    const user = service.userByInviteCode(String(req.params.code));
    if (!user) throw new SunupError('not_found', 'That invite link isn\'t valid.');
    res.json({ name: firstName(user.name), color: user.color });
  });

  app.get('/api/photos/:id', auth, (req, res) => {
    const viewer: Id = res.locals.userId;
    const checkIn = service.state.checkIns.find((c) => c.id === req.params.id);
    if (!checkIn?.photo || (checkIn.userId !== viewer && !service.isWatching(viewer, checkIn.userId))) {
      throw new SunupError('not_found', 'Photo not found.');
    }
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(checkIn.photo);
    if (!match) throw new SunupError('not_found', 'Photo not found.');
    res.set({ 'Content-Type': match[1], 'Cache-Control': 'private, max-age=86400' });
    res.send(Buffer.from(match[2], 'base64'));
  });

  app.get('/api/push/key', (_req, res) => {
    res.json({ key: store.vapid.publicKey });
  });

  app.post('/api/push/subscribe', auth, (req, res) => {
    const sub = req.body;
    const valid =
      typeof sub?.endpoint === 'string' &&
      /^https:\/\//.test(sub.endpoint) &&
      sub.endpoint.length < 1000 &&
      typeof sub.keys?.p256dh === 'string' &&
      typeof sub.keys?.auth === 'string';
    if (!valid) throw new SunupError('invalid', 'That push subscription isn\'t valid.');
    store.addSubscription(res.locals.userId, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'not_found', message: 'Not found.' });
  });

  if (options.staticDir && existsSync(join(options.staticDir, 'index.html'))) {
    const dir = options.staticDir;
    app.get('/sw.js', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(dir, 'sw.js'));
    });
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(dir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err instanceof SunupError) {
      res.status(STATUS[err.code] ?? 400).json({ code: err.code, message: err.message });
      return;
    }
    if ((err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ code: 'invalid', message: 'Request body must be JSON.' });
      return;
    }
    if ((err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ code: 'too_large', message: 'That upload is too large.' });
      return;
    }
    log(`[error] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    res.status(500).json({ code: 'server', message: 'Something went wrong on our side.' });
  });

  return {
    app,
    store,
    tick,
    close() {
      clearInterval(timer);
      store.flush();
    },
  };
}

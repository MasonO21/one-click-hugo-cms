import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Action } from '../src/shared/service';
import { buildSnapshot } from '../src/shared/snapshot';
import { SunupError, firstName, formatPhone, normalizePhone } from '../src/shared/util';
import type { Id } from '../src/shared/types';
import { Store } from './store';
import { createNotifier, escapeXml, type Notifier } from './notify';
import { twilioSignatureValid } from './twilio';
import { applyStripeEvent, createCheckout, createPortal, requireStripe, stripeEnabled, stripeSignatureValid, type StripeConfig } from './billing';
import { PhoneCodes } from './auth';

export interface AppOptions {
  dataDir: string;
  publicUrl: string;
  /** Where the built web app lives; skipped if missing (e.g. in tests or dev). */
  staticDir?: string;
  tickMs?: number;
  twilio?: { sid?: string; token?: string; from?: string };
  vapidSubject?: string;
  /** Return sign-in codes in API responses when Twilio isn't set up (local development only). */
  devCodes?: boolean;
  log?: (line: string) => void;
  /** Swappable for tests: used for Twilio and Stripe calls. */
  fetch?: typeof fetch;
  stripe?: StripeConfig;
}

const STATUS: Record<string, number> = { unauthorized: 401, forbidden: 403, not_found: 404, rate_limited: 429, billing: 502, sms_failed: 502 };

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
    fetch: options.fetch,
  });
  const signupLimit = limiter(20, 60 * 60_000);
  const actionLimit = limiter(120, 60_000);
  const lookupLimit = limiter(60, 60_000);
  const codeIpLimit = limiter(10, 10 * 60_000);
  const codePhoneLimit = limiter(5, 60 * 60_000);
  const verifyLimit = limiter(30, 10 * 60_000);
  const codes = new PhoneCodes();
  const http = options.fetch ?? fetch;
  const host = new URL(options.publicUrl).host;

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
  // Stripe needs the exact bytes it signed, so this route reads the raw body before the JSON parser.
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
    const cfg = requireStripe(options.stripe);
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!stripeSignatureValid(payload, req.get('stripe-signature'), cfg.webhookSecret, Date.now())) {
      throw new SunupError('forbidden', 'Bad signature.');
    }
    if (applyStripeEvent(service, JSON.parse(payload), Date.now())) store.save();
    res.json({ received: true });
  });

  app.use('/api', express.json({ limit: '600kb' }));

  const bearer = (req: Request) => /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  const viewerOf = (req: Request) => {
    const token = bearer(req);
    return token ? store.userForToken(token) : undefined;
  };

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const userId = viewerOf(req);
    if (!userId) {
      res.status(401).json({ code: 'unauthorized', message: 'Please sign in again.' });
      return;
    }
    res.locals.userId = userId;
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, sunup: true, twilio: notifier.twilio, billing: stripeEnabled(options.stripe) });
  });

  app.post('/api/signup', (req, res) => {
    if (!signupLimit(req.ip ?? 'unknown')) throw new SunupError('rate_limited', 'Too many sign-ups from this network. Try again later.');
    const user = service.createUser({ name: req.body?.name, phone: req.body?.phone, timezone: req.body?.timezone }, Date.now());
    const token = store.issueToken(user.id);
    store.save();
    res.status(201).json({ token, snapshot: snapshotFor(user.id) });
  });

  // Phone sign-in. The same two calls create an account, sign in on a new device,
  // or (when already signed in) confirm the number on your profile.
  app.post('/api/auth/start', async (req, res) => {
    if (!codeIpLimit(req.ip ?? 'unknown')) throw new SunupError('rate_limited', 'Too many codes requested. Try again in a few minutes.');
    const phone = normalizePhone(req.body?.phone);
    if (!codePhoneLimit(phone)) throw new SunupError('rate_limited', 'Too many codes sent to that number. Try again in an hour.');
    const code = codes.issue(phone, Date.now());
    try {
      // The last line lets Android fill the code in automatically (WebOTP).
      await notifier.text(phone, `${code} is your Sunup code. It expires in 10 minutes.\n\n@${host} #${code}`);
    } catch (e) {
      log(`[auth] couldn't text ${phone}: ${String(e)}`);
      throw new SunupError('sms_failed', 'We couldn\'t text that number. Check it and try again.');
    }
    res.json({ sentTo: formatPhone(phone), devCode: !notifier.twilio && options.devCodes ? code : undefined });
  });

  app.post('/api/auth/verify', (req, res) => {
    if (!verifyLimit(req.ip ?? 'unknown')) throw new SunupError('rate_limited', 'Too many tries. Wait a few minutes.');
    const now = Date.now();
    const phone = normalizePhone(req.body?.phone);
    const code = req.body?.code;
    const viewer = viewerOf(req);
    if (viewer) {
      codes.check(phone, code, now, true);
      service.verifyPhone(viewer, phone);
      store.save();
      res.json({ snapshot: snapshotFor(viewer) });
      return;
    }
    const existing = service.userByVerifiedPhone(phone);
    if (existing) {
      codes.check(phone, code, now, true);
      res.json({ token: store.issueToken(existing.id), snapshot: snapshotFor(existing.id) });
      return;
    }
    if (!req.body?.name) {
      // Right code, no account yet: keep the code valid so the person can add their name.
      codes.check(phone, code, now, false);
      res.json({ needsName: true });
      return;
    }
    codes.check(phone, code, now, true);
    const user = service.createUser({ name: req.body.name, phone, timezone: req.body?.timezone, phoneVerified: true }, now);
    store.save();
    res.status(201).json({ token: store.issueToken(user.id), snapshot: snapshotFor(user.id) });
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    store.revokeToken(bearer(req)!);
    res.json({ ok: true });
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

  app.post('/api/billing/checkout', auth, async (req, res) => {
    const cfg = requireStripe(options.stripe);
    const user = service.user(res.locals.userId);
    const interval = req.body?.interval === 'month' ? 'month' : 'year';
    try {
      res.json({ url: await createCheckout(cfg, http, user, interval, options.publicUrl) });
    } catch (e) {
      log(`[billing] checkout: ${String(e)}`);
      throw new SunupError('billing', 'Checkout isn\'t available right now. Try again in a minute.');
    }
  });

  app.post('/api/billing/portal', auth, async (_req, res) => {
    const cfg = requireStripe(options.stripe);
    const customerId = service.user(res.locals.userId).billing?.customerId;
    if (!customerId) throw new SunupError('not_found', 'There\'s no subscription on this account yet.');
    try {
      res.json({ url: await createPortal(cfg, http, customerId, options.publicUrl) });
    } catch (e) {
      log(`[billing] portal: ${String(e)}`);
      throw new SunupError('billing', 'Subscription settings aren\'t available right now. Try again in a minute.');
    }
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

  // Replies to Sunup's texts (YES, STOP, HELP...). Point the Twilio number's
  // "A message comes in" webhook at PUBLIC_URL/api/twilio/sms.
  app.post('/api/twilio/sms', express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
    const token = options.twilio?.token;
    if (!token) throw new SunupError('not_found', 'Not found.');
    const url = `${options.publicUrl}/api/twilio/sms`;
    if (!twilioSignatureValid(token, url, req.body ?? {}, req.get('x-twilio-signature'))) {
      throw new SunupError('forbidden', 'Bad signature.');
    }
    let from: string;
    try {
      from = normalizePhone(String(req.body.From ?? ''));
    } catch {
      res.type('text/xml').send('<Response/>');
      return;
    }
    const reply = service.contactReply(from, String(req.body.Body ?? ''), Date.now());
    flushOutbox();
    res.type('text/xml').send(reply ? `<Response><Message>${escapeXml(reply)}</Message></Response>` : '<Response/>');
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

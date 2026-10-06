// Native push without SDKs: Android through Firebase Cloud Messaging (HTTP v1, service
// account JWT), iPhone straight to Apple Push Notification service (HTTP/2, .p8 key JWT).

import { createSign, sign as cryptoSign } from 'node:crypto';
import http2 from 'node:http2';

export interface NativeMessage {
  title: string;
  body: string;
  urgent: boolean;
  link?: string;
  action?: string;
  userId: string;
  /** Notifications with the same tag replace each other (one per alert, one daily reminder). */
  tag: string;
}

/** ok: delivered; gone: the token is dead and should be forgotten; error: try again later. */
export type SendResult = 'ok' | 'gone' | 'error';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** Accepts a secret as raw text or base64 (handy for env vars). */
export function decodeSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('-----')) return trimmed;
  return Buffer.from(trimmed, 'base64').toString('utf8');
}

// ---------------------------------------------------------------- Android (FCM)

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Reads a Firebase service-account JSON (raw or base64). */
export function parseServiceAccount(raw: string | undefined): FcmConfig | undefined {
  const text = decodeSecret(raw);
  if (!text) return undefined;
  const json = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
  if (!json.project_id || !json.client_email || !json.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key.');
  return { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key };
}

export class Fcm {
  private access: { token: string; expiresAt: number } | null = null;

  constructor(
    private cfg: FcmConfig,
    private http: typeof fetch = fetch,
  ) {}

  private async accessToken(now: number): Promise<string> {
    if (this.access && this.access.expiresAt - 60_000 > now) return this.access.token;
    const iat = Math.floor(now / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({
        iss: this.cfg.clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp: iat + 3600,
      }),
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.cfg.privateKey);
    const res = await this.http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) throw new Error(`FCM auth failed (${res.status})`);
    this.access = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  async send(token: string, msg: NativeMessage, now = Date.now()): Promise<SendResult> {
    const accessToken = await this.accessToken(now);
    const data: Record<string, string> = { userId: msg.userId, link: msg.link ?? '' };
    if (msg.action) data.action = msg.action;
    const res = await this.http(`https://fcm.googleapis.com/v1/projects/${this.cfg.projectId}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data,
          android: {
            priority: msg.urgent ? 'HIGH' : 'NORMAL',
            notification: {
              channel_id: msg.urgent ? 'alerts' : 'reminders',
              tag: msg.tag,
              default_sound: true,
              notification_priority: msg.urgent ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT',
            },
          },
        },
      }),
    });
    if (res.ok) return 'ok';
    const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status;
    return res.status === 404 || code === 'UNREGISTERED' ? 'gone' : 'error';
  }
}

// ---------------------------------------------------------------- iPhone (APNs)

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** The .p8 key's PEM text. */
  key: string;
  bundleId: string;
  production: boolean;
  /** Override for tests. */
  host?: string;
}

export class Apns {
  private session: http2.ClientHttp2Session | null = null;
  private jwt: { value: string; issuedAt: number } | null = null;

  constructor(private cfg: ApnsConfig) {}

  private host(): string {
    return this.cfg.host ?? (this.cfg.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com');
  }

  /** Apple wants the provider token refreshed between 20 and 60 minutes. */
  private token(now: number): string {
    if (this.jwt && now - this.jwt.issuedAt < 50 * 60_000) return this.jwt.value;
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: this.cfg.keyId }));
    const claims = b64url(JSON.stringify({ iss: this.cfg.teamId, iat: Math.floor(now / 1000) }));
    const signature = cryptoSign('sha256', Buffer.from(`${header}.${claims}`), { key: this.cfg.key, dsaEncoding: 'ieee-p1363' });
    this.jwt = { value: `${header}.${claims}.${b64url(signature)}`, issuedAt: now };
    return this.jwt.value;
  }

  private connect(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = http2.connect(this.host());
    session.on('error', () => session.destroy());
    session.on('goaway', () => session.close());
    session.unref();
    this.session = session;
    return session;
  }

  send(deviceToken: string, msg: NativeMessage, now = Date.now()): Promise<SendResult> {
    if (!/^[0-9a-fA-F]{32,200}$/.test(deviceToken)) return Promise.resolve('gone');
    const payload = JSON.stringify({
      aps: {
        alert: { title: msg.title, body: msg.body },
        sound: 'default',
        // Time-sensitive alerts break through Focus modes (needs the entitlement in the app).
        'interruption-level': msg.urgent ? 'time-sensitive' : 'active',
        'thread-id': msg.tag,
      },
      link: msg.link ?? '',
      userId: msg.userId,
      ...(msg.action ? { action: msg.action } : {}),
    });
    return new Promise((resolve) => {
      let req: http2.ClientHttp2Stream;
      try {
        req = this.connect().request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `bearer ${this.token(now)}`,
          'apns-topic': this.cfg.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': msg.urgent ? '10' : '5',
          'apns-collapse-id': msg.tag.slice(0, 64),
          'content-type': 'application/json',
        });
      } catch {
        resolve('error');
        return;
      }
      let status = 0;
      let body = '';
      req.setTimeout(15_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on('response', (headers) => (status = Number(headers[':status'])));
      req.on('data', (chunk) => (body += chunk));
      req.on('error', () => resolve('error'));
      req.on('close', () => {
        if (status === 200) return resolve('ok');
        let reason = '';
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason ?? '';
        } catch {
          // No body.
        }
        resolve(status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason) ? 'gone' : 'error');
      });
      req.end(payload);
    });
  }

  close() {
    this.session?.close();
  }
}

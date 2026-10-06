// Native push senders, checked against real key signatures and a local HTTP/2 stand-in for Apple.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVerify, generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { Apns, Fcm, decodeSecret, parseServiceAccount, type NativeMessage } from '../server/native-push';

const MSG: NativeMessage = { title: 'Maya hasn\'t checked in', body: 'Try to reach Maya.', urgent: true, link: '#circle', action: 'checkin', userId: 'u_jordan', tag: 'a_123' };

function decodeJwt(jwt: string) {
  const [h, c, s] = jwt.split('.');
  return { header: JSON.parse(Buffer.from(h, 'base64url').toString()), claims: JSON.parse(Buffer.from(c, 'base64url').toString()), signed: `${h}.${c}`, signature: Buffer.from(s, 'base64url') };
}

describe('FCM (Android)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const calls: { url: string; init: RequestInit }[] = [];
  let unregister = false;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.includes('oauth2')) return Response.json({ access_token: 'ya29.test', expires_in: 3600 });
    if (unregister) return Response.json({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 });
    return Response.json({ name: 'projects/p/messages/1' });
  }) as typeof fetch;

  it('reads a service account from raw or base64 JSON', () => {
    const json = JSON.stringify({ project_id: 'sunup-app', client_email: 'push@sunup-app.iam.gserviceaccount.com', private_key: pem });
    expect(parseServiceAccount(json)?.projectId).toBe('sunup-app');
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))?.clientEmail).toBe('push@sunup-app.iam.gserviceaccount.com');
    expect(parseServiceAccount(undefined)).toBeUndefined();
    expect(() => parseServiceAccount('{"project_id":"x"}')).toThrow(/missing/);
    expect(decodeSecret(Buffer.from('-----BEGIN PRIVATE KEY-----').toString('base64'))).toBe('-----BEGIN PRIVATE KEY-----');
  });

  it('signs a service-account JWT, reuses the access token, and sends an Android alert', async () => {
    const fcm = new Fcm({ projectId: 'sunup-app', clientEmail: 'push@sunup-app.iam.gserviceaccount.com', privateKey: pem }, fakeFetch);
    expect(await fcm.send('android-token-1', MSG, 1_800_000_000_000)).toBe('ok');
    expect(await fcm.send('android-token-2', { ...MSG, urgent: false, tag: 'sunup-reminder' }, 1_800_000_060_000)).toBe('ok');

    const auth = calls.filter((c) => c.url.includes('oauth2'));
    expect(auth).toHaveLength(1);
    const jwt = decodeJwt(new URLSearchParams(String(auth[0].init.body)).get('assertion')!);
    expect(jwt.header.alg).toBe('RS256');
    expect(jwt.claims).toMatchObject({ iss: 'push@sunup-app.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    expect(createVerify('RSA-SHA256').update(jwt.signed).verify(publicKey, jwt.signature)).toBe(true);

    const sends = calls.filter((c) => c.url.endsWith('/v1/projects/sunup-app/messages:send'));
    expect(sends).toHaveLength(2);
    expect((sends[0].init.headers as Record<string, string>).authorization).toBe('Bearer ya29.test');
    const urgent = JSON.parse(String(sends[0].init.body)).message;
    expect(urgent).toMatchObject({ token: 'android-token-1', notification: { title: MSG.title }, data: { link: '#circle', userId: 'u_jordan', action: 'checkin' } });
    expect(urgent.android).toMatchObject({ priority: 'HIGH', notification: { channel_id: 'alerts', tag: 'a_123' } });
    const reminder = JSON.parse(String(sends[1].init.body)).message;
    expect(reminder.android).toMatchObject({ priority: 'NORMAL', notification: { channel_id: 'reminders' } });
  });

  it('reports uninstalled apps so their tokens are dropped', async () => {
    unregister = true;
    const fcm = new Fcm({ projectId: 'sunup-app', clientEmail: 'push@x', privateKey: pem }, fakeFetch);
    expect(await fcm.send('android-token-old', MSG)).toBe('gone');
    unregister = false;
  });
});

describe('APNs (iPhone)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const received: { headers: http2.IncomingHttpHeaders; body: string }[] = [];
  let server: http2.Http2Server;
  let host: string;

  beforeAll(async () => {
    server = http2.createServer();
    server.on('stream', (stream: http2.ServerHttp2Stream, headers) => {
      let body = '';
      stream.on('data', (c) => (body += c));
      stream.on('end', () => {
        received.push({ headers, body });
        const token = String(headers[':path']).split('/').pop()!;
        if (token.startsWith('dead')) {
          stream.respond({ ':status': 410 });
          stream.end(JSON.stringify({ reason: 'Unregistered' }));
        } else if (token.startsWith('bad')) {
          stream.respond({ ':status': 400 });
          stream.end(JSON.stringify({ reason: 'BadDeviceToken' }));
        } else if (token.startsWith('beef')) {
          stream.respond({ ':status': 503 });
          stream.end(JSON.stringify({ reason: 'ServiceUnavailable' }));
        } else {
          stream.respond({ ':status': 200, 'apns-id': 'id-1' });
          stream.end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server.close());

  it('sends a time-sensitive alert signed with the .p8 key', async () => {
    const apns = new Apns({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', key: p8, bundleId: 'app.sunup.checkin', production: true, host });
    const token = 'a'.repeat(64);
    expect(await apns.send(token, MSG, 1_800_000_000_000)).toBe('ok');
    const req = received.at(-1)!;
    expect(req.headers[':path']).toBe(`/3/device/${token}`);
    expect(req.headers['apns-topic']).toBe('app.sunup.checkin');
    expect(req.headers['apns-priority']).toBe('10');
    expect(req.headers['apns-push-type']).toBe('alert');
    expect(req.headers['apns-collapse-id']).toBe('a_123');
    const body = JSON.parse(req.body);
    expect(body.aps).toMatchObject({ alert: { title: MSG.title, body: MSG.body }, 'interruption-level': 'time-sensitive', 'thread-id': 'a_123' });
    expect(body).toMatchObject({ link: '#circle', userId: 'u_jordan', action: 'checkin' });

    const jwt = decodeJwt(String(req.headers.authorization).replace('bearer ', ''));
    expect(jwt.header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(jwt.claims.iss).toBe('TEAM123456');
    expect(cryptoVerify('sha256', Buffer.from(jwt.signed), { key: publicKey, dsaEncoding: 'ieee-p1363' }, jwt.signature)).toBe(true);

    // Reminders are gentle, and the provider token is reused within the hour.
    expect(await apns.send(token, { ...MSG, urgent: false }, 1_800_000_600_000)).toBe('ok');
    const second = received.at(-1)!;
    expect(second.headers['apns-priority']).toBe('5');
    expect(JSON.parse(second.body).aps['interruption-level']).toBe('active');
    expect(second.headers.authorization).toBe(req.headers.authorization);
    apns.close();
  });

  it('drops dead tokens and keeps retryable failures', async () => {
    const apns = new Apns({ keyId: 'K', teamId: 'T', key: p8, bundleId: 'app.sunup.checkin', production: false, host });
    expect(await apns.send('dead' + 'b'.repeat(60), MSG)).toBe('gone');
    expect(await apns.send('bad0' + 'c'.repeat(60), MSG)).toBe('gone');
    expect(await apns.send('beef' + 'd'.repeat(60), MSG)).toBe('error');
    expect(await apns.send('not-a-token', MSG)).toBe('gone');
    apns.close();
  });
});

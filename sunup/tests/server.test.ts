import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import type { Snapshot } from '../src/shared/snapshot';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

let dir: string;
let server: Server;
let base: string;
let close: () => void;
const logs: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sunup-'));
  const created = createApp({ dataDir: dir, publicUrl: 'https://sunup.test', tickMs: 60_000, devCodes: true, log: (l) => logs.push(l) });
  close = created.close;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  close();
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call<T = Snapshot>(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json as T };
}

async function signup(name: string, phone?: string) {
  const res = await call<{ token: string; snapshot: Snapshot }>('/api/signup', { body: { name, phone, timezone: 'America/Chicago' } });
  expect(res.status).toBe(201);
  return res.body;
}

describe('server', () => {
  it('reports health', async () => {
    const res = await call<{ sunup: boolean; twilio: boolean }>('/api/health');
    expect(res.body).toMatchObject({ sunup: true, twilio: false });
  });

  it('connects two people, shares check-ins and protects photos', async () => {
    const maya = await signup('Maya', '555-201-0001');
    const jordan = await signup('Jordan');
    const stranger = await signup('Stranger');

    const invite = await call<{ name: string }>(`/api/invite/${maya.snapshot.me.inviteCode}`);
    expect(invite.body.name).toBe('Maya');

    const joined = await call('/api/action', { token: jordan.token, body: { type: 'acceptInvite', code: maya.snapshot.me.inviteCode, watch: true, mutual: false } });
    expect(joined.status).toBe(200);
    expect(joined.body.watching[0].person.name).toBe('Maya');
    // Watchers can call the person they watch.
    expect(joined.body.watching[0].person.phone).toBe('+15552010001');

    await call('/api/action', { token: maya.token, body: { type: 'completeOnboarding' } });
    const checked = await call('/api/action', { token: maya.token, body: { type: 'checkIn', mood: 'great', note: 'Morning!', photo: PHOTO } });
    expect(checked.status).toBe(200);
    const photoUrl = checked.body.feed[0].checkIn.photo as string;
    expect(photoUrl).toMatch(/^\/api\/photos\/k_/);

    const jordanState = await call('/api/state', { token: jordan.token });
    expect(jordanState.body.feed[0].checkIn.note).toBe('Morning!');

    const asJordan = await fetch(base + photoUrl, { headers: { authorization: `Bearer ${jordan.token}` } });
    expect(asJordan.status).toBe(200);
    expect(asJordan.headers.get('content-type')).toBe('image/jpeg');
    const asStranger = await fetch(base + photoUrl, { headers: { authorization: `Bearer ${stranger.token}` } });
    expect(asStranger.status).toBe(404);
  });

  it('returns clean errors', async () => {
    expect((await call('/api/state')).status).toBe(401);
    expect((await call('/api/state', { token: 'nope' })).status).toBe(401);
    const user = await signup('Ana');
    const bad = await call<{ code: string; message: string }>('/api/action', { token: user.token, body: { type: 'addContact', name: 'Mom', phone: '12' } });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/area code/);
    const premium = await call<{ code: string }>('/api/action', { token: user.token, body: { type: 'startMoment', kind: 'run', minutes: 60 } });
    expect(premium.body.code).toBe('premium');
    const raw = await fetch(`${base}/api/action`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${user.token}` }, body: '{oops' });
    expect(raw.status).toBe(400);
    expect((await call('/api/nope')).status).toBe(404);
  });

  it('sends SOS through the notifier and logs texts when Twilio is off', async () => {
    const sam = await signup('Sam', '555-201-0002');
    await call('/api/action', { token: sam.token, body: { type: 'addContact', name: 'Dad', phone: '555-201-0003' } });
    const res = await call('/api/action', { token: sam.token, body: { type: 'sos' } });
    expect(res.body.myAlerts[0].alert.kind).toBe('sos');
    await new Promise((r) => setTimeout(r, 50));
    expect(logs.some((l) => l.includes('[sms -> Dad +15552010003]') && l.includes('SOS'))).toBe(true);
  });

  it('accepts only valid push subscriptions', async () => {
    const user = await signup('Lee');
    const key = await call<{ key: string }>('/api/push/key');
    expect(key.body.key.length).toBeGreaterThan(40);
    const bad = await call('/api/push/subscribe', { token: user.token, body: { endpoint: 'http://evil', keys: {} } });
    expect(bad.status).toBe(400);
    const ok = await call('/api/push/subscribe', { token: user.token, body: { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } } });
    expect(ok.status).toBe(200);
  });

  it('creates an account with a texted code and signs in again on another device', async () => {
    const phone = '555-201-0042';
    const first = await call<{ sentTo: string; devCode: string }>('/api/auth/start', { body: { phone } });
    expect(first.body.sentTo).toBe('(555) 201-0042');
    expect(logs.some((l) => l.includes('is your Sunup code') && l.includes('@sunup.test #'))).toBe(true);

    const wrong = await call<{ code: string }>('/api/auth/verify', { body: { phone, code: first.body.devCode === '000000' ? '111111' : '000000' } });
    expect(wrong.body.code).toBe('code_wrong');

    // Right code, no account yet: the code stays valid until a name is added.
    const noName = await call<{ needsName: boolean }>('/api/auth/verify', { body: { phone, code: first.body.devCode } });
    expect(noName.body.needsName).toBe(true);
    const created = await call<{ token: string; snapshot: Snapshot }>('/api/auth/verify', {
      body: { phone, code: first.body.devCode, name: 'Priya', timezone: 'America/Denver' },
    });
    expect(created.status).toBe(201);
    expect(created.body.snapshot.me).toMatchObject({ name: 'Priya', phone: '+15552010042', phoneVerified: true });

    // The code is used up.
    const reuse = await call<{ code: string }>('/api/auth/verify', { body: { phone, code: first.body.devCode } });
    expect(reuse.body.code).toBe('code_expired');

    // A second device signs in to the same account, and each device signs out on its own.
    const again = await call<{ sentTo: string; devCode: string }>('/api/auth/start', { body: { phone: '+15552010042' } });
    const second = await call<{ token: string; snapshot: Snapshot }>('/api/auth/verify', { body: { phone, code: again.body.devCode } });
    expect(second.body.snapshot.me.id).toBe(created.body.snapshot.me.id);
    expect(second.body.token).not.toBe(created.body.token);
    await call('/api/auth/logout', { token: second.body.token, body: {} });
    expect((await call('/api/state', { token: second.body.token })).status).toBe(401);
    expect((await call('/api/state', { token: created.body.token })).status).toBe(200);
  });

  it('confirms a profile number and keeps each number on one account', async () => {
    const ana = await signup('Ana B');
    await call('/api/action', { token: ana.token, body: { type: 'updateProfile', phone: '555-201-0077' } });
    const sent = await call<{ devCode: string }>('/api/auth/start', { body: { phone: '555-201-0077' } });
    const verified = await call<{ snapshot: Snapshot }>('/api/auth/verify', { token: ana.token, body: { phone: '555-201-0077', code: sent.body.devCode } });
    expect(verified.body.snapshot.me.phoneVerified).toBe(true);

    // Changing the number clears the confirmation.
    const changed = await call('/api/action', { token: ana.token, body: { type: 'updateProfile', phone: '555-201-0078' } });
    expect(changed.body.me.phoneVerified).toBe(false);

    // Someone else can't claim a confirmed number.
    const ben = await signup('Ben');
    await call('/api/action', { token: ben.token, body: { type: 'updateProfile', phone: '555-201-0042' } });
    const benCode = await call<{ devCode: string }>('/api/auth/start', { body: { phone: '555-201-0042' } });
    const taken = await call<{ code: string }>('/api/auth/verify', { token: ben.token, body: { phone: '555-201-0042', code: benCode.body.devCode } });
    expect(taken.body.code).toBe('phone_taken');
  });

  it('limits how fast codes can be requested', async () => {
    await call('/api/auth/start', { body: { phone: '555-201-0099' } });
    const tooSoon = await call<{ code: string }>('/api/auth/start', { body: { phone: '555-201-0099' } });
    expect(tooSoon.status).toBe(429);
  });
});

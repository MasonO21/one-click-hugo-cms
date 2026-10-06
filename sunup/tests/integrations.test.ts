// Twilio and Stripe wiring, with their APIs replaced by a recording fake.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { twilioSignature } from '../server/twilio';
import { createHmac } from 'node:crypto';
import type { Snapshot } from '../src/shared/snapshot';

const PUBLIC = 'https://sunup.test';
const TWILIO = { sid: 'AC123', token: 'twilio-secret', from: '+15550001111' };
const STRIPE = { secretKey: 'sk_test_123', webhookSecret: 'whsec_test', priceMonthly: 'price_month', priceYearly: 'price_year' };

interface Sent {
  url: string;
  body: URLSearchParams;
  method: string;
}

let dir: string;
let server: Server;
let base: string;
let close: () => void;
const sent: Sent[] = [];

let failStripeCancel = false;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const body = new URLSearchParams(String(init?.body ?? ''));
  sent.push({ url, body, method: init?.method ?? 'GET' });
  if (failStripeCancel && init?.method === 'DELETE') return new Response('{}', { status: 500 });
  const reply = url.includes('api.stripe.com') ? { url: `https://stripe.test/${url.split('/v1/')[1]}` } : { sid: 'SM1' };
  return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sunup-int-'));
  const created = createApp({ dataDir: dir, publicUrl: PUBLIC, tickMs: 60_000, twilio: TWILIO, stripe: STRIPE, fetch: fakeFetch, log: () => undefined });
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

async function json<T = Snapshot>(path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function twilioPost(params: Record<string, string>, signature?: string) {
  const res = await fetch(`${base}/api/twilio/sms`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature ?? twilioSignature(TWILIO.token, `${PUBLIC}/api/twilio/sms`, params),
    },
    body: new URLSearchParams(params),
  });
  return { status: res.status, text: await res.text() };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('Twilio', () => {
  it('texts sign-in codes through Twilio and never returns them in the response', async () => {
    const res = await json<{ sentTo: string; devCode?: string }>('/api/auth/start', { phone: '555-201-0500' });
    expect(res.body.devCode).toBeUndefined();
    await settle();
    const sms = sent.find((s) => s.url.endsWith('/Messages.json') && s.body.get('To') === '+15552010500');
    expect(sms?.body.get('From')).toBe(TWILIO.from);
    expect(sms?.body.get('Body')).toMatch(/^\d{6} is your Sunup code/);
  });

  it('records YES and STOP replies from contacts and rejects unsigned webhooks', async () => {
    const signup = await json<{ token: string }>('/api/signup', { name: 'Maya', timezone: 'America/Chicago' });
    await json('/api/action', { type: 'addContact', name: 'Dad', phone: '555-201-0600' }, signup.body.token);
    await settle();
    expect(sent.some((s) => s.body.get('To') === '+15552010600' && s.body.get('Body')?.includes('Reply YES'))).toBe(true);

    const forged = await twilioPost({ From: '+15552010600', Body: 'STOP' }, 'not-a-signature');
    expect(forged.status).toBe(403);

    const yes = await twilioPost({ From: '+15552010600', Body: 'Yes', MessageSid: 'SM9' });
    expect(yes.text).toContain('<Message>Thank you.');
    let state = await json('/api/state', undefined, signup.body.token);
    expect(state.body.watchers[0].consent).toBe('confirmed');

    const stop = await twilioPost({ From: '+15552010600', Body: 'STOP' });
    expect(stop.text).toBe('<Response/>');
    state = await json('/api/state', undefined, signup.body.token);
    expect(state.body.watchers[0].consent).toBe('stopped');
  });
});

function stripeEvent(event: unknown, secret = STRIPE.webhookSecret, t = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify(event);
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return fetch(`${base}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body: payload,
  });
}

describe('Stripe', () => {
  it('starts Checkout with a trial, then follows the subscription through the webhook', async () => {
    const health = await json<{ billing: boolean }>('/api/health');
    expect(health.body.billing).toBe(true);

    const user = await json<{ token: string; snapshot: Snapshot }>('/api/signup', { name: 'Lena', timezone: 'Europe/Berlin' });
    const userId = user.body.snapshot.me.id;
    const checkout = await json<{ url: string }>('/api/billing/checkout', { interval: 'year' }, user.body.token);
    expect(checkout.body.url).toBe('https://stripe.test/checkout/sessions');
    const req = sent.find((s) => s.url.endsWith('/checkout/sessions'))!;
    expect(req.body.get('line_items[0][price]')).toBe('price_year');
    expect(req.body.get('subscription_data[trial_period_days]')).toBe('7');
    expect(req.body.get('client_reference_id')).toBe(userId);
    expect(req.body.get('success_url')).toBe(`${PUBLIC}/?billing=success#you`);

    // Forged and stale events are refused.
    expect((await stripeEvent({ type: 'checkout.session.completed' }, 'whsec_wrong')).status).toBe(403);
    expect((await stripeEvent({ type: 'checkout.session.completed' }, STRIPE.webhookSecret, 1_000)).status).toBe(403);

    const done = await stripeEvent({ type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: 'cus_1', subscription: 'sub_1' } } });
    expect(done.status).toBe(200);
    let state = await json('/api/state', undefined, user.body.token);
    expect(state.body.limits.premium).toBe(true);
    expect(state.body.me.billing).toMatchObject({ customerId: 'cus_1', subscriptionId: 'sub_1' });

    await stripeEvent({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'trialing', cancel_at_period_end: true, items: { data: [{ current_period_end: 1_900_000_000 }] } } },
    });
    state = await json('/api/state', undefined, user.body.token);
    expect(state.body.me.billing).toMatchObject({ status: 'trialing', cancelAtPeriodEnd: true, periodEnd: 1_900_000_000_000 });

    const portal = await json<{ url: string }>('/api/billing/portal', {}, user.body.token);
    expect(portal.body.url).toBe('https://stripe.test/billing_portal/sessions');

    await stripeEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } } });
    state = await json('/api/state', undefined, user.body.token);
    expect(state.body.limits.premium).toBe(false);

    // The trial is used up, so the next checkout has none.
    sent.length = 0;
    await json('/api/billing/checkout', { interval: 'month' }, user.body.token);
    const second = sent.find((s) => s.url.endsWith('/checkout/sessions'))!;
    expect(second.body.get('subscription_data[trial_period_days]')).toBeNull();
    expect(second.body.get('customer')).toBe('cus_1');
    expect(second.body.get('line_items[0][price]')).toBe('price_month');
  });
});

describe('Stripe event order', () => {
  it('ignores late or stale events and starts a new subscription fresh', async () => {
    const user = await json<{ token: string; snapshot: Snapshot }>('/api/signup', { name: 'Ivo', timezone: 'America/Chicago' });
    const userId = user.body.snapshot.me.id;
    const premium = async () => (await json('/api/state', undefined, user.body.token)).body.limits.premium;
    await stripeEvent({ type: 'checkout.session.completed', created: 100, data: { object: { client_reference_id: userId, customer: 'cus_o', subscription: 'sub_a' } } });
    await stripeEvent({ type: 'customer.subscription.deleted', created: 300, data: { object: { id: 'sub_a', customer: 'cus_o', status: 'canceled' } } });
    // A retry of an older "active" update arrives after the cancellation: still canceled.
    await stripeEvent({ type: 'customer.subscription.updated', created: 200, data: { object: { id: 'sub_a', customer: 'cus_o', status: 'active' } } });
    expect(await premium()).toBe(false);

    // They subscribe again: the old "canceled" status must not stick to the new subscription.
    await stripeEvent({ type: 'checkout.session.completed', created: 400, data: { object: { client_reference_id: userId, customer: 'cus_o', subscription: 'sub_b' } } });
    expect(await premium()).toBe(true);
    // A late event about the old subscription changes nothing.
    await stripeEvent({ type: 'customer.subscription.deleted', created: 500, data: { object: { id: 'sub_a', customer: 'cus_o', status: 'canceled' } } });
    expect(await premium()).toBe(true);
  });
});

describe('account deletion', () => {
  it('cancels the subscription before erasing the account, and refuses to erase if that fails', async () => {
    const user = await json<{ token: string; snapshot: Snapshot }>('/api/signup', { name: 'Noor', timezone: 'America/Chicago' });
    const userId = user.body.snapshot.me.id;
    await stripeEvent({ type: 'checkout.session.completed', data: { object: { client_reference_id: userId, customer: 'cus_9', subscription: 'sub_9' } } });

    failStripeCancel = true;
    const blocked = await json<{ code: string }>('/api/account/delete', { confirm: true }, user.body.token);
    expect(blocked.body.code).toBe('billing');
    expect((await json('/api/state', undefined, user.body.token)).status).toBe(200);

    failStripeCancel = false;
    const exported = await fetch(`${base}/api/export`, { headers: { authorization: `Bearer ${user.body.token}` } });
    expect(exported.headers.get('content-disposition')).toContain('sunup-my-data.json');
    expect(((await exported.json()) as { account: { name: string } }).account.name).toBe('Noor');

    const deleted = await json<{ ok: boolean }>('/api/account/delete', { confirm: true }, user.body.token);
    expect(deleted.body.ok).toBe(true);
    expect(sent.some((s) => s.method === 'DELETE' && s.url.endsWith('/v1/subscriptions/sub_9'))).toBe(true);
    expect((await json('/api/state', undefined, user.body.token)).status).toBe(401);
  });
});

// Stripe subscriptions without the SDK: Checkout for sign-up, the customer portal for
// changes, and a signed webhook that keeps each user's plan in sync.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Sunup } from '../src/shared/service';
import { TRIAL_DAYS } from '../src/shared/plans';
import type { User } from '../src/shared/types';
import { SunupError } from '../src/shared/util';

export interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  priceMonthly?: string;
  priceYearly?: string;
}

export function stripeEnabled(cfg: StripeConfig | undefined): cfg is Required<StripeConfig> {
  return !!(cfg?.secretKey && cfg.webhookSecret && cfg.priceMonthly && cfg.priceYearly);
}

async function stripePost(cfg: Required<StripeConfig>, http: typeof fetch, path: string, params: Record<string, string>) {
  const res = await http(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!res.ok || !body.url) throw new Error(`Stripe ${path} ${res.status}: ${body.error?.message ?? 'no url'}`);
  return body.url;
}

/** A hosted Checkout page for a monthly or yearly subscription, with a free trial if one is unused. */
export function createCheckout(cfg: Required<StripeConfig>, http: typeof fetch, user: User, interval: 'month' | 'year', publicUrl: string): Promise<string> {
  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': interval === 'year' ? cfg.priceYearly : cfg.priceMonthly,
    'line_items[0][quantity]': '1',
    success_url: `${publicUrl}/?billing=success#you`,
    cancel_url: `${publicUrl}/#you`,
    client_reference_id: user.id,
    'metadata[userId]': user.id,
    'subscription_data[metadata][userId]': user.id,
    allow_promotion_codes: 'true',
  };
  if (!user.trialEndsAt) params['subscription_data[trial_period_days]'] = String(TRIAL_DAYS);
  if (user.billing?.customerId) params.customer = user.billing.customerId;
  return stripePost(cfg, http, 'checkout/sessions', params);
}

export function createPortal(cfg: Required<StripeConfig>, http: typeof fetch, customerId: string, publicUrl: string): Promise<string> {
  return stripePost(cfg, http, 'billing_portal/sessions', { customer: customerId, return_url: `${publicUrl}/#you` });
}

/** Cancels a subscription right away (used when someone deletes their account). */
export async function cancelSubscription(cfg: Required<StripeConfig>, http: typeof fetch, subscriptionId: string): Promise<void> {
  const res = await http(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${cfg.secretKey}` },
  });
  // 404: already gone.
  if (!res.ok && res.status !== 404) throw new Error(`Stripe cancel ${res.status}`);
}

/** Checks the Stripe-Signature header: HMAC-SHA256 of `${t}.${payload}`, within five minutes. */
export function stripeSignatureValid(payload: string, header: string | undefined, secret: string, now: number, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec || signatures.length === 0) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex'));
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata?: { userId?: string };
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  trial_end?: number | null;
  items?: { data?: { current_period_end?: number }[] };
}

interface StripeEvent {
  type: string;
  /** Unix seconds. Stripe doesn't guarantee delivery order, so this decides which event wins. */
  created?: number;
  data: { object: Record<string, unknown> };
}

/** Applies one webhook event. Returns true if it changed a user. */
export function applyStripeEvent(service: Sunup, event: StripeEvent, now: number): boolean {
  const obj = event.data?.object ?? {};
  const created = event.created ?? Math.floor(now / 1000);
  if (event.type === 'checkout.session.completed') {
    const userId = (obj.client_reference_id as string) ?? (obj.metadata as { userId?: string })?.userId;
    const user = userId ? service.state.users[userId] : undefined;
    if (!user) return false;
    const subscriptionId = obj.subscription as string;
    const isNew = user.billing?.subscriptionId !== subscriptionId;
    service.applyBilling(
      user.id,
      // A new subscription starts fresh: an old one's "canceled" status must not carry over.
      { customerId: obj.customer as string, subscriptionId, ...(isNew ? { status: undefined, cancelAtPeriodEnd: false, periodEnd: undefined } : {}), eventAt: created },
      now,
    );
    // The subscription events carry the exact status; until one arrives, a finished checkout means Premium.
    if (!user.billing?.status) service.setPlan(user.id, 'premium');
    return true;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const sub = obj as unknown as StripeSubscription;
    const user = (sub.metadata?.userId && service.state.users[sub.metadata.userId]) || service.userByCustomerId(sub.customer);
    if (!user) return false;
    // Ignore events about an older subscription, and events older than the last one applied.
    if (user.billing?.subscriptionId && user.billing.subscriptionId !== sub.id) return false;
    if (user.billing?.eventAt && created < user.billing.eventAt) return false;
    const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? sub.trial_end ?? undefined;
    service.applyBilling(
      user.id,
      {
        customerId: sub.customer,
        subscriptionId: sub.id,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        periodEnd: periodEnd ? periodEnd * 1000 : undefined,
        eventAt: created,
      },
      now,
    );
    return true;
  }
  return false;
}

export function requireStripe(cfg: StripeConfig | undefined): Required<StripeConfig> {
  if (!stripeEnabled(cfg)) throw new SunupError('not_found', 'Payments aren\'t set up on this server.');
  return cfg;
}

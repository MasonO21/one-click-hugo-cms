// Delivers outbound messages: web push to app users, texts and calls through Twilio.
// Without Twilio credentials, texts and calls are logged instead of sent.

import webpush from 'web-push';
import type { Outbound } from '../src/shared/types';
import type { Store } from './store';

export interface NotifierConfig {
  twilioSid?: string;
  twilioToken?: string;
  twilioFrom?: string;
  vapidSubject: string;
  log?: (line: string) => void;
  /** Swappable for tests. */
  fetch?: typeof fetch;
}

export interface Notifier {
  deliver(messages: Outbound[]): Promise<void>;
  /** A one-off text outside the alert flow (sign-in codes, replies). */
  text(phone: string, body: string): Promise<void>;
  readonly twilio: boolean;
}

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export function createNotifier(store: Store, config: NotifierConfig): Notifier {
  const log = config.log ?? ((line: string) => console.log(line));
  const twilio = !!(config.twilioSid && config.twilioToken && config.twilioFrom);
  const http = config.fetch ?? fetch;
  webpush.setVapidDetails(config.vapidSubject, store.vapid.publicKey, store.vapid.privateKey);

  async function twilioPost(resource: 'Messages' | 'Calls', params: Record<string, string>) {
    const res = await http(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioSid}/${resource}.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${config.twilioSid}:${config.twilioToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: config.twilioFrom!, ...params }),
    });
    if (!res.ok) throw new Error(`Twilio ${resource} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  async function push(o: Outbound) {
    const payload = JSON.stringify({
      title: o.title,
      body: o.body,
      urgent: o.urgent,
      link: o.link,
      action: o.action,
      // The worker only acts on a notification's button for the account it belongs to.
      userId: o.to.id,
      // One notification per alert (or per day's reminder) that updates in place.
      tag: o.alertId ?? (o.kind === 'reminder' ? 'sunup-reminder' : o.id),
    });
    for (const sub of store.subscriptions(o.to.id)) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: o.urgent ? 'high' : 'normal' });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) store.removeSubscription(o.to.id, sub.endpoint);
        else log(`[push] failed for ${o.to.id}: ${String(e)}`);
      }
    }
  }

  async function deliverOne(o: Outbound) {
    if (o.channel === 'push') return push(o);
    if (!o.to.phone) return;
    if (!twilio) {
      log(`[${o.channel} -> ${o.to.name} ${o.to.phone}] ${o.body}`);
      return;
    }
    if (o.channel === 'sms') {
      await twilioPost('Messages', { To: o.to.phone, Body: o.body.slice(0, 1500) });
    } else {
      const say = `<Say voice="Polly.Joanna">${escapeXml(o.body)}</Say>`;
      await twilioPost('Calls', { To: o.to.phone, Twiml: `<Response>${say}<Pause length="1"/>${say}</Response>` });
    }
  }

  return {
    twilio,
    async text(phone, body) {
      if (!twilio) {
        log(`[sms -> ${phone}] ${body}`);
        return;
      }
      await twilioPost('Messages', { To: phone, Body: body });
    },
    async deliver(messages) {
      // Each message is independent: one failure must never block an alert to someone else.
      const results = await Promise.allSettled(messages.map(deliverOne));
      results.forEach((r, i) => {
        if (r.status === 'rejected') log(`[deliver] ${messages[i].channel} to ${messages[i].to.name} failed: ${String(r.reason)}`);
      });
    },
  };
}

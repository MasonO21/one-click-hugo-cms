// Delivers outbound messages: web push to app users, texts and calls through Twilio.
// Without Twilio credentials, texts and calls are logged instead of sent.

import webpush from 'web-push';
import type { Outbound } from '../src/shared/types';
import type { Store } from './store';
import { Apns, Fcm, type ApnsConfig, type FcmConfig, type SendResult } from './native-push';

export interface NotifierConfig {
  twilioSid?: string;
  twilioToken?: string;
  twilioFrom?: string;
  vapidSubject: string;
  log?: (line: string) => void;
  /** Swappable for tests. */
  fetch?: typeof fetch;
  /** Android push (Firebase service account). */
  fcm?: FcmConfig;
  /** Waits before retrying a text or call that failed for a temporary reason. */
  retryDelays?: number[];
  /** Whether a message is still worth sending on a retry (e.g. its alert hasn't been resolved). */
  stillWanted?: (message: Outbound) => boolean;
  /** iPhone push (APNs .p8 key). */
  apns?: ApnsConfig;
}

export interface Notifier {
  deliver(messages: Outbound[]): Promise<void>;
  /** A one-off text outside the alert flow (sign-in codes, replies). */
  text(phone: string, body: string): Promise<void>;
  readonly twilio: boolean;
  readonly native: { android: boolean; ios: boolean };
  close(): void;
}

type DeliveryError = Error & { retryable?: boolean };

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export function createNotifier(store: Store, config: NotifierConfig): Notifier {
  const log = config.log ?? ((line: string) => console.log(line));
  const twilio = !!(config.twilioSid && config.twilioToken && config.twilioFrom);
  const http = config.fetch ?? fetch;
  const fcm = config.fcm ? new Fcm(config.fcm, http) : null;
  const apns = config.apns ? new Apns(config.apns) : null;
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
    if (!res.ok) {
      const error = new Error(`Twilio ${resource} ${res.status}: ${(await res.text()).slice(0, 200)}`) as DeliveryError;
      // A bad or opted-out number won't work on a second try; an outage or rate limit might.
      error.retryable = res.status === 429 || res.status >= 500;
      throw error;
    }
  }

  async function push(o: Outbound) {
    const tag = o.alertId ?? (o.kind === 'reminder' ? 'sunup-reminder' : o.id);
    // The iOS and Android apps.
    for (const device of store.nativeDevices(o.to.id)) {
      const sender = device.platform === 'ios' ? apns : fcm;
      if (!sender) continue;
      let result: SendResult;
      try {
        result = await sender.send(device.token, { title: o.title, body: o.body, urgent: o.urgent, link: o.link, action: o.action, userId: o.to.id, tag });
      } catch (e) {
        log(`[push] ${device.platform} failed for ${o.to.id}: ${String(e)}`);
        continue;
      }
      if (result === 'gone') store.removeNativeDevice(o.to.id, device.token);
      else if (result === 'error') log(`[push] ${device.platform} delivery failed for ${o.to.id}`);
    }
    // Browsers.
    const payload = JSON.stringify({
      title: o.title,
      body: o.body,
      urgent: o.urgent,
      link: o.link,
      action: o.action,
      // The worker only acts on a notification's button for the account it belongs to.
      userId: o.to.id,
      // One notification per alert (or per day's reminder) that updates in place.
      tag,
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
      log(`[${o.channel} -> ${o.to.name} ${o.to.phone}] ${o.sensitive ? `${o.title} (${o.body.length} characters, not logged)` : o.body}`);
      return;
    }
    if (o.channel === 'sms') {
      await twilioPost('Messages', { To: o.to.phone, Body: o.body.slice(0, 1500) });
    } else {
      const say = `<Say voice="Polly.Joanna">${escapeXml(o.body)}</Say>`;
      await twilioPost('Calls', { To: o.to.phone, Twiml: `<Response>${say}<Pause length="1"/>${say}</Response>` });
    }
  }

  const retryDelays = config.retryDelays ?? [30_000, 2 * 60_000, 10 * 60_000];
  const retries = new Set<NodeJS.Timeout>();

  /** Texts and calls that fail for a temporary reason are tried again, unless the alert is over. */
  async function deliverWithRetry(o: Outbound, attempt: number): Promise<void> {
    if (attempt > 0 && config.stillWanted && !config.stillWanted(o)) return;
    try {
      await deliverOne(o);
    } catch (e) {
      const wait = retryDelays[attempt];
      const retry = wait !== undefined && (e as DeliveryError).retryable !== false;
      log(`[deliver] ${o.channel} to ${o.to.name} failed${retry ? `, trying again in ${Math.round(wait / 1000)}s` : ''}: ${String(e)}`);
      if (!retry) return;
      const timer = setTimeout(() => {
        retries.delete(timer);
        void deliverWithRetry(o, attempt + 1);
      }, wait);
      timer.unref?.();
      retries.add(timer);
    }
  }

  return {
    twilio,
    native: { android: !!fcm, ios: !!apns },
    close() {
      apns?.close();
      for (const timer of retries) clearTimeout(timer);
      retries.clear();
    },
    async text(phone, body) {
      if (!twilio) {
        log(`[sms -> ${phone}] ${body}`);
        return;
      }
      await twilioPost('Messages', { To: phone, Body: body });
    },
    async deliver(messages) {
      // Each message is independent: one failure must never block an alert to someone else.
      await Promise.all(messages.map((o) => deliverWithRetry(o, 0)));
    },
  };
}

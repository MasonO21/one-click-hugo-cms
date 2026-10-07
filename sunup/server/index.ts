import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { decodeSecret, parseServiceAccount } from './native-push';

const port = Number(process.env.PORT ?? 8787);
const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.NODE_ENV === 'production' ? port : 5173}`).replace(/\/$/, '');

const { app, close } = createApp({
  dataDir: process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url)),
  publicUrl,
  staticDir: fileURLToPath(new URL('../dist', import.meta.url)),
  twilio: { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, from: process.env.TWILIO_FROM },
  vapidSubject: process.env.VAPID_SUBJECT,
  // Sign-in codes on screen are only for local development, never a deployed server.
  devCodes: process.env.NODE_ENV === 'development',
  dataKey: process.env.SUNUP_DATA_KEY,
  fcm: parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT),
  apns:
    process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID
      ? {
          key: decodeSecret(process.env.APNS_KEY)!,
          keyId: process.env.APNS_KEY_ID,
          teamId: process.env.APNS_TEAM_ID,
          bundleId: process.env.APNS_BUNDLE_ID,
          production: process.env.APNS_ENV !== 'development',
        }
      : undefined,
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceMonthly: process.env.STRIPE_PRICE_MONTHLY,
    priceYearly: process.env.STRIPE_PRICE_YEARLY,
  },
  appLinks: {
    iosAppId: process.env.IOS_APP_ID,
    androidPackage: process.env.ANDROID_PACKAGE,
    androidSha256: process.env.ANDROID_CERT_SHA256?.split(',').map((v) => v.trim()).filter(Boolean),
  },
});

const server = app.listen(port, () => {
  console.log(`Sunup server on http://localhost:${port} (public URL ${publicUrl})`);
  if (!process.env.TWILIO_ACCOUNT_SID) console.log('Twilio not configured: texts and calls are logged here instead of sent.');
  if (!process.env.STRIPE_SECRET_KEY) console.log('Stripe not configured: Premium uses the card-free trial only.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    close();
    server.close(() => process.exit(0));
  });
}

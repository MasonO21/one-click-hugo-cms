import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.NODE_ENV === 'production' ? port : 5173}`).replace(/\/$/, '');

const { app, close } = createApp({
  dataDir: process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url)),
  publicUrl,
  staticDir: fileURLToPath(new URL('../dist', import.meta.url)),
  twilio: { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, from: process.env.TWILIO_FROM },
  vapidSubject: process.env.VAPID_SUBJECT,
});

const server = app.listen(port, () => {
  console.log(`Sunup server on http://localhost:${port} (public URL ${publicUrl})`);
  if (!process.env.TWILIO_ACCOUNT_SID) console.log('Twilio not configured: texts and calls are logged here instead of sent.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    close();
    server.close(() => process.exit(0));
  });
}

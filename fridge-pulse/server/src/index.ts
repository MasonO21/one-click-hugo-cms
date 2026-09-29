import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app.js';
import { createOpenChecker, createRevenueCatChecker } from './auth.js';
import { createClaude } from './claude.js';
import { loadConfig } from './config.js';

const config = loadConfig();

if (config.allowUnauthenticated) {
  console.warn('WARNING: ALLOW_UNAUTHENTICATED=true. Subscription checks are OFF. Never run this in production.');
}

const app = createApp({
  config,
  claude: createClaude({ model: config.model, scanEffort: config.scanEffort, mealsEffort: config.mealsEffort }),
  entitlements: config.revenueCatSecretKey
    ? createRevenueCatChecker({ secretKey: config.revenueCatSecretKey, entitlementId: config.entitlementId })
    : createOpenChecker(),
  clientIp: (c) => {
    if (config.trustProxy) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  },
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Fridge Pulse server listening on :${info.port} (model ${config.model})`);
});

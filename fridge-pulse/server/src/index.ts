import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app.js';
import { createOpenChecker, createRevenueCatChecker } from './auth.js';
import { createClaude } from './claude.js';
import { loadConfig } from './config.js';
import { createBarcodeLookup } from './barcode.js';
import { createHouseholdStore } from './household.js';
import { createPictureFinder } from './pictures.js';

const config = loadConfig();

if (config.allowUnauthenticated) {
  console.warn('WARNING: ALLOW_UNAUTHENTICATED=true. Subscription checks are OFF. Never run this in production.');
}

const households = config.householdDb ? createHouseholdStore(config.householdDb) : undefined;

const app = createApp({
  config,
  claude: createClaude({ model: config.model, scanEffort: config.scanEffort, mealsEffort: config.mealsEffort, identifyEffort: config.identifyEffort }),
  pictures: createPictureFinder({ userAgent: config.pictureUserAgent, offBaseUrl: config.offBaseUrl, wikiBaseUrl: config.wikiBaseUrl }),
  households,
  barcodes: createBarcodeLookup({ userAgent: config.pictureUserAgent, offBaseUrl: config.offBaseUrl }),
  entitlements: config.revenueCatSecretKey
    ? createRevenueCatChecker({ secretKey: config.revenueCatSecretKey, entitlementId: config.entitlementId, householdEntitlementId: config.householdEntitlementId })
    : createOpenChecker(),
  clientIp: (c) => {
    if (config.clientIpHeader) {
      const ip = c.req.header(config.clientIpHeader)?.trim();
      if (ip) return ip;
    }
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

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Fridge Pulse server listening on :${info.port} (model ${config.model})`);
});

// A redeploy sends SIGTERM: finish what is in flight and close the database cleanly. In a container
// the server is process 1, which gets no default signal handling, so without this it is killed late.
function shutDown(signal: string) {
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(0), 10_000).unref();
  server.close(() => {
    households?.close();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutDown('SIGTERM'));
process.on('SIGINT', () => shutDown('SIGINT'));

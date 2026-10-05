import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { BarcodeUnavailable, categoryFromTags, createBarcodeLookup, isValidGtin, toProduct, type BarcodeLookup } from '../src/barcode.js';
import type { ClaudeService } from '../src/claude.js';

const OFF = 'https://world.openfoodfacts.org';

describe('barcodes', () => {
  it('accepts only real product barcodes, by their check digit', () => {
    assert.equal(isValidGtin('4006381333931'), true); // EAN-13
    assert.equal(isValidGtin('036000291452'), true); // UPC-A
    assert.equal(isValidGtin('73513537'), true); // EAN-8
    assert.equal(isValidGtin('4006381333932'), false);
    assert.equal(isValidGtin('12345'), false);
    assert.equal(isValidGtin('400638133393a'), false);
  });

  it('files Open Food Facts categories in the app’s, most specific first', () => {
    assert.equal(categoryFromTags(['en:dairies', 'en:fermented-milk-products', 'en:yogurts']), 'dairy');
    assert.equal(categoryFromTags(['en:plant-based-foods-and-beverages', 'en:beverages', 'en:plant-based-milks']), 'drinks');
    assert.equal(categoryFromTags(['en:plant-based-foods', 'en:vegetables', 'en:canned-foods', 'en:canned-vegetables']), 'canned');
    assert.equal(categoryFromTags(['en:beverages', 'en:juices', 'en:fruits']), 'drinks');
    assert.equal(categoryFromTags(['en:frozen-foods', 'en:vegetables']), 'produce');
    assert.equal(categoryFromTags(['en:something-else']), null);
    assert.equal(categoryFromTags('en:dairies'), null);
  });

  it('keeps what the app needs, and pictures only from the allowed hosts', () => {
    const p = toProduct(
      '4006381333931',
      {
        product_name: '  Total   0% Greek Yogurt ',
        brands: 'Fage, Fage International',
        quantity: '500 g',
        categories_tags: ['en:dairies', 'en:yogurts'],
        image_front_small_url: 'https://images.openfoodfacts.org/images/products/400/front.200.jpg',
      },
      OFF,
    );
    assert.deepEqual(p, {
      code: '4006381333931',
      name: 'Total 0% Greek Yogurt',
      brand: 'Fage',
      quantity: '500 g',
      category: 'dairy',
      frozen: false,
      picture: { url: 'https://images.openfoodfacts.org/images/products/400/front.200.jpg', credit: 'Open Food Facts', pageUrl: `${OFF}/product/4006381333931` },
    });
    const frozen = toProduct('036000291452', { generic_name: 'Garden peas', categories_tags: ['en:frozen-foods', 'en:vegetables'], image_front_url: 'https://evil.example/peas.jpg' }, OFF);
    assert.equal(frozen?.name, 'Garden peas');
    assert.equal(frozen?.frozen, true);
    assert.equal(frozen?.picture, null);
    assert.equal(toProduct('036000291452', { brands: 'Nameless' }, OFF), null);
  });

  it('asks Open Food Facts once, remembers "not found", and tells a failure from a miss', async () => {
    const calls: { url: string; agent: string | null }[] = [];
    let answer: () => Response = () => new Response(JSON.stringify({ status: 1, product: { product_name: 'Oat drink', categories_tags: ['en:beverages'] } }));
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, agent: new Headers(init?.headers).get('user-agent') });
      return answer();
    }) as unknown as typeof fetch;
    const lookup = createBarcodeLookup({ userAgent: 'FridgePulseTest/1.0 (test@example.com)', fetchImpl });
    assert.equal((await lookup.find('4006381333931'))?.name, 'Oat drink');
    await lookup.find('4006381333931');
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/api\/v2\/product\/4006381333931\?fields=/);
    assert.equal(calls[0]!.agent, 'FridgePulseTest/1.0 (test@example.com)');

    answer = () => new Response(JSON.stringify({ status: 0, status_verbose: 'product not found' }), { status: 404 });
    assert.equal(await lookup.find('036000291452'), null);
    await lookup.find('036000291452');
    assert.equal(calls.length, 2);

    answer = () => new Response('busy', { status: 503 });
    await assert.rejects(lookup.find('73513537'), BarcodeUnavailable);
    answer = () => {
      throw new Error('network down');
    };
    await assert.rejects(lookup.find('73513537'), BarcodeUnavailable);
    // Failures are not remembered: the next try asks again.
    answer = () => new Response(JSON.stringify({ status: 1, product: { product_name: 'Bread' } }));
    assert.equal((await lookup.find('73513537'))?.name, 'Bread');
  });
});

describe('barcode endpoint', () => {
  const claude: ClaudeService = { scan: async () => ({ items: [], purchaseDate: null, currency: null, notes: null }), meals: async () => ({ meals: [] }), identify: async () => ({ candidates: [] }) };
  const config = { scansPerDay: 3, mealsPerDay: 3, identifiesPerDay: 3, barcodesPerDay: 3, corsOrigin: null };
  const call = (app: ReturnType<typeof createApp>, code: unknown) =>
    app.request('/v1/barcode', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer $RCAnonymousID:aaaaaaaaaaaaaaaa' }, body: JSON.stringify({ code }) });
  const found: BarcodeLookup = { find: async (code) => ({ code, name: 'Oat drink', brand: null, quantity: '1 L', category: 'drinks', frozen: false, picture: null }) };

  it('answers with the product, or null when it is not known', async () => {
    const app = createApp({ config, claude, entitlements: { isActive: async () => true }, barcodes: found });
    assert.deepEqual(await (await call(app, '4006381333931')).json(), { product: { code: '4006381333931', name: 'Oat drink', brand: null, quantity: '1 L', category: 'drinks', frozen: false, picture: null } });
    const none = createApp({ config, claude, entitlements: { isActive: async () => true }, barcodes: { find: async () => null } });
    assert.deepEqual(await (await call(none, '4006381333931')).json(), { product: null });
  });

  it('refuses what is not a barcode, needs a plan, and says when it cannot look one up', async () => {
    const app = createApp({ config, claude, entitlements: { isActive: async () => true }, barcodes: found });
    assert.equal((await call(app, '4006381333932')).status, 400);
    assert.equal((await call(app, 'milk')).status, 400);
    const locked = createApp({ config, claude, entitlements: { isActive: async () => false }, barcodes: found });
    assert.equal((await call(locked, '4006381333931')).status, 402);
    const down = createApp({
      config,
      claude,
      entitlements: { isActive: async () => true },
      barcodes: {
        find: async () => {
          throw new BarcodeUnavailable();
        },
      },
    });
    assert.equal((await call(down, '4006381333931')).status, 503);
    const off = createApp({ config, claude, entitlements: { isActive: async () => true } });
    assert.equal((await call(off, '4006381333931')).status, 503);
  });

  it('caps lookups per person per day', async () => {
    const app = createApp({ config, claude, entitlements: { isActive: async () => true }, barcodes: found });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await call(app, '4006381333931')).status);
    assert.deepEqual(statuses, [200, 200, 200, 429]);
  });
});

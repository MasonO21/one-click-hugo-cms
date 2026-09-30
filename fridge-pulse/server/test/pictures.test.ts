import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_CANDIDATES, tidyCandidates, withPictures } from '../src/identify.js';
import { createPictureFinder, isAllowedPicture, productMatch } from '../src/pictures.js';
import type { ReportedCandidate } from '../src/schemas.js';

const OFF = 'https://off.test';
const WIKI = 'https://wiki.test';

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const headers = new Headers(init?.headers);
    assert.match(headers.get('User-Agent') ?? '', /FridgePulse/);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    const body = routes[key];
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const finder = (routes: Record<string, unknown>, calls?: string[]) =>
  createPictureFinder({ userAgent: 'FridgePulse/test', offBaseUrl: OFF, wikiBaseUrl: WIKI, fetchImpl: fakeFetch(routes, calls) });

const base: Pick<ReportedCandidate, 'name' | 'brand' | 'product' | 'barcode' | 'kind' | 'wikipediaTitle'> = {
  name: 'Gochujang',
  brand: 'Chung Jung One',
  product: 'Gochujang Hot Pepper Paste',
  barcode: null,
  kind: 'packaged',
  wikipediaTitle: 'Gochujang',
};

const offImg = (code: string) => `https://images.openfoodfacts.org/images/products/${code}/front_en.400.jpg`;

describe('picture hosts', () => {
  it('only allows https pictures from the two food databases', () => {
    assert.ok(isAllowedPicture('https://images.openfoodfacts.org/a.jpg'));
    assert.ok(isAllowedPicture('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/X.jpg/320px-X.jpg'));
    assert.ok(!isAllowedPicture('http://images.openfoodfacts.org/a.jpg'));
    assert.ok(!isAllowedPicture('https://evil.example/a.jpg'));
    assert.ok(!isAllowedPicture('https://images.openfoodfacts.org.evil.example/a.jpg'));
    assert.ok(!isAllowedPicture('javascript:alert(1)'));
    assert.ok(!isAllowedPicture(42));
  });
});

describe('productMatch', () => {
  it('needs the brand and most of the product words', () => {
    assert.equal(productMatch(base, { brands: 'Chung Jung One, Daesang', product_name: 'Gochujang Hot Pepper Paste 500g' }), 1);
    assert.equal(productMatch(base, { brands: 'Other Brand', product_name: 'Gochujang Hot Pepper Paste' }), 0);
    assert.ok(productMatch(base, { brands: 'Chung Jung One', product_name: 'Soybean Paste' }) < 0.5);
    // Accents and case do not matter.
    assert.equal(productMatch({ name: 'Crème fraîche', brand: null, product: null }, { product_name: 'CREME FRAICHE épaisse' }), 1);
  });
});

describe('createPictureFinder', () => {
  it('uses the barcode first', async () => {
    const calls: string[] = [];
    const pic = await finder({ [`${OFF}/api/v2/product/8801052040011`]: { status: 1, product: { code: '8801052040011', image_front_url: offImg('880') } } }, calls).find({
      ...base,
      barcode: '8801052040011',
    });
    assert.deepEqual(pic, { url: offImg('880'), credit: 'Open Food Facts', pageUrl: `${OFF}/product/8801052040011` });
    assert.equal(calls.length, 1);
  });

  it('searches Open Food Facts for packaged food and picks the best matching product with a picture', async () => {
    const pic = await finder({
      [`${OFF}/cgi/search.pl`]: {
        products: [
          { code: '11111111', brands: 'Other', product_name: 'Gochujang Hot Pepper Paste', image_front_url: offImg('111') },
          { code: '22222222', brands: 'Chung Jung One', product_name: 'Gochujang Hot Pepper Paste', image_front_url: 'https://evil.example/x.jpg' },
          { code: '33333333', brands: 'Chung Jung One', product_name: 'Gochujang Hot Pepper Paste 1kg', image_front_url: offImg('333') },
        ],
      },
    }).find(base);
    assert.equal(pic?.url, offImg('333'));
  });

  it('falls back to Wikipedia when no product matches, and only accepts a real article with an allowed picture', async () => {
    const wikiPic = 'https://upload.wikimedia.org/wikipedia/commons/thumb/g/g1/Gochujang.jpg/320px-Gochujang.jpg';
    const pic = await finder({
      [`${OFF}/cgi/search.pl`]: { products: [{ code: '11111111', brands: 'Other', product_name: 'Ketchup', image_front_url: offImg('111') }] },
      [`${WIKI}/api/rest_v1/page/summary/Gochujang`]: { type: 'standard', thumbnail: { source: wikiPic }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Gochujang' } } },
    }).find(base);
    assert.deepEqual(pic, { url: wikiPic, credit: 'Wikipedia', pageUrl: 'https://en.wikipedia.org/wiki/Gochujang' });

    const none = await finder({
      [`${WIKI}/api/rest_v1/page/summary/Gochujang`]: { type: 'disambiguation', thumbnail: { source: wikiPic } },
    }).find({ ...base, kind: 'fresh' });
    assert.equal(none, null);
  });

  it('never throws: network errors and bad JSON give no picture', async () => {
    const pic = await finder({ [`${OFF}`]: new Error('offline'), [`${WIKI}`]: new Error('offline') }).find({ ...base, barcode: '12345678' });
    assert.equal(pic, null);
  });

  it('does not keep a failure for long', async () => {
    const calls: string[] = [];
    let now = 1_000_000;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const f = finder({ [`${WIKI}`]: new Error('offline') }, calls);
      const fresh = { name: 'Rambutan', brand: null, product: null, barcode: null, kind: 'fresh' as const, wikipediaTitle: 'Rambutan' };
      await f.find(fresh);
      await f.find(fresh);
      assert.equal(calls.length, 1);
      now += 6 * 60 * 1000;
      await f.find(fresh);
      assert.equal(calls.length, 2);
    } finally {
      Date.now = realNow;
    }
  });

  it('caches lookups, since Open Food Facts limits searches', async () => {
    const calls: string[] = [];
    const f = finder({ [`${WIKI}/api/rest_v1/page/summary/Rambutan`]: { type: 'standard', thumbnail: { source: 'https://upload.wikimedia.org/r.jpg' } } }, calls);
    const fresh = { name: 'Rambutan', brand: null, product: null, barcode: null, kind: 'fresh' as const, wikipediaTitle: 'Rambutan' };
    await f.find(fresh);
    await f.find(fresh);
    assert.equal(calls.length, 1);
  });
});

describe('tidyCandidates / withPictures', () => {
  const c = (over: Partial<ReportedCandidate>): ReportedCandidate => ({
    name: 'gochujang',
    brand: null,
    product: null,
    barcode: null,
    category: 'condiments',
    kind: 'fresh',
    wikipediaTitle: null,
    keptIn: 'pantry',
    fridgeDays: 180,
    freezerDays: null,
    pantryDays: 365,
    looks: 'Red tub',
    why: 'Same tub',
    sourceUrl: null,
    ...over,
  });

  it('trims, clamps, drops repeats and caps the list', () => {
    const out = tidyCandidates({
      candidates: [
        c({ name: '  gochujang  ', fridgeDays: -4, pantryDays: 99999, freezerDays: 12.6, barcode: '8801 0520', sourceUrl: 'http://insecure.example' }),
        c({ name: 'Gochujang' }),
        c({ name: '   ' }),
        c({ name: 'Ssamjang', sourceUrl: 'https://example.com/s' }),
        c({ name: 'Doenjang' }),
        c({ name: 'Chili paste' }),
      ],
    });
    assert.equal(out.length, MAX_CANDIDATES);
    assert.deepEqual(
      out.map((x) => x.name),
      ['Gochujang', 'Ssamjang', 'Doenjang'],
    );
    assert.equal(out[0]?.fridgeDays, 0);
    assert.equal(out[0]?.pantryDays, 730);
    assert.equal(out[0]?.freezerDays, 13);
    assert.equal(out[0]?.barcode, '88010520');
    assert.equal(out[0]?.sourceUrl, null);
    assert.equal(out[1]?.sourceUrl, 'https://example.com/s');
  });

  it('attaches pictures in order and tolerates a failing lookup', async () => {
    const res = await withPictures({ candidates: [c({ name: 'A' }), c({ name: 'B' })] }, {
      find: async (x) => {
        if (x.name === 'B') throw new Error('nope');
        return { url: 'https://upload.wikimedia.org/a.jpg', credit: 'Wikipedia', pageUrl: 'https://en.wikipedia.org/wiki/A' };
      },
    });
    assert.equal(res.candidates[0]?.image?.credit, 'Wikipedia');
    assert.equal(res.candidates[1]?.image, null);
    assert.deepEqual(res.candidates[0]?.shelfLife, { fridge: 180, freezer: null, pantry: 365 });
  });
});

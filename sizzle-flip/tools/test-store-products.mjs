// Tests tools/create-store-products.mjs against a local mock of the Google Play Developer API and the
// App Store Connect API (no accounts needed): request signing, request bodies, pagination, the screenshot
// upload, and that a second run changes nothing.   node tools/test-store-products.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { PACKS } from '../src/shop-config.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PKG = 'com.sizzleflip.game';
let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

// keys: a Google service account (RSA) and an App Store Connect API key (EC P-256)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-products-'));
const g = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const a = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const saFile = path.join(tmp, 'sa.json'), p8File = path.join(tmp, 'AuthKey_TEST123.p8');
const shotFile = path.join(tmp, 'review.jpg');
fs.writeFileSync(shotFile, crypto.randomBytes(5000));
fs.writeFileSync(p8File, a.privateKey.export({ type: 'pkcs8', format: 'pem' }));

// ------------------------------------------------------------ mock state
const play = new Map();            // productId -> OneTimeProduct
const asc = { iaps: new Map(), locs: new Map(), schedules: new Map(), avail: new Map(), shots: new Map(), uploads: new Map() };
const log = [];                    // "METHOD path" for every request
const problems = [];
const TERR = ['USA', 'DEU', 'JPN', 'GBR', 'BRA'];
const POINTS = ['0.29', '0.99', '1.00', '1.99', '4.99', '9.99', '19.99', '24.99', '49.99', '99.99', '199.99'];
let seq = 0;

const verifyJwt = (tok, pub, alg) => {
  const [h, b, sgn] = String(tok).split('.');
  const ok = alg === 'RS256'
    ? crypto.verify('RSA-SHA256', Buffer.from(`${h}.${b}`), pub, Buffer.from(sgn, 'base64url'))
    : crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sgn, 'base64url'));
  return ok ? { head: JSON.parse(Buffer.from(h, 'base64url')), body: JSON.parse(Buffer.from(b, 'base64url')) } : null;
};

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  log.push(`${req.method} ${p}`);
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  const body = () => JSON.parse(raw.toString() || '{}');
  try {
    // ---------------- Google OAuth
    if (p === '/token') {
      const f = new URLSearchParams(raw.toString());
      const jwt = verifyJwt(f.get('assertion'), g.publicKey, 'RS256');
      if (f.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !jwt) return send(400, { error: 'invalid_grant' });
      const c = jwt.body;
      if (c.iss !== 'sizzle@test.iam.gserviceaccount.com' || c.scope !== 'https://www.googleapis.com/auth/androidpublisher' || !/\/token$/.test(c.aud) || c.exp - c.iat > 3600) problems.push('google jwt claims ' + JSON.stringify(c));
      return send(200, { access_token: 'g-token', expires_in: 3600, token_type: 'Bearer' });
    }
    // ---------------- Google Play
    if (p.startsWith('/androidpublisher/')) {
      if (req.headers.authorization !== 'Bearer g-token') return send(401, { error: { message: 'unauthenticated' } });
      const base = `/androidpublisher/v3/applications/${PKG}`;
      if (req.method === 'POST' && p === `${base}/pricing:convertRegionPrices`) {
        const { price } = body();
        const usd = Number(price.units) + price.nanos / 1e9;
        const m = (cur, v) => ({ currencyCode: cur, units: String(Math.floor(v)), nanos: Math.round((v % 1) * 1e9) });
        return send(200, { regionVersion: { version: '2025/03' }, convertedOtherRegionsPrice: { usdPrice: m('USD', usd), eurPrice: m('EUR', usd) },
          convertedRegionPrices: { US: { regionCode: 'US', price: m('USD', usd) }, DE: { regionCode: 'DE', price: m('EUR', usd * 0.95) }, JP: { regionCode: 'JP', price: m('JPY', Math.round(usd * 150)) } } });
      }
      let mm;
      if (req.method === 'GET' && (mm = p.match(new RegExp(`^${base}/oneTimeProducts/([^/:]+)$`)))) return play.has(mm[1]) ? send(200, play.get(mm[1])) : send(404, { error: { message: 'not found' } });
      if (req.method === 'PATCH' && (mm = p.match(new RegExp(`^${base}/onetimeproducts/([^/:]+)$`)))) {
        const b = body(), id = mm[1];
        if (url.searchParams.get('allowMissing') !== 'true' || url.searchParams.get('regionsVersion.version') !== '2025/03' || !url.searchParams.get('updateMask')) problems.push('patch query ' + url.search);
        if (b.productId !== id || b.packageName !== PKG || !b.listings?.[0]?.title || b.listings[0].title.length > 55 || b.listings[0].description.length > 200) problems.push('patch body ' + id);
        const po = b.purchaseOptions?.[0];
        if (!po || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(po.purchaseOptionId) || !po.buyOption || !po.newRegionsConfig?.usdPrice || !po.newRegionsConfig?.eurPrice) problems.push('purchase option ' + id);
        for (const r of po?.regionalPricingAndAvailabilityConfigs || []) if ({ US: 'USD', DE: 'EUR', JP: 'JPY' }[r.regionCode] !== r.price.currencyCode) problems.push(`region currency ${id} ${r.regionCode}`);
        const old = play.get(id);
        const saved = { ...b, purchaseOptions: b.purchaseOptions.map(o => ({ ...o, state: old?.purchaseOptions.find(x => x.purchaseOptionId === o.purchaseOptionId)?.state || 'DRAFT' })) };
        play.set(id, saved);
        return send(200, saved);
      }
      if (req.method === 'POST' && (mm = p.match(new RegExp(`^${base}/oneTimeProducts/([^/:]+)/purchaseOptions:batchUpdateStates$`)))) {
        for (const r of body().requests) {
          const q = r.activatePurchaseOptionRequest, prod = play.get(q.productId);
          const o = prod && q.packageName === PKG && prod.purchaseOptions.find(x => x.purchaseOptionId === q.purchaseOptionId);
          if (!o) return send(400, { error: { message: 'no such purchase option' } });
          o.state = 'ACTIVE';
        }
        return send(200, { oneTimeProducts: [play.get(mm[1])] });
      }
      return send(404, { error: { message: 'unknown ' + p } });
    }
    // ---------------- App Store Connect: upload target (no auth, like Apple's upload URLs)
    if (p.startsWith('/upload/')) {
      const [, , sid, off] = p.split('/');
      if (req.method !== 'PUT' || req.headers['content-type'] !== 'image/jpeg') problems.push('upload request');
      const u = asc.uploads.get(sid) || []; u.push([+off, raw]); asc.uploads.set(sid, u);
      return send(200);
    }
    // ---------------- App Store Connect API
    const jwt = verifyJwt((req.headers.authorization || '').replace(/^Bearer /, ''), a.publicKey, 'ES256');
    if (!jwt) return send(401, { errors: [{ title: 'NOT_AUTHORIZED', detail: 'bad token' }] });
    if (jwt.head.kid !== 'TEST123' || jwt.head.alg !== 'ES256' || jwt.body.iss !== 'issuer-1' || jwt.body.aud !== 'appstoreconnect-v1' || jwt.body.exp - jwt.body.iat > 1200) problems.push('asc jwt ' + JSON.stringify(jwt));
    const E = (code, detail) => send(code, { errors: [{ title: 'ERROR', detail }] });
    const iap = (id) => asc.iaps.get(id);
    let mm;
    if (req.method === 'GET' && p === '/v1/apps') return send(200, { data: [{ type: 'apps', id: 'app-1', attributes: { bundleId: url.searchParams.get('filter[bundleId]') === PKG ? PKG : 'other' } }] });
    if (req.method === 'GET' && p === '/v1/territories') {           // two pages
      const page = url.searchParams.get('cursor') ? 1 : 0, ids = page ? TERR.slice(3) : TERR.slice(0, 3);
      return send(200, { data: ids.map(id => ({ type: 'territories', id })), links: page ? {} : { next: `http://${req.headers.host}/v1/territories?limit=200&cursor=2` } });
    }
    if (req.method === 'GET' && p === '/v1/apps/app-1/inAppPurchasesV2') return send(200, { data: [...asc.iaps.values()], links: {} });
    if (req.method === 'POST' && p === '/v2/inAppPurchases') {
      const d = body().data, at = d.attributes;
      if (asc.fail500 === at.productId) { asc.fail500 = null; asc.creates500 = (asc.creates500 || 0) + 1; return E(500, 'internal error'); }
      if (d.relationships.app.data.id !== 'app-1' || at.inAppPurchaseType !== 'CONSUMABLE' || !at.name || at.name.length > 64 || 'familySharable' in at) problems.push('create iap ' + JSON.stringify(at));
      if ([...asc.iaps.values()].some(i => i.attributes.productId === at.productId)) return E(409, 'duplicate productId');
      const id = 'iap-' + ++seq;
      asc.iaps.set(id, { type: 'inAppPurchases', id, attributes: { ...at, state: 'MISSING_METADATA' } });
      return send(201, { data: asc.iaps.get(id) });
    }
    if ((mm = p.match(/^\/v2\/inAppPurchases\/([^/]+)(\/.*)?$/))) {
      const id = mm[1], sub = mm[2] || '', it = iap(id);
      if (!it) return E(404, 'no iap');
      if (req.method === 'GET' && !sub) {
        const ready = asc.locs.has(id) && asc.schedules.has(id) && asc.avail.has(id) && asc.shots.get(id)?.attributes.assetDeliveryState.state === 'COMPLETE';
        it.attributes.state = ready ? 'READY_TO_SUBMIT' : 'MISSING_METADATA';
        return send(200, { data: it });
      }
      if (sub === '/inAppPurchaseLocalizations') return send(200, { data: asc.locs.has(id) ? [asc.locs.get(id)] : [] });
      if (sub === '/pricePoints') {
        if (url.searchParams.get('filter[territory]') !== 'USA') problems.push('price points territory');
        return send(200, { data: POINTS.map(c => ({ type: 'inAppPurchasePricePoints', id: `pp-${id}-USA-${c}`, attributes: { customerPrice: c, proceeds: (c * 0.7).toFixed(2) } })) });
      }
      if (sub === '/iapPriceSchedule') return asc.schedules.has(id) ? send(200, { data: { type: 'inAppPurchasePriceSchedules', id } }) : E(404, 'none');
      if (sub === '/inAppPurchaseAvailability') return asc.avail.has(id) ? send(200, { data: asc.avail.get(id) }) : E(404, 'none');
      if (sub === '/appStoreReviewScreenshot') return send(200, { data: asc.shots.get(id) || null });
    }
    if (req.method === 'POST' && p === '/v1/inAppPurchaseLocalizations') {
      const d = body().data, id = d.relationships.inAppPurchaseV2.data.id;
      if (d.attributes.locale !== 'en-US' || d.attributes.name.length > 35 || d.attributes.description.length > 55 || !iap(id)) problems.push('localization');
      asc.locs.set(id, { type: 'inAppPurchaseLocalizations', id: 'loc-' + id, attributes: d.attributes });
      return send(201, { data: asc.locs.get(id) });
    }
    if (req.method === 'PATCH' && (mm = p.match(/^\/v1\/inAppPurchaseLocalizations\/loc-(.+)$/))) {
      Object.assign(asc.locs.get(mm[1]).attributes, body().data.attributes);
      return send(200, { data: asc.locs.get(mm[1]) });
    }
    if (req.method === 'GET' && (mm = p.match(/^\/v1\/inAppPurchasePriceSchedules\/([^/]+)\/manualPrices$/))) {
      const s = asc.schedules.get(mm[1]);
      // like the real API: relationship data only when it's included
      const rel = (url.searchParams.get('include') || '').split(',').includes('inAppPurchasePricePoint') ? { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: s } } } : { inAppPurchasePricePoint: {} };
      return send(200, { data: s ? [{ type: 'inAppPurchasePrices', id: 'price-' + mm[1], attributes: { startDate: null, endDate: null, manual: true }, relationships: rel }] : [] });
    }
    if (req.method === 'POST' && p === '/v1/inAppPurchasePriceSchedules') {
      const b = body(), r = b.data.relationships, id = r.inAppPurchase.data.id, local = r.manualPrices.data[0].id;
      const inc = (b.included || []).find(x => x.type === 'inAppPurchasePrices' && x.id === local);
      if (r.baseTerritory.data.id !== 'USA' || !inc || inc.relationships.inAppPurchaseV2.data.id !== id) problems.push('price schedule ' + id);
      asc.schedules.set(id, inc && inc.relationships.inAppPurchasePricePoint.data.id);
      return send(201, { data: { type: 'inAppPurchasePriceSchedules', id } });
    }
    if (req.method === 'POST' && p === '/v1/inAppPurchaseAvailabilities') {
      const d = body().data, id = d.relationships.inAppPurchase.data.id;
      if (d.attributes.availableInNewTerritories !== true) problems.push('availability new territories');
      asc.avail.set(id, { type: 'inAppPurchaseAvailabilities', id: 'av-' + id, territories: d.relationships.availableTerritories.data.map(t => t.id) });
      return send(201, { data: asc.avail.get(id) });
    }
    if (req.method === 'POST' && p === '/v1/inAppPurchaseAppStoreReviewScreenshots') {
      const d = body().data, id = d.relationships.inAppPurchaseV2.data.id, size = d.attributes.fileSize, sid = 'shot-' + id;
      const half = Math.ceil(size / 2), host = `http://${req.headers.host}`;
      const ops = [[0, half], [half, size - half]].map(([offset, length]) => ({ method: 'PUT', url: `${host}/upload/${sid}/${offset}`, offset, length, requestHeaders: [{ name: 'Content-Type', value: 'image/jpeg' }] }));
      asc.shots.set(id, { type: 'inAppPurchaseAppStoreReviewScreenshots', id: sid, attributes: { fileName: d.attributes.fileName, fileSize: size, uploadOperations: ops, assetDeliveryState: { state: 'AWAITING_UPLOAD' } } });
      return send(201, { data: asc.shots.get(id) });
    }
    if (req.method === 'DELETE' && (mm = p.match(/^\/v1\/inAppPurchaseAppStoreReviewScreenshots\/shot-(.+)$/))) {
      asc.shots.delete(mm[1]); asc.uploads.delete('shot-' + mm[1]);
      return send(204);
    }
    if (req.method === 'PATCH' && (mm = p.match(/^\/v1\/inAppPurchaseAppStoreReviewScreenshots\/shot-(.+)$/))) {
      const at = body().data.attributes, s = asc.shots.get(mm[1]);
      const bytes = Buffer.concat((asc.uploads.get(s.id) || []).sort((x, y) => x[0] - y[0]).map(x => x[1]));
      const md5 = crypto.createHash('md5').update(bytes).digest('hex');
      s.attributes.assetDeliveryState.state = at.uploaded && at.sourceFileChecksum === md5 && bytes.length === s.attributes.fileSize ? 'COMPLETE' : 'FAILED';
      return send(200, { data: s });
    }
    return E(404, `unknown ${req.method} ${p}`);
  } catch (e) { problems.push('mock crashed: ' + e.message); return send(500, { errors: [{ title: 'mock', detail: e.message }] }); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const host = `http://127.0.0.1:${server.address().port}`;
fs.writeFileSync(saFile, JSON.stringify({ type: 'service_account', client_email: 'sizzle@test.iam.gserviceaccount.com', private_key_id: 'k1', private_key: g.privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${host}/token` }));

const run = (...flags) => new Promise((resolve) => execFile(process.execPath, [path.join(root, 'tools/create-store-products.mjs'), ...flags], {
  env: { ...process.env, PLAY_SERVICE_ACCOUNT: saFile, PLAY_API_BASE: host, ASC_API_BASE: host, ASC_KEY_ID: 'TEST123', ASC_ISSUER_ID: 'issuer-1', ASC_KEY_FILE: p8File, ASC_REVIEW_SCREENSHOT: shotFile },
}, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr })));
const count = (re) => log.filter(l => re.test(l)).length;

// 1. dry run: no network at all
let r = await run('--dry-run');
check(r.code === 0 && log.length === 0 && /6 consumable products/.test(r.out), 'dry run lists the 6 packs and makes no requests');

// 2. first run creates everything
r = await run('--play', '--apple');
if (r.code) console.log(r.out);
check(r.code === 0 && /All products are in place/.test(r.out), 'first run succeeds');
check(play.size === PACKS.length && PACKS.every(p => play.get(p.id)?.purchaseOptions[0].state === 'ACTIVE'), `Google Play: ${play.size} one-time products, all active`);
check(PACKS.every(p => { const o = play.get(p.id).purchaseOptions[0]; const us = o.regionalPricingAndAvailabilityConfigs.find(x => x.regionCode === 'US').price; return `${us.units}.${String(us.nanos).padStart(9, '0').slice(0, 2)}` === p.usd; }), 'Google Play: US prices exactly as configured (0.99 … 99.99)');
check(PACKS.every(p => play.get(p.id).purchaseOptions[0].regionalPricingAndAvailabilityConfigs.length === 3 && play.get(p.id).listings[0].title === p.title), 'Google Play: Play-converted prices for every region, titles from the config');
const iaps = [...asc.iaps.values()];
check(iaps.length === PACKS.length && iaps.every(i => i.attributes.inAppPurchaseType === 'CONSUMABLE'), `App Store: ${iaps.length} consumable in-app purchases`);
check(iaps.every(i => asc.locs.get(i.id)?.attributes.name === PACKS.find(p => p.id === i.attributes.productId).title), 'App Store: en-US display names');
check(iaps.every(i => asc.schedules.get(i.id) === `pp-${i.id}-USA-${PACKS.find(p => p.id === i.attributes.productId).usd}`), 'App Store: US price points match the config');
check(iaps.every(i => asc.avail.get(i.id)?.territories.length === TERR.length), 'App Store: available in every territory (both pages of the territory list)');
check(iaps.every(i => asc.shots.get(i.id)?.attributes.assetDeliveryState.state === 'COMPLETE'), 'App Store: review screenshot uploaded in parts, checksum verified');
check(/READY_TO_SUBMIT/.test(r.out) && !/MISSING_METADATA/.test(r.out), 'App Store: every product ends READY_TO_SUBMIT');
check(problems.length === 0, `requests are well-formed and signed (RS256 for Google, ES256 for Apple)${problems.length ? ': ' + problems.join('; ') : ''}`);

// 3. second run: nothing new (and a purchase option added by hand in Play Console survives)
play.get('hotdogs_100').purchaseOptions.unshift({ purchaseOptionId: 'promo', buyOption: { legacyCompatible: false, multiQuantityEnabled: false }, regionalPricingAndAvailabilityConfigs: [], state: 'ACTIVE' });
const mark = log.length;
r = await run('--play', '--apple');
const again = log.slice(mark);
check(r.code === 0, 'second run succeeds');
check(!again.some(l => /^POST \/v2\/inAppPurchases$|^POST \/v1\/(inAppPurchaseLocalizations|inAppPurchasePriceSchedules|inAppPurchaseAvailabilities|inAppPurchaseAppStoreReviewScreenshots)$|^PUT \/upload|batchUpdateStates/.test(l)), 'second run creates nothing (no duplicate products, prices, uploads or activations)');
check(asc.iaps.size === PACKS.length && play.size === PACKS.length, 'still exactly 6 products in each store');
check(play.get('hotdogs_100').purchaseOptions.map(o => o.purchaseOptionId).join() === 'promo,buy', 'a purchase option added in Play Console is kept');

// 4. a changed description is updated in place
asc.locs.get(iaps[0].id).attributes.description = 'old text';
r = await run('--apple');
check(r.code === 0 && asc.locs.get(iaps[0].id).attributes.description === PACKS.find(p => p.id === iaps[0].attributes.productId).description && /name updated/.test(r.out), 'an edited description is put back to the configured one');

// 5. a screenshot whose processing failed is replaced
asc.shots.get(iaps[1].id).attributes.assetDeliveryState.state = 'FAILED';
r = await run('--apple');
check(r.code === 0 && asc.shots.get(iaps[1].id)?.attributes.assetDeliveryState.state === 'COMPLETE' && count(/^DELETE \/v1\/inAppPurchaseAppStoreReviewScreenshots\//) === 1, 'a failed review screenshot is deleted and uploaded again');

// 6. a create that fails with a server error isn't blindly repeated (it might have gone through); the next run makes it
const lost = [...asc.iaps.values()].find(i => i.attributes.productId === 'hotdogs_500');
asc.iaps.delete(lost.id); asc.fail500 = 'hotdogs_500';
r = await run('--apple');
check(r.code === 1 && asc.creates500 === 1 && /hotdogs_500.*500/.test(r.out), 'a create that hits a server error is reported, not retried');
r = await run('--apple');
check(r.code === 0 && [...asc.iaps.values()].some(i => i.attributes.productId === 'hotdogs_500'), 'the next run creates it');

// 7. clear errors
const badEnv = await new Promise((resolve) => execFile(process.execPath, [path.join(root, 'tools/create-store-products.mjs'), '--apple'], { env: { ...process.env, ASC_KEY_ID: '' } }, (err, stdout) => resolve({ code: err ? err.code : 0, out: stdout })));
check(badEnv.code === 1 && /set ASC_KEY_ID/.test(badEnv.out), 'missing credentials: clear message, exit code 1');
check(fs.readFileSync(path.join(root, 'store/iap-products.csv'), 'utf8').trim().split('\n').length === PACKS.length + 1, 'store/iap-products.csv lists the 6 packs');

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);

// Creates (or updates) the Hot Dog packs — the shop's in-app products — in Google Play and App Store Connect,
// from the pack list in src/shop-config.js. Safe to run again: existing products are updated, nothing is duplicated.
//
//   node tools/create-store-products.mjs --dry-run         show what would be created (no network)
//   node tools/create-store-products.mjs --play            Google Play Console
//   node tools/create-store-products.mjs --apple           App Store Connect
//   node tools/create-store-products.mjs --play --apple    both
//   node tools/create-store-products.mjs --csv             rewrite store/iap-products.csv from the pack list
//
// Google Play (Play Developer API, monetization.onetimeproducts):
//   PLAY_SERVICE_ACCOUNT  path to a service account JSON key. In Google Cloud: create a service account and a JSON key,
//                         enable the "Google Play Android Developer API"; in Play Console → Users and permissions,
//                         invite the service account's email with the "Manage store presence" permission for the app.
//   PLAY_PACKAGE          optional, defaults to appId in capacitor.config.json (com.sizzleflip.game)
//   Play only accepts products for an app that has a build using billing on a testing track (RELEASE.md).
//   Each pack is created with its US price; Play converts it for every other country (the same conversion as
//   "Set prices" in the console) and the purchase option is activated.
//
// App Store Connect (App Store Connect API, inAppPurchases):
//   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_FILE   an API key (Users and Access → Integrations → App Store Connect API,
//                         role App Manager or Admin): its key id, the issuer id and the downloaded AuthKey_….p8 file
//   ASC_BUNDLE_ID         optional, defaults to appId in capacitor.config.json; the app must exist in App Store Connect
//   ASC_REVIEW_SCREENSHOT optional, defaults to store/iap-review.jpg
//   Each pack is created as a Consumable with an en-US name and description, the US price (Apple sets the other
//   countries from it), availability in every country and the review screenshot. Apple reviews new in-app purchases
//   together with an app version: select them on the version page before submitting (RELEASE.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PACKS } from '../src/shop-config.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = new Set(process.argv.slice(2));
const env = process.env;
const appId = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')).appId;
const PLAY_API = (env.PLAY_API_BASE || 'https://androidpublisher.googleapis.com').replace(/\/$/, '');
const ASC_API = (env.ASC_API_BASE || 'https://api.appstoreconnect.apple.com').replace(/\/$/, '');
const LANG = 'en-US';
const REVIEW_NOTE = 'Hot Dogs are the in-game currency for cosmetic characters. To see the packs: title screen → SHOP → '
  + 'tap the Hot Dogs balance at the top right. To spend them: tap a character, or a bundle at the top of a shop tab.';
const log = (...a) => console.log(...a);
let failures = 0;

// ------------------------------------------------------------ the product list
function checkProducts() {
  const bad = [];
  const ids = new Set();
  for (const p of PACKS) {
    if (!/^[a-z0-9][a-z0-9_.]{0,99}$/.test(p.id)) bad.push(`${p.id}: product id must be lower-case letters, digits, _ and .`);
    if (ids.has(p.id)) bad.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (!/^\d+\.\d{2}$/.test(p.usd)) bad.push(`${p.id}: usd must look like 0.99`);
    if (p.title.length > 35) bad.push(`${p.id}: title over 35 characters (App Store limit)`);
    if (p.description.length > 55) bad.push(`${p.id}: description over 55 characters (App Store limit)`);
  }
  if (bad.length) { console.error('src/shop-config.js has problems:\n  ' + bad.join('\n  ')); process.exit(1); }
}

function productsCsv() {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ['product_id,type,hot_dogs,price_usd,title,description',
    ...PACKS.map(p => [p.id, 'consumable', p.hotdogs, p.usd, p.title, p.description].map(v => q(String(v))).join(','))].join('\n') + '\n';
}

// ------------------------------------------------------------ HTTP
const b64url = (b) => Buffer.from(b).toString('base64url');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function request(method, url, { token, json, form, raw, headers = {}, allow404 = false } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  else if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  else if (raw) body = raw;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method, headers: h, body });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (res.status === 404 && allow404) return null;
    // retry when the server says it did nothing (429), or on a server error for requests that are safe to repeat
    // (a POST that failed with 5xx may still have created something; the next run picks that up instead)
    if ((res.status === 429 || (res.status >= 500 && method !== 'POST')) && attempt < 3) { await sleep(1500 * 2 ** attempt); continue; }
    if (!res.ok) {
      const detail = data && data.error ? data.error.message
        : data && data.errors ? data.errors.map(e => [e.title, e.detail].filter(Boolean).join(': ')).join('; ')
        : text.slice(0, 300);
      throw new Error(`${method} ${url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]} → ${res.status} ${detail}`);
    }
    return data;
  }
}

// ------------------------------------------------------------ Google Play
const money = (currencyCode, amount) => {
  const [u, f = ''] = String(amount).split('.');
  return { currencyCode, units: String(Number(u)), nanos: Number((f + '000000000').slice(0, 9)) };
};

async function googleToken(sa) {
  const tokenUrl = env.GOOGLE_TOKEN_URL || sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: tokenUrl, iat: now, exp: now + 3600 }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${claims}`), sa.private_key).toString('base64url');
  const r = await request('POST', tokenUrl, { form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` } });
  if (!r || !r.access_token) throw new Error('Google sign-in returned no access token');
  return r.access_token;
}

// existing: the product as Play has it (or null). Its other purchase options (added in Play Console) are kept.
function playProduct(pkg, p, conv, purchaseOptionId, existing) {
  const usd = money('USD', p.usd);
  const converted = Object.values(conv.convertedRegionPrices || {});
  const regions = converted.map(r => ({ regionCode: r.regionCode, price: r.regionCode === 'US' ? usd : r.price, availability: 'AVAILABLE' }));
  const other = conv.convertedOtherRegionsPrice || {};
  const eur = other.eurPrice || (converted.find(r => r.price && r.price.currencyCode === 'EUR') || {}).price || money('EUR', p.usd);
  const keep = ((existing && existing.purchaseOptions) || []).filter(o => o.purchaseOptionId !== purchaseOptionId).map(({ state, ...o }) => o);
  return {
    packageName: pkg,
    productId: p.id,
    listings: [{ languageCode: LANG, title: p.title, description: p.description }],
    purchaseOptions: [...keep, {
      purchaseOptionId,
      buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
      regionalPricingAndAvailabilityConfigs: regions,
      newRegionsConfig: { usdPrice: other.usdPrice || usd, eurPrice: eur, availability: 'AVAILABLE' },
    }],
  };
}

async function runPlay() {
  const keyFile = env.PLAY_SERVICE_ACCOUNT;
  if (!keyFile) throw new Error('set PLAY_SERVICE_ACCOUNT to the service account JSON key file (see the top of this script)');
  const sa = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const pkg = env.PLAY_PACKAGE || appId;
  log(`\nGoogle Play · ${pkg}`);
  const token = await googleToken(sa);
  const app = `${PLAY_API}/androidpublisher/v3/applications/${encodeURIComponent(pkg)}`;
  for (const p of PACKS) {
    try {
      // Play's own conversion of the US price into every country's currency
      const conv = await request('POST', `${app}/pricing:convertRegionPrices`, { token, json: { price: money('USD', p.usd) } });
      const version = conv && conv.regionVersion && conv.regionVersion.version;
      if (!version) throw new Error('price conversion returned no regions version');
      const existing = await request('GET', `${app}/oneTimeProducts/${p.id}`, { token, allow404: true });
      const oldOption = existing && ((existing.purchaseOptions || []).find(o => o.buyOption && o.buyOption.legacyCompatible) || (existing.purchaseOptions || []).find(o => o.buyOption));
      const optionId = (oldOption && oldOption.purchaseOptionId) || 'buy';
      const body = playProduct(pkg, p, conv, optionId, existing);
      const q = new URLSearchParams({ allowMissing: 'true', 'regionsVersion.version': version, updateMask: 'listings,purchaseOptions' });
      const saved = await request('PATCH', `${app}/onetimeproducts/${p.id}?${q}`, { token, json: body });
      const option = ((saved && saved.purchaseOptions) || []).find(o => o.purchaseOptionId === optionId);
      let state = option && option.state;
      if (state !== 'ACTIVE') {
        await request('POST', `${app}/oneTimeProducts/${p.id}/purchaseOptions:batchUpdateStates`, {
          token, json: { requests: [{ activatePurchaseOptionRequest: { packageName: pkg, productId: p.id, purchaseOptionId: optionId } }] },
        });
        state = 'activated';
      } else state = 'already active';
      const ours = body.purchaseOptions[body.purchaseOptions.length - 1];
      log(`  ✔ ${p.id.padEnd(14)} ${existing ? 'updated' : 'created'} · ${p.title} · US$${p.usd} + ${ours.regionalPricingAndAvailabilityConfigs.length - 1} countries · ${state}`);
    } catch (e) { failures++; log(`  ✘ ${p.id.padEnd(14)} ${e.message}`); }
  }
}

// ------------------------------------------------------------ App Store Connect
function ascTokenFactory() {
  const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_FILE: file } = env;
  if (!kid || !iss || !file) throw new Error('set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_FILE (see the top of this script)');
  const key = crypto.createPrivateKey(fs.readFileSync(file, 'utf8'));
  let cached = null, until = 0;
  return () => {
    const now = Math.floor(Date.now() / 1000);
    if (cached && now < until) return cached;
    const head = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
    const body = b64url(JSON.stringify({ iss, iat: now, exp: now + 1140, aud: 'appstoreconnect-v1' }));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    cached = `${head}.${body}.${sig}`; until = now + 900;
    return cached;
  };
}

async function runApple() {
  const token = ascTokenFactory();
  const bundleId = env.ASC_BUNDLE_ID || appId;
  const shotFile = env.ASC_REVIEW_SCREENSHOT || path.join(root, 'store/iap-review.jpg');
  const shot = fs.readFileSync(shotFile);
  const api = (method, p, opts = {}) => request(method, p.startsWith('http') ? p : ASC_API + p, { ...opts, token: token() });
  const all = async (p) => { const out = []; let next = p; while (next) { const r = await api('GET', next); out.push(...(r.data || [])); next = r.links && r.links.next; } return out; };

  const apps = (await api('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=200`)).data || [];
  const app = apps.find(a => a.attributes && a.attributes.bundleId === bundleId);
  if (!app) throw new Error(`no app with bundle id ${bundleId} in App Store Connect — create the app first (My Apps → +)`);
  log(`\nApp Store Connect · ${bundleId} (app ${app.id})`);
  const existing = new Map((await all(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)).map(i => [i.attributes.productId, i]));
  const territories = (await all('/v1/territories?limit=200')).map(t => t.id);

  for (const p of PACKS) {
    try {
      const done = [];
      // 1. the product
      let iap = existing.get(p.id);
      if (iap && iap.attributes.inAppPurchaseType !== 'CONSUMABLE') throw new Error(`exists as ${iap.attributes.inAppPurchaseType}; Hot Dog packs must be CONSUMABLE (a product's type can't be changed: delete it in App Store Connect, or rename the pack id)`);
      if (!iap) {
        iap = (await api('POST', '/v2/inAppPurchases', { json: { data: { type: 'inAppPurchases',
          attributes: { name: `Hot Dogs ${p.hotdogs}`, productId: p.id, inAppPurchaseType: 'CONSUMABLE', reviewNote: REVIEW_NOTE },
          relationships: { app: { data: { type: 'apps', id: app.id } } } } } })).data;
        done.push('created');
      } else done.push('exists');
      const id = iap.id;
      // 2. display name + description
      const locs = (await api('GET', `/v2/inAppPurchases/${id}/inAppPurchaseLocalizations?limit=200`)).data || [];
      const loc = locs.find(l => l.attributes.locale === LANG);
      if (!loc) {
        await api('POST', '/v1/inAppPurchaseLocalizations', { json: { data: { type: 'inAppPurchaseLocalizations',
          attributes: { locale: LANG, name: p.title, description: p.description },
          relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } } } } });
        done.push('name');
      } else if (loc.attributes.name !== p.title || loc.attributes.description !== p.description) {
        await api('PATCH', `/v1/inAppPurchaseLocalizations/${loc.id}`, { json: { data: { type: 'inAppPurchaseLocalizations', id: loc.id, attributes: { name: p.title, description: p.description } } } });
        done.push('name updated');
      }
      // 3. price: the US price point; Apple sets every other country from it
      const points = (await api('GET', `/v2/inAppPurchases/${id}/pricePoints?filter[territory]=USA&limit=8000`)).data || [];
      const point = points.find(pp => Number(pp.attributes.customerPrice) === Number(p.usd));
      if (!point) throw new Error(`the App Store has no US$${p.usd} price point — change usd in src/shop-config.js`);
      const schedule = await api('GET', `/v2/inAppPurchases/${id}/iapPriceSchedule`, { allow404: true });
      const current = schedule && schedule.data
        ? ((await api('GET', `/v1/inAppPurchasePriceSchedules/${schedule.data.id}/manualPrices?filter[territory]=USA&include=inAppPurchasePricePoint&limit=200`, { allow404: true })) || {}).data || []
        : [];
      const priced = current.some(pr => !pr.attributes?.endDate && pr.relationships?.inAppPurchasePricePoint?.data?.id === point.id);
      if (!priced) {
        await api('POST', '/v1/inAppPurchasePriceSchedules', { json: {
          data: { type: 'inAppPurchasePriceSchedules', relationships: {
            inAppPurchase: { data: { type: 'inAppPurchases', id } },
            baseTerritory: { data: { type: 'territories', id: 'USA' } },
            manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price}' }] } } },
          included: [{ type: 'inAppPurchasePrices', id: '${price}', attributes: { startDate: null },
            relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } }, inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: point.id } } } }],
        } });
        done.push(`US$${p.usd}`);
      }
      // 4. sold in every country (and new ones)
      const avail = await api('GET', `/v2/inAppPurchases/${id}/inAppPurchaseAvailability`, { allow404: true });
      if (!avail || !avail.data) {
        await api('POST', '/v1/inAppPurchaseAvailabilities', { json: { data: { type: 'inAppPurchaseAvailabilities',
          attributes: { availableInNewTerritories: true },
          relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id } }, availableTerritories: { data: territories.map(t => ({ type: 'territories', id: t })) } } } } });
        done.push(`${territories.length} countries`);
      }
      // 5. review screenshot
      const shotNow = await api('GET', `/v2/inAppPurchases/${id}/appStoreReviewScreenshot`, { allow404: true });
      const shotState = shotNow && shotNow.data && shotNow.data.attributes?.assetDeliveryState?.state;
      if (shotState !== 'COMPLETE' && shotState !== 'UPLOAD_COMPLETE') {
        if (shotNow && shotNow.data) await api('DELETE', `/v1/inAppPurchaseAppStoreReviewScreenshots/${shotNow.data.id}`);
        const res = (await api('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', { json: { data: { type: 'inAppPurchaseAppStoreReviewScreenshots',
          attributes: { fileName: path.basename(shotFile), fileSize: shot.length },
          relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } } } } })).data;
        for (const op of res.attributes.uploadOperations || []) {
          const headers = Object.fromEntries((op.requestHeaders || []).map(x => [x.name, x.value]));
          await request(op.method, op.url, { headers, raw: shot.subarray(op.offset, op.offset + op.length) });
        }
        await api('PATCH', `/v1/inAppPurchaseAppStoreReviewScreenshots/${res.id}`, { json: { data: { type: 'inAppPurchaseAppStoreReviewScreenshots', id: res.id,
          attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(shot).digest('hex') } } } });
        done.push('review screenshot');
      }
      const state = ((await api('GET', `/v2/inAppPurchases/${id}`)).data || {}).attributes?.state || '?';
      log(`  ✔ ${p.id.padEnd(14)} ${done.join(' · ')} · ${state}`);
    } catch (e) { failures++; log(`  ✘ ${p.id.padEnd(14)} ${e.message}`); }
  }
}

// ------------------------------------------------------------ main
checkProducts();
if (args.has('--csv')) {
  fs.writeFileSync(path.join(root, 'store/iap-products.csv'), productsCsv());
  log(`store/iap-products.csv: ${PACKS.length} products`);
  if (!args.has('--play') && !args.has('--apple')) process.exit(0);
}
if (args.has('--dry-run') || ![...args].some(a => ['--play', '--apple', '--csv'].includes(a))) {
  log(`${PACKS.length} consumable products from src/shop-config.js (app ${appId}):`);
  for (const p of PACKS) log(`  ${p.id.padEnd(14)} US$${p.usd.padStart(6)}  ${p.title.padEnd(16)} ${p.description}`);
  log('\nGoogle Play: one-time product, listing en-US, purchase option "buy" (legacy compatible), US price converted by Play for every country, activated.');
  log('App Store:   Consumable, en-US name + description, US price (Apple sets other countries), all countries, review screenshot store/iap-review.jpg.');
  log('\nRun with --play and/or --apple to create them (credentials: see the top of tools/create-store-products.mjs).');
  process.exit(0);
}
for (const [flag, run, name] of [['--play', runPlay, 'Google Play'], ['--apple', runApple, 'App Store Connect']]) {
  if (!args.has(flag)) continue;
  try { await run(); } catch (e) { failures++; log(`\n✘ ${name}: ${e.message}`); }
}
log(failures ? `\n${failures} problem(s) — fix them and run again (it is safe to repeat).` : '\nAll products are in place.');
process.exit(failures ? 1 : 0);

// The website and the legal documents are generated from the game's own data; these tests make sure they can never drift or ship broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../src/data.js';
import * as S from '../src/sim.js';
import { buildSite, PAGES, rateRows, pct } from '../tools/site.mjs';
import { findPlaceholders, structuralProblems } from '../tools/legal-check.mjs';
import { collectLicenses } from '../tools/licenses.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = buildSite();
const page = (n) => site.get(`${n}.html`);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('every page renders with no unresolved placeholders', () => {
  for (const p of PAGES) {
    const html = page(p.file);
    assert.ok(html && html.startsWith('<!doctype html>'), p.file);
    assert.ok(!/\{\{|\}\}/.test(html), `${p.file}: unresolved {{…}}`);
    assert.ok(!/undefined|\[object/.test(text(html)), `${p.file}: printed undefined`);
    assert.ok(/<title>[^<]+<\/title>/.test(html) && /<meta name="viewport"/.test(html) && /<html lang="en"/.test(html));
  }
});

test('internal links and images all resolve, and tags are balanced', () => {
  const files = new Set([...site.keys(), ...fs.readdirSync(path.join(root, 'site'))]);
  for (const p of PAGES) {
    const html = page(p.file);
    for (const m of html.matchAll(/(?:href|src)="([^"#:]+?)"/g)) if (!/^(mailto|https?):/.test(m[1])) assert.ok(files.has(m[1]), `${p.file}: broken link ${m[1]}`);
    for (const tag of ['h2', 'h3', 'ul', 'ol', 'table', 'details', 'p', 'main', 'header', 'footer']) {
      const open = (html.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length, close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      assert.equal(open, close, `${p.file}: <${tag}> opened ${open}, closed ${close}`);
    }
  }
});

test('drop-rate page matches the game: every prize, the exact percentages, and they add up', () => {
  const html = page('rates'), t = text(html);
  const week = S.gachaTable(Date.now());
  const rows = rateRows();
  assert.equal(rows.length, D.GACHA_POOL.length);
  let sum = 0;
  for (const r of rows) {
    assert.ok(html.includes(`>${r.item.name.replace(/&/g, '&amp;')}<`), `missing prize ${r.item.name}`);
    sum += (r.low + r.high) / 2;
    const live = week.rows.find((x) => x.id === r.item.id);
    // the live table (what the game rolls against this week) must lie inside what the page publishes for this prize
    const inRange = live.prob >= r.low - 1e-12 && live.prob <= r.high + 1e-12, isSpot = r.spot != null && Math.abs(live.prob - r.spot) < 1e-12;
    assert.ok(inRange || isSpot, `${r.item.id}: live ${live.prob} outside published ${r.low}..${r.high} / spotlight ${r.spot}`);
    assert.ok(t.includes(pct(r.low)) && t.includes(pct(r.high)), `${r.item.id}: ${pct(r.low)}–${pct(r.high)} not on page`);
  }
  assert.ok(Math.abs(sum - 1) < 0.02, `midpoint probabilities sum to ${sum}`);
  // and for every possible spotlight pair the exact table sums to 1 and stays inside the published ranges
  for (let wk = 0; wk < 200; wk++) {
    const tb = S.gachaTable(Date.UTC(2026, 0, 5) + wk * 7 * 864e5 + 3 * 864e5);
    assert.ok(Math.abs(tb.rows.reduce((a, x) => a + x.prob, 0) - 1) < 1e-9);
    for (const x of tb.rows) { const r = rows.find((q) => q.item.id === x.id); assert.ok((x.prob >= r.low - 1e-12 && x.prob <= r.high + 1e-12) || (r.spot != null && Math.abs(x.prob - r.spot) < 1e-12), `week ${wk}: ${x.id} ${x.prob} outside ${r.low}..${r.high}`); }
  }
  for (const tier of D.GACHA.tiers) assert.ok(t.includes(`${tier.p}%`), `tier ${tier.id}`);
  for (const key of ['pityRare', 'pityLegend', 'costGlass', 'costGlass10', 'paidDailyCap', 'spotMult']) assert.ok(t.includes(String(D.GACHA[key])), `${key} = ${D.GACHA[key]} not mentioned`);
});

test('spending limits and guarantees are stated consistently in the terms, parents\' guide, rates page and home page', () => {
  for (const n of ['terms', 'parents', 'rates']) {
    const t = text(page(n));
    assert.ok(t.includes(String(D.GACHA.paidDailyCap)), `${n}: daily cap ${D.GACHA.paidDailyCap}`);
    assert.ok(t.includes(String(D.GACHA.pityRare)) && t.includes(String(D.GACHA.pityLegend)), `${n}: pity`);
    assert.ok(t.includes(String(D.GACHA.costGlass)), `${n}: price`);
  }
  assert.ok(/Sea Glass pulls? (can be )?(switched|turned) off|Sea Glass pulls off|switch off/i.test(text(page('parents'))));
  assert.ok(/Apple/.test(page('terms')) && /third-party beneficiar/i.test(page('terms')), 'Apple minimum EULA terms present');
});

test('the terms carry every clause Apple requires in a custom EULA (Schedule 2 / Standard EULA minimums)', () => {
  const t = text(page('terms'));
  for (const needle of ['acknowledge', 'Scope of license', 'Maintenance and support', 'Warranty', 'Product claims', 'Intellectual property rights', 'Legal compliance', 'Developer name and address', 'Third-party terms', 'Third-party beneficiary']) {
    assert.ok(t.toLowerCase().includes(needle.toLowerCase()), `terms lack "${needle}"`);
  }
});

test('privacy policy claims match what the app actually contains', () => {
  const t = text(page('privacy'));
  assert.ok(/does not collect/i.test(t) && /no analytics/i.test(t));
  // no network code, trackers or ad SDKs in the shipped source
  const src = ['main', 'game', 'ui', 'gacha_ui', 'platform', 'render', 'audio', 'sim', 'data', 'config'].map((f) => fs.readFileSync(path.join(root, 'src', `${f}.js`), 'utf8')).join('\n');
  assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon|<script[^>]+src=|https?:\/\/(?!www\.apple\.com|reportaproblem|support\.apple)[^\s'"`]+\.(js|json)/.test(src.replace(/\/\/.*$/gm, '')), 'app source contains a network call');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const dep of Object.keys(pkg.dependencies)) assert.ok(!/analytics|firebase|sentry|adjust|appsflyer|admob|facebook|amplitude|mixpanel|onesignal|crashlytics/i.test(dep), `tracking SDK ${dep}`);
  const privacyInfo = fs.readFileSync(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
  assert.ok(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(privacyInfo), 'NSPrivacyTracking must be false');
  assert.ok(/<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/.test(privacyInfo), 'no collected data types declared');
});

test('licenses page lists every shipped dependency with its licence text', () => {
  const html = page('licenses'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const dep of Object.keys(pkg.dependencies)) assert.ok(html.includes(dep), `licenses page lacks ${dep}`);
  assert.ok(html.includes('Fredoka') && html.includes('OFL-1.1'));
  assert.ok(html.includes('native-purchases-8.8.1.patch') && site.get('source/native-purchases-8.8.1.patch').includes('retainUntilConsumed'), 'MPL modification is published');
  for (const l of collectLicenses()) assert.ok(l.text.length > 200, l.name);
});

test('placeholder detection catches unfinished publisher details', () => {
  assert.deepEqual(findPlaceholders({ a: 'Jane Doe', b: 'jane@studio.io', c: 'https://studio.io' }), []);
  assert.deepEqual(findPlaceholders({ a: 'YOUR NAME', b: 'x@y.example', c: '', d: 'https://host.example.com/x' }).sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(findPlaceholders({ _readme: 'YOUR', ok: 'fine' }), []);
});

test('checked-in site/ folder is up to date, and app identifiers agree', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'legal/site.config.json'), 'utf8'));
  const problems = structuralProblems(cfg);
  assert.deepEqual(problems, [], problems.join('\n'));
});

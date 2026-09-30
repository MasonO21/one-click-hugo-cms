// Game text & App Store listing: en.json is generated from the code and is current, the text helpers behave,
// and the listing fits Apple's field limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../src/data.js';
import { buildEnglish, stringify } from '../tools/i18n-extract.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

test('English text is generated from the code and data, and is up to date (npm run i18n)', () => {
  assert.equal(stringify(buildEnglish()), fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));
});

test('text helpers resolve plurals, placeholders, fallbacks, numbers and durations', async () => {
  const I = await import('../src/i18n.js');
  assert.equal(I.t('Streak: {n} day|Streak: {n} days', { n: 1 }), 'Streak: 1 day');
  assert.equal(I.t('Streak: {n} day|Streak: {n} days', { n: 3 }), 'Streak: 3 days');
  assert.equal(I.t('Rare or better within {n} pull|Rare or better within {n} pulls', { n: '<b>1</b>', count: 1 }), 'Rare or better within <b>1</b> pull');
  assert.equal(I.t('a message the dictionary has never seen'), 'a message the dictionary has never seen');
  assert.equal(I.formName('crab.0'), D.FORMS['crab.0'].name);
  assert.equal(I.decorName(D.figId('crab.0')), `${D.FORMS['crab.0'].name} Figure`);
  assert.equal(I.num(987654), '988K');
  assert.equal(I.num(12345), '12.3K');
  assert.equal(I.num(9999), '9999');
  assert.equal(I.dur(90 * 60e3), '1h 30m');
  assert.equal(I.list(['a', 'b', 'c']), 'a, b, and c');
  assert.equal(I.sentences('One', 'Two!'), 'One. Two!');
});

test('every creature has a name, blurb and hint', () => {
  const en = load('src/locales/en.json');
  for (const id of D.FORM_IDS) assert.ok(en[`form:${id}`] && en[`blurb:${id}`], id);
  for (const fam of D.FAMILY_IDS) assert.ok(en[`hint:${fam}`], fam);
});

test("App Store listing is complete and within Apple's limits", () => {
  const L = load('store/listing/en.json');
  for (const k of ['name', 'subtitle', 'promo', 'keywords', 'description', 'whatsNew']) assert.ok(L[k] && String(L[k]).trim(), `listing: ${k} missing`);
  assert.ok([...L.name].length <= 30, `name ${[...L.name].length} > 30`);
  assert.ok([...L.subtitle].length <= 30, `subtitle ${[...L.subtitle].length} > 30`);
  assert.ok([...L.promo].length <= 170, `promo ${[...L.promo].length} > 170`);
  assert.ok([...L.keywords].length <= 100, `keywords ${[...L.keywords].length} > 100 characters`);
  assert.ok(!/,\s/.test(L.keywords), 'keywords: no spaces after commas (they waste characters)');
  assert.ok([...L.description].length <= 4000, 'description too long');
  assert.ok([...L.whatsNew].length <= 4000);
  assert.ok(/^Contains in-game purchases \(includes random items\)\./.test(L.description), 'the description must open with the paid-random-items notice');
  assert.deepEqual(Object.keys(L.iap).sort(), Object.keys(D.PRODUCTS).map((id) => id.slice(D.APP_ID.length + 1)).sort(), 'every product needs a listing entry');
  for (const [id, p] of Object.entries(L.iap)) {
    assert.ok(p.name && [...p.name].length <= 30, `IAP ${id} name "${p.name}" (${[...(p.name || '')].length}/30)`);
    assert.ok(p.description && [...p.description].length <= 45, `IAP ${id} description "${p.description}" (${[...(p.description || '')].length}/45)`);
  }
});

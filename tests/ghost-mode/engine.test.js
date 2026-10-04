/*
 * Tests for the Ghost Mode for Kids detection engine.
 * The engine lives inside site/static/ghost-mode/index.html; this file pulls that
 * section out of the page (between "const SENS=" and the state marker) and runs it,
 * so the tests always check exactly what ships.
 *
 * Run: yarn test:ghost-mode   (or: node tests/ghost-mode/engine.test.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const page = fs.readFileSync(path.join(__dirname, '../../site/static/ghost-mode/index.html'), 'utf8');
const start = page.indexOf('const SENS=');
const end = page.indexOf('/* ---------- state ---------- */');
assert(start > 0 && end > start, 'Could not find the detection engine section in index.html');
const engine = new Function(page.slice(start, end) + ';return {normalize, MARKERS, sharedKinds, ageProfile, statedAge};')();
const { normalize, MARKERS, sharedKinds, ageProfile, statedAge } = engine;

const detect = text => {
  const n = normalize(text);
  return MARKERS.filter(m => m.re.some(r => r.test(n))).map(m => m.id).sort();
};

let passed = 0;
const failures = [];
function check(label, fn) {
  try { fn(); passed++; } catch (err) { failures.push(`${label}\n    ${err.message}`); }
}
const signs = (text, expected) => check(`signs in ${JSON.stringify(text)}`, () => {
  assert.deepStrictEqual(detect(text), expected.slice().sort(), `normalized as ${JSON.stringify(normalize(text))}`);
});

// Warning signs, plain and disguised
signs("don't tell your parents ok? it's our secret", ['secrecy_request']);
signs('dont tell ur parents k', ['secrecy_request']);
signs('\u{1F92B}', ['secrecy_request']);
signs('d3lete this ch4t after ok', ['secrecy_request']);
signs("they wouldn't understand, only i get you", ['turning_against_family']);
signs('ur parents r so strict', ['turning_against_family']);
signs('i can send you 800 robux if you want', ['gift_or_money']);
signs("i'll send you \u{1F4B8}", ['gift_or_money']);
signs('want some robux?', ['gift_or_money']);
signs('free vbucks for you', ['gift_or_money']);
signs("add me on sn@p, it's easier", ['move_to_private_app']);
signs('add me on s n a p', ['move_to_private_app']);
signs('talk somewhere more private?', ['move_to_private_app']);
signs('are ur parents home rn?', ['personal_info_request']);
signs('what school do you go to?', ['personal_info_request']);
signs("send me a p1c so i know it's really you \u{1F4F8}", ['photo_request']);
signs('send me a p i c', ['photo_request']);
signs('pleeease send a selfieee', ['photo_request']);
signs('wanna facetime?', ['photo_request']);
signs('i could pick u up after school', ['meetup_request']);
signs("i'll be near your school tmrw", ['meetup_request']);
signs("you're so hot", ['romantic_or_sexual_talk']);
signs("you're really mature for your age", ['maturity_talk']);
signs("you're not like other girls", ['maturity_talk']);

// Everyday messages that must stay quiet
signs('r u a kid lol', []);
signs("it's so hot outside today", []);
signs('science class was fun', []);
signs('the snapdragon level is cool', []);
signs('see you at 4pm for practice', []);
signs('did you finish the science worksheet', []);
signs('Love you sweetheart! See you Sunday for pancakes', []);
signs('my parents are home', []);
signs('oh snap i forgot', []);
signs('shh the baby is sleeping', []);
signs('i can get you a ride home after practice', []);
signs("i'll send you the homework", []);
signs('snap me later', ['move_to_private_app']);
signs('whats ur snap', ['move_to_private_app']);
signs("shhh don't tell anyone", ['secrecy_request']);

// What the kid is about to share (think-twice prompt)
const shares = (text, expected) => check(`sharing in ${JSON.stringify(text)}`, () => assert.deepStrictEqual(sharedKinds(text), expected));
shares('my number is 555-123-4567', ['your phone number']);
shares('i live at 42 oak street', ['your address']);
shares('i go to lincoln middle school', ['what school you go to']);
shares('im home alone rn', ["that you're home alone"]);
shares('my mom isnt home', ["that you're home alone"]);
shares("i'm at practice till 6", []);
shares('we have 3 tests this week', []);

// Stated ages: real ones count, times and distances don't
const age = (text, expected) => check(`age in ${JSON.stringify(text)}`, () => assert.strictEqual(statedAge(normalize(text)), expected));
age("i'm 19 btw", 19);
age('i am 27', 27);
age('im 25yo', 25);
age('19yrs old here', 19);
age("i'm 15 minutes away", null);
age('im 30 mins late', null);
age('im 12', 12);

// Text-speak normalization
check('normalizes text-speak', () => assert.strictEqual(normalize('r u a kid').trim(), 'are you a kid'));

// Suggested settings get lighter with age
check('age profiles', () => {
  assert.strictEqual(ageProfile(9).sensitivity, 'high');
  assert.strictEqual(ageProfile(12).sensitivity, 'balanced');
  assert.strictEqual(ageProfile(16).alerts.late, false);
  assert.strictEqual(ageProfile(18), null);
});

// Every warning sign needs the fields the app shows to parents
check('marker definitions', () => MARKERS.forEach(m => {
  assert(m.id && m.label && m.desc && m.talk, `${m.id} is missing a field`);
  assert([1, 2, 3, 4].includes(m.w), `${m.id} has weight ${m.w}`);
}));

if (failures.length) {
  console.error(`Ghost Mode engine: ${failures.length} failed, ${passed} passed\n\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`Ghost Mode engine: all ${passed} checks passed`);

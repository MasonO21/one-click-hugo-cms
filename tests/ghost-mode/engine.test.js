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
const engine = new Function(page.slice(start, end) + ';return {normalize, MARKERS, sharedKinds, ageProfile, statedAge, scamVerdict, bullySigns, distressLevel, locationShare};')();
const { normalize, MARKERS, sharedKinds, ageProfile, statedAge, scamVerdict, bullySigns, distressLevel, locationShare } = engine;

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
// Phrasing common in scam and grooming emails
signs('We pay $500 per shoot.', ['gift_or_money']);
signs('Send us a few selfies so we can see your look.', ['photo_request']);
signs('You look so mature in your photos.', ['maturity_talk']);
signs("Don't tell your parents yet. Text us on WhatsApp.", ['secrecy_request', 'move_to_private_app']);
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

// Spanish warning signs (accents are ignored)
signs('No le digas a tus papás, es nuestro secreto', ['secrecy_request']);
signs('Mándame una foto tuya', ['photo_request']);
signs('¿Dónde vives? ¿A qué escuela vas?', ['personal_info_request']);
signs('Agrégame en WhatsApp', ['move_to_private_app']);
signs('Te regalo robux si quieres', ['gift_or_money']);
signs('Eres muy madura para tu edad', ['maturity_talk']);
signs('Nos vemos en persona el sábado', ['meetup_request']);
signs('Hola, ¿cómo estás? ¿Hiciste la tarea?', []);
age('tengo 19 años', 19);
age('tengo 15 minutos', null);
shares('estoy sola en casa', ["that you're home alone"]);
shares('voy a la secundaria lincoln', ['what school you go to']);

// Scams and fake links
const scam = (text, level, mustInclude = []) => check(`scam in ${JSON.stringify(text)}`, () => {
  const v = scamVerdict(text);
  assert.strictEqual(v.level, level, `signs: ${v.signs.join(',')}`);
  mustInclude.forEach(sg => assert(v.signs.includes(sg), `missing ${sg} in ${v.signs.join(',')}`));
});
scam('You won 10,000 free Robux! Claim at robux-gift-claim.xyz', 'watch', ['free_prize', 'lookalike_link']);
scam('free robux here bit.ly/abc123', 'watch', ['free_prize', 'short_link']);
scam('Your account will be deleted. Verify your account at r0blox-login.com', 'watch', ['account_threat', 'lookalike_link']);
scam('send me the code we texted you to verify', 'urgent', ['asks_for_password']);
scam('Mándame tu contraseña para verificar tu cuenta', 'urgent', ['asks_for_password']);
scam('Ganaste robux gratis, reclama tu premio en roblox-premios.xyz', 'watch', ['free_prize', 'lookalike_link']);
scam('check out roblox.com/games/123 it is fun', null);
scam('join my discord server discord.gg/ourclass', null);
scam('send me the code for the server', null);
scam('there is a giveaway at school tomorrow', null);

// Bullying
const bully = (text, expected) => check(`bullying in ${JSON.stringify(text)}`, () => assert.deepStrictEqual(bullySigns(text).sort(), expected.slice().sort()));
bully('ur so ugly lol', ['insults']);
bully('nobody likes you, everyone hates you', ['exclusion']);
bully('kys', ['harm_urging']);
bully('go kill yourself', ['harm_urging']);
bully('watch your back tomorrow', ['threats']);
bully('Eres una perdedora, nadie te quiere', ['insults', 'exclusion']);
bully('you are so funny', []);
bully('this game is so stupid', []);
bully('your hair looks so good today', []);

// Distress in the kid's own messages
const distress = (text, expected) => check(`distress in ${JSON.stringify(text)}`, () => assert.strictEqual(distressLevel(text), expected));
distress("honestly i don't want to be here anymore", 'strong');
distress('nobody would even miss me if i was gone', 'strong');
distress('i hate my life', 'mild');
distress('i want to die', 'mild');
distress('i want to die lol that test was so bad', null);
distress('im dying laughing', null);
distress('this homework is killing me', null);
distress('i could kill for pizza rn', null);
distress('me quiero morir', 'mild');
distress('no quiero seguir viviendo', 'strong');
distress('me quiero morir de risa jajaja', null);

// Live location
const loc = (text, expected) => check(`location in ${JSON.stringify(text)}`, () => assert.strictEqual(locationShare(text), expected));
loc('ok sharing my live location with you', true);
loc('here https://maps.app.goo.gl/xyz', true);
loc('i turned on snap map', true);
loc('te mandé mi ubicación', true);
loc('what location is the party', false);
loc('my location is the library', false);
shares('ok sharing my live location with you', ['your live location']);

// Every Spanish demo scenario line that should count is caught
signs('no, juegas increíble. la verdad hablas como alguien mayor, la edad es solo un número', ['maturity_talk']);
signs('te regalo 800 robux si quieres, no es nada', ['gift_or_money']);
signs('sí, pero el chat de roblox va lento. agrégame en sn@p, es más fácil', ['move_to_private_app']);
signs('y no le digas a tus papás, ¿ok? tus papás no te entenderían. es nuestro secreto', ['secrecy_request', 'turning_against_family']);
signs('genial. mándame una f0to para saber que eres tú \u{1F4F8}', ['photo_request']);
signs('No les digas a tus papás todavía, queremos que sea una sorpresa cuando firmes. Escríbenos por WhatsApp.', ['secrecy_request', 'move_to_private_app']);
signs('shhh no le digas a nadie lo del pastel jaja', ['secrecy_request']);
signs('mi mamá me mata si ve la luz prendida', []);
scam('¡Sí! Verifica tu cuenta: mándame el código que te enviamos.', 'urgent', ['account_threat', 'asks_for_password']);
scam('\u{1F381} ¡Felicidades! Ganaste 10,000 Robux gratis. Reclámalos en robux-gift-claim.xyz', 'watch', ['free_prize', 'lookalike_link']);
bully('eres tan inútil la verdad', ['insults']);
bully('nadie te quiere, sal del grupo', ['exclusion']);
distress('todos me odian. odio mi vida', 'mild');
distress('la verdad ya no quiero vivir así', 'strong');
loc('ok, te mando mi ubicación en tiempo real', true);
age('de nada. tengo 19 por cierto, acabo de entrar a la universidad de arte', 19);
shares('voy a la secundaria lincoln', ['what school you go to']);

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

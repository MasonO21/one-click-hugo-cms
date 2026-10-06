import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SF, Room } from '../src/game.js';

test('enemy heroes hidden in tall grass are not sent', () => {
  const room = new Room({ id: 'r', mode: 'quick', players: [{ pid: 'p1', name: 'One', heroId: 'kaida', skinId: 'kaida_classic', team: 0 }] });
  const m = room.m;
  const foe = m.heroes.find(h => h.team === 1);
  for (const h of m.heroes) { h.brain = null; h.human = true; }
  const bush = m.bushes.find(b => b.y > 850); // the river bush, out of every tower's sight
  foe.x = bush.x; foe.y = bush.y;
  for (const h of m.heroes) if (h !== foe) { h.x = h.team === 0 ? 300 : 2900; h.y = 600; }
  m.nextWave = 1e9;
  m.update(1 / 30);
  const snap = room.snapshotFor(0, 'p1', []);
  assert.ok(!snap.u.some(u => u.i === foe.id), 'hidden enemy omitted');
  assert.ok(snap.hs.some(h => h[0] === foe.id), 'but still on the scoreboard');
  const own = room.snapshotFor(1, null, []);
  assert.ok(own.u.some(u => u.i === foe.id), 'its own team still sees it');
});

test('a full bot-filled online match runs to the end', () => {
  const room = new Room({ id: 'soak', mode: 'quick', players: [{ pid: 'p1', name: 'One', heroId: 'sylva', skinId: 'sylva_classic', team: 0 }] });
  room.setConnected('p1', false);
  room.botTakeover('p1');
  let ticks = 0;
  while (!room.ended && ticks < 30 * 60 * 16) {
    room.step(); ticks++;
    if (ticks % 2 === 0) { const s = room.snapshotFor(0, 'p1', room.eventsFor('p1')); JSON.stringify(s); room.events.length = 0; }
  }
  assert.ok(room.ended, `ended after ${Math.round(ticks / 30)}s`);
  const sum = room.m.summary();
  assert.equal(sum.rows.length, 6);
});

test('client aim is clamped and targets are validated', () => {
  const room = new Room({ id: 'aim', mode: 'quick', players: [{ pid: 'p1', name: 'One', heroId: 'orin', skinId: 'orin_classic', team: 0 }] });
  const h = room.byPid.get('p1');
  const far = room.aimFrom(h, 1, { dir: { x: 1, y: 0 }, p: { x: h.x + 99999, y: h.y } });
  assert.ok(Math.hypot(far.point.x - h.x, far.point.y - h.y) <= SF.HERO.orin.skills[1].range + 1e-6);
  const ally = room.m.heroes.find(x => x.team === 0 && x !== h);
  const bad = room.aimFrom(h, 0, { dir: { x: 1, y: 0 }, tg: ally.id });
  assert.equal(bad.target, null, 'cannot target an ally');
});

test('battle spells: chosen spell is used, sent to clients and validated', () => {
  const room = new Room({ id: 'sp', mode: 'quick', players: [
    { pid: 'p1', name: 'One', heroId: 'nyx', skinId: 'nyx_classic', spell: 'shatter', team: 0 },
    { pid: 'p2', name: 'Two', heroId: 'orin', skinId: 'orin_classic', spell: 'not-a-spell', team: 1 }
  ] });
  const h = room.byPid.get('p1'), foe = room.byPid.get('p2'), m = room.m;
  assert.equal(h.spell, 'shatter');
  assert.equal(foe.spell, 'blink', 'unknown spells fall back to Blink');
  assert.equal(room.rosterInfo().find(r => r.pid === 'p1').sp, 'shatter');
  for (const x of m.heroes) { x.brain = null; x.human = true; if (x !== h && x !== foe) { x.x = x.team ? 3100 : 100; x.y = 600; } }
  m.nextWave = 1e9;
  h.x = 1500; h.y = 600; foe.x = 1700; foe.y = 600; foe.hp = foe.maxHp * 0.4;
  m.updateVisibility();
  const ally = m.heroes.find(x => x.team === 0 && x !== h);
  const hp0 = foe.hp;
  room.input('p1', { t: 'spell', d: { x: 1, y: 0 }, tg: ally.id });   // a bogus target is ignored, not obeyed
  assert.ok(foe.hp < hp0, 'Shatter hit the enemy instead of the ally');
  assert.equal(ally.hp, ally.maxHp);
  const snap = room.snapshotFor(0, 'p1', []);
  assert.equal(snap.me.fcd, SF.SPELLS.shatter.cd);
  const x0 = foe.x;
  room.input('p2', { t: 'flash', d: { x: 1, y: 0 } });   // older clients still send "flash"
  assert.ok(Math.abs(foe.x - (x0 + 250)) < 1);
});

test('quick signals reach teammates only', () => {
  const room = new Room({ id: 'sig', mode: 'quick', players: [
    { pid: 'p1', name: 'One', heroId: 'kaida', skinId: 'kaida_classic', team: 0 },
    { pid: 'p2', name: 'Two', heroId: 'orin', skinId: 'orin_classic', team: 1 }
  ] });
  room.input('p1', { t: 'signal', k: 'retreat' });
  room.input('p1', { t: 'signal', k: 'nonsense' });
  const mine = room.eventsFor('p1'), theirs = room.eventsFor('p2');
  assert.ok(mine.some(e => e[0] === 'sig' && e[1] === 'retreat'), 'sender sees the signal');
  assert.ok(mine.some(e => e[0] === 'msg' && e[3] === 'Retreat!'), 'and the message');
  assert.ok(!theirs.some(e => e[0] === 'sig' || e[0] === 'msg'), 'the enemy sees nothing');
  assert.equal(room.m.orders[0].kind, 'retreat');
  assert.equal(room.m.orders[1], null);
});

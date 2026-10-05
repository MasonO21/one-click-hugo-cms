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

import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadingFilter, hudFrame, pickHeading, GlassesBridge, HapticAdapter, VoiceAdapter } from '../public/lib/glasses.js';
import { headingFromOrientation } from '../public/lib/sensors.js';

const on = { status: 'on-trail', targetBearing: 90, remaining: 1500, progress: 0.25, offDistance: 2, turn: null };

test('hudFrame: arrow is relative to where the wearer faces', () => {
  assert.equal(hudFrame(on, 90).arrowDeg, 0); // facing the target: straight ahead
  assert.equal(hudFrame(on, 0).arrowDeg, 90); // target is to the right
  assert.equal(hudFrame(on, 180).arrowDeg, -90); // target is to the left
  assert.equal(hudFrame(on, 90).arrowRef, 'heading');
  const northUp = hudFrame(on, null);
  assert.equal(northUp.arrowRef, 'north');
  assert.equal(northUp.arrowDeg, 90);
});

test('hudFrame: headline wording per state', () => {
  assert.equal(hudFrame({ status: 'acquiring' }, 0).headline, 'Finding GPS…');
  assert.equal(hudFrame({ status: 'acquiring' }, 0).arrowDeg, null);
  assert.equal(hudFrame(on, 0).headline, 'Follow trail');
  assert.equal(hudFrame(on, 0).remaining, '1.50 km left');
  const turn = hudFrame({ ...on, turn: { direction: 'left', sharpness: 'sharp', distance: 42 } }, 0);
  assert.equal(turn.headline, 'Sharp left');
  assert.equal(turn.distance, 'in 40 m');
  const farTurn = hudFrame({ ...on, turn: { direction: 'left', sharpness: 'sharp', distance: 140 } }, 0);
  assert.equal(farTurn.headline, 'Follow trail');
  const off = hudFrame({ ...on, status: 'off-trail', offDistance: 61 }, 0);
  assert.equal(off.headline, 'Off trail');
  assert.equal(off.distance, '60 m');
  assert.equal(hudFrame({ ...on, status: 'arrived', remaining: 5 }, 0).headline, 'You made it');
  // frames must be plain JSON so they can cross to a glasses companion
  assert.deepEqual(JSON.parse(JSON.stringify(off)), off);
});

test('HeadingFilter smooths across the 359/0 wrap without swinging the long way round', () => {
  const f = new HeadingFilter(0.5);
  f.push(350);
  const v = f.push(10);
  assert.ok(v === 0 || v > 355 || v < 5, `got ${v}`);
  assert.equal(f.push(NaN), v);
});

test('pickHeading prefers glasses > compass > gps course (only when moving)', () => {
  assert.deepEqual(pickHeading({ glasses: 10, compass: 20, course: 30 }), { deg: 10, source: 'glasses' });
  assert.deepEqual(pickHeading({ compass: 20, course: 30 }), { deg: 20, source: 'compass' });
  assert.deepEqual(pickHeading({ course: 30, speedMps: 1.2 }), { deg: 30, source: 'gps-course' });
  assert.deepEqual(pickHeading({ course: 30, speedMps: 0.1 }), { deg: null, source: 'none' });
});

test('bridge only pushes to available adapters', () => {
  const seen = [];
  const mk = (name, ok) => ({ name, available: () => ok, send: (f, e) => seen.push([name, f, e]) });
  const b = new GlassesBridge([mk('a', true), mk('b', false)]);
  b.push({ x: 1 }, [{ type: 'turn' }]);
  assert.deepEqual(seen, [['a', { x: 1 }, [{ type: 'turn' }]]]);
  assert.deepEqual(b.active, ['a']);
});

test('voice + haptic adapters react to events', () => {
  const said = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const voice = new VoiceAdapter({ speaking: false, pending: false, speak: (u) => said.push(u.text), cancel() {} });
  voice.send({}, [{ type: 'turn', direction: 'left', sharpness: 'normal', distance: 35 }, { type: 'off-trail', distance: 42 }]);
  assert.deepEqual(said, ['Turn left in 35 metres', 'Off trail by 40 metres. Follow the arrow back.']);
  voice.enabled = false;
  voice.send({}, [{ type: 'arrived' }]);
  assert.equal(said.length, 2);

  const buzzes = [];
  const haptic = new HapticAdapter({ vibrate: (p) => buzzes.push(p) });
  haptic.send({}, [{ type: 'off-trail' }, { type: 'turn', direction: 'right' }]);
  assert.equal(buzzes.length, 2);
  assert.equal(new HapticAdapter({}).available(), false);
});

test('compass: iOS heading passes through; Android needs the absolute event', () => {
  assert.equal(headingFromOrientation({ webkitCompassHeading: 123 }), 123);
  assert.equal(headingFromOrientation({ absolute: true, alpha: 90 }), 270);
  assert.equal(headingFromOrientation({ absolute: false, alpha: 90 }), null);
  assert.equal(headingFromOrientation({ absolute: true, alpha: null }), null);
});

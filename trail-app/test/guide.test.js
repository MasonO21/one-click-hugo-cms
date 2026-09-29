import test from 'node:test';
import assert from 'node:assert/strict';
import { Guide, describeEvent } from '../public/lib/guide.js';
import { angleDiff, bearing, destination, formatDistance, haversine } from '../public/lib/geo.js';
import { makeDemoTrail, Walker } from '../public/lib/sim.js';
import { reverseTrail, toPoints } from '../public/lib/trail.js';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b} (±${eps})`);

function walk(guide, points, opts = {}, until = () => false) {
  const w = new Walker(points, { speedMps: 1.4, noiseM: 2, ...opts });
  const states = [];
  while (!w.done) {
    const fix = w.next(1);
    const s = guide.update(fix);
    states.push({ fix, s });
    if (until(w, s)) break;
  }
  return { w, states };
}

test('walking the demo loop: stays on trail, arrow leads the walker, and it arrives', () => {
  const trail = makeDemoTrail();
  const pts = toPoints(trail);
  const g = new Guide(pts, trail.waypoints);
  const { states } = walk(g, pts);

  const offEvents = states.flatMap(({ s }) => s.events).filter((e) => e.type.startsWith('off-trail'));
  assert.equal(offEvents.length, 0, 'GPS noise alone must not trigger off-trail');

  // The arrow must point roughly the way the walker is heading (they follow the trail).
  const usable = states.filter(({ s }) => s.status === 'on-trail');
  const bad = usable.filter(({ fix, s }) => Math.abs(angleDiff(s.targetBearing, fix.heading)) > 60);
  assert.ok(bad.length / usable.length < 0.05, `arrow disagreed with travel direction ${bad.length}/${usable.length} times`);

  const last = states[states.length - 1].s;
  assert.equal(last.status, 'arrived');
  assert.ok(states.some(({ s }) => s.events.some((e) => e.type === 'arrived')));
});

test('announces turns and waypoints exactly once each', () => {
  const trail = makeDemoTrail();
  const pts = toPoints(trail);
  const g = new Guide(pts, trail.waypoints);
  const { states } = walk(g, pts);
  const events = states.flatMap(({ s }) => s.events);
  const wps = events.filter((e) => e.type === 'waypoint');
  assert.equal(wps.length, trail.waypoints.length);
  assert.deepEqual(wps.map((e) => e.waypoint.kind).sort(), trail.waypoints.map((w) => w.kind).sort());
  const turns = events.filter((e) => e.type === 'turn');
  assert.ok(turns.length >= 5, `expected several turns on the demo loop, got ${turns.length}`);
  for (const t of turns) assert.ok(['left', 'right'].includes(t.direction));
  assert.match(describeEvent(turns[0], formatDistance), /^(Bear|Sharp|Turn) (left|right) in \d+ m$/);
});

test('wandering off: arrow points back at the trail, then recovers', () => {
  // straight trail so "60 m to the right" has one unambiguous nearest point
  const o = { lat: 40, lng: -105 };
  const pts = [];
  for (let d = 0; d <= 1200; d += 10) pts.push(destination(o, 90, d));
  const g = new Guide(pts, []);
  const w = new Walker(pts, { speedMps: 1.4, noiseM: 0, startAlong: 300 });
  for (let i = 0; i < 20; i++) g.update(w.next(1)); // settle on trail
  assert.equal(g.last.status, 'on-trail');

  w.lateralM = 60; // 60 m to the right (south) of the trail
  const fix = w.next(1);
  const s = g.update(fix);
  assert.equal(s.status, 'off-trail');
  near(s.offDistance, 60, 1);
  assert.ok(s.events.some((e) => e.type === 'off-trail'));
  // Nearest trail is straight to the LEFT of travel (north), i.e. heading - 90 = 0
  near(angleDiff(s.targetBearing, fix.heading - 90), 0, 1);

  // Still off a moment later: no event spam
  assert.equal(g.update(w.next(1)).events.filter((e) => e.type === 'off-trail').length, 0);

  w.lateralM = 5; // walked back to the trail
  const back = g.update(w.next(1));
  assert.equal(back.status, 'on-trail');
  assert.ok(back.events.some((e) => e.type === 'back-on-trail'));
});

test('hysteresis: hovering around the threshold does not flap', () => {
  const trail = makeDemoTrail();
  const pts = toPoints(trail);
  const g = new Guide(pts, [], { offTrailM: 30, backOnTrailM: 18 });
  const w = new Walker(pts, { speedMps: 1, noiseM: 0, startAlong: 200 });
  g.update(w.next(1));
  const changes = [];
  let prev = g.last.status;
  for (const lat of [10, 25, 32, 26, 22, 28, 31, 24, 20, 17, 10]) {
    w.lateralM = lat;
    const s = g.update(w.next(1));
    if (s.status !== prev) changes.push(s.status);
    prev = s.status;
  }
  assert.deepEqual(changes, ['off-trail', 'on-trail']);
});

test('out-and-back trail: does not jump to the return leg while on the outbound leg', () => {
  const o = { lat: 40, lng: -105 };
  const out = [];
  for (let d = 0; d <= 400; d += 10) out.push(destination(o, 90, d));
  const back = out.slice(0, -1).reverse().map((p) => destination(p, 0, 1)); // 1 m offset so it isn't a duplicate
  const pts = [...out, ...back];
  const g = new Guide(pts);
  const w = new Walker(pts, { speedMps: 1.5, noiseM: 0 });
  let maxJump = 0;
  let prevAlong = null;
  while (!w.done) {
    const s = g.update(w.next(1));
    if (prevAlong != null) maxJump = Math.max(maxJump, Math.abs(s.along - prevAlong));
    prevAlong = s.along;
  }
  assert.ok(maxJump < 5, `along-track jumped by ${maxJump} m`);
  assert.equal(g.last.status, 'arrived');
});

test('starting part-way along the trail is found by the global search', () => {
  const trail = makeDemoTrail();
  const pts = toPoints(trail);
  const g = new Guide(pts, []);
  const w = new Walker(pts, { noiseM: 0, startAlong: 900 });
  const s = g.update(w.next(1));
  assert.equal(s.status, 'on-trail');
  near(s.along, 901.3, 3);
  near(s.progress, s.along / s.total, 1e-9);
});

test('reversed trail guides the other way', () => {
  const trail = reverseTrail(makeDemoTrail());
  const pts = toPoints(trail);
  const g = new Guide(pts, []);
  const { states } = walk(g, pts, { noiseM: 1 });
  assert.equal(states[states.length - 1].s.status, 'arrived');
});

test('poor GPS accuracy is ignored, not treated as off-trail', () => {
  const trail = makeDemoTrail();
  const pts = toPoints(trail);
  const g = new Guide(pts, []);
  assert.equal(g.update({ lat: pts[5].lat, lng: pts[5].lng, accuracy: 200 }).status, 'acquiring');
  g.update({ lat: pts[5].lat, lng: pts[5].lng, accuracy: 6 });
  const far = destination(pts[5], 0, 500);
  const s = g.update({ ...far, accuracy: 150 });
  assert.equal(s.status, 'weak-gps');
  assert.equal(g.off, false);
});

test('near the end the arrow points at the trail end, not past it', () => {
  const trail = makeDemoTrail();
  const pts = toPoints(trail);
  const g = new Guide(pts, []);
  const w = new Walker(pts, { noiseM: 0, startAlong: 0 });
  w.along = g.path.total - 15;
  const fix = w.next(0.001);
  const s = g.update(fix);
  const endBearing = bearing(fix, pts[pts.length - 1]);
  near(angleDiff(s.targetBearing, endBearing), 0, 1);
  assert.ok(haversine(fix, pts[pts.length - 1]) < 20);
});

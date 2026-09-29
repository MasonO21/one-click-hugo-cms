import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder } from '../public/lib/recorder.js';
import { gpxToTrail, trailToGpx } from '../public/lib/gpx.js';
import { LIMITS, makeTrail, reverseTrail, toPoints, toSummary, validateTrail } from '../public/lib/trail.js';
import { destination, haversine } from '../public/lib/geo.js';
import { makeDemoTrail, recordWalk } from '../public/lib/sim.js';

const O = { lat: 40, lng: -105 };

test('recorder: keeps a clean track from a noisy walk and compacts it', () => {
  const demo = makeDemoTrail();
  const fixes = recordWalk(toPoints(demo), { speedMps: 1.4, noiseM: 3, seed: 3 });
  const rec = new Recorder();
  for (const f of fixes) rec.addFix(f);
  const trail = rec.finish({ name: 'Test', source: 'phone' });
  // a 1 Hz recording of a ~2 km loop is ~1500 fixes; the saved trail must be far smaller
  assert.ok(fixes.length > 1000);
  assert.ok(trail.points.length < fixes.length / 4, `${trail.points.length} of ${fixes.length}`);
  // ...without materially changing its length
  assert.ok(Math.abs(trail.stats.distance - demo.stats.distance) / demo.stats.distance < 0.06);
});

test('recorder: rejects bad accuracy and teleports, skips jitter', () => {
  const rec = new Recorder();
  const t0 = 1_000_000;
  assert.equal(rec.addFix({ ...O, accuracy: 5, t: t0 }), 'kept');
  assert.equal(rec.addFix({ ...destination(O, 0, 1), accuracy: 5, t: t0 + 1000 }), 'skipped');
  assert.equal(rec.addFix({ ...destination(O, 0, 50), accuracy: 80, t: t0 + 2000 }), 'rejected');
  assert.equal(rec.addFix({ ...destination(O, 0, 2000), accuracy: 5, t: t0 + 3000 }), 'rejected'); // 2 km in 3 s
  assert.equal(rec.addFix({ ...destination(O, 0, 12), accuracy: 5, t: t0 + 4000 }), 'kept');
  assert.equal(rec.points.length, 2);
  assert.equal(rec.rejected, 2);
});

test('recorder: waypoint needs a fix; finish needs movement', () => {
  const rec = new Recorder();
  assert.throws(() => rec.addWaypoint({ kind: 'water' }), /GPS fix/);
  rec.addFix({ ...O, accuracy: 5, t: 1 });
  const wp = rec.addWaypoint({ kind: 'water', text: 'spring' });
  assert.equal(wp.text, 'spring');
  assert.throws(() => rec.finish(), /Not enough/);
});

test('validateTrail: normalises and recomputes stats; ignores client-supplied stats', () => {
  const raw = makeDemoTrail();
  const v = validateTrail({ ...raw, stats: { distance: 1 }, name: '  Hi\u0000there  ' });
  assert.equal(v.name, 'Hi there');
  assert.equal(v.stats.distance, raw.stats.distance);
  assert.equal(v.id, undefined);
  assert.equal(validateTrail(raw, { keepId: true }).id, raw.id);
});

test('validateTrail: rejects malformed / oversized / unsafe input', () => {
  const ok = [[40, -105, 1, 0], [40.001, -105, 2, 1000]];
  assert.throws(() => validateTrail(null), /object/);
  assert.throws(() => validateTrail({ points: [[1, 2]] }), /at least 2/);
  assert.throws(() => validateTrail({ points: [[95, 0], [0, 0]] }), /out of range/);
  assert.throws(() => validateTrail({ points: [['a', 0], [0, 0]] }), /malformed/);
  assert.throws(() => validateTrail({ points: Array(LIMITS.maxPoints + 1).fill([1, 1]) }), /Too many points/);
  assert.throws(() => validateTrail({ points: ok, waypoints: [{ lat: 1, lng: 1, photo: 'javascript:alert(1)' }] }), /JPEG/);
  assert.throws(() => validateTrail({ points: ok, waypoints: [{ lat: 1, lng: 1, photo: 'data:image/svg+xml;base64,AAAA' }] }), /JPEG/);
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(LIMITS.maxPhotoChars);
  assert.throws(() => validateTrail({ points: ok, waypoints: [{ lat: 1, lng: 1, photo: big }] }), /JPEG/);
  const good = validateTrail({ points: ok, waypoints: [{ lat: 1, lng: 1, kind: 'bogus', photo: 'data:image/jpeg;base64,/9j/AAAA' }] });
  assert.equal(good.waypoints[0].kind, 'note');
});

test('reverseTrail flips geometry and drops meaningless timestamps', () => {
  const t = makeDemoTrail();
  const r = reverseTrail(t);
  assert.deepEqual(r.points[0].slice(0, 2), t.points.at(-1).slice(0, 2));
  assert.ok(r.points.every((p) => p[3] == null));
  assert.equal(r.stats.distance, t.stats.distance);
});

test('toSummary omits geometry and photos, adds distance from user', () => {
  const s = toSummary(makeDemoTrail(), 1234.6);
  assert.equal(s.points, undefined);
  assert.equal(s.distanceFromUserM, 1235);
  assert.ok(s.stats.distance > 1500);
});

test('GPX round-trips a trail (geometry, elevation, time, waypoints)', () => {
  const t = makeDemoTrail();
  const xml = trailToGpx({ ...t, name: 'A & B <loop>' });
  assert.match(xml, /A &amp; B &lt;loop&gt;/);
  const back = gpxToTrail(xml);
  assert.equal(back.name, 'A & B <loop>');
  assert.equal(back.points.length, t.points.length);
  assert.ok(haversine({ lat: back.points[10][0], lng: back.points[10][1] }, { lat: t.points[10][0], lng: t.points[10][1] }) < 0.01);
  assert.equal(back.points[10][2], t.points[10][2]);
  assert.equal(back.points[10][3], t.points[10][3]);
  assert.deepEqual(back.waypoints.map((w) => [w.kind, w.text]), t.waypoints.map((w) => [w.kind, w.text]));
  assert.equal(back.source, 'gpx');
});

test('GPX import handles foreign files: single quotes, reordered attrs, routes, no <time>', () => {
  const xml = `<gpx version='1.1'><rte><name>Route X</name>
    <rtept lon='-105.1' lat='40.0'><ele>1600</ele></rtept>
    <rtept lat="40.001" lon="-105.1"/></rte></gpx>`;
  const t = gpxToTrail(xml);
  assert.equal(t.name, 'Route X');
  assert.equal(t.points.length, 2);
  assert.deepEqual(t.points[0], [40, -105.1, 1600, null]);
  assert.throws(() => gpxToTrail('<html/>'), /Not a GPX/);
  assert.throws(() => gpxToTrail('<gpx><trk><trkseg></trkseg></trk></gpx>'), /no track/);
});

test('recorder: snapshot/restore continues a recording after a crash', () => {
  const a = new Recorder();
  a.addFix({ ...O, accuracy: 5, t: 1000 });
  a.addFix({ ...destination(O, 0, 20), accuracy: 5, t: 5000 });
  a.addWaypoint({ kind: 'view', text: 'ridge' });
  const b = Recorder.restore(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(b.points.length, 2);
  assert.equal(b.waypoints.length, 1);
  assert.equal(b.addFix({ ...destination(O, 0, 45), accuracy: 5, t: 9000 }), 'kept');
  assert.equal(b.finish({ name: 'Resumed' }).points.length >= 2, true);
  assert.ok(b.distance > 40);
});

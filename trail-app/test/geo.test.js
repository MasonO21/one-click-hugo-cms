import test from 'node:test';
import assert from 'node:assert/strict';
import {
  angleDiff, bearing, boundingBox, buildPath, closestOnPath, compassName, destination,
  elevationGain, formatDistance, haversine, normalizeDeg, pointAtDistance, simplify,
} from '../public/lib/geo.js';

const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b} (±${eps})`);

test('haversine: one degree of latitude is ~111.2 km', () => {
  near(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 111195, 100);
});

test('bearing: cardinal directions', () => {
  const o = { lat: 40, lng: -105 };
  near(bearing(o, { lat: 41, lng: -105 }), 0, 0.01);
  near(bearing(o, { lat: 40, lng: -104 }), 90, 0.5);
  near(bearing(o, { lat: 39, lng: -105 }), 180, 0.01);
  near(bearing(o, { lat: 40, lng: -106 }), 270, 0.5);
});

test('destination is the inverse of bearing/haversine', () => {
  const o = { lat: 40, lng: -105 };
  const d = destination(o, 37, 800);
  near(haversine(o, d), 800, 0.01);
  near(bearing(o, d), 37, 0.01);
});

test('angleDiff wraps around north', () => {
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(350, 10), -20);
  assert.equal(angleDiff(180, 0), 180);
  assert.equal(normalizeDeg(-90), 270);
});

test('pointAtDistance interpolates and clamps', () => {
  const o = { lat: 40, lng: -105 };
  const b = destination(o, 90, 100);
  const path = buildPath([o, b]);
  const mid = pointAtDistance(path, 50);
  near(haversine(o, mid), 50, 0.05);
  near(mid.bearing, 90, 0.5);
  near(haversine(pointAtDistance(path, 999), b), 0, 0.001);
  near(haversine(pointAtDistance(path, -5), o), 0, 0.001);
});

test('closestOnPath finds along-track distance and respects the window', () => {
  // out-and-back: east 200 m then straight back west
  const o = { lat: 40, lng: -105 };
  const e = destination(o, 90, 200);
  const path = buildPath([o, e, { ...o, lat: o.lat + 0.000001 }]);
  const p = destination(destination(o, 90, 100), 0, 8); // 8 m north of the midpoint
  const any = closestOnPath(path, p);
  near(any.distance, 8, 0.6);
  // Windowed to the return leg (~200-400 m) the projection lands there instead
  const back = closestOnPath(path, p, 250, 400);
  near(back.along, 300, 1.5);
});

test('simplify keeps corners and drops collinear points', () => {
  const o = { lat: 40, lng: -105 };
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push(destination(o, 90, i * 10));
  const corner = pts[pts.length - 1];
  for (let i = 1; i <= 20; i++) pts.push(destination(corner, 0, i * 10));
  const s = simplify(pts, 1);
  assert.equal(s.length, 3);
  assert.deepEqual(s[1], corner);
});

test('elevationGain ignores noise inside the dead band', () => {
  const pts = [100, 101, 99, 102, 100, 110, 120, 115].map((ele) => ({ lat: 0, lng: 0, ele }));
  assert.deepEqual(elevationGain(pts, 3), { ascent: 20, descent: 5 });
});

test('boundingBox / compassName / formatDistance', () => {
  assert.deepEqual(boundingBox([{ lat: 1, lng: 5 }, { lat: 3, lng: 2 }]), { minLat: 1, minLng: 2, maxLat: 3, maxLng: 5 });
  assert.equal(compassName(44), 'NE');
  assert.equal(compassName(359), 'N');
  assert.equal(formatDistance(42), '40 m');
  assert.equal(formatDistance(1234), '1.23 km');
  assert.equal(formatDistance(12345), '12.3 km');
});

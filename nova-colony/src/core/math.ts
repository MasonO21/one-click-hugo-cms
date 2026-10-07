export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.sqrt(dist2(ax, az, bx, bz));
/** Shortest signed angle difference a->b in radians. */
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** Move angle a toward b by at most step radians. */
export const approachAngle = (a: number, b: number, step: number) => {
  const d = angleDiff(a, b);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
};
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

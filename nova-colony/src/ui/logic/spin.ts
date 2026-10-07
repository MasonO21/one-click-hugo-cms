/** Spin-wheel geometry. The wheel rotates clockwise; the pointer sits at the top (12 o'clock). */

/** Final cumulative rotation (degrees) so that segment `index` rests under the pointer. */
export function spinTarget(currentRot: number, index: number, count: number, turns = 5, jitter = 0): number {
  const seg = 360 / count;
  // segment i spans [i*seg, (i+1)*seg) clockwise from the top when the wheel is at rotation 0
  const centre = (index + 0.5 + Math.max(-0.4, Math.min(0.4, jitter))) * seg;
  const wanted = (((360 - centre) % 360) + 360) % 360;
  const cur = ((currentRot % 360) + 360) % 360;
  const delta = (wanted - cur + 360) % 360;
  return currentRot + turns * 360 + delta;
}

/** Which segment is under the pointer at a given rotation. */
export function segmentAtRotation(rot: number, count: number): number {
  const seg = 360 / count;
  const under = (((-rot) % 360) + 360) % 360;
  return Math.floor(under / seg) % count;
}

/** easeOutQuart for the wheel deceleration. */
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

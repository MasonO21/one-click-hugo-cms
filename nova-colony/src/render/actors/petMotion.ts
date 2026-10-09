/**
 * Pet follow motion (pure, allocation-free, no three.js): a pet trails the player with a gentle lag
 * toward a favourite spot beside them, keeps up with vehicles (its top speed scales with the
 * player's), never crowds the player, turns to face where it goes, and sits once the player has
 * stood still for a moment. Purely visual: nothing in the sim knows about it.
 */

export interface PetMotion {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Facing (yaw, same convention as the player's rot: forward = (sin, cos)). */
  rot: number;
  /** Planar speed (world units / s). */
  speed: number;
  /** 0 standing .. 1 sitting (eased). */
  sit: number;
  /** Seconds both pet and player have been still. */
  still: number;
  /** Gait phase (radians). */
  phase: number;
  init: boolean;
}

export interface PetFollow {
  /** Favourite spot: to the player's right (+) and behind (+), world units. */
  side: number;
  back: number;
  /** Follow lag, seconds. */
  lag: number;
  /** Gait cycles per unit travelled (0 = no gait). */
  stride: number;
  /** Ground pets keep this much space from the player. */
  personal?: number;
}

/** Farther than this from the player and the pet simply reappears at its spot (fast travel, teleports). */
export const PET_SNAP_DIST = 28;
/** Seconds of stillness before the pet sits. */
export const PET_SIT_AFTER = 0.8;
/** The pet's own cruising speed; it borrows the player's when the player is faster (vehicles). */
export const PET_BASE_SPEED = 3.6;

export function newPetMotion(): PetMotion {
  return { x: 0, z: 0, vx: 0, vz: 0, rot: 0, speed: 0, sit: 0, still: 0, phase: 0, init: false };
}

function angleTo(from: number, to: number): number {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d;
}

/**
 * Advance the pet one frame. (px, pz, prot) = the player; pSpeed = the player's planar speed.
 */
export function stepPet(m: PetMotion, px: number, pz: number, prot: number, pSpeed: number, dt: number, f: PetFollow): void {
  const fx = Math.sin(prot);
  const fz = Math.cos(prot);
  // right of the player's facing (forward rotated -90° about Y)
  const rx = -fz;
  const rz = fx;
  const tx = px + rx * f.side - fx * f.back;
  const tz = pz + rz * f.side - fz * f.back;
  if (!m.init || (m.x - px) ** 2 + (m.z - pz) ** 2 > PET_SNAP_DIST * PET_SNAP_DIST) {
    m.x = tx;
    m.z = tz;
    m.vx = m.vz = 0;
    m.rot = prot;
    m.speed = 0;
    m.init = true;
    return;
  }
  if (dt <= 0) return;
  // desired velocity toward the spot (critically damped feel), capped by a speed that keeps up with vehicles
  // the lag shrinks as the player speeds up, so the pet stays close behind a running player or a vehicle
  const lag = Math.max(0.05, f.lag / (1 + pSpeed / 4));
  let dvx = (tx - m.x) / lag;
  let dvz = (tz - m.z) / lag;
  const cap = Math.max(PET_BASE_SPEED, pSpeed * 1.25);
  const dv = Math.hypot(dvx, dvz);
  if (dv > cap) {
    dvx *= cap / dv;
    dvz *= cap / dv;
  }
  // close enough: settle instead of jittering around the spot
  if (dv * lag < 0.08) dvx = dvz = 0;
  const k = 1 - Math.exp(-dt * 7);
  m.vx += (dvx - m.vx) * k;
  m.vz += (dvz - m.vz) * k;
  m.x += m.vx * dt;
  m.z += m.vz * dt;
  // personal space: never stand inside the player
  const ps = f.personal ?? 0;
  if (ps > 0) {
    const ox = m.x - px;
    const oz = m.z - pz;
    const d = Math.hypot(ox, oz);
    if (d < ps) {
      // straight through the middle: step out to the player's right
      const ux = d > 1e-4 ? ox / d : rx;
      const uz = d > 1e-4 ? oz / d : rz;
      m.x = px + ux * ps;
      m.z = pz + uz * ps;
    }
  }
  m.speed = Math.hypot(m.vx, m.vz);
  // face where it goes; when idle, ease toward the player's heading
  const want = m.speed > 0.35 ? Math.atan2(m.vx, m.vz) : prot;
  const turn = m.speed > 0.35 ? 8 : 2.2;
  m.rot += angleTo(m.rot, want) * (1 - Math.exp(-dt * turn));
  // sit after a moment of stillness
  if (m.speed < 0.25 && pSpeed < 0.25) m.still += dt;
  else m.still = 0;
  const sitTo = m.still > PET_SIT_AFTER ? 1 : 0;
  m.sit += (sitTo - m.sit) * (1 - Math.exp(-dt * (sitTo ? 4 : 9)));
  m.phase += dt * (f.stride * m.speed * Math.PI * 2);
  if (m.phase > Math.PI * 2000) m.phase -= Math.PI * 2000;
}

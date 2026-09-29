// Turn a stream of GPS fixes + a recorded trail into "which way do I walk?" state.
// No DOM, no timers: feed it fixes, read back state. That keeps it testable and lets the
// same engine drive the phone screen, voice cues and a glasses HUD.

import {
  angleDiff,
  bearing,
  buildPath,
  closestOnPath,
  haversine,
  pointAtDistance,
} from './geo.js';

const DEFAULTS = {
  lookaheadM: 25, // how far ahead on the trail the arrow aims
  offTrailM: 30, // farther than this from the trail => off trail
  backOnTrailM: 18, // hysteresis: must get this close to count as back on trail
  arriveM: 20, // within this of the end => arrived
  backWindowM: 40, // how far behind our last position we search first
  forwardWindowM: 250, // how far ahead we search first
  maxAccuracyM: 60, // ignore fixes worse than this
  turnAngle: 35, // degrees of change that count as a turn
  turnAnnounceM: 40, // announce a turn this far before it
  waypointAnnounceM: 40,
  offTrailReminderS: 20,
};

export class Guide {
  /**
   * @param {{lat:number,lng:number,ele?:number}[]} points trail geometry, start to end
   * @param {{lat:number,lng:number,kind?:string,text?:string}[]} waypoints
   */
  constructor(points, waypoints = [], opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.path = buildPath(points);
    this.waypoints = waypoints
      .map((w) => ({ ...w, along: closestOnPath(this.path, w).along }))
      .sort((a, b) => a.along - b.along);
    this.along = null; // metres from the start, null until the first good fix
    this.off = false;
    this.arrived = false;
    this.announced = new Set();
    this.lastOffReminder = 0;
    this.last = { status: 'acquiring', events: [] };
  }

  update(fix) {
    const o = this.opts;
    if (fix.accuracy != null && fix.accuracy > o.maxAccuracyM) {
      this.last = { ...this.last, status: this.along == null ? 'acquiring' : 'weak-gps', events: [] };
      return this.last;
    }
    const events = [];
    const now = fix.t ?? Date.now();

    // 1. Where are we on the trail? Local window first, whole trail as a fallback.
    let match;
    if (this.along == null) {
      match = closestOnPath(this.path, fix);
    } else {
      match = closestOnPath(
        this.path,
        fix,
        this.along - o.backWindowM,
        this.along + o.forwardWindowM,
      );
      if (!match || match.distance > o.offTrailM) {
        const global = closestOnPath(this.path, fix);
        if (global && (!match || global.distance < match.distance - 5)) match = global;
      }
    }
    this.along = match.along;

    // 2. On/off trail with hysteresis so we don't flap at the boundary.
    const wasOff = this.off;
    if (!this.off && match.distance > o.offTrailM) this.off = true;
    else if (this.off && match.distance < o.backOnTrailM) this.off = false;

    const remaining = Math.max(0, this.path.total - this.along);
    const nearEnd = remaining <= o.arriveM && this.path.total > o.arriveM * 2;

    // 3. Where should the arrow point?
    let target;
    if (this.off) {
      target = match.point; // head back to the nearest bit of trail
    } else {
      target = pointAtDistance(this.path, this.along + o.lookaheadM);
    }
    const targetBearing = nearEnd && !this.off
      ? bearing(fix, this.path.points[this.path.points.length - 1])
      : bearing(fix, target);

    // 4. Upcoming turn and waypoint.
    const turn = this.off ? null : this.#upcomingTurn(this.along);
    const nextWaypoint = this.#nextWaypoint(this.along);

    // 5. Status + one-shot events for voice cues.
    let status = this.off ? 'off-trail' : 'on-trail';
    if (nearEnd && !this.off) status = 'arrived';

    if (this.off && !wasOff) {
      events.push({ type: 'off-trail', distance: match.distance, bearing: targetBearing });
      this.lastOffReminder = now;
    } else if (this.off && now - this.lastOffReminder > o.offTrailReminderS * 1000) {
      events.push({ type: 'off-trail-reminder', distance: match.distance, bearing: targetBearing });
      this.lastOffReminder = now;
    } else if (!this.off && wasOff) {
      events.push({ type: 'back-on-trail' });
    }
    if (turn && turn.distance <= o.turnAnnounceM) {
      const key = `turn:${Math.round((this.along + turn.distance) / 25)}`;
      if (!this.announced.has(key)) {
        this.announced.add(key);
        events.push({ type: 'turn', ...turn });
      }
    }
    if (nextWaypoint && nextWaypoint.distance <= o.waypointAnnounceM) {
      const key = `wp:${nextWaypoint.waypoint.along}`;
      if (!this.announced.has(key)) {
        this.announced.add(key);
        events.push({ type: 'waypoint', waypoint: nextWaypoint.waypoint, distance: nextWaypoint.distance });
      }
    }
    if (status === 'arrived' && !this.arrived) {
      this.arrived = true;
      events.push({ type: 'arrived' });
    }

    this.last = {
      status,
      along: this.along,
      remaining,
      total: this.path.total,
      progress: this.path.total > 0 ? this.along / this.path.total : 0,
      offDistance: match.distance,
      target,
      targetBearing,
      turn,
      nextWaypoint,
      events,
    };
    return this.last;
  }

  /** First significant change of direction within the next ~150 m, if any. */
  #upcomingTurn(along) {
    const { turnAngle } = this.opts;
    const span = 12;
    const heading = (d) => {
      const a = pointAtDistance(this.path, d);
      const b = pointAtDistance(this.path, d + span);
      return bearing(a, b);
    };
    if (along + 20 >= this.path.total) return null;
    const base = heading(along);
    for (let d = 15; d <= 150 && along + d + span <= this.path.total; d += 5) {
      const diff = angleDiff(heading(along + d), base);
      if (Math.abs(diff) >= turnAngle) {
        // measure how sharp the turn really is over the next stretch
        let peak = diff;
        for (let e = d + 5; e <= d + 30 && along + e + span <= this.path.total; e += 5) {
          const dd = angleDiff(heading(along + e), base);
          if (Math.abs(dd) > Math.abs(peak)) peak = dd;
        }
        const abs = Math.abs(peak);
        return {
          distance: d,
          angle: Math.round(abs),
          direction: peak > 0 ? 'right' : 'left',
          sharpness: abs > 150 ? 'u-turn' : abs > 100 ? 'sharp' : abs > 60 ? 'normal' : 'slight',
        };
      }
    }
    return null;
  }

  #nextWaypoint(along) {
    const w = this.waypoints.find((x) => x.along > along - 5);
    return w ? { waypoint: w, distance: Math.max(0, w.along - along) } : null;
  }
}

/** Human wording for a guidance event; shared by the voice cues and the HUD toast. */
export function describeEvent(ev, fmt) {
  switch (ev.type) {
    case 'turn':
      if (ev.sharpness === 'u-turn') return `U-turn ${ev.direction} in ${fmt(ev.distance)}`;
      return `${ev.sharpness === 'slight' ? 'Bear' : ev.sharpness === 'sharp' ? 'Sharp' : 'Turn'} ${ev.direction} in ${fmt(ev.distance)}`;
    case 'waypoint':
      return `${labelForKind(ev.waypoint.kind)} ahead${ev.waypoint.text ? `: ${ev.waypoint.text}` : ''}`;
    case 'off-trail':
    case 'off-trail-reminder':
      return `Off trail by ${fmt(ev.distance)}. Follow the arrow back.`;
    case 'back-on-trail':
      return 'Back on trail';
    case 'arrived':
      return 'You have reached the end of the trail';
    default:
      return '';
  }
}

export function labelForKind(kind) {
  return (
    { photo: 'Photo spot', hazard: 'Hazard', water: 'Water', view: 'Viewpoint', note: 'Note', junction: 'Junction' }[
      kind
    ] || 'Waypoint'
  );
}

export { haversine };

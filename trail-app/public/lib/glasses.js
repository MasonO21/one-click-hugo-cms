// The glasses layer. Guidance state is turned into a small, serialisable "HUD frame"
// (arrow angle + a few words). Adapters consume frames and events:
//
//   VoiceAdapter    spoken cues. Works TODAY on any Meta glasses: the phone's audio plays out
//                   through the glasses' speakers over Bluetooth, no SDK needed.
//   HapticAdapter   vibrate the phone on turns / off-trail.
//   PreviewAdapter  draws the exact frame a display would get, in the app (glasses HUD preview).
//   MetaDisplayAdapter  placeholder for pushing frames to a display-equipped Meta glasses through
//                   Meta's developer toolkit. It is a stub: see README "Meta glasses integration".
//
// Because frames are plain JSON, a companion app on the glasses side only has to render them.

import { angleDiff, formatDistance } from './geo.js';
import { describeEvent } from './guide.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TURN_WORD = { slight: 'Bear', normal: 'Turn', sharp: 'Sharp', 'u-turn': 'U-turn' };

/** Guidance state + current heading -> everything a display needs, nothing it doesn't. */
export function hudFrame(state, heading) {
  const headingKnown = heading != null && Number.isFinite(heading);
  const frame = {
    status: state.status,
    arrowDeg: null,
    arrowRef: headingKnown ? 'heading' : 'north',
    headline: '',
    distance: '',
    remaining: '',
    progress: 0,
  };
  if (state.status === 'acquiring') return { ...frame, headline: 'Finding GPS…' };
  if (state.status === 'weak-gps' && state.targetBearing == null) return { ...frame, headline: 'Weak GPS' };

  frame.arrowDeg = headingKnown ? angleDiff(state.targetBearing, heading) : state.targetBearing;
  frame.remaining = state.remaining != null ? `${formatDistance(state.remaining)} left` : '';
  frame.progress = state.progress ?? 0;

  switch (state.status) {
    case 'off-trail':
      frame.headline = 'Off trail';
      frame.distance = formatDistance(state.offDistance);
      break;
    case 'arrived':
      frame.headline = 'You made it';
      frame.remaining = '';
      break;
    case 'weak-gps':
      frame.headline = 'Weak GPS';
      break;
    default:
      if (state.turn && state.turn.distance <= 100) {
        frame.headline = `${TURN_WORD[state.turn.sharpness]} ${state.turn.direction}`;
        frame.distance = `in ${formatDistance(state.turn.distance)}`;
      } else {
        frame.headline = 'Follow trail';
      }
  }
  return frame;
}

/** Smooth a compass heading (circular exponential filter) so the arrow doesn't jitter. */
export class HeadingFilter {
  constructor(alpha = 0.25) {
    this.alpha = alpha;
    this.value = null;
  }
  push(deg) {
    if (deg == null || !Number.isFinite(deg)) return this.value;
    this.value = this.value == null ? deg : (this.value + this.alpha * angleDiff(deg, this.value) + 360) % 360;
    return this.value;
  }
}

/** Which heading do we trust? Glasses IMU (head direction) > phone compass > GPS course while moving. */
export function pickHeading({ glasses, compass, course, speedMps }) {
  if (glasses != null) return { deg: glasses, source: 'glasses' };
  if (compass != null) return { deg: compass, source: 'compass' };
  if (course != null && (speedMps ?? 1) > 0.5) return { deg: course, source: 'gps-course' };
  return { deg: null, source: 'none' };
}

export class VoiceAdapter {
  name = 'voice';
  enabled = true;
  constructor(synth = globalThis.speechSynthesis, fmt = formatDistance) {
    this.synth = synth;
    this.fmt = fmt;
  }
  available() {
    return !!this.synth && this.enabled;
  }
  speak(text) {
    if (!this.available() || !text) return;
    if (this.synth.speaking && this.synth.pending) this.synth.cancel(); // don't build a backlog on a fast walker
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    this.synth.speak(u);
  }
  send(_frame, events) {
    for (const ev of events) this.speak(describeEvent(ev, spokenDistance));
  }
}

/** "35 metres", not "35 m", for the speech engine. */
function spokenDistance(m) {
  return m < 1000 ? `${Math.round(m / 5) * 5 || Math.round(m)} metres` : `${(m / 1000).toFixed(1)} kilometres`;
}

export class HapticAdapter {
  name = 'haptic';
  enabled = true;
  constructor(nav = globalThis.navigator) {
    this.nav = nav;
  }
  available() {
    return this.enabled && typeof this.nav?.vibrate === 'function';
  }
  send(_frame, events) {
    if (!this.available()) return;
    for (const ev of events) {
      if (ev.type === 'off-trail' || ev.type === 'off-trail-reminder') this.nav.vibrate([250, 120, 250]);
      else if (ev.type === 'turn') this.nav.vibrate(ev.direction === 'left' ? [120] : [120, 80, 120]);
      else if (ev.type === 'arrived') this.nav.vibrate([400]);
    }
  }
}

/** Renders frames into an on-screen HUD that mimics a see-through display (black = transparent). */
export class PreviewAdapter {
  name = 'hud-preview';
  constructor(hud = null) {
    this.hud = hud;
  }
  available() {
    return !!this.hud;
  }
  send(frame) {
    this.hud?.update(frame);
  }
}

/**
 * PLACEHOLDER. Wire this to Meta's developer toolkit for display glasses when you have access.
 * `send(frame)` is the only method a display integration needs: draw `frame.arrowDeg`, `headline`,
 * `distance`, `remaining`. `heading()` should return the wearer's head yaw (0 = north) from the
 * glasses IMU so the arrow points where you should LOOK, like a true AR arrow. And
 * `capturePhoto()` would grab a frame from the glasses camera for photo waypoints.
 */
export class MetaDisplayAdapter {
  name = 'meta-display';
  available() {
    return false;
  }
  send(_frame, _events) {}
  heading() {
    return null;
  }
  async capturePhoto() {
    throw new Error('Glasses camera not connected');
  }
}

export class GlassesBridge {
  constructor(adapters = []) {
    this.adapters = adapters;
  }
  get active() {
    return this.adapters.filter((a) => a.available()).map((a) => a.name);
  }
  push(frame, events = []) {
    for (const a of this.adapters) if (a.available()) a.send(frame, events);
  }
  glassesHeading() {
    for (const a of this.adapters) if (a.available() && typeof a.heading === 'function') return a.heading();
    return null;
  }
}

const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
};

/**
 * Build the HUD in `container`. 400x400 viewBox, pure black background, one big arrow,
 * one headline, one number. Deliberately sparse: this is what has to read at a glance while walking.
 */
export function createHud(container) {
  container.replaceChildren();
  const svg = el('svg', { viewBox: '0 0 400 400', class: 'hud-svg', role: 'img', 'aria-label': 'Guidance display' }, container);
  el('rect', { width: 400, height: 400, fill: '#000' }, svg);
  const arrow = el('g', { class: 'hud-arrow' }, svg);
  el('path', { d: 'M0,-105 L70,25 L22,25 L22,95 L-22,95 L-22,25 L-70,25 Z', class: 'hud-arrow-shape' }, arrow);
  const northTag = el('text', { x: 200, y: 60, class: 'hud-north', 'text-anchor': 'middle' }, svg);
  northTag.textContent = 'N-UP';
  const headline = el('text', { x: 200, y: 322, class: 'hud-headline', 'text-anchor': 'middle' }, svg);
  const distance = el('text', { x: 200, y: 362, class: 'hud-distance', 'text-anchor': 'middle' }, svg);
  el('rect', { x: 40, y: 384, width: 320, height: 4, class: 'hud-bar-bg' }, svg);
  const barFill = el('rect', { x: 40, y: 384, width: 0, height: 4, class: 'hud-bar-fill' }, svg);

  return {
    svg,
    update(frame) {
      svg.dataset.status = frame.status;
      arrow.setAttribute('visibility', frame.arrowDeg == null ? 'hidden' : 'visible');
      if (frame.arrowDeg != null) arrow.setAttribute('transform', `translate(200 170) rotate(${frame.arrowDeg.toFixed(1)}) scale(1.05)`);
      northTag.setAttribute('visibility', frame.arrowRef === 'north' && frame.arrowDeg != null ? 'visible' : 'hidden');
      headline.textContent = frame.headline;
      distance.textContent = [frame.distance, frame.remaining].filter(Boolean).join('  ·  ');
      barFill.setAttribute('width', String(Math.round(320 * Math.min(1, Math.max(0, frame.progress)))));
    },
  };
}

/**
 * Haptics for what happens in the world (panels and buttons buzz on their own): a light tap per chop or swing, a
 * warning when you get hurt or a raid is announced, a heavy thud when it starts or you go down, a little success
 * when construction finishes. Each kind has a cooldown and any two buzzes are spaced out, so auto-gathering or
 * a big fight never turns into a constant rattle. The Vibration setting is honoured by `haptic` itself.
 */
import type { EventBus } from '../../core/events';
import type { HapticKind } from '../ctx';

/** Minimum seconds between two buzzes of the same world event. */
export const HAPTIC_COOLDOWN = {
  gather: 0.3,
  hurt: 1.0,
  built: 0.6,
  raid: 2.0,
} as const;
/** Minimum seconds between any two world buzzes. */
const ANY_GAP = 0.08;

type Channel = keyof typeof HAPTIC_COOLDOWN;

export class HapticGate {
  private readonly last = new Map<Channel, number>();
  private lastAny = -Infinity;

  /** True (and remembered) when a buzz on `channel` at time `t` (seconds) is allowed. */
  allow(channel: Channel, t: number): boolean {
    if (t - this.lastAny < ANY_GAP) return false;
    if (t - (this.last.get(channel) ?? -Infinity) < HAPTIC_COOLDOWN[channel]) return false;
    this.last.set(channel, t);
    this.lastAny = t;
    return true;
  }
}

/** Wire world events to haptics. Returns an unsubscribe. */
export function wireHapticFx(bus: EventBus, haptic: (k: HapticKind) => void, now: () => number = () => performance.now() / 1000): () => void {
  const gate = new HapticGate();
  const fire = (channel: Channel, kind: HapticKind) => {
    if (gate.allow(channel, now())) haptic(kind);
  };
  const offs = [
    bus.on('gather:hit', () => fire('gather', 'tap')),
    bus.on('player:damaged', () => fire('hurt', 'warning')),
    bus.on('player:downed', () => fire('hurt', 'heavy')),
    bus.on('combat:warning', () => fire('raid', 'warning')),
    bus.on('combat:started', () => fire('raid', 'heavy')),
    bus.on('building:completed', () => fire('built', 'success')),
  ];
  return () => offs.forEach((off) => off());
}

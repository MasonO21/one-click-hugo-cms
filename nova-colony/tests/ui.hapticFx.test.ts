/** World haptics: the right buzz for each moment, never a constant rattle. */
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { HapticGate, wireHapticFx } from '../src/ui/fx/HapticFx';
import type { HapticKind } from '../src/ui/ctx';

function rig() {
  const bus = new EventBus();
  const buzz: HapticKind[] = [];
  let t = 0;
  const off = wireHapticFx(bus, (k) => buzz.push(k), () => t);
  return { bus, buzz, off, at: (s: number) => (t = s) };
}

describe('world haptics', () => {
  it('each moment gets its own kind of buzz', () => {
    const r = rig();
    r.at(0); r.bus.emit('gather:hit', { node: 1, model: 'tree', x: 0, z: 0, drop: {} });
    r.at(1); r.bus.emit('player:damaged', { amount: 5 });
    r.at(3); r.bus.emit('combat:warning', { wave: 1, seconds: 30 }); // buzzes from platform/hooks.ts, not here
    r.at(6); r.bus.emit('combat:started', { wave: 1, aliens: 6 });
    r.at(8); r.bus.emit('building:completed', { id: 1, def: 'shelter' });
    r.at(10); r.bus.emit('player:downed', {});
    expect(r.buzz).toEqual(['tap', 'warning', 'heavy', 'success', 'heavy']);
  });

  it('auto-gathering taps at most every 0.3 s', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) {
      r.at(i * 0.1);
      r.bus.emit('gather:hit', { node: 1, model: 'tree', x: 0, z: 0, drop: {} });
    }
    // 2 s of hits every 0.1 s -> one tap per 0.3 s
    expect(r.buzz.length).toBe(7);
  });

  it('a batch of buildings finishing together buzzes once', () => {
    const r = rig();
    r.at(5);
    for (let i = 0; i < 6; i++) r.bus.emit('building:completed', { id: i, def: 'wall' });
    expect(r.buzz).toEqual(['success']);
  });

  it('two different moments are still spaced out, and unsubscribing stops everything', () => {
    const g = new HapticGate();
    expect(g.allow('gather', 1)).toBe(true);
    expect(g.allow('hurt', 1.02)).toBe(false);
    expect(g.allow('hurt', 1.1)).toBe(true);
    const r = rig();
    r.off();
    r.bus.emit('combat:started', { wave: 1, aliens: 3 });
    expect(r.buzz).toEqual([]);
  });
});

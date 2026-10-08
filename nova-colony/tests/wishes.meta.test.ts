/**
 * Wishes × the meta layer: the "Good Neighbour" side chain and the `wish` counters, consent-gated analytics, and a
 * full cycle (wish appears, comes true, hearts go up) inside the real Game loop.
 */
import { describe, expect, it, vi } from 'vitest';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';
import { AnalyticsClient } from '../src/platform/analytics';
import type { Wish } from '../src/core/state';
import { colonists, force, placeNear, reload, setAmount, stepDay, tickWishes, wishColony, type Colony } from './wishes.helpers';

const CHAIN = ['s_wish_one', 's_wish_ten', 's_wish_thirty'];

/** Make any open wish come true the way a player would. */
function fulfil(rig: Colony, w: Wish): void {
  const g = rig.game;
  const d = g.sys.wishes.def(w)!;
  switch (d.kind) {
    case 'give':
      setAmount(rig, d.target, w.need + 10);
      expect(g.sys.wishes.give(w.id)).toBe(true);
      break;
    case 'chat': {
      const c = g.sys.colonists.get(w.colonist)!;
      g.state.player.x = c.x + 1;
      g.state.player.z = c.z;
      expect(g.sys.player.interact()).toBe(true);
      break;
    }
    case 'build':
      placeNear(g, d.target);
      break;
    case 'craft': {
      const r = g.data.recipe(d.target)!;
      for (const [k, n] of Object.entries(r.inputs)) setAmount(rig, k, (n ?? 0) + 50);
      expect(g.sys.crafting.craft(r.id)).not.toBeNull();
      stepDay(rig, r.time + 1);
      break;
    }
    case 'explore':
      expect(g.sys.world.lootPoi(g.sys.wishes.exploreSpots()[0].id)).toBe(true);
      break;
  }
  expect(g.sys.wishes.get(w.id)).toBeUndefined();
}

describe('wishes: missions', () => {
  it('the Good Neighbour chain waits for the first wish, then counts every granted one', () => {
    const rig = wishColony();
    const g = rig.game;
    const ms = g.sys.missions;
    for (const id of CHAIN) expect(g.state.missions.active).not.toContain(id);
    const w = force(rig, 'chat_story');
    expect(g.state.missions.active).toContain('s_wish_one');
    expect(ms.progress('s_wish_one').done).toBe(false);
    g.sys.wishes.chat(w.colonist);
    expect(ms.progress('s_wish_one').done).toBe(true);
    expect(ms.counter('wish')).toBe(1);
    expect(ms.counter('wish', 'chat')).toBe(1);
    expect(ms.claim('s_wish_one')).toBe(true);
    // the next step picks up the lifetime count
    expect(g.state.missions.active).toContain('s_wish_ten');
    expect(ms.progress('s_wish_ten').value).toBe(1);
    setAmount(rig, 'food', 1000);
    const give = force(rig, 'give_berry_pie');
    g.sys.wishes.give(give.id);
    expect(ms.progress('s_wish_ten').value).toBe(2);
    expect(ms.counter('wish', 'give')).toBe(1);
  });

  it('a colony that already granted wishes gets the chain with its progress on load', () => {
    const rig = wishColony();
    const g = rig.game;
    g.state.missions.counters['wish:*'] = 12;
    g.state.missions.counters['wish:chat'] = 12;
    g.state.missions.completed.push('s_wish_one');
    const back = reload(rig);
    expect(back.game.state.missions.active).toContain('s_wish_ten');
    expect(back.game.sys.missions.progress('s_wish_ten').done).toBe(true);
  });
});

describe('wishes: analytics', () => {
  it('reports offered / granted / expired with kind and tier only, and only with consent', () => {
    const rig = wishColony();
    const g = rig.game;
    const track = vi.spyOn(g.services.analytics, 'track');
    const off = installAnalyticsHooks(g);
    g.state.settings.analytics = true;
    g.state.settings.analyticsAsked = true;
    stepDay(rig, 1.5);
    const w1 = force(rig, 'chat_story');
    g.sys.wishes.chat(w1.colonist);
    const w2 = force(rig, 'build_lantern');
    g.state.wishes.nextAt = Infinity;
    tickWishes(rig, g.data.wishRules.expire + 2);
    expect(g.sys.wishes.get(w2.id)).toBeUndefined();
    const calls = track.mock.calls.filter((c) => c[0].startsWith('wish_'));
    expect(calls.map((c) => c[0])).toEqual(['wish_offered', 'wish_granted', 'wish_offered', 'wish_expired']);
    for (const [, props] of calls) expect(Object.keys(props ?? {}).sort()).toEqual(['kind', 'tier']);
    expect(calls[1][1]).toEqual({ kind: 'chat', tier: 2 });
    expect(calls[3][1]).toEqual({ kind: 'build', tier: 2 });
    off();
  });

  it('the real client drops wish events until the player opts in', () => {
    const client = new AnalyticsClient({ sink: null });
    const rig = wishColony();
    const g = rig.game;
    (g.services as { analytics: unknown }).analytics = client;
    const off = installAnalyticsHooks(g);
    const queued = () => (client as unknown as { queue: unknown[] }).queue.filter((e) => JSON.stringify(e).includes('"wish_')).length;
    force(rig, 'chat_story');
    expect(queued()).toBe(0);
    g.state.settings.analytics = true;
    g.state.settings.analyticsAsked = true;
    stepDay(rig, 1.5);
    force(rig, 'build_lantern');
    expect(queued()).toBe(1);
    off();
    client.setConsent(false);
  });
});

describe('wishes: smoke — a full cycle inside the real Game loop', () => {
  it('wishes appear after the tutorial, come true, hearts go up and the colony keeps humming', () => {
    const rig = wishColony({ seed: 2026, tier: 2 });
    const g = rig.game;
    const offered: number[] = [];
    g.bus.on('wish:offered', (e) => offered.push(e.id));
    stepDay(rig, g.data.wishRules.firstDelay[1] + 5);
    expect(offered.length).toBe(1);
    let granted = 0;
    for (let round = 0; round < 4; round++) {
      for (const w of [...g.state.wishes.open]) {
        fulfil(rig, w);
        granted++;
      }
      g.state.wishes.nextAt = g.state.playTime + 1;
      stepDay(rig, 3);
    }
    expect(granted).toBeGreaterThanOrEqual(4);
    const hearts = colonists(rig).reduce((s, c) => s + g.sys.wishes.hearts(c.id), 0);
    expect(hearts).toBe(granted);
    expect(g.state.wishes.granted).toBe(granted);
    expect(g.sys.missions.counter('wish')).toBe(granted);
    // the sim keeps running cleanly afterwards
    stepDay(rig, 30);
    expect(Number.isFinite(g.derived.happiness.average)).toBe(true);
  });
});

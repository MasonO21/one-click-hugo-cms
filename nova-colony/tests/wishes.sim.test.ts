import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { createDataRegistry, defaultData } from '../src/data';
import { WISH_RULES } from '../src/data/wishes';
import { deserializeState, serializeState, type GameState, type Wish } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';
import { thankYouGift, wishRng } from '../src/sim/wish/rules';
import type { Reward } from '../src/data/schema';
import { collect, colonists, force, HOUR, placeNear, reload, setAmount, stepDay, T0, tickWishes, wishColony, type Colony } from './wishes.helpers';
import { makeColony } from './expeditions.helpers';

const R = WISH_RULES;

type Offered = { id: number; colonist: number; def: string; kind: string; tier: number };

function offeredLog(rig: Colony): (Offered & { at: number })[] {
  const out: (Offered & { at: number })[] = [];
  rig.game.bus.on('wish:offered', (e) => out.push({ ...e, at: rig.game.state.playTime }));
  return out;
}

/** Rules with room for many wishes at once (pure timer tests). */
function roomyData() {
  return createDataRegistry({ ...defaultData(), wishRules: { ...WISH_RULES, maxOpen: 99, expire: 1e9 } });
}

describe('wishes — when they appear', () => {
  it('stay closed during the opening tutorial and open right after it', () => {
    const rig = wishColony({ tutorialDone: false, tier: 0 });
    const log = offeredLog(rig);
    tickWishes(rig, 30 * 60);
    expect(log.length).toBe(0);
    expect(rig.game.state.wishes.nextAt).toBe(-1);
    expect(rig.game.sys.wishes.unlocked()).toBe(false);

    rig.game.state.tutorial.done = true;
    const opened = rig.game.state.playTime;
    tickWishes(rig, R.firstDelay[1] + 2);
    expect(log.length).toBe(1);
    expect(log[0].at - opened).toBeGreaterThanOrEqual(R.firstDelay[0]);
    expect(log[0].at - opened).toBeLessThanOrEqual(R.firstDelay[1] + 2);
  });

  it('a colony that reached tier 1 counts as past the tutorial', () => {
    const rig = wishColony({ tutorialDone: false, tier: 0 });
    rig.game.state.colony.tier = 1;
    expect(rig.game.sys.wishes.unlocked()).toBe(true);
  });

  it('come every few minutes of online play (WISH_RULES.interval)', () => {
    const crew = Array.from({ length: 16 }, () => 'gatherer' as const);
    const rig = makeColony({ seed: 99, tier: 2, crew, tower: false, data: roomyData() });
    rig.game.state.tutorial.done = true;
    for (const c of colonists(rig)) c.activity = 'idle';
    const log = offeredLog(rig);
    tickWishes(rig, 2 * 60 * 60);
    const span = 2 * 60 * 60;
    expect(log.length).toBeGreaterThanOrEqual(Math.floor(span / R.interval[1]));
    expect(log.length).toBeLessThanOrEqual(Math.ceil(span / R.interval[0]) + 1);
    for (let i = 1; i < log.length; i++) {
      const gap = log[i].at - log[i - 1].at;
      expect(gap).toBeGreaterThanOrEqual(R.interval[0]);
      expect(gap).toBeLessThanOrEqual(R.interval[1] + 1);
    }
    // a different colonist each time while everyone has one open
    expect(new Set(log.map((e) => e.colonist)).size).toBe(log.length);
  });

  it('never more than two open, one per colonist; a lapsed one frees the slot', () => {
    const rig = wishColony();
    const log = offeredLog(rig);
    let most = 0;
    rig.game.bus.on('wish:offered', () => {
      most = Math.max(most, rig.game.state.wishes.open.length);
    });
    tickWishes(rig, 47 * 60);
    expect(most).toBeLessThanOrEqual(R.maxOpen);
    expect(rig.game.state.wishes.open.length).toBe(2);
    expect(log.length).toBe(2);
    const open = rig.game.state.wishes.open;
    expect(open[0].colonist).not.toBe(open[1].colonist);
    // the first lapses ~45 min after it appeared and a new one follows within a minute
    tickWishes(rig, 4 * 60);
    expect(log.length).toBe(3);
    expect(rig.game.state.wishes.open.length).toBe(2);
  });

  it('nobody wishes while away on an expedition, asleep, or during an alien attack', () => {
    const rig = wishColony();
    const g = rig.game;
    const crew = colonists(rig);
    const home = crew[3];
    g.sys.colonists.sendAway(crew.filter((c) => c !== home && c !== crew[0]).map((c) => c.id));
    crew[0].activity = 'sleeping';
    const log = offeredLog(rig);
    g.state.wishes.nextAt = g.state.playTime + 1;
    tickWishes(rig, 2);
    expect(log.map((e) => e.colonist)).toEqual([home.id]);

    // everyone else asleep or away: nobody wishes, the system checks again a minute later
    g.state.wishes.nextAt = g.state.playTime + 1;
    tickWishes(rig, 2);
    expect(log.length).toBe(1);
    expect(g.state.wishes.nextAt - g.state.playTime).toBeGreaterThan(R.retry - 3);
    expect(g.state.wishes.nextAt - g.state.playTime).toBeLessThanOrEqual(R.retry);

    // raid: the timer passes but no wish until peace returns
    crew[0].activity = 'idle';
    g.state.combat.phase = 'warning';
    tickWishes(rig, 5 * 60);
    expect(log.length).toBe(1);
    g.state.combat.phase = 'attack';
    tickWishes(rig, 2 * 60);
    expect(log.length).toBe(1);
    g.state.combat.phase = 'peace';
    tickWishes(rig, R.retry + 1);
    expect(log.length).toBe(2);
    expect(log[1].colonist).toBe(crew[0].id);
  });

  it('a colonist who leaves on an expedition lets their wish go (no penalty)', () => {
    const rig = wishColony();
    const w = force(rig, 'chat_story');
    const expired = collect<{ id: number }>(rig.game, 'wish:expired');
    rig.game.sys.colonists.sendAway([w.colonist]);
    tickWishes(rig, 1);
    expect(rig.game.sys.wishes.get(w.id)).toBeUndefined();
    expect(expired.map((e) => e.id)).toEqual([w.id]);
    expect(rig.game.sys.wishes.hearts(w.colonist)).toBe(0);
  });

  it('a wish whose colonist is gone disappears', () => {
    const rig = wishColony();
    const w = force(rig, 'chat_story');
    const expired = collect(rig.game, 'wish:expired');
    rig.game.state.colonists.list = rig.game.state.colonists.list.filter((c) => c.id !== w.colonist);
    tickWishes(rig, 1);
    expect(rig.game.state.wishes.open.length).toBe(0);
    expect(expired.length).toBe(0);
  });
});

describe('wishes — deterministic from the save seed', () => {
  function sequence(seed: number, reloadAt?: number): string[] {
    let rig = wishColony({ seed });
    const out: string[] = [];
    const hook = (r: Colony) => r.game.bus.on('wish:offered', (e) => out.push(`${e.colonist}:${e.def}:${r.game.sys.wishes.get(e.id)?.need}:${Math.round(r.game.state.playTime)}`));
    hook(rig);
    if (reloadAt != null) {
      tickWishes(rig, reloadAt);
      rig = reload(rig);
      for (const c of colonists(rig)) c.activity = 'idle';
      hook(rig);
      tickWishes(rig, 60 * 60 - reloadAt);
    } else tickWishes(rig, 60 * 60);
    return out;
  }

  it('the same seed voices the same wishes at the same moments, reload or not (no save-scumming)', () => {
    const a = sequence(1234);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(sequence(1234)).toEqual(a);
    expect(sequence(1234, 7 * 60)).toEqual(a);
    expect(sequence(1234, 20 * 60)).toEqual(a);
  });

  it('different seeds tell different stories', () => {
    const firsts = new Set([11, 22, 33, 44, 55, 66].map((s) => sequence(s).slice(0, 2).join('|')));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('the rolls are pure functions of seed, counter and purpose', () => {
    expect(wishRng(5, 3, 2).next()).toBe(wishRng(5, 3, 2).next());
    expect(wishRng(5, 3, 2).next()).not.toBe(wishRng(5, 4, 2).next());
    expect(wishRng(5, 3, 2).next()).not.toBe(wishRng(5, 3, 3).next());
  });
});

describe('wishes — coming true', () => {
  it('Give refuses politely when storage is short, then hands it over with one tap', () => {
    const rig = wishColony();
    const g = rig.game;
    setAmount(rig, 'food', 1);
    const w = force(rig, 'give_berry_pie');
    expect(w.need).toBeGreaterThanOrEqual(R.giveMin);
    setAmount(rig, 'food', w.need - 7);
    expect(g.sys.wishes.refusal(w)).toBe('Need 7 more Food');
    const spent = collect<{ bag: Record<string, number> }>(g, 'resource:spent');
    expect(g.sys.wishes.give(w.id)).toBe(false);
    expect(spent.length).toBe(0);
    expect(g.state.resources.amounts.food).toBe(w.need - 7);
    expect(g.sys.wishes.get(w.id)).toBeTruthy();

    setAmount(rig, 'food', w.need + 3);
    const granted = collect<{ hearts: number; reward: Reward }>(g, 'wish:granted');
    expect(g.sys.wishes.refusal(w)).toBeNull();
    expect(g.sys.wishes.give(w.id)).toBe(true);
    expect(spent.map((s) => s.bag)).toEqual([{ food: w.need }]);
    expect(granted.length).toBe(1);
    expect(granted[0].hearts).toBe(1);
    expect(g.sys.wishes.get(w.id)).toBeUndefined();
    expect(g.sys.wishes.give(w.id)).toBe(false); // gone: nothing more to give
  });

  it('Build counts from the moment the wish appears and comes true by itself', () => {
    const rig = wishColony();
    const g = rig.game;
    placeNear(g, 'lamp_post'); // an old lantern does not count
    const w = force(rig, 'build_lantern');
    expect(w.need).toBe(1);
    expect(g.sys.wishes.get(w.id)!.done).toBe(0);
    const granted = collect(g, 'wish:granted');
    placeNear(g, 'flower_bed'); // not what they asked for
    expect(granted.length).toBe(0);
    placeNear(g, 'lamp_post');
    expect(granted.length).toBe(1);
    expect(g.sys.wishes.get(w.id)).toBeUndefined();
  });

  it('Build wishes are only voiced while the colony has fewer than `upTo`', () => {
    const rig = wishColony();
    const g = rig.game;
    const upTo = g.data.wish('build_campfire')!.upTo!;
    for (let i = 0; i < upTo; i++) placeNear(g, 'campfire');
    expect(g.sys.wishes.debugOffer('build_campfire')).toBeNull();
  });

  it('Craft counts the player\'s own crafting, not a factory\'s', () => {
    const rig = wishColony();
    const g = rig.game;
    setAmount(rig, 'fiber', 50);
    const w = force(rig, 'craft_bandage');
    const granted = collect(g, 'wish:granted');
    g.bus.emit('craft:completed', { recipe: 'r_bandage', factory: 99 });
    expect(granted.length).toBe(0);
    expect(g.sys.crafting.craft('r_bandage')).not.toBeNull();
    stepDay(rig, 4);
    expect(granted.length).toBe(1);
    expect(g.sys.wishes.get(w.id)).toBeUndefined();
  });

  it('Chat: walk up, the context button says Chat, one tap', () => {
    const rig = wishColony();
    const g = rig.game;
    const w = force(rig, 'chat_story');
    const c = g.sys.colonists.get(w.colonist)!;
    const p = g.state.player;
    p.x = c.x + 40;
    p.z = c.z + 40;
    expect(g.sys.player.interaction()?.kind).not.toBe('chat');
    p.x = c.x + 1.5;
    p.z = c.z;
    const it = g.sys.player.interaction();
    expect(it?.kind).toBe('chat');
    expect(it?.label).toBe('Chat');
    expect(it?.target).toBe(c.id);
    const granted = collect(g, 'wish:granted');
    expect(g.sys.player.interact()).toBe(true);
    expect(granted.length).toBe(1);
    expect(g.sys.player.interaction()?.kind).not.toBe('chat');
  });

  it('Explore: opening any cache or wreck out there', () => {
    const rig = wishColony();
    const g = rig.game;
    const w = force(rig, 'explore_surprise');
    const spot = g.sys.wishes.exploreSpots()[0];
    expect(spot).toBeTruthy();
    const granted = collect(g, 'wish:granted');
    expect(g.sys.world.lootPoi(spot.id)).toBe(true);
    expect(granted.length).toBe(1);
    expect(g.sys.wishes.get(w.id)).toBeUndefined();
  });

  it('the gift is granted exactly once', () => {
    const rig = wishColony();
    const g = rig.game;
    force(rig, 'build_lantern');
    const gifts = collect<{ source: string; reward: Reward }>(g, 'reward:granted');
    placeNear(g, 'lamp_post');
    placeNear(g, 'lamp_post');
    g.bus.emit('building:completed', { id: 999, def: 'lamp_post' });
    tickWishes(rig, 5);
    const fromWishes = gifts.filter((e) => e.source === 'wish');
    expect(fromWishes.length).toBe(1);
    expect(g.state.wishes.granted).toBe(1);
  });

  it('lapses quietly after 45 minutes of play: no penalty, nothing taken, no hearts', () => {
    const rig = wishColony();
    const g = rig.game;
    setAmount(rig, 'food', 500);
    const w = force(rig, 'give_berry_pie');
    g.state.wishes.nextAt = Infinity; // only this wish
    const before = { ...g.state.resources.amounts };
    const expired = collect(g, 'wish:expired');
    const toasts = collect<{ text: string }>(g, 'ui:toast');
    tickWishes(rig, R.expire - 2);
    expect(g.sys.wishes.get(w.id)).toBeTruthy();
    expect(g.sys.wishes.secondsLeft(g.sys.wishes.get(w.id)!)).toBeLessThanOrEqual(2);
    tickWishes(rig, 3);
    expect(g.sys.wishes.get(w.id)).toBeUndefined();
    expect(expired.length).toBe(1);
    expect(toasts.length).toBe(0);
    expect(g.state.resources.amounts).toEqual(before);
    expect(g.sys.wishes.hearts(w.colonist)).toBe(0);
    expect(g.state.wishes.moods[w.colonist]).toBeUndefined();
    expect(g.state.wishes.expired).toBe(1);
  });

  it('a wish can be let go at once: no penalty, the slot frees up, a friendly word', () => {
    const rig = wishColony();
    const g = rig.game;
    setAmount(rig, 'food', 500);
    const w = force(rig, 'give_berry_pie');
    const before = { ...g.state.resources.amounts };
    const expired = collect(g, 'wish:expired');
    const toasts = collect<{ text: string }>(g, 'ui:toast');
    expect(g.sys.wishes.letGo(w.id)).toBe(true);
    expect(g.sys.wishes.get(w.id)).toBeUndefined();
    expect(g.sys.wishes.of(w.colonist)).toBeUndefined();
    expect(expired.length).toBe(1);
    expect(toasts.some((t) => t.text.startsWith('No worries!'))).toBe(true);
    expect(g.state.resources.amounts).toEqual(before);
    expect(g.sys.wishes.hearts(w.colonist)).toBe(0);
    expect(g.state.wishes.moods[w.colonist]).toBeUndefined();
    expect(g.sys.wishes.letGo(w.id)).toBe(false);
  });

  it('wishes never move while the app is closed', () => {
    const rig = wishColony();
    const w = force(rig, 'chat_story');
    tickWishes(rig, 600);
    const nextAt = rig.game.state.wishes.nextAt;
    const left = rig.game.sys.wishes.secondsLeft(rig.game.sys.wishes.get(w.id)!);
    const back = reload(rig, rig.clock.now + 10 * HOUR);
    const again = back.game.sys.wishes.get(w.id)!;
    expect(again).toBeTruthy();
    expect(back.game.sys.wishes.secondsLeft(again)).toBe(left);
    expect(back.game.state.wishes.nextAt).toBe(rig.game.state.wishes.nextAt);
    expect(nextAt).toBeGreaterThan(0);
  });
});

describe('wishes — friendship', () => {
  it('a granted wish: +1 heart, "Wish granted!" mood for a few hours, a small gift', () => {
    const rig = wishColony();
    const g = rig.game;
    const w = force(rig, 'chat_story');
    const c = g.sys.colonists.get(w.colonist)!;
    const sum = () => g.sys.colonists.happinessFactors(c).reduce((a, f) => a + f.value, 0);
    const sum0 = sum();
    const gifts = collect<{ source: string; reward: Reward }>(g, 'reward:granted');
    expect(g.sys.wishes.chat(c.id)).toBe(true);
    expect(g.sys.wishes.hearts(c.id)).toBe(1);
    const f = g.sys.colonists.happinessFactors(c).find((x) => x.label === 'Wish granted!');
    expect(f?.value).toBe(R.mood.value);
    expect(sum()).toBeGreaterThan(sum0 + R.mood.value - 0.01); // (the target itself may already sit at 100)
    const gift = gifts.find((e) => e.source === 'wish')!.reward;
    expect(Object.keys(gift.resources ?? {}).length).toBeGreaterThan(0);
    // the mood wears off after its hours (real time), the heart stays
    rig.clock.now += R.mood.hours * HOUR + 1000;
    tickWishes(rig, 1);
    expect(g.sys.colonists.happinessFactors(c).some((x) => x.label === 'Wish granted!')).toBe(false);
    expect(g.sys.wishes.hearts(c.id)).toBe(1);
  });

  it('three hearts: +5% productivity; five: Best friends (+3 happiness for good); never more than five', () => {
    const rig = wishColony();
    const g = rig.game;
    const c = colonists(rig).find((x) => x.workplace != null) ?? colonists(rig)[0];
    const p0 = g.sys.colonists.productivity(c);
    g.state.wishes.bonds[c.id] = 2;
    expect(g.sys.colonists.productivity(c)).toBeCloseTo(p0, 6);
    g.state.wishes.bonds[c.id] = 3;
    expect(g.sys.colonists.productivity(c)).toBeCloseTo(p0 * (1 + R.perks.productivity), 6);
    expect(g.sys.colonists.happinessFactors(c).some((x) => x.label === 'Best friends')).toBe(false);
    const celebrate = collect<{ title: string }>(g, 'ui:celebrate');
    g.state.wishes.bonds[c.id] = 4;
    force(rig, 'chat_story', c.id);
    g.sys.wishes.chat(c.id);
    expect(g.sys.wishes.hearts(c.id)).toBe(5);
    expect(g.sys.wishes.bestFriends(c.id)).toBe(true);
    expect(celebrate.map((e) => e.title)).toEqual(['Best friends!']);
    const bf = g.sys.colonists.happinessFactors(c).find((x) => x.label === 'Best friends');
    expect(bf?.value).toBe(R.perks.bestFriendsHappiness);
    force(rig, 'chat_story', c.id);
    g.sys.wishes.chat(c.id);
    expect(g.sys.wishes.hearts(c.id)).toBe(5);
    expect(celebrate.length).toBe(1);
  });

  it('thank-you gifts are deterministic, small, and only sometimes bring 1–2 Nova', () => {
    const data = createDataRegistry();
    expect(thankYouGift(data, 3, 777)).toEqual(thankYouGift(data, 3, 777));
    let nova = 0;
    const N = 2000;
    for (let s = 0; s < N; s++) {
      const r = thankYouGift(data, s % 7, s * 7919 + 13);
      if (r.nova) {
        nova++;
        expect(r.nova).toBeGreaterThanOrEqual(1);
        expect(r.nova).toBeLessThanOrEqual(2);
      }
      expect(r.items).toBeUndefined();
      expect(r.colonist).toBeUndefined();
    }
    expect(nova / N).toBeGreaterThan(0.06);
    expect(nova / N).toBeLessThan(0.14);
  });
});

describe('wishes — saves', () => {
  it('round-trips open wishes, hearts, moods, counters and the timer', () => {
    const rig = wishColony();
    const g = rig.game;
    force(rig, 'chat_story');
    force(rig, 'build_lantern');
    const c = colonists(rig)[4];
    g.state.wishes.bonds[c.id] = 3;
    g.state.wishes.moods[c.id] = rig.clock.now + HOUR;
    tickWishes(rig, 30);
    const before = JSON.parse(JSON.stringify(g.state.wishes)) as GameState['wishes'];
    const back = reload(rig);
    expect(back.game.state.wishes).toEqual(before);
    expect(back.game.sys.wishes.hearts(c.id)).toBe(3);
  });

  it('an old save without the slice loads with wishes ready to open', () => {
    const rig = wishColony();
    const raw = JSON.parse(serializeState(rig.game.state));
    delete raw.wishes;
    const state = migrateState(raw);
    const g = new Game({ state, services: createMockServices(), clock: () => T0 });
    g.start();
    expect(g.state.wishes.open).toEqual([]);
    expect(g.state.wishes.nextAt).toBe(-1);
    g.update(0.25);
    for (let i = 0; i < 8; i++) g.update(0.25);
    expect(g.state.wishes.nextAt).toBeGreaterThan(g.state.playTime); // scheduled the first one
    // a hand-built state that never went through the loader works too
    const bare = deserializeState(serializeState(rig.game.state)) as GameState;
    delete (bare as Partial<GameState>).wishes;
    const g2 = new Game({ state: bare, services: createMockServices(), clock: () => T0 });
    g2.start();
    expect(g2.state.wishes.open).toEqual([]);
  });

  it('drops junk on load: unknown wishes, missing colonists, duplicates, bad numbers', () => {
    const rig = wishColony();
    const ids = colonists(rig).map((c) => c.id);
    const good: Wish = { id: 5, def: 'chat_story', colonist: ids[0], tier: 2, need: 1, done: 0, at: 10, expiresAt: 10 + R.expire, seed: 42 };
    const raw = JSON.parse(serializeState(rig.game.state));
    raw.wishes = {
      open: [good, { ...good, id: 6 }, { ...good, id: 7, def: 'no_such_wish', colonist: ids[1] }, { ...good, id: 8, colonist: 9999 }, null, 'x', { ...good, id: 9, colonist: ids[2], need: -1 }, { ...good, id: 10, colonist: ids[3], expiresAt: 'later' }],
      nextId: 'eleven',
      nextAt: null,
      offered: -4,
      granted: 3,
      expired: 'many',
      bonds: { [ids[0]]: 99, [ids[1]]: 'lots', 9999: 4, [ids[2]]: 2 },
      moods: { [ids[0]]: T0 + HOUR, 9999: T0 + HOUR, [ids[1]]: 'happy' },
      recent: ['chat_story', 7, null],
    };
    const state = migrateState(raw);
    const back = makeColony({ state, at: rig.clock.now, data: rig.game.data });
    const ws = back.game.state.wishes;
    expect(ws.open.map((w) => w.id)).toEqual([5]);
    expect(ws.nextId).toBe(6);
    expect(typeof ws.nextAt).toBe('number');
    expect(ws.offered).toBe(0);
    expect(ws.granted).toBe(3);
    expect(ws.expired).toBe(0);
    expect(ws.bonds).toEqual({ [ids[0]]: 5, [ids[2]]: 2 });
    expect(Object.keys(ws.moods)).toEqual([String(ids[0])]);
    expect(ws.recent).toEqual(['chat_story']);
  });
});

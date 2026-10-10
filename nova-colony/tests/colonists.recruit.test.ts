import { describe, expect, it } from 'vitest';
import { addBuilding, addColonist, makeGame } from './colonists.util';
import { arrivalsDue } from '../src/sim/colony/recruitBoard';

/** Minutes between survivors at the colony's current tier. */
const interval = (game: ReturnType<typeof makeGame>['game']) => game.data.balance.recruitArrivalMinutes![game.state.colony.tier] * 60000;

function toasts(game: ReturnType<typeof makeGame>['game']): string[] {
  const out: string[] = [];
  game.bus.on('ui:toast', (e) => out.push(e.text));
  return out;
}

describe('recruitment board', () => {
  it('a fresh game has a full board of candidates and no colonists', () => {
    const { game, clock } = makeGame();
    const st = game.state.colonists;
    expect(st.list).toHaveLength(0);
    expect(st.candidates).toHaveLength(game.data.balance.recruitCandidates);
    expect(st.refreshAt).toBe(clock.now + interval(game));
    expect(game.sys.colonists.nextArrivalIn()).toBeNull(); // a full board: nobody is on the way
    for (const k of st.candidates) {
      expect(k.cost).toEqual(game.data.balance.recruitCost[k.colonist.rarity]);
    }
  });

  it('rolls rarities roughly 70/22/7/1', () => {
    const { game } = makeGame();
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const n = 600;
    for (let i = 0; i < n; i++) {
      game.sys.colonists.refreshCandidates(true);
      for (const k of game.state.colonists.candidates) counts[k.colonist.rarity]++;
    }
    const total = n * game.data.balance.recruitCandidates;
    expect(counts.common / total).toBeGreaterThan(0.64);
    expect(counts.common / total).toBeLessThan(0.76);
    expect(counts.rare / total).toBeGreaterThan(0.17);
    expect(counts.rare / total).toBeLessThan(0.27);
    expect(counts.epic).toBeGreaterThan(0);
  });

  it('needs a recruitment building', () => {
    const { game } = makeGame();
    addBuilding(game, 'shelter', 130, 130);
    game.state.resources.amounts.food = 500;
    const msgs = toasts(game);
    expect(game.sys.colonists.recruit(0)).toBe(false);
    expect(game.sys.colonists.boardAvailable()).toBe(false);
    expect(msgs.some((m) => /recruitment/i.test(m))).toBe(true);
    expect(game.state.resources.amounts.food).toBe(500);
    expect(game.sys.colonists.all()).toHaveLength(0);
  });

  it('refuses with a clear message when there is no free bed', () => {
    const { game } = makeGame();
    addBuilding(game, 'recruit_hall', 130, 130);
    game.state.resources.amounts.food = 500;
    game.state.resources.amounts.water = 500;
    const msgs = toasts(game);
    expect(game.sys.colonists.freeBeds()).toBe(0);
    expect(game.sys.colonists.recruit(0)).toBe(false);
    expect(msgs).toContain('Build more beds to recruit');
    expect(game.state.resources.amounts.food).toBe(500); // nothing was spent
    expect(game.sys.colonists.canRecruit(0)).toEqual({ ok: false, reason: 'Build more beds to recruit' });
  });

  it('recruits: pays the cost, adds the colonist, gives them a bed; the seat waits for the next survivor', () => {
    const { game, clock } = makeGame();
    addBuilding(game, 'recruit_hall', 130, 130);
    const shelter = addBuilding(game, 'shelter', 134, 130); // 2 beds
    const st = game.state.colonists;
    const target = st.candidates[1].colonist;
    const cost = { ...st.candidates[1].cost };
    for (const [k, v] of Object.entries(cost)) game.state.resources.amounts[k] = (v as number) + 7;

    const events: number[] = [];
    game.bus.on('colonist:recruited', (e) => events.push(e.id));
    expect(game.sys.colonists.canRecruit(1)).toEqual({ ok: true });
    expect(game.sys.colonists.recruit(1)).toBe(true);

    for (const k of Object.keys(cost)) expect(game.state.resources.amounts[k]).toBe(7);
    expect(game.sys.colonists.all()).toHaveLength(1);
    const c = game.sys.colonists.all()[0];
    expect(c.name).toBe(target.name);
    expect(c.bed).toBe(shelter.id);
    expect(events).toEqual([c.id]);
    expect(st.candidates).toHaveLength(game.data.balance.recruitCandidates - 1);
    expect(st.candidates.every((k) => k.colonist.name !== c.name)).toBe(true);
    // the board was full: its clock starts now
    expect(st.refreshAt).toBe(clock.now + interval(game));
    expect(game.sys.colonists.nextArrivalIn()).toBeCloseTo(interval(game) / 1000, 3);
    expect(game.derived.housing).toEqual({ beds: 2, used: 1 });
    expect(game.sys.colonists.freeBeds()).toBe(1);
  });

  it('fails without spending when resources are short', () => {
    const { game } = makeGame();
    addBuilding(game, 'recruit_hall', 130, 130);
    addBuilding(game, 'shelter', 134, 130);
    let insufficient = 0;
    game.bus.on('resource:insufficient', () => insufficient++);
    expect(game.sys.colonists.recruit(0)).toBe(false);
    expect(insufficient).toBe(1);
    expect(game.sys.colonists.all()).toHaveLength(0);
    expect(game.sys.colonists.canRecruit(0).reason).toBe('Not enough resources');
  });

  it('stops when beds run out; more beds unlock more recruits', () => {
    const { game } = makeGame();
    addBuilding(game, 'recruit_hall', 130, 130);
    addBuilding(game, 'shelter', 134, 130); // 2 beds
    game.state.resources.amounts.food = 5000;
    game.state.resources.amounts.water = 5000;
    game.state.resources.amounts.electronics = 500;
    game.state.resources.amounts.crystal = 500;
    game.state.resources.amounts.wood = 500;
    expect(game.sys.colonists.recruit(0)).toBe(true);
    expect(game.sys.colonists.recruit(0)).toBe(true);
    expect(game.sys.colonists.recruit(0)).toBe(false);
    addBuilding(game, 'shelter', 138, 130);
    expect(game.sys.colonists.recruit(0)).toBe(true);
    expect(game.sys.colonists.all()).toHaveLength(3);
  });

  it('rescues and rewards ignore beds even when the colony is full', () => {
    const { game } = makeGame();
    addBuilding(game, 'shelter', 134, 130);
    for (let i = 0; i < 5; i++) game.sys.colonists.grant('common');
    expect(game.sys.colonists.all()).toHaveLength(5);
    expect(game.sys.colonists.all().filter((c) => c.bed != null)).toHaveLength(2);
    expect(game.derived.housing).toEqual({ beds: 2, used: 2 });
  });

  it('a free seat refills on an absolute clock, one survivor per interval, never past the board', () => {
    const { game, clock, run } = makeGame();
    addBuilding(game, 'recruit_hall', 130, 130);
    addBuilding(game, 'shelter', 134, 130);
    addBuilding(game, 'shelter', 138, 130);
    game.state.resources.amounts.food = 5000;
    game.state.resources.amounts.water = 5000;
    game.state.resources.amounts.electronics = 500;
    game.state.resources.amounts.crystal = 500;
    game.state.resources.amounts.wood = 500;
    const st = game.state.colonists;
    const cs = game.sys.colonists;
    expect(cs.recruit(0)).toBe(true);
    expect(cs.recruit(0)).toBe(true);
    expect(st.candidates).toHaveLength(1);
    const msgs = toasts(game);
    // half an interval: nobody yet, the countdown runs
    clock.now += interval(game) / 2;
    run(1.5);
    expect(st.candidates).toHaveLength(1);
    expect(cs.nextArrivalIn()).toBeGreaterThan(0);
    // the first survivor arrives on time (the app being closed does not matter: the clock is absolute)
    clock.now += interval(game) / 2 + 1000;
    run(1.5);
    expect(st.candidates).toHaveLength(2);
    expect(msgs.some((m) => /answered the radio/.test(m))).toBe(true);
    // a long absence fills only the free seats
    clock.now += interval(game) * 10;
    run(1.5);
    expect(st.candidates).toHaveLength(game.data.balance.recruitCandidates);
    expect(cs.nextArrivalIn()).toBeNull();
  });

  it('the wait grows with the colony tier', () => {
    const minutes = makeGame().game.data.balance.recruitArrivalMinutes!;
    expect(minutes.length).toBe(7);
    for (let t = 1; t <= 5; t++) expect(minutes[t], `tier ${t}`).toBeGreaterThan(minutes[t - 1]);
    // the guided first session: the board starts full and the first survivor after that comes quickly
    expect(minutes[0]).toBeLessThanOrEqual(30);
  });

  it('arrivalsDue counts survivors on the clock, capped by the free seats', () => {
    expect(arrivalsDue(1000, 500, 100, 3)).toEqual({ n: 0, nextAt: 1000 });
    expect(arrivalsDue(1000, 1000, 100, 3)).toEqual({ n: 1, nextAt: 1100 });
    expect(arrivalsDue(1000, 1250, 100, 3)).toEqual({ n: 3, nextAt: 1300 });
    expect(arrivalsDue(1000, 9999, 100, 2)).toEqual({ n: 2, nextAt: 1200 });
    expect(arrivalsDue(1000, 9999, 100, 0)).toEqual({ n: 0, nextAt: 1000 });
  });

  it('New recruits (ad / Nova) brings fresh faces but never fills an empty seat (growth stays on the clock)', () => {
    const { game } = makeGame();
    addBuilding(game, 'recruit_hall', 130, 130);
    addBuilding(game, 'shelter', 134, 130);
    game.state.resources.amounts.food = 5000;
    game.state.resources.amounts.water = 5000;
    const st = game.state.colonists;
    const before = st.candidates.map((k) => k.colonist.name);
    game.sys.colonists.refreshCandidates(false); // nothing due: no-op
    expect(st.candidates.map((k) => k.colonist.name)).toEqual(before);
    game.sys.colonists.refreshCandidates(true);
    expect(st.candidates).toHaveLength(game.data.balance.recruitCandidates);
    expect(st.candidates.map((k) => k.colonist.name)).not.toEqual(before);
    expect(game.sys.colonists.recruit(0)).toBe(true);
    expect(st.candidates).toHaveLength(game.data.balance.recruitCandidates - 1);
    const waiting = st.candidates.map((k) => k.colonist.name);
    game.sys.colonists.refreshCandidates(true);
    expect(st.candidates).toHaveLength(game.data.balance.recruitCandidates - 1);
    expect(st.candidates.map((k) => k.colonist.name)).not.toEqual(waiting);
    // an empty board has nobody to swap
    st.candidates.length = 0;
    game.sys.colonists.refreshCandidates(true);
    expect(st.candidates).toHaveLength(0);
  });

  it("each 'recruitSlots' research adds one seat (with someone in it) without rerolling the board", () => {
    const { game, run } = makeGame();
    const before = game.state.colonists.candidates.map((k) => k.colonist.name);
    const eco = game.sys.economy as unknown as { modifier: (s: string) => number };
    eco.modifier = (s: string) => (s === 'recruitSlots' ? 2 : 1);
    run(2);
    const after = game.state.colonists.candidates;
    expect(after).toHaveLength(game.data.balance.recruitCandidates + 1);
    expect(game.sys.colonists.boardSeats()).toBe(game.data.balance.recruitCandidates + 1);
    expect(after.slice(0, before.length).map((k) => k.colonist.name)).toEqual(before);
  });

  it('a colonist can be added next to a given position (rescue at a camp)', () => {
    const { game } = makeGame();
    const c = addColonist(game, 'common', {}, 55, 12);
    expect([c.x, c.z]).toEqual([55, 12]);
    expect(c.activity).toBe('idle');
  });
});

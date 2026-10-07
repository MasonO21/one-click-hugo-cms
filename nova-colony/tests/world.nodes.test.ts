import { describe, expect, it } from 'vitest';
import { cellOf } from '../src/core/constants';
import { collectEvents, makeGame, stubWalls } from './world.helpers';

describe('resource node lifecycle', () => {
  it('applies the yield multiplier with a fractional carry between hits', () => {
    const { game } = makeGame();
    const w = game.sys.world;
    const hits = collectEvents(game, 'gather:hit');
    const rock = w.gen.nodes.find((n) => n.def === 'rock')!;
    const got = [0, 1, 2, 3].map(() => w.hitNode(rock.i, 1.25).stone ?? 0);
    // 3 x 1.25 = 3.75 -> 3 (+.75), 4.5 -> 4 (+.5), 4.25 -> 4 (+.25), 4.0 -> 4
    expect(got).toEqual([3, 4, 4, 4]);
    expect(hits).toHaveLength(4);
    expect(hits[0]).toMatchObject({ node: rock.i, model: 'rock', x: rock.x, z: rock.z });
    expect(hits[0].drop).toEqual({ stone: 3 });
    expect(rock.hits).toBe(1);
  });

  it('depletes after the configured hits, hides from queries, then respawns', () => {
    const rig = makeGame();
    const { game } = rig;
    const w = game.sys.world;
    const depleted = collectEvents(game, 'gather:depleted');
    const respawned = collectEvents(game, 'world:nodeRespawned');
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    const def = game.data.node('tree_round')!;
    expect(w.nearestNode(tree.x, tree.z, 0.5)?.i).toBe(tree.i);
    for (let i = 0; i < def.hits; i++) expect(w.hitNode(tree.i, 1).wood).toBe(3);
    expect(depleted).toEqual([{ node: tree.i }]);
    expect(w.isDepleted(tree.i)).toBe(true);
    expect(game.state.world.depleted[tree.i]).toBeCloseTo(game.state.playTime + def.respawn, 6);
    expect(w.nearestNode(tree.x, tree.z, 0.5)?.i).not.toBe(tree.i);
    expect(w.hitNode(tree.i, 1)).toEqual({}); // nothing left to hit

    rig.step(def.respawn - 2);
    expect(w.isDepleted(tree.i)).toBe(true);
    rig.step(4);
    expect(w.isDepleted(tree.i)).toBe(false);
    expect(tree.hits).toBe(def.hits);
    expect(respawned).toEqual([{ node: tree.i }]);
    expect(w.nearestNode(tree.x, tree.z, 0.5)?.i).toBe(tree.i);
  });

  it('does not respawn a node that a building sits on', () => {
    const rig = makeGame();
    const { game } = rig;
    const w = game.sys.world;
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    const def = game.data.node('tree_round')!;
    stubWalls(game, new Set([`${cellOf(tree.x)},${cellOf(tree.z)}`]));
    for (let i = 0; i < def.hits; i++) w.hitNode(tree.i, 1);
    rig.step(def.respawn + 30);
    expect(w.isDepleted(tree.i)).toBe(true); // still covered
    stubWalls(game, new Set()); // building removed -> normal respawn timer starts
    rig.step(2);
    expect(w.isDepleted(tree.i)).toBe(true);
    rig.step(def.respawn + 2);
    expect(w.isDepleted(tree.i)).toBe(false);
  });

  it('clearNodesInRect harvests the remaining drops and keeps covered nodes depleted', () => {
    const rig = makeGame();
    const { game } = rig;
    const w = game.sys.world;
    const gained = collectEvents(game, 'resource:gained');
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    const def = game.data.node('tree_round')!;
    w.hitNode(tree.i, 1); // one hit already taken: 4 hits remain
    const before = game.state.resources.amounts.wood ?? 0;
    const cx = cellOf(tree.x);
    const cz = cellOf(tree.z);
    const bag = w.clearNodesInRect(cx, cz, cx, cz);
    expect(bag.wood).toBe(3 * (def.hits - 1));
    expect(game.state.resources.amounts.wood).toBe(before + 3 * (def.hits - 1));
    expect(gained.some((e) => e.source === 'gather' && e.x === tree.x && e.z === tree.z)).toBe(true);
    expect(w.isDepleted(tree.i)).toBe(true);
    expect(game.state.world.depleted[tree.i]).toBe(Number.POSITIVE_INFINITY);
    // clearing again grants nothing
    expect(w.clearNodesInRect(cx, cz, cx, cz)).toEqual({});

    stubWalls(game, new Set([`${cx},${cz}`]));
    rig.step(def.respawn * 3);
    expect(w.isDepleted(tree.i)).toBe(true);
    // the rect is inclusive and order-independent
    const other = w.gen.nodes.find((n) => n.def === 'rock' && Math.hypot(n.x, n.z) < 24)!;
    const ocx = cellOf(other.x);
    const ocz = cellOf(other.z);
    const stone = w.clearNodesInRect(ocx + 1, ocz + 1, ocx - 1, ocz - 1).stone ?? 0;
    expect(stone).toBeGreaterThanOrEqual(3 * 5);
    expect(w.isDepleted(other.i)).toBe(true);
  });

  it('survives a JSON save round-trip (Infinity-safe) and keeps nodes depleted', async () => {
    const { serializeState, deserializeState } = await import('../src/core/state');
    const rig = makeGame();
    const w = rig.game.sys.world;
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    const cx = cellOf(tree.x);
    const cz = cellOf(tree.z);
    w.clearNodesInRect(cx, cz, cx, cz);
    const rock = w.gen.nodes.find((n) => n.def === 'rock')!;
    for (let i = 0; i < 5; i++) w.hitNode(rock.i, 1);
    const copy = deserializeState(serializeState(rig.game.state));
    const again = makeGame(1234, { state: copy });
    expect(again.game.sys.world.isDepleted(tree.i)).toBe(true);
    expect(again.game.sys.world.isDepleted(rock.i)).toBe(true);
    expect(again.game.sys.world.gen.nodes[rock.i].hits).toBe(0);
    expect(again.game.state.world.depleted[tree.i]).toBe(Number.POSITIVE_INFINITY);
  });

  it('nearestNode matches a brute-force search and honours the tool tier filter', () => {
    const { game } = makeGame();
    const w = game.sys.world;
    for (const [x, z] of [[12, 8], [-30, 22], [140, -60], [-90, -120], [0, 0]]) {
      let best = -1;
      let bd = 6 * 6;
      for (const n of w.gen.nodes) {
        const d = (n.x - x) ** 2 + (n.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = n.i;
        }
      }
      expect(w.nearestNode(x, z, 6)?.i ?? -1).toBe(best);
    }
    const ore = w.gen.nodes.find((n) => game.data.node(n.def)!.toolTier >= 1)!;
    expect(w.nearestNode(ore.x, ore.z, 0.3, 0)?.i).not.toBe(ore.i);
    expect(w.nearestNode(ore.x, ore.z, 0.3, 5)?.i).toBe(ore.i);
  });
});

/**
 * End-to-end playtest of the retention-critical first session: a simple bot drives the real systems through
 * the joystick/context-button inputs (like a player would) and follows the main mission chain until the
 * colony reaches Reinforced Wood. Prints a timeline so pacing regressions are easy to spot.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { cellOf, CENTER_CELL } from '../src/core/constants';
import type { WorldNode } from '../src/sim/world';
import type { ResourceBag } from '../src/data/schema';

const DT = 0.1;

class Bot {
  private target: { x: number; z: number } | null = null;
  private targetNode: number | null = null;
  private bestDist = Infinity;
  private stuckT = 0;
  private readonly banned = new Set<number>();
  log: string[] = [];

  constructor(private readonly game: Game) {}

  private get p() {
    return this.game.state.player;
  }

  /** Steer the joystick toward a point (camera yaw 0: right = +X, up = -Z). Returns true when close. */
  private steer(x: number, z: number, near: number): boolean {
    const g = this.game;
    g.view.camera.yaw = 0;
    const dx = x - this.p.x;
    const dz = z - this.p.z;
    const d = Math.hypot(dx, dz);
    if (d < this.bestDist - 0.3) {
      this.bestDist = d;
      this.stuckT = 0;
    } else this.stuckT += DT;
    if (d <= near) {
      // keep nudging into the target so auto-gather / interactions trigger
      g.input.moveX = (dx / Math.max(d, 1e-3)) * 0.15;
      g.input.moveY = (-dz / Math.max(d, 1e-3)) * 0.15;
      return true;
    }
    g.input.moveX = dx / d;
    g.input.moveY = -dz / d;
    return false;
  }

  private goTo(x: number, z: number, node: number | null = null): void {
    if (!this.target || Math.abs(this.target.x - x) > 0.5 || Math.abs(this.target.z - z) > 0.5) {
      this.target = { x, z };
      this.targetNode = node;
      this.bestDist = Infinity;
      this.stuckT = 0;
    }
  }

  private stop(): void {
    this.game.input.moveX = 0;
    this.game.input.moveY = 0;
  }

  /** Nearest harvestable node that drops `res`. */
  private nodeFor(res: string): WorldNode | null {
    const g = this.game;
    const gen = g.sys.world.gen;
    const toolTier = g.sys.player.toolTier?.() ?? 1;
    let best: WorldNode | null = null;
    let bd = Infinity;
    for (const n of gen.nodes) {
      if (this.banned.has(n.i) || g.sys.world.isDepleted(n.i)) continue;
      const def = g.data.node(n.def);
      if (!def || !(def.drop[res] ?? 0) || def.toolTier > toolTier) continue;
      if (!g.sys.world.isUnlocked(n.region)) continue;
      const d = Math.hypot(n.x - this.p.x, n.z - this.p.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  private gather(missing: ResourceBag): boolean {
    const res = Object.keys(missing).find((k) => this.game.data.nodes.some((n) => (n.drop[k] ?? 0) > 0));
    if (!res) return false;
    if (this.targetNode == null || this.game.sys.world.isDepleted(this.targetNode) || this.stuckT > 6) {
      if (this.targetNode != null && this.stuckT > 6) this.banned.add(this.targetNode);
      const n = this.nodeFor(res);
      if (!n) return false;
      this.target = null;
      this.goTo(n.x, n.z, n.i);
    }
    return true;
  }

  /** First free spot for a building, spiralling out from the core. */
  private spot(def: string): { x: number; z: number } | null {
    const b = this.game.sys.buildings;
    for (let r = 3; r < this.game.state.colony.radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = CENTER_CELL + dx;
          const z = CENTER_CELL + dz;
          if (b.canPlace(def, x, z, 0).ok) return { x, z };
        }
      }
    }
    return null;
  }

  private build(def: string): void {
    const g = this.game;
    const cost = g.sys.buildings.cost(def);
    const missing = g.sys.economy.missing(cost);
    if (Object.keys(missing).length) {
      this.gather(missing);
      return;
    }
    const s = this.spot(def);
    if (s && g.sys.buildings.place(def, s.x, s.z, 0) != null) this.log.push(`placed ${def} at ${s.x},${s.z}`);
  }

  tick(): void {
    const g = this.game;
    if (g.state.combat.pendingReward) g.sys.combat.claimReward(false);
    const m = g.sys.missions.current();
    if (!m) return this.stop();
    switch (m.type) {
      case 'gather':
        this.gather({ [m.target]: 1 });
        break;
      case 'build':
        this.build(m.target);
        break;
      case 'rescue': {
        const guide = g.sys.tutorial.guide();
        if (guide?.world) this.goTo(guide.world.x, guide.world.z);
        const it = g.sys.player.interaction();
        if (it && it.kind === 'rescue') g.input.interact = true;
        break;
      }
      case 'defend': {
        const turret = g.state.buildings.list.find((b) => g.data.building(b.def)?.turret);
        if (turret) {
          const c = g.sys.buildings.center(turret);
          this.goTo(c.x + 2.5, c.z);
        }
        break;
      }
      case 'research':
        if (g.sys.research.canResearch(m.target)) g.sys.research.research(m.target);
        else this.gather({ wood: 1 }); // stay busy while RP accumulate
        break;
      case 'tier': {
        const next = g.sys.progression.next();
        if (!next) break;
        if (g.sys.progression.canTierUp()) g.sys.progression.tierUp();
        else if (!next.researchDone && next.research && g.sys.research.canResearch(next.research)) g.sys.research.research(next.research);
        else this.gather(g.sys.economy.missing(next.cost));
        break;
      }
      default:
        this.stop();
    }
    if (this.target) {
      if (this.steer(this.target.x, this.target.z, this.targetNode != null ? 1.6 : 1.2) && this.targetNode == null) this.target = null;
    } else this.stop();
  }
}

describe('first 15 minutes (bot playthrough)', () => {
  it('reaches Reinforced Wood through the guided chain with a won first invasion', () => {
    let now = Date.UTC(2026, 9, 7, 9, 0, 0);
    const game = new Game({ seed: 20261007, services: createMockServices(), clock: () => now });
    game.start();
    const bot = new Bot(game);
    const timeline: { t: number; what: string }[] = [];
    game.bus.on('mission:completed', (e) => timeline.push({ t: game.state.playTime, what: `✔ ${e.id}` }));
    game.bus.on('combat:warning', () => timeline.push({ t: game.state.playTime, what: '⚠ attack warning' }));
    game.bus.on('combat:started', (e) => timeline.push({ t: game.state.playTime, what: `⚔ attack (${e.aliens} aliens)` }));
    game.bus.on('combat:ended', (e) => timeline.push({ t: game.state.playTime, what: `🏆 victory, ${e.kills} kills` }));
    game.bus.on('colony:tierUp', (e) => timeline.push({ t: game.state.playTime, what: `⬆ tier ${e.tier}` }));

    const limit = 40 * 60;
    let decide = 0;
    while (game.state.playTime < limit && game.state.colony.tier < 1) {
      decide += DT;
      if (decide >= 0.3) {
        decide = 0;
        bot.tick();
      }
      now += DT * 1000;
      game.update(DT);
    }

    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    console.log(['First-session timeline:', ...timeline.map((e) => `  ${fmt(e.t)}  ${e.what}`)].join('\n'));

    expect(game.state.colony.tier).toBe(1);
    expect(game.state.stats.wavesWon).toBeGreaterThanOrEqual(1);
    expect(game.state.colonists.list.length).toBeGreaterThanOrEqual(1);
    // An optimal bot (no reading, no menus) should still need a few minutes; a first-time player several times
    // longer. Guards against the chain stalling (too slow) or collapsing into a click-through (too fast).
    expect(game.state.playTime).toBeGreaterThan(2 * 60);
    expect(game.state.playTime).toBeLessThan(25 * 60);
    expect(cellOf(game.state.player.x)).toBeGreaterThan(0);
  }, 120_000);
});

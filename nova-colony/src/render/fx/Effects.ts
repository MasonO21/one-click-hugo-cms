/**
 * Effects — bus events that are not owned by a specific actor turned into particles and camera
 * shake: projectile impacts & explosions, shield hits, shake requests, player damage/down/respawn,
 * combat start/end, celebrations, fast travel.
 */
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import type { CameraRig } from '../scene/CameraRig';
import { CELL } from '../../core/constants';

export class Effects {
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly ctx: RenderContext, private readonly camera: CameraRig) {
    const bus = ctx.game.bus;
    const fx = ctx.particles;
    const playerPos = () => {
      const p = ctx.game.state.player;
      return { x: p.x, y: ctx.heightAt(p.x, p.z), z: p.z };
    };
    this.unsub.push(
      bus.on('projectile:impact', (e) => {
        if (!inView(ctx.env, e.x, e.z, 20)) return;
        const r = (e.splash || 0) * CELL;
        const y = Math.max(e.y, ctx.heightAt(e.x, e.z) + 0.2);
        switch (e.kind) {
          case 'flame':
            fx.fire(e.x, y, e.z, 0.5);
            fx.fire(e.x, y, e.z, 0.4);
            break;
          case 'laser':
            fx.sparks(e.x, y, e.z, 5, '#ff5a6e', 3);
            fx.flash(e.x, y, e.z, 0.5, '#ff5a6e', 0.1);
            break;
          case 'plasma':
            fx.flash(e.x, y, e.z, Math.max(1, r), '#58d0ff', 0.2);
            fx.sparks(e.x, y, e.z, 10, '#9fdcff', 5);
            fx.ring(e.x, y, e.z, Math.max(1, r), '#58d0ff', 14);
            break;
          case 'rail':
            fx.flash(e.x, y, e.z, 0.8, '#bfe6ff', 0.12);
            fx.sparks(e.x, y, e.z, 8, '#ffffff', 6);
            break;
          case 'arrow':
            fx.chips(e.x, y, e.z, '#9c6b3c', 2);
            break;
          case 'bullet':
            fx.sparks(e.x, y, e.z, 3, '#ffd36b', 3);
            break;
          default:
            if (r <= 0) fx.sparks(e.x, y, e.z, 4, '#ffb347', 3);
        }
        if (r > 0 && e.kind !== 'plasma' && e.kind !== 'flame') {
          fx.explosion(e.x, y, e.z, r);
          if (r >= 3) this.camera.addShake(Math.min(0.5, r * 0.08));
        }
      }),
      bus.on('fx:shake', (e) => this.camera.addShake(e.strength)),
      bus.on('player:damaged', () => {
        const p = playerPos();
        fx.flash(p.x, p.y + 1, p.z, 0.8, '#ff4d5e', 0.12);
        this.camera.addShake(0.12);
      }),
      bus.on('player:downed', () => {
        const p = playerPos();
        fx.dust(p.x, p.y, p.z, 10, 0.8);
        this.camera.addShake(0.3);
      }),
      bus.on('player:respawned', () => {
        const p = playerPos();
        fx.ring(p.x, p.y + 0.3, p.z, 1.5, '#5ef2ff', 18);
        fx.sparkles(p.x, p.y + 0.3, p.z, '#ffffff', 16, 0.8);
      }),
      bus.on('world:fastTravel', () => {
        const p = playerPos();
        fx.ring(p.x, p.y + 0.3, p.z, 2, '#5ef2ff', 22);
        fx.flash(p.x, p.y + 1, p.z, 1.6, '#5ef2ff', 0.3);
      }),
      bus.on('vehicle:mounted', () => {
        const p = playerPos();
        fx.dust(p.x, p.y, p.z, 8, 1);
      }),
      bus.on('combat:started', () => this.camera.addShake(0.18)),
      bus.on('combat:ended', () => {
        const core = ctx.game.sys.buildings.core();
        const x = core ? ctx.game.sys.buildings.center(core).x : 0;
        const z = core ? ctx.game.sys.buildings.center(core).z : 0;
        fx.confetti(x, ctx.heightAt(x, z) + 4, z, 40);
        fx.sparkles(x, ctx.heightAt(x, z) + 1, z, '#ffd84a', 30, 3);
      }),
      bus.on('ui:celebrate', () => {
        const p = playerPos();
        fx.confetti(p.x, p.y + 2.5, p.z, 24);
      }),
      bus.on('research:completed', () => {
        const p = playerPos();
        fx.sparkles(p.x, p.y + 1.5, p.z, '#8fa8ff', 12, 0.8);
      }),
      bus.on('reward:granted', (e) => {
        if (e.source === 'offline' || e.source === 'production') return;
        const p = playerPos();
        if (e.reward.nova) fx.sparkles(p.x, p.y + 1.2, p.z, '#b48cff', 10, 0.6);
      }),
      bus.on('resource:gained', (e) => {
        if (e.x === undefined || e.z === undefined) return;
        if (e.source !== 'loot' && e.source !== 'drop' && e.source !== 'reward') return;
        if (!inView(ctx.env, e.x, e.z, -20)) return;
        const def = ctx.game.data.resource(e.id);
        fx.sparkles(e.x, ctx.heightAt(e.x, e.z) + 0.5, e.z, def?.color ?? '#ffffff', 4, 0.4);
      }),
      bus.on('craft:completed', (e) => {
        if (e.factory == null) return;
        const b = ctx.game.sys.buildings.get(e.factory);
        if (!b) return;
        const c = ctx.game.sys.buildings.center(b);
        if (inView(ctx.env, c.x, c.z)) fx.sparkles(c.x, ctx.heightAt(c.x, c.z) + 1.5, c.z, '#ffd84a', 8, 0.8);
      }),
      bus.on('world:regionUnlocked', () => {
        const p = playerPos();
        fx.ring(p.x, p.y + 0.3, p.z, 4, '#b48cff', 30);
        fx.sparkles(p.x, p.y + 1, p.z, '#b48cff', 30, 3);
      }),
    );
  }

  dispose(): void {
    for (const u of this.unsub) u();
  }
}

/**
 * FlyToHud — resource icons arc from where they were earned (a world position or the button that was
 * just pressed) to the matching HUD chip, which pops on arrival. Particles are pooled DOM nodes driven
 * by the Web Animations API (compositor-only transforms), capped at 40 at once. Bursts of gains of the
 * same resource are merged and flushed every ~120 ms.
 */
import { h } from '../dom';
import { artOrEmoji, resourceArt } from '../art';

interface Pending {
  id: string;
  icon: string;
  amount: number;
  x: number;
  y: number;
  t: number;
}

export interface FlyTargets {
  /** Screen rect to fly toward for a resource id / 'nova' / 'rp' / 'xp' (null = no animation). */
  rect(kind: string): DOMRect | null;
  /** Hold the displayed amount back until icons land (or release it). */
  hold(id: string, n: number): void;
  release(id: string, n: number): void;
  land(id: string): void;
}

const MAX_PARTICLES = 40;

export class FlyToHud {
  readonly el: HTMLElement;
  private pool: HTMLElement[] = [];
  private live = 0;
  private pending = new Map<string, Pending>();
  private acc = 0;

  constructor(private readonly targets: FlyTargets) {
    this.el = h('div', { class: 'nv-fly' });
  }

  /** Queue a gain; icons spawn at the next flush. */
  add(id: string, icon: string, amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    const p = this.pending.get(id);
    if (p) {
      p.amount += amount;
      p.x = x;
      p.y = y;
    } else this.pending.set(id, { id, icon, amount, x, y, t: 0 });
  }

  update(dt: number): void {
    if (!this.pending.size) return;
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    for (const p of this.pending.values()) this.flush(p);
    this.pending.clear();
  }

  private flush(p: Pending): void {
    const to = this.targets.rect(p.id);
    if (!to || to.width === 0) return;
    const count = p.amount < 4 ? 1 : p.amount < 15 ? 2 : p.amount < 50 ? 3 : p.amount < 200 ? 4 : 5;
    const n = Math.min(count, MAX_PARTICLES - this.live);
    if (n <= 0) return;
    const share = p.amount / n;
    if (p.id !== 'nova' && p.id !== 'rp' && p.id !== 'xp') this.targets.hold(p.id, p.amount);
    const tx = to.left + to.width / 2;
    const ty = to.top + to.height / 2;
    for (let i = 0; i < n; i++) this.particle(p, i, share, p.x, p.y, tx, ty);
  }

  private particle(p: Pending, i: number, share: number, fx: number, fy: number, tx: number, ty: number): void {
    const el = this.pool.pop() ?? h('div', { class: 'fly' });
    // the illustrated icon for resources / Nova (already preloaded by the HUD), the emoji for RP / XP
    const src = resourceArt(p.id);
    if (src) el.replaceChildren(artOrEmoji(src, p.icon, 'fly-img'));
    else el.textContent = p.icon;
    this.el.appendChild(el);
    this.live++;
    const spread = 34;
    const sx = fx + (Math.random() - 0.5) * spread;
    const sy = fy + (Math.random() - 0.5) * spread * 0.6;
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 90;
    const my = Math.min(sy, ty) - 50 - Math.random() * 50;
    const dur = 620 + Math.random() * 260;
    const anim = el.animate(
      [
        { transform: `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%) scale(0.5)`, opacity: 0, offset: 0 },
        { transform: `translate3d(${sx}px, ${sy - 24}px, 0) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.16, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
        { transform: `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%) scale(1.05)`, opacity: 1, offset: 0.5, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)' },
        { transform: `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%) scale(0.5)`, opacity: 0.95, offset: 1 },
      ],
      { duration: dur, delay: i * 70, fill: 'both' },
    );
    anim.onfinish = () => {
      el.remove();
      this.live--;
      if (this.pool.length < MAX_PARTICLES) this.pool.push(el);
      this.targets.release(p.id, share);
      this.targets.land(p.id);
    };
  }
}

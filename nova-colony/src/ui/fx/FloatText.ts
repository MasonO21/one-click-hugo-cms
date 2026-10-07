/**
 * FloatText — world-anchored floating numbers ("+25 Wood"). Elements are pooled; each active float
 * re-projects its world position every frame so it stays glued to the spot while the camera moves.
 */
import type { RendererApi } from '../../render/api';
import { h } from '../dom';

interface Float {
  el: HTMLElement;
  x: number;
  z: number;
  y: number;
  t: number;
  dur: number;
  big: boolean;
}

const MAX = 28;

export class FloatText {
  private active: Float[] = [];
  private pool: HTMLElement[] = [];

  constructor(
    private readonly layer: HTMLElement,
    private readonly renderer: RendererApi,
  ) {}

  spawn(text: string, x: number, z: number, color?: string, big = false): void {
    const p = this.renderer.worldToScreen(x, 1.4, z);
    if (!p.visible) return;
    if (this.active.length >= MAX) this.recycle(this.active.shift()!);
    const el = this.pool.pop() ?? h('div', { class: 'float' });
    el.className = 'float' + (big ? ' big' : '');
    el.textContent = text;
    el.style.color = color ?? '#fff';
    this.layer.appendChild(el);
    // spread overlapping floats a little
    const jitter = (Math.random() - 0.5) * 0.9;
    this.active.push({ el, x: x + jitter, z: z + jitter * 0.6, y: 1.4, t: 0, dur: big ? 1.7 : 1.35, big });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.recycle(f);
        this.active.splice(i, 1);
        continue;
      }
      const p = this.renderer.worldToScreen(f.x, f.y, f.z);
      const rise = (1 - Math.pow(1 - k, 2.2)) * (f.big ? 70 : 52);
      const scale = k < 0.12 ? 0.55 + (k / 0.12) * 0.6 : k < 0.22 ? 1.15 - ((k - 0.12) / 0.1) * 0.15 : 1;
      const opacity = k < 0.08 ? k / 0.08 : k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1;
      f.el.style.opacity = p.visible ? opacity.toFixed(2) : '0';
      f.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - rise).toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
    }
  }

  private recycle(f: Float): void {
    f.el.remove();
    f.el.style.opacity = '0';
    if (this.pool.length < MAX) this.pool.push(f.el);
  }
}

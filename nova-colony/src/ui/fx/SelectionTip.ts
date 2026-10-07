/**
 * SelectionTip — a small floating label anchored to a world object (node, POI, alien, event) that
 * the player tapped. Auto-hides after a few seconds.
 */
import type { RendererApi } from '../../render/api';
import { h } from '../dom';

export class SelectionTip {
  readonly el: HTMLElement;
  private readonly ic: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private pos: { x: number; y: number; z: number } | null = null;
  private life = 0;

  constructor(private readonly renderer: RendererApi) {
    this.ic = h('span', { class: 'st-ic' });
    this.title = h('div');
    this.sub = h('small');
    this.el = h('div', { class: 'sel-tip' }, this.ic, h('div', null, this.title, this.sub));
  }

  show(icon: string, title: string, sub: string, x: number, z: number, y = 2.2): void {
    this.ic.textContent = icon;
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.sub.hidden = !sub;
    this.pos = { x, y, z };
    this.life = 3.6;
    this.el.classList.add('on');
  }

  hide(): void {
    this.pos = null;
    this.life = 0;
    this.el.classList.remove('on');
  }

  update(dt: number): void {
    if (!this.pos) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.hide();
      return;
    }
    const p = this.renderer.worldToScreen(this.pos.x, this.pos.y, this.pos.z);
    if (!p.visible) {
      this.el.style.opacity = '0';
      return;
    }
    this.el.style.opacity = '';
    this.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -110%)`;
  }
}

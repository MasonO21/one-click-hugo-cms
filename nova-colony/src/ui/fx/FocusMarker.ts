/**
 * FocusMarker — a small crosshair over the big invader the player tapped (CombatSystem.focus): the turrets that can
 * reach it shoot it first, and the marker shows which one that is. Follows the alien every frame; no allocations
 * besides the renderer's own projection.
 */
import type { Game } from '../../core/Game';
import type { RendererApi } from '../../render/api';
import { h } from '../dom';

export class FocusMarker {
  readonly el: HTMLElement;
  private on = false;

  constructor(
    private readonly game: Game,
    private readonly renderer: RendererApi,
  ) {
    this.el = h('div', { class: 'focus-mark', 'aria-hidden': 'true' }, h('i', { class: 'fm-ring' }), h('span', { class: 'fm-txt', text: 'FOCUS' }));
  }

  frame(): void {
    const id = this.game.sys.combat.focusTarget();
    const a = id == null ? undefined : this.game.state.combat.aliens.find((x) => x.id === id);
    if (!a) {
      if (this.on) {
        this.on = false;
        this.el.classList.remove('on');
      }
      return;
    }
    // on the alien's body (the tapped tip floats above it)
    const def = this.game.data.alien(a.def);
    const p = this.renderer.worldToScreen(a.x, a.y + 0.6 * (def?.scale ?? 1), a.z);
    if (!p.visible) {
      this.el.classList.remove('on');
      this.on = false;
      return;
    }
    if (!this.on) {
      this.on = true;
      this.el.classList.add('on');
    }
    this.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -1.6em)`;
  }
}

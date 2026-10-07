/**
 * Context button (#btn-interact): shows the best interaction near the player (icon + label from
 * PlayerSystem.interaction()). Tap sets game.input.interact; holding sets interactHeld.
 */
import type { UiCtx } from '../ctx';
import { h, setClass, setText } from '../dom';
import { buildingArt, iconEl } from '../art';

export class InteractButton {
  readonly el: HTMLButtonElement;
  private readonly ic: HTMLElement;
  private readonly lb: HTMLElement;
  private kind = '';
  private shownKey = '';

  constructor(private readonly ctx: UiCtx) {
    this.ic = h('span', { class: 'ic' });
    this.lb = h('span', { class: 'lb' });
    this.el = h<HTMLButtonElement>('button', { id: 'btn-interact', class: 'interact', type: 'button', hidden: true, 'aria-label': 'Interact' }, this.ic, this.lb);
    const input = ctx.game.input;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      input.interact = true;
      input.interactHeld = true;
      this.el.classList.add('down');
      ctx.haptic('tap');
    };
    const up = () => {
      input.interactHeld = false;
      this.el.classList.remove('down');
    };
    this.el.addEventListener('pointerdown', down);
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('lostpointercapture', up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Poll the player system (≈10 Hz). */
  poll(): void {
    const it = this.ctx.game.sys.player.interaction();
    if (!it) {
      if (!this.el.hidden) {
        this.el.hidden = true;
        this.shownKey = '';
        this.ctx.game.input.interactHeld = false;
      }
      return;
    }
    // near a building the button shows that building's picture instead of its emoji
    const art = it.kind === 'building' ? buildingArt(this.ctx.game.sys.buildings.get(Number(it.target))?.def ?? '') : null;
    const key = it.kind + '|' + it.label + '|' + it.icon + '|' + (art ?? '');
    if (this.el.hidden) {
      this.el.hidden = false;
      // restart the pop-in animation
      this.el.style.animation = 'none';
      void this.el.offsetWidth;
      this.el.style.animation = '';
    }
    if (key === this.shownKey) return;
    this.shownKey = key;
    if (art) this.ic.replaceChildren(iconEl(art, it.icon, 'ic-pic', 'span'));
    else this.ic.textContent = it.icon;
    setText(this.lb, it.label);
    if (this.kind) setClass(this.el, 'k-' + this.kind, false);
    this.kind = it.kind;
    setClass(this.el, 'k-' + this.kind, true);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}

/**
 * Context button (#btn-interact): shows the best interaction near the player (icon + label from
 * PlayerSystem.interaction()). Tap sets game.input.interact; holding sets interactHeld.
 */
import type { UiCtx } from '../ctx';
import { h, setClass, setText } from '../dom';
import { buildingArt, iconEl, poiArt, professionArt } from '../art';
import { jobOf } from '../logic/colonist';

export class InteractButton {
  readonly el: HTMLButtonElement;
  private readonly ic: HTMLElement;
  private readonly lb: HTMLElement;
  private kind = '';
  private shownKey = '';

  constructor(private readonly ctx: UiCtx) {
    this.ic = h('span', { class: 'ic' });
    this.lb = h('span', { class: 'lb' });
    this.el = h<HTMLButtonElement>('button', { id: 'btn-interact', class: 'interact', type: 'button', hidden: true, 'aria-label': 'Interact', 'data-haptic': 'none' }, this.ic, this.lb);
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
    // near a building or a point of interest the button shows its picture instead of the emoji
    const art = this.artFor(it.kind, it.target);
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

  private artFor(kind: string, target: number | string | null): string | null {
    const g = this.ctx.game;
    switch (kind) {
      case 'building':
        return buildingArt(g.sys.buildings.get(Number(target))?.def ?? '');
      case 'loot':
      case 'rescue':
      case 'beacon': {
        const p = g.sys.world.gen?.pois.find((q) => q.id === target);
        return p ? poiArt(p.def) : null;
      }
      case 'chat': {
        // a colonist with a Chat wish: their portrait
        const c = g.sys.colonists.get(Number(target));
        return c ? professionArt(jobOf(g, c)) : null;
      }
      case 'event': {
        const ev = g.state.world.events.find((e) => e.id === target);
        const poi = ev ? g.data.worldEvent(ev.def)?.poi : undefined;
        return poi ? poiArt(poi) : null;
      }
      default:
        return null;
    }
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}

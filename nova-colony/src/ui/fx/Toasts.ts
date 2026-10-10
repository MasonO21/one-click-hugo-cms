/**
 * Toasts — stacked, auto-dismissing notifications drawn from a small element pool.
 * Identical messages within a short window merge into a "×N" counter instead of stacking.
 *
 * A tappable toast tells a tap from a drag: in portrait the stack sits over the joystick, and a thumb put down there
 * to walk must walk. A touch on it that moves more than OVERLAY_DRAG_PX or is held past OVERLAY_HOLD_MS is handed to
 * the world (`handoff` → InputController.adopt) as if it had started there; only a short, still touch opens it.
 */
import type { ToastKind } from '../ctx';
import { h } from '../dom';
import { artOrEmoji, isArtSrc } from '../art';
import { OVERLAY_HOLD_MS, overlayGesture } from '../logic/input';

/** A finger down on a tappable toast that has not yet shown whether it is a tap. */
interface Press {
  id: number;
  type: string;
  x0: number;
  y0: number;
  t0: number;
  x: number;
  y: number;
  timer: number;
}

interface Active {
  el: HTMLElement;
  text: string;
  count: number;
  counter: HTMLElement;
  timer: number;
  /** Tapping the toast does this (and dismisses it): e.g. open the Journal. */
  onTap?: () => void;
  press?: Press;
  /** The click that follows a touch handed to the world (a drag, a hold) is not a tap. */
  swallowClick?: boolean;
}

/** Hands a touch that began on a toast to the world: (pointer, type, start x/y/time, current x/y). False: it was lost. */
export type ToastHandoff = (id: number, type: string, x0: number, y0: number, t0: number, x: number, y: number) => boolean;

const DEFAULT_ICON: Record<ToastKind, string> = { info: '💬', success: '✅', warning: '⚠️', reward: '📦', danger: '❗' };
const MAX_VISIBLE = 4;

export class Toasts {
  readonly el: HTMLElement;
  private active: Active[] = [];
  private pool: HTMLElement[] = [];
  /** Set by the UI once the world input exists. */
  handoff: ToastHandoff | null = null;

  constructor() {
    this.el = h('div', { class: 'nv-toasts', 'aria-live': 'polite' });
  }

  show(text: string, kind: ToastKind = 'info', icon?: string, onTap?: () => void): void {
    const dup = this.active.find((a) => a.text === text);
    if (dup) {
      if (onTap) this.setTap(dup, onTap);
      dup.count++;
      dup.counter.textContent = `×${dup.count}`;
      dup.counter.hidden = false;
      dup.el.classList.remove('pop');
      void dup.el.offsetWidth;
      dup.el.classList.add('pop');
      this.arm(dup, kind);
      return;
    }
    // short (landscape phone) screens keep the stack small so the world stays visible
    const max = typeof window !== 'undefined' && window.innerHeight < 500 ? MAX_VISIBLE - 1 : MAX_VISIBLE;
    while (this.active.length >= max) this.dismiss(this.active[0], true);

    const el = this.pool.pop() ?? this.make();
    el.className = `toast ${kind}`;
    const ic = el.querySelector('.t-ic') as HTMLElement;
    const tx = el.querySelector('.t-tx') as HTMLElement;
    const counter = el.querySelector('.t-x') as HTMLElement;
    // an illustration URL (resource icon, colonist portrait, event art) instead of an emoji
    const art = isArtSrc(icon);
    ic.className = 't-ic' + (art ? ' art' + (icon.includes('/professions/') ? ' face' : icon.includes('/events/') ? ' wide' : '') : '');
    if (art) ic.replaceChildren(artOrEmoji(icon, DEFAULT_ICON[kind], 'ta'));
    else ic.textContent = icon ?? DEFAULT_ICON[kind];
    tx.textContent = text;
    counter.hidden = true;
    const a: Active = { el, text, count: 1, counter, timer: 0 };
    this.setTap(a, onTap);
    this.active.push(a);
    this.el.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    this.arm(a, kind);
  }

  /** Dismiss everything on screen (a modal just opened and says it better). */
  clear(): void {
    for (const a of [...this.active]) this.dismiss(a);
  }

  /** Dismiss the toasts that open something when tapped (a panel just opened under them). Returns their texts. */
  clearTappable(): string[] {
    const list = this.active.filter((a) => a.onTap);
    for (const a of list) this.dismiss(a);
    return list.map((a) => a.text);
  }

  private make(): HTMLElement {
    const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 't-ic' }), h('span', { class: 't-tx' }), h('span', { class: 't-x', hidden: true }));
    const find = (): Active | undefined => this.active.find((x) => x.el === el);
    el.addEventListener('pointerdown', (e) => {
      const a = find();
      if (!a?.onTap || a.press) return;
      a.swallowClick = false;
      const t0 = performance.now();
      // held still past OVERLAY_HOLD_MS: a thumb resting to walk
      const timer = window.setTimeout(() => this.toWorld(a), OVERLAY_HOLD_MS);
      a.press = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, t0, x: e.clientX, y: e.clientY, timer };
    });
    el.addEventListener('pointermove', (e) => {
      const a = find();
      const p = a?.press;
      if (!a || !p || p.id !== e.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (overlayGesture(Math.hypot(p.x - p.x0, p.y - p.y0), performance.now() - p.t0) === 'world') this.toWorld(a);
    });
    el.addEventListener('pointerup', (e) => {
      const a = find();
      const p = a?.press;
      if (!a || !p || p.id !== e.pointerId) return;
      this.endPress(a);
      // a tap opens on the click that follows (opening on pointerup let that click land on the new sheet's backdrop
      // and close it again); a touch that was really a drag or a hold lets it pass
      if (overlayGesture(Math.hypot(e.clientX - p.x0, e.clientY - p.y0), performance.now() - p.t0) === 'world') a.swallowClick = true;
    });
    el.addEventListener('pointercancel', () => {
      const a = find();
      if (a?.press) this.endPress(a);
    });
    el.addEventListener('click', () => {
      const a = find();
      if (!a) return;
      if (a.swallowClick) {
        a.swallowClick = false;
        return;
      }
      this.activate(a);
    });
    return el;
  }

  private activate(a: Active): void {
    const tap = a.onTap;
    if (!tap) return;
    this.dismiss(a);
    tap();
  }

  private endPress(a: Active): void {
    if (a.press) window.clearTimeout(a.press.timer);
    a.press = undefined;
  }

  /** The touch on this toast is a drag or a hold, not a tap: the world takes it from here (the joystick, the camera). */
  private toWorld(a: Active): void {
    const p = a.press;
    if (!p) return;
    this.endPress(a);
    a.swallowClick = true;
    this.handoff?.(p.id, p.type, p.x0, p.y0, p.t0, p.x, p.y);
  }

  /** Make a toast tappable (or not): the `tappable` class turns its pointer events on. */
  private setTap(a: Active, onTap?: () => void): void {
    a.onTap = onTap;
    a.el.classList.toggle('tappable', !!onTap);
    if (onTap) a.el.setAttribute('role', 'button');
    else a.el.setAttribute('role', 'status');
  }

  private arm(a: Active, kind: ToastKind): void {
    window.clearTimeout(a.timer);
    a.timer = window.setTimeout(() => this.dismiss(a), kind === 'reward' ? 4200 : 3200);
  }

  private dismiss(a: Active, now = false): void {
    // a finger still resting on it goes on to the world rather than being stranded on a vanishing element
    if (a.press) this.toWorld(a);
    window.clearTimeout(a.timer);
    this.active = this.active.filter((x) => x !== a);
    a.el.classList.remove('in');
    a.el.classList.add('out');
    const done = () => {
      a.el.remove();
      a.el.classList.remove('out', 'pop');
      if (this.pool.length < 8) this.pool.push(a.el);
    };
    if (now) done();
    else window.setTimeout(done, 320);
  }
}

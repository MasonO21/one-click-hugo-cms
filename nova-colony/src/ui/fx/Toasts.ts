/**
 * Toasts — stacked, auto-dismissing notifications drawn from a small element pool.
 * Identical messages within a short window merge into a "×N" counter instead of stacking.
 */
import type { ToastKind } from '../ctx';
import { h } from '../dom';
import { artOrEmoji, isArtSrc } from '../art';

interface Active {
  el: HTMLElement;
  text: string;
  count: number;
  counter: HTMLElement;
  timer: number;
  /** Tapping the toast does this (and dismisses it): e.g. open the Journal. */
  onTap?: () => void;
}

const DEFAULT_ICON: Record<ToastKind, string> = { info: '💬', success: '✅', warning: '⚠️', reward: '🎁', danger: '❗' };
const MAX_VISIBLE = 4;

export class Toasts {
  readonly el: HTMLElement;
  private active: Active[] = [];
  private pool: HTMLElement[] = [];

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

  private make(): HTMLElement {
    const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 't-ic' }), h('span', { class: 't-tx' }), h('span', { class: 't-x', hidden: true }));
    el.addEventListener('click', () => {
      const a = this.active.find((x) => x.el === el);
      if (!a?.onTap) return;
      const tap = a.onTap;
      this.dismiss(a);
      tap();
    });
    return el;
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

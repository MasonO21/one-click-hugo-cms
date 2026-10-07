/**
 * Panel — base class for every slide-up sheet, drawer, side card and modal.
 *
 * Lifecycle (driven by PanelManager): mount() -> onOpen(arg) -> refresh(true) ... refresh()/live(dt)
 * while open ... onClose(). `refresh()` re-renders only when `signature()` changes, keeping scroll
 * positions, so panels stay cheap to leave open while the sim keeps running.
 */
import type { Game } from '../../core/Game';
import type { GameState } from '../../core/state';
import type { DataRegistry } from '../../data';
import type { UiCtx } from '../ctx';
import { append, clear, h, fill, safe, tryRun, type Child } from '../dom';

export type PanelKind = 'sheet' | 'drawer' | 'side' | 'modal';

export interface PanelTitle {
  icon: string;
  text: string;
}

export abstract class Panel {
  abstract readonly name: string;
  readonly kind: PanelKind = 'sheet';
  /** Backdrop tap / Esc closes it. */
  readonly dismissable: boolean = true;
  readonly hasHeader: boolean = true;
  /** Removes body padding (full-bleed content such as the map). */
  readonly flush: boolean = false;

  frame!: HTMLElement;
  card!: HTMLElement;
  head!: HTMLElement;
  body!: HTMLElement;
  private titleIcon!: HTMLElement;
  private titleText!: HTMLElement;
  private extraEl!: HTMLElement;
  protected arg: unknown;
  /** Bump when local UI state (tab, selection) changes so `signature()` sees it. */
  protected rev = 0;
  private sig: string | null = null;
  private lastTitle = '';
  private sinceRefresh = 0;

  constructor(protected readonly ctx: UiCtx) {}

  protected get game(): Game {
    return this.ctx.game;
  }
  protected get data(): DataRegistry {
    return this.ctx.data;
  }
  protected get st(): GameState {
    return this.ctx.game.state;
  }

  /** Header title. */
  abstract title(): PanelTitle;
  /** Fill `this.body`. Called on open and whenever the signature changes. */
  abstract render(): void;
  /** Cheap string that changes whenever the rendered content would change. */
  signature(): string {
    return '';
  }
  /** Optional header widgets (right side). */
  extras(): Child {
    return null;
  }
  /** Called once after mounting. */
  onOpen(_arg: unknown): void {}
  /** Called when `open()` is invoked again while the panel is already open. */
  onArg(_arg: unknown): void {}
  onClose(): void {}
  /** Per-frame hook for live bits (progress bars, countdowns) — keep it light. */
  live(_dt: number): void {}

  setArg(arg: unknown): void {
    this.arg = arg;
  }

  /** `ui:open` args may be a bare value (`'research'`, `12`) or an object (`{ id }`): read either form. */
  protected pick<T>(arg: unknown, key: string): T | undefined {
    if (arg == null) return undefined;
    if (typeof arg === 'object') return (arg as Record<string, T>)[key];
    return arg as T;
  }

  /** Build the frame DOM (called by PanelManager). */
  mount(): HTMLElement {
    this.titleIcon = h('span', { class: 'ti' });
    this.titleText = h('span', { class: 'tt' });
    this.extraEl = h('div', { class: 'pm-extra' });
    const close = h('button', { class: 'icon-btn pm-close', type: 'button', 'aria-label': 'Close', text: '✕', data: { sfx: 'ui_close' } });
    close.addEventListener('click', () => this.ctx.close(this.name));
    this.head = h('header', { class: 'pm-head' }, h('h2', { class: 'pm-title' }, this.titleIcon, this.titleText), this.extraEl, close);
    this.body = h('div', { class: 'pm-body' + (this.flush ? ' nopad' : ''), data: { scroll: 'body' } });
    this.card = h('section', { class: 'pm-card', data: { panel: this.name } }, this.hasHeader ? this.head : null, this.body);
    const backdrop = h('div', { class: 'pm-backdrop' });
    backdrop.addEventListener('click', () => {
      if (this.dismissable) this.ctx.close(this.name);
    });
    this.frame = h('div', { class: `pm-frame kind-${this.kind}` }, backdrop, this.card);
    return this.frame;
  }

  /** Re-render when forced or the signature changed. */
  refresh(force = false): void {
    let sig: string;
    try {
      sig = this.signature() + '|' + this.rev;
    } catch (e) {
      // a broken system must not freeze the panel: render once, then keep the last good frame
      tryRun(`panel ${this.name} signature`, () => {
        throw e;
      });
      sig = 'signature-error|' + this.rev;
    }
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.renderNow();
  }

  /** Force a re-render at the next refresh (after an action). */
  invalidate(): void {
    this.sig = null;
  }

  /** Re-render immediately (after a local action). */
  rerender(): void {
    this.rev++;
    this.refresh(true);
  }

  private renderNow(): void {
    const scrolls = this.saveScroll();
    const ok = tryRun(`panel ${this.name} render`, () => {
      this.renderHeader();
      this.render();
    });
    if (!ok) this.renderError();
    this.restoreScroll(scrolls);
  }

  private renderError(): void {
    fill(this.body, h('div', { class: 'empty' }, h('div', { class: 'big-ico', text: '🛠️' }), h('div', { class: 'h3', text: 'This page is being polished' }), h('div', { class: 'mute', text: 'Please try again in a moment.' })));
  }

  private renderHeader(): void {
    const t = this.title();
    const key = t.icon + t.text;
    if (key !== this.lastTitle) {
      this.lastTitle = key;
      this.titleIcon.textContent = t.icon;
      this.titleText.textContent = t.text;
    }
    const ex = this.extras();
    clear(this.extraEl);
    if (ex) append(this.extraEl, [ex]);
  }

  private saveScroll(): Map<string, [number, number]> {
    const m = new Map<string, [number, number]>();
    if (!this.body) return m;
    const els = [this.body, ...Array.from(this.body.querySelectorAll<HTMLElement>('[data-scroll]'))];
    for (const el of els) {
      const k = el.getAttribute('data-scroll');
      if (k && (el.scrollTop || el.scrollLeft)) m.set(k, [el.scrollTop, el.scrollLeft]);
    }
    return m;
  }

  private restoreScroll(m: Map<string, [number, number]>): void {
    if (!m.size) return;
    const els = [this.body, ...Array.from(this.body.querySelectorAll<HTMLElement>('[data-scroll]'))];
    for (const el of els) {
      const k = el.getAttribute('data-scroll');
      const v = k ? m.get(k) : undefined;
      if (v) {
        el.scrollTop = v[0];
        el.scrollLeft = v[1];
      }
    }
  }

  /** Called every frame by the manager; refreshes at ~4 Hz. */
  tick(dt: number): void {
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= 0.25) {
      this.sinceRefresh = 0;
      this.refresh();
    }
    safe(`panel ${this.name} live`, () => this.live(dt));
  }
}

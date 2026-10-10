/**
 * The notifications card. Never at launch: it is armed at a moment the value is obvious (the first tier-up, once
 * its celebration has closed, or collecting a Welcome Back) and slides in when the screen is free. It explains what
 * the player gets; only "Yes, please!" shows the OS prompt. Asked once (`settings.notifyAsked`), on iOS / Android
 * only (`game.notifications.canAsk()`); the Settings toggle covers everything after that.
 *
 * Same card as the analytics consent prompt (styles/consent.css), at the same spot, so it waits while that one is
 * up, and steps aside while a panel, the build drawer or build mode is open.
 */
import './styles/consent.css';
import type { UiCtx } from './ctx';
import { h } from './dom';
import { btn } from './widgets';

/** Seconds the screen must stay free after the moment before the card appears (the tier-up card opens ~1.8 s in). */
export const NOTIFY_PROMPT_DELAY = 3;

export const NOTIFY_GRANTED_TOAST = "Lovely! We'll send a gentle nudge now and then.";
export const NOTIFY_LATER_TOAST = 'No problem! You can turn reminders on in Settings anytime.';

export class NotifyPrompt {
  private el: HTMLElement | null = null;
  private armed = false;
  private wait = NOTIFY_PROMPT_DELAY;
  private answering = false;

  /** `busy`: a panel, the build drawer, build mode or the consent card is up. */
  constructor(
    private readonly ctx: UiCtx,
    private readonly parent: HTMLElement,
    private readonly busy: () => boolean,
  ) {
    const bus = ctx.game.bus;
    bus.on('colony:tierUp', () => this.arm());
    bus.on('offline:claimed', () => this.arm());
  }

  /** The card is on screen. */
  get shown(): boolean {
    return this.el !== null;
  }

  /** A good moment happened: show the card once the screen is free (if it can still ask). */
  arm(): void {
    this.armed = true;
    this.wait = NOTIFY_PROMPT_DELAY;
  }

  /** Not this time (the analytics card took this moment): wait for the next tier-up or Welcome Back. */
  disarm(): void {
    if (!this.el) this.armed = false;
  }

  /** Call every frame. */
  update(dt: number): void {
    const n = this.ctx.game.notifications;
    if (this.el) {
      if (!this.answering && !n?.canAsk()) this.hide(); // answered in Settings meanwhile
      else this.el.classList.toggle('away', this.busy());
      return;
    }
    if (!this.armed || !n?.canAsk()) return;
    if (this.busy()) {
      this.wait = NOTIFY_PROMPT_DELAY;
      return;
    }
    this.wait -= dt;
    if (this.wait <= 0) this.show();
  }

  /** On screen right now (not stepped aside for a panel or build mode). */
  get visible(): boolean {
    return this.el !== null && !this.el.classList.contains('away');
  }

  /** Back pressed while the card is up: same as "Not now". False when it isn't visible. */
  dismiss(): boolean {
    if (!this.visible) return false;
    void this.answer(false);
    return true;
  }

  private show(): void {
    this.el = h(
      'div',
      { class: 'consent-card notify-card', role: 'dialog', 'aria-label': 'Notifications' },
      h('div', { class: 'consent-ico', text: '🔔' }),
      h(
        'div',
        { class: 'consent-body' },
        h('div', { class: 'consent-title', text: 'Want a little heads-up?' }),
        h('div', {
          class: 'consent-text',
          text: "Your colony keeps working while you're away. We'll let you know when your storehouses fill up or your daily gift is ready. Just a few gentle reminders, never at night.",
        }),
      ),
      h(
        'div',
        { class: 'consent-actions' },
        btn({ label: 'Not now', cls: 'ghost small', data: { notify: 'later' }, onClick: () => void this.answer(false) }),
        btn({ label: 'Yes, please!', cls: 'good small', data: { notify: 'yes' }, onClick: () => void this.answer(true) }),
      ),
    );
    this.parent.appendChild(this.el);
    requestAnimationFrame(() => this.el?.classList.add('in'));
  }

  private async answer(yes: boolean): Promise<void> {
    const n = this.ctx.game.notifications;
    if (this.answering || !n) return;
    this.answering = true;
    this.armed = false;
    this.ctx.haptic('tap');
    this.hide(); // the OS prompt comes next, on top of the game
    try {
      const p = await n.answerCard(yes);
      if (yes && p === 'granted') this.ctx.toast(NOTIFY_GRANTED_TOAST, 'success', '🔔');
      else this.ctx.toast(NOTIFY_LATER_TOAST, 'info', '🔔');
    } finally {
      this.answering = false;
    }
  }

  private hide(): void {
    const el = this.el;
    this.el = null;
    if (!el) return;
    el.classList.remove('in');
    window.setTimeout(() => el.remove(), 250);
  }
}

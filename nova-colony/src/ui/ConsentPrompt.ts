/**
 * First-launch analytics consent card. Analytics are opt-in: nothing is collected until the player taps
 * "Sure" here (or enables it in Settings). The card is small, non-blocking and waits a few seconds so it
 * never covers the crash-landing moment; it also waits while a full-screen panel/modal is open.
 */
import './styles/consent.css';
import type { UiCtx } from './ctx';
import { h } from './dom';
import { btn } from './widgets';

/** Seconds of play before the card appears on a first launch. */
const DELAY = 6;

export class ConsentPrompt {
  private el: HTMLElement | null = null;
  private wait = DELAY;

  constructor(private readonly ctx: UiCtx, private readonly parent: HTMLElement) {}

  /** Call every frame. Shows the card once, until the player answers. */
  update(dt: number): void {
    const s = this.ctx.game.state.settings;
    if (s.analyticsAsked) {
      if (this.el) this.hide();
      return;
    }
    if (this.el) return;
    if (this.ctx.game.view.panelOpen) return;
    this.wait -= dt;
    if (this.wait <= 0) this.show();
  }

  private show(): void {
    const details = h('div', {
      class: 'consent-details',
      text: 'Things like which buildings you place, how long missions take and where players get stuck — tied to a random install id, never to you. No personal info, and it is never used for advertising.',
    });
    const more = h('button', { class: 'consent-more', type: 'button', text: 'What is shared?' });
    more.addEventListener('click', () => {
      this.el?.classList.toggle('open');
      this.ctx.sfx('ui_click');
    });
    this.el = h(
      'div',
      { class: 'consent-card', role: 'dialog', 'aria-label': 'Anonymous gameplay stats' },
      h('div', { class: 'consent-ico', text: '📊' }),
      h(
        'div',
        { class: 'consent-body' },
        h('div', { class: 'consent-title', text: 'Help make Nova Colony even cozier?' }),
        h('div', { class: 'consent-text', text: 'Share anonymous gameplay stats with us. You can change this anytime in Settings.' }),
        more,
        details,
      ),
      h(
        'div',
        { class: 'consent-actions' },
        btn({ label: 'No thanks', cls: 'ghost small', onClick: () => this.answer(false) }),
        btn({ label: 'Sure!', cls: 'good small', onClick: () => this.answer(true) }),
      ),
    );
    this.parent.appendChild(this.el);
    requestAnimationFrame(() => this.el?.classList.add('in'));
  }

  private answer(yes: boolean): void {
    const g = this.ctx.game;
    g.state.settings.analytics = yes;
    g.state.settings.analyticsAsked = true;
    g.services.analytics.setConsent(yes);
    this.ctx.sfx('ui_click');
    this.ctx.haptic('tap');
    if (yes) this.ctx.toast('Thank you! 💛', 'success');
    this.hide();
  }

  private hide(): void {
    const el = this.el;
    this.el = null;
    if (!el) return;
    el.classList.remove('in');
    window.setTimeout(() => el.remove(), 250);
  }
}

/**
 * MerchantPanel — the wandering merchant (world event). Each trade swaps resources for resources.
 */
import { Panel, type PanelTitle } from './Panel';
import { bagCovers } from '../../core/bag';
import { fmtHMS } from '../logic/time';
import { btn, costChips, emptyState, rewardChips } from '../widgets';
import { fill, h } from '../dom';

export class MerchantPanel extends Panel {
  readonly name = 'merchant';
  private eventId = -1;
  private acc = 0;

  title(): PanelTitle {
    const def = this.event() ? this.data.worldEvent(this.event()!.def) : undefined;
    return { icon: def?.icon ?? '🧳', text: def?.name ?? 'Wandering merchant' };
  }

  override onOpen(arg: unknown): void {
    this.eventId = Number(arg);
  }

  override onArg(arg: unknown): void {
    this.eventId = Number(arg);
    this.rev++;
  }

  private event() {
    return this.st.world.events.find((e) => e.id === this.eventId);
  }

  override signature(): string {
    const have = this.st.resources.amounts;
    const e = this.event();
    const def = e ? this.data.worldEvent(e.def) : undefined;
    const mask = (def?.trades ?? []).map((t) => (bagCovers(have, t.give) ? 1 : 0)).join('');
    return `${e ? e.id : 'gone'}|${mask}`;
  }

  override live(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const e = this.event();
    const el = this.body.querySelector('[data-left]');
    if (e && el) el.textContent = fmtHMS(Math.max(0, e.endsAt - this.st.playTime));
  }

  render(): void {
    const g = this.game;
    const e = this.event();
    const def = e ? this.data.worldEvent(e.def) : undefined;
    if (!e || !def) {
      fill(this.body, emptyState('🧳', 'The merchant has moved on', 'Keep an eye out — they pass by every so often!'));
      return;
    }
    const wrap = h('div', { class: 'stack-v' });
    wrap.appendChild(h('div', { class: 'card tint' }, h('div', { class: 'mute', text: def.description }), h('div', { class: 'small', style: 'margin-top:.3em' }, 'Leaving in ', h('b', { 'data-left': '1', text: fmtHMS(Math.max(0, e.endsAt - g.state.playTime)) }))));
    const trades = def.trades ?? [];
    if (!trades.length) wrap.appendChild(emptyState('🧳', 'Nothing to trade today'));
    trades.forEach((t, i) => {
      const can = bagCovers(g.state.resources.amounts, t.give);
      wrap.appendChild(
        h(
          'div',
          { class: 'card trade', data: { trade: i } },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'mute small', text: 'You give' }), costChips(this.data, t.give, g.state.resources.amounts)), h('div', { class: 'arrow', text: '➜' }), h('div', { class: 'grow' }, h('div', { class: 'mute small', text: 'You get' }), rewardChips(this.data, { resources: t.get }))),
          btn({
            label: 'Trade',
            cls: 'good block',
            disabled: can ? false : 'Not enough resources for this trade',
            onClick: () => {
              if (g.sys.worldEvents.claim(e.id, i)) {
                this.ctx.sfx('coin');
                this.ctx.haptic('success');
              } else this.ctx.toast("The merchant can't do that trade right now", 'info', '🧳');
              this.rerender();
            },
          }),
        ),
      );
    });
    fill(this.body, wrap);
  }
}

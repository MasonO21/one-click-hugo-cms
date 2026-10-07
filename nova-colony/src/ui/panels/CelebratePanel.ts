/**
 * CelebratePanel + RewardPanel — confetti-and-shine modals. `celebrate` is big for tier-ups and
 * milestones; `reward` is the generic "you got these!" popup for crates, daily gifts, season claims.
 */
import { Panel, type PanelTitle } from './Panel';
import type { Reward } from '../../data/schema';
import { rewardParts } from '../logic/rewards';
import { btn } from '../widgets';
import { confetti } from '../fx/Confetti';
import { fill, h, setVar } from '../dom';

export interface CelebrateArg {
  title: string;
  text?: string;
  icon?: string;
  /** Tier celebration: colours + unlock list. */
  tier?: number;
  unlocks?: string[];
  big?: boolean;
  /** No confetti / fanfare (e.g. the crash-landing intro). */
  quiet?: boolean;
  /** Button label (default "Awesome!" / "Onward!" for tiers). */
  ok?: string;
}

export class CelebratePanel extends Panel {
  readonly name = 'celebrate';
  override readonly kind = 'modal' as const;
  override readonly hasHeader = false;

  title(): PanelTitle {
    return { icon: '🎉', text: 'Celebrate' };
  }

  override onOpen(): void {
    const a = this.arg as CelebrateArg;
    if (a.quiet) return;
    if (a.tier == null) this.ctx.sfx('celebrate'); // tier-ups are voiced by the audio layer on colony:tierUp
    this.ctx.haptic('heavy');
    window.setTimeout(() => {
      if (this.frame?.isConnected) confetti(this.frame, { count: a.big || a.tier != null ? 90 : 56, y: this.frame.clientHeight * 0.3, power: a.big || a.tier != null ? 1.3 : 1 });
    }, 180);
  }

  render(): void {
    const a = this.arg as CelebrateArg;
    const tier = a.tier != null ? this.data.tier(a.tier) : null;
    const wrap = h('div', { class: 'celebrate' + (tier ? ' tier' : '') });
    if (tier) {
      setVar(wrap, '--tc', tier.color);
      setVar(wrap, '--ta', tier.accent);
    }
    wrap.appendChild(h('div', { class: 'cb-burst' }, h('div', { class: 'cb-rays' }), h('div', { class: 'cb-ic', text: a.icon ?? (tier ? '🏰' : '🎉') })));
    wrap.appendChild(h('h2', { class: 'cb-title', text: a.title }));
    if (a.text) wrap.appendChild(h('div', { class: 'cb-text', text: a.text }));
    if (a.unlocks?.length) {
      wrap.appendChild(h('div', { class: 'mute small center', text: 'Newly available:' }));
      const chips = h('div', { class: 'chips center-chips' });
      for (const u of a.unlocks.slice(0, 8)) chips.appendChild(h('span', { class: 'chip info', text: u }));
      wrap.appendChild(chips);
    }
    wrap.appendChild(btn({ label: a.ok ?? (tier ? 'Onward!' : 'Awesome!'), cls: 'big good block', id: 'btn-celebrate-ok', onClick: () => this.ctx.close(this.name) }));
    fill(this.body, wrap);
  }
}

export interface RewardArg {
  title: string;
  reward: Reward;
  icon?: string;
}

export class RewardPanel extends Panel {
  readonly name = 'reward';
  override readonly kind = 'modal' as const;
  override readonly hasHeader = false;

  title(): PanelTitle {
    return { icon: '🎁', text: 'Reward' };
  }

  override onOpen(): void {
    this.ctx.sfx('reward');
    window.setTimeout(() => {
      if (this.frame?.isConnected) confetti(this.frame, { count: 40, y: this.frame.clientHeight * 0.3, power: 0.9 });
    }, 150);
  }

  render(): void {
    const a = this.arg as RewardArg;
    const parts = rewardParts(a.reward, this.data);
    const wrap = h('div', { class: 'celebrate reward' });
    wrap.appendChild(h('div', { class: 'cb-burst small' }, h('div', { class: 'cb-rays' }), h('div', { class: 'cb-ic', text: a.icon ?? '🎁' })));
    wrap.appendChild(h('h2', { class: 'cb-title', text: a.title }));
    const list = h('div', { class: 'reward-cards' });
    parts.forEach((p, i) => list.appendChild(h('div', { class: 'rcard pop-in', style: { animationDelay: `${120 + i * 100}ms`, '--rc': p.color } }, h('div', { class: 'ri', text: p.icon }), h('b', { class: 'num', text: p.amount }), h('small', { text: p.label }))));
    wrap.appendChild(parts.length ? list : h('div', { class: 'cb-text', text: 'Enjoy your new perks — thank you for playing!' }));
    wrap.appendChild(btn({ label: 'Nice!', cls: 'big good block', id: 'btn-reward-ok', onClick: () => this.ctx.close(this.name) }));
    fill(this.body, wrap);
  }
}

/**
 * CelebratePanel + RewardPanel — confetti-and-shine modals. `celebrate` is big for tier-ups and
 * milestones; `reward` is the generic "you got these!" popup for crates, daily gifts, season claims.
 */
import { Panel, type PanelTitle } from './Panel';
import type { Reward } from '../../data/schema';
import { rewardParts } from '../logic/rewards';
import { btn, partIcon } from '../widgets';
import { confetti } from '../fx/Confetti';
import { artOrEmoji, isArtSrc } from '../art';
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
  /** Illustration shown big instead of the emoji burst (tier, biome postcard, world event, new colonist). */
  art?: string | null;
  artKind?: 'tier' | 'biome' | 'event' | 'portrait';
  /** Ring colour of a portrait (the colonist's rarity). */
  ring?: string;
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
    // landscape illustrations (tier, postcard, event) get the wide two-column card on a landscape phone
    if (a.art && a.artKind !== 'portrait') this.card.classList.add('wide');
    if (a.quiet) return;
    if (a.tier == null) this.ctx.sfx('celebrate'); // tier-ups are voiced by the audio layer on colony:tierUp
    this.ctx.haptic('heavy');
    window.setTimeout(() => {
      if (this.frame?.isConnected) confetti(this.frame, { count: a.big || a.tier != null ? 90 : 56, y: this.frame.clientHeight * 0.3, power: a.big || a.tier != null ? 1.3 : 1 });
    }, 180);
    // Titanium is the finale: two more bursts while the illustration shines
    if (a.tier != null && a.tier >= 6) {
      for (const [at, count] of [[950, 80], [1900, 70]] as const) {
        window.setTimeout(() => {
          if (this.frame?.isConnected) confetti(this.frame, { count, y: this.frame.clientHeight * 0.25, power: 1.5 });
        }, at);
      }
    }
  }

  /** The big picture of a celebration: tier illustration, biome postcard, event art or a colonist portrait. */
  private hero(a: CelebrateArg, tierIndex: number | null): HTMLElement {
    const kind = a.artKind ?? 'tier';
    const img = artOrEmoji(a.art ?? null, a.icon ?? '🎉', 'cb-img', a.title);
    const frame = h('div', { class: 'cb-frame' }, img, h('i', { class: 'cb-shine' }));
    const hero = h('div', { class: 'cb-art ' + kind }, h('div', { class: 'cb-rays' }), frame);
    if (kind === 'portrait' && a.ring) setVar(hero, '--ring', a.ring);
    if (kind === 'tier' && tierIndex != null) hero.appendChild(h('span', { class: 'cb-tag', text: tierIndex >= 6 ? '★ FINAL TIER ★' : `TIER ${tierIndex + 1}` }));
    return hero;
  }

  render(): void {
    const a = this.arg as CelebrateArg;
    const tier = a.tier != null ? this.data.tier(a.tier) : null;
    const titan = a.tier != null && a.tier >= 6;
    const wrap = h('div', { class: 'celebrate' + (tier ? ' tier' : '') + (a.art ? ` has-art art-${a.artKind ?? 'tier'}` : '') + (titan ? ' titan' : '') });
    if (tier) {
      setVar(wrap, '--tc', tier.color);
      setVar(wrap, '--ta', tier.accent);
    }
    // with an illustration the card is picture | text (landscape) or picture over text (portrait)
    const main = a.art ? h('div', { class: 'cb-main' }) : wrap;
    if (a.art) wrap.append(this.hero(a, a.tier ?? null), main);
    else main.appendChild(h('div', { class: 'cb-burst' }, h('div', { class: 'cb-rays' }), h('div', { class: 'cb-ic', text: a.icon ?? (tier ? '🏰' : '🎉') })));
    main.appendChild(h('h2', { class: 'cb-title', text: a.title }));
    if (a.text) main.appendChild(h('div', { class: 'cb-text', text: a.text }));
    if (a.unlocks?.length) {
      main.appendChild(h('div', { class: 'mute small center', text: 'Newly available:' }));
      const chips = h('div', { class: 'chips center-chips' });
      for (const u of a.unlocks.slice(0, 8)) chips.appendChild(h('span', { class: 'chip info', text: u }));
      main.appendChild(chips);
    }
    main.appendChild(btn({ label: a.ok ?? (tier ? 'Onward!' : 'Awesome!'), cls: 'big good block', id: 'btn-celebrate-ok', onClick: () => this.ctx.close(this.name) }));
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
    // the icon may be an illustration URL (supply crate, daily gift) instead of an emoji
    const ic = isArtSrc(a.icon) ? h('div', { class: 'cb-ic art' }, artOrEmoji(a.icon, '🎁', 'cb-ic-img', a.title)) : h('div', { class: 'cb-ic', text: a.icon ?? '🎁' });
    wrap.appendChild(h('div', { class: 'cb-burst small' }, h('div', { class: 'cb-rays' }), ic));
    wrap.appendChild(h('h2', { class: 'cb-title', text: a.title }));
    const list = h('div', { class: 'reward-cards' });
    parts.forEach((p, i) => list.appendChild(h('div', { class: 'rcard pop-in', style: { animationDelay: `${120 + i * 100}ms`, '--rc': p.color } }, partIcon(p, 'ri', 'div'), h('b', { class: 'num', text: p.amount }), h('small', { text: p.label }))));
    wrap.appendChild(parts.length ? list : h('div', { class: 'cb-text', text: 'Enjoy your new perks — thank you for playing!' }));
    wrap.appendChild(btn({ label: 'Nice!', cls: 'big good block', id: 'btn-reward-ok', onClick: () => this.ctx.close(this.name) }));
    fill(this.body, wrap);
  }
}

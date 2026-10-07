/**
 * VictoryPanel — shown after `combat:ended`: a glowing chest that pops open, the reward list, and
 * [Collect] (combat.claimReward) / [▶ Double] (rewarded ad invasion_bonus).
 */
import { Panel, type PanelTitle } from './Panel';
import type { Reward } from '../../data/schema';
import { rewardParts } from '../logic/rewards';
import { btn, partIcon } from '../widgets';
import { confetti } from '../fx/Confetti';
import { fill, h } from '../dom';
import { alienArt, artOrEmoji, rewardArt } from '../art';

export interface VictoryArg {
  wave: number;
  kills: number;
  reward: Reward;
  /** Aliens beaten this wave by AlienDef.model, shown as small portraits. */
  defeated?: { model: string; n: number; boss?: boolean }[];
}

export class VictoryPanel extends Panel {
  readonly name = 'victory';
  override readonly kind = 'modal' as const;
  override readonly dismissable = false;
  override readonly hasHeader = false;
  private opened = false;
  private busy = false;
  private done = false;
  private timer = 0;

  title(): PanelTitle {
    return { icon: '🏆', text: 'Victory' };
  }

  private info(): VictoryArg {
    const a = this.arg as VictoryArg | undefined;
    const c = this.game.state.combat;
    return { wave: a?.wave ?? c.wave, kills: a?.kills ?? c.killsThisWave, reward: a?.reward ?? c.pendingReward ?? {} };
  }

  override onOpen(): void {
    this.card.classList.add('wide');
    this.timer = window.setTimeout(() => this.openChest(), 1400);
  }

  override onClose(): void {
    window.clearTimeout(this.timer);
  }

  override signature(): string {
    return `${this.opened}|${this.busy}`;
  }

  private openChest(): void {
    if (this.opened) return;
    this.opened = true;
    this.ctx.sfx('crate_open');
    this.ctx.haptic('heavy');
    this.rerender();
    confetti(this.frame, { count: 70, y: this.frame.clientHeight * 0.34 });
  }

  render(): void {
    const info = this.info();
    const wrap = h('div', { class: 'victory modal-grid' + (this.opened ? ' two' : '') });
    const left = h('div', { class: 'm-left' });
    const right = h('div', { class: 'm-right' });
    const foot = h('div', { class: 'm-foot' });
    wrap.append(left, right, foot);
    left.appendChild(h('h2', { class: 'wb-title', text: 'Colony Defended!' }));
    left.appendChild(h('div', { class: 'wb-away', text: `Wave ${info.wave} · ${info.kills} alien${info.kills === 1 ? '' : 's'} defeated` }));
    const beaten = (this.arg as VictoryArg | undefined)?.defeated?.filter((d) => alienArt(d.model)) ?? [];
    // under the title while the chest is closed; above the loot once it is open (keeps the landscape card short)
    const beatenRow = beaten.length
      ? h(
          'div',
          { class: 'vic-aliens', 'aria-hidden': 'true' },
          ...beaten.slice(0, 5).map((d) => h('span', { class: 'va' + (d.boss ? ' boss' : '') }, artOrEmoji(alienArt(d.model), '👾', 'va-img', d.model), h('b', { text: d.n > 1 ? `×${d.n}` : '' }))),
        )
      : null;
    if (beatenRow && !this.opened) left.appendChild(beatenRow);
    // the illustrated chest (the CSS-drawn one is the fallback): dark and wobbling until tapped, then it lights up
    const chestArt = rewardArt('victory_chest');
    const chest = h(
      'button',
      { class: 'chest' + (this.opened ? ' open' : '') + (chestArt ? ' has-art' : ''), type: 'button', 'aria-label': 'Open the chest', id: 'chest' },
      h('div', { class: 'chest-beams' }),
      h('div', { class: 'chest-glow' }),
      ...(chestArt
        ? [artOrEmoji(chestArt, '🏆', 'chest-img', 'Victory chest')]
        : [h('div', { class: 'chest-body' }, h('div', { class: 'chest-band' }), h('div', { class: 'chest-lock' })), h('div', { class: 'chest-lid' })]),
    );
    chest.addEventListener('click', () => this.openChest());
    left.appendChild(chest);

    if (!this.opened) {
      left.appendChild(h('div', { class: 'mute center pulse', text: 'Tap the chest to open it!' }));
    } else {
      const parts = rewardParts(info.reward, this.data);
      const list = h('div', { class: 'reward-cards' });
      parts.forEach((p, i) => {
        list.appendChild(h('div', { class: 'rcard pop-in', style: { animationDelay: `${i * 110}ms`, '--rc': p.color } }, partIcon(p, 'ri', 'div'), h('b', { class: 'num', text: p.amount }), h('small', { text: p.label })));
      });
      if (beatenRow) right.appendChild(beatenRow);
      right.appendChild(list);
      foot.appendChild(
        h(
          'div',
          { class: 'm-actions' },
          btn({
            label: '▶ DOUBLE REWARDS',
            cls: 'ad big block shine noicon pulse',
            sub: 'Watch a short video for 2×',
            disabled: this.busy ? 'One moment…' : false,
            id: 'btn-victory-double',
            onClick: () => this.double(),
          }),
          btn({ label: 'Collect', cls: 'good block', id: 'btn-victory-collect', disabled: this.busy ? 'One moment…' : false, onClick: () => this.collect() }),
        ),
      );
    }
    fill(this.body, wrap);
  }

  private collect(): void {
    if (this.done) return;
    this.done = true;
    this.game.sys.combat.claimReward(false);
    this.ctx.haptic('success');
    this.ctx.close(this.name);
  }

  private async double(): Promise<void> {
    if (this.busy || this.done) return;
    this.busy = true;
    this.rerender();
    const ok = await this.ctx.watchAd('invasion_bonus');
    this.busy = false;
    if (ok) {
      this.done = true;
      this.ctx.toast('Double spoils!', 'reward', '🎉');
      this.ctx.close(this.name);
    } else this.rerender();
  }
}

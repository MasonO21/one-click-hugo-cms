/**
 * SeasonPanel — free and premium reward tracks, level progress, claim buttons.
 */
import { Panel, type PanelTitle } from './Panel';
import type { Reward } from '../../data/schema';
import { fmt } from '../../core/format';
import { bar, btn, rewardChips } from '../widgets';
import { claimableSeason } from '../logic/badges';
import { fill, h } from '../dom';
import { hudArt } from '../art';

export class SeasonPanel extends Panel {
  readonly name = 'season';
  private scrolled = false;

  title(): PanelTitle {
    return { icon: '🏆', art: hudArt('season'), text: this.data.season.name };
  }

  override signature(): string {
    const s = this.st.liveops.season;
    return `${s.xp}|${s.premium}|${s.claimedFree.join(',')}|${s.claimedPremium.join(',')}|${this.game.sys.liveops.seasonLevel()}`;
  }

  render(): void {
    const g = this.game;
    const lo = g.sys.liveops;
    const s = this.data.season;
    const st = g.state.liveops.season;
    const level = lo.seasonLevel();
    const into = st.xp - level * s.xpPerLevel;
    const wrap = h('div', { class: 'stack-v' });

    const claimable = claimableSeason(g);
    wrap.appendChild(
      h(
        'div',
        { class: 'card tint' },
        h('div', { class: 'row' }, h('div', { class: 'season-lvl', text: String(level) }), h('div', { class: 'grow' }, h('div', { class: 'h3', text: level >= s.levels.length ? 'Season complete!' : `Level ${level} → ${level + 1}` }), bar(level >= s.levels.length ? 1 : Math.max(0, into) / s.xpPerLevel, 'purple thick', `${fmt(Math.max(0, into))} / ${fmt(s.xpPerLevel)} XP`)), claimable > 0 ? btn({ label: `Claim all (${claimable})`, cls: 'good small', onClick: () => this.claimAll() }) : null),
        h('div', { class: 'mute small', style: 'margin-top:.4em', text: 'Earn XP by building, gathering, crafting, exploring and defending.' }),
      ),
    );
    if (!st.premium) {
      const prod = this.data.products.find((p) => p.section === 'season');
      wrap.appendChild(h('div', { class: 'card premium-hint row' }, h('span', { class: 'bi', text: '👑' }), h('div', { class: 'grow' }, h('div', { class: 'h3', text: 'Premium track' }), h('div', { class: 'mute small', text: 'Unlock bonus rewards on every level. Totally optional!' })), prod ? btn({ label: 'Unlock', cls: 'nova small', onClick: () => this.ctx.open('shop', { tab: 'season' }) }) : null));
    }

    // track
    const track = h('div', { class: 'season-track', data: { scroll: 'track' } });
    s.levels.forEach((lv, i) => {
      const n = i + 1;
      track.appendChild(this.column(n, lv.free, lv.premium, level, st));
    });
    wrap.appendChild(h('div', { class: 'track-legend' }, h('span', { text: 'FREE' }), h('span', { text: 'PREMIUM' })));
    wrap.appendChild(track);
    fill(this.body, wrap);
    if (!this.scrolled) {
      this.scrolled = true;
      requestAnimationFrame(() => {
        const cur = track.children[Math.max(0, Math.min(level, s.levels.length - 1) - 1)] as HTMLElement | undefined;
        if (cur) track.scrollLeft = Math.max(0, cur.offsetLeft - 40);
      });
    }
  }

  private column(n: number, free: Reward, prem: Reward, level: number, st: { premium: boolean; claimedFree: number[]; claimedPremium: number[] }): HTMLElement {
    const reached = n <= level;
    const col = h('div', { class: 'scol' + (reached ? ' reached' : '') + (n === level ? ' current' : ''), data: { level: n } });
    col.appendChild(h('div', { class: 'sl', text: String(n) }));
    col.appendChild(this.cell(n, free, false, reached, st.claimedFree.includes(n), true));
    col.appendChild(this.cell(n, prem, true, reached, st.claimedPremium.includes(n), st.premium));
    return col;
  }

  private cell(n: number, r: Reward, premium: boolean, reached: boolean, claimed: boolean, unlocked: boolean): HTMLElement {
    const can = reached && !claimed && unlocked;
    const cell = h('button', { class: 'scell' + (premium ? ' premium' : '') + (claimed ? ' claimed' : '') + (can ? ' can glow' : '') + (!unlocked ? ' locked' : ''), type: 'button', data: { sfx: can ? 'ui_click' : undefined } });
    cell.appendChild(rewardChips(this.data, r, 'stacked'));
    cell.appendChild(h('div', { class: 'sc-state', text: claimed ? '✔' : !unlocked ? '🔒' : can ? 'Claim' : '' }));
    cell.addEventListener('click', () => {
      if (!can) {
        if (!unlocked) this.ctx.toast('Unlock the premium track to claim this', 'info', '👑');
        else if (!reached) this.ctx.toast(`Reach level ${n} to claim`, 'info', '🔒');
        return;
      }
      if (this.game.sys.liveops.claimSeason(n, premium)) {
        this.ctx.haptic('success');
        this.ctx.showReward(`Level ${n} reward`, r, premium ? '👑' : '🎁');
      }
      this.rerender();
    });
    return cell;
  }

  private claimAll(): void {
    const g = this.game;
    const lo = g.sys.liveops;
    const st = g.state.liveops.season;
    const lvl = lo.seasonLevel();
    let n = 0;
    for (let l = 1; l <= Math.min(lvl, this.data.season.levels.length); l++) {
      if (!st.claimedFree.includes(l) && lo.claimSeason(l, false)) n++;
      if (st.premium && !st.claimedPremium.includes(l) && lo.claimSeason(l, true)) n++;
    }
    if (n) this.ctx.toast(`${n} season rewards claimed!`, 'reward', '🏆');
    this.rerender();
  }
}

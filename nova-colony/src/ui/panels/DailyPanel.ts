/**
 * DailyPanel — the 7-day login calendar. The next reward glows; Day 7 is the big legendary one.
 */
import { Panel, type PanelTitle } from './Panel';
import { fmtLong, msUntilLocalMidnight } from '../logic/time';
import { btn, rewardChips } from '../widgets';
import { fill, h } from '../dom';
import { artOrEmoji, rewardArt } from '../art';

export class DailyPanel extends Panel {
  readonly name = 'daily';

  title(): PanelTitle {
    return { icon: '🎁', text: 'Daily rewards' };
  }

  override signature(): string {
    const d = this.st.liveops.daily;
    return `${d.streak}|${d.lastClaim}|${this.game.sys.liveops.dailyAvailable() ? 1 : 0}`;
  }

  render(): void {
    const g = this.game;
    const lo = g.sys.liveops;
    const rewards = this.data.dailyRewards;
    const streak = g.state.liveops.daily.streak;
    const avail = lo.dailyAvailable();
    // index (0-based) of the next day to claim / the day claimed today
    const nextIdx = streak % rewards.length;
    const todayIdx = avail ? nextIdx : (streak - 1 + rewards.length) % rewards.length;
    const vip = lo.isVip();
    const wrap = h('div', { class: 'stack-v' });
    const claimBtn = btn({
      label: avail ? '🎁 Claim' : '✔ Claimed',
      cls: 'big good',
      id: 'btn-daily-claim',
      disabled: avail ? false : 'You already claimed today — see you tomorrow!',
      onClick: () => {
        const r = lo.claimDaily();
        if (r) {
          this.ctx.haptic('success');
          this.ctx.showReward(`Day ${nextIdx + 1} reward`, r, rewardArt('daily_gift') ?? '🎁');
        }
        this.rerender();
      },
    });
    wrap.appendChild(
      h(
        'div',
        { class: 'card tint row daily-head' },
        artOrEmoji(rewardArt('daily_gift'), '🎁', 'bi gift-img', 'Daily gift'),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'h3', text: avail ? 'Your daily gift is ready!' : 'Come back tomorrow for more!' }),
          h('div', { class: 'mute small', text: avail ? `Day ${nextIdx + 1} of ${rewards.length}${vip ? ' · Colony Pass ×2' : ''}` : `Next gift in ${fmtLong(msUntilLocalMidnight(g.now()) / 1000)}` }),
        ),
        claimBtn,
      ),
    );
    const grid = h('div', { class: 'daily-grid' });
    rewards.forEach((r, i) => {
      const claimed = avail ? i < nextIdx : streak > 0 && i <= todayIdx;
      const today = avail && i === nextIdx;
      const big = i === rewards.length - 1;
      grid.appendChild(
        h(
          'div',
          { class: 'dcard' + (claimed ? ' claimed' : '') + (today ? ' today glow' : '') + (big ? ' big' : ''), data: { day: i + 1 } },
          h('div', { class: 'dn', text: `Day ${i + 1}` }),
          rewardChips(this.data, r, 'stacked'),
          claimed ? h('div', { class: 'dcheck', text: '✔' }) : big ? h('div', { class: 'dstar', text: '🌟' }) : null,
        ),
      );
    });
    wrap.appendChild(grid);
    fill(this.body, wrap);
  }
}

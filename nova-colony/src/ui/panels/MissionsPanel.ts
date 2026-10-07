/**
 * MissionsPanel — Main / Side / Daily tabs with progress bars, reward chips and Claim buttons.
 */
import { Panel, type PanelTitle } from './Panel';
import type { MissionDef } from '../../data/schema';
import { fmt } from '../../core/format';
import { fmtLong, msUntilLocalMidnight } from '../logic/time';
import { claimableMissions } from '../logic/badges';
import { bar, btn, emptyState, rewardChips, tabs } from '../widgets';
import { fill, h } from '../dom';

type Tab = 'main' | 'side' | 'daily';

export class MissionsPanel extends Panel {
  readonly name = 'missions';
  private tab: Tab = 'main';

  title(): PanelTitle {
    return { icon: '📜', text: 'Missions' };
  }

  override onOpen(arg: unknown): void {
    const want = this.pick<Tab>(arg, 'tab');
    if (want) this.tab = want;
    else {
      // jump to a tab with something to claim
      const ms = this.game.sys.missions;
      const claim = claimableMissions(this.game).map((id) => this.data.mission(id));
      const t = (['main', 'side', 'daily'] as Tab[]).find((x) => claim.some((m) => m?.chain === x));
      if (t) this.tab = t;
      else if (!ms.active().some((m) => m.chain === 'main')) this.tab = 'side';
    }
  }

  override signature(): string {
    const ms = this.game.sys.missions;
    const act = ms.active().map((m) => `${m.id}:${Math.floor(ms.progress(m.id).value)}`);
    return `${this.tab}|${act.join(',')}|${this.game.state.missions.completed.length}|${this.game.state.missions.dailyDate}`;
  }

  private list(tab: Tab): MissionDef[] {
    const g = this.game;
    const ms = g.sys.missions;
    if (tab === 'daily') return g.state.missions.daily.map((id) => this.data.mission(id)).filter((m): m is MissionDef => !!m);
    return ms.active().filter((m) => m.chain === tab);
  }

  render(): void {
    const g = this.game;
    const ms = g.sys.missions;
    const claimable = new Set(claimableMissions(g));
    const count = (t: Tab) => this.list(t).filter((m) => claimable.has(m.id)).length;
    const wrap = h('div', { class: 'stack-v' });
    wrap.appendChild(
      tabs(
        [
          { id: 'main', icon: '⭐', label: 'Main', badge: count('main') || undefined },
          { id: 'side', icon: '🧩', label: 'Side', badge: count('side') || undefined },
          { id: 'daily', icon: '📅', label: 'Daily', badge: count('daily') || undefined },
        ],
        this.tab,
        (id) => {
          this.tab = id as Tab;
          this.rerender();
        },
      ),
    );
    if (this.tab === 'daily') {
      const ms2 = msUntilLocalMidnight(g.now());
      wrap.appendChild(h('div', { class: 'mute small', text: `🕛 New daily missions in ${fmtLong(ms2 / 1000)}` }));
    }
    const list = this.list(this.tab);
    const ready = list.filter((m) => claimable.has(m.id));
    if (ready.length > 1) {
      wrap.appendChild(
        btn({
          label: `🎁 Claim all (${ready.length})`,
          cls: 'good block',
          onClick: () => {
            let n = 0;
            for (const m of ready) if (ms.claim(m.id)) n++;
            if (n) this.ctx.toast(`${n} rewards claimed!`, 'reward', '🎁');
            this.rerender();
          },
        }),
      );
    }
    if (!list.length) wrap.appendChild(emptyState(this.tab === 'daily' ? '📅' : '🧭', this.tab === 'daily' ? 'No daily missions yet' : 'All caught up!', 'New missions appear as your colony grows.'));
    const grid = h('div', { class: 'stack-v tight' });
    for (const m of list) grid.appendChild(this.missionCard(m, claimable.has(m.id)));
    wrap.appendChild(grid);
    const done = g.state.missions.completed.length;
    if (done) wrap.appendChild(h('div', { class: 'mute small center', text: `✔ ${done} mission${done === 1 ? '' : 's'} completed so far` }));
    fill(this.body, wrap);
  }

  private missionCard(m: MissionDef, ready: boolean): HTMLElement {
    const g = this.game;
    const p = g.sys.missions.progress(m.id);
    const claimed = this.game.state.missions.completed.includes(m.id) && !g.state.missions.active.includes(m.id);
    const frac = p.target > 0 ? Math.min(1, p.value / p.target) : 0;
    const el = h('div', { class: 'card mcard' + (ready ? ' ready' : '') + (claimed ? ' claimed' : ''), data: { mission: m.id } });
    el.append(
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'h3', text: m.name }), h('div', { class: 'mute small', text: m.description })), claimed ? h('span', { class: 'chip good', text: '✔ Claimed' }) : null),
      bar(claimed ? 1 : frac, ready || claimed ? 'good' : 'orange', claimed ? 'Done' : `${fmt(Math.floor(p.value))} / ${fmt(p.target)}`),
      h(
        'div',
        { class: 'row', style: 'margin-top:.5em' },
        h('div', { class: 'grow' }, rewardChips(this.data, m.reward)),
        ready
          ? btn({
              label: 'Claim',
              cls: 'good small pulse',
              onClick: () => {
                if (g.sys.missions.claim(m.id)) {
                  this.ctx.haptic('success');
                  this.ctx.toast(`Mission complete: ${m.name}`, 'reward', '🎯');
                }
                this.rerender();
              },
            })
          : null,
      ),
    );
    return el;
  }
}

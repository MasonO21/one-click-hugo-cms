/**
 * RecruitPanel — the recruitment board: candidate cards with cost + Recruit button, a countdown to
 * the free refresh, and a "watch an ad for new recruits" button.
 */
import { Panel, type PanelTitle } from './Panel';
import { fmtHMS } from '../logic/time';
import { RARITY_COLOR, cap } from '../logic/rewards';
import { stars } from '../logic/colonist';
import { adButton, btn, costChips, emptyState, portrait } from '../widgets';
import { fill, h } from '../dom';
import { hudArt, professionArt } from '../art';
import { bagCovers } from '../../core/bag';

export class RecruitPanel extends Panel {
  readonly name = 'recruit';
  private acc = 0;

  title(): PanelTitle {
    return { icon: '🧑‍🤝‍🧑', art: hudArt('population'), text: 'Recruit survivors' };
  }

  override signature(): string {
    const g = this.game;
    const cs = g.state.colonists;
    const hasBoard = this.hasBoard() ? 1 : 0;
    const timerDone = cs.refreshAt <= g.now() ? 1 : 0;
    const aff = cs.candidates.map((c) => (bagCovers(g.state.resources.amounts, c.cost) ? 1 : 0)).join('');
    return `${cs.candidates.map((c) => c.colonist.id).join('.')}|${aff}|${g.sys.colonists.freeBeds()}|${hasBoard}|${timerDone}`;
  }

  /** Is a recruitment board built (when the content defines one)? */
  private hasBoard(): boolean {
    const defs = this.data.buildings.filter((b) => b.recruit);
    if (!defs.length) return true;
    return this.game.state.buildings.list.some((b) => b.status !== 'building' && defs.some((d) => d.id === b.def));
  }

  override live(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const el = this.body.querySelector('[data-countdown]');
    if (el) el.textContent = this.countdownText();
  }

  private countdownText(): string {
    const ms = this.game.state.colonists.refreshAt - this.game.now();
    return ms > 0 ? fmtHMS(ms / 1000) : 'Ready!';
  }

  render(): void {
    const g = this.game;
    const cs = g.state.colonists;
    const wrap = h('div', { class: 'stack-v' });
    const beds = g.sys.colonists.freeBeds();
    const board = this.hasBoard();

    wrap.appendChild(
      h(
        'div',
        { class: 'summary-strip' },
        h('div', { class: 'sum' }, h('b', { text: String(g.state.colonists.list.length) }), h('small', { text: 'colonists' })),
        h('div', { class: 'sum' }, h('b', { class: beds > 0 ? '' : 'neg', text: String(beds) }), h('small', { text: 'free beds' })),
        h('div', { class: 'sum' }, h('b', { 'data-countdown': '1', text: this.countdownText() }), h('small', { text: 'next free refresh' })),
      ),
    );
    if (!board) wrap.appendChild(h('div', { class: 'card warn-card', text: '🏗️ Build a Recruitment Board to welcome new survivors to your colony.' }));
    else if (beds <= 0) wrap.appendChild(h('div', { class: 'card warn-card', text: '🛏️ Every bed is taken — build a Shelter so new colonists have somewhere to sleep.' }));

    if (!cs.candidates.length) wrap.appendChild(emptyState('📡', 'No survivors on the radio', 'Check back soon — or watch a short video for fresh recruits!'));
    const grid = h('div', { class: 'grid cand-grid' });
    cs.candidates.forEach((cand, i) => {
      const c = cand.colonist;
      const prof = this.data.profession(c.specialty);
      const trait = this.data.trait(c.trait);
      const afford = bagCovers(g.state.resources.amounts, cand.cost);
      const reason = !board ? 'Build a Recruitment Board first' : beds <= 0 ? 'No free bed — build a Shelter' : !afford ? 'Not enough resources yet' : false;
      const card = h(
        'div',
        { class: 'card cand', style: { '--rar': RARITY_COLOR[c.rarity] }, data: { candidate: i } },
        h('div', { class: 'row' }, portrait(c, true), h('div', { class: 'grow' }, h('div', { class: 'h3', text: c.name }), h('span', { class: 'pill', style: { background: RARITY_COLOR[c.rarity] }, text: cap(c.rarity) }), h('div', { class: 'stars', text: stars(c.skill) }))),
        h('div', { class: 'chips', style: 'margin-top:.4em' }, h('span', { class: 'chip', style: { background: (prof?.color ?? '#999') + '44' } }, h('i', { text: prof?.icon ?? '' }), prof?.name ?? c.specialty), trait ? h('span', { class: 'chip info', title: trait.description, text: `✨ ${trait.name}` }) : null),
        h('div', { class: 'mute small bio', text: c.bio }),
        costChips(this.data, cand.cost, g.state.resources.amounts),
        btn({
          label: 'Recruit',
          cls: 'good block',
          disabled: reason,
          onClick: () => {
            if (g.sys.colonists.recruit(i)) {
              this.ctx.haptic('success');
              this.ctx.toast(`${c.name} joined your colony!`, 'success', professionArt(c.specialty) ?? '🎉');
            } else this.ctx.toast("They couldn't join just yet", 'info', '🧑‍🚀');
            this.rerender();
          },
        }),
      );
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    const foot = h('div', { class: 'row wrap' });
    const ready = cs.refreshAt <= g.now();
    foot.appendChild(
      btn({
        label: '↻ Free refresh',
        cls: 'info grow',
        disabled: ready ? false : 'The board refreshes on its own — or watch a video!',
        onClick: () => {
          g.sys.colonists.refreshCandidates(false);
          this.rerender();
        },
      }),
    );
    foot.appendChild(adButton(this.ctx, 'recruit_refresh', 'New recruits', () => this.rerender(), { cls: 'grow' }));
    wrap.appendChild(foot);
    fill(this.body, wrap);
  }
}

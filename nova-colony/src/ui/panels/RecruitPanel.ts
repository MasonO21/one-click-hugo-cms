/**
 * RecruitPanel — the recruitment board: candidate cards with cost + Recruit button, a countdown to the next
 * survivor answering the radio (a free seat refills on its own clock, sim/colony/recruitBoard.ts), empty seats, and a
 * "watch an ad for new recruits" button (fresh faces for the survivors waiting; it never fills an empty seat).
 */
import { Panel, type PanelTitle } from './Panel';
import { fmtHMS } from '../logic/time';
import { RARITY_COLOR, cap } from '../logic/rewards';
import { stars } from '../logic/colonist';
import { adButton, btn, costChips, emptyState, portrait } from '../widgets';
import { fill, h } from '../dom';
import { hudArt, professionArt } from '../art';
import { bagCovers } from '../../core/bag';
import { recruitCountdownText, recruitWaitNote } from '../logic/awayNews';

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
    const next = g.sys.colonists.nextArrivalIn();
    const waiting = next == null ? 1 : recruitWaitNote(next) ? 2 : 0;
    const aff = cs.candidates.map((c) => (bagCovers(g.state.resources.amounts, c.cost) ? 1 : 0)).join('');
    return `${cs.candidates.map((c) => c.colonist.id).join('.')}|${aff}|${g.sys.colonists.freeBeds()}|${hasBoard}|${waiting}|${g.sys.colonists.boardSeats()}`;
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
    const text = this.countdownText();
    for (const el of this.body.querySelectorAll('[data-countdown]')) el.textContent = text;
  }

  /** "12:41" until the next survivor ("1d 4h", "7 days" for a long wait); "Full" while every seat is taken. */
  private countdownText(): string {
    return recruitCountdownText(this.game.sys.colonists.nextArrivalIn(), fmtHMS);
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
        // a full board has nobody on the way: "Full · board", not "Board full · next survivor in"
        h('div', { class: 'sum' }, h('b', { class: 'num', 'data-countdown': '1', text: this.countdownText() }), h('small', { text: g.sys.colonists.nextArrivalIn() == null ? 'board' : 'next survivor in' })),
      ),
    );
    if (!board) wrap.appendChild(h('div', { class: 'card warn-card', text: '🏗️ Build a Recruitment Board to welcome new survivors to your colony.' }));
    else if (beds <= 0) wrap.appendChild(h('div', { class: 'card warn-card', text: '🛏️ Every bed is taken — build a Shelter so new colonists have somewhere to sleep.' }));

    // a long wait for the next survivor (days apart from Alloy on): the other roads into the colony
    const waitNote = board ? recruitWaitNote(g.sys.colonists.nextArrivalIn()) : null;
    if (waitNote) wrap.appendChild(h('div', { class: 'mute small center recruit-wait', text: waitNote }));
    if (!cs.candidates.length) wrap.appendChild(emptyState('📡', 'No survivors on the radio yet', 'The radio is on. The next survivor to answer the call will wait here for you.'));
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
    // the free seats: the radio keeps calling, one survivor at a time
    const empty = Math.max(0, g.sys.colonists.boardSeats() - cs.candidates.length);
    if (cs.candidates.length) {
      for (let i = 0; i < empty; i++) {
        grid.appendChild(
          h('div', { class: 'card cand cand-empty' }, h('div', { class: 'cand-wait' }, h('i', { text: '📻' }), h('small', { text: i === 0 ? 'Next survivor in' : 'Seat free' }), i === 0 ? h('b', { class: 'num', 'data-countdown': '1', text: this.countdownText() }) : null)),
        );
      }
    }
    wrap.appendChild(grid);

    // fresh faces for whoever is waiting (an empty board has nobody to swap)
    if (cs.candidates.length) {
      const foot = h('div', { class: 'row wrap' });
      foot.appendChild(adButton(this.ctx, 'recruit_refresh', 'New recruits', () => this.rerender(), { cls: 'grow' }));
      wrap.appendChild(foot);
    }
    fill(this.body, wrap);
  }
}

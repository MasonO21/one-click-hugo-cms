/**
 * MissionTracker — the current main mission with a progress bar; tap to open the missions panel;
 * a pulsing Claim button appears when something is claimable. Offer chips (daily reward, free spin,
 * free crate) sit underneath.
 */
import type { UiCtx } from '../ctx';
import type { MissionDef } from '../../data/schema';
import { fmt } from '../../core/format';
import { claimableMissions } from '../logic/badges';
import { btn, rewardChips } from '../widgets';
import { fill, h, replay, setClass, setHidden, setText } from '../dom';

export class MissionTracker {
  readonly el: HTMLElement;
  private readonly card: HTMLElement;
  private readonly kind: HTMLElement;
  private readonly name: HTMLElement;
  private readonly desc: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly barLbl: HTMLElement;
  private readonly claimWrap: HTMLElement;
  private readonly offers: HTMLElement;
  private shownId = '';
  private wasDone = false;
  private offerKey = '';
  private extraClaims: string[] = [];

  constructor(private readonly ctx: UiCtx) {
    this.kind = h('div', { class: 'mt' });
    this.name = h('div', { class: 'mn' });
    this.desc = h('div', { class: 'md' });
    this.barFill = h('i');
    this.barLbl = h('span', { class: 'lbl' });
    const bar = h('div', { class: 'bar orange' }, this.barFill, this.barLbl);
    this.claimWrap = h('div');
    this.card = h('div', { class: 'mission-card tap', role: 'button', tabindex: '0', data: { sfx: 'ui_click' } }, this.kind, this.name, this.desc, bar, this.claimWrap);
    this.card.addEventListener('click', () => ctx.open('missions'));
    this.offers = h('div', { class: 'offers' });
    this.el = h('div', { class: 'hud-left' }, this.card, this.offers);
  }

  poll(): void {
    const { game } = this.ctx;
    const ms = game.sys.missions;
    const claimable = claimableMissions(game);
    // the card always shows the main mission; other claimable missions get an offer pill below
    let m: MissionDef | null = ms.current();
    if (!m) {
      const id = claimable[0];
      m = (id ? game.data.mission(id) : null) ?? ms.active()[0] ?? null;
    }
    setHidden(this.card, !m);
    if (m) this.showMission(m);
    this.extraClaims = claimable.filter((id) => id !== m?.id);
    this.pollOffers();
  }

  private showMission(m: MissionDef): void {
    const { game } = this.ctx;
    const p = game.sys.missions.progress(m.id);
    const done = p.done;
    setText(this.kind, (done ? '✔ ' : '🎯 ') + (m.chain === 'main' ? 'Main mission' : m.chain === 'daily' ? 'Daily mission' : 'Side mission'));
    setText(this.name, m.name);
    setText(this.desc, m.description);
    const frac = p.target > 0 ? Math.min(1, p.value / p.target) : 0;
    this.barFill.style.transform = `scaleX(${frac.toFixed(3)})`;
    setText(this.barLbl, done ? 'Complete!' : `${fmt(Math.floor(p.value))} / ${fmt(p.target)}`);
    setClass(this.card, 'done', done);
    if (this.shownId !== m.id || this.wasDone !== done) {
      if (this.shownId && (this.shownId !== m.id || done)) replay(this.card, 'pop');
      this.shownId = m.id;
      this.wasDone = done;
      fill(this.claimWrap);
      if (done) {
        const b = btn({
          label: 'Claim reward',
          cls: 'good claim small',
          onClick: (e) => {
            e.stopPropagation();
            if (game.sys.missions.claim(m.id)) {
              this.ctx.toast(`Mission complete: ${m.name}`, 'reward', '🎯');
              this.ctx.haptic('success');
            }
          },
        });
        this.claimWrap.append(rewardChips(this.ctx.data, m.reward, 'mini'), b);
      }
    }
  }

  private pollOffers(): void {
    const b = this.ctx.badges();
    const key = `${+b.daily}${+b.spin}${+b.crate}|${this.extraClaims.length}`;
    if (key === this.offerKey) return;
    this.offerKey = key;
    fill(this.offers);
    const mk = (icon: string, label: string, panel: string) =>
      h('button', { class: 'offer tap', type: 'button', 'aria-label': label, onclick: () => this.ctx.open(panel) }, h('span', { class: 'ic', text: icon }), h('span', { class: 'lb', text: label }));
    const extra = this.extraClaims;
    if (extra.length) {
      const chain = this.ctx.data.mission(extra[0])?.chain ?? 'side';
      this.offers.append(
        h('button', { class: 'offer tap', type: 'button', 'aria-label': `Claim ${extra.length}`, onclick: () => this.ctx.open('missions', { tab: chain }) }, h('span', { class: 'ic', text: '🎯' }), h('span', { class: 'lb', text: `Claim ${extra.length}` })),
      );
    }
    if (b.daily) this.offers.append(mk('🎁', 'Daily', 'daily'));
    if (b.spin) this.offers.append(mk('🎡', 'Spin', 'spin'));
    if (b.crate) this.offers.append(mk('📦', 'Crate', 'shop'));
    // CSS turns 3+ pills into a compact icon row on short landscape phones (they wrapped into the joystick)
    this.offers.dataset.n = String(this.offers.childElementCount);
  }
}

/**
 * SurveyRewardPanel — the card a claimed region survey milestone shows (sim/survey.ts): the region's postcard with
 * the milestone on its ribbon, a line about what the survey found, the reward cards, and at 100% the permanent perk.
 * Everything is already granted when it opens (SurveySystem.claim), so closing it early loses nothing.
 */
import { Panel, type PanelTitle } from './Panel';
import type { SurveyClaim } from '../../sim/survey';
import { regionSurveyDef } from '../../data/survey';
import { rewardParts } from '../logic/rewards';
import { milestoneLabel, surveyClaimText } from '../logic/survey';
import { btn, partIcon } from '../widgets';
import { confetti } from '../fx/Confetti';
import { artOrEmoji, biomeArt } from '../art';
import { fill, h, setVar } from '../dom';

export class SurveyRewardPanel extends Panel {
  readonly name = 'survey_reward';
  override readonly kind = 'modal' as const;
  override readonly hasHeader = false;

  title(): PanelTitle {
    return { icon: '🧭', text: 'Survey' };
  }

  override onOpen(): void {
    this.card.classList.add('wide');
    this.ctx.sfx('reward');
    this.ctx.haptic('success');
    window.setTimeout(() => {
      if (this.frame?.isConnected) confetti(this.frame, { count: (this.arg as SurveyClaim).step >= 3 ? 70 : 40, y: this.frame.clientHeight * 0.3, power: 0.95 });
    }, 160);
  }

  render(): void {
    const c = this.arg as SurveyClaim;
    const biome = this.data.biome(c.region);
    const name = biome?.name ?? c.region;
    const def = regionSurveyDef(c.region);
    const cosmetic = def ? this.data.cosmetic(def.cosmetic) : undefined;
    const wrap = h('div', { class: 'celebrate has-art art-biome survey-card' + (c.step >= 3 ? ' mastered' : '') });
    if (biome) {
      setVar(wrap, '--tc', biome.ground[0]);
      setVar(wrap, '--ta', biome.ground[1]);
    }
    const frame = h('div', { class: 'cb-frame' }, artOrEmoji(biomeArt(c.region), '🗺️', 'cb-img', name), h('i', { class: 'cb-shine' }));
    const hero = h('div', { class: 'cb-art biome' }, h('div', { class: 'cb-rays' }), frame, h('span', { class: 'cb-tag', text: milestoneLabel(c.step).toUpperCase() }));
    const main = h('div', { class: 'cb-main' });
    main.appendChild(h('div', { class: 'sv-kicker', text: 'Region survey' }));
    main.appendChild(h('h2', { class: 'cb-title', text: name }));
    main.appendChild(h('div', { class: 'cb-text', text: surveyClaimText(c, name, cosmetic?.name ?? null) }));
    const parts = rewardParts(c.reward, this.data).filter((p) => p.kind !== 'xp' || c.step >= 3);
    if (c.colonist) for (const p of parts) if (p.kind === 'colonist') p.label = c.colonist.name;
    if (parts.length) {
      const list = h('div', { class: 'reward-cards' });
      parts.forEach((p, i) => list.appendChild(h('div', { class: 'rcard pop-in', style: { animationDelay: `${120 + i * 100}ms`, '--rc': p.color } }, partIcon(p, 'ri', 'div'), h('b', { class: 'num', text: p.amount }), h('small', { text: p.label }))));
      main.appendChild(list);
    }
    if (c.perk) {
      main.appendChild(
        h('div', { class: 'sv-perk pop-in', style: { animationDelay: `${160 + parts.length * 100}ms` } }, h('span', { class: 'sv-perk-ic', text: '★' }), h('div', { class: 'sv-perk-tx' }, h('b', { text: c.perk.title }), h('span', { text: `${c.perk.text}, for good` }))),
      );
    }
    main.appendChild(btn({ label: c.step >= 3 ? 'Wonderful' : 'Onward', cls: 'big good block', id: 'btn-survey-ok', onClick: () => this.ctx.close(this.name) }));
    wrap.append(hero, main);
    fill(this.body, wrap);
  }
}

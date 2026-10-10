/**
 * JournalPanel — the Colony Journal: achievements by section (medals, progress bars, reward chips, Claim) and the
 * cozy Colony Records (lifetime stats). Progress bars update in place (`live`), so the cards never rebuild under a
 * finger; the panel only re-renders when something is earned, claimed, folded or the tab changes.
 */
import { Panel, type PanelTitle } from './Panel';
import type { AchievementDef, AchievementMedal } from '../../data/schema';
import { AchievementSystem } from '../../sim/achievements';
import { bar, btn, rewardChips, tabs, type BarEl } from '../widgets';
import { fill, h } from '../dom';
import { hudArt, iconEl } from '../art';
import {
  MEDAL_EMOJI,
  MEDAL_LABEL,
  categoryViews,
  colonyRecords,
  fmtDay,
  medalArt,
  progressLabel,
  type CategoryView,
  type LineView,
} from '../logic/achievements';

type Tab = 'medals' | 'records';

interface LiveBar {
  bar: BarEl;
  id: string;
}

export class JournalPanel extends Panel {
  readonly name = 'journal';
  private tab: Tab = 'medals';
  /** Folded sections (category ids). */
  private folded = new Set<string>();
  private liveBars: LiveBar[] = [];
  private liveAcc = 0;

  title(): PanelTitle {
    return { icon: '📔', art: hudArt('journal'), text: 'Colony Journal' };
  }

  override onOpen(arg: unknown): void {
    const want = this.pick<Tab>(arg, 'tab');
    if (want === 'medals' || want === 'records') this.tab = want;
  }

  override onArg(arg: unknown): void {
    this.onOpen(arg);
    this.rerender();
  }

  override signature(): string {
    const a = this.game.sys.achievements;
    const s = a.summary();
    const base = `${this.tab}|${[...this.folded].join(',')}|${s.unlocked}.${s.claimed}`;
    return this.tab === 'records' ? `${base}|${colonyRecords(this.game).map((r) => r.value).join(',')}` : base;
  }

  /** Progress bars move without rebuilding the cards. */
  override live(dt: number): void {
    this.liveAcc += dt;
    if (this.liveAcc < 0.25 || !this.liveBars.length) return;
    this.liveAcc = 0;
    const a = this.game.sys.achievements;
    for (const l of this.liveBars) {
      const d = this.data.achievement(l.id);
      if (!d) continue;
      const v = a.value(l.id);
      l.bar.set(Math.min(1, v / d.target), progressLabel(d, v));
    }
  }

  render(): void {
    this.liveBars = [];
    const g = this.game;
    const a = g.sys.achievements;
    const s = a.summary();
    const wrap = h('div', { class: 'stack-v jr' });

    wrap.appendChild(this.summaryCard());
    const controls = h('div', { class: 'jr-controls' });
    controls.appendChild(
      h(
        'div',
        { class: 'jr-tabs' },
        tabs(
          [
            { id: 'medals', icon: '🏅', label: 'Achievements', badge: s.claimable || undefined },
            { id: 'records', icon: '📊', label: 'Colony Records' },
          ],
          this.tab,
          (id) => {
            this.tab = id as Tab;
            this.rerender();
          },
        ),
      ),
    );
    if (this.tab === 'medals' && s.claimable > 1) {
      controls.appendChild(
        btn({
          label: `🎁 Claim all (${s.claimable})`,
          cls: 'good block jr-claimall',
          onClick: () => {
            const n = a.claimAll();
            if (n) {
              this.ctx.haptic('success');
              this.ctx.toast(`${n} rewards claimed!`, 'reward', '📦');
            }
            this.rerender();
          },
        }),
      );
    }
    wrap.appendChild(controls);

    if (this.tab === 'records') wrap.appendChild(this.recordsView());
    else for (const c of categoryViews(g)) wrap.appendChild(this.categorySection(c));
    fill(this.body, wrap);
  }

  // ------------------------------------------------------------------ summary

  private summaryCard(): HTMLElement {
    const g = this.game;
    const s = g.sys.achievements.summary();
    const frac = s.total ? s.unlocked / s.total : 0;
    const chip = (m: AchievementMedal) =>
      h('span', { class: `jr-medal-count ${m}`, title: `${MEDAL_LABEL[m]} medals` }, iconEl(medalArt(m), MEDAL_EMOJI[m], 'medal', 'span'), h('b', { text: String(s.medals[m]) }));
    return h(
      'div',
      { class: 'card tint jr-summary' },
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'jr-book' }, iconEl(hudArt('journal'), '📔', 'jr-book-ic', 'span')),
        h('div', { class: 'grow' }, h('div', { class: 'h3', text: `${s.unlocked} / ${s.total} earned` }), h('div', { class: 'mute small', text: `${g.state.colony.name} colony journal` })),
      ),
      bar(frac, 'orange thick', `${Math.round(frac * 100)}%`),
      h('div', { class: 'jr-medals-row' }, chip('bronze'), chip('silver'), chip('gold'), chip('special')),
    );
  }

  // ------------------------------------------------------------------ achievements

  private categorySection(c: CategoryView): HTMLElement {
    const folded = this.folded.has(c.id);
    const head = h(
      'button',
      { class: 'jr-cat-head' + (c.claimable ? ' has-claim' : ''), type: 'button', 'aria-expanded': folded ? 'false' : 'true', data: { cat: c.id, sfx: 'ui_tab' } },
      h('span', { class: 'jr-cat-ic', text: c.icon }),
      h('span', { class: 'grow jr-cat-txt' }, h('span', { class: 'jr-cat-name', text: c.name }), h('span', { class: 'jr-cat-blurb', text: c.blurb })),
      c.claimable ? h('span', { class: 'badge', text: String(c.claimable) }) : null,
      h('span', { class: 'jr-cat-count', text: `${c.earned} / ${c.total}` }),
      h('span', { class: 'jr-chev', text: folded ? '▸' : '▾' }),
    );
    head.addEventListener('click', () => {
      if (this.folded.has(c.id)) this.folded.delete(c.id);
      else this.folded.add(c.id);
      this.rerender();
    });
    const sec = h('section', { class: 'jr-cat' + (folded ? ' folded' : ''), data: { category: c.id } }, head);
    if (!folded) {
      const list = h('div', { class: 'stack-v tight jr-list' });
      for (const l of c.lines) list.appendChild(this.lineCard(l));
      sec.appendChild(list);
    }
    return sec;
  }

  private pips(l: LineView): HTMLElement {
    const a = this.game.sys.achievements;
    const wrap = h('div', { class: 'jr-pips', 'aria-label': `${l.earned} of ${l.total} medals` });
    for (const d of l.defs) {
      const on = a.isUnlocked(d.id);
      const ready = on && !a.isClaimed(d.id);
      wrap.appendChild(h('span', { class: `jr-pip ${d.medal}` + (on ? ' on' : '') + (ready ? ' ready' : ''), title: `${MEDAL_LABEL[d.medal]}${on ? '' : ' (not yet)'}` }, iconEl(medalArt(d.medal), MEDAL_EMOJI[d.medal], 'medal', 'span')));
    }
    return wrap;
  }

  private lineCard(l: LineView): HTMLElement {
    const g = this.game;
    const a = g.sys.achievements;
    const el = h('div', { class: `card jr-card ${l.state}`, data: { line: l.line, state: l.state } });
    const shown: AchievementDef = l.next ?? l.defs[l.defs.length - 1];
    el.appendChild(
      h(
        'div',
        { class: 'row jr-top' },
        h('div', { class: 'jr-ico' + (l.art ? ' art' : '') }, iconEl(l.art, l.icon, 'jr-ico-i', 'span')),
        h('div', { class: 'grow jr-txt' }, h('div', { class: 'jr-name', text: l.name }), h('div', { class: 'jr-desc', text: shown.description })),
        this.pips(l),
      ),
    );

    if (l.next) {
      const d = l.next;
      if (d.target > 1 || d.unit) {
        const b = bar(l.frac, 'orange', progressLabel(d, l.value));
        this.liveBars.push({ bar: b, id: d.id });
        el.appendChild(b);
      } else {
        el.appendChild(h('div', { class: 'jr-hint mute small', text: 'Not earned yet' }));
      }
      const nextMedal = l.defs.length > 1 ? `Next: ${MEDAL_EMOJI[d.medal]} ${MEDAL_LABEL[d.medal]}` : 'Reward';
      el.appendChild(h('div', { class: 'row jr-reward' }, h('span', { class: 'jr-rlabel mute small', text: nextMedal }), h('div', { class: 'grow' }, rewardChips(this.data, d.reward))));
    } else {
      el.appendChild(h('div', { class: 'jr-complete' }, h('span', { class: 'chip good', text: '✔ Completed' })));
    }

    if (l.claimable.length) {
      const names = l.claimable.map((d) => (d.medal === 'special' ? 'Earned' : MEDAL_LABEL[d.medal])).join(' + ');
      el.appendChild(
        h(
          'div',
          { class: 'row jr-claim' },
          h('div', { class: 'grow' }, h('div', { class: 'jr-claim-t', text: `${l.claimable.map((d) => MEDAL_EMOJI[d.medal]).join('')} ${names}!` }), rewardChips(this.data, AchievementSystem.sumRewards(l.claimable))),
          btn({
            label: 'Claim',
            cls: 'good jr-claimbtn pulse',
            data: { claim: l.line },
            onClick: () => {
              const n = a.claimLine(l.line);
              if (n) {
                this.ctx.haptic('success');
                this.ctx.toast(n > 1 ? `${l.name}: ${n} rewards claimed!` : `${l.name}: reward claimed!`, 'reward', MEDAL_EMOJI[l.claimable[0].medal]);
              }
              this.rerender();
            },
          }),
        ),
      );
    }

    const dates = l.defs.filter((d) => a.isClaimed(d.id)).map((d) => `${MEDAL_EMOJI[d.medal]} ${fmtDay(a.claimedAt(d.id) ?? 0, g.now())}`);
    if (dates.length) el.appendChild(h('div', { class: 'jr-dates mute small', text: `Earned ${dates.join('  ·  ')}` }));
    return el;
  }

  // ------------------------------------------------------------------ records

  private recordsView(): HTMLElement {
    const g = this.game;
    const rows = colonyRecords(g);
    const wrap = h('div', { class: 'stack-v tight jr-records' });
    const landed = g.state.createdAt > 0 ? ` · landed ${fmtDay(g.state.createdAt, g.now())}` : '';
    wrap.appendChild(h('div', { class: 'jr-rec-head mute small', text: `${g.state.colony.name}${landed} — your colony in numbers` }));
    const grid = h('div', { class: 'jr-rec-grid' });
    for (const r of rows) {
      grid.appendChild(
        h('div', { class: 'jr-rec', data: { record: r.id } }, h('div', { class: 'jr-rec-ic' }, iconEl(r.art, r.icon, 'jr-rec-i', 'span')), h('div', { class: 'jr-rec-txt' }, h('div', { class: 'jr-rec-v', text: r.value }), h('div', { class: 'jr-rec-l', text: r.label }))),
      );
    }
    wrap.appendChild(grid);
    return wrap;
  }
}

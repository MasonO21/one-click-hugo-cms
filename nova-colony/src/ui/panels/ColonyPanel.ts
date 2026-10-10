/**
 * ColonyPanel — opened by tapping the Command Center / tier badge: the Wood -> Titanium ladder,
 * requirements for the next tier with a big Tier Up button, and colony stats.
 */
import { Panel, type PanelTitle } from './Panel';
import type { TierUpRequirements } from '../../sim/progression';
import { fmt, fmtDuration } from '../../core/format';
import { bagCovers } from '../../core/bag';
import { btn, section, unlockChip } from '../widgets';
import { tierUnlockGroups } from '../logic/describe';
import { tierRoomNote } from '../logic/awayNews';
import { fill, h, setVar } from '../dom';
import { alienArt, artOrEmoji, buildingArt, hudArt, iconEl, resIcon, resourceArt, tierArt } from '../art';

export class ColonyPanel extends Panel {
  readonly name = 'colony';
  private laddered = false;
  private acc = 0;

  title(): PanelTitle {
    return { icon: '🛰️', art: buildingArt('command_center'), text: this.st.colony.name || 'Your Colony' };
  }

  override signature(): string {
    const g = this.game;
    const req = this.requirements();
    const aff = req ? (bagCovers(g.state.resources.amounts, req.cost) ? 1 : 0) : 2;
    // storage capacity of the tier-up goods (the "build storage" note follows an upgraded store)
    const room = req && !aff ? Object.keys(req.cost).map((k) => g.sys.economy.capacity(k)).join('.') : '';
    return `${g.state.colony.tier}|${g.state.research.completed.length}|${aff}|${g.state.buildings.list.length}|${g.state.colonists.list.length}|${room}`;
  }

  /**
   * The tier-up cost as "have / need" chips: a tier is a goal of a few days now (data/pacing.ts), so the card shows how
   * far along each store is, updated live (live()).
   */
  private progressChips(cost: Record<string, number | undefined>): HTMLElement {
    const wrap = h('div', { class: 'chips cost tier-progress' });
    for (const [id, need] of Object.entries(cost)) {
      if (!need || !(need > 0)) continue;
      const d = this.data.resource(id);
      const have = h('b', { class: 'num' });
      const chip = h('span', { class: 'chip', title: d?.name ?? id, data: { res: id } }, resIcon(id, d?.icon ?? '•'), have, ` / ${fmt(need)}`);
      wrap.appendChild(chip);
      this.paintProgress(chip, have, id, need);
    }
    if (!wrap.childElementCount) wrap.appendChild(h('span', { class: 'chip good', text: 'Free' }));
    return wrap;
  }

  private paintProgress(chip: HTMLElement, have: HTMLElement, id: string, need: number): void {
    const n = Math.min(need, Math.floor(this.st.resources.amounts[id] ?? 0));
    const text = fmt(n);
    if (have.textContent !== text) have.textContent = text;
    chip.classList.toggle('bad', n < need);
    chip.classList.toggle('good', n >= need);
  }

  override live(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const req = this.requirements();
    if (!req) return;
    for (const chip of this.body.querySelectorAll<HTMLElement>('.tier-progress [data-res]')) {
      const id = chip.dataset.res!;
      const have = chip.querySelector<HTMLElement>('b');
      if (have && req.cost[id]) this.paintProgress(chip, have, id, req.cost[id]!);
    }
  }

  /** Requirements from the system, or derived from data when the system has none. */
  private requirements(): TierUpRequirements | null {
    const g = this.game;
    const tier = g.state.colony.tier;
    const sys = g.sys.progression.next();
    if (sys) return sys;
    if (tier >= this.data.tiers.length - 1) return null;
    const nt = this.data.tier(tier + 1);
    return { tier: nt.index, research: nt.research, researchDone: !nt.research || g.state.research.completed.includes(nt.research), cost: nt.upgradeCost, affordable: g.sys.economy.canAfford(nt.upgradeCost) };
  }

  render(): void {
    const g = this.game;
    const cur = g.state.colony.tier;
    const tier = this.data.tier(cur);
    const wrap = h('div', { class: 'stack-v' });

    // hero
    const heroArt = tierArt(cur);
    const hero = h('div', { class: 'tier-hero' + (heroArt ? ' has-art' : '') }, h('div', { class: 'th-sw' }, heroArt ? artOrEmoji(heroArt, '', 'th-img') : null), h('div', { class: 'grow' }, h('div', { class: 'th-name', text: `${tier.name} Colony` }), h('div', { class: 'mute', text: tier.description })));
    setVar(hero, '--tc', tier.color);
    setVar(hero, '--ta', tier.accent);
    wrap.appendChild(hero);

    // ladder
    const ladder = h('div', { class: 'ladder', data: { scroll: 'ladder' } });
    for (const t of this.data.tiers) {
      const state = t.index < cur ? 'done' : t.index === cur ? 'now' : t.index === cur + 1 ? 'next' : 'locked';
      const src = tierArt(t.index);
      const node = h('div', { class: `ladder-node ${state}` + (src ? ' has-art' : ''), data: { tier: t.index } }, src ? h('div', { class: 'ln-art' }, artOrEmoji(src, '', 'ln-img', t.name, true)) : null, h('div', { class: 'ln-dot' }, h('i'), state === 'done' ? '✔' : state === 'locked' ? '🔒' : String(t.index + 1)), h('div', { class: 'ln-name', text: t.name }));
      setVar(node, '--tc', t.color);
      setVar(node, '--ta', t.accent);
      ladder.appendChild(node);
    }
    wrap.appendChild(ladder);
    if (!this.laddered) {
      // the ladder is wider than a phone: open it centred on where the colony is now
      this.laddered = true;
      requestAnimationFrame(() => {
        const now = ladder.querySelector<HTMLElement>('.ladder-node.now');
        if (now && ladder.isConnected) ladder.scrollLeft = now.offsetLeft - (ladder.clientWidth - now.offsetWidth) / 2;
      });
    }

    // next tier
    const req = this.requirements();
    if (!req) {
      wrap.appendChild(h('div', { class: 'card tint center' }, h('div', { class: 'big-ico', text: '🌟' }), h('div', { class: 'h3', text: 'Titanium reached!' }), h('div', { class: 'mute', text: 'You built a gleaming super-colony. Wonderful work, Commander!' })));
    } else {
      const nt = this.data.tier(req.tier);
      const card = h('div', { class: 'card next-tier' }, h('div', { class: 'h3', text: `Next: ${nt.name}` }), h('div', { class: 'mute small', text: nt.description }));
      // what the next tier hands out: the buildings and vehicles' thumbnails, ready ones first and the research-gated
      // ones marked with 🔬 (same grouping as the tier-up card)
      const groups = tierUnlockGroups(this.data, req.tier, this.st.research.completed);
      const news = [...groups.ready, ...groups.research];
      if (news.length) {
        const chips = h('div', { class: 'chips unlocks' }, news.slice(0, 8).map(unlockChip));
        if (news.length > 8) chips.appendChild(h('span', { class: 'chip', text: `+${news.length - 8} more` }));
        card.append(h('div', { class: 'mute small', style: 'margin-top:.6em', text: `New with ${nt.name}` }), chips);
      }
      const rows = h('div', { class: 'stack-v tight', style: 'margin-top:.6em' });
      if (req.research) {
        const rd = this.data.researchDef(req.research);
        rows.appendChild(
          h(
            'div',
            { class: 'row req' },
            h('span', { class: 'chip ' + (req.researchDone ? 'good' : 'bad'), text: req.researchDone ? '✔ Research' : '✖ Research' }),
            h('div', { class: 'grow', text: rd?.name ?? req.research }),
            req.researchDone ? null : btn({ label: 'Open Tech', cls: 'info small', onClick: () => this.ctx.open('research', { id: req.research }) }),
          ),
        );
      }
      rows.appendChild(h('div', { class: 'row req' }, h('span', { class: 'chip ' + (req.affordable ? 'good' : 'bad'), text: req.affordable ? '✔ Resources' : '✖ Resources' }), this.progressChips(req.cost)));
      // the goals outgrow the stores a tier starts with: say so before the player wonders why a chip stops filling
      const room = req.affordable ? null : tierRoomNote(g, req.cost);
      if (room) rows.appendChild(h('div', { class: 'mute small tier-room', text: room }));
      card.appendChild(rows);
      const ok = req.researchDone && req.affordable;
      const reason = !req.researchDone ? 'Research it first' : !req.affordable ? 'Gather a few more resources' : false;
      card.appendChild(
        h(
          'div',
          { style: 'margin-top:.8em' },
          btn({
            label: `⬆️ Upgrade to ${nt.name}`,
            cls: 'big good block',
            id: 'btn-tier-up',
            disabled: ok ? false : reason,
            onClick: () => {
              if (g.sys.progression.tierUp()) this.ctx.haptic('heavy');
              else this.ctx.toast("Not quite ready for the next tier yet", 'info', '⬆️');
              this.rerender();
            },
          }),
        ),
      );
      wrap.appendChild(card);
    }

    // stats
    const s = g.state.stats;
    const stat = (icon: string, k: string, v: string, art: string | null = null) => h('div', { class: 'stat-tile' }, iconEl(art, icon, 'si', 'div'), h('b', { text: v }), h('small', { text: k }));
    wrap.appendChild(section('Colony stats'));
    wrap.appendChild(
      h(
        'div',
        { class: 'stat-grid' },
        stat('📅', 'Day', String(g.state.time.day), hudArt('day')),
        stat('🏠', 'Buildings', String(g.state.buildings.list.length), hudArt('home')),
        stat('🧑‍🚀', 'Colonists', String(g.state.colonists.list.length), hudArt('crew')),
        stat('🛏️', 'Beds', `${g.derived.housing.used}/${g.derived.housing.beds}`, buildingArt('shelter')),
        stat('📏', 'Build radius', `${g.state.colony.radius} cells`, hudArt('map')),
        stat('👾', 'Aliens defeated', fmt(s.kills), alienArt('crawler')),
        stat('🛡️', 'Waves won', String(s.wavesWon), hudArt('defense')),
        stat('🧺', 'Gathered', fmt(s.gathered), resourceArt('wood')),
        stat('⏱️', 'Time played', fmtDuration(s.online)),
      ),
    );
    fill(this.body, wrap);
  }
}

/**
 * SpiritChip — the status-row chip for Colony Spirit (sim/colony/spirit.ts): a small ring that fills with the meter
 * round a campfire icon; during a festival it glows warm and counts the time down. Tapping it opens a popover with
 * what fills the meter (happiness, decor and fun, medical care, friendships, wishes) and when the next festival is
 * due. Hidden until Spirit opens (the Reinforced tier). Only text and one CSS variable change while it is up.
 */
import type { UiCtx } from '../ctx';
import { h, setText, setClass, setHidden, setVar } from '../dom';
import { buildingArt, iconEl } from '../art';
import { fmtHMS } from '../logic/time';
import { SPIRIT_RULES } from '../../data/spirit';
import { spiritShare } from '../../sim/colony/spiritRules';
import { pct } from '../../sim/mastery';
import '../styles/spirit.css';

export class SpiritChip {
  readonly el: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly v: HTMLElement;
  private readonly popIc: HTMLElement;
  private shown = '';

  constructor(
    private readonly ctx: UiCtx,
    showPop: (anchor: HTMLElement, build: () => Node) => void,
  ) {
    this.ring = h('span', { class: 'sp-ring' }, iconEl(buildingArt('campfire'), '🔥', 'ic', 'span'));
    this.v = h('span', { class: 'v' });
    this.el = h('button', { class: 'schip spirit tap', type: 'button', hidden: true, id: 'chip-spirit', 'aria-label': 'Colony Spirit', data: { sfx: 'ui_click' } }, this.ring, this.v);
    this.popIc = iconEl(buildingArt('campfire'), '🔥', 'ic', 'span');
    this.el.addEventListener('click', () => showPop(this.el, () => this.pop()));
  }

  poll(): void {
    const g = this.ctx.game;
    const sp = g.sys.spirit;
    const open = sp.open();
    setHidden(this.el, !open);
    if (!open) return;
    const fest = sp.active();
    setClass(this.el, 'fest', fest);
    const share = fest ? sp.left() / SPIRIT_RULES.festival.seconds : spiritShare(g.state);
    const key = share.toFixed(2);
    if (key !== this.shown) {
      this.shown = key;
      setVar(this.ring, '--p', key);
    }
    setText(this.v, fest ? fmtHMS(sp.left()) : '');
    setHidden(this.v, !fest);
  }

  private pop(): Node {
    const g = this.ctx.game;
    const sp = g.sys.spirit;
    const r = sp.rate();
    const kv = (k: string, v: string, cls = '') => h('div', { class: 'kv' }, h('span', { text: k }), h('span', { class: cls, text: v }));
    const out = h('div', { class: 'sp-pop' }, h('h4', null, this.popIc, ' Colony Spirit'));
    const f = SPIRIT_RULES.festival;
    if (sp.active()) {
      out.append(kv('Festival', `${pct(f.production - 1)} production`, 'pos'), kv('Time left', fmtHMS(sp.left())));
      out.appendChild(h('div', { class: 'sp-note', text: 'Everyone is at the campfire. Enjoy it!' }));
      return out;
    }
    const meter = Math.round(spiritShare(g.state) * 100);
    const mins = sp.minutesToFestival();
    out.append(kv('Spirit', `${meter}%`, 'pos'));
    if (r.perMinute <= 0) out.append(kv('Next festival', `Happiness above ${SPIRIT_RULES.threshold}`));
    else out.append(kv('Next festival', mins < 1 ? 'Any moment' : `~${Math.ceil(mins)} min of play`));
    out.append(kv('Happiness', String(Math.round(g.derived.happiness.average))));
    if (r.amenity > 0) out.append(kv('Decor & fun', pct(r.amenity), 'pos'));
    if (r.medical > 0) out.append(kv('Medical care', pct(r.medical), 'pos'));
    if (r.friendship > 0) out.append(kv('Friendships', pct(r.friendship), 'pos'));
    out.append(kv('Each wish granted', `+${SPIRIT_RULES.wish}`, 'pos'));
    out.appendChild(h('div', { class: 'sp-note', text: `Full: a ${Math.round(f.seconds / 60)}-minute festival, ${pct(f.production - 1)} production and a festival chest.` }));
    return out;
  }
}

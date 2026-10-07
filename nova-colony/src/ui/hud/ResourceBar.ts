/**
 * ResourceBar — HUD chips for every resource the colony has discovered (amount > 0 or lifetime > 0).
 * Numbers roll toward their target, chips pop on gains, a "+N" label accumulates, and amounts can be
 * "held back" while resource icons are still flying in from the world.
 */
import type { UiCtx } from '../ctx';
import type { GainSource } from '../../core/events';
import { fmt, fmtSigned } from '../../core/format';
import { h, replay, setClass, setText, setVar } from '../dom';

interface Chip {
  id: string;
  el: HTMLElement;
  amt: HTMLElement;
  cap: HTMLElement;
  gain: HTMLElement;
  sort: number;
  shown: number;
  target: number;
  gainAcc: number;
  gainT: number;
  gainText: string;
  popAt: number;
}

export class ResourceBar {
  readonly el: HTMLElement;
  private readonly scroll: HTMLElement;
  private chips = new Map<string, Chip>();
  private order: string[] = [];
  private held = new Map<string, number>();
  private rectCache = new Map<string, { r: DOMRect; t: number }>();

  constructor(
    private readonly ctx: UiCtx,
    private readonly onInfo: (anchor: HTMLElement, id: string) => void,
  ) {
    this.scroll = h('div', { class: 'res-scroll', data: { scroll: 'res' } });
    this.el = h('div', { class: 'res-bar' }, this.scroll);
  }

  /** Re-scan state (≈5 Hz). */
  poll(): void {
    const { game, data } = this.ctx;
    const amounts = game.state.resources.amounts;
    const life = game.state.resources.lifetime;
    const cap = game.derived.capacity;
    let changed = false;
    for (const def of data.resources) {
      const known = (amounts[def.id] ?? 0) > 0 || (life[def.id] ?? 0) > 0;
      if (known && !this.chips.has(def.id)) {
        this.addChip(def.id, def.icon, def.color, def.sort);
        changed = true;
      }
    }
    if (changed) this.resort();
    for (const c of this.chips.values()) {
      const real = amounts[c.id] ?? 0;
      const hold = Math.min(this.held.get(c.id) ?? 0, real);
      c.target = Math.floor(real - hold);
      const capacity = cap[c.id] ?? data.resource(c.id)?.baseCapacity ?? 0;
      const frac = capacity > 0 ? Math.min(1, real / capacity) : 0;
      c.cap.style.transform = `scaleX(${frac.toFixed(3)})`;
      setClass(c.el, 'near', frac >= 0.85 && frac < 0.999);
      setClass(c.el, 'full', frac >= 0.999);
      if (c.gainAcc >= 1) {
        const t = '+' + fmt(Math.floor(c.gainAcc));
        if (t !== c.gainText) {
          c.gainText = t;
          c.gain.textContent = t;
          replay(c.gain, 'show');
        }
      }
    }
  }

  /** Rolling numbers (every frame, only for chips in motion). */
  frame(dt: number): void {
    for (const c of this.chips.values()) {
      if (c.gainT > 0) {
        c.gainT -= dt;
        if (c.gainT <= 0) {
          c.gainAcc = 0;
          c.gainText = '';
        }
      }
      if (c.shown === c.target) continue;
      const diff = c.target - c.shown;
      const up = diff > 0;
      if (Math.abs(diff) < 1) c.shown = c.target;
      else c.shown += diff * Math.min(1, dt * (up ? 9 : 18));
      if (Math.abs(c.target - c.shown) < 0.6) c.shown = c.target;
      setText(c.amt, fmt(Math.floor(c.shown + 1e-6)));
      if (up) {
        const now = performance.now();
        if (now - c.popAt > 350) {
          c.popAt = now;
          replay(c.el, 'pop');
        }
      }
    }
  }

  private addChip(id: string, icon: string, color: string, sort: number): void {
    const amt = h('span', { class: 'amt', text: '0' });
    const cap = h('i');
    const gain = h('span', { class: 'gain' });
    const el = h('button', { class: 'rchip', type: 'button', data: { res: id, sfx: 'ui_click' } }, h('span', { class: 'ic', text: icon }), amt, h('span', { class: 'cap' }, cap), gain);
    setVar(el, '--rc', color);
    el.addEventListener('click', () => this.onInfo(el, id));
    const real = this.ctx.game.state.resources.amounts[id] ?? 0;
    const c: Chip = { id, el, amt, cap, gain, sort, shown: Math.floor(real), target: Math.floor(real), gainAcc: 0, gainT: 0, gainText: '', popAt: 0 };
    setText(amt, fmt(c.shown));
    this.chips.set(id, c);
  }

  private resort(): void {
    const list = [...this.chips.values()].sort((a, b) => a.sort - b.sort);
    const ids = list.map((c) => c.id).join(',');
    if (ids === this.order.join(',')) return;
    this.order = list.map((c) => c.id);
    for (const c of list) this.scroll.appendChild(c.el);
  }

  // ---------------------------------------------------------------- juice hooks

  /** A gain happened (any source): accumulate the "+N" label (not for steady production). */
  gained(id: string, amount: number, source: GainSource): void {
    const c = this.chips.get(id);
    if (!c) return;
    if (source === 'production') return;
    c.gainAcc += amount;
    c.gainT = 1.6;
  }

  /** Hold back `n` of a resource from the displayed number until flying icons land. */
  hold(id: string, n: number): void {
    this.held.set(id, (this.held.get(id) ?? 0) + n);
    // never hold forever
    window.setTimeout(() => this.release(id, n), 2200);
  }

  release(id: string, n: number): void {
    const cur = this.held.get(id) ?? 0;
    if (cur <= 0) return;
    const next = Math.max(0, cur - n);
    if (next === 0) this.held.delete(id);
    else this.held.set(id, next);
    this.poll();
  }

  has(id: string): boolean {
    return this.chips.has(id);
  }

  /** Screen rect of a chip (cached ~0.5 s), clamped into the visible scroller. */
  rect(id: string): DOMRect | null {
    const c = this.chips.get(id);
    if (!c) return null;
    const now = performance.now();
    const hit = this.rectCache.get(id);
    if (hit && now - hit.t < 500) return hit.r;
    let r = c.el.getBoundingClientRect();
    // chips scrolled out of the bar: land on the nearest visible edge instead of flying off-screen
    const sr = this.scroll.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const inset = Math.min(24, sr.width / 4);
    if (sr.width > 0 && (cx < sr.left + inset || cx > sr.right - inset)) {
      const nx = Math.max(sr.left + inset, Math.min(sr.right - inset, cx));
      r = new DOMRect(nx - r.width / 2, r.top, r.width, r.height);
    }
    this.rectCache.set(id, { r, t: now });
    return r;
  }

  pop(id: string): void {
    const c = this.chips.get(id);
    if (c) replay(c.el, 'pop');
  }

  /** Detailed popover content for a resource. */
  describe(id: string): { title: string; rows: { k: string; v: string; cls?: string }[] } {
    const { game, data } = this.ctx;
    const def = data.resource(id);
    const amount = game.state.resources.amounts[id] ?? 0;
    const capacity = game.derived.capacity[id] ?? def?.baseCapacity ?? 0;
    const prod = game.derived.producePerMin[id] ?? 0;
    const cons = game.derived.consumePerMin[id] ?? 0;
    const net = game.derived.netPerMin[id] ?? prod - cons;
    const rows = [
      { k: 'Stored', v: `${fmt(Math.floor(amount))} / ${fmt(capacity)}` },
      { k: 'Production', v: `+${fmt(prod)}/min`, cls: prod > 0 ? 'pos' : '' },
      { k: 'Consumption', v: `−${fmt(cons)}/min`, cls: cons > 0 ? 'neg' : '' },
      { k: 'Net', v: `${fmtSigned(net)}/min`, cls: net >= 0 ? 'pos' : 'neg' },
    ];
    if (amount >= capacity && capacity > 0) rows.push({ k: 'Storage full', v: 'Build more storage!', cls: 'neg' });
    return { title: `${def?.icon ?? ''} ${def?.name ?? id}`, rows };
  }
}

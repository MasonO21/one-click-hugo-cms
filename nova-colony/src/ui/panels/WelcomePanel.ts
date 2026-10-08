/**
 * WelcomePanel — "Welcome Back! Away for 4h 32m". The colony's offline gains count up one by one;
 * [Collect] claims them, [▶ DOUBLE REWARDS] shows a rewarded ad (offline_double) for 2×.
 */
import { Panel, type PanelTitle } from './Panel';
import type { ResourceBag } from '../../data/schema';
import { bagEntries } from '../../core/bag';
import { fmtDuration } from '../../core/format';
import { btn } from '../widgets';
import { confetti } from '../fx/Confetti';
import { countUp, fill, h } from '../dom';
import { hudArt, iconEl, resourceArt } from '../art';
import { offlineWorkedText } from '../logic/time';

export interface WelcomeArg {
  seconds: number;
  gains: ResourceBag;
  rp: number;
}

export class WelcomePanel extends Panel {
  readonly name = 'welcome';
  override readonly kind = 'modal' as const;
  override readonly dismissable = false;
  override readonly hasHeader = false;
  private done = false;
  private busy = false;
  private animated = false;

  title(): PanelTitle {
    return { icon: '☀️', art: hudArt('day'), text: 'Welcome back' };
  }

  private summary(): WelcomeArg {
    const a = this.arg as WelcomeArg | undefined;
    if (a && a.gains) return a;
    const p = this.game.pendingOffline;
    return p ? { seconds: p.seconds, gains: p.gains, rp: p.rp } : { seconds: 0, gains: {}, rp: 0 };
  }

  override onOpen(): void {
    this.ctx.sfx('reward');
    this.card.classList.add('wide');
  }

  override signature(): string {
    return `${this.busy}|${this.game.sys.liveops.canWatchAd('offline_double') ? 1 : 0}`;
  }

  render(): void {
    const s = this.summary();
    const away = this.game.pendingOffline?.away ?? s.seconds;
    const wrap = h('div', { class: 'welcome modal-grid two' });
    const left = h('div', { class: 'm-left' });
    const right = h('div', { class: 'm-right' });
    const foot = h('div', { class: 'm-foot' });
    wrap.append(left, right, foot);
    left.appendChild(h('div', { class: 'wb-sun' }, h('div', { class: 'wb-rays' }), iconEl(hudArt('sunrise'), '🌅', 'wb-ic', 'div')));
    left.appendChild(h('h2', { class: 'wb-title', text: 'Welcome Back!' }));
    left.appendChild(h('div', { class: 'wb-away', text: `Away for ${fmtDuration(away)}` }));
    right.appendChild(h('div', { class: 'mute small center', text: offlineWorkedText(away, s.seconds, this.game.data.balance.offlineEfficiency, fmtDuration) }));

    const list = h('div', { class: 'gains' });
    const order = new Map(this.data.resources.map((r) => [r.id, r.sort]));
    const entries = bagEntries(s.gains).sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
    let i = 0;
    const rows: { el: HTMLElement; n: number; i: number }[] = [];
    const addRow = (icon: string, name: string, n: number, color: string, art: string | null = null) => {
      const num = h('b', { class: 'gn num', text: this.animated ? `+${Math.round(n).toLocaleString()}` : '+0' });
      const row = h('div', { class: 'gain-row', style: { '--gc': color, animationDelay: `${i * 90}ms` } }, iconEl(art, icon, 'gi', 'span'), h('span', { class: 'gl', text: name }), num);
      list.appendChild(row);
      rows.push({ el: num, n, i });
      i++;
    };
    for (const [id, n] of entries) {
      const d = this.data.resource(id);
      addRow(d?.icon ?? '📦', d?.name ?? id, n, d?.color ?? '#999', resourceArt(id));
    }
    if (s.rp > 0) addRow('🔬', 'Research points', s.rp, '#8fa8ff');
    if (!rows.length) list.appendChild(h('div', { class: 'mute center', text: 'Your colonists were resting — build production to earn while away!' }));
    right.appendChild(list);

    const dbl = btn({
      label: '▶ DOUBLE REWARDS',
      cls: 'ad big block shine noicon pulse',
      sub: rows.length ? 'Watch a short video for 2×' : undefined,
      disabled: this.busy ? 'One moment…' : false,
      id: 'btn-offline-double',
      onClick: () => this.double(),
    });
    const actions = h('div', { class: 'm-actions' }, dbl, btn({ label: 'Collect', cls: 'good block', id: 'btn-offline-collect', disabled: this.busy ? 'One moment…' : false, onClick: () => this.collect() }));
    foot.appendChild(actions);
    fill(this.body, wrap);

    if (!this.animated) {
      this.animated = true;
      rows.forEach((r) => countUp(r.el, r.n, 900, 250 + r.i * 110, (n) => `+${Math.round(n).toLocaleString()}`));
      confetti(this.frame, { count: 26, y: this.frame.clientHeight * 0.28, power: 0.7 });
    }
  }

  private collect(): void {
    if (this.done) return;
    this.done = true;
    this.game.sys.liveops.claimOffline(false);
    this.ctx.haptic('success');
    this.ctx.close(this.name);
  }

  private async double(): Promise<void> {
    if (this.busy || this.done) return;
    this.busy = true;
    this.rerender();
    const ok = await this.ctx.watchAd('offline_double');
    this.busy = false;
    if (ok) {
      this.done = true;
      this.ctx.haptic('success');
      this.ctx.toast('Rewards doubled! Wonderful!', 'reward', '🎉');
      this.ctx.close(this.name);
    } else this.rerender();
  }
}


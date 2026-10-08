/**
 * Hud — composes the always-on overlay: tier badge, resource bar, Nova Crystals, status chips
 * (colonists/happiness, power, clock, defense, backpack, boosts), mission tracker, banners, the right
 * side button rail and the bottom-right dock + context button. Text is diffed and refreshed ~5x/s;
 * only rolling numbers touch the DOM every frame.
 */
import type { UiCtx } from '../ctx';
import { fmt, fmtSigned } from '../../core/format';
import { clockText, dayPhase, fmtHMS } from '../logic/time';
import { happinessFace } from '../logic/colonist';
import { bigNum } from '../widgets';
import { artOrEmoji, hudArt, hudIcon, phaseArt, iconEl, preloadResourceArt, resIcon, tierArt } from '../art';
import { hudExpedition } from '../logic/expeditions';
import { fill, h, replay, setClass, setHidden, setText, setVar, safe } from '../dom';
import { ResourceBar } from './ResourceBar';
import { InteractButton } from './Interact';
import { MissionTracker } from './MissionTracker';
import { Banners } from './Banners';

interface NavDef {
  id: string;
  /** Painted icon id (art/hud), with `icon` as the emoji fallback. */
  art: string;
  icon: string;
  label: string;
  panel: string;
  primary?: boolean;
}

const RAIL: NavDef[] = [
  { id: 'btn-map', art: 'map', icon: '🗺️', label: 'Map', panel: 'map' },
  { id: 'btn-missions', art: 'quests', icon: '📜', label: 'Quests', panel: 'missions' },
  { id: 'btn-shop', art: 'shop', icon: '💎', label: 'Shop', panel: 'shop' },
  { id: 'btn-menu', art: 'menu', icon: '☰', label: 'Menu', panel: 'menu' },
];
const DOCK: NavDef[] = [
  { id: 'btn-colonists', art: 'crew', icon: '🧑‍🚀', label: 'Crew', panel: 'colonists' },
  { id: 'btn-research', art: 'tech', icon: '🔬', label: 'Tech', panel: 'research' },
  { id: 'btn-craft', art: 'craft', icon: '🛠️', label: 'Craft', panel: 'craft' },
  { id: 'btn-build', art: 'build', icon: '🔨', label: 'Build', panel: 'build', primary: true },
];

/** Eases a displayed integer toward a target. */
class Roller {
  shown = 0;
  target = 0;
  init(v: number): void {
    this.shown = this.target = v;
  }
  step(dt: number): boolean {
    if (this.shown === this.target) return false;
    const d = this.target - this.shown;
    if (Math.abs(d) < 1) this.shown = this.target;
    else this.shown += d * Math.min(1, dt * (d > 0 ? 8 : 16));
    if (Math.abs(this.target - this.shown) < 0.6) this.shown = this.target;
    return true;
  }
}

const BOOST_LABEL: Record<string, string> = { production: 'Production', research: 'Research', gather: 'Gathering', drone: 'Drone helper' };

export class Hud {
  readonly el: HTMLElement;
  readonly resources: ResourceBar;
  readonly interact: InteractButton;
  private readonly tracker: MissionTracker;
  private readonly banners: Banners;

  // top bar
  private readonly tierBtn: HTMLElement;
  private readonly tierSw: HTMLElement;
  private tierSrc: string | null = null;
  private readonly tierName: HTMLElement;
  private readonly tierSub: HTMLElement;
  private readonly novaBtn: HTMLElement;
  private readonly novaAmt: HTMLElement;
  private readonly nova = new Roller();

  // status chips
  private readonly chipPop: HTMLElement;
  private readonly chipPopV: HTMLElement;
  private readonly chipPopS: HTMLElement;
  private readonly chipPower: HTMLElement;
  private readonly chipPowerIc: HTMLElement;
  private readonly chipPowerV: HTMLElement;
  private readonly chipClockIc: HTMLElement;
  private clockPhase = '';
  private readonly chipClockV: HTMLElement;
  private readonly chipClockS: HTMLElement;
  private readonly chipDef: HTMLElement;
  private readonly chipDefV: HTMLElement;
  private readonly chipPack: HTMLElement;
  private readonly chipPackV: HTMLElement;
  private readonly chipHp: HTMLElement;
  /** Expeditions: "Haul ready!" when a squad is back, else the countdown to the next one (hidden with none out). */
  private readonly chipExp: HTMLElement;
  private readonly chipExpV: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly boostWrap: HTMLElement;
  private readonly statusEl: HTMLElement;
  private statusH = '';
  private boostKey = '';
  private boostEls: { until: number; el: HTMLElement }[] = [];
  private powerExpanded = 0;

  // popover
  private readonly pop: HTMLElement;
  private popSrc: { anchor: HTMLElement; build: () => Node } | null = null;
  private popTimer = 0;

  private readonly navBtns = new Map<string, HTMLElement>();
  private readonly navBadges = new Map<string, HTMLElement>();

  private acc = 0;
  private acc2 = 0;
  private bannerH = '';

  constructor(private readonly ctx: UiCtx) {
    // the first frame must not show empty chips: fetch + decode every resource icon up front
    preloadResourceArt();
    this.resources = new ResourceBar(ctx, (anchor, id) => this.showPop(anchor, () => this.resourcePop(id)));
    this.interact = new InteractButton(ctx);
    this.tracker = new MissionTracker(ctx);
    this.banners = new Banners(ctx);

    // --- top bar
    this.tierSw = h('span', { class: 'sw' });
    this.tierName = h('b');
    this.tierSub = h('small');
    this.tierBtn = h('button', { class: 'tier-badge tap', type: 'button', id: 'tier-badge', data: { sfx: 'ui_click' } }, this.tierSw, h('span', null, this.tierName, this.tierSub));
    this.tierBtn.addEventListener('click', () => ctx.open('colony'));
    this.novaAmt = h('span', { class: 'num', text: '0' });
    this.novaBtn = h('button', { class: 'nova-chip tap', type: 'button', id: 'nova-chip', data: { sfx: 'ui_click' } }, resIcon('nova', '💎', 'ic', 'span'), this.novaAmt, h('span', { class: 'plus', text: '+' }));
    this.novaBtn.addEventListener('click', () => ctx.open('shop', { tab: 'crystals' }));
    const top = h('div', { class: 'hud-top' }, this.tierBtn, this.resources.el, this.novaBtn);

    // --- status row
    this.chipPopV = h('span', { class: 'v' });
    this.chipPopS = h('small');
    this.chipPop = h('button', { class: 'schip tap', type: 'button', hidden: true, data: { sfx: 'ui_click' } }, hudIcon('population', '👥', 'ic', 'span'), this.chipPopV, this.chipPopS);
    this.chipPop.addEventListener('click', () => ctx.open('colonists'));

    this.chipPowerIc = hudIcon('power', '⚡', 'ic', 'span');
    this.chipPowerV = h('span', { class: 'v' });
    this.chipPower = h('button', { class: 'schip tap', type: 'button', hidden: true, id: 'chip-power', data: { sfx: 'ui_click' } }, this.chipPowerIc, this.chipPowerV);
    this.chipPower.addEventListener('click', () => {
      this.powerExpanded = this.powerExpanded > 0 ? 0 : 7;
      this.pollStatus();
    });

    this.chipClockIc = h('span', { class: 'clock-ic' });
    this.chipClockV = h('span', { class: 'v' });
    this.chipClockS = h('small');
    const chipClock = h('div', { class: 'schip static' }, this.chipClockIc, this.chipClockV, this.chipClockS);

    this.chipDefV = h('span', { class: 'v' });
    this.chipDef = h('button', { class: 'schip tap', type: 'button', hidden: true, data: { sfx: 'ui_click' } }, hudIcon('defense', '🛡️', 'ic', 'span'), this.chipDefV);
    this.chipDef.addEventListener('click', () => this.showPop(this.chipDef, () => this.defensePop()));

    this.chipPackV = h('span', { class: 'v' });
    this.chipPack = h('button', { class: 'schip tap', type: 'button', hidden: true, data: { sfx: 'ui_click' } }, hudIcon('backpack', '🎒', 'ic', 'span'), this.chipPackV);
    this.chipPack.addEventListener('click', () => ctx.open('inventory'));

    this.hpFill = h('i');
    this.chipHp = h('div', { class: 'schip hp static', hidden: true }, hudIcon('health', '❤️', 'ic', 'span'), h('div', { class: 'bar red' }, this.hpFill));
    this.chipExpV = h('span', { class: 'v' });
    this.chipExp = h('button', { class: 'schip exp tap', type: 'button', hidden: true, id: 'chip-expedition', 'aria-label': 'Expeditions', data: { sfx: 'ui_click' } }, iconEl(hudArt('expeditions'), '🧭', 'ic', 'span'), this.chipExpV);
    this.chipExp.addEventListener('click', () => ctx.open('expeditions'));

    this.boostWrap = h('div', { class: 'row', style: 'display:contents' });
    const status = h('div', { class: 'hud-status' }, this.chipPop, this.chipPower, chipClock, this.chipExp, this.chipDef, this.chipPack, this.chipHp, this.boostWrap);
    this.statusEl = status;

    // --- rail + dock
    const rail = h('div', { class: 'hud-rail' }, ...RAIL.map((n) => this.navButton(n, 'rail-btn')));
    const dock = h('div', { class: 'hud-dock' }, ...DOCK.map((n) => this.navButton(n, 'dock-btn' + (n.primary ? ' primary' : ''))));

    this.pop = h('div', { class: 'hud-pop' });
    document.addEventListener('pointerdown', (e) => {
      if (this.popSrc && !this.pop.contains(e.target as Node) && !this.popSrc.anchor.contains(e.target as Node)) this.hidePop();
    });

    this.el = h('div', { class: 'nv-hud' }, top, status, this.tracker.el, this.banners.el, rail, dock, this.interact.el, this.pop);

    const g = ctx.game;
    this.nova.init(g.state.liveops.nova);
    setText(this.novaAmt, bigNum(this.nova.shown));
    this.poll();
  }

  private navButton(n: NavDef, cls: string): HTMLElement {
    const badge = h('span', { class: 'badge', hidden: true });
    const b = h('button', { class: cls + ' tap', id: n.id, type: 'button', 'aria-label': n.label, data: { sfx: 'ui_click' } }, hudIcon(n.art, n.icon, 'ic', 'span'), h('span', { class: 'lb', text: n.label }), badge);
    b.addEventListener('click', () => {
      if (this.ctx.isOpen(n.panel)) this.ctx.close(n.panel);
      else this.ctx.open(n.panel);
    });
    this.navBtns.set(n.id, b);
    this.navBadges.set(n.id, badge);
    return b;
  }

  // ---------------------------------------------------------------- per-frame / polling

  update(dt: number): void {
    this.acc += dt;
    this.acc2 += dt;
    safe('hud frame', () => {
      this.resources.frame(dt);
      if (this.nova.step(dt)) setText(this.novaAmt, bigNum(this.nova.shown));
    });
    if (this.acc2 >= 0.1) {
      this.acc2 = 0;
      safe('hud interact', () => this.interact.poll());
    }
    if (this.acc >= 0.2) {
      this.acc = 0;
      safe('hud poll', () => this.poll());
    }
  }

  private poll(): void {
    safe('hud resources', () => this.resources.poll());
    safe('hud top', () => this.pollTop());
    safe('hud status', () => this.pollStatus());
    safe('hud tracker', () => this.tracker.poll());
    safe('hud banners', () => {
      const banner = this.banners.poll();
      const bv = banner ? '1' : '0';
      if (this.ctx.root.dataset.banner !== bv) this.ctx.root.dataset.banner = bv;
      const bh = `${this.banners.height()}px`;
      if (bh !== this.bannerH) {
        this.bannerH = bh;
        this.ctx.root.style.setProperty('--banner-h', bh);
      }
    });
    safe('hud rail', () => this.pollRail());
    if (this.popSrc) safe('hud pop', () => this.renderPop());
  }

  private pollTop(): void {
    const { game, data } = this.ctx;
    const tier = data.tier(game.state.colony.tier);
    setText(this.tierName, tier.name);
    setText(this.tierSub, `Tier ${tier.index + 1}`);
    setVar(this.tierBtn, '--tc', tier.color);
    setVar(this.tierBtn, '--ta', tier.accent);
    const src = tierArt(tier.index);
    if (src !== this.tierSrc) {
      this.tierSrc = src;
      fill(this.tierSw, src ? artOrEmoji(src, '', 'tier-thumb') : null);
    }
    this.nova.target = game.state.liveops.nova;
  }

  private pollStatus(): void {
    const { game, data } = this.ctx;
    const st = game.state;
    const d = game.derived;

    // colonists + happiness
    const n = st.colonists.list.length;
    setHidden(this.chipPop, n === 0 && d.housing.beds === 0);
    setText(this.chipPopV, d.housing.beds > 0 ? `${n}/${d.housing.beds}` : String(n));
    const face = happinessFace(d.happiness.average);
    setText(this.chipPopS, n > 0 ? `${face.icon} ${Math.round(d.happiness.average)}` : '');

    // power
    const hasPower = d.power.produced > 0 || d.power.consumed > 0;
    setHidden(this.chipPower, !hasPower);
    if (hasPower) {
      const avail = d.power.produced - d.power.consumed;
      const text =
        this.powerExpanded > 0
          ? `Production ${fmt(d.power.produced)} · Consumption ${fmt(d.power.consumed)} · Available ${fmtSigned(avail)}`
          : fmtSigned(avail);
      setText(this.chipPowerV, text);
      setClass(this.chipPower, 'bad', avail < 0);
      setClass(this.chipPower, 'good', avail >= 0);
      if (this.powerExpanded > 0) this.powerExpanded -= 0.2;
    }

    // clock
    const ph = dayPhase(st.time.dayTime);
    if (ph.name !== this.clockPhase) {
      this.clockPhase = ph.name;
      this.chipClockIc.replaceChildren(iconEl(phaseArt(ph.name), ph.icon, 'ic', 'span'));
    }
    setText(this.chipClockV, `Day ${st.time.day}`);
    setText(this.chipClockS, clockText(st.time.dayTime));

    // defense
    const rating = d.defense.rating || game.sys.combat.defenseRating();
    setHidden(this.chipDef, !(rating > 0 || d.defense.turrets > 0));
    setText(this.chipDefV, fmt(Math.round(rating)));

    // backpack
    const carried = game.sys.player.carried();
    setHidden(this.chipPack, carried <= 0);
    setText(this.chipPackV, `${Math.floor(carried)}/${game.sys.player.capacity()}`);
    setClass(this.chipPack, 'warn', carried >= game.sys.player.capacity() * 0.95);

    // expeditions
    const ex = hudExpedition(game);
    setHidden(this.chipExp, ex.state === null);
    setClass(this.chipExp, 'ready', ex.state === 'ready');
    if (ex.state === 'ready') setText(this.chipExpV, ex.ready > 1 ? `${ex.ready} squads home!` : 'Haul ready!');
    else if (ex.state === 'out') setText(this.chipExpV, fmtHMS(ex.seconds));

    // player hp
    const hp = st.player.hp;
    const maxHp = Math.max(data.balance.playerHp, hp);
    setHidden(this.chipHp, hp >= maxHp - 0.5);
    this.hpFill.style.transform = `scaleX(${Math.max(0, hp / maxHp).toFixed(3)})`;

    // boosts
    const boosts = game.sys.liveops.activeBoosts();
    const key = boosts.map((b) => b.id).join(',');
    if (key !== this.boostKey) {
      this.boostKey = key;
      this.boostEls = boosts.map((b) => {
        const el = h('div', { class: 'schip boost static' }, h('span', { class: 'ic', text: '⚡' }), h('span', null, `${fmt(b.mult)}× ${BOOST_LABEL[b.kind] ?? b.kind}`), h('small', { text: '' }));
        return { until: b.until, el };
      });
      fill(this.boostWrap, this.boostEls.map((b) => b.el));
    }
    const now = game.now();
    for (const b of this.boostEls) setText(b.el.lastChild as HTMLElement, fmtHMS((b.until - now) / 1000));

    // the status row can wrap onto two lines: let the banners / mission card / rail sit below it
    const sh = `${this.statusEl.offsetHeight}px`;
    if (sh !== this.statusH && this.statusEl.offsetHeight > 0) {
      this.statusH = sh;
      this.ctx.root.style.setProperty('--status-h', sh);
    }
  }

  private pollRail(): void {
    const b = this.ctx.badges();
    const set = (id: string, n: number, dot = false) => {
      const el = this.navBadges.get(id);
      if (!el) return;
      el.hidden = n <= 0;
      if (n > 0) {
        setText(el, dot ? '!' : String(n));
        setClass(el, 'dot', dot);
      }
    };
    set('btn-missions', b.missions);
    set('btn-research', b.research, true);
    set('btn-menu', (b.daily ? 1 : 0) + (b.spin ? 1 : 0) + b.season + b.expeditions + (b.journal ? 1 : 0));
    set('btn-shop', b.crate ? 1 : 0, true);
    set('btn-colonists', b.colonists);
  }

  // ---------------------------------------------------------------- popover

  private showPop(anchor: HTMLElement, build: () => Node): void {
    if (this.popSrc?.anchor === anchor) {
      this.hidePop();
      return;
    }
    this.popSrc = { anchor, build };
    this.renderPop();
    this.pop.classList.add('on');
    window.clearTimeout(this.popTimer);
    this.popTimer = window.setTimeout(() => this.hidePop(), 6000);
  }

  private hidePop(): void {
    this.popSrc = null;
    this.pop.classList.remove('on');
    window.clearTimeout(this.popTimer);
  }

  private renderPop(): void {
    if (!this.popSrc) return;
    fill(this.pop, this.popSrc.build());
    const a = this.popSrc.anchor.getBoundingClientRect();
    const w = this.pop.offsetWidth || 200;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2));
    this.pop.style.left = `${left}px`;
    this.pop.style.top = `${a.bottom + 8}px`;
  }

  private resourcePop(id: string): Node {
    const d = this.resources.describe(id);
    const def = this.ctx.data.resource(id);
    return h(
      'div',
      null,
      h('h4', null, resIcon(id, def?.icon ?? ''), ` ${def?.name ?? id}`),
      ...d.rows.map((r) => h('div', { class: 'kv' }, h('span', { text: r.k }), h('span', { class: r.cls ?? '', text: r.v }))),
    );
  }

  private defensePop(): Node {
    const { game } = this.ctx;
    const d = game.derived.defense;
    return h(
      'div',
      null,
      h('h4', { text: '🛡️ Defense' }),
      h('div', { class: 'kv' }, h('span', { text: 'Rating' }), h('span', { class: 'pos', text: fmt(Math.round(d.rating || game.sys.combat.defenseRating())) })),
      h('div', { class: 'kv' }, h('span', { text: 'Turrets' }), h('span', { text: String(d.turrets) })),
      h('div', { class: 'kv' }, h('span', { text: 'Your damage/s' }), h('span', { text: fmt(game.sys.combat.playerDps()) })),
    );
  }

  // ---------------------------------------------------------------- hooks for fx

  /** Pulse the Nova chip (rewards). */
  popNova(): void {
    replay(this.novaBtn, 'pop');
  }

  novaRect(): DOMRect {
    return this.novaBtn.getBoundingClientRect();
  }

  /** Where flying icons of a resource should land (resource chip, Nova chip, or the mission card). */
  targetRect(kind: string): DOMRect | null {
    if (kind === 'nova') return this.novaRect();
    if (kind === 'rp') return (this.navBtns.get('btn-research') ?? this.novaBtn).getBoundingClientRect();
    if (kind === 'xp') return (this.navBtns.get('btn-menu') ?? this.novaBtn).getBoundingClientRect();
    return this.resources.rect(kind);
  }

  navElement(id: string): HTMLElement | undefined {
    return this.navBtns.get(id);
  }
}

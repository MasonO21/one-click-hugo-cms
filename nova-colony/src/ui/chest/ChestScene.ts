/**
 * The cache opening scene: a full-screen overlay above every panel and the HUD, on the cache's own painted backdrop.
 *
 *  1. The backdrop drifts slowly (anchored on its pedestal) under a soft vignette.
 *  2. The cache drops in with weight: a short fall, a small settle, a puff of dust and a low thud through the stage.
 *  3. It waits: a sheen passes over it now and then and warm light seeps from the seam under the lid. "Tap to open".
 *  4. Each tap (three for a cache, one for a crate) knocks it harder; the seam glows brighter and sparks escape.
 *  5. It opens: a flash, the open painting, a shockwave, a column of light, slow rays turning behind it and the
 *     tier's own burst (wood shavings and warm sparks, blue sparks, gold sparks and ore, glyphs and crystal shards,
 *     starlight and energy rings). A crate pops instead.
 *  6. The reward cards rise out of it one at a time and turn over, framed and lit by rarity (cream, blue, violet,
 *     gold, iridescent). Cosmetics are marked NEW and can be equipped right there; duplicates show their Nova.
 *  7. Collect, or open another (owned, or affordable).
 * A tap during the reveal (or Skip, or Android back) jumps to everything revealed; back again closes.
 *
 * Everything was granted before the scene starts (sim/chests.ts), so closing it at any moment loses nothing. DOM + CSS
 * (transforms and opacity only, styles/chests.css) and a canvas particle layer (ChestFx); counts follow the quality
 * setting. Reduced motion (Settings › Reduce motion, or the phone's own preference: core/motion.ts) keeps it calm: no
 * drop, knocks, drift or particle bursts; the cache, the light and the cards simply fade in, and every step still works.
 */
import type { Game } from '../../core/Game';
import type { UiCtx } from '../ctx';
import type { ChestCard, ChestOpened } from '../../sim/chests';
import { rarityRank } from '../../sim/chests';
import { reducedMotion } from '../../core/motion';
import { artOrEmoji, chestArt, chestBgArt, itemArt, resIcon } from '../art';
import { h, replay, safe, type Child } from '../dom';
import { bigNum, btn } from '../widgets';
import { ChestFx, type FxTheme } from './ChestFx';
import { PEDESTAL, sceneLayout, type SceneLayout } from './layout';
import { RARITY_LABEL, cardFace, chestBack, findsLabel, fxBudget, revealGap, revealSound, tapHint, tapsToOpen, teaseMs, type ChestPhase } from './logic';

export interface ChestSceneHost {
  readonly game: Game;
  readonly ctx: UiCtx;
  /** The scene starts / stops covering the screen (hide the rest of the UI, pause the colony, release the joystick). */
  onActive(active: boolean): void;
}

const KNOCKS = ['knock-1', 'knock-2', 'knock-3'];
const THEMES: readonly FxTheme[] = ['supply', 'explorer', 'prospector', 'relic', 'nova'];

/** ms: the fall, from the start of the drop to the impact (styles/chests.css cs-drop: 52% of 0.74 s). */
const IMPACT_MS = 385;

export class ChestScene {
  readonly el: HTMLElement;
  private phase: ChestPhase = 'off';
  private cur: ChestOpened | null = null;
  private taps = 0;
  private need = 3;
  private flipped = 0;
  private gen = 0;
  private timers = new Set<number>();
  private readonly fx = new ChestFx();
  private layout: SceneLayout | null = null;
  private pedestal = 0.6;
  private scale = 1;
  private calm = false;
  private cards: HTMLElement[] = [];
  /** performance.now() when the overlay started fading in. */
  private shownAt = 0;

  private readonly bgImg: HTMLImageElement;
  private readonly stage: HTMLElement;
  private readonly chest: HTMLElement;
  private readonly dropEl: HTMLElement;
  private readonly kickEl: HTMLElement;
  private readonly knockEl: HTMLElement;
  private readonly art: HTMLElement;
  private readonly sheen: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly title: HTMLElement;
  private readonly ribbon: HTMLElement;
  private readonly count: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly cardLayer: HTMLElement;
  /** The light behind each card, in its own layer under all of them (so it never tints a neighbour). */
  private readonly glowLayer: HTMLElement;
  private glows: HTMLElement[] = [];
  private readonly actions: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly probe: HTMLElement;

  constructor(private readonly host: ChestSceneHost) {
    this.bgImg = h<HTMLImageElement>('img', { class: 'cs-bgimg', alt: '', draggable: 'false', decoding: 'async' });
    this.art = h('div', { class: 'cs-art' });
    this.sheen = h('div', { class: 'cs-sheen' }, h('i'));
    this.knockEl = h('div', { class: 'cs-knock' }, this.art, this.sheen, h('div', { class: 'cs-seam' }), h('div', { class: 'cs-leak' }));
    this.kickEl = h('div', { class: 'cs-kick' }, this.knockEl);
    this.dropEl = h('div', { class: 'cs-drop' }, this.kickEl);
    this.wave = h('div', { class: 'cs-wave' });
    this.chest = h(
      'div',
      { class: 'cs-chest' },
      h('div', { class: 'cs-rays' }, h('i'), h('i')),
      h('div', { class: 'cs-beam' }),
      h('div', { class: 'cs-glow' }),
      h('div', { class: 'cs-ground' }),
      h('div', { class: 'cs-shadow' }),
      this.wave,
      this.dropEl,
    );
    this.stage = h('div', { class: 'cs-stage' }, h('div', { class: 'cs-bg' }, this.bgImg), h('div', { class: 'cs-vig' }), h('div', { class: 'cs-dim' }), this.chest);
    this.title = h('h2', { class: 'cs-title' });
    this.ribbon = h('span', { class: 'cs-ribbon' });
    this.count = h('span', { class: 'cs-count' });
    this.hintText = h('span', { class: 'cs-hint-t' });
    this.hint = h('div', { class: 'cs-hint' }, h('span', { class: 'cs-tapring', 'aria-hidden': 'true' }), this.hintText);
    this.cardLayer = h('div', { class: 'cs-cards' });
    this.glowLayer = h('div', { class: 'cs-glows' });
    this.actions = h('div', { class: 'cs-actions' });
    this.flash = h('div', { class: 'cs-flash' });
    this.skipBtn = h<HTMLButtonElement>('button', { class: 'cs-skip', type: 'button', 'aria-label': 'Skip to the rewards', data: { sfx: 'ui_tab' } }, 'Skip', h('span', { class: 'cs-skip-i', text: '»' }));
    this.skipBtn.addEventListener('click', () => this.skip());
    this.probe = h('div', { class: 'cs-probe' });
    this.el = h(
      'div',
      { class: 'nv-chest', hidden: true, role: 'dialog', 'aria-label': 'Cache opening', data: { phase: 'off' } },
      this.stage,
      this.glowLayer,
      this.cardLayer,
      this.fx.canvas,
      h('div', { class: 'cs-top' }, h('div', { class: 'cs-sub' }, this.ribbon, this.count), this.title),
      this.skipBtn,
      this.hint,
      this.actions,
      this.flash,
      this.probe,
    );
    this.el.addEventListener('pointerdown', (e) => this.onPointer(e));
  }

  /** The scene is up (or about to be). */
  get active(): boolean {
    return this.phase !== 'off';
  }

  get currentPhase(): ChestPhase {
    return this.phase;
  }

  /** The overlay fully hides the 3D world (faded in, not fading out): the world need not be drawn. */
  covering(): boolean {
    return this.phase !== 'off' && this.phase !== 'closing' && performance.now() - this.shownAt > 400;
  }

  // ================================================================== lifecycle

  /**
   * A cache is about to open (`chest:opening`, before its grants): raise the overlay now so the grants' toasts and
   * pop-ups wait behind it. `show` follows in the same tick.
   */
  prepare(): void {
    if (this.phase !== 'off' && this.phase !== 'closing') return;
    this.clearTimers();
    this.gen++;
    this.phase = 'drop';
    this.shownAt = performance.now();
    this.el.dataset.phase = 'load';
    this.el.hidden = false;
    // a fixed layout: undo any programmatic scroll (focus, scrollIntoView) left over from the last scene
    this.el.scrollTop = this.el.scrollLeft = 0;
    this.el.classList.remove('on', 'ready');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    // (the cast: `reduceMotion` joins SettingsState with the Settings toggle on main)
    this.calm = reducedMotion(this.host.game.state.settings as { reduceMotion?: boolean });
    this.el.classList.toggle('calm', this.calm);
    window.addEventListener('resize', this.onResize);
    this.fx.start();
    this.host.onActive(true);
    // safety: a cache that never arrives must not leave an empty overlay
    this.after(2000, () => {
      if (!this.cur) this.close();
    });
  }

  /** Play the opening of a cache / crate whose cards were just granted. */
  show(e: ChestOpened): void {
    this.prepare();
    this.clearTimers();
    const token = ++this.gen;
    this.cur = e;
    this.taps = 0;
    this.flipped = 0;
    this.need = tapsToOpen(e.variant);
    const g = this.host.game;
    const data = g.data;
    const crate = e.variant === 'crate';
    const look = crate ? 'chest_supply' : e.chest;
    const tier = look.replace('chest_', '') as FxTheme;
    const theme: FxTheme = crate ? 'crate' : THEMES.includes(tier) ? tier : 'supply';
    const def = crate ? undefined : data.chest(e.chest);
    const item = data.item(e.chest);

    // reset the stage
    this.phase = 'drop';
    this.el.dataset.phase = 'load';
    this.el.dataset.theme = theme;
    this.el.dataset.variant = e.variant;
    this.el.classList.remove('opened', 'instant', 'ready', 'landed');
    this.dropEl.classList.remove('go');
    this.kickEl.classList.remove('kick', 'pop');
    this.knockEl.classList.remove(...KNOCKS);
    this.stage.classList.remove('thud');
    this.el.style.setProperty('--charge', '0');
    this.el.style.setProperty('--shift', '0px');
    this.el.style.setProperty('--settle', '1');
    this.actions.replaceChildren();
    this.skipBtn.hidden = false;

    // words
    this.title.textContent = def?.name ?? item?.name ?? 'Cache';
    this.ribbon.textContent = def ? RARITY_LABEL[def.rarity] : 'Crate';
    this.ribbon.className = `cs-ribbon r-${def?.rarity ?? 'common'}`;
    this.count.textContent = findsLabel(e.cards.length);
    this.hintText.textContent = tapHint(0, this.need);

    // art: the painted cache (closed + open) or the crate's item art; the cache's own backdrop
    const closed = crate ? itemArt(e.chest) : chestArt(look, false);
    const open = crate ? null : chestArt(look, true);
    const emoji = def?.icon ?? item?.icon ?? '📦';
    this.art.replaceChildren(artOrEmoji(closed, emoji, 'cs-img closed', ''));
    if (open) this.art.appendChild(artOrEmoji(open, emoji, 'cs-img open', ''));
    // the sheen is cut to the cache's silhouette (no painting: no sheen)
    this.sheen.hidden = !closed;
    if (closed) this.sheen.style.setProperty('--art', `url("${closed}")`);
    const bg = chestBgArt(look);
    if (bg && this.bgImg.getAttribute('src') !== bg) this.bgImg.src = bg;
    this.pedestal = PEDESTAL[look] ?? 0.6;
    this.scale = crate ? 0.62 : look === 'chest_nova' ? 0.92 : 1;
    this.el.style.setProperty('--ped', `${(this.pedestal * 100).toFixed(1)}%`);

    // particles for this quality / motion setting
    const st = g.state.settings;
    const fx = fxBudget(st.batterySaver ? 'low' : st.quality, this.calm);
    this.fx.configure(fx.amount, fx.ambient, fx.dpr);
    this.fx.setTheme(theme);
    this.fx.clear();

    this.buildCards(e.cards);
    this.relayout();

    // wait (briefly) for the paintings to decode so the cache never drops in as an empty box
    void this.decode([closed, open, bg]).then(() => {
      if (token === this.gen) this.drop();
    });
  }

  /** Android back / Escape: everything revealed first, then close. True when the press was used. */
  back(): boolean {
    const a = chestBack(this.phase);
    if (a === 'skip') this.skip();
    else if (a === 'close') this.close();
    return a !== 'none' || this.phase === 'closing';
  }

  close(): void {
    if (this.phase === 'off' || this.phase === 'closing') return;
    this.clearTimers();
    this.gen++;
    this.phase = 'closing';
    this.el.dataset.phase = 'closing';
    this.el.classList.remove('on');
    this.after(this.calm ? 0 : 300, () => {
      this.phase = 'off';
      this.el.dataset.phase = 'off';
      this.el.hidden = true;
      this.cur = null;
      this.fx.stop();
      this.cardLayer.replaceChildren();
      this.glowLayer.replaceChildren();
      this.glows = [];
      this.cards = [];
      window.removeEventListener('resize', this.onResize);
      this.host.onActive(false);
    });
  }

  // ================================================================== sequence

  private setPhase(p: ChestPhase): void {
    this.phase = p;
    this.el.dataset.phase = p;
  }

  private drop(): void {
    this.setPhase('drop');
    this.el.classList.add('ready');
    replay(this.dropEl, 'go');
    // the impact: dust rolls out from its feet, a low thud runs through the stage
    this.after(this.calm ? 120 : IMPACT_MS, () => {
      const L = this.layout;
      this.el.classList.add('landed');
      this.sfx('place');
      if (this.calm) return;
      if (L) this.fx.land(L.chest.x + L.chest.w / 2, L.chest.y + L.chest.h * 0.93, L.chest.w);
      replay(this.stage, 'thud');
      this.haptic('heavy');
    });
    this.after(this.calm ? 300 : 900, () => {
      if (this.phase === 'drop') this.setPhase('idle');
    });
  }

  private onPointer(e: PointerEvent): void {
    if ((e.target as Element | null)?.closest?.('button')) return;
    if (this.phase === 'idle') this.tapChest();
    else if (this.phase === 'cards' || this.phase === 'open') this.skip();
  }

  private tapChest(): void {
    this.taps++;
    if (this.taps >= this.need) {
      this.open();
      return;
    }
    const lvl = Math.min(KNOCKS.length - 1, this.taps - 1);
    this.knockEl.classList.remove(...KNOCKS);
    replay(this.knockEl, KNOCKS[lvl]);
    const charge = this.taps / this.need;
    this.el.style.setProperty('--charge', charge.toFixed(2));
    this.sparkSeam(charge);
    this.hintText.textContent = tapHint(this.taps, this.need);
    replay(this.hint, 'bump');
    this.sfx('spin_tick');
    this.haptic('tap');
  }

  private sparkSeam(charge: number): void {
    const L = this.layout;
    if (L && !this.calm) this.fx.seam(L.chest.x + L.chest.w / 2, L.chest.y + L.chest.h * this.seamAt(), L.chest.w * 0.62, charge);
  }

  /** Where the lid meets the box, as a fraction of the cache box (styles/chests.css --seam). */
  private seamAt(): number {
    const v = parseFloat(getComputedStyle(this.el).getPropertyValue('--seam'));
    return Number.isFinite(v) ? v / 100 : 0.47;
  }

  private open(): void {
    const crate = this.cur?.variant === 'crate';
    this.setPhase('open');
    this.el.style.setProperty('--charge', '1');
    this.knockEl.classList.remove(...KNOCKS);
    replay(this.knockEl, 'knock-3');
    this.sparkSeam(1);
    this.hintText.textContent = '';
    this.sfx('spin_tick');
    this.haptic('tap');
    this.after(this.calm ? 0 : crate ? 120 : 300, () => this.burst());
  }

  /** The flash, the swap to the open cache (or the crate's pop), the shockwave, the rays and the particle burst. */
  private burst(instant = false): void {
    const crate = this.cur?.variant === 'crate';
    const def = this.cur && !crate ? this.host.game.data.chest(this.cur.chest) : undefined;
    this.el.classList.add('opened');
    if (instant) this.el.classList.add('instant');
    this.knockEl.classList.remove(...KNOCKS);
    if (!instant) {
      replay(this.flash, 'go');
      replay(this.wave, 'go');
      replay(this.kickEl, crate ? 'pop' : 'kick');
    } else if (crate) this.kickEl.classList.add('pop');
    const L = this.layout;
    if (L && !this.calm) this.fx.burst(L.mouth.x, L.mouth.y, crate ? 0.6 : 0.8 + 0.1 * rarityRank(def?.rarity));
    this.sfx('crate_open');
    this.haptic(this.calm ? 'success' : 'heavy');
    if (!instant) this.after(this.calm ? 0 : crate ? 380 : 760, () => this.startCards());
  }

  private settle(): void {
    this.el.style.setProperty('--shift', `${this.layout?.shift ?? 0}px`);
    this.el.style.setProperty('--settle', String(this.layout?.settle ?? 1));
  }

  private startCards(): void {
    this.setPhase('cards');
    this.skipBtn.hidden = false;
    this.settle();
    this.revealNext(0);
  }

  private revealNext(i: number): void {
    const cur = this.cur;
    if (!cur || this.phase !== 'cards') return;
    if (i >= cur.cards.length) {
      this.after(450, () => this.finish());
      return;
    }
    const card = cur.cards[i];
    const el = this.cards[i];
    const crate = cur.variant === 'crate';
    el.classList.add('out');
    this.sfx('ui_open');
    const rise = this.calm ? 0 : 480;
    const tease = crate || this.calm ? 0 : teaseMs(card.rarity);
    if (tease) this.after(rise, () => this.mark(i, 'tease', true));
    this.after(rise + tease, () => this.flip(i));
    this.after(rise + tease + Math.max(120, revealGap(card.rarity, crate) - 180), () => this.revealNext(i + 1));
  }

  private flip(i: number, quiet = false): void {
    const cur = this.cur;
    const el = this.cards[i];
    if (!cur || !el) return;
    const card = cur.cards[i];
    this.mark(i, 'tease', false);
    el.classList.add('out', 'flip');
    this.flipped = Math.max(this.flipped, i + 1);
    const rank = rarityRank(card.rarity);
    this.after(quiet ? 0 : 190, () => {
      this.mark(i, 'shown', true);
      const b = this.layout?.cards[i];
      if (b && !this.calm) this.fx.card(b.x + b.w / 2, b.y + b.h * 0.42, card.rarity, quiet ? 0.35 : 1);
      if (quiet) return;
      this.sfx(revealSound(card.rarity));
      if (rank >= 3) {
        replay(this.flash, 'soft');
        this.haptic('heavy');
      } else if (rank >= 2) this.haptic('success');
    });
  }

  /** Tap / Skip / back: straight to everything revealed. */
  private skip(): void {
    const cur = this.cur;
    if (!cur) return;
    if (this.phase === 'drop' || this.phase === 'idle' || this.phase === 'open') {
      this.clearTimers();
      this.dropEl.classList.add('go');
      this.el.classList.add('ready', 'landed');
      this.burst(true);
      this.setPhase('cards');
      this.settle();
    }
    if (this.phase !== 'cards') return;
    this.clearTimers();
    const from = this.flipped;
    let k = 0;
    for (let i = from; i < cur.cards.length; i++, k++) {
      const el = this.cards[i];
      this.mark(i, 'tease', false);
      el.style.transitionDelay = `${k * 55}ms`;
      (el.firstElementChild as HTMLElement | null)?.style.setProperty('transition-delay', `${k * 55 + 120}ms`);
      const idx = i;
      this.after(k * 55 + 260, () => this.flip(idx, true));
      el.classList.add('out');
    }
    if (k > 0) {
      this.sfx('reward');
      this.haptic('success');
    }
    this.after(k * 55 + 420, () => this.finish());
  }

  private finish(): void {
    if (!this.cur || this.phase === 'done' || this.phase === 'closing' || this.phase === 'off') return;
    this.cards.forEach((el, i) => {
      this.mark(i, 'tease', false);
      this.mark(i, 'shown', true);
      el.classList.add('out', 'flip');
    });
    this.flipped = this.cards.length;
    this.setPhase('done');
    this.skipBtn.hidden = true;
    const kids: Child[] = [];
    const more = this.another();
    kids.push(btn({ label: 'Collect', cls: 'big good grow cs-collect', data: { sfx: 'collect' }, onClick: () => this.close() }));
    if (more) {
      kids.push(
        btn({
          label: more.label,
          sub: more.sub,
          cls: 'big nova grow cs-another',
          onClick: () => {
            if (!more.run()) this.host.ctx.toast("Couldn't open another one right now", 'info', '📦');
          },
        }),
      );
    }
    this.actions.replaceChildren(...kids.filter((k): k is HTMLElement => !!k));
  }

  /** "Open another": one more of the same from the inventory, else bought again if the Nova is there. */
  private another(): { label: Child; sub?: Child; run: () => boolean } | null {
    const e = this.cur;
    if (!e) return null;
    const g = this.host.game;
    if (e.variant === 'crate') {
      const n = g.state.player.items[e.chest] ?? 0;
      return n > 0 ? { label: 'Open another', sub: `${n} left`, run: () => g.sys.player.useItem(e.chest) } : null;
    }
    const n = g.sys.chests.owned(e.chest);
    if (n > 0) return { label: 'Open another', sub: `${n} in your inventory`, run: () => g.sys.chests.open(e.chest) != null };
    const def = g.data.chest(e.chest);
    if (def && def.nova > 0 && g.sys.chests.canAfford(e.chest)) {
      return { label: 'Open another', sub: h('span', { class: 'cs-price' }, resIcon('nova', '💎'), bigNum(def.nova)), run: () => g.sys.chests.buy(e.chest) != null };
    }
    return null;
  }

  // ================================================================== cards

  private buildCards(cards: ChestCard[]): void {
    const data = this.host.game.data;
    const back = this.cur ? itemArt(this.cur.chest) : null;
    const backEmoji = this.cur ? (data.chest(this.cur.chest)?.icon ?? data.item(this.cur.chest)?.icon ?? '📦') : '📦';
    this.cards = cards.map((card, i) => {
      const f = cardFace(card, data);
      const inner = h('div', { class: 'cs-in' });
      inner.appendChild(h('div', { class: 'cs-rar' }, h('span', { text: RARITY_LABEL[card.rarity] })));
      const icons = f.dupe ? f.icons.slice(1) : f.icons;
      const ics = h('div', { class: 'cs-ics' + (icons.length > 1 ? ' multi' : '') });
      for (const ic of icons) ics.appendChild(h('div', { class: 'cs-ic' }, artOrEmoji(ic.art, ic.emoji, 'cs-ic-img', ''), ic.amount ? h('b', { class: 'num', text: ic.amount }) : null));
      if (f.dupe && f.icons[0]) ics.appendChild(h('div', { class: 'cs-was', title: f.sub }, artOrEmoji(f.icons[0].art, f.icons[0].emoji, 'cs-was-img', '')));
      inner.appendChild(ics);
      if (f.amount) inner.appendChild(h('div', { class: 'cs-amt num', text: f.amount }));
      inner.appendChild(h('div', { class: 'cs-nm', text: f.name }));
      if (f.equip) inner.appendChild(this.equipButton(f.equip));
      else if (f.sub) inner.appendChild(h('div', { class: 'cs-sb', text: f.sub }));
      const front = h('div', { class: 'cs-face cs-front' }, h('div', { class: 'cs-rim' }), inner, f.isNew ? h('div', { class: 'cs-new', text: 'New' }) : null, h('div', { class: 'cs-shine' }));
      const backFace = h('div', { class: 'cs-face cs-back' }, h('div', { class: 'cs-back-in' }, h('div', { class: 'cs-medal' }, artOrEmoji(back, backEmoji, 'cs-back-img', ''))));
      const el = h('div', { class: `cs-card r-${card.rarity} k-${card.kind}${f.dupe ? ' dupe' : ''}${f.isNew ? ' new' : ''}`, data: { i, card: card.kind } }, h('div', { class: 'cs-flip' }, front, backFace));
      el.style.setProperty('--tilt', `${((i * 37) % 7) - 3}deg`);
      return el;
    });
    this.cardLayer.replaceChildren(...this.cards);
    this.glows = cards.map((card) => h('div', { class: `cs-cglow r-${card.rarity}` }));
    this.glowLayer.replaceChildren(...this.glows);
  }

  /** A card's state class, on the card and on its light. */
  private mark(i: number, cls: 'tease' | 'shown', on: boolean): void {
    this.cards[i]?.classList.toggle(cls, on);
    this.glows[i]?.classList.toggle(cls, on);
  }

  private equipButton(id: string): HTMLElement {
    const lo = this.host.game.sys.liveops;
    const def = this.host.game.data.cosmetic(id);
    const worn = () => !!def && this.host.game.state.liveops.cosmetics.equipped[def.kind] === id;
    const b = h<HTMLButtonElement>('button', { class: 'cs-eq' + (worn() ? ' on' : ''), type: 'button', data: { sfx: 'ui_click' }, text: worn() ? 'Equipped' : 'Equip' });
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (worn()) return;
      if (lo.equipCosmetic(id)) {
        b.textContent = 'Equipped';
        b.classList.add('on');
        this.haptic('success');
        // only one per kind: another card of the same kind is no longer worn
        for (const other of this.cardLayer.querySelectorAll<HTMLButtonElement>('.cs-eq.on')) {
          if (other !== b && other.dataset.kind === def?.kind) {
            other.classList.remove('on');
            other.textContent = 'Equip';
          }
        }
      }
    });
    if (def) b.dataset.kind = def.kind;
    return b;
  }

  // ================================================================== layout

  private onResize = (): void => {
    safe('chest relayout', () => this.relayout());
  };

  private safeInsets(): { t: number; r: number; b: number; l: number } {
    const cs = getComputedStyle(this.probe);
    const px = (v: string) => parseFloat(v) || 0;
    return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  }

  private relayout(): void {
    const w = this.el.clientWidth || window.innerWidth;
    const hgt = this.el.clientHeight || window.innerHeight;
    const n = this.cur?.cards.length ?? 0;
    const L = sceneLayout({ w, h: hgt, safe: this.safeInsets(), cards: n, pedestal: this.pedestal, scale: this.scale });
    this.layout = L;
    const c = L.chest;
    Object.assign(this.chest.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
    this.hint.style.top = `${Math.round(c.y + c.h + 14)}px`;
    Object.assign(this.actions.style, { left: `${L.actions.x}px`, top: `${L.actions.y}px`, width: `${L.actions.w}px`, height: `${L.actions.h}px` });
    this.el.dataset.orient = L.landscape ? 'land' : 'port';
    const mx = L.mouthCards.x;
    const my = L.mouthCards.y;
    if (this.phase === 'cards' || this.phase === 'done') this.settle();
    this.cards.forEach((el, i) => {
      const r = L.cards[i];
      if (!r) return;
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      el.style.fontSize = `${Math.max(10, Math.round(r.w * 0.122))}px`;
      el.style.setProperty('--fx', `${Math.round(mx - (r.x + r.w / 2))}px`);
      el.style.setProperty('--fy', `${Math.round(my - (r.y + r.h / 2))}px`);
      const g = this.glows[i];
      if (g) {
        // the light reaches about a third of the card's width beyond it on every side
        const m = Math.round(r.w * 0.32);
        Object.assign(g.style, { left: `${r.x - m}px`, top: `${r.y - m}px`, width: `${r.w + 2 * m}px`, height: `${r.h + 2 * m}px` });
      }
    });
    this.fx.resize(w, hgt);
  }

  // ================================================================== helpers

  private async decode(srcs: (string | null)[]): Promise<void> {
    const imgs = srcs.filter((s): s is string => !!s);
    const wait = new Promise<void>((r) => window.setTimeout(r, 900));
    const all = Promise.all(
      imgs.map((src) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        return img.decode ? img.decode().catch(() => undefined) : Promise.resolve();
      }),
    ).then(() => undefined);
    await Promise.race([all, wait]);
  }

  private after(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      safe('chest scene', fn);
    }, ms);
    this.timers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
  }

  private sfx(id: string): void {
    this.host.game.bus.emit('sfx', { id });
  }

  private haptic(kind: 'tap' | 'success' | 'warning' | 'heavy'): void {
    this.host.ctx.haptic(kind);
  }
}

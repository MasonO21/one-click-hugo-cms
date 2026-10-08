/**
 * UI — DOM overlay (HUD, joystick, context button, build mode, panels, modals, toasts, floating
 * numbers, fly-to-HUD resource animations, tutorial guidance). Touch-first, vanilla TS + CSS.
 *
 * OWNER: ui agent. Public surface used by main.ts: `new UI(game, renderer)`, `init(root)`, `update(dt)`.
 *
 * Panels open on `bus.emit('ui:open', { panel, arg })`; see docs/ARCHITECTURE.md for names.
 */
import './styles/base.css';
import './styles/hud.css';
import './styles/panels.css';
// the painted skin restyles the shared components; the feature sheets after it keep their variants (a mission
// ready to claim, a selected slot…) on top of it
import './styles/skin.css';
import './styles/fx.css';
import './styles/build.css';
import './styles/screens.css';
import './styles/modals.css';
import './styles/art.css';
import './styles/expeditions.css';
import './styles/journal.css';
import './styles/wishes.css';
import './styles/photo.css';

import type { Game } from '../core/Game';
import type { RendererApi } from '../render/api';
import type { Reward } from '../data/schema';
import type { Selection } from '../core/view';
import { dateKey, fmt } from '../core/format';
import { clamp } from '../core/math';
import { bagEntries } from '../core/bag';
import type { BuildApi, HapticKind, ToastKind, UiCtx } from './ctx';
import { computeBadges, type Badges } from './logic/badges';
import { h, replay, safe, setClass } from './dom';
import { InputController } from './input/InputController';
import { Hud } from './hud/Hud';
import { BuildController } from './build/BuildController';
import { BuildBar } from './build/BuildBar';
import { PanelManager } from './panels/PanelManager';
import { Toasts } from './fx/Toasts';
import { FloatText } from './fx/FloatText';
import { FlyToHud } from './fx/FlyToHud';
import { SelectionTip } from './fx/SelectionTip';
import { Guide } from './guide/Guide';
import { ConsentPrompt } from './ConsentPrompt';
import { NotifyPrompt } from './NotifyPrompt';
import { Threats } from './hud/Threats';
import { alienArt, biomeArt, eventArt, itemArt, poiArt, preloadArt, professionArt, resourceArt, rewardArt, tierArt } from './art';
import { jobOf } from './logic/colonist';
import { itemToast, RARITY_COLOR } from './logic/rewards';
import { toastIconArt } from './logic/achievements';
import { isTierCelebration, tierUnlockGroups } from './logic/describe';

import { BuildMenuPanel } from './panels/BuildMenu';
import { BuildingPanel } from './panels/BuildingPanel';
import { ColonyPanel } from './panels/ColonyPanel';
import { ColonistsPanel } from './panels/ColonistsPanel';
import { RecruitPanel } from './panels/RecruitPanel';
import { ResearchPanel } from './panels/ResearchPanel';
import { CraftPanel } from './panels/CraftPanel';
import { InventoryPanel } from './panels/InventoryPanel';
import { VehiclesPanel } from './panels/VehiclesPanel';
import { MapPanel } from './panels/MapPanel';
import { MissionsPanel } from './panels/MissionsPanel';
import { ShopPanel } from './panels/ShopPanel';
import { SeasonPanel } from './panels/SeasonPanel';
import { DailyPanel } from './panels/DailyPanel';
import { SpinPanel } from './panels/SpinPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { WelcomePanel } from './panels/WelcomePanel';
import { VictoryPanel } from './panels/VictoryPanel';
import { MerchantPanel } from './panels/MerchantPanel';
import { CELEBRATE_READY_MAX, CELEBRATE_RESEARCH_MAX, CelebratePanel, RewardPanel, type CelebrateArg } from './panels/CelebratePanel';
import { MenuPanel } from './panels/MenuPanel';
import { ExpeditionsPanel } from './panels/ExpeditionsPanel';
import { JournalPanel } from './panels/JournalPanel';
import { backAction } from './logic/back';
import { autoDailyStep } from './logic/autoDaily';
import { wireHapticFx } from './fx/HapticFx';
import { SHOW_ME_SECONDS, wishGuideTarget } from './logic/wishes';
import { PhotoMode } from './photo/PhotoMode';

/** Minimum gap between production floats of the same resource. */
const PROD_FLOAT_GAP_MS = 1200;
const GATHER_FLOAT_GAP_MS = 300;
/** A tappable toast cleared by a modal within this long of showing comes back after it. */
const OPEN_TOAST_SEEN_MS = 4500;
/** Tier-up: how long the player watches the base transform before the celebration card opens. */
const TIER_REVEAL_MS = 1800;

export class UI {
  private root!: HTMLElement;
  private ui!: HTMLElement;
  private ctx!: UiCtx;
  private hud!: Hud;
  private input!: InputController;
  private build!: BuildController;
  private bar!: BuildBar;
  private panels!: PanelManager;
  private toasts!: Toasts;
  private floats!: FloatText;
  private fly!: FlyToHud;
  private tip!: SelectionTip;
  private guide!: Guide;
  private consent!: ConsentPrompt;
  private notifyPrompt!: NotifyPrompt;
  private threats!: Threats;
  private photo!: PhotoMode;
  private fpsBox: HTMLElement | null = null;
  private stickHint!: HTMLElement;

  private badgesCache: Badges = { missions: 0, research: 0, daily: false, spin: false, crate: false, season: 0, colonists: 0, expeditions: 0, journal: 0 };
  private accSlow = 0;
  private accFps = 0;
  private lastClick = { x: 0, y: 0, t: -1e9 };
  private lastPanelSfx = 0;
  private lastTierCelebrate = -1e9;
  /** The tier-up card is on its way (the base transforms for TIER_REVEAL_MS first). */
  private tierRevealPending = false;
  /** Celebrations that arrived during the reveal: they open right after the tier card (behind it in the queue). */
  private afterReveal: (() => void)[] = [];
  private lastJoined: { id: number; t: number } = { id: -1, t: -1e9 };
  /** Aliens defeated in the current invasion by AlienDef.model (shown small on the victory card). */
  private waveKills = new Map<string, { n: number; boss: boolean }>();
  private lastAdFail = -1e9;
  private lastInsufficient = -1e9;
  private welcomeShown = false;
  /** Local day the automatic gift popup last opened (autoDaily). */
  private autoDailyDay = '';
  private lastProdFloat = new Map<string, number>();
  private lastGatherFloat = new Map<string, number>();
  private modalWasOpen = false;
  private toastInset = '';
  /** `keep`: raised by a tier-up during the base reveal; shown once its card closes however long it was read. */
  private deferredToasts: { text: string; kind: ToastKind; icon?: string; open?: string; at: number; keep?: boolean }[] = [];
  /** Tappable toasts shown a moment ago (a modal opening clears the toast layer: they are re-queued, see onPanelsChanged). */
  private openToasts: { text: string; kind: ToastKind; icon?: string; open: string; at: number }[] = [];
  /** A wish's "Show me" the guide arrow follows (seconds on performance.now()). */
  private wishPin: { id: number; until: number } | null = null;
  /**
   * Colony tier the UI has announced (or loaded at). The sim's own tier-up listeners (new side missions, regions,
   * research) run before the UI's, so a higher tier in the state means a tier-up is being announced right now.
   */
  private seenTier = 0;

  constructor(
    private readonly game: Game,
    private readonly renderer: RendererApi,
  ) {}

  // ================================================================== init

  init(root: HTMLElement): void {
    this.ui = root;
    const el = h('div', { class: 'nv-root', data: { mode: 'play', hand: 'right', panelOpen: '0' } });
    root.appendChild(el);
    this.root = el;
    this.applyScale();
    window.addEventListener('resize', () => this.applyScale());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.applyScale(), 120));

    // ---- context for panels
    const ui = this;
    const ctx: UiCtx = {
      game: this.game,
      renderer: this.renderer,
      data: this.game.data,
      root: el,
      get build(): BuildApi {
        return ui.build;
      },
      open: (panel, arg) => this.open(panel, arg),
      close: (panel) => this.panels.close(panel),
      isOpen: (panel) => this.panels.isOpen(panel),
      toast: (text, kind, icon) => this.toasts.show(text, kind, icon),
      sfx: (id) => this.sfx(id),
      haptic: (k) => this.haptic(k),
      watchAd: (p, c) => this.watchAd(p, c),
      showReward: (title, reward, icon) => this.open('reward', { title, reward, icon }),
      badges: () => this.badgesCache,
    };
    this.ctx = ctx;

    // ---- layers (bottom -> top)
    const inputLayer = h('div', { class: 'nv-input' });
    const stick = h('div', { class: 'stick' }, h('div', { class: 'knob' }));
    this.stickHint = h('div', { class: 'stick-hint' });
    const world = h('div', { class: 'nv-world' });
    this.floats = new FloatText(world, this.renderer);
    this.tip = new SelectionTip(this.renderer);
    this.guide = new Guide(ctx);
    this.guide.override = () => {
      const t = wishGuideTarget(this.game, this.wishPin, performance.now() / 1000);
      if (!t && this.wishPin) this.wishPin = null; // done, lapsed or timed out: back to the tutorial's guidance
      return t;
    };
    this.threats = new Threats(ctx);
    world.append(this.tip.el, this.guide.layer, this.threats.layer);

    this.hud = new Hud(ctx);
    this.build = new BuildController(ctx);
    this.bar = new BuildBar(ctx, this.build);
    this.toasts = new Toasts();
    this.fly = new FlyToHud({
      rect: (k) => this.hud.targetRect(k),
      hold: (id, n) => this.hud.resources.hold(id, n),
      release: (id, n) => this.hud.resources.release(id, n),
      land: (id) => {
        if (id === 'nova') this.hud.popNova();
        else this.hud.resources.pop(id);
      },
    });

    const panelLayer = h('div', { class: 'nv-panels' });
    const modalLayer = h('div', { class: 'nv-modals' });
    this.panels = new PanelManager(ctx, panelLayer, modalLayer, () => this.onPanelsChanged());
    this.registerPanels();

    // Photo Mode (Menu › Photo): its own full-screen layer over everything; the rest is hidden while it is up
    this.photo = new PhotoMode({
      game: this.game,
      renderer: this.renderer,
      haptic: (k) => this.haptic(k),
      sfx: (id) => this.sfx(id),
      onActive: (on) => this.onPhotoMode(on),
      onCovering: (on) => {
        this.game.view.panelOpen = on || this.panels.anyCovering();
      },
    });

    el.append(inputLayer, stick, this.stickHint, world, this.hud.el, this.bar.el, this.bar.canvas, this.toasts.el, panelLayer, modalLayer, this.fly.el, this.guide.ringLayer, this.photo.el);

    this.input = new InputController(this.game, inputLayer, stick, stick.firstElementChild as HTMLElement, {
      onTap: (x, y) => this.onWorldTap(x, y),
      build: this.build.pointer,
      shortcut: (e) => this.shortcut(e),
      moved: () => this.stickHint.classList.add('gone'),
    });

    this.consent = new ConsentPrompt(ctx, el, () => this.screenBusy());
    // notifications card (iOS / Android): after the first tier-up or Welcome Back, never over the consent card
    this.notifyPrompt = new NotifyPrompt(ctx, el, () => this.screenBusy() || this.consent.shown);

    this.seenTier = this.game.state.colony.tier;
    this.installGlobalHandlers();
    this.subscribe();
    this.game.sys.tutorial.setFlag('buildPanelOpen', false); // a save made with the drawer open
    this.syncSettings();
    this.refreshBadges();

    // offline summary may already be waiting (game.start() ran before init in tests)
    if (this.game.pendingOffline) this.showWelcome();
    if (this.game.fresh && this.game.state.playTime < 1) this.crashIntro();

    if (import.meta.env.DEV && /[?&]uidev\b/.test(location.search)) {
      void import('./dev/preview').then((m) => m.installPreview(this, this.game, this.ctx));
    }
  }

  /**
   * Brand-new colony: the camera swoops down onto the smoking pod, then one card sets the scene
   * ("Vulnerable Survivor" — spec §33 0-2 min: crash landing, exit the pod, gather wood).
   */
  private crashIntro(): void {
    const cam = this.game.view.camera;
    const zoom = cam.zoom;
    cam.zoom = Math.min(1, zoom + 0.45);
    window.setTimeout(() => {
      if (cam.zoom > zoom) cam.zoom = zoom;
    }, 500);
    window.setTimeout(() => {
      this.panels.open('celebrate', {
        title: 'Crash Landing!',
        text: 'Your escape pod came down on a beautiful alien world. Chop some wood, build a shelter — and make this place home.',
        icon: '🛸',
        quiet: true,
        ok: "Let's go!",
      } satisfies CelebrateArg);
    }, 2400);
  }

  /** Dev/test access. */
  get context(): UiCtx {
    return this.ctx;
  }
  get buildController(): BuildController {
    return this.build;
  }
  get hudRef(): Hud {
    return this.hud;
  }

  private registerPanels(): void {
    const reg = (name: string, f: (c: UiCtx) => import('./panels/Panel').Panel) => this.panels.register(name, f);
    reg('build', (c) => new BuildMenuPanel(c));
    reg('building', (c) => new BuildingPanel(c));
    reg('colony', (c) => new ColonyPanel(c));
    reg('colonists', (c) => new ColonistsPanel(c));
    reg('recruit', (c) => new RecruitPanel(c));
    reg('research', (c) => new ResearchPanel(c));
    reg('craft', (c) => new CraftPanel(c));
    reg('inventory', (c) => new InventoryPanel(c));
    reg('vehicles', (c) => new VehiclesPanel(c));
    reg('map', (c) => new MapPanel(c));
    reg('missions', (c) => new MissionsPanel(c));
    reg('shop', (c) => new ShopPanel(c));
    reg('season', (c) => new SeasonPanel(c));
    reg('daily', (c) => new DailyPanel(c));
    reg('spin', (c) => new SpinPanel(c));
    reg('settings', (c) => new SettingsPanel(c));
    reg('welcome', (c) => new WelcomePanel(c));
    reg('victory', (c) => new VictoryPanel(c));
    reg('merchant', (c) => new MerchantPanel(c));
    reg('celebrate', (c) => new CelebratePanel(c));
    reg('reward', (c) => new RewardPanel(c));
    reg('menu', (c) => new MenuPanel(c));
    reg('expeditions', (c) => new ExpeditionsPanel(c));
    reg('journal', (c) => new JournalPanel(c));
  }

  // ================================================================== services

  private applyScale(): void {
    const short = Math.min(window.innerWidth, window.innerHeight);
    const s = clamp(short / 390, 0.9, 1.25);
    this.root.style.setProperty('--s', s.toFixed(3));
  }

  private sfx(id: string): void {
    if (id === 'ui_open' || id === 'ui_close') this.lastPanelSfx = performance.now();
    this.game.bus.emit('sfx', { id });
  }

  private haptic(kind: HapticKind): void {
    if (!this.game.state.settings.haptics) return;
    const hp = this.game.services.haptics;
    safe('haptic', () => hp[kind]());
  }

  /** Rewarded ad with friendly feedback. */
  private async watchAd(placement: string, context?: unknown): Promise<boolean> {
    const lo = this.game.sys.liveops;
    const t0 = this.lastAdFail;
    if (!lo.canWatchAd(placement)) {
      this.toasts.show("That video isn't ready yet — try again in a little while!", 'info', '⏳');
      return false;
    }
    let ok = false;
    try {
      ok = await lo.watchAd(placement, context);
    } catch (e) {
      console.warn('[ui] ad failed', e);
    }
    if (!ok && this.lastAdFail === t0) this.toasts.show('No video available right now — please try again soon!', 'info', '📺');
    return ok;
  }

  private open(panel: string, arg?: unknown): void {
    // not a panel: a full-screen mode of its own
    if (panel === 'photo') {
      this.startPhoto();
      return;
    }
    if (panel === 'building') {
      const id = Number(arg);
      const b = this.game.sys.buildings.get(id);
      const def = b ? this.game.data.building(b.def) : undefined;
      if (!b) return;
      if (def?.core) {
        this.open('colony');
        return;
      }
    }
    if (panel === 'build' && this.build.active && this.build.mode === 'select') this.build.cancelSelect();
    this.panels.open(panel, arg);
  }

  /**
   * Toasts from the simulation wait while a modal (celebration, reward, victory…) is up so they never
   * cover it; they follow once it closes. Warnings and errors always show at once.
   */
  private simToast(text: string, kind: ToastKind, icon?: string, open?: string): void {
    const reveal = this.revealing();
    if ((kind === 'info' || kind === 'success' || kind === 'reward') && (reveal || this.panels?.anyModal())) {
      this.deferredToasts = this.deferredToasts.filter((d) => d.text !== text);
      this.deferredToasts.push({ text, kind, icon, open, at: performance.now(), keep: reveal });
      if (this.deferredToasts.length > 6) this.deferredToasts.shift();
      return;
    }
    this.showToast(text, kind, icon, open);
  }

  private showToast(text: string, kind: ToastKind | undefined, icon: string | undefined, open: string | undefined): void {
    if (open) {
      this.openToasts = [...this.openToasts.filter((t) => t.text !== text), { text, kind: kind ?? 'info', icon, open, at: performance.now() }].slice(-3);
    }
    this.toasts.show(text, kind, icon, this.tapOpen(open));
  }

  /** A toast that opens a panel when tapped (the Journal for an achievement), or nothing. */
  private tapOpen(panel: string | undefined): (() => void) | undefined {
    return panel ? () => this.open(panel) : undefined;
  }

  /**
   * The login-gift popup must not yank away whatever the player opened in the first seconds of a
   * session (build menu, an inspector, a placement): wait until the screen is free, else skip it
   * (the HUD's Daily chip stays).
   */
  private autoDaily(tries: number): void {
    const today = dateKey(this.game.now());
    const step = autoDailyStep({ available: this.game.sys.liveops.dailyAvailable(), open: this.panels.isOpen('daily'), busy: this.screenBusy(), shownDay: this.autoDailyDay, today });
    if (step === 'skip') return;
    if (step === 'wait') {
      if (tries < 20) window.setTimeout(() => this.autoDaily(tries + 1), 3000);
      return;
    }
    this.autoDailyDay = today; // once a day: the launch popup and a tapped gift reminder must not both open it
    this.open('daily');
  }

  /** The player has something open (any panel or drawer, a placement, build mode, Photo Mode): popups should wait. */
  private screenBusy(): boolean {
    return this.panels.anyOpen() || this.build.active || this.game.view.mode !== 'play' || this.photo.active;
  }

  /** Menu › Photo: leave whatever was open (menu drawer, build mode, a selection) and take the camera. */
  private startPhoto(): void {
    if (this.photo.active || !this.photo.available) return;
    this.panels.closeSheets();
    if (this.build.active) this.build.cancel();
    const sel = this.game.view.selection;
    sel.kind = null;
    sel.id = null;
    this.tip.hide();
    this.photo.enter();
  }

  /**
   * Photo Mode started / ended: everything but its layer is hidden (styles/photo.css, `data-photo`), the joystick and
   * any held keys are released. Panels or cards that open meanwhile (a tier-up, Welcome Back) wait underneath.
   */
  private onPhotoMode(on: boolean): void {
    if (on) this.root.dataset.photo = '1';
    else delete this.root.dataset.photo;
    this.input.reset();
    if (!on) this.onPanelsChanged();
  }

  private flushToasts(): void {
    if (!this.deferredToasts.length || this.panels.anyModal() || this.revealing()) return;
    const now = performance.now();
    // a toast that opens a panel ("12 achievements already earned!") is worth waiting for through a stack of cards
    const list = this.deferredToasts.filter((d) => d.keep || now - d.at < (d.open ? 90000 : 12000)).slice(-3);
    this.deferredToasts = [];
    list.forEach((d, i) => window.setTimeout(() => this.simToast(d.text, d.kind, d.icon, d.open), 300 + i * 200));
  }

  private onPanelsChanged(): void {
    this.flushToasts();
    const covering = this.panels.anyCovering();
    this.game.view.panelOpen = covering;
    // a modal (reward card, celebration, chest) opening replaces whatever toasts were saying a moment ago
    const modal = this.panels.anyModal();
    if (modal && !this.modalWasOpen) {
      this.toasts.clear();
      // ...but a toast that opens the Journal ("12 achievements already earned!") that was cleared before it could be
      // read comes back once the card closes
      const now = performance.now();
      for (const t of this.openToasts) if (now - t.at < OPEN_TOAST_SEEN_MS) this.deferredToasts.push({ ...t, at: now });
      this.openToasts = [];
    }
    this.modalWasOpen = modal;
    // the tutorial points at the build card (not the Build button) while the build drawer is open
    const tut = this.game.sys.tutorial;
    const buildOpen = this.panels.isOpen('build');
    if (tut.flag('buildPanelOpen') !== buildOpen) tut.setFlag('buildPanelOpen', buildOpen);
    tut.notifyPanel(this.panels.topName());
    this.root.dataset.panelOpen = covering ? '1' : '0';
    this.syncToastInset();
    if (covering || this.panels.anyOpen()) this.input.reset();
  }

  /**
   * Publish where the open sheet's header ends (`--panel-head-b`) so toasts sit just below it rather than over the
   * title (CSS: `.nv-root[data-panel-open] .nv-toasts`). Re-checked a few times a second: a header can grow a row.
   */
  private syncToastInset(): void {
    const b = this.panels?.headerBottom() ?? null;
    const v = b == null ? '' : `${Math.round(b)}px`;
    if (v === this.toastInset) return;
    this.toastInset = v;
    if (v) this.root.style.setProperty('--panel-head-b', v);
    else this.root.style.removeProperty('--panel-head-b');
  }

  /**
   * A toast caused by a game event (not by the player's tap). While a modal (celebration, chest, welcome
   * back) is up it waits instead of covering the card's title; 'reward' toasts duplicate the reward card
   * that is showing and are dropped. Toasts right after a tap still show at once (e.g. "no video").
   */
  /** Game-event toast: shown at once right after the player's own tap, otherwise held while a modal is up. */
  private eventToast(text: string, kind?: ToastKind, icon?: string, open?: string): void {
    if (performance.now() - this.lastClick.t < 1500 && !this.revealing()) this.showToast(text, kind, icon, open);
    else this.simToast(text, kind ?? 'info', icon, open);
  }

  /**
   * A tier-up is being shown: the base transforms, then its card opens. What it unlocked ("3 new side missions are
   * ready", a region opening) waits for the card to close instead of flashing for a second and being wiped by it.
   */
  private revealing(): boolean {
    return this.tierRevealPending || this.game.state.colony.tier > this.seenTier;
  }

  private showWelcome(): void {
    const p = this.game.pendingOffline;
    if (!p || this.welcomeShown) return;
    this.welcomeShown = true;
    this.panels.open('welcome', { seconds: p.seconds, gains: p.gains, rp: p.rp });
  }

  // ================================================================== events

  private subscribe(): void {
    const bus = this.game.bus;
    const g = this.game;
    // game-event toasts wait while a modal (celebration, chest, welcome back) is up instead of covering
    // its title; toasts from the player's own taps (ctx.toast) still show at once
    bus.on('ui:toast', (e) => {
      // the attack banner already shows the warning / countdown / "defend!" state: the combat system's
      // matching 👾 toasts would only cover the player and the turret
      if (e.icon === '👾' && g.state.combat.phase !== 'peace') return;
      const rich = this.artToast(e.text, e.icon);
      this.eventToast(rich.text, e.kind, rich.icon, e.open);
    });
    bus.on('ui:float', (e) => this.floats.spawn(e.text, e.x, e.z, e.color, e.big));
    wireHapticFx(bus, (k) => this.haptic(k));
    bus.on('ui:open', (e) => {
      if (e.panel === 'daily' && (e.arg as { auto?: boolean } | undefined)?.auto) this.autoDaily(0);
      else this.open(e.panel, e.arg);
    });
    bus.on('ui:celebrate', (e) => {
      const now = performance.now();
      if (now - this.lastTierCelebrate < TIER_REVEAL_MS + 2500 && isTierCelebration(e.title, e.text)) return; // tier-up already celebrated
      if (e.title === 'Thank you!' && this.panels.isOpen('shop')) return; // the shop shows its own "what you got" reward
      const open = () => this.panels.open('celebrate', { title: e.title, text: e.text, icon: e.icon, ...this.celebrateArt(e.title) } satisfies CelebrateArg);
      // news that arrives while the base transforms ("The Frontier is open!" at Titanium) follows the tier card
      if (this.tierRevealPending) this.afterReveal.push(open);
      else open();
    });
    bus.on('colonist:recruited', (e) => {
      this.lastJoined = { id: e.id, t: performance.now() };
    });
    // colonist wishes (sim/wishes.ts): "Show me" pins the guide arrow; a granted wish buzzes happily
    bus.on('ui:wishGuide', (e) => {
      this.wishPin = { id: e.id, until: performance.now() / 1000 + SHOW_ME_SECONDS };
      this.guide.poll();
    });
    bus.on('wish:granted', (e) => {
      this.haptic('success');
      if (this.wishPin?.id === e.id) this.wishPin = null;
    });
    bus.on('wish:expired', (e) => {
      if (this.wishPin?.id === e.id) this.wishPin = null;
    });
    bus.on('colony:tierUp', (e) => {
      const now = performance.now();
      this.lastTierCelebrate = now;
      this.seenTier = Math.max(this.seenTier, e.tier);
      const t = g.data.tier(e.tier);
      // everything the tier opens: what can be built at once first, then what still needs research
      const { ready, research } = tierUnlockGroups(g.data, e.tier, g.state.research.completed);
      // let the player watch the base transform first: close the colony sheet, frame the core and show the
      // colony boundary growing, then celebrate
      this.panels.closeSheets();
      // decode the pictures while the base transforms
      preloadArt([tierArt(e.tier), ...ready.slice(0, CELEBRATE_READY_MAX).map((u) => u.art), ...research.slice(0, CELEBRATE_RESEARCH_MAX).map((u) => u.art)]);
      const core = g.sys.buildings.core();
      if (core) {
        const c = g.sys.buildings.center(core);
        this.renderer.focus(c.x, c.z);
      }
      const view = g.view;
      if (view.mode !== 'build') {
        view.showGrid = true;
        window.setTimeout(() => {
          if (view.mode !== 'build') view.showGrid = false;
        }, TIER_REVEAL_MS + 1600);
      }
      this.tierRevealPending = true;
      window.setTimeout(() => {
        this.tierRevealPending = false;
        this.panels.open('celebrate', {
          title: e.tier >= 6 ? 'TITANIUM COLONY!' : `${t.name} Tier Reached!`,
          text: e.tier >= 6 ? 'You built a gleaming super-colony. What an incredible journey!' : t.description,
          icon: e.tier >= 6 ? '🌟' : '🏰',
          tier: e.tier,
          unlocks: ready,
          researchUnlocks: research,
          big: true,
          art: tierArt(e.tier),
          artKind: 'tier',
        } satisfies CelebrateArg);
        for (const open of this.afterReveal.splice(0)) open(); // queued behind the tier card
      }, TIER_REVEAL_MS);
    });

    bus.on('game:ready', () => {
      if (g.pendingOffline) this.showWelcome();
      this.refreshBadges();
    });
    bus.on('offline:ready', () => this.showWelcome());
    bus.on('offline:claimed', () => {
      this.panels.close('welcome');
      this.welcomeShown = false; // a later summary (new session) may show it again
    });
    bus.on('combat:started', () => {
      this.waveKills.clear();
      // a raid begins while the player is framing a photo: back to the game (the HUD's attack banner takes over);
      // a photo already in the preview stays until the player is done with it
      if (this.photo.currentPhase === 'framing') this.photo.exit();
    });
    bus.on('alien:killed', (e) => {
      const d = g.data.alien(e.def);
      const k = d?.model ?? e.def;
      const cur = this.waveKills.get(k) ?? { n: 0, boss: false };
      cur.n++;
      if (d?.boss) cur.boss = true;
      this.waveKills.set(k, cur);
    });
    bus.on('combat:ended', (e) => {
      const defeated = [...this.waveKills.entries()].map(([model, v]) => ({ model, n: v.n, boss: v.boss })).sort((a, b) => Number(b.boss) - Number(a.boss) || b.n - a.n);
      this.panels.open('victory', { wave: e.wave, kills: e.kills, reward: e.reward, defeated });
    });
    bus.on('combat:rewardClaimed', () => this.panels.close('victory'));

    // flying resources + HUD pops
    bus.on('resource:gained', (e) => {
      this.hud.resources.gained(e.id, e.amount, e.source);
      if (e.source === 'production') {
        // colonists / machines visibly produce: a small "+1 🪵" over the producing building (throttled)
        if (e.x == null || e.z == null) return;
        const now = performance.now();
        if (now - (this.lastProdFloat.get(e.id) ?? -1e9) < PROD_FLOAT_GAP_MS) return;
        this.lastProdFloat.set(e.id, now);
        const def = g.data.resource(e.id);
        this.floats.spawn(`+${fmt(e.amount)} ${def?.icon ?? ''}`, e.x, e.z, '#c8ffb0');
        return;
      }
      if (e.source === 'offline') return;
      // "+3 🪵" pops where it was gathered (alien drops too), next to the icons flying to the HUD
      if ((e.source === 'gather' || e.source === 'drop') && e.x != null && e.z != null) {
        const now = performance.now();
        if (now - (this.lastGatherFloat.get(e.id) ?? -1e9) >= GATHER_FLOAT_GAP_MS) {
          this.lastGatherFloat.set(e.id, now);
          this.floats.spawn(`+${fmt(e.amount)} ${g.data.resource(e.id)?.icon ?? ''}`, e.x, e.z, '#fff6d8');
        }
      }
      let origin: { x: number; y: number } | null = null;
      if (e.x != null && e.z != null) {
        const p = this.renderer.worldToScreen(e.x, 1.2, e.z);
        if (p.visible) origin = p;
      } else if (performance.now() - this.lastClick.t < 900) origin = this.lastClick;
      if (!origin) return;
      this.hud.resources.poll();
      const def = g.data.resource(e.id);
      if (def) this.fly.add(e.id, def.icon, e.amount, origin.x, origin.y);
    });
    bus.on('nova:changed', (e) => {
      if (e.delta <= 0) return;
      if (performance.now() - this.lastClick.t < 900) this.fly.add('nova', '💎', e.delta, this.lastClick.x, this.lastClick.y);
      else this.hud.popNova();
    });
    // every crate (free, ad, inventory) opens a "what you got" reward card; inventory crates show their own art
    bus.on('reward:granted', (e) => {
      if (e.source !== 'crate') return;
      const d = e.item && e.item !== 'supply_crate' ? g.data.item(e.item) : undefined;
      if (d) this.open('reward', { title: `${d.name}!`, reward: e.reward, icon: itemArt(d.id) ?? d.icon });
      else this.open('reward', { title: 'Supply crate!', reward: e.reward, icon: rewardArt('supply_crate') ?? '📦' });
    });
    bus.on('reward:granted', (e) => {
      // resources/nova granted from a button press fly out of that button (resource:gained covers resources)
      if (e.reward.rp && performance.now() - this.lastClick.t < 900) this.fly.add('rp', '🔬', e.reward.rp, this.lastClick.x, this.lastClick.y);
    });

    // friendly feedback for sim messages
    bus.on('resource:insufficient', (e) => {
      const now = performance.now();
      if (now - this.lastInsufficient < 1500) return;
      this.lastInsufficient = now;
      const first = bagEntries(e.missing)[0];
      if (!first) return;
      const d = g.data.resource(first[0]);
      this.toasts.show(`Need ${fmt(Math.ceil(first[1]))} more ${d?.name ?? first[0]}`, 'warning', resourceArt(first[0]) ?? d?.icon ?? '📦');
    });
    bus.on('player:backpackFull', () => this.toasts.show('Backpack full! Walk back to the colony to unload.', 'warning', '🎒'));
    // the sim already explains an unavailable video; a skipped one needs no scolding toast at all
    bus.on('ad:failed', () => {
      this.lastAdFail = performance.now();
    });
    // a purchase is thanked by the sim's celebration; real failures are explained by the sim's own toast
    bus.on('iap:failed', (e) => {
      if (e.reason === 'cancelled') this.toasts.show('Purchase cancelled — no worries!', 'info', '🛍️');
      else if (e.reason === 'unknown_product') this.toasts.show("That item isn't available right now", 'info', '🛍️');
    });
    // (no toast on 'season:levelUp': the sim already announces a level-up with "Season level N! New rewards are
    // waiting", once per jump even when one gain crosses several levels)
    bus.on('building:changed', () => this.refreshBadges());
  }

  /** Illustration for a celebration, recognised from its title (the sim only sends text + an emoji). */
  private celebrateArt(title: string): Partial<CelebrateArg> {
    const g = this.game;
    const biome = g.data.biomes.find((b) => title === `${b.name} discovered!`);
    if (biome && biomeArt(biome.id)) return { art: biomeArt(biome.id), artKind: 'biome', ok: 'Explore!' };
    const ev = g.data.worldEvents.find((d) => title === `${d.name} awakened!`);
    if (ev && eventArt(ev.kind)) return { art: eventArt(ev.kind), artKind: 'event' };
    // "Your first colonist joined!" right after a colonist arrived: show who it was
    if (/joined/i.test(title) && performance.now() - this.lastJoined.t < 4000) {
      const c = g.sys.colonists.get(this.lastJoined.id);
      const src = c ? professionArt(jobOf(g, c)) : null;
      if (c && src) return { art: src, artKind: 'colonist', ring: RARITY_COLOR[c.rarity] };
    }
    return {};
  }

  /** Toast text + icon with illustration: a colonist joining shows their portrait, world events and items their art. */
  private artToast(text: string, icon?: string): { text: string; icon?: string } {
    const g = this.game;
    // achievement toasts: the painted medal / journal instead of the emoji
    const medal = toastIconArt(icon);
    if (medal) return { text, icon: medal };
    const m = /^(.+?) joined (?:the|your) colony!$/.exec(text);
    if (m) {
      const c = g.state.colonists.list.find((x) => x.name === m[1]);
      const src = c ? professionArt(jobOf(g, c)) : null;
      if (src) return { text, icon: src };
    }
    for (const d of g.data.worldEvents) {
      const lead = `${d.icon} ${d.name}`;
      const src = eventArt(d.kind);
      if (src && text.startsWith(lead)) return { text: text.slice(d.icon.length + 1), icon: src };
    }
    // "Mira has a wish: Berry pie day": her portrait
    const wish = /^(.+?) has a wish: /.exec(text);
    if (wish) {
      const c = g.state.colonists.list.find((x) => x.name.split(' ')[0] === wish[1] && g.sys.wishes.of(x.id));
      const src = c ? professionArt(jobOf(g, c)) : null;
      if (src) return { text, icon: src };
    }
    // "🧭 Your squad is back from Wreck Salvage! …": the destination's painted icon
    const back = /back from (.+?)! Collect/.exec(text);
    if (back) {
      const def = g.data.expeditions.find((d) => d.name === back[1]);
      const src = def ? poiArt(def.poi) : null;
      if (src) return { text: text.replace(/^🧭 /, ''), icon: src };
    }
    for (const d of g.data.pois) {
      const lead = `${d.icon} ${d.name}`;
      const src = poiArt(d.id);
      if (src && text.startsWith(lead)) return { text: text.slice(d.icon.length + 1), icon: src };
    }
    return itemToast(text, g.data) ?? { text, icon };
  }

  private installGlobalHandlers(): void {
    // Disabled buttons explain themselves; every other button gets click feedback.
    this.root.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null;
        if (!target) return;
        const disabled = target.closest('[aria-disabled="true"]') as HTMLElement | null;
        if (disabled && this.root.contains(disabled)) {
          e.stopPropagation();
          e.preventDefault();
          this.sfx('ui_error');
          replay(disabled, 'shake');
          const why = disabled.getAttribute('data-why');
          if (why) this.toasts.show(why, 'info', '💡');
          return;
        }
        const b = target.closest('button, [role="button"], .tab, .tap') as HTMLElement | null;
        if (b) {
          const r = b.getBoundingClientRect();
          this.lastClick = { x: r.left + r.width / 2, y: r.top + r.height / 2, t: performance.now() };
          const sfx = b.getAttribute('data-sfx') ?? 'ui_click';
          const stamp = this.lastPanelSfx;
          // data-haptic="none": the control buzzes itself (the action button already did on touch-down)
          if (b.getAttribute('data-haptic') !== 'none') this.haptic('tap');
          if (sfx !== 'none') {
            // panels play their own open/close sound — only add a click if none played
            window.setTimeout(() => {
              if (this.lastPanelSfx === stamp) this.game.bus.emit('sfx', { id: sfx });
            }, 0);
          }
        }
      },
      true,
    );
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ================================================================== world taps & shortcuts

  private onWorldTap(x: number, y: number): void {
    const g = this.game;
    const sel: Selection | null = this.renderer.pick(x, y);
    const view = g.view;
    // tapping the world dismisses the (non-blocking) build menu / main menu drawers
    if (this.panels.isOpen('build')) this.panels.close('build');
    if (this.panels.isOpen('menu')) this.panels.close('menu');
    if (!sel || sel.kind == null) {
      view.selection.kind = null;
      view.selection.id = null;
      this.tip.hide();
      if (this.panels.isOpen('building')) this.panels.close('building');
      return;
    }
    view.selection.kind = sel.kind;
    view.selection.id = sel.id;
    switch (sel.kind) {
      case 'building':
        this.tip.hide();
        this.open('building', sel.id);
        break;
      case 'colonist':
        this.tip.hide();
        this.open('colonists', { id: Number(sel.id) });
        break;
      case 'event': {
        const ev = g.state.world.events.find((e) => e.id === Number(sel.id));
        const def = ev ? g.data.worldEvent(ev.def) : undefined;
        if (ev && def?.kind === 'merchant') this.open('merchant', ev.id);
        else if (ev && def) this.tip.show(eventArt(def.kind) ?? def.icon, def.name, 'Walk up to it to take part!', ev.x, ev.z);
        break;
      }
      case 'poi': {
        const p = g.sys.world.gen?.pois.find((q) => q.id === sel.id);
        const def = p ? g.data.poi(p.def) : undefined;
        if (p && def) this.tip.show(poiArt(def.id) ?? def.icon, def.name, def.description, p.x, p.z);
        break;
      }
      case 'node': {
        const n = g.sys.world.gen?.nodes[Number(sel.id)];
        const def = n ? g.data.node(n.def) : undefined;
        if (n && def) this.tip.show('🌿', def.name, 'Walk up close and tap the action button.', n.x, n.z);
        break;
      }
      case 'alien': {
        const a = g.state.combat.aliens.find((q) => q.id === Number(sel.id));
        const def = a ? g.data.alien(a.def) : undefined;
        if (a && def) this.tip.show(alienArt(def.model) ?? '👾', def.name, `${Math.ceil(a.hp)} / ${Math.ceil(a.maxHp)} HP`, a.x, a.z);
        break;
      }
    }
  }

  private shortcut(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    // Photo Mode keeps every key (no panel may open under it, nobody walks off); Escape steps back
    if (this.photo.active) {
      if (e.code === 'Escape') this.back();
      return true;
    }
    const toggle = (p: string) => (this.panels.isOpen(p) ? this.panels.close(p) : this.open(p));
    switch (e.code) {
      case 'KeyB':
        toggle('build');
        return true;
      case 'KeyC':
        toggle('colonists');
        return true;
      case 'KeyT':
        toggle('research');
        return true;
      case 'KeyX':
        toggle('craft');
        return true;
      case 'KeyM':
        toggle('map');
        return true;
      case 'KeyJ':
        toggle('missions');
        return true;
      case 'KeyI':
        toggle('inventory');
        return true;
      case 'KeyK':
        toggle('shop');
        return true;
      case 'Escape':
        this.back();
        return true;
      case 'Enter':
        if (this.build.active && this.build.mode === 'place') {
          this.build.confirm();
          return true;
        }
        return false;
      case 'KeyR':
        if (this.build.active && this.build.mode === 'place') {
          this.build.rotate();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Back (Android back button / gesture, Escape): close the top panel, else leave build mode, else clear the
   * selection. Returns false when there was nothing to undo, so the platform can send the app to the background.
   */
  back(): boolean {
    const sel = this.game.view.selection;
    const action = backAction({
      photoMode: this.photo.active,
      panelOpen: this.panels.anyOpen(),
      // a queued card about to follow the one closing, or the tier-up card after the reveal: stay in the game
      modalPending: this.panels.anyModal() || this.tierRevealPending,
      cardShown: this.consent.visible || this.notifyPrompt.visible,
      buildActive: this.build.active,
      hasSelection: sel.kind !== null,
    });
    switch (action) {
      case 'photo':
        return this.photo.back(); // the preview closes first, then Photo Mode ends
      case 'panel':
        this.panels.close(); // a modal that can't be dismissed stays (with what is under it), but swallows the press
        return true;
      case 'build':
        this.build.cancel();
        return true;
      case 'card':
        return this.consent.dismiss() || this.notifyPrompt.dismiss();
      case 'selection':
        sel.kind = null;
        sel.id = null;
        this.tip.hide();
        return true;
      default:
        this.tip.hide();
        return false;
    }
  }

  // ================================================================== frame

  update(dt: number): void {
    if (!this.root) return;
    if (this.photo.active) safe('ui photo', () => this.photo.update(dt));
    else safe('ui input', () => this.input.update(dt));
    safe('ui consent', () => this.consent.update(dt));
    safe('ui notify', () => this.notifyPrompt.update(dt));
    safe('ui sync', () => this.syncSettings());
    safe('ui build', () => {
      this.build.update(dt);
      this.bar.update(dt);
    });
    safe('ui hud', () => this.hud.update(dt));
    safe('ui panels', () => this.panels.update(dt));
    safe('ui fx', () => {
      this.floats.update(dt);
      this.fly.update(dt);
      this.tip.update(dt);
      this.guide.frame(dt);
      this.threats.frame();
    });

    this.accSlow += dt;
    if (this.accSlow >= 0.25) {
      this.accSlow = 0;
      safe('ui slow', () => {
        // the overlay roots are fixed layouts: undo any programmatic scroll (focus(), scrollIntoView, iOS
        // keyboard) that would shift the whole HUD
        for (const r of [this.ui, this.root]) if (r.scrollTop || r.scrollLeft) r.scrollTop = r.scrollLeft = 0;
        this.refreshBadges();
        if (!this.tierRevealPending) this.seenTier = this.game.state.colony.tier; // a tier set without the event (load)
        this.flushToasts(); // held toasts also follow when no panel change comes along (waits while a modal is up)
        this.guide.poll();
        this.threats.poll();
        this.syncToastInset();
      });
    }
    this.accFps += dt;
    if (this.accFps >= 0.5) {
      this.accFps = 0;
      safe('ui fps', () => this.updateFps());
    }
  }

  private refreshBadges(): void {
    this.badgesCache = safe('badges', () => computeBadges(this.game)) ?? this.badgesCache;
  }

  /** Settings that affect layout (left-handed, FPS) and the root mode flag. */
  private syncSettings(): void {
    const s = this.game.state.settings;
    const hand = s.leftHanded ? 'left' : 'right';
    if (this.root.dataset.hand !== hand) this.root.dataset.hand = hand;
    // blueprint capture uses the build layout too (no dock / rail in the way)
    const mode = this.build.mode === 'select' ? 'build' : this.game.view.mode;
    if (this.root.dataset.mode !== mode) this.root.dataset.mode = mode;
    setClass(this.root, 'is-building', this.build.active);
  }

  private updateFps(): void {
    const on = this.game.state.settings.showFps;
    if (!on) {
      if (this.fpsBox) this.fpsBox.hidden = true;
      return;
    }
    if (!this.fpsBox) {
      this.fpsBox = h('div', { class: 'fps-box' });
      this.root.appendChild(this.fpsBox);
    }
    this.fpsBox.hidden = false;
    const st = this.renderer.stats();
    const g = this.game;
    this.fpsBox.textContent = `${st.fps} fps · ${st.drawCalls} calls · ${(st.triangles / 1000).toFixed(0)}k tris\n${g.state.buildings.list.length} buildings · ${g.state.colonists.list.length} colonists · ${g.state.combat.aliens.length} aliens`;
  }

  /** Expose a reward popup (used by tests / dev tools). */
  showReward(title: string, reward: Reward, icon?: string): void {
    this.ctx.showReward(title, reward, icon);
  }

  /** Toast helper for external callers. */
  toast(text: string, kind: ToastKind = 'info', icon?: string): void {
    this.toasts.show(text, kind, icon);
  }
}

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
import './styles/fx.css';
import './styles/build.css';
import './styles/screens.css';
import './styles/modals.css';

import type { Game } from '../core/Game';
import type { RendererApi } from '../render/api';
import type { Reward } from '../data/schema';
import type { Selection } from '../core/view';
import { fmt } from '../core/format';
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
import { CelebratePanel, RewardPanel, type CelebrateArg } from './panels/CelebratePanel';
import { MenuPanel } from './panels/MenuPanel';

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
  private fpsBox: HTMLElement | null = null;
  private stickHint!: HTMLElement;

  private badgesCache: Badges = { missions: 0, research: 0, daily: false, spin: false, crate: false, season: 0, colonists: 0 };
  private accSlow = 0;
  private accFps = 0;
  private lastClick = { x: 0, y: 0, t: -1e9 };
  private lastPanelSfx = 0;
  private lastTierCelebrate = -1e9;
  private lastAdFail = -1e9;
  private lastInsufficient = -1e9;
  private welcomeShown = false;

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
    world.append(this.tip.el, this.guide.layer);

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

    el.append(inputLayer, stick, this.stickHint, world, this.hud.el, this.bar.el, this.bar.canvas, this.toasts.el, panelLayer, modalLayer, this.fly.el, this.guide.ringLayer);

    this.input = new InputController(this.game, inputLayer, stick, stick.firstElementChild as HTMLElement, {
      onTap: (x, y) => this.onWorldTap(x, y),
      build: this.build.pointer,
      shortcut: (e) => this.shortcut(e),
      moved: () => this.stickHint.classList.add('gone'),
    });

    this.installGlobalHandlers();
    this.subscribe();
    this.syncSettings();
    this.refreshBadges();

    // offline summary may already be waiting (game.start() ran before init in tests)
    if (this.game.pendingOffline) this.showWelcome();

    if (import.meta.env.DEV && /[?&]uidev\b/.test(location.search)) {
      void import('./dev/preview').then((m) => m.installPreview(this, this.game, this.ctx));
    }
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

  private onPanelsChanged(): void {
    const covering = this.panels.anyCovering();
    this.game.view.panelOpen = covering;
    this.root.dataset.panelOpen = covering ? '1' : '0';
    if (covering || this.panels.anyOpen()) this.input.reset();
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
    bus.on('ui:toast', (e) => this.toasts.show(e.text, e.kind, e.icon));
    bus.on('ui:float', (e) => this.floats.spawn(e.text, e.x, e.z, e.color, e.big));
    bus.on('ui:open', (e) => this.open(e.panel, e.arg));
    bus.on('ui:celebrate', (e) => {
      const now = performance.now();
      if (now - this.lastTierCelebrate < 2500 && /tier/i.test(e.title + (e.text ?? ''))) return; // tier-up already celebrated
      this.panels.open('celebrate', { title: e.title, text: e.text, icon: e.icon } satisfies CelebrateArg);
    });
    bus.on('colony:tierUp', (e) => {
      const now = performance.now();
      this.lastTierCelebrate = now;
      const t = g.data.tier(e.tier);
      const unlocks = g.data.buildings.filter((b) => b.unlockTier === e.tier && !b.research && !b.piece).map((b) => `${b.icon} ${b.name}`);
      this.panels.open('celebrate', {
        title: e.tier >= 6 ? 'TITANIUM COLONY!' : `${t.name} Tier Reached!`,
        text: e.tier >= 6 ? 'You built a gleaming super-colony. What an incredible journey!' : t.description,
        icon: e.tier >= 6 ? '🌟' : '🏰',
        tier: e.tier,
        unlocks,
        big: true,
      } satisfies CelebrateArg);
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
    bus.on('combat:ended', (e) => this.panels.open('victory', { wave: e.wave, kills: e.kills, reward: e.reward }));
    bus.on('combat:rewardClaimed', () => this.panels.close('victory'));

    // flying resources + HUD pops
    bus.on('resource:gained', (e) => {
      this.hud.resources.gained(e.id, e.amount, e.source);
      if (e.source === 'production' || e.source === 'offline') return;
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
      this.toasts.show(`Need ${fmt(Math.ceil(first[1]))} more ${d?.name ?? first[0]}`, 'warning', d?.icon ?? '📦');
    });
    bus.on('player:backpackFull', () => this.toasts.show('Backpack full! Walk back to the colony to unload.', 'warning', '🎒'));
    bus.on('ad:failed', () => {
      this.lastAdFail = performance.now();
      this.toasts.show('No video available right now — please try again soon!', 'info', '📺');
    });
    bus.on('iap:purchased', () => this.toasts.show('Thank you for your support! 💜', 'reward', '🎉'));
    bus.on('iap:failed', (e) => this.toasts.show(e.reason && e.reason !== 'cancelled' ? `Purchase didn't go through: ${e.reason}` : 'Purchase cancelled — no worries!', 'info', '🛍️'));
    bus.on('season:levelUp', (e) => this.toasts.show(`Season pass level ${e.level}!`, 'reward', '🏆'));
    bus.on('building:changed', () => this.refreshBadges());
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
          this.haptic('tap');
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
        else if (ev && def) this.tip.show(def.icon, def.name, 'Walk up to it to take part!', ev.x, ev.z);
        break;
      }
      case 'poi': {
        const p = g.sys.world.gen?.pois.find((q) => q.id === sel.id);
        const def = p ? g.data.poi(p.def) : undefined;
        if (p && def) this.tip.show(def.icon, def.name, def.description, p.x, p.z);
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
        if (a && def) this.tip.show('👾', def.name, `${Math.ceil(a.hp)} / ${Math.ceil(a.maxHp)} HP`, a.x, a.z);
        break;
      }
    }
  }

  private shortcut(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
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
        if (this.panels.anyOpen()) this.panels.close();
        else if (this.build.active) this.build.cancel();
        else {
          this.game.view.selection.kind = null;
          this.game.view.selection.id = null;
          this.tip.hide();
        }
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

  // ================================================================== frame

  update(dt: number): void {
    if (!this.root) return;
    safe('ui input', () => this.input.update(dt));
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
    });

    this.accSlow += dt;
    if (this.accSlow >= 0.25) {
      this.accSlow = 0;
      safe('ui slow', () => {
        this.refreshBadges();
        this.guide.poll();
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

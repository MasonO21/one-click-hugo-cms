/**
 * PanelManager — opens/closes panels with transitions, keeps a stack, queues modals so celebrations,
 * the welcome-back screen and victory chests never pile on top of each other.
 */
import type { UiCtx } from '../ctx';
import { Panel } from './Panel';
import { safe } from '../dom';
import { backStep } from '../logic/back';

type Factory = (ctx: UiCtx) => Panel;

interface Open {
  panel: Panel;
  closing: boolean;
}

export class PanelManager {
  private factories = new Map<string, Factory>();
  private open_: Open[] = [];
  private modalQueue: { name: string; arg: unknown }[] = [];
  private z = 1;

  constructor(
    private readonly ctx: UiCtx,
    private readonly layerPanels: HTMLElement,
    private readonly layerModals: HTMLElement,
    private readonly onChange: () => void,
  ) {}

  register(name: string, factory: Factory): void {
    this.factories.set(name, factory);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  isOpen(name: string): boolean {
    return this.open_.some((o) => o.panel.name === name && !o.closing);
  }

  get(name: string): Panel | undefined {
    return this.open_.find((o) => o.panel.name === name && !o.closing)?.panel;
  }

  /** Any panel that covers the world (sheets/modals) is open. */
  anyCovering(): boolean {
    return this.open_.some((o) => !o.closing && (o.panel.kind === 'sheet' || o.panel.kind === 'modal'));
  }

  /**
   * Where the top-most open sheet / modal's header ends, in px from the top of the screen (null: nothing covering is
   * open, or the top one has no header). Toasts hang just below it instead of on top of the title. Layout offsets, so
   * the card's slide-in transform does not matter.
   */
  headerBottom(): number | null {
    for (let i = this.open_.length - 1; i >= 0; i--) {
      const o = this.open_[i];
      const p = o.panel;
      if (o.closing || (p.kind !== 'sheet' && p.kind !== 'modal')) continue;
      return p.hasHeader && p.head?.isConnected ? p.card.offsetTop + p.head.offsetHeight : null;
    }
    return null;
  }

  /**
   * Where the top-most open drawer / inspector card starts, in px from the top of the screen (null: none is open, or a
   * sheet / modal is above it). On a portrait phone these cards rise from the bottom, where the toast stack sits: the
   * stack waits just above the card instead. Layout offsets, so the slide-in transform does not matter.
   */
  bottomCardTop(): number | null {
    for (let i = this.open_.length - 1; i >= 0; i--) {
      const o = this.open_[i];
      if (o.closing) continue;
      return o.panel.kind === 'drawer' || o.panel.kind === 'side' ? o.panel.card.offsetTop : null;
    }
    return null;
  }

  /** A modal (celebration, reward, victory, welcome back…) is showing or waiting in the queue. */
  anyModal(): boolean {
    return this.modalQueue.length > 0 || this.open_.some((o) => !o.closing && o.panel.kind === 'modal');
  }

  /** Close every non-modal panel (sheets, drawers, side cards). */
  closeSheets(): void {
    for (const o of [...this.open_]) if (!o.closing && o.panel.kind !== 'modal') this.closePanel(o);
  }

  anyOpen(): boolean {
    return this.open_.some((o) => !o.closing);
  }

  topName(): string | null {
    for (let i = this.open_.length - 1; i >= 0; i--) if (!this.open_[i].closing) return this.open_[i].panel.name;
    return null;
  }

  open(name: string, arg?: unknown): void {
    const f = this.factories.get(name);
    if (!f) {
      console.warn(`[ui] unknown panel "${name}"`);
      return;
    }
    const existing = this.get(name);
    if (existing && existing.kind === 'modal' && !sameArg(existing.currentArg(), arg)) {
      // a second celebration / reward while one is showing: queue it instead of replacing what the player is reading
      if (!this.modalQueue.some((q) => q.name === name && sameArg(q.arg, arg))) this.modalQueue.push({ name, arg });
      return;
    }
    if (existing) {
      existing.setArg(arg);
      safe(`panel ${name} onArg`, () => existing.onArg(arg));
      existing.refresh(true);
      return;
    }
    const panel = f(this.ctx);
    if (panel.kind === 'modal') {
      if (this.open_.some((o) => !o.closing && o.panel.kind === 'modal')) {
        // queue (but never duplicate the same modal with the same content)
        if (!this.modalQueue.some((q) => q.name === name && sameArg(q.arg, arg))) this.modalQueue.push({ name, arg });
        return;
      }
    } else {
      // exclusive: close other non-modal panels
      for (const o of [...this.open_]) if (!o.closing && o.panel.kind !== 'modal') this.closePanel(o);
    }
    this.mountPanel(panel, arg);
  }

  private mountPanel(panel: Panel, arg: unknown): void {
    panel.setArg(arg);
    const frame = panel.mount();
    frame.style.zIndex = String(this.z++);
    (panel.kind === 'modal' ? this.layerModals : this.layerPanels).appendChild(frame);
    const rec: Open = { panel, closing: false };
    this.open_.push(rec);
    safe(`panel ${panel.name} onOpen`, () => panel.onOpen(arg));
    panel.refresh(true);
    // next frame -> transition in
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!rec.closing) frame.classList.add('open');
      }),
    );
    this.ctx.sfx('ui_open');
    this.onChange();
  }

  /** Close a panel by name, or the top-most one (back): a modal that can't be dismissed keeps everything under it. */
  close(name?: string): void {
    if (name) {
      const o = this.open_.find((x) => x.panel.name === name && !x.closing);
      if (o) this.closePanel(o);
      else this.modalQueue = this.modalQueue.filter((q) => q.name !== name);
      return;
    }
    const { index, inner } = backStep(this.open_.map((o) => ({ kind: o.panel.kind, dismissable: o.panel.dismissable, closing: o.closing, nested: !!safe(`panel ${o.panel.name} nestedView`, () => o.panel.nestedView()) })));
    if (index < 0) return;
    const o = this.open_[index];
    if (inner) safe(`panel ${o.panel.name} leaveNested`, () => o.panel.leaveNested());
    else this.closePanel(o);
  }

  closeAll(): void {
    this.modalQueue = [];
    for (const o of [...this.open_]) if (!o.closing) this.closePanel(o);
  }

  private closePanel(o: Open): void {
    o.closing = true;
    const p = o.panel;
    safe(`panel ${p.name} onClose`, () => p.onClose());
    p.frame.classList.remove('open');
    this.ctx.sfx('ui_close');
    const done = () => {
      p.frame.remove();
      this.open_ = this.open_.filter((x) => x !== o);
      if (p.kind === 'modal' && !this.open_.some((x) => x.panel.kind === 'modal' && !x.closing)) this.openNextModal();
      this.onChange();
    };
    window.setTimeout(done, 260);
    this.onChange();
  }

  private openNextModal(): void {
    const next = this.modalQueue.shift();
    if (next) this.open(next.name, next.arg);
  }

  update(dt: number): void {
    for (const o of this.open_) if (!o.closing) o.panel.tick(dt);
  }
}

/** Same modal content (args are small plain objects: titles, rewards, ids). */
function sameArg(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

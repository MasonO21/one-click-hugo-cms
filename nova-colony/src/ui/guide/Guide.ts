/**
 * Guide — tutorial guidance layered on the HUD. Reads `tutorial.guide()`:
 *  - `ui` selector -> pulsing ring + pointing hand around that element (falling back from a closed
 *    panel's inner element to the button that opens it)
 *  - `world` target -> a bouncing arrow anchored in 3D via renderer.worldToScreen, or an edge
 *    indicator pointing toward the target (with distance) when it is off-screen.
 * The hint text bubble itself is part of the HUD banners.
 */
import type { UiCtx } from '../ctx';
import { edgePointRect, relativeScreenDir } from '../logic/input';
import { h, s, safe, setClass } from '../dom';

/** Map a selector to something visible: `[data-build=..]` closed -> `#btn-build`, etc. */
export function resolveGuideSelector(sel: string, query: (s: string) => Element | null): Element | null {
  const direct = safeQuery(sel, query);
  if (direct && isShown(direct)) return direct;
  // [pattern, rail/dock button, panel that makes the button unnecessary]
  const fallbacks: [RegExp, string, string][] = [
    [/data-build/, '#btn-build', 'build'],
    [/data-research/, '#btn-research', 'research'],
    [/data-panel="build"/, '#btn-build', 'build'],
    [/data-panel="colonists"|data-panel="recruit"/, '#btn-colonists', 'colonists'],
    [/data-panel="research"/, '#btn-research', 'research'],
    [/data-panel="craft"/, '#btn-craft', 'craft'],
    [/data-panel="map"/, '#btn-map', 'map'],
    [/data-panel="missions"/, '#btn-missions', 'missions'],
    [/data-panel="shop"/, '#btn-shop', 'shop'],
  ];
  for (const [re, target, panel] of fallbacks) {
    if (!re.test(sel)) continue;
    // the panel is already open but the exact element isn't on this tab: don't point at a covered button
    if (safeQuery(`[data-panel="${panel}"]`, query)) return null;
    const el = safeQuery(target, query);
    if (el && isShown(el)) return el;
  }
  return null;
}

function safeQuery(sel: string, query: (s: string) => Element | null): Element | null {
  try {
    return query(sel);
  } catch {
    return null;
  }
}

function isShown(el: Element): boolean {
  if ((el as HTMLElement).hidden) return false;
  const r = el.getBoundingClientRect?.();
  return !r || (r.width > 2 && r.height > 2);
}

export class Guide {
  readonly layer: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly edge: HTMLElement;
  private readonly edgeArrow: HTMLElement;
  private readonly edgeDist: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly hand: HTMLElement;
  private world: { x: number; z: number } | null = null;
  private uiSel: string | null = null;
  private uiEl: Element | null = null;
  private lastSel = '';
  private acc = 0;
  private covered = false;
  private ringKey = '';
  private arrowTr = '';
  private edgeTr = '';
  private edgeLabel = '';

  constructor(private readonly ctx: UiCtx) {
    const arrowSvg = s('svg', { viewBox: '0 0 64 72' }, s('path', { d: 'M20 4h24v28h14L32 66 6 32h14z', fill: '#ffcf4a', stroke: '#fff', 'stroke-width': 5, 'stroke-linejoin': 'round' }), s('path', { d: 'M24 8h16v26h8L32 56 16 34h8z', fill: '#ffb21a' }));
    this.arrow = h('div', { class: 'guide-arrow' }, h('div', { class: 'ga-in' }, arrowSvg as unknown as Node));
    this.edgeDist = h('small');
    // only the arrow rotates; the distance label stays upright and centred under it (a rotated label
    // orbited the arrow and was clipped at the screen edge)
    this.edgeArrow = h('div', { class: 'ge-rot' }, h('div', { class: 'ge-arrow' }));
    this.edge = h('div', { class: 'guide-edge' }, this.edgeArrow, this.edgeDist);
    this.ring = h('div', { class: 'guide-ring' });
    this.hand = h('div', { class: 'guide-hand' }, h('span', { text: '👆' }));
    this.layer = h('div', { class: 'nv-world-guide' }, this.arrow, this.edge);
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.ringLayer = h('div');
    this.ringLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9';
    this.ringLayer.append(this.ring, this.hand);
  }

  /** Overlay layer for UI highlights (must sit above panels). */
  readonly ringLayer: HTMLElement;

  /** ≈5 Hz: re-read the tutorial target. */
  poll(): void {
    const g = this.ctx.game.sys.tutorial.guide();
    this.world = g?.world ?? null;
    this.uiSel = g?.ui ?? null;
    if (this.uiSel !== this.lastSel) {
      this.lastSel = this.uiSel ?? '';
      this.uiEl = null;
    }
    if (this.uiSel) {
      const el = resolveGuideSelector(this.uiSel, (q) => this.ctx.root.ownerDocument.querySelector(q));
      if (el !== this.uiEl) {
        this.uiEl = el;
        if (el) safe('guide scroll', () => (el as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
      }
      this.covered = el ? this.isCovered(el as HTMLElement) : false;
    } else {
      this.uiEl = null;
      this.covered = false;
    }
  }

  /** Is something (a panel) drawn on top of the element's centre? */
  private isCovered(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return true;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && top !== el && !el.contains(top) && !top.contains(el);
  }

  /** Every frame: follow the target. */
  frame(dt: number): void {
    this.acc += dt;
    // never invite a tap on a disabled button (e.g. ✔ while the ghost is on a blocked spot)
    const ringOn = !!this.uiEl && this.uiEl.isConnected && !this.covered && this.uiEl.getAttribute('aria-disabled') !== 'true';
    setClass(this.ring, 'on', ringOn);
    setClass(this.hand, 'on', ringOn);
    // read the target's rect at ~20 Hz (not every frame) and only write when it moved
    if (ringOn && this.acc >= 0.05) {
      this.acc = 0;
      const r = (this.uiEl as HTMLElement).getBoundingClientRect();
      const pad = 5;
      const below = r.top < window.innerHeight * 0.45;
      const key = [r.left, r.top, r.width, r.height, below].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',');
      if (key !== this.ringKey) {
        this.ringKey = key;
        this.ring.style.width = `${r.width + pad * 2}px`;
        this.ring.style.height = `${r.height + pad * 2}px`;
        this.ring.style.transform = `translate3d(${r.left - pad}px, ${r.top - pad}px, 0)`;
        this.hand.style.transform = `translate3d(${r.left + r.width / 2 - 14}px, ${below ? r.bottom + 6 : r.top - 44}px, 0) ${below ? '' : 'rotate(180deg)'}`;
      }
    }

    const w = this.world;
    if (!w || ringOn) {
      setClass(this.arrow, 'on', false);
      setClass(this.edge, 'on', false);
      return;
    }
    const { renderer, game } = this.ctx;
    const p = renderer.worldToScreen(w.x, 2.2, w.z);
    if (p.visible) {
      setClass(this.edge, 'on', false);
      setClass(this.arrow, 'on', true);
      const tr = `translate3d(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px, 0)`;
      if (tr !== this.arrowTr) {
        this.arrowTr = tr;
        this.arrow.style.transform = tr;
      }
    } else {
      setClass(this.arrow, 'on', false);
      const pl = game.state.player;
      const dx = w.x - pl.x;
      const dz = w.z - pl.z;
      const v = relativeScreenDir(dx, dz, game.view.camera.yaw);
      // keep the pointer clear of the HUD: top bars, right rail, bottom dock
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const e = edgePointRect(v.x, v.y, { l: 36, t: Math.max(128, vh * 0.2), r: vw - 104, b: vh - 96 });
      setClass(this.edge, 'on', true);
      const tr = `translate3d(${e.x.toFixed(0)}px, ${e.y.toFixed(0)}px, 0)`;
      const rot = `rotate(${e.angle.toFixed(3)}rad)`;
      if (tr + rot !== this.edgeTr) {
        this.edgeTr = tr + rot;
        this.edge.style.transform = tr;
        this.edgeArrow.style.transform = rot;
      }
      const label = `${Math.round(Math.hypot(dx, dz))} m`;
      if (label !== this.edgeLabel) {
        this.edgeLabel = label;
        this.edgeDist.textContent = label;
      }
    }
  }
}

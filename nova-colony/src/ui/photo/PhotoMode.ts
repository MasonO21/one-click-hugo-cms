/**
 * Photo Mode: a full-screen camera for a picture of the colony (Menu › Photo).
 *
 *  - Everything else on screen (HUD, toasts, mission tracker, joystick, open panels) is hidden while it is up; the UI
 *    owns that through `host.onActive`. The simulation keeps running (colonists walk, smoke drifts, the clock ticks):
 *    nothing is paused, so nothing has to be caught up. A raid that starts while the player is framing ends the mode
 *    (the HUD's attack banner takes over); the warning before it shows as a small pill.
 *  - Free camera (renderer.photo): one finger turns around the target and tilts, two fingers move it, pinch zooms,
 *    a two-finger twist turns. Kept within PHOTO_CAM's bounds around where the mode started.
 *  - Light chips: Now / Golden hour / Midday / Night lights. They only change what is drawn (renderer.photo
 *    .setLighting), easing the sun across the sky; the sim's clock never moves, and leaving restores the real light.
 *  - Shutter: haptic + flash, the still is rendered at up to 2048 px on the long side (captureSize), framed on a 2D
 *    canvas (compose.ts) and encoded as JPEG. The preview sheet offers Share (native share sheet, or the browser's),
 *    Download (web only) and Retake. Sharing goes through `game.services.share` (platform/share.ts).
 *  - Back (Android) / Escape: closes the preview first, then leaves the mode (logic/photo.ts `photoBack`).
 *
 * Pure parts (phases, presets, camera math, sizes, caption): logic/photo.ts. Styles: styles/photo.css.
 */
import type { Game } from '../../core/Game';
import type { RendererApi } from '../../render/api';
import type { HapticKind } from '../ctx';
import { HALF_WORLD } from '../../core/constants';
import { h, replay, safe, setHidden, setText } from '../dom';
import { hudArt, iconEl, phaseArt } from '../art';
import { dayPhase, fmtHMS } from '../logic/time';
import {
  PHOTO_PRESETS,
  captureSize,
  clampPhotoCam,
  lightToward,
  orbitPhoto,
  panPhoto,
  photoBack,
  photoBounds,
  photoCaption,
  photoFileName,
  photoNext,
  pinchPhoto,
  presetDayTime,
  shareText,
  wheelPhoto,
  type PhotoBounds,
  type PhotoCam,
  type PhotoCaption,
  type PhotoEvent,
  type PhotoPhase,
  type PhotoPresetId,
} from '../logic/photo';
import { canvasBlob, composePhoto, frameAssets } from './compose';
import type { ShareImage, ShareResult } from '../../platform/types';

export interface PhotoHost {
  readonly game: Game;
  readonly renderer: RendererApi;
  haptic(kind: HapticKind): void;
  sfx(id: string): void;
  /** Photo Mode starts / ends: hide or show the rest of the UI, release the joystick. */
  onActive(active: boolean): void;
  /** The preview sheet covers the world (the renderer may halve its frame rate behind it). */
  onCovering(covering: boolean): void;
}

/** Seconds the gesture hint stays up (it also goes at the first gesture). */
const HINT_SECONDS = 5;
/** How fast the light eases toward a chip's time of day (1/s). */
const LIGHT_RATE = 4.5;

interface Shot {
  blob: Blob;
  url: string;
  fileName: string;
  caption: PhotoCaption;
}

interface Ptr {
  x: number;
  y: number;
}

export class PhotoMode {
  readonly el: HTMLElement;
  private phase: PhotoPhase = 'off';
  private cam: PhotoCam | null = null;
  private bounds: PhotoBounds = photoBounds(0, 0, HALF_WORLD);
  private preset: PhotoPresetId = 'now';
  /** Day time the scene is drawn at right now (eased toward the chip's). */
  private light: number | null = null;
  private hintLeft = 0;
  private shot: Shot | null = null;
  private pointers = new Map<number, Ptr>();
  /** Last two-finger state (incremental pan / pinch / twist). */
  private pair: { mx: number; my: number; d: number; ang: number } | null = null;

  private readonly surface: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly raid: HTMLElement;
  private readonly chips: HTMLButtonElement[] = [];
  private readonly nowIcon: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly downloadBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private nowPhase = '';

  constructor(private readonly host: PhotoHost) {
    this.surface = h('div', { class: 'ph-surface' });
    this.hint = h('div', { class: 'ph-hint', text: 'Drag to turn · Pinch to zoom · Two fingers to move' });
    this.raid = h('div', { class: 'ph-raid', hidden: true });
    const close = h<HTMLButtonElement>('button', { class: 'ph-close', type: 'button', 'aria-label': 'Leave photo mode', data: { sfx: 'ui_close' } }, h('span', { text: '✕' }));
    close.addEventListener('click', () => this.exit());

    this.nowIcon = h('span', { class: 'ic' });
    const chipRow = h('div', { class: 'ph-chips', role: 'radiogroup', 'aria-label': 'Light' });
    for (const p of PHOTO_PRESETS) {
      const ic = p.hud ? iconEl(hudArt(p.hud), p.icon, 'ic', 'span') : this.nowIcon;
      const b = h<HTMLButtonElement>('button', { class: 'ph-chip', type: 'button', role: 'radio', 'aria-checked': 'false', data: { preset: p.id, sfx: 'ui_tab' } }, ic, h('span', { class: 'lb', text: p.label }));
      b.addEventListener('click', () => this.pick(p.id));
      this.chips.push(b);
      chipRow.appendChild(b);
    }
    const shutter = h<HTMLButtonElement>('button', { class: 'ph-shutter', type: 'button', 'aria-label': 'Take the photo', data: { sfx: 'none', haptic: 'none' } }, h('span', { class: 'ph-shutter-in' }));
    shutter.addEventListener('click', () => this.shutter());

    this.flashEl = h('div', { class: 'ph-flash' });

    this.img = h<HTMLImageElement>('img', { class: 'ph-img', alt: 'Your colony photo', draggable: 'false' });
    const retake = h<HTMLButtonElement>('button', { class: 'btn ghost ph-retake', type: 'button' }, h('span', { class: 'ph-bi', text: '↺' }), 'Retake');
    retake.addEventListener('click', () => this.retake());
    this.downloadBtn = h<HTMLButtonElement>('button', { class: 'btn info ph-download', type: 'button' }, h('span', { class: 'ph-bi', text: '⬇' }), 'Download');
    this.downloadBtn.addEventListener('click', () => this.download());
    this.shareBtn = h<HTMLButtonElement>('button', { class: 'btn good ph-share', type: 'button' }, h('span', { class: 'ph-bi', text: '↗' }), 'Share');
    this.shareBtn.addEventListener('click', () => this.share());
    this.status = h('div', { class: 'ph-status', role: 'status' });
    this.sheet = h(
      'div',
      { class: 'ph-sheet', hidden: true },
      h('div', { class: 'ph-backdrop' }),
      h('div', { class: 'ph-print' }, this.img),
      h('div', { class: 'ph-side' }, h('div', { class: 'ph-actions' }, retake, this.downloadBtn, this.shareBtn), this.status),
    );

    this.el = h(
      'div',
      { class: 'nv-photo', hidden: true, data: { phase: 'off' } },
      this.surface,
      h('div', { class: 'ph-top' }, close, this.hint, this.raid),
      h('div', { class: 'ph-dock' }, chipRow, shutter),
      this.flashEl,
      this.sheet,
    );
    this.wireGestures();
  }

  /** Photo Mode is up (any phase but 'off'). */
  get active(): boolean {
    return this.phase !== 'off';
  }

  get currentPhase(): PhotoPhase {
    return this.phase;
  }

  /** The renderer can do it (else the Menu has no Photo tile). */
  get available(): boolean {
    return !!this.host.renderer.photo;
  }

  private get game(): Game {
    return this.host.game;
  }

  private go(ev: PhotoEvent): void {
    this.phase = photoNext(this.phase, ev);
    this.el.dataset.phase = this.phase;
  }

  // ================================================================== enter / leave

  enter(): void {
    const rp = this.host.renderer.photo;
    if (!rp || this.phase !== 'off') return;
    const start = safe('photo begin', () => rp.begin());
    if (!start) return;
    const p = this.game.state.player;
    this.bounds = photoBounds(Number.isFinite(p.x) ? p.x : start.tx, Number.isFinite(p.z) ? p.z : start.tz, HALF_WORLD);
    this.cam = clampPhotoCam({ ...start }, this.bounds);
    rp.setCamera(this.cam);
    this.preset = 'now';
    this.light = null;
    this.syncChips();
    this.hintLeft = HINT_SECONDS;
    this.hint.classList.remove('gone');
    this.pointers.clear();
    this.pair = null;
    void frameAssets(); // warm the frame's paper and icon
    this.go('enter');
    setHidden(this.el, false);
    this.host.onActive(true);
    this.update(0);
  }

  /** Leave Photo Mode from wherever it is (the ✕, back from the camera, a raid starting). */
  exit(): void {
    if (this.phase === 'off') return;
    this.hidePreview();
    this.phase = 'off';
    this.el.dataset.phase = 'off';
    setHidden(this.el, true);
    this.pointers.clear();
    this.pair = null;
    this.cam = null;
    this.light = null;
    safe('photo end', () => this.host.renderer.photo?.end());
    this.host.onActive(false);
  }

  /** Android back / Escape. True when the press was used (always, while the mode is up). */
  back(): boolean {
    const { next, used } = photoBack(this.phase);
    if (!used) return false;
    if (this.phase === 'preview' && next === 'framing') this.retake();
    else if (next === 'off') this.exit();
    return true;
  }

  // ================================================================== frame

  update(dt: number): void {
    if (this.phase === 'off') return;
    const g = this.game;
    const rp = this.host.renderer.photo;
    // light: ease toward the chip's time of day ('Now' follows the sim's clock)
    const target = presetDayTime(this.preset, g.state.time.dayTime);
    this.light = this.light == null ? target : lightToward(this.light, target, 1 - Math.exp(-dt * LIGHT_RATE));
    rp?.setLighting(this.light);
    // the "Now" chip shows the current phase of the day
    const ph = dayPhase(g.state.time.dayTime).name;
    if (ph !== this.nowPhase) {
      this.nowPhase = ph;
      this.nowIcon.replaceChildren(iconEl(phaseArt(ph), dayPhase(g.state.time.dayTime).icon, 'ic-in', 'span'));
    }
    if (this.hintLeft > 0) {
      this.hintLeft -= dt;
      if (this.hintLeft <= 0) this.hint.classList.add('gone');
    }
    // a raid on its way: a small pill (the attack itself ends the mode, see UI)
    const c = g.state.combat;
    const raidText = c.phase === 'warning' ? `👾 Raid in ${fmtHMS(Math.max(0, c.nextAt - g.state.playTime))}` : c.phase === 'attack' ? '👾 Aliens are attacking!' : '';
    setHidden(this.raid, !raidText);
    if (raidText) setText(this.raid, raidText);
  }

  // ================================================================== light chips

  private pick(id: PhotoPresetId): void {
    if (this.phase !== 'framing' || id === this.preset) return;
    this.preset = id;
    this.syncChips();
  }

  private syncChips(): void {
    for (const b of this.chips) {
      const on = b.dataset.preset === this.preset;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  // ================================================================== gestures

  private wireGestures(): void {
    const s = this.surface;
    s.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'framing') return;
      try {
        s.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pair = this.pairState();
      this.gestured();
    });
    s.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || this.phase !== 'framing' || !this.cam) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        // one finger (or the mouse; right button / shift moves the camera instead, for desktop testing)
        if (e.pointerType === 'mouse' && (e.buttons & 2 || e.shiftKey)) this.panBy(dx, dy);
        else orbitPhoto(this.cam, dx, dy);
      } else {
        const now = this.pairState();
        const was = this.pair;
        if (now && was) {
          this.panBy(now.mx - was.mx, now.my - was.my);
          pinchPhoto(this.cam, was.d, now.d);
          let da = now.ang - was.ang;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          this.cam.yaw += da;
        }
        this.pair = now;
      }
      this.applyCam();
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      this.pair = this.pairState();
    };
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);
    s.addEventListener('lostpointercapture', up);
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.phase !== 'framing' || !this.cam) return;
        wheelPhoto(this.cam, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY);
        this.applyCam();
        this.gestured();
      },
      { passive: false },
    );
    // the browser's own follow-up mouse events / clicks must not reach anything under the layer
    this.el.addEventListener('touchend', (e) => {
      if (e.target === s && e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  /** Midpoint, spread and angle of the first two fingers (null with fewer). */
  private pairState(): { mx: number; my: number; d: number; ang: number } | null {
    if (this.pointers.size < 2) return null;
    const [a, b] = [...this.pointers.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  private panBy(dx: number, dy: number): void {
    const rp = this.host.renderer.photo;
    if (!this.cam || !rp) return;
    panPhoto(this.cam, dx, dy, rp.viewSize().h, rp.fov());
  }

  private applyCam(): void {
    if (!this.cam) return;
    clampPhotoCam(this.cam, this.bounds);
    this.host.renderer.photo?.setCamera(this.cam);
  }

  private gestured(): void {
    if (this.hintLeft > 0) {
      this.hintLeft = 0;
      this.hint.classList.add('gone');
    }
  }

  // ================================================================== shutter

  private shutter(): void {
    if (this.phase !== 'framing' || !this.host.renderer.photo) return;
    this.go('shutter');
    this.pointers.clear();
    this.pair = null;
    this.host.haptic('heavy');
    this.host.sfx('ui_tab');
    // between two frames of the main loop: the still is the view the player is looking at
    requestAnimationFrame(() => void this.capture());
  }

  private async capture(): Promise<void> {
    const g = this.game;
    const rp = this.host.renderer.photo;
    if (!rp || this.phase !== 'capturing') return;
    let shot: HTMLCanvasElement | null = null;
    try {
      const view = rp.viewSize();
      const size = captureSize(view.w, view.h, g.state.settings.quality, safe('photo limits', () => rp.limits()));
      shot = rp.capture(size.w, size.h);
    } catch (e) {
      console.warn('[photo] capture failed', e);
    }
    replay(this.flashEl, 'go');
    if (!shot) return this.failed('The camera hiccuped. Try again!');
    try {
      const tier = g.data.tier(g.state.colony.tier);
      const caption = photoCaption(g.state.colony.name, tier?.name ?? '', g.state.time.day);
      const framed = composePhoto(shot, caption, await frameAssets());
      const blob = await canvasBlob(framed);
      if (this.phase !== 'capturing') return; // left meanwhile
      if (!blob) return this.failed('The photo could not be saved. Try again!');
      const stamp = Date.now().toString(36).slice(-6);
      this.shot = { blob, url: URL.createObjectURL(blob), fileName: photoFileName(g.state.colony.name, g.state.time.day, this.host.game.services.share?.native ? stamp : ''), caption };
      g.bus.emit('photo:taken', { preset: this.preset, width: framed.width, height: framed.height });
      this.go('captured');
      this.showPreview();
    } catch (e) {
      console.warn('[photo] framing failed', e);
      this.failed('The photo could not be saved. Try again!');
    }
  }

  private failed(msg: string): void {
    this.go('failed');
    this.hint.textContent = msg;
    this.hint.classList.remove('gone');
    this.hintLeft = 3;
  }

  // ================================================================== preview sheet

  private showPreview(): void {
    const s = this.shot;
    if (!s) return;
    const svc = this.game.services.share;
    this.img.src = s.url;
    setHidden(this.shareBtn, !svc || !(svc.native || svc.canShareFiles()));
    setHidden(this.downloadBtn, !svc || svc.native);
    this.setStatus('');
    this.setBusy(false);
    setHidden(this.sheet, false);
    replay(this.sheet, 'in');
    this.host.onCovering(true);
  }

  private hidePreview(): void {
    if (!this.sheet.hidden) this.host.onCovering(false);
    setHidden(this.sheet, true);
    this.sheet.classList.remove('in');
    this.img.removeAttribute('src');
    if (this.shot) URL.revokeObjectURL(this.shot.url);
    this.shot = null;
  }

  private retake(): void {
    if (this.phase !== 'preview') return;
    this.hidePreview();
    this.go('retake');
  }

  private image(): ShareImage | null {
    const s = this.shot;
    if (!s) return null;
    return { blob: s.blob, fileName: s.fileName, ...shareText(s.caption) };
  }

  private share(): void {
    const svc = this.game.services.share;
    const img = this.image();
    if (!svc || !img || this.phase !== 'preview') return;
    this.go('share');
    this.setBusy(true);
    // called straight from the tap: the browser's share sheet needs the user's gesture
    void svc.shareImage(img).then(
      (r) => this.afterShare(r, svc.native ? 'native' : 'web'),
      () => this.afterShare('failed', svc.native ? 'native' : 'web'),
    );
  }

  private download(): void {
    const svc = this.game.services.share;
    const img = this.image();
    if (!svc || !img || this.phase !== 'preview') return;
    this.go('share');
    this.setBusy(true);
    void svc.download(img).then(
      (r) => this.afterShare(r, 'download'),
      () => this.afterShare('failed', 'download'),
    );
  }

  private afterShare(r: ShareResult, method: 'native' | 'web' | 'download'): void {
    if (this.phase !== 'sharing') return;
    this.go(r === 'failed' || r === 'unavailable' ? 'failed' : 'shared');
    this.setBusy(false);
    if (r === 'shared' || r === 'downloaded') {
      this.game.bus.emit('photo:shared', { method });
      this.host.haptic('success');
      this.setStatus(r === 'downloaded' ? 'Saved to your downloads ✓' : 'Shared! 🌱');
    } else if (r === 'failed' || r === 'unavailable') {
      this.setStatus(method === 'web' && !this.downloadBtn.hidden ? "Couldn't share here. Try Download!" : "Couldn't share right now. Try again!");
    } else this.setStatus('');
  }

  private setBusy(busy: boolean): void {
    for (const b of [this.shareBtn, this.downloadBtn]) b.setAttribute('aria-busy', busy ? 'true' : 'false');
    this.sheet.classList.toggle('busy', busy);
  }

  private setStatus(text: string): void {
    setText(this.status, text);
    this.status.classList.toggle('on', !!text);
  }
}

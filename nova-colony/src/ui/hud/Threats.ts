/**
 * Threats — off-screen invasion indicators. A big late-game colony fights at its walls, far from the
 * camera: red edge markers point at each attacking group ("👾 12", "💀" when a boss is in it) and at
 * where the next spawns will appear, so the player always knows where the action is. Tapping one
 * swings the camera over for a look.
 */
import type { UiCtx } from '../ctx';
import { edgePointRect, relativeScreenDir } from '../logic/input';
import { h, setClass } from '../dom';
import { CELL } from '../../core/constants';
import { alienArt } from '../art';

const SECTORS = 8;
const MAX_MARKERS = 3;

interface Group {
  n: number;
  x: number;
  z: number;
  boss: boolean;
  /** Per-model head count (AlienDef.model) — the most common one (a boss first) gets its portrait on the marker. */
  models?: Map<string, number>;
  model?: string;
}

/** Bucket invaders (and the next queued spawns) by direction from the colony center. Pure: exported for tests. */
export function threatGroups(
  aliens: readonly { x: number; z: number; boss?: boolean; model?: string }[],
  cx: number,
  cz: number,
  sectors = SECTORS,
): { n: number; x: number; z: number; boss: boolean; model?: string }[] {
  const g: Group[] = [];
  for (let i = 0; i < sectors; i++) g.push({ n: 0, x: 0, z: 0, boss: false });
  for (const a of aliens) {
    const ang = Math.atan2(a.z - cz, a.x - cx);
    const s = ((Math.round((ang / (Math.PI * 2)) * sectors) % sectors) + sectors) % sectors;
    const b = g[s];
    b.n++;
    b.x += a.x;
    b.z += a.z;
    if (a.boss) b.boss = true;
    if (a.model) {
      const m = (b.models ??= new Map());
      // a boss outweighs any crowd so its portrait is the one shown
      m.set(a.model, (m.get(a.model) ?? 0) + (a.boss ? 1e6 : 1));
    }
  }
  return g
    .filter((b) => b.n > 0)
    .map((b) => ({ n: b.n, x: b.x / b.n, z: b.z / b.n, boss: b.boss, model: b.models ? [...b.models.entries()].sort((p, q) => q[1] - p[1])[0][0] : undefined }))
    .sort((a, b) => Number(b.boss) - Number(a.boss) || b.n - a.n);
}

export class Threats {
  readonly layer: HTMLElement;
  private readonly markers: { el: HTMLElement; label: HTMLElement; arrow: HTMLElement; pic: HTMLImageElement; x: number; z: number; tr: string; text: string; model: string }[] = [];
  private groups: Group[] = [];
  private readonly pts: { x: number; z: number; boss?: boolean; model?: string }[] = [];

  constructor(private readonly ctx: UiCtx) {
    this.layer = h('div', { class: 'nv-threats' });
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    for (let i = 0; i < MAX_MARKERS; i++) {
      const label = h('b');
      // the pointer rotates (inline transform); the pulsing dot is a separate element, because a CSS
      // animation on the same element would override the rotation
      const arrow = h('i', { class: 'th-arrow' });
      const pic = h<HTMLImageElement>('img', { class: 'th-pic', alt: '', draggable: 'false', hidden: true });
      pic.decoding = 'async';
      pic.onerror = () => {
        pic.hidden = true;
      };
      // the portrait replaces the dot when there is art for the leading alien type (see art.css)
      const el = h('button', { class: 'threat-edge', type: 'button', 'aria-label': 'Show attackers', data: { sfx: 'none' } }, arrow, pic, h('i', { class: 'th-dot' }), label);
      const m = { el, label, arrow, pic, x: 0, z: 0, tr: '', text: '', model: '' };
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // look at the colony edge facing them (flat, built-up ground with the turrets firing) rather
        // than the rough terrain out on the spawn ring
        const { game } = this.ctx;
        const c = game.sys.buildings.colonyCenter();
        const dx = m.x - c.x;
        const dz = m.z - c.z;
        const d = Math.hypot(dx, dz);
        const k = d > 0 ? Math.min(1, (game.state.colony.radius * CELL * 0.92) / d) : 1;
        this.ctx.renderer.focus(c.x + dx * k, c.z + dz * k);
      });
      this.markers.push(m);
      this.layer.appendChild(el);
    }
  }

  /** ≈4 Hz: regroup the attackers. */
  poll(): void {
    const { game } = this.ctx;
    const c = game.state.combat;
    this.pts.length = 0;
    if (c.phase === 'attack') {
      for (const a of c.aliens) {
        if (a.wild || a.retreat || a.hp <= 0) continue;
        const d = game.data.alien(a.def);
        this.pts.push({ x: a.x, z: a.z, boss: !!d?.boss, model: d?.model });
      }
      // where the next few arrive (the queue is sorted latest-first)
      const q = c.spawnQueue;
      for (let i = q.length - 1, k = 0; i >= 0 && k < 8; i--, k++) {
        const d = game.data.alien(q[i].alien);
        this.pts.push({ x: q[i].x, z: q[i].z, boss: !!d?.boss, model: d?.model });
      }
    }
    const center = game.sys.buildings.colonyCenter();
    this.groups = this.pts.length ? threatGroups(this.pts, center.x, center.z).slice(0, MAX_MARKERS) : [];
    // keep the markers below the attack banner / hint bubble column
    const banners = this.groups.length ? this.ctx.root.querySelector('.hud-banners') : null;
    const bottom = banners ? banners.getBoundingClientRect().bottom : 0;
    this.top = Math.max(130, window.innerHeight * 0.22, bottom + 30);
  }

  private top = 130;

  /** Every frame: place the markers on the screen edge (hidden while the group is in view). */
  frame(): void {
    const { game, renderer } = this.ctx;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cam = game.view.camera;
    const follow = cam.mode === 'follow' && game.view.mode !== 'map';
    const ox = follow ? game.state.player.x : cam.tx;
    const oz = follow ? game.state.player.z : cam.tz;
    const hidden = game.view.panelOpen || game.view.mode === 'build';
    const placed: { x: number; y: number }[] = [];
    const top = Math.min(this.top, vh - 140);
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const g = this.groups[i];
      let on = !!g && !hidden;
      if (on && g) {
        const p = renderer.worldToScreen(g.x, 1, g.z);
        if (p.visible && p.x > 40 && p.x < vw - 40 && p.y > 60 && p.y < vh - 60) on = false;
      }
      setClass(m.el, 'on', on);
      if (!on || !g) continue;
      m.x = g.x;
      m.z = g.z;
      const v = relativeScreenDir(g.x - ox, g.z - oz, cam.yaw);
      const e = edgePointRect(v.x, v.y, { l: 40, t: top, r: vw - 108, b: vh - 100 });
      // neighbouring sectors can land on the same edge spot: show only the bigger group there
      if (placed.some((q) => Math.abs(q.x - e.x) < 52 && Math.abs(q.y - e.y) < 52)) {
        setClass(m.el, 'on', false);
        continue;
      }
      placed.push({ x: e.x, y: e.y });
      const tr = `translate3d(${e.x.toFixed(0)}px, ${e.y.toFixed(0)}px, 0)`;
      if (tr !== m.tr) {
        m.tr = tr;
        m.el.style.transform = tr;
        m.arrow.style.transform = `rotate(${e.angle.toFixed(3)}rad)`;
      }
      // the marker wears the portrait of the most common (or boss) attacker; without art it keeps the emoji
      const art = g.model ? alienArt(g.model) : null;
      const text = art ? String(g.n) : g.boss ? `💀 ${g.n}` : `👾 ${g.n}`;
      if (text !== m.text) {
        m.text = text;
        m.label.textContent = text;
        setClass(m.el, 'boss', g.boss);
      }
      const model = art ? g.model! : '';
      if (model !== m.model) {
        m.model = model;
        if (art) {
          m.pic.src = art;
          m.pic.hidden = false;
        } else m.pic.hidden = true;
        setClass(m.el, 'has-pic', !!art);
      }
    }
  }
}

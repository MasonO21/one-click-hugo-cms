/**
 * BuildBar — the bottom bar shown during build mode: what you're placing, its cost, whether the
 * spot is valid (and why not), rotate / camera / cancel / confirm buttons, material selector for
 * structure pieces, and the blueprint-capture variant with a name field.
 */
import type { UiCtx } from '../ctx';
import type { BuildController, BuildMode } from './BuildController';
import { costChips, btn, setDisabled } from '../widgets';
import { fill, h, replay, setClass, setHidden, setText, setVar } from '../dom';

export class BuildBar {
  readonly el: HTMLElement;
  /** Full-screen canvas drawing the blueprint selection rectangle. */
  readonly canvas: HTMLCanvasElement;

  private readonly info: HTMLElement;
  private readonly ic: HTMLElement;
  private readonly name: HTMLElement;
  private readonly costWrap: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly tiers: HTMLElement;
  private readonly btnRotate: HTMLElement;
  private readonly btnOk: HTMLButtonElement;
  private readonly btnNo: HTMLElement;
  private readonly selWrap: HTMLElement;
  private readonly selCount: HTMLElement;
  private readonly selName: HTMLInputElement;
  private readonly mainWrap: HTMLElement;
  private dirty = true;
  private acc = 0;
  private lastKey = '';
  private cctx: CanvasRenderingContext2D | null;

  constructor(
    private readonly ctx: UiCtx,
    private readonly bc: BuildController,
  ) {
    this.ic = h('span', { class: 'bb-ic' });
    this.name = h('b', { class: 'bb-name' });
    this.costWrap = h('div', { class: 'bb-cost' });
    this.msg = h('div', { class: 'bb-msg' });
    this.info = h('div', { class: 'bb-info' }, this.ic, h('div', { class: 'grow' }, this.name, this.costWrap, this.msg));
    this.tiers = h('div', { class: 'bb-tiers' });

    const cam = (dir: number) => () => {
      ctx.game.view.camera.yaw += dir * 0.45;
      ctx.sfx('ui_tab');
    };
    const camL = h('button', { class: 'bb-btn small', type: 'button', 'aria-label': 'Turn camera left', text: '↺', data: { sfx: 'ui_tab' } });
    const camR = h('button', { class: 'bb-btn small', type: 'button', 'aria-label': 'Turn camera right', text: '↻', data: { sfx: 'ui_tab' } });
    camL.addEventListener('click', cam(-1));
    camR.addEventListener('click', cam(1));
    this.btnRotate = h('button', { class: 'bb-btn rot', type: 'button', 'aria-label': 'Rotate', id: 'btn-rotate' }, h('span', { class: 'ic', text: '⟳' }), h('span', { class: 'lb', text: 'Rotate' }));
    this.btnRotate.addEventListener('click', () => bc.rotate());
    // tapping the building name / icon reopens the build menu to pick something else
    this.info.addEventListener('click', () => ctx.open('build'));
    this.info.setAttribute('role', 'button');
    this.info.setAttribute('aria-label', 'Choose another building');
    this.btnNo = h('button', { class: 'bb-btn no', type: 'button', 'aria-label': 'Cancel', id: 'btn-build-cancel', data: { sfx: 'ui_close' } }, h('span', { class: 'ic', text: '✖' }));
    this.btnNo.addEventListener('click', () => bc.cancel());
    this.btnOk = h<HTMLButtonElement>('button', { class: 'bb-btn ok', type: 'button', 'aria-label': 'Confirm', id: 'btn-build-confirm' }, h('span', { class: 'ic', text: '✔' }));
    this.btnOk.addEventListener('click', () => bc.confirm());
    const actions = h('div', { class: 'bb-actions' }, camL, camR, this.btnRotate, this.btnNo, this.btnOk);
    this.mainWrap = h('div', { class: 'bb-main' }, this.info, this.tiers, actions);

    // blueprint capture
    this.selCount = h('div', { class: 'bb-msg' });
    this.selName = h<HTMLInputElement>('input', { type: 'text', placeholder: 'Blueprint name', maxlength: '24', 'aria-label': 'Blueprint name' });
    const save = btn({ label: '💾 Save', cls: 'good small', onClick: () => this.saveBlueprint() });
    const cancel = btn({ label: 'Cancel', cls: 'ghost small', onClick: () => bc.cancelSelect() });
    this.selWrap = h(
      'div',
      { class: 'bb-main select', hidden: true },
      h('div', { class: 'bb-info' }, h('span', { class: 'bb-ic', text: '📐' }), h('div', { class: 'grow' }, h('b', { text: 'Save a blueprint' }), h('div', { class: 'bb-msg', text: 'Drag a box over the pieces you want to copy.' }), this.selCount)),
      h('div', { class: 'bb-sel-form' }, this.selName, save, cancel),
    );

    this.el = h('div', { class: 'buildbar', id: 'buildbar', hidden: true }, this.mainWrap, this.selWrap);
    this.canvas = h<HTMLCanvasElement>('canvas', { class: 'sel-canvas', hidden: true });
    this.cctx = this.canvas.getContext('2d');
    bc.onChange = () => {
      this.dirty = true;
    };
    bc.onFeedback = (ok) => {
      replay(ok ? this.btnOk : this.btnOk, ok ? 'pop' : 'shake');
    };
    window.addEventListener('resize', () => this.sizeCanvas());
    this.sizeCanvas();
  }

  private sizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private saveBlueprint(): void {
    const n = this.ctx.game.state.buildings.blueprints.length + 1;
    const name = this.selName.value.trim() || `Blueprint ${n}`;
    if (this.bc.saveSelection(name)) {
      this.selName.value = '';
      this.ctx.open('build', { tab: 'blueprints' });
    }
  }

  update(dt: number): void {
    this.acc += dt;
    const mode = this.bc.mode;
    setClass(this.ctx.root, 'is-building', mode !== null);
    if (mode === 'select') this.drawSelection();
    else if (!this.canvas.hidden) this.clearCanvas();
    if (!this.dirty && this.acc < 0.3) return;
    this.dirty = false;
    this.acc = 0;
    this.render(mode);
  }

  private render(mode: BuildMode): void {
    const { game, data } = this.ctx;
    setHidden(this.el, mode === null);
    setHidden(this.canvas, mode !== 'select');
    if (mode === null) return;
    setHidden(this.mainWrap, mode !== 'place');
    setHidden(this.selWrap, mode !== 'select');
    if (mode === 'select') {
      const n = this.bc.select.ids.length;
      setText(this.selCount, n ? `${n} piece${n === 1 ? '' : 's'} selected` : 'Nothing selected yet');
      return;
    }

    const b = game.view.build;
    const def = b.def ? data.building(b.def) : undefined;
    if (!def) return;
    const bp = b.blueprint ? game.state.buildings.blueprints.find((x) => x.id === b.blueprint) : null;
    setText(this.ic, bp ? '📐' : def.icon);
    const moving = b.moveId != null;
    const lineN = def.piece && b.lineFrom ? this.bc.lineInfo.total : 0;
    setText(this.name, bp ? bp.name : moving ? `Move ${def.name}` : lineN > 1 ? `${def.name} × ${this.bc.lineInfo.ok}` : def.name);

    // cost
    const have = game.state.resources.amounts;
    const costKey = JSON.stringify(b.cost) + '|' + Object.entries(b.cost).map(([k, v]) => ((have[k] ?? 0) >= (v ?? 0) ? 1 : 0)).join('');
    if (costKey !== this.lastKey) {
      this.lastKey = costKey;
      fill(this.costWrap, moving ? h('span', { class: 'chip good', text: 'Free to move' }) : costChips(data, b.cost, game.state.resources.amounts));
    }

    // message
    let text = '';
    let tone = 'good';
    if (!b.valid) {
      text = '⚠ ' + (b.reason ?? "Can't build here");
      tone = 'bad';
    } else if (def.piece && !bp && b.lineFrom && this.bc.lineInfo.ok < this.bc.lineInfo.total) {
      text = `${this.bc.lineInfo.total - this.bc.lineInfo.ok} blocked spot(s) will be skipped`;
      tone = 'warn';
    } else if (moving) text = 'Looks good — tap ✔ to move it here';
    else if (def.piece) text = b.lineFrom ? 'Release done — tap ✔ to build the line' : 'Drag to draw a line, tap ✔ to build';
    else text = 'Looks good — tap ✔ to build';
    setText(this.msg, text);
    this.msg.className = 'bb-msg ' + tone;
    this.el.dataset.valid = b.valid ? '1' : '0';
    setDisabled(this.btnOk, b.valid ? false : b.reason ?? "Can't build here");

    // rotate only for facilities
    setHidden(this.btnRotate, !!def.piece && !bp ? true : false);
    this.renderTiers(def.piece != null && !bp, b.tier);
  }

  private tiersKey = '';
  private renderTiers(show: boolean, current: number): void {
    setHidden(this.tiers, !show);
    if (!show) return;
    const max = this.ctx.game.state.colony.tier;
    const key = `${max}|${current}`;
    if (key === this.tiersKey) return;
    this.tiersKey = key;
    fill(this.tiers);
    for (let t = 0; t <= max; t++) {
      const td = this.ctx.data.tier(t);
      const b = h('button', { class: 'bb-tier' + (t === current ? ' on' : ''), type: 'button', title: td.name, 'aria-label': td.name, data: { tier: t, sfx: 'ui_tab' } });
      setVar(b, '--tc', td.color);
      setVar(b, '--ta', td.accent);
      b.addEventListener('click', () => this.bc.setTier(t));
      this.tiers.appendChild(b);
    }
  }

  // ---------------------------------------------------------------- selection canvas

  private clearCanvas(): void {
    this.cctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawSelection(): void {
    const c = this.cctx;
    if (!c) return;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.bc.select;
    if (!s.start || !s.end) return;
    const x = Math.min(s.start.x, s.end.x);
    const y = Math.min(s.start.y, s.end.y);
    const w = Math.abs(s.end.x - s.start.x);
    const h2 = Math.abs(s.end.y - s.start.y);
    c.fillStyle = 'rgba(79,179,246,0.18)';
    c.strokeStyle = '#4fb3f6';
    c.lineWidth = 3;
    c.setLineDash([10, 7]);
    c.fillRect(x, y, w, h2);
    c.strokeRect(x, y, w, h2);
    c.setLineDash([]);
    c.fillStyle = '#ffcf4a';
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    const { game, renderer } = this.ctx;
    const set = new Set(s.ids);
    for (const b of game.state.buildings.list) {
      if (!set.has(b.id)) continue;
      const ctr = game.sys.buildings.center(b);
      const p = renderer.worldToScreen(ctr.x, 0.6, ctr.z);
      if (!p.visible) continue;
      c.beginPath();
      c.arc(p.x, p.y, 6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
}

/**
 * BuildController — drives build mode: keeps `view.build` (ghost cell, rotation, validity, cost) in
 * sync with BuildingSystem queries, turns touch input into ghost placement / drag-to-build lines,
 * confirms placements ("copy" behaviour: stays in build mode for quick repeats), supports moving an
 * existing building, placing saved blueprints and rectangle-selecting pieces to save as a blueprint.
 */
import type { UiCtx, BuildApi } from '../ctx';
import type { BuildPointer } from '../input/InputController';
import type { BuildingInstance } from '../../core/state';
import type { BuildingDef, ResourceBag } from '../../data/schema';
import { WORLD_CELLS, cellOf, rotatedSize } from '../../core/constants';
import { bagCovers, bagMissing } from '../../core/bag';
import { clamp } from '../../core/math';
import { footprintCells, missingText, pointInRect, rectFrom, rotateOffset, scaleBag, snapFootprint, sumBags, type Cell } from '../logic/build';

export type BuildMode = 'place' | 'select' | null;

/** Pixels the ghost floats above a touching finger so it stays visible. */
const TOUCH_LIFT = 46;

export class BuildController implements BuildApi {
  /** Selection state for blueprint capture. */
  select = { active: false, start: null as null | { x: number; y: number }, end: null as null | { x: number; y: number }, ids: [] as number[] };
  /** Notified on any ghost / mode change (the build bar re-renders). */
  onChange: () => void = () => {};
  /** Notified when a confirm succeeded/failed so the bar can animate. */
  onFeedback: (ok: boolean, text?: string) => void = () => {};

  private _tier = -1;
  private cursor: Cell = { x: 0, z: 0 };
  private key = '';
  private sinceAfford = 0;
  private lastAffordable = true;
  private touch = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false;

  constructor(private readonly ctx: UiCtx) {}

  // ---------------------------------------------------------------- state

  get mode(): BuildMode {
    if (this.select.active) return 'select';
    return this.ctx.game.view.mode === 'build' && this.ctx.game.view.build.def ? 'place' : null;
  }

  get active(): boolean {
    return this.mode !== null;
  }

  get pieceTier(): number {
    const max = this.ctx.game.state.colony.tier;
    return this._tier < 0 ? max : Math.min(this._tier, max);
  }
  set pieceTier(t: number) {
    this._tier = t;
  }

  private get view() {
    return this.ctx.game.view;
  }
  private get bs() {
    return this.ctx.game.sys.buildings;
  }
  private def(): BuildingDef | undefined {
    const id = this.view.build.def;
    return id ? this.ctx.data.building(id) : undefined;
  }

  // ---------------------------------------------------------------- entering / leaving

  start(defId: string, opts: { tier?: number; rot?: 0 | 1 | 2 | 3 } = {}): void {
    const def = this.ctx.data.building(defId);
    if (!def) return;
    this.cancelSelect();
    const v = this.view;
    const b = v.build;
    v.mode = 'build';
    v.showGrid = true;
    const prev = b.def;
    b.def = defId;
    b.rot = opts.rot ?? (prev === defId ? b.rot : 0);
    if (def.piece) {
      if (opts.tier != null) this._tier = opts.tier;
      b.tier = this.pieceTier;
    } else b.tier = opts.tier ?? this.ctx.game.state.colony.tier;
    b.lineFrom = null;
    b.moveId = null;
    b.blueprint = null;
    b.cells = [];
    b.cost = {};
    b.valid = false;
    b.reason = null;
    this.placeNearCenter();
    this.key = '';
    this.refresh();
    this.onChange();
  }

  startMove(id: number): void {
    const inst = this.bs.get(id);
    if (!inst) return;
    const def = this.ctx.data.building(inst.def);
    if (!def) return;
    this.cancelSelect();
    const v = this.view;
    const b = v.build;
    v.mode = 'build';
    v.showGrid = true;
    b.def = inst.def;
    b.rot = inst.rot;
    b.tier = inst.tier;
    b.moveId = id;
    b.blueprint = null;
    b.lineFrom = null;
    const [w, h] = rotatedSize(def.size, inst.rot);
    this.cursor = { x: inst.x + Math.floor((w - 1) / 2), z: inst.z + Math.floor((h - 1) / 2) };
    b.x = inst.x;
    b.z = inst.z;
    this.key = '';
    this.refresh();
    this.onChange();
  }

  startBlueprint(bpId: string): void {
    const bp = this.ctx.game.state.buildings.blueprints.find((x) => x.id === bpId);
    if (!bp || !bp.parts.length) return;
    this.cancelSelect();
    const v = this.view;
    const b = v.build;
    v.mode = 'build';
    v.showGrid = true;
    b.def = bp.parts[0].def;
    b.blueprint = bpId;
    b.moveId = null;
    b.lineFrom = null;
    b.rot = 0;
    b.tier = bp.parts[0].tier;
    this.placeNearCenter();
    b.x = this.cursor.x;
    b.z = this.cursor.z;
    this.key = '';
    this.refresh();
    this.onChange();
  }

  startSelect(): void {
    this.exitBuild(false);
    this.select = { active: true, start: null, end: null, ids: [] };
    this.onChange();
  }

  cancelSelect(): void {
    if (!this.select.active) return;
    this.select = { active: false, start: null, end: null, ids: [] };
    this.onChange();
  }

  cancel(): void {
    if (this.select.active) {
      this.cancelSelect();
      return;
    }
    this.exitBuild(true);
  }

  private exitBuild(notify: boolean): void {
    const v = this.view;
    const b = v.build;
    if (v.mode === 'build') v.mode = 'play';
    v.showGrid = false;
    b.def = null;
    b.lineFrom = null;
    b.moveId = null;
    b.blueprint = null;
    b.cells = [];
    b.cost = {};
    b.valid = false;
    b.reason = null;
    this.key = '';
    if (notify) this.onChange();
  }

  setTier(t: number): void {
    this._tier = t;
    this.view.build.tier = this.pieceTier;
    this.key = '';
    this.onChange();
  }

  rotate(): void {
    const b = this.view.build;
    if (!b.def) return;
    b.rot = ((b.rot + 1) & 3) as 0 | 1 | 2 | 3;
    this.applyCursor();
    this.ctx.sfx('ui_click');
    this.key = '';
    this.refresh();
    this.onChange();
  }

  // ---------------------------------------------------------------- cursor

  private placeNearCenter(): void {
    const { renderer, game } = this.ctx;
    const w = typeof window !== 'undefined' ? window.innerWidth : 800;
    const h = typeof window !== 'undefined' ? window.innerHeight : 400;
    const p = renderer.pickGround(w * 0.5, h * 0.52) ?? { x: game.state.player.x, z: game.state.player.z };
    this.setCursorWorld(p.x, p.z);
  }

  private setCursorWorld(x: number, z: number): void {
    this.cursor = { x: clamp(cellOf(x), 0, WORLD_CELLS - 1), z: clamp(cellOf(z), 0, WORLD_CELLS - 1) };
    this.applyCursor();
  }

  /** Convert the cursor cell into the ghost's min-corner cell for the current def/rotation. */
  private applyCursor(): void {
    const b = this.view.build;
    const def = this.def();
    if (def && !def.piece && !b.blueprint) {
      const s = snapFootprint(this.cursor.x, this.cursor.z, def.size, b.rot);
      b.x = s.x;
      b.z = s.z;
    } else {
      b.x = this.cursor.x;
      b.z = this.cursor.z;
    }
  }

  // ---------------------------------------------------------------- pointer routing

  readonly pointer: BuildPointer = {
    active: () => this.active,
    down: (x, y) => this.pointerDown(x, y),
    move: (x, y) => this.pointerMove(x, y),
    up: (x, y, tap) => this.pointerUp(x, y, tap),
  };

  private dragging = false;

  private ground(x: number, y: number, lift: boolean): { x: number; z: number } | null {
    return this.ctx.renderer.pickGround(x, lift && this.touch ? y - TOUCH_LIFT : y);
  }

  private pointerDown(x: number, y: number): void {
    if (this.select.active) {
      this.select.start = { x, y };
      this.select.end = { x, y };
      this.select.ids = [];
      this.dragging = true;
      return;
    }
    const p = this.ground(x, y, true);
    if (!p) return;
    this.dragging = true;
    this.setCursorWorld(p.x, p.z);
    const def = this.def();
    if (def?.piece && !this.view.build.blueprint) this.view.build.lineFrom = { x: this.view.build.x, z: this.view.build.z };
    this.onChange();
  }

  private pointerMove(x: number, y: number): void {
    if (!this.dragging) return;
    if (this.select.active) {
      this.select.end = { x, y };
      this.updateSelection();
      return;
    }
    const p = this.ground(x, y, true);
    if (p) this.setCursorWorld(p.x, p.z);
  }

  private pointerUp(x: number, y: number, tap: boolean): void {
    this.dragging = false;
    if (this.select.active) {
      if (tap) {
        this.select.start = this.select.end = null;
        this.select.ids = [];
      } else {
        this.select.end = { x, y };
        this.updateSelection();
      }
      this.onChange();
      return;
    }
    const b = this.view.build;
    if (tap) {
      // exact tap position, no finger lift
      const p = this.ground(x, y, false);
      if (p) this.setCursorWorld(p.x, p.z);
      b.lineFrom = null;
    } else if (b.lineFrom && b.lineFrom.x === b.x && b.lineFrom.z === b.z) {
      b.lineFrom = null; // a drag that never left its start cell is a single piece
    }
    this.onChange();
  }

  // ---------------------------------------------------------------- validation (every frame, cheap)

  update(dt: number): void {
    if (this.select.active) {
      this.updateSelection();
      return;
    }
    const b = this.view.build;
    if (!b.def) return;
    this.sinceAfford += dt;
    const lf = b.lineFrom;
    const key = `${b.def}|${b.x},${b.z}|${b.rot}|${b.tier}|${lf ? lf.x + ',' + lf.z : '-'}|${b.moveId}|${b.blueprint}|${this.ctx.game.derived.buildingsVersion}`;
    const affordTick = this.sinceAfford > 0.3;
    if (key === this.key && !affordTick) return;
    if (affordTick) this.sinceAfford = 0;
    this.key = key;
    this.refresh();
  }

  /** Recompute cells / validity / reason / cost. */
  refresh(): void {
    const { game, data } = this.ctx;
    const b = this.view.build;
    const bs = this.bs;
    const def = this.def();
    if (!def) return;
    const have = game.state.resources.amounts;
    const nameOf = (id: string) => data.resource(id)?.name ?? id;
    let cost: ResourceBag = {};
    let placeOk = false;
    let reason: string | null = null;
    let cells: Cell[] = [];

    if (b.blueprint) {
      const bp = game.state.buildings.blueprints.find((x) => x.id === b.blueprint);
      cost = bp ? bs.blueprintCost(bp.id) : {};
      let bad = 0;
      let firstReason: string | null = null;
      for (const part of bp?.parts ?? []) {
        const d = data.building(part.def);
        if (!d) continue;
        const o = rotateOffset(part.dx, part.dz, b.rot);
        const rot = ((part.rot + b.rot) & 3) as 0 | 1 | 2 | 3;
        const px = b.x + o.x;
        const pz = b.z + o.z;
        cells.push(...footprintCells(px, pz, d.size, rot));
        const chk = bs.canPlace(part.def, px, pz, rot);
        if (!chk.ok) {
          bad++;
          firstReason ??= chk.reason ?? null;
        }
      }
      placeOk = !!bp && bad === 0;
      reason = bad > 0 ? firstReason ?? `${bad} spot${bad === 1 ? '' : 's'} blocked` : null;
    } else if (def.piece) {
      const from = b.lineFrom ?? { x: b.x, z: b.z };
      const line = b.lineFrom ? bs.lineCells(from.x, from.z, b.x, b.z) : [{ x: b.x, z: b.z }];
      cells = line.length ? line : [{ x: b.x, z: b.z }];
      let ok = 0;
      let firstReason: string | null = null;
      for (const c of cells) {
        const chk = bs.canPlace(def.id, c.x, c.z, 0);
        if (chk.ok) ok++;
        else firstReason ??= chk.reason ?? null;
      }
      cost = scaleBag(bs.cost(def.id, b.tier), ok);
      placeOk = ok > 0;
      if (ok === 0) reason = firstReason ?? "Can't build here";
      else if (ok < cells.length) reason = null;
      this.lineInfo = { total: cells.length, ok };
    } else {
      cells = footprintCells(b.x, b.z, def.size, b.rot);
      const chk = bs.canPlace(def.id, b.x, b.z, b.rot, b.moveId ?? undefined);
      placeOk = chk.ok;
      reason = chk.ok ? null : chk.reason ?? "Can't build here";
      cost = b.moveId != null ? {} : bs.cost(def.id, b.tier);
    }

    const afford = bagCovers(have, cost);
    this.lastAffordable = afford;
    if (placeOk && !afford) reason = missingText(bagMissing(have, cost), nameOf) ?? 'Not enough resources';
    b.cells = cells;
    b.cost = cost;
    b.valid = placeOk && afford;
    b.reason = b.valid ? null : reason;
    this.onChange();
  }

  /** For pieces: how many cells in the line / how many can be placed. */
  lineInfo = { total: 1, ok: 0 };

  get affordable(): boolean {
    return this.lastAffordable;
  }

  // ---------------------------------------------------------------- confirm

  confirm(): void {
    const b = this.view.build;
    const def = this.def();
    if (!def) return;
    if (!b.valid) {
      this.fail(b.reason ?? "Can't build here");
      return;
    }
    const bs = this.bs;
    let ok = false;
    let msg = '';
    if (b.blueprint) {
      const ids = bs.placeBlueprint(b.blueprint, b.x, b.z, b.rot);
      ok = ids.length > 0;
      msg = ok ? `Blueprint placed (${ids.length} pieces)` : "Couldn't place the blueprint here";
    } else if (b.moveId != null) {
      ok = bs.move(b.moveId, b.x, b.z, b.rot);
      msg = ok ? `${def.name} moved — nothing lost!` : "Can't move it there";
      if (ok) {
        this.exitBuild(true);
        this.succeed(msg);
        return;
      }
    } else if (def.piece) {
      const from = b.lineFrom ?? { x: b.x, z: b.z };
      const ids = bs.placeLine(def.id, from.x, from.z, b.x, b.z, b.tier);
      ok = ids.length > 0;
      msg = ok ? '' : "Couldn't build there";
      b.lineFrom = null;
    } else {
      const id = bs.place(def.id, b.x, b.z, b.rot, { tier: b.tier });
      ok = id != null;
      msg = ok ? '' : "Couldn't build there";
    }
    this.key = '';
    if (ok) this.succeed(msg);
    else this.fail(msg);
    this.refresh();
  }

  private succeed(msg: string): void {
    this.ctx.haptic('success');
    if (msg) this.ctx.toast(msg, 'success', '🔨');
    this.onFeedback(true, msg);
  }

  private fail(msg: string): void {
    this.ctx.sfx('ui_error');
    this.ctx.haptic('warning');
    this.ctx.toast(msg, 'warning', '🚧');
    this.onFeedback(false, msg);
  }

  /** Enter build mode copying an existing building (same def / tier / rotation). */
  copy(inst: BuildingInstance): void {
    this.start(inst.def, { tier: inst.tier, rot: inst.rot });
  }

  // ---------------------------------------------------------------- blueprint selection

  private updateSelection(): void {
    const s = this.select;
    if (!s.start || !s.end) {
      s.ids = [];
      return;
    }
    const r = rectFrom(s.start.x, s.start.y, s.end.x, s.end.y);
    const ids: number[] = [];
    for (const b of this.ctx.game.state.buildings.list) {
      const def = this.ctx.data.building(b.def);
      if (!def || def.core) continue;
      const c = this.bs.center(b);
      const p = this.ctx.renderer.worldToScreen(c.x, 0.6, c.z);
      if (p.visible && pointInRect(p.x, p.y, r)) ids.push(b.id);
    }
    s.ids = ids;
  }

  /** Save the current selection as a blueprint. */
  saveSelection(name: string): boolean {
    const ids = this.select.ids;
    if (!ids.length) {
      this.ctx.toast('Drag a box around some pieces first', 'info', '📐');
      return false;
    }
    const id = this.bs.saveBlueprint(name, ids);
    if (!id) {
      this.ctx.toast("Couldn't save that blueprint", 'warning', '📐');
      return false;
    }
    this.ctx.toast(`Blueprint "${name}" saved!`, 'success', '📐');
    this.cancelSelect();
    return true;
  }

  /** Total cost shown for the ghost (sum for blueprint). */
  costBag(): ResourceBag {
    return sumBags([this.view.build.cost]);
  }
}

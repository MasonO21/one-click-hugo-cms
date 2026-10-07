/**
 * Layout — a cheap, read-only snapshot of the buildings that matter to colonists (homes, workplaces,
 * meal/relax spots, comfort aggregates). Rebuilt on structural changes and every couple of seconds so the
 * per-colonist AI and the happiness maths never have to scan the full building list.
 */
import type { Game } from '../../core/Game';
import type { BuildingDef } from '../../data/schema';
import type { BuildingInstance, Id } from '../../core/state';
import { CELL, cellIndex, footprintCenter, rotatedSize } from '../../core/constants';

export interface Place {
  id: Id;
  b: BuildingInstance;
  def: BuildingDef;
  /** World-space center. */
  x: number;
  z: number;
  /** Half extents (world units) of the rotated footprint. */
  hw: number;
  hd: number;
  /** Level factor applied to numeric effects: 1 + levelEffect * (level - 1). */
  lf: number;
  /** Beds provided (0 when not a home). */
  cap: number;
  /** Active or damaged (damaged buildings keep their residents and workers — cozy). */
  usable: boolean;
  /** Footprint touches an enclosed (roofed) room cell. */
  roofed: boolean;
}

const F_WORK = 1;
const F_HOME = 2;
const F_MEAL = 4;
const F_RELAX = 8;
const F_AGG = 16;
const F_RECRUIT = 32;
const F_CORE = 64;

/** Render archetypes where colonists gather to eat (content-agnostic: keyed on model, not on ids). */
const MEAL_MODELS = new Set(['campfire', 'kitchen', 'food_storage']);
const SEAT_MODELS = new Set(['bench', 'fountain', 'garden', 'arcade', 'statue', 'campfire']);

const flagCache = new WeakMap<BuildingDef, number>();

function flagsOf(def: BuildingDef): number {
  let f = flagCache.get(def);
  if (f !== undefined) return f;
  f = 0;
  if (def.workers) f |= F_WORK;
  if ((def.housing ?? 0) > 0) f |= F_HOME;
  if (def.feeds || MEAL_MODELS.has(def.model)) f |= F_MEAL;
  if (def.category === 'decor' || (def.entertainment ?? 0) > 0 || SEAT_MODELS.has(def.model)) f |= F_RELAX;
  if (def.comfort || def.entertainment || def.medical || def.turret) f |= F_AGG;
  if (def.recruit) f |= F_RECRUIT;
  if (def.core) f |= F_CORE;
  flagCache.set(def, f);
  return f;
}

const byId = (a: Place, b: Place) => a.id - b.id;

export class Layout {
  readonly byId = new Map<Id, Place>();
  /** Usable worker buildings that do nothing without staff, then the automated-but-boostable ones. */
  readonly required: Place[] = [];
  readonly optional: Place[] = [];
  readonly homes: Place[] = [];
  readonly meals: Place[] = [];
  readonly relax: Place[] = [];
  core: Place | null = null;
  recruit: Place | null = null;

  beds = 0;
  comfort = 0;
  entertainment = 0;
  medical = 0;
  turrets = 0;

  /** Staleness markers. */
  listLen = -1;
  version = -1;
  at = -1e9;

  isStale(game: Game): boolean {
    return (
      this.listLen !== game.state.buildings.list.length ||
      this.version !== game.derived.buildingsVersion ||
      game.state.playTime - this.at > 2
    );
  }

  rebuild(game: Game): void {
    const list = game.state.buildings.list;
    const data = game.data;
    const roof = game.derived.roofCells;
    this.byId.clear();
    this.required.length = 0;
    this.optional.length = 0;
    this.homes.length = 0;
    this.meals.length = 0;
    this.relax.length = 0;
    this.core = null;
    this.recruit = null;
    this.beds = this.comfort = this.entertainment = this.medical = this.turrets = 0;

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const def = data.building(b.def);
      if (!def) continue;
      const fl = flagsOf(def);
      if (fl === 0) continue;
      const usable = b.status === 'active' || b.status === 'damaged';
      const [w, h] = rotatedSize(def.size, b.rot);
      const c = footprintCenter(b.x, b.z, def.size, b.rot);
      const lf = 1 + (def.levelEffect ?? 0) * Math.max(0, (b.level || 1) - 1);
      const p: Place = { id: b.id, b, def, x: c.x, z: c.z, hw: (w * CELL) / 2, hd: (h * CELL) / 2, lf, cap: 0, usable, roofed: false };
      this.byId.set(b.id, p);
      if (!usable) continue;

      if (fl & F_WORK) (def.workers!.required ? this.required : this.optional).push(p);
      if (fl & F_HOME) {
        p.cap = Math.max(1, Math.floor((def.housing ?? 0) * lf + 1e-6));
        for (let dz = 0; dz < h && !p.roofed; dz++) {
          for (let dx = 0; dx < w; dx++) {
            if (roof.has(cellIndex(b.x + dx, b.z + dz))) {
              p.roofed = true;
              break;
            }
          }
        }
        this.homes.push(p);
        this.beds += p.cap;
      }
      if (fl & F_MEAL) this.meals.push(p);
      if (fl & F_RELAX) this.relax.push(p);
      if (fl & F_AGG) {
        this.comfort += (def.comfort ?? 0) * lf;
        this.entertainment += (def.entertainment ?? 0) * lf;
        this.medical += (def.medical ?? 0) * lf;
        if (def.turret && b.status === 'active') this.turrets++;
      }
      if (fl & F_RECRUIT && !this.recruit) this.recruit = p;
      if (fl & F_CORE) this.core = p;
    }
    if (!this.core && game.state.colony.coreId != null) this.core = this.byId.get(game.state.colony.coreId) ?? null;
    this.required.sort(byId);
    this.optional.sort(byId);
    this.homes.sort(byId);
    this.listLen = list.length;
    this.version = game.derived.buildingsVersion;
    this.at = game.state.playTime;
  }
}

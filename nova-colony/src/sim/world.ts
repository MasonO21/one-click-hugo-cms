/**
 * WorldSystem — deterministic world generation from the seed (regions/biomes, terrain height &
 * color, water, resource nodes, POIs, beacons), region discovery/unlock, fog of war, node depletion
 * & respawn, POI looting, fast-travel targets.
 *
 * OWNER: world agent. Writes state.world. Generated data (not saved) lives in `this.gen`.
 */
import { System } from './System';
import type { ResourceBag } from '../data/schema';

export interface WorldNode {
  /** Stable index (used as key in state.world.depleted). */
  i: number;
  def: string;
  x: number;
  z: number;
  /** Rotation (radians) and scale jitter for render. */
  rot: number;
  scale: number;
  region: string;
  /** Hits remaining in the current cycle (runtime only). */
  hits: number;
}

export interface WorldPoi {
  /** Stable instance id, e.g. "poi_12". */
  id: string;
  def: string;
  x: number;
  z: number;
  region: string;
  rot: number;
}

export interface WorldProp {
  model: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface WorldGen {
  /** Region id per cell (index = cellIndex), as indices into regionIds. */
  regionMap: Uint8Array;
  regionIds: string[];
  /** Terrain height per vertex on a (WORLD_CELLS+1)^2 grid (world units). */
  heights: Float32Array;
  /** Water cells (impassable). */
  water: Uint8Array;
  nodes: WorldNode[];
  pois: WorldPoi[];
  props: WorldProp[];
}

export class WorldSystem extends System {
  gen!: WorldGen;

  /** Region id at a world position. */
  regionAt(_x: number, _z: number): string {
    return 'crash_valley';
  }

  isUnlocked(regionId: string): boolean {
    return this.game.state.world.regionsUnlocked.includes(regionId);
  }

  /** Human-readable unlock requirement for a locked region. */
  lockReason(_regionId: string): string | null {
    return null;
  }

  /** Terrain height at a world position (bilinear). */
  heightAt(_x: number, _z: number): number {
    return 0;
  }

  /** Is a world position walkable terrain (not water, not locked)? Buildings checked separately. */
  walkable(_x: number, _z: number): boolean {
    return true;
  }

  isDepleted(nodeIndex: number): boolean {
    return this.game.state.world.depleted[nodeIndex] !== undefined;
  }

  /** Nearest non-depleted node within range (world units). */
  nearestNode(_x: number, _z: number, _range: number): WorldNode | null {
    return null;
  }

  /** Apply one gather hit; returns the drop actually produced. */
  hitNode(_nodeIndex: number, _yieldMult: number): ResourceBag {
    return {};
  }

  /**
   * Construction hook: harvest (grant drops for remaining hits) and deplete every node whose cell lies in
   * the inclusive cell rect, so buildings can be placed over trees/rocks. Nodes under buildings don't respawn.
   */
  clearNodesInRect(_x0: number, _z0: number, _x1: number, _z1: number): ResourceBag {
    return {};
  }

  /** Tutorial/mission hook: spawn a survivor-camp POI on walkable ground ~10-16 cells from (x, z). Returns POI id. */
  spawnSurvivorNear(_x: number, _z: number): string | null {
    return null;
  }

  /** Loot / interact with a POI. */
  lootPoi(_poiId: string): boolean {
    return false;
  }

  /** Is the fog revealed at a world position. */
  revealed(_x: number, _z: number): boolean {
    return true;
  }

  /** Beacons/teleporters the player can fast travel to. */
  fastTravelTargets(): { id: string; name: string; x: number; z: number }[] {
    return [];
  }
}

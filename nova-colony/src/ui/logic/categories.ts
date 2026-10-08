/** Category metadata (icons + labels) for build, research and craft tabs. */
import type { BuildingCategory, CraftCategory, ResearchCategory, ResearchDef } from '../../data/schema';
import { buildingArt, hudArt, itemArt, resourceArt, vehicleArt } from '../art';

export interface CatMeta {
  id: string;
  icon: string;
  /** Painted tab icon (existing art that stands for the category); `icon` is the fallback. */
  art?: string | null;
  label: string;
}

export const BUILD_CATEGORIES: CatMeta[] = [
  { id: 'structure', icon: '🧱', label: 'Structure', art: buildingArt('wall') },
  { id: 'housing', icon: '🏠', label: 'Housing', art: hudArt('home') },
  { id: 'food', icon: '🍎', label: 'Food', art: resourceArt('food') },
  { id: 'water', icon: '💧', label: 'Water', art: resourceArt('water') },
  { id: 'power', icon: '⚡', label: 'Power', art: hudArt('power') },
  { id: 'production', icon: '⛏️', label: 'Production', art: itemArt('iron_pickaxe') },
  { id: 'crafting', icon: '🛠️', label: 'Crafting', art: hudArt('craft') },
  { id: 'research', icon: '🔬', label: 'Research', art: hudArt('tech') },
  { id: 'defense', icon: '🛡️', label: 'Defense', art: hudArt('defense') },
  { id: 'storage', icon: '📦', label: 'Storage', art: buildingArt('storage_crate') },
  { id: 'utility', icon: '🔧', label: 'Utility', art: buildingArt('radio_tower') },
  { id: 'decor', icon: '🌼', label: 'Decor', art: buildingArt('flower_bed') },
] satisfies (CatMeta & { id: BuildingCategory })[];

export const RESEARCH_CATEGORIES: CatMeta[] = [
  { id: 'construction', icon: '🏗️', label: 'Build', art: hudArt('build') },
  { id: 'power', icon: '⚡', label: 'Power', art: hudArt('power') },
  { id: 'food', icon: '🍎', label: 'Food', art: resourceArt('food') },
  { id: 'water', icon: '💧', label: 'Water', art: resourceArt('water') },
  { id: 'defense', icon: '🛡️', label: 'Defense', art: hudArt('defense') },
  { id: 'weapons', icon: '🔫', label: 'Weapons', art: itemArt('energy_rifle') },
  { id: 'automation', icon: '⚙️', label: 'Automation', art: itemArt('machine_parts') },
  { id: 'robotics', icon: '🤖', label: 'Robotics', art: itemArt('robotic_core') },
  { id: 'exploration', icon: '🧭', label: 'Explore', art: hudArt('map') },
  { id: 'colonists', icon: '🧑‍🤝‍🧑', label: 'Colonists', art: hudArt('population') },
  { id: 'titanium', icon: '🌟', label: 'Titanium', art: resourceArt('titanium') },
] satisfies (CatMeta & { id: ResearchCategory })[];

export const CRAFT_CATEGORIES: CatMeta[] = [
  { id: 'tools', icon: '🪓', label: 'Tools', art: itemArt('stone_axe') },
  { id: 'weapons', icon: '🔫', label: 'Weapons', art: itemArt('makeshift_rifle') },
  { id: 'armor', icon: '🦺', label: 'Armor', art: itemArt('plated_vest') },
  { id: 'materials', icon: '🧱', label: 'Materials', art: resourceArt('steel') },
  { id: 'food', icon: '🍳', label: 'Food', art: resourceArt('food') },
  { id: 'medical', icon: '🩹', label: 'Medical', art: itemArt('medkit') },
  { id: 'technology', icon: '💾', label: 'Tech', art: itemArt('research_chip') },
  { id: 'defense', icon: '🛡️', label: 'Defense', art: hudArt('defense') },
  { id: 'machines', icon: '⚙️', label: 'Machines', art: itemArt('machine_parts') },
  { id: 'drones', icon: '🛸', label: 'Drones', art: itemArt('helper_drone') },
  { id: 'vehicles', icon: '🚙', label: 'Vehicles', art: vehicleArt('buggy') },
  { id: 'utility', icon: '🔧', label: 'Utility', art: itemArt('jet_boots') },
] satisfies (CatMeta & { id: CraftCategory })[];

export function metaOf(list: CatMeta[], id: string): CatMeta {
  return list.find((c) => c.id === id) ?? { id, icon: '•', label: id };
}

export interface TreeNode {
  def: ResearchDef;
  x: number;
  y: number;
}
export interface TreeEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface TreeLayout {
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
}

export const NODE_W = 136;
export const NODE_H = 96;
export const GAP_X = 56;
export const GAP_Y = 22;
export const TREE_PAD = 16;

/** Lay out the nodes of one research category by their `pos` [column, row]; edges for in-category prerequisites. */
export function layoutTree(defs: ResearchDef[], category: string): TreeLayout {
  const taken = new Set<string>();
  const nodes: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  const inCat = defs.filter((d) => d.category === category).sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
  let maxC = 0;
  let maxR = 0;
  for (const d of inCat) {
    const col = Math.max(0, d.pos[0]);
    let row = Math.max(0, d.pos[1]);
    while (taken.has(col + ',' + row)) row++;
    taken.add(col + ',' + row);
    maxC = Math.max(maxC, col);
    maxR = Math.max(maxR, row);
    const n: TreeNode = { def: d, x: TREE_PAD + col * (NODE_W + GAP_X), y: TREE_PAD + row * (NODE_H + GAP_Y) };
    nodes.push(n);
    byId.set(d.id, n);
  }
  const edges: TreeEdge[] = [];
  for (const n of nodes) {
    for (const r of n.def.requires) {
      const p = byId.get(r);
      if (!p) continue;
      edges.push({ from: r, to: n.def.id, x1: p.x + NODE_W, y1: p.y + NODE_H / 2, x2: n.x, y2: n.y + NODE_H / 2 });
    }
  }
  return {
    nodes,
    edges,
    width: TREE_PAD * 2 + (maxC + 1) * NODE_W + maxC * GAP_X,
    height: TREE_PAD * 2 + (maxR + 1) * NODE_H + maxR * GAP_Y,
  };
}

/** Category metadata (icons + labels) for build, research and craft tabs. */
import type { BuildingCategory, CraftCategory, ResearchCategory, ResearchDef } from '../../data/schema';

export interface CatMeta {
  id: string;
  icon: string;
  label: string;
}

export const BUILD_CATEGORIES: CatMeta[] = [
  { id: 'structure', icon: '🧱', label: 'Structure' },
  { id: 'housing', icon: '🏠', label: 'Housing' },
  { id: 'food', icon: '🍎', label: 'Food' },
  { id: 'water', icon: '💧', label: 'Water' },
  { id: 'power', icon: '⚡', label: 'Power' },
  { id: 'production', icon: '⛏️', label: 'Production' },
  { id: 'crafting', icon: '🛠️', label: 'Crafting' },
  { id: 'research', icon: '🔬', label: 'Research' },
  { id: 'defense', icon: '🛡️', label: 'Defense' },
  { id: 'storage', icon: '📦', label: 'Storage' },
  { id: 'utility', icon: '🔧', label: 'Utility' },
  { id: 'decor', icon: '🌼', label: 'Decor' },
] satisfies (CatMeta & { id: BuildingCategory })[];

export const RESEARCH_CATEGORIES: CatMeta[] = [
  { id: 'construction', icon: '🏗️', label: 'Build' },
  { id: 'power', icon: '⚡', label: 'Power' },
  { id: 'food', icon: '🍎', label: 'Food' },
  { id: 'water', icon: '💧', label: 'Water' },
  { id: 'defense', icon: '🛡️', label: 'Defense' },
  { id: 'weapons', icon: '🔫', label: 'Weapons' },
  { id: 'automation', icon: '⚙️', label: 'Automation' },
  { id: 'robotics', icon: '🤖', label: 'Robotics' },
  { id: 'exploration', icon: '🧭', label: 'Explore' },
  { id: 'colonists', icon: '🧑‍🤝‍🧑', label: 'Colonists' },
  { id: 'titanium', icon: '🌟', label: 'Titanium' },
] satisfies (CatMeta & { id: ResearchCategory })[];

export const CRAFT_CATEGORIES: CatMeta[] = [
  { id: 'tools', icon: '🪓', label: 'Tools' },
  { id: 'weapons', icon: '🔫', label: 'Weapons' },
  { id: 'armor', icon: '🦺', label: 'Armor' },
  { id: 'materials', icon: '🧱', label: 'Materials' },
  { id: 'food', icon: '🍳', label: 'Food' },
  { id: 'medical', icon: '🩹', label: 'Medical' },
  { id: 'technology', icon: '💾', label: 'Tech' },
  { id: 'defense', icon: '🛡️', label: 'Defense' },
  { id: 'machines', icon: '⚙️', label: 'Machines' },
  { id: 'drones', icon: '🛸', label: 'Drones' },
  { id: 'vehicles', icon: '🚙', label: 'Vehicles' },
  { id: 'utility', icon: '🔧', label: 'Utility' },
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

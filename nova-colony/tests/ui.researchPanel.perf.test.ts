/**
 * Research panel re-renders only when what it shows changes: RP accrue several points a second, and keying the
 * panel on the exact count rebuilt the whole tree (DOM, style, layout) up to four times a second while it was open.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { ResearchPanel } from '../src/ui/panels/ResearchPanel';
import type { UiCtx } from '../src/ui/ctx';

/** The panel's signature with its category and selection set directly (no DOM needed). */
interface Probe {
  cat: string;
  sel: string | null;
  signature(): string;
}
function panelFor(game: Game): Probe {
  return new ResearchPanel({ game, data: game.data } as unknown as UiCtx) as unknown as Probe;
}

describe('research panel signature', () => {
  it('ignores RP that change nothing on screen, follows the shown bank and what turns affordable', () => {
    const game = new Game({ seed: 7, services: createMockServices() });
    game.start();
    const rs = game.sys.research;
    const node = game.data.research.find((r) => r.requires.length === 0 && r.tier <= game.state.colony.tier && rs.status(r.id) === 'available' && !r.resources);
    expect(node).toBeDefined();
    const p = panelFor(game);
    p.cat = node!.category;
    p.sel = node!.id;
    // a big bank shows "1M": a few more points change nothing
    game.state.research.points = 1_000_000;
    const a = p.signature();
    game.state.research.points += 37;
    expect(p.signature()).toBe(a);
    // short of the price, then able to afford it: the panel must re-render
    game.state.research.points = node!.cost - 1;
    const poor = p.signature();
    game.state.research.points = node!.cost;
    expect(p.signature()).not.toBe(poor);
  });
});
